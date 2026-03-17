/**
 * RCAN Constrained-Transport Encodings — GAP-17.
 *
 * Provides compact JSON, 32-byte minimal (ESTOP-only), BLE frame fragmentation,
 * and a transport-selection helper. No external runtime dependencies.
 */

import { RCANMessage } from './message.js';

// ── Error ─────────────────────────────────────────────────────────────────────

export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransportError';
    Object.setPrototypeOf(this, TransportError.prototype);
  }
}

// ── Enum ──────────────────────────────────────────────────────────────────────

export enum TransportEncoding {
  HTTP    = 'http',
  COMPACT = 'compact',
  MINIMAL = 'minimal',
  BLE     = 'ble',
}

// ── Compact encoding ──────────────────────────────────────────────────────────

/**
 * Abbreviated field name map (full → short).
 *
 * msg_type → t, msg_id → i, timestamp → ts,
 * from_rrn → f, to_rrn → to, scope → s,
 * payload → p, signature → sig
 */
const COMPACT_ENCODE: Record<string, string> = {
  msg_type:  't',
  msg_id:    'i',
  timestamp: 'ts',
  from_rrn:  'f',
  to_rrn:    'to',
  scope:     's',
  payload:   'p',
  signature: 'sig',
};

const COMPACT_DECODE: Record<string, string> = Object.fromEntries(
  Object.entries(COMPACT_ENCODE).map(([k, v]) => [v, k]),
);

/** Serialize a RCANMessage to compact JSON bytes. */
export function encodeCompact(message: RCANMessage): Uint8Array {
  const full = message.toJSON();
  const compact: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(full)) {
    const short = COMPACT_ENCODE[key];
    compact[short ?? key] = value;
  }

  // Also abbreviate top-level RCAN-specific fields used in params
  if (compact['p'] && typeof compact['p'] === 'object') {
    const params = compact['p'] as Record<string, unknown>;
    const compactParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      const short = COMPACT_ENCODE[k];
      compactParams[short ?? k] = v;
    }
    compact['p'] = compactParams;
  }

  const json = JSON.stringify(compact);
  const encoder = new TextEncoder();
  return encoder.encode(json);
}

/** Deserialize compact JSON bytes to a RCANMessage. */
export function decodeCompact(data: Uint8Array): RCANMessage {
  const decoder = new TextDecoder();
  const json = decoder.decode(data);
  const compact = JSON.parse(json) as Record<string, unknown>;

  // Expand abbreviated keys back to full names
  const full: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(compact)) {
    const long = COMPACT_DECODE[key];
    full[long ?? key] = value;
  }

  // Expand params too
  if (full['payload'] && typeof full['payload'] === 'object') {
    const params = full['payload'] as Record<string, unknown>;
    const expandedParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      const long = COMPACT_DECODE[k];
      expandedParams[long ?? k] = v;
    }
    full['payload'] = expandedParams;
  }

  // Map compact top-level fields to RCANMessage constructor fields
  return new RCANMessage({
    rcan:        (full['rcan'] as string | undefined) ?? '1.6',
    rcanVersion: (full['rcanVersion'] as string | undefined),
    cmd:         (full['cmd'] as string),
    target:      (full['target'] as string),
    params:      (full['params'] as Record<string, unknown>) ?? (full['payload'] as Record<string, unknown>) ?? {},
    timestamp:   (full['timestamp'] as string | undefined),
    confidence:  (full['confidence'] as number | undefined),
    signature:   (full['signature'] as import('./message.js').SignatureBlock | undefined),
  });
}

// ── Minimal encoding (32 bytes, ESTOP only) ───────────────────────────────────

const MINIMAL_SIZE = 32;
const SAFETY_TYPE  = 6;

/**
 * Hash a UTF-8 string using SHA-256 (Web Crypto API, built-in Node 18+).
 * Returns the raw 32-byte digest.
 */
