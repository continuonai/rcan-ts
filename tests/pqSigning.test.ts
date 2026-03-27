/**
 * Tests for RCAN v2.2 post-quantum hybrid signing (ML-DSA-65, FIPS 204).
 */

import { RCANMessage } from "../src/message";
import {
  MLDSAKeyPair,
  addPQSignature,
  verifyPQSignature,
} from "../src/pqSigning";

const TEST_TARGET = "rcan://rrf.rcan.dev/test/robot/v1/unit-001";

function makeMsg(): RCANMessage {
  return new RCANMessage({
    cmd: "test_cmd",
    target: TEST_TARGET,
    params: { x: 1 },
    rcan: "2.2.0",
  });
}

// ---------------------------------------------------------------------------
// MLDSAKeyPair
// ---------------------------------------------------------------------------

describe("MLDSAKeyPair", () => {
  let kp: MLDSAKeyPair;

  beforeAll(async () => {
    kp = await MLDSAKeyPair.generate();
  });

  it("generates keys with correct sizes", () => {
    expect(kp.publicKey.length).toBe(1952);
    expect(kp.secretKey).toBeDefined();
    expect(kp.secretKey!.length).toBe(4032);
    expect(kp.keyId).toHaveLength(8);
    expect(kp.hasPrivateKey).toBe(true);
  });

  it("signs and verifies bytes", async () => {
    const data = new TextEncoder().encode("hello rcan v2.2");
    const sig = await kp.signBytes(data);
    expect(sig.length).toBe(3309);
    await expect(kp.verifyBytes(data, sig)).resolves.toBeUndefined();
  });

  it("rejects tampered data", async () => {
    const data = new TextEncoder().encode("original");
    const sig = await kp.signBytes(data);
    const tampered = new TextEncoder().encode("tampered");
    await expect(kp.verifyBytes(tampered, sig)).rejects.toThrow();
  });

  it("builds verify-only key pair from public key", async () => {
    const pubOnly = await MLDSAKeyPair.fromPublicKey(kp.publicKey);
    expect(pubOnly.hasPrivateKey).toBe(false);
    expect(pubOnly.keyId).toBe(kp.keyId);
    await expect(
      pubOnly.signBytes(new TextEncoder().encode("data"))
    ).rejects.toThrow("verify-only");
  });

  it("round-trips via fromKeyMaterial", async () => {
    const restored = await MLDSAKeyPair.fromKeyMaterial(kp.publicKey, kp.secretKey!);
    expect(restored.keyId).toBe(kp.keyId);
    const data = new TextEncoder().encode("round-trip");
    const sig = await restored.signBytes(data);
    const pubOnly = await MLDSAKeyPair.fromPublicKey(kp.publicKey);
    await expect(pubOnly.verifyBytes(data, sig)).resolves.toBeUndefined();
  });

  it("has descriptive toString()", () => {
    const s = kp.toString();
    expect(s).toContain("ML-DSA-65");
    expect(s).toContain("private+public");
  });
});

// ---------------------------------------------------------------------------
// addPQSignature / verifyPQSignature
// ---------------------------------------------------------------------------

