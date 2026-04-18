/**
 * Tests for fromManifest — ROBOT.md cross-link.
 */

import { fromManifest, type ManifestInfo } from "../src/manifest.js";

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
