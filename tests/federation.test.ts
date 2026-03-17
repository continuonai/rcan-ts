/**
 * Tests for src/federation.ts — GAP-16: Cross-registry federation
 */

import {
  RegistryTier,
  FederationSyncType,
  TrustAnchorCache,
  makeFederationSync,
  validateCrossRegistryCommand,
  type RegistryIdentity,
  type FederationSyncPayload,
} from '../src/federation.js';
import { RCANMessage, MessageType } from '../src/message.js';
import { LevelOfAssurance } from '../src/identity.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIdentity(url: string): RegistryIdentity {
  return {
    registryUrl:  url,
    tier:         RegistryTier.AUTHORITATIVE,
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----',
    domain:       'example.com',
    verifiedAt:   new Date().toISOString(),
  };
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

// ── RegistryTier enum ─────────────────────────────────────────────────────────

describe('RegistryTier', () => {
  test('has root, authoritative, community', () => {
    expect(RegistryTier.ROOT).toBe('root');
    expect(RegistryTier.AUTHORITATIVE).toBe('authoritative');
    expect(RegistryTier.COMMUNITY).toBe('community');
  });
});

// ── FederationSyncType enum ───────────────────────────────────────────────────

describe('FederationSyncType', () => {
  test('has consent, revocation, key', () => {
    expect(FederationSyncType.CONSENT).toBe('consent');
    expect(FederationSyncType.REVOCATION).toBe('revocation');
    expect(FederationSyncType.KEY).toBe('key');
  });
});

// ── TrustAnchorCache ──────────────────────────────────────────────────────────

describe('TrustAnchorCache', () => {
  test('stores and retrieves an identity', () => {
    const cache = new TrustAnchorCache();
    const id = makeIdentity('https://reg.example.com');
    cache.set(id);
    expect(cache.lookup('https://reg.example.com')).toEqual(id);
  });

  test('returns undefined for unknown URL', () => {
    const cache = new TrustAnchorCache();
    expect(cache.lookup('https://unknown.example.com')).toBeUndefined();
  });

  test('replaces an existing entry on set()', () => {
    const cache = new TrustAnchorCache();
    const id1 = makeIdentity('https://reg.example.com');
    const id2 = { ...id1, tier: RegistryTier.ROOT };
    cache.set(id1);
    cache.set(id2);
    expect(cache.lookup('https://reg.example.com')?.tier).toBe(RegistryTier.ROOT);
  });

  test('verifyRegistryJwt throws for unknown registry', async () => {
    const cache = new TrustAnchorCache();
    const token = makeJwt({ iss: 'https://unknown.example.com' });
    await expect(
      cache.verifyRegistryJwt(token, 'https://unknown.example.com'),
    ).rejects.toThrow('REGISTRY_UNKNOWN');
  });

  test('verifyRegistryJwt returns identity for matching iss', async () => {
    const cache = new TrustAnchorCache();
    const id = makeIdentity('https://reg.example.com');
    cache.set(id);
    const token = makeJwt({ iss: 'https://reg.example.com' });
    const result = await cache.verifyRegistryJwt(token, 'https://reg.example.com');
    expect(result).toEqual(id);
  });

  test('verifyRegistryJwt throws when iss does not match url', async () => {
    const cache = new TrustAnchorCache();
    const id = makeIdentity('https://reg.example.com');
    cache.set(id);
    const token = makeJwt({ iss: 'https://other.example.com' });
    await expect(
      cache.verifyRegistryJwt(token, 'https://reg.example.com'),
    ).rejects.toThrow('REGISTRY_JWT_ISS_MISMATCH');
  });

  test('verifyRegistryJwt throws for malformed token', async () => {
    const cache = new TrustAnchorCache();
    const id = makeIdentity('https://reg.example.com');
    cache.set(id);
    await expect(
      cache.verifyRegistryJwt('bad.token', 'https://reg.example.com'),
    ).rejects.toThrow();
  });

  test('discoverViaDns returns undefined when DNS is unavailable/fails', async () => {
    const cache = new TrustAnchorCache();
    // DNS lookup for a non-existent domain should return undefined, not throw
    const result = await cache.discoverViaDns('_nonexistent_rcan_test_domain_12345.invalid');
    expect(result).toBeUndefined();
  });
});

// ── makeFederationSync ────────────────────────────────────────────────────────

