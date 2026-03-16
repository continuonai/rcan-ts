/**
 * Tests for RCAN Training Data Consent (GAP-10)
 */

import {
  DataCategory,
  makeTrainingConsentRequest,
  makeTrainingConsentGrant,
  makeTrainingConsentDeny,
  validateTrainingDataMessage,
} from "../src/trainingConsent";
import { RCANMessage, MessageType } from "../src/message";

const BASE_PARAMS = {
  requesterRuri: "rcan://registry.rcan.dev/acme/arm/v1/robot-a",
  requesterOwner: "owner-a",
  targetRuri: "rcan://registry.rcan.dev/acme/arm/v1/robot-b",
  dataCategories: [DataCategory.VIDEO, DataCategory.BIOMETRIC],
  durationHours: 48,
  justification: "Training human pose estimation model",
  requestId: "train-req-001",
};

describe("DataCategory enum", () => {
  test("VIDEO = video", () => { expect(DataCategory.VIDEO).toBe("video"); });
  test("AUDIO = audio", () => { expect(DataCategory.AUDIO).toBe("audio"); });
  test("LOCATION = location", () => { expect(DataCategory.LOCATION).toBe("location"); });
  test("BIOMETRIC = biometric", () => { expect(DataCategory.BIOMETRIC).toBe("biometric"); });
  test("TELEMETRY = telemetry", () => { expect(DataCategory.TELEMETRY).toBe("telemetry"); });
});

describe("makeTrainingConsentRequest", () => {
  test("builds a training consent request with consent_type=training_data", () => {
    const msg = makeTrainingConsentRequest(BASE_PARAMS);
    expect(msg.cmd).toBe("CONSENT_REQUEST");
    expect(msg.params.consent_type).toBe("training_data");
    expect(msg.params.data_categories).toEqual([DataCategory.VIDEO, DataCategory.BIOMETRIC]);
  });

  test("sets requested_scopes to training_data", () => {
    const msg = makeTrainingConsentRequest(BASE_PARAMS);
    expect(msg.params.requested_scopes).toEqual(["training_data"]);
  });

  test("includes requester and target URIs", () => {
    const msg = makeTrainingConsentRequest(BASE_PARAMS);
    expect(msg.params.requester_ruri).toBe(BASE_PARAMS.requesterRuri);
    expect(msg.params.target_ruri).toBe(BASE_PARAMS.targetRuri);
  });

  test("includes justification and duration", () => {
    const msg = makeTrainingConsentRequest(BASE_PARAMS);
    expect(msg.params.justification).toBe(BASE_PARAMS.justification);
    expect(msg.params.duration_hours).toBe(48);
  });
});

describe("makeTrainingConsentGrant", () => {
  test("builds a CONSENT_GRANT", () => {
    const msg = makeTrainingConsentGrant({
      requestId: "train-req-001",
      grantedScopes: ["training_data"],
    });
    expect(msg.cmd).toBe("CONSENT_GRANT");
    expect(msg.params.request_id).toBe("train-req-001");
  });
});

describe("makeTrainingConsentDeny", () => {
  test("builds a CONSENT_DENY", () => {
    const msg = makeTrainingConsentDeny({ requestId: "train-req-001", reason: "subject declined" });
    expect(msg.cmd).toBe("CONSENT_DENY");
    expect(msg.params.reason).toBe("subject declined");
  });
});

describe("validateTrainingDataMessage", () => {
  function makeTrainingMsg(consentToken?: string) {
    return new RCANMessage({
      rcan: "1.5",
      cmd: "TRAINING_DATA",
      target: "rcan://r/a/b/v1/x",
      params: {
        message_type: MessageType.TRAINING_DATA,
        data_categories: ["video"],
        ...(consentToken !== undefined ? { consent_token: consentToken } : {}),
      },
    });
  }

  test("rejects TRAINING_DATA without consent_token", () => {
    const msg = makeTrainingMsg();
    const result = validateTrainingDataMessage(msg);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("consent_token");
  });

  test("rejects TRAINING_DATA with empty consent_token", () => {
    const msg = makeTrainingMsg("");
    const result = validateTrainingDataMessage(msg);
    expect(result.valid).toBe(false);
  });

  test("accepts TRAINING_DATA with valid consent_token", () => {
    const msg = makeTrainingMsg("ct-abc123-valid");
    const result = validateTrainingDataMessage(msg);
    expect(result.valid).toBe(true);
  });

  test("rejects non-TRAINING_DATA message", () => {
    const msg = new RCANMessage({
      rcan: "1.5",
      cmd: "STATUS",
      target: "rcan://r/a/b/v1/x",
      params: { message_type: MessageType.STATUS },
    });
    const result = validateTrainingDataMessage(msg);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("TRAINING_DATA");
  });
});
