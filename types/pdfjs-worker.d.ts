// pdf.js ships types for its main build but not for the worker entry we import for serverless bundling.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
