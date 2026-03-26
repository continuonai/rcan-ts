/**
 * CJS-compatible shim for @noble/post-quantum/ml-dsa.js (ESM-only package).
 *
 * ts-jest runs in CJS mode and cannot directly require() ESM packages.
 * This shim is mapped via Jest's moduleNameMapper so the dynamic import()
 * in pqSigning.ts resolves to this file in the test environment.
 *
 * In production (tsup build), moduleNameMapper is not active — the real
 * dynamic import("@noble/post-quantum/ml-dsa.js") path is used.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const _noble = (() => {
  // Node 22+ supports require() of ESM packages that have cjs export conditions
  // If that fails, fall back to the bundled dist (tsup pre-built output)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@noble/post-quantum/ml-dsa.js");
  } catch {
    return null;
  }
})();

export const ml_dsa65 = _noble?.ml_dsa65 ?? null;
