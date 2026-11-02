/**
 * Deterministic helpers behind the interactive results: treemap layout, the electricity "what if"
 * simulator, calendar export and locating extracted facts on the original PDF page.
 * Nothing here calls the AI; every number shown is computed from figures the document states.
 */
import type { Analysis } from "@/types/analysis";

// ---------------------------------------------------------------- treemap

export interface TreeRect<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap (Bruls et al.) in a unit-agnostic w×h box. Values must be > 0. */
export function squarify<T>(items: T[], value: (t: T) => number, w: number, h: number): TreeRect<T>[] {
  const total = items.reduce((s, t) => s + value(t), 0);
  if (!items.length || total <= 0 || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const nodes = [...items].sort((a, b) => value(b) - value(a)).map((item) => ({ item, area: value(item) * scale }));
  const out: TreeRect<T>[] = [];
  let x = 0;
  let y = 0;
  let cw = w;
  let ch = h;

  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  let row: typeof nodes = [];
  const layoutRow = () => {
    const sum = row.reduce((a, n) => a + n.area, 0);
    if (cw >= ch) {
      const rw = sum / ch;
      let yy = y;
      for (const n of row) {
        const nh = n.area / rw;
        out.push({ item: n.item, x, y: yy, w: rw, h: nh });
        yy += nh;
      }
      x += rw;
      cw -= rw;
    } else {
      const rh = sum / cw;
      let xx = x;
      for (const n of row) {
        const nw = n.area / rh;
        out.push({ item: n.item, x: xx, y, w: nw, h: rh });
        xx += nw;
      }
      y += rh;
      ch -= rh;
    }
    row = [];
  };

  for (const n of nodes) {
    const side = Math.min(cw, ch);
    const candidate = [...row, n];
    if (row.length === 0 || worst(candidate.map((r) => r.area), side) <= worst(row.map((r) => r.area), side)) {
      row = candidate;
    } else {
      layoutRow();
      row = [n];
    }
  }
  if (row.length) layoutRow();
  return out;
}

// ---------------------------------------------------------------- what-if

export interface UsageModel {
  units: number;
  unit: string;
  energyCharge: number;
  /** Energy charge per unit, derived from the bill (energy charge ÷ units). */
  rate: number;
  /** Everything except the energy charge, assumed not to change with usage. */
  otherCharges: number;
  currentTotal: number;
  currency?: string;
}

/**
 * Builds a usage model only when the bill states consumption, an energy/consumption charge and a
 * total (or itemised charges). Otherwise returns undefined: no simulator is better than a guessed one.
 */
export function usageModel(a: Analysis): UsageModel | undefined {
  const fb = a.financialBreakdown;
  if (!fb?.consumption || fb.consumption.value <= 0) return undefined;
  const energy = fb.items.find((i) => /energy|consumption|usage|unit charge/i.test(i.label));
  if (!energy || energy.amount <= 0) return undefined;
  const itemsTotal = fb.items.reduce((s, i) => s + i.amount, 0);
  const currentTotal = fb.totalPayable ?? itemsTotal;
  if (currentTotal <= 0 || currentTotal < energy.amount) return undefined;
  return {
    units: fb.consumption.value,
    unit: fb.consumption.unit,
    energyCharge: energy.amount,
    rate: energy.amount / fb.consumption.value,
    otherCharges: currentTotal - energy.amount,
    currentTotal,
    currency: fb.currency,
  };
}

export function simulateUsage(m: UsageModel, units: number) {
  const total = Math.round((m.otherCharges + m.rate * Math.max(0, units)) * 100) / 100;
  return { total, difference: Math.round((total - m.currentTotal) * 100) / 100 };
}

// ---------------------------------------------------------------- calendar

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parses a single calendar date ("18 November 2026", "Nov 18, 2026", "2026-11-18"). Ranges return undefined. */
export function parseDocDate(s: string): Date | undefined {
  const t = s.trim();
  if (/\s(-|–|—|to)\s/.test(t)) return undefined;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return new Date(Date.UTC(+m[3], mi, +m[1]));
  }
  m = t.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return new Date(Date.UTC(+m[3], mi, +m[2]));
  }
  return undefined;
}

