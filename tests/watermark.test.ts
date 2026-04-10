// @ts-nocheck — jest.fn() generic typing differs in ESM @jest/globals
import { jest } from "@jest/globals";
import { computeWatermarkToken, verifyTokenFormat, verifyViaApi } from "../src/watermark.js";

const FAKE_KEY = new Uint8Array(64).fill(120); // 'x' * 64
const RRN = "RRN-000000000001";
const THOUGHT_ID = "thought-abc123";
const TIMESTAMP = "2026-04-10T14:32:01.123456";

describe("computeWatermarkToken", () => {
  it("returns rcan-wm-v1: prefix with 32 hex chars", () => {
    const token = computeWatermarkToken(RRN, THOUGHT_ID, TIMESTAMP, FAKE_KEY);
    expect(token).toMatch(/^rcan-wm-v1:[0-9a-f]{32}$/);
  });

  it("is deterministic", () => {
    const t1 = computeWatermarkToken(RRN, THOUGHT_ID, TIMESTAMP, FAKE_KEY);
    const t2 = computeWatermarkToken(RRN, THOUGHT_ID, TIMESTAMP, FAKE_KEY);
    expect(t1).toBe(t2);
  });

  it("changes with different rrn", () => {
    const t1 = computeWatermarkToken(RRN, THOUGHT_ID, TIMESTAMP, FAKE_KEY);
    const t2 = computeWatermarkToken("RRN-000000000002", THOUGHT_ID, TIMESTAMP, FAKE_KEY);
    expect(t1).not.toBe(t2);
  });

  /**
   * Cross-language reference test.
   *
   * The expected value is pre-computed by running the canonical Python implementation:
   *   import hmac, hashlib
   *   key = bytes([120] * 64)  # 'x' * 64
   *   msg = "RRN-000000000001:thought-abc123:2026-04-10T14:32:01.123456".encode()
   *   digest = hmac.new(key, msg, hashlib.sha256).digest()
   *   print(digest[:16].hex())  # → d32a0ea8db075e0ec9c7c313e75a5011
   *
   * This pinned value proves TypeScript and Python produce identical tokens for the
   * same raw key bytes. If this test fails after a crypto.ts change, the implementations
   * have diverged and cross-language verification will break.
   */
  it("matches Python reference output for known inputs (cross-language parity)", () => {
    // Pre-computed: hmac.new(bytes([120]*64), b"RRN-000000000001:thought-abc123:2026-04-10T14:32:01.123456", hashlib.sha256).digest()[:16].hex()
    const PYTHON_REFERENCE_HEX = "d32a0ea8db075e0ec9c7c313e75a5011";
    const token = computeWatermarkToken(RRN, THOUGHT_ID, TIMESTAMP, FAKE_KEY);
    expect(token).toBe(`rcan-wm-v1:${PYTHON_REFERENCE_HEX}`);
  });
});

describe("verifyTokenFormat", () => {
  it("accepts valid token", () => {
    const token = computeWatermarkToken(RRN, THOUGHT_ID, TIMESTAMP, FAKE_KEY);
    expect(verifyTokenFormat(token)).toBe(true);
  });

  it("rejects bad prefix", () => {
    expect(verifyTokenFormat("rcan-wm-v2:" + "a".repeat(32))).toBe(false);
  });

  it("rejects short hex", () => {
    expect(verifyTokenFormat("rcan-wm-v1:abc123")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(verifyTokenFormat("")).toBe(false);
  });
});

describe("verifyViaApi", () => {
  it("returns audit entry on 200", async () => {
    const token = "rcan-wm-v1:" + "a".repeat(32);
    const entry = { event: "motor_command", watermark_token: token };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: true, audit_entry: entry }),
    }) as jest.Mock;

    const result = await verifyViaApi(token, "RRN-1", "http://robot.local:8000");
    expect(result).toEqual(entry);
  });

  it("returns null on 404", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as jest.Mock;

    const result = await verifyViaApi("rcan-wm-v1:" + "b".repeat(32), "RRN-1", "http://robot.local:8000");
    expect(result).toBeNull();
  });
});
