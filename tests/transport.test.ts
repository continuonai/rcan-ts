/**
 * Tests for src/transport.ts — GAP-17: Constrained Transport Encodings
 */

import {
  TransportEncoding,
  TransportError,
  encodeCompact,
  decodeCompact,
  encodeMinimal,
  decodeMinimal,
  encodeBleFrames,
  decodeBleFrames,
  selectTransport,
} from '../src/transport.js';
import { RCANMessage, MessageType } from '../src/message.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSafetyMsg(): RCANMessage {
  return new RCANMessage({
    cmd:       'estop',
    target:    'rcan://robot1',
    params: {
      msg_type:  MessageType.SAFETY,
      msg_id:    'test-id-1',
      from_rrn:  'rcan://controller1',
      to_rrn:    'rcan://robot1',
    },
    signature: { alg: 'Ed25519', kid: 'key1', sig: 'AAAABBBBCCCCDDDD' },
    timestamp: '2026-03-16T00:00:00.000Z',
  });
}

function makeCommandMsg(): RCANMessage {
  return new RCANMessage({
    cmd:    'move',
    target: 'rcan://robot1',
    params: {
      msg_type: MessageType.COMMAND,
      msg_id:   'cmd-id-1',
    },
    timestamp: '2026-03-16T00:00:00.000Z',
  });
}

// ── encodeCompact / decodeCompact ─────────────────────────────────────────────

describe('compact encoding', () => {
  test('produces a Uint8Array', () => {
    const msg = makeCommandMsg();
    const encoded = encodeCompact(msg);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);
  });

  test('compact round-trip preserves cmd and target', () => {
    const msg = makeCommandMsg();
    const encoded = encodeCompact(msg);
    const decoded = decodeCompact(encoded);
    expect(decoded.cmd).toBe(msg.cmd);
    expect(decoded.target).toBe(msg.target);
  });

  test('compact round-trip for safety message', () => {
    const msg = makeSafetyMsg();
    const encoded = encodeCompact(msg);
    const decoded = decodeCompact(encoded);
    expect(decoded.cmd).toBe(msg.cmd);
    expect(decoded.target).toBe(msg.target);
  });

  test('compact JSON is smaller than pretty-printed JSON', () => {
    const msg = makeCommandMsg();
    const compactBytes = encodeCompact(msg);
    const fullJson = new TextEncoder().encode(JSON.stringify(msg.toJSON(), null, 2));
    expect(compactBytes.length).toBeLessThan(fullJson.length);
  });
});

// ── encodeMinimal / decodeMinimal ─────────────────────────────────────────────

