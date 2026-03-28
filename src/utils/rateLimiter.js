/**
 * Simple in-memory sliding-window rate limiter.
 * One instance per scope (encrypt, auth, heartbeat, etc.).
 */
class RateLimiter {
  constructor(windowMs, maxPerWindow) {
    this.windowMs = Math.max(1000, windowMs)
    this.maxPerWindow = Math.max(1, maxPerWindow)
    this.buckets = new Map()
  }

  consume(key) {
    const now = Date.now()
    const safeKey = String(key || 'anon').trim() || 'anon'
    let bucket = this.buckets.get(safeKey)
    if (!bucket || Number(bucket.resetAt || 0) <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs }
    }
    bucket.count += 1
    this.buckets.set(safeKey, bucket)

    if (this.buckets.size > 4096) {
      for (const [k, v] of this.buckets.entries()) {
        if (Number(v?.resetAt || 0) <= now) this.buckets.delete(k)
      }
    }

    return {
      allowed: bucket.count <= this.maxPerWindow,
      retryAfterSeconds: Math.max(1, Math.ceil((Number(bucket.resetAt || now) - now) / 1000))
    }
  }
}

module.exports = { RateLimiter }
