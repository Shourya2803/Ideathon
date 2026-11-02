import { LIMITS } from "../config";
import { AppError } from "../errors";

interface FileMeta {
  name: string;
  type: string;
  size: number;
}

/** Cheap checks on browser-supplied metadata. Real validation is `assertPdfSignature` + extraction. */
export function validateFileMeta(file: FileMeta): void {
  if (file.size === 0) throw new AppError("EMPTY_FILE");
  if (file.size > LIMITS.maxFileBytes) throw new AppError("FILE_TOO_LARGE");
  const extOk = /\.pdf$/i.test(file.name);
  // Some browsers send "" or octet-stream for PDFs, so the MIME check is lenient.
  const mimeOk = ["application/pdf", "application/x-pdf", "application/octet-stream", ""].includes(file.type);
  if (!extOk || !mimeOk) throw new AppError("UNSUPPORTED_TYPE");
}

/** Do not trust name or MIME: PDFs start with "%PDF-" within the first 1024 bytes. */
export function assertPdfSignature(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new AppError("EMPTY_FILE");
  if (bytes.byteLength > LIMITS.maxFileBytes) throw new AppError("FILE_TOO_LARGE");
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) throw new AppError("INVALID_PDF");
}