const icsEscape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** All-day calendar events for every important date that is a single parseable day. */
export function buildIcs(a: Analysis, now = new Date()): { ics: string; count: number } {
  const events = a.importantDates
    .map((d) => ({ d, date: parseDocDate(d.date) }))
    .filter((e): e is { d: (typeof a.importantDates)[number]; date: Date } => !!e.date);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Decoded//EN", "CALSCALE:GREGORIAN"];
  events.forEach(({ d, date }, i) => {
    const next = new Date(date.getTime() + 86_400_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:decoded-${ymd(date)}-${i}@decoded.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(date)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      `SUMMARY:${icsEscape(`${d.label} — ${a.documentTitle}`)}`,
      ...(d.note ? [`DESCRIPTION:${icsEscape(d.note)}`] : []),
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(d.label)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return { ics: lines.join("\r\n"), count: events.length };
}

// ---------------------------------------------------------------- x-ray matching

export interface Finding {
  id: string;
  label: string;
  detail?: string;
  tone: "money" | "date" | "fact" | "warning";
  /** Strings to look for on the page, best first. */
  needles: string[];
}

/** The things worth pointing at on the page, with what to search for. */
export function findingsFor(a: Analysis): Finding[] {
  const out: Finding[] = [];
  const clean = (s?: string) => (s && !/\[[A-Z_]+_\d+\]/.test(s) ? s : undefined);
  a.keyFacts.forEach((f, i) =>
    out.push({ id: `fact-${i}`, label: `${f.label}: ${f.value}`, detail: f.explanation, tone: "fact", needles: [clean(f.sourceExcerpt), f.value, f.label].filter(Boolean) as string[] }),
  );
  a.financialBreakdown?.items.forEach((it, i) =>
    out.push({ id: `money-${i}`, label: it.label, detail: it.explanation, tone: "money", needles: [it.label] }),
  );
  a.importantDates.forEach((d, i) =>
    out.push({ id: `date-${i}`, label: `${d.label}: ${d.date}`, detail: d.note, tone: "date", needles: [d.label, d.date] }),
  );
  a.labResults.forEach((r, i) => out.push({ id: `lab-${i}`, label: `${r.test}: ${r.value}`, detail: r.explanation, tone: "fact", needles: [r.test] }));
  a.importantClauses.forEach((c, i) =>
    out.push({ id: `clause-${i}`, label: c.title, detail: c.plainExplanation, tone: "warning", needles: [clean(c.sourceExcerpt), c.title].filter(Boolean) as string[] }),
  );
  a.warnings.forEach((w, i) =>
    out.push({ id: `warn-${i}`, label: w.message, tone: "warning", needles: [clean(w.sourceExcerpt)].filter(Boolean) as string[] }),
  );
  // Several findings often point at the same line (e.g. a fact and its charge); keep each only once.
  const seen = new Set<string>();
  return out.filter((f) => {
    const k = f.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"']/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Given the text items of a page (in reading order), returns the indices of the items covering the
 * first needle that can be found. Matching is case- and whitespace-insensitive.
 */
export function locate(itemTexts: string[], needles: string[]): number[] {
  const starts: number[] = [];
  let joined = "";
  for (const t of itemTexts) {
    starts.push(joined.length);
    joined += norm(t) + " ";
  }
  for (const raw of needles) {
    let n = norm(raw);
    if (n.length < 3) continue;
    let at = joined.indexOf(n);
    if (at < 0 && n.length > 48) {
      n = n.slice(0, 48);
      at = joined.indexOf(n);
    }
    if (at < 0) continue;
    const end = at + n.length;
    const hit: number[] = [];
    starts.forEach((s, i) => {
      const e = s + norm(itemTexts[i]).length;
      if (e > at && s < end && itemTexts[i].trim()) hit.push(i);
    });
    if (hit.length) return hit;
  }
  return [];
}
