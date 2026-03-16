/**
 * RCAN Replay Attack Prevention — §8.3
 *
 * Robots MUST reject messages where timestamp is >30s old (configurable).
 * A sliding-window seen-set of msg_ids prevents duplicate delivery.
 * Safety messages (MessageType 6) use a 10s window maximum.
 */

import type { SafetyMessage } from "./safety.js";

const SAFETY_MESSAGE_TYPE = 6;
const SAFETY_MAX_WINDOW_S = 10;
const DEFAULT_WINDOW_S = 30;
const DEFAULT_MAX_SIZE = 10000;

/** A message shape that has the fields the replay cache needs */
export interface ReplayableMessage {
  message_id?: string;
  msg_id?: string;
  timestamp_ms?: number;
  timestamp?: string | number;
  message_type?: number;
}

export interface ReplayCheckResult {
  allowed: boolean;
  reason: string;
}

/**
 * Sliding-window replay cache.
 *
 * constructor(windowSeconds = 30, maxSize = 10000)
 */
export class ReplayCache {
  private readonly windowSeconds: number;
  private readonly maxSize: number;
  /** Map<msgId, expiresAtMs> */
  private readonly _seen: Map<string, number>;

  constructor(windowSeconds: number = DEFAULT_WINDOW_S, maxSize: number = DEFAULT_MAX_SIZE) {
    this.windowSeconds = windowSeconds;
    this.maxSize = maxSize;
    this._seen = new Map();
  }

  /**
   * Check a message id + timestamp and record it if allowed.
   *
   * @param msgId     - unique message identifier
   * @param timestamp - ISO 8601 string or Unix seconds (float)
   * @param isSafety  - if true, enforce the 10s safety window cap
   */
  checkAndRecord(
    msgId: string,
    timestamp: string,
    isSafety = false
  ): ReplayCheckResult {
    const now = Date.now();

    // Evict stale entries to keep memory bounded
    this._evict(now);

    // Resolve effective window
    const window = isSafety
      ? Math.min(this.windowSeconds, SAFETY_MAX_WINDOW_S)
      : this.windowSeconds;

    // Parse timestamp → ms
    const tMs = parseTimestampMs(timestamp);
    if (tMs === null) {
      return { allowed: false, reason: `invalid timestamp format: ${timestamp}` };
    }

    // Freshness check
    const ageMs = now - tMs;
    const windowMs = window * 1000;
    if (ageMs > windowMs) {
      return {
        allowed: false,
        reason: `message too old: age=${Math.round(ageMs / 1000)}s > window=${window}s`,
      };
    }
    if (tMs > now + 5000) {
      // Allow 5s future drift for clock skew
      return {
        allowed: false,
        reason: `message timestamp is in the future`,
      };
    }

    // Duplicate check
    if (this._seen.has(msgId)) {
      return { allowed: false, reason: `replay detected: msg_id ${msgId} already seen` };
    }

    // Enforce max size by evicting oldest entry
    if (this._seen.size >= this.maxSize) {
      const firstKey = this._seen.keys().next().value as string;
      this._seen.delete(firstKey);
    }

    // Record it
    const expiresAt = now + windowMs;
    this._seen.set(msgId, expiresAt);

    return { allowed: true, reason: "ok" };
  }

  /** Evict entries whose window has passed */
  private _evict(now: number): void {
    for (const [id, expiresAt] of this._seen) {
      if (expiresAt <= now) {
        this._seen.delete(id);
      }
    }
  }

  /** Number of entries currently tracked */
  get size(): number {
    return this._seen.size;
  }
}

/**
 * Validate replay for a SafetyMessage or ReplayableMessage.
 */
export function validateReplay(
  message: SafetyMessage | ReplayableMessage,
  cache: ReplayCache
): { valid: boolean; reason: string } {
  const msg = message as ReplayableMessage & Partial<SafetyMessage>;

  // Resolve msg_id
  const msgId: string | undefined =
    (msg as SafetyMessage).message_id ?? (msg as ReplayableMessage).msg_id;
  if (!msgId) {
    return { valid: false, reason: "missing message_id / msg_id" };
  }

  // Resolve timestamp
  let timestamp: string | undefined;
  if (typeof (msg as SafetyMessage).timestamp_ms === "number") {
    // SafetyMessage uses timestamp_ms (unix ms)
    timestamp = String((msg as SafetyMessage).timestamp_ms! / 1000);
  } else if (msg.timestamp !== undefined) {
    timestamp = String(msg.timestamp);
  }
  if (!timestamp) {
    return { valid: false, reason: "missing timestamp" };
  }

  const isSafety = (msg as SafetyMessage).message_type === SAFETY_MESSAGE_TYPE ||
    (msg as ReplayableMessage).message_type === SAFETY_MESSAGE_TYPE;

  const result = cache.checkAndRecord(msgId, timestamp, isSafety);
  return { valid: result.allowed, reason: result.reason };
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a timestamp to milliseconds.
 * Accepts:
 *  - ISO 8601 strings  ("2026-03-16T12:00:00.000Z")
 *  - Unix seconds as string ("1710000000.123" or "1710000000")
 *  - Unix milliseconds as string (13-digit integers)
 */
function parseTimestampMs(ts: string): number | null {
  // Try ISO 8601
  if (ts.includes("T") || ts.includes("-")) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  // Try numeric
  const n = parseFloat(ts);
  if (isNaN(n)) return null;
  // Heuristic: if > 1e12, treat as milliseconds; otherwise seconds
  if (n > 1e12) return n;
  return n * 1000;
}
