/**
 * RCAN Training Data Consent — §17
 *
 * Any TRAINING_DATA collection involving biometric/audio/visual data MUST
 * first obtain a DATA_CONSENT token via CONSENT_REQUEST with
 * consent_type: "training_data".
 *
 * EU AI Act Annex III §5 compliance.
 */

import { RCANMessage, MessageType } from "./message.js";
import { makeConsentRequest, makeConsentGrant, makeConsentDeny } from "./consent.js";
import { SPEC_VERSION } from "./version.js";
import type { ConsentResponseParams } from "./consent.js";

/** §17 — Data categories that require training consent */
export enum DataCategory {
  VIDEO     = "video",
  AUDIO     = "audio",
  LOCATION  = "location",
  BIOMETRIC = "biometric",
  TELEMETRY = "telemetry",
}

export interface TrainingConsentRequestParams {
  requesterRuri: string;
  requesterOwner: string;
  targetRuri: string;
  dataCategories: DataCategory[];
  durationHours: number;
  justification: string;
  requestId?: string;
}

/**
 * Build a training-data consent request.
 * Sets consent_type: "training_data" automatically.
 *
 * Mirrors rcan-py: request_training_consent()
 */
export function makeTrainingConsentRequest(
  params: TrainingConsentRequestParams
): RCANMessage {
  return makeConsentRequest({
    requesterRuri: params.requesterRuri,
    requesterOwner: params.requesterOwner,
    targetRuri: params.targetRuri,
    requestedScopes: ["training_data"],
    durationHours: params.durationHours,
    justification: params.justification,
    requestId: params.requestId,
    consentType: "training_data",
    dataCategories: params.dataCategories,
  });
}

/**
 * Build a training-data consent grant.
 *
 * Mirrors rcan-py: build_consent_grant() for training scope.
 */
export function makeTrainingConsentGrant(
  params: ConsentResponseParams
): RCANMessage {
  return makeConsentGrant(params);
}

/**
 * Build a training-data consent denial.
 *
 * Mirrors rcan-py: build_consent_deny() for training scope.
 */
export function makeTrainingConsentDeny(
  params: ConsentResponseParams
): RCANMessage {
  return makeConsentDeny(params);
}

/**
 * Validate that a TRAINING_DATA message carries a consent_token.
 *
 * A TRAINING_DATA message without consent_token MUST be rejected.
 */
export function validateTrainingDataMessage(
  msg: RCANMessage
): { valid: boolean; reason: string } {
  if (msg.params.message_type !== MessageType.TRAINING_DATA) {
    return { valid: false, reason: "not a TRAINING_DATA message" };
  }
  const token = msg.params.consent_token;
  if (!token || typeof token !== "string" || token.trim() === "") {
    return {
      valid: false,
      reason: "TRAINING_DATA message missing consent_token (§17)",
    };
  }
  return { valid: true, reason: "ok" };
}
