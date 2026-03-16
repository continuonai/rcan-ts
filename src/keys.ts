/**
 * RCAN Key Rotation — §8.6
 *
 * Operators SHOULD maintain a JWKS at /.well-known/rcan-keys.json.
 * Keys MUST include an exp field (max 365-day validity).
 * Rotation: add new key, set exp on old key.
 */

import { RCANMessage, MessageType } from "./message.js";
import { SPEC_VERSION } from "./version.js";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface JWKEntry {
  kid: string;
  alg: string;
  use: string;
  key_ops?: string[];
  /** Public key material (base64url) */
  x?: string;
  /** Unix timestamp — when this key expires */
  exp?: number;
  /** Unix timestamp — when this key was revoked (optional) */
  revoked_at?: number;
}

export interface JWKSDocument {
  keys: JWKEntry[];
}

/**
 * KeyStore — in-memory JWKS with rotation support.
 */
export class KeyStore {
  private _keys: JWKEntry[] = [];

  /** Add a key to the store */
  addKey(entry: JWKEntry): void {
    this._keys.push(entry);
  }

  /** Get the current JWKS document (all non-revoked keys) */
  getJWKS(): JWKSDocument {
    return { keys: [...this._keys] };
  }

  /** Find a key by kid */
  findKey(kid: string): JWKEntry | undefined {
    return this._keys.find((k) => k.kid === kid);
  }

  /** Check if a key is valid (not expired, not revoked) */
  isKeyValid(kid: string, nowMs?: number): boolean {
    const entry = this.findKey(kid);
    if (!entry) return false;
    const now = (nowMs ?? Date.now()) / 1000;
    if (entry.revoked_at !== undefined && entry.revoked_at <= now) return false;
    if (entry.exp !== undefined && entry.exp < now) return false;
    return true;
  }

  /** Mark a key as expired (rotate out) */
  expireKey(kid: string, expiresAt?: number): void {
    const entry = this.findKey(kid);
    if (entry) {
      entry.exp = expiresAt ?? Math.floor(Date.now() / 1000);
    }
  }

  /** Revoke a key immediately */
  revokeKey(kid: string): void {
    const entry = this.findKey(kid);
    if (entry) {
      entry.revoked_at = Math.floor(Date.now() / 1000);
    }
  }

  /** All valid keys (not expired, not revoked) */
  validKeys(nowMs?: number): JWKEntry[] {
    return this._keys.filter((k) => this.isKeyValid(k.kid, nowMs));
  }
}

/**
 * Build a key-rotation RCAN message.
 *
 * @param newPublicKey    - Base64url-encoded new Ed25519 public key
 * @param oldKeyId        - kid of the key being rotated out
 * @param overlapSeconds  - How long old key remains valid (default: 120)
 * @param target          - Target robot URI
 */
export function makeKeyRotationMessage(
  newPublicKey: string,
  oldKeyId: string,
  overlapSeconds = 120,
  target = "rcan://local/keys"
): RCANMessage {
  const newKid = generateId().slice(0, 8);
  return new RCANMessage({
    rcan: SPEC_VERSION,
    cmd: "KEY_ROTATION",
    target,
    params: {
      message_type: MessageType.CONFIG,
      new_public_key: newPublicKey,
      new_kid: newKid,
      old_kid: oldKeyId,
      overlap_seconds: overlapSeconds,
      initiated_at: new Date().toISOString(),
    },
    keyId: newKid,
  });
}
