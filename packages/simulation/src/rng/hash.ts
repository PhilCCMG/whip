/**
 * Non-cryptographic string hashes used for RNG seeding, stable per-entity noise and state hashes.
 * All use Math.imul (exact 32-bit integer multiply) so results are platform-independent.
 */

/** cyrb128: 128-bit hash of a string as four uint32 words (used to seed sfc32). */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** cyrb53: 53-bit hash of a string (safe integer). */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Stable uint32 hash of the joined parts. */
export function hashInt(...parts: (string | number)[]): number {
  return cyrb53(parts.join('|')) >>> 0;
}

/**
 * Stable value in [0, 1) for the given parts. Used for per-entity noise that must not depend on
 * iteration order or on how many other draws happened (e.g. an MP's personal noise on a division).
 */
export function hashUnit(...parts: (string | number)[]): number {
  return cyrb53(parts.join('|')) / 9007199254740992;
}

/** 106-bit hex digest (two independent cyrb53 lanes). Non-cryptographic; for determinism tests. */
export function hashString(str: string): string {
  const a = cyrb53(str, 0x9e3779b9);
  const b = cyrb53(str, 0x85ebca6b);
  return a.toString(16).padStart(14, '0') + b.toString(16).padStart(14, '0');
}
