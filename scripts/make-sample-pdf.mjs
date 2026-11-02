// Generates public/sample-electricity-bill.pdf (all data fictional). Run: node scripts/make-sample-pdf.mjs
import { writeFileSync } from "node:fs";

export const SAMPLE_LINES = [
  "SAMPLE DOCUMENT - FICTIONAL DATA",
  "Brightgrid Power Distribution Ltd - Electricity Bill",
  "",
  "Customer Name: Rahul Sharma",
  "Consumer Number: 1234567890",
  "Email: rahul.sharma@example.com",
  "Phone: +91 98765 43210",
  "Service Address: 14 Lake View Road, Pune, Maharashtra 411001",
  "",
  "Billing Period: 1 October 2026 - 31 October 2026",
  "Bill Date: 3 November 2026",
  "Due Date: 18 November 2026",
  "Units Consumed: 320 kWh",
  "",
  "Energy Charges: Rs 1,760.00",
  "Fixed Charges: Rs 250.00",
  "Fuel Adjustment Charge: Rs 190.00",
  "Electricity Duty: Rs 150.00",
  "Late Payment Surcharge (if paid after due date): 2% per month",
  "",
  "Total Payable: Rs 2,450.00",
  "Previous Bill Amount: Rs 2,180.00",
  "",
  "Pay online or at any authorised center before the due date to avoid surcharge.",
];

const esc = (s) => s.replace(/[\()]/g, "\$&");
const content = ["BT", "/F1 11 Tf", "14 TL", "50 790 Td", ...SAMPLE_LINES.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
const objs = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = [];
objs.forEach((o, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
offsets.forEach((o) => (pdf += `${String(o).padStart(10, "0")} 00000 n \n`));
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(new URL("../public/sample-electricity-bill.pdf", import.meta.url), pdf, "latin1");
console.log("wrote public/sample-electricity-bill.pdf");
