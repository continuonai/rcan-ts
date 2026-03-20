import {
  CONTRIBUTE_SCOPE_LEVEL,
  makeContributeRequest,
  makeContributeResult,
  makeContributeCancel,
  validateContributeScope,
  isPreemptedBy,
} from "../src/contribute";
import { MessageType } from "../src/message";

describe("ContributeRequest", () => {
  it("creates with defaults", () => {
    const req = makeContributeRequest();
    expect(req.type).toBe(MessageType.CONTRIBUTE_REQUEST);
    expect(req.type).toBe(33);
    expect(req.request_id).toBeTruthy();
    expect(req.resource_type).toBe("cpu");
  });

  it("accepts all params", () => {
    const req = makeContributeRequest({
      project_id: "climate-42",
      project_name: "Climate Modeling",
      work_unit_id: "wu-001",
      resource_type: "npu",
      estimated_duration_s: 300,
      priority: 5,
      payload: { model: "weatherbench" },
    });
    expect(req.project_id).toBe("climate-42");
    expect(req.resource_type).toBe("npu");
    expect(req.estimated_duration_s).toBe(300);
  });
});

describe("ContributeResult", () => {
  it("creates completed by default", () => {
    const result = makeContributeResult();
    expect(result.type).toBe(MessageType.CONTRIBUTE_RESULT);
    expect(result.type).toBe(34);
    expect(result.status).toBe("completed");
  });

  it("supports failed with error message", () => {
    const result = makeContributeResult({
      status: "failed",
      error_message: "Out of memory",
    });
    expect(result.status).toBe("failed");
    expect(result.error_message).toBe("Out of memory");
  });

  it("supports preempted status", () => {
    const result = makeContributeResult({ status: "preempted" });
    expect(result.status).toBe("preempted");
  });

  it("omits error_message when undefined", () => {
    const result = makeContributeResult();
    expect(result.error_message).toBeUndefined();
  });

  it("tracks compute units and duration", () => {
    const result = makeContributeResult({
      duration_s: 120.5,
      compute_units: 42,
      resource_type: "gpu",
    });
    expect(result.duration_s).toBe(120.5);
    expect(result.compute_units).toBe(42);
    expect(result.resource_type).toBe("gpu");
  });
});

describe("ContributeCancel", () => {
  it("creates with message type 35", () => {
    const cancel = makeContributeCancel();
    expect(cancel.type).toBe(MessageType.CONTRIBUTE_CANCEL);
    expect(cancel.type).toBe(35);
  });

  it("accepts reason", () => {
    const cancel = makeContributeCancel({ reason: "P66 safety preemption" });
    expect(cancel.reason).toBe("P66 safety preemption");
  });
});

describe("Scope Validation", () => {
  it("scope level constant is 2.5", () => {
    expect(CONTRIBUTE_SCOPE_LEVEL).toBe(2.5);
  });

  it("chat scope (2.0) is insufficient for request", () => {
    expect(validateContributeScope(2.0, "request")).toBe(false);
  });

  it("contribute scope (2.5) is sufficient for request", () => {
    expect(validateContributeScope(2.5, "request")).toBe(true);
  });

  it("control scope (3.0) is sufficient for request", () => {
    expect(validateContributeScope(3.0, "request")).toBe(true);
  });

  it("chat scope allows cancel", () => {
    expect(validateContributeScope(2.0, "cancel")).toBe(true);
  });

  it("below chat denies cancel", () => {
    expect(validateContributeScope(1.0, "cancel")).toBe(false);
  });
});

describe("P66 Preemption", () => {
  it("control scope (3.0) preempts", () => {
    expect(isPreemptedBy(3.0)).toBe(true);
  });

  it("admin scope (4.0) preempts", () => {
    expect(isPreemptedBy(4.0)).toBe(true);
  });

  it("contribute scope (2.5) does not preempt", () => {
    expect(isPreemptedBy(2.5)).toBe(false);
  });

  it("chat scope (2.0) does not preempt", () => {
    expect(isPreemptedBy(2.0)).toBe(false);
  });
});
