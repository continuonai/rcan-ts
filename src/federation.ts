/**
 * RCAN Federation — cross-registry trust and sync (GAP-16).
 *
 * Provides:
 *  - Registry tier model (root / authoritative / community)
 *  - TrustAnchorCache with 24-hour TTL and DNS-TXT discovery
 *  - JWT verification against a trusted registry
 *  - Cross-registry command validation (LoA ≥ 2 required; ESTOP always allowed)
 */

import { RCANMessage, MessageType } from './message.js';
import { LevelOfAssurance, extractLoaFromJwt } from './identity.js';

// ── Enums & interfaces ────────────────────────────────────────────────────────

export enum RegistryTier {
  ROOT          = 'root',
  AUTHORITATIVE = 'authoritative',
  COMMUNITY     = 'community',
}

export enum FederationSyncType {
  CONSENT    = 'consent',
  REVOCATION = 'revocation',
  KEY        = 'key',
}

export interface RegistryIdentity {
  registryUrl:  string;
  tier:         RegistryTier;
  publicKeyPem: string;
  domain:       string;
  verifiedAt?:  string;
}

export interface FederationSyncPayload {
  sourceRegistry: string;
  targetRegistry: string;
  syncType:       FederationSyncType;
  payload:        Record<string, unknown>;
  signature:      string;
}

// ── TrustAnchorCache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  identity:  RegistryIdentity;
  expiresAt: number;
}

/**
 * In-memory cache of trusted registry identities.
 *
 * Entries expire after 24 hours. Discovery via DNS TXT records
 * (_rcan-registry.<domain>) is supported in Node.js environments.
 */
export class TrustAnchorCache {
  private readonly store = new Map<string, CacheEntry>();

