/**
 * Tests for ML-DSA-65 PQC primitives in src/crypto.ts (issue #40).
 */

import {
  generateMlDsaKeypair,
  signMlDsa,
  verifyMlDsa,
  signHybrid,
  verifyHybrid,
  encodeHybridSig,
  decodeHybridSig,
  encodeMlDsaPublicKeyJwk,
  decodeMlDsaPublicKeyJwk,
} from "../src/crypto.js";
import { ed25519 } from "@noble/curves/ed25519.js";

// ── ML-DSA-65 keygen / sign / verify ─────────────────────────────────────────

describe("generateMlDsaKeypair", () => {
  it("produces correct key sizes", () => {
    const kp = generateMlDsaKeypair();
    expect(kp.publicKey.length).toBe(1952);
    expect(kp.privateKey.length).toBe(4032);
  });

  it("produces different keys each call", () => {
    const a = generateMlDsaKeypair();
    const b = generateMlDsaKeypair();
    expect(Buffer.from(a.publicKey).equals(Buffer.from(b.publicKey))).toBe(false);
  });
});

describe("signMlDsa / verifyMlDsa", () => {
  let kp: ReturnType<typeof generateMlDsaKeypair>;
  const msg = new TextEncoder().encode("hello rcan pqc");

  beforeAll(() => { kp = generateMlDsaKeypair(); });

  it("returns 3309-byte signature", () => {
    const sig = signMlDsa(kp.privateKey, msg);
    expect(sig.length).toBe(3309);
  });

  it("round-trip sign then verify returns true", () => {
    const sig = signMlDsa(kp.privateKey, msg);
    expect(verifyMlDsa(kp.publicKey, msg, sig)).toBe(true);
  });

  it("tampered message fails verification", () => {
    const sig = signMlDsa(kp.privateKey, msg);
    const tampered = new TextEncoder().encode("hello rcan pqc TAMPERED");
    expect(verifyMlDsa(kp.publicKey, tampered, sig)).toBe(false);
  });

  it("wrong public key fails verification", () => {
    const sig = signMlDsa(kp.privateKey, msg);
    const other = generateMlDsaKeypair();
    expect(verifyMlDsa(other.publicKey, msg, sig)).toBe(false);
  });

  it("flipped sig byte fails verification", () => {
    const sig = signMlDsa(kp.privateKey, msg);
    sig[0] ^= 0xff;
    expect(verifyMlDsa(kp.publicKey, msg, sig)).toBe(false);
  });
});

// ── Hybrid Ed25519 + ML-DSA-65 ────────────────────────────────────────────────

describe("signHybrid / verifyHybrid", () => {
  let mlKp: ReturnType<typeof generateMlDsaKeypair>;
  let edKp: { secretKey: Uint8Array; publicKey: Uint8Array };
  const msg = new TextEncoder().encode("hybrid pqc test message");

  beforeAll(() => {
    mlKp = generateMlDsaKeypair();
    edKp = ed25519.keygen();
  });

  it("produces pqc-hybrid-v1 profile", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    expect(sig.profile).toBe("pqc-hybrid-v1");
  });

  it("ed25519Sig is 64 bytes", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    expect(sig.ed25519Sig.length).toBe(64);
  });

  it("mlDsaSig is 3309 bytes", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    expect(sig.mlDsaSig.length).toBe(3309);
  });

  it("valid hybrid signature verifies true", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    expect(verifyHybrid(edKp.publicKey, mlKp.publicKey, msg, sig)).toBe(true);
  });

  it("tampered message fails hybrid verification", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    const bad = new TextEncoder().encode("tampered");
    expect(verifyHybrid(edKp.publicKey, mlKp.publicKey, bad, sig)).toBe(false);
  });

  it("wrong ed25519 key fails verification", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    const other = ed25519.keygen();
    expect(verifyHybrid(other.publicKey, mlKp.publicKey, msg, sig)).toBe(false);
  });

  it("wrong ML-DSA key fails verification", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    const other = generateMlDsaKeypair();
    expect(verifyHybrid(edKp.publicKey, other.publicKey, msg, sig)).toBe(false);
  });

  it("wrong profile returns false", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    const bad = { ...sig, profile: "unknown" as "pqc-hybrid-v1" };
    expect(verifyHybrid(edKp.publicKey, mlKp.publicKey, msg, bad)).toBe(false);
  });
});

