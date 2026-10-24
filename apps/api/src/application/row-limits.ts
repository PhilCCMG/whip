import type { HistoryRowInput } from './engine';

/**
 * Size caps for single SQLite rows in the Campaign DO (rows / values are capped at 2 MB). Without
 * them one oversized but deterministic engine output would make every retry of that mutation fail
 * forever, bricking the campaign. Enforced before the commit transaction.
 */
export const ROW_LIMITS = {
  /** history.payload (`{ title, summary, data }` JSON). */
  historyPayloadBytes: 64 * 1024,
  /** history.actor_ids / subject_ids JSON (each). */
  historyIdsBytes: 16 * 1024,
  /** idempotency.response; larger responses store a compact reference instead. */
  idempotencyResponseBytes: 512 * 1024,
  /** turn_reports.report inline JSON; larger reports are stored gzip-chunked. */
  turnReportInlineBytes: 1.5 * 1024 * 1024,
} as const;

export type RowLimits = { [K in keyof typeof ROW_LIMITS]: number };

/** Marker appended to text we had to cut. */
export const TRUNCATED_MARKER = '… [truncated]';

const encoder = new TextEncoder();

export function utf8Bytes(s: string): number {
  return encoder.encode(s).byteLength;
}

/** Cuts `s` to at most `maxBytes` UTF-8 bytes (marker included), never splitting a code point. */
export function truncateUtf8(s: string, maxBytes: number): string {
  if (utf8Bytes(s) <= maxBytes) return s;
  const budget = Math.max(0, maxBytes - utf8Bytes(TRUNCATED_MARKER));
  let bytes = 0;
  let out = '';
  for (const ch of s) {
    const n = utf8Bytes(ch);
    if (bytes + n > budget) break;
    bytes += n;
    out += ch;
  }
  return out + TRUNCATED_MARKER;
}

function boundIds(ids: string[], maxBytes: number): string[] {
  if (utf8Bytes(JSON.stringify(ids)) <= maxBytes) return ids;
  const kept: string[] = [];
  let bytes = 2; // []
  for (const id of ids) {
    const n = utf8Bytes(JSON.stringify(id)) + 1;
    if (bytes + n > maxBytes) break;
    bytes += n;
    kept.push(id);
  }
  return kept;
}

/**
 * Keeps a history row's stored payload within `historyPayloadBytes`: first drops the optional
 * `data` (replaced by `{ truncated: true }`), then cuts summary and title. Over-long actor/subject
 * id lists are cut too. Rows that fit are returned unchanged (same object).
 */
export function boundHistoryRow(
  row: HistoryRowInput,
  limits: RowLimits = ROW_LIMITS,
): HistoryRowInput {
  const payloadSize = (r: Pick<HistoryRowInput, 'title' | 'summary' | 'data'>) =>
    utf8Bytes(JSON.stringify({ title: r.title, summary: r.summary, data: r.data ?? null }));
  const actorIds = boundIds(row.actorIds, limits.historyIdsBytes);
  const subjectIds = boundIds(row.subjectIds, limits.historyIdsBytes);
  if (
    payloadSize(row) <= limits.historyPayloadBytes &&
    actorIds === row.actorIds &&
    subjectIds === row.subjectIds
  ) {
    return row;
  }
  let next: HistoryRowInput = { ...row, actorIds, subjectIds };
  if (payloadSize(next) > limits.historyPayloadBytes && next.data !== undefined) {
    next = { ...next, data: { truncated: true } };
  }
  if (payloadSize(next) > limits.historyPayloadBytes) {
    const title = truncateUtf8(next.title, Math.min(1024, limits.historyPayloadBytes / 8));
    // JSON escaping can grow text up to 6×; leave room for the envelope and the title.
    const room = limits.historyPayloadBytes - payloadSize({ ...next, title, summary: '' });
    let max = Math.max(0, room);
    let summary = truncateUtf8(next.summary, max);
    while (max > 0 && payloadSize({ ...next, title, summary }) > limits.historyPayloadBytes) {
      max = Math.floor(max / 2);
      summary = max > 0 ? truncateUtf8(next.summary, max) : '';
    }
    next = { ...next, title, summary };
  }
  return next;
}

/**
 * What the idempotency table stores in place of a response too large for one row: a reference to
 * the turn report of that revision (rebuilt on replay), or `omitted` for other responses.
 */
export interface StoredResponseRef {
  storedRef: 'turn_report' | 'omitted';
  revision: number;
}

export function isStoredResponseRef(value: unknown): value is StoredResponseRef {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { storedRef?: unknown; revision?: unknown };
  return (
    (v.storedRef === 'turn_report' || v.storedRef === 'omitted') && typeof v.revision === 'number'
  );
}
