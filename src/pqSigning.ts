/**
 * RCAN v2.2 Post-Quantum Hybrid Signing — ML-DSA-65 (NIST FIPS 204)
 *
 * Provides MLDSAKeyPair for post-quantum signing alongside the existing
 * Ed25519 SignatureBlock.  In hybrid mode a message carries both:
 *   - `signature`  — Ed25519 SignatureBlock  (backward-compat with v2.1)
 *   - `pqSig`      — MLDSASignatureBlock     (new in v2.2)
 *
 * Key sizes (ML-DSA-65, NIST security level 3):
 *   Public key:   1952 bytes
 *   Private key:  4032 bytes
 *   Signature:    3309 bytes
 *
 * Requires: @noble/post-quantum (npm install @noble/post-quantum)
 *
 * Spec: https://rcan.dev/spec#section-7-2
 */

import type { RCANMessage, PQSignatureBlock } from "./message.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Re-export for consumers who import from pqSigning directly */
export type { PQSignatureBlock } from "./message.js";
/** @deprecated use PQSignatureBlock */
export type MLDSASignatureBlock = PQSignatureBlock;

export interface MLDSAKeyPairData {
  /** Public key bytes (1952 bytes) */
  publicKey: Uint8Array;
  /** Private key bytes (4032 bytes). Absent for verify-only key pairs. */
  secretKey?: Uint8Array;
  /** 8-char hex key ID */
  keyId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64url(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256hex(data: Uint8Array): Promise<string> {
  // Web Crypto — available in browsers, Node 18+, Cloudflare Workers
  const g = typeof globalThis !== "undefined" ? globalThis : ({} as typeof globalThis);
  const webcrypto = (g as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto;
  const subtle = webcrypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest("SHA-256", data as unknown as ArrayBuffer);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 8);
  }
  // Older Node.js fallback via dynamic import (never bundled into browser build)
  const nodeCrypto = await import("node:crypto").catch(() => null);
  if (nodeCrypto) {
    return nodeCrypto.createHash("sha256").update(data).digest("hex").slice(0, 8);
  }
  throw new Error("No SHA-256 implementation available");
}

type MlDsaModule = { ml_dsa65: { keygen: () => { publicKey: Uint8Array; secretKey: Uint8Array }; sign: (msg: Uint8Array, sk: Uint8Array) => Uint8Array; verify: (sig: Uint8Array, msg: Uint8Array, pk: Uint8Array) => boolean } };
let _mlDsaModule: MlDsaModule | undefined;

async function requireNoblePostQuantum(): Promise<MlDsaModule> {
  if (_mlDsaModule) return _mlDsaModule;
  // CJS-first: use require() when available (Node / Jest / ts-jest).
  // Falls back to ESM dynamic import() for browser / CF Workers runtimes.
  if (typeof require !== "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _mlDsaModule = (require as NodeRequire)("@noble/post-quantum/ml-dsa.js") as MlDsaModule;
      return _mlDsaModule;
    } catch { /* fall through to ESM */ }
  }
  try {
    _mlDsaModule = await import("@noble/post-quantum/ml-dsa.js") as unknown as MlDsaModule;
    return _mlDsaModule;
  } catch {
    throw new Error(
      "ML-DSA signing requires @noble/post-quantum. " +
        "Install with: npm install @noble/post-quantum"
    );
  }
}

// ---------------------------------------------------------------------------
// MLDSAKeyPair
// ---------------------------------------------------------------------------

/**
 * An ML-DSA-65 (CRYSTALS-Dilithium, NIST FIPS 204) key pair.
 *
 * Immutable value object.  Build via {@link MLDSAKeyPair.generate} or
 * {@link MLDSAKeyPair.fromPublicKey}.
 */
export class MLDSAKeyPair {
  readonly keyId: string;
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array | undefined;

  private constructor(data: MLDSAKeyPairData) {
    this.keyId = data.keyId;
    this.publicKey = data.publicKey;
    this.secretKey = data.secretKey;
  }

  /** Generate a new ML-DSA-65 key pair. */
  static async generate(): Promise<MLDSAKeyPair> {
    const { ml_dsa65 } = await requireNoblePostQuantum();
    const kp = ml_dsa65.keygen();
    const keyId = await sha256hex(kp.publicKey);
    return new MLDSAKeyPair({
      publicKey: kp.publicKey,
      secretKey: kp.secretKey,
      keyId,
    });
  }

  /** Build a verify-only key pair from raw public key bytes. */
  static async fromPublicKey(publicKey: Uint8Array): Promise<MLDSAKeyPair> {
    const keyId = await sha256hex(publicKey);
    return new MLDSAKeyPair({ publicKey, keyId });
  }

