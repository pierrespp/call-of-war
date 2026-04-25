/**
 * Sliding-window rate limiter for Google Gemini API requests.
 *
 * Free tier of `gemini-2.5-flash-image-preview` allows roughly 10 requests per
 * minute. We cap at 8/min to keep a 2-request safety margin (per user spec).
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;

export interface RateLimiterStatus {
  used: number;
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number;
}

export interface AcquireResult {
  ok: boolean;
  retryAfterSeconds: number;
}

class GeminiRateLimiter {
  private timestamps: number[] = [];

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }
  }

  private nextSlotMs(now: number): number {
    if (this.timestamps.length < MAX_REQUESTS_PER_WINDOW) return 0;
    const oldest = this.timestamps[0];
    return Math.max(0, oldest + WINDOW_MS - now);
  }

  getStatus(): RateLimiterStatus {
    const now = Date.now();
    this.prune(now);
    const retryMs = this.nextSlotMs(now);
    return {
      used: this.timestamps.length,
      limit: MAX_REQUESTS_PER_WINDOW,
      windowSeconds: WINDOW_MS / 1000,
      retryAfterSeconds: Math.ceil(retryMs / 1000),
    };
  }

  /**
   * Try to reserve a slot. If a slot is available the request is recorded and
   * `ok: true` is returned. Otherwise returns `ok: false` with the number of
   * seconds the caller should wait before trying again.
   */
  tryAcquire(): AcquireResult {
    const now = Date.now();
    this.prune(now);
    const waitMs = this.nextSlotMs(now);
    if (waitMs > 0) {
      return { ok: false, retryAfterSeconds: Math.ceil(waitMs / 1000) };
    }
    this.timestamps.push(now);
    return { ok: true, retryAfterSeconds: 0 };
  }

  /**
   * Wait until a slot is available, then reserve it. Useful for internal
   * background tasks that should queue rather than fail. User-facing endpoints
   * should prefer `tryAcquire()` so they can surface a clear error message.
   */
  async acquire(): Promise<void> {
    while (true) {
      const result = this.tryAcquire();
      if (result.ok) return;
      await new Promise((resolve) =>
        setTimeout(resolve, result.retryAfterSeconds * 1000),
      );
    }
  }

  /** Test-only helper. */
  reset(): void {
    this.timestamps = [];
  }
}

export const geminiRateLimiter = new GeminiRateLimiter();
