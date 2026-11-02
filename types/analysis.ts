import { z } from "zod";

/** Model output often uses null for "unknown"; treat null as absent. */
const text = z.string().trim().min(1).max(2000);
const optText = z
  .string()
  .max(2000)
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));
const optNum = z
  .number()
  .finite()
  .nullish()
  .transform((v) => v ?? undefined);

export const DOCUMENT_TYPES = [
  "electricity_bill",
  "lab_report",
  "loan_agreement",
  "government_scheme",
  "insurance_policy",
  "exam_syllabus",
  "invoice",
  "contract",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const list = <T extends z.ZodType>(item: T, max = 30) =>
  z
    .array(item)
    .max(max)
    .nullish()
    .transform((v) => v ?? []);

const keyFact = z.object({
  label: text,
  value: text,
  explanation: optText,
  sourceExcerpt: optText,
});

const importantDate = z.object({
  label: text,
  date: text,
  note: optText,
});

const lineItem = z.object({
  label: text,
  amount: z.number().finite(),
  explanation: optText,
});

const clause = z.object({
  title: text,
  plainExplanation: text,
  sourceExcerpt: optText,
  kind: z
    .enum(["obligation", "exclusion", "termination", "penalty", "condition", "payment", "renewal", "other"])
    .nullish()
    .catch("other")
    .transform((v) => v ?? "other"),
});

const financialBreakdown = z.object({
  currency: optText,
  items: list(lineItem),
  totalPayable: optNum,
  /** Previous comparable amount, if the document states one. */
  previousAmount: optNum,
  previousLabel: optText,
  consumption: z
    .object({ value: z.number().finite(), unit: text })
    .nullish()
    .transform((v) => v ?? undefined),
});

/** Lab report row. `flag` is only what the document states; we compute our own range check locally. */
const labResult = z.object({
  test: text,
  value: text,
  unit: optText,
  referenceRange: optText,
  flagInDocument: optText,
  explanation: optText,
});

const loanTerms = z.object({
  currency: optText,
  principal: optNum,
  annualInterestRatePercent: optNum,
  tenureMonths: optNum,
  emi: optNum,
  processingFee: optNum,
  prepaymentTerms: optText,
  latePaymentTerms: optText,
});

const eligibility = z.object({
  criterion: text,
  detail: optText,
  sourceExcerpt: optText,
});

const syllabusUnit = z.object({
  name: text,
  topics: list(text, 40),
  weightage: optText,
});

export const analysisSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES).catch("other"),
  documentTitle: z.string().trim().min(1).max(200).catch("Untitled document"),
  summary: text,
  keyFacts: list(keyFact),
  importantDates: list(importantDate),
  financialBreakdown: financialBreakdown.nullish().transform((v) => v ?? undefined),
  importantClauses: list(clause),
  warnings: list(z.object({ message: text, sourceExcerpt: optText })),
  recommendedActions: list(text, 15),
  missingInformation: list(text, 15),
  confidenceNotes: list(text, 15),
  labResults: list(labResult, 60),
  loanTerms: loanTerms.nullish().transform((v) => v ?? undefined),
  eligibilityCriteria: list(eligibility),
  requiredDocuments: list(text, 30),
  syllabusUnits: list(syllabusUnit, 40),
});

export type Analysis = z.infer<typeof analysisSchema>;
export type LabResult = Analysis["labResults"][number];

export interface Comparison {
  current: number;
  previous: number;
  difference: number;
  percentChange: number;
  currency?: string;
}

export interface LoanCost {
  totalRepayment: number;
  totalInterest?: number;
  currency?: string;
}

export type RangeStatus = "below" | "within" | "above";

export interface Derived {
  comparison?: Comparison;
  loanCost?: LoanCost;
  /** Keyed by lab result index; only present where value and range were both numeric. */
  labRanges?: Record<number, RangeStatus>;
}

export interface AnalysisMeta {
  /** "sample" results are pre-written demo data and never came from the AI. */
  source: "gemini" | "sample";
  pages: number;
  /** PII items replaced before the AI call, by count only. */
  redactions: number;
  /** True when the text was shortened to fit limits. Must be shown to the user. */
  truncated: boolean;
}

export interface AnalysisResponse {
  analysis: Analysis;
  comparison?: Comparison;
  derived?: Derived;
  meta: AnalysisMeta;
}
