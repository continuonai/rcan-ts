/**
 * Tests for the rcan-validate CLI entry points (via the underlying validate module).
 * The CLI calls validateURI, validateMessage, validateConfig, and AuditChain.
 * We test the logic that the CLI routes to.
 */
import { validateURI, validateMessage, validateConfig } from "../src/validate";
import { AuditChain, CommitmentRecord } from "../src/audit";

// ---------------------------------------------------------------------------
// validateURI — used by `rcan-validate uri`
// ---------------------------------------------------------------------------

describe("rcan-validate uri (validateURI)", () => {
  test("valid full URI passes", () => {
    const r = validateURI("rcan://registry.rcan.dev/acme/arm/v2/unit-001");
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  test("empty string fails", () => {
    const r = validateURI("");
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  test("http scheme fails", () => {
    const r = validateURI("http://not-rcan/x/y/z/w");
    expect(r.ok).toBe(false);
  });

  test("missing device-id fails", () => {
    const r = validateURI("rcan://registry.rcan.dev/acme/arm/v2");
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateMessage — used by `rcan-validate message`
// ---------------------------------------------------------------------------

describe("rcan-validate message (validateMessage)", () => {
  test("valid message passes", () => {
    const msg = {
      rcan: "1.2",
      cmd: "move_forward",
      target: "rcan://registry.rcan.dev/acme/arm/v2/unit-001",
      confidence: 0.91,
    };
    const r = validateMessage(msg);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  test("valid JSON string input passes", () => {
    const msgStr = JSON.stringify({
      rcan: "1.2",
      cmd: "stop",
      target: "rcan://registry.rcan.dev/x/y/v1/z",
    });
    const r = validateMessage(msgStr);
    expect(r.ok).toBe(true);
  });

  test("missing cmd fails", () => {
    const r = validateMessage({ rcan: "1.2", target: "rcan://x/y/z/v1/w" });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("cmd"))).toBe(true);
  });

  test("missing target fails", () => {
    const r = validateMessage({ rcan: "1.2", cmd: "stop" });
    expect(r.ok).toBe(false);
  });

  test("no confidence warns", () => {
    const r = validateMessage({
      rcan: "1.2",
      cmd: "stop",
      target: "rcan://registry.rcan.dev/x/y/v1/z",
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /confidence/i.test(w))).toBe(true);
  });

  test("invalid JSON string fails", () => {
    const r = validateMessage("{not valid json");
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateConfig — used by `rcan-validate config`
// ---------------------------------------------------------------------------

describe("rcan-validate config (validateConfig)", () => {
  test("L3-conformant config has no failures", () => {
    const config = {
      rcan_version: "1.2",
      metadata: { manufacturer: "acme", model: "arm", version: "v2", rrn: "RRN-00000001" },
      agent: {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        confidence_gates: [{ threshold: 0.8 }],
        hitl_gates: [{ required_below: 0.7 }],
        commitment_chain: { enabled: true },
      },
      rcan_protocol: { jwt_auth: { enabled: true } },
    };
    const r = validateConfig(config);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  test("missing manufacturer fails L1", () => {
    const r = validateConfig({ metadata: { model: "arm" } });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("manufacturer"))).toBe(true);
  });

  test("missing model fails L1", () => {
    const r = validateConfig({ metadata: { manufacturer: "acme" } });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("model"))).toBe(true);
  });

  test("no jwt_auth warns L2", () => {
    const config = {
      metadata: { manufacturer: "acme", model: "arm" },
      agent: { confidence_gates: [{ threshold: 0.8 }] },
    };
    const r = validateConfig(config);
    expect(r.warnings.some((w) => /jwt_auth/i.test(w))).toBe(true);
  });

  test("no confidence_gates warns L2", () => {
    const config = {
      metadata: { manufacturer: "acme", model: "arm" },
      rcan_protocol: { jwt_auth: { enabled: true } },
    };
    const r = validateConfig(config);
    expect(r.warnings.some((w) => /confidence_gates/i.test(w))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AuditChain — used by `rcan-validate audit`
// ---------------------------------------------------------------------------

describe("rcan-validate audit (AuditChain)", () => {
  test("valid chain passes verification", () => {
    const chain = new AuditChain("test-secret");
    chain.append({ action: "move_forward", robotUri: "rcan://x/y/v1/z" });
    chain.append({ action: "stop", robotUri: "rcan://x/y/v1/z" });
    const result = chain.verifyAll();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.count).toBe(2);
  });

  test("roundtrip JSONL preserves chain", () => {
    const chain = new AuditChain("secret123");
    chain.append({ action: "grip", robotUri: "rcan://x/y/v1/z" });
    chain.append({ action: "release", robotUri: "rcan://x/y/v1/z" });

    const jsonl = chain.toJSONL();
    const restored = AuditChain.fromJSONL(jsonl, "secret123");
    const result = restored.verifyAll();
    expect(result.valid).toBe(true);
    expect(result.count).toBe(2);
  });

  test("tampered chain fails verification", () => {
    const chain = new AuditChain("secret");
    chain.append({ action: "move", robotUri: "rcan://x/y/v1/z" });
    chain.append({ action: "stop", robotUri: "rcan://x/y/v1/z" });

    // Tamper with the JSONL
    const jsonl = chain.toJSONL();
    const lines = jsonl.trim().split("\n");
    const firstRecord = JSON.parse(lines[0]);
    firstRecord.action = "TAMPERED";
    lines[0] = JSON.stringify(firstRecord);
    const tampered = lines.join("\n") + "\n";

    const restored = AuditChain.fromJSONL(tampered, "secret");
    const result = restored.verifyAll();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
