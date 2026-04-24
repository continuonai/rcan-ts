import {
  FriaSigningKey,
  FriaConformance,
  FriaDocument,
} from '../src/compliance.js';

describe('FriaSigningKey', () => {
  test('holds alg, kid, public_key', () => {
    const key: FriaSigningKey = {
      alg: 'ml-dsa-65',
      kid: 'key-001',
      public_key: 'AAAA',
    };
    expect(key.alg).toBe('ml-dsa-65');
    expect(key.kid).toBe('key-001');
    expect(key.public_key).toBe('AAAA');
  });
});

describe('FriaConformance', () => {
  test('uses pass_count and fail_count (not pass/fail)', () => {
    const c: FriaConformance = {
      score: 0.95,
      pass_count: 19,
      warn_count: 1,
      fail_count: 0,
    };
    expect(c.pass_count).toBe(19);
    expect(c.fail_count).toBe(0);
    expect(c.warn_count).toBe(1);
    expect(c.score).toBeCloseTo(0.95);
  });
});

describe('FriaDocument', () => {
  test('holds all required fields with nested types', () => {
    const key: FriaSigningKey = { alg: 'ml-dsa-65', kid: 'k1', public_key: 'pub' };
    const conformance: FriaConformance = { score: 1.0, pass_count: 10, warn_count: 0, fail_count: 0 };
    const doc: FriaDocument = {
      schema: 'rcan-fria-v1',
      generated_at: '2026-04-12T00:00:00Z',
      system: { rrn: 'RRN-000000000001', rcan_version: '3.0' },
      deployment: { annex_iii_basis: 'high-risk', prerequisite_waived: false },
      signing_key: key,
      sig: { alg: 'ml-dsa-65', kid: 'k1', value: 'sigval' },
      conformance,
    };
    expect(doc.schema).toBe('rcan-fria-v1');
    expect(doc.conformance?.fail_count).toBe(0);
  });

  test('conformance is optional (null)', () => {
    const doc: FriaDocument = {
      schema: 'rcan-fria-v1',
      generated_at: '2026-04-12T00:00:00Z',
      system: {},
      deployment: {},
      signing_key: { alg: 'ml-dsa-65', kid: 'k1', public_key: 'pub' },
      sig: {},
      conformance: null,
    };
    expect(doc.conformance).toBeNull();
  });
});


import { makeRegistryRegister, RegistryRegisterPayload } from '../src/message.js';
import { MessageType } from '../src/message.js';

describe('makeRegistryRegister', () => {
  test('returns RegistryRegisterPayload with type REGISTRY_REGISTER', () => {
    const payload = makeRegistryRegister({
      rrn: 'RRN-000000000001',
      robot_name: 'opencastor-rpi5',
      public_key: 'base64pubkey',
      verification_tier: 'community',
      fria_ref: 'https://rcan.dev/fria/RRN-000000000001',
    });
    expect(payload.type).toBe(MessageType.REGISTRY_REGISTER);
    expect(payload.rrn).toBe('RRN-000000000001');
    expect(payload.fria_ref).toBe('https://rcan.dev/fria/RRN-000000000001');
  });

  test('metadata defaults to empty object', () => {
    const payload = makeRegistryRegister({
      rrn: 'RRN-000000000002',
      robot_name: 'testbot',
      public_key: 'pk',
      verification_tier: 'verified',
      fria_ref: 'https://example.com/fria/2',
    });
    expect(payload.metadata).toEqual({});
  });

  test('accepts custom metadata', () => {
    const meta = { category: 'logistics', region: 'eu' };
    const payload = makeRegistryRegister({
      rrn: 'RRN-000000000003',
      robot_name: 'castorbot',
      public_key: 'pk',
      verification_tier: 'manufacturer',
      fria_ref: 'https://example.com/fria/3',
      metadata: meta,
    });
    expect(payload.metadata).toEqual(meta);
  });

  test('accepts all four verification_tier values', () => {
    const tiers = ['community', 'verified', 'manufacturer', 'certified'] as const;
    for (const verification_tier of tiers) {
      const payload = makeRegistryRegister({
        rrn: 'RRN-000000000001',
        robot_name: 'bot',
        public_key: 'pk',
        verification_tier,
        fria_ref: 'ref',
      });
      expect(payload.verification_tier).toBe(verification_tier);
    }
  });
});
