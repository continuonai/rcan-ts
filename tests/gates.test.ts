import { ConfidenceGate, HiTLGate, GateError } from "../src/gates";

describe("ConfidenceGate", () => {
  test("allows confidence >= threshold", () => {
    const gate = new ConfidenceGate(0.8);
    expect(gate.allows(0.8)).toBe(true);
    expect(gate.allows(0.9)).toBe(true);
    expect(gate.allows(1.0)).toBe(true);
  });

  test("blocks confidence < threshold", () => {
    const gate = new ConfidenceGate(0.8);
    expect(gate.allows(0.79)).toBe(false);
    expect(gate.allows(0)).toBe(false);
  });

  test("default threshold is 0.8", () => {
    expect(new ConfidenceGate().threshold).toBe(0.8);
  });

  test("throws on invalid threshold", () => {
    expect(() => new ConfidenceGate(1.5)).toThrow(GateError);
    expect(() => new ConfidenceGate(-0.1)).toThrow(GateError);
  });

  test("margin()", () => {
    const gate = new ConfidenceGate(0.8);
    expect(gate.margin(0.9)).toBeCloseTo(0.1);
    expect(gate.margin(0.7)).toBeCloseTo(-0.1);
  });

  test("assert() passes when ok", () => {
    const gate = new ConfidenceGate(0.8);
    expect(() => gate.assert(0.9)).not.toThrow();
  });

  test("assert() throws when blocked", () => {
    const gate = new ConfidenceGate(0.8);
    expect(() => gate.assert(0.5, "move")).toThrow(GateError);
  });
});

describe("HiTLGate", () => {
  test("request() returns a token", () => {
    const gate = new HiTLGate();
    const token = gate.request("move_forward");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  test("check() returns pending initially", () => {
    const gate = new HiTLGate();
    const token = gate.request("stop");
    expect(gate.check(token)).toBe("pending");
  });

  test("approve() sets status to approved", () => {
    const gate = new HiTLGate();
    const token = gate.request("move");
    gate.approve(token);
    expect(gate.check(token)).toBe("approved");
  });

  test("deny() sets status to denied", () => {
    const gate = new HiTLGate();
    const token = gate.request("move");
    gate.deny(token, "unsafe area");
    expect(gate.check(token)).toBe("denied");
  });

  test("check() throws on unknown token", () => {
    const gate = new HiTLGate();
    expect(() => gate.check("nonexistent")).toThrow(GateError);
  });

  test("pendingApprovals lists only pending", () => {
    const gate = new HiTLGate();
    const t1 = gate.request("a");
    const t2 = gate.request("b");
    gate.approve(t1);
    expect(gate.pendingApprovals).toHaveLength(1);
    expect(gate.pendingApprovals[0].token).toBe(t2);
  });

  test("clearResolved() removes approved/denied", () => {
    const gate = new HiTLGate();
    const t1 = gate.request("a");
    gate.approve(t1);
    gate.clearResolved();
    expect(() => gate.check(t1)).toThrow(GateError);
  });

  test("getApproval() returns full record", () => {
    const gate = new HiTLGate();
    const ctx = { speed: 1.0 };
    const token = gate.request("move", ctx);
    const approval = gate.getApproval(token);
    expect(approval?.action).toBe("move");
    expect(approval?.context).toEqual(ctx);
  });
});
