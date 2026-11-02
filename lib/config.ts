/**
 * The Gemini model Decoded uses. It is set here, in code, on purpose: no environment variable is
 * needed for it, so a deployment can't be broken by a missing or mistyped value. Only
 * GEMINI_API_KEY comes from the environment. To switch models, change this one line.
 * Any id from https://ai.google.dev/gemini-api/docs/models that your key can call works.
 */
export const AI_MODEL = "gemini-2.5-flash";

/** Central product limits. Adjust here; both client and server read these. */
export const LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxPages: 3,
  /** Text beyond this is not sent to the AI, and the user is told so. */
  maxTextChars: 40_000,
  /** Fewer characters per page than this is treated as a scanned/image-only PDF. */
  minCharsPerPage: 40,
  geminiTimeoutMs: 45_000,
  rateLimit: { windowMs: 60_000, maxRequests: 6 },
} as const;

export const LIMIT_LABELS = {
  size: `${LIMITS.maxFileBytes / 1024 / 1024} MB`,
  pages: `${LIMITS.maxPages} pages`,
} as const;
