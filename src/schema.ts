/**
 * Fetch and validate against canonical RCAN JSON schemas from rcan.dev.
 * Caches schema in memory for the session (no filesystem deps for browser compat).
 */

const SCHEMA_BASE = 'https://rcan.dev/schemas';
const schemaCache = new Map<string, object>();

/** Clear the in-memory schema cache. Intended for use in tests only. */
export function _clearSchemaCache(): void {
  schemaCache.clear();
}

export async function fetchCanonicalSchema(schemaName: string): Promise<object | null> {
  if (schemaCache.has(schemaName)) return schemaCache.get(schemaName)!;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    // .unref() prevents the timer from keeping the Node.js event loop alive after tests
    (timer as unknown as { unref?: () => void }).unref?.();
    const res = await fetch(`${SCHEMA_BASE}/${schemaName}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const schema = await res.json();
    schemaCache.set(schemaName, schema);
    return schema;
  } catch {
    return null; // graceful degradation
  }
}

/**
 * Validate a config object against the canonical rcan-config schema from rcan.dev.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 * Gracefully returns { valid: true, skipped: true } if schema unreachable.
 */
export async function validateConfigAgainstSchema(
  config: unknown
): Promise<{ valid: boolean; errors?: string[]; skipped?: boolean }> {
  const schema = await fetchCanonicalSchema('rcan-config.schema.json');
  if (!schema) return { valid: true, skipped: true };

  // Basic structural validation (no heavy jsonschema dep — just check required keys)
  const errors: string[] = [];
  if (typeof config !== 'object' || config === null) {
    return { valid: false, errors: ['Config must be an object'] };
  }
  const cfg = config as Record<string, unknown>;
  const required = (schema as any).required ?? [];
  for (const key of required) {
    if (!(key in cfg)) errors.push(`Missing required field: ${key}`);
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export async function validateNodeAgainstSchema(
  manifest: unknown
): Promise<{ valid: boolean; errors?: string[]; skipped?: boolean }> {
  const schema = await fetchCanonicalSchema('rcan-node.schema.json');
  if (!schema) return { valid: true, skipped: true };

  const errors: string[] = [];
  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, errors: ['Manifest must be an object'] };
  }
  const m = manifest as Record<string, unknown>;
  const required = (schema as any).required ?? [];
  for (const key of required) {
    if (!(key in m)) errors.push(`Missing required field: ${key}`);
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