  /** Store or refresh a registry identity. */
  set(identity: RegistryIdentity): void {
    this.store.set(identity.registryUrl, {
      identity,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * Look up a registry URL.
   * Returns undefined when absent or when the TTL has expired.
   */
  lookup(url: string): RegistryIdentity | undefined {
    const entry = this.store.get(url);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(url);
      return undefined;
    }
    return entry.identity;
  }

  /**
   * Discover a registry via DNS TXT record `_rcan-registry.<domain>`.
   *
   * The TXT record is expected to contain a JSON object with the
   * RegistryIdentity fields. Returns the identity and caches it.
   *
   * Node.js only — returns undefined in environments without `dns.promises`.
   */
  async discoverViaDns(domain: string): Promise<RegistryIdentity | undefined> {
    const hostname = `_rcan-registry.${domain}`;
    let records: string[][];

    try {
      // Dynamic require keeps this tree-shakable and browser-safe
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const dnsModule = require('dns') as { promises: { resolveTxt: (h: string) => Promise<string[][]> } };
      records = await dnsModule.promises.resolveTxt(hostname);
    } catch {
      return undefined;
    }

    // Flatten the chunked TXT records into a single string per record
    for (const record of records) {
      const text = record.join('');
      try {
        const parsed = JSON.parse(text) as Partial<RegistryIdentity>;
        if (
          parsed.registryUrl &&
          parsed.tier &&
          parsed.publicKeyPem &&
          parsed.domain
        ) {
          const identity: RegistryIdentity = {
            registryUrl:  parsed.registryUrl,
            tier:         parsed.tier,
            publicKeyPem: parsed.publicKeyPem,
            domain:       parsed.domain,
            verifiedAt:   new Date().toISOString(),
          };
          this.set(identity);
          return identity;
        }
      } catch {
        // not JSON — skip
      }
    }
    return undefined;
  }

  /**
   * Verify a JWT was issued by the registry at `url`.
   *
   * Validates the `iss` claim and checks the registry is in the trust cache.
   * Full cryptographic signature verification requires the registry's public
   * key material — callers should perform additional checks using `publicKeyPem`
   * from the returned identity.
   */
  async verifyRegistryJwt(
    token: string,
    url: string,
  ): Promise<RegistryIdentity> {
    const identity = this.lookup(url);
    if (!identity) {
      throw new Error(`REGISTRY_UNKNOWN: ${url} is not in the trust cache`);
    }

    // Decode claims (structural check — no crypto signature here)
    let iss: string | undefined;
    try {
      const parts = token.split('.');
      const payloadB64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
      const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
      let json: string;
      if (typeof atob !== 'undefined') {
        json = atob(padded);
      } else {
        json = Buffer.from(padded, 'base64').toString('utf-8');
      }
      const claims = JSON.parse(json) as Record<string, unknown>;
      iss = typeof claims['iss'] === 'string' ? claims['iss'] : undefined;
    } catch {
      throw new Error('REGISTRY_JWT_MALFORMED: cannot decode token payload');
    }

    if (iss !== url) {
      throw new Error(
        `REGISTRY_JWT_ISS_MISMATCH: expected iss=${url}, got iss=${iss ?? '(none)'}`,
      );
    }

    return identity;
  }
}

// ── Factory helpers ───────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/**
 * Build a FEDERATION_SYNC message (MessageType 12).
 */
export function makeFederationSync(
  source:   string,
  target:   string,
  syncType: FederationSyncType,
  payload:  FederationSyncPayload,
): RCANMessage {
  return new RCANMessage({
    rcan:        '1.6',
    rcanVersion: '1.6',
    cmd:         'federation_sync',
    target,
    params: {
      msg_type:        MessageType.FEDERATION_SYNC,
      msg_id:          generateId(),
      source_registry: source,
      target_registry: target,
      sync_type:       syncType,
      payload,
    },
    timestamp: new Date().toISOString(),
  });
}

// ── Cross-registry command validation ────────────────────────────────────────

/**
 * Validate a cross-registry command against the local trust anchor cache.
 *
 * Rules:
 *  - ESTOP (SAFETY type 6 or cmd=estop) always returns valid (P66 invariant).
 *  - All other cross-registry commands require LoA ≥ 2 (EMAIL_VERIFIED).
 *  - If the message originates from `localRegistry` it is not cross-registry.
 */
export async function validateCrossRegistryCommand(
  msg:           RCANMessage,
  localRegistry: string,
  trustCache:    TrustAnchorCache,
): Promise<{ valid: boolean; reason: string }> {
  // P66: ESTOP is never blocked
  const msgType = msg.params?.['msg_type'];
  const isEstop =
    msgType === MessageType.SAFETY ||
    msgType === 6 ||
    msg.cmd === 'estop' ||
    msg.cmd === 'ESTOP';

  if (isEstop) {
    return { valid: true, reason: 'ESTOP always permitted (P66 invariant)' };
  }

  // Extract source registry from params
  const sourceRegistry = (msg.params?.['source_registry'] as string | undefined) ??
    (msg.params?.['from_registry'] as string | undefined);

  if (!sourceRegistry || sourceRegistry === localRegistry) {
    // Local message — not cross-registry
    return { valid: true, reason: 'local registry; no federation check needed' };
  }

  // Must be a known trust anchor
  const identity = trustCache.lookup(sourceRegistry);
  if (!identity) {
    return {
      valid:  false,
      reason: `REGISTRY_UNKNOWN: ${sourceRegistry} is not in the local trust cache`,
    };
  }

  // Check LoA — prefer JWT in params, fall back to message loa field
  let loa: LevelOfAssurance = LevelOfAssurance.ANONYMOUS;
  const registryJwt = msg.params?.['registry_jwt'] as string | undefined;
  if (registryJwt) {
    loa = extractLoaFromJwt(registryJwt);
  } else if (typeof msg.loa === 'number') {
    loa = msg.loa as LevelOfAssurance;
  }

  if (loa < LevelOfAssurance.EMAIL_VERIFIED) {
    return {
      valid:  false,
      reason: `LOA_INSUFFICIENT: cross-registry commands require LoA>=2 (EMAIL_VERIFIED), got LoA=${loa}`,
    };
  }

  return { valid: true, reason: 'cross-registry command accepted' };
}
