/**
 * rcan.encoding — Canonical JSON serialization for RCAN wire formats.
 *
 * Matches Python's
 *   json.dumps(body, sort_keys=True, separators=(",",":"), ensure_ascii=False).encode("utf-8")
 *
 * Invariants (pinned by rcan-spec/fixtures/canonical-json-v1.json):
 *   - Keys sorted lexicographically at every nesting level
 *   - No whitespace
 *   - Non-ASCII Unicode emitted as raw UTF-8 (NOT \uXXXX escapes)
 *   - Integers emit without trailing .0
 *   - Empty object = {}, empty array = []
 *   - No trailing newline
 *
 * V8's JSON.stringify with no spacer produces no whitespace and emits
 * non-ASCII as raw UTF-8 (via the surrounding TextEncoder). Sorting is
 * the only thing JSON.stringify does not do by default, so we recurse
 * first via sortKeys().
 */

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/**
 * Return the canonical UTF-8 bytes of `obj`.
 * Deterministic: equivalent inputs yield identical bytes.
 */
export function canonicalJson(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(sortKeys(obj)));
}
