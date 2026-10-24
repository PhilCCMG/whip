# ADR-0004: Snapshots plus history, not event sourcing

- Status: Accepted (approved 2026-10-24)
- Date: 2026-10-24

## Context

Saves must survive crashes, multi-device play and rule changes across versions. D1/DO rows are limited
to 2 MB and 100 bound parameters per statement, so a multi-MB state must be chunked and history
inserts batched. Replaying decades of weekly turns would be slow and fragile across rule versions.

## Decision

**Persist full state snapshots per revision plus an append-only history of meaningful records.**

- **Snapshot encoding**: `canonicalStringify(state)` → gzip (`CompressionStream`) → chunks of ≤ **1 MB**
  (`snapshot_chunks`). Each revision stores a SHA-256 `state_hash` for integrity checks on load.
- **Revisions**: `revision` is a counter, +1 per committed change, and only ever goes up. Restoring an
  autosave creates a new revision `n+1` equal to revision `r` and deletes history rows with `revision > r`
  in the same transaction.
- **Retention**: last **10** revisions kept in the DO. Older ones may later be archived to R2.
- **History**: append-only `history` table (indexed by type, turn, and subject politician), kept out of `GameState`.
- **Concurrency**: mutating requests carry `expectedRevision`; mismatch returns `409 REVISION_CONFLICT`.
- **Idempotency**: `Idempotency-Key` stored with `request_hash` and response. Same key and hash returns
  the stored response; same key with a different hash returns `409 IDEMPOTENCY_KEY_REUSED`.
- **Commit protocol** (in the DO): check idempotency → check revision → run simulation in memory →
  serialize and compress **before** the transaction → `transactionSync` (insert revision, chunks,
  history, idempotency row, update meta, prune) → swap in-memory state only after success →
  update the D1 index projection.
- Crash before commit leaves no trace; crash after commit is handled by the stored response on retry.
- Versioning: `schemaVersion` with pure forward migrations; `SIMULATION_VERSION` recorded per revision.

## Consequences

### Positive
- Loads are fast and integrity-checked; no partial state is possible.
- Another device's progress is never silently overwritten.
- Safe retries; saves are independent of rule changes.

### Negative
- Serialization and gzip of a multi-MB state is likely the dominant CPU cost (benchmarked at M2).
- Snapshots use more storage than events (bounded by retention).
- Fixture saves from every schema version must be tested.

## Alternatives considered

- **Full event sourcing**: rejected. Replaying decades of weeks is slow and fragile across rule versions.
- **Single un-chunked blob**: exceeds the 2 MB row limit.
- **Last-write-wins saves**: would lose progress between devices.
