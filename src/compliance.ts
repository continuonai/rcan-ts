/**
 * rcan/compliance — RCAN v3.0 compliance schema types (§22–§26).
 *
 * All interfaces are read-only (immutable by convention).
 * Field names match the wire format and rcan-py exactly.
 *
 * Spec: §22 FRIA, §23 SafetyBenchmark, §24 IFU, §25 PostMarket, §26 EuRegister
 */

// ── §22: FRIA (Fundamental Rights Impact Assessment) ─────────────────────────

/** ML-DSA-65 signing key record embedded in a FRIA document. */
export interface FriaSigningKey {
  /** Algorithm identifier, e.g. "ml-dsa-65" */
  readonly alg: string;
  /** Key identifier */
  readonly kid: string;
  /** Base64url-encoded public key */
  readonly public_key: string;
}

/** Conformance test results embedded in a FRIA document. */
export interface FriaConformance {
  /** Overall conformance score, 0.0–1.0 */
  readonly score: number;
  /** Number of checks that passed */
  readonly pass_count: number;
  /** Number of checks that produced warnings */
  readonly warn_count: number;
  /** Number of checks that failed */
  readonly fail_count: number;
}

/** A complete FRIA document as stored and exchanged. */
export interface FriaDocument {
  /** Schema identifier, e.g. "rcan-fria-v1" */
  readonly schema: string;
  /** ISO-8601 timestamp when the document was generated */
  readonly generated_at: string;
  /** Robot system record: { rrn, robot_name, rcan_version, ... } */
  readonly system: Record<string, unknown>;
  /** Deployment context: { annex_iii_basis, prerequisite_waived, ... } */
  readonly deployment: Record<string, unknown>;
  /** ML-DSA-65 signing key used for this document */
  readonly signing_key: FriaSigningKey;
  /** Signature block: { alg, kid, value (base64url) } */
  readonly sig: Record<string, unknown>;
  /** Conformance results, or null if not yet computed */
  readonly conformance: FriaConformance | null;
}

// ── §23: Safety Benchmark Protocol ───────────────────────────────────────────

/** Output of `buildSafetyBenchmark` — §23 rcan-safety-benchmark-v1 envelope. */
export interface SafetyBenchmark {
  /** Schema identifier — always `SAFETY_BENCHMARK_SCHEMA` ("rcan-safety-benchmark-v1"). */
  readonly schema: string;
  /** ISO-8601 timestamp when the benchmark was generated. */
  readonly generated_at: string;
  /** Run mode, e.g. "synthetic" or "hardware". */
  readonly mode: string;
  /** Number of samples per path. */
  readonly iterations: number;
  /** Threshold map keyed by `{path}_p95_ms` (caller pre-names). */
  readonly thresholds: Record<string, number>;
  /** Path name → stats object ({ min_ms, mean_ms, p95_ms, p99_ms, max_ms, pass }). */
  readonly results: Record<string, unknown>;
  /** Whether every path passed its threshold. */
  readonly overall_pass: boolean;
}

// ── §24: Instructions for Use ─────────────────────────────────────────────────

/** Output of `buildIfu` — §24 rcan-ifu-v1 envelope (EU AI Act Art. 13(3)). */
export interface InstructionsForUse {
  /** Schema identifier — always `IFU_SCHEMA` ("rcan-ifu-v1"). */
  readonly schema: string;
  /** ISO-8601 timestamp of issuance. */
  readonly generated_at: string;
  /** The 8 Art. 13(3) section field names in canonical order. */
  readonly art13_coverage: readonly string[];
  /** Art. 13(3)(a) provider identity block. */
  readonly provider_identity: Record<string, unknown>;
  /** Art. 13(3)(b) intended purpose block. */
  readonly intended_purpose: Record<string, unknown>;
  /** Art. 13(3)(c) capabilities and limitations. */
  readonly capabilities_and_limitations: Record<string, unknown>;
  /** Art. 13(3)(d) accuracy and performance. */
  readonly accuracy_and_performance: Record<string, unknown>;
  /** Art. 13(3)(e) human oversight measures. */
  readonly human_oversight_measures: Record<string, unknown>;
  /** Art. 13(3)(f) known risks and misuse. */
  readonly known_risks_and_misuse: Record<string, unknown>;
  /** Art. 13(3)(g) expected lifetime. */
  readonly expected_lifetime: Record<string, unknown>;
  /** Art. 13(3)(h) maintenance requirements. */
  readonly maintenance_requirements: Record<string, unknown>;
}

// ── §25: Post-Market Incident Monitoring ─────────────────────────────────────

/** EU AI Act Art. 72 serious-incident categories — used by §25 post-market reports. */
export type IncidentSeverity = "life_health" | "other";

