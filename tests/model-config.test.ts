import { describe, expect, it, vi } from "vitest";
import { createGeminiClient, mapProviderError } from "@/lib/ai/gemini";
import { AI_MODEL } from "@/lib/config";
import { AppError, ERROR_INFO, toErrorPayload } from "@/lib/errors";

describe("the AI model is set in code, not in the environment", () => {
  it("uses a valid, lowercase Gemini model id", () => {
    expect(AI_MODEL).toMatch(/^gemini-[a-z0-9.-]+$/);
  });
  it("needs only an API key to create a client (no model variable)", () => {
    expect(() => createGeminiClient({ GEMINI_API_KEY: "k" })).not.toThrow();
  });
  it("ignores any GEMINI_MODEL left in an environment, so a wrong value cannot break it", () => {
    expect(() => createGeminiClient({ GEMINI_API_KEY: "k", GEMINI_MODEL: "totally wrong ~~" })).not.toThrow();
  });
  it("still requires the API key", () => {
    expect(() => createGeminiClient({})).toThrow(expect.objectContaining({ code: "API_KEY_MISSING" }));
    expect(() => createGeminiClient({ GEMINI_API_KEY: "   " })).toThrow(expect.objectContaining({ code: "API_KEY_MISSING" }));
  });
});

describe("when Gemini rejects the model", () => {
  it("maps a 404 to MODEL_UNAVAILABLE and points at the code, not at an env var", () => {
    expect(mapProviderError(Object.assign(new Error("not found"), { status: 404 })).code).toBe("MODEL_UNAVAILABLE");
    expect(ERROR_INFO.MODEL_UNAVAILABLE.message).toMatch(/lib\/config\.ts/);
    expect(ERROR_INFO.MODEL_UNAVAILABLE.message).not.toMatch(/GEMINI_MODEL/);
  });
  it("can carry the model name to the user as non-sensitive detail", () => {
    const err = new AppError("MODEL_UNAVAILABLE", AI_MODEL);
    expect(toErrorPayload(err.code, err.detail)).toMatchObject({ code: "MODEL_UNAVAILABLE", detail: AI_MODEL });
    expect(toErrorPayload("RATE_LIMITED")).not.toHaveProperty("detail");
  });
  it("logs which model was rejected", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mapProviderError(Object.assign(new Error("not found"), { status: 404 }));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("404"));
    spy.mockRestore();
  });
});

import { choosePreferredModel } from "@/lib/ai/gemini";

describe("falling back when the key cannot use the configured model", () => {
  it("prefers known-good text models", () => {
    expect(choosePreferredModel(["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"])).toBe("gemini-2.5-flash");
    expect(choosePreferredModel(["gemini-2.5-flash-lite", "gemini-flash-latest"], "gemini-2.5-flash")).toBe("gemini-flash-latest");
  });
  it("never picks the one that just failed, nor speech/image/embedding models", () => {
    expect(choosePreferredModel(["gemini-2.5-flash", "gemini-2.5-flash-lite"], "gemini-2.5-flash")).toBe("gemini-2.5-flash-lite");
    expect(choosePreferredModel(["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-image", "text-embedding-004"])).toBeUndefined();
  });
  it("falls back to any text flash model it doesn't know by name", () => {
    expect(choosePreferredModel(["gemini-9-flash", "gemini-9-pro"])).toBe("gemini-9-flash");
    expect(choosePreferredModel([])).toBeUndefined();
  });
});

describe("when the main model is overloaded", () => {
  it("prefers the lighter models, skipping everything already tried", () => {
    const all = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-pro"];
    const order = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest"];
    expect(choosePreferredModel(all, ["gemini-2.5-flash"], order)).toBe("gemini-2.5-flash-lite");
    expect(choosePreferredModel(all, ["gemini-2.5-flash", "gemini-2.5-flash-lite"], order)).toBe("gemini-flash-latest");
  });
});
