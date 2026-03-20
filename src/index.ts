/**
 * rcan-ts — Official TypeScript SDK for RCAN v1.6
 * Robot Communication and Accountability Network
 *
 * @see https://rcan.dev
 * @see https://github.com/continuonai/rcan-ts
 */

export { RobotURI, RobotURIError } from "./address.js";
export type { RobotURIOptions } from "./address.js";

export { RCANMessage, RCANMessageError, MessageType, makeCloudRelayMessage, addDelegationHop, validateDelegationChain } from "./message.js";
export type { RCANMessageData, SignatureBlock, SenderType, DelegationHop } from "./message.js";

export { ConfidenceGate, HiTLGate, GateError } from "./gates.js";
export type { ApprovalStatus, PendingApproval } from "./gates.js";

export { CommitmentRecord, AuditChain, AuditError } from "./audit.js";
export type {
  CommitmentRecordData,
  CommitmentRecordJSON,
  ChainVerifyResult,
} from "./audit.js";

export { validateURI, validateMessage, validateConfig } from "./validate.js";
export type { ValidationResult, RCANConfig } from "./validate.js";
export type { RCANMetadata, RCANAgentConfig, RCANMessageEnvelope } from "./types.js";

export {
  RCANError,
  RCANAddressError,
  RCANValidationError,
  RCANGateError,
  RCANSignatureError,
  RCANRegistryError,
  RCANNodeError,
  RCANNodeNotFoundError,
  RCANNodeSyncError,
  RCANNodeTrustError,
  // v1.5 errors
  RCANVersionIncompatibleError,
  RCANReplayAttackError,
  RCANDelegationChainError,
  RCANConfigAuthorizationError,
} from "./errors.js";

export { RegistryClient } from "./registry.js";
export type {
  RobotRegistration,
  Robot,
  RegistrationResult,
  ListResult,
} from "./registry.js";

export { NodeClient } from "./node.js";
export type { RCANRegistryNode, RCANResolveResult } from "./types.js";

export { fetchCanonicalSchema, validateConfigAgainstSchema, validateNodeAgainstSchema } from "./schema.js";

export {
  makeEstopMessage,
  makeStopMessage,
  makeResumeMessage,
  makeTransparencyMessage,
  isSafetyMessage,
  validateSafetyMessage,
  SAFETY_MESSAGE_TYPE,
} from "./safety.js";
export type { SafetyMessage, SafetyEvent, TransparencyMessage } from "./safety.js";

// ── v1.5: version ──────────────────────────────────────────────────────────────
export { SPEC_VERSION, SDK_VERSION, validateVersionCompat } from "./version.js";

// ── v1.5: replay attack prevention (GAP-03) ────────────────────────────────────
export { ReplayCache, validateReplay } from "./replay.js";
export type { ReplayCheckResult, ReplayableMessage } from "./replay.js";

// ── v1.5: clock synchronization (GAP-04) ───────────────────────────────────────
export { checkClockSync, assertClockSynced, ClockDriftError } from "./clock.js";
export type { ClockSyncStatus } from "./clock.js";

// ── v1.5: QoS (GAP-11) ────────────────────────────────────────────────────────
export { QoSLevel, QoSManager, QoSAckTimeoutError, makeEstopWithQoS } from "./qos.js";
export type { QoSSendOptions, QoSResult } from "./qos.js";

// ── v1.5: config update (GAP-07) ──────────────────────────────────────────────
export { makeConfigUpdate, validateConfigUpdate } from "./configUpdate.js";

// ── v1.5: key rotation (GAP-09) ───────────────────────────────────────────────
export { KeyStore, makeKeyRotationMessage } from "./keys.js";
export type { JWKEntry, JWKSDocument } from "./keys.js";

// ── v1.5: consent wire (GAP-05) ───────────────────────────────────────────────
export {
  makeConsentRequest,
  makeConsentGrant,
  makeConsentDeny,
  validateConsentMessage,
} from "./consent.js";
export type { ConsentType, ConsentRequestParams, ConsentResponseParams } from "./consent.js";

// ── v1.5: revocation (GAP-02) ─────────────────────────────────────────────────
export {
  RevocationCache,
  checkRevocation,
  makeRevocationBroadcast,
} from "./revocation.js";
export type { RevocationStatus, RevocationStatusValue } from "./revocation.js";

// ── v1.5: training data consent (GAP-10) ──────────────────────────────────────
export {
  DataCategory,
  makeTrainingConsentRequest,
  makeTrainingConsentGrant,
  makeTrainingConsentDeny,
  validateTrainingDataMessage,
} from "./trainingConsent.js";
export type { TrainingConsentRequestParams } from "./trainingConsent.js";

// ── v1.5: offline mode (GAP-06) ───────────────────────────────────────────────
export { OfflineModeManager } from "./offline.js";
export type { OfflineState, OfflineCommandResult, CachedKey } from "./offline.js";

// ── v1.5: fault reporting (GAP-20) ────────────────────────────────────────────
export { FaultCode, makeFaultReport } from "./faultReport.js";
export type { FaultSeverity, FaultReportParams, AuditExportRequest } from "./faultReport.js";

// ── v1.6: identity & LoA (GAP-14) ─────────────────────────────────────────────
export {
  LevelOfAssurance,
  DEFAULT_LOA_POLICY,
  PRODUCTION_LOA_POLICY,
  extractLoaFromJwt,
  validateLoaForScope,
} from "./identity.js";
export type { LoaPolicy } from "./identity.js";

// ── v1.6: federation (GAP-16) ─────────────────────────────────────────────────
export {
  RegistryTier,
  FederationSyncType,
  TrustAnchorCache,
  makeFederationSync,
  validateCrossRegistryCommand,
} from "./federation.js";
export type { RegistryIdentity, FederationSyncPayload } from "./federation.js";

// ── v1.6: transport encodings (GAP-17) ────────────────────────────────────────
export {
  TransportEncoding,
  TransportError,
  encodeCompact,
  decodeCompact,
  encodeMinimal,
  decodeMinimal,
  encodeBleFrames,
  decodeBleFrames,
  selectTransport,
} from "./transport.js";

// ── v1.6: multi-modal data (GAP-18) ───────────────────────────────────────────
export {
  MediaEncoding,
  addMediaInline,
  addMediaRef,
  validateMediaChunks,
  makeTrainingDataMessage,
  makeStreamChunk,
} from "./multimodal.js";
export type { MediaChunk, StreamChunk } from "./multimodal.js";

export const VERSION = "0.6.0";
/** @deprecated Use SPEC_VERSION from ./version instead */
export const RCAN_VERSION = "1.6";

export { makeContributeRequest, makeContributeResult, makeContributeCancel, validateContributeScope, isPreemptedBy, CONTRIBUTE_SCOPE_LEVEL } from "./contribute";
export type { ContributeRequest, ContributeResult, ContributeCancel, WorkUnitStatus, ComputeResource } from "./contribute";
