/**
 * rcan/mcp.ts — MCP integration types for RCAN v2.2 §22
 *
 * Provider-agnostic: LoA is tied to the token, not the model or AI provider.
 */

/** LoA → RCAN command scopes mapping (§22.4) */
export const LOA_TO_SCOPES: Record<number, string[]> = {
  0: ['discover', 'status', 'transparency'],
  1: ['chat', 'control', 'system'],
  3: ['system', 'safety'],
};

/** Required LoA for each MCP tool (§22.3) */
export const TOOL_LOA_REQUIREMENTS: Record<string, number> = {
  // Tier 0 — read
  robot_ping: 0,
  robot_status: 0,
  robot_telemetry: 0,
  fleet_list: 0,
  rrf_lookup: 0,
  compliance_report: 0,
  // Tier 1 — operate
  robot_command: 1,
  harness_get: 1,
  research_run: 1,
  contribute_toggle: 1,
  components_list: 1,
  // Tier 3 — admin
  harness_set: 3,
  system_upgrade: 3,
  loa_enable: 3,
};

/** MCP client entry stored in the RCAN yaml mcp_clients: block */
export interface McpClientConfig {
  name: string;
  token_hash: string; // "sha256:<hex>" — never the raw token
  loa: number;        // 0, 1, or 3
}

/** Full MCP server configuration extracted from the RCAN yaml */
export interface McpServerConfig {
  rrn: string;
  clients: McpClientConfig[];
}

/** Check if a client's LoA satisfies a tool's requirement */
export function clientAllowsTool(client: McpClientConfig, toolName: string): boolean {
  const required = TOOL_LOA_REQUIREMENTS[toolName] ?? 99;
  return client.loa >= required;
}

/** Tool call result shapes */
export interface RobotStatusResult {
  rrn: string;
  status: Record<string, unknown>;
}

export interface FleetListResult {
  fleet: Record<string, unknown>[];
}

export interface RrfLookupResult {
  entity_id: string;
  record: Record<string, unknown>;
}

export interface RobotCommandResult {
  rrn: string;
  instruction: string;
  scope: string;
  result: Record<string, unknown>;
}

export interface ComplianceReportResult {
  rrn: string;
  compliance: Record<string, unknown>;
}
