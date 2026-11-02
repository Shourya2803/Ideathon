import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // pdfjs-dist must be loaded natively by Node, not bundled.
  serverExternalPackages: ["pdfjs-dist"],
  // Belt and braces for serverless (Vercel): make sure pdf.js's worker, character maps and standard
  // fonts are shipped with the analyze function. They are looked up by path at runtime, so automatic
  // file tracing can miss them, which breaks PDF reading in production only.
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
