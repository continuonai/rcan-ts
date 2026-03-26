import { RCANMessage, RCANMessageError, MessageType } from "../src/message";

const VALID_DATA = {
  rcan: "1.2",
  cmd: "move_forward",
  target: "rcan://registry.rcan.dev/acme/arm/v2/unit-001",
  params: { distance_m: 1.0 },
  confidence: 0.91,
};

describe("RCANMessage constructor", () => {
  test("creates valid message", () => {
    const msg = new RCANMessage(VALID_DATA);
    expect(msg.cmd).toBe("move_forward");
    expect(msg.confidence).toBe(0.91);
    expect(msg.rcan).toBe("1.2");
  });

  test("defaults rcan to SPEC_VERSION (1.6.1)", () => {
    const msg = new RCANMessage({ cmd: "stop", target: "rcan://r/a/b/v1/x" });
    expect(msg.rcan).toBe("1.10.0");
  });

  test("throws on missing cmd", () => {
    expect(() => new RCANMessage({ cmd: "", target: "rcan://r/a/b/v1/x" }))
      .toThrow(RCANMessageError);
  });

  test("throws on missing target", () => {
    expect(() => new RCANMessage({ cmd: "stop", target: "" } as any))
      .toThrow(RCANMessageError);
  });

  test("throws on confidence > 1", () => {
    expect(() => new RCANMessage({ ...VALID_DATA, confidence: 1.5 }))
      .toThrow(RCANMessageError);
  });

  test("throws on confidence < 0", () => {
    expect(() => new RCANMessage({ ...VALID_DATA, confidence: -0.1 }))
      .toThrow(RCANMessageError);
  });

  test("accepts confidence = 0", () => {
    const msg = new RCANMessage({ ...VALID_DATA, confidence: 0 });
    expect(msg.confidence).toBe(0);
  });

  test("accepts confidence = 1", () => {
    const msg = new RCANMessage({ ...VALID_DATA, confidence: 1 });
    expect(msg.confidence).toBe(1);
  });
});

describe("RCANMessage computed properties", () => {
  test("isSigned = false when no signature", () => {
    const msg = new RCANMessage(VALID_DATA);
    expect(msg.isSigned).toBe(false);
  });

  test("isSigned = true when signature present", () => {
    const msg = new RCANMessage({
      ...VALID_DATA,
      signature: { alg: "Ed25519", kid: "abc123", sig: "deadbeef" },
    });
    expect(msg.isSigned).toBe(true);
  });

  test("isAiDriven = true when confidence present", () => {
    const msg = new RCANMessage(VALID_DATA);
    expect(msg.isAiDriven).toBe(true);
  });

  test("isAiDriven = false when no confidence", () => {
    const msg = new RCANMessage({ cmd: "stop", target: "rcan://r/a/b/v1/x" });
    expect(msg.isAiDriven).toBe(false);
  });
});

describe("RCANMessage serialization", () => {
  test("toJSON() includes required fields", () => {
    const msg = new RCANMessage(VALID_DATA);
    const obj = msg.toJSON();
    expect(obj.rcan).toBe("1.2");
    expect(obj.cmd).toBe("move_forward");
    expect(obj.target).toBeDefined();
  });

  test("toJSONString() is valid JSON", () => {
    const msg = new RCANMessage(VALID_DATA);
    const str = msg.toJSONString();
    expect(() => JSON.parse(str)).not.toThrow();
  });

  test("fromJSON() round-trips", () => {
    const msg = new RCANMessage(VALID_DATA);
    const msg2 = RCANMessage.fromJSON(msg.toJSON() as Record<string, unknown>);
    expect(msg2.cmd).toBe(msg.cmd);
    expect(msg2.confidence).toBe(msg.confidence);
  });

  test("fromJSON() parses JSON string", () => {
    const msg = new RCANMessage(VALID_DATA);
    const msg2 = RCANMessage.fromJSON(msg.toJSONString());
    expect(msg2.cmd).toBe("move_forward");
  });

  test("fromJSON() throws on invalid JSON string", () => {
    expect(() => RCANMessage.fromJSON("not json")).toThrow();
  });

  test("fromJSON() throws on missing cmd", () => {
    expect(() => RCANMessage.fromJSON({ rcan: "1.2", target: "rcan://r/a/b/v1/x" } as any)).toThrow();
  });
});

describe('v1.7 contribute message types', () => {
  it('should have CONTRIBUTE_REQUEST = 33', () => {
    expect(MessageType.CONTRIBUTE_REQUEST).toBe(33);
  });
  it('should have CONTRIBUTE_RESULT = 34', () => {
    expect(MessageType.CONTRIBUTE_RESULT).toBe(34);
  });
  it('should have CONTRIBUTE_CANCEL = 35', () => {
    expect(MessageType.CONTRIBUTE_CANCEL).toBe(35);
  });
});