describe('makeFederationSync', () => {
  test('creates a FEDERATION_SYNC message', () => {
    const syncPayload: FederationSyncPayload = {
      sourceRegistry: 'https://source.example.com',
      targetRegistry: 'https://target.example.com',
      syncType:       FederationSyncType.CONSENT,
      payload:        { consentId: 'c123' },
      signature:      'sig123',
    };
    const msg = makeFederationSync(
      'https://source.example.com',
      'https://target.example.com',
      FederationSyncType.CONSENT,
      syncPayload,
    );
    expect(msg).toBeInstanceOf(RCANMessage);
    expect(msg.cmd).toBe('federation_sync');
    expect(msg.params?.['msg_type']).toBe(MessageType.FEDERATION_SYNC);
    expect(msg.params?.['source_registry']).toBe('https://source.example.com');
    expect(msg.params?.['sync_type']).toBe(FederationSyncType.CONSENT);
  });
});

// ── validateCrossRegistryCommand ─────────────────────────────────────────────

describe('validateCrossRegistryCommand', () => {
  const LOCAL = 'https://local.example.com';
  const REMOTE = 'https://remote.example.com';

  function makeMsg(params: Record<string, unknown> = {}): RCANMessage {
    return new RCANMessage({
      cmd:    'test_cmd',
      target: 'rcan://bot1',
      params,
    });
  }

  test('ESTOP (msg_type=6) always valid regardless of trust cache', async () => {
    const cache = new TrustAnchorCache();
    const msg = makeMsg({ msg_type: 6, source_registry: REMOTE });
    const result = await validateCrossRegistryCommand(msg, LOCAL, cache);
    expect(result.valid).toBe(true);
    expect(result.reason).toContain('P66');
  });

  test('ESTOP by msg_type=SAFETY constant always valid', async () => {
    const cache = new TrustAnchorCache();
    const msg = makeMsg({ msg_type: MessageType.SAFETY, source_registry: REMOTE });
    const result = await validateCrossRegistryCommand(msg, LOCAL, cache);
    expect(result.valid).toBe(true);
  });

  test('ESTOP by cmd name always valid', async () => {
    const cache = new TrustAnchorCache();
    const msg = new RCANMessage({ cmd: 'estop', target: 'rcan://bot1', params: { source_registry: REMOTE } });
    const result = await validateCrossRegistryCommand(msg, LOCAL, cache);
    expect(result.valid).toBe(true);
  });

  test('local registry message is always valid', async () => {
    const cache = new TrustAnchorCache();
    const msg = makeMsg({ msg_type: 1, source_registry: LOCAL });
    const result = await validateCrossRegistryCommand(msg, LOCAL, cache);
    expect(result.valid).toBe(true);
  });

  test('unknown source registry returns invalid', async () => {
    const cache = new TrustAnchorCache();
    const msg = makeMsg({ msg_type: 1, source_registry: REMOTE });
    const result = await validateCrossRegistryCommand(msg, LOCAL, cache);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('REGISTRY_UNKNOWN');
  });

  test('known registry with LoA=1 is blocked', async () => {
    const cache = new TrustAnchorCache();
    cache.set(makeIdentity(REMOTE));
    const msg = makeMsg({ msg_type: 1, source_registry: REMOTE });
    // No JWT = defaults to ANONYMOUS (LoA 1)
    const result = await validateCrossRegistryCommand(msg, LOCAL, cache);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('LOA_INSUFFICIENT');
  });

  test('known registry with LoA=2 JWT is accepted', async () => {
    const cache = new TrustAnchorCache();
    cache.set(makeIdentity(REMOTE));
    const jwt = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify({ loa: 2 })).toString('base64url') +
      '.sig';
    const msg = makeMsg({ msg_type: 1, source_registry: REMOTE, registry_jwt: jwt });
    const result = await validateCrossRegistryCommand(msg, LOCAL, cache);
    expect(result.valid).toBe(true);
  });

  test('known registry with msg.loa=2 is accepted', async () => {
    const cache = new TrustAnchorCache();
    cache.set(makeIdentity(REMOTE));
    const baseMsg = makeMsg({ msg_type: 1, source_registry: REMOTE });
    const msgWithLoa = RCANMessage.fromJSON({
      ...baseMsg.toJSON(),
      loa: LevelOfAssurance.EMAIL_VERIFIED,
    } as Record<string, unknown>);
    const result = await validateCrossRegistryCommand(msgWithLoa, LOCAL, cache);
    expect(result.valid).toBe(true);
  });

  test('message without source_registry treated as local', async () => {
    const cache = new TrustAnchorCache();
    const msg = makeMsg({ msg_type: 1 });
    const result = await validateCrossRegistryCommand(msg, LOCAL, cache);
    expect(result.valid).toBe(true);
  });
});
