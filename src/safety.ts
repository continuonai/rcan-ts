/**
 * RCAN Safety Message helpers (MessageType 6).
 *
 * Safety messages bypass all queues and confidence gates per RCAN §6.
 * Use these helpers to build and validate ESTOP/STOP/RESUME messages.
 */

export const SAFETY_MESSAGE_TYPE = 6;
export type SafetyEvent = 'ESTOP' | 'STOP' | 'RESUME';

export interface SafetyMessage {
  message_type: 6;
  ruri: string;
  safety_event: SafetyEvent;
  reason: string;
  timestamp_ms: number;
  message_id: string;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older Node versions: simple random hex
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/**
 * Create an ESTOP message — immediate actuator cut.
 * Use when human safety is at risk or collision is imminent.
 */
export function makeEstopMessage(ruri: string, reason: string): SafetyMessage {
  return {
    message_type: 6,
    ruri,
    safety_event: 'ESTOP',
    reason: reason.slice(0, 512),
    timestamp_ms: Date.now(),
    message_id: generateId(),
  };
}

/**
 * Create a STOP message — controlled deceleration to rest.
 * Use for non-emergency halts where deceleration is safe.
 */
export function makeStopMessage(ruri: string, reason: string): SafetyMessage {
  return {
    message_type: 6,
    ruri,
    safety_event: 'STOP',
    reason: reason.slice(0, 512),
    timestamp_ms: Date.now(),
    message_id: generateId(),
  };
}

/**
 * Create a RESUME message — clear a prior STOP.
 * Note: ESTOP requires explicit hardware-level clear; RESUME only clears STOP.
 */
export function makeResumeMessage(ruri: string, reason: string): SafetyMessage {
  return {
    message_type: 6,
    ruri,
    safety_event: 'RESUME',
    reason: reason.slice(0, 512),
    timestamp_ms: Date.now(),
    message_id: generateId(),
  };
}

/**
 * Check if a message dict is a RCAN safety message.
 */
export function isSafetyMessage(msg: unknown): msg is SafetyMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>).message_type === SAFETY_MESSAGE_TYPE
  );
}

/**
 * Validate a safety message. Returns array of error strings (empty = valid).
 */
export function validateSafetyMessage(msg: Partial<SafetyMessage>): string[] {
  const errors: string[] = [];
  if (msg.message_type !== 6) errors.push('message_type must be 6');
  if (!msg.ruri) errors.push('ruri is required');
  if (!['ESTOP', 'STOP', 'RESUME'].includes(msg.safety_event ?? '')) {
    errors.push('safety_event must be ESTOP, STOP, or RESUME');
  }
  if (!msg.reason || msg.reason.length === 0) errors.push('reason is required');
  if (!msg.message_id) errors.push('message_id is required');
  if (!msg.timestamp_ms || msg.timestamp_ms <= 0) errors.push('timestamp_ms must be positive');
  return errors;
}
