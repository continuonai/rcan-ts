import { CommitmentRecord, AuditChain, AuditError } from "../src/audit";

const SECRET = "test-hmac-secret";
const BASE_DATA = {
  action: "move_forward",
  robotUri: "rcan://registry.rcan.dev/acme/arm/v2/unit-001",
  confidence: 0.91,
  safetyApproved: true,
};

describe("CommitmentRecord", () => {
  test("create() produces a valid record", () => {
    const record = CommitmentRecord.create(BASE_DATA, SECRET);
    expect(record.action).toBe("move_forward");
    expect(record.recordId).toBeTruthy();
    expect(record.contentHash).toBeTruthy();
    expect(record.hmac).toBeTruthy();
    expect(record.previousHash).toBeNull();
  });

  test("verify() returns true for valid record", () => {
    const record = CommitmentRecord.create(BASE_DATA, SECRET);
    expect(record.verify(SECRET)).toBe(true);
  });

  test("verify() returns false for wrong secret", () => {
    const record = CommitmentRecord.create(BASE_DATA, SECRET);
    expect(record.verify("wrong-secret")).toBe(false);
  });

  test("previousHash is set when provided", () => {
    const r1 = CommitmentRecord.create(BASE_DATA, SECRET);
    const r2 = CommitmentRecord.create({ action: "stop" }, SECRET, r1.contentHash);
    expect(r2.previousHash).toBe(r1.contentHash);
  });

  test("toJSON() / fromJSON() round-trips", () => {
    const record = CommitmentRecord.create(BASE_DATA, SECRET);
    const obj = record.toJSON();
    const restored = CommitmentRecord.fromJSON(obj);
    expect(restored.recordId).toBe(record.recordId);
    expect(restored.hmac).toBe(record.hmac);
    expect(restored.verify(SECRET)).toBe(true);
  });
});

describe("AuditChain", () => {
  test("append() creates linked records", () => {
    const chain = new AuditChain(SECRET);
    const r1 = chain.append({ action: "move_forward" });
    const r2 = chain.append({ action: "stop" });
    expect(r2.previousHash).toBe(r1.contentHash);
    expect(chain.records).toHaveLength(2);
  });

  test("verifyAll() returns valid for intact chain", () => {
    const chain = new AuditChain(SECRET);
    chain.append({ action: "a" });
    chain.append({ action: "b" });
    chain.append({ action: "c" });
    const result = chain.verifyAll();
    expect(result.valid).toBe(true);
    expect(result.count).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  test("verifyAll() returns empty valid result for empty chain", () => {
    const chain = new AuditChain(SECRET);
    const result = chain.verifyAll();
    expect(result.valid).toBe(true);
    expect(result.count).toBe(0);
  });

  test("toJSONL() / fromJSONL() round-trips", () => {
    const chain = new AuditChain(SECRET);
    chain.append({ action: "move_forward", confidence: 0.91 });
    chain.append({ action: "stop" });
    const jsonl = chain.toJSONL();
    const restored = AuditChain.fromJSONL(jsonl, SECRET);
    expect(restored.records).toHaveLength(2);
    const result = restored.verifyAll();
    expect(result.valid).toBe(true);
  });

  test("fromJSONL() handles empty string", () => {
    const chain = AuditChain.fromJSONL("", SECRET);
    expect(chain.records).toHaveLength(0);
  });

  test("verifyAll() detects HMAC tamper", () => {
    const chain = new AuditChain(SECRET);
    chain.append({ action: "move" });
    const jsonl = chain.toJSONL();
    // Tamper: change action field in serialized JSON
    const tampered = jsonl.replace('"move"', '"self_destruct"');
    const bad = AuditChain.fromJSONL(tampered, SECRET);
    const result = bad.verifyAll();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("records returns array with correct length", () => {
    const chain = new AuditChain(SECRET);
    chain.append({ action: "a" });
    chain.append({ action: "b" });
    expect(chain.records.length).toBe(2);
  });
});
