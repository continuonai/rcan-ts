/**
 * RCAN v2.2 Delegation and Media envelope types.
 * Spec: https://robotregistryfoundation.org/docs/mcp/
 */
/** A single hop in a v2.2 delegation chain. */
export interface DelegationHop {
  robot_rrn: string;
  scope: string;
  issued_at: string;
  expires_at: string;
  sig?: string;
}

/** An inline or by-reference media attachment for v2.2 messages. */
export interface MediaChunk {
  chunk_id: string;
  mime_type: string;
  size_bytes: number;
  hash_sha256: string;
  data?: string;
  ref_url?: string;
}

export const MAX_DELEGATION_DEPTH = 3;

export function validateDelegationChain(chain: DelegationHop[]): void {
  if (chain.length > MAX_DELEGATION_DEPTH) {
    throw new Error(
      `RCAN: delegation chain max depth is ${MAX_DELEGATION_DEPTH}, got ${chain.length}`
    );
  }
}

// Allow test environments to inject a hash function (avoids ESM/CJS require issues)
// In production, crypto.createHash is used via dynamic detection.
// @internal
export let _hashImpl: ((data: string) => string) | undefined;

/** @internal — for testing only */
export function _setHashImpl(fn: ((data: string) => string) | undefined): void {
  _hashImpl = fn;
}

export function verifyMediaChunkHash(chunk: MediaChunk): void {
  if (!chunk.data) return;
  let actual: string | undefined;

  if (_hashImpl) {
    actual = _hashImpl(chunk.data);
  } else {
    try {
      // Works in Node.js CJS; skipped gracefully in pure ESM/browser
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = typeof require !== "undefined" ? require : null;
      if (!m) return;
      const { createHash } = m("node:crypto") as {
        createHash: (a: string) => { update: (d: string) => { digest: (e: string) => string } };
      };
      actual = "sha256:" + createHash("sha256").update(chunk.data).digest("hex");
    } catch {
      return; // crypto unavailable
    }
  }

  if (actual !== chunk.hash_sha256) {
    throw new Error(`MediaChunk hash mismatch: expected ${chunk.hash_sha256}, got ${actual}`);
  }
}

// Aliases
export type V22DelegationHop = DelegationHop;
export type V22MediaChunk = MediaChunk;
export { validateDelegationChain as validateV22DelegationChain };
export { verifyMediaChunkHash as verifyV22MediaChunkHash };
