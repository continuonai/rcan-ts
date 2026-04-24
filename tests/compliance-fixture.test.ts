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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSafetyBenchmark,
  buildIfu,
  buildIncidentReport,
  buildEuRegisterEntry,
  canonicalJson,
} from "../src/index.js";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const FIXTURE_PATH = join(_dirname, "fixtures", "compliance-v1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));

type Case = {
  name: string;
  builder: string;
  input: Record<string, unknown>;
  expected_output: Record<string, unknown>;
  expected_bytes_base64: string;
};

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "base64"));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const builders: Record<string, (opts: Record<string, unknown>) => Record<string, unknown>> = {
  build_safety_benchmark: buildSafetyBenchmark as never,
  build_ifu: buildIfu as never,
  build_incident_report: buildIncidentReport as never,
  build_eu_register_entry: buildEuRegisterEntry as never,
};

describe("compliance-v1 cross-language byte parity", () => {
  test("fixture loads and has 8 cases for rcan-py 3.1.1", () => {
    expect(fixture.format).toBe("rcan-compliance-fixture-v1");
    expect(fixture.rcan_py_version).toBe("3.1.1");
    expect(fixture.cases).toHaveLength(8);
  });

  for (const c of fixture.cases as Case[]) {
    test(`case ${c.name}`, () => {
      const builder = builders[c.builder];
      expect(builder).toBeDefined();
      const output = builder(c.input);
      const actualBytes = canonicalJson(output);
      const expectedBytes = b64decode(c.expected_bytes_base64);
      const ok = bytesEqual(actualBytes, expectedBytes);
      if (!ok) {
        console.error("EXPECTED:", new TextDecoder().decode(expectedBytes));
        console.error("ACTUAL:  ", new TextDecoder().decode(actualBytes));
      }
      expect(ok).toBe(true);
    });
  }
});
