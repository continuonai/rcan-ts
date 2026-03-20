/**
 * Tests for src/identity.ts — GAP-14: Level of Assurance
 */

import {
  LevelOfAssurance,
  DEFAULT_LOA_POLICY,
  PRODUCTION_LOA_POLICY,
  extractLoaFromJwt,
  validateLoaForScope,
} from '../src/identity.js';

// Helper: create a minimal JWT with a given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

// ── extractLoaFromJwt ─────────────────────────────────────────────────────────

describe('extractLoaFromJwt', () => {
  test('returns ANONYMOUS for empty token', () => {
    expect(extractLoaFromJwt('')).toBe(LevelOfAssurance.ANONYMOUS);
  });

  test('returns ANONYMOUS for malformed token', () => {
    expect(extractLoaFromJwt('not.a.jwt')).toBe(LevelOfAssurance.ANONYMOUS);
  });

  test('returns ANONYMOUS when loa claim is absent', () => {
    const token = makeJwt({ sub: 'user123' });
    expect(extractLoaFromJwt(token)).toBe(LevelOfAssurance.ANONYMOUS);
  });

  test('returns ANONYMOUS (1) when loa=1', () => {
    const token = makeJwt({ loa: 1 });
    expect(extractLoaFromJwt(token)).toBe(LevelOfAssurance.ANONYMOUS);
  });

  test('returns EMAIL_VERIFIED (2) when loa=2', () => {
    const token = makeJwt({ loa: 2 });
    expect(extractLoaFromJwt(token)).toBe(LevelOfAssurance.EMAIL_VERIFIED);
  });

  test('returns HARDWARE_TOKEN (3) when loa=3', () => {
    const token = makeJwt({ loa: 3 });
    expect(extractLoaFromJwt(token)).toBe(LevelOfAssurance.HARDWARE_TOKEN);
  });

  test('returns ANONYMOUS for out-of-range loa=99', () => {
    const token = makeJwt({ loa: 99 });
    expect(extractLoaFromJwt(token)).toBe(LevelOfAssurance.ANONYMOUS);
  });

  test('returns ANONYMOUS for non-numeric loa', () => {
    const token = makeJwt({ loa: 'high' });
    expect(extractLoaFromJwt(token)).toBe(LevelOfAssurance.ANONYMOUS);
  });
});

// ── validateLoaForScope ───────────────────────────────────────────────────────

describe('validateLoaForScope — DEFAULT_LOA_POLICY', () => {
  const scopes = ['discover', 'status', 'chat', 'control', 'safety'];

  test.each(scopes)('ANONYMOUS passes %s with default policy', (scope) => {
    const result = validateLoaForScope(LevelOfAssurance.ANONYMOUS, scope, DEFAULT_LOA_POLICY);
    expect(result.valid).toBe(true);
  });

  test('unknown scope is allowed by default', () => {
    const result = validateLoaForScope(LevelOfAssurance.ANONYMOUS, 'custom_scope');
    expect(result.valid).toBe(true);
  });
});

describe('validateLoaForScope — PRODUCTION_LOA_POLICY', () => {
  test('ANONYMOUS can discover and check status', () => {
    expect(validateLoaForScope(LevelOfAssurance.ANONYMOUS, 'discover', PRODUCTION_LOA_POLICY).valid).toBe(true);
    expect(validateLoaForScope(LevelOfAssurance.ANONYMOUS, 'status',   PRODUCTION_LOA_POLICY).valid).toBe(true);
    expect(validateLoaForScope(LevelOfAssurance.ANONYMOUS, 'chat',     PRODUCTION_LOA_POLICY).valid).toBe(true);
  });

  test('ANONYMOUS is blocked from control', () => {
    const result = validateLoaForScope(LevelOfAssurance.ANONYMOUS, 'control', PRODUCTION_LOA_POLICY);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('LOA_INSUFFICIENT');
  });

  test('ANONYMOUS is blocked from safety', () => {
    const result = validateLoaForScope(LevelOfAssurance.ANONYMOUS, 'safety', PRODUCTION_LOA_POLICY);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('LOA_INSUFFICIENT');
  });

  test('EMAIL_VERIFIED can control', () => {
    const result = validateLoaForScope(LevelOfAssurance.EMAIL_VERIFIED, 'control', PRODUCTION_LOA_POLICY);
    expect(result.valid).toBe(true);
  });

  test('EMAIL_VERIFIED is blocked from safety', () => {
    const result = validateLoaForScope(LevelOfAssurance.EMAIL_VERIFIED, 'safety', PRODUCTION_LOA_POLICY);
    expect(result.valid).toBe(false);
  });

  test('HARDWARE_TOKEN can do anything', () => {
    const scopes = ['discover', 'status', 'chat', 'control', 'safety'];
    for (const scope of scopes) {
      expect(validateLoaForScope(LevelOfAssurance.HARDWARE_TOKEN, scope, PRODUCTION_LOA_POLICY).valid).toBe(true);
    }
  });
});

describe('validateLoaForScope — policy override', () => {
  test('custom policy is respected', () => {
    const customPolicy = {
      ...DEFAULT_LOA_POLICY,
      minLoaChat: LevelOfAssurance.EMAIL_VERIFIED,
    };
    const result = validateLoaForScope(LevelOfAssurance.ANONYMOUS, 'chat', customPolicy);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('LOA_INSUFFICIENT');
  });
});

// ── LevelOfAssurance enum values ──────────────────────────────────────────────

describe('LevelOfAssurance enum', () => {
  test('ANONYMOUS = 1', () => expect(LevelOfAssurance.ANONYMOUS).toBe(1));
  test('EMAIL_VERIFIED = 2', () => expect(LevelOfAssurance.EMAIL_VERIFIED).toBe(2));
  test('HARDWARE_TOKEN = 3', () => expect(LevelOfAssurance.HARDWARE_TOKEN).toBe(3));
});

describe('v1.7 contribute scope', () => {
  it('should validate contribute scope at chat LoA level', () => {
    const result = validateLoaForScope(LevelOfAssurance.ANONYMOUS, 'contribute');
    expect(result.valid).toBe(true);
  });
});
