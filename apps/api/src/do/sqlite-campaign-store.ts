import type { HistoryType } from '../application/dto';
import type {
  CampaignMetaRecord,
  CampaignStore,
  CommitRequest,
  CommitResult,
  HistoryRow,
  RevisionRecord,
  StoreHistoryQuery,
  StoredIdempotency,
  StoredTurnReport,
} from '../application/ports';
import { runDoSchemaMigrations } from './schema-migrations';

type RevisionRow = {
  revision: number;
  turn: number;
  sim_date: string;
  reason: string;
  state_hash: string;
  byte_size: number;
  chunk_count: number;
  simulation_version: number;
  created_at: string;
};

type HistoryDbRow = {
  seq: number;
  revision: number;
  turn: number;
  sim_date: string;
  type: string;
  importance: number;
  actor_ids: string;
  subject_ids: string;
  payload: string;
};

/**
 * `CampaignStore` over the Campaign DO's SQLite storage (docs/architecture/04-persistence.md §2–3).
 * `commit` runs inside `transactionSync`, so it is all-or-nothing.
 */
export class SqliteCampaignStore implements CampaignStore {
  constructor(private readonly storage: DurableObjectStorage) {}

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  getMeta(): CampaignMetaRecord | null {
    const v = this.metaValue('campaign');
    return v === null ? null : (JSON.parse(v) as CampaignMetaRecord);
  }

  currentRevision(): number | null {
    const v = this.metaValue('current_revision');
    return v === null ? null : Number(v);
  }

  getRevision(revision: number): RevisionRecord | null {
    const row = this.sql
      .exec<RevisionRow>('SELECT * FROM revisions WHERE revision = ?', revision)
      .toArray()[0];
    return row ? toRevision(row) : null;
  }

  readChunks(revision: number): Uint8Array[] {
    return this.sql
      .exec<{ data: ArrayBuffer }>(
        'SELECT data FROM snapshot_chunks WHERE revision = ? ORDER BY idx',
        revision,
      )
      .toArray()
      .map((r) => new Uint8Array(r.data));
  }

  findIdempotency(key: string): StoredIdempotency | null {
    const row = this.sql
      .exec<{ request_hash: string; response: string; revision: number }>(
        'SELECT request_hash, response, revision FROM idempotency WHERE key = ?',
        key,
      )
      .toArray()[0];
    return row
      ? { requestHash: row.request_hash, response: row.response, revision: row.revision }
      : null;
  }

  commit(req: CommitRequest): CommitResult {
    return this.storage.transactionSync((): CommitResult => {
      const sql = this.sql;
      if (req.idempotency) {
        const stored = this.findIdempotency(req.idempotency.key);
        if (stored) return { status: 'replay', stored };
      }
      const current = this.currentRevision();
      const expectedOk =
        req.expectedRevision === null ? current === null : current === req.expectedRevision;
      if (!expectedOk) return { status: 'conflict', currentRevision: current };

      const r = req.revision;
      sql.exec(
        `INSERT INTO revisions (revision, turn, sim_date, reason, state_hash, byte_size, chunk_count, simulation_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.revision,
        r.turn,
        r.simDate,
        r.reason,
        r.stateHash,
        r.byteSize,
        r.chunkCount,
        r.simulationVersion,
        r.createdAt,
      );
      if ('chunks' in req.snapshot) {
        req.snapshot.chunks.forEach((chunk, idx) => {
          sql.exec(
            'INSERT INTO snapshot_chunks (revision, idx, data) VALUES (?, ?, ?)',
            r.revision,
            idx,
            chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength),
          );
        });
      } else {
        sql.exec(
          'INSERT INTO snapshot_chunks (revision, idx, data) SELECT ?, idx, data FROM snapshot_chunks WHERE revision = ?',
          r.revision,
          req.snapshot.copyFromRevision,
        );
      }

      if (req.deleteHistoryAfterRevision !== undefined) {
        sql.exec(
          'DELETE FROM history_subjects WHERE seq IN (SELECT seq FROM history WHERE revision > ?)',
          req.deleteHistoryAfterRevision,
        );
        sql.exec('DELETE FROM history WHERE revision > ?', req.deleteHistoryAfterRevision);
        sql.exec('DELETE FROM turn_reports WHERE revision > ?', req.deleteHistoryAfterRevision);
        sql.exec(
          'DELETE FROM turn_report_chunks WHERE revision > ?',
          req.deleteHistoryAfterRevision,
        );
      }

      if (req.turnReport !== undefined) {
        const body = req.turnReport;
        if ('json' in body) {
          sql.exec(
            "INSERT INTO turn_reports (revision, report, encoding) VALUES (?, ?, 'json')",
            r.revision,
            body.json,
          );
        } else {
          // Too large for one row: gzip chunks, report column holds the SHA-256 of the JSON.
          sql.exec(
            "INSERT INTO turn_reports (revision, report, encoding) VALUES (?, ?, 'gzip_chunks')",
            r.revision,
            body.hash,
          );
          body.chunks.forEach((chunk, idx) => {
            sql.exec(
              'INSERT INTO turn_report_chunks (revision, idx, data) VALUES (?, ?, ?)',
              r.revision,
              idx,
              chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength),
            );
          });
        }
        // Only the newest report is ever served; keep just that one.
        sql.exec('DELETE FROM turn_reports WHERE revision < ?', r.revision);
        sql.exec('DELETE FROM turn_report_chunks WHERE revision < ?', r.revision);
      }

      for (const h of req.history) {
        const { seq } = sql
          .exec<{ seq: number }>(
            `INSERT INTO history (revision, turn, sim_date, type, importance, actor_ids, subject_ids, payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
            r.revision,
            h.turn,
            h.simDate,
            h.type,
            h.importance,
            JSON.stringify(h.actorIds),
            JSON.stringify(h.subjectIds),
            JSON.stringify({ title: h.title, summary: h.summary, data: h.data ?? null }),
          )
          .one();
        for (const pid of new Set([...h.actorIds, ...h.subjectIds])) {
          sql.exec(
            'INSERT OR IGNORE INTO history_subjects (politician_id, seq) VALUES (?, ?)',
            pid,
            seq,
          );
        }
      }

      if (req.idempotency) {
        sql.exec(
          'INSERT INTO idempotency (key, request_hash, response, revision, created_at) VALUES (?, ?, ?, ?, ?)',
          req.idempotency.key,
          req.idempotency.requestHash,
          req.idempotency.response,
          r.revision,
          r.createdAt,
        );
      }

      this.setMeta('current_revision', String(r.revision));
      this.setMeta('campaign', JSON.stringify(req.meta));

      const pruneAtOrBelow = r.revision - req.retainRevisions;
      if (pruneAtOrBelow > 0) {
        sql.exec('DELETE FROM snapshot_chunks WHERE revision <= ?', pruneAtOrBelow);
        sql.exec('DELETE FROM revisions WHERE revision <= ?', pruneAtOrBelow);
      }
      if (req.pruneIdempotencyBefore !== undefined) {
        sql.exec('DELETE FROM idempotency WHERE created_at < ?', req.pruneIdempotencyBefore);
      }
      return { status: 'committed' };
    });
  }

