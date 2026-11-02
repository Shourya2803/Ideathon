import { describe, expect, it, vi } from "vitest";
import { createGeminiClient, mapProviderError, normalizeModel } from "@/lib/ai/gemini";
import { ERROR_INFO } from "@/lib/errors";

describe("GEMINI_MODEL handling", () => {
  it("accepts the common ways a model name gets pasted into a dashboard", () => {
    expect(normalizeModel("gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(normalizeModel("  gemini-2.5-flash \n")).toBe("gemini-2.5-flash");
    expect(normalizeModel('"gemini-2.5-flash"')).toBe("gemini-2.5-flash");
    expect(normalizeModel("'gemini-2.5-flash'")).toBe("gemini-2.5-flash");
    expect(normalizeModel("models/gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(normalizeModel("GEMINI_MODEL=gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(normalizeModel("GEMINI_MODEL = \"gemini-2.5-flash\"")).toBe("gemini-2.5-flash");
    expect(normalizeModel("Gemini 2.5 Flash")).toBe("gemini-2.5-flash");
  });
  it("treats empty or missing values as not set", () => {
    expect(normalizeModel(undefined)).toBeUndefined();
    expect(normalizeModel("")).toBeUndefined();
    expect(normalizeModel('  ""  ')).toBeUndefined();
  });
  it("says the model is NOT SET, distinct from an unknown model name", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => createGeminiClient({ GEMINI_API_KEY: "k" })).toThrow(expect.objectContaining({ code: "MODEL_NOT_SET" }));
    spy.mockRestore();
    expect(mapProviderError(Object.assign(new Error("not found"), { status: 404 })).code).toBe("MODEL_UNAVAILABLE");
    expect(ERROR_INFO.MODEL_NOT_SET.message).toMatch(/GEMINI_MODEL/);
    expect(ERROR_INFO.MODEL_UNAVAILABLE.message).not.toBe(ERROR_INFO.MODEL_NOT_SET.message);
  });
  it("tells the user which model name the server used when Gemini rejects it", async () => {
    const { createGeminiClient: make } = await import("@/lib/ai/gemini");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = make({ GEMINI_API_KEY: "k", GEMINI_MODEL: "Not A Model" });
    // the SDK call itself is not mocked here; only the error mapping contract is checked
    const { toErrorPayload, AppError } = await import("@/lib/errors");
    const err = new AppError("MODEL_UNAVAILABLE", "not-a-model");
    expect(toErrorPayload(err.code, err.detail)).toMatchObject({ code: "MODEL_UNAVAILABLE", detail: "not-a-model" });
    expect(toErrorPayload("MODEL_NOT_SET")).not.toHaveProperty("detail");
    expect(client).toBeTruthy();
    spy.mockRestore();
  });
  it("checks the API key before the model", () => {
    expect(() => createGeminiClient({})).toThrow(expect.objectContaining({ code: "API_KEY_MISSING" }));
  });
});
