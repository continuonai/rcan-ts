/**
 * rcan/authority — RCAN v2.1 Authority Access Protocol (EU AI Act §16(j)).
 *
 * Defines payload types for AUTHORITY_ACCESS (41) and AUTHORITY_RESPONSE (42)
 * message types, and helpers for building/validating authority requests.
 *
 * The authority access protocol enables regulatory bodies to request audit data
 * from robots under EU AI Act Article 16(j) and similar frameworks.
 *
 * Spec: §13 (Authority Access) — EU AI Act Art. 16 mapping
 */

import { MessageType } from "./message.js";
import { SPEC_VERSION } from "./version.js";

// ---------------------------------------------------------------------------
// Authority access data types
// ---------------------------------------------------------------------------

/** Allowed audit data categories that an authority may request. */
export type AuthorityDataCategory =
  | "audit_chain"
  | "transparency_records"
  | "sbom"
  | "firmware_manifest";

/** Payload for AUTHORITY_ACCESS (41) — sent by a regulatory authority to a robot. */
export interface AuthorityAccessPayload {
  /** Unique request identifier (correlated in the response). */
  requestId: string;
  /** Authority identifier, e.g. "EU-AI-ACT-NCA-DE" */
  authorityId: string;
  /** Audit data categories requested. */
  requestedData: AuthorityDataCategory[];
  /** Human-readable justification for the request. */
  justification: string;
  /** Unix timestamp — request must be responded to before this time. */
  expiresAt: number;
}

/** Provided audit data in an AUTHORITY_RESPONSE. */
export interface AuthorityResponseData {
  auditChain?: unknown[];
  transparencyRecords?: unknown[];
  sbomUrl?: string;
  firmwareManifestUrl?: string;
}

/** Payload for AUTHORITY_RESPONSE (42) — sent by the robot in reply. */
export interface AuthorityResponsePayload {
  /** Correlates with the AUTHORITY_ACCESS requestId. */
  requestId: string;
  /** Robot Registration Number of the responding robot. */
  rrn: string;
  /** Unix timestamp when the data was packaged. */
  providedAt: number;
  /** Provided audit data. */
  data: AuthorityResponseData;
}

// ---------------------------------------------------------------------------
// Wire-format helpers
// ---------------------------------------------------------------------------

/** Convert AuthorityAccessPayload to/from snake_case wire format. */
export interface AuthorityAccessPayloadWire {
  request_id:     string;
  authority_id:   string;
  requested_data: AuthorityDataCategory[];
  justification:  string;
  expires_at:     number;
}

export function authorityAccessToWire(p: AuthorityAccessPayload): AuthorityAccessPayloadWire {
  return {
    request_id:     p.requestId,
    authority_id:   p.authorityId,
    requested_data: p.requestedData,
    justification:  p.justification,
    expires_at:     p.expiresAt,
  };
}

export function authorityAccessFromWire(w: AuthorityAccessPayloadWire): AuthorityAccessPayload {
  return {
    requestId:     w.request_id,
    authorityId:   w.authority_id,
    requestedData: w.requested_data ?? [],
    justification: w.justification ?? "",
    expiresAt:     w.expires_at ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate an authority access payload.
 * Returns an array of error strings (empty = valid).
 */
export function validateAuthorityAccess(p: AuthorityAccessPayload): string[] {
  const errors: string[] = [];
  if (!p.requestId) errors.push("requestId is required");
  if (!p.authorityId) errors.push("authorityId is required");
  if (!p.requestedData || p.requestedData.length === 0)
    errors.push("requestedData must include at least one category");
  if (!p.justification) errors.push("justification is required");
  if (!p.expiresAt || p.expiresAt <= 0) errors.push("expiresAt must be a positive Unix timestamp");
  if (p.expiresAt < Date.now() / 1000) errors.push("expiresAt is in the past — request has expired");
  return errors;
}

/** Return true if an AUTHORITY_ACCESS request is still within its deadline. */
export function isAuthorityRequestValid(p: AuthorityAccessPayload): boolean {
  return Date.now() / 1000 < p.expiresAt && validateAuthorityAccess(p).length === 0;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTHORITY_ERROR_CODES = {
  NOT_RECOGNIZED:  "AUTHORITY_NOT_RECOGNIZED",
  REQUEST_EXPIRED: "AUTHORITY_REQUEST_EXPIRED",
  INVALID_TOKEN:   "AUTHORITY_INVALID_TOKEN",
  RATE_LIMITED:    "AUTHORITY_RATE_LIMITED",
} as const;
