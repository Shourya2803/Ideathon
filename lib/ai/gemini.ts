import { ApiError, GoogleGenAI } from "@google/genai";
import { AI_MODEL, LIMITS } from "../config";
import { AppError } from "../errors";
import { analysisSchema, type Analysis } from "@/types/analysis";
import { SYSTEM_INSTRUCTION, buildUserContent } from "./prompt";

/** The only thing the pipeline needs from an AI provider; mocked in tests. */
export interface AiClient {
  generate(args: { system: string; content: string; signal: AbortSignal }): Promise<string>;
}

/** Good general-purpose text models, best first. Used only when AI_MODEL isn't available to the key. */
const FALLBACK_ORDER = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
];
/** Specialised models that can't do this job (speech, images, embeddings, live audio...). */
const NOT_FOR_TEXT = /tts|image|embed|live|audio|omni|robotics|veo|imagen|aqa/i;

/** Picks a usable model from the ones a key can call: known-good first, otherwise any text flash model. */
export function choosePreferredModel(available: string[], not?: string): string | undefined {
  const usable = available.filter((m) => !NOT_FOR_TEXT.test(m) && m !== not);
  for (const m of FALLBACK_ORDER) if (usable.includes(m)) return m;
  return usable.find((m) => /flash/.test(m)) ?? usable.find((m) => /^gemini-/.test(m));
}

/** Asks Gemini which models this API key can call for text generation. Never throws. */
async function listCallableModels(apiKey: string): Promise<string[] | undefined> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    return (json.models ?? [])
      .filter((m) => m.name && (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => m.name!.replace(/^models\//, ""));
  } catch {
    return undefined;
  }
}

/** Model the key turned out to support, remembered for the life of this server instance. */
let workingModel: string | undefined;

/**
 * Only the API key comes from the environment; the model is the AI_MODEL constant in lib/config.ts.
 * If Gemini says that model isn't available to this particular key (keys differ by project and
 * region), the client asks which models the key can use, switches to one, and carries on.
 */
export function createGeminiClient(env: Record<string, string | undefined> = process.env, model: string = AI_MODEL): AiClient {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AppError("API_KEY_MISSING");
  const ai = new GoogleGenAI({ apiKey });

  const call = (m: string, system: string, content: string, signal: AbortSignal) =>
    ai.models.generateContent({
      model: m,
      contents: content,
      config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.2, abortSignal: signal },
    });
  const statusOf = (err: unknown) => (err instanceof ApiError ? err.status : (err as { status?: number })?.status);

  return {
    async generate({ system, content, signal }) {
      let current = workingModel ?? model;
      let switched = false;
      let seen: string[] | undefined;
      for (;;) {
        try {
          const res = await call(current, system, content, signal);
          return res.text ?? "";
        } catch (err) {
          const status = statusOf(err);
          if (status === 404) {
            console.error(`[decoded] Gemini does not know a model called "${current}" for this API key`);
            if (!switched) {
              switched = true;
              seen = await listCallableModels(apiKey);
              const alt = seen ? choosePreferredModel(seen, current) : undefined;
              if (alt) {
                console.error(`[decoded] switching to "${alt}", which this key can use`);
                workingModel = alt;
                current = alt;
                continue;
              }
            }
          }
          const mapped = mapProviderError(err, signal);
          // Model names are configuration, not secrets: show what was tried and what the key can use.
          if (mapped.code === "MODEL_UNAVAILABLE") {
            const can = seen === undefined ? "could not be checked" : seen.length ? seen.slice(0, 6).join(", ") : "none";
            mapped.detail = `${current} (models this key can call: ${can})`;
          }
          throw mapped;
        }
      }
    },
  };
}

export function mapProviderError(err: unknown, signal?: AbortSignal): AppError {
  if (err instanceof AppError) return err;
  if (signal?.aborted || (err as { name?: string })?.name === "AbortError") return new AppError("AI_TIMEOUT");
  const status = err instanceof ApiError ? err.status : (err as { status?: number })?.status;
  // Status code only: provider messages can echo request details.
  if (status) console.error(`[decoded] AI provider returned HTTP ${status}`);
  if (status === 429) return new AppError("RATE_LIMITED");
  // Gemini answers 400 INVALID_ARGUMENT for a bad key; say so instead of a vague failure.
  if (status === 400 && /api key/i.test(String((err as { message?: string })?.message ?? ""))) return new AppError("API_KEY_INVALID");
  if (status === 503) return new AppError("AI_BUSY");
  if (status === 404) return new AppError("MODEL_UNAVAILABLE");
  if (status === 401 || status === 403) return new AppError("API_KEY_MISSING");
  if (status === 408 || status === 504) return new AppError("AI_TIMEOUT");
  return new AppError("AI_UNAVAILABLE");
}

/** Strip an optional ```json fence, parse, and validate. Never trust the model output. */
export function parseAnalysis(raw: string): Analysis {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new AppError("INVALID_AI_RESPONSE");
  }
  const parsed = analysisSchema.safeParse(json);
  if (!parsed.success) throw new AppError("INVALID_AI_RESPONSE");
  return parsed.data;
}

export async function analyzeWithAi(client: AiClient, sanitizedText: string, truncated: boolean): Promise<Analysis> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.geminiTimeoutMs);
  try {
    const raw = await client.generate({
      system: SYSTEM_INSTRUCTION,
      content: buildUserContent(sanitizedText, truncated),
      signal: controller.signal,
    });
    return parseAnalysis(raw);
  } catch (err) {
    throw mapProviderError(err, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