  history(q: StoreHistoryQuery): HistoryRow[] {
    const where: string[] = [];
    const params: SqlStorageValue[] = [];
    let from = 'history h';
    if (q.politicianId !== undefined) {
      from += ' JOIN history_subjects s ON s.seq = h.seq AND s.politician_id = ?';
      params.push(q.politicianId);
    }
    if (q.beforeSeq !== undefined) {
      where.push('h.seq < ?');
      params.push(q.beforeSeq);
    }
    if (q.type !== undefined) {
      where.push('h.type = ?');
      params.push(q.type);
    }
    if (q.minImportance !== undefined) {
      where.push('h.importance >= ?');
      params.push(q.minImportance);
    }
    if (q.fromTurn !== undefined) {
      where.push('h.turn >= ?');
      params.push(q.fromTurn);
    }
    params.push(q.limit);
    const sqlText = `SELECT h.* FROM ${from} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY h.seq DESC LIMIT ?`;
    return this.sql
      .exec<HistoryDbRow>(sqlText, ...params)
      .toArray()
      .map((row) => {
        const payload = JSON.parse(row.payload) as { title: string; summary: string };
        return {
          seq: row.seq,
          revision: row.revision,
          turn: row.turn,
          simDate: row.sim_date,
          type: row.type as HistoryType,
          importance: row.importance,
          actorIds: JSON.parse(row.actor_ids) as string[],
          subjectIds: JSON.parse(row.subject_ids) as string[],
          title: payload.title,
          summary: payload.summary,
        };
      });
  }

  latestTurnReport(): StoredTurnReport | null {
    const row = this.sql
      .exec<{ revision: number; report: string; encoding: string }>(
        'SELECT revision, report, encoding FROM turn_reports ORDER BY revision DESC LIMIT 1',
      )
      .toArray()[0];
    if (!row) return null;
    if (row.encoding !== 'gzip_chunks') return { revision: row.revision, json: row.report };
    const chunks = this.sql
      .exec<{ data: ArrayBuffer }>(
        'SELECT data FROM turn_report_chunks WHERE revision = ? ORDER BY idx',
        row.revision,
      )
      .toArray()
      .map((c) => new Uint8Array(c.data));
    return { revision: row.revision, chunks, hash: row.report };
  }

  async destroy(): Promise<void> {
    await this.storage.deleteAll();
    // Leave a valid, empty schema behind so later calls answer NOT_FOUND instead of throwing.
    runDoSchemaMigrations(this.sql);
  }

  private metaValue(key: string): string | null {
    const row = this.sql
      .exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)
      .toArray()[0];
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.sql.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }
}

function toRevision(row: RevisionRow): RevisionRecord {
  return {
    revision: row.revision,
    turn: row.turn,
    simDate: row.sim_date,
    reason: row.reason,
    stateHash: row.state_hash,
    byteSize: row.byte_size,
    chunkCount: row.chunk_count,
    simulationVersion: row.simulation_version,
    createdAt: row.created_at,
  };
}
