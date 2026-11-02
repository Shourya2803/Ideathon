"use client";

import { ArrowUpRight, FileText, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState } from "react";
import { LIMIT_LABELS } from "@/lib/config";
import { AppError, toErrorPayload, type ErrorPayload } from "@/lib/errors";
import { validateFileMeta } from "@/lib/pdf/validate";
import { Magnetic } from "@/components/site/Magnetic";
import { ErrorMessage } from "@/components/ErrorMessage";

export type SampleKind = "bill" | "lab";

interface Props {
  file: File | null;
  disabled?: boolean;
  onFile: (file: File | null) => void;
  onAnalyze: () => void;
  onSampleResult: (kind: SampleKind) => void;
  onSamplePdf: () => void;
}

const formatSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function UploadArea({ file, disabled, onFile, onAnalyze, onSampleResult, onSamplePdf }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<ErrorPayload | null>(null);

  const accept = (f: File | undefined) => {
    if (!f) return;
    try {
      validateFileMeta(f);
    } catch (err) {
      setError(toErrorPayload(err instanceof AppError ? err.code : "UNEXPECTED"));
      return;
    }
    setError(null);
    onFile(f);
  };

  const clear = () => {
    setError(null);
    onFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files[0]);
        }}
        className={`liquid-glass-strong rounded-[2rem] bg-obsidian/70 transition-shadow duration-500 hover:shadow-[0_0_70px_-24px_rgba(124,63,230,0.7)] px-6 py-10 text-center transition-transform duration-500 sm:px-12 sm:py-14 ${
          dragging ? "scale-[1.02] ring-blend" : ""
        }`}
      >
        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, y: 20, rotateX: -30 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto flex max-w-md items-center gap-3 rounded-full bg-white/[0.06] py-2 pl-4 pr-2 text-left"
            >
              <FileText aria-hidden="true" className="shrink-0 text-electric-soft" size={20} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-white/50">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={clear}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="font-heading text-4xl italic sm:text-5xl">Drop the fine print here</p>
              <p className="mt-3 text-white/55">or choose a PDF from your device</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <label
            htmlFor={inputId}
            className={`liquid-glass inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full px-6 text-sm font-medium transition-colors hover:bg-white/10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-electric-soft ${
              disabled ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={disabled}
              onChange={(e) => accept(e.target.files?.[0])}
            />
            {file ? "Replace file" : "Browse files"}
          </label>
          <Magnetic>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={!file || disabled}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-medium text-black transition-all enabled:hover:bg-white/90 disabled:opacity-30"
            >
              Decode this document <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </Magnetic>
        </div>

        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-white/40">
          PDF · up to {LIMIT_LABELS.size} · up to {LIMIT_LABELS.pages} · text-based, not scans
        </p>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorMessage error={error} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="mr-1 text-white/45">No PDF handy?</span>
        <button type="button" onClick={onSamplePdf} disabled={disabled} className="liquid-glass min-h-11 rounded-full px-4 hover:bg-white/10 disabled:opacity-40">
          Analyze the sample bill (real pipeline)
        </button>
        <button type="button" onClick={() => onSampleResult("bill")} disabled={disabled} className="liquid-glass min-h-11 rounded-full px-4 hover:bg-white/10 disabled:opacity-40">
          View simulated sample result
        </button>
        <button type="button" onClick={() => onSampleResult("lab")} disabled={disabled} className="liquid-glass min-h-11 rounded-full px-4 hover:bg-white/10 disabled:opacity-40">
          Simulated lab report
        </button>
      </div>

      <p className="mx-auto mt-6 max-w-xl text-center text-xs text-white/45">
        Your document is processed to generate a summary. We remove detected personal information before sending relevant text
        to the AI provider. Automated detection is not perfect, so avoid uploading highly sensitive documents.
      </p>
    </div>
  );
}
