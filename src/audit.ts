/**
 * RCAN Audit Chain — tamper-evident commitment records (§16).
 *
 * Each CommitmentRecord is sealed with an HMAC-SHA256 over its content.
 * Records are chained via previousHash, creating a forensic audit trail.
 */

import { hmacSha256Sync, generateUUID } from "./crypto.js";

export interface CommitmentRecordData {
  action: string;
  robotUri?: string;
  confidence?: number;
  modelIdentity?: string;
  params?: Record<string, unknown>;
  safetyApproved?: boolean;
}

export interface CommitmentRecordJSON {
  recordId: string;
  action: string;
  robotUri: string;
  confidence?: number;
  modelIdentity?: string;
  params: Record<string, unknown>;
  safetyApproved: boolean;
  timestamp: string;
  contentHash: string;
  previousHash: string | null;
  hmac: string;
}

export class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditError";
  }
}

function computeContentHash(
  recordId: string,
  action: string,
  robotUri: string,
  timestamp: string,
  params: Record<string, unknown>
): string {
  const payload = JSON.stringify(
    { recordId, action, robotUri, timestamp, params },
    Object.keys({ recordId, action, robotUri, timestamp, params }).sort()
  );
  return hmacSha256Sync("rcan-content-hash", payload);
}

function computeHmac(secret: string, data: CommitmentRecordJSON): string {
  const { hmac: _ignored, ...rest } = data;
  const payload = JSON.stringify(rest, Object.keys(rest).sort());
  return hmacSha256Sync(secret, payload);
}

export class CommitmentRecord {
  readonly recordId: string;
  readonly action: string;
  readonly robotUri: string;
  readonly confidence: number | undefined;
  readonly modelIdentity: string | undefined;
  readonly params: Record<string, unknown>;
  readonly safetyApproved: boolean;
  readonly timestamp: string;
  readonly contentHash: string;
  readonly previousHash: string | null;
  readonly hmac: string;

  private constructor(data: CommitmentRecordJSON) {
    this.recordId = data.recordId;
    this.action = data.action;
    this.robotUri = data.robotUri;
    this.confidence = data.confidence;
    this.modelIdentity = data.modelIdentity;
    this.params = data.params;
    this.safetyApproved = data.safetyApproved;
    this.timestamp = data.timestamp;
    this.contentHash = data.contentHash;
    this.previousHash = data.previousHash;
    this.hmac = data.hmac;
  }

  static create(
    data: CommitmentRecordData,
    secret: string,
    previousHash: string | null = null
  ): CommitmentRecord {
    const recordId = generateUUID();
    const timestamp = new Date().toISOString();
    const params = data.params ?? {};
    const robotUri = data.robotUri ?? "";
    const contentHash = computeContentHash(recordId, data.action, robotUri, timestamp, params);

    const draft: CommitmentRecordJSON = {
      recordId,
      action: data.action,
      robotUri,
      confidence: data.confidence,
      modelIdentity: data.modelIdentity,
      params,
      safetyApproved: data.safetyApproved ?? true,
      timestamp,
      contentHash,
      previousHash,
      hmac: "",
    };
    draft.hmac = computeHmac(secret, draft);
    return new CommitmentRecord(draft);
  }

  verify(secret: string): boolean {
    const expected = computeHmac(secret, this.toJSON());
    return expected === this.hmac;
  }

  toJSON(): CommitmentRecordJSON {
    return {
      recordId: this.recordId,
      action: this.action,
      robotUri: this.robotUri,
      confidence: this.confidence,
      modelIdentity: this.modelIdentity,
      params: this.params,
      safetyApproved: this.safetyApproved,
      timestamp: this.timestamp,
      contentHash: this.contentHash,
      previousHash: this.previousHash,
      hmac: this.hmac,
    };
  }

  static fromJSON(obj: CommitmentRecordJSON): CommitmentRecord {
    return new CommitmentRecord(obj);
  }
}

// ---------------------------------------------------------------------------
// AuditChain
// ---------------------------------------------------------------------------

export interface ChainVerifyResult {
  valid: boolean;
  count: number;
  errors: string[];
}

export class AuditChain {
  private _records: CommitmentRecord[] = [];
  private _secret: string;

  constructor(secret: string) {
    this._secret = secret;
  }

  get records(): readonly CommitmentRecord[] {
    return this._records;
  }

  append(data: CommitmentRecordData): CommitmentRecord {
    const prev = this._records[this._records.length - 1];
    const prevHash = prev?.contentHash ?? null;
    const record = CommitmentRecord.create(data, this._secret, prevHash);
    this._records.push(record);
    return record;
  }

  verifyAll(): ChainVerifyResult {
    const errors: string[] = [];
    let prevHash: string | null = null;

    for (const record of this._records) {
      if (!record.verify(this._secret)) {
        errors.push(`HMAC invalid for record ${record.recordId.slice(0, 8)}`);
      }
      if (prevHash !== null && record.previousHash !== prevHash) {
        errors.push(
          `Chain broken at ${record.recordId.slice(0, 8)}: expected prev=${prevHash.slice(0, 12)}`
        );
      }
      prevHash = record.contentHash;
    }

    return { valid: errors.length === 0, count: this._records.length, errors };
  }

  toJSONL(): string {
    return this._records.map((r) => JSON.stringify(r.toJSON())).join("\n") + "\n";
  }

  static fromJSONL(text: string, secret: string): AuditChain {
    const chain = new AuditChain(secret);
    const lines = text.trim().split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      const obj = JSON.parse(line) as CommitmentRecordJSON;
      chain._records.push(CommitmentRecord.fromJSON(obj));
    }
    return chain;
  }
}
