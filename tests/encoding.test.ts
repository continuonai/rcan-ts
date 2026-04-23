/**
 * Tests for src/encoding.ts — canonical JSON serialization.
 *
 * CRITICAL: The fixture test pins rcan-ts's output bytes to rcan-spec's
 * canonical-json-v1.json fixture, which was generated from Python's
 * json.dumps(body, sort_keys=True, separators=(",",":"), ensure_ascii=False).
 * If this test fails, JSON.stringify(sortKeys(obj)) via TextEncoder is NOT
 * producing identical bytes to Python's serializer. Do NOT edit the
 * fixture to match — escalate.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../src/encoding.js";

// ESM-compatible __dirname
const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const FIXTURE_PATH = join(_dirname, "fixtures", "canonical-json-v1.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "base64"));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe("canonicalJson — fixture parity (rcan-spec)", () => {
  for (const c of fixture.cases) {
    test(`case ${c.name}`, () => {
      const actual = canonicalJson(c.input);
      const expected = b64decode(c.expected_bytes_base64);
      const ok = bytesEqual(actual, expected);
      if (!ok) {
        console.error("EXPECTED:", new TextDecoder().decode(expected));
        console.error("ACTUAL:  ", new TextDecoder().decode(actual));
      }
      expect(ok).toBe(true);
    });
  }
});

describe("canonicalJson — unit", () => {
  test("sorts keys", () => {
    const out = canonicalJson({ b: 1, a: 2 });
    expect(new TextDecoder().decode(out)).toBe('{"a":2,"b":1}');
  });

  test("no whitespace", () => {
    const out = canonicalJson({ a: [1, 2, 3] });
    expect(new TextDecoder().decode(out)).toBe('{"a":[1,2,3]}');
  });

  test("unicode emitted as raw UTF-8, not escaped", () => {
    const out = canonicalJson({ name: "Café" });
    const s = new TextDecoder().decode(out);
    expect(s).toBe('{"name":"Café"}');
    expect(s).not.toContain("\\u00e9");
  });

  test("nested sort", () => {
    const out = canonicalJson({ z: { b: 2, a: 1 } });
    expect(new TextDecoder().decode(out)).toBe('{"z":{"a":1,"b":2}}');
  });

  test("empty containers", () => {
    const out = canonicalJson({ a: {}, b: [] });
    expect(new TextDecoder().decode(out)).toBe('{"a":{},"b":[]}');
  });

  test("returns Uint8Array", () => {
    const out = canonicalJson({ a: 1 });
    expect(out).toBeInstanceOf(Uint8Array);
  });
});
