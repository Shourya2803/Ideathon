"use client";

import { motion, useReducedMotion } from "motion/react";

/** Deterministic pseudo-random in [0,1) so the layout is stable between renders. */
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const PAGES = [
  { x: -70, r: -18, kind: "text" },
  { x: 60, r: 14, kind: "chart" },
  { x: -20, r: -8, kind: "table" },
  { x: 80, r: 22, kind: "text" },
  { x: -85, r: -26, kind: "chart" },
] as const;

const DOTS = Array.from({ length: 42 }, (_, i) => ({
  x0: (rand(i) - 0.5) * 120,
  x1: (rand(i + 50) - 0.5) * 50,
  delay: rand(i + 100) * 2.6,
  dur: 1.8 + rand(i + 150) * 1.2,
  size: 1.5 + rand(i + 200) * 2,
  hue: rand(i + 250),
}));

// Cubes stacked in a loose pyramid above the base.
const CUBES = Array.from({ length: 14 }, (_, i) => {
  const row = i < 6 ? 0 : i < 10 ? 1 : i < 13 ? 2 : 3;
  const inRow = [6, 4, 3, 1][row];
  const idx = i - [0, 6, 10, 13][row];
  return { x: (idx - (inRow - 1) / 2) * 22 + (rand(i + 300) - 0.5) * 8, y: -row * 20, delay: rand(i + 350) * 2 };
});

const blendColor = (t: number) => (t < 0.33 ? "#6f9bff" : t < 0.66 ? "#9b6bff" : "#ff4d6a");

