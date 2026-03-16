/**
 * Tests for RCAN Offline Mode (GAP-06)
 */

import { OfflineModeManager } from "../src/offline";
import type { SafetyMessage } from "../src/safety";

const ESTOP_MSG: SafetyMessage = {
  message_type: 6,
  ruri: "rcan://r/a/b/v1/x",
  safety_event: "ESTOP",
  reason: "emergency",
  timestamp_ms: Date.now(),
  message_id: "estop-offline-001",
};

const COMMAND_MSG = { message_type: 1, safety_event: undefined };

describe("OfflineModeManager.canAcceptCommand", () => {
  const mgr = new OfflineModeManager(3600, 86400);

  test("allows all commands when online", () => {
    const result = mgr.canAcceptCommand(COMMAND_MSG, false, true);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("online mode");
  });

  test("ESTOP always allowed in offline mode", () => {
    const result = mgr.canAcceptCommand(ESTOP_MSG, true, false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("Protocol 66");
  });

  test("blocks cross-network commands in offline mode", () => {
    const result = mgr.canAcceptCommand(COMMAND_MSG, true, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("cross-network");
  });

  test("blocks non-owner commands in offline mode", () => {
    const result = mgr.canAcceptCommand(COMMAND_MSG, true, true, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("owner-role");
  });

  test("allows owner local-network commands in offline mode within grace period", () => {
    const offlineSince = Date.now() - 60_000; // 1 minute offline
    const result = mgr.canAcceptCommand(COMMAND_MSG, true, true, true, false, offlineSince);
    expect(result.allowed).toBe(true);
  });

  test("blocks cross-owner commands after grace period expired", () => {
    const crossOwnerGraceS = 100;
    const mgr2 = new OfflineModeManager(crossOwnerGraceS);
    const offlineSince = Date.now() - (crossOwnerGraceS + 10) * 1000; // grace + 10s ago
    const result = mgr2.canAcceptCommand(COMMAND_MSG, true, true, true, true, offlineSince);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("grace period expired");
  });

  test("allows cross-owner commands within grace period", () => {
    const crossOwnerGraceS = 3600;
    const offlineSince = Date.now() - 30_000; // 30s offline
    const result = mgr.canAcceptCommand(COMMAND_MSG, true, true, true, true, offlineSince);
    expect(result.allowed).toBe(true);
  });
});

describe("OfflineModeManager key cache", () => {
  const mgr = new OfflineModeManager();

  test("stores and retrieves a cached key", () => {
    mgr.cacheKey({ kid: "key-1", publicKey: "base64pubkey" });
    const key = mgr.getCachedKey("key-1");
    expect(key).toBeDefined();
    expect(key?.publicKey).toBe("base64pubkey");
  });

  test("returns undefined for unknown kid", () => {
    expect(mgr.getCachedKey("unknown-kid")).toBeUndefined();
  });

  test("expires key after TTL", () => {
    const now = Date.now();
    const mgr2 = new OfflineModeManager(3600, 60); // 60s TTL
    mgr2.cacheKey({ kid: "key-ttl", publicKey: "pk" }, now);
    // Check at 61s later
    const later = now + 61_000;
    expect(mgr2.getCachedKey("key-ttl", later)).toBeUndefined();
  });

  test("key is valid before TTL expiry", () => {
    const now = Date.now();
    const mgr2 = new OfflineModeManager(3600, 300); // 5 minute TTL
    mgr2.cacheKey({ kid: "key-valid", publicKey: "pk" }, now);
    const later = now + 60_000; // 1 min later
    const key = mgr2.getCachedKey("key-valid", later);
    expect(key).toBeDefined();
  });
});

describe("OfflineModeManager.getManifestFields", () => {
  const mgr = new OfflineModeManager();

  test("returns offline_mode=false when not offline", () => {
    const fields = mgr.getManifestFields(undefined);
    expect(fields.offline_mode).toBe(false);
    expect(fields.offline_since_s).toBe(0);
  });

  test("returns offline_mode=true with elapsed seconds", () => {
    const now = Date.now();
    const offlineSince = now - 1800_000; // 30 minutes ago
    const fields = mgr.getManifestFields(offlineSince, now);
    expect(fields.offline_mode).toBe(true);
    expect(fields.offline_since_s).toBeCloseTo(1800, -1); // within 10s
  });
});
