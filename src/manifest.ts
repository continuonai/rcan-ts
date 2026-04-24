/**
 * rcan-ts manifest — ROBOT.md cross-link.
 *
 * Extract RCAN-relevant identity + network fields from a parsed ROBOT.md
 * frontmatter object. Keeps rcan-ts dependency-free — callers bring their
 * own YAML parser (js-yaml, yaml, or similar).
 *
 * @example
 *   import fs from "node:fs";
 *   import yaml from "js-yaml";
 *   import { fromManifest } from "rcan-ts";
 *
 *   const raw = fs.readFileSync("./ROBOT.md", "utf-8");
 *   const body = raw.split("---")[1]; // between the first two fences
 *   const fm = yaml.load(body) as Record<string, unknown>;
 *   const info = fromManifest(fm);
 *
 *   console.log(info.rrn);            // "RRN-000000000003"
 *   console.log(info.endpoint);       // "https://rcan.dev"
 *   console.log(info.publicResolver); // "https://rcan.dev/r/RRN-000000000003"
 */

/**
 * A single agent runtime declaration inside a ROBOT.md `agent.runtimes[]` block.
 *
 * Mirrors rcan-spec v3.2 §8.6. Required fields are `id` and `harness`; everything
 * else is runtime-interpreted pass-through. Unknown fields are allowed.
 *
 * @see https://rcan.dev/spec/section-8/#multi-runtime
 */
export interface AgentRuntime {
  /** Runtime identifier (e.g. "robot-md", "opencastor"). Required. */
  id: string;
  /** Runtime-specific harness name (e.g. "claude-code", "castor-default"). Required. */
  harness: string;
  /** Exactly one entry may be default when runtimes[] has 2+ entries. */
  default?: boolean;
  /** Runtime-interpreted. Shape varies by harness. */
  models?: Array<Record<string, unknown>>;
  /** Runtime-specific pass-through fields are allowed. */
  [key: string]: unknown;
}

/**
 * The `agent:` block in ROBOT.md frontmatter once normalized to v3.2 shape.
 * A list of one or more `AgentRuntime` entries. `null` if the manifest has no
 * agent block.
 *
 * @see rcan-py `agent_runtimes: list[dict] | None`
 */
export type AgentRuntimesBlock = AgentRuntime[] | null;

export interface ManifestInfo {
  /** RRN if the robot is registered, else null. */
  rrn: string | null;
  /** `rcan://...` canonical URI from metadata.rcan_uri. */
  rcanUri: string | null;
  /** Registry endpoint (network.rrf_endpoint). */
  endpoint: string | null;
  /** Signing algorithm (network.signing_alg). */
  signingAlg: string | null;
  /** Derived: https://rcan.dev/r/<rrn> when rrn is set. */
  publicResolver: string | null;
  /** metadata.robot_name. */
  robotName: string | null;
  /** rcan_version (top-level). */
  rcanVersion: string | null;
  /** Normalized agent.runtimes[] per rcan-spec v3.2 §8.6. Null if no agent block. */
  agentRuntimes: AgentRuntime[] | null;
  /** The original frontmatter object — caller keeps reference for deeper fields. */
  frontmatter: Record<string, unknown>;
}

/**
 * Normalize the `agent` frontmatter block into the v3.2 `runtimes[]` shape.
 *
 * - `null`/`undefined`/empty object → `null`
 * - Structured `runtimes[]` → returned as-is
 * - Flat form (`provider`/`model` without `runtimes`) → wrapped in a
 *   single-entry `runtimes[]` with `default: true`. A `console.warn`
 *   deprecation notice is emitted; flat form is scheduled for removal in
 *   rcan-spec v4.0.
 * - Both flat keys AND `runtimes[]` present → throws `Error` (ambiguous).
 *
 * @see rcan-spec v3.2 §8.6 Multi-Runtime Agent Declaration
 * @see rcan-py `rcan.manifest._normalize_agent` (parity)
 */
