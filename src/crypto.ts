/**
 * Cross-platform crypto utilities — Node.js, browser, Cloudflare Workers, Deno.
 *
 * Uses Web Crypto API (SubtleCrypto) as the primary implementation, with a
 * Node.js `crypto` module fallback for environments that predate the global
 * `crypto` object (Node < 19).
 */

/** Generate a UUID v4. Works in all modern environments. */
export function generateUUID(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Node.js < 19 fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { randomUUID } = require("crypto") as { randomUUID: () => string };
    return randomUUID();
  } catch {
    // Last-resort UUID fallback (no external deps)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

/**
 * Compute HMAC-SHA256 and return hex string.
 * Synchronous via Node.js `crypto`; falls back to a pure-JS impl in browsers.
 */
export function hmacSha256Sync(secret: string, data: string): string {
  // Node.js environment
  if (typeof process !== "undefined" && process.versions?.node) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createHmac } = require("crypto") as {
        createHmac: (alg: string, key: string) => { update: (d: string) => { digest: (enc: string) => string } };
      };
      return createHmac("sha256", secret).update(data).digest("hex");
    } catch {
      // fall through to pure-JS
    }
  }
  // Pure-JS HMAC-SHA256 (browser / Workers / Deno without native crypto)
  return pureHmacSha256(secret, data);
}

// ── Pure-JS SHA-256 + HMAC (no deps) ─────────────────────────────────────────
// Based on the public-domain SHA-256 implementation.

function sha256(msg: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const msgLen = msg.length;
  const bitLen = msgLen * 8;
  const padded: number[] = [...msg];
  padded.push(0x80);
  while ((padded.length % 64) !== 56) padded.push(0);
  for (let i = 7; i >= 0; i--) padded.push((bitLen / Math.pow(2, i * 8)) & 0xff);

  for (let i = 0; i < padded.length; i += 64) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) {
      w[j] = (padded[i+j*4]<<24)|(padded[i+j*4+1]<<16)|(padded[i+j*4+2]<<8)|padded[i+j*4+3];
    }
    for (let j = 16; j < 64; j++) {
      const s0 = ror(w[j-15],7)^ror(w[j-15],18)^(w[j-15]>>>3);
      const s1 = ror(w[j-2],17)^ror(w[j-2],19)^(w[j-2]>>>10);
      w[j] = (w[j-16]+s0+w[j-7]+s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
    for (let j = 0; j < 64; j++) {
      const S1 = ror(e,6)^ror(e,11)^ror(e,25);
      const ch = (e&f)^(~e&g);
      const temp1 = (h+S1+ch+K[j]+w[j])>>>0;
      const S0 = ror(a,2)^ror(a,13)^ror(a,22);
      const maj = (a&b)^(a&c)^(b&c);
      const temp2 = (S0+maj)>>>0;
      [h,g,f,e,d,c,b,a] = [g,f,e,(d+temp1)>>>0,c,b,a,(temp1+temp2)>>>0];
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }
  const out = new Uint8Array(32);
  const view = new DataView(out.buffer);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i) => view.setUint32(i*4, v));
  return out;
}

function ror(x: number, n: number): number { return (x>>>n)|(x<<(32-n)); }

function toBytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2,"0")).join("");
}

function pureHmacSha256(key: string, data: string): string {
  const BLOCK = 64;
  let keyBytes = toBytes(key);
  if (keyBytes.length > BLOCK) keyBytes = sha256(keyBytes);
  const ipad = new Uint8Array(BLOCK), opad = new Uint8Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    ipad[i] = (keyBytes[i] ?? 0) ^ 0x36;
    opad[i] = (keyBytes[i] ?? 0) ^ 0x5c;
  }
  const dataBytes = toBytes(data);
  const inner = new Uint8Array(BLOCK + dataBytes.length);
  inner.set(ipad); inner.set(dataBytes, BLOCK);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(BLOCK + 32);
  outer.set(opad); outer.set(innerHash, BLOCK);
  return toHex(sha256(outer));
}
