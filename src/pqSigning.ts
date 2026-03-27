/**
 * RCAN v2.2 ML-DSA-65 Signing (NIST FIPS 204)
 *
 * Ed25519 is deprecated. ML-DSA-65 is the ONLY signing algorithm.
 * All signed messages carry a ``signature`` block with ``alg: "ml-dsa-65"``.
 *
 * Requires: @noble/post-quantum (npm install @noble/post-quantum)
 *
 * Spec: https://rcan.dev/spec/v2.2#section-7-2
 */

import type { RCANMessage, SignatureBlock } from "./message.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MLDSAKeyPairData {
  publicKey: Uint8Array;
  secretKey?: Uint8Array;
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
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 8);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as { createHash: (alg: string) => { update: (d: Uint8Array) => { digest: (enc: string) => string } } };
  return createHash("sha256").update(data).digest("hex").slice(0, 8);
}

let _mlDsaModule: { ml_dsa65: { keygen: () => { publicKey: Uint8Array; secretKey: Uint8Array }; sign: (msg: Uint8Array, sk: Uint8Array) => Uint8Array; verify: (sig: Uint8Array, msg: Uint8Array, pk: Uint8Array) => boolean } } | undefined;

async function requireMlDsa() {
  if (_mlDsaModule) return _mlDsaModule;
  if (typeof require !== "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _mlDsaModule = require("@noble/post-quantum/ml-dsa.js") as typeof _mlDsaModule;
      return _mlDsaModule!;
    } catch { /* fall through */ }
  }
  try {
    _mlDsaModule = await import("@noble/post-quantum/ml-dsa.js") as unknown as typeof _mlDsaModule;
    return _mlDsaModule!;
  } catch {
    throw new Error(
      "ML-DSA-65 signing requires @noble/post-quantum. " +
        "Install with: npm install @noble/post-quantum"
    );
  }
}

// ---------------------------------------------------------------------------
// MLDSAKeyPair — the only signing key type in RCAN v2.2
// ---------------------------------------------------------------------------

/**
 * An ML-DSA-65 (CRYSTALS-Dilithium, NIST FIPS 204) key pair.
 *
 * This is the ONLY signing key type in RCAN v2.2+. Ed25519 is deprecated.
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

  static async generate(): Promise<MLDSAKeyPair> {
    const m = await requireMlDsa();
    const kp = m!.ml_dsa65.keygen();
    const keyId = await sha256hex(kp.publicKey);
    return new MLDSAKeyPair({ publicKey: kp.publicKey, secretKey: kp.secretKey, keyId });
  }

  static async fromPublicKey(publicKey: Uint8Array): Promise<MLDSAKeyPair> {
    const keyId = await sha256hex(publicKey);
    return new MLDSAKeyPair({ publicKey, keyId });
  }

  static async fromKeyMaterial(publicKey: Uint8Array, secretKey: Uint8Array): Promise<MLDSAKeyPair> {
    const keyId = await sha256hex(publicKey);
    return new MLDSAKeyPair({ publicKey, secretKey, keyId });
  }

  get hasPrivateKey(): boolean { return this.secretKey !== undefined; }

  async signBytes(data: Uint8Array): Promise<Uint8Array> {
    if (!this.secretKey) throw new Error("Cannot sign: MLDSAKeyPair has no private key (verify-only)");
    const m = await requireMlDsa();
    return m!.ml_dsa65.sign(data, this.secretKey);
  }

  async verifyBytes(data: Uint8Array, signature: Uint8Array): Promise<void> {
    const m = await requireMlDsa();
    const ok = m!.ml_dsa65.verify(signature, data, this.publicKey);
    if (!ok) throw new Error("ML-DSA-65 signature verification failed");
  }

  toString(): string {
    return `MLDSAKeyPair(keyId=${this.keyId}, alg=ML-DSA-65, ${this.hasPrivateKey ? "private+public" : "public-only"})`;
  }
}

// ---------------------------------------------------------------------------
// Canonical message bytes
// ---------------------------------------------------------------------------

function canonicalMessageBytes(msg: RCANMessage): Uint8Array {
  const payload = {
    rcan: msg.rcan,
    msg_id: (msg as unknown as Record<string, unknown>)["msgId"] ?? "",
    timestamp: msg.timestamp,
    cmd: msg.cmd,
    target: msg.target,
    params: msg.params,
  };
  return new TextEncoder().encode(
    JSON.stringify(Object.fromEntries(Object.entries(payload).sort()))
  );
}

// ---------------------------------------------------------------------------
// sign / verify
// ---------------------------------------------------------------------------

/**
 * Sign an RCANMessage with ML-DSA-65 (the only signing algorithm in RCAN v2.2).
 *
 * Sets msg.signature = { alg: "ml-dsa-65", kid, sig }.
 */
export async function signMessage(
  msg: RCANMessage,
  keypair: MLDSAKeyPair
): Promise<RCANMessage> {
  const payload = canonicalMessageBytes(msg);
  const rawSig = await keypair.signBytes(payload);
  (msg as unknown as Record<string, unknown>)["signature"] = {
    alg: "ml-dsa-65",
    kid: keypair.keyId,
    sig: toBase64url(rawSig),
  } satisfies SignatureBlock;
  return msg;
}

/**
 * Verify the ML-DSA-65 signature on an RCANMessage.
 *
 * @throws {Error} if signature is missing, alg is not ml-dsa-65, key not found, or invalid.
 */
export async function verifyMessage(
  msg: RCANMessage,
  trustedKeys: MLDSAKeyPair[]
): Promise<void> {
  const sig = msg.signature;
  if (!sig) throw new Error("Message is unsigned — signature field missing");
  if (sig.alg !== "ml-dsa-65") {
    throw new Error(
      `Unsupported signature algorithm: ${sig.alg}. ` +
      "RCAN v2.2 requires ml-dsa-65 (Ed25519 is deprecated)."
    );
  }
  const matched = trustedKeys.find((k) => k.keyId === sig.kid);
  if (!matched) {
    throw new Error(
      `No trusted ML-DSA-65 key with kid=${sig.kid}. ` +
        `Known kids: [${trustedKeys.map((k) => k.keyId).join(", ")}]`
    );
  }
  let rawSig: Uint8Array;
  try { rawSig = fromBase64url(sig.sig); } catch (e) { throw new Error(`Invalid base64url sig: ${e}`); }
  await matched.verifyBytes(canonicalMessageBytes(msg), rawSig);
}

// ---------------------------------------------------------------------------
// Deprecated aliases for migration
// ---------------------------------------------------------------------------

/** @deprecated Use signMessage() — Ed25519 is removed in RCAN v2.2 */
export const addPQSignature = signMessage;

/** @deprecated Use verifyMessage() — Ed25519 is removed in RCAN v2.2 */
export async function verifyPQSignature(
  msg: RCANMessage,
  trustedKeys: MLDSAKeyPair[],
  _requirePQ = true
): Promise<void> {
  return verifyMessage(msg, trustedKeys);
}
