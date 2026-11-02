"use client";

import { ArrowDown, CalendarDays, Check, CheckCircle2, HelpCircle, ListChecks, TriangleAlert } from "lucide-react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { scrollToY } from "@/components/LenisProvider";
import CountUp from "@/components/reactbits/CountUp";
import type { ShapeName } from "@/components/scene/store";
import { buildIcs, usageModel } from "@/lib/insights";
import type { Analysis, AnalysisResponse, Comparison, DocumentType, RangeStatus } from "@/types/analysis";
import { MoneyTreemap } from "./MoneyTreemap";
import { UsageSimulator } from "./UsageSimulator";

/** Downloads the document's single-day deadlines as calendar events (with a reminder the day before). */
function CalendarButton({ analysis }: { analysis: Analysis }) {
  const { ics, count } = buildIcs(analysis);
  if (count === 0) return null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "decoded-deadlines.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button type="button" onClick={download} className="mt-7 flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-white/90">
      <CalendarDays size={15} aria-hidden="true" /> Add {count === 1 ? "this date" : `${count} dates`} to my calendar
    </button>
  );
}

export const TYPE_LABEL: Record<DocumentType, string> = {
  electricity_bill: "Electricity bill",
  lab_report: "Lab report",
  loan_agreement: "Loan agreement",
  government_scheme: "Government scheme",
  insurance_policy: "Insurance policy",
  exam_syllabus: "Exam syllabus",
  invoice: "Invoice",
  contract: "Contract / agreement",
  other: "Document",
};

export const TYPE_SHAPE: Record<DocumentType, ShapeName> = {
  electricity_bill: "bolt",
  lab_report: "flask",
  loan_agreement: "coins",
  government_scheme: "pillars",
  insurance_policy: "shield",
  exam_syllabus: "book",
  invoice: "sheet",
  contract: "sheet",
  other: "sheet",
};

const ADVICE_NOTE: Partial<Record<DocumentType, string>> = {
  contract: "This is an informational summary, not legal advice. Check the original document or a qualified professional for decisions.",
  insurance_policy: "This is an informational summary, not financial or legal advice. The policy wording is the authoritative source.",
  loan_agreement: "This is an informational summary, not financial or legal advice. The signed agreement is the authoritative source.",
};

export function formatAmount(n: number, currency?: string): string {
  const num = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!currency) return num;
  if (/^[A-Za-z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(n);
    } catch {
      /* unknown code: fall through */
    }
  }
  return `${currency} ${num}`;
}

/** Animated number with the final value always available to assistive tech. */
function Amount({ n, currency, className }: { n: number; currency?: string; className?: string }) {
  const text = formatAmount(n, currency);
  const prefix = text.slice(0, text.search(/[\d-]/));
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {prefix}
        <CountUp to={n} separator="," decimals={Number.isInteger(n) ? 0 : 2} duration={1.4} trigger="view" />
      </span>
    </span>
  );
}

const H = ({ children, icon }: { children: ReactNode; icon?: ReactNode }) => (
  <h3 className="mb-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
    {icon}
    {children}
  </h3>
);

const Excerpt = ({ text }: { text?: string }) =>
  text ? <blockquote className="mt-2 break-words border-l border-white/25 pl-3 text-sm italic text-white/50">“{text}”</blockquote> : null;

function ComparisonCard({ c }: { c: Comparison }) {
  const up = c.difference > 0;
  const same = c.difference === 0;
  return (
    <div className="mt-6 rounded-2xl bg-white/[0.04] p-4">
      <p className="text-sm text-white/55">Compared with the previous amount in this document</p>
      <p className="mt-1 text-lg">
        {same ? "No change" : `${up ? "Up" : "Down"} ${formatAmount(Math.abs(c.difference), c.currency)}`}
        {!same && (
          <span className={up ? "text-neon" : "text-electric-soft"}>
            {" "}
            ({up ? "+" : ""}
            {c.percentChange}%)
          </span>
        )}
      </p>
      <p className="mt-1 text-sm text-white/50">
        {formatAmount(c.previous, c.currency)} → {formatAmount(c.current, c.currency)} (calculated, not AI-estimated)
      </p>
    </div>
  );
}