async function sha256Bytes(input: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(input);
  const ab = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(ab).set(encoded);
  // Use globalThis.crypto (Node 18+) or fall back to node:crypto webcrypto
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle: SubtleCrypto = (globalThis as any).crypto?.subtle
    ?? (await import('node:crypto' as string)).webcrypto.subtle;
  const hashBuffer = await subtle.digest('SHA-256', ab);
  return new Uint8Array(hashBuffer);
}

/**
 * Encode a SAFETY (type 6) message to a 32-byte minimal frame.
 *
 * Layout: [2B type][8B from_hash][8B to_hash][4B unix32][8B sig_truncated][2B checksum]
 *
 * - Only SAFETY (type 6) messages are accepted; throws `TransportError` for others.
 * - Runtime assertion: output MUST be exactly 32 bytes.
 */
export async function encodeMinimal(message: RCANMessage): Promise<Uint8Array> {
  const msgType = (message.params?.['msg_type'] as number | undefined) ?? 0;
  if (msgType !== SAFETY_TYPE) {
    throw new TransportError(
      `encodeMinimal only supports SAFETY (type 6) messages; got type=${msgType}`,
    );
  }

  const fromRrn = (message.params?.['from_rrn'] as string | undefined) ?? message.target ?? '';
  const toRrn   = (message.params?.['to_rrn']   as string | undefined) ?? message.target ?? '';

  const fromHash = await sha256Bytes(fromRrn);  // 32 bytes, take first 8
  const toHash   = await sha256Bytes(toRrn);    // 32 bytes, take first 8

  const sig      = (message.signature?.sig ?? '').replace(/[^A-Za-z0-9+/=]/g, '');
  let sigBytes: Uint8Array;
  try {
    if (typeof atob !== 'undefined') {
      const raw = atob(sig.slice(0, 16));
      sigBytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) sigBytes[i] = raw.charCodeAt(i);
    } else {
      sigBytes = Buffer.from(sig.slice(0, 16), 'base64');
    }
  } catch {
    sigBytes = new Uint8Array(8);
  }

  // Parse timestamp to unix32 (seconds)
  const ts = message.timestamp ? Math.floor(new Date(message.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000);
  const unix32 = ts >>> 0; // clamp to uint32

  const out = new Uint8Array(MINIMAL_SIZE);
  const view = new DataView(out.buffer);

  // [0..1] type (2 bytes)
  view.setUint16(0, SAFETY_TYPE, false);
  // [2..9] from_hash (8 bytes)
  out.set(fromHash.subarray(0, 8), 2);
  // [10..17] to_hash (8 bytes)
  out.set(toHash.subarray(0, 8), 10);
  // [18..21] unix32 (4 bytes)
  view.setUint32(18, unix32, false);
  // [22..29] sig_truncated (8 bytes)
  const sigSlice = new Uint8Array(8);
  sigSlice.set(sigBytes.subarray(0, Math.min(8, sigBytes.length)));
  out.set(sigSlice, 22);
  // [30..31] checksum (2 bytes) — simple XOR-16 of bytes 0..29
  let checksum = 0;
  for (let i = 0; i < 30; i++) checksum ^= (out[i] ?? 0);
  view.setUint16(30, checksum & 0xffff, false);

  // Runtime assertion
  if (out.length !== MINIMAL_SIZE) {
    throw new TransportError(
      `encodeMinimal assertion failed: expected ${MINIMAL_SIZE} bytes, got ${out.length}`,
    );
  }

  return out;
}

/**
 * Decode a 32-byte minimal frame to a partial RCANMessage.
 */
export function decodeMinimal(data: Uint8Array): Partial<RCANMessage> {
  if (data.length !== MINIMAL_SIZE) {
    throw new TransportError(
      `decodeMinimal: expected ${MINIMAL_SIZE} bytes, got ${data.length}`,
    );
  }

  const view     = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const msgType  = view.getUint16(0, false);
  const fromHash = data.subarray(2, 10);
  const toHash   = data.subarray(10, 18);
  const unix32   = view.getUint32(18, false);
  const sigTrunc = data.subarray(22, 30);
  // checksum at [30..31] — not verified here (structural decode only)

  const timestamp = new Date(unix32 * 1000).toISOString();
  const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');

  return {
    params: {
      msg_type:    msgType,
      from_hash:   toHex(fromHash),
      to_hash:     toHex(toHash),
      timestamp_s: unix32,
      sig_truncated: toHex(sigTrunc),
    },
    timestamp,
  } as unknown as Partial<RCANMessage>;
}

