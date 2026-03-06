/**
 * Spec compatibility smoke test — issue #5
 *
 * Loads the bundled compatibility.json fixture and validates that the
 * current rcan-ts package version satisfies the rcan-ts requirement in
 * the "current" spec entry.
 */

import * as fs from "fs";
import * as path from "path";

const PKG_VERSION: string = "0.1.0"; // keep in sync with package.json

interface SpecVersion {
  version: string;
  status: string;
  rcan_py: string | null;
  rcan_ts: string | null;
  opencastor: string | null;
  notes?: string;
}

interface CompatibilityMatrix {
  updated: string;
  spec_versions: SpecVersion[];
}

function parseMinVersion(requirement: string): [number, number, number] {
  // Supports ">=X.Y.Z" or "X.Y.Z"
  const clean = requirement.replace(/^>=/, "").trim();
  const parts = clean.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function satisfies(pkgVersion: string, requirement: string): boolean {
  if (!requirement || requirement.trim() === "") return true;
  const [rMaj, rMin, rPat] = parseMinVersion(requirement);
  const parts = pkgVersion.split(".").map(Number);
  const [pMaj, pMin, pPat] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  if (pMaj !== rMaj) return pMaj > rMaj;
  if (pMin !== rMin) return pMin > rMin;
  return pPat >= rPat;
}

describe("compatibility.json fixture", () => {
  const fixturePath = path.join(__dirname, "fixtures", "compatibility.json");
  let matrix: CompatibilityMatrix;

  beforeAll(() => {
    const raw = fs.readFileSync(fixturePath, "utf-8");
    matrix = JSON.parse(raw) as CompatibilityMatrix;
  });

  it("fixture file exists and is parseable", () => {
    expect(matrix).toBeDefined();
  });

  it("has an 'updated' field", () => {
    expect(typeof matrix.updated).toBe("string");
    expect(matrix.updated.length).toBeGreaterThan(0);
  });

  it("has a non-empty spec_versions array", () => {
    expect(Array.isArray(matrix.spec_versions)).toBe(true);
    expect(matrix.spec_versions.length).toBeGreaterThan(0);
  });

  it("contains exactly one 'current' spec entry", () => {
    const current = matrix.spec_versions.filter((sv) => sv.status === "current");
    expect(current.length).toBe(1);
  });

  it("current spec entry has a rcan_ts requirement", () => {
    const current = matrix.spec_versions.find((sv) => sv.status === "current")!;
    expect(current.rcan_ts).not.toBeNull();
    expect(typeof current.rcan_ts).toBe("string");
  });

  it(`package version ${PKG_VERSION} satisfies the rcan-ts requirement in the current spec`, () => {
    const current = matrix.spec_versions.find((sv) => sv.status === "current")!;
    const requirement = current.rcan_ts as string;
    const ok = satisfies(PKG_VERSION, requirement);
    expect(ok).toBe(true);
  });

  it("all spec entries have required fields", () => {
    for (const sv of matrix.spec_versions) {
      expect(typeof sv.version).toBe("string");
      expect(typeof sv.status).toBe("string");
    }
  });
});