/** Output of `buildIncidentReport` — §25 rcan-incidents-v1 envelope (EU AI Act Art. 72). */
export interface PostMarketIncidentReport {
  /** Schema identifier — always `INCIDENT_REPORT_SCHEMA` ("rcan-incidents-v1"). */
  readonly schema: string;
  /** ISO-8601 timestamp when the report was generated. */
  readonly generated_at: string;
  /** Robot Registration Number this report covers. */
  readonly rrn: string;
  /** `incidents.length` — auto-computed by the builder. */
  readonly total_incidents: number;
  /** `{ life_health: N, other: M }` — auto-computed. Unknown severities silently ignored. */
  readonly incidents_by_severity: Record<IncidentSeverity, number>;
  /** Per-severity reporting deadline strings from `REPORTING_DEADLINES`. */
  readonly reporting_deadlines: Record<string, string>;
  /** The Art. 72 provider-obligation note from `ART72_NOTE`. */
  readonly art72_note: string;
  /** The raw incident entries passed to the builder. */
  readonly incidents: readonly Record<string, unknown>[];
}

// ── §26: EU Register Entry ───────────────────────────────────────────────────

/** Output of `buildEuRegisterEntry` — §26 rcan-eu-register-v1 envelope (EU AI Act Art. 49). */
export interface EuRegisterEntry {
  /** Schema identifier — always `EU_REGISTER_SCHEMA` ("rcan-eu-register-v1"). */
  readonly schema: string;
  /** ISO-8601 timestamp of entry generation. */
  readonly generated_at: string;
  /** Basename of the signed rcan-fria-v1 JSON attached. */
  readonly fria_ref: string;
  /** Provider block — `{ name, contact, ... }`. */
  readonly provider: Record<string, unknown>;
  /** System block — `{ rrn, rrn_uri, robot_name, rcan_version, opencastor_version, ... }`. */
  readonly system: Record<string, unknown>;
  /** The Annex III high-risk category string. */
  readonly annex_iii_basis: string;
  /** Defaults to `CONFORMITY_STATUS_DECLARED` ("declared") unless overridden. */
  readonly conformity_status: string;
  /** Defaults to the `SUBMISSION_INSTRUCTIONS` blurb unless overridden. */
  readonly submission_instructions: string;
}

// ═════════════════════════════════════════════════════════════════════
// Schema identifiers + spec-domain constants
//
// Values copied from rcan-py 3.1.1 rcan/compliance.py. These MUST stay
// byte-identical to rcan-py — the compliance-v1 fixture proves it.
// ═════════════════════════════════════════════════════════════════════

/** §23 schema identifier. */
export const SAFETY_BENCHMARK_SCHEMA = "rcan-safety-benchmark-v1";
/** §24 schema identifier. */
export const IFU_SCHEMA = "rcan-ifu-v1";
/** §25 schema identifier. */
export const INCIDENT_REPORT_SCHEMA = "rcan-incidents-v1";
/** §26 schema identifier. */
export const EU_REGISTER_SCHEMA = "rcan-eu-register-v1";

/**
 * §24 Art. 13(3) — the 8 IFU sections EU AI Act mandates, in canonical order.
 * buildIfu emits this list as the `art13_coverage` field.
 */
export const ART13_COVERAGE: readonly string[] = [
  "provider_identity",
  "intended_purpose",
  "capabilities_and_limitations",
  "accuracy_and_performance",
  "human_oversight_measures",
  "known_risks_and_misuse",
  "expected_lifetime",
  "maintenance_requirements",
] as const;

/** §25 Art. 72 — post-market incident severity categories. */
export const VALID_SEVERITIES: readonly IncidentSeverity[] = ["life_health", "other"] as const;

/** §25 Art. 72 — reporting deadlines per severity. */
export const REPORTING_DEADLINES: Readonly<Record<string, string>> = {
  life_health: "15 days from incident timestamp",
  other: "90 days from incident timestamp",
};

/** §25 Art. 72 provider-obligation note embedded in every incident report. */
export const ART72_NOTE: string =
  "Providers must report serious incidents to the relevant national " +
  "authority within the applicable deadline per EU AI Act Art. 72.";

/** §26 Art. 49 default conformity status. */
export const CONFORMITY_STATUS_DECLARED = "declared";

/** §26 Art. 49 default submission instructions. */
export const SUBMISSION_INSTRUCTIONS: string =
  "Submit this package to the EU AI Act database at " +
  "https://ec.europa.eu/digital-strategy/en/policies/european-ai-act. " +
  "Include the referenced rcan-fria-v1 JSON as an attachment.";
