"use client";

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { scrollToY } from "@/components/LenisProvider";
import { setScene, type ShapeName } from "@/components/scene/store";

export const DOCS: Array<{ name: string; shape: ShapeName; question: string; reads: string[] }> = [
  {
    name: "Electricity bills",
    shape: "bolt",
    question: "Why is this month higher?",
    reads: ["Total and due date", "Units used", "Every charge, explained", "Change vs. last bill, calculated, not guessed"],
  },
  {
    name: "Lab reports",
    shape: "flask",
    question: "Which numbers are outside the range?",
    reads: ["Each test in plain words", "Your value vs. the printed range", "Out-of-range values flagged", "Not a diagnosis: questions for your doctor"],
  },
  {
    name: "Loan agreements",
    shape: "coins",
    question: "What will this really cost me?",
    reads: ["Rate, EMI and tenure", "Total repayment and interest, calculated", "Fees and prepayment penalties", "Late-payment and default clauses"],
  },
  {
    name: "Government schemes",
    shape: "pillars",
    question: "Could I qualify, and what do I need?",
    reads: ["Eligibility rules as a checklist", "Documents to keep ready", "Deadlines", "Benefit amounts"],
  },
  {
    name: "Insurance policies",
    shape: "shield",
    question: "What isn't covered?",
    reads: ["Coverage and limits", "Exclusions and waiting periods", "Deductibles and premium", "Renewal and claim conditions"],
  },
  {
    name: "Exam syllabi",
    shape: "book",
    question: "What should I study first?",
    reads: ["Units and topics", "Weightage and marks", "Exam dates and pattern", "Prescribed books"],
  },
];

/** Pinned section: scrolling morphs the particle world through one form per kind of document. */
export function DocumentTypes() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const i = Math.min(DOCS.length - 1, Math.max(0, Math.floor(v * DOCS.length)));
    setIndex(i);
    if (v > 0 && v < 1) setScene({ shape: DOCS[i].shape, x: 0.52, y: 0.02, s: 0.95, portrait: { x: 0, y: 0.45, s: 0.48 } });
  });

  const jump = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    scrollToY(top + span * ((i + 0.5) / DOCS.length), !reduce);
  };

  const doc = DOCS[index];

  return (
    <section id="documents" ref={ref} className="relative h-[600vh]" aria-label="Documents Decoded reads">
      <div className="sticky top-0 flex h-svh items-end px-5 pb-10 sm:items-center sm:px-8 sm:pb-0">
        <div className="mx-auto w-full max-w-7xl">
          <p className="eyebrow mb-4">
            What it reads · <span className="text-white">{String(index + 1).padStart(2, "0")}</span> / {String(DOCS.length).padStart(2, "0")}
          </p>
          <div className="min-h-[22rem] max-w-xl sm:min-h-[26rem]">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={doc.name}
                initial={reduce ? false : { opacity: 0, y: 30, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduce ? undefined : { opacity: 0, y: -24, filter: "blur(10px)" }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <h2 className="title">{doc.name}</h2>
                <p className="mt-4 font-heading text-2xl italic sm:text-3xl">
                  <span className="text-blend">“{doc.question}”</span>
                </p>
                <ul className="mt-6 space-y-2.5 text-white/70">
                  {doc.reads.map((r, i) => (
                    <motion.li
                      key={r}
                      initial={reduce ? false : { opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.07, duration: 0.5 }}
                      className="flex items-center gap-3"
                    >
                      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--blend)" }} />
                      {r}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          <ol className="mt-4 flex gap-2" aria-label="Jump to a document type">
            {DOCS.map((d, i) => (
              <li key={d.name}>
                <button
                  type="button"
                  onClick={() => jump(i)}
                  aria-label={d.name}
                  aria-current={i === index ? "step" : undefined}
                  className="group grid h-8 place-items-center"
                >
                  <span
                    className={`block h-[3px] rounded-full transition-all duration-500 ${i === index ? "w-10" : "w-5 bg-white/20 group-hover:bg-white/50"}`}
                    style={i === index ? { background: "var(--blend)" } : undefined}
                  />
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
