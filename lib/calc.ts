import type { Analysis, Comparison, Derived, LoanCost, RangeStatus } from "@/types/analysis";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Deterministic comparison. Only produced when both amounts exist and a % change is meaningful. */
export function compareAmounts(current?: number, previous?: number, currency?: string): Comparison | undefined {
  if (current === undefined || previous === undefined) return undefined;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0 || current < 0) return undefined;
  const difference = round2(current - previous);
  return { current, previous, difference, percentChange: round2((difference / previous) * 100), currency };
}

export function deriveComparison(analysis: Analysis): Comparison | undefined {
  const fb = analysis.financialBreakdown;
  if (!fb) return undefined;
  return compareAmounts(fb.totalPayable, fb.previousAmount, fb.currency);
}

/** EMI × months, and interest when the principal is stated. Never estimated from the rate alone. */
export function loanCost(analysis: Analysis): LoanCost | undefined {
  const t = analysis.loanTerms;
  if (!t || t.emi === undefined || t.tenureMonths === undefined) return undefined;
  if (t.emi <= 0 || t.tenureMonths <= 0 || !Number.isInteger(t.tenureMonths)) return undefined;
  const totalRepayment = round2(t.emi * t.tenureMonths);
  const totalInterest =
    t.principal !== undefined && t.principal > 0 && totalRepayment >= t.principal ? round2(totalRepayment - t.principal) : undefined;
  return { totalRepayment, totalInterest, currency: t.currency };
}

const NUM = String.raw`-?\d+(?:\.\d+)?`;

/**
 * Compare a lab value with its stated reference range. Handles "a - b", "a–b", "< b", "> a".
 * Returns undefined whenever either side isn't plainly numeric, rather than guessing.
 */
export function checkRange(value: string, range?: string): RangeStatus | undefined {
  if (!range) return undefined;
  const v = value.replace(/,/g, "").trim();
  if (!new RegExp(`^${NUM}$`).test(v)) return undefined;
  const x = Number(v);
  const r = range.replace(/,/g, "").trim();
  let m = r.match(new RegExp(`^(${NUM})\\s*(?:-|–|—|to)\\s*(${NUM})`));
  if (m) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (lo > hi) return undefined;
    return x < lo ? "below" : x > hi ? "above" : "within";
  }
  m = r.match(new RegExp(`^(<|≤|<=|up to)\\s*(${NUM})`, "i"));
  if (m) return x > Number(m[2]) ? "above" : "within";
  m = r.match(new RegExp(`^(>|≥|>=)\\s*(${NUM})`));
  if (m) return x < Number(m[2]) ? "below" : "within";
  return undefined;
}

export function deriveAll(analysis: Analysis): Derived {
  const labRanges: Record<number, RangeStatus> = {};
  analysis.labResults.forEach((r, i) => {
    const s = checkRange(r.value, r.referenceRange);
    if (s) labRanges[i] = s;
  });
  return {
    comparison: deriveComparison(analysis),
    loanCost: loanCost(analysis),
    labRanges: Object.keys(labRanges).length ? labRanges : undefined,
  };
}
