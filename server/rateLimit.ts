/**
 * Fixed-window in-memory rate limiter. Good enough for a single-process deployment; a
 * multi-instance deployment needs a shared store (see docs/security.md).
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (t >= v.resetAt) hits.delete(k);
      }
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
}
