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
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
}

export async function extractPdfText(
  bytes: Uint8Array,
  loader: () => Promise<PdfJsLike> = loadPdfJs,
): Promise<ExtractedPdf> {
  const pdfjs = await loader();
  // pdfjs may transfer/detach the buffer, so hand it a copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw new AppError("PASSWORD_PROTECTED");
    throw new AppError("INVALID_PDF");
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
    throw new AppError("INVALID_PDF");
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
