# Decoded

**Read the fine print before it costs you.** People sign, pay, or skip things they don't understand. Decoded explains electricity bills, lab reports, loan agreements, government scheme rules, insurance policies and exam syllabi (plus invoices, contracts and anything else) in plain language. Personal information is removed on the server before any text reaches the AI.

Stack: Next.js (App Router) · TypeScript (strict) · Tailwind CSS 4 · three.js · Motion for React · React Bits (`BlurText`, `ShinyText`, `CountUp`) · Lenis · hls.js · Zod · Google Gemini (`@google/genai`) · `pdfjs-dist` · Vitest · React Testing Library · Playwright.

## The experience

One persistent GPU particle world sits behind the whole page (`components/scene/`). As you scroll it becomes a document page (hero), a shapeless cloud (the problem), a lightning bolt / lab flask / coin stack / government building / shield / open book (one per document type), a scanned page (how it works) and a padlock (privacy). The pointer stirs it through a small GPU fluid simulation. When a document is decoded, the result floats out as glass cards you fly through in 3D by scrolling, and the particles form the shape of the detected document type.

Type-specific results: lab values are checked against the printed reference range, and loan totals (EMI × tenure, interest) are calculated in code, never estimated by the AI. Bill comparisons work the same way. Government scheme criteria are listed as a checklist; Decoded doesn't decide eligibility.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev                  # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-side only. Never exposed to the browser. |
| `GEMINI_MODEL` | A model id your key can use (see the [Gemini models list](https://ai.google.dev/gemini-api/docs/models)). Deliberately not hardcoded. |

Without these, the site still works: upload returns a clear "AI not configured" error and the labelled simulated sample is available.

## Commands

```bash
npm run lint
npm run typecheck
npm test              # Vitest: unit, API handler and component tests (no API credits needed; Gemini is mocked)
npm run build
npx playwright install chromium   # once
npm run test:e2e      # Playwright, desktop + mobile; Gemini responses are mocked
npm run sample-pdf    # regenerates public/sample-electricity-bill.pdf (fictional data)
```

## How it works

`POST /api/analyze` (Node runtime) → `lib/handler.ts` → `lib/analyze.ts`:

1. Validate size, extension, MIME, then the real `%PDF-` signature.
2. Extract text server-side with pdfjs; reject password-protected, corrupt, >3 page and scanned/empty PDFs.
3. Sanitize (`lib/privacy/sanitize.ts`): regex + label-context detection replaces emails, phones, labelled names, addresses, account/consumer/policy/invoice/government/bank IDs, Luhn-valid card numbers and long digit runs with typed placeholders (`[PERSON_1]`, `[ACCOUNT_ID_1]`…). Amounts, dates and units are kept. Repeated values get the same placeholder, and a verification pass fails closed if a detected value survives.
4. Only the sanitized text is sent to Gemini, as JSON-mode output validated by a strict Zod schema. The original PDF is never sent. The placeholder map never leaves the sanitizer.
5. Comparisons (difference, % change) are computed locally, only when both amounts exist.
6. Progress is streamed as real stage events (NDJSON); there are no fake percentages.

If sanitization fails, analysis stops. There is no unsanitized fallback. Nothing is stored; no database, accounts or file storage. Logs contain error codes only.

## Sample mode

- **Analyze the sample bill (real pipeline):** fetches `public/sample-electricity-bill.pdf` (fictional person and data) and runs it through the full pipeline, so it needs a working Gemini key.
- **View simulated sample result:** pre-written result, clearly labelled "Sample data… not produced by the AI". It is never shown automatically in place of a failed analysis; it is only offered.

## Limits and known limitations

- PDF only; **5 MB, 3 pages** (see `lib/config.ts`). Text longer than 40,000 characters is truncated and the result says so.
- **Scanned PDFs are not supported** (no OCR).
- **PII detection is heuristic.** It can miss unlabelled names, unusual ID formats and non-English labels, and can occasionally over-redact. Don't upload highly sensitive documents. We make no claim of anonymity.
- Gemini output is validated for shape, not truth. Summaries can be wrong; users are told to check the original. Contract/insurance results are informational, not advice.
- The rate limiter (`lib/rate-limit.ts`) is in-memory and per-instance. On serverless or multi-instance deployments, replace it with a shared store (e.g. Redis/Upstash) or edge rate limiting.
- Structured output uses Gemini JSON mode + Zod validation rather than a response schema, for model compatibility. Invalid output is rejected, not shown.
- Gemini was not exercised with a live key during development; the pipeline up to the Gemini call was exercised in a production build. Set a real key to verify end to end.
- Visual effects: the hero is a GPU particle document (`components/particles/engine.ts`, three.js). Particles live in a float texture and are pulled onto a signed-distance PDF sheet; a small GPU fluid simulation lets the pointer stir them. Counts: about 65k on desktop, 37k on tablet, 16k on mobile, with DPR capped at 1.75. It pauses off-screen, and all GPU resources are disposed on unmount. Without WebGL2 or float render targets it falls back to the lightweight 2D canvas field. Lenis smooth scroll is disabled for touch and reduced-motion users. `prefers-reduced-motion` shows a settled, static particle page and removes parallax and the scroll-linked sequence (static content is shown instead).

## Deployment notes

Needs a Node.js runtime (not Edge) because of pdfjs. `pdfjs-dist` is listed in `serverExternalPackages`. Set `GEMINI_API_KEY` and `GEMINI_MODEL` as server env vars; the route allows up to 60 s (`maxDuration`).

## Manual checklist

Widths 320 / 375 / 390 / 430 / 768 / 1024 / 1280 / 1440 / 1920: no horizontal scroll, readable headline, working menu, upload usable by touch. Tab through nav → upload → results (visible focus). Toggle OS "reduce motion". Try: non-PDF, >5 MB, >3 pages, password-protected, scanned PDF, missing API key, cancel mid-analysis.
