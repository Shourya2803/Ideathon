import { AppError } from "../errors";

export type PiiType =
  | "PERSON"
  | "EMAIL"
  | "PHONE"
  | "ADDRESS"
  | "POSTAL_CODE"
  | "ACCOUNT_ID"
  | "POLICY_ID"
  | "INVOICE_ID"
  | "GOV_ID"
  | "BANK"
  | "CARD";

export interface SanitizeResult {
  text: string;
  counts: Partial<Record<PiiType, number>>;
  total: number;
}

/** Remembers what was replaced so repeats get the same placeholder. Never leaves this module. */
class Registry {
  private byKey = new Map<string, string>();
  private counters: Partial<Record<PiiType, number>> = {};
  /** value -> placeholder, used to mask later occurrences and to verify nothing leaked. */
  readonly values = new Map<string, { type: PiiType; placeholder: string }>();

  add(type: PiiType, value: string): string {
    const norm = value.trim().replace(/\s+/g, " ").toLowerCase();
    const key = `${type}:${norm}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const n = (this.counters[type] = (this.counters[type] ?? 0) + 1);
    const placeholder = `[${type}_${n}]`;
    this.byKey.set(key, placeholder);
    this.values.set(value.trim(), { type, placeholder });
    return placeholder;
  }

  get counts() {
    return { ...this.counters };
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const NAME_STOP =
  "(?:Consumer|Customer|Account|Number|No|Phone|Mobile|Email|Address|Date|Bill|Invoice|Policy|Meter|Period|Due|Total|Amount|Tel|Contact|Unit|Units)";
const NAME_WORD = `(?!${NAME_STOP}\\b)[A-Z][A-Za-z'’.-]+`;
const NAME_VALUE = new RegExp(`(?:(?:Mr|Mrs|Ms|Miss|Dr|Shri|Smt)\\.?\\s+)?${NAME_WORD}(?:[ \\t]+${NAME_WORD}){0,3}`, "y");
const ID_VALUE = /[A-Za-z0-9][A-Za-z0-9\-/]*(?: \d{2,}[A-Za-z0-9\-/]*){0,3}/y;
const PHONE_VALUE = /\+?\d[\d ().-]{5,16}\d/y;
const ADDRESS_VALUE = /[^\n]+(?:\n(?=[^\n:]*(?:,|\b\d{5,6}\b))[^\n:]+){0,2}/y;
const POSTAL_VALUE = /(?:\d{5,6}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})/y;

const idLabel = (words: string) =>
  `(?:${words})(?:\\s*(?:no|number|num|id|#)\\b\\.?\\s*[:#-]?|\\s*[:#-])\\s*`;

interface Rule {
  type: PiiType;
  label: RegExp;
  value: RegExp;
  accept?: (v: string) => boolean;
}

const hasDigit = (v: string) => /\d/.test(v) && v.replace(/\W/g, "").length >= 4;

const RULES: Rule[] = [
  {
    type: "ADDRESS",
    label: new RegExp(
      "(?<![A-Za-z])(?:(?:billing|service|shipping|mailing|registered|premises|site|supply|residential|correspondence|permanent)\\s+)?address\\s*[:-]\\s*",
      "gi",
    ),
    value: ADDRESS_VALUE,
  },
  {
    type: "POSTAL_CODE",
    label: /(?<![A-Za-z])(?:pin\s*code|pin|zip\s*code|zip|postal\s*code|postcode)\s*[:-]?\s*/gi,
    value: POSTAL_VALUE,
  },
  {
    type: "POLICY_ID",
    label: new RegExp(`(?<![A-Za-z])${idLabel("policy|certificate|member(?:ship)?")}`, "gi"),
    value: ID_VALUE,
    accept: hasDigit,
  },
  {
    type: "INVOICE_ID",
    label: new RegExp(`(?<![A-Za-z])${idLabel("invoice|bill|receipt|order|reference|ref|transaction|txn|case|claim")}`, "gi"),
    value: ID_VALUE,
    accept: hasDigit,
  },
  {
    type: "GOV_ID",
    label: new RegExp(
      `(?<![A-Za-z])${idLabel("pan|aadhaar|aadhar|ssn|social\\s+security|passport|driving\\s+licen[cs]e|licen[cs]e|national\\s+id|tax|tin|gstin|vat")}`,
      "gi",
    ),
    value: ID_VALUE,
    accept: hasDigit,
  },
  {
    type: "BANK",
    label: new RegExp(`(?<![A-Za-z])${idLabel("bank\\s+account|iban|ifsc|swift|routing|sort\\s+code|bsb")}`, "gi"),
    value: ID_VALUE,
    accept: hasDigit,
  },
  {
    type: "ACCOUNT_ID",
    label: new RegExp(
      `(?<![A-Za-z])${idLabel("consumer|customer|account|acct|a\\/c|meter|connection|service\\s+connection|subscriber|client|id")}`,
      "gi",
    ),
    value: ID_VALUE,
    accept: hasDigit,
  },
  {
    type: "PHONE",
    label: /(?<![A-Za-z])(?:phone|telephone|tel|mobile|mob|cell|contact(?:\s+(?:no|number))?|fax|whatsapp)\s*(?:no\.?|number|#)?\s*[:-]?\s*/gi,
    value: PHONE_VALUE,
    accept: (v) => v.replace(/\D/g, "").length >= 7,
  },
  {
    type: "PERSON",
    label: new RegExp(
      "(?<![A-Za-z])(?:(?:customer|consumer|account\\s+holder|policy\\s*holder|card\\s*holder|employee|tenant|landlord|client|buyer|seller|payee|beneficiary|applicant|insured|nominee|holder|contact\\s+person|full)\\s+name|name|bill(?:ed)?\\s+to|sold\\s+to|ship(?:ped)?\\s+to|issued\\s+to|prepared\\s+for|attention|attn|insured|policy\\s*holder|account\\s+holder|customer|consumer|tenant|landlord|employee|signed\\s+by)\\s*[:-]\\s*|(?<![A-Za-z])dear\\s+",
      "gi",
    ),
    value: NAME_VALUE,
  },
];

function applyRule(text: string, rule: Rule, reg: Registry): string {
  let out = "";
  let cursor = 0;
  rule.label.lastIndex = 0;
  for (const m of text.matchAll(rule.label)) {
    const valueStart = m.index + m[0].length;
    if (valueStart < cursor) continue;
    rule.value.lastIndex = valueStart;
    const vm = rule.value.exec(text);
    if (!vm) continue;
    const value = vm[0].replace(/[\s.,;:-]+$/, "");
    if (!value || (rule.accept && !rule.accept(value))) continue;
    out += text.slice(cursor, valueStart) + reg.add(rule.type, value);
    cursor = valueStart + value.length;
  }
  return out + text.slice(cursor);
}

function replacePattern(
  text: string,
  re: RegExp,
  type: PiiType,
  reg: Registry,
  accept: (match: string) => boolean = () => true,
): string {
  return text.replace(re, (match) => (accept(match) ? reg.add(type, match) : match));
}

/** Mask every remaining occurrence of values already detected elsewhere in the document. */
function propagate(text: string, reg: Registry): string {
  const entries = [...reg.values.entries()].filter(([v]) => v.length >= 4);
  const tokens: Array<[string, string]> = [];
  for (const [value, { type, placeholder }] of entries) {
    if (type === "PERSON") {
      for (const t of value.split(/\s+/)) {
        if (t.length >= 4 && !/^(Mr|Mrs|Ms|Miss|Shri|Smt)\.?$/.test(t)) tokens.push([t.replace(/[.,]+$/, ""), placeholder]);
      }
    }
  }
  let out = text;
  const all: Array<[string, string]> = [...entries.map(([v, e]) => [v, e.placeholder] as [string, string]), ...tokens];
  all.sort((a, b) => b[0].length - a[0].length);
  for (const [value, placeholder] of all) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(value)}(?![A-Za-z0-9])`, "gi"), placeholder);
  }
  return out;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD_RE = /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g;
const INTL_PHONE_RE = /(?<![\w])\+\d[\d ().-]{7,17}\d/g;
const US_PHONE_RE = /(?<![\w])\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g;
const IN_MOBILE_RE = /(?<![\d.,])[6-9]\d{9}(?!\d)/g;
const AADHAAR_RE = /(?<![\d])\d{4} \d{4} \d{4}(?![\d])/g;
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const SSN_RE = /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const LONG_DIGITS_RE = /(?<![\d.,])\d{9,}(?!\d|[.,]\d)/g;

const cardOk = (m: string) => {
  const d = m.replace(/\D/g, "");
  return d.length >= 13 && d.length <= 19 && luhnValid(d);
};

function run(input: string): SanitizeResult {
  const reg = new Registry();
  let text = input;

  text = replacePattern(text, EMAIL_RE, "EMAIL", reg);
  for (const rule of RULES) text = applyRule(text, rule, reg);
  text = replacePattern(text, CARD_RE, "CARD", reg, cardOk);
  text = replacePattern(text, AADHAAR_RE, "GOV_ID", reg);
  text = replacePattern(text, PAN_RE, "GOV_ID", reg);
  text = replacePattern(text, SSN_RE, "GOV_ID", reg);
  text = replacePattern(text, IBAN_RE, "BANK", reg, (m) => /\d/.test(m));
  text = replacePattern(text, INTL_PHONE_RE, "PHONE", reg);
  text = replacePattern(text, US_PHONE_RE, "PHONE", reg);
  text = replacePattern(text, IN_MOBILE_RE, "PHONE", reg);
  // Conservative fallback: long bare digit runs are far more likely identifiers than money.
  text = replacePattern(text, LONG_DIGITS_RE, "ACCOUNT_ID", reg);
  text = propagate(text, reg);

  verify(text, reg);

  const counts = reg.counts;
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return { text, counts, total };
}

/** Final safety net: fail closed if anything we detected (or an obvious pattern) is still present. */
function verify(text: string, reg: Registry): void {
  EMAIL_RE.lastIndex = 0;
  if (EMAIL_RE.test(text)) throw new Error("email leak");
  for (const m of text.matchAll(CARD_RE)) if (cardOk(m[0])) throw new Error("card leak");
  for (const [value, { type }] of reg.values) {
    if (value.length < 4 || type === "PERSON") continue;
    if (new RegExp(`(?<![A-Za-z0-9])${escapeRe(value)}(?![A-Za-z0-9])`, "i").test(text)) throw new Error("value leak");
  }
}

/** Throws `SANITIZATION_FAILED` on any problem so callers never fall back to raw text. */
export function sanitizeText(input: string): SanitizeResult {
  try {
    return run(input);
  } catch {
    throw new AppError("SANITIZATION_FAILED");
  }
}
