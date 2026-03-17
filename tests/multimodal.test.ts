/**
 * Tests for src/multimodal.ts — GAP-18: Multi-modal Data
 */

import {
  MediaEncoding,
  addMediaInline,
  addMediaRef,
  validateMediaChunks,
  makeTrainingDataMessage,
  makeStreamChunk,
  type MediaChunk,
} from '../src/multimodal.js';
import { RCANMessage, MessageType } from '../src/message.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBaseMsg(): RCANMessage {
  return new RCANMessage({
    cmd:    'sensor_update',
    target: 'rcan://robot1',
    params: { msg_type: MessageType.SENSOR_DATA },
  });
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// SHA-256 of the empty string (known value)
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
// SHA-256 of 0x61 ('a')
const A_SHA256 = 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb';

// ── addMediaInline ────────────────────────────────────────────────────────────

describe('addMediaInline', () => {
  test('returns a new RCANMessage', async () => {
    const msg = makeBaseMsg();
    const result = await addMediaInline(msg, new Uint8Array([1, 2, 3]), 'application/octet-stream');
    expect(result).toBeInstanceOf(RCANMessage);
  });

  test('adds a mediaChunk to the message', async () => {
    const msg = makeBaseMsg();
    const result = await addMediaInline(msg, new Uint8Array([1, 2, 3]), 'image/png');
    const chunks = result.mediaChunks as unknown as MediaChunk[];
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.mimeType).toBe('image/png');
    expect(chunks[0]!.encoding).toBe(MediaEncoding.BASE64);
    expect(chunks[0]!.sizeBytes).toBe(3);
  });

  test('computes correct SHA-256 for empty data', async () => {
    const msg = makeBaseMsg();
    const result = await addMediaInline(msg, new Uint8Array(0), 'text/plain');
    const chunks = result.mediaChunks as unknown as MediaChunk[];
    expect(chunks[0]!.hashSha256).toBe(EMPTY_SHA256);
  });

  test('computes correct SHA-256 for 0x61 byte', async () => {
    const msg = makeBaseMsg();
    const result = await addMediaInline(msg, new Uint8Array([0x61]), 'text/plain');
    const chunks = result.mediaChunks as unknown as MediaChunk[];
    expect(chunks[0]!.hashSha256).toBe(A_SHA256);
  });

  test('accumulates multiple chunks', async () => {
    let msg = makeBaseMsg();
    msg = await addMediaInline(msg, new Uint8Array([1]), 'image/png');
    msg = await addMediaInline(msg, new Uint8Array([2]), 'image/jpeg');
    const chunks = msg.mediaChunks as unknown as MediaChunk[];
    expect(chunks).toHaveLength(2);
  });

  test('chunk has valid base64 data', async () => {
    const msg = makeBaseMsg();
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const result = await addMediaInline(msg, data, 'text/plain');
    const chunks = result.mediaChunks as unknown as MediaChunk[];
    const decoded = Buffer.from(chunks[0]!.dataB64!, 'base64');
    expect(decoded).toEqual(Buffer.from(data));
  });

  test('does not mutate the original message', async () => {
    const msg = makeBaseMsg();
    await addMediaInline(msg, new Uint8Array([1]), 'image/png');
    expect(msg.mediaChunks).toBeUndefined();
  });
});

// ── addMediaRef ───────────────────────────────────────────────────────────────

describe('addMediaRef', () => {
  test('adds a REF chunk to the message', () => {
    const msg = makeBaseMsg();
    const result = addMediaRef(msg, 'https://storage.example.com/img.jpg', 'image/jpeg', A_SHA256, 1024);
    const chunks = result.mediaChunks as unknown as MediaChunk[];
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.encoding).toBe(MediaEncoding.REF);
    expect(chunks[0]!.refUrl).toBe('https://storage.example.com/img.jpg');
    expect(chunks[0]!.hashSha256).toBe(A_SHA256);
    expect(chunks[0]!.sizeBytes).toBe(1024);
  });

  test('ref chunk has no dataB64', () => {
    const msg = makeBaseMsg();
    const result = addMediaRef(msg, 'https://storage.example.com/img.jpg', 'image/jpeg', A_SHA256, 100);
    const chunks = result.mediaChunks as unknown as MediaChunk[];
    expect(chunks[0]!.dataB64).toBeUndefined();
  });

  test('does not mutate original message', () => {
    const msg = makeBaseMsg();
    addMediaRef(msg, 'https://example.com/x', 'image/png', A_SHA256, 0);
    expect(msg.mediaChunks).toBeUndefined();
  });
});

// ── validateMediaChunks ───────────────────────────────────────────────────────

