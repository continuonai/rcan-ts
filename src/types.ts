/**
 * rcan-ts types — TypeScript interfaces for RCAN config and message shapes.
 *
 * These provide parity with the rcan-py TypedDicts and enable
 * static type checking with tsc/ts-jest/pyright.
 */

export interface RCANMetadata {
  manufacturer?: string;
  model?: string;
  version?: string;
  device_id?: string;
  robot_name?: string; // backwards-compat alias
  rrn?: string; // Robot Registry Number from rcan.dev
  rcan_uri?: string;
}

export interface RCANAgentConfig {
  provider?: string;
  model?: string;
  temperature?: number;
  confidence_gates?: Array<{ threshold?: number; [key: string]: unknown }>;
  hitl_gates?: Array<Record<string, unknown>>;
  commitment_chain?: { enabled?: boolean; [key: string]: unknown };
  signing?: { enabled?: boolean; [key: string]: unknown };
}

export interface RCANConfig {
  rcan_version?: string;
  metadata?: RCANMetadata;
  agent?: RCANAgentConfig;
  channels?: Record<string, unknown>;
  rcan_protocol?: {
    jwt_auth?: { enabled?: boolean };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RCANMessageEnvelope {
  cmd: string;
  target: string;
  rcan_version?: string;
  confidence?: number;
  timestamp_ns?: number;
  params?: Record<string, unknown>;
  signature?: string;
  [key: string]: unknown;
}

// ── Registry Node / Federation types ─────────────────────────────────────────

export interface RCANRegistryNode {
  rcan_node_version: string;
  node_type: "root" | "authoritative" | "resolver" | "cache";
  operator: string;
  namespace_prefix: string; // "RRN" for root, "RRN-BD" for delegated; prefix is [A-Z0-9]{2,8}
  public_key: string;       // "ed25519:..."
  api_base: string;
  registry_ui?: string;
  spec_version?: string;
  capabilities?: string[];
  sync_endpoint?: string;
  last_sync?: string;
  ttl_seconds?: number;
  contact?: string;
  governance?: string;
  federation_protocol?: string;
}

export interface RCANResolveResult {
  rrn: string;
  resolved_by: string;
  namespace: string;
  record: Record<string, unknown>;
  cache_status: "HIT" | "MISS" | "STALE";
  resolved_at: string;
}
