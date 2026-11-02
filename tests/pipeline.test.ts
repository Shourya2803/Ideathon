import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeText, luhnValid } from "@/lib/privacy/sanitize";
import { assertPdfSignature, validateFileMeta } from "@/lib/pdf/validate";
import { extractPdfText, type PdfJsLike } from "@/lib/pdf/extract";
import { compareAmounts } from "@/lib/calc";
import { parseAnalysis } from "@/lib/ai/gemini";
import { runAnalysis } from "@/lib/analyze";
import { handleAnalyze } from "@/lib/handler";
import { resetRateLimit } from "@/lib/rate-limit";
import { AppError, ERROR_INFO } from "@/lib/errors";
import { LIMITS } from "@/lib/config";

const samplePdf = () => new Uint8Array(readFileSync(path.join(process.cwd(), "public/sample-electricity-bill.pdf")));

const goodJson = JSON.stringify({
  documentType: "electricity_bill",
  documentTitle: "Electricity bill",
  summary: "Your bill for October is Rs 2,450.",
  keyFacts: [{ label: "Units", value: "320 kWh" }],
  financialBreakdown: { currency: "INR", items: [], totalPayable: 2450, previousAmount: 2180 },
});

describe("file validation", () => {
  it("accepts a valid pdf", () => {
    expect(() => validateFileMeta({ name: "a.pdf", type: "application/pdf", size: 1000 })).not.toThrow();
  });
  it("rejects non-pdf, oversize and empty files", () => {
    expect(() => validateFileMeta({ name: "a.png", type: "image/png", size: 10 })).toThrow(AppError);
    expect(() => validateFileMeta({ name: "a.pdf", type: "text/html", size: 10 })).toThrow(AppError);
    expect(() => validateFileMeta({ name: "a.pdf", type: "application/pdf", size: LIMITS.maxFileBytes + 1 })).toThrow(
      expect.objectContaining({ code: "FILE_TOO_LARGE" }),
    );
    expect(() => validateFileMeta({ name: "a.pdf", type: "application/pdf", size: 0 })).toThrow(
      expect.objectContaining({ code: "EMPTY_FILE" }),
    );
  });
  it("checks the real signature, not the filename", () => {
    expect(() => assertPdfSignature(new TextEncoder().encode("hello world"))).toThrow(
      expect.objectContaining({ code: "INVALID_PDF" }),
    );
    expect(() => assertPdfSignature(samplePdf())).not.toThrow();
  });
});

describe("pdf extraction", () => {
  it("extracts text from the sample pdf", async () => {
    const { text, pages } = await extractPdfText(samplePdf());
    expect(pages).toBe(1);
    expect(text).toContain("Total Payable");
    expect(text).toContain("2,450.00");
  });
  it("rejects corrupt pdfs", async () => {
    const bad = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf");
    await expect(extractPdfText(bad)).rejects.toMatchObject({ code: "INVALID_PDF" });
  });
  const fake = (numPages: number, str: string): (() => Promise<PdfJsLike>) => async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages,
        getPage: async () => ({ getTextContent: async () => ({ items: [{ str }] }) }),
      }),
      destroy: async () => undefined,
    }),
  });
  it("enforces the page limit", async () => {
    await expect(extractPdfText(new Uint8Array(1), fake(LIMITS.maxPages + 1, "x".repeat(500)))).rejects.toMatchObject({
      code: "TOO_MANY_PAGES",
    });
  });
  it("flags scanned pdfs with no usable text", async () => {
    await expect(extractPdfText(new Uint8Array(1), fake(1, "  "))).rejects.toMatchObject({ code: "SCANNED_PDF" });
  });
  it("maps password errors", async () => {
    const loader = async () => ({
      getDocument: () => ({ promise: Promise.reject(Object.assign(new Error("pw"), { name: "PasswordException" })) }),
    });
    await expect(extractPdfText(new Uint8Array(1), loader as never)).rejects.toMatchObject({ code: "PASSWORD_PROTECTED" });
  });
});

