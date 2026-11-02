"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { squarify } from "@/lib/insights";

interface Item {
  label: string;
  amount: number;
  explanation?: string;
}

// Blue → violet → red, darkest for the biggest block.
const TILE = ["#2f5fe0", "#5b4be6", "#7c3fe6", "#a03dd0", "#c83aa6", "#e63a7c", "#ff304f"];

/**
 * WizTree-style view of a bill: every charge is a block sized by how much of the money it takes,
 * so "what's eating my bill" is visible at a glance. Click a block for its plain-English meaning.
 */
export function MoneyTreemap({ items, currency, format }: { items: Item[]; currency?: string; format: (n: number, c?: string) => string }) {
  const reduce = useReducedMotion();
  const positive = items.filter((i) => i.amount > 0);
  const total = positive.reduce((s, i) => s + i.amount, 0);
  const rects = squarify(positive, (i) => i.amount, 100, 100);
  const [selected, setSelected] = useState<string | null>(null);
  if (rects.length < 2 || total <= 0) return null;

  const biggest = rects[0].item;
  const share = (n: number) => Math.round((n / total) * 100);
  const active = positive.find((i) => i.label === selected);

  return (
    <div>
      <p className="mb-4 text-lg">
        <span className="text-blend font-heading text-2xl italic">{biggest.label}</span> takes{" "}
        <span className="font-medium">{share(biggest.amount)}%</span> of your bill.
      </p>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-white/[0.03] sm:aspect-[16/8]" role="group" aria-label="Charges sized by amount">
        {rects.map((r, i) => {
          const pct = share(r.item.amount);
          const on = selected === r.item.label;
          const small = r.w < 16 || r.h < 18;
          return (
            <motion.button
              key={r.item.label}
              type="button"
              onClick={() => setSelected(on ? null : r.item.label)}
              aria-pressed={on}
              aria-label={`${r.item.label}: ${format(r.item.amount, currency)}, ${pct}% of the total`}
              className="absolute p-[2px] text-left"
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, transformOrigin: "top left" }}
              initial={reduce ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className={`flex h-full w-full flex-col justify-between overflow-hidden rounded-xl p-2.5 transition-all duration-300 sm:p-3 ${
                  on ? "ring-2 ring-white" : selected ? "opacity-45 hover:opacity-80" : "hover:z-10 hover:scale-[1.035] hover:brightness-125 hover:shadow-[0_0_30px_rgba(155,107,255,0.55)]"
                }`}
                style={{
                  background: `linear-gradient(140deg, ${TILE[Math.min(i, TILE.length - 1)]}, ${TILE[Math.min(i + 1, TILE.length - 1)]}cc)`,
                  boxShadow: on ? "0 0 30px rgba(155,107,255,0.6)" : undefined,
                }}
              >
                {!small && <span className="line-clamp-2 text-xs font-medium leading-tight text-white sm:text-sm">{r.item.label}</span>}
                <span className="font-heading text-lg italic leading-none text-white sm:text-2xl">{small ? `${pct}%` : `${pct}%`}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        {active ? (
          <motion.div
            key={active.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 rounded-2xl bg-white/[0.05] p-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-lg">{active.label}</span>
              <span className="font-mono">{format(active.amount, currency)}</span>
            </div>
            <p className="mt-1 text-sm text-white/60">{active.explanation ?? "No explanation was given in the document for this charge."}</p>
          </motion.div>
        ) : (
          <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-xs text-white/40">
            Tap a block to see what that charge means.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
