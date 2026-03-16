## [0.5.0] — 2026-03-16

### RCAN v1.5 Support — 18 Gaps Addressed

#### Foundation (Batch 1)
- **GAP-12**: `src/version.ts` — `SPEC_VERSION = "1.5"` as single source of truth; `validateVersionCompat()`
- **GAP-03**: `src/replay.ts` — `ReplayCache` with sliding window; `validateReplay()`; safety messages capped at 10s window
- **GAP-04**: `src/clock.ts` — `checkClockSync()`, `ClockSyncStatus`, `assertClockSynced()`, `ClockDriftError`
- **GAP-08**: `src/message.ts` — `SenderType` union, `senderType`/`cloudProvider` fields, `makeCloudRelayMessage()`

#### Core Features (Batch 2)
- **GAP-11**: `src/qos.ts` — `QoSLevel` enum (FIRE_AND_FORGET=0/ACKNOWLEDGED=1/EXACTLY_ONCE=2), `QoSManager`, `QoSAckTimeoutError`; ESTOP forced to QoS=2
- **GAP-07**: `src/configUpdate.ts` — `makeConfigUpdate()`, `validateConfigUpdate()`, safety_overrides requires creator role
- **GAP-09**: `src/keys.ts` — `KeyStore`, `makeKeyRotationMessage()`, `JWKSDocument`
- **GAP-05**: `src/consent.ts` — `makeConsentRequest()`, `makeConsentGrant()`, `makeConsentDeny()`, `validateConsentMessage()`

#### Advanced Features (Batch 3)
- **GAP-02**: `src/revocation.ts` — `RevocationCache` (1h TTL), `checkRevocation()`, `makeRevocationBroadcast()`
- **GAP-10**: `src/trainingConsent.ts` — `DataCategory` enum, `makeTrainingConsentRequest/Grant/Deny()`, `validateTrainingDataMessage()`
- **GAP-01**: `src/message.ts` — `DelegationHop` interface, `delegationChain` on `RCANMessage`, `addDelegationHop()`, `validateDelegationChain()`
- **GAP-06**: `src/offline.ts` — `OfflineModeManager`, `canAcceptCommand()`, key caching, Protocol 66 manifest fields

#### SHOULD Gaps (Batch 4)
- **GAP-13**: `groupId?: string` on `RCANMessage`; `FLEET_COMMAND` (23) message type
- **GAP-15**: `SUBSCRIBE` (24) / `UNSUBSCRIBE` (25) message types; `readOnly?: boolean`
- **GAP-19**: `presenceVerified?: boolean`, `proximityMeters?: number` on `RCANMessage`
- **GAP-20**: `src/faultReport.ts` — `FaultCode` enum, `makeFaultReport()`, `AuditExportRequest`
- **GAP-21**: `AuditExportRequest` interface
- **GAP-22**: `makeTransparencyMessage()` updated to include `delegation_chain`

#### MessageType Canonicalization
- `MessageType` enum now matches rcan-py canonical table: COMMAND=1…FAULT_REPORT=26, COMMAND_NACK=27

#### New Errors
- `RCANVersionIncompatibleError`, `RCANReplayAttackError`, `RCANDelegationChainError`, `RCANConfigAuthorizationError`

#### Tests
- 8 new test files: replay, clock, qos, consent-wire, revocation, training-consent, delegation, offline
- 106 new tests (311 total, all passing)

---

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
