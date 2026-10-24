import { describe, expect, it } from 'vitest';
import { SnapshotIntegrityError } from '../../application/ports';
import { createGzipChunkCodec } from './gzip-chunk-codec';

describe('gzip chunk codec', () => {
  const json = JSON.stringify({ hello: 'world', items: Array.from({ length: 2000 }, (_, i) => i) });

  it('round-trips through multiple chunks', async () => {
    const codec = createGzipChunkCodec(128);
    const enc = await codec.encode(json);
    expect(enc.chunks.length).toBeGreaterThan(1);
    expect(enc.chunks.every((c) => c.byteLength <= 128)).toBe(true);
    expect(enc.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await codec.decode(enc.chunks, enc.stateHash)).toBe(json);
  });

  it('detects a hash mismatch and corrupted data', async () => {
    const codec = createGzipChunkCodec(128);
    const enc = await codec.encode(json);
    await expect(codec.decode(enc.chunks, '0'.repeat(64))).rejects.toBeInstanceOf(
      SnapshotIntegrityError,
    );
    const corrupted = enc.chunks.map((c) => c.slice());
    corrupted[0]![20] = (corrupted[0]![20] ?? 0) ^ 0xff;
    await expect(codec.decode(corrupted, enc.stateHash)).rejects.toBeInstanceOf(
      SnapshotIntegrityError,
    );
    await expect(codec.decode(enc.chunks.slice(1), enc.stateHash)).rejects.toBeInstanceOf(
      SnapshotIntegrityError,
    );
  });
});
