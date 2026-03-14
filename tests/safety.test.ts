import {
  makeEstopMessage,
  makeStopMessage,
  makeResumeMessage,
  isSafetyMessage,
  validateSafetyMessage,
  SAFETY_MESSAGE_TYPE,
  SafetyMessage,
} from '../src/safety';

describe('RCAN Safety Messages', () => {
  test('makeEstopMessage creates valid message', () => {
    const msg = makeEstopMessage('rcan://robot-001/arm', 'collision imminent');
    expect(msg.message_type).toBe(6);
    expect(msg.ruri).toBe('rcan://robot-001/arm');
    expect(msg.safety_event).toBe('ESTOP');
    expect(msg.reason).toBe('collision imminent');
    expect(typeof msg.timestamp_ms).toBe('number');
    expect(msg.timestamp_ms).toBeGreaterThan(0);
    expect(typeof msg.message_id).toBe('string');
    expect(msg.message_id.length).toBeGreaterThan(0);
  });

  test('makeStopMessage has safety_event STOP', () => {
    const msg = makeStopMessage('rcan://robot-002/base', 'operator halt');
    expect(msg.safety_event).toBe('STOP');
    expect(msg.message_type).toBe(6);
    expect(msg.ruri).toBe('rcan://robot-002/base');
  });

  test('makeResumeMessage has safety_event RESUME', () => {
    const msg = makeResumeMessage('rcan://robot-003/wheels', 'area cleared');
    expect(msg.safety_event).toBe('RESUME');
    expect(msg.message_type).toBe(6);
    expect(msg.ruri).toBe('rcan://robot-003/wheels');
  });

  test('isSafetyMessage detects type 6', () => {
    const msg = makeEstopMessage('rcan://bot/1', 'test');
    expect(isSafetyMessage(msg)).toBe(true);
    expect(isSafetyMessage({ message_type: 1, ruri: 'rcan://bot/1' })).toBe(false);
    expect(isSafetyMessage({ message_type: 6 })).toBe(true);
    expect(isSafetyMessage({ message_type: 0 })).toBe(false);
    expect(isSafetyMessage(null)).toBe(false);
    expect(isSafetyMessage('not an object')).toBe(false);
  });

  test('SAFETY_MESSAGE_TYPE constant is 6', () => {
    expect(SAFETY_MESSAGE_TYPE).toBe(6);
  });

  test('validateSafetyMessage returns empty for valid message', () => {
    const msg = makeEstopMessage('rcan://bot/1', 'test reason');
    const errors = validateSafetyMessage(msg);
    expect(errors).toHaveLength(0);
  });

  test('validateSafetyMessage catches missing reason', () => {
    const msg: Partial<SafetyMessage> = {
      message_type: 6,
      ruri: 'rcan://bot/1',
      safety_event: 'ESTOP',
      reason: '',
      message_id: 'abc-123',
      timestamp_ms: Date.now(),
    };
    const errors = validateSafetyMessage(msg);
    expect(errors).toContain('reason is required');
  });

  test('validateSafetyMessage catches missing ruri', () => {
    const msg: Partial<SafetyMessage> = {
      message_type: 6,
      safety_event: 'STOP',
      reason: 'something',
      message_id: 'abc-123',
      timestamp_ms: Date.now(),
    };
    const errors = validateSafetyMessage(msg);
    expect(errors).toContain('ruri is required');
  });

  test('validateSafetyMessage catches invalid safety_event', () => {
    const msg = {
      message_type: 6 as const,
      ruri: 'rcan://bot/1',
      safety_event: 'INVALID' as any,
      reason: 'test',
      message_id: 'abc-123',
      timestamp_ms: Date.now(),
    };
    const errors = validateSafetyMessage(msg);
    expect(errors).toContain('safety_event must be ESTOP, STOP, or RESUME');
  });

  test('validateSafetyMessage catches wrong message_type', () => {
    const msg = {
      message_type: 1 as any,
      ruri: 'rcan://bot/1',
      safety_event: 'ESTOP' as const,
      reason: 'test',
      message_id: 'abc-123',
      timestamp_ms: Date.now(),
    };
    const errors = validateSafetyMessage(msg);
    expect(errors).toContain('message_type must be 6');
  });

  test('reason truncated at 512 chars', () => {
    const longReason = 'x'.repeat(600);
    const msg = makeEstopMessage('rcan://bot/1', longReason);
    expect(msg.reason.length).toBe(512);
  });

  test('each message gets a unique message_id', () => {
    const msg1 = makeEstopMessage('rcan://bot/1', 'test');
    const msg2 = makeEstopMessage('rcan://bot/1', 'test');
    expect(msg1.message_id).not.toBe(msg2.message_id);
  });

  test('timestamp_ms is recent', () => {
    const before = Date.now();
    const msg = makeStopMessage('rcan://bot/1', 'test');
    const after = Date.now();
    expect(msg.timestamp_ms).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp_ms).toBeLessThanOrEqual(after);
  });
});
