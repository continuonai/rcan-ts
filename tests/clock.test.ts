/**
 * Tests for RCAN Clock Synchronization (GAP-04)
 */

import { checkClockSync, assertClockSynced, ClockDriftError } from "../src/clock";

describe("ClockSyncStatus interface", () => {
  test("checkClockSync returns a ClockSyncStatus object", async () => {
    const status = await checkClockSync();
    expect(typeof status.synchronized).toBe("boolean");
    expect(typeof status.offsetSeconds).toBe("number");
    expect(typeof status.source).toBe("string");
  });

  test("offsetSeconds is a finite number", async () => {
    const status = await checkClockSync();
    expect(isFinite(status.offsetSeconds)).toBe(true);
  });

  test("source is a non-empty string", async () => {
    const status = await checkClockSync();
    expect(status.source.length).toBeGreaterThan(0);
  });
});

describe("assertClockSynced", () => {
  test("does not throw when clock appears synced (assumed)", async () => {
    // In test environment, network is unavailable → assumed synced with offset 0
    await expect(assertClockSynced(5)).resolves.toBeUndefined();
  });

  test("ClockDriftError includes offsetSeconds property", () => {
    const err = new ClockDriftError(7.5, 5);
    expect(err.offsetSeconds).toBe(7.5);
    expect(err.message).toContain("7.5");
    expect(err.name).toBe("ClockDriftError");
  });

  test("ClockDriftError is instanceof Error", () => {
    const err = new ClockDriftError(3, 2);
    expect(err).toBeInstanceOf(Error);
  });

  test("ClockDriftError includes max drift in message", () => {
    const err = new ClockDriftError(6, 5);
    expect(err.message).toContain("5");
    expect(err.message).toContain("6");
  });
});

describe("checkClockSync resilience", () => {
  test("returns assumed-synced on unreachable server", async () => {
    // Pass an invalid/unreachable URL — should gracefully fall back
    const status = await checkClockSync("http://localhost:19999/invalid");
    expect(status.synchronized).toBe(true);
    expect(status.offsetSeconds).toBe(0);
    expect(status.source).toContain("assumed");
  });
});
