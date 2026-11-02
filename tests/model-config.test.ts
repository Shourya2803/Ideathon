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
