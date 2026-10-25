# 04 — Persistence

Status: **Accepted** (approved 2026-10-24)

Platform facts used below were verified against developers.cloudflare.com on 2026-10-24
(D1 limits, DO SQLite storage API, R2 conditional writes). Key numbers:

| Constraint | Value | Consequence |
|---|---|---|
| D1 max DB size | 10 GB (Paid) | One shared D1 cannot hold decades of history for thousands of campaigns |
| D1 / DO SQLite max row/BLOB | 2 MB | Snapshots must be chunked |
| D1 / DO bound params | 100 per statement | Batch history inserts in groups |
| D1 `batch()` | Atomic (SQL transaction), no interactive `BEGIN` | Read-check-write must be expressed as guarded statements |
| DO SQLite storage | 10 GB per object, `transactionSync`, 30-day PITR | Natural per-campaign partition with local transactions |
| R2 | Strong read-after-write, `onlyIf.etagMatches` CAS, 1 write/s per key | Good for immutable archives/exports, not hot state |
| Workers CPU | 10 ms Free / up to 5 min Paid | **Workers Paid plan required** |

## 1. Storage map

| Data | Store | Why |
|---|---|---|
| Users, sessions, auth accounts | **D1** (`whip-core`) | Relational, cross-user queries, auth library expects SQL |
| Campaign index (id, owner, name, date, revision, status) | **D1** | "List my campaigns" across campaigns; ownership check before routing |
| User preferences | **D1** | Small, per-user |
| Canonical `GameState` snapshot (+ last N revisions) | **Campaign Durable Object** (SQLite) | Single writer per campaign, atomic local transactions, in-memory hot state |
| Historical political records | **Campaign Durable Object** (SQLite, indexed table) | Grows for decades; partitioned per campaign so it never hits a global cap |
| Idempotency keys | **Campaign Durable Object** | Checked in the same transaction as the commit |
| Exports, save archives, old revisions | **R2** (`whip-saves`) | Large, immutable, cheap |
| Static world definitions | **Bundled** in the Worker from `packages/content` (versioned with code). Large geo assets → R2/static assets | Content is code-reviewed data, not user data |

## 2. Campaign Durable Object

One SQLite-backed DO per campaign, addressed by `idFromName(campaignId)`.

```sql
-- inside each Campaign DO
CREATE TABLE meta        (key TEXT PRIMARY KEY, value TEXT);               -- schema version, current revision, tutorial (doc 11)
CREATE TABLE revisions   (revision INTEGER PRIMARY KEY, turn INTEGER, sim_date TEXT,
                          reason TEXT, state_hash TEXT, byte_size INTEGER, chunk_count INTEGER, created_at TEXT);
CREATE TABLE snapshot_chunks (revision INTEGER, idx INTEGER, data BLOB, PRIMARY KEY (revision, idx));
CREATE TABLE history     (seq INTEGER PRIMARY KEY, revision INTEGER, turn INTEGER, sim_date TEXT,
                          type TEXT, importance INTEGER, actor_ids TEXT, subject_ids TEXT, payload TEXT);
CREATE INDEX history_by_type ON history(type, seq);
CREATE INDEX history_by_turn ON history(turn);
CREATE TABLE history_subjects (politician_id TEXT, seq INTEGER, PRIMARY KEY (politician_id, seq)); -- "career timeline of X"
CREATE TABLE idempotency (key TEXT PRIMARY KEY, request_hash TEXT, response TEXT, revision INTEGER, created_at TEXT);
CREATE TABLE turn_reports (revision INTEGER PRIMARY KEY, report TEXT); -- DO schema v2: latest TurnReport JSON, written in the advance commit; restore drops reports newer than the target
```

- **Snapshot encoding**: `canonicalStringify(state)` → gzip (`CompressionStream`) → split into ≤ 1 MB chunks.
  Each revision stores a SHA-256 `state_hash` so loads are integrity-checked.
- **Hot state**: the DO keeps the parsed `GameState` in memory after first load, so reads don't
  re-parse the snapshot. Memory is a cache, and SQLite is the source of truth.
- **Retention**: keep the last 10 revisions in the DO. Older revisions can be archived to R2
  (`campaigns/{id}/rev-{n}.json.gz`) by a later milestone. The slice simply prunes.

## 3. Commit protocol (per mutating request)

All mutations go through the DO, which processes requests one at a time. While it awaits,
it holds back other requests and outgoing messages until writes are durable (its input and
output gates). The protocol:

1. Worker authenticates, checks `campaigns.owner_id = user` in D1, then forwards to the DO with
   `{ expectedRevision, idempotencyKey, payload }`.
2. DO: if `idempotency[key]` exists → same `request_hash`? return the stored response : `409 IDEMPOTENCY_KEY_REUSED`.
3. DO: if `expectedRevision ≠ currentRevision` → `409 REVISION_CONFLICT` (with current revision) — the
   other device's progress is never silently overwritten; the client refetches.
