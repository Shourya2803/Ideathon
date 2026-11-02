import { describe, expect, it } from "vitest";
import { buildIcs, findingsFor, locate, parseDocDate, simulateUsage, squarify, usageModel } from "@/lib/insights";
import { getSampleResult } from "@/lib/sample";
import { analysisSchema } from "@/types/analysis";

describe("squarify", () => {
  it("fills the box exactly, with areas proportional to values", () => {
    const items = [6, 6, 4, 3, 2, 2, 1];
    const rects = squarify(items, (v) => v, 600, 400);
    expect(rects).toHaveLength(items.length);
    const area = rects.reduce((s, r) => s + r.w * r.h, 0);
    expect(area).toBeCloseTo(600 * 400, 3);
    for (const r of rects) {
      expect(r.w * r.h).toBeCloseTo((r.item / 24) * 600 * 400, 3);
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });
  it("returns nothing for empty or zero input", () => {
    expect(squarify([], (v: number) => v, 10, 10)).toEqual([]);
    expect(squarify([0], (v) => v, 10, 10)).toEqual([]);
  });
});

describe("electricity what-if", () => {
  it("derives the rate from the bill and recalculates", () => {
    const m = usageModel(getSampleResult().analysis)!;
    expect(m.rate).toBeCloseTo(5.5); // 1760 / 320
    expect(m.otherCharges).toBe(690); // 2450 - 1760
    expect(simulateUsage(m, 320).difference).toBe(0);
    expect(simulateUsage(m, 270)).toEqual({ total: 2175, difference: -275 });
  });
  it("refuses to simulate without consumption or an energy charge", () => {
    const a = analysisSchema.parse({
      documentType: "electricity_bill",
      summary: "s",
      financialBreakdown: { items: [{ label: "Fixed", amount: 100 }], totalPayable: 100 },
    });
    expect(usageModel(a)).toBeUndefined();
  });
});

describe("calendar export", () => {
  it("parses common single-date formats and rejects ranges", () => {
    expect(parseDocDate("18 November 2026")?.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(parseDocDate("Nov 18, 2026")?.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(parseDocDate("2026-11-18")?.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(parseDocDate("1 Oct 2026 – 31 Oct 2026")).toBeUndefined();
    expect(parseDocDate("soon")).toBeUndefined();
  });
  it("builds an all-day event with a reminder for each date", () => {
    const { ics, count } = buildIcs(getSampleResult().analysis, new Date("2026-11-01T00:00:00Z"));
    expect(count).toBe(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261118");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
  });
});

describe("x-ray matching", () => {
  const items = ["Energy Charges:", "Rs 1,760.00", "Total", "Payable: Rs 2,450.00", "Due Date: 18 November 2026"];
  it("finds a phrase that spans several text items", () => {
    expect(locate(items, ["Total Payable"])).toEqual([2, 3]);
  });
  it("ignores case and spacing, and falls back to later needles", () => {
    expect(locate(items, ["nothing here", "energy   CHARGES"])).toEqual([0]);
    expect(locate(items, ["missing"])).toEqual([]);
  });
  it("never points at privacy placeholders", () => {
    const f = findingsFor(
      analysisSchema.parse({
        documentType: "other",
        summary: "s",
        keyFacts: [{ label: "Customer", value: "x", sourceExcerpt: "Customer: [PERSON_1]" }],
      }),
    );
    expect(f[0].needles).not.toContain("Customer: [PERSON_1]");
  });
});
