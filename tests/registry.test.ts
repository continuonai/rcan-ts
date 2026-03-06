/**
 * Tests for RegistryClient (rcan-ts)
 * All HTTP calls are mocked via global.fetch = jest.fn()
 */

import { RegistryClient, Robot, RegistrationResult, ListResult } from "../src/registry";
import { RCANRegistryError } from "../src/errors";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROBOT: Robot = {
  rrn: "RRN-00000042",
  manufacturer: "acme",
  model: "arm",
  version: "v2",
  device_id: "unit-001",
  registered_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  verification_tier: "community",
  status: "active",
};

function mockFetch(body: unknown, status = 200): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  jest.resetAllMocks();
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe("RegistryClient constructor", () => {
  it("uses default base URL and timeout", () => {
    const client = new RegistryClient();
    expect(client).toBeDefined();
  });

  it("accepts custom options", () => {
    const client = new RegistryClient({
      baseUrl: "https://custom.example.com",
      apiKey: "rcan_test",
      timeout: 5000,
    });
    expect(client).toBeDefined();
  });
});

// ── register() ────────────────────────────────────────────────────────────────

describe("RegistryClient.register()", () => {
  it("POSTs to /api/v1/robots and returns rrn + api_key", async () => {
    const result: RegistrationResult = { rrn: "RRN-00000042", api_key: "rcan_abc123" };
    const fn = mockFetch(result, 201);
    fn.mockResolvedValue({ ok: true, status: 201, json: jest.fn().mockResolvedValue(result) });
    global.fetch = fn as unknown as typeof fetch;

    const client = new RegistryClient();
    const res = await client.register({
      manufacturer: "acme",
      model: "arm",
      version: "v2",
      device_id: "unit-001",
    });
    expect(res.rrn).toBe("RRN-00000042");
    expect(res.api_key).toBe("rcan_abc123");
    expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe("POST");
  });

  it("throws RCANRegistryError on 400", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ error: "missing manufacturer" }),
    }) as unknown as typeof fetch;

    const client = new RegistryClient();
    await expect(
      client.register({ manufacturer: "", model: "arm", version: "v1", device_id: "x" })
    ).rejects.toThrow(RCANRegistryError);
  });
});

// ── get() ─────────────────────────────────────────────────────────────────────

describe("RegistryClient.get()", () => {
  it("GETs /api/v1/robots/:rrn", async () => {
    mockFetch(ROBOT);
    const client = new RegistryClient();
    const robot = await client.get("RRN-00000042");
    expect(robot.rrn).toBe("RRN-00000042");
    expect(robot.manufacturer).toBe("acme");
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/robots/RRN-00000042");
  });

  it("throws on 404", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn().mockResolvedValue({ error: "not found" }),
    }) as unknown as typeof fetch;

    const client = new RegistryClient();
    await expect(client.get("RRN-99999999")).rejects.toThrow(RCANRegistryError);
  });
});

// ── list() ────────────────────────────────────────────────────────────────────

describe("RegistryClient.list()", () => {
  it("returns robots and pagination info", async () => {
    const result: ListResult = {
      robots: [ROBOT],
      total: 1,
      limit: 20,
      offset: 0,
    };
    mockFetch(result);
    const client = new RegistryClient();
    const res = await client.list();
    expect(res.robots).toHaveLength(1);
    expect(res.total).toBe(1);
    expect(res.limit).toBe(20);
    expect(res.offset).toBe(0);
  });

  it("passes limit/offset/tier as query params", async () => {
    mockFetch({ robots: [], total: 0, limit: 10, offset: 5 });
    const client = new RegistryClient();
    await client.list({ limit: 10, offset: 5, tier: "verified" });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
    expect(url).toContain("tier=verified");
  });
});

// ── patch() ───────────────────────────────────────────────────────────────────

describe("RegistryClient.patch()", () => {
  it("sends PATCH with Authorization header", async () => {
    mockFetch({ ...ROBOT, description: "updated" });
    const client = new RegistryClient({ apiKey: "rcan_test" });
    const robot = await client.patch("RRN-00000042", { description: "updated" });
    expect(robot.description).toBe("updated");
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[1].method).toBe("PATCH");
    expect(call[1].headers["Authorization"]).toBe("Bearer rcan_test");
  });

  it("throws RCANRegistryError without apiKey", async () => {
    const client = new RegistryClient();
    await expect(
      client.patch("RRN-00000042", { description: "x" })
    ).rejects.toThrow(RCANRegistryError);
  });
});

// ── delete() ──────────────────────────────────────────────────────────────────

describe("RegistryClient.delete()", () => {
  it("sends DELETE with Authorization header", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: jest.fn().mockResolvedValue({}),
    }) as unknown as typeof fetch;

    const client = new RegistryClient({ apiKey: "rcan_test" });
    await expect(client.delete("RRN-00000042")).resolves.toBeUndefined();
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[1].method).toBe("DELETE");
    expect(call[1].headers["Authorization"]).toBe("Bearer rcan_test");
  });

  it("throws RCANRegistryError without apiKey", async () => {
    const client = new RegistryClient();
    await expect(client.delete("RRN-00000042")).rejects.toThrow(RCANRegistryError);
  });
});

// ── search() ──────────────────────────────────────────────────────────────────

describe("RegistryClient.search()", () => {
  it("returns array of robots", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue([ROBOT]),
    }) as unknown as typeof fetch;

    const client = new RegistryClient();
    const results = await client.search({ manufacturer: "acme" });
    expect(Array.isArray(results)).toBe(true);
    expect(results[0].manufacturer).toBe("acme");
  });

  it("handles {results:[...]} response shape", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ results: [ROBOT] }),
    }) as unknown as typeof fetch;

    const client = new RegistryClient();
    const results = await client.search({ model: "arm" });
    expect(results).toHaveLength(1);
  });

  it("passes query params correctly", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue([]),
    }) as unknown as typeof fetch;

    const client = new RegistryClient();
    await client.search({ q: "arm", tier: "verified" });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("q=arm");
    expect(url).toContain("tier=verified");
  });

  it("falls back to list endpoint when search returns 404", async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // search endpoint 404
        return Promise.resolve({
          ok: false,
          status: 404,
          json: jest.fn().mockResolvedValue({ error: "not found" }),
        });
      }
      // list endpoint fallback
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ robots: [ROBOT], total: 1, limit: 20, offset: 0 }),
      });
    }) as unknown as typeof fetch;

    const client = new RegistryClient();
    const results = await client.search({ manufacturer: "acme" });
    expect(results).toHaveLength(1);
  });
});