describe("Hybrid PQ signing", () => {
  let kp: MLDSAKeyPair;
  let pubOnly: MLDSAKeyPair;

  beforeAll(async () => {
    kp = await MLDSAKeyPair.generate();
    pubOnly = await MLDSAKeyPair.fromPublicKey(kp.publicKey);
  });

  it("adds pqSig to message", async () => {
    const msg = makeMsg();
    const signed = await addPQSignature(msg, kp);
    expect(signed.pqSig).toBeDefined();
    expect(signed.pqSig!.alg).toBe("ml-dsa-65");
    expect(signed.pqSig!.kid).toBe(kp.keyId);
    expect(signed.pqSig!.sig).toBeTruthy();
  });

  it("verifies a valid pqSig", async () => {
    const msg = makeMsg();
    await addPQSignature(msg, kp);
    await expect(
      verifyPQSignature(msg, [pubOnly])
    ).resolves.toBeUndefined();
  });

  it("throws when no pqSig (default requirePQ=true, ML-DSA primary)", async () => {
    const msg = makeMsg();
    // no pqSig — default is now requirePQ=true (ML-DSA primary from 2026)
    await expect(
      verifyPQSignature(msg, [pubOnly])
    ).rejects.toThrow();
  });

  it("skips verification when no pqSig with requirePQ=false (legacy v2.1 compat)", async () => {
    const msg = makeMsg();
    // requirePQ=false: accept Ed25519-only messages from pre-v2.2 robots
    await expect(
      verifyPQSignature(msg, [pubOnly], false)
    ).resolves.toBeUndefined();
  });

  it("throws when pqSig absent and requirePQ=true (explicit)", async () => {
    const msg = makeMsg();
    await expect(
      verifyPQSignature(
        msg,
        [pubOnly],
        true
      )
    ).rejects.toThrow("pqSig");
  });

  it("verifies when pqSig present and requirePQ=true", async () => {
    const msg = makeMsg();
    await addPQSignature(msg, kp);
    await expect(
      verifyPQSignature(
        msg,
        [pubOnly],
        true
      )
    ).resolves.toBeUndefined();
  });

  it("throws on wrong kid", async () => {
    const msg = makeMsg();
    await addPQSignature(msg, kp);
    const other = await MLDSAKeyPair.generate();
    const otherPub = await MLDSAKeyPair.fromPublicKey(other.publicKey);
    await expect(
      verifyPQSignature(
        msg,
        [otherPub]
      )
    ).rejects.toThrow("kid");
  });

  it("throws on tampered pqSig", async () => {
    const msg = makeMsg();
    await addPQSignature(msg, kp);
    // corrupt first byte
    const corruptSig = msg.pqSig!.sig.slice(0, 2) + "XX" + msg.pqSig!.sig.slice(4);
    (msg as unknown as Record<string, unknown>)["pqSig"] = {
      ...msg.pqSig,
      sig: corruptSig,
    };
    await expect(
      verifyPQSignature(
        msg,
        [pubOnly]
      )
    ).rejects.toThrow();
  });

  it("throws on unsupported pqAlg", async () => {
    const msg = makeMsg();
    await addPQSignature(msg, kp);
    (msg as unknown as Record<string, unknown>)["pqSig"] = {
      ...msg.pqSig,
      alg: "slh-dsa-sha2-128s",
    };
    await expect(
      verifyPQSignature(
        msg,
        [pubOnly]
      )
    ).rejects.toThrow("Unsupported PQ");
  });
});

// ---------------------------------------------------------------------------
// RCANMessage pqSig round-trip
// ---------------------------------------------------------------------------

describe("RCANMessage pqSig round-trip", () => {
  let kp: MLDSAKeyPair;

  beforeAll(async () => {
    kp = await MLDSAKeyPair.generate();
  });

  it("pqSig survives toJSON / fromJSON", async () => {
    const msg = makeMsg();
    await addPQSignature(msg, kp);
    const json = msg.toJSON();
    expect(json["pqSig"]).toBeDefined();
    const restored = RCANMessage.fromJSON(json);
    expect(restored.pqSig).toBeDefined();
    expect(restored.pqSig!.alg).toBe("ml-dsa-65");
    expect(restored.pqSig!.sig).toBe(msg.pqSig!.sig);
  });

  it("pqSig absent from toJSON when not set", () => {
    const msg = makeMsg();
    const json = msg.toJSON();
    expect(json["pqSig"]).toBeUndefined();
  });

  it("verifies after round-trip", async () => {
    const msg = makeMsg();
    await addPQSignature(msg, kp);
    const restored = RCANMessage.fromJSON(msg.toJSON());
    const pubOnly = await MLDSAKeyPair.fromPublicKey(kp.publicKey);
    await expect(
      verifyPQSignature(
        restored,
        [pubOnly]
      )
    ).resolves.toBeUndefined();
  });
});
