/**
 * RCAN Multi-modal Data — GAP-18.
 *
 * Provides inline and by-reference media attachment for RCANMessage,
 * streaming chunk helpers, and training-data message construction.
 * SHA-256 is computed via the Web Crypto API (built-in Node 18+).
 */

import { RCANMessage, MessageType } from './message.js';

// ── Enums & interfaces ────────────────────────────────────────────────────────

export enum MediaEncoding {
  BASE64 = 'base64',
  REF    = 'ref',
}

export interface MediaChunk {
  chunkId:    string;
  mimeType:   string;
  encoding:   MediaEncoding;
  hashSha256: string;
  dataB64?:   string;
  refUrl?:    string;
  sizeBytes:  number;
}

export interface StreamChunk {
  streamId:   string;
  chunkIndex: number;
  isFinal:    boolean;
  chunk:      MediaChunk;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

async function computeSha256Hex(data: Uint8Array): Promise<string> {
  // Use globalThis.crypto (Node 18+) or fall back to node:crypto webcrypto.
  // Bare `crypto` is not available in all Jest/Node environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle: SubtleCrypto = (globalThis as any).crypto?.subtle
    ?? (await import('node:crypto' as string)).webcrypto.subtle;
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  const hashBuffer = await subtle.digest('SHA-256', ab);
  const hashArray  = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

function uint8ToBase64(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  // Browser path
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i] ?? 0);
  return btoa(binary);
}

/**
 * Rebuild a RCANMessage from its toJSON() output with an overridden field.
 * We use RCANMessage.fromJSON which accepts Record<string, unknown>.
 */
function rebuildMessage(
  base: RCANMessage,
  overrides: Record<string, unknown>,
): RCANMessage {
  const data = { ...base.toJSON(), ...overrides };
  return RCANMessage.fromJSON(data as Record<string, unknown>);
}

// ── Core attachment helpers ───────────────────────────────────────────────────

/**
 * Attach inline (base64-encoded) media to a message.
 * SHA-256 is computed via Web Crypto API.
 */
export async function addMediaInline(
  message:  RCANMessage,
  data:     Uint8Array,
  mimeType: string,
): Promise<RCANMessage> {
  const hashSha256 = await computeSha256Hex(data);
  const dataB64    = uint8ToBase64(data);

  const chunk: MediaChunk = {
    chunkId:    generateId(),
    mimeType,
    encoding:   MediaEncoding.BASE64,
    hashSha256,
    dataB64,
    sizeBytes:  data.length,
  };

  const existing = (message.mediaChunks as unknown as MediaChunk[] | undefined) ?? [];
  return rebuildMessage(message, { mediaChunks: [...existing, chunk] });
}

/**
 * Attach a media reference (URL + pre-computed hash) to a message.
 */
export function addMediaRef(
  message:    RCANMessage,
  refUrl:     string,
  mimeType:   string,
  hashSha256: string,
  sizeBytes:  number,
): RCANMessage {
  const chunk: MediaChunk = {
    chunkId:    generateId(),
    mimeType,
    encoding:   MediaEncoding.REF,
    hashSha256,
    refUrl,
    sizeBytes,
  };

  const existing = (message.mediaChunks as unknown as MediaChunk[] | undefined) ?? [];
  return rebuildMessage(message, { mediaChunks: [...existing, chunk] });
}

/**
 * Validate media chunks on a message.
 * Checks that inline chunks have dataB64 and ref chunks have refUrl.
 */
export async function validateMediaChunks(
  message: RCANMessage,
): Promise<{ valid: boolean; reason: string }> {
  const chunks = (message.mediaChunks as unknown as MediaChunk[] | undefined) ?? [];

  if (chunks.length === 0) {
    return { valid: true, reason: 'no media chunks' };
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;

    if (!chunk.chunkId)    return { valid: false, reason: `chunk[${i}]: missing chunkId` };
    if (!chunk.mimeType)   return { valid: false, reason: `chunk[${i}]: missing mimeType` };
    if (!chunk.hashSha256) return { valid: false, reason: `chunk[${i}]: missing hashSha256` };
    if (chunk.sizeBytes < 0) return { valid: false, reason: `chunk[${i}]: sizeBytes must be >= 0` };

    if (chunk.encoding === MediaEncoding.BASE64) {
      if (!chunk.dataB64) {
        return { valid: false, reason: `chunk[${i}]: BASE64 encoding requires dataB64` };
      }
      // Verify hash
      let decoded: Uint8Array;
      try {
        if (typeof Buffer !== 'undefined') {
          decoded = Buffer.from(chunk.dataB64, 'base64');
        } else {
          const raw = atob(chunk.dataB64);
          decoded = new Uint8Array(raw.length);
          for (let j = 0; j < raw.length; j++) decoded[j] = raw.charCodeAt(j);
        }
      } catch {
        return { valid: false, reason: `chunk[${i}]: failed to decode base64 data` };
      }
      const actualHash = await computeSha256Hex(decoded);
      if (actualHash !== chunk.hashSha256) {
        return {
          valid:  false,
          reason: `chunk[${i}]: SHA-256 mismatch (expected ${chunk.hashSha256}, got ${actualHash})`,
        };
      }
    } else if (chunk.encoding === MediaEncoding.REF) {
      if (!chunk.refUrl) {
        return { valid: false, reason: `chunk[${i}]: REF encoding requires refUrl` };
      }
    } else {
      return { valid: false, reason: `chunk[${i}]: unknown encoding '${chunk.encoding as string}'` };
    }
  }

  return { valid: true, reason: 'ok' };
}

// ── Training data & streaming helpers ────────────────────────────────────────

/**
 * Build a TRAINING_DATA message (MessageType 10) with multiple media attachments.
 */
export async function makeTrainingDataMessage(
  media: Array<{ data: Uint8Array; mimeType: string }>,
): Promise<RCANMessage> {
  let msg = new RCANMessage({
    rcan:        '1.6',
    rcanVersion: '1.6',
    cmd:         'training_data',
    target:      'rcan://training/data',
    params: {
      msg_type: MessageType.TRAINING_DATA,
      msg_id:   generateId(),
    },
    timestamp: new Date().toISOString(),
  });

  for (const item of media) {
    msg = await addMediaInline(msg, item.data, item.mimeType);
  }

  return msg;
}

/**
 * Build a streaming chunk message wrapping a single media item.
 */
export async function makeStreamChunk(
  streamId:   string,
  data:       Uint8Array,
  mimeType:   string,
  chunkIndex: number,
  isFinal:    boolean,
): Promise<RCANMessage> {
  const hashSha256 = await computeSha256Hex(data);
  const dataB64    = uint8ToBase64(data);

  const chunk: MediaChunk = {
    chunkId:    generateId(),
    mimeType,
    encoding:   MediaEncoding.BASE64,
    hashSha256,
    dataB64,
    sizeBytes:  data.length,
  };

  const streamChunkMeta: StreamChunk = {
    streamId,
    chunkIndex,
    isFinal,
    chunk,
  };

  let msg = new RCANMessage({
    rcan:        '1.6',
    rcanVersion: '1.6',
    cmd:         'stream_chunk',
    target:      'rcan://streaming/chunk',
    params: {
      msg_type:     MessageType.SENSOR_DATA,
      msg_id:       generateId(),
      stream_chunk: streamChunkMeta,
    },
    timestamp: new Date().toISOString(),
  });

  // Attach the chunk via mediaChunks for easy access
  msg = rebuildMessage(msg, { mediaChunks: [chunk] });
  return msg;
}
