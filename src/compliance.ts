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

/** Results of a standardized robot safety benchmark run. */
export interface SafetyBenchmark {
  /** Benchmark protocol identifier, e.g. "rcan-sbp-v1" */
  readonly protocol: string;
  /** Overall score, 0.0–1.0 */
  readonly score: number;
  /** Number of test cases that passed */
  readonly pass_count: number;
  /** Number of test cases that failed */
  readonly fail_count: number;
  /** ISO-8601 timestamp when the benchmark was run */
  readonly run_at: string;
  /** Robot Registration Number this result is for */
  readonly rrn: string;
}

// ── §24: Instructions for Use ─────────────────────────────────────────────────

/** Operator-facing instructions for safe robot deployment. */
export interface InstructionsForUse {
  /** Robot Registration Number */
  readonly rrn: string;
  /** Human-readable robot name */
  readonly robot_name: string;
  /** Intended use description */
  readonly intended_use: string;
  /** Operating environment description */
  readonly operating_environment: string;
  /** List of use cases or conditions where the robot must NOT be deployed */
  readonly contraindications: readonly string[];
  /** Document version string */
  readonly version: string;
  /** ISO-8601 timestamp when these instructions were issued */
  readonly issued_at: string;
}

// ── §25: Post-Market Incident Monitoring ─────────────────────────────────────

/** Severity level of a post-market incident. */
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Resolution status of a post-market incident. */
export type IncidentStatus = 'open' | 'under_review' | 'resolved';

/** A post-market safety or performance incident record. */
export interface PostMarketIncident {
  /** Robot Registration Number */
  readonly rrn: string;
  /** Unique incident identifier */
  readonly incident_id: string;
  /** Severity classification */
  readonly severity: IncidentSeverity;
  /** Human-readable incident description */
  readonly description: string;
  /** ISO-8601 timestamp when the incident occurred */
  readonly occurred_at: string;
  /** ISO-8601 timestamp when the incident was reported */
  readonly reported_at: string;
  /** Current resolution status */
  readonly status: IncidentStatus;
}

// ── §26: EU Register Entry ───────────────────────────────────────────────────

/** Compliance status of a robot in the EU register. */
export type EuComplianceStatus =
  | 'compliant'
  | 'provisional'
  | 'non_compliant'
  | 'no_fria';

/** A robot's entry in the EU high-risk AI systems register. */
export interface EuRegisterEntry {
  /** Robot Registration Number */
  readonly rrn: string;
  /** Human-readable robot name */
  readonly robot_name: string;
  /** Manufacturer identifier */
  readonly manufacturer: string;
  /** Annex III basis for high-risk classification */
  readonly annex_iii_basis: string;
  /** ISO-8601 timestamp when FRIA was submitted, or null if not yet submitted */
  readonly fria_submitted_at: string | null;
  /** Current compliance status */
  readonly compliance_status: EuComplianceStatus;
  /** ISO-8601 timestamp when the robot was registered */
  readonly registered_at: string;
}
