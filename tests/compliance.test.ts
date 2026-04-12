import {
  FriaSigningKey,
  FriaConformance,
  FriaDocument,
  SafetyBenchmark,
  InstructionsForUse,
  PostMarketIncident,
  EuRegisterEntry,
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

describe('SafetyBenchmark', () => {
  test('holds all required fields', () => {
    const sb: SafetyBenchmark = {
      protocol: 'rcan-sbp-v1',
      score: 0.98,
      pass_count: 49,
      fail_count: 1,
      run_at: '2026-04-01T10:00:00Z',
      rrn: 'RRN-000000000001',
    };
    expect(sb.protocol).toBe('rcan-sbp-v1');
    expect(sb.pass_count).toBe(49);
    expect(sb.fail_count).toBe(1);
  });
});

describe('InstructionsForUse', () => {
  test('holds all required fields with contraindications array', () => {
    const ifu: InstructionsForUse = {
      rrn: 'RRN-000000000001',
      robot_name: 'opencastor-rpi5',
      intended_use: 'logistics',
      operating_environment: 'indoor',
      contraindications: ['wet_floors', 'stairs'],
      version: '1.0',
      issued_at: '2026-04-01T00:00:00Z',
    };
    expect(ifu.contraindications).toEqual(['wet_floors', 'stairs']);
    expect(ifu.contraindications.length).toBe(2);
  });
});

describe('PostMarketIncident', () => {
  test('severity accepts valid values', () => {
    const severities: PostMarketIncident['severity'][] = ['low', 'medium', 'high', 'critical'];
    for (const severity of severities) {
      const inc: PostMarketIncident = {
        rrn: 'RRN-000000000001',
        incident_id: 'INC-001',
        severity,
        description: 'test',
        occurred_at: '2026-04-01T00:00:00Z',
        reported_at: '2026-04-02T00:00:00Z',
        status: 'open',
      };
      expect(inc.severity).toBe(severity);
    }
  });

  test('status accepts valid values', () => {
    const statuses: PostMarketIncident['status'][] = ['open', 'under_review', 'resolved'];
    for (const status of statuses) {
      const inc: PostMarketIncident = {
        rrn: 'RRN-000000000001',
        incident_id: 'INC-002',
        severity: 'low',
        description: 'test',
        occurred_at: '2026-04-01T00:00:00Z',
        reported_at: '2026-04-02T00:00:00Z',
        status,
      };
      expect(inc.status).toBe(status);
    }
  });
});

describe('EuRegisterEntry', () => {
  test('compliance_status accepts valid values', () => {
    const statuses: EuRegisterEntry['compliance_status'][] = [
      'compliant', 'provisional', 'non_compliant', 'no_fria',
    ];
    for (const compliance_status of statuses) {
      const entry: EuRegisterEntry = {
        rrn: 'RRN-000000000001',
        robot_name: 'opencastor',
        manufacturer: 'craigm26',
        annex_iii_basis: 'high-risk',
        fria_submitted_at: null,
        compliance_status,
        registered_at: '2026-04-01T00:00:00Z',
      };
      expect(entry.compliance_status).toBe(compliance_status);
    }
  });

  test('fria_submitted_at can be a date string', () => {
    const entry: EuRegisterEntry = {
      rrn: 'RRN-000000000001',
      robot_name: 'opencastor',
      manufacturer: 'craigm26',
      annex_iii_basis: 'high-risk',
      fria_submitted_at: '2026-04-10T12:00:00Z',
      compliance_status: 'compliant',
      registered_at: '2026-04-01T00:00:00Z',
    };
    expect(entry.fria_submitted_at).toBe('2026-04-10T12:00:00Z');
  });
});
