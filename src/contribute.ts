/**
 * rcan/contribute — Idle Compute Contribution messages and scope.
 *
 * Implements the contribute scope and message types for RCAN v1.7+.
 * Robots can donate idle NPU/GPU/CPU compute to distributed science projects.
 *
 * Spec: §3 MessageTypes 33–35, Identity scope level 2.5
 */

import { MessageType } from "./message.js";

// ── Scope ────────────────────────────────────────────────────────────────

/** Contribute scope level — between chat (2) and control (3). */
export const CONTRIBUTE_SCOPE_LEVEL = 2.5;

// ── Enums ────────────────────────────────────────────────────────────────

export type WorkUnitStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "preempted";

export type ComputeResource = "npu" | "gpu" | "cpu" | "sensor";

// ── Message Types ────────────────────────────────────────────────────────

export interface ContributeRequest {
  type: typeof MessageType.CONTRIBUTE_REQUEST;
  request_id: string;
  project_id: string;
  project_name: string;
  work_unit_id: string;
  resource_type: ComputeResource;
  estimated_duration_s: number;
  priority: number;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface ContributeResult {
  type: typeof MessageType.CONTRIBUTE_RESULT;
  request_id: string;
  work_unit_id: string;
  status: WorkUnitStatus;
  resource_type: ComputeResource;
  duration_s: number;
  compute_units: number;
  result_payload: Record<string, unknown>;
  error_message?: string;
  timestamp: number;
}

export interface ContributeCancel {
  type: typeof MessageType.CONTRIBUTE_CANCEL;
  request_id: string;
  work_unit_id: string;
  reason: string;
  timestamp: number;
}

// ── Factory Functions ────────────────────────────────────────────────────

let _idCounter = 0;

function _generateId(): string {
  return `cr-${Date.now()}-${++_idCounter}`;
}

export function makeContributeRequest(
  params: Partial<Omit<ContributeRequest, "type">> = {},
): ContributeRequest {
  return {
    type: MessageType.CONTRIBUTE_REQUEST,
    request_id: params.request_id ?? _generateId(),
    project_id: params.project_id ?? "",
    project_name: params.project_name ?? "",
    work_unit_id: params.work_unit_id ?? "",
    resource_type: params.resource_type ?? "cpu",
    estimated_duration_s: params.estimated_duration_s ?? 0,
    priority: params.priority ?? 0,
    payload: params.payload ?? {},
    timestamp: params.timestamp ?? Date.now() / 1000,
  };
}

export function makeContributeResult(
  params: Partial<Omit<ContributeResult, "type">> = {},
): ContributeResult {
  const result: ContributeResult = {
    type: MessageType.CONTRIBUTE_RESULT,
    request_id: params.request_id ?? "",
    work_unit_id: params.work_unit_id ?? "",
    status: params.status ?? "completed",
    resource_type: params.resource_type ?? "cpu",
    duration_s: params.duration_s ?? 0,
    compute_units: params.compute_units ?? 0,
    result_payload: params.result_payload ?? {},
    timestamp: params.timestamp ?? Date.now() / 1000,
  };
  if (params.error_message !== undefined) {
    result.error_message = params.error_message;
  }
  return result;
}

export function makeContributeCancel(
  params: Partial<Omit<ContributeCancel, "type">> = {},
): ContributeCancel {
  return {
    type: MessageType.CONTRIBUTE_CANCEL,
    request_id: params.request_id ?? "",
    work_unit_id: params.work_unit_id ?? "",
    reason: params.reason ?? "",
    timestamp: params.timestamp ?? Date.now() / 1000,
  };
}

// ── Scope Validation ────────────────────────────────────────────────────

/**
 * Check if the given scope level permits contribute operations.
 *
 * Contribute requires scope >= 2.5 (between chat and control).
 */
export function validateContributeScope(
  scopeLevel: number,
  action: "request" | "result" | "cancel" = "request",
): boolean {
  if (action === "request" || action === "result") {
    return scopeLevel >= CONTRIBUTE_SCOPE_LEVEL;
  }
  if (action === "cancel") {
    // Cancel is permitted at chat level and above
    return scopeLevel >= 2.0;
  }
  return false;
}

/**
 * Check if the given scope level preempts contribution.
 *
 * Any scope >= control (3.0) preempts contribute immediately.
 * This is the P66 safety invariant — non-negotiable.
 */
export function isPreemptedBy(scopeLevel: number): boolean {
  return scopeLevel >= 3.0;
}
