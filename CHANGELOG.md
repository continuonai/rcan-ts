## [0.3.0] — 2026-03-06

### Added
- `SPEC_VERSION = '1.2'` constant exported from package
- `bin/rcan-validate.mjs` — CLI: `rcan-validate node <url>`, `rcan-validate --version`
- `src/schema.ts` — `fetchCanonicalSchema()`, `validateConfigAgainstSchema()`, `validateNodeAgainstSchema()` with in-memory cache and graceful degradation
- `RCANRegistryNode`, `RCANResolveResult` TypeScript interfaces
- `NodeClient` — federated RRN resolution: `discover()`, `resolve()`, `listNodes()`, `verifyNode()`
- `RCANNodeError`, `RCANNodeNotFoundError`, `RCANNodeSyncError`, `RCANNodeTrustError`
- RRN regex expanded: sequences 8→8-16 digits, prefix `[A-Z0-9]{2,8}` (backward compatible)

### Fixed
- Package install command in README corrected to `@continuonai/rcan-ts`

# Changelog

All notable changes to @continuonai/rcan-ts are documented here.

---

## [0.2.0] — 2026-03-06
### Features
- `RegistryClient` — full CRUD for rcan.dev API (register, get, list, search, patch, delete)
- `RCANError` class hierarchy: RCANAddressError, RCANValidationError, RCANGateError, RCANSignatureError, RCANRegistryError
- TypeScript interfaces: RCANConfig, RCANMetadata, RCANMessageEnvelope, RCANAgentConfig in `src/types.ts`
- Config validation hardening — required fields, rcan_version format, device_id check
- IIFE/CDN bundle: `dist/rcan.iife.js` for unpkg/jsDelivr
- Spec compatibility smoke tests (tests/spec-compat.test.ts)
### Package
- Scoped package name: @continuonai/rcan-ts
- publishConfig.access: "public"
- unpkg, jsdelivr, cdn package.json fields

---

## [0.1.2] — 2026-03-06
### Features
- IIFE/CDN bundle (`dist/rcan.iife.js`) for unpkg/jsDelivr (#7, #9, #13)
- CDN test suite (tests/cdn.test.ts)
- README CDN usage examples

---

## [0.1.1] — 2026-03-05
### Changes
- Renamed package to `@continuonai/rcan-ts`
- Added publishConfig.access: "public"
- First scoped npm publish

---

## [0.1.0] — 2026-03-05
### Initial Release
- `RobotURI` — parse/build RCAN URIs
- `RCANMessage` — signed message envelope
- `ConfidenceGate`, `HiTLGate` — runtime safety gates
- `CommitmentRecord`, `AuditChain` — HMAC-chained audit ledger
- `RegistryClient` — full rcan.dev API client
- `rcan-validate` CLI
- Browser ESM bundle (dist/browser.mjs)
- CJS + ESM dual build
