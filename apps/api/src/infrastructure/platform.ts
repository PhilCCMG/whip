import type { Clock, IdGenerator, Sha256Hex } from '../application/ports';

/** Web Crypto / wall-clock implementations of the application's platform ports. */

export const systemClock: Clock = { nowIso: () => new Date().toISOString() };

export const randomIds: IdGenerator = {
  campaignId: () => crypto.randomUUID(),
  seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
};

export async function sha256Bytes(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

export const sha256Hex: Sha256Hex = (input) => sha256Bytes(input);

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
