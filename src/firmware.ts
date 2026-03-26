/**
 * rcan/firmware — RCAN v2.1 Firmware Manifest types and helpers.
 *
 * Every RCAN v2.1 robot MUST publish a signed firmware manifest at:
 *   {ruri}/.well-known/rcan-firmware-manifest.json
 *
 * The manifest is Ed25519-signed by the manufacturer's key registered in the RRF.
 * The envelope field `firmwareHash` (field 13) carries a SHA-256 of the manifest.
 *
 * Spec: §11 — Firmware Manifests
 */

/** Well-known endpoint path for firmware manifests. */
export const FIRMWARE_MANIFEST_PATH = "/.well-known/rcan-firmware-manifest.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single component entry in the firmware manifest. */
export interface FirmwareComponent {
  /** Component name, e.g. "brain-runtime" */
  name: string;
  /** Semantic version string */
  version: string;
  /** SHA-256 hash prefixed with "sha256:" */
  hash: string;
}

/** RCAN v2.1 firmware manifest. */
export interface FirmwareManifest {
  /** Robot Registration Number */
  rrn: string;
  /** Semver or CalVer version string */
  firmwareVersion: string;
  /** SHA-256 of the full firmware bundle, prefixed "sha256:" */
  buildHash: string;
  /** Per-component records */
  components: FirmwareComponent[];
  /** UTC ISO-8601 timestamp when the manifest was signed */
  signedAt: string;
  /** Ed25519 signature over canonical JSON (base64url), empty if unsigned */
  signature?: string;
}

/**
 * Serialized (wire) format of a firmware manifest.
 * Uses snake_case keys to match the JSON spec.
 */
export interface FirmwareManifestWire {
  rrn: string;
  firmware_version: string;
  build_hash: string;
  components: FirmwareComponent[];
  signed_at: string;
  signature?: string;
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/** Convert a camelCase FirmwareManifest to the wire (snake_case) format. */
export function manifestToWire(m: FirmwareManifest): FirmwareManifestWire {
  const wire: FirmwareManifestWire = {
    rrn:              m.rrn,
    firmware_version: m.firmwareVersion,
    build_hash:       m.buildHash,
    components:       m.components,
    signed_at:        m.signedAt,
  };
  if (m.signature) wire.signature = m.signature;
  return wire;
}

/** Parse a wire-format manifest into the typed FirmwareManifest. */
export function manifestFromWire(w: FirmwareManifestWire): FirmwareManifest {
  return {
    rrn:             w.rrn,
    firmwareVersion: w.firmware_version,
    buildHash:       w.build_hash,
    components:      w.components ?? [],
    signedAt:        w.signed_at ?? "",
    signature:       w.signature,
  };
}

/**
 * Return the canonical JSON bytes of a manifest (no signature field, sorted keys).
 * This is the byte string that the Ed25519 signature covers.
 */
export function canonicalManifestJson(m: FirmwareManifest): string {
  const obj: Record<string, unknown> = {
    build_hash:       m.buildHash,
    components:       m.components.map(c => ({
      hash:    c.hash,
      name:    c.name,
      version: c.version,
    })),
    firmware_version: m.firmwareVersion,
    rrn:              m.rrn,
    signed_at:        m.signedAt,
  };
  // deterministic: keys are already sorted above
  return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

/** Thrown when firmware manifest signature verification fails. */
export class FirmwareIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirmwareIntegrityError";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate a manifest structure and return a list of errors. */
export function validateManifest(m: FirmwareManifest): string[] {
  const errors: string[] = [];
  if (!m.rrn) errors.push("rrn is required");
  if (!m.firmwareVersion) errors.push("firmwareVersion is required");
  if (!m.buildHash) errors.push("buildHash is required");
  if (!m.buildHash.startsWith("sha256:")) errors.push("buildHash must start with 'sha256:'");
  if (!m.signedAt) errors.push("signedAt is required");
  if (!m.signature) errors.push("signature is required (manifest must be signed)");
  for (const [i, c] of m.components.entries()) {
    if (!c.name) errors.push(`components[${i}].name is required`);
    if (!c.version) errors.push(`components[${i}].version is required`);
    if (!c.hash.startsWith("sha256:")) errors.push(`components[${i}].hash must start with 'sha256:'`);
  }
  return errors;
}
