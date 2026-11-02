import { AlertTriangle } from "lucide-react";
import type { ErrorPayload } from "@/lib/errors";

interface Props {
  error: ErrorPayload;
  onRetry?: () => void;
  onSample?: () => void;
}

const SAMPLE_HINT = new Set(["API_KEY_MISSING", "API_KEY_INVALID", "AI_BUSY", "MODEL_NOT_SET", "MODEL_UNAVAILABLE", "AI_UNAVAILABLE", "RATE_LIMITED", "AI_TIMEOUT"]);

export function ErrorMessage({ error, onRetry, onSample }: Props) {
  return (
    <div role="alert" className="liquid-glass rounded-3xl bg-obsidian/70 p-5 sm:p-6">
      <div className="flex gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-neon" size={20} />
        <div className="min-w-0">
          <p className="text-ink">{error.message}</p>
          {error.detail && (
            <p className="mt-2 text-sm text-white/60">
              The server is using the model name: <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white">{error.detail}</code>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {error.retryable && onRetry && (
              <button type="button" onClick={onRetry} className="min-h-11 rounded-full bg-white px-5 text-sm font-medium text-black">
                Try again
              </button>
            )}
            {onSample && SAMPLE_HINT.has(error.code) && (
              <button type="button" onClick={onSample} className="liquid-glass min-h-11 rounded-full px-5 text-sm hover:bg-white/10">
                View simulated sample result
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