// ── BLE frame fragmentation ───────────────────────────────────────────────────

const DEFAULT_MTU = 251;
// 3-byte header: [1B frame_index][1B total_frames][1B flags (bit0=isFinal)]
const BLE_HEADER_SIZE = 3;

/**
 * Fragment a RCANMessage into BLE advertisement frames.
 * Compact JSON encoding is used for the payload; each chunk is ≤ `mtu` bytes.
 */
export function encodeBleFrames(message: RCANMessage, mtu: number = DEFAULT_MTU): Uint8Array[] {
  const payload = encodeCompact(message);
  const chunkSize = mtu - BLE_HEADER_SIZE;

  if (chunkSize <= 0) {
    throw new TransportError(`MTU ${mtu} is too small (need at least ${BLE_HEADER_SIZE + 1})`);
  }

  const totalChunks = Math.ceil(payload.length / chunkSize);
  const frames: Uint8Array[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunk = payload.subarray(i * chunkSize, (i + 1) * chunkSize);
    const frame = new Uint8Array(BLE_HEADER_SIZE + chunk.length);
    frame[0] = i;                                      // frame index
    frame[1] = totalChunks;                            // total frames
    frame[2] = i === totalChunks - 1 ? 0x01 : 0x00;   // flags: bit0 = isFinal
    frame.set(chunk, BLE_HEADER_SIZE);
    frames.push(frame);
  }

  return frames;
}

/**
 * Reassemble BLE frames (in order) into a RCANMessage.
 */
export function decodeBleFrames(frames: Uint8Array[]): RCANMessage {
  if (frames.length === 0) {
    throw new TransportError('decodeBleFrames: no frames provided');
  }

  // Sort by frame index (byte 0)
  const sorted = [...frames].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));

  // Validate total count consistency
  const expectedTotal = sorted[0]?.[1] ?? sorted.length;
  if (sorted.length !== expectedTotal) {
    throw new TransportError(
      `decodeBleFrames: expected ${expectedTotal} frames, got ${sorted.length}`,
    );
  }

  // Concatenate payload bytes (skip 3-byte header)
  const payloadChunks = sorted.map(f => f.subarray(BLE_HEADER_SIZE));
  const totalLen = payloadChunks.reduce((s, c) => s + c.length, 0);
  const payload = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of payloadChunks) {
    payload.set(chunk, offset);
    offset += chunk.length;
  }

  return decodeCompact(payload);
}

// ── Transport selection ───────────────────────────────────────────────────────

/**
 * Select the most appropriate transport encoding from an availability list.
 *
 * Priority:
 *  - SAFETY (type 6) messages: prefer MINIMAL → BLE → COMPACT → HTTP
 *  - All others: prefer HTTP → COMPACT → BLE
 */
export function selectTransport(
  available: TransportEncoding[],
  message:   RCANMessage,
): TransportEncoding {
  const msgType = (message.params?.['msg_type'] as number | undefined) ?? 0;
  const isSafety = msgType === SAFETY_TYPE;

  const has = (enc: TransportEncoding) => available.includes(enc);

  if (isSafety) {
    if (has(TransportEncoding.MINIMAL)) return TransportEncoding.MINIMAL;
    if (has(TransportEncoding.BLE))     return TransportEncoding.BLE;
    if (has(TransportEncoding.COMPACT)) return TransportEncoding.COMPACT;
    if (has(TransportEncoding.HTTP))    return TransportEncoding.HTTP;
  } else {
    if (has(TransportEncoding.HTTP))    return TransportEncoding.HTTP;
    if (has(TransportEncoding.COMPACT)) return TransportEncoding.COMPACT;
    if (has(TransportEncoding.BLE))     return TransportEncoding.BLE;
  }

  throw new TransportError(
    `No suitable transport available from: [${available.join(', ')}]`,
  );
}
