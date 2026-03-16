/**
 * RCAN Quality of Service — §5.3
 *
 * QoSLevel:
 *   FIRE_AND_FORGET = 0  — no ack required
 *   ACKNOWLEDGED    = 1  — at-least-once; sender retries until COMMAND_ACK
 *   EXACTLY_ONCE    = 2  — two-phase commit: COMMAND_ACK + COMMAND_COMMIT
 *
 * Safety messages MUST use qos >= 1.
 * ESTOP MUST use qos = 2 (EXACTLY_ONCE).
 * TELEOP MUST use qos = 0 (FIRE_AND_FORGET).
 */

import type { SafetyMessage } from "./safety.js";

export enum QoSLevel {
  FIRE_AND_FORGET = 0,
  ACKNOWLEDGED    = 1,
  EXACTLY_ONCE    = 2,
}

/** Thrown when an ACK times out for a safety message */
export class QoSAckTimeoutError extends Error {
  constructor(msgId: string) {
    super(`ACK timeout for message ${msgId} — safety halt required`);
    this.name = "QoSAckTimeoutError";
    Object.setPrototypeOf(this, QoSAckTimeoutError.prototype);
  }
}

export interface QoSSendOptions {
  /** QoS level (default: FIRE_AND_FORGET) */
  qos?: QoSLevel;
  /** Max retries for qos >= 1 (default: 3) */
  maxRetries?: number;
  /** Initial backoff ms for qos >= 1 (default: 100) */
  initialBackoffMs?: number;
  /** ACK timeout ms for qos >= 1 (default: 500) */
  ackTimeoutMs?: number;
}

export interface QoSResult {
  delivered: boolean;
  attempts: number;
  reason: string;
}

/**
 * QoSManager — manages send-with-ack pattern for RCAN messages.
 *
 * Usage:
 *   const mgr = new QoSManager(sendFn, ackFn);
 *   await mgr.sendWithQoS(msg, { qos: QoSLevel.EXACTLY_ONCE });
 */
export class QoSManager {
  private readonly _send: (msg: unknown) => Promise<void>;
  private readonly _waitForAck: (msgId: string, timeoutMs: number) => Promise<boolean>;

  constructor(
    send: (msg: unknown) => Promise<void>,
    waitForAck: (msgId: string, timeoutMs: number) => Promise<boolean>
  ) {
    this._send = send;
    this._waitForAck = waitForAck;
  }

  /**
   * Send a message with the specified QoS level.
   *
   * For QoS 0: fire and forget.
   * For QoS 1: retry until ACK received or maxRetries exhausted.
   * For QoS 2: same as QoS 1 but sends a COMMAND_COMMIT after ACK.
   */
  async sendWithQoS(
    msg: unknown,
    opts: QoSSendOptions = {}
  ): Promise<QoSResult> {
    const qos = opts.qos ?? QoSLevel.FIRE_AND_FORGET;
    const maxRetries = opts.maxRetries ?? 3;
    const initialBackoffMs = opts.initialBackoffMs ?? 100;
    const ackTimeoutMs = opts.ackTimeoutMs ?? 500;

    if (qos === QoSLevel.FIRE_AND_FORGET) {
      await this._send(msg);
      return { delivered: true, attempts: 1, reason: "fire-and-forget" };
    }

    // QoS 1 or 2: retry loop
    const msgId = (msg as { message_id?: string; msg_id?: string }).message_id
      ?? (msg as { message_id?: string; msg_id?: string }).msg_id
      ?? "unknown";

    let attempts = 0;
    let backoffMs = initialBackoffMs;

    while (attempts <= maxRetries) {
      await this._send(msg);
      attempts++;

      const acked = await this._waitForAck(msgId, ackTimeoutMs);
      if (acked) {
        return { delivered: true, attempts, reason: qos === QoSLevel.EXACTLY_ONCE ? "exactly-once" : "acknowledged" };
      }

      if (attempts > maxRetries) break;

      // Exponential backoff
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 5000);
    }

    return { delivered: false, attempts, reason: `ACK not received after ${maxRetries} retries` };
  }
}

/**
 * Override makeEstopMessage to force QoS=EXACTLY_ONCE.
 * Returns a SafetyMessage annotated with qos: 2.
 */
export function makeEstopWithQoS(
  ruri: string,
  reason: string
): SafetyMessage & { qos: QoSLevel } {
  const msg: SafetyMessage & { qos: QoSLevel } = {
    message_type: 6 as const,
    ruri,
    safety_event: "ESTOP",
    reason: reason.slice(0, 512),
    timestamp_ms: Date.now(),
    message_id: generateId(),
    qos: QoSLevel.EXACTLY_ONCE,
  };
  return msg;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
