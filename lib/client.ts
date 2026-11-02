import { toErrorPayload, type ErrorPayload } from "./errors";
import type { Stage } from "./analyze";
import { analysisSchema, type AnalysisResponse } from "@/types/analysis";
import type { StreamEvent } from "./handler";

export class ClientError extends Error {
  constructor(public readonly payload: ErrorPayload) {
    super(payload.code);
  }
}

/** Upload the PDF and follow the server's real stage events. No fake progress. */
export async function analyzeFile(
  file: File,
  onStage: (s: Stage) => void,
  signal: AbortSignal,
): Promise<AnalysisResponse> {
  const body = new FormData();
  body.set("file", file);

  let res: Response;
  try {
    res = await fetch("/api/analyze", { method: "POST", body, signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new ClientError(toErrorPayload("CANCELLED"));
    throw new ClientError(toErrorPayload("NETWORK"));
  }

  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as { error?: ErrorPayload } | null;
    throw new ClientError(json?.error ?? toErrorPayload("UNEXPECTED"));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AnalysisResponse | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === "stage") onStage(event.stage);
    else if (event.type === "result") result = event.data;
    else throw new ClientError(event.error);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(buffer);
  } catch (err) {
    if (err instanceof ClientError) throw err;
    if ((err as Error).name === "AbortError") throw new ClientError(toErrorPayload("CANCELLED"));
    throw new ClientError(toErrorPayload("NETWORK"));
  }
  if (!result) throw new ClientError(toErrorPayload("UNEXPECTED"));
  // Re-validate on the client too, so a partial or older response can never crash the results view.
  const final = result as AnalysisResponse;
  const parsed = analysisSchema.safeParse(final.analysis);
  if (!parsed.success) throw new ClientError(toErrorPayload("INVALID_AI_RESPONSE"));
  return { ...final, analysis: parsed.data };
}
