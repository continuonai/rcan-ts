/**
 * rcan-ts watermark — AI output watermark tokens (RCAN §16.5).
 *
 * Compute and verify RCAN watermark tokens. Uses HMAC-SHA256 via the shared
 * `hmacSha256Sync` helper (Node crypto with pure-JS fallback).
 *
 * Token format: `rcan-wm-v1:{hex(hmac_sha256(rrn:thought_id:timestamp, key)[:16])}`
 */

import { hmacSha256Sync } from "./crypto.js";

const WATERMARK_VERSION = "rcan-wm-v1";
const WATERMARK_REGEX = /^rcan-wm-v1:[0-9a-f]{32}$/;

/**
 * Compute RCAN AI output watermark token (§16.5).
 *
 * @param rrn - Robot Resource Name (e.g. `"RRN-000000000001"`)
 * @param thoughtId - Unique ID of the Thought that produced the command
 * @param timestamp - ISO-8601 timestamp string
 * @param privateKeyBytes - ML-DSA-65 private key bytes used as HMAC secret
 * @returns Token string, e.g. `"rcan-wm-v1:a3f9c1d2b8e47f20a3f9c1d2b8e47f20"`
 */
export function computeWatermarkToken(
  rrn: string,
  thoughtId: string,
  timestamp: string,
  privateKeyBytes: Uint8Array,
): string {
  const message = `${rrn}:${thoughtId}:${timestamp}`;
  // Encode key bytes as hex string for hmacSha256Sync (which accepts a string secret)
  const keyHex = Buffer.from(privateKeyBytes).toString("hex");
  const hex = hmacSha256Sync(keyHex, message);
  return `${WATERMARK_VERSION}:${hex.slice(0, 32)}`;
}

/**
 * Return true if *token* matches `rcan-wm-v1:{32 hex chars}`.
 */
export function verifyTokenFormat(token: string): boolean {
  return WATERMARK_REGEX.test(token);
}

/**
 * Call the robot's public watermark verify endpoint.
 *
 * @param token - Watermark token to verify
 * @param rrn - Robot Resource Name
 * @param baseUrl - Robot API base URL, e.g. `"http://robot.local:8000"`
 * @returns Audit entry object if found, `null` otherwise
 */
export async function verifyViaApi(
  token: string,
  rrn: string,
  baseUrl: string,
): Promise<Record<string, unknown> | null> {
  const url = new URL("/api/v1/watermark/verify", baseUrl.replace(/\/$/, ""));
  url.searchParams.set("token", token);
  url.searchParams.set("rrn", rrn);

  const resp = await fetch(url.toString());
  if (!resp.ok) return null;

  const data = (await resp.json()) as { audit_entry?: Record<string, unknown> };
  return data.audit_entry ?? null;
}
