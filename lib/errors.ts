import { LIMIT_LABELS } from "./config";

export type ErrorCode =
  | "NO_FILE"
  | "UNSUPPORTED_TYPE"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "TOO_MANY_PAGES"
  | "INVALID_PDF"
  | "PASSWORD_PROTECTED"
  | "NO_TEXT"
  | "SCANNED_PDF"
  | "SANITIZATION_FAILED"
  | "API_KEY_MISSING"
  | "MODEL_NOT_SET"
  | "MODEL_UNAVAILABLE"
  | "API_KEY_INVALID"
  | "AI_BUSY"
  | "RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "INVALID_AI_RESPONSE"
  | "NETWORK"
  | "CANCELLED"
  | "UNEXPECTED";

interface ErrorInfo {
  status: number;
  message: string;
  retryable: boolean;
}

/** User-facing messages. Never include internals, prompts or document content. */
export const ERROR_INFO: Record<ErrorCode, ErrorInfo> = {
  NO_FILE: { status: 400, message: "Choose a PDF file to analyze.", retryable: false },
  UNSUPPORTED_TYPE: { status: 415, message: "Only PDF files are supported right now.", retryable: false },
  FILE_TOO_LARGE: { status: 413, message: `This file is too large. The limit is ${LIMIT_LABELS.size}.`, retryable: false },
  EMPTY_FILE: { status: 400, message: "This file is empty.", retryable: false },
  TOO_MANY_PAGES: { status: 422, message: `This PDF has too many pages. The limit is ${LIMIT_LABELS.pages}.`, retryable: false },
  INVALID_PDF: { status: 422, message: "This file could not be read as a valid PDF.", retryable: false },
  PASSWORD_PROTECTED: { status: 422, message: "This PDF is password-protected. Remove the password and try again.", retryable: false },
  NO_TEXT: { status: 422, message: "No readable text was found in this PDF.", retryable: false },
  SCANNED_PDF: { status: 422, message: "This looks like a scanned PDF (images of text). Scanned documents aren't supported yet. Try a PDF with selectable text.", retryable: false },
  SANITIZATION_FAILED: { status: 500, message: "This document could not be safely processed, so nothing was sent to the AI. You can try again or use the sample document.", retryable: true },
  API_KEY_MISSING: { status: 503, message: "AI analysis isn't configured on this server (missing API key). You can explore the sample document instead.", retryable: false },
  MODEL_NOT_SET: { status: 503, message: "No AI model is configured on the server. Add GEMINI_MODEL to the server's environment variables and redeploy.", retryable: false },
  MODEL_UNAVAILABLE: { status: 503, message: "Gemini doesn't recognise the configured model name. Check the spelling of GEMINI_MODEL on the server (for example gemini-2.5-flash).", retryable: false },
  API_KEY_INVALID: { status: 503, message: "The server's Gemini API key was rejected. Check GEMINI_API_KEY in the server's .env file.", retryable: false },
  AI_BUSY: { status: 503, message: "The AI model is overloaded right now. Please try again in a minute.", retryable: true },
  RATE_LIMITED: { status: 429, message: "Too many requests right now. Please wait a moment and try again.", retryable: true },
  AI_TIMEOUT: { status: 504, message: "The AI took too long to respond. Please try again.", retryable: true },
  AI_UNAVAILABLE: { status: 502, message: "The AI service had a problem. Please try again shortly.", retryable: true },
  INVALID_AI_RESPONSE: { status: 502, message: "The AI returned an answer we couldn't verify, so it wasn't shown. Please try again.", retryable: true },
  NETWORK: { status: 0, message: "Network problem. Check your connection and try again.", retryable: true },
  CANCELLED: { status: 0, message: "Analysis cancelled.", retryable: true },
  UNEXPECTED: { status: 500, message: "Something went wrong. Please try again.", retryable: true },
};

export class AppError extends Error {
  /**
   * Optional non-sensitive context shown to the user (e.g. which model name the server is configured
   * with). Never put document content, prompts, keys or provider messages here.
   */
  constructor(
    public readonly code: ErrorCode,
    public detail?: string,
  ) {
    super(code); // message is the code on purpose: never carries content
    this.name = "AppError";
  }
  get status() {
    return ERROR_INFO[this.code].status;
  }
}

export function toErrorPayload(code: ErrorCode, detail?: string): { code: ErrorCode; message: string; retryable: boolean; detail?: string } {
  const { message, retryable } = ERROR_INFO[code];
  return detail ? { code, message, retryable, detail } : { code, message, retryable };
}

export type ErrorPayload = ReturnType<typeof toErrorPayload>;
