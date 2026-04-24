/**
 * Behavioral tests for the Release D1 compliance builders — cover the
 * invariants that aren't directly captured by the fixture (auto-computed
 * totals, default fallbacks, schema field correctness).
 *
 * These tests are redundant with compliance-fixture.test.ts for byte
 * parity but document the human-readable intent of each builder.
 */

import {
  ART13_COVERAGE,
  ART72_NOTE,
  CONFORMITY_STATUS_DECLARED,
  EU_REGISTER_SCHEMA,
  IFU_SCHEMA,
  INCIDENT_REPORT_SCHEMA,
  REPORTING_DEADLINES,
  SAFETY_BENCHMARK_SCHEMA,
  SUBMISSION_INSTRUCTIONS,
  VALID_SEVERITIES,
  buildEuRegisterEntry,
  buildIfu,
  buildIncidentReport,
  buildSafetyBenchmark,
} from "../src/index.js";

const T = "2026-04-23T00:00:00Z";

describe("buildSafetyBenchmark", () => {
  test("output includes schema === SAFETY_BENCHMARK_SCHEMA", () => {
    const out = buildSafetyBenchmark({
      iterations: 1, thresholds: {}, results: {}, mode: "synthetic",
      generated_at: T, overall_pass: true,
    });
    expect(out.schema).toBe(SAFETY_BENCHMARK_SCHEMA);
    expect(out.schema).toBe("rcan-safety-benchmark-v1");
  });

  test("passes through iterations, thresholds, results, mode, overall_pass unchanged", () => {
    const out = buildSafetyBenchmark({
      iterations: 42, thresholds: { x_p95_ms: 100 }, results: { x: { pass: true } },
      mode: "hardware", generated_at: T, overall_pass: false,
    });
    expect(out.iterations).toBe(42);
    expect(out.thresholds).toEqual({ x_p95_ms: 100 });
    expect(out.results).toEqual({ x: { pass: true } });
    expect(out.mode).toBe("hardware");
    expect(out.overall_pass).toBe(false);
  });
});

describe("buildIfu", () => {
  const minInput = {
    provider_identity: { name: "P" },
    intended_purpose: { note: "x" },
    capabilities_and_limitations: { note: "x" },
    accuracy_and_performance: { note: "x" },
    human_oversight_measures: { note: "x" },
    known_risks_and_misuse: { note: "x" },
    expected_lifetime: { note: "x" },
    maintenance_requirements: { note: "x" },
    generated_at: T,
  };

  test("output includes schema === IFU_SCHEMA", () => {
    expect(buildIfu(minInput).schema).toBe(IFU_SCHEMA);
  });

  test("emits art13_coverage matching ART13_COVERAGE constant", () => {
    expect(buildIfu(minInput).art13_coverage).toEqual([...ART13_COVERAGE]);
  });

  test("output contains all 8 Art. 13(3) section fields at top level", () => {
    const out = buildIfu(minInput);
    for (const key of ART13_COVERAGE) {
      expect(out).toHaveProperty(key);
    }
  });
});

describe("buildIncidentReport", () => {
  test("auto-computes total_incidents === incidents.length", () => {
    const out = buildIncidentReport({
      rrn: "RRN-000000000001",
      incidents: [
        { severity: "life_health" },
        { severity: "other" },
        { severity: "life_health" },
      ],
      generated_at: T,
    });
    expect(out.total_incidents).toBe(3);
  });

  test("incidents_by_severity has all VALID_SEVERITIES keys initialized to 0", () => {
    const out = buildIncidentReport({
      rrn: "RRN-000000000001",
      incidents: [],
      generated_at: T,
    });
    for (const sev of VALID_SEVERITIES) {
      expect(out.incidents_by_severity[sev]).toBe(0);
    }
  });

  test("incidents_by_severity counts known severities", () => {
    const out = buildIncidentReport({
      rrn: "RRN-000000000001",
      incidents: [
        { severity: "life_health" },
        { severity: "life_health" },
        { severity: "other" },
      ],
      generated_at: T,
    });
    expect(out.incidents_by_severity).toEqual({ life_health: 2, other: 1 });
  });

  test("silently ignores unknown severities (no throw, no count)", () => {
    const out = buildIncidentReport({
      rrn: "RRN-000000000001",
      incidents: [
        { severity: "life_health" },
        { severity: "low" },        // unknown — ignored
        { severity: "critical" },   // unknown — ignored
        { severity: "other" },
      ],
      generated_at: T,
    });
    expect(out.total_incidents).toBe(4);
    expect(out.incidents_by_severity).toEqual({ life_health: 1, other: 1 });
  });

  test("output includes schema, reporting_deadlines, art72_note from constants", () => {
    const out = buildIncidentReport({
      rrn: "RRN-000000000001",
      incidents: [],
      generated_at: T,
    });
    expect(out.schema).toBe(INCIDENT_REPORT_SCHEMA);
    expect(out.reporting_deadlines).toEqual({ ...REPORTING_DEADLINES });
    expect(out.art72_note).toBe(ART72_NOTE);
  });
});

describe("buildEuRegisterEntry", () => {
  const minInput = {
    rmn: "RMN-000000000007",
    fria_ref: "fria.json",
    provider: { name: "craigm26" },
    system: { rrn: "RRN-000000000001" },
    annex_iii_basis: "Annex III §5(b)",
    generated_at: T,
  };

  test("output includes schema === EU_REGISTER_SCHEMA", () => {
    expect(buildEuRegisterEntry(minInput).schema).toBe(EU_REGISTER_SCHEMA);
  });

  test("output carries top-level rmn", () => {
    expect(buildEuRegisterEntry(minInput).rmn).toBe("RMN-000000000007");
  });

  test("uses CONFORMITY_STATUS_DECLARED when conformity_status is omitted", () => {
    expect(buildEuRegisterEntry(minInput).conformity_status).toBe(CONFORMITY_STATUS_DECLARED);
  });

  test("uses SUBMISSION_INSTRUCTIONS when submission_instructions is omitted", () => {
    expect(buildEuRegisterEntry(minInput).submission_instructions).toBe(SUBMISSION_INSTRUCTIONS);
  });

  test("respects explicit conformity_status override", () => {
    const out = buildEuRegisterEntry({ ...minInput, conformity_status: "provisional" });
    expect(out.conformity_status).toBe("provisional");
  });

  test("respects explicit submission_instructions override", () => {
    const out = buildEuRegisterEntry({ ...minInput, submission_instructions: "Custom." });
    expect(out.submission_instructions).toBe("Custom.");
  });
});
