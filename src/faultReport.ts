/**
 * RCAN Structured Fault Reporting — §16
 *
 * FAULT_REPORT (26) carries structured information about robot faults.
 * Safety-affecting faults MUST update Protocol 66 manifest.
 */

import { RCANMessage, MessageType } from "./message.js";
import { SPEC_VERSION } from "./version.js";

export type FaultSeverity = "info" | "warning" | "error" | "critical";

/** Standard fault code taxonomy — prefixed by subsystem */
export enum FaultCode {
  // Sensor subsystem
  SENSOR_PROXIMITY_FAILURE = "SENSOR_PROXIMITY_FAILURE",
  SENSOR_CAMERA_FAILURE    = "SENSOR_CAMERA_FAILURE",
  SENSOR_IMU_FAILURE       = "SENSOR_IMU_FAILURE",
  // Motor subsystem
  MOTOR_OVERCURRENT        = "MOTOR_OVERCURRENT",
  MOTOR_OVERTEMP           = "MOTOR_OVERTEMP",
  MOTOR_STALL              = "MOTOR_STALL",
  // Battery subsystem
  BATTERY_CRITICAL         = "BATTERY_CRITICAL",
  BATTERY_LOW              = "BATTERY_LOW",
  // Network subsystem
  NETWORK_TIMEOUT          = "NETWORK_TIMEOUT",
  NETWORK_REGISTRY_UNREACHABLE = "NETWORK_REGISTRY_UNREACHABLE",
  // Safety subsystem
  SAFETY_ESTOP_STUCK       = "SAFETY_ESTOP_STUCK",
  SAFETY_WATCHDOG_TIMEOUT  = "SAFETY_WATCHDOG_TIMEOUT",
  // Generic
  UNKNOWN                  = "UNKNOWN",
}

export interface FaultReportParams {
  faultCode: FaultCode | string;
  severity: FaultSeverity;
  subsystem: string;
  affectsSafety: boolean;
  safeToContinue: boolean;
  description?: string;
  target?: string;
}

/**
 * Build a FAULT_REPORT message.
 *
 * Mirrors rcan-py: make_fault_report()
 */
export function makeFaultReport(params: FaultReportParams): RCANMessage {
  return new RCANMessage({
    rcan: SPEC_VERSION,
    cmd: "FAULT_REPORT",
    target: params.target ?? "rcan://local/fault",
    params: {
      message_type: MessageType.FAULT_REPORT,
      fault_code: params.faultCode,
      severity: params.severity,
      subsystem: params.subsystem,
      affects_safety: params.affectsSafety,
      safe_to_continue: params.safeToContinue,
      description: params.description ?? "",
      reported_at: new Date().toISOString(),
    },
  });
}

/** §16 — Audit export request interface */
export interface AuditExportRequest {
  from: Date;
  to: Date;
  format: "jsonl" | "csv";
  robotRrn?: string;
}
