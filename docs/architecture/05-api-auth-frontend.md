# 05 — API, Authentication and Frontend

Status: **Accepted** (approved 2026-10-24)

## 1. API

**Framework**: Hono 4 on Workers with `@hono/zod-validator` and Zod 4. Hono is small, Workers-native and
typed, and Better Auth has a documented Hono integration.

**Layering** (in `apps/api/src`):
```
http/          Hono routes: parse + validate (Zod from @whip/contracts), map errors → HTTP. No game logic.
application/   Use-case services (CreateCampaign, PlanAction, AdvanceWeek, GetParliamentView…), ownership checks.
               Depends on interfaces (CampaignIndex, CampaignStore, Clock, IdGenerator).
infrastructure/ D1 (Drizzle), CampaignDO adapter, R2, Better Auth wiring, logger.
do/            CampaignDO class: thin adapter → campaign service + SQLite store.
```

### Endpoints (v1)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/health` | Unauthenticated. Reports version, build sha, `simulationVersion` |
| GET | `/api/v1/me` | Current user + preferences |
| GET | `/api/v1/campaigns` | Paginated (`cursor`, `limit ≤ 50`) campaign summaries |
| POST | `/api/v1/campaigns` | `{ name, scenarioKey, player: { firstName, lastName, … }, seed? }` → `201` summary |
| GET | `/api/v1/campaigns/:id` | Summary (from D1 index) |
| DELETE | `/api/v1/campaigns/:id` | Soft delete |
| GET | `/api/v1/campaigns/:id/state` | **Career overview** DTO: player profile, standing, diary, pending events, notifications, briefing. Not the whole world |
| GET | `/api/v1/campaigns/:id/actions/catalogue` | Actions available to the player now, with eligibility reasons and costs |
| POST | `/api/v1/campaigns/:id/actions` | Plan a diary action. Needs the `Idempotency-Key` header and `expectedRevision` |
| DELETE | `/api/v1/campaigns/:id/actions/:plannedId` | Remove a planned action. Same concurrency rules |
| POST | `/api/v1/campaigns/:id/advance` | Resolve the week. `Idempotency-Key` + `expectedRevision` → turn report (outcomes, division results, notifications). `turn`/`simDate` are the **resolved** week; `nextTurn`/`nextSimDate` the week now open |
| GET | `/api/v1/campaigns/:id/turn-report/latest` | The turn report stored by the last advance (written in the same DO commit), so it survives reloads. `404 NOT_FOUND` before the first advance |
| GET | `/api/v1/campaigns/:id/history` | Cursor pagination over `seq`; filters `type`, `politicianId`, `minImportance`, `fromTurn` |
| GET | `/api/v1/campaigns/:id/politicians` | Paginated list (filters: party, faction, status, search) — summary rows only |
| GET | `/api/v1/campaigns/:id/politicians/:pid` | Full profile incl. relationship *to/from the player*, career, positions |
| GET | `/api/v1/campaigns/:id/parliament` | House composition, bills, upcoming divisions, last results |
| GET | `/api/v1/campaigns/:id/party` | Player's party: leadership, factions, unity, whip |

*Implementation note (Stage C):* restoring an earlier revision ("load autosave", doc 04 §4) exists as
the Campaign DO RPC `restore()` and the `CampaignUseCases.restore` application method, but has **no HTTP
route** in v1. Politician list filters are `partyId`, `factionId`, `search`, `sort`; there is no `status`
filter. List rows carry both `factionId` and `factionName`.

All campaign-scoped reads return `ETag: "<campaignId>:<revision>"` and honour `If-None-Match`. TanStack
Query invalidates by revision.

### Errors
```json
{ "error": { "code": "REVISION_CONFLICT", "message": "Campaign has advanced on another device.",
             "details": { "currentRevision": 42 }, "requestId": "…" } }
```
Codes: `VALIDATION_FAILED` (400), `UNAUTHENTICATED` (401), `NOT_FOUND` (404; also returned for campaigns
you don't own, so that existence isn't leaked), `REVISION_CONFLICT` (409), `IDEMPOTENCY_KEY_REUSED` (409),
`ACTION_INELIGIBLE` (422, with reasons), `PAYLOAD_TOO_LARGE` (413, request body over 64 KB), `RATE_LIMITED` (429), `INTERNAL` (500).

