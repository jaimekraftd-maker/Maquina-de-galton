/**
 * In-memory sliding-window rate limiter. It protects a single server instance;
 * for multi-instance deployments put a shared limiter (e.g. Redis) in front.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit; returns 0 if allowed, otherwise the milliseconds until retry. */
  take(key: string, now = Date.now()): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return this.windowMs - (now - recent[0]);
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return 0;
  }

  private prune(now: number) {
    for (const [k, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
    }
  }
}
