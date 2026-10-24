# ADR-0002: Authentication with Better Auth

- Status: Accepted (approved 2026-10-24)
- Date: 2026-10-24

## Context

Players need accounts that work across devices. The game is single-player, so user records only need
to support ownership of campaigns. Auth must run on Workers and fit D1, where users, sessions and
auth accounts live.

## Decision

- Use **Better Auth** (self-hosted library inside our Worker, on D1), pinned to an exact version and
  isolated behind `infrastructure/auth`. It runs on Workers, supports D1 natively and has a documented Hono integration.
- **Primary sign-in is an email one-time code** (`email-otp` plugin): passwordless, no password
  storage, works across devices, recovery is "get a new code". Email and password may be added
  later, but it costs **scrypt CPU**, so measure first.
- **Sessions** are opaque, DB-backed, `HttpOnly; Secure; SameSite=Lax` cookies on the same origin.
  Multiple devices are supported and users can revoke sessions.
- **Email delivery** sits behind an `EmailSender` interface: Cloudflare Email Service binding
  (beta, Paid) with Resend as the alternative. Locally, codes print to the console.
- **Dev identity**: an `X-Whip-Dev-User` header is accepted only when `ENVIRONMENT === "local"` and
  `DEV_AUTH === "1"`. Startup **throws** if `DEV_AUTH` is set when `ENVIRONMENT !== "local"`, and a
  test asserts the header is ignored in the production configuration.
- **Internal tools** (staging, future admin/debug panels) sit behind **Cloudflare Access**, not Better Auth.
- Future: Steam (OpenID 2.0) via a small audited plugin, attached as extra `account` rows.

## Consequences

### Positive
- User records stay in our D1 with no per-MAU pricing or vendor lock-in.
- No password handling at launch.
- Dev workflow is easy without weakening production.

### Negative
- Better Auth has fast-moving minor versions (mitigated by pinning and isolation).
- Cloudflare Email Service is beta (mitigated by `EmailSender` and Resend).
- Adding passwords later costs CPU and needs the Workers Paid plan (see ADR-0007).

## Alternatives considered

- **Clerk, WorkOS, Auth0, Supabase Auth**: good products, but they put user records outside D1,
  add per-MAU pricing and lock-in, and buy little for a single-player game.
- **Auth.js**: moved to maintenance mode under Better Auth.
- **OpenAuth**: stalled.
