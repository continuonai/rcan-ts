/**
 * Tests for RCAN Replay Attack Prevention (GAP-03)
 */

import { ReplayCache, validateReplay } from "../src/replay";
import type { SafetyMessage } from "../src/safety";

function nowIso(): string {
  return new Date().toISOString();
}

function agoIso(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function futureIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

describe("ReplayCache", () => {
  test("allows a fresh message", () => {
    const cache = new ReplayCache(30);
    const result = cache.checkAndRecord("msg-1", nowIso());
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("ok");
  });

  test("rejects a duplicate msg_id", () => {
    const cache = new ReplayCache(30);
    cache.checkAndRecord("msg-dup", nowIso());
    const result = cache.checkAndRecord("msg-dup", nowIso());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("replay detected");
  });

  test("rejects a stale message (>30s)", () => {
    const cache = new ReplayCache(30);
    const stale = agoIso(31);
    const result = cache.checkAndRecord("msg-stale", stale);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("too old");
  });

  test("accepts a message right at the window edge", () => {
    const cache = new ReplayCache(30);
    const edge = agoIso(29);
    const result = cache.checkAndRecord("msg-edge", edge);
    expect(result.allowed).toBe(true);
  });

  test("rejects a future timestamp beyond 5s drift", () => {
    const cache = new ReplayCache(30);
    const future = futureIso(10);
    const result = cache.checkAndRecord("msg-future", future);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("future");
  });

  test("safety messages use max 10s window", () => {
    const cache = new ReplayCache(30);
    // 11s ago — would pass normal window but not safety window
    const ts = agoIso(11);
    const result = cache.checkAndRecord("msg-safety-old", ts, true);
    expect(result.allowed).toBe(false);
  });

  test("safety message within 9s is accepted", () => {
    const cache = new ReplayCache(30);
    const ts = agoIso(9);
    const result = cache.checkAndRecord("msg-safety-ok", ts, true);
    expect(result.allowed).toBe(true);
  });

  test("tracks size correctly", () => {
    const cache = new ReplayCache(30, 10000);
    expect(cache.size).toBe(0);
    cache.checkAndRecord("msg-a", nowIso());
    expect(cache.size).toBe(1);
    cache.checkAndRecord("msg-b", nowIso());
    expect(cache.size).toBe(2);
  });

  test("evicts oldest when maxSize reached", () => {
    const cache = new ReplayCache(30, 3);
    cache.checkAndRecord("msg-1", nowIso());
    cache.checkAndRecord("msg-2", nowIso());
    cache.checkAndRecord("msg-3", nowIso());
    expect(cache.size).toBe(3);
    // Adding a 4th should evict the first
    cache.checkAndRecord("msg-4", nowIso());
    expect(cache.size).toBe(3);
  });

  test("accepts unix timestamp as string (seconds)", () => {
    const cache = new ReplayCache(30);
    const nowSec = (Date.now() / 1000).toFixed(3);
    const result = cache.checkAndRecord("msg-unix", nowSec);
    expect(result.allowed).toBe(true);
  });

  test("accepts unix timestamp as string (milliseconds)", () => {
    const cache = new ReplayCache(30);
    const nowMs = Date.now().toString();
    const result = cache.checkAndRecord("msg-ms", nowMs);
    expect(result.allowed).toBe(true);
  });
});

describe("validateReplay", () => {
  test("validates a valid SafetyMessage", () => {
    const cache = new ReplayCache(30);
    const msg: SafetyMessage = {
      message_type: 6,
      ruri: "rcan://r/a/b/v1/x",
      safety_event: "ESTOP",
      reason: "test",
      timestamp_ms: Date.now(),
      message_id: "valid-id-001",
    };
    const result = validateReplay(msg, cache);
    expect(result.valid).toBe(true);
  });

  test("rejects SafetyMessage with stale timestamp", () => {
    const cache = new ReplayCache(30);
    const msg: SafetyMessage = {
      message_type: 6,
      ruri: "rcan://r/a/b/v1/x",
      safety_event: "ESTOP",
      reason: "test",
      timestamp_ms: Date.now() - 11_000, // 11s ago — over safety 10s window
      message_id: "stale-id-002",
    };
    const result = validateReplay(msg, cache);
    // Safety messages use 10s window, so 11s old is rejected
    expect(result.valid).toBe(false);
  });

  test("rejects replayed SafetyMessage", () => {
    const cache = new ReplayCache(30);
    const msg: SafetyMessage = {
      message_type: 6,
      ruri: "rcan://r/a/b/v1/x",
      safety_event: "STOP",
      reason: "test",
      timestamp_ms: Date.now(),
      message_id: "dup-id-003",
    };
    validateReplay(msg, cache); // first — allowed
    const result = validateReplay(msg, cache); // second — replay
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("replay detected");
  });

  test("rejects message without message_id", () => {
    const cache = new ReplayCache(30);
    const msg = { message_type: 6, timestamp_ms: Date.now() } as Partial<SafetyMessage>;
    const result = validateReplay(msg as SafetyMessage, cache);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("message_id");
  });

  test("ESTOP is never blocked by replay cache when fresh", () => {
    const cache = new ReplayCache(10);
    const msg: SafetyMessage = {
      message_type: 6,
      ruri: "rcan://r/a/b/v1/x",
      safety_event: "ESTOP",
      reason: "emergency",
      timestamp_ms: Date.now(),
      message_id: "estop-fresh",
    };
    const result = validateReplay(msg, cache);
    expect(result.valid).toBe(true);
  });
});
