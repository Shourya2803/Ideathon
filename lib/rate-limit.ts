import { LIMITS } from "./config";

/**
 * Best-effort in-memory limiter. It only protects a single server instance;
 * behind multiple instances or serverless, use a shared store (see README).
 */
const hits = new Map<string, number[]>();

export function rateLimited(key: string, now = Date.now()): boolean {
  const { windowMs, maxRequests } = LIMITS.rateLimit;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= maxRequests) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return false;
}

export function resetRateLimit() {
  hits.clear();
}
