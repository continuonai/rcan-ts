/**
 * RCAN Consent Wire Protocol — §11.2
 *
 * Three message types:
 *   CONSENT_REQUEST (20) — requester asks target's owner for access
 *   CONSENT_GRANT   (21) — owner approves
 *   CONSENT_DENY    (22) — owner denies
 *
 * API mirrors rcan-py consent module exactly (camelCased).
 */

import { RCANMessage, MessageType } from "./message.js";
import { SPEC_VERSION } from "./version.js";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ConsentType = "cross_robot" | "training_data" | "observer";

export interface ConsentRequestParams {
  requesterRuri: string;
  requesterOwner: string;
  targetRuri: string;
  requestedScopes: string[];
  durationHours: number;
  justification: string;
  requestId?: string;
  consentType?: ConsentType;
  dataCategories?: string[];
}

export interface ConsentResponseParams {
  requestId: string;
  grantedScopes?: string[];
  expiresAt?: string;
  reason?: string;
}

/**
 * Build a CONSENT_REQUEST message.
 *
 * Mirrors rcan-py: build_consent_request()
 */
export function makeConsentRequest(params: ConsentRequestParams): RCANMessage {
  const requestId = params.requestId ?? generateId();
  return new RCANMessage({
    rcan: SPEC_VERSION,
    cmd: "CONSENT_REQUEST",
    target: params.targetRuri,
    params: {
      message_type: MessageType.CONSENT_REQUEST,
      requester_ruri: params.requesterRuri,
      requester_owner: params.requesterOwner,
      target_ruri: params.targetRuri,
      requested_scopes: params.requestedScopes,
      duration_hours: params.durationHours,
      justification: params.justification,
      request_id: requestId,
      consent_type: params.consentType ?? "cross_robot",
      data_categories: params.dataCategories ?? [],
    },
  });
}

/**
 * Build a CONSENT_GRANT message.
 *
 * Mirrors rcan-py: build_consent_grant()
 */
export function makeConsentGrant(params: ConsentResponseParams): RCANMessage {
  const expiresAt =
    params.expiresAt ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  return new RCANMessage({
    rcan: SPEC_VERSION,
    cmd: "CONSENT_GRANT",
    target: "rcan://local/consent",
    params: {
      message_type: MessageType.CONSENT_GRANT,
      request_id: params.requestId,
      granted_scopes: params.grantedScopes ?? [],
      expires_at: expiresAt,
      reason: params.reason ?? "approved",
    },
  });
}

/**
 * Build a CONSENT_DENY message.
 *
 * Mirrors rcan-py: build_consent_deny()
 */
export function makeConsentDeny(params: ConsentResponseParams): RCANMessage {
  return new RCANMessage({
    rcan: SPEC_VERSION,
    cmd: "CONSENT_DENY",
    target: "rcan://local/consent",
    params: {
      message_type: MessageType.CONSENT_DENY,
      request_id: params.requestId,
      reason: params.reason ?? "denied",
    },
  });
}

/**
 * Validate a consent message (CONSENT_REQUEST, CONSENT_GRANT, or CONSENT_DENY).
 *
 * Mirrors rcan-py: verify_consent_signature() (structure check only — JWT
 * signature verification is performed by the auth layer).
 */
export function validateConsentMessage(
  msg: RCANMessage
): { valid: boolean; reason: string } {
  const cmd = msg.cmd;
  const p = msg.params;
  const msgType = p.message_type as number | undefined;

  if (cmd === "CONSENT_REQUEST") {
    if (msgType !== MessageType.CONSENT_REQUEST) {
      return { valid: false, reason: "message_type must be CONSENT_REQUEST (20)" };
    }
    if (!p.requester_ruri) return { valid: false, reason: "missing requester_ruri" };
    if (!p.target_ruri) return { valid: false, reason: "missing target_ruri" };
    if (!p.requested_scopes || !Array.isArray(p.requested_scopes) || (p.requested_scopes as string[]).length === 0) {
      return { valid: false, reason: "requested_scopes must be a non-empty array" };
    }
    if (!p.request_id) return { valid: false, reason: "missing request_id" };
    if (!p.justification) return { valid: false, reason: "missing justification" };
    return { valid: true, reason: "ok" };
  }

  if (cmd === "CONSENT_GRANT") {
    if (msgType !== MessageType.CONSENT_GRANT) {
      return { valid: false, reason: "message_type must be CONSENT_GRANT (21)" };
    }
    if (!p.request_id) return { valid: false, reason: "missing request_id" };
    if (!p.expires_at) return { valid: false, reason: "missing expires_at" };
    return { valid: true, reason: "ok" };
  }

  if (cmd === "CONSENT_DENY") {
    if (msgType !== MessageType.CONSENT_DENY) {
      return { valid: false, reason: "message_type must be CONSENT_DENY (22)" };
    }
    if (!p.request_id) return { valid: false, reason: "missing request_id" };
    return { valid: true, reason: "ok" };
  }

  return { valid: false, reason: `unknown consent command: ${cmd}` };
}
