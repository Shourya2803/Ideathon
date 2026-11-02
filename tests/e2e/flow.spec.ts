import { expect, test } from "@playwright/test";

const mockResult = {
  type: "result",
  data: {
    analysis: {
      documentType: "invoice",
      documentTitle: "Mock invoice",
      summary: "A mocked summary for deterministic tests.",
      keyFacts: [],
      importantDates: [],
      importantClauses: [],
      warnings: [],
      recommendedActions: [],
      missingInformation: [],
      confidenceNotes: [],
    },
    meta: { source: "gemini", pages: 1, redactions: 3, truncated: false },
  },
};

test("landing page loads and CTA reaches the upload section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Read the fine print");
  await page.getByRole("link", { name: "Decode a document" }).first().click();
  await expect(page.getByRole("heading", { name: "Make sense of any document." })).toBeInViewport();
});

test("simulated sample result is labelled, and another PDF can be chosen", async ({ page }) => {
  await page.goto("/#decode");
  await page.getByRole("button", { name: /view simulated sample result/i }).click();
  await expect(page.getByText(/not produced by the AI/i).first()).toBeVisible();
  await page.getByRole("button", { name: /analyze another pdf/i }).click();
  await expect(page.getByRole("button", { name: /browse files|decode this document/i }).first()).toBeVisible();
});

test("invalid file shows an accessible error", async ({ page }) => {
  await page.goto("/#decode");
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.locator("#decode [role=alert]")).toContainText(/only pdf/i);
});

test("valid upload shows stages then the (mocked) analysis", async ({ page }) => {
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: [{ type: "stage", stage: "validating" }, { type: "stage", stage: "analyzing" }, mockResult].map((e) => JSON.stringify(e)).join("\n") + "\n",
    }),
  );
  await page.goto("/#decode");
  await page.locator('input[type="file"]').setInputFiles({ name: "bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 mock") });
  await page.getByRole("button", { name: /decode this document/i }).click();
  await expect(page.getByText("A mocked summary for deterministic tests.")).toBeVisible();
  await expect(page.getByText(/3 pieces of detected personal information/i)).toBeVisible();
});

test("server errors are shown with retry", async ({ page }) => {
  await page.route("**/api/analyze", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "API_KEY_MISSING", message: "AI analysis isn't configured on this server (missing API key). You can explore the sample document instead.", retryable: false } }) }),
  );
  await page.goto("/#decode");
  await page.locator('input[type="file"]').setInputFiles({ name: "bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 mock") });
  await page.getByRole("button", { name: /decode this document/i }).click();
  await expect(page.locator("#decode [role=alert]")).toContainText(/missing API key/i);
  await expect(page.getByRole("button", { name: /simulated sample result/i }).first()).toBeVisible();
});

test("no horizontal overflow and keyboard reaches the primary controls", async ({ page }) => {
  await page.goto("/");
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
  await page.keyboard.press("Tab"); // skip link
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});
