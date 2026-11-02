import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { extractPdfText, type PdfJsLike } from "@/lib/pdf/extract";

const failing = (err: Error): (() => Promise<PdfJsLike>) => async () => ({
  getDocument: () => ({ promise: Promise.reject(err), destroy: async () => undefined }),
});
const named = (name: string, message = "x") => Object.assign(new Error(message), { name });

describe("PDF open failures are attributed correctly", () => {
  it("blames the file only when pdf.js says the file is bad", async () => {
    for (const name of ["InvalidPDFException", "FormatError", "MissingPDFException"]) {
      await expect(extractPdfText(new Uint8Array(1), failing(named(name)))).rejects.toMatchObject({ code: "INVALID_PDF" });
    }
  });
  it("does NOT blame the file when our own environment fails (the production bug)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = named("Error", 'Setting up fake worker failed: "Cannot find module pdf.worker.mjs".');
    await expect(extractPdfText(new Uint8Array(1), failing(err))).rejects.toMatchObject({ code: "UNEXPECTED" });
    // the technical reason is logged so it can be diagnosed, but only the error name and message
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("fake worker failed"));
    spy.mockRestore();
  });
  it("reports a library that cannot even load as our problem, not the user's", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loader = async () => {
      throw new Error("Cannot find package pdfjs-dist");
    };
    await expect(extractPdfText(new Uint8Array(1), loader)).rejects.toMatchObject({ code: "UNEXPECTED" });
    spy.mockRestore();
  });
  it("still keeps password-protected files separate", async () => {
    await expect(extractPdfText(new Uint8Array(1), failing(named("PasswordException")))).rejects.toMatchObject({
      code: "PASSWORD_PROTECTED",
    });
  });
  it("genuinely corrupt PDFs through the real library are still INVALID_PDF", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bad = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf");
    await expect(extractPdfText(bad)).rejects.toMatchObject({ code: "INVALID_PDF" });
    spy.mockRestore();
  });
  it("opens a real PDF with the default loader (worker pre-loaded)", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(process.cwd(), "public/sample-electricity-bill.pdf")));
    const { text } = await extractPdfText(bytes);
    expect(text).toContain("Total Payable");
    expect((globalThis as { pdfjsWorker?: unknown }).pdfjsWorker).toBeTruthy();
  });
});
