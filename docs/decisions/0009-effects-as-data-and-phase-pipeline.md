# ADR-0009: Effects as data and a fixed phase pipeline

- Status: Accepted
- Date: 2026-10-24

## Context

A weekly turn touches relationships, parties, Parliament, government, opinion, events and careers.
Ordering bugs and double application of consequences are the main risks. The player and NPCs should
share one mechanism, and consequences must be loggable, explainable and testable.

## Decision

- **Fixed, documented phase order** (0 begin turn, 1 scheduled effects, 2 AI planning, 3 action
  resolution, 4 relationships, 5 party and factions, 6 Parliament, 7 government, 8 public opinion,
  9 indicators (stub), 10 event generation, 11 careers and crises, 12 chronicle). Each has a stated
  reason for its position. Each phase is `(draft, turn) => void` on a working copy (`structuredClone`
  once per turn), so the engine stays pure from the caller's view.
- AI planning uses the **start-of-week** state, so NPCs and the player plan simultaneously and the
  result is order-independent. Actions resolve in order `priority`, `actorId`, submission index.
- **Effects are data** (a discriminated union). Actions' `resolve` returns `Effect[]` and never mutates.
  Phases never call each other; they emit effects, applied by a single interpreter `applyEffect`.
- **Scheduled effects**: `ScheduledEffect { id, dueTurn, effect, source, condition? }` with queue order
  `(dueTurn, id)`; phase 1 applies those due, and a `condition` can cancel one that no longer applies.
- **No double application**: an effect is applied immediately **or** queued, never both; queued effects
  are removed in the same step they are applied. Each applied effect gets `effectId = turn:phase:seq`
  recorded in history. Derived values (seat totals, unity, influence) are recomputed, never incremented.
- Sub-day resolution is done as sub-steps within a phase; mid-week interrupts are designed for, not built.
- Invariants are checked in tests and optionally at runtime.

## Consequences

### Positive
- Effects can be logged, scheduled, explained in the UI and tested.
- A single code path for player and NPC behaviour.
- Recomputing derived values from source data is idempotent and avoids drift.

### Negative
- Indirection: every state change goes through an effect.
- Phase order is a strong commitment; reordering changes outcomes and requires a `SIMULATION_VERSION` bump.

## Alternatives considered

- **Phases mutating state directly or calling each other**: leads to ordering bugs and double application.
- **General variable-timestep scheduler**: not needed yet; sub-steps within phases suffice.
