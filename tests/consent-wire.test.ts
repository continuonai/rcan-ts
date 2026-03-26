import { jest } from "@jest/globals";
/**
 * Tests for RCAN Consent Wire Protocol (GAP-05)
 */

import {
  makeConsentRequest,
  makeConsentGrant,
  makeConsentDeny,
  validateConsentMessage,
} from "../src/consent";
import { MessageType, RCANMessage } from "../src/message";

const BASE_REQUEST = {
  requesterRuri: "rcan://registry.rcan.dev/acme/arm/v1/robot-a",
  requesterOwner: "owner-a",
  targetRuri: "rcan://registry.rcan.dev/acme/arm/v1/robot-b",
  requestedScopes: ["control", "status"],
  durationHours: 24,
  justification: "Collaborative assembly task",
  requestId: "req-001",
};

describe("makeConsentRequest", () => {
  test("builds a CONSENT_REQUEST message", () => {
    const msg = makeConsentRequest(BASE_REQUEST);
    expect(msg.cmd).toBe("CONSENT_REQUEST");
    expect(msg.params.message_type).toBe(MessageType.CONSENT_REQUEST);
    expect(msg.params.request_id).toBe("req-001");
  });

  test("includes all required fields", () => {
    const msg = makeConsentRequest(BASE_REQUEST);
    expect(msg.params.requester_ruri).toBe(BASE_REQUEST.requesterRuri);
    expect(msg.params.target_ruri).toBe(BASE_REQUEST.targetRuri);
    expect(msg.params.requested_scopes).toEqual(BASE_REQUEST.requestedScopes);
    expect(msg.params.duration_hours).toBe(24);
    expect(msg.params.justification).toBe("Collaborative assembly task");
  });

  test("auto-generates request_id if not provided", () => {
    const { requestId: _, ...rest } = BASE_REQUEST;
    const msg = makeConsentRequest(rest);
    expect(typeof msg.params.request_id).toBe("string");
    expect((msg.params.request_id as string).length).toBeGreaterThan(0);
  });

  test("defaults consent_type to cross_robot", () => {
    const msg = makeConsentRequest(BASE_REQUEST);
    expect(msg.params.consent_type).toBe("cross_robot");
  });

  test("supports training_data consent_type", () => {
    const msg = makeConsentRequest({ ...BASE_REQUEST, consentType: "training_data" });
    expect(msg.params.consent_type).toBe("training_data");
  });

  test("includes data_categories when provided", () => {
    const msg = makeConsentRequest({
      ...BASE_REQUEST,
      dataCategories: ["video", "audio"],
    });
    expect(msg.params.data_categories).toEqual(["video", "audio"]);
  });
});

describe("makeConsentGrant", () => {
  test("builds a CONSENT_GRANT message", () => {
    const msg = makeConsentGrant({ requestId: "req-001", grantedScopes: ["control"] });
    expect(msg.cmd).toBe("CONSENT_GRANT");
    expect(msg.params.message_type).toBe(MessageType.CONSENT_GRANT);
    expect(msg.params.request_id).toBe("req-001");
    expect(msg.params.granted_scopes).toEqual(["control"]);
  });

  test("auto-sets expires_at if not provided", () => {
    const msg = makeConsentGrant({ requestId: "req-002" });
    expect(typeof msg.params.expires_at).toBe("string");
    expect(new Date(msg.params.expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  test("uses provided expires_at", () => {
    const expiry = "2027-01-01T00:00:00.000Z";
    const msg = makeConsentGrant({ requestId: "req-003", expiresAt: expiry });
    expect(msg.params.expires_at).toBe(expiry);
  });
});

describe("makeConsentDeny", () => {
  test("builds a CONSENT_DENY message", () => {
    const msg = makeConsentDeny({ requestId: "req-001", reason: "not authorized" });
    expect(msg.cmd).toBe("CONSENT_DENY");
    expect(msg.params.message_type).toBe(MessageType.CONSENT_DENY);
    expect(msg.params.request_id).toBe("req-001");
    expect(msg.params.reason).toBe("not authorized");
  });

  test("defaults reason to denied", () => {
    const msg = makeConsentDeny({ requestId: "req-002" });
    expect(msg.params.reason).toBe("denied");
  });
});

describe("validateConsentMessage", () => {
  test("validates a valid CONSENT_REQUEST", () => {
    const msg = makeConsentRequest(BASE_REQUEST);
    const result = validateConsentMessage(msg);
    expect(result.valid).toBe(true);
  });

  test("validates a valid CONSENT_GRANT", () => {
    const msg = makeConsentGrant({ requestId: "req-001" });
    const result = validateConsentMessage(msg);
    expect(result.valid).toBe(true);
  });

  test("validates a valid CONSENT_DENY", () => {
    const msg = makeConsentDeny({ requestId: "req-001" });
    const result = validateConsentMessage(msg);
    expect(result.valid).toBe(true);
  });

  test("rejects CONSENT_REQUEST without requestedScopes", () => {
    const msg = makeConsentRequest({ ...BASE_REQUEST, requestedScopes: [] });
    const result = validateConsentMessage(msg);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("requested_scopes");
  });

  test("rejects CONSENT_REQUEST without justification", () => {
    const msg = makeConsentRequest({ ...BASE_REQUEST, justification: "" });
    // Override to remove justification
    const badMsg = new RCANMessage({
      rcan: "1.5",
      cmd: "CONSENT_REQUEST",
      target: BASE_REQUEST.targetRuri,
      params: {
        message_type: MessageType.CONSENT_REQUEST,
        requester_ruri: BASE_REQUEST.requesterRuri,
        target_ruri: BASE_REQUEST.targetRuri,
        requested_scopes: BASE_REQUEST.requestedScopes,
        duration_hours: 24,
        request_id: "req-001",
        consent_type: "cross_robot",
        data_categories: [],
        // justification intentionally omitted
      },
    });
    const result = validateConsentMessage(badMsg);
    expect(result.valid).toBe(false);
  });

  test("returns invalid for unknown consent command", () => {
    const msg = new RCANMessage({ rcan: "1.5", cmd: "UNKNOWN_CONSENT", target: "rcan://x/a/b/v1/y", params: {} });
    const result = validateConsentMessage(msg);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("unknown");
  });
});
