# Decoded

**Read the fine print before it costs you.**

People sign, pay, or skip things they don't understand, and it costs them money, health and opportunities. Decoded takes a PDF (an electricity bill, lab report, loan agreement, government scheme, insurance policy, exam syllabus, or anything else) and explains what matters in plain language. Personal information is stripped out **on the server** before any text reaches the AI.

It is a full-3D, animation-first web app: one persistent GPU particle world sits behind the whole site and reshapes itself as you scroll, and results are an interactive experience rather than a wall of cards.

> Informational summaries only. Not legal, financial or medical advice. Always check the original document.

---

## Contents

1. [Highlights](#highlights)
2. [Quick start](#quick-start)
3. [System architecture](#system-architecture)
4. [User journey](#user-journey)
5. [The analysis pipeline](#the-analysis-pipeline)
6. [Privacy pipeline](#privacy-pipeline)
7. [Streaming protocol](#streaming-protocol)
8. [Client state machine](#client-state-machine)
9. [Supported documents](#supported-documents)
10. [Deterministic maths vs. AI](#deterministic-maths-vs-ai)
11. [Interactive results](#interactive-results)
12. [The 3D particle world](#the-3d-particle-world)
13. [Error handling](#error-handling)
14. [Project structure](#project-structure)
15. [Testing](#testing)
16. [Deployment (Vercel)](#deployment-vercel)
17. [Accessibility and performance](#accessibility-and-performance)
18. [Limits and known limitations](#limits-and-known-limitations)
19. [Tech stack](#tech-stack)

---

## Highlights

| Area | What you get |
| --- | --- |
| **Understanding** | Plain-language summary, key facts, dates, charges, clauses, warnings, next steps and what's missing, adapted to the document type. |
| **Privacy** | Server-side text extraction, typed-placeholder redaction, fail-closed verification. The original PDF is never sent to the AI. No database, no accounts, no stored files. |
| **Trust** | Maths (comparisons, loan totals, lab range checks, what-if bills) is computed in code, never by the AI. Every AI answer is schema-validated server-side and again in the browser. |
| **Experience** | Morphing GPU particle world with a pointer-driven fluid simulation, a 3D flythrough of results, a WizTree-style treemap of where a bill's money goes, a what-if simulator, and a document X-ray that pins every finding to the original page. |
| **Honesty** | Real stage-by-stage progress (no fake percentages). Sample data is always labelled and never shown in place of a failed analysis. |

---

## Quick start

**Requirements:** Node.js 22+, npm, a Gemini API key.

```bash
npm install                       # also copies the pdf.js worker into public/ (postinstall)
cp .env.example .env.local        # then fill in the two values
npm run dev                       # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Server-side only. Never prefixed with `NEXT_PUBLIC_`, never sent to the browser. |
| `GEMINI_MODEL` | yes | A model id your key can use (for example `gemini-2.5-flash`; check the [models list](https://ai.google.dev/gemini-api/docs/models)). Deliberately **not** hardcoded. |

Without them the site still loads: uploading returns a clear "AI not configured" message and the labelled simulated samples are available.

### Commands

```bash
npm run dev            # development server
npm run build          # production build
npm start              # run the production build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest: unit, handler and component tests (Gemini mocked, no credits needed)
npx playwright install chromium   # once
npm run test:e2e       # Playwright, desktop + mobile (Gemini responses mocked)
npm run sample-pdf     # regenerate public/sample-electricity-bill.pdf (fictional data)
```

---

## System architecture

```mermaid
flowchart LR
    subgraph Browser["Browser (client)"]
        UI["Next.js UI<br/>React + Motion + Lenis"]
        WEBGL["Particle world<br/>three.js, WebGL2"]
        XRAY["X-ray renderer<br/>pdf.js, in-browser only"]
        CALC["Interactive tools<br/>treemap, what-if, calendar"]
    end

    subgraph Server["Next.js server (Node runtime)"]
        ROUTE["POST /api/analyze"]
        HANDLER["handler.ts<br/>request checks, rate limit, streaming"]
        PIPE["analyze.ts<br/>pipeline orchestrator"]
        PDF["pdf/<br/>validate + extract"]
        SAN["privacy/sanitize.ts<br/>PII redaction"]
        AI["ai/<br/>prompt + Gemini client + parser"]
        DERIVE["calc.ts<br/>deterministic maths"]
    end

    GEMINI[("Google Gemini API")]

    UI -- "multipart PDF" --> ROUTE
    ROUTE --> HANDLER --> PIPE
    PIPE --> PDF --> SAN --> AI
    AI -- "sanitized text only" --> GEMINI
    GEMINI -- "JSON" --> AI
    AI --> DERIVE
    PIPE -- "NDJSON stage events + result" --> UI
    UI --> WEBGL
    UI --> XRAY
    UI --> CALC

    classDef secret fill:#3b1020,stroke:#ff304f,color:#fff;
    classDef safe fill:#0f2447,stroke:#2563eb,color:#fff;
    class SAN,GEMINI secret;
    class PDF,AI,DERIVE,PIPE,HANDLER,ROUTE safe;
```

**Key boundaries**

- The browser only ever talks to `/api/analyze`. The Gemini key lives on the server.
- Raw extracted text never leaves `analyze.ts`; only the sanitized text goes to Gemini.
- The X-ray view redraws the original PDF **in the user's browser**; it is not uploaded anywhere new.

---

## User journey

```mermaid
flowchart TD
    A(["Visit the site"]) --> B["Hero: a PDF page forms from particles"]
    B --> C["Scroll: the problem, as a shapeless particle cloud"]
    C --> D["Scroll: one 3D form per document type<br/>bolt, flask, coins, building, shield, book"]
    D --> E["How it works + Privacy"]
    E --> F["Upload section"]
    F --> G{"How do you start?"}
    G -- "Drop or browse a PDF" --> H["Client-side check<br/>type, size, name"]
    G -- "Analyze the sample bill" --> H
    G -- "Simulated sample result" --> S["Labelled sample data<br/>no AI involved"]
    H -- "invalid" --> HE["Accessible error message"]
    HE --> F
    H -- "valid" --> P["Decoding panel<br/>pages fly through rings into the decoder"]
    P --> Q{"Server result"}
    Q -- "error" --> R["Error with retry or sample option"]
    R --> F
    Q -- "success" --> V["Results"]
    S --> V
    V --> M{"View mode"}
    M -- "3D story" --> ST["Flythrough of result chapters<br/>particles become the document-type shape"]
    M -- "X-ray" --> XR["Original page with pinned findings"]
    ST --> ACT["Actions<br/>calendar export, what-if, analyze another"]
    XR --> ACT
    ACT --> F
```

---

## The analysis pipeline

Everything between "file received" and "validated result" runs in `lib/handler.ts` and `lib/analyze.ts`. Each box maps to a module.

```mermaid
flowchart TD
    REQ(["POST /api/analyze"]) --> RL{"Rate limit<br/>6 per minute per IP"}
    RL -- "exceeded" --> E429["429 RATE_LIMITED"]
    RL -- "ok" --> CL{"Content-Length<br/>over limit?"}
    CL -- "yes" --> E413["413 FILE_TOO_LARGE"]
    CL -- "no" --> CT{"multipart/form-data<br/>with a file field?"}
    CT -- "no" --> E400["400 NO_FILE"]
    CT -- "yes" --> META{"validateFileMeta<br/>size, .pdf name, MIME"}
    META -- "empty" --> E400b["400 EMPTY_FILE"]
    META -- "too big" --> E413b["413 FILE_TOO_LARGE"]
    META -- "wrong type" --> E415["415 UNSUPPORTED_TYPE"]
    META -- "ok" --> KEY{"Gemini client<br/>key and model set?"}
    KEY -- "no" --> E503["503 API_KEY_MISSING<br/>or MODEL_UNAVAILABLE"]
    KEY -- "yes" --> STREAM["Open NDJSON stream"]

    STREAM --> S1["stage: validating<br/>real %PDF- signature check"]
    S1 -- "not a PDF" --> X1["error INVALID_PDF"]
    S1 --> S2["stage: extracting<br/>pdf.js text extraction"]
    S2 -- "password" --> X2["error PASSWORD_PROTECTED"]
    S2 -- "corrupt" --> X1
    S2 -- "over 3 pages" --> X3["error TOO_MANY_PAGES"]
    S2 -- "no usable text" --> X4["error SCANNED_PDF"]
    S2 --> S3["stage: protecting<br/>sanitizeText"]
    S3 -- "any failure" --> X5["error SANITIZATION_FAILED<br/>AI is never called"]
    S3 --> S4["stage: analyzing<br/>Gemini, 45 s timeout"]
    S4 -- "bad key / model / rate / timeout / outage" --> X6["mapped provider error"]
    S4 --> PARSE{"Zod schema<br/>validation"}
    PARSE -- "invalid" --> X7["error INVALID_AI_RESPONSE"]
    PARSE -- "valid" --> S5["stage: preparing<br/>drop placeholder-only facts<br/>compute derived values"]
    S5 --> DONE(["result event"])
```

> Failures **before** the stream opens return a normal HTTP status. Failures **inside** the stream arrive as a single `error` event (the HTTP status is already 200) and carry the same user-facing message and `retryable` flag.

---

## Privacy pipeline

The sanitizer (`lib/privacy/sanitize.ts`) is the most important safety component. It is **fail-closed**: if anything goes wrong, analysis stops and nothing is sent to the AI.

```mermaid
flowchart TD
    IN["Extracted text"] --> T["Cap at 40,000 chars<br/>flag truncated if cut"]
    T --> P1["1. Emails"]
    P1 --> P2["2. Labelled values, by rule<br/>address, postal code, policy / invoice / government / bank / account IDs,<br/>phone numbers, person names"]
    P2 --> P3["3. Patterns<br/>Luhn-valid card numbers, Aadhaar, PAN, SSN, IBAN,<br/>international / US / Indian-mobile phones"]
    P3 --> P4["4. Conservative fallback<br/>long bare digit runs, 9+ digits, become IDs"]
    P4 --> P5["5. Propagate<br/>mask every other occurrence of each detected value,<br/>plus name parts of 4+ letters"]
    P5 --> V{"6. Verify"}
    V -- "email, card or detected value still present" --> FAIL["throw SANITIZATION_FAILED"]
    V -- "clean" --> OUT["Sanitized text with typed placeholders<br/>PERSON_1, EMAIL_1, ACCOUNT_ID_1 ..."]
    FAIL --> STOP(["Stop. Nothing is sent to the AI."])
    OUT --> AIOK(["Sent to Gemini"])

    KEEP["Kept on purpose: amounts, dates, units, charges, clauses"] -.-> OUT
```

Example:

| Before | After |
| --- | --- |
| `Customer Name: Rahul Sharma` | `Customer Name: [PERSON_1]` |
| `Email: rahul@example.com` | `Email: [EMAIL_1]` |
| `Consumer Number: 1234567890` | `Consumer Number: [ACCOUNT_ID_1]` |
| `Total Payable: Rs 2,450.00` | `Total Payable: Rs 2,450.00` (unchanged) |

The placeholder map never leaves the sanitizer and is never restored in the UI. The model is also told to treat the document as **untrusted data** and ignore any instructions inside it (prompt-injection defence), and not to list placeholders as facts.

---

## Streaming protocol

Analysis can take several seconds, so the server streams newline-delimited JSON. The UI shows the stage the server actually reports, with no timers or fake percentages.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as Browser UI
    participant S as /api/analyze
    participant P as Pipeline
    participant G as Gemini

    U->>UI: Choose PDF, press Decode
    UI->>UI: validateFileMeta (instant feedback)
    UI->>S: POST multipart/form-data (AbortController)
    S->>S: rate limit, size, type, key checks
    alt request rejected
        S-->>UI: HTTP 4xx/5xx + JSON error
        UI-->>U: Accessible error message
    else accepted
        S-->>UI: 200 application/x-ndjson
        S->>P: runAnalysis(bytes)
        P-->>UI: {"type":"stage","stage":"validating"}
        P-->>UI: {"type":"stage","stage":"extracting"}
        P-->>UI: {"type":"stage","stage":"protecting"}
        P-->>UI: {"type":"stage","stage":"analyzing"}
        P->>G: sanitized text + system instruction
        G-->>P: JSON answer
        P->>P: Zod validation, derived values
        P-->>UI: {"type":"stage","stage":"preparing"}
        P-->>UI: {"type":"result","data":{...}}
        UI->>UI: re-validate with Zod
        UI-->>U: 3D results
    end
    opt user presses Cancel
        UI->>S: abort the request
        UI-->>U: back to the upload form
    end
```

---

## Client state machine

`components/Analyzer.tsx` owns one small state machine. It also tells the 3D world what to do for each state.

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> processing: Decode (file or sample PDF)
    idle --> done: Simulated sample (no AI)
    processing --> done: result event
    processing --> error: error event or network failure
    processing --> idle: Cancel
    error --> processing: Try again
    error --> done: View simulated sample
    error --> idle: Choose another file
    done --> idle: Analyze another PDF

    state done {
        [*] --> story
        story --> xray: X-ray the document
        xray --> story: 3D story
    }

    note right of idle: Particles form a PDF page beside the panel
    note right of processing: Soft dust behind the vortex animation
    note right of done: Particles form the document-type shape
```

---

## Supported documents

The model picks a category and **never forces** an unknown document into one (it falls back to `other`). Each category unlocks its own sections.

```mermaid
flowchart LR
    DOC(["Classified document"]) --> EB["Electricity bill"]
    DOC --> LR["Lab report"]
    DOC --> LA["Loan agreement"]
    DOC --> GS["Government scheme"]
    DOC --> IP["Insurance policy"]
    DOC --> ES["Exam syllabus"]
    DOC --> OT["Invoice, contract, other"]

    EB --> EB1["Total, due date, usage<br/>charge treemap<br/>vs. last bill<br/>what-if simulator"]
    LR --> LR1["Each test in plain words<br/>value vs. printed range<br/>out-of-range flags"]
    LA --> LA1["Rate, EMI, tenure<br/>total repayment and interest<br/>fees, prepayment, late terms"]
    GS --> GS1["Eligibility checklist<br/>documents to keep ready<br/>deadlines"]
    IP --> IP1["Coverage and limits<br/>exclusions, waiting periods<br/>renewal conditions"]
    ES --> ES1["Units and topics<br/>weightage and marks<br/>exam dates"]
    OT --> OT1["Key facts, dates<br/>clauses and warnings<br/>general summary"]

    EB -.-> SB["3D shape: lightning bolt"]
    LR -.-> SF["3D shape: lab flask"]
    LA -.-> SC["3D shape: coin stack"]
    GS -.-> SP["3D shape: government building"]
    IP -.-> SS["3D shape: shield"]
    ES -.-> SK["3D shape: open book"]
    OT -.-> SH["3D shape: document page"]
```

Rules baked into the prompt:

- **Lab reports:** copy values, units and ranges exactly as printed; explain what each test measures; never diagnose or suggest treatment.
- **Government schemes:** list each criterion separately; never decide whether the reader qualifies.
- **Contracts, loans, insurance:** informational summary only; only suggest actions the document itself supports.
- **Everywhere:** use only what the text supports, omit what isn't stated, and list gaps under "missing information".

---

## Deterministic maths vs. AI

The AI reads and explains. Code does the arithmetic. This keeps numbers trustworthy.

```mermaid
flowchart TD
    AIJ["AI returns structured facts<br/>stated amounts, dates, rates, ranges"] --> Z{"Zod validation"}
    Z -- "invalid" --> REJ["Rejected, never shown"]
    Z -- "valid" --> D["calc.ts / insights.ts"]

    D --> C1["Bill comparison<br/>needs current and previous amount<br/>difference and percent change"]
    D --> C2["Loan cost<br/>needs EMI and tenure<br/>repayment = EMI x months<br/>interest only if principal stated"]
    D --> C3["Lab range check<br/>needs a numeric value and a numeric range<br/>below, within, above"]
    D --> C4["Usage what-if<br/>needs units, energy charge and total<br/>rate = energy charge / units"]
    D --> C5["Calendar export<br/>single-day dates only<br/>ranges are skipped"]

    C1 --> G1{"Inputs present?"}
    C2 --> G1
    C3 --> G1
    C4 --> G1
    C5 --> G1
    G1 -- "no" --> NONE["Show nothing<br/>never invent a value"]
    G1 -- "yes" --> SHOW["Show, labelled calculated, not AI-estimated"]
```

---

## Interactive results

Cards alone are what every summariser does, so results have two views.

### 3D story

Results float out of the document as glass chapters. Scrolling flies the camera through them; each chapter has a resting zone where it sits perfectly flat and sharp. A side navigation jumps between chapters. Long chapters scroll inside their own frame.

```mermaid
flowchart LR
    R["Validated result"] --> B["buildChapters()"]
    B --> O["Overview"]
    B --> K["Key information"]
    B --> M["Where the money goes<br/>treemap"]
    B --> W["What if...<br/>simulator"]
    B --> L["The real cost / Your results /<br/>Who it's for / What to study"]
    B --> DT["Important dates<br/>calendar export"]
    B --> CL["Conditions and warnings"]
    B --> AC["What you can do"]
    B --> LM["Limitations"]
    O --> FLY["3D flythrough<br/>scroll position drives card depth"]
    K --> FLY
    M --> FLY
    W --> FLY
    L --> FLY
    DT --> FLY
    CL --> FLY
    AC --> FLY
    LM --> FLY
```

Empty sections are hidden, never shown blank.

### Bill treemap and what-if simulator

- **Treemap:** every charge is a block sized by its share of the bill (squarified layout), with a headline like "Energy Charges takes 72% of your bill". Tap a block for its plain-English meaning.
- **What-if:** drag the units slider and watch the bill recalculate from the bill's own rate. Presets for -25%, -10%, as billed and +20%. It only appears when the bill states consumption, an energy charge and a total, and it says plainly that it is an estimate.

### X-ray: "show me where it says that"

The original PDF is rendered in the browser and every finding is pinned to the exact text on the page. Hover or tap a highlight for its explanation; click a finding in the list to jump to it.

```mermaid
flowchart TD
    SRC["Original PDF file<br/>(kept in the browser tab only)"] --> PJ["pdf.js renders pages to canvas<br/>and records every text run's position"]
    RES["Analysis result"] --> F["findingsFor()<br/>facts, charges, dates, lab values, clauses, warnings"]
    F --> N["Each finding gets search needles<br/>source excerpt, value, label"]
    PJ --> LOC["locate()<br/>normalize case, quotes, dashes, spacing<br/>match across several text runs"]
    N --> LOC
    LOC --> H{"Found on a page?"}
    H -- "yes" --> HL["Glowing highlight on the page<br/>blue money, violet dates, cyan facts, red warnings"]
    H -- "no" --> NP["Listed as not pinned<br/>worded differently"]
    HL --> INT["Hover, focus or tap: explanation bubble<br/>both directions between list and page"]
```

Needles that contain privacy placeholders are never used. The X-ray is available when the original PDF is known (a file you uploaded, or the sample bill).

---

## The 3D particle world

One persistent GPU particle system (about 65k particles on desktop, 37k on tablet, 16k on phones) sits behind the whole page. Sections tell it what to become through a tiny shared store.

```mermaid
flowchart TD
    subgraph Sections["Page sections (components/site, Analyzer)"]
        H["Hero"] -->|"sheet"| ST
        PR["Problem"] -->|"sheet + chaos"| ST
        DTY["Document types<br/>scroll scrubs 6 shapes"] -->|"bolt flask coins pillars shield book"| ST
        HW["How it works"] -->|"sheet + scan"| ST
        PV["Privacy"] -->|"lock"| ST
        AN["Analyzer<br/>idle, processing, done"] -->|"sheet or type shape"| ST
    end

    ST[("scene store<br/>shape, position, size, chaos, scan, glow<br/>desktop + portrait placements")] --> ENG

    subgraph ENG["engine.ts: one frame"]
        direction TB
        F1["Pointer to fluid splats<br/>velocity + density"] --> F2["Fluid step<br/>curl, vorticity, divergence,<br/>pressure x5, advect"]
        F2 --> F3["Particle simulation pass<br/>reads positions texture"]
        F3 --> F4["Curl-noise drift"]
        F4 --> F5["Pull onto the active shape's<br/>signed-distance field"]
        F5 --> F6["Spring toward home position"]
        F6 --> F7["Fluid push where the pointer swept"]
        F7 --> F8["Write new positions texture"]
        F8 --> F9["Draw points<br/>additive, blue to violet to red"]
    end
```

How it stays fast and safe:

- Particle positions live in a float texture and are updated by a fullscreen shader pass, so the CPU does almost nothing per frame.
- One tiny shader program per shape, compiled in the background after the intro, so the first morph doesn't stutter.
- Pauses when the tab is hidden; disposes all GPU resources on unmount; pixel ratio capped at 1.75.
- No WebGL2 or float render targets: a soft static gradient is shown and the site works identically.
- `prefers-reduced-motion`: the world settles once per section and stops animating; scroll-linked sequences become static content.
- Lenis smooth scrolling is turned off for touch devices and reduced-motion users.

---

## Error handling

Every failure has a code, an HTTP status (when raised before streaming), a plain message and a `retryable` flag. Messages never include stack traces, prompts, keys or document content, and logs record error codes only.

```mermaid
flowchart LR
    subgraph Input["Input problems (not retryable)"]
        e1["NO_FILE 400"]
        e2["EMPTY_FILE 400"]
        e3["UNSUPPORTED_TYPE 415"]
        e4["FILE_TOO_LARGE 413"]
        e5["TOO_MANY_PAGES 422"]
        e6["INVALID_PDF 422"]
        e7["PASSWORD_PROTECTED 422"]
        e8["SCANNED_PDF 422"]
    end
    subgraph Config["Configuration (fix on the server)"]
        c1["API_KEY_MISSING 503"]
        c2["API_KEY_INVALID 503"]
        c3["MODEL_UNAVAILABLE 503"]
    end
    subgraph Transient["Transient (retryable)"]
        t1["RATE_LIMITED 429"]
        t2["AI_BUSY 503"]
        t3["AI_TIMEOUT 504"]
        t4["AI_UNAVAILABLE 502"]
        t5["INVALID_AI_RESPONSE 502"]
        t6["SANITIZATION_FAILED 500"]
        t7["NETWORK / CANCELLED / UNEXPECTED"]
    end

    Input --> U1["Message + choose another file"]
    Config --> U2["Message + offer the labelled simulated sample"]
    Transient --> U3["Message + Try again button<br/>+ simulated sample for AI outages"]
```

Provider mapping: HTTP 429 becomes `RATE_LIMITED`, 503 becomes `AI_BUSY`, 404 becomes `MODEL_UNAVAILABLE`, 401/403 or a 400 mentioning the API key becomes the key errors, and an abort or 408/504 becomes `AI_TIMEOUT`. Anything else is `AI_UNAVAILABLE`.

The app **never silently replaces** a failed analysis with fake data. The simulated sample is only ever offered, always labelled, and never presented as AI output.

---

## Project structure

```text
decoded/
├── app/
│   ├── api/analyze/route.ts      # Node-runtime route, thin wrapper over lib/handler
│   ├── layout.tsx                # fonts, Lenis, film grain, skip link
│   ├── page.tsx                  # section order + scene canvas
│   └── globals.css               # design tokens, liquid glass, utilities
├── components/
│   ├── scene/                    # persistent 3D world
│   │   ├── engine.ts             #   GPU particles + fluid simulation + SDF shapes
│   │   ├── store.ts              #   shapes and the section-to-scene store
│   │   └── SceneCanvas.tsx       #   mounts the engine, handles fallback
│   ├── site/                     # landing sections
│   │   ├── Hero.tsx  Problem.tsx  DocumentTypes.tsx
│   │   ├── InfoSections.tsx      #   how it works, privacy
│   │   ├── CtaFooter.tsx         #   HLS video CTA + footer
│   │   └── motion.tsx            #   MaskWords, Reveal
│   ├── results/
│   │   ├── ResultsView.tsx       # 3D flythrough + all chapters
│   │   ├── MoneyTreemap.tsx      # WizTree-style charge map
│   │   ├── UsageSimulator.tsx    # what-if bill
│   │   └── XRayView.tsx          # findings pinned on the original page
│   ├── reactbits/                # BlurText, ShinyText, CountUp (vendored React Bits)
│   ├── Analyzer.tsx              # state machine for upload / decode / results
│   ├── UploadArea.tsx  ProcessingState.tsx  DocumentVortex.tsx
│   ├── ErrorMessage.tsx  Navigation.tsx  LenisProvider.tsx
├── lib/
│   ├── handler.ts                # request checks, rate limit, NDJSON stream
│   ├── analyze.ts                # the pipeline orchestrator
│   ├── pdf/                      # validate.ts, extract.ts
│   ├── privacy/sanitize.ts       # PII detection and redaction
│   ├── ai/                       # prompt.ts, gemini.ts (client, errors, parser)
│   ├── calc.ts                   # comparison, loan cost, lab ranges
│   ├── insights.ts               # treemap layout, what-if, .ics, X-ray matching
│   ├── client.ts                 # browser NDJSON reader + re-validation
│   ├── errors.ts  config.ts  rate-limit.ts  sample.ts
├── types/analysis.ts             # Zod schema + shared types
├── tests/                        # Vitest + Testing Library + Playwright e2e
├── scripts/                      # sample PDF generator, pdf.js worker copy
└── public/                       # sample-electricity-bill.pdf, pdf.worker.min.mjs
```

Central limits live in one place, `lib/config.ts`:

| Setting | Value |
| --- | --- |
| Max file size | 5 MB |
| Max pages | 3 |
| Max text sent to AI | 40,000 characters (truncation is disclosed) |
| Minimum text per page | 40 characters (below this is treated as a scan) |
| Gemini timeout | 45 seconds |
| Rate limit | 6 requests per minute per IP (in-memory) |
| Route max duration | 60 seconds |

---

## Testing

```mermaid
flowchart BT
    E2E["Playwright e2e, 12 runs<br/>6 flows x desktop + mobile<br/>landing, CTA, samples, bad file,<br/>mocked analysis, error + retry, overflow, keyboard"]
    COMP["Component tests<br/>upload, processing, errors, results,<br/>lab ranges, nav menu, XSS safety"]
    API["Handler and pipeline tests<br/>bad requests, oversize, rate limit,<br/>missing key, streaming stages, no raw text to AI"]
    UNIT["Unit tests<br/>validation, PDF extraction (real pdf.js), sanitizer,<br/>calc, schema, treemap, what-if, calendar, X-ray matching"]
    UNIT --> API --> COMP --> E2E
```

- **58** Vitest tests run in about a second or two, with Gemini mocked so no credits are needed.
- **12** Playwright runs (6 flows, desktop and Pixel 5 mobile) use a mocked analysis response for determinism.
- Notable guarantees under test: the sanitizer runs **before** the AI call; sanitization failure means the AI is never called; invalid AI output is rejected; AI text is rendered as text, never HTML; comparisons, loan totals and range checks never appear without their inputs.

Live Gemini was verified separately by running the bundled sample bill end to end.

Manual checklist: widths 320, 375, 390, 430, 768, 1024, 1280, 1440, 1920 with no horizontal scroll and a working menu; tab through nav, upload and results with visible focus; toggle OS "reduce motion"; try a non-PDF, a file over 5 MB, over 3 pages, a password-protected PDF, a scanned PDF, a missing API key, and cancelling mid-analysis.

---

## Deployment (Vercel)

```mermaid
flowchart TD
    A["Push to GitHub main"] --> B["Vercel clones the repo"]
    B --> C["npm install<br/>postinstall copies the pdf.js worker to public/"]
    C --> D{"Dependency conflict?"}
    D -- "yes" --> DX["Build fails<br/>(@types/node is pinned to ^22 for vitest's peer range)"]
    D -- "no" --> E["next build"]
    E --> F["Static pages + the /api/analyze function"]
    F --> G{"Env vars set?<br/>GEMINI_API_KEY, GEMINI_MODEL"}
    G -- "no" --> GX["Site loads, uploads return<br/>'AI not configured'"]
    G -- "yes" --> H(["Live: full analysis works"])
```

Checklist:

1. Set `GEMINI_API_KEY` and `GEMINI_MODEL` under **Project → Settings → Environment Variables** (Production). `.env` files are git-ignored, so Vercel can't see your local ones.
2. The analyze route needs the **Node.js runtime** (not Edge) because of pdf.js. `pdfjs-dist` is listed in `serverExternalPackages` in `next.config.ts`.
3. The route requests up to 60 seconds (`maxDuration`). The free Hobby plan caps functions at that, and the Gemini call times out at 45 seconds, so it fits, but a slow model response can still fail.
4. The in-memory rate limiter is per instance. On serverless it only slows casual abuse; use a shared store (for example Redis/Upstash) or platform rate limiting for anything public.
5. The HLS background video in the footer streams from Mux and loads only when the footer is near the viewport.

---

## Accessibility and performance

- Semantic headings and landmarks, skip link, visible focus rings, labelled controls, `aria-live` stage updates, and `role="alert"` errors.
- Animated headings keep real text for screen readers; animated numbers keep the final value available to assistive tech.
- Every interactive tool (treemap blocks, X-ray highlights, sliders, view switch, chapter list) is keyboard-operable.
- Mobile-first layout with no horizontal overflow at 320 px, touch-sized controls, and phone-specific particle placement.
- Heavy work stays off the main thread where possible: particle simulation on the GPU, pdf.js text extraction on the server, X-ray rendering lazily loaded only when you open that view.

---

## Limits and known limitations

- **PDF only**, text-based: 5 MB, 3 pages. **Scanned PDFs are not supported** (no OCR yet).
- **PII detection is heuristic.** It can miss names that aren't labelled, unusual ID formats and non-English labels, and can occasionally over-redact. Don't upload highly sensitive documents. Decoded makes no claim of anonymity.
- **AI output is validated for shape, not truth.** Summaries can be wrong. Users are told to check the original.
- **Lab results** are explained, not diagnosed. **Government schemes**: criteria are listed, eligibility is not decided. **Loans, contracts, insurance**: informational only.
- **What-if bills** assume non-energy charges stay fixed; usage-linked charges (duty, fuel adjustment) may move too. It is labelled an estimate.
- **X-ray** pins a finding only when its text can be located on the page; reworded findings appear in the list as "not pinned". It shows up to the first 3 pages.
- Calendar export includes only single-day dates; date ranges are skipped.
- Structured output uses Gemini's JSON mode plus Zod validation rather than a response schema, for model compatibility. Invalid output is rejected, not shown.
- The rate limiter is in-memory and per instance (see Deployment).
- Free-tier Gemini keys have low request-per-minute quotas; "Too many requests" means wait a minute or try a lighter model.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router), React, TypeScript (strict) |
| Styling | Tailwind CSS 4; Instrument Serif and Barlow; custom liquid-glass utilities |
| 3D and motion | three.js (GPU particles and fluid), Motion for React, Lenis, React Bits (`BlurText`, `ShinyText`, `CountUp`) |
| Video | hls.js (footer background stream) |
| AI | Google Gemini via `@google/genai`, JSON mode |
| PDF | `pdfjs-dist` (server extraction and in-browser X-ray) |
| Validation | Zod |
| Tests | Vitest, React Testing Library, Playwright |
| Icons | Lucide |

Brand palette: Obsidian `#050505`, Electric Blue `#2563EB`, Neon Red `#FF304F`, blended through violet.
