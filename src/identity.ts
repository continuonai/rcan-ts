/**
 * rcan/identity — RCAN v2.1 Role-Based Access Control and Identity.
 *
 * Defines the seven-level role hierarchy (§2), JWT claim parsing, scope
 * validation, and identity record types.
 *
 * Roles (v2.1):
 *   GUEST        (JWT 1)   — read-only, anonymous
 *   OPERATOR     (JWT 2)   — operational control
 *   CONTRIBUTOR  (JWT 2.5) — idle compute donation scope
 *   ADMIN        (JWT 3)   — configuration, user management
 *   M2M_PEER     (JWT 4)   — robot-to-robot; issued by ADMIN
 *   CREATOR      (JWT 5)   — full hardware/software control
 *   M2M_TRUSTED  (JWT 6)   — fleet orchestration; RRF-issued only
 *
 * Spec: §2 — Role-Based Access Control
 */

// ---------------------------------------------------------------------------
// Role enum  (v2.1)
// ---------------------------------------------------------------------------

/** RCAN v2.1 role hierarchy. Use ROLE_JWT_LEVEL to map to JWT level values. */
export enum Role {
  GUEST       = 1,
  OPERATOR    = 2,
  CONTRIBUTOR = 3,   // JWT level 2.5
  ADMIN       = 4,   // JWT level 3
  M2M_PEER    = 5,   // JWT level 4
  CREATOR     = 6,   // JWT level 5
  M2M_TRUSTED = 7,   // JWT level 6 — RRF-issued only
}

/** @deprecated Use Role instead. Kept for v1.x backward compatibility. */
export const LevelOfAssurance = Role;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type LevelOfAssurance = Role;

/** Maps Role enum value to JWT rcan_role level (fractional for CONTRIBUTOR). */
export const ROLE_JWT_LEVEL: Record<Role, number> = {
  [Role.GUEST]:       1.0,
  [Role.OPERATOR]:    2.0,
  [Role.CONTRIBUTOR]: 2.5,
  [Role.ADMIN]:       3.0,
  [Role.M2M_PEER]:    4.0,
  [Role.CREATOR]:     5.0,
  [Role.M2M_TRUSTED]: 6.0,
};

const JWT_LEVEL_TO_ROLE: Map<number, Role> = new Map(
  (Object.entries(ROLE_JWT_LEVEL) as [string, number][]).map(
    ([role, level]) => [level, Number(role) as Role]
  )
);

/** Return the Role for a JWT rcan_role numeric level, or undefined. */
export function roleFromJwtLevel(level: number): Role | undefined {
  return JWT_LEVEL_TO_ROLE.get(level);
}

// ---------------------------------------------------------------------------
// Scope → minimum role mapping
// ---------------------------------------------------------------------------

export const SCOPE_MIN_ROLE: Record<string, Role> = {
  "status":        Role.GUEST,
  "discover":      Role.GUEST,
  "chat":          Role.GUEST,
  "observer":      Role.GUEST,
  "contribute":    Role.CONTRIBUTOR,
  "control":       Role.OPERATOR,
  "teleop":        Role.OPERATOR,
  "training":      Role.ADMIN,
  "training_data": Role.ADMIN,
  "config":        Role.ADMIN,
  "authority":     Role.ADMIN,
  "admin":         Role.CREATOR,
  "safety":        Role.CREATOR,
  "estop":         Role.CREATOR,
  "fleet.trusted": Role.M2M_TRUSTED,
};

// ---------------------------------------------------------------------------
// Identity record
// ---------------------------------------------------------------------------

export interface IdentityRecord {
  /** Subject identifier (UUID, RRN, or orchestrator id). */
  sub: string;
  /** RCAN v2.1 Role. */
  role: Role;
  /** JWT-level value for this role. */
  jwtLevel: number;
  /** Registry that issued this identity. */
  registryUrl?: string;
  /** Granted scopes. */
  scopes: string[];
  /** UTC ISO-8601 timestamp of most recent verification. */
  verifiedAt?: string;
  /** For M2M_PEER tokens — the authorized peer's RRN. */
  peerRrn?: string;
  /** For M2M_TRUSTED tokens — explicit fleet allowlist. */
  fleetRrns?: string[];
}

export function isM2mIdentity(identity: IdentityRecord): boolean {
  return identity.role === Role.M2M_PEER || identity.role === Role.M2M_TRUSTED;
}

// ---------------------------------------------------------------------------
// LoA Policy  (v2.1)
// ---------------------------------------------------------------------------

