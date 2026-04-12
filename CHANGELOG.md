## [2.0.0] — 2026-04-12

### Breaking Changes
- **REGISTRY_REGISTER**: `fria_ref` is now required in `RegistryRegisterPayload` (RCAN v3.0)
- **SPEC_VERSION**: bumped to `"3.0"` (was `"2.2.1"`)

### Added
- `src/compliance.ts`: TypeScript interfaces for RCAN v3.0 compliance schemas
  - `FriaSigningKey`, `FriaConformance`, `FriaDocument` (§22)
  - `SafetyBenchmark` (§23)
  - `InstructionsForUse` (§24)
  - `PostMarketIncident` (§25)
  - `EuRegisterEntry` (§26)
- `RegistryRegisterPayload` interface — documents required `fria_ref` field
- `makeRegistryRegister()` helper — builds a typed REGISTRY_REGISTER payload

## [1.4.0] — 2026-04-10

### Added
- `src/watermark.ts` — AI output watermark module (RCAN §16.5): `computeWatermarkToken()`, `verifyTokenFormat()`, `verifyViaApi()`. Uses `hmacSha256SyncRawKey()` (Node crypto with pure-JS fallback) to pass raw `Uint8Array` key bytes directly, ensuring cross-language parity with the Python SDK
- `src/crypto.ts` — `hmacSha256SyncRawKey(keyBytes, data)` and `pureHmacSha256Bytes(keyBytes, data)` for raw-key HMAC computation without UTF-8 key encoding
- Re-exports `computeWatermarkToken`, `verifyTokenFormat`, `verifyViaApi` from `src/index.ts`

### Tests
- `tests/watermark.test.ts` — 10 tests: compute format/determinism/sensitivity, format validation, `verifyViaApi` 200/null, cross-language parity pinned to Python reference output (`d32a0ea8db075e0ec9c7c313e75a5011`)

---

## [1.3.0] — 2026-03-31

### Added
- `src/crypto.ts` — ML-DSA-65 post-quantum signing primitives (`MlDsaKeyPair`, `HybridSignature`, `generateMlDsaKeypair`, `signHybrid`, `verifyHybrid`, `encodeMlDsaPublicKeyJwk`)
- `RobotURI` pqc-hybrid-v1 support in `sign()` / `verifySig()`
- PQC signing option in M2M token helpers
- Implements RCAN spec v2.3 pqc-hybrid-v1 profile (NIST FIPS 204 ML-DSA-65) via `@noble/post-quantum`

## [0.6.0] — 2026-03-16

### RCAN v1.6 Support — GAP-14, GAP-16, GAP-17, GAP-18

- **GAP-14**: `src/identity.ts` — `LevelOfAssurance` enum (ANONYMOUS/EMAIL_VERIFIED/HARDWARE_TOKEN), `LoaPolicy`, `extractLoaFromJwt()`, `validateLoaForScope()`, `DEFAULT_LOA_POLICY`, `PRODUCTION_LOA_POLICY`; `loa?` field on `RCANMessage`
- **GAP-16**: `src/federation.ts` — `RegistryTier`, `FederationSyncType`, `RegistryIdentity`, `FederationSyncPayload`, `TrustAnchorCache` (24h TTL, DNS-TXT discovery, JWT iss validation), `makeFederationSync()`, `validateCrossRegistryCommand()` (P66: ESTOP always permitted)
- **GAP-17**: `src/transport.ts` — `TransportEncoding` enum, `encodeCompact()`/`decodeCompact()` (abbreviated JSON keys), `encodeMinimal()`/`decodeMinimal()` (32-byte ESTOP-only frame with runtime assertion), `encodeBleFrames()`/`decodeBleFrames()` (MTU fragmentation), `selectTransport()`, `TransportError`; `transportEncoding?` on `RCANMessage`
- **GAP-18**: `src/multimodal.ts` — `MediaEncoding`, `MediaChunk`, `StreamChunk`, `addMediaInline()` (SHA-256 via Web Crypto), `addMediaRef()`, `validateMediaChunks()`, `makeTrainingDataMessage()`, `makeStreamChunk()`; `mediaChunks?` on `RCANMessage`
- `src/version.ts`: `SPEC_VERSION = "1.6"`, `SDK_VERSION = "0.6.0"`
- `package.json`: version bumped to `0.6.0`

## [1.2.2] - 2026-03-28

### Changed
- `SPEC_VERSION` updated to `2.2.1`
- `SDK_VERSION` bumped to `1.2.2`
- `SUPPORTED_FEATURES`: added `MULTI_TYPE_ENTITY_NUMBERING` (§21.2.2)


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

## v1.2.1 (2026-03-27)

### Breaking Changes
- **`SignatureBlock.alg`** narrowed to literal `"ml-dsa-65"` — TypeScript compile error if `"Ed25519"` passed
- **`pqSig` field removed** from `RCANMessageData` and `RCANMessage` — `signature` is the sole signing field
- **`signMessage()` / `verifyMessage()`** are now the canonical names (replacing `addPQSignature` / `verifyPQSignature`, kept as deprecated aliases)
- **`verifyMessage()` rejects** any `alg !== "ml-dsa-65"` with explicit deprecation error

### Summary
Clean ML-DSA-65-only release. 545 tests passing.
