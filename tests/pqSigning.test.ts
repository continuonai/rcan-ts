/**
 * Tests for RCAN v2.2 ML-DSA-65 signing.
 * Ed25519 is deprecated. MLDSAKeyPair is the only signing class.
 */

import { RCANMessage } from "../src/message.js";
import { MLDSAKeyPair, signMessage, verifyMessage } from "../src/pqSigning.js";

const TEST_TARGET = "rcan://rrf.rcan.dev/test/robot/v1/unit-001";

function makeMsg(): RCANMessage {
  return new RCANMessage({ cmd: "test_cmd", target: TEST_TARGET, params: { x: 1 }, rcan: "2.2.0" });
}

describe("MLDSAKeyPair", () => {
  let kp: MLDSAKeyPair;
  beforeAll(async () => { kp = await MLDSAKeyPair.generate(); });

  it("generates correct key sizes", () => {
    expect(kp.publicKey.length).toBe(1952);
    expect(kp.secretKey!.length).toBe(4032);
    expect(kp.keyId).toHaveLength(8);
  });

  it("signs and verifies bytes", async () => {
    const data = new TextEncoder().encode("hello");
    const sig = await kp.signBytes(data);
    expect(sig.length).toBe(3309);
    await expect(kp.verifyBytes(data, sig)).resolves.toBeUndefined();
  });

  it("rejects tampered data", async () => {
    const data = new TextEncoder().encode("original");
    const sig = await kp.signBytes(data);
    await expect(kp.verifyBytes(new TextEncoder().encode("tampered"), sig)).rejects.toThrow();
  });

  it("verify-only pair cannot sign", async () => {
    const pub = await MLDSAKeyPair.fromPublicKey(kp.publicKey);
    await expect(pub.signBytes(new TextEncoder().encode("x"))).rejects.toThrow("verify-only");
  });

  it("round-trips via fromKeyMaterial", async () => {
    const r = await MLDSAKeyPair.fromKeyMaterial(kp.publicKey, kp.secretKey!);
    const data = new TextEncoder().encode("rt");
    const sig = await r.signBytes(data);
    const pub = await MLDSAKeyPair.fromPublicKey(kp.publicKey);
    await expect(pub.verifyBytes(data, sig)).resolves.toBeUndefined();
  });

  it("has descriptive toString", () => {
    expect(kp.toString()).toContain("ML-DSA-65");
    expect(kp.toString()).toContain("private+public");
  });
});

describe("signMessage / verifyMessage", () => {
  let kp: MLDSAKeyPair;
  let pub: MLDSAKeyPair;
  beforeAll(async () => {
    kp = await MLDSAKeyPair.generate();
    pub = await MLDSAKeyPair.fromPublicKey(kp.publicKey);
  });

  it("sets signature.alg to ml-dsa-65", async () => {
    const msg = makeMsg();
    await signMessage(msg, kp);
    expect(msg.signature?.alg).toBe("ml-dsa-65");
    expect(msg.signature?.kid).toBe(kp.keyId);
  });

  it("verifies valid signature", async () => {
    const msg = makeMsg();
    await signMessage(msg, kp);
    await expect(verifyMessage(msg, [pub])).resolves.toBeUndefined();
  });

  it("rejects wrong key", async () => {
    const msg = makeMsg();
    await signMessage(msg, kp);
    const other = await MLDSAKeyPair.generate();
    const otherPub = await MLDSAKeyPair.fromPublicKey(other.publicKey);
    await expect(verifyMessage(msg, [otherPub])).rejects.toThrow("kid");
  });

  it("rejects tampered message", async () => {
    const msg = makeMsg();
    await signMessage(msg, kp);
    const corrupted = msg.signature!.sig.slice(0, 4) + "XXXX" + msg.signature!.sig.slice(8);
    (msg as unknown as Record<string, unknown>)["signature"] = { ...msg.signature, sig: corrupted };
    await expect(verifyMessage(msg, [pub])).rejects.toThrow();
  });

  it("rejects ed25519 alg", async () => {
    const msg = makeMsg();
    (msg as unknown as Record<string, unknown>)["signature"] = { alg: "ed25519", kid: "x", sig: "y" };
    await expect(verifyMessage(msg, [pub])).rejects.toThrow("deprecated");
  });

  it("rejects unsigned message", async () => {
    const msg = makeMsg();
    await expect(verifyMessage(msg, [pub])).rejects.toThrow("unsigned");
  });
});

describe("RCANMessage round-trip", () => {
  let kp: MLDSAKeyPair;
  beforeAll(async () => { kp = await MLDSAKeyPair.generate(); });

  it("signature survives toJSON/fromJSON", async () => {
    const msg = makeMsg();
    await signMessage(msg, kp);
    const json = msg.toJSON();
    expect((json["signature"] as Record<string,string>)["alg"]).toBe("ml-dsa-65");
    const restored = RCANMessage.fromJSON(json);
    expect(restored.signature?.alg).toBe("ml-dsa-65");
    expect(restored.signature?.sig).toBe(msg.signature?.sig);
  });

  it("verifies after round-trip", async () => {
    const msg = makeMsg();
    await signMessage(msg, kp);
    const restored = RCANMessage.fromJSON(msg.toJSON());
    const pub = await MLDSAKeyPair.fromPublicKey(kp.publicKey);
    await expect(verifyMessage(restored, [pub])).resolves.toBeUndefined();
  });
});