export interface LoaPolicy {
  minRoleForDiscover: Role;
  minRoleForStatus:   Role;
  minRoleForChat:     Role;
  minRoleForControl:  Role;
  minRoleForSafety:   Role;
}

/** Backward-compatible default policy — every scope accepts GUEST callers. */
export const DEFAULT_LOA_POLICY: LoaPolicy = {
  minRoleForDiscover: Role.GUEST,
  minRoleForStatus:   Role.GUEST,
  minRoleForChat:     Role.GUEST,
  minRoleForControl:  Role.GUEST,
  minRoleForSafety:   Role.GUEST,
};

/** Production-hardened policy — control needs OPERATOR, safety needs CREATOR. */
export const PRODUCTION_LOA_POLICY: LoaPolicy = {
  minRoleForDiscover: Role.GUEST,
  minRoleForStatus:   Role.GUEST,
  minRoleForChat:     Role.GUEST,
  minRoleForControl:  Role.OPERATOR,
  minRoleForSafety:   Role.CREATOR,
};

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Parse an RCAN v2.1 JWT and return the Role.
 *
 * Reads `rcan_role` (v2.1) with fallback to `loa` (v1.x).
 * Defaults to GUEST on parse failure.
 */
export function extractRoleFromJwt(token: string): Role {
  const payload = decodeJwtPayload(token);
  if (!payload) return Role.GUEST;

  // v2.1: rcan_role (float level)
  const rcanRole = payload['rcan_role'];
  if (rcanRole !== undefined && rcanRole !== null) {
    const role = roleFromJwtLevel(Number(rcanRole));
    if (role !== undefined) return role;
  }

  // v1.x fallback: loa (integer)
  const loa = payload['loa'];
  if (loa !== undefined && loa !== null) {
    const role = roleFromJwtLevel(Number(loa));
    if (role !== undefined) return role;
  }

  return Role.GUEST;
}

/** @deprecated Use extractRoleFromJwt. Kept for v1.x backward compatibility. */
export function extractLoaFromJwt(token: string): Role {
  return extractRoleFromJwt(token);
}

/**
 * Parse an RCAN v2.1 JWT and return a full IdentityRecord.
 *
 * Does NOT verify the JWT signature.
 */
export function extractIdentityFromJwt(token: string): IdentityRecord {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return { sub: '', role: Role.GUEST, jwtLevel: 1, scopes: [] };
  }

  const rcanRole = payload['rcan_role'];
  const loa = payload['loa'];
  const rawLevel = rcanRole !== undefined ? Number(rcanRole) : loa !== undefined ? Number(loa) : 1;
  const role = roleFromJwtLevel(rawLevel) ?? Role.GUEST;

  const scopes = Array.isArray(payload['rcan_scopes'])
    ? (payload['rcan_scopes'] as string[])
    : Array.isArray(payload['scopes'])
      ? (payload['scopes'] as string[])
      : [];

  return {
    sub:          String(payload['sub'] ?? ''),
    role,
    jwtLevel:     ROLE_JWT_LEVEL[role],
    registryUrl:  payload['registry_url'] as string | undefined,
    scopes,
    verifiedAt:   payload['verified_at'] as string | undefined,
    peerRrn:      payload['peer_rrn'] as string | undefined,
    fleetRrns:    Array.isArray(payload['fleet_rrns'])
                    ? (payload['fleet_rrns'] as string[])
                    : undefined,
  };
}

// ---------------------------------------------------------------------------
// Scope validation
// ---------------------------------------------------------------------------

export interface ScopeValidationResult {
  ok: boolean;
  reason: string;
}

/**
 * Check whether `role` meets the minimum requirement for `scope`.
 */
export function validateRoleForScope(role: Role, scope: string): ScopeValidationResult {
  const required = SCOPE_MIN_ROLE[scope.toLowerCase()];
  if (required === undefined) {
    // Unknown scope — apply OPERATOR as a safe default
    if (role >= Role.OPERATOR) return { ok: true, reason: '' };
    return {
      ok: false,
      reason: `Unknown scope '${scope}': applying OPERATOR minimum. Caller has ${Role[role]}.`,
    };
  }
  if (role >= required) return { ok: true, reason: '' };
  return {
    ok: false,
    reason: `Scope '${scope}' requires ${Role[required]} (JWT level ${ROLE_JWT_LEVEL[required]}), but caller has ${Role[role]} (JWT level ${ROLE_JWT_LEVEL[role]})`,
  };
}

/** @deprecated Use validateRoleForScope. */
export function validateLoaForScope(role: Role, scope: string): ScopeValidationResult {
  return validateRoleForScope(role, scope);
}
