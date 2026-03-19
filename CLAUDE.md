# CLAUDE.md — rcan-ts Development Guide

> **Agent context file.** Read this before making any changes.

## What Is rcan-ts?

`rcan-ts` is the official TypeScript/JavaScript SDK for the RCAN protocol.

**Version**: 0.6.0 | **RCAN Spec**: v1.6.1 | **Node**: 18+ | **Package**: @continuonai/rcan

## Ecosystem Versions

- **RCAN spec**: v1.6.1 (primary compliance reference) — rcan.dev
- **OpenCastor runtime**: 2026.3.17.13 (yyyy.month.day.iteration)
- **rcan-py**: 0.6.0 (Python counterpart SDK)

## SPEC_VERSION

Defined in `src/version.ts`. Must always match `rcan-spec/package.json` version field.
Current: `"1.6.1"` — update whenever rcan-spec releases a new version.

## Repository Layout

```
rcan-ts/
├── src/
│   ├── index.ts           # Public exports
│   ├── version.ts         # SPEC_VERSION, SDK_VERSION — keep in sync with rcan-spec
│   ├── message.ts         # RCANMessage, MessageType
│   ├── uri.ts             # RobotURI parsing
│   ├── transport.ts       # Minimal transport encoding (encode_minimal / decode_minimal)
│   └── registry.ts        # RegistryClient
├── tests/
└── package.json           # version = SDK version (semver)
```

## Key Rules

- SPEC_VERSION in version.ts must match rcan-spec/package.json version
- SDK version (package.json) follows semver independently
- transport.ts encode_minimal() accepts optional sharedSecret: Uint8Array — always pass it in production (using msg_id as HMAC key is deprecated)

## CI

GitHub Actions (SHA-pinned). Run: `npm test`
