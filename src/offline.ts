/**
 * RCAN Offline Operation Mode — §14
 *
 * Robots MUST cache registry public keys locally (max TTL 24h).
 * Owner-role tokens accepted from local network when registry unreachable.
 * Cross-owner commands blocked after offline_cross_owner_grace_s (default 3600s).
 * ESTOP is ALWAYS accepted in offline mode per Protocol 66 safety invariants.
 */

import type { SafetyMessage } from "./safety.js";

const SAFETY_MESSAGE_TYPE = 6;
const DEFAULT_CROSS_OWNER_GRACE_S = 3600;
const DEFAULT_KEY_TTL_S = 86400;

export interface OfflineState {
  isOffline: boolean;
  offlineSinceMs?: number;
  localNetwork: boolean;
}

export interface OfflineCommandResult {
  allowed: boolean;
  reason: string;
}

export interface CachedKey {
  kid: string;
  publicKey: string;
  cachedAtMs: number;
  ttlSeconds: number;
}

/**
 * OfflineModeManager — controls what commands are accepted when offline.
 *
 * Protocol 66 invariants respected:
 *  - ESTOP is ALWAYS allowed, regardless of offline mode
 *  - Owner-level commands from local network: allowed within grace period
 *  - Cross-owner commands: blocked after crossOwnerGraceS
 */
export class OfflineModeManager {
  private readonly crossOwnerGraceS: number;
  private readonly keyTtlS: number;
  private _cachedKeys: CachedKey[] = [];

  constructor(
    crossOwnerGraceS: number = DEFAULT_CROSS_OWNER_GRACE_S,
    keyTtlS: number = DEFAULT_KEY_TTL_S
  ) {
    this.crossOwnerGraceS = crossOwnerGraceS;
    this.keyTtlS = keyTtlS;
  }

  /**
   * Determine whether a command can be accepted in the current offline state.
   *
   * @param msg         - The incoming message (SafetyMessage or plain object with message_type)
   * @param isOffline   - Whether we are currently in offline mode
   * @param localNetwork - Whether the sender is on the local network
   * @param isOwner      - Whether the sender has owner-level role (validated locally)
   * @param isCrossOwner - Whether this is a cross-owner (non-same-owner) command
   * @param nowMs        - Optional current time in ms (for testing)
   */
  canAcceptCommand(
    msg: { message_type?: number; safety_event?: string } | null,
    isOffline: boolean,
    localNetwork: boolean,
    isOwner = true,
    isCrossOwner = false,
    offlineSinceMs?: number,
    nowMs?: number
  ): OfflineCommandResult {
    // Protocol 66: ESTOP is ALWAYS allowed
    if (
      msg &&
      msg.message_type === SAFETY_MESSAGE_TYPE &&
      msg.safety_event === "ESTOP"
    ) {
      return { allowed: true, reason: "ESTOP always accepted (Protocol 66)" };
    }

    if (!isOffline) {
      return { allowed: true, reason: "online mode" };
    }

    // Offline mode
    if (!localNetwork) {
      return {
        allowed: false,
        reason: "offline mode: cross-network commands blocked",
      };
    }

    if (!isOwner) {
      return {
        allowed: false,
        reason: "offline mode: only owner-role commands accepted from local network",
      };
    }

    // Cross-owner grace period check
    if (isCrossOwner && offlineSinceMs !== undefined) {
      const now = nowMs ?? Date.now();
      const offlineSeconds = (now - offlineSinceMs) / 1000;
      if (offlineSeconds > this.crossOwnerGraceS) {
        return {
          allowed: false,
          reason: `offline mode: cross-owner grace period expired (${Math.round(offlineSeconds)}s > ${this.crossOwnerGraceS}s)`,
        };
      }
    }

    return {
      allowed: true,
      reason: "offline mode: owner command on local network accepted",
    };
  }

  /** Cache a public key for offline use */
  cacheKey(entry: Omit<CachedKey, "cachedAtMs" | "ttlSeconds">, nowMs?: number): void {
    const now = nowMs ?? Date.now();
    // Remove existing entry for same kid
    this._cachedKeys = this._cachedKeys.filter((k) => k.kid !== entry.kid);
    this._cachedKeys.push({
      ...entry,
      cachedAtMs: now,
      ttlSeconds: this.keyTtlS,
    });
  }

  /** Get a cached public key if still valid */
  getCachedKey(kid: string, nowMs?: number): CachedKey | undefined {
    const now = nowMs ?? Date.now();
    const entry = this._cachedKeys.find((k) => k.kid === kid);
    if (!entry) return undefined;
    const age = (now - entry.cachedAtMs) / 1000;
    if (age > entry.ttlSeconds) {
      this._cachedKeys = this._cachedKeys.filter((k) => k.kid !== kid);
      return undefined;
    }
    return entry;
  }

  /** Protocol 66 manifest fields for offline mode */
  getManifestFields(
    offlineSinceMs?: number,
    nowMs?: number
  ): { offline_mode: boolean; offline_since_s: number } {
    if (offlineSinceMs === undefined) {
      return { offline_mode: false, offline_since_s: 0 };
    }
    const now = nowMs ?? Date.now();
    return {
      offline_mode: true,
      offline_since_s: Math.round((now - offlineSinceMs) / 1000),
    };
  }
}
