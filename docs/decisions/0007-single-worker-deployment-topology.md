# ADR-0007: Single-Worker deployment topology

- Status: Accepted (approved 2026-10-24)
- Date: 2026-10-24

## Context

WHIP needs a SPA, an API, auth cookies and a Durable Object. Cookies should be first-party and CORS
avoided. We need a safe path from PR to production with an environment for approval.

## Decision

- **One Worker (`whip`) serves the SPA via Static Assets** (built to `apps/web/dist`) **and the API**,
  with `run_worker_first: ["/api/*"]` so API paths hit the Worker and everything else is served as assets.
- **Environments**:

| Env | Worker | D1 | R2 | DO namespace | Access |
|---|---|---|---|---|---|
| local | `wrangler dev` / `vite dev` (workerd) | local SQLite | local | local | Dev identity header enabled |
| staging | `whip-staging` (workers.dev) | `whip-core-staging` | `whip-saves-staging` | separate | Behind Cloudflare Access |
| production | `whip` (custom domain) | `whip-core` | `whip-saves` | separate | Public, Better Auth |

- **Workers Paid ($5/month) is required.** The Free plan's 10 ms CPU limit cannot run a weekly turn or hash a password.
- **GitHub Actions**: on PR → typecheck, lint, unit tests, integration tests, build. On `main` → deploy
  to staging (apply D1 migrations, then `wrangler deploy --env staging`). Production deploy requires
  manual approval via GitHub environment protection.

## Consequences

### Positive
- One origin: no CORS and first-party cookies.
- One deploy artifact; staging and production are isolated by separate bindings.
- Production releases are gated by a human.

### Negative
- Ongoing $5/month minimum.
- SPA and API ship together, so they cannot be released independently.
- `run_worker_first` must stay in sync with API paths.

## Alternatives considered

- **Separate Pages project plus API Worker**: rejected (see ADR-0001, deviation 3) because of CORS,
  cross-origin cookies and two deploys.
- **Workers Free plan**: not viable due to the 10 ms CPU limit.
