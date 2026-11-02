// Copies the pdf.js worker into public/ so the browser-side X-ray view can load it.
// Runs on postinstall to stay in sync with the installed pdfjs-dist version.
import { copyFileSync } from "node:fs";
copyFileSync(new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), new URL("../public/pdf.worker.min.mjs", import.meta.url));
console.log("copied pdf.worker.min.mjs to public/");
