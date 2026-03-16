/**
 * Tests for RCAN Robot Identity Revocation (GAP-02)
 */

import {
  RevocationCache,
  makeRevocationBroadcast,
  checkRevocation,
} from "../src/revocation";
import { MessageType } from "../src/message";

describe("RevocationCache", () => {
  test("returns undefined for unknown rrn", () => {
    const cache = new RevocationCache();
    expect(cache.get("RRN-UNKNOWN")).toBeUndefined();
  });

  test("stores and retrieves a status", () => {
    const cache = new RevocationCache();
    cache.set({ rrn: "RRN-001", status: "revoked", reason: "stolen" });
    const status = cache.get("RRN-001");
    expect(status).toBeDefined();
    expect(status?.status).toBe("revoked");
  });

  test("returns undefined after TTL expires", () => {
    const cache = new RevocationCache();
    const now = Date.now();
    cache.set({ rrn: "RRN-002", status: "active" }, now);
    // Check at a time 1h+1ms in the future
    const future = now + 60 * 60 * 1000 + 1;
    const result = cache.get("RRN-002", future);
    expect(result).toBeUndefined();
  });

  test("returns entry before TTL expires", () => {
    const cache = new RevocationCache();
    const now = Date.now();
    cache.set({ rrn: "RRN-003", status: "suspended" }, now);
    // Check at 30 minutes later
    const later = now + 30 * 60 * 1000;
    const result = cache.get("RRN-003", later);
    expect(result).toBeDefined();
    expect(result?.status).toBe("suspended");
  });

  test("invalidates an entry", () => {
    const cache = new RevocationCache();
    cache.set({ rrn: "RRN-004", status: "active" });
    cache.invalidate("RRN-004");
    expect(cache.get("RRN-004")).toBeUndefined();
  });

  test("tracks size", () => {
    const cache = new RevocationCache();
    expect(cache.size).toBe(0);
    cache.set({ rrn: "RRN-A", status: "active" });
    cache.set({ rrn: "RRN-B", status: "revoked" });
    expect(cache.size).toBe(2);
  });
});

describe("makeRevocationBroadcast", () => {
  test("builds a ROBOT_REVOCATION message", () => {
    const msg = makeRevocationBroadcast("RRN-001", "Robot stolen");
    expect(msg.cmd).toBe("ROBOT_REVOCATION");
    expect(msg.params.message_type).toBe(MessageType.ROBOT_REVOCATION);
    expect(msg.params.rrn).toBe("RRN-001");
    expect(msg.params.reason).toBe("Robot stolen");
    expect(typeof msg.params.revoked_at).toBe("string");
  });

  test("message type integer is 19", () => {
    expect(MessageType.ROBOT_REVOCATION).toBe(19);
  });
});

describe("checkRevocation", () => {
  test("falls back to active status when network is unavailable", async () => {
    const status = await checkRevocation("RRN-OFFLINE", "http://localhost:19999");
    expect(status.status).toBe("active");
    expect(status.reason).toContain("network");
  });

  test("uses cached status on second call", async () => {
    const cache = new RevocationCache();
    // Pre-populate cache
    cache.set({ rrn: "RRN-CACHED", status: "revoked", reason: "pre-cached" });
    const status = await checkRevocation("RRN-CACHED", "http://localhost:19999", cache);
    expect(status.status).toBe("revoked");
    expect(status.reason).toBe("pre-cached");
  });
});
