// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Navigation } from "@/components/Navigation";
import { ProcessingState } from "@/components/ProcessingState";
import { UploadArea } from "@/components/UploadArea";
import { ResultsView } from "@/components/results/ResultsView";
import { toErrorPayload } from "@/lib/errors";
import { getSampleResult } from "@/lib/sample";
import { analysisSchema } from "@/types/analysis";

afterEach(cleanup);

const setup = (file: File | null = null) => {
  const props = { onFile: vi.fn(), onAnalyze: vi.fn(), onSampleResult: vi.fn(), onSamplePdf: vi.fn() };
  render(<UploadArea file={file} {...props} />);
  return props;
};

describe("UploadArea", () => {
  it("accepts a pdf via the file input", async () => {
    const p = setup();
    const input = screen.getByLabelText(/browse files/i) as HTMLInputElement;
    await userEvent.upload(input, new File(["%PDF-1.4"], "bill.pdf", { type: "application/pdf" }));
    expect(p.onFile).toHaveBeenCalledWith(expect.objectContaining({ name: "bill.pdf" }));
  });
  it("shows an accessible error for non-pdf files and does not accept them", async () => {
    const p = setup();
    const input = screen.getByLabelText(/browse files/i) as HTMLInputElement;
    // applyAccept:false so the browser-side accept filter doesn't hide the case under test
    await userEvent.setup({ applyAccept: false }).upload(input, new File(["x"], "pic.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/only pdf/i);
    expect(p.onFile).not.toHaveBeenCalled();
  });
  it("disables analyze until a file exists, then fires it", async () => {
    const first = setup();
    expect(screen.getByRole("button", { name: /decode this document/i })).toBeDisabled();
    cleanup();
    const p = setup(new File(["x"], "bill.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: /decode this document/i }));
    expect(p.onAnalyze).toHaveBeenCalled();
    expect(first.onAnalyze).not.toHaveBeenCalled();
  });
  it("lets the user remove the selected file", async () => {
    const p = setup(new File(["x"], "bill.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: /remove bill\.pdf/i }));
    expect(p.onFile).toHaveBeenCalledWith(null);
  });
  it("states the privacy limitation", () => {
    setup();
    expect(screen.getByText(/automated detection is not perfect/i)).toBeInTheDocument();
  });
});

describe("ProcessingState", () => {
  it("marks the current stage without showing percentages", () => {
    render(<ProcessingState stage="protecting" onCancel={() => undefined} />);
    expect(screen.getAllByText(/protecting personal information/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});

describe("ErrorMessage", () => {
  it("announces the error and offers retry only when retryable", async () => {
    const onRetry = vi.fn();
    render(<ErrorMessage error={toErrorPayload("AI_TIMEOUT")} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/took too long/i);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
    cleanup();
    render(<ErrorMessage error={toErrorPayload("INVALID_PDF")} onRetry={onRetry} />);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });
  it("offers the labelled sample only for AI-availability errors", () => {
    render(<ErrorMessage error={toErrorPayload("API_KEY_MISSING")} onSample={() => undefined} />);
    expect(screen.getByRole("button", { name: /simulated sample/i })).toBeInTheDocument();
  });
});

describe("ResultsView", () => {
  it("renders the labelled sample with a calculated comparison", () => {
    render(<ResultsView result={getSampleResult()} onReset={() => undefined} />);
    expect(screen.getByText(/not produced by the AI/i, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /electricity bill/i })).toBeInTheDocument();
    expect(screen.getByText(/\+12\.39%/)).toBeInTheDocument();
  });
  it("hides empty sections and doesn't crash on a minimal result", () => {
    const analysis = analysisSchema.parse({ documentType: "other", documentTitle: "Notes", summary: "Just a note." });
    render(
      <ResultsView
        result={{ analysis, meta: { source: "gemini", pages: 1, redactions: 0, truncated: false } }}
        onReset={() => undefined}
      />,
    );
    expect(screen.getByText("Just a note.")).toBeInTheDocument();
    for (const t of [/important dates/i, /where the money goes/i, /limitations/i, /what you can do/i]) {
      expect(screen.queryByText(t)).toBeNull();
    }
  });
  it("shows a comparison only when previous data exists", () => {
    const analysis = analysisSchema.parse({
      documentType: "invoice",
      documentTitle: "Inv",
      summary: "s",
      financialBreakdown: { currency: "USD", items: [], totalPayable: 100 },
    });
    render(<ResultsView result={{ analysis, meta: { source: "gemini", pages: 1, redactions: 2, truncated: true } }} onReset={() => undefined} />);
    expect(screen.queryByText(/compared with the previous/i)).toBeNull();
    expect(screen.getByText(/only the first part/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pieces of detected personal information/i)).toBeInTheDocument();
  });
  it("renders untrusted text as text, not HTML", () => {
    const analysis = analysisSchema.parse({ documentType: "other", documentTitle: "T", summary: "<img src=x onerror=alert(1)>" });
    const { container } = render(
      <ResultsView result={{ analysis, meta: { source: "gemini", pages: 1, redactions: 0, truncated: false } }} onReset={() => undefined} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Navigation", () => {
  it("toggles the mobile menu and exposes state", async () => {
    render(<Navigation />);
    const btn = screen.getByRole("button", { name: /open menu/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(btn);
    expect(screen.getByRole("button", { name: /close menu/i })).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
  });
});

describe("ResultsView for lab reports", () => {
  it("shows calculated range checks and the not-a-diagnosis note", async () => {
    const { getSampleLabResult } = await import("@/lib/sample");
    render(<ResultsView result={getSampleLabResult()} onReset={() => undefined} />);
    expect(screen.getAllByText("Below range").length).toBe(1); // haemoglobin
    expect(screen.getAllByText("Above range").length).toBe(1); // LDL
    expect(screen.getByText(/isn't a diagnosis/i)).toBeInTheDocument();
  });
});
