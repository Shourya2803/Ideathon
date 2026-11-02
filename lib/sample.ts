import { deriveAll } from "./calc";
import { analysisSchema, type AnalysisResponse } from "@/types/analysis";

/**
 * Pre-written demo result for the fictional bill in public/sample-electricity-bill.pdf.
 * It is NOT AI output and is labelled as sample data wherever it is shown.
 */
export function getSampleResult(): AnalysisResponse {
  const analysis = analysisSchema.parse({
    documentType: "electricity_bill",
    documentTitle: "Electricity bill — October 2026 (sample)",
    summary:
      "This is a monthly electricity bill for 1–31 October 2026. The total to pay is Rs 2,450, due on 18 November 2026. You used 320 kWh. Most of the amount is the energy charge for the electricity you used; the rest is a fixed charge, a fuel adjustment and a government duty.",
    keyFacts: [
      { label: "Total payable", value: "Rs 2,450.00", sourceExcerpt: "Total Payable: Rs 2,450.00" },
      { label: "Units consumed", value: "320 kWh", explanation: "A kWh (kilowatt-hour) is the unit electricity is billed in.", sourceExcerpt: "Units Consumed: 320 kWh" },
      { label: "Billing period", value: "1 Oct 2026 – 31 Oct 2026" },
    ],
    importantDates: [
      { label: "Bill date", date: "3 November 2026" },
      { label: "Payment due", date: "18 November 2026", note: "A late payment surcharge applies after this date." },
    ],
    financialBreakdown: {
      currency: "Rs",
      items: [
        { label: "Energy charges", amount: 1760, explanation: "The cost of the electricity you used." },
        { label: "Fixed charges", amount: 250, explanation: "A flat monthly charge for being connected, regardless of usage." },
        { label: "Fuel adjustment charge", amount: 190, explanation: "Adjusts for changes in the cost of fuel used to generate power." },
        { label: "Electricity duty", amount: 150, explanation: "A tax collected on electricity consumption." },
      ],
      totalPayable: 2450,
      previousAmount: 2180,
      previousLabel: "Previous bill",
      consumption: { value: 320, unit: "kWh" },
    },
    importantClauses: [
      {
        title: "Late payment surcharge",
        kind: "penalty",
        plainExplanation: "If you pay after the due date you will be charged an extra 2% per month.",
        sourceExcerpt: "Late Payment Surcharge (if paid after due date): 2% per month",
      },
    ],
    warnings: [],
    recommendedActions: ["Pay online or at an authorised center before 18 November 2026 to avoid the surcharge."],
    missingInformation: ["The bill does not state the per-unit tariff rate, so the energy charge can't be checked against units used."],
    confidenceNotes: ["This is a simulated result for demonstration. It was not produced by the AI."],
  });
  const derived = deriveAll(analysis);
  return {
    analysis,
    comparison: derived.comparison,
    derived,
    meta: { source: "sample", pages: 1, redactions: 0, truncated: false },
  };
}

/** Pre-written demo result for a fictional blood test. NOT AI output; labelled as sample data. */
export function getSampleLabResult(): AnalysisResponse {
  const analysis = analysisSchema.parse({
    documentType: "lab_report",
    documentTitle: "Complete blood count & lipid profile (sample)",
    summary:
      "This is a routine blood test with a blood count and a cholesterol panel. Most values are inside the lab's printed reference ranges. LDL cholesterol and haemoglobin fall outside their ranges. This summary only explains what each test measures; it is not a diagnosis, so take these results to your doctor.",
    keyFacts: [
      { label: "Tests reported", value: "6" },
      { label: "Report type", value: "Blood test (CBC + lipid profile)" },
    ],
    importantDates: [{ label: "Sample collected", date: "28 October 2026" }],
    labResults: [
      { test: "Haemoglobin", value: "11.6", unit: "g/dL", referenceRange: "12.0 - 15.5", flagInDocument: "L", explanation: "The protein in red blood cells that carries oxygen." },
      { test: "White blood cells", value: "7.2", unit: "×10³/µL", referenceRange: "4.0 - 11.0", explanation: "Cells that fight infection." },
      { test: "Platelets", value: "265", unit: "×10³/µL", referenceRange: "150 - 410", explanation: "Cell fragments that help blood clot." },
      { test: "Total cholesterol", value: "196", unit: "mg/dL", referenceRange: "< 200", explanation: "All cholesterol in the blood." },
      { test: "LDL cholesterol", value: "142", unit: "mg/dL", referenceRange: "< 130", flagInDocument: "H", explanation: "Often called 'bad' cholesterol." },
      { test: "HDL cholesterol", value: "52", unit: "mg/dL", referenceRange: "> 40", explanation: "Often called 'good' cholesterol." },
    ],
    recommendedActions: ["Share this report with your doctor, especially the haemoglobin and LDL values."],
    missingInformation: ["The report doesn't say whether the sample was taken fasting, which can affect cholesterol values."],
    confidenceNotes: ["This is a simulated result for demonstration. It was not produced by the AI."],
  });
  return {
    analysis,
    derived: deriveAll(analysis),
    meta: { source: "sample", pages: 1, redactions: 0, truncated: false },
  };
}
