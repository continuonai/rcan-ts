/**
 * rcan-ts — Official TypeScript SDK for RCAN v1.4
 * Robot Communication and Accountability Network
 *
 * @see https://rcan.dev
 * @see https://github.com/continuonai/rcan-ts
 */

export { RobotURI, RobotURIError } from "./address.js";
export type { RobotURIOptions } from "./address.js";

export { RCANMessage, RCANMessageError } from "./message.js";
export type { RCANMessageData, SignatureBlock } from "./message.js";

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
  isSafetyMessage,
  validateSafetyMessage,
  SAFETY_MESSAGE_TYPE,
} from "./safety.js";
export type { SafetyMessage, SafetyEvent } from "./safety.js";

export const VERSION = "0.4.1";
export const SPEC_VERSION = "1.4";
/** @deprecated Use SPEC_VERSION instead */
export const RCAN_VERSION = "1.4";