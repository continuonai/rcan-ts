/**
 * rcan.hybrid — Dict-level hybrid signing (ML-DSA-65 + Ed25519).
 *
 * Wire format (wire-compatible with rcan-py 3.1.0's rcan.hybrid and with
 * RobotRegistryFoundation's /v2/*\/register endpoints):
 *
 *   {
 *     ...body,
 *     pq_signing_pub: "<base64 ML-DSA-65 pub>",
 *     pq_kid:         "<first 8 hex of sha256(ml_dsa_pub)>",
 *     sig: {
 *       ml_dsa:      "<base64>",
 *       ed25519:     "<base64>",
 *       ed25519_pub: "<base64>",
 *     },
 *   }
 *
 * The signature is over canonicalJson({...body, pq_signing_pub, pq_kid}).
 * verifyBody strips only `sig` before re-canonicalizing.
 */
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { canonicalJson } from "./encoding.js";

export interface MlDsaKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface SignBodyOptions {
  ed25519Secret: Uint8Array;
  ed25519Public: Uint8Array;
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function subtle(): Promise<SubtleCrypto> {
  const cryptoModule = "node:crypto";
  return (globalThis.crypto ?? ((await import(cryptoModule)) as typeof import("node:crypto")).webcrypto).subtle;
}

async function kidFromPub(mlDsaPub: Uint8Array): Promise<string> {
  const s = await subtle();
  const hash = new Uint8Array(await s.digest("SHA-256", mlDsaPub as unknown as BufferSource));
  return toHex(hash).slice(0, 8);
}

function ed25519SecretToPkcs8(raw: Uint8Array): Uint8Array {
  if (raw.length !== 32) {
    throw new Error(`Ed25519 secret must be 32 bytes, got ${raw.length}`);
  }
  const header = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);
  const out = new Uint8Array(header.length + raw.length);
  out.set(header, 0);
  out.set(raw, header.length);
  return out;
}

export async function signBody(
  keypair: MlDsaKeyPair,
  body: Record<string, unknown>,
  opts: SignBodyOptions,
): Promise<Record<string, unknown>> {
  const pq_signing_pub = toB64(keypair.publicKey);
  const pq_kid = await kidFromPub(keypair.publicKey);
  const bodyWithIds = { ...body, pq_signing_pub, pq_kid };
  const message = canonicalJson(bodyWithIds);

  const mlDsaSig = ml_dsa65.sign(message, keypair.privateKey);

  const s = await subtle();
  const ed25519Key = await s.importKey(
    "pkcs8",
    ed25519SecretToPkcs8(opts.ed25519Secret) as unknown as BufferSource,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const ed25519Sig = new Uint8Array(
    await s.sign("Ed25519", ed25519Key, message as unknown as BufferSource),
  );

  return {
    ...bodyWithIds,
    sig: {
      ml_dsa: toB64(mlDsaSig),
      ed25519: toB64(ed25519Sig),
      ed25519_pub: toB64(opts.ed25519Public),
    },
  };
}

export async function verifyBody(
  signed: Record<string, unknown>,
  pqSigningPub: Uint8Array,
): Promise<boolean> {
  try {
    const sig = signed["sig"] as Record<string, string> | undefined;
    if (!sig || typeof sig !== "object") return false;
    for (const k of ["ml_dsa", "ed25519", "ed25519_pub"] as const) {
      if (typeof sig[k] !== "string") return false;
    }
    if (typeof signed["pq_signing_pub"] !== "string") return false;

    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(signed)) {
      if (k !== "sig") rest[k] = v;
    }
    const message = canonicalJson(rest);

    const mlDsaOk = ml_dsa65.verify(fromB64(sig.ml_dsa!), message, pqSigningPub);
    if (!mlDsaOk) return false;

    const s = await subtle();
    const edKey = await s.importKey(
      "raw",
      fromB64(sig.ed25519_pub!) as unknown as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await s.verify("Ed25519", edKey, fromB64(sig.ed25519!) as unknown as BufferSource, message as unknown as BufferSource);
  } catch {
    return false;
  }
}
