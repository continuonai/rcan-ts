/**
 * rcan-ts — Official TypeScript SDK for RCAN v1.2
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

export {
  RCANError,
  RCANAddressError,
  RCANValidationError,
  RCANGateError,
  RCANSignatureError,
  RCANRegistryError,
} from "./errors.js";

export const VERSION = "0.1.0";
export const RCAN_VERSION = "1.2";
