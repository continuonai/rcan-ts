/**
 * RCAN CONFIG_UPDATE Wire Protocol — §9.2
 *
 * CONFIG_UPDATE messages MUST carry config_hash, config_version, diff, and
 * rollback. Safety parameter changes MUST have safety_overrides=true AND
 * role: creator JWT.
 */

import { RCANMessage, MessageType } from "./message.js";
import { SPEC_VERSION } from "./version.js";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Compute a simple SHA-256-like hash of the diff for integrity checking. */
async function hashDiff(diff: Record<string, unknown>): Promise<string> {
  const text = JSON.stringify(diff, Object.keys(diff).sort());
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(text);
    const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: simple FNV-1a hex (not cryptographic but OK for tests)
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Build a CONFIG_UPDATE RCANMessage.
 *
 * @param diff     - The configuration delta to apply
 * @param scope    - Authorization scope (e.g. "config")
 * @param rollback - The previous config snapshot for rollback
 * @param target   - Target robot URI
 */
export async function makeConfigUpdate(
  diff: Record<string, unknown>,
  scope: string,
  rollback: Record<string, unknown>,
  target = "rcan://local/config",
  safetyOverrides = false
): Promise<RCANMessage> {
  const configHash = await hashDiff(diff);
  return new RCANMessage({
    rcan: SPEC_VERSION,
    cmd: "CONFIG_UPDATE",
    target,
    params: {
      message_type: MessageType.CONFIG,
      diff,
      rollback,
      scope,
      config_hash: configHash,
      safety_overrides: safetyOverrides,
    },
  });
}

/**
 * Validate a CONFIG_UPDATE message.
 *
 * Checks:
 *  - params.diff is present
 *  - params.config_hash is present
 *  - params.rollback is present
 *  - if safety_overrides=true, scope must be "creator"
 */
export function validateConfigUpdate(
  msg: RCANMessage
): { valid: boolean; reason: string } {
  const p = msg.params;

  if (!p.diff || typeof p.diff !== "object") {
    return { valid: false, reason: "missing required field: params.diff" };
  }
  if (!p.config_hash || typeof p.config_hash !== "string") {
    return { valid: false, reason: "missing required field: params.config_hash" };
  }
  if (!("rollback" in p)) {
    return { valid: false, reason: "missing required field: params.rollback" };
  }
  if (p.safety_overrides === true && p.scope !== "creator") {
    return {
      valid: false,
      reason: "safety_overrides=true requires scope=creator (owner is insufficient)",
    };
  }

  return { valid: true, reason: "ok" };
}
