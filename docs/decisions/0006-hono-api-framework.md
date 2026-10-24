# ADR-0006: Hono as the API framework

- Status: Accepted (approved 2026-10-24)
- Date: 2026-10-24

## Context

The Worker needs a small, typed, Workers-native router with request validation. Better Auth has a
documented Hono integration. Contract types are shared with the SPA via `@whip/contracts`.

## Decision

Use **Hono 4** with **`@hono/zod-validator`** and **Zod 4**, serving `/api/v1/*`.

Layering in `apps/api/src`:
- `http/`: Hono routes. Parse and validate (Zod from `@whip/contracts`), map errors to HTTP. No game logic.
- `application/`: use-case services (CreateCampaign, PlanAction, AdvanceWeek, …) and ownership checks;
  depend on interfaces (`CampaignIndex`, `CampaignStore`, `Clock`, `IdGenerator`).
- `infrastructure/`: D1 (Drizzle), CampaignDO adapter, R2, Better Auth wiring, logger.
- `do/`: the `CampaignDO` class, a thin adapter over the campaign service and SQLite store.

Conventions:
- **Error format**: `{ "error": { code, message, details?, requestId } }`. Codes: `VALIDATION_FAILED` (400),
  `UNAUTHENTICATED` (401), `NOT_FOUND` (404, also for campaigns you do not own so existence is not
  leaked), `REVISION_CONFLICT` (409), `IDEMPOTENCY_KEY_REUSED` (409), `ACTION_INELIGIBLE` (422, with
  reasons), `RATE_LIMITED` (429), `INTERNAL` (500).
- Every `/campaigns/:id/*` route checks `ownerId === user.id` in D1 before touching the DO.
- Action parameters are validated twice: shape at the edge, rules in the simulation.
- Campaign reads return `ETag: "<campaignId>:<revision>"` and honour `If-None-Match`.
- Logs are structured JSON with `requestId` and opaque `userId`, never emails, tokens or bodies.

## Consequences

### Positive
- Small, fast, typed; Zod schemas are shared between server and SPA.
- Thin HTTP layer keeps game rules out of handlers and the application layer testable without Cloudflare.

### Negative
- Smaller ecosystem than Express or Fastify.
- Layering discipline is needed.

## Alternatives considered

The architecture docs name Hono as the choice and give no explicit alternatives for the router. The
reasons recorded are that it is small, Workers-native and typed, and integrates with Better Auth.
