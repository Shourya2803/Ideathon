"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { scrollToY } from "@/components/LenisProvider";
import { findingsFor, locate, type Finding } from "@/lib/insights";
import type { Analysis } from "@/types/analysis";

interface TextBox {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface PageData {
  w: number;
  h: number;
  src: string;
  items: TextBox[];
}
interface Placed {
  page: number;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
}

const TONE: Record<Finding["tone"], { color: string; name: string }> = {
  money: { color: "#4f7dff", name: "Money" },
  date: { color: "#9b6bff", name: "Date" },
  fact: { color: "#22b8cf", name: "Fact" },
  warning: { color: "#ff304f", name: "Watch out" },
};

const MAX_PAGES = 3;
const SCAN_SECONDS = 1.6;

/** Render the original PDF in the browser only, and record where each text run sits. */
async function renderPdf(source: File | string): Promise<PageData[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(source instanceof File ? await source.arrayBuffer() : await (await fetch(source)).arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages: PageData[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, viewport: vp }).promise;
      const content = await page.getTextContent();
      const items: TextBox[] = [];
      for (const it of content.items) {
        if (!("str" in it) || !it.str) continue;
        const t = pdfjs.Util.transform(vp.transform, it.transform);
        const fh = Math.hypot(t[2], t[3]);
        items.push({ str: it.str, x: t[4], y: t[5] - fh * 0.95, w: it.width * vp.scale, h: fh * 1.25 });
      }
      pages.push({ w: vp.width, h: vp.height, src: canvas.toDataURL("image/png"), items });
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

/** Merge the boxes of a match into one box per text line. */
function lineBoxes(boxes: TextBox[]) {
  const lines = new Map<number, { x: number; y: number; r: number; b: number }>();
  for (const b of boxes) {
    const key = Math.round(b.y / 6);
    const cur = lines.get(key);
    if (!cur) lines.set(key, { x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h });
    else lines.set(key, { x: Math.min(cur.x, b.x), y: Math.min(cur.y, b.y), r: Math.max(cur.r, b.x + b.w), b: Math.max(cur.b, b.y + b.h) });
  }
  return [...lines.values()].map((l) => ({ x: l.x - 4, y: l.y - 2, w: l.r - l.x + 8, h: l.b - l.y + 4 }));
}

export function XRayView({ analysis, source }: { analysis: Analysis; source: File | string }) {
  const reduce = useReducedMotion();
  const [pages, setPages] = useState<PageData[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const marks = useRef(new Map<string, HTMLElement>());
  const findings = useMemo(() => findingsFor(analysis), [analysis]);

  useEffect(() => {
    let cancelled = false;
    renderPdf(source)
      .then((p) => !cancelled && setPages(p))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [source]);

  const placed = useMemo(() => {
    const out = new Map<string, Placed>();
    if (!pages) return out;
    for (const f of findings) {
      for (let p = 0; p < pages.length; p++) {
        const idx = locate(
          pages[p].items.map((i) => i.str),
          f.needles,
        );
        if (idx.length) {
          out.set(f.id, { page: p, rects: lineBoxes(idx.map((i) => pages[p].items[i])) });
          break;
        }
      }
    }
    return out;
  }, [pages, findings]);

  const focus = pinned ?? active;
  const focusFinding = findings.find((f) => f.id === focus);
  const focusPlace = focus ? placed.get(focus) : undefined;

  const goTo = (id: string) => {
    setPinned((p) => (p === id ? null : id));
    const el = marks.current.get(id);
    if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2);
  };

  const located = findings.filter((f) => placed.has(f.id));
  const missing = findings.filter((f) => !placed.has(f.id));

  return (
    <section aria-label="Document X-ray" className="mx-auto max-w-6xl px-5">
      <div className="mb-8 text-center">
        <p className="eyebrow mb-3">X-ray</p>
        <h2 className="title">
          See exactly <span className="text-blend">where it says that.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-white/55">
          Every finding is pinned to the original page. Your PDF is drawn here in your browser only.
        </p>
      </div>

      {failed ? (
        <p role="alert" className="liquid-glass mx-auto max-w-md rounded-2xl bg-obsidian/70 p-5 text-center text-white/70">
          This page couldn&apos;t be drawn in your browser, but the analysis itself is unaffected.
        </p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* the page(s) */}
          <div className="space-y-6">
            {!pages && (
              <div className="relative mx-auto aspect-[1/1.414] w-full max-w-[640px] overflow-hidden rounded-xl bg-white/[0.06]">
                <motion.div
                  className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[#9b6bff]/40 to-transparent"
                  animate={reduce ? undefined : { top: ["-20%", "100%"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <p className="absolute inset-0 grid place-items-center font-mono text-xs uppercase tracking-widest text-white/50">Scanning your page…</p>
              </div>
            )}
            {pages?.map((pg, pi) => (
              <motion.div
                key={pi}
                initial={reduce ? false : { opacity: 0, rotateX: 18, y: 40 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: pi * 0.15 }}
                className="relative mx-auto w-full max-w-[640px] overflow-hidden rounded-xl shadow-[0_30px_80px_-20px_rgba(91,75,230,0.55)] [perspective:1200px]"
                style={{ aspectRatio: `${pg.w} / ${pg.h}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a locally rendered data URL, not a remote image */}
                <img src={pg.src} alt={`Page ${pi + 1} of your document`} className="absolute inset-0 h-full w-full" />

                {/* one-time scan beam, then the highlights land */}
                {!reduce && (
                  <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10 h-16"
                    style={{ background: "linear-gradient(to bottom, transparent, rgba(155,107,255,0.35), rgba(255,48,79,0.55) 52%, transparent 54%)" }}
                    initial={{ top: "-10%" }}
                    animate={{ top: "105%" }}
                    transition={{ duration: SCAN_SECONDS, ease: "easeInOut", delay: pi * 0.3 }}
                  />
                )}

                {findings.map((f, fi) => {
                  const pl = placed.get(f.id);
                  if (!pl || pl.page !== pi) return null;
                  const on = focus === f.id;
                  const tone = TONE[f.tone];
                  return pl.rects.map((r, ri) => (
                    <motion.button
                      key={`${f.id}-${ri}`}
                      type="button"
                      ref={ri === 0 ? (el) => void (el ? marks.current.set(f.id, el) : marks.current.delete(f.id)) : undefined}
                      aria-label={`${f.label}${f.detail ? `. ${f.detail}` : ""}`}
                      aria-pressed={pinned === f.id}
                      onMouseEnter={() => setActive(f.id)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(f.id)}
                      onBlur={() => setActive(null)}
                      onClick={() => setPinned((p) => (p === f.id ? null : f.id))}
                      className="absolute z-20 rounded-[4px] transition-shadow duration-300"
                      style={{
                        left: `${(r.x / pg.w) * 100}%`,
                        top: `${(r.y / pg.h) * 100}%`,
                        width: `${(r.w / pg.w) * 100}%`,
                        height: `${(r.h / pg.h) * 100}%`,
                        background: `${tone.color}${on ? "55" : "30"}`,
                        border: `1.5px solid ${tone.color}`,
                        boxShadow: on ? `0 0 0 4px ${tone.color}33, 0 0 24px ${tone.color}` : undefined,
                      }}
                      initial={reduce ? false : { opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.45, delay: reduce ? 0 : SCAN_SECONDS * 0.6 + pi * 0.3 + fi * 0.07, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ));
                })}

                {/* explanation bubble for the focused finding */}
                <AnimatePresence>
                  {focusFinding && focusPlace && focusPlace.page === pi && (
                    <motion.div
                      key={focusFinding.id}
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.25 }}
                      className="pointer-events-none absolute z-30 w-[min(280px,70%)] rounded-2xl border border-white/15 bg-[#0b0b12]/95 p-4 text-left shadow-2xl"
                      style={(() => {
                        const r = focusPlace.rects[0];
                        const below = r.y / pg.h < 0.62;
                        const left = Math.min(Math.max((r.x / pg.w) * 100, 2), 28);
                        return below
                          ? { left: `${left}%`, top: `calc(${((r.y + r.h) / pg.h) * 100}% + 10px)` }
                          : { left: `${left}%`, bottom: `calc(${100 - (r.y / pg.h) * 100}% + 10px)` };
                      })()}
                    >
                      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: TONE[focusFinding.tone].color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[focusFinding.tone].color }} />
                        {TONE[focusFinding.tone].name}
                      </p>
                      <p className="mt-1.5 text-sm text-white">{focusFinding.label}</p>
                      {focusFinding.detail && <p className="mt-1 text-sm text-white/65">{focusFinding.detail}</p>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          {/* findings list, linked to the page both ways */}
          <aside className="liquid-glass rounded-3xl bg-obsidian/80 p-5 lg:sticky lg:top-24">
            <p className="text-sm text-white/55">
              {pages ? (
                <>
                  Pinned <span className="text-white">{located.length}</span> of {findings.length} findings on the page
                </>
              ) : (
                "Finding everything on the page…"
              )}
            </p>
            <ul className="scroll-thin mt-4 max-h-[60svh] space-y-1 overflow-y-auto pr-1" data-lenis-prevent>
              {[...located, ...missing].map((f) => {
                const on = focus === f.id;
                const here = placed.has(f.id);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={!here}
                      onMouseEnter={() => here && setActive(f.id)}
                      onMouseLeave={() => setActive(null)}
                      onClick={() => goTo(f.id)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${on ? "bg-white/10" : "hover:bg-white/5"} ${here ? "" : "cursor-default opacity-50"}`}
                    >
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[f.tone].color, boxShadow: `0 0 8px ${TONE[f.tone].color}` }} />
                      <span className="min-w-0">
                        <span className="line-clamp-2">{f.label}</span>
                        {!here && <span className="text-xs text-white/40">Not pinned on the page (worded differently)</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-white/10 pt-4 text-xs text-white/50">
              {Object.values(TONE).map((t) => (
                <span key={t.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </span>
              ))}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
