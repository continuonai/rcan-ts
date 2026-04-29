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

  test("populates agentRuntimes from structured agent.runtimes[]", () => {
    const fm = {
      ...BOB_FM,
      agent: {
        runtimes: [
          {
            id: "robot-md",
            harness: "claude-code",
            default: true,
            models: [
              { provider: "anthropic", model: "claude-sonnet-4-6", role: "primary" },
            ],
          },
          { id: "opencastor", harness: "castor-default" },
        ],
      },
    };
    const info = fromManifest(fm);
    expect(info.agentRuntimes).toHaveLength(2);
    expect(info.agentRuntimes?.[0]?.id).toBe("robot-md");
    expect(info.agentRuntimes?.[0]?.default).toBe(true);
    expect(info.agentRuntimes?.[1]?.id).toBe("opencastor");
  });

  test("agentRuntimes is null when no agent block declared", () => {
    const info = fromManifest(BOB_FM);
    expect(info.agentRuntimes).toBeNull();
  });

  test("fromManifest raises on invalid agent.runtimes[] (missing harness)", () => {
    const fm = {
      ...BOB_FM,
      agent: {
        runtimes: [{ id: "robot-md" }], // missing harness
      },
    };
    expect(() => fromManifest(fm)).toThrow(/harness/);
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

  test("runtimes: null (YAML empty value) treated as no runtimes — parity with rcan-py", () => {
    // YAML `runtimes:` with no value parses to null. rcan-py's
    // `if runtimes is not None` falls through; rcan-ts must match.
    expect(normalizeAgent({ runtimes: null } as unknown as Record<string, unknown>)).toBeNull();

    // And when null runtimes coexists with flat form, the flat form still wraps.
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const out = normalizeAgent({
      runtimes: null,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    } as unknown as Record<string, unknown>);
    expect(out).toHaveLength(1);
    expect(out?.[0]?.id).toBe("robot-md");
    warnSpy.mockRestore();
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


// ----- v3.3 §8.7 voice block --------------------------------------------------

import { validateVoiceBlock, normalizeAlias } from "../src/manifest.js";

const VOICE_FM = {
  rcan_version: "3.3",
  metadata: { robot_name: "bob", rrn: "RRN-000000000003" },
  voice: {
    aliases: ["bobby", "hey-bob"],
    language: "en-US",
    tts_voice: "en_US-amy-low",
  },
};

describe("voice block (rcan-spec v3.3 §8.7)", () => {
  test("fromManifest populates ManifestInfo.voice", () => {
    const info = fromManifest(VOICE_FM);
    expect(info.voice).not.toBeNull();
    expect(info.voice?.aliases).toEqual(["bobby", "hey-bob"]);
    expect(info.voice?.language).toBe("en-US");
    expect(info.voice?.tts_voice).toBe("en_US-amy-low");
  });

  test("absent voice block → voice is null", () => {
    const info = fromManifest({ ...VOICE_FM, voice: undefined });
    expect(info.voice).toBeNull();
  });

  test("voice scalar (not a mapping) → warning + voice is null", () => {
    const warns = validateVoiceBlock("just a string", "bob");
    expect(warns.some((w) => /not a mapping/.test(w))).toBe(true);
  });

  test("alias matching robot name (after NFKC + casefold) warns", () => {
    const warns = validateVoiceBlock(
      { aliases: ["BOB", "bobby"] },
      "bob",
    );
    expect(warns.some((w) => /duplicates robot name/.test(w))).toBe(true);
  });

  test("NFKC-collapsed duplicate aliases warn", () => {
    const warns = validateVoiceBlock(
      { aliases: ["bobby", "BOBBY"] },
      "bob",
    );
    expect(warns.some((w) => /NFKC-collapses/.test(w))).toBe(true);
  });

  test("malformed BCP-47 language warns (does not throw)", () => {
    const warns = validateVoiceBlock(
      { language: "123_not_a_lang!" },
      "bob",
    );
    expect(warns.some((w) => /BCP-47/.test(w))).toBe(true);
  });

  test("aliases not a list → warning", () => {
    const warns = validateVoiceBlock(
      { aliases: "not-a-list" } as unknown,
      "bob",
    );
    expect(warns.some((w) => /must be a list/.test(w))).toBe(true);
  });

  test("clean voice block produces no warnings", () => {
    const warns = validateVoiceBlock(
      { aliases: ["bobby"], language: "en-US", tts_voice: "amy" },
      "bob",
    );
    expect(warns).toEqual([]);
  });

  test("normalizeAlias matches Python NFKC + casefold for ASCII", () => {
    expect(normalizeAlias("BOB")).toBe("bob");
    expect(normalizeAlias("Hey-Bob")).toBe("hey-bob");
    expect(normalizeAlias("Café")).toBe("café");
  });
});
