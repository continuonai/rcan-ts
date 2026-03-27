/**
 * Jest global setup — polyfill crypto.getRandomValues for Node environments
 * where @noble/post-quantum runs (Node 18 VM modules / older CI images).
 */
import { webcrypto } from "crypto";

// @noble/hashes checks globalThis.crypto.getRandomValues
if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
} else if (typeof globalThis.crypto.getRandomValues === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis.crypto as any).getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
}