export function normalizeAgent(
  agent: Record<string, unknown> | null | undefined,
): AgentRuntime[] | null {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
    return null;
  }
  if (Object.keys(agent).length === 0) {
    return null;
  }

  const runtimes = (agent as Record<string, unknown>).runtimes;
  const hasFlat = "provider" in agent || "model" in agent;

  if (runtimes !== undefined && hasFlat) {
    throw new Error(
      "agent block declares both flat 'provider'/'model' and runtimes[] — " +
        "use one or the other. Flat form is deprecated; prefer runtimes[].",
    );
  }

  if (runtimes !== undefined) {
    if (!Array.isArray(runtimes)) {
      throw new Error("agent.runtimes must be an array");
    }
    return runtimes as AgentRuntime[];
  }

  if (hasFlat) {
    console.warn(
      "[rcan-ts] flat agent.provider/agent.model form is deprecated in " +
        "rcan-spec v3.2; use agent.runtimes[] instead. Removal scheduled " +
        "for v4.0.",
    );
    const entry: AgentRuntime = {
      id: "robot-md",
      harness: "default",
      default: true,
      models: [
        {
          provider: agent.provider,
          model: agent.model,
          role: "primary",
        },
      ],
    };
    for (const passthrough of [
      "latency_budget_ms",
      "safety_stop",
      "vision_enabled",
    ]) {
      if (passthrough in agent) {
        entry[passthrough] = (agent as Record<string, unknown>)[passthrough];
      }
    }
    return [entry];
  }

  return null;
}

/**
 * Validate an `agent.runtimes[]` list per rcan-spec v3.2 §8.6 rules.
 *
 * @returns list of human-readable error strings. Empty array means valid.
 *
 * Rules:
 * - Every entry MUST have non-empty string `id` and `harness`.
 * - If `runtimes[]` has two or more entries, exactly one MUST be `default: true`.
 * - Unknown per-entry fields are allowed (runtime-specific pass-through).
 *
 * @see rcan-py `rcan.manifest._validate_agent_runtimes` (parity)
 */
export function validateAgentRuntimes(runtimes: AgentRuntime[]): string[] {
  const errors: string[] = [];
  let defaults = 0;
  for (let i = 0; i < runtimes.length; i++) {
    const entry = runtimes[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`runtimes[${i}] must be an object`);
      continue;
    }
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      errors.push(`runtimes[${i}] missing required field: id`);
    }
    if (typeof entry.harness !== "string" || entry.harness.length === 0) {
      errors.push(`runtimes[${i}] missing required field: harness`);
    }
    if (entry.default === true) {
      defaults += 1;
    }
  }

  if (runtimes.length >= 2 && defaults !== 1) {
    errors.push(
      `runtimes[] with ${runtimes.length} entries must have exactly one default: true ` +
        `(found ${defaults})`,
    );
  }
  return errors;
}

/**
 * Extract RCAN-relevant fields from a parsed ROBOT.md frontmatter object.
 *
 * @param frontmatter - The parsed YAML frontmatter dict (from js-yaml or similar).
 * @returns A {@link ManifestInfo} with string fields populated where present, null otherwise.
 * @throws {TypeError} if `frontmatter` is not a plain object.
 */
export function fromManifest(
  frontmatter: Record<string, unknown>,
): ManifestInfo {
  if (
    !frontmatter ||
    typeof frontmatter !== "object" ||
    Array.isArray(frontmatter)
  ) {
    throw new TypeError(
      "fromManifest: expected a parsed frontmatter object, got " +
        typeof frontmatter,
    );
  }

  const metadata = (frontmatter.metadata ?? {}) as Record<string, unknown>;
  const network = (frontmatter.network ?? {}) as Record<string, unknown>;

  const rrn = typeof metadata.rrn === "string" && metadata.rrn ? metadata.rrn : null;
  const rcanUri =
    typeof metadata.rcan_uri === "string" && metadata.rcan_uri
      ? metadata.rcan_uri
      : null;
  const endpoint =
    typeof network.rrf_endpoint === "string" && network.rrf_endpoint
      ? network.rrf_endpoint
      : null;
  const signingAlg =
    typeof network.signing_alg === "string" && network.signing_alg
      ? network.signing_alg
      : null;
  const robotName =
    typeof metadata.robot_name === "string" && metadata.robot_name
      ? metadata.robot_name
      : null;

  let rcanVersion: string | null = null;
  if (frontmatter.rcan_version !== undefined && frontmatter.rcan_version !== null) {
    rcanVersion = String(frontmatter.rcan_version);
  }

  const agentRuntimes = normalizeAgent(
    frontmatter.agent as Record<string, unknown> | null | undefined,
  );
  if (agentRuntimes !== null) {
    const validationErrors = validateAgentRuntimes(agentRuntimes);
    if (validationErrors.length > 0) {
      throw new Error(
        "agent.runtimes[] validation failed: " + validationErrors.join("; "),
      );
    }
  }

  const publicResolver = rrn ? `https://rcan.dev/r/${rrn}` : null;

  return {
    rrn,
    rcanUri,
    endpoint,
    signingAlg,
    publicResolver,
    robotName,
    rcanVersion,
    agentRuntimes,
    frontmatter,
  };
}
