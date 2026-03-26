// @ts-nocheck — jest.fn() generic typing differs in ESM @jest/globals
import { jest } from "@jest/globals";
/**
 * Tests for NodeClient and RCANNodeError hierarchy (rcan-ts)
 * All HTTP calls are mocked via globalThis.fetch = jest.fn()
 */

import { NodeClient } from "../src/node";
import {
  RCANNodeError,
  RCANNodeNotFoundError,
  RCANNodeSyncError,
  RCANNodeTrustError,
} from "../src/errors";
import type { RCANRegistryNode, RCANResolveResult } from "../src/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROOT_MANIFEST: RCANRegistryNode = {
  rcan_node_version: "1.0.0",
  node_type: "root",
  operator: "ContinuonAI",
  namespace_prefix: "RRN",
  public_key: "ed25519:AAAA1234base64key",
  api_base: "https://rcan.dev",
  spec_version: "1.2",
};

const BD_MANIFEST: RCANRegistryNode = {
  rcan_node_version: "1.0.0",
  node_type: "authoritative",
  operator: "Bangladesh Registry",
  namespace_prefix: "RRN-BD",
  public_key: "ed25519:BBBBbase64bdkey",
  api_base: "https://rcan-bd.example.com",
};

const RESOLVE_RESULT: RCANResolveResult = {
  rrn: "RRN-00000042",
  resolved_by: "https://rcan.dev",
  namespace: "RRN",
  record: { name: "Test Robot", version: "1.0" },
  cache_status: "HIT",
  resolved_at: "2026-03-06T00:00:00Z",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200): ReturnType<typeof jest.fn> {
  const fn = ( jest.fn() as ReturnType<typeof jest.fn>).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: ( jest.fn() as ReturnType<typeof jest.fn>).mockResolvedValue(body as unknown),
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function mockFetchSequence(
  responses: Array<{ body: unknown; status?: number }>
): ReturnType<typeof jest.fn> {
  let call = 0;
  const fn = ( jest.fn() as ReturnType<typeof jest.fn>).mockImplementation(() => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    const status = r.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: ( jest.fn() as ReturnType<typeof jest.fn>).mockResolvedValue(r.body as unknown),
    });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  jest.resetAllMocks();
});

// ── RCANNodeError hierarchy ───────────────────────────────────────────────────

