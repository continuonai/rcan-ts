/**
 * CDN / IIFE bundle smoke test.
 *
 * Verifies that the IIFE bundle exports the expected symbols so that
 * a browser consumer can use:
 *   <script src="rcan.iife.js"></script>
 *   <script>const uri = new RCAN.RobotURI('rcan://...');</script>
 */

import * as RCAN from "../src/index.js";

describe("CDN / IIFE bundle surface", () => {
  it("exports RobotURI", () => {
    expect(typeof RCAN.RobotURI).toBe("function");
  });

  it("exports RCANMessage", () => {
    expect(typeof RCAN.RCANMessage).toBe("function");
  });

  it("exports ConfidenceGate", () => {
    expect(typeof RCAN.ConfidenceGate).toBe("function");
  });

  it("exports HiTLGate", () => {
    expect(typeof RCAN.HiTLGate).toBe("function");
  });

  it("exports validateURI", () => {
    expect(typeof RCAN.validateURI).toBe("function");
  });

  it("exports validateConfig", () => {
    expect(typeof RCAN.validateConfig).toBe("function");
  });

  it("exports RCANError", () => {
    expect(typeof RCAN.RCANError).toBe("function");
  });

  it("RobotURI.parse works with a valid URI", () => {
    const uri = RCAN.RobotURI.parse(
      "rcan://registry.rcan.dev/acme/robotarm/v2/unit-001"
    );
    expect(uri.manufacturer).toBe("acme");
    expect(uri.model).toBe("robotarm");
  });

  it("validateURI returns ok for a valid URI", () => {
    const result = RCAN.validateURI(
      "rcan://registry.rcan.dev/acme/robotarm/v2/unit-001"
    );
    expect(result.ok).toBe(true);
  });
});