function Page({ kind }: { kind: "text" | "chart" | "table" }) {
  return (
    <div className="h-full w-full rounded-[3px] bg-[#eef2ff] p-2 shadow-[0_0_24px_rgba(126,163,255,0.45)]">
      <div className="mb-1.5 h-1.5 w-1/2 rounded-full bg-slate-500/70" />
      {kind === "chart" && (
        <div className="mb-1.5 flex items-end gap-0.5">
          {[60, 35, 80, 50, 70].map((h, i) => (
            <div key={i} className="w-2 rounded-[1px] bg-[#2563eb]/70" style={{ height: h / 4 }} />
          ))}
          <div className="ml-1 h-5 w-5 rounded-full border-[3px] border-[#ff304f]/70 border-r-transparent" />
        </div>
      )}
      {kind === "table" && (
        <div className="mb-1.5 grid grid-cols-3 gap-0.5">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-1.5 rounded-[1px] bg-slate-400/60" />
          ))}
        </div>
      )}
      {[90, 75, 85, 60, 80, 45].map((w, i) => (
        <div key={i} className="mb-1 h-[3px] rounded-full bg-slate-400/60" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/**
 * Decorative "pages fly into the decoder" scene shown while a document is analyzed:
 * pages spiral down through glowing rings, dissolve into particles and settle as cubes on a base.
 */
export function DocumentVortex() {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden="true" className="relative mx-auto h-[340px] w-[320px] [perspective:900px] sm:h-[400px] sm:w-[360px]">
      {/* base platform, isometric */}
      <div className="absolute bottom-6 left-1/2 h-[150px] w-[150px] sm:h-[170px] sm:w-[170px]" style={{ transform: "translateX(-50%) rotateX(62deg) rotateZ(45deg)" }}>
        <div
          className="h-full w-full rounded-2xl border border-[#7ea3ff]/60 bg-[#0a0e1e]/95"
          style={{
            boxShadow: "0 0 40px rgba(37,99,235,0.55), inset 0 0 30px rgba(124,63,230,0.35)",
            backgroundImage:
              "linear-gradient(rgba(126,163,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(126,163,255,0.12) 1px, transparent 1px)",
            backgroundSize: "17px 17px",
          }}
        >
          <div className="flex h-full flex-col justify-between p-3">
            <span className="font-mono text-[10px] tracking-[0.3em] text-[#9bb8ff]">DECODED</span>
            <div className={`mx-auto h-2.5 w-2/3 rounded-full bg-[#7ea3ff] ${reduce ? "" : "animate-pulse"}`} style={{ boxShadow: "0 0 14px #7ea3ff" }} />
          </div>
        </div>
      </div>

      {/* glow column */}
      <div className="absolute bottom-20 left-1/2 h-56 w-20 -translate-x-1/2 rounded-full bg-[#2563eb]/25 blur-2xl" />

      {/* cubes settling on the base */}
      <div className="absolute bottom-[86px] left-1/2 sm:bottom-[96px]">
        {CUBES.map((c, i) => (
          <motion.span
            key={i}
            className="absolute block h-4 w-4 rotate-45 rounded-[3px] border border-[#9bb8ff]/80 bg-[#2563eb]/20"
            style={{ left: c.x - 8, top: c.y - 8, boxShadow: "0 0 10px rgba(126,163,255,0.7)" }}
            animate={reduce ? undefined : { opacity: [0.25, 1, 0.25], scale: [0.85, 1.05, 0.85] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: c.delay, ease: "easeInOut" }}
          />
        ))}
      </div>

      {/* rings */}
      <svg viewBox="0 0 360 400" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="vortex-ring" x1="0" x2="1">
            <stop offset="0" stopColor="#6f9bff" />
            <stop offset="0.5" stopColor="#9b6bff" />
            <stop offset="1" stopColor="#ff4d6a" />
          </linearGradient>
        </defs>
        {[
          { cy: 170, rx: 150, ry: 40 },
          { cy: 198, rx: 122, ry: 32 },
          { cy: 226, rx: 96, ry: 25 },
        ].map((r, i) => (
          <motion.ellipse
            key={i}
            cx={180}
            cy={r.cy}
            rx={r.rx}
            ry={r.ry}
            fill="none"
            stroke="url(#vortex-ring)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeDasharray="140 40 18 40"
            style={{ filter: "drop-shadow(0 0 6px rgba(155,107,255,0.9))" }}
            animate={reduce ? undefined : { strokeDashoffset: [0, i % 2 ? -476 : 476] }}
            transition={{ duration: 5 + i * 1.5, repeat: Infinity, ease: "linear" }}
          />
        ))}
      </svg>

      {/* particles streaming down from the pages */}
      <div className="absolute left-1/2 top-[120px]">
        {DOTS.map((d, i) => (
          <span
            key={i}
            className="vortex-dot absolute block rounded-full"
            style={
              {
                width: d.size,
                height: d.size,
                background: blendColor(d.hue),
                boxShadow: `0 0 6px ${blendColor(d.hue)}`,
                "--x0": `${d.x0}px`,
                "--x1": `${d.x1}px`,
                animationDuration: `${d.dur}s`,
                animationDelay: `${d.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* pages spiralling in */}
      {PAGES.map((p, i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-0 h-[88px] w-[68px] sm:h-[100px] sm:w-[78px]"
          style={{ marginLeft: -39, transformPerspective: 700 }}
          initial={reduce ? false : { opacity: 0 }}
          animate={
            reduce
              ? { x: p.x, y: 10 + i * 18, rotate: p.r, opacity: 0.9 - i * 0.12 }
              : {
                  x: [p.x * 1.4, p.x, p.x * 0.25, 0],
                  y: [-40, 40, 140, 210],
                  rotate: [p.r, p.r + 30, p.r + 90, p.r + 160],
                  rotateY: [0, 35, 75, 110],
                  scale: [1, 0.95, 0.6, 0.15],
                  opacity: [0, 1, 0.85, 0],
                }
          }
          transition={reduce ? undefined : { duration: 3.4, repeat: Infinity, delay: i * 0.68, ease: "easeIn", times: [0, 0.3, 0.7, 1] }}
        >
          <Page kind={p.kind} />
        </motion.div>
      ))}
    </div>
  );
}
