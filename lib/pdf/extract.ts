import { LIMITS } from "../config";
import { AppError } from "../errors";

export interface ExtractedPdf {
  text: string;
  pages: number;
}

/** Minimal shape of the pdfjs API we rely on, so tests can inject a fake. */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
      }>;
    }>;
    destroy(): Promise<void>;
  };
}

async function loadPdfJs(): Promise<PdfJsLike> {
  // pdf.js normally finds its worker by a path string at runtime. Serverless file tracing (Vercel)
  // never ships files that are only referenced that way, so extraction failed in production while
  // working locally. Importing the worker here with a literal specifier makes it part of the traced
  // bundle, and handing it over through the documented global skips the path lookup entirely.
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
}

/** Errors pdf.js raises when the FILE itself is the problem (as opposed to our environment). */
const FILE_PROBLEMS = new Set(["InvalidPDFException", "FormatError", "MissingPDFException", "XRefParseException"]);

/** Log what went wrong without ever logging document content: error name and a short technical message only. */
function logFailure(stage: string, err: unknown) {
  const name = (err as { name?: string })?.name ?? "Error";
  const message = String((err as { message?: string })?.message ?? "").slice(0, 160);
  console.error(`[decoded] pdf ${stage} failed: ${name}: ${message}`);
}

export async function extractPdfText(
  bytes: Uint8Array,
  loader: () => Promise<PdfJsLike> = loadPdfJs,
): Promise<ExtractedPdf> {
  let pdfjs: PdfJsLike;
  try {
    pdfjs = await loader();
  } catch (err) {
    logFailure("library load", err);
    throw new AppError("UNEXPECTED");
  }
  // pdfjs may transfer/detach the buffer, so hand it a copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw new AppError("PASSWORD_PROTECTED");
    logFailure("open", err);
    // Only blame the user's file when pdf.js says the file is bad. Anything else is our side.
    throw new AppError(FILE_PROBLEMS.has(name) ? "INVALID_PDF" : "UNEXPECTED");
  }

  try {
    if (doc.numPages > LIMITS.maxPages) throw new AppError("TOO_MANY_PAGES");
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        line += item.str ?? "";
        if (item.hasEOL) line += "\n";
        else if (item.str) line += " ";
      }
      parts.push(line);
    }
    const text = parts
      .join("\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text.length === 0) throw new AppError("SCANNED_PDF");
    if (text.length / doc.numPages < LIMITS.minCharsPerPage) throw new AppError("SCANNED_PDF");
    return { text, pages: doc.numPages };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logFailure("read", err);
    throw new AppError(FILE_PROBLEMS.has((err as { name?: string })?.name ?? "") ? "INVALID_PDF" : "UNEXPECTED");
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
