"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DocumentVortex } from "@/components/DocumentVortex";
import type { Stage } from "@/lib/analyze";

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "validating", label: "Validating PDF" },
  { id: "extracting", label: "Extracting text" },
  { id: "protecting", label: "Protecting personal information" },
  { id: "analyzing", label: "Analyzing document" },
  { id: "preparing", label: "Preparing your summary" },
];

/** Shows the stage the server last reported. No percentages: we don't know how long each stage takes. */
export function ProcessingState({ stage, onCancel }: { stage: Stage | null; onCancel: () => void }) {
  const current = stage ? STAGES.findIndex((s) => s.id === stage) : -1;
  const active = STAGES[Math.max(0, current)];
  return (
    <div
      role="status"
      aria-live="polite"
      className="liquid-glass-strong grid items-center gap-2 rounded-[2rem] bg-obsidian/70 px-6 py-8 sm:px-10 md:grid-cols-[auto_1fr] md:gap-8"
    >
      <DocumentVortex />

      <div className="text-center md:text-left">
        <p className="eyebrow">Decoding</p>
        <div className="relative mt-3 h-[2.3em] overflow-hidden font-heading text-3xl italic sm:text-4xl">
          <AnimatePresence mode="popLayout">
            <motion.p
              key={active.id}
              initial={{ y: "100%", opacity: 0, filter: "blur(8px)" }}
              animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-100%", opacity: 0, filter: "blur(8px)" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="text-blend"
              aria-hidden="true"
            >
              {active.label}…
            </motion.p>
          </AnimatePresence>
        </div>
        <ol className="mx-auto mt-4 flex max-w-sm flex-col gap-2 text-left text-sm md:mx-0">
          {STAGES.map((s, i) => {
            const done = i < current;
            const on = i === current || (current === -1 && i === 0);
            return (
              <li key={s.id} className={`flex items-center gap-3 ${done || on ? "text-ink" : "text-white/30"}`}>
                <span
                  aria-hidden="true"
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${done ? "border-transparent bg-white text-black" : on ? "border-white/70" : "border-white/15"}`}
                >
                  {done ? <Check size={12} /> : on ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : null}
                </span>
                <span>
                  {s.label}
                  {done && <span className="sr-only"> (done)</span>}
                  {on && <span className="sr-only"> (in progress)</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={onCancel} className="liquid-glass mt-7 min-h-11 rounded-full px-6 text-sm hover:bg-white/10">
          Cancel
        </button>
      </div>
    </div>
  );
}
