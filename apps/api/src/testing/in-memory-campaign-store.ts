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
  StoredTurnReportBody,
} from '../application/ports';

/**
 * In-memory `CampaignStore` for unit tests: same semantics as SqliteCampaignStore, with a
 * copy-on-write commit so a throwing commit leaves no trace. `failNextCommit` simulates a crash.
 */
export class InMemoryCampaignStore implements CampaignStore {
  private data = empty();
  private nextSeq = 1;
  failNextCommit = false;

  getMeta(): CampaignMetaRecord | null {
    return this.data.meta;
  }
  currentRevision(): number | null {
    return this.data.current;
  }
  getRevision(revision: number): RevisionRecord | null {
    return this.data.revisions.get(revision) ?? null;
  }
  readChunks(revision: number): Uint8Array[] {
    return (this.data.chunks.get(revision) ?? []).map((c) => c.slice());
  }
  findIdempotency(key: string): StoredIdempotency | null {
    return this.data.idempotency.get(key) ?? null;
  }

  /** Test hook: overwrite a stored chunk (snapshot integrity tests). */
  corruptChunk(revision: number, idx = 0): void {
    const chunk = this.data.chunks.get(revision)?.[idx];
    if (!chunk) throw new Error('no such chunk');
    chunk[Math.floor(chunk.length / 2)] = (chunk[Math.floor(chunk.length / 2)] ?? 0) ^ 0xff;
  }

  revisionNumbers(): number[] {
    return [...this.data.revisions.keys()].sort((a, b) => a - b);
  }

  commit(req: CommitRequest): CommitResult {
    if (req.idempotency) {
      const stored = this.data.idempotency.get(req.idempotency.key);
      if (stored) return { status: 'replay', stored };
    }
    const current = this.data.current;
    const expectedOk =
      req.expectedRevision === null ? current === null : current === req.expectedRevision;
    if (!expectedOk) return { status: 'conflict', currentRevision: current };

    const next = clone(this.data);
    let seq = this.nextSeq;
    const r = req.revision;
    next.revisions.set(r.revision, { ...r });
    next.chunks.set(
      r.revision,
      'chunks' in req.snapshot
        ? req.snapshot.chunks.map((c) => c.slice())
        : (next.chunks.get(req.snapshot.copyFromRevision) ?? []).map((c) => c.slice()),
    );
    if (req.deleteHistoryAfterRevision !== undefined) {
      const cutoff = req.deleteHistoryAfterRevision;
      next.history = next.history.filter((h) => h.revision <= cutoff);
      for (const rev of [...next.turnReports.keys()])
        if (rev > cutoff) next.turnReports.delete(rev);
    }
    if (req.turnReport !== undefined) {
      const body = req.turnReport;
      next.turnReports.set(
        r.revision,
        'json' in body
          ? { json: body.json }
          : { chunks: body.chunks.map((c) => c.slice()), hash: body.hash },
      );
    }
    for (const h of req.history) {
      next.history.push({
        seq: seq++,
        revision: r.revision,
        turn: h.turn,
        simDate: h.simDate,
        type: h.type,
        importance: h.importance,
        actorIds: [...h.actorIds],
        subjectIds: [...h.subjectIds],
        title: h.title,
        summary: h.summary,
        data: h.data,
      });
    }
    if (req.idempotency) {
      next.idempotency.set(req.idempotency.key, {
        requestHash: req.idempotency.requestHash,
        response: req.idempotency.response,
        revision: r.revision,
      });
      next.idempotencyCreated.set(req.idempotency.key, r.createdAt);
    }
    next.current = r.revision;
    next.meta = { ...req.meta };
    const pruneAtOrBelow = r.revision - req.retainRevisions;
    for (const rev of [...next.revisions.keys()]) {
      if (rev <= pruneAtOrBelow) {
        next.revisions.delete(rev);
        next.chunks.delete(rev);
      }
    }
    if (req.pruneIdempotencyBefore !== undefined) {
      for (const [key, at] of next.idempotencyCreated) {
        if (at < req.pruneIdempotencyBefore) {
          next.idempotency.delete(key);
          next.idempotencyCreated.delete(key);
        }
      }
    }
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('simulated storage failure');
    }
    this.data = next;
    this.nextSeq = seq;
    return { status: 'committed' };
  }

  latestTurnReport(): StoredTurnReport | null {
    const revs = [...this.data.turnReports.keys()];
    if (revs.length === 0) return null;
    const revision = Math.max(...revs);
    const body = this.data.turnReports.get(revision);
    return body ? { ...body, revision } : null;
  }

  /** Test hook: raw stored idempotency response (size-cap tests). */
  storedResponse(key: string): string | null {
    return this.data.idempotency.get(key)?.response ?? null;
  }

  /** Test hook: how the newest turn report is stored. */
  turnReportEncoding(): 'json' | 'gzip_chunks' | null {
    const latest = this.latestTurnReport();
    if (!latest) return null;
    return 'json' in latest ? 'json' : 'gzip_chunks';
  }

  /** Test hook: stored history rows including the payload size the SQLite store would write. */
  historyPayloadBytes(): number[] {
    return this.data.history.map(
      (h) =>
        new TextEncoder().encode(
          JSON.stringify({ title: h.title, summary: h.summary, data: h.data ?? null }),
        ).byteLength,
    );
  }

  history(q: StoreHistoryQuery): HistoryRow[] {
    return this.data.history
      .filter(
        (h) =>
          (q.beforeSeq === undefined || h.seq < q.beforeSeq) &&
          (q.type === undefined || h.type === q.type) &&
          (q.minImportance === undefined || h.importance >= q.minImportance) &&
          (q.fromTurn === undefined || h.turn >= q.fromTurn) &&
          (q.politicianId === undefined ||
            h.actorIds.includes(q.politicianId) ||
            h.subjectIds.includes(q.politicianId)),
      )
      .sort((a, b) => b.seq - a.seq)
      .slice(0, q.limit)
      .map((h) => ({ ...h }));
  }

  destroy(): Promise<void> {
    this.data = empty();
    return Promise.resolve();
  }
}

function empty() {
  return {
    meta: null as CampaignMetaRecord | null,
    current: null as number | null,
    revisions: new Map<number, RevisionRecord>(),
    chunks: new Map<number, Uint8Array[]>(),
    history: [] as (HistoryRow & { data?: unknown })[],
    idempotency: new Map<string, StoredIdempotency>(),
    idempotencyCreated: new Map<string, string>(),
    turnReports: new Map<number, StoredTurnReportBody>(),
  };
}

function clone(d: ReturnType<typeof empty>): ReturnType<typeof empty> {
  return {
    meta: d.meta,
    current: d.current,
    revisions: new Map(d.revisions),
    chunks: new Map(d.chunks),
    history: [...d.history],
    idempotency: new Map(d.idempotency),
    idempotencyCreated: new Map(d.idempotencyCreated),
    turnReports: new Map(d.turnReports),
  };
}