describe("sanitizeText", () => {
  const input = [
    "Customer: Rahul Sharma",
    "Email: rahul@example.com",
    "Phone: +91 98765 43210",
    "Consumer Number: 1234567890",
    "Service Address: 14 Lake View Road, Pune 411001",
    "Billing Period: October 2026",
    "Units Consumed: 320 kWh",
    "Total Payable: ₹2,450",
    "Previous Bill: ₹2,180",
    "Dear Rahul, your consumer 1234567890 is due.",
  ].join("\n");

  it("replaces personal data with typed placeholders", () => {
    const { text, total } = sanitizeText(input);
    expect(text).toContain("Customer: [PERSON_1]");
    expect(text).toContain("[EMAIL_1]");
    expect(text).toContain("[PHONE_1]");
    expect(text).toContain("Consumer Number: [ACCOUNT_ID_1]");
    expect(text).toContain("[ADDRESS_1]");
    expect(total).toBeGreaterThanOrEqual(5);
    for (const secret of ["Rahul", "Sharma", "rahul@example.com", "98765", "1234567890", "Lake View"]) {
      expect(text).not.toContain(secret);
    }
  });
  it("keeps the facts needed for analysis", () => {
    const { text } = sanitizeText(input);
    for (const keep of ["October 2026", "320 kWh", "₹2,450", "₹2,180", "Total Payable"]) expect(text).toContain(keep);
  });
  it("reuses a placeholder for repeated values", () => {
    const { text } = sanitizeText("Account No: 998877665\nRef: see account 998877665 again");
    expect(text.match(/\[ACCOUNT_ID_1\]/g)?.length).toBe(2);
  });
  it("masks valid card numbers but not plain amounts", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    const { text } = sanitizeText("Card 4111 1111 1111 1111 charged 12,345.00 on 01-02-2026");
    expect(text).toContain("[CARD_1]");
    expect(text).toContain("12,345.00");
    expect(text).toContain("01-02-2026");
  });
  it("does not treat words after labels as ids", () => {
    const { text } = sanitizeText("Account Balance: Positive\nInvoice Date: 5 May 2026");
    expect(text).toContain("Account Balance: Positive");
    expect(text).toContain("Invoice Date: 5 May 2026");
  });
  it("sanitizes the real sample pdf text", async () => {
    const { text } = await extractPdfText(samplePdf());
    const out = sanitizeText(text).text;
    expect(out).not.toMatch(/Rahul|1234567890|example\.com|98765/);
    expect(out).toContain("Total Payable");
  });
});

describe("calculations", () => {
  it("computes difference and percent change", () => {
    expect(compareAmounts(2450, 2180, "INR")).toMatchObject({ difference: 270, percentChange: 12.39 });
  });
  it("does not fabricate a comparison", () => {
    expect(compareAmounts(2450, undefined)).toBeUndefined();
    expect(compareAmounts(undefined, 2180)).toBeUndefined();
    expect(compareAmounts(100, 0)).toBeUndefined();
  });
});

describe("ai response validation", () => {
  it("accepts valid output, tolerating a code fence and nulls", () => {
    const a = parseAnalysis("```json\n" + goodJson.replace('"keyFacts"', '"warnings":null,"keyFacts"') + "\n```");
    expect(a.warnings).toEqual([]);
    expect(a.financialBreakdown?.totalPayable).toBe(2450);
  });
  it("falls back to 'other' for unknown types rather than forcing a category", () => {
    expect(parseAnalysis(JSON.stringify({ documentType: "tax_return", summary: "s" })).documentType).toBe("other");
  });
  it("rejects malformed or incomplete output", () => {
    expect(() => parseAnalysis("not json")).toThrow(expect.objectContaining({ code: "INVALID_AI_RESPONSE" }));
    expect(() => parseAnalysis(JSON.stringify({ documentType: "invoice" }))).toThrow(
      expect.objectContaining({ code: "INVALID_AI_RESPONSE" }),
    );
  });
});

describe("pipeline", () => {
  it("sends only sanitized text to the AI client", async () => {
    const generate = vi.fn().mockResolvedValue(goodJson);
    const res = await runAnalysis(samplePdf(), { getClient: () => ({ generate }) });
    expect(generate).toHaveBeenCalledOnce();
    const sent = generate.mock.calls[0][0].content as string;
    expect(sent).toContain("Total Payable");
    expect(sent).not.toMatch(/Rahul|Sharma|1234567890|rahul\.sharma@example\.com|98765/);
    expect(res.meta).toMatchObject({ source: "gemini", pages: 1, truncated: false });
    expect(res.meta.redactions).toBeGreaterThan(0);
    expect(res.comparison?.percentChange).toBe(12.39);
  });
  it("never calls the AI if sanitization fails", async () => {
    vi.resetModules();
    vi.doMock("@/lib/privacy/sanitize", () => ({
      sanitizeText: () => {
        throw new AppError("SANITIZATION_FAILED");
      },
    }));
    const { runAnalysis: run } = await import("@/lib/analyze");
    const generate = vi.fn();
    await expect(run(samplePdf(), { getClient: () => ({ generate }) })).rejects.toMatchObject({
      code: "SANITIZATION_FAILED",
    });
    expect(generate).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/privacy/sanitize");
  });
  it("surfaces invalid AI output as a safe error", async () => {
    const generate = vi.fn().mockResolvedValue("<script>");
    await expect(runAnalysis(samplePdf(), { getClient: () => ({ generate }) })).rejects.toMatchObject({
      code: "INVALID_AI_RESPONSE",
    });
  });
  it("maps provider failures without leaking details", async () => {
    const generate = vi.fn().mockRejectedValue(Object.assign(new Error("secret-key-abc leaked?"), { status: 429 }));
    await expect(runAnalysis(samplePdf(), { getClient: () => ({ generate }) })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "RATE_LIMITED",
    });
  });
});

