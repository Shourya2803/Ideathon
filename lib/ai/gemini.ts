import { ApiError, GoogleGenAI } from "@google/genai";
import { AI_MODEL, LIMITS } from "../config";
import { AppError } from "../errors";
import { analysisSchema, type Analysis } from "@/types/analysis";
import { SYSTEM_INSTRUCTION, buildUserContent } from "./prompt";

/** The only thing the pipeline needs from an AI provider; mocked in tests. */
export interface AiClient {
  generate(args: { system: string; content: string; signal: AbortSignal }): Promise<string>;
}

/** Only the API key comes from the environment; the model is the AI_MODEL constant in lib/config.ts. */
export function createGeminiClient(env: Record<string, string | undefined> = process.env, model: string = AI_MODEL): AiClient {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AppError("API_KEY_MISSING");
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generate({ system, content, signal }) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: content,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            temperature: 0.2,
            abortSignal: signal,
          },
        });
        return res.text ?? "";
      } catch (err) {
        const status = err instanceof ApiError ? err.status : (err as { status?: number })?.status;
        // A model name is configuration, not a secret: log it so a retired or unavailable model is obvious.
        if (status === 404) console.error(`[decoded] Gemini does not know a model called "${model}" (see AI_MODEL in lib/config.ts)`);
        const mapped = mapProviderError(err, signal);
        // Tell the user which model the app used; a name is configuration, not a secret.
        if (mapped.code === "MODEL_UNAVAILABLE") mapped.detail = model;
        throw mapped;
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
