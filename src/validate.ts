/**
 * RCAN Validation — validate messages, configs, and URIs.
 *
 * Each function returns a ValidationResult with ok, issues, warnings, info.
 */

import { RobotURI, RobotURIError } from "./address";
import { RCANMessage, RCANMessageError } from "./message";

export interface ValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
  info: string[];
}

function makeResult(): ValidationResult {
  return { ok: true, issues: [], warnings: [], info: [] };
}

function fail(result: ValidationResult, msg: string): void {
  result.ok = false;
  result.issues.push(msg);
}

function warn(result: ValidationResult, msg: string): void {
  result.warnings.push(msg);
}

function note(result: ValidationResult, msg: string): void {
  result.info.push(msg);
}

// ---------------------------------------------------------------------------
// URI validation
// ---------------------------------------------------------------------------

export function validateURI(uri: string): ValidationResult {
  const result = makeResult();
  try {
    const parsed = RobotURI.parse(uri);
    note(result, `✅ Valid RCAN URI`);
    note(result, `   Registry:     ${parsed.registry}`);
    note(result, `   Manufacturer: ${parsed.manufacturer}`);
    note(result, `   Model:        ${parsed.model}`);
    note(result, `   Version:      ${parsed.version}`);
    note(result, `   Device ID:    ${parsed.deviceId}`);
  } catch (e) {
    fail(result, `Invalid RCAN URI: ${e instanceof Error ? e.message : e}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Message validation
// ---------------------------------------------------------------------------

export function validateMessage(data: unknown): ValidationResult {
  const result = makeResult();

  let obj: Record<string, unknown>;
  if (typeof data === "string") {
    try {
      obj = JSON.parse(data) as Record<string, unknown>;
    } catch {
      fail(result, "Invalid JSON string");
      return result;
    }
  } else if (typeof data === "object" && data !== null) {
    obj = data as Record<string, unknown>;
  } else {
    fail(result, "Expected object or JSON string");
    return result;
  }

  // Required fields
  for (const field of ["rcan", "cmd", "target"]) {
    if (!(field in obj) || !obj[field]) {
      fail(result, `Missing required field: '${field}'`);
    }
  }

  if (!result.ok) return result;

  try {
    const msg = RCANMessage.fromJSON(obj);
    note(result, `✅ RCAN message valid (v${msg.rcan})`);
    note(result, `   cmd:    ${msg.cmd}`);
    note(result, `   target: ${msg.target}`);
    if (msg.confidence !== undefined) {
      note(result, `   confidence: ${msg.confidence}`);
    } else {
      warn(result, "No confidence score — add for RCAN §16 AI accountability");
    }
    if (msg.isSigned) {
      note(result, `   signature: alg=${msg.signature?.alg}, kid=${msg.signature?.kid}`);
    } else {
      warn(result, "Message is unsigned (recommended for production)");
    }
  } catch (e) {
    fail(result, `Message validation failed: ${e instanceof Error ? e.message : e}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Config validation (L1 / L2 / L3)
// ---------------------------------------------------------------------------

export interface RCANConfig {
  rcan_version?: string;
  metadata?: {
    manufacturer?: string;
    model?: string;
    version?: string;
    rrn?: string;
    rcan_uri?: string;
  };
  agent?: {
    provider?: string;
    model?: string;
    confidence_gates?: Array<{ threshold?: number }>;
    hitl_gates?: Array<Record<string, unknown>>;
    commitment_chain?: { enabled?: boolean };
    signing?: { enabled?: boolean };
  };
  rcan_protocol?: {
    jwt_auth?: { enabled?: boolean };
  };
  [key: string]: unknown;
}

export function validateConfig(config: RCANConfig): ValidationResult {
  const result = makeResult();
  const meta = config.metadata ?? {};
  const agent = config.agent ?? {};
  const rcanProto = config.rcan_protocol ?? {};

  // L1 — required fields
  if (!meta.manufacturer) fail(result, "L1: metadata.manufacturer is required (§2)");
  if (!meta.model) fail(result, "L1: metadata.model is required (§2)");
  if (!config.rcan_version) warn(result, "L1: rcan_version not declared (recommended)");

  // L2 — auth + confidence
  if (!rcanProto.jwt_auth?.enabled) {
    warn(result, "L2: jwt_auth not enabled (required for L2 conformance, §8)");
  }
  if (!agent.confidence_gates || agent.confidence_gates.length === 0) {
    warn(result, "L2: confidence_gates not configured (§16)");
  }

  // L3 — hitl + commitment chain
  if (!agent.hitl_gates || agent.hitl_gates.length === 0) {
    warn(result, "L3: hitl_gates not configured (§16)");
  }
  if (!agent.commitment_chain?.enabled) {
    warn(result, "L3: commitment_chain not enabled (§16)");
  }

  // Registration
  if (meta.rrn) {
    note(result, `✅ RRN registered: ${meta.rrn}`);
  } else {
    warn(result, "Robot not registered — visit rcan.dev/registry/register");
  }

  if (result.ok && result.issues.length === 0) {
    const l1ok = !result.warnings.some((w) => w.startsWith("L1"));
    const l2ok = l1ok && !result.warnings.some((w) => w.startsWith("L2"));
    const l3ok = l2ok && !result.warnings.some((w) => w.startsWith("L3"));
    const level = l3ok ? "L3" : l2ok ? "L2" : l1ok ? "L1" : "FAIL";
    note(result, `✅ Config valid — conformance level: ${level}`);
  }

  return result;
}
