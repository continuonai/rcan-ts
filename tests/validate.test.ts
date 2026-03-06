import { validateURI, validateMessage, validateConfig, ValidationResult } from "../src/validate";

describe("validateURI()", () => {
  test("valid URI passes", () => {
    const r = validateURI("rcan://registry.rcan.dev/acme/arm/v2/unit-001");
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect(r.info.some((i) => i.includes("acme"))).toBe(true);
  });

  test("http:// scheme fails", () => {
    const r = validateURI("http://not-rcan");
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  test("too-short URI fails", () => {
    const r = validateURI("rcan://registry.rcan.dev/acme/arm");
    expect(r.ok).toBe(false);
  });
});

describe("validateMessage()", () => {
  const VALID = {
    rcan: "1.2",
    cmd: "move_forward",
    target: "rcan://registry.rcan.dev/acme/arm/v2/unit-001",
    confidence: 0.91,
  };

  test("valid message passes", () => {
    const r = validateMessage(VALID);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  test("JSON string is accepted", () => {
    const r = validateMessage(JSON.stringify(VALID));
    expect(r.ok).toBe(true);
  });

  test("missing cmd fails", () => {
    const { cmd, ...rest } = VALID;
    const r = validateMessage(rest);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("cmd"))).toBe(true);
  });

  test("missing target fails", () => {
    const { target, ...rest } = VALID;
    const r = validateMessage(rest);
    expect(r.ok).toBe(false);
  });

  test("missing rcan fails", () => {
    const { rcan, ...rest } = VALID;
    const r = validateMessage(rest);
    expect(r.ok).toBe(false);
  });

  test("no confidence warns", () => {
    const { confidence, ...rest } = VALID;
    const r = validateMessage(rest);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.toLowerCase().includes("confidence"))).toBe(true);
  });

  test("unsigned message warns", () => {
    const r = validateMessage(VALID);
    expect(r.warnings.some((w) => w.toLowerCase().includes("unsigned"))).toBe(true);
  });

  test("invalid JSON string fails", () => {
    const r = validateMessage("{ not json }");
    expect(r.ok).toBe(false);
  });

  test("null input fails", () => {
    const r = validateMessage(null as any);
    expect(r.ok).toBe(false);
  });
});

describe("validateConfig()", () => {
  const VALID_CFG = {
    rcan_version: "1.2",
    metadata: { manufacturer: "acme", model: "arm", device_id: "unit-001", rrn: "RRN-00000042" },
    agent: {
      confidence_gates: [{ threshold: 0.8 }],
      hitl_gates: [{}],
      commitment_chain: { enabled: true },
    },
    rcan_protocol: { jwt_auth: { enabled: true } },
  };

  test("valid config passes", () => {
    const r = validateConfig(VALID_CFG);
    expect(r.issues).toHaveLength(0);
  });

  test("missing manufacturer fails L1", () => {
    const cfg = { ...VALID_CFG, metadata: { model: "arm" } };
    const r = validateConfig(cfg);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("manufacturer"))).toBe(true);
  });

  test("missing model fails L1", () => {
    const cfg = { ...VALID_CFG, metadata: { manufacturer: "acme", device_id: "unit-001" } };
    const r = validateConfig(cfg);
    expect(r.ok).toBe(false);
  });

  test("no jwt_auth warns L2", () => {
    const r = validateConfig({ ...VALID_CFG, rcan_protocol: {} });
    expect(r.warnings.some((w) => w.includes("L2"))).toBe(true);
  });

  test("no hitl_gates warns L3", () => {
    const cfg = { ...VALID_CFG, agent: { ...VALID_CFG.agent, hitl_gates: [] } };
    const r = validateConfig(cfg);
    expect(r.warnings.some((w) => w.includes("L3"))).toBe(true);
  });

  test("no rrn warns about registration", () => {
    const cfg = { ...VALID_CFG, metadata: { manufacturer: "acme", model: "arm", device_id: "unit-001" } };
    const r = validateConfig(cfg);
    expect(r.warnings.some((w) => w.toLowerCase().includes("register"))).toBe(true);
  });

  test("registered robot shows rrn in info", () => {
    const r = validateConfig(VALID_CFG);
    expect(r.info.some((i) => i.includes("RRN-00000042"))).toBe(true);
  });
});
