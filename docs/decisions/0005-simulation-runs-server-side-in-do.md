# ADR-0005: Simulation runs server-side inside the Campaign Durable Object

- Status: Accepted (approved 2026-10-24)
- Date: 2026-10-24

## Context

The weekly turn is the core computation. It must be authoritative (no client-side cheating, one
source of truth across devices) and must be committed atomically with its history. The CPU budget for
a week is under 50 ms for 650 MPs and about 5k relationship edges, excluding (de)serialization.
Workers CPU is 10 ms on Free and up to 5 minutes on Paid.

## Decision

The simulation runs **server-side inside the Campaign Durable Object**, on the in-memory hot state.
The client never runs authoritative rules. The request path for "advance week" is: Worker (session
cookie → user) → D1 ownership check → `CampaignDO.advance({ expectedRevision, idempotencyKey })` →
simulation in memory → atomic SQLite commit → D1 index update → response DTO.

Because `packages/simulation` is pure, the client *could* later import selectors or run what-if
previews (for example "projected vote count"). Results the server persists are always computed by the
server. The same `planAction` serves the API, so the server is the only authority on eligibility.

## Consequences

### Positive
- One authoritative implementation; multi-device consistency; no trust in the client.
- The pure simulation step has no I/O, so it is easy to test and benchmark.
- It runs next to the data, so there is no round trip to load state.

### Negative
- Requires the Workers Paid plan (the Free 10 ms CPU limit cannot run a turn).
- Server CPU cost per advance; JSON plus gzip of 1–3 MB is probably dominant.
- Offline play is not possible.

## Alternatives considered

- **Client-side simulation with the server storing results**: not authoritative and cheatable, and
  rule versions could diverge between clients.
- **Simulation in the Worker with the DO as storage only**: moves state across a boundary on every request and loses the hot-state benefit.
