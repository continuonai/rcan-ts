/**
 * rcan/m2m — RCAN v2.1 Machine-to-Machine Authorization.
 *
 * M2M_PEER (JWT level 4): robot-to-robot, issued by ADMIN/CREATOR.
 * M2M_TRUSTED (JWT level 6): fleet orchestration, RRF-issued only.
 *
 * Spec: §2.8 M2M_PEER · §2.9 M2M_TRUSTED
 */

import { Role } from "./identity.js";

// ---------------------------------------------------------------------------
// RRF constants
// ---------------------------------------------------------------------------

export const RRF_ROOT_PUBKEY_URL = "https://api.rrf.rcan.dev/.well-known/rrf-root-pubkey.pem";
export const RRF_REVOCATION_URL  = "https://api.rrf.rcan.dev/v2/revocations";
export const M2M_TRUSTED_ISSUER  = "rrf.rcan.dev";
/** Revocation cache TTL in milliseconds (≤ 60 s per spec). */
export const RRF_REVOCATION_CACHE_TTL_MS = 55_000;
/** Pubkey cache TTL in milliseconds. */
export const RRF_PUBKEY_CACHE_TTL_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Claims types
// ---------------------------------------------------------------------------

/** Parsed claims from an M2M_PEER JWT. */
export interface M2MPeerClaims {
  /** Subject RRN of the peer robot. */
  sub: string;
  /** The robot this peer is authorized to command. */
  peerRrn: string;
  /** Authorized scopes. */
  scopes: string[];
  /** Unix expiry timestamp. */
  exp: number;
  /** Issuing principal (ADMIN or CREATOR RRN). */
  iss: string;
}