4. Run the simulation on the in-memory state (pure function, no I/O).
5. Serialize + compress **before** opening the transaction (async work happens outside it).
6. `ctx.storage.transactionSync(() => { insert revision n+1, chunks, history rows, idempotency row,
   update meta.current_revision, prune old revisions })` — all or nothing.
7. Swap the in-memory state to the new state **only after** step 6 succeeds.
8. Update the D1 campaign index (`revision`, `current_date`, `updated_at`). This is a **derived
   projection**: if it fails, the DO is still correct, and the index is repaired on the next
   successful request (`UPDATE … WHERE revision < ?`). The list screen may briefly show a stale date.
   That is acceptable.

**Interrupted operations**: a crash before step 6 commits leaves no trace, and the client retries
with the same idempotency key. A crash after step 6 but before the response reaches the client means a
retry hits step 2 and gets the stored response. No partial state is possible.

## 4. Campaign lifecycle

- **Create**: Worker inserts the D1 row with `status='initialising'`. The DO generates the world
  (`createCampaignState`) and commits revision 1. The Worker then flips the row to `status='active'`.
  `initialising` rows are never listed. The create accepts an optional `Idempotency-Key` (stored as
  `create_key` + `create_request_hash`, unique per owner): a retry with the same key and body finds
  the row, re-calls DO `initialise` (idempotent: same id, `createdAt` and a key-derived seed give the
  same input hash, so it returns the committed revision 1) and activates it. Same key with a
  different body is `IDEMPOTENCY_KEY_REUSED`. An un-keyed create that fails is wiped immediately
  (best effort).
- **Delete**: Worker soft-deletes the D1 row (`deleted_at`), then calls DO `deleteAll()` and sets
  `wipe_confirmed_at`. If the wipe fails the request still succeeds (the campaign is already gone for
  the player). Recovery for 30 days uses D1 Time Travel plus DO point-in-time recovery (operator
  action, not a player feature).
- **Maintenance sweep** (Worker `scheduled` handler, hourly cron `17 * * * *`,
  `application/maintenance.ts`): `initialising` rows older than 10 minutes get their DO wiped and the
  row deleted; soft-deleted rows without `wipe_confirmed_at` are wiped again. Up to 50 of each per
  run; every step is idempotent.
- **Row-size caps** (`application/row-limits.ts`, enforced before the commit transaction, because DO
  SQLite rows are capped at 2 MB and a deterministic oversized output would otherwise fail every
  retry forever): history `payload` ≤ 64 KB (optional `data` dropped first, then text truncated with
  a marker; actor/subject id lists ≤ 16 KB each); a stored idempotency response > 512 KB is replaced
  by `{ storedRef: 'turn_report', revision }` and rebuilt from `turn_reports` on replay (a superseded
  or non-report response replays as `REVISION_CONFLICT`, so the client re-syncs); a turn report >
  1.5 MB is stored gzip-chunked (`turn_report_chunks`, DO schema v3) with a SHA-256 check.
- **Restore to earlier revision** (player-facing "load autosave"): it creates a **new** revision
  `n+1` whose state equals revision `r`. History rows with `revision > r` are deleted in the same
  transaction. History is never rewritten silently, and the revision number only ever goes up.

## 5. Versioning and save compatibility

- `GameState.meta.schemaVersion` is the integer shape version. `packages/simulation/migrations`
  holds pure `vN → vN+1` functions. On load, the DO migrates forward, then validates with the Zod
  schema, then caches.
- `SIMULATION_VERSION` is the rules version. A campaign advanced by a newer version records the new
  version on its revision row, so any revision can be replayed with the version that produced it.
- The DO's own SQL schema has a tiny migration runner keyed by `meta.schema_version` and run on wake.
- Tests: fixture saves from every past schema version must load, migrate and pass invariants.

## 6. Why not the alternatives

- **D1-only (chunked BLOBs in D1)**: simplest, and atomic via `batch()`. But one 10 GB database shared
  by all campaigns' decades of history becomes a scaling wall, and every request re-parses the
  snapshot. It stays the documented fallback, behind the same `CampaignStore` interface.
- **D1 pointer + R2 snapshot objects**: scales storage, but D1+R2 is not atomic, so we'd need orphan
  GC, plus an R2 round trip on every request. Better suited to archives than hot state.
- **Full event sourcing**: rejected. Replaying decades of weeks is slow and fragile across rule
  versions. Snapshots plus meaningful history give us what we need.

## 7. Abstraction boundary

The application layer (`apps/api/src/application`) depends on interfaces, not on Cloudflare:

```ts
interface CampaignStore { load(): Promise<LoadedCampaign | null>; commit(c: CommitRequest): CommitResult; history(q): HistoryPage; … }
interface CampaignIndex { listForOwner(userId, page); get(id); upsertProjection(...); softDelete(...) }
```
`DurableObjectCampaignStore` and `D1CampaignIndex` are the Cloudflare implementations.
`InMemoryCampaignStore` is used in unit tests. The DO class itself is a thin adapter.