describe("RCANNodeError hierarchy", () => {
  it("RCANNodeError instantiates and passes instanceof checks", () => {
    const err = new RCANNodeError("base error", "https://node.example.com");
    expect(err).toBeInstanceOf(RCANNodeError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("base error");
    expect(err.nodeUrl).toBe("https://node.example.com");
    expect(err.name).toBe("RCANNodeError");
  });

  it("RCANNodeError works without nodeUrl", () => {
    const err = new RCANNodeError("no url");
    expect(err.nodeUrl).toBeUndefined();
  });

  it("RCANNodeNotFoundError instanceof chain", () => {
    const err = new RCANNodeNotFoundError("RRN-00000001", "https://rcan.dev");
    expect(err).toBeInstanceOf(RCANNodeNotFoundError);
    expect(err).toBeInstanceOf(RCANNodeError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("RRN not found in federation: RRN-00000001");
    expect(err.rrn).toBe("RRN-00000001");
    expect(err.nodeUrl).toBe("https://rcan.dev");
    expect(err.name).toBe("RCANNodeNotFoundError");
  });

  it("RCANNodeSyncError instanceof chain with cause", () => {
    const cause = new Error("network timeout");
    const err = new RCANNodeSyncError("sync failed", "https://node.example.com", cause);
    expect(err).toBeInstanceOf(RCANNodeSyncError);
    expect(err).toBeInstanceOf(RCANNodeError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("sync failed");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("RCANNodeSyncError");
  });

  it("RCANNodeSyncError works without cause", () => {
    const err = new RCANNodeSyncError("no cause");
    expect(err.cause).toBeUndefined();
  });

  it("RCANNodeTrustError instanceof chain with reason", () => {
    const err = new RCANNodeTrustError("missing_pubkey", "https://bad-node.example.com");
    expect(err).toBeInstanceOf(RCANNodeTrustError);
    expect(err).toBeInstanceOf(RCANNodeError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Node trust verification failed: missing_pubkey");
    expect(err.reason).toBe("missing_pubkey");
    expect(err.nodeUrl).toBe("https://bad-node.example.com");
    expect(err.name).toBe("RCANNodeTrustError");
  });

  it("RCANNodeTrustError all reason values are accepted", () => {
    const reasons = ["invalid_signature", "expired_cert", "unknown_issuer", "missing_pubkey"] as const;
    for (const reason of reasons) {
      const err = new RCANNodeTrustError(reason);
      expect(err.reason).toBe(reason);
    }
  });
});

// ── verifyNode() ──────────────────────────────────────────────────────────────

describe("NodeClient.verifyNode()", () => {
  const client = new NodeClient();

  it("returns true for a valid manifest", () => {
    expect(client.verifyNode(ROOT_MANIFEST)).toBe(true);
  });

  it("returns false for null", () => {
    expect(client.verifyNode(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(client.verifyNode("not a manifest")).toBe(false);
  });

  it("returns false when rcan_node_version is missing", () => {
    const { rcan_node_version: _, ...bad } = ROOT_MANIFEST;
    expect(client.verifyNode(bad)).toBe(false);
  });

  it("returns false when node_type is invalid", () => {
    expect(client.verifyNode({ ...ROOT_MANIFEST, node_type: "unknown_type" })).toBe(false);
  });

  it("returns false when public_key lacks ed25519: prefix", () => {
    expect(client.verifyNode({ ...ROOT_MANIFEST, public_key: "rsa:somekey" })).toBe(false);
  });

  it("returns false when api_base is not https://", () => {
    expect(client.verifyNode({ ...ROOT_MANIFEST, api_base: "http://insecure.example.com" })).toBe(false);
  });

  it("returns false when operator is missing", () => {
    expect(client.verifyNode({ ...ROOT_MANIFEST, operator: "" })).toBe(false);
  });

  it("returns false when namespace_prefix is missing", () => {
    expect(client.verifyNode({ ...ROOT_MANIFEST, namespace_prefix: "" })).toBe(false);
  });
});

// ── getNodeManifest() ─────────────────────────────────────────────────────────

describe("NodeClient.getNodeManifest()", () => {
  it("fetches /.well-known/rcan-node.json and returns manifest", async () => {
    mockFetch(ROOT_MANIFEST);
    const client = new NodeClient("https://rcan.dev");
    const manifest = await client.getNodeManifest("https://rcan.dev");
    expect(manifest.operator).toBe("ContinuonAI");
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toBe("https://rcan.dev/.well-known/rcan-node.json");
  });

  it("strips trailing slash from nodeUrl", async () => {
    mockFetch(ROOT_MANIFEST);
    const client = new NodeClient();
    await client.getNodeManifest("https://rcan.dev/");
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toBe("https://rcan.dev/.well-known/rcan-node.json");
  });

  it("throws RCANNodeTrustError when manifest fails verifyNode", async () => {
    mockFetch({ rcan_node_version: "1.0", node_type: "root" }); // incomplete
    const client = new NodeClient();
    await expect(client.getNodeManifest("https://rcan.dev")).rejects.toThrow(
      RCANNodeTrustError
    );
  });

  it("throws RCANNodeNotFoundError on 404", async () => {
    mockFetch({ error: "not found" }, 404);
    const client = new NodeClient();
    await expect(client.getNodeManifest("https://rcan.dev")).rejects.toThrow(
      RCANNodeNotFoundError
    );
  });

  it("throws RCANNodeSyncError on network failure", async () => {
    globalThis.fetch = ( jest.fn() as ReturnType<typeof jest.fn>).mockRejectedValue(new Error("ECONNREFUSED") as unknown) as unknown as typeof fetch;
    const client = new NodeClient();
    await expect(client.getNodeManifest("https://unreachable.example.com")).rejects.toThrow(
      RCANNodeSyncError
    );
  });

  it("throws RCANNodeSyncError on non-404 HTTP error", async () => {
    mockFetch({ error: "server error" }, 500);
    const client = new NodeClient();
    await expect(client.getNodeManifest("https://rcan.dev")).rejects.toThrow(
      RCANNodeSyncError
    );
  });
});

// ── discover() ────────────────────────────────────────────────────────────────

describe("NodeClient.discover()", () => {
  it("returns root manifest for a root RRN (RRN-XXXXXXXX)", async () => {
    mockFetch(ROOT_MANIFEST);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-00000042");
    expect(node.namespace_prefix).toBe("RRN");
    expect(node.node_type).toBe("root");
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/.well-known/rcan-node.json");
  });

  it("queries /api/v1/nodes?prefix=BD for a delegated RRN", async () => {
    mockFetch([BD_MANIFEST]);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-BD-00000001");
    expect(node.namespace_prefix).toBe("RRN-BD");
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/nodes");
    expect(url).toContain("prefix=BD");
  });

  it("throws RCANNodeNotFoundError when no nodes found for delegated prefix", async () => {
    mockFetch([]);
    const client = new NodeClient("https://rcan.dev");
    await expect(client.discover("RRN-XX-00000001")).rejects.toThrow(
      RCANNodeNotFoundError
    );
  });

  it("throws RCANNodeNotFoundError for invalid RRN format", async () => {
    const client = new NodeClient("https://rcan.dev");
    await expect(client.discover("INVALID-FORMAT")).rejects.toThrow(
      RCANNodeNotFoundError
    );
  });

  it("handles long prefix (up to 6 chars)", async () => {
    mockFetch([{ ...BD_MANIFEST, namespace_prefix: "RRN-ABCDEF" }]);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-ABCDEF-00000001");
    expect(node.namespace_prefix).toBe("RRN-ABCDEF");
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("prefix=ABCDEF");
  });

  // ── RRN address space expansion (8-16 digits, A-Z0-9 prefix) ───────────────

  it("accepts root RRN with 12 digits (expanded address space)", async () => {
    mockFetch(ROOT_MANIFEST);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-000000000001");
    expect(node.node_type).toBe("root");
  });

  it("accepts delegated RRN with 12-digit serial", async () => {
    mockFetch([BD_MANIFEST]);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-BD-000000000001");
    expect(node.namespace_prefix).toBe("RRN-BD");
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("prefix=BD");
  });

  it("accepts alphanumeric prefix (RRN-BD1-...)", async () => {
    mockFetch([{ ...BD_MANIFEST, namespace_prefix: "RRN-BD1" }]);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-BD1-000000000001");
    expect(node.namespace_prefix).toBe("RRN-BD1");
  });

  it("still accepts old 8-digit root RRN (backward compat)", async () => {
    mockFetch(ROOT_MANIFEST);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-12345678");
    expect(node.node_type).toBe("root");
  });

  it("still accepts old 8-digit delegated RRN (backward compat)", async () => {
    mockFetch([BD_MANIFEST]);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-BD-12345678");
    expect(node.namespace_prefix).toBe("RRN-BD");
  });

  it("rejects delegated RRN with 7-digit serial (too short)", async () => {
    const client = new NodeClient("https://rcan.dev");
    await expect(client.discover("RRN-BD-1234567")).rejects.toThrow(RCANNodeNotFoundError);
  });
});

// ── resolve() ─────────────────────────────────────────────────────────────────

describe("NodeClient.resolve()", () => {
  it("returns result directly when root /api/v1/resolve/{rrn} succeeds", async () => {
    mockFetch(RESOLVE_RESULT);
    const client = new NodeClient("https://rcan.dev");
    const result = await client.resolve("RRN-00000042");
    expect(result.rrn).toBe("RRN-00000042");
    expect(result.cache_status).toBe("HIT");
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/resolve/RRN-00000042");
  });

  it("falls back to authoritative node on 404 from root", async () => {
    const fallbackResult: RCANResolveResult = {
      ...RESOLVE_RESULT,
      rrn: "RRN-BD-00000001",
      resolved_by: "https://rcan-bd.example.com",
      namespace: "RRN-BD",
    };

    mockFetchSequence([
      { body: { error: "not found" }, status: 404 },     // root resolve
      { body: [BD_MANIFEST] },                            // listNodes
      { body: fallbackResult },                           // authoritative robots/
    ]);

    const client = new NodeClient("https://rcan.dev");
    const result = await client.resolve("RRN-BD-00000001");
    expect(result.namespace).toBe("RRN-BD");
    expect(result.resolved_by).toBe("https://rcan-bd.example.com");
  });

  it("throws RCANNodeNotFoundError when authoritative returns 404", async () => {
    mockFetchSequence([
      { body: { error: "not found" }, status: 404 },  // root resolve
      { body: [BD_MANIFEST] },                         // listNodes
      { body: { error: "not found" }, status: 404 },  // authoritative
    ]);

    const client = new NodeClient("https://rcan.dev");
    await expect(client.resolve("RRN-BD-00000001")).rejects.toThrow(
      RCANNodeNotFoundError
    );
  });

  it("throws RCANNodeSyncError on non-404 HTTP error from root", async () => {
    mockFetch({ error: "server error" }, 500);
    const client = new NodeClient("https://rcan.dev");
    await expect(client.resolve("RRN-00000042")).rejects.toThrow(
      RCANNodeSyncError
    );
  });

  it("throws RCANNodeSyncError on network failure", async () => {
    globalThis.fetch = ( jest.fn() as ReturnType<typeof jest.fn>).mockRejectedValue(new Error("ECONNREFUSED") as unknown) as unknown as typeof fetch;
    const client = new NodeClient("https://rcan.dev");
    await expect(client.resolve("RRN-00000042")).rejects.toThrow(
      RCANNodeSyncError
    );
  });
});

// ── parseRRNNamespace edge cases (tested via discover) ────────────────────────

describe("parseRRNNamespace edge cases (via discover)", () => {
  it("rejects lowercase RRN prefix", async () => {
    const client = new NodeClient("https://rcan.dev");
    // "RRN-bd-00000001" — lowercase prefix not matched by [A-Z]{2,6}
    await expect(client.discover("RRN-bd-00000001")).rejects.toThrow(RCANNodeNotFoundError);
  });

  it("rejects prefix shorter than 2 chars", async () => {
    const client = new NodeClient("https://rcan.dev");
    await expect(client.discover("RRN-B-00000001")).rejects.toThrow(RCANNodeNotFoundError);
  });

  it("rejects prefix longer than 8 chars", async () => {
    const client = new NodeClient("https://rcan.dev");
    await expect(client.discover("RRN-ABCDEFGHI-00000001")).rejects.toThrow(RCANNodeNotFoundError);
  });

  it("rejects serial with wrong digit count", async () => {
    const client = new NodeClient("https://rcan.dev");
    // 7 digits — too short (min is 8)
    await expect(client.discover("RRN-1234567")).rejects.toThrow(RCANNodeNotFoundError);
    // 17 digits — too long (max is 16)
    await expect(client.discover("RRN-12345678901234567")).rejects.toThrow(RCANNodeNotFoundError);
  });

  it("accepts root RRN with exactly 8 digits", async () => {
    mockFetch(ROOT_MANIFEST);
    const client = new NodeClient("https://rcan.dev");
    const node = await client.discover("RRN-00000000");
    expect(node.node_type).toBe("root");
  });
});
