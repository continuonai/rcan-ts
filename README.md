# rcan-ts

Official TypeScript SDK for the **RCAN v1.2** Robot Communication and Accountability Network protocol.

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

## Distributed Registry (NodeClient)

RCAN v1.2 §17 introduces a federated registry network. `NodeClient` resolves RRNs from any node — root or delegated authoritative.

```typescript
import { NodeClient } from "@continuonai/rcan-ts";

const client = new NodeClient();

// Discover which node is authoritative for an RRN
const node = await client.discover("RRN-BD-00000001");
console.log(node.node_type);  // "authoritative"
console.log(node.operator);   // "Boston Dynamics, Inc."

// Resolve a full robot record
const robot = await client.resolve("RRN-BD-00000001");
console.log(robot.robot_name);  // "Atlas Unit 001"

// Custom root
const client2 = new NodeClient({ rootUrl: "https://rcan.dev" });
```

**RRN Formats:**

| Format | Example | Notes |
|--------|---------|-------|
| Root (legacy) | `RRN-00000042` | 8-digit; still valid |
| Root (recommended) | `RRN-000000000042` | 12-digit for new registrations |
| Delegated | `RRN-BD-00000001` | Namespace prefix + sequence |

## Schema Validation

Validate configs against the canonical JSON schema published at rcan.dev:

```typescript
import { validateConfigAgainstSchema, validateNodeAgainstSchema, fetchCanonicalSchema } from "@continuonai/rcan-ts";

// Validate a config object against the live schema
const result = await validateConfigAgainstSchema(myConfig);
if (!result.ok) {
  result.issues.forEach(i => console.error("❌", i));
}

// Validate a node manifest
const nodeResult = await validateNodeAgainstSchema(myNodeManifest);

// Fetch the raw schema (e.g., for editor integration)
const schema = await fetchCanonicalSchema("rcan-config");
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
- 📖 [RCAN Spec](https://rcan.dev/spec) — full protocol specification
- 🌐 [rcan.dev](https://rcan.dev) — robot registry and documentation
- 🐍 [rcan-py](https://github.com/continuonai/rcan-py) — Python SDK
- 🤖 [OpenCastor](https://github.com/craigm26/OpenCastor) — robot runtime with RCAN built in

---

## License

MIT © Craig Merry
