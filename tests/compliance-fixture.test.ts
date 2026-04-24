/**
 * Cross-language byte-parity tests for Release D1 compliance builders.
 *
 * Loads the bundled fixture at tests/fixtures/compliance-v1.json (sourced
 * from rcan-spec) and asserts that every case's canonicalJson(builder(input))
 * is byte-identical to the fixture's expected_bytes_base64 (decoded).
 *
 * Failure of any case means either:
 *   (a) the rcan-ts builder doesn't match rcan-py 3.1.1 — fix the builder, OR
 *   (b) canonicalJson has regressed — that would be a Release B regression.
 * Do NOT weaken the fixture; regenerate from rcan-py if the Python reference
 * has legitimately moved.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSafetyBenchmark,
  buildIfu,
  buildIncidentReport,
  buildEuRegisterEntry,
  canonicalJson,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "fixtures", "compliance-v1.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

type Case = {
  name: string;
  builder: string;
  input: Record<string, unknown>;
  expected_output: Record<string, unknown>;
  expected_bytes_base64: string;
};

const builders: Record<string, (opts: Record<string, unknown>) => Record<string, unknown>> = {
  build_safety_benchmark: buildSafetyBenchmark as never,
  build_ifu: buildIfu as never,
  build_incident_report: buildIncidentReport as never,
  build_eu_register_entry: buildEuRegisterEntry as never,
};

describe("compliance-v1 cross-language byte parity", () => {
  it("fixture loads and has 8 cases for rcan-py 3.1.1", () => {
    expect(fixture.format).toBe("rcan-compliance-fixture-v1");
    expect(fixture.rcan_py_version).toBe("3.1.1");
    expect(fixture.cases).toHaveLength(8);
  });

  for (const c of fixture.cases as Case[]) {
    it(c.name, () => {
      const builder = builders[c.builder];
      expect(builder).toBeDefined();
      const output = builder(c.input);
      const actualBytes = canonicalJson(output);
      const expectedBytes = new Uint8Array(Buffer.from(c.expected_bytes_base64, "base64"));
      expect(actualBytes).toEqual(expectedBytes);
    });
  }
});
