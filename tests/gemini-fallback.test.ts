import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number;
    constructor(o: { message: string; status: number }) {
      super(o.message);
      this.status = o.status;
    }
  }
  class GoogleGenAI {
    models = { generateContent: (a: { model: string }) => gen(a.model) };
  }
  return { ApiError, GoogleGenAI };
});

const err = async (status: number) => {
  const { ApiError } = await import("@google/genai");
  return new ApiError({ message: "x", status });
};
const okText = { text: '{"documentType":"invoice","documentTitle":"t","summary":"s"}' };
const signal = () => new AbortController().signal;

async function client() {
  vi.resetModules(); // the working-model memory is per module instance
  const { createGeminiClient } = await import("@/lib/ai/gemini");
  return createGeminiClient({ GEMINI_API_KEY: "k" }, "main-model");
}

beforeEach(() => {
  gen.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: ["main-model", "gemini-2.5-flash-lite", "gemini-flash-latest"].map((name) => ({
          name: `models/${name}`,
          supportedGenerationMethods: ["generateContent"],
        })),
      }),
    })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Gemini overload and availability handling", () => {
  it("retries once on the same model when it is overloaded, then succeeds", async () => {
    gen.mockRejectedValueOnce(await err(503)).mockResolvedValueOnce(okText);
    const text = await (await client()).generate({ system: "s", content: "c", signal: signal() });
    expect(text).toContain("invoice");
    expect(gen.mock.calls.map((c) => c[0])).toEqual(["main-model", "main-model"]);
  });

  it("then moves to a lighter model if it stays overloaded", async () => {
    gen.mockRejectedValueOnce(await err(503)).mockRejectedValueOnce(await err(503)).mockResolvedValueOnce(okText);
    await (await client()).generate({ system: "s", content: "c", signal: signal() });
    expect(gen.mock.calls.map((c) => c[0])).toEqual(["main-model", "main-model", "gemini-2.5-flash-lite"]);
  });

  it("switches to a model the key can use when the configured one is not found, and remembers it", async () => {
    gen.mockRejectedValueOnce(await err(404)).mockResolvedValue(okText);
    const c = await client();
    await c.generate({ system: "s", content: "c", signal: signal() });
    expect(gen.mock.calls.map((x) => x[0])).toEqual(["main-model", "gemini-flash-latest"]);
    gen.mockClear();
    await c.generate({ system: "s", content: "c", signal: signal() });
    expect(gen.mock.calls.map((x) => x[0])).toEqual(["gemini-flash-latest"]); // no second 404 round trip
  });

  it("gives up with AI_BUSY after the allowed attempts, never looping", async () => {
    gen.mockImplementation(async () => {
      throw await err(503);
    });
    await expect((await client()).generate({ system: "s", content: "c", signal: signal() })).rejects.toMatchObject({ code: "AI_BUSY" });
    expect(gen.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("reports the models a key can use when none of them works", async () => {
    gen.mockImplementation(async () => {
      throw await err(404);
    });
    await expect((await client()).generate({ system: "s", content: "c", signal: signal() })).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
      detail: expect.stringContaining("models this key can call"),
    });
  });

  it("does not retry rate limits (that would only make them worse)", async () => {
    gen.mockRejectedValue(await err(429));
    await expect((await client()).generate({ system: "s", content: "c", signal: signal() })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(gen).toHaveBeenCalledTimes(1);
  });
});