/** Parsed claims from an M2M_TRUSTED JWT (RRF-issued). */
export interface M2MTrustedClaims {
  /** Orchestrator identifier (not a robot RRN). */
  sub: string;
  /** Explicit allowlist of robots this token may command. */
  fleetRrns: string[];
  /** Must include "fleet.trusted". */
  scopes: string[];
  /** Unix expiry timestamp (max 24 h from issuance). */
  exp: number;
  /** Must be "rrf.rcan.dev". */
  iss: string;
  /** RRF Ed25519 signature over claims (base64url). */
  rrfSig: string;
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

/** Thrown when M2M token verification fails. */
export class M2MAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "M2MAuthError";
  }
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) throw new M2MAuthError("Invalid JWT structure");
  const b64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  try {
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch (e) {
    throw new M2MAuthError(`JWT payload decode failed: ${String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// M2M_PEER parsing
// ---------------------------------------------------------------------------

/**
 * Parse an M2M_PEER JWT without signature verification.
 * Validates expiry and required claims.
 */
export function parseM2mPeerToken(token: string): M2MPeerClaims {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload['exp'] ?? 0);
  if (exp > 0 && Date.now() / 1000 > exp) {
    throw new M2MAuthError(`M2M_PEER token expired (sub=${String(payload['sub'])})`);
  }
  const peerRrn = String(payload['peer_rrn'] ?? '');
  if (!peerRrn) throw new M2MAuthError("M2M_PEER token missing peer_rrn claim");

  return {
    sub:     String(payload['sub'] ?? ''),
    peerRrn,
    scopes:  Array.isArray(payload['rcan_scopes']) ? payload['rcan_scopes'] as string[]
             : Array.isArray(payload['scopes']) ? payload['scopes'] as string[] : [],
    exp,
    iss:     String(payload['iss'] ?? ''),
  };
}

// ---------------------------------------------------------------------------
// M2M_TRUSTED — token parsing (sync, no network)
// ---------------------------------------------------------------------------

/**
 * Parse an M2M_TRUSTED JWT claims WITHOUT signature verification.
 *
 * Checks issuer, scope, and expiry. Does not contact RRF.
 * For full verification use `verifyM2mTrustedTokenClaims`.
 */
export function parseM2mTrustedToken(token: string): M2MTrustedClaims {
  const payload = decodeJwtPayload(token);

  const iss = String(payload['iss'] ?? '');
  if (iss !== M2M_TRUSTED_ISSUER) {
    throw new M2MAuthError(
      `M2M_TRUSTED issuer must be '${M2M_TRUSTED_ISSUER}', got '${iss}'`
    );
  }

  const scopes: string[] = Array.isArray(payload['rcan_scopes'])
    ? payload['rcan_scopes'] as string[]
    : Array.isArray(payload['scopes']) ? payload['scopes'] as string[] : [];

  if (!scopes.includes('fleet.trusted')) {
    throw new M2MAuthError("M2M_TRUSTED token missing required 'fleet.trusted' scope");
  }

  const exp = Number(payload['exp'] ?? 0);
  if (exp > 0 && Date.now() / 1000 > exp) {
    throw new M2MAuthError(`M2M_TRUSTED token expired (sub=${String(payload['sub'])})`);
  }

  const rrfSig = String(payload['rrf_sig'] ?? '');
  if (!rrfSig) throw new M2MAuthError("M2M_TRUSTED token missing rrf_sig claim");

  const fleetRrns: string[] = Array.isArray(payload['fleet_rrns'])
    ? payload['fleet_rrns'] as string[] : [];

  return {
    sub: String(payload['sub'] ?? ''),
    fleetRrns,
    scopes,
    exp,
    iss,
    rrfSig,
  };
}

/**
 * Verify M2M_TRUSTED token claims and check that it authorizes `targetRrn`.
 *
 * This method validates claims structure only (no RRF network call).
 * In production, also check the RRF revocation list with `RRFRevocationCache`.
 */
export function verifyM2mTrustedTokenClaims(
  token: string,
  targetRrn: string
): M2MTrustedClaims {
  const claims = parseM2mTrustedToken(token);

  if (!claims.fleetRrns.includes(targetRrn)) {
    throw new M2MAuthError(
      `M2M_TRUSTED token does not authorize commanding '${targetRrn}'. ` +
      `Authorized fleet: [${claims.fleetRrns.join(', ')}]`
    );
  }

  return claims;
}

// ---------------------------------------------------------------------------
// RRF Revocation Cache (browser/Node-compatible, no native deps)
// ---------------------------------------------------------------------------

interface RevocationCache {
  revokedOrchestrators: Set<string>;
  revokedJtis: Set<string>;
  fetchedAt: number;
}

let _revocationCache: RevocationCache | null = null;

/**
 * Fetch the RRF revocation list and cache it.
 *
 * Uses `fetch()` (available in Node 18+ and all modern browsers).
 * TTL: 55 s (spec max: 60 s).
 */
export async function fetchRRFRevocations(
  url: string = RRF_REVOCATION_URL
): Promise<RevocationCache> {
  const now = Date.now();
  if (_revocationCache && now - _revocationCache.fetchedAt < RRF_REVOCATION_CACHE_TTL_MS) {
    return _revocationCache;
  }

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout?.(5000) });
    const data = await resp.json() as {
      revoked_orchestrators?: string[];
      revoked_jtis?: string[];
    };
    _revocationCache = {
      revokedOrchestrators: new Set(data.revoked_orchestrators ?? []),
      revokedJtis:          new Set(data.revoked_jtis ?? []),
      fetchedAt:            now,
    };
  } catch {
    // Return stale cache if available, else empty
    if (_revocationCache) return _revocationCache;
    _revocationCache = { revokedOrchestrators: new Set(), revokedJtis: new Set(), fetchedAt: now };
  }

  return _revocationCache;
}

/**
 * Check whether an M2M_TRUSTED orchestrator sub is revoked.
 * Fetches the revocation list if the cache is stale.
 */
export async function isM2mTrustedRevoked(
  claims: M2MTrustedClaims,
  jti?: string
): Promise<boolean> {
  const cache = await fetchRRFRevocations();
  if (cache.revokedOrchestrators.has(claims.sub)) return true;
  if (jti && cache.revokedJtis.has(jti)) return true;
  return false;
}

/**
 * Full async M2M_TRUSTED verification: claims check + revocation list.
 *
 * Note: Signature verification requires the RRF public key and is typically
 * done server-side using the rcan-py SDK or castor.auth middleware.
 */
export async function verifyM2mTrustedToken(
  token: string,
  targetRrn: string,
  options?: { skipRevocationCheck?: boolean }
): Promise<M2MTrustedClaims> {
  const claims = verifyM2mTrustedTokenClaims(token, targetRrn);

  if (!options?.skipRevocationCheck) {
    const revoked = await isM2mTrustedRevoked(claims);
    if (revoked) {
      throw new M2MAuthError(
        `M2M_TRUSTED orchestrator '${claims.sub}' is on the RRF revocation list`
      );
    }
  }

  return claims;
}
