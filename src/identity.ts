/**
 * RCAN Identity & Level of Assurance (LoA) — GAP-14.
 *
 * Provides JWT-based LoA extraction and per-scope policy enforcement.
 * Backward compatible: DEFAULT_LOA_POLICY requires only ANONYMOUS (LoA 1).
 */

export enum LevelOfAssurance {
  ANONYMOUS       = 1,
  EMAIL_VERIFIED  = 2,
  HARDWARE_TOKEN  = 3,
}

export interface LoaPolicy {
  minLoaDiscover: LevelOfAssurance;
  minLoaStatus:   LevelOfAssurance;
  minLoaChat:     LevelOfAssurance;
  minLoaControl:  LevelOfAssurance;
  minLoaSafety:   LevelOfAssurance;
}

/** Backward-compatible policy — every scope accepts anonymous callers. */
export const DEFAULT_LOA_POLICY: LoaPolicy = {
  minLoaDiscover: LevelOfAssurance.ANONYMOUS,
  minLoaStatus:   LevelOfAssurance.ANONYMOUS,
  minLoaChat:     LevelOfAssurance.ANONYMOUS,
  minLoaControl:  LevelOfAssurance.ANONYMOUS,
  minLoaSafety:   LevelOfAssurance.ANONYMOUS,
};

/** Production-hardened policy — control needs e-mail, safety needs hardware token. */
export const PRODUCTION_LOA_POLICY: LoaPolicy = {
  minLoaDiscover: LevelOfAssurance.ANONYMOUS,
  minLoaStatus:   LevelOfAssurance.ANONYMOUS,
  minLoaChat:     LevelOfAssurance.ANONYMOUS,
  minLoaControl:  LevelOfAssurance.EMAIL_VERIFIED,
  minLoaSafety:   LevelOfAssurance.HARDWARE_TOKEN,
};

/**
 * Decode a JWT (header.payload.sig) and return the `loa` claim.
 * Defaults to ANONYMOUS when the claim is absent or the token is malformed.
 */
export function extractLoaFromJwt(token: string): LevelOfAssurance {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return LevelOfAssurance.ANONYMOUS;

    // Base64URL → Base64 → decode
    const payloadB64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    let json: string;
    if (typeof atob !== 'undefined') {
      json = atob(padded);
    } else {
      // Node.js
      json = Buffer.from(padded, 'base64').toString('utf-8');
    }
    const claims = JSON.parse(json) as Record<string, unknown>;
    const loa = claims['loa'];
    if (typeof loa === 'number' && loa >= 1 && loa <= 3) {
      return loa as LevelOfAssurance;
    }
  } catch {
    // fall through
  }
  return LevelOfAssurance.ANONYMOUS;
}

type ScopeName = 'discover' | 'status' | 'chat' | 'control' | 'safety';

function minLoaForScope(scope: string, policy: LoaPolicy): LevelOfAssurance | null {
  const s = scope.toLowerCase() as ScopeName;
  switch (s) {
    case 'discover': return policy.minLoaDiscover;
    case 'status':   return policy.minLoaStatus;
    case 'chat':     return policy.minLoaChat;
    case 'control':  return policy.minLoaControl;
    case 'safety':   return policy.minLoaSafety;
    default:         return null;
  }
}

/**
 * Check whether `loa` satisfies the minimum required for `scope`.
 *
 * @param loa    - Caller's assurance level
 * @param scope  - One of discover | status | chat | control | safety
 * @param policy - Defaults to DEFAULT_LOA_POLICY (backward compatible)
 */
export function validateLoaForScope(
  loa: LevelOfAssurance,
  scope: string,
  policy: LoaPolicy = DEFAULT_LOA_POLICY,
): { valid: boolean; reason: string } {
  const min = minLoaForScope(scope, policy);
  if (min === null) {
    // Unknown scope — allow by default (extensibility)
    return { valid: true, reason: 'unknown scope; allowed by default' };
  }
  if (loa >= min) {
    return { valid: true, reason: 'ok' };
  }
  return {
    valid: false,
    reason: `LOA_INSUFFICIENT: scope=${scope} requires LoA>=${min}, caller has LoA=${loa}`,
  };
}
