import {
  RCANError,
  RCANAddressError,
  RCANValidationError,
  RCANGateError,
  RCANSignatureError,
  RCANRegistryError,
} from "../src/errors";

describe("RCANError hierarchy", () => {
  test("RCANError is instance of Error", () => {
    const e = new RCANError("base");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(RCANError);
    expect(e.message).toBe("base");
    expect(e.name).toBe("RCANError");
  });

  test.each([
    ["RCANAddressError", RCANAddressError],
    ["RCANValidationError", RCANValidationError],
    ["RCANSignatureError", RCANSignatureError],
    ["RCANRegistryError", RCANRegistryError],
  ])("%s instanceof RCANError and Error", (name, cls) => {
    const e = new cls("test " + name);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(RCANError);
    expect(e).toBeInstanceOf(cls);
    expect(e.message).toBe("test " + name);
    expect(e.name).toBe(name);
  });

  test("RCANGateError preserves attributes", () => {
    const e = new RCANGateError("blocked", "confidence", 0.4, 0.8);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(RCANError);
    expect(e).toBeInstanceOf(RCANGateError);
    expect(e.message).toBe("blocked");
    expect(e.name).toBe("RCANGateError");
    expect(e.gateType).toBe("confidence");
    expect(e.value).toBeCloseTo(0.4);
    expect(e.threshold).toBeCloseTo(0.8);
  });

  test("RCANGateError optional attrs undefined", () => {
    const e = new RCANGateError("gate", "hitl");
    expect(e.value).toBeUndefined();
    expect(e.threshold).toBeUndefined();
  });

  test("catch as RCANError", () => {
    const types = [
      RCANAddressError,
      RCANValidationError,
      RCANSignatureError,
      RCANRegistryError,
      RCANGateError,
    ] as const;
    for (const T of types) {
      expect(() => {
        try {
          if (T === RCANGateError) throw new RCANGateError("x", "type");
          else throw new (T as typeof RCANAddressError)("x");
        } catch (e) {
          if (!(e instanceof RCANError)) throw new Error("not RCANError");
        }
      }).not.toThrow();
    }
  });
});
