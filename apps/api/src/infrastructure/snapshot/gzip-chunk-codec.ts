import {
  type EncodedSnapshot,
  type SnapshotCodec,
  SnapshotIntegrityError,
} from '../../application/ports';
import { sha256Bytes } from '../platform';

/** D1 / DO SQLite rows are capped at 2 MB; we stay well under with 1 MiB chunks. */
export const SNAPSHOT_CHUNK_BYTES = 1024 * 1024;

/**
 * Snapshot encoding (docs/architecture/04-persistence.md §2): canonical JSON → gzip
 * (CompressionStream) → ≤ 1 MiB chunks, with a SHA-256 of the JSON verified on every load.
 */
export function createGzipChunkCodec(chunkBytes = SNAPSHOT_CHUNK_BYTES): SnapshotCodec {
  return {
    async encode(json: string): Promise<EncodedSnapshot> {
      const raw = new TextEncoder().encode(json);
      const [stateHash, compressed] = await Promise.all([sha256Bytes(raw), gzip(raw)]);
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < compressed.byteLength; i += chunkBytes) {
        chunks.push(compressed.slice(i, i + chunkBytes));
      }
      if (chunks.length === 0) chunks.push(new Uint8Array(0));
      return { chunks, stateHash, byteSize: compressed.byteLength };
    },

    async decode(chunks: Uint8Array[], expectedHash: string): Promise<string> {
      let raw: Uint8Array;
      try {
        raw = await gunzip(concat(chunks));
      } catch (err) {
        throw new SnapshotIntegrityError(
          `Snapshot failed to decompress: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const actual = await sha256Bytes(raw);
      if (actual !== expectedHash) {
        throw new SnapshotIntegrityError('Snapshot hash mismatch.');
      }
      return new TextDecoder().decode(raw);
    },
  };
}

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  return pipe(data, new CompressionStream('gzip'));
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  return pipe(data, new DecompressionStream('gzip'));
}

async function pipe(
  data: Uint8Array,
  transform: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // Errors surface on the readable side; swallow the writer's copy to avoid unhandled rejections.
  const written = writer
    .write(data as Uint8Array<ArrayBuffer>)
    .then(() => writer.close())
    .catch(() => undefined);
  const out = new Uint8Array(await new Response(transform.readable).arrayBuffer());
  await written;
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
