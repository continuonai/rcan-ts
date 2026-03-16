/**
 * RCAN Robot Identity Revocation — §13
 *
 * Registry exposes GET /api/v1/robots/{rrn}/revocation-status.
 * Peers cache results with 1h TTL.
 * ROBOT_REVOCATION (19) broadcast invalidates cached trust material.
 */

import { RCANMessage, MessageType } from "./message.js";
import { SPEC_VERSION } from "./version.js";

export type RevocationStatusValue = "active" | "revoked" | "suspended";

export interface RevocationStatus {
  rrn: string;
  status: RevocationStatusValue;
  revokedAt?: string;
  reason?: string;
  authority?: string;
  /** When this cached entry expires */
  cachedUntil?: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * RevocationCache — TTL-based cache for revocation status records.
 */
export class RevocationCache {
  private readonly _cache: Map<string, RevocationStatus> = new Map();

  /** Get a cached status if still fresh */
  get(rrn: string, nowMs?: number): RevocationStatus | undefined {
    const entry = this._cache.get(rrn);
    if (!entry) return undefined;
    const now = nowMs ?? Date.now();
    if (entry.cachedUntil !== undefined && entry.cachedUntil < now) {
      this._cache.delete(rrn);
      return undefined;
    }
    return entry;
  }

  /** Store a status record with a 1h TTL */
  set(status: RevocationStatus, nowMs?: number): void {
    const now = nowMs ?? Date.now();
    this._cache.set(status.rrn, {
      ...status,
      cachedUntil: now + CACHE_TTL_MS,
    });
  }

  /** Invalidate a cached entry immediately */
  invalidate(rrn: string): void {
    this._cache.delete(rrn);
  }

  /** Number of cached entries */
  get size(): number {
    return this._cache.size;
  }
}

/**
 * Check the revocation status of a robot via the registry REST API.
 * Caches results for 1 hour.
 *
 * @param rrn         - Robot Registry Number
 * @param registryUrl - Base URL of the registry (e.g. "https://registry.rcan.dev")
 * @param cache       - Optional RevocationCache to use (creates ephemeral one if not provided)
 */
export async function checkRevocation(
  rrn: string,
  registryUrl: string,
  cache?: RevocationCache
): Promise<RevocationStatus> {
  const c = cache ?? new RevocationCache();

  // Check cache first
  const cached = c.get(rrn);
  if (cached) return cached;

  const url = `${registryUrl.replace(/\/$/, "")}/api/v1/robots/${encodeURIComponent(rrn)}/revocation-status`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      // Treat non-200 as unable to determine — return active (fail-open, log separately)
      const status: RevocationStatus = { rrn, status: "active", reason: `registry returned ${resp.status}` };
      c.set(status);
      return status;
    }
    const data = (await resp.json()) as Partial<RevocationStatus>;
    const status: RevocationStatus = {
      rrn,
      status: (data.status as RevocationStatusValue) ?? "active",
      revokedAt: data.revokedAt,
      reason: data.reason,
      authority: data.authority,
    };
    c.set(status);
    return status;
  } catch {
    // Network unavailable — assume active (offline mode)
    const status: RevocationStatus = { rrn, status: "active", reason: "network unavailable" };
    return status;
  }
}

/**
 * Build a ROBOT_REVOCATION broadcast message.
 *
 * @param rrn    - The RRN being revoked
 * @param reason - Human-readable revocation reason
 */
export function makeRevocationBroadcast(
  rrn: string,
  reason: string
): RCANMessage {
  return new RCANMessage({
    rcan: SPEC_VERSION,
    cmd: "ROBOT_REVOCATION",
    target: "rcan://broadcast/revocation",
    params: {
      message_type: MessageType.ROBOT_REVOCATION,
      rrn,
      reason,
      revoked_at: new Date().toISOString(),
    },
  });
}
