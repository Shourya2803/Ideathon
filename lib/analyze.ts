import { LIMITS } from "./config";
import { analyzeWithAi, type AiClient } from "./ai/gemini";
import { deriveAll } from "./calc";
import { assertPdfSignature } from "./pdf/validate";
import { extractPdfText, type PdfJsLike } from "./pdf/extract";
import { sanitizeText } from "./privacy/sanitize";
import type { AnalysisResponse } from "@/types/analysis";

export type Stage = "validating" | "extracting" | "protecting" | "analyzing" | "preparing";

export interface PipelineDeps {
  /** Created lazily so a missing API key is reported only after the document passed validation. */
  getClient: () => AiClient;
  onStage?: (stage: Stage) => void;
  pdfLoader?: () => Promise<PdfJsLike>;
}

/**
 * Bytes in, validated analysis out. Raw extracted text never leaves this function:
 * only the sanitized text reaches the AI client.
 */
export async function runAnalysis(bytes: Uint8Array, deps: PipelineDeps): Promise<AnalysisResponse> {
  const stage = deps.onStage ?? (() => undefined);

  stage("validating");
  assertPdfSignature(bytes);

  stage("extracting");
  const { text, pages } = await extractPdfText(bytes, deps.pdfLoader);

  stage("protecting");
  const truncated = text.length > LIMITS.maxTextChars;
  const sanitized = sanitizeText(truncated ? text.slice(0, LIMITS.maxTextChars) : text);

  stage("analyzing");
  const client = deps.getClient();
  const analysis = await analyzeWithAi(client, sanitized.text, truncated);

  stage("preparing");
  // Facts whose value is only a privacy placeholder (e.g. "[PERSON_1]") tell the reader nothing.
  const placeholderOnly = /^(\s*\[[A-Z_]+_\d+\]\s*[,;/]?)+$/;
  analysis.keyFacts = analysis.keyFacts.filter((f) => !placeholderOnly.test(f.value));
  const derived = deriveAll(analysis);
  return {
    analysis,
    comparison: derived.comparison,
    derived,
    meta: { source: "gemini", pages, redactions: sanitized.total, truncated },
  };
}