### Security
- Every `/campaigns/:id/*` route resolves the session, then runs
  `campaignIndex.get(id)` and checks `ownerId === user.id` before touching the DO. The DO is never
  reachable from the outside (no public route to it).
- All inputs are validated with Zod. Action parameters are validated twice: once for shape at the edge,
  then for rules and eligibility in the simulation.
- Logging is structured JSON with `requestId`, `userId` (opaque ID only), route, status and duration.
  It never logs emails, tokens or request bodies.
- Request bodies are capped (`hono/body-limit`): 64 KB on `/api/v1/*`, 16 KB on `/api/auth/*`
  → 413 `PAYLOAD_TOO_LARGE`.
- Auth endpoints are rate-limited by Better Auth per `cf-connecting-ip` + path, stored in D1
  (`rateLimit` table; the auth instance is per request, so a memory store would not work): email-OTP
  send 3 / 10 min, OTP sign-in / check / verify 10 / 10 min, everything else 100 / min → 429.
  A Cloudflare WAF rate-limiting rule on `/api/auth/*` is the outer layer
  (infrastructure/cloudflare/README.md).

## 2. Authentication — recommendation: Better Auth (self-hosted library, in our Worker, on D1)

- **Library**: Better Auth (pinned exact version). It runs on Workers and supports D1 natively.
  Auth.js has moved to maintenance mode under Better Auth, and OpenAuth has stalled.
- **Sign-in**: **email one-time code** (`email-otp` plugin) as the primary method. It is passwordless,
  there is no password storage, it works across devices, and recovery is "get a new code". Email and
  password can be added later, but it costs scrypt CPU, so measure first.
- **Sessions**: opaque, DB-backed, `HttpOnly; Secure; SameSite=Lax` cookies on the same origin. Several
  devices are supported natively, and users can revoke sessions.
- **Email delivery**: behind an `EmailSender` interface. Cloudflare Email Service binding (beta, Paid)
  with **Resend** as the alternative. In local dev, codes are printed to the console.
- **Future**: Steam (OpenID 2.0) via a small audited plugin (community `better-auth-steam` exists) linked
  to the same user. Platform identities attach as extra `account` rows.
- **Dev identity**: when `ENVIRONMENT === "local"` *and* `DEV_AUTH === "1"`, an `X-Whip-Dev-User`
  header is accepted. The code lives in `infrastructure/auth/dev-identity.ts`. The production config has
  neither variable, and startup **throws** if `DEV_AUTH` is set when `ENVIRONMENT !== "local"`. A test
  asserts the header is ignored in the production configuration.
- **Internal tools** (staging, future admin/debug panels) sit behind **Cloudflare Access**, not
  Better Auth.

Rejected: hosted IdPs such as Clerk, WorkOS and Auth0. They are good, but they put user records outside
D1, add per-MAU pricing and lock-in, and buy us little for a single-player game.

## 3. Frontend

- **Stack**: React 19, Vite, TypeScript strict, Tailwind CSS v4, shadcn/ui (copied into `packages/ui`),
  React Router (data router), TanStack Query (all server data), Zustand (UI-only state: selected
  diary slot, drawers, filters, unsent drafts). **Game state is never duplicated into Zustand.** Server
  DTOs are the source of truth.
- **Screens (slice)**: Campaign select · Career overview (dashboard + diary + inbox + intelligence) ·
  Parliament (hemicycle/benches, bill tracker, division forecast from whip intel) · Politicians (list +
  profile) · Party · History timeline · Turn report modal after each advance.
- **Visual identity**, "modern editorial meets bold indie strategy":
  - Palette tokens: `--ink` deep charcoal-green (#0F1D1C, from the logo tile), `--paper` warm off-white (#F3EEE3),
    `--whip` signal red (#DD2928, from the logo), muted greens for panels, plus party colours from content.
  - Type: condensed bold grotesque for display (e.g. "Archivo" condensed/black weights), a readable
    sans for UI, tabular numerals for statistics.
  - Geometric rules, hard edges, numbered sections, newspaper-style headlines in the briefing.
    No crests, crowns or ornament.
- **Responsive**: desktop-first three-pane layout (nav rail · main · context panel). Below `lg` it
  collapses to a bottom tab bar, with the context panel moving into a sheet.
- **Decoupling**: components consume `@whip/contracts` DTOs via query hooks. They never see
  `GameState` or DB rows.
