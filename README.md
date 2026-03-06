# rcan-ts

Official TypeScript SDK for the **RCAN v1.2** Robot Communication and Accountability Network protocol.

[![npm version](https://badge.fury.io/js/%40continuonai%2Frcan-ts.svg)](https://www.npmjs.com/package/@continuonai/rcan-ts)
[![CI](https://github.com/continuonai/rcan-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/continuonai/rcan-ts/actions)

```
npm install @continuonai/rcan-ts
```

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