describe("POST /api/analyze handler", () => {
  beforeEach(() => resetRateLimit());
  const post = (body?: BodyInit, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/analyze", { method: "POST", body, headers });
  const form = (file?: File) => {
    const f = new FormData();
    if (file) f.set("file", file);
    return f;
  };
  const okClient = () => ({ generate: vi.fn().mockResolvedValue(goodJson) });
  const readEvents = async (res: Response) =>
    (await res.text()).trim().split("\n").map((l) => JSON.parse(l));

  it("rejects requests without a file", async () => {
    const res = await handleAnalyze(post(form()), { createClient: okClient });
    expect(res.status).toBe(400);
  });
  it("rejects non-multipart requests", async () => {
    const res = await handleAnalyze(post("hi", { "content-type": "text/plain" }), { createClient: okClient });
    expect(res.status).toBe(400);
  });
  it("rejects unsupported file types", async () => {
    const res = await handleAnalyze(post(form(new File(["x"], "a.txt", { type: "text/plain" }))), { createClient: okClient });
    expect(res.status).toBe(415);
  });
  it("rejects oversized files", async () => {
    const big = new File([new Uint8Array(LIMITS.maxFileBytes + 1)], "a.pdf", { type: "application/pdf" });
    const res = await handleAnalyze(post(form(big)), { createClient: okClient });
    expect(res.status).toBe(413);
  });
  it("reports a missing API key without leaking config", async () => {
    const f = new File([samplePdf()], "bill.pdf", { type: "application/pdf" });
    const res = await handleAnalyze(post(form(f)), {
      createClient: () => {
        throw new AppError("API_KEY_MISSING");
      },
    });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/stack|GEMINI_API_KEY=/);
  });
  it("handles an invalid pdf with an error event", async () => {
    const f = new File(["not a pdf"], "bad.pdf", { type: "application/pdf" });
    const events = await readEvents(await handleAnalyze(post(form(f)), { createClient: okClient }));
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "INVALID_PDF" } });
  });
  it("streams stages then a validated result", async () => {
    const f = new File([samplePdf()], "bill.pdf", { type: "application/pdf" });
    const events = await readEvents(await handleAnalyze(post(form(f)), { createClient: okClient }));
    expect(events.filter((e) => e.type === "stage").map((e) => e.stage)).toEqual([
      "validating",
      "extracting",
      "protecting",
      "analyzing",
      "preparing",
    ]);
    expect(events.at(-1)).toMatchObject({ type: "result", data: { meta: { source: "gemini" } } });
  });
  it("rate limits repeated callers", async () => {
    const f = () => new File(["x"], "a.txt");
    let status = 0;
    for (let i = 0; i <= LIMITS.rateLimit.maxRequests; i++) {
      status = (await handleAnalyze(post(form(f())), { createClient: okClient })).status;
    }
    expect(status).toBe(429);
  });
});

describe("error messages", () => {
  it("never contain stack-like or key-like content", () => {
    for (const info of Object.values(ERROR_INFO)) expect(info.message).not.toMatch(/at \w+\.|AIza|api[_ ]?key=/i);
  });
});

describe("type-specific calculations", () => {
  it("checks lab values against printed ranges, and refuses to guess", async () => {
    const { checkRange } = await import("@/lib/calc");
    expect(checkRange("11.6", "12.0 - 15.5")).toBe("below");
    expect(checkRange("13", "12.0–15.5")).toBe("within");
    expect(checkRange("142", "< 130")).toBe("above");
    expect(checkRange("52", "> 40")).toBe("within");
    expect(checkRange("Positive", "Negative")).toBeUndefined();
    expect(checkRange("12", undefined)).toBeUndefined();
    expect(checkRange("12", "see note")).toBeUndefined();
  });
  it("computes loan totals only from stated EMI and tenure", async () => {
    const { loanCost } = await import("@/lib/calc");
    const base = parseAnalysis(JSON.stringify({ documentType: "loan_agreement", summary: "s" }));
    expect(loanCost({ ...base, loanTerms: { emi: 10000, tenureMonths: 24, principal: 200000 } } as never)).toEqual({
      totalRepayment: 240000,
      totalInterest: 40000,
      currency: undefined,
    });
    expect(loanCost({ ...base, loanTerms: { annualInterestRatePercent: 10, principal: 200000 } } as never)).toBeUndefined();
  });
  it("drops key facts that are only privacy placeholders", async () => {
    const json = JSON.stringify({
      documentType: "electricity_bill",
      summary: "s",
      keyFacts: [
        { label: "Customer", value: "[PERSON_1]" },
        { label: "Units", value: "320 kWh" },
      ],
    });
    const res = await runAnalysis(samplePdf(), { getClient: () => ({ generate: vi.fn().mockResolvedValue(json) }) });
    expect(res.analysis.keyFacts.map((f) => f.label)).toEqual(["Units"]);
  });
});
