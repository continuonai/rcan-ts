/**
 * Tests for RCAN v2.2 envelope types — V22DelegationHop, V22MediaChunk,
 * validateV22DelegationChain, verifyV22MediaChunkHash.
 *
 * Issue: #38
 */

import * as crypto from 'crypto';
import {
  V22DelegationHop,
  V22MediaChunk,
  validateV22DelegationChain,
  verifyV22MediaChunkHash,
  _setHashImpl,
} from '../src/delegation.js';
import { RCANMessageData } from '../src/message.js';

// ---------------------------------------------------------------------------
// validateV22DelegationChain
// ---------------------------------------------------------------------------

function makeHop(n: number): V22DelegationHop {
  return {
    robot_rrn: `rcan://rrf.rcan.dev/test/bot/v1/unit-${String(n).padStart(3, '0')}`,
    scope: 'operator',
    issued_at: '2026-01-01T00:00:00Z',
    expires_at: '2026-12-31T23:59:59Z',
  };
}

beforeAll(() => {
  _setHashImpl((data: string) => "sha256:" + crypto.createHash("sha256").update(data).digest("hex"));
});
afterAll(() => {
  _setHashImpl(undefined);
});

describe('validateV22DelegationChain', () => {
  it('accepts a chain of 3 hops', () => {
    const chain = [makeHop(0), makeHop(1), makeHop(2)];
    expect(() => validateV22DelegationChain(chain)).not.toThrow();
  });

  it('throws when chain length exceeds 3', () => {
    const chain = [makeHop(0), makeHop(1), makeHop(2), makeHop(3)];
    expect(() => validateV22DelegationChain(chain)).toThrow(
      'RCAN: delegation chain max depth is 3'
    );
  });

  it('accepts an empty chain', () => {
    expect(() => validateV22DelegationChain([])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// verifyV22MediaChunkHash
// ---------------------------------------------------------------------------

describe('verifyV22MediaChunkHash', () => {
  it('passes when hash matches', () => {
    const data = 'hello world';
    const hash =
      'sha256:' + crypto.createHash('sha256').update(data).digest('hex');
    const chunk: V22MediaChunk = {
      chunk_id: 'chunk-1',
      mime_type: 'text/plain',
      size_bytes: Buffer.byteLength(data),
      hash_sha256: hash,
      data,
    };
    expect(() => verifyV22MediaChunkHash(chunk)).not.toThrow();
  });

  it('throws when hash mismatches', () => {
    const chunk: V22MediaChunk = {
      chunk_id: 'chunk-2',
      mime_type: 'text/plain',
      size_bytes: 5,
      hash_sha256: 'sha256:deadbeef',
      data: 'hello',
    };
    expect(() => verifyV22MediaChunkHash(chunk)).toThrow('hash mismatch');
  });

  it('does not throw when data is absent', () => {
    const chunk: V22MediaChunk = {
      chunk_id: 'chunk-3',
      mime_type: 'image/jpeg',
      size_bytes: 1024,
      hash_sha256: 'sha256:abc123',
      ref_url: 'https://example.com/image.jpg',
    };
    expect(() => verifyV22MediaChunkHash(chunk)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RCANMessageData — new v2.2 fields are optional (TypeScript compilation test)
// ---------------------------------------------------------------------------

describe('RCANMessageData v2.2 fields are optional', () => {
  it('accepts a message with no v2.2 fields', () => {
    const data: RCANMessageData = {
      cmd: 'ping',
      target: 'rcan://registry.rcan.dev/acme/arm/v1/unit-001',
    };
    expect(data.firmware_hash).toBeUndefined();
    expect(data.attestation_ref).toBeUndefined();
    expect(data.pq_sig).toBeUndefined();
    expect(data.pq_alg).toBeUndefined();
  });

  it('accepts a message with all v2.2 fields set', () => {
    const chain: V22DelegationHop[] = [makeHop(0)];
    const data: RCANMessageData = {
      cmd: 'move',
      target: 'rcan://registry.rcan.dev/acme/arm/v1/unit-001',
      firmware_hash: 'sha256:abc',
      attestation_ref: 'https://rrf.rcan.dev/sbom/unit-001',
      pq_sig: 'base64sig',
      pq_alg: 'ml-dsa-65',
      // delegation_chain and media_chunks stored under camelCase in RCANMessageData
    };
    expect(data.firmware_hash).toBe('sha256:abc');
    expect(data.pq_alg).toBe('ml-dsa-65');
  });
});
