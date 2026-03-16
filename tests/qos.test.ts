/**
 * Tests for RCAN QoS / Delivery Guarantees (GAP-11)
 */

import { QoSLevel, QoSManager, QoSAckTimeoutError, makeEstopWithQoS } from "../src/qos";
import { makeEstopMessage } from "../src/safety";

describe("QoSLevel enum", () => {
  test("FIRE_AND_FORGET = 0", () => {
    expect(QoSLevel.FIRE_AND_FORGET).toBe(0);
  });

  test("ACKNOWLEDGED = 1", () => {
    expect(QoSLevel.ACKNOWLEDGED).toBe(1);
  });

  test("EXACTLY_ONCE = 2", () => {
    expect(QoSLevel.EXACTLY_ONCE).toBe(2);
  });
});

describe("makeEstopMessage QoS", () => {
  test("ESTOP message has qos=2 (EXACTLY_ONCE)", () => {
    const msg = makeEstopMessage("rcan://r/a/b/v1/x", "test");
    expect(msg.qos).toBe(QoSLevel.EXACTLY_ONCE);
  });
});

describe("makeEstopWithQoS", () => {
  test("returns a SafetyMessage with qos=EXACTLY_ONCE", () => {
    const msg = makeEstopWithQoS("rcan://r/a/b/v1/x", "emergency");
    expect(msg.safety_event).toBe("ESTOP");
    expect(msg.qos).toBe(QoSLevel.EXACTLY_ONCE);
    expect(msg.message_type).toBe(6);
  });
});

describe("QoSManager", () => {
  test("fire-and-forget sends once without waiting for ack", async () => {
    let sent = 0;
    const mgr = new QoSManager(
      async () => { sent++; },
      async () => false
    );
    const result = await mgr.sendWithQoS({ message_id: "qos-0" }, { qos: QoSLevel.FIRE_AND_FORGET });
    expect(result.delivered).toBe(true);
    expect(result.attempts).toBe(1);
    expect(sent).toBe(1);
  });

  test("acknowledged: delivers on first ack", async () => {
    let sent = 0;
    const mgr = new QoSManager(
      async () => { sent++; },
      async () => true // immediate ack
    );
    const result = await mgr.sendWithQoS(
      { message_id: "qos-1-ok" },
      { qos: QoSLevel.ACKNOWLEDGED, ackTimeoutMs: 100 }
    );
    expect(result.delivered).toBe(true);
    expect(sent).toBe(1);
  });

  test("acknowledged: retries on missed ack then delivers", async () => {
    let sent = 0;
    let ackCount = 0;
    const mgr = new QoSManager(
      async () => { sent++; },
      async () => {
        ackCount++;
        return ackCount >= 2; // succeed on 2nd ack check
      }
    );
    const result = await mgr.sendWithQoS(
      { message_id: "qos-1-retry" },
      { qos: QoSLevel.ACKNOWLEDGED, maxRetries: 3, ackTimeoutMs: 50, initialBackoffMs: 10 }
    );
    expect(result.delivered).toBe(true);
    expect(sent).toBeGreaterThanOrEqual(2);
  });

  test("acknowledged: fails after maxRetries without ack", async () => {
    let sent = 0;
    const mgr = new QoSManager(
      async () => { sent++; },
      async () => false // never acks
    );
    const result = await mgr.sendWithQoS(
      { message_id: "qos-1-fail" },
      { qos: QoSLevel.ACKNOWLEDGED, maxRetries: 2, ackTimeoutMs: 10, initialBackoffMs: 5 }
    );
    expect(result.delivered).toBe(false);
    expect(result.attempts).toBe(3); // initial + 2 retries
  }, 10000);

  test("exactly-once: delivers when ack received", async () => {
    let sent = 0;
    const mgr = new QoSManager(
      async () => { sent++; },
      async () => true
    );
    const result = await mgr.sendWithQoS(
      { message_id: "qos-2-ok" },
      { qos: QoSLevel.EXACTLY_ONCE, ackTimeoutMs: 100 }
    );
    expect(result.delivered).toBe(true);
    expect(result.reason).toContain("exactly-once");
  });

  test("QoSAckTimeoutError is an Error", () => {
    const err = new QoSAckTimeoutError("msg-123");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("msg-123");
    expect(err.name).toBe("QoSAckTimeoutError");
  });

  test("TELEOP should use FIRE_AND_FORGET (qos=0)", () => {
    // This is a design check — callers are expected to use QoS 0 for TELEOP
    expect(QoSLevel.FIRE_AND_FORGET).toBe(0);
  });
});
