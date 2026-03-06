import { RobotURI, RobotURIError } from "../src/address";

describe("RobotURI.parse()", () => {
  const VALID = "rcan://registry.rcan.dev/acme/arm/v2/unit-001";

  test("parses valid URI", () => {
    const uri = RobotURI.parse(VALID);
    expect(uri.registry).toBe("registry.rcan.dev");
    expect(uri.manufacturer).toBe("acme");
    expect(uri.model).toBe("arm");
    expect(uri.version).toBe("v2");
    expect(uri.deviceId).toBe("unit-001");
  });

  test("toString() round-trips", () => {
    const uri = RobotURI.parse(VALID);
    expect(uri.toString()).toBe(VALID);
  });

  test("throws on missing rcan:// scheme", () => {
    expect(() => RobotURI.parse("http://not-rcan")).toThrow(RobotURIError);
  });

  test("throws on too few segments", () => {
    expect(() => RobotURI.parse("rcan://registry.rcan.dev/acme/arm")).toThrow(RobotURIError);
  });

  test("throws on too many segments", () => {
    expect(() => RobotURI.parse("rcan://r/a/b/v1/x/extra")).toThrow(RobotURIError);
  });

  test("throws on empty segment", () => {
    expect(() => RobotURI.parse("rcan://registry.rcan.dev/acme//v2/unit-001")).toThrow(RobotURIError);
  });
});

describe("RobotURI.build()", () => {
  test("builds with default registry", () => {
    const uri = RobotURI.build({ manufacturer: "acme", model: "arm", version: "v2", deviceId: "u1" });
    expect(uri.registry).toBe("registry.rcan.dev");
    expect(uri.toString()).toBe("rcan://registry.rcan.dev/acme/arm/v2/u1");
  });

  test("builds with custom registry", () => {
    const uri = RobotURI.build({
      manufacturer: "acme", model: "arm", version: "v2", deviceId: "u1",
      registry: "my.registry.io",
    });
    expect(uri.registry).toBe("my.registry.io");
  });

  test("throws on empty manufacturer", () => {
    expect(() => RobotURI.build({ manufacturer: "", model: "arm", version: "v2", deviceId: "u1" }))
      .toThrow(RobotURIError);
  });
});

describe("RobotURI computed properties", () => {
  const uri = RobotURI.parse("rcan://registry.rcan.dev/acme/arm/v2/unit-001");

  test("namespace", () => expect(uri.namespace).toBe("acme/arm"));

  test("registryUrl", () => {
    expect(uri.registryUrl).toContain("https://registry.rcan.dev/registry/acme");
  });

  test("equals()", () => {
    const other = RobotURI.parse("rcan://registry.rcan.dev/acme/arm/v2/unit-001");
    expect(uri.equals(other)).toBe(true);
    const diff = RobotURI.parse("rcan://registry.rcan.dev/acme/arm/v2/unit-002");
    expect(uri.equals(diff)).toBe(false);
  });

  test("toJSON()", () => {
    const obj = uri.toJSON() as Record<string, string>;
    expect(obj.uri).toBe(uri.toString());
    expect(obj.manufacturer).toBe("acme");
  });
});
