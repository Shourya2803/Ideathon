"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { useSceneSection } from "@/components/scene/store";

const SENTENCE = "People sign, pay, or skip things they don't understand.";
const COSTS = [
  { word: "Money.", line: "A late fee nobody mentioned. A loan that costs twice what it seemed." },
  { word: "Health.", line: "A lab value outside its range that nobody explained." },
  { word: "Opportunities.", line: "A scheme you qualified for, and a deadline that quietly passed." },
];

function Word({ word, i, n, p }: { word: string; i: number; n: number; p: MotionValue<number> }) {
  const start = 0.05 + (i / n) * 0.4;
  const opacity = useTransform(p, [start, start + 0.06], [0.12, 1]);
  const blur = useTransform(p, [start, start + 0.06], ["blur(6px)", "blur(0px)"]);
  return (
    <motion.span style={{ opacity, filter: blur }} className="inline-block">
      {word}&nbsp;
    </motion.span>
  );
}

function Cost({ c, i, p }: { c: (typeof COSTS)[number]; i: number; p: MotionValue<number> }) {
  const start = 0.52 + i * 0.12;
  const opacity = useTransform(p, [start, start + 0.08], [0, 1]);
  const y = useTransform(p, [start, start + 0.08], [40, 0]);
  return (
    <motion.li style={{ opacity, y }} className="border-t border-white/10 pt-4">
      <p className="title text-blend">{c.word}</p>
      <p className="mt-2 max-w-xs text-white/60">{c.line}</p>
    </motion.li>
  );
}

/** Scroll-scrubbed statement over a shapeless particle cloud: complexity before clarity. */
export function Problem() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  useSceneSection(ref, { shape: "sheet", chaos: 1, glow: 0.55, x: 0, y: 0, s: 1.6, portrait: { x: 0, y: 0, s: 1.1 } });
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const words = SENTENCE.split(" ");

  if (reduce) {
    return (
      <section id="problem" ref={ref} className="mx-auto max-w-6xl px-5 py-32 sm:px-8">
        <p className="eyebrow mb-6">The problem</p>
        <h2 className="title max-w-4xl">{SENTENCE}</h2>
        <ul className="mt-14 grid gap-8 md:grid-cols-3">
          {COSTS.map((c) => (
            <li key={c.word} className="border-t border-white/10 pt-4">
              <p className="title text-blend">{c.word}</p>
              <p className="mt-2 text-white/60">{c.line}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section id="problem" ref={ref} className="relative h-[260vh]">
      <div className="sticky top-0 flex h-svh flex-col justify-center px-5 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <p className="eyebrow mb-6">The problem</p>
          <h2 className="title max-w-5xl" aria-label={SENTENCE}>
            <span aria-hidden="true">
              {words.map((w, i) => (
                <Word key={i} word={w} i={i} n={words.length} p={p} />
              ))}
            </span>
          </h2>
          <p className="mt-6 text-white/50">It costs them:</p>
          <ul className="mt-6 grid gap-6 md:grid-cols-3 md:gap-10">
            {COSTS.map((c, i) => (
              <Cost key={c.word} c={c} i={i} p={p} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
