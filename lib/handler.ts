import { LIMITS } from "./config";
import { AppError, toErrorPayload, type ErrorCode } from "./errors";
import { createGeminiClient, type AiClient } from "./ai/gemini";
import { runAnalysis, type PipelineDeps, type Stage } from "./analyze";
import { validateFileMeta } from "./pdf/validate";
import { rateLimited } from "./rate-limit";
import type { AnalysisResponse } from "@/types/analysis";

export type StreamEvent =
  | { type: "stage"; stage: Stage }
  | { type: "result"; data: AnalysisResponse }
  | { type: "error"; error: ReturnType<typeof toErrorPayload> };

export interface HandlerDeps {
  createClient?: () => AiClient;
  pdfLoader?: PipelineDeps["pdfLoader"];
  skipRateLimit?: boolean;
}

const jsonError = (code: ErrorCode) =>
  Response.json({ error: toErrorPayload(code) }, { status: new AppError(code).status, headers: { "Cache-Control": "no-store" } });

/** Request-level checks return a normal JSON error with a proper status; analysis progress is streamed as NDJSON. */
export async function handleAnalyze(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!deps.skipRateLimit && rateLimited(ip)) return jsonError("RATE_LIMITED");

  const declared = Number(req.headers.get("content-length") ?? 0);
  // Multipart overhead is small; anything far above the limit is rejected before reading the body.
  if (declared > LIMITS.maxFileBytes + 64 * 1024) return jsonError("FILE_TOO_LARGE");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) return jsonError("NO_FILE");

  let file: File;
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (!(entry instanceof File)) return jsonError("NO_FILE");
    file = entry;
    validateFileMeta(file);
  } catch (err) {
    return jsonError(err instanceof AppError ? err.code : "NO_FILE");
  }

  let client: AiClient;
  try {
    client = (deps.createClient ?? createGeminiClient)();
  } catch (err) {
    return jsonError(err instanceof AppError ? err.code : "UNEXPECTED");
  }

  let bytes: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const data = await runAnalysis(bytes!, {
          getClient: () => client,
          pdfLoader: deps.pdfLoader,
          onStage: (stage) => send({ type: "stage", stage }),
        });
        send({ type: "result", data });
      } catch (err) {
        const code: ErrorCode = err instanceof AppError ? err.code : "UNEXPECTED";
        const detail = err instanceof AppError ? err.detail : undefined;
        // Log the code only: never document text, prompts or provider messages.
        console.error(`[decoded] analysis failed: ${code}`);
        send({ type: "error", error: toErrorPayload(code, detail) });
      } finally {
        bytes = null; // release the buffer; nothing is persisted
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
