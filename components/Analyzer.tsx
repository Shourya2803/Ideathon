"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { ErrorMessage } from "@/components/ErrorMessage";
import { scrollToElement } from "@/components/LenisProvider";
import { ProcessingState } from "@/components/ProcessingState";
import { UploadArea, type SampleKind } from "@/components/UploadArea";
import { ResultsView, TYPE_SHAPE } from "@/components/results/ResultsView";
import { XRayView } from "@/components/results/XRayView";
import { setScene, type SceneTarget } from "@/components/scene/store";
import type { Stage } from "@/lib/analyze";
import { analyzeFile, ClientError } from "@/lib/client";
import { toErrorPayload, type ErrorPayload } from "@/lib/errors";
import { getSampleLabResult, getSampleResult } from "@/lib/sample";
import type { AnalysisResponse } from "@/types/analysis";

type Mode = "story" | "xray";

type View =
  | { name: "idle" }
  | { name: "processing"; stage: Stage | null }
  | { name: "done"; result: AnalysisResponse; source?: File | string }
  | { name: "error"; error: ErrorPayload };

/** What the particle world does behind each state of the analyzer. */
function sceneFor(view: View, mode: Mode): Partial<SceneTarget> {
  // X-ray needs the full width and a calm background.
  if (view.name === "done" && mode === "xray") return { shape: "sheet", chaos: 1, glow: 0.22, x: 0, y: 0, s: 1.4 };
  switch (view.name) {
    // The page stays beside the panel (never behind its text); on phones it sits small near the top.
    case "processing":
      // the vortex inside the panel is the star now; the world becomes soft swirling dust behind it
      return { shape: "sheet", chaos: 1, glow: 0.35, x: 0, y: 0, s: 1.4, portrait: { x: 0, y: 0, s: 1, glow: 0.3 } };
    case "done":
      return {
        shape: TYPE_SHAPE[view.result.analysis.documentType],
        x: 0.8,
        y: 0,
        s: 0.7,
        glow: 0.55,
        portrait: { x: 0, y: 0.76, s: 0.28, glow: 0.4 },
      };
    default:
      return { shape: "sheet", x: 0.8, y: 0, s: 0.9, glow: 0.6, portrait: { x: 0, y: 0.74, s: 0.3, glow: 0.4 } };
  }
}

export function Analyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState<View>({ name: "idle" });
  const [mode, setMode] = useState<Mode>("story");
  const abortRef = useRef<AbortController | null>(null);
  // Scroll to the new view only once the old one has finished leaving (page height is final then).
  const scrollPending = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const inView = useInView(topRef, { margin: "-45% 0px -45% 0px" });
  const target = JSON.stringify(sceneFor(view, mode));

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (inView) setScene(JSON.parse(target));
  }, [inView, target]);

  const showResult = (result: AnalysisResponse, source?: File | string) => {
    setMode("story");
    setView({ name: "done", result, source });
    scrollPending.current = true;
  };

  const run = async (target: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ name: "processing", stage: null });
    try {
      const result = await analyzeFile(target, (stage) => setView({ name: "processing", stage }), controller.signal);
      showResult(result, target);
    } catch (err) {
      const payload = err instanceof ClientError ? err.payload : toErrorPayload("UNEXPECTED");
      // A cancelled run just returns to the upload form.
      setView(payload.code === "CANCELLED" ? { name: "idle" } : { name: "error", error: payload });
    }
  };

  const runSamplePdf = async () => {
    try {
      const res = await fetch("/sample-electricity-bill.pdf");
      const blob = await res.blob();
      const sample = new File([blob], "sample-electricity-bill.pdf", { type: "application/pdf" });
      setFile(sample);
      await run(sample);
    } catch {
      setView({ name: "error", error: toErrorPayload("NETWORK") });
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setFile(null);
    setView({ name: "idle" });
    scrollPending.current = true;
  };

  // The bill sample has a real PDF to X-ray; the lab sample is data only.
  const showSample = (kind: SampleKind = "bill") =>
    kind === "lab" ? showResult(getSampleLabResult()) : showResult(getSampleResult(), "/sample-electricity-bill.pdf");
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    scrollPending.current = true;
    setMode(m);
  };
  const busy = view.name === "processing";

  return (
    <div ref={topRef} className="scroll-mt-0">
      <AnimatePresence
        mode="wait"
        onExitComplete={() => {
          if (!scrollPending.current || !topRef.current) return;
          scrollPending.current = false;
          const el = topRef.current;
          requestAnimationFrame(() => scrollToElement(el));
        }}
      >
        <motion.div
          key={view.name === "done" ? `done-${mode}` : view.name}
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -16, filter: "blur(10px)" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {view.name === "done" ? (
            mode === "xray" && view.source ? (
              <XRayView analysis={view.result.analysis} source={view.source} />
            ) : (
              <ResultsView result={view.result} onReset={reset} />
            )
          ) : (
            <div className={`mx-auto space-y-4 px-5 ${view.name === "processing" ? "max-w-4xl" : "max-w-3xl"}`}>
              {view.name === "processing" ? (
                <ProcessingState stage={view.stage} onCancel={() => abortRef.current?.abort()} />
              ) : (
                <>
                  {view.name === "error" && (
                    <ErrorMessage error={view.error} onRetry={file ? () => run(file) : undefined} onSample={() => showSample("bill")} />
                  )}
                  <UploadArea
                    file={file}
                    disabled={busy}
                    onFile={(f) => {
                      setFile(f);
                      setView({ name: "idle" });
                    }}
                    onAnalyze={() => file && run(file)}
                    onSampleResult={showSample}
                    onSamplePdf={runSamplePdf}
                  />
                </>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Story / X-ray switch, floating under the nav while results are on screen */}
      <AnimatePresence>
        {view.name === "done" && inView && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed inset-x-0 top-[5.25rem] z-40 flex justify-center px-4"
          >
            <div role="group" aria-label="How to view the results" className="liquid-glass-strong flex rounded-full bg-obsidian/70 p-1 text-sm">
              {([
                ["story", "3D story"],
                ["xray", "X-ray the document"],
              ] as const).map(([m, label]) => {
                const unavailable = m === "xray" && !view.source;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    disabled={unavailable}
                    title={unavailable ? "No original PDF for this sample" : undefined}
                    onClick={() => switchMode(m)}
                    className={`relative min-h-10 rounded-full px-4 transition-colors ${mode === m ? "text-black" : "text-white/70 hover:text-white"} disabled:cursor-not-allowed disabled:opacity-35`}
                  >
                    {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                    <span className="relative">{label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
