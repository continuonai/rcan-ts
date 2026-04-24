/**
 * Tests for fromManifest — ROBOT.md cross-link.
 */

import { jest } from "@jest/globals";
import { fromManifest, normalizeAgent, validateAgentRuntimes, type ManifestInfo } from "../src/manifest.js";

const BOB_FM = {
  rcan_version: "3.0",
  metadata: {
    robot_name: "bob",
    manufacturer: "acme",
    model: "so-arm101",
    version: "1.0",
    device_id: "bob-001",
    rrn: "RRN-000000000003",
    rcan_uri: "rcan://rcan.dev/acme/so-arm101/1-0/bob-001",
  },
  physics: { type: "arm", dof: 6 },
  drivers: [{ id: "arm", protocol: "feetech", port: "/dev/ttyACM0" }],
  capabilities: ["arm.pick"],
  safety: { estop: { software: true, response_ms: 100 } },
  network: {
    rrf_endpoint: "https://rcan.dev",
    port: 8001,
    signing_alg: "pqc-hybrid-v1",
  },
};

describe("fromManifest", () => {
  test("returns ManifestInfo with all fields populated", () => {
    const info: ManifestInfo = fromManifest(BOB_FM);
    expect(info.rrn).toBe("RRN-000000000003");
    expect(info.rcanUri).toBe("rcan://rcan.dev/acme/so-arm101/1-0/bob-001");
    expect(info.endpoint).toBe("https://rcan.dev");
    expect(info.signingAlg).toBe("pqc-hybrid-v1");
    expect(info.robotName).toBe("bob");
    expect(info.rcanVersion).toBe("3.0");
    expect(info.publicResolver).toBe("https://rcan.dev/r/RRN-000000000003");
  });

  test("unregistered robot returns null for rrn/rcan_uri/publicResolver", () => {
    const fm = {
      ...BOB_FM,
      metadata: {
        ...BOB_FM.metadata,
        rrn: undefined,
        rcan_uri: undefined,
      },
    };
    const info = fromManifest(fm);
    expect(info.rrn).toBeNull();
    expect(info.rcanUri).toBeNull();
    expect(info.publicResolver).toBeNull();
    expect(info.robotName).toBe("bob");
  });

  test("preserves original frontmatter object by reference", () => {
    const info = fromManifest(BOB_FM);
    expect(info.frontmatter).toBe(BOB_FM);
    // Callers can dig deeper:
    expect(
      (info.frontmatter.physics as Record<string, unknown>).dof,
    ).toBe(6);
  });

  test("coerces non-string rcan_version to string", () => {
    const fm = { ...BOB_FM, rcan_version: 3.0 };
    const info = fromManifest(fm);
    expect(info.rcanVersion).toBe("3");
  });

  test("missing network section returns null endpoint + signingAlg", () => {
    const { network: _network, ...bare } = BOB_FM;
    const info = fromManifest(bare);
    expect(info.endpoint).toBeNull();
    expect(info.signingAlg).toBeNull();
  });

  test("throws TypeError on non-object input", () => {
    expect(() => fromManifest(null as never)).toThrow(TypeError);
    expect(() => fromManifest("hello" as never)).toThrow(TypeError);
    expect(() => fromManifest([] as never)).toThrow(TypeError);
  });

  test("empty frontmatter is valid — all fields null", () => {
    const info = fromManifest({});
    expect(info.rrn).toBeNull();
    expect(info.endpoint).toBeNull();
    expect(info.publicResolver).toBeNull();
    expect(info.robotName).toBeNull();
    expect(info.rcanVersion).toBeNull();
    expect(info.frontmatter).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// normalizeAgent (rcan-spec v3.2 §8.6)
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeAgent", () => {
  test("null/undefined/empty → null", () => {
    expect(normalizeAgent(null)).toBeNull();
    expect(normalizeAgent(undefined)).toBeNull();
    expect(normalizeAgent({})).toBeNull();
  });

  test("structured runtimes[] returned as-is, no warning", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const agent = {
      runtimes: [
        { id: "robot-md", harness: "claude-code", default: true },
        { id: "opencastor", harness: "castor-default" },
      ],
    };
    const out = normalizeAgent(agent);
    expect(out).toEqual(agent.runtimes);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("flat form wrapped + emits deprecation console.warn", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const agent = {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      latency_budget_ms: 200,
      safety_stop: true,
    };
    const out = normalizeAgent(agent);
    expect(out).toHaveLength(1);
    expect(out?.[0]?.id).toBe("robot-md");
    expect(out?.[0]?.harness).toBe("default");
    expect(out?.[0]?.default).toBe(true);
    expect((out?.[0]?.models as Array<Record<string, unknown>>)?.[0]).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      role: "primary",
    });
    expect(out?.[0]?.latency_budget_ms).toBe(200);
    expect(out?.[0]?.safety_stop).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/deprecated/);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/agent\.runtimes/);
    warnSpy.mockRestore();
  });

  test("both flat form AND runtimes[] → throws", () => {
    const agent = {
      provider: "anthropic",
      runtimes: [{ id: "robot-md", harness: "claude-code" }],
    };
    expect(() => normalizeAgent(agent)).toThrow(
      /both flat.*and runtimes/,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// validateAgentRuntimes (rcan-spec v3.2 §8.6 field rules)
// ────────────────────────────────────────────────────────────────────────────

describe("validateAgentRuntimes", () => {
  test("single entry with no default is valid", () => {
    const errors = validateAgentRuntimes([
      { id: "robot-md", harness: "claude-code" },
    ]);
    expect(errors).toEqual([]);
  });

  test("multiple entries require exactly one default: true", () => {
    // zero defaults → error
    const zeroErrs = validateAgentRuntimes([
      { id: "robot-md", harness: "claude-code" },
      { id: "opencastor", harness: "castor-default" },
    ]);
    expect(zeroErrs.length).toBeGreaterThan(0);
    expect(zeroErrs.join(" ")).toMatch(/exactly one default/);

    // two defaults → error
    const twoErrs = validateAgentRuntimes([
      { id: "robot-md", harness: "claude-code", default: true },
      { id: "opencastor", harness: "castor-default", default: true },
    ]);
    expect(twoErrs.length).toBeGreaterThan(0);

    // exactly one default → no error
    const oneErrs = validateAgentRuntimes([
      { id: "robot-md", harness: "claude-code", default: true },
      { id: "opencastor", harness: "castor-default" },
    ]);
    expect(oneErrs).toEqual([]);
  });

  test("every entry must have non-empty id and harness", () => {
    const missingId = validateAgentRuntimes([
      { id: "", harness: "claude-code" } as never,
    ]);
    expect(missingId.join(" ")).toMatch(/id/);

    const missingHarness = validateAgentRuntimes([
      { id: "robot-md", harness: "" } as never,
    ]);
    expect(missingHarness.join(" ")).toMatch(/harness/);

    const bothMissing = validateAgentRuntimes([{} as never]);
    expect(bothMissing.length).toBeGreaterThanOrEqual(2);
  });

  test("unknown runtime-specific fields pass through (no error)", () => {
    const errors = validateAgentRuntimes([
      {
        id: "opencastor",
        harness: "castor-default",
        custom_future_field: "anything",
        models: [{ provider: "local", model: "pi0" }],
      },
    ]);
    expect(errors).toEqual([]);
  });
});
