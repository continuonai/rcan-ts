/**
 * rcan-ts manifest — ROBOT.md cross-link.
 *
 * Extract RCAN-relevant identity + network fields from a parsed ROBOT.md
 * frontmatter object. Keeps rcan-ts dependency-free — callers bring their
 * own YAML parser (js-yaml, yaml, or similar).
 *
 * @example
 *   import fs from "node:fs";
 *   import yaml from "js-yaml";
 *   import { fromManifest } from "rcan-ts";
 *
 *   const raw = fs.readFileSync("./ROBOT.md", "utf-8");
 *   const body = raw.split("---")[1]; // between the first two fences
 *   const fm = yaml.load(body) as Record<string, unknown>;
 *   const info = fromManifest(fm);
 *
 *   console.log(info.rrn);            // "RRN-000000000003"
 *   console.log(info.endpoint);       // "https://rcan.dev"
 *   console.log(info.publicResolver); // "https://rcan.dev/r/RRN-000000000003"
 */

export interface ManifestInfo {
  /** RRN if the robot is registered, else null. */
  rrn: string | null;
  /** `rcan://...` canonical URI from metadata.rcan_uri. */
  rcanUri: string | null;
  /** Registry endpoint (network.rrf_endpoint). */
  endpoint: string | null;
  /** Signing algorithm (network.signing_alg). */
  signingAlg: string | null;
  /** Derived: https://rcan.dev/r/<rrn> when rrn is set. */
  publicResolver: string | null;
  /** metadata.robot_name. */
  robotName: string | null;
  /** rcan_version (top-level). */
  rcanVersion: string | null;
  /** The original frontmatter object — caller keeps reference for deeper fields. */
  frontmatter: Record<string, unknown>;
}

/**
 * Extract RCAN-relevant fields from a parsed ROBOT.md frontmatter object.
 *
 * @param frontmatter - The parsed YAML frontmatter dict (from js-yaml or similar).
 * @returns A {@link ManifestInfo} with string fields populated where present, null otherwise.
 * @throws {TypeError} if `frontmatter` is not a plain object.
 */
export function fromManifest(
  frontmatter: Record<string, unknown>,
): ManifestInfo {
  if (
    !frontmatter ||
    typeof frontmatter !== "object" ||
    Array.isArray(frontmatter)
  ) {
    throw new TypeError(
      "fromManifest: expected a parsed frontmatter object, got " +
        typeof frontmatter,
    );
  }

  const metadata = (frontmatter.metadata ?? {}) as Record<string, unknown>;
  const network = (frontmatter.network ?? {}) as Record<string, unknown>;

  const rrn = typeof metadata.rrn === "string" && metadata.rrn ? metadata.rrn : null;
  const rcanUri =
    typeof metadata.rcan_uri === "string" && metadata.rcan_uri
      ? metadata.rcan_uri
      : null;
  const endpoint =
    typeof network.rrf_endpoint === "string" && network.rrf_endpoint
      ? network.rrf_endpoint
      : null;
  const signingAlg =
    typeof network.signing_alg === "string" && network.signing_alg
      ? network.signing_alg
      : null;
  const robotName =
    typeof metadata.robot_name === "string" && metadata.robot_name
      ? metadata.robot_name
      : null;

  let rcanVersion: string | null = null;
  if (frontmatter.rcan_version !== undefined && frontmatter.rcan_version !== null) {
    rcanVersion = String(frontmatter.rcan_version);
  }

  const publicResolver = rrn ? `https://rcan.dev/r/${rrn}` : null;

  return {
    rrn,
    rcanUri,
    endpoint,
    signingAlg,
    publicResolver,
    robotName,
    rcanVersion,
    frontmatter,
  };
}
