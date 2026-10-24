# ADR-0003: Campaign state in SQLite Durable Objects

- Status: Accepted (approved 2026-10-24)
- Date: 2026-10-24

## Context

Each campaign has a canonical `GameState` (an estimated 1–3 MB raw, 150–500 KB gzipped), decades of
append-only history, and idempotency records. Platform facts (verified 2026-10-24):

- D1 max database size is **10 GB** (Paid), shared by all users.
- D1 and DO SQLite max row/BLOB is **2 MB**.
- D1 `batch()` is atomic but has no interactive `BEGIN`, so read-check-write must be guarded statements.
- DO SQLite offers 10 GB per object, `transactionSync` and 30-day PITR.

## Decision

- **One SQLite-backed Durable Object per campaign**, addressed by `idFromName(campaignId)`, holds the
  snapshot revisions, historical records and idempotency keys.
- **D1 (`whip-core`)** holds users, sessions, auth accounts, preferences and the **campaign index**
  (id, owner, name, date, revision, status). The index is a derived projection and is repairable.
- R2 holds exports and archives only.
- Why a DO is justified over D1 alone:
  1. **Per-campaign partitioning**: history grows for decades and never hits a global 10 GB cap.
  2. **Single writer** per campaign (requests are serialised).
  3. **Local atomic transactions** via `transactionSync`.
  4. **Hot in-memory state**: parsed `GameState` is cached after first load. Memory is a cache,
     SQLite is the source of truth.
- The application layer depends on `CampaignStore` and `CampaignIndex` interfaces.
  `DurableObjectCampaignStore` and `D1CampaignIndex` are the implementations, and
  `InMemoryCampaignStore` is for unit tests.
- **Fallback**: D1-only with chunked BLOBs, atomic via `batch()`, behind the same `CampaignStore` interface.

## Consequences

### Positive
- Storage scales per campaign; commits are atomic and local.
- Fewer snapshot parses per request.
- The Worker never exposes the DO publicly. Ownership is checked in D1 first.

### Negative
- Two stores (DO and D1 index) can drift. The D1 index is repaired on the next successful request.
- DO-specific operational model (eviction, cold loads, delete via `deleteAll()`, PITR as operator action).
- Cross-campaign queries are only possible through the D1 index.

## Alternatives considered

- **D1-only chunked BLOBs**: simplest and atomic, but one 10 GB database for all campaigns becomes a
  scaling wall and every request re-parses the snapshot. Kept as the documented fallback.
- **D1 pointer plus R2 snapshot objects**: scales storage, but D1+R2 is not atomic (orphan GC needed)
  and costs an R2 round trip per request. R2 is better for immutable archives (strong
  read-after-write, `onlyIf.etagMatches` CAS, but 1 write/s per key), not hot state.
