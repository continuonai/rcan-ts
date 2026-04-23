/**
 * Tests for src/hybrid.ts — dict-level hybrid signing.
 *
 * Mirrors rcan-py's tests/test_hybrid.py. Wire format must be compatible.
 */
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { signBody, verifyBody } from "../src/hybrid.js";

async function genEd25519(): Promise<{ secret: Uint8Array; public: Uint8Array }> {
  const subtle = (globalThis.crypto ?? (await import("node:crypto")).webcrypto).subtle;
  const kp = (await subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  const jwk = await subtle.exportKey("jwk", kp.privateKey);
  const d = jwk["d"] as string;
  const padded = d.replace(/-/g, "+").replace(/_/g, "/");
  const secret = Uint8Array.from(Buffer.from(padded, "base64"));
  return { secret, public: pub };
}

describe("signBody / verifyBody round-trip", () => {
  test("signs and verifies a simple body", async () => {
    const mldsa = ml_dsa65.keygen();
    const ed = await genEd25519();
    const body = { rrn: "RRN-000000000042", name: "test" };
    const signed = await signBody(
      { privateKey: mldsa.secretKey, publicKey: mldsa.publicKey },
      body,
      { ed25519Secret: ed.secret, ed25519Public: ed.public },
    );
    expect(signed["pq_signing_pub"]).toBeDefined();
    expect(signed["pq_kid"]).toBeDefined();
    expect(signed["sig"]).toBeDefined();
    const sig = signed["sig"] as Record<string, string>;
    expect(Object.keys(sig).sort()).toEqual(["ed25519", "ed25519_pub", "ml_dsa"]);
    expect(signed["rrn"]).toBe("RRN-000000000042");
    expect(signed["name"]).toBe("test");
    const pqPub = Uint8Array.from(
      Buffer.from(signed["pq_signing_pub"] as string, "base64"),
    );
    expect(await verifyBody(signed, pqPub)).toBe(true);
  });

  test("rejects tampered body", async () => {
    const mldsa = ml_dsa65.keygen();
    const ed = await genEd25519();
    const signed = await signBody(
      { privateKey: mldsa.secretKey, publicKey: mldsa.publicKey },
      { name: "alice" },
      { ed25519Secret: ed.secret, ed25519Public: ed.public },
    );
    (signed as Record<string, unknown>)["name"] = "mallory";
    const pqPub = Uint8Array.from(
      Buffer.from(signed["pq_signing_pub"] as string, "base64"),
    );
    expect(await verifyBody(signed, pqPub)).toBe(false);
  });

  test("rejects missing sig", async () => {
    expect(await verifyBody({ name: "alice" }, new Uint8Array(32))).toBe(false);
  });

  test("rejects missing pq_signing_pub", async () => {
    const signed = { sig: { ml_dsa: "", ed25519: "", ed25519_pub: "" } };
    expect(await verifyBody(signed, new Uint8Array(32))).toBe(false);
  });

  test("pq_kid is first 8 hex of sha256(ml_dsa public)", async () => {
    const subtle = (globalThis.crypto ?? (await import("node:crypto")).webcrypto).subtle;
    const mldsa = ml_dsa65.keygen();
    const ed = await genEd25519();
    const signed = await signBody(
      { privateKey: mldsa.secretKey, publicKey: mldsa.publicKey },
      { x: 1 },
      { ed25519Secret: ed.secret, ed25519Public: ed.public },
    );
    const hash = new Uint8Array(await subtle.digest("SHA-256", mldsa.publicKey as unknown as BufferSource));
    const hex = Array.from(hash)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(signed["pq_kid"]).toBe(hex.slice(0, 8));
  });
});