  /** Build a full key pair from saved bytes (public + secret). */
  static async fromKeyMaterial(
    publicKey: Uint8Array,
    secretKey: Uint8Array
  ): Promise<MLDSAKeyPair> {
    const keyId = await sha256hex(publicKey);
    return new MLDSAKeyPair({ publicKey, secretKey, keyId });
  }

  get hasPrivateKey(): boolean {
    return this.secretKey !== undefined;
  }

  /** Sign raw bytes; returns ML-DSA-65 signature (3309 bytes). */
  async signBytes(data: Uint8Array): Promise<Uint8Array> {
    if (!this.secretKey) {
      throw new Error("Cannot sign: MLDSAKeyPair has no private key (verify-only)");
    }
    const { ml_dsa65 } = await requireNoblePostQuantum();
    return ml_dsa65.sign(data, this.secretKey);
  }

  /**
   * Verify an ML-DSA-65 signature.
   * @returns true if valid
   * @throws {Error} on invalid signature
   */
  async verifyBytes(data: Uint8Array, signature: Uint8Array): Promise<void> {
    const { ml_dsa65 } = await requireNoblePostQuantum();
    const ok = ml_dsa65.verify(signature, data, this.publicKey);
    if (!ok) throw new Error("ML-DSA signature verification failed");
  }

  toString(): string {
    const mode = this.hasPrivateKey ? "private+public" : "public-only";
    return `MLDSAKeyPair(keyId=${this.keyId}, alg=ML-DSA-65, ${mode})`;
  }
}

// ---------------------------------------------------------------------------
// Canonical message bytes (mirrors rcan-py _canonical_message_bytes)
// ---------------------------------------------------------------------------

function canonicalMessageBytes(msg: RCANMessage): Uint8Array {
  const m = msg as unknown as Record<string, unknown>;
  const payload = {
    rcan: msg.rcan,
    msg_id: (m["msgId"] ?? m["msg_id"] ?? "") as string,
    timestamp: msg.timestamp,
    cmd: msg.cmd,
    target: msg.target,
    params: msg.params,
  };
  const sorted = JSON.stringify(
    Object.fromEntries(Object.entries(payload).sort()),
    null,
    undefined
  );
  return new TextEncoder().encode(sorted);
}

// ---------------------------------------------------------------------------
// Hybrid sign / verify
// ---------------------------------------------------------------------------

/**
 * Add an ML-DSA-65 signature (`pqSig`) to an RCAN message.
 *
 * This is the v2.2 hybrid complement to the existing Ed25519 signature.
 * Call {@link signMessageEd25519} (or the existing signing path) first to set
 * `signature`, then call this to append `pqSig`.
 *
 * @param msg      RCAN message (mutated in place — sets `pqSig`)
 * @param keypair  ML-DSA-65 key pair with private key
 * @returns The same message cast to include `pqSig`
 */
export async function addPQSignature(
  msg: RCANMessage,
  keypair: MLDSAKeyPair
): Promise<RCANMessage> {
  const payload = canonicalMessageBytes(msg);
  const rawSig = await keypair.signBytes(payload);
  const block: PQSignatureBlock = {
    alg: "ml-dsa-65",
    kid: keypair.keyId,
    sig: toBase64url(rawSig),
  };
  (msg as unknown as Record<string, unknown>)["pqSig"] = block;
  return msg;
}

/**
 * Verify the ML-DSA-65 signature (`pqSig`) on an RCAN message.
 *
 * @param msg           Message with a `pqSig` field
 * @param trustedKeys   Trusted ML-DSA public key pairs
 * @param requirePQ     Default true: raise when `pqSig` absent (ML-DSA-65 is primary from 2026). Pass false only for legacy v2.1 compat.
 */
export async function verifyPQSignature(
  msg: RCANMessage,
  trustedKeys: MLDSAKeyPair[],
  requirePQ = true
): Promise<void> {
  const pqSig = (msg as unknown as Record<string, unknown>)["pqSig"] as PQSignatureBlock | undefined;

  if (!pqSig) {
    if (requirePQ) {
      throw new Error("ML-DSA signature (pqSig) required but missing from message");
    }
    return; // backward compat: pre-v2.2 messages have no pqSig — skip
  }

  if (pqSig.alg !== "ml-dsa-65") {
    throw new Error(`Unsupported PQ signature algorithm: ${pqSig.alg}`);
  }

  const matched = trustedKeys.find((k) => k.keyId === pqSig.kid);
  if (!matched) {
    throw new Error(
      `No trusted ML-DSA key with kid=${pqSig.kid}. ` +
        `Known kids: [${trustedKeys.map((k) => k.keyId).join(", ")}]`
    );
  }

  let rawSig: Uint8Array;
  try {
    rawSig = fromBase64url(pqSig.sig);
  } catch (e) {
    throw new Error(`Invalid base64url ML-DSA signature: ${e}`);
  }

  const payload = canonicalMessageBytes(msg);
  await matched.verifyBytes(payload, rawSig);
}