describe('minimal encoding', () => {
  test('encodeMinimal produces exactly 32 bytes', async () => {
    const msg = makeSafetyMsg();
    const encoded = await encodeMinimal(msg);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBe(32);
  });

  test('encodeMinimal throws for non-SAFETY messages', async () => {
    const msg = makeCommandMsg();
    await expect(encodeMinimal(msg)).rejects.toThrow(TransportError);
  });

  test('decodeMinimal returns partial message with msg_type=6', async () => {
    const msg = makeSafetyMsg();
    const encoded = await encodeMinimal(msg);
    const decoded = decodeMinimal(encoded);
    expect(decoded.params?.['msg_type']).toBe(6);
  });

  test('decodeMinimal returns a timestamp string', async () => {
    const msg = makeSafetyMsg();
    const encoded = await encodeMinimal(msg);
    const decoded = decodeMinimal(encoded);
    expect(typeof decoded.timestamp).toBe('string');
  });

  test('decodeMinimal throws for wrong byte count', () => {
    expect(() => decodeMinimal(new Uint8Array(10))).toThrow(TransportError);
  });

  test('from_hash and to_hash are hex strings', async () => {
    const msg = makeSafetyMsg();
    const encoded = await encodeMinimal(msg);
    const decoded = decodeMinimal(encoded);
    const fromHash = decoded.params?.['from_hash'] as string;
    const toHash   = decoded.params?.['to_hash']   as string;
    expect(fromHash).toMatch(/^[0-9a-f]{16}$/);
    expect(toHash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('two messages with same RRNs produce same from_hash', async () => {
    const msg1 = makeSafetyMsg();
    const msg2 = makeSafetyMsg();
    const enc1 = await encodeMinimal(msg1);
    const enc2 = await encodeMinimal(msg2);
    const dec1 = decodeMinimal(enc1);
    const dec2 = decodeMinimal(enc2);
    expect(dec1.params?.['from_hash']).toBe(dec2.params?.['from_hash']);
  });
});

// ── BLE frame encoding ────────────────────────────────────────────────────────

describe('BLE frame fragmentation', () => {
  test('produces at least one frame', () => {
    const msg = makeCommandMsg();
    const frames = encodeBleFrames(msg);
    expect(frames.length).toBeGreaterThanOrEqual(1);
  });

  test('each frame is <= default MTU (251 bytes)', () => {
    const msg = makeCommandMsg();
    const frames = encodeBleFrames(msg);
    for (const frame of frames) {
      expect(frame.length).toBeLessThanOrEqual(251);
    }
  });

  test('BLE round-trip preserves cmd and target', () => {
    const msg = makeCommandMsg();
    const frames = encodeBleFrames(msg);
    const decoded = decodeBleFrames(frames);
    expect(decoded.cmd).toBe(msg.cmd);
    expect(decoded.target).toBe(msg.target);
  });

  test('forces fragmentation with small MTU', () => {
    const msg = makeCommandMsg();
    const frames = encodeBleFrames(msg, 20);
    expect(frames.length).toBeGreaterThan(1);
  });

  test('small MTU round-trip is correct', () => {
    const msg = makeCommandMsg();
    const frames = encodeBleFrames(msg, 20);
    const decoded = decodeBleFrames(frames);
    expect(decoded.cmd).toBe(msg.cmd);
  });

  test('decodeBleFrames throws for empty frame list', () => {
    expect(() => decodeBleFrames([])).toThrow(TransportError);
  });

  test('encodeBleFrames throws for too-small MTU', () => {
    const msg = makeCommandMsg();
    expect(() => encodeBleFrames(msg, 3)).toThrow(TransportError);
  });

  test('last frame has isFinal flag set (byte 2 bit 0)', () => {
    const msg = makeCommandMsg();
    const frames = encodeBleFrames(msg, 20);
    const last = frames[frames.length - 1]!;
    expect(last[2]).toBe(0x01);
  });

  test('non-last frames do not have isFinal set', () => {
    const msg = makeCommandMsg();
    const frames = encodeBleFrames(msg, 20);
    if (frames.length > 1) {
      expect(frames[0]![2]).toBe(0x00);
    }
  });
});

// ── selectTransport ───────────────────────────────────────────────────────────

describe('selectTransport', () => {
  test('prefers MINIMAL for safety messages', () => {
    const msg = makeSafetyMsg();
    const result = selectTransport(
      [TransportEncoding.HTTP, TransportEncoding.COMPACT, TransportEncoding.MINIMAL],
      msg,
    );
    expect(result).toBe(TransportEncoding.MINIMAL);
  });

  test('falls back to BLE for safety when minimal unavailable', () => {
    const msg = makeSafetyMsg();
    const result = selectTransport(
      [TransportEncoding.HTTP, TransportEncoding.BLE],
      msg,
    );
    expect(result).toBe(TransportEncoding.BLE);
  });

  test('prefers HTTP for non-safety messages', () => {
    const msg = makeCommandMsg();
    const result = selectTransport(
      [TransportEncoding.HTTP, TransportEncoding.COMPACT, TransportEncoding.BLE],
      msg,
    );
    expect(result).toBe(TransportEncoding.HTTP);
  });

  test('falls back to COMPACT when HTTP unavailable', () => {
    const msg = makeCommandMsg();
    const result = selectTransport(
      [TransportEncoding.COMPACT, TransportEncoding.BLE],
      msg,
    );
    expect(result).toBe(TransportEncoding.COMPACT);
  });

  test('throws TransportError when no suitable encoding', () => {
    const msg = makeCommandMsg();
    expect(() => selectTransport([], msg)).toThrow(TransportError);
  });
});

// ── TransportEncoding enum ────────────────────────────────────────────────────

describe('TransportEncoding enum', () => {
  test('has expected values', () => {
    expect(TransportEncoding.HTTP).toBe('http');
    expect(TransportEncoding.COMPACT).toBe('compact');
    expect(TransportEncoding.MINIMAL).toBe('minimal');
    expect(TransportEncoding.BLE).toBe('ble');
  });
});
