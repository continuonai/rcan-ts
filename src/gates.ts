/**
 * RCAN Safety Gates — confidence and human-in-the-loop gating (§16).
 */

import { randomUUID } from "crypto";

export class GateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateError";
  }
}

// ---------------------------------------------------------------------------
// ConfidenceGate
// ---------------------------------------------------------------------------

export class ConfidenceGate {
  readonly threshold: number;

  constructor(threshold = 0.8) {
    if (threshold < 0 || threshold > 1) {
      throw new GateError(`threshold must be in [0.0, 1.0] — got ${threshold}`);
    }
    this.threshold = threshold;
  }

  /** Returns true if the confidence score meets the threshold. */
  allows(confidence: number): boolean {
    return confidence >= this.threshold;
  }

  /** Returns the margin (positive = allowed, negative = blocked). */
  margin(confidence: number): number {
    return confidence - this.threshold;
  }

  /** Throw if confidence is below threshold. */
  assert(confidence: number, action?: string): void {
    if (!this.allows(confidence)) {
      const label = action ? ` for action '${action}'` : "";
      throw new GateError(
        `Confidence ${confidence}${label} is below threshold ${this.threshold}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// HiTLGate
// ---------------------------------------------------------------------------

export type ApprovalStatus = "approved" | "denied" | "pending";

export interface PendingApproval {
  token: string;
  action: string;
  context: Record<string, unknown>;
  createdAt: string;
  status: ApprovalStatus;
  reason?: string;
}

export class HiTLGate {
  private _pending: Map<string, PendingApproval> = new Map();

  /**
   * Request human approval for an action.
   * Returns an approval token to poll or pass to approve/deny.
   */
  request(action: string, context: Record<string, unknown> = {}): string {
    const token = randomUUID();
    this._pending.set(token, {
      token,
      action,
      context,
      createdAt: new Date().toISOString(),
      status: "pending",
    });
    return token;
  }

  /** Approve a pending request. */
  approve(token: string): void {
    const approval = this._pending.get(token);
    if (!approval) throw new GateError(`Unknown token: ${token}`);
    approval.status = "approved";
  }

  /** Deny a pending request with an optional reason. */
  deny(token: string, reason?: string): void {
    const approval = this._pending.get(token);
    if (!approval) throw new GateError(`Unknown token: ${token}`);
    approval.status = "denied";
    if (reason) approval.reason = reason;
  }

  /** Check the status of a pending approval. */
  check(token: string): ApprovalStatus {
    const approval = this._pending.get(token);
    if (!approval) throw new GateError(`Unknown token: ${token}`);
    return approval.status;
  }

  /** Get all pending approvals. */
  get pendingApprovals(): PendingApproval[] {
    return Array.from(this._pending.values()).filter((a) => a.status === "pending");
  }

  /** Get the full approval record. */
  getApproval(token: string): PendingApproval | undefined {
    return this._pending.get(token);
  }

  /** Clear resolved (approved/denied) approvals. */
  clearResolved(): void {
    for (const [token, approval] of this._pending.entries()) {
      if (approval.status !== "pending") {
        this._pending.delete(token);
      }
    }
  }
}
