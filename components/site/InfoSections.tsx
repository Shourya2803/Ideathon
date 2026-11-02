"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { LIMIT_LABELS } from "@/lib/config";
import { useSceneSection } from "@/components/scene/store";
import { EASE, MaskWords, Reveal } from "./motion";

const STEPS = [
  { n: "01", title: "Drop", body: `A text-based PDF up to ${LIMIT_LABELS.size} and ${LIMIT_LABELS.pages}. We check it really is a readable PDF.` },
  {
    n: "02",
    title: "Protect",
    body: "Text is pulled out on our server. Names, numbers, addresses and IDs become placeholders like [PERSON_1] before any AI sees it.",
  },
  {
    n: "03",
    title: "Understand",
    body: "Key facts, dates, amounts and conditions in plain words, with what's missing called out and the maths done in code, never guessed.",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  useSceneSection(ref, { shape: "sheet", scan: 0.6, x: -0.52, y: 0, s: 1.35, portrait: { x: 0, y: 0.5, s: 0.55 } });
  return (
    <section id="how" ref={ref} className="relative flex min-h-svh items-center px-5 py-32 sm:px-8">
      <div className="mx-auto grid w-full max-w-7xl md:grid-cols-2">
        <div className="hidden md:block" />
        <div className="pt-[30svh] md:pt-0">
          <p className="eyebrow mb-5">How it works</p>
          <h2 className="title">
            <MaskWords text="Three steps from" onView />{" "}
            <MaskWords text="confusing to clear." wordClassName="text-blend" delay={0.2} onView />
          </h2>
          <ol className="mt-12 space-y-8">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.n}
                initial={reduce ? false : { opacity: 0, y: 28, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-8% 0px" }}
                transition={{ duration: 0.9, ease: EASE, delay: i * 0.12 }}
                className="grid grid-cols-[3.5rem_1fr] gap-4 border-t border-white/10 pt-6"
              >
                <span className="font-mono text-sm text-white/40">{s.n}</span>
                <div>
                  <h3 className="font-heading text-3xl italic">{s.title}</h3>
                  <p className="mt-2 text-white/60">{s.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function Privacy() {
  const ref = useRef<HTMLElement>(null);
  useSceneSection(ref, { shape: "lock", x: 0.52, y: 0, s: 1.0, portrait: { x: 0, y: 0.5, s: 0.5 } });
  return (
    <section id="privacy" ref={ref} className="relative flex min-h-svh items-center px-5 py-32 sm:px-8">
      <div className="mx-auto w-full max-w-7xl pt-[30svh] md:pt-0">
        <div className="max-w-xl">
          <p className="eyebrow mb-5">Privacy first</p>
          <h2 className="title">
            <MaskWords text="Your PDF never" onView /> <MaskWords text="reaches the AI." wordClassName="text-blend" delay={0.2} onView />
          </h2>
          <Reveal delay={0.2}>
            <ul className="mt-10 space-y-4 text-white/65">
              <li>Text is extracted on our server. Only cleaned text is analyzed, never the original file.</li>
              <li>Names, emails, phone numbers, addresses, account and ID numbers become placeholders.</li>
              <li>If cleaning fails, analysis stops. There is no unsanitized fallback.</li>
              <li>No accounts, no database, no stored files. Documents are processed in memory.</li>
            </ul>
            <p className="liquid-glass mt-8 rounded-2xl p-5 text-sm text-white/60">
              Honest limit: automatic detection isn&apos;t perfect. It can miss names that aren&apos;t labelled, so avoid uploading
              highly sensitive documents.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
