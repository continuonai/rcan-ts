/**
 * RCAN Robot URI — addressing scheme for RCAN v1.2.
 *
 * Format: rcan://<registry>/<manufacturer>/<model>/<version>/<device-id>
 * Example: rcan://registry.rcan.dev/acme/robotarm/v2/unit-001
 */

export class RobotURIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobotURIError";
  }
}

export interface RobotURIOptions {
  manufacturer: string;
  model: string;
  version: string;
  deviceId: string;
  registry?: string;
}

export class RobotURI {
  readonly registry: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly version: string;
  readonly deviceId: string;

  private constructor(opts: Required<RobotURIOptions>) {
    this.registry = opts.registry;
    this.manufacturer = opts.manufacturer;
    this.model = opts.model;
    this.version = opts.version;
    this.deviceId = opts.deviceId;
  }

  /** Parse a RCAN URI string. Throws RobotURIError on invalid input. */
  static parse(uri: string): RobotURI {
    if (!uri.startsWith("rcan://")) {
      throw new RobotURIError(`URI must start with 'rcan://' — got: ${uri}`);
    }
    const withoutScheme = uri.slice("rcan://".length);
    const parts = withoutScheme.split("/");
    if (parts.length !== 5) {
      throw new RobotURIError(
        `URI must have exactly 5 path segments (registry/manufacturer/model/version/device-id) — got ${parts.length} in: ${uri}`
      );
    }
    const [registry, manufacturer, model, version, deviceId] = parts;
    for (const [name, value] of [
      ["registry", registry],
      ["manufacturer", manufacturer],
      ["model", model],
      ["version", version],
      ["device-id", deviceId],
    ] as [string, string][]) {
      if (!value || value.trim() === "") {
        throw new RobotURIError(`URI segment '${name}' must not be empty`);
      }
    }
    return new RobotURI({ registry, manufacturer, model, version, deviceId });
  }

  /** Build a RCAN URI from components. */
  static build(opts: RobotURIOptions): RobotURI {
    const registry = opts.registry ?? "registry.rcan.dev";
    const { manufacturer, model, version, deviceId } = opts;
    for (const [name, value] of [
      ["manufacturer", manufacturer],
      ["model", model],
      ["version", version],
      ["deviceId", deviceId],
    ] as [string, string][]) {
      if (!value || value.trim() === "") {
        throw new RobotURIError(`'${name}' must not be empty`);
      }
    }
    return new RobotURI({ registry, manufacturer, model, version, deviceId });
  }

  /** Full URI string: rcan://registry/manufacturer/model/version/device-id */
  toString(): string {
    return `rcan://${this.registry}/${this.manufacturer}/${this.model}/${this.version}/${this.deviceId}`;
  }

  /** Short namespace: manufacturer/model */
  get namespace(): string {
    return `${this.manufacturer}/${this.model}`;
  }

  /** HTTPS registry URL for this robot */
  get registryUrl(): string {
    return `https://${this.registry}/registry/${this.manufacturer}/${this.model}/${this.version}/${this.deviceId}`;
  }

  /** Check if two URIs refer to the same robot */
  equals(other: RobotURI): boolean {
    return this.toString() === other.toString();
  }

  toJSON(): object {
    return {
      uri: this.toString(),
      registry: this.registry,
      manufacturer: this.manufacturer,
      model: this.model,
      version: this.version,
      deviceId: this.deviceId,
    };
  }
}
