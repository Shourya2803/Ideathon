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
  it("checks the API key before the model", () => {
    expect(() => createGeminiClient({})).toThrow(expect.objectContaining({ code: "API_KEY_MISSING" }));
  });
});
