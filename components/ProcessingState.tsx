"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { Stage } from "@/lib/analyze";

// Browser-only WebGL; the stage list below carries all the meaning if it can't run.
const DecodeScene = dynamic(() => import("@/components/processing/DecodeScene"), { ssr: false });

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "validating", label: "Validating PDF" },
  { id: "extracting", label: "Extracting text" },
  { id: "protecting", label: "Protecting personal information" },
  { id: "analyzing", label: "Analyzing document" },
  { id: "preparing", label: "Preparing your summary" },
];
const SOFT = { type: "spring", stiffness: 140, damping: 18, mass: 0.7 } as const;

/** Shows the stage the server last reported. No percentages: we don't know how long each stage takes. */
export function ProcessingState({ stage, onCancel }: { stage: Stage | null; onCancel: () => void }) {
  const reduce = useReducedMotion();
  const current = stage ? STAGES.findIndex((s) => s.id === stage) : -1;
  const activeIndex = Math.max(0, current);
  const active = STAGES[activeIndex];

  // Cursor-driven 3D tilt of the whole panel, smoothed by springs.
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const rotateY = useSpring(tx, { stiffness: 120, damping: 16, mass: 0.6 });
  const rotateX = useSpring(ty, { stiffness: 120, damping: 16, mass: 0.6 });
  // The rail fills as stages complete: 0 at the first stage, 1 at the last.
  const rail = useSpring(activeIndex / (STAGES.length - 1), { stiffness: 90, damping: 18 });
  useEffect(() => rail.set(activeIndex / (STAGES.length - 1)), [rail, activeIndex]);

  return (
    <div
      className="[perspective:1400px]"
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        tx.set(((e.clientX - r.left) / r.width - 0.5) * 7);
        ty.set(-((e.clientY - r.top) / r.height - 0.5) * 5);
      }}
      onPointerLeave={() => {
        tx.set(0);
        ty.set(0);
      }}
    >
      <motion.div
        role="status"
        aria-live="polite"
        style={reduce ? undefined : { rotateX, rotateY }}
        initial={reduce ? false : { opacity: 0, rotateX: 14, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="liquid-glass-strong grid rounded-[2rem] bg-obsidian/70 md:grid-cols-[1.15fr_1fr]"
      >
        {/* the 3D scene: a tunnel of rings the camera flies through, one ring per stage */}
        <div className="relative h-[270px] md:h-auto md:min-h-[400px]">
          <DecodeScene stageIndex={current} className="absolute inset-0 h-full w-full" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(70% 70% at 50% 50%, transparent 55%, rgb(5 5 5 / 0.65) 100%)" }}
          />
          <p className="eyebrow absolute left-6 top-6 sm:left-8 sm:top-7">
            Stage {activeIndex + 1} <span className="text-white/35">/ {STAGES.length}</span>
          </p>
        </div>

        <div className="px-6 pb-8 pt-2 md:px-9 md:py-10">
          <p className="eyebrow">Decoding</p>
          <div className="relative mt-3 h-[2.3em] font-heading text-3xl italic sm:text-4xl" style={{ perspective: 700 }}>
            <AnimatePresence mode="popLayout">
              <motion.p
                key={active.id}
                initial={reduce ? false : { rotateX: -85, y: 26, opacity: 0, filter: "blur(6px)" }}
                animate={{ rotateX: 0, y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={reduce ? undefined : { rotateX: 85, y: -26, opacity: 0, filter: "blur(6px)" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: "50% 100%" }}
                className="text-blend"
                aria-hidden="true"
              >
                {active.label}…
              </motion.p>
            </AnimatePresence>
          </div>

          <ol className="relative mt-5 space-y-1.5 text-sm">
            <span aria-hidden="true" className="absolute bottom-4 left-[15px] top-4 w-px bg-white/10" />
            <motion.span
              aria-hidden="true"
              className="absolute bottom-4 left-[15px] top-4 w-px origin-top"
              style={{ background: "var(--blend)", scaleY: rail, boxShadow: "0 0 10px rgb(155 107 255 / 0.8)" }}
            />
            {STAGES.map((s, i) => {
              const done = i < current;
              const on = i === activeIndex;
              return (
                <motion.li
                  key={s.id}
                  animate={{ x: on ? 8 : 0, opacity: done || on ? 1 : 0.35, scale: on ? 1.03 : 1 }}
                  transition={SOFT}
                  style={{ transformOrigin: "left center" }}
                  className="relative flex items-center gap-3.5 py-1"
                >
                  <motion.span
                    aria-hidden="true"
                    animate={{
                      backgroundColor: done ? "#ffffff" : "rgba(5,5,5,1)",
                      borderColor: done ? "rgba(255,255,255,0)" : on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.18)",
                      scale: done ? [1, 1.35, 1] : 1,
                    }}
                    transition={{ duration: 0.5 }}
                    className="z-10 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border text-black"
                    style={on ? { boxShadow: "0 0 0 4px rgb(155 107 255 / 0.18), 0 0 18px rgb(155 107 255 / 0.7)" } : undefined}
                  >
                    {done ? (
                      <Check size={15} />
                    ) : on ? (
                      <motion.span
                        className="h-2 w-2 rounded-full bg-white"
                        animate={reduce ? undefined : { scale: [1, 1.6, 1], opacity: [1, 0.55, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                      />
                    ) : (
                      <span className="font-mono text-[10px] text-white/40">{i + 1}</span>
                    )}
                  </motion.span>
                  <span className={on ? "text-ink" : done ? "text-white/80" : "text-white/70"}>
                    {s.label}
                    {done && <span className="sr-only"> (done)</span>}
                    {on && <span className="sr-only"> (in progress)</span>}
                  </span>
                </motion.li>
              );
            })}
          </ol>

          <button type="button" onClick={onCancel} className="liquid-glass mt-7 min-h-11 rounded-full px-6 text-sm hover:bg-white/10">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
