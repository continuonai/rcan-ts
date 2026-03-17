# rcan-ts

Official TypeScript SDK for the **RCAN v1.6** Robot Communication and Addressing Network protocol.

[![npm version](https://badge.fury.io/js/%40continuonai%2Frcan-ts.svg)](https://www.npmjs.com/package/@continuonai/rcan-ts)
[![CI](https://github.com/continuonai/rcan-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/continuonai/rcan-ts/actions)

```
npm install @continuonai/rcan-ts
```

> **v0.2.0** — RCAN v1.2 spec compliance including §17 Distributed Registry Node Protocol

### CDN / Browser (no build step)

```html
<script src="https://unpkg.com/@continuonai/rcan-ts/dist/rcan.iife.js"></script>
<script>
  const uri = new RCAN.RobotURI.parse('rcan://registry.rcan.dev/acme/arm/v1/unit-001');
  console.log(uri.manufacturer); // acme
</script>
```

Also available via jsDelivr:
```html
<script src="https://cdn.jsdelivr.net/npm/@continuonai/rcan-ts/dist/rcan.iife.js"></script>
```

---

## Quick Start

### Robot URI

Every robot has a globally unique, resolvable address:

```typescript
import { RobotURI } from "@continuonai/rcan-ts";

const uri = RobotURI.build({
  manufacturer: "acme",
  model: "robotarm",
  version: "v2",
  deviceId: "unit-001",
});
console.log(uri.toString());
// rcan://registry.rcan.dev/acme/robotarm/v2/unit-001

const parsed = RobotURI.parse("rcan://registry.rcan.dev/acme/robotarm/v2/unit-001");
console.log(parsed.namespace); // "acme/robotarm"
```

### Building a Message

```typescript
import { RCANMessage, ConfidenceGate } from "@continuonai/rcan-ts";

const gate = new ConfidenceGate(0.8);
const confidence = 0.91; // from your AI model

if (gate.allows(confidence)) {
  const msg = new RCANMessage({
    cmd: "move_forward",
    target: uri,
    params: { distance_m: 1.0 },
    confidence,
    modelIdentity: "Qwen2.5-7B-Q4",
  });
  console.log(msg.toJSONString(2));
}
```

### Human-in-the-Loop Gate

```typescript
import { HiTLGate } from "@continuonai/rcan-ts";

const hitl = new HiTLGate();
const token = hitl.request("stop_emergency", { reason: "obstacle detected" });

// Later, from your operator UI:
hitl.approve(token);

if (hitl.check(token) === "approved") {
  // execute action
}
```

### Tamper-Evident Audit Chain

```typescript
import { AuditChain } from "@continuonai/rcan-ts";

const chain = new AuditChain("your-hmac-secret");

chain.append({
  action: "move_forward",
  robotUri: uri.toString(),
  confidence: 0.91,
  safetyApproved: true,
});
chain.append({ action: "stop" });

const { valid, count, errors } = chain.verifyAll();
console.log(`Chain valid: ${valid}, ${count} records`);

// Export to JSONL for long-term storage
const jsonl = chain.toJSONL();
```

### Validation

```typescript
import { validateMessage, validateConfig, validateURI } from "@continuonai/rcan-ts";

const result = validateMessage({
  rcan: "1.2",
  cmd: "move_forward",
  target: "rcan://registry.rcan.dev/acme/arm/v2/unit-001",
  confidence: 0.91,
});

if (!result.ok) {
  result.issues.forEach((i) => console.error("❌", i));
}
result.warnings.forEach((w) => console.warn("⚠️", w));
```

---

## API Reference

| Export | Description |
|--------|-------------|
| `RobotURI` | Parse/build RCAN Robot URIs |
| `RCANMessage` | RCAN command message with confidence + signing |
| `ConfidenceGate` | AI confidence threshold gate |
| `HiTLGate` | Human-in-the-loop approval gate |
| `CommitmentRecord` | HMAC-sealed audit record |
| `AuditChain` | Tamper-evident chain of CommitmentRecords |
| `validateURI` | Validate a Robot URI string |
| `validateMessage` | Validate a RCAN message object |
| `validateConfig` | L1/L2/L3 conformance check for a robot RCAN config |
| `NodeClient` | Resolve RRNs from federated registry nodes (§17) |
| `fetchCanonicalSchema` | Fetch the canonical JSON schema from rcan.dev |
| `validateConfigAgainstSchema` | Validate a config object against the live JSON schema |
| `validateNodeAgainstSchema` | Validate a node manifest against the node schema |

---

## Distributed Registry Nodes (§17)

RCAN v1.2 §17 introduces a federated registry network. `NodeClient` resolves RRNs from any node — root or delegated authoritative.

```typescript
import { NodeClient } from '@continuonai/rcan-ts';

const client = new NodeClient();

// Resolve an RRN across the federation
const result = await client.resolve('RRN-BD-000000000001');
console.log(`Resolved by: ${result.resolved_by}`);
console.log(`Robot: ${result.record.name}`);

// Discover the authoritative node for a namespace
const node = await client.discover('RRN-BD-000000000001');
console.log(`Authoritative: ${node.operator} at ${node.api_base}`);

// List all known registry nodes
const nodes = await client.listNodes();
nodes.forEach(n => console.log(`${n.operator}: ${n.namespace_prefix}`));

// Verify a node manifest
const manifest = await client.getNodeManifest('https://registry.example.com');
const isValid = client.verifyNode(manifest);

// Error handling
import { RCANNodeNotFoundError, RCANNodeTrustError } from '@continuonai/rcan-ts';
try {
  const result = await client.resolve('RRN-UNKNOWN-000000000001');
} catch (e) {
  if (e instanceof RCANNodeNotFoundError) {
    console.log(`Not found: ${e.rrn}`);
  } else if (e instanceof RCANNodeTrustError) {
    console.log(`Trust failure: ${e.reason}`);
  }
}
```

### RRN Format

```
Root namespace:    RRN-000000000001    (12-digit recommended, 8-digit still valid)
Delegated:        RRN-BD-000000000001  (prefix 2-8 alphanumeric chars)
Legacy (valid):   RRN-00000001         (8-digit, backward compatible)
```

## Schema Validation

Validate configs against the canonical JSON schema published at rcan.dev:

```typescript
import { validateConfigAgainstSchema, validateNodeAgainstSchema } from '@continuonai/rcan-ts';

// Validate a RCAN config against the canonical schema from rcan.dev
const result = await validateConfigAgainstSchema(myConfig);
if (!result.valid) {
  console.error('Config invalid:', result.errors);
} else if (result.skipped) {
  console.warn('Schema validation skipped (rcan.dev unreachable)');
}

// Validate a node manifest
const nodeResult = await validateNodeAgainstSchema(manifest);
```

### CDN / Browser Usage

```html
<script src="https://unpkg.com/@continuonai/rcan-ts/dist/rcan.iife.js"></script>
<script>
  const { validateConfig, NodeClient } = window.RCAN;
  const client = new NodeClient();
  client.resolve('RRN-000000000001').then(r => console.log(r));
</script>
```

---

## Ecosystem

| Package | Language | Install |
|---------|----------|---------|
| [rcan-py](https://github.com/continuonai/rcan-py) | Python 3.10+ | `pip install rcan` |
| **rcan-ts** (this) | TypeScript / Node | `npm install @continuonai/rcan-ts` |
| [OpenCastor](https://github.com/craigm26/OpenCastor) | Python (robot runtime) | `curl -sL opencastor.com/install \| bash` |

The Python and TypeScript SDKs share an identical API surface — `RobotURI`, `RCANMessage`, `ConfidenceGate`, `HiTLGate`, `AuditChain`, and `validateConfig` work the same way in both languages.

## Links

- ⚡ [Quickstart](https://rcan.dev/quickstart) — from zero to first message in 5 min
- 📖 [RCAN Spec v1.5](https://rcan.dev/spec) — full protocol specification
- 🌐 [rcan.dev](https://rcan.dev) — robot registry and documentation
- 🐍 [rcan-py](https://github.com/continuonai/rcan-py) — Python SDK
- 🤖 [OpenCastor](https://github.com/craigm26/OpenCastor) — Python robot runtime (RCAN reference implementation)
- 🖥️ [OpenCastor Fleet UI](https://app.opencastor.com) — Flutter web app for remote fleet management (uses rcan-ts for message construction)
- 🏛️ [Robot Registry Foundation](https://robotregistryfoundation.org) — global robot identity registry

---

## License

MIT © Craig Merry