describe('validateMediaChunks', () => {
  test('valid with no chunks', async () => {
    const msg = makeBaseMsg();
    const result = await validateMediaChunks(msg);
    expect(result.valid).toBe(true);
  });

  test('valid inline chunk passes', async () => {
    const msg = makeBaseMsg();
    const withChunk = await addMediaInline(msg, new Uint8Array([0x61]), 'text/plain');
    const result = await validateMediaChunks(withChunk);
    expect(result.valid).toBe(true);
  });

  test('valid ref chunk passes', async () => {
    const msg = makeBaseMsg();
    const withChunk = addMediaRef(msg, 'https://example.com/x', 'image/png', A_SHA256, 1);
    const result = await validateMediaChunks(withChunk);
    expect(result.valid).toBe(true);
  });

  test('inline chunk with wrong hash fails', async () => {
    const msg = makeBaseMsg();
    const withChunk = await addMediaInline(msg, new Uint8Array([0x61]), 'text/plain');
    const chunks = withChunk.mediaChunks as unknown as MediaChunk[];
    // Tamper the hash
    const tampered = RCANMessage.fromJSON({
      ...withChunk.toJSON(),
      mediaChunks: [{ ...chunks[0]!, hashSha256: 'badhash0000000000000000000000000000000000000000000000000000000000' }],
    } as Record<string, unknown>);
    const result = await validateMediaChunks(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('SHA-256 mismatch');
  });

  test('inline chunk without dataB64 fails', async () => {
    const msg = makeBaseMsg();
    const withChunk = await addMediaInline(msg, new Uint8Array([0x61]), 'text/plain');
    const chunks = withChunk.mediaChunks as unknown as MediaChunk[];
    const { dataB64: _removed, ...chunkWithout } = chunks[0]!;
    const tampered = RCANMessage.fromJSON({
      ...withChunk.toJSON(),
      mediaChunks: [chunkWithout],
    } as Record<string, unknown>);
    const result = await validateMediaChunks(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('BASE64 encoding requires dataB64');
  });

  test('ref chunk without refUrl fails', async () => {
    const msg = makeBaseMsg();
    const withChunk = addMediaRef(msg, 'https://example.com/x', 'image/png', A_SHA256, 1);
    const chunks = withChunk.mediaChunks as unknown as MediaChunk[];
    const { refUrl: _removed, ...chunkWithout } = chunks[0]!;
    const tampered = RCANMessage.fromJSON({
      ...withChunk.toJSON(),
      mediaChunks: [chunkWithout],
    } as Record<string, unknown>);
    const result = await validateMediaChunks(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('REF encoding requires refUrl');
  });
});

// ── makeTrainingDataMessage ───────────────────────────────────────────────────

describe('makeTrainingDataMessage', () => {
  test('creates a TRAINING_DATA message', async () => {
    const msg = await makeTrainingDataMessage([
      { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
    ]);
    expect(msg).toBeInstanceOf(RCANMessage);
    expect(msg.cmd).toBe('training_data');
    expect(msg.params?.['msg_type']).toBe(MessageType.TRAINING_DATA);
  });

  test('attaches all media items as chunks', async () => {
    const msg = await makeTrainingDataMessage([
      { data: new Uint8Array([1]),    mimeType: 'image/png' },
      { data: new Uint8Array([2, 3]), mimeType: 'audio/wav' },
    ]);
    const chunks = msg.mediaChunks as unknown as MediaChunk[];
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.mimeType).toBe('image/png');
    expect(chunks[1]!.mimeType).toBe('audio/wav');
  });

  test('empty media list creates message with no chunks', async () => {
    const msg = await makeTrainingDataMessage([]);
    expect(msg.mediaChunks).toBeUndefined();
  });
});

// ── makeStreamChunk ───────────────────────────────────────────────────────────

describe('makeStreamChunk', () => {
  test('creates a stream chunk message', async () => {
    const msg = await makeStreamChunk('stream-abc', new Uint8Array([10, 20]), 'video/h264', 0, false);
    expect(msg).toBeInstanceOf(RCANMessage);
    expect(msg.cmd).toBe('stream_chunk');
  });

  test('media chunk has correct properties', async () => {
    const data = new Uint8Array([0x61]);
    const msg = await makeStreamChunk('s1', data, 'text/plain', 3, true);
    const chunks = msg.mediaChunks as unknown as MediaChunk[];
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.mimeType).toBe('text/plain');
    expect(chunks[0]!.hashSha256).toBe(A_SHA256);
    expect(chunks[0]!.sizeBytes).toBe(1);
  });

  test('stream_chunk metadata is in params', async () => {
    const msg = await makeStreamChunk('s1', new Uint8Array([1]), 'image/png', 5, true);
    const meta = msg.params?.['stream_chunk'] as { streamId: string; chunkIndex: number; isFinal: boolean };
    expect(meta.streamId).toBe('s1');
    expect(meta.chunkIndex).toBe(5);
    expect(meta.isFinal).toBe(true);
  });
});

// ── MediaEncoding enum ────────────────────────────────────────────────────────

describe('MediaEncoding enum', () => {
  test('BASE64 = "base64"', () => expect(MediaEncoding.BASE64).toBe('base64'));
  test('REF = "ref"',       () => expect(MediaEncoding.REF).toBe('ref'));
});