// ── encodeHybridSig / decodeHybridSig ────────────────────────────────────────

describe("encodeHybridSig / decodeHybridSig", () => {
  let mlKp: ReturnType<typeof generateMlDsaKeypair>;
  let edKp: { secretKey: Uint8Array; publicKey: Uint8Array };
  const msg = new TextEncoder().encode("encode decode test");

  beforeAll(() => {
    mlKp = generateMlDsaKeypair();
    edKp = ed25519.keygen();
  });

  it("encoded string starts with 'pqc-hybrid-v1.'", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    expect(encodeHybridSig(sig)).toMatch(/^pqc-hybrid-v1\./);
  });

  it("encoded string has exactly three dot-separated parts", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    const parts = encodeHybridSig(sig).split(".");
    expect(parts.length).toBe(3);
  });

  it("round-trips encode then decode", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    const encoded = encodeHybridSig(sig);
    const decoded = decodeHybridSig(encoded);
    expect(decoded.profile).toBe("pqc-hybrid-v1");
    expect(decoded.ed25519Sig).toEqual(sig.ed25519Sig);
    expect(decoded.mlDsaSig).toEqual(sig.mlDsaSig);
  });

  it("decoded signature still verifies", () => {
    const sig = signHybrid(edKp.secretKey, mlKp.privateKey, msg);
    const decoded = decodeHybridSig(encodeHybridSig(sig));
    expect(verifyHybrid(edKp.publicKey, mlKp.publicKey, msg, decoded)).toBe(true);
  });

  it("decodeHybridSig throws on malformed input", () => {
    expect(() => decodeHybridSig("not-valid")).toThrow();
    expect(() => decodeHybridSig("wrong.two")).toThrow();
    expect(() => decodeHybridSig("wrong.three.parts.extra")).toThrow();
  });
});

// ── JWK encode / decode ───────────────────────────────────────────────────────

describe("encodeMlDsaPublicKeyJwk / decodeMlDsaPublicKeyJwk", () => {
  let kp: ReturnType<typeof generateMlDsaKeypair>;

  beforeAll(() => { kp = generateMlDsaKeypair(); });

  it("encodes to object with kty=OKP, alg=ML-DSA-65", () => {
    const jwk = encodeMlDsaPublicKeyJwk(kp.publicKey) as Record<string, unknown>;
    expect(jwk["kty"]).toBe("OKP");
    expect(jwk["alg"]).toBe("ML-DSA-65");
    expect(jwk["use"]).toBe("sig");
    expect(typeof jwk["x"]).toBe("string");
  });

  it("round-trips encode then decode", () => {
    const jwk = encodeMlDsaPublicKeyJwk(kp.publicKey);
    const recovered = decodeMlDsaPublicKeyJwk(jwk);
    expect(recovered).toEqual(kp.publicKey);
  });

  it("decoded public key verifies signatures", () => {
    const msg = new TextEncoder().encode("jwk round-trip verify");
    const sig = signMlDsa(kp.privateKey, msg);
    const recovered = decodeMlDsaPublicKeyJwk(encodeMlDsaPublicKeyJwk(kp.publicKey));
    expect(verifyMlDsa(recovered, msg, sig)).toBe(true);
  });

  it("decodeMlDsaPublicKeyJwk throws on wrong kty", () => {
    expect(() => decodeMlDsaPublicKeyJwk({ kty: "RSA", alg: "ML-DSA-65", x: "abc" })).toThrow();
  });

  it("decodeMlDsaPublicKeyJwk throws on wrong alg", () => {
    expect(() => decodeMlDsaPublicKeyJwk({ kty: "OKP", alg: "Ed25519", x: "abc" })).toThrow();
  });

  it("decodeMlDsaPublicKeyJwk throws on missing x", () => {
    expect(() => decodeMlDsaPublicKeyJwk({ kty: "OKP", alg: "ML-DSA-65" })).toThrow();
  });
});
