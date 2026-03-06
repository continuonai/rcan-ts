/**
 * Tests for canonical schema validation (src/schema.ts)
 */

import {
  fetchCanonicalSchema,
  validateConfigAgainstSchema,
  validateNodeAgainstSchema,
  _clearSchemaCache,
} from '../src/schema';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchSuccess(body: unknown): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function mockFetchFailure(status = 404): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: jest.fn().mockResolvedValue({ error: 'not found' }),
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function mockFetchNetworkError(): jest.Mock {
  const fn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  _clearSchemaCache();
});

afterEach(() => {
  jest.resetAllMocks();
});

// ── fetchCanonicalSchema ───────────────────────────────────────────────────────

describe('fetchCanonicalSchema()', () => {
  it('returns schema object on success', async () => {
    const schema = { '$schema': 'http://json-schema.org/draft-07/schema', required: ['rcan_version'] };
    mockFetchSuccess(schema);
    const result = await fetchCanonicalSchema('rcan-config.schema.json');
    expect(result).toEqual(schema);
  });

  it('returns null when server returns non-OK status', async () => {
    mockFetchFailure(404);
    const result = await fetchCanonicalSchema('rcan-config.schema.json');
    expect(result).toBeNull();
  });

  it('returns null on network error (graceful degradation)', async () => {
    mockFetchNetworkError();
    const result = await fetchCanonicalSchema('rcan-config.schema.json');
    expect(result).toBeNull();
  });

  it('uses in-memory cache on second call', async () => {
    const schema = { required: ['rcan_version'], cached: true };
    mockFetchSuccess(schema);
    const first = await fetchCanonicalSchema('rcan-config.schema.json');
    const second = await fetchCanonicalSchema('rcan-config.schema.json');
    expect(first).toEqual(schema);
    expect(second).toEqual(schema);
    // fetch should only have been called once
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
  });
});

// ── validateConfigAgainstSchema ───────────────────────────────────────────────

describe('validateConfigAgainstSchema()', () => {
  it('returns { valid: true } when all required fields present', async () => {
    const schema = { required: ['rcan_version', 'metadata'] };
    mockFetchSuccess(schema);
    const result = await validateConfigAgainstSchema({
      rcan_version: '1.2',
      metadata: { manufacturer: 'ACME' },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('returns { valid: false, errors } when required fields missing', async () => {
    const schema = { required: ['rcan_version', 'metadata', 'agent'] };
    mockFetchSuccess(schema);
    const result = await validateConfigAgainstSchema({ rcan_version: '1.2' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: metadata');
    expect(result.errors).toContain('Missing required field: agent');
  });

  it('returns { valid: false } when config is not an object', async () => {
    const schema = { required: ['rcan_version'] };
    mockFetchSuccess(schema);
    const result = await validateConfigAgainstSchema('not-an-object');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Config must be an object');
  });

  it('returns { valid: false } when config is null', async () => {
    const schema = { required: ['rcan_version'] };
    mockFetchSuccess(schema);
    const result = await validateConfigAgainstSchema(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Config must be an object');
  });

  it('returns { valid: true, skipped: true } when network is down', async () => {
    mockFetchNetworkError();
    const result = await validateConfigAgainstSchema({ rcan_version: '1.2' });
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('returns { valid: true, skipped: true } when schema endpoint returns 404', async () => {
    mockFetchFailure(404);
    const result = await validateConfigAgainstSchema({});
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(true);
  });
});

// ── validateNodeAgainstSchema ─────────────────────────────────────────────────

describe('validateNodeAgainstSchema()', () => {
  it('returns { valid: true } when all required fields present', async () => {
    const schema = { required: ['rcan_node_version', 'operator', 'public_key'] };
    mockFetchSuccess(schema);
    const result = await validateNodeAgainstSchema({
      rcan_node_version: '1.0',
      operator: 'ACME',
      public_key: 'ed25519:abc123',
    });
    expect(result.valid).toBe(true);
  });

  it('returns { valid: false, errors } when required fields missing', async () => {
    const schema = { required: ['rcan_node_version', 'operator', 'public_key'] };
    mockFetchSuccess(schema);
    const result = await validateNodeAgainstSchema({ rcan_node_version: '1.0' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: operator');
    expect(result.errors).toContain('Missing required field: public_key');
  });

  it('returns { valid: false } when manifest is not an object', async () => {
    const schema = { required: ['rcan_node_version'] };
    mockFetchSuccess(schema);
    const result = await validateNodeAgainstSchema(42);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Manifest must be an object');
  });

  it('returns { valid: true, skipped: true } when network is down', async () => {
    mockFetchNetworkError();
    const result = await validateNodeAgainstSchema({ rcan_node_version: '1.0' });
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(true);
  });
});
