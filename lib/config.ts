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
