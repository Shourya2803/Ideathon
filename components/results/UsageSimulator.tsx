"use client";

import { motion, useSpring, useTransform } from "motion/react";
import { useEffect, useId, useState } from "react";
import { simulateUsage, type UsageModel } from "@/lib/insights";

/** "What if I used less?": drag the units and watch the bill recalculate from the bill's own rate. */
export function UsageSimulator({ model, format }: { model: UsageModel; format: (n: number, c?: string) => string }) {
  const id = useId();
  const [units, setUnits] = useState(model.units);
  const { total, difference } = simulateUsage(model, units);
  const spring = useSpring(total, { stiffness: 120, damping: 20 });
  const shown = useTransform(spring, (v) => format(Math.round(v), model.currency));
  useEffect(() => spring.set(total), [spring, total]);

  const max = Math.max(10, Math.round(model.units * 2));
  const presets = [
    { label: "−25%", v: Math.round(model.units * 0.75) },
    { label: "−10%", v: Math.round(model.units * 0.9) },
    { label: "As billed", v: model.units },
    { label: "+20%", v: Math.round(model.units * 1.2) },
  ];
  const fmtUnits = (n: number) => `${n.toLocaleString("en-US")} ${model.unit}`;
  const saved = difference < 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-white/50">Your bill would be</p>
          <motion.p className="font-heading text-5xl italic leading-none text-blend sm:text-6xl" aria-live="polite">
            {shown}
          </motion.p>
        </div>
        <motion.p
          key={Math.sign(difference)}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`rounded-full px-3 py-1 text-sm ${difference === 0 ? "bg-white/10 text-white/70" : saved ? "bg-electric/25 text-electric-soft" : "bg-neon/20 text-neon"}`}
        >
          {difference === 0 ? "Same as billed" : `${saved ? "You'd save" : "You'd pay"} ${format(Math.abs(difference), model.currency)}${saved ? "" : " more"}`}
        </motion.p>
      </div>

      <label htmlFor={id} className="mt-7 flex items-baseline justify-between text-sm">
        <span className="text-white/60">Electricity used</span>
        <span className="font-mono text-lg">{fmtUnits(units)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={units}
        onChange={(e) => setUnits(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full accent-[#9b6bff]"
        style={{ background: `linear-gradient(90deg, #6f9bff, #9b6bff ${(units / max) * 100}%, rgba(255,255,255,0.1) ${(units / max) * 100}%)` }}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setUnits(p.v)}
            className={`liquid-glass min-h-10 rounded-full px-4 text-sm hover:bg-white/10 ${units === p.v ? "ring-blend" : ""}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-5 text-xs text-white/45">
        Calculated from your bill: energy charge {format(model.energyCharge, model.currency)} ÷ {fmtUnits(model.units)} ={" "}
        {format(Math.round(model.rate * 100) / 100, model.currency)} per {model.unit}. Other charges are assumed to stay the same,
        though usage-linked ones (like duty or fuel adjustment) may also change. An estimate, not a quote.
      </p>
    </div>
  );
}
