/**
 * rcan-ts — NodeClient
 * Federation-aware node discovery and RRN resolution.
 *
 * Zero runtime dependencies — uses globalThis.fetch (Node 18+, browsers, CF Workers).
 *
 * @see https://rcan.dev/spec#section-federation
 */

import {
  RCANNodeNotFoundError,
  RCANNodeSyncError,
  RCANNodeTrustError,
} from "./errors.js";
import type { RCANRegistryNode, RCANResolveResult } from "./types.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOT_NODE_URL = "https://rcan.dev";
const NODE_MANIFEST_PATH = "/.well-known/rcan-node.json";

const VALID_NODE_TYPES = new Set<string>([
  "root",
  "authoritative",
  "resolver",
  "cache",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse an RRN string into its namespace components.
 *
 * @example
 *   parseRRNNamespace("RRN-BD-00000001")  → { type: "delegated", prefix: "BD", serial: "00000001" }
 *   parseRRNNamespace("RRN-00000042")     → { type: "root", serial: "00000042" }
 *   parseRRNNamespace("INVALID")          → null
 */
function parseRRNNamespace(
  rrn: string
):
  | { type: "root"; serial: string }
  | { type: "delegated"; prefix: string; serial: string }
  | null {
  const delegated = rrn.match(/^RRN-([A-Z0-9]{2,8})-(\d{8,16})$/);
  if (delegated) return { type: "delegated", prefix: delegated[1], serial: delegated[2] };
  const root = rrn.match(/^RRN-(\d{8,16})$/);
  if (root) return { type: "root", serial: root[1] };
  return null;
}

// ── NodeClient ────────────────────────────────────────────────────────────────

export class NodeClient {
  private readonly rootUrl: string;
  private readonly timeoutMs: number;

  constructor(rootUrl = ROOT_NODE_URL, timeoutMs = 10_000) {
    this.rootUrl = rootUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _fetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await globalThis.fetch(url, { signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new RCANNodeSyncError(`Request timed out: ${url}`, url, err);
      }
      throw new RCANNodeSyncError(
        `Network error fetching ${url}: ${(err as Error).message}`,
        url,
        err instanceof Error ? err : undefined
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Fetch /.well-known/rcan-node.json from any node URL.
   * Throws RCANNodeTrustError if the manifest is malformed.
   * Throws RCANNodeSyncError on network failure.
   */
  async getNodeManifest(nodeUrl: string): Promise<RCANRegistryNode> {
    const url = `${nodeUrl.replace(/\/$/, "")}${NODE_MANIFEST_PATH}`;
    const resp = await this._fetch(url);

    if (!resp.ok) {
      if (resp.status === 404) {
        throw new RCANNodeNotFoundError(url, nodeUrl);
      }
      throw new RCANNodeSyncError(
        `Failed to fetch node manifest from ${nodeUrl}: HTTP ${resp.status}`,
        nodeUrl
      );
    }

    let data: unknown;
    try {
      data = await resp.json();
    } catch (err) {
      throw new RCANNodeSyncError(
        `Invalid JSON in node manifest from ${nodeUrl}`,
        nodeUrl,
        err instanceof Error ? err : undefined
      );
    }

    if (!this.verifyNode(data)) {
      throw new RCANNodeTrustError("missing_pubkey", nodeUrl);
    }
    return data;
  }

  /**
   * Get list of known registry nodes from root /api/v1/nodes.
   * Optionally filter by namespace prefix (e.g. "BD").
   */
  async listNodes(prefix?: string): Promise<RCANRegistryNode[]> {
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    const url = `${this.rootUrl}/api/v1/nodes${qs}`;
    const resp = await this._fetch(url);

    if (!resp.ok) {
      throw new RCANNodeSyncError(
        `Failed to list nodes from ${url}: HTTP ${resp.status}`,
        url
      );
    }

    let data: unknown;
    try {
      data = await resp.json();
    } catch (err) {
      throw new RCANNodeSyncError(
        `Invalid JSON in nodes list from ${url}`,
        url,
        err instanceof Error ? err : undefined
      );
    }

    if (Array.isArray(data)) return data as RCANRegistryNode[];
    if (data && typeof data === "object" && "nodes" in data) {
      return (data as { nodes: RCANRegistryNode[] }).nodes;
    }
    return [];
  }

  /**
   * Find the authoritative node for an RRN.
   * - Delegated RRN (RRN-BD-00000001): GET /api/v1/nodes?prefix=BD, return first match.
   * - Root RRN (RRN-00000042): return root node manifest.
   * - Unknown format: throws RCANNodeNotFoundError.
   */
  async discover(rrn: string): Promise<RCANRegistryNode> {
    const parsed = parseRRNNamespace(rrn);

    if (!parsed) {
      throw new RCANNodeNotFoundError(rrn, this.rootUrl);
    }

    if (parsed.type === "root") {
      return this.getNodeManifest(this.rootUrl);
    }

    // delegated
    const nodes = await this.listNodes(parsed.prefix);
    if (nodes.length === 0) {
      throw new RCANNodeNotFoundError(rrn, this.rootUrl);
    }
    return nodes[0];
  }

  /**
   * Resolve an RRN across the federation.
   * First tries {rootUrl}/api/v1/resolve/{rrn}.
   * On 404, discovers the authoritative node and tries {node.api_base}/robots/{rrn}.
   */
  async resolve(rrn: string): Promise<RCANResolveResult> {
    const primaryUrl = `${this.rootUrl}/api/v1/resolve/${encodeURIComponent(rrn)}`;

    let resp: Response;
    try {
      resp = await this._fetch(primaryUrl);
    } catch (err) {
      // Network-level failure; bubble up as-is
      throw err;
    }

    if (resp.ok) {
      try {
        return (await resp.json()) as RCANResolveResult;
      } catch (err) {
        throw new RCANNodeSyncError(
          `Invalid JSON in resolve response for ${rrn}`,
          this.rootUrl,
          err instanceof Error ? err : undefined
        );
      }
    }

    if (resp.status !== 404) {
      throw new RCANNodeSyncError(
        `Unexpected HTTP ${resp.status} resolving ${rrn}`,
        this.rootUrl
      );
    }

    // 404 → discover authoritative node and try its /robots/{rrn} endpoint
    const node = await this.discover(rrn);
    const fallbackUrl = `${node.api_base.replace(/\/$/, "")}/robots/${encodeURIComponent(rrn)}`;
    const fallbackResp = await this._fetch(fallbackUrl);

    if (!fallbackResp.ok) {
      if (fallbackResp.status === 404) {
        throw new RCANNodeNotFoundError(rrn, node.api_base);
      }
      throw new RCANNodeSyncError(
        `HTTP ${fallbackResp.status} from authoritative node for ${rrn}`,
        node.api_base
      );
    }

    try {
      return (await fallbackResp.json()) as RCANResolveResult;
    } catch (err) {
      throw new RCANNodeSyncError(
        `Invalid JSON in fallback resolve response for ${rrn}`,
        node.api_base,
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Verify a node manifest is well-formed.
   * Checks required fields, ed25519: public_key prefix, valid node_type, https:// api_base.
   */
  verifyNode(manifest: unknown): manifest is RCANRegistryNode {
    if (!manifest || typeof manifest !== "object") return false;
    const m = manifest as Record<string, unknown>;

    if (typeof m.rcan_node_version !== "string" || !m.rcan_node_version) return false;
    if (typeof m.node_type !== "string" || !VALID_NODE_TYPES.has(m.node_type as string)) return false;
    if (typeof m.operator !== "string" || !m.operator) return false;
    if (typeof m.namespace_prefix !== "string" || !m.namespace_prefix) return false;
    if (typeof m.public_key !== "string" || !m.public_key.startsWith("ed25519:")) return false;
    if (typeof m.api_base !== "string" || !m.api_base.startsWith("https://")) return false;

    return true;
  }
}
