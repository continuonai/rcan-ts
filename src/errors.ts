/**
 * RCAN error class hierarchy.
 * All errors extend RCANError which extends the built-in Error.
 */

export class RCANError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RCANError";
    // Restore prototype chain for instanceof checks in transpiled code
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RCANAddressError extends RCANError {
  constructor(message: string) {
    super(message);
    this.name = "RCANAddressError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RCANValidationError extends RCANError {
  constructor(message: string) {
    super(message);
    this.name = "RCANValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RCANGateError extends RCANError {
  constructor(
    message: string,
    public gateType: string,
    public value?: number,
    public threshold?: number
  ) {
    super(message);
    this.name = "RCANGateError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RCANSignatureError extends RCANError {
  constructor(message: string) {
    super(message);
    this.name = "RCANSignatureError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RCANRegistryError extends RCANError {
  constructor(message: string) {
    super(message);
    this.name = "RCANRegistryError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