const STATUS_LABEL: Record<RangeStatus, string> = { below: "Below range", within: "Within range", above: "Above range" };

interface Chapter {
  id: string;
  label: string;
  body: ReactNode;
}

function buildChapters(result: AnalysisResponse, onReset: () => void): Chapter[] {
  const { analysis: a, meta } = result;
  const comparison = result.derived?.comparison ?? result.comparison;
  const derived = result.derived;
  const fb = a.financialBreakdown;
  const out: Chapter[] = [];

  out.push({
    id: "overview",
    label: "Overview",
    body: (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ring-blend rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-widest">{TYPE_LABEL[a.documentType]}</span>
          {meta.source === "sample" && (
            <span className="rounded-full bg-neon/15 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-neon">Sample data</span>
          )}
        </div>
        <h2
          id="result-title"
          className={`mt-5 break-words font-heading italic leading-[0.95] ${
            a.documentTitle.length > 60 ? "text-3xl sm:text-4xl" : a.documentTitle.length > 32 ? "text-3xl sm:text-5xl" : "text-4xl sm:text-6xl"
          }`}
        >
          {a.documentTitle}
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-white/80 sm:text-xl">{a.summary}</p>
        {meta.source === "sample" ? (
          <p role="note" className="mt-5 text-sm text-white/55">
            <strong className="font-medium text-neon">Sample data.</strong> This is a simulated, pre-written result for a fictional
            document. It was not produced by the AI.
          </p>
        ) : (
          <p role="note" className="mt-5 text-sm text-white/55">
            AI-generated explanation of {meta.pages} {meta.pages === 1 ? "page" : "pages"}.{" "}
            {meta.redactions > 0
              ? `${meta.redactions} piece${meta.redactions === 1 ? "" : "s"} of detected personal information ${meta.redactions === 1 ? "was" : "were"} removed before analysis. `
              : "No personal information was detected for removal. "}
            Check important details against the original.
          </p>
        )}
        {meta.truncated && (
          <p role="note" className="mt-3 text-sm text-neon">
            This document was longer than our processing limit, so only the first part was analyzed. This summary is incomplete.
          </p>
        )}
        <button type="button" onClick={onReset} className="liquid-glass mt-7 min-h-11 rounded-full px-5 text-sm hover:bg-white/10">
          Analyze another PDF
        </button>
      </>
    ),
  });

  const dueDate = a.importantDates.find((d) => /due|pay/i.test(d.label));
  const tiles: Array<{ label: string; node: ReactNode; red?: boolean }> = [];
  if (fb?.totalPayable !== undefined)
    tiles.push({ label: "Total payable", node: <Amount n={fb.totalPayable} currency={fb.currency} />, red: true });
  if (dueDate) tiles.push({ label: dueDate.label, node: dueDate.date });
  if (fb?.consumption) tiles.push({ label: "Consumption", node: `${fb.consumption.value.toLocaleString("en-US")} ${fb.consumption.unit}` });
  if (tiles.length || a.keyFacts.length) {
    out.push({
      id: "key",
      label: "Key information",
      body: (
        <>
          <H icon={<CheckCircle2 size={14} aria-hidden="true" />}>Key information</H>
          {tiles.length > 0 && (
            <ul className="mb-6 grid gap-3 sm:grid-cols-3">
              {tiles.map((t) => (
                <li key={t.label} className={`lift rounded-2xl p-4 ${t.red ? "ring-blend bg-white/[0.04]" : "bg-white/[0.04]"}`}>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/50">{t.label}</p>
                  <p className={`mt-1 break-words font-heading text-3xl italic ${t.red ? "text-blend" : ""}`}>{t.node}</p>
                </li>
              ))}
            </ul>
          )}
          <dl className="grid gap-5 sm:grid-cols-2">
            {a.keyFacts.map((f) => (
              <div key={f.label + f.value} className="min-w-0">
                <dt className="text-sm text-white/50">{f.label}</dt>
                <dd className="break-words text-lg">{f.value}</dd>
                {f.explanation && <p className="mt-1 text-sm text-white/55">{f.explanation}</p>}
                <Excerpt text={f.sourceExcerpt} />
              </div>
            ))}
          </dl>
        </>
      ),
    });
  }

  if (fb && (fb.items.length > 0 || fb.totalPayable !== undefined)) {
    const max = Math.max(...fb.items.map((i) => Math.abs(i.amount)), 0);
    out.push({
      id: "money",
      label: "Where the money goes",
      body: (
        <>
          <H>Where the money goes</H>
          {fb.items.filter((i) => i.amount > 0).length >= 2 ? (
            <MoneyTreemap items={fb.items} currency={fb.currency} format={formatAmount} />
          ) : (
          <ul className="space-y-4">
            {fb.items.map((item, i) => (
              <li key={item.label}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 break-words">{item.label}</span>
                  <span className="shrink-0 font-mono text-sm">{formatAmount(item.amount, fb.currency)}</span>
                </div>
                {max > 0 && fb.items.length > 1 && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "var(--blend)" }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(Math.abs(item.amount) / max) * 100}%` }}
                      transition={{ duration: 1, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                )}
                {item.explanation && <p className="mt-1 text-sm text-white/55">{item.explanation}</p>}
              </li>
            ))}
          </ul>
          )}
          {fb.totalPayable !== undefined && (
            <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-white/10 pt-4">
              <span>Total payable</span>
              <span className="font-mono text-lg text-neon">{formatAmount(fb.totalPayable, fb.currency)}</span>
            </div>
          )}
          {comparison && <ComparisonCard c={comparison} />}
        </>
      ),
    });
  }

  const usage = usageModel(a);
  if (usage) {
    out.push({
      id: "whatif",
      label: "What if…",
      body: (
        <>
          <H>What if I used less?</H>
          <UsageSimulator model={usage} format={formatAmount} />
        </>
      ),
    });
  }

  const lt = a.loanTerms;
  if (lt) {
    const rows: Array<[string, string]> = [];
    if (lt.principal !== undefined) rows.push(["Loan amount", formatAmount(lt.principal, lt.currency)]);
    if (lt.annualInterestRatePercent !== undefined) rows.push(["Interest rate", `${lt.annualInterestRatePercent}% a year`]);
    if (lt.tenureMonths !== undefined) rows.push(["Tenure", `${lt.tenureMonths} months`]);
    if (lt.emi !== undefined) rows.push(["Monthly instalment (EMI)", formatAmount(lt.emi, lt.currency)]);
    if (lt.processingFee !== undefined) rows.push(["Processing fee", formatAmount(lt.processingFee, lt.currency)]);
    const cost = derived?.loanCost;
    out.push({
      id: "loan",
      label: "The real cost",
      body: (
        <>
          <H>The real cost</H>
          {cost && (
            <div className="ring-blend mb-6 rounded-2xl bg-white/[0.04] p-5">
              <p className="text-sm text-white/55">You would repay in total</p>
              <p className="font-heading text-4xl italic text-blend">
                <Amount n={cost.totalRepayment} currency={cost.currency} />
              </p>
              {cost.totalInterest !== undefined && (
                <p className="mt-1 text-white/70">of which {formatAmount(cost.totalInterest, cost.currency)} is interest and charges.</p>
              )}
              <p className="mt-2 text-xs text-white/45">Calculated from the EMI × tenure stated in the document, not estimated by AI.</p>
            </div>
          )}
          <dl className="grid gap-4 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-white/50">{k}</dt>
                <dd className="text-lg">{v}</dd>
              </div>
            ))}
          </dl>
          {lt.prepaymentTerms && <p className="mt-5 text-white/70"><span className="text-white/45">Prepayment: </span>{lt.prepaymentTerms}</p>}
          {lt.latePaymentTerms && <p className="mt-2 text-white/70"><span className="text-white/45">Late payment: </span>{lt.latePaymentTerms}</p>}
        </>
      ),
    });
  }

  if (a.labResults.length > 0) {
    out.push({
      id: "lab",
      label: "Your results",
      body: (
        <>
          <H>Your results</H>
          <ul className="divide-y divide-white/10">
            {a.labResults.map((r, i) => {
              const status = derived?.labRanges?.[i];
              return (
                <li key={r.test + i} className="-mx-3 rounded-xl px-3 py-3 transition-colors duration-300 hover:bg-white/[0.04]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-lg">{r.test}</span>
                    <span className="font-mono">
                      {r.value}
                      {r.unit ? ` ${r.unit}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/55">
                    {r.referenceRange && <span>Range {r.referenceRange}</span>}
                    {status && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${status === "within" ? "bg-white/10 text-white/70" : "bg-neon/15 text-neon"}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    )}
                    {!status && r.flagInDocument && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">Marked “{r.flagInDocument}” in report</span>}
                  </div>
                  {r.explanation && <p className="mt-1 text-sm text-white/55">{r.explanation}</p>}
                </li>
              );
            })}
          </ul>
          <p className="mt-5 text-xs text-white/45">
            Range checks are calculated from the values and ranges printed on the report. This explains the numbers; it isn&apos;t a
            diagnosis. Talk to your doctor about anything outside its range.
          </p>
        </>
      ),
    });
  }

  if (a.eligibilityCriteria.length > 0 || a.requiredDocuments.length > 0) {
    out.push({
      id: "eligibility",
      label: "Who it's for",
      body: (
        <>
          <H>Who it&apos;s for</H>
          <ul className="space-y-3">
            {a.eligibilityCriteria.map((c) => (
              <li key={c.criterion} className="flex gap-3">
                <span aria-hidden="true" className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-white/30" />
                <div>
                  <p>{c.criterion}</p>
                  {c.detail && <p className="text-sm text-white/55">{c.detail}</p>}
                  <Excerpt text={c.sourceExcerpt} />
                </div>
              </li>
            ))}
          </ul>
          {a.requiredDocuments.length > 0 && (
            <>
              <p className="mt-6 text-sm text-white/50">Documents to keep ready</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {a.requiredDocuments.map((d) => (
                  <li key={d} className="rounded-full bg-white/[0.06] px-3 py-1 text-sm">
                    {d}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-5 text-xs text-white/45">Decoded lists the rules; it doesn&apos;t decide whether you qualify. Check each one yourself.</p>
        </>
      ),
    });
  }

  if (a.syllabusUnits.length > 0) {
    out.push({
      id: "syllabus",
      label: "What to study",
      body: (
        <>
          <H>What to study</H>
          <ol className="space-y-4">
            {a.syllabusUnits.map((u, i) => (
              <li key={u.name + i}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-heading text-2xl italic">{u.name}</span>
                  {u.weightage && <span className="shrink-0 font-mono text-sm text-electric-soft">{u.weightage}</span>}
                </div>
                {u.topics.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {u.topics.map((t) => (
                      <li key={t} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-sm text-white/75">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      ),
    });
  }

  if (a.importantDates.length > 0) {
    out.push({
      id: "dates",
      label: "Important dates",
      body: (
        <>
          <H icon={<CalendarDays size={14} aria-hidden="true" />}>Important dates</H>
          <ol className="relative space-y-5 border-l border-white/15 pl-6">
            {a.importantDates.map((d) => (
              <li key={d.label + d.date} className="relative">
                <span aria-hidden="true" className="absolute -left-[1.85rem] top-2 h-2.5 w-2.5 rounded-full" style={{ background: "var(--blend)" }} />
                <p className="font-heading text-3xl italic">{d.date}</p>
                <p className="text-white/70">{d.label}</p>
                {d.note && <p className="text-sm text-white/50">{d.note}</p>}
              </li>
            ))}
          </ol>
          <CalendarButton analysis={a} />
        </>
      ),
    });
  }

  if (a.importantClauses.length > 0 || a.warnings.length > 0) {
    const title = a.importantClauses.length > 0 ? "Important conditions" : "Worth noticing";
    out.push({
      id: "conditions",
      label: title,
      body: (
        <>
          <H>{title}</H>
          <ul className="space-y-5">
            {a.importantClauses.map((c) => (
              <li key={c.title}>
                <p className="text-lg">
                  {c.title} <span className="ml-1 font-mono text-[10px] uppercase tracking-widest text-electric-soft">{c.kind}</span>
                </p>
                <p className="mt-1 text-white/65">
                  <span className="sr-only">Plain-language explanation: </span>
                  {c.plainExplanation}
                </p>
                <Excerpt text={c.sourceExcerpt} />
              </li>
            ))}
          </ul>
          {a.warnings.length > 0 && (
            <div className={a.importantClauses.length ? "mt-6 border-t border-white/10 pt-5" : ""}>
              {a.importantClauses.length > 0 && (
                <p className="mb-3 flex items-center gap-2 text-sm text-neon">
                  <TriangleAlert size={14} aria-hidden="true" /> Worth noticing
                </p>
              )}
              <ul className="space-y-3">
                {a.warnings.map((w) => (
                  <li key={w.message}>
                    {w.message}
                    <Excerpt text={w.sourceExcerpt} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ADVICE_NOTE[a.documentType] && <p className="mt-5 text-xs text-white/45">{ADVICE_NOTE[a.documentType]}</p>}
        </>
      ),
    });
  }

  if (a.recommendedActions.length > 0) {
    out.push({
      id: "actions",
      label: "What you can do",
      body: (
        <>
          <H icon={<ListChecks size={14} aria-hidden="true" />}>What you can do</H>
          <ol className="space-y-3">
            {a.recommendedActions.map((x, i) => (
              <li key={x} className="flex gap-4">
                <span className="font-mono text-sm text-white/40">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-lg">{x}</span>
              </li>
            ))}
          </ol>
        </>
      ),
    });
  }

  if (a.missingInformation.length > 0 || a.confidenceNotes.length > 0) {
    out.push({
      id: "limits",
      label: "Limitations",
      body: (
        <>
          <H icon={<HelpCircle size={14} aria-hidden="true" />}>Limitations</H>
          <ul className="list-disc space-y-2 pl-5 text-white/65">
            {[...a.missingInformation, ...a.confidenceNotes].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <button type="button" onClick={onReset} className="mt-7 flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-black">
            <Check size={15} aria-hidden="true" /> Decode another document
          </button>
        </>
      ),
    });
  }

  return out;
}

// Opaque so the card waiting behind never shows through as ghost text.
const glassClass = "liquid-glass-strong bg-[#08080c] w-[min(92vw,46rem)] rounded-[2rem]";
const cardClass = `${glassClass} p-6 sm:p-10`;

function FlyCard({ i, pos, label, children }: { i: number; pos: MotionValue<number>; label: string; children: ReactNode }) {
  const d = useTransform(pos, (p) => i - p);
  const z = useTransform(d, (v) => (v >= 0 ? -v * 560 : -v * 900));
  const y = useTransform(d, (v) => (v >= 0 ? v * 30 : v * 140));
  const rotateY = useTransform(d, (v) => v * (i % 2 ? -10 : 10));
  const rotateX = useTransform(d, (v) => (v < 0 ? -v * 18 : v * 4));
  // Cards further back fade out instead of blurring (a blur filter kept text soft mid-scroll).
  const opacity = useTransform(d, (v) => (v >= 0 ? Math.max(0, 1 - v * 0.8) : Math.max(0, 1 + v * 2.4)));
  const pointerEvents = useTransform(d, (v) => (Math.abs(v) < 0.5 ? "auto" : "none"));
  const zIndex = useTransform(d, (v) => Math.round(100 - Math.abs(v) * 10));
  return (
    <motion.div style={{ zIndex, pointerEvents }} className="absolute inset-0 flex items-center justify-center px-3 [perspective:1400px]">
      {/* No will-change here: it makes Chrome keep text rasterised at an in-between scale (blurry at rest). */}
      <motion.section aria-label={label} style={{ z, y, rotateY, rotateX, opacity }}>
        {/* float in from the document when the results first arrive */}
        <motion.div
          initial={{ opacity: 0, scale: 0.6, y: 80, rotateX: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1.1, delay: 0.15 + i * 0.09, ease: [0.22, 1, 0.36, 1] }}
          className={glassClass}
        >
          {/* Long content scrolls inside, so the card's frame and glowing edge stay put. */}
          <div className="scroll-thin max-h-[74svh] overflow-y-auto overscroll-contain p-6 sm:p-10" data-lenis-prevent>
            {children}
          </div>
        </motion.div>
      </motion.section>
    </motion.div>
  );
}

export function ResultsView({ result, onReset }: { result: AnalysisResponse; onReset: () => void }) {
  const reduce = useReducedMotion();
  const chapters = buildChapters(result, onReset);
  const n = chapters.length;
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Each card gets a resting zone (the middle 50% of its scroll span) where it sits perfectly flat and
  // sharp; the fly-through to the next card happens in between.
  const pos = useTransform(scrollYProgress, (v) => {
    const r = Math.min(n - 1, Math.max(0, v * (n - 1)));
    const k = Math.floor(r);
    const f = Math.min(1, Math.max(0, (r - k - 0.25) / 0.5));
    return k + f * f * (3 - 2 * f);
  });
  const [active, setActive] = useState(0);
  useMotionValueEvent(pos, "change", (v) => setActive(Math.round(v)));

  if (reduce || n === 1) {
    return (
      <article ref={ref} aria-labelledby="result-title" className="space-y-4">
        {chapters.map((c) => (
          <section key={c.id} aria-label={c.label} className={`${cardClass} mx-auto`}>
            {c.body}
          </section>
        ))}
      </article>
    );
  }

  const jump = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    scrollToY(top + (el.offsetHeight - window.innerHeight) * (i / (n - 1)));
  };

  return (
    <article ref={ref} aria-labelledby="result-title" className="relative" style={{ height: `${n * 90 + 10}svh` }}>
      <div className="sticky top-0 h-svh overflow-hidden">
        {chapters.map((c, i) => (
          <FlyCard key={c.id} i={i} pos={pos} label={c.label}>
            {c.body}
          </FlyCard>
        ))}

        <nav aria-label="Result chapters" className="absolute left-6 top-1/2 z-[200] hidden -translate-y-1/2 xl:block">
          <ol className="space-y-2">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => jump(i)}
                  aria-current={i === active ? "step" : undefined}
                  className={`group flex items-center gap-3 text-left text-sm transition-all duration-300 ${i === active ? "text-white" : "text-white/35 hover:translate-x-1 hover:text-white/80"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-px transition-all duration-500 ${i === active ? "w-8" : "w-3 bg-white/30 group-hover:w-6 group-hover:bg-white/70"}`}
                    style={i === active ? { background: "var(--blend)" } : undefined}
                  />
                  {c.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div aria-hidden="true" className="absolute bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-white/45">
          {active < n - 1 ? (
            <>
              <ArrowDown size={13} className="animate-bounce" /> Scroll · {active + 1} / {n}
            </>
          ) : (
            <>End · {n} / {n}</>
          )}
        </div>
      </div>
    </article>
  );
}
