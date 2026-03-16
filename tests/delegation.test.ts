/**
 * Tests for RCAN Command Delegation Chain (GAP-01)
 */

import {
  RCANMessage,
  addDelegationHop,
  validateDelegationChain,
} from "../src/message";
import type { DelegationHop } from "../src/message";

const HOP_1: DelegationHop = {
  issuerRuri: "rcan://registry.rcan.dev/acme/arm/v1/robot-a",
  humanSubject: "human-owner-a",
  timestamp: new Date().toISOString(),
  scope: "control",
  signature: "sig-hop-1",
};

const HOP_2: DelegationHop = {
  issuerRuri: "rcan://registry.rcan.dev/acme/arm/v1/robot-b",
  humanSubject: "human-owner-a",
  timestamp: new Date().toISOString(),
  scope: "status",
  signature: "sig-hop-2",
};

function baseMsg(): RCANMessage {
  return new RCANMessage({
    rcan: "1.5",
    cmd: "move_forward",
    target: "rcan://registry.rcan.dev/acme/arm/v1/robot-b",
  });
}

describe("DelegationHop interface", () => {
  test("has all required fields", () => {
    expect(HOP_1.issuerRuri).toBeDefined();
    expect(HOP_1.humanSubject).toBeDefined();
    expect(HOP_1.timestamp).toBeDefined();
    expect(HOP_1.scope).toBeDefined();
    expect(HOP_1.signature).toBeDefined();
  });
});

describe("addDelegationHop", () => {
  test("adds a hop to a message without delegation chain", () => {
    const msg = baseMsg();
    expect(msg.delegationChain).toBeUndefined();
    const msg2 = addDelegationHop(msg, HOP_1);
    expect(msg2.delegationChain).toHaveLength(1);
    expect(msg2.delegationChain![0]).toEqual(HOP_1);
  });

  test("appends a hop to existing chain", () => {
    const msg = baseMsg();
    const msg1 = addDelegationHop(msg, HOP_1);
    const msg2 = addDelegationHop(msg1, HOP_2);
    expect(msg2.delegationChain).toHaveLength(2);
    expect(msg2.delegationChain![1]).toEqual(HOP_2);
  });

  test("does not mutate the original message", () => {
    const msg = baseMsg();
    addDelegationHop(msg, HOP_1);
    expect(msg.delegationChain).toBeUndefined();
  });
});

describe("validateDelegationChain", () => {
  test("accepts an empty chain", () => {
    const result = validateDelegationChain([]);
    expect(result.valid).toBe(true);
  });

  test("accepts a single-hop chain", () => {
    const result = validateDelegationChain([HOP_1]);
    expect(result.valid).toBe(true);
  });

  test("accepts a 2-hop chain", () => {
    const result = validateDelegationChain([HOP_1, HOP_2]);
    expect(result.valid).toBe(true);
  });

  test("accepts a chain of exactly 4 hops", () => {
    const chain = [HOP_1, HOP_2, HOP_1, HOP_2]; // 4 hops
    const result = validateDelegationChain(chain);
    expect(result.valid).toBe(true);
  });

  test("rejects a chain of 5 hops (DELEGATION_CHAIN_EXCEEDED)", () => {
    const chain = [HOP_1, HOP_2, HOP_1, HOP_2, HOP_1]; // 5 hops
    const result = validateDelegationChain(chain);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("DELEGATION_CHAIN_EXCEEDED");
  });

  test("rejects a hop missing issuerRuri", () => {
    const badHop = { ...HOP_1, issuerRuri: "" };
    const result = validateDelegationChain([badHop]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("issuerRuri");
  });

  test("rejects a hop missing signature", () => {
    const badHop = { ...HOP_1, signature: "" };
    const result = validateDelegationChain([badHop]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("signature");
  });

  test("rejects a hop missing scope", () => {
    const badHop = { ...HOP_1, scope: "" };
    const result = validateDelegationChain([badHop]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("scope");
  });
});

describe("RCANMessage delegationChain field", () => {
  test("message stores delegationChain from data", () => {
    const msg = new RCANMessage({
      rcan: "1.5",
      cmd: "test",
      target: "rcan://r/a/b/v1/x",
      delegationChain: [HOP_1],
    });
    expect(msg.delegationChain).toHaveLength(1);
  });

  test("serializes delegationChain in toJSON", () => {
    const msg = new RCANMessage({
      rcan: "1.5",
      cmd: "test",
      target: "rcan://r/a/b/v1/x",
      delegationChain: [HOP_1, HOP_2],
    });
    const json = msg.toJSON();
    expect(Array.isArray(json.delegationChain)).toBe(true);
    expect((json.delegationChain as DelegationHop[]).length).toBe(2);
  });

  test("round-trips through fromJSON", () => {
    const msg = new RCANMessage({
      rcan: "1.5",
      cmd: "test",
      target: "rcan://r/a/b/v1/x",
      delegationChain: [HOP_1],
    });
    const json = msg.toJSON() as Parameters<typeof RCANMessage.fromJSON>[0];
    const restored = RCANMessage.fromJSON(json);
    expect(restored.delegationChain).toHaveLength(1);
    expect(restored.delegationChain![0]?.issuerRuri).toBe(HOP_1.issuerRuri);
  });
});
