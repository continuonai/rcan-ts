/**
 * Tests for rcan/identity — RCAN v2.1 RBAC (§2).
 */

import {
  Role,
  LevelOfAssurance,
  ROLE_JWT_LEVEL,
  SCOPE_MIN_ROLE,
  roleFromJwtLevel,
  DEFAULT_LOA_POLICY,
  PRODUCTION_LOA_POLICY,
  extractRoleFromJwt,
  extractLoaFromJwt,
  extractIdentityFromJwt,
  validateRoleForScope,
  validateLoaForScope,
} from '../src/identity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.fakesig`;
}

// ---------------------------------------------------------------------------
// Role enum
// ---------------------------------------------------------------------------

describe('Role', () => {
  test('values', () => {
    expect(Role.GUEST).toBe(1);
    expect(Role.OPERATOR).toBe(2);
    expect(Role.CONTRIBUTOR).toBe(3);
    expect(Role.ADMIN).toBe(4);
    expect(Role.M2M_PEER).toBe(5);
    expect(Role.CREATOR).toBe(6);
    expect(Role.M2M_TRUSTED).toBe(7);
  });

  test('LevelOfAssurance is alias for Role', () => {
    expect(LevelOfAssurance).toBe(Role);
    expect(LevelOfAssurance.GUEST).toBe(Role.GUEST);
  });

  test('ordering is correct', () => {
    expect(Role.GUEST < Role.OPERATOR).toBe(true);
    expect(Role.OPERATOR < Role.CONTRIBUTOR).toBe(true);
    expect(Role.ADMIN < Role.M2M_PEER).toBe(true);
    expect(Role.CREATOR < Role.M2M_TRUSTED).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JWT level mapping
// ---------------------------------------------------------------------------

describe('roleFromJwtLevel', () => {
  test('maps 1.0 → GUEST',       () => expect(roleFromJwtLevel(1.0)).toBe(Role.GUEST));
  test('maps 2.0 → OPERATOR',    () => expect(roleFromJwtLevel(2.0)).toBe(Role.OPERATOR));
  test('maps 2.5 → CONTRIBUTOR', () => expect(roleFromJwtLevel(2.5)).toBe(Role.CONTRIBUTOR));
  test('maps 3.0 → ADMIN',       () => expect(roleFromJwtLevel(3.0)).toBe(Role.ADMIN));
  test('maps 4.0 → M2M_PEER',    () => expect(roleFromJwtLevel(4.0)).toBe(Role.M2M_PEER));
  test('maps 5.0 → CREATOR',     () => expect(roleFromJwtLevel(5.0)).toBe(Role.CREATOR));
  test('maps 6.0 → M2M_TRUSTED', () => expect(roleFromJwtLevel(6.0)).toBe(Role.M2M_TRUSTED));
  test('unknown level → undefined', () => expect(roleFromJwtLevel(99)).toBeUndefined());
});

describe('ROLE_JWT_LEVEL', () => {
  test('CONTRIBUTOR maps to 2.5', () => expect(ROLE_JWT_LEVEL[Role.CONTRIBUTOR]).toBe(2.5));
  test('CREATOR maps to 5.0',     () => expect(ROLE_JWT_LEVEL[Role.CREATOR]).toBe(5.0));
  test('M2M_TRUSTED maps to 6.0', () => expect(ROLE_JWT_LEVEL[Role.M2M_TRUSTED]).toBe(6.0));
});

// ---------------------------------------------------------------------------
// extractRoleFromJwt
// ---------------------------------------------------------------------------

describe('extractRoleFromJwt', () => {
  test('returns GUEST for empty token', () => {
    expect(extractRoleFromJwt('')).toBe(Role.GUEST);
  });

  test('returns GUEST for malformed token', () => {
    expect(extractRoleFromJwt('not.a.jwt')).toBe(Role.GUEST);
  });

  test('returns GUEST when no role claim', () => {
    const token = makeJwt({ sub: 'u', exp: Date.now() / 1000 + 3600 });
    expect(extractRoleFromJwt(token)).toBe(Role.GUEST);
  });

  test.each([
    [1,   Role.GUEST],
    [2,   Role.OPERATOR],
    [2.5, Role.CONTRIBUTOR],
    [3,   Role.ADMIN],
    [4,   Role.M2M_PEER],
    [5,   Role.CREATOR],
    [6,   Role.M2M_TRUSTED],
  ] as [number, Role][])('rcan_role=%s → %s', (level, expected) => {
    const token = makeJwt({ sub: 'u', rcan_role: level });
    expect(extractRoleFromJwt(token)).toBe(expected);
  });

  test('v1.x loa fallback: loa=1 → GUEST', () => {
    const token = makeJwt({ sub: 'u', loa: 1 });
    expect(extractRoleFromJwt(token)).toBe(Role.GUEST);
  });

  test('backward-compat alias extractLoaFromJwt works', () => {
    const token = makeJwt({ sub: 'u', rcan_role: 3 });
    expect(extractLoaFromJwt(token)).toBe(Role.ADMIN);
  });
});

// ---------------------------------------------------------------------------
// extractIdentityFromJwt
// ---------------------------------------------------------------------------

describe('extractIdentityFromJwt', () => {
  test('parses M2M_PEER token', () => {
    const token = makeJwt({
      sub:          'RRN-000000000005',
      rcan_role:    4,
      rcan_scopes:  ['control', 'status'],
      peer_rrn:     'RRN-000000000001',
    });
    const identity = extractIdentityFromJwt(token);
    expect(identity.sub).toBe('RRN-000000000005');
    expect(identity.role).toBe(Role.M2M_PEER);
    expect(identity.scopes).toContain('control');
    expect(identity.peerRrn).toBe('RRN-000000000001');
  });

  test('parses M2M_TRUSTED token', () => {
    const token = makeJwt({
      sub:         'orchestrator:fleet-brain',
      rcan_role:   6,
      rcan_scopes: ['fleet.trusted'],
      fleet_rrns:  ['RRN-000000000001', 'RRN-000000000005'],
    });
    const identity = extractIdentityFromJwt(token);
    expect(identity.role).toBe(Role.M2M_TRUSTED);
    expect(identity.fleetRrns).toHaveLength(2);
  });

  test('malformed token returns GUEST identity', () => {
    const identity = extractIdentityFromJwt('bad');
    expect(identity.role).toBe(Role.GUEST);
  });
});

// ---------------------------------------------------------------------------
// validateRoleForScope
// ---------------------------------------------------------------------------

const READ_SCOPES = ['status', 'discover', 'chat', 'observer'] as const;
const CONTROL_SCOPES = ['control', 'teleop'] as const;

describe('validateRoleForScope', () => {
  test.each(READ_SCOPES)('GUEST passes %s', (scope) => {
    expect(validateRoleForScope(Role.GUEST, scope).ok).toBe(true);
  });

  test.each(CONTROL_SCOPES)('GUEST fails %s', (scope) => {
    expect(validateRoleForScope(Role.GUEST, scope).ok).toBe(false);
  });

  test.each(CONTROL_SCOPES)('OPERATOR passes %s', (scope) => {
    expect(validateRoleForScope(Role.OPERATOR, scope).ok).toBe(true);
  });

  test('CONTRIBUTOR passes contribute', () => {
    expect(validateRoleForScope(Role.CONTRIBUTOR, 'contribute').ok).toBe(true);
  });

  test('OPERATOR fails config', () => {
    expect(validateRoleForScope(Role.OPERATOR, 'config').ok).toBe(false);
  });

  test('ADMIN passes config', () => {
    expect(validateRoleForScope(Role.ADMIN, 'config').ok).toBe(true);
  });

  test('CREATOR passes admin', () => {
    expect(validateRoleForScope(Role.CREATOR, 'admin').ok).toBe(true);
  });

  test('M2M_TRUSTED passes fleet.trusted', () => {
    expect(validateRoleForScope(Role.M2M_TRUSTED, 'fleet.trusted').ok).toBe(true);
  });

  test('CREATOR fails fleet.trusted (must be M2M_TRUSTED)', () => {
    expect(validateRoleForScope(Role.CREATOR, 'fleet.trusted').ok).toBe(false);
  });

  test('reason is empty on success', () => {
    const result = validateRoleForScope(Role.ADMIN, 'config');
    expect(result.reason).toBe('');
  });

  test('reason mentions scope on failure', () => {
    const result = validateRoleForScope(Role.GUEST, 'config');
    expect(result.reason.toLowerCase()).toContain('config');
  });

  test('unknown scope applies OPERATOR minimum', () => {
    expect(validateRoleForScope(Role.GUEST, 'some_custom_scope').ok).toBe(false);
    expect(validateRoleForScope(Role.OPERATOR, 'some_custom_scope').ok).toBe(true);
  });

  test('backward-compat alias validateLoaForScope works', () => {
    expect(validateLoaForScope(Role.ADMIN, 'config').ok).toBe(true);
  });

  test('M2M_TRUSTED passes every defined scope', () => {
    for (const scope of Object.keys(SCOPE_MIN_ROLE)) {
      expect(validateRoleForScope(Role.M2M_TRUSTED, scope).ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// LoaPolicy
// ---------------------------------------------------------------------------

describe('LoaPolicy', () => {
  test('DEFAULT_LOA_POLICY — all GUEST', () => {
    expect(DEFAULT_LOA_POLICY.minRoleForDiscover).toBe(Role.GUEST);
    expect(DEFAULT_LOA_POLICY.minRoleForControl).toBe(Role.GUEST);
    expect(DEFAULT_LOA_POLICY.minRoleForSafety).toBe(Role.GUEST);
  });

  test('PRODUCTION_LOA_POLICY — control=OPERATOR, safety=CREATOR', () => {
    expect(PRODUCTION_LOA_POLICY.minRoleForControl).toBe(Role.OPERATOR);
    expect(PRODUCTION_LOA_POLICY.minRoleForSafety).toBe(Role.CREATOR);
  });
});
