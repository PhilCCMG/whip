# WHIP

A browser-first UK political career simulation. You play a backbench MP and work your way up
(or out) through diaries, divisions, factions, scandals and leadership contests. The world moves
on a weekly turn, simulated server-side by a deterministic engine.

## Architecture

A modular monolith on Cloudflare: one Worker serves the React SPA (Static Assets) and the
`/api/v1` API (Hono). It uses one D1 database for accounts and the campaign index, and one
SQLite-backed Durable Object per campaign for canonical state and history. R2 holds exports.
All game rules live in the pure `@whip/simulation` package.

Read [`docs/architecture/01-overview.md`](docs/architecture/01-overview.md) first. ADRs are in
[`docs/decisions/`](docs/decisions/). Tooling choices and workarounds are recorded in
[`docs/architecture/dev-setup-notes.md`](docs/architecture/dev-setup-notes.md).

```text
apps/web            React 19 · Vite · Tailwind v4 · React Router · TanStack Query · Zustand
apps/api            Worker: Hono, CampaignDO, D1 schema + migrations (Drizzle), wrangler.jsonc
apps/desktop        Tauri v2 desktop client: bundled SPA + cloud API (docs/architecture/08-desktop.md)
packages/domain     Entity types, ID brands, Zod state schemas            (imports: nothing internal)
packages/simulation Pure deterministic engine                             (imports: domain)
packages/content    Scenario/trait/office/event definitions               (imports: domain)
packages/contracts  API Zod schemas, DTOs, error codes                    (imports: domain)
packages/ui         Design tokens, shadcn/ui primitives, WHIP components  (imports: nothing internal)
packages/config     Shared tsconfig, ESLint and Prettier config
tests/integration   API tests running inside workerd (@cloudflare/vitest-plugin)
infrastructure/     Cloudflare provisioning notes
```

ESLint enforces the dependency direction, and keeps simulation/domain pure (no `Math.random`,
`Date`, `fetch`, timers, platform imports, and no `@whip/content` import in simulation outside tests).

## Prerequisites

- Node.js ≥ 22 (`.nvmrc` pins 24)
- pnpm 10.33 (`corepack enable` picks up `packageManager` from package.json)
- For deploys: a Cloudflare account on the **Workers Paid plan** (required: the Free plan's
  10 ms CPU limit cannot run a weekly turn). See
  [`infrastructure/cloudflare/README.md`](infrastructure/cloudflare/README.md).

Nothing else is needed locally: wrangler, workerd and Miniflare come from devDependencies and
emulate D1, R2 and Durable Objects on disk (`apps/api/.wrangler/`).

## Setup

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # local secrets + dev identity
pnpm db:migrate:local                              # apply D1 migrations to the local database
pnpm dev                                           # API on :8787, SPA on :5173
```

Open http://localhost:5173. Vite proxies `/api` to the Worker on :8787. You can also open
http://localhost:8787, where the Worker serves the last _built_ SPA from `apps/web/dist`.

## Playing locally

```sh
pnpm install
pnpm db:migrate:local                                   # once, and after new D1 migrations
echo "VITE_DEV_USER=dev-player" > apps/web/.env.local   # who you are locally (see apps/web/.env.example)
pnpm dev                                                # wrangler dev :8787 + vite :5173
```

Open http://localhost:5173, create a career and play: plan diary actions, press **End week**, read
the report. The Housing Delivery Bill's Second Reading division is resolved when you end week 4.
"Last week's report" on the career page re-opens the latest report after a reload
(`GET /api/v1/campaigns/:id/turn-report/latest`).

- **Dev identity**: with `VITE_DEV_USER` set, the SPA sends `X-Whip-Dev-User: <value>` on every
  request (see [Dev identity](#dev-identity)). Different values are different players.
- **Mock mode**: `pnpm --filter @whip/web dev:mock` (:5174) runs the SPA against an in-browser mock
  backend (`apps/web/src/mocks/`, `.env.mock`), with no Worker needed.
- **Engine**: the Worker always runs the real `@whip/simulation` engine. `ENGINE=fake` (a tiny test-only
  engine, refused outside `ENVIRONMENT=local`) is used only by the `*.fake.test.ts` integration tests.
- **curl**: `curl -H "X-Whip-Dev-User: me" localhost:8787/api/v1/campaigns`. Mutations also need an
  `Idempotency-Key` header and `expectedRevision` in the body.
- The Campaign DO logs `campaign_do_timing` lines (load/simulate/serialize/compress/commit ms) to the
  `wrangler dev` console.

## Scripts

| Script                                | What it does                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                            | `wrangler dev` (:8787) and `vite` (:5173) in parallel                                                                          |
| `pnpm build`                          | Build the SPA to `apps/web/dist`, then bundle the Worker (`wrangler deploy --dry-run --env production --outdir apps/api/dist`) |
| `pnpm typecheck`                      | `tsc --noEmit` in every package                                                                                                |
| `pnpm lint` / `pnpm lint:fix`         | ESLint (type-aware, boundaries, purity bans)                                                                                   |
| `pnpm format` / `pnpm format:check`   | Prettier                                                                                                                       |
| `pnpm test`                           | Unit tests for every package (Vitest projects; Node / jsdom)                                                                   |
| `pnpm test:integration`               | Worker + D1 + DO tests inside workerd: real engine (incl. the slice end to end), then the FakeEngine suite                     |
| `pnpm bench`                          | Simulation benchmarks (`vitest bench`)                                                                                         |
| `pnpm check`                          | typecheck + lint + test                                                                                                        |
| `pnpm db:generate`                    | Generate a D1 migration from `apps/api/src/infrastructure/db/schema.ts` (drizzle-kit)                                          |
| `pnpm db:migrate:local`               | `wrangler d1 migrations apply whip-core-local --local` (the local-only DB; staging/prod are applied by CI with `--env`)        |
| `pnpm deploy:staging` / `:production` | Build the SPA, then `wrangler deploy --env staging` / `--env production` (never a bare deploy)                                 |
| `pnpm cf-typegen`                     | Regenerate `apps/api/worker-configuration.d.ts` after changing bindings                                                        |

## Desktop (Tauri)

WHIP also ships as a desktop game (`apps/desktop`): a Tauri v2 window running the bundled SPA
against the cloud API (`https://playwhip.com`), with bearer-token sessions in the OS credential
store, fullscreen (F11 / Alt+Enter) and signed auto-updates. See
[`docs/architecture/08-desktop.md`](docs/architecture/08-desktop.md) and ADR-0011.

Extra prerequisites: Rust (stable, via rustup), plus per OS: Windows needs WebView2 and the VS C++
build tools, macOS needs Xcode CLT, and Linux needs `libwebkit2gtk-4.1-dev libappindicator3-dev
librsvg2-dev patchelf`.

| Command                                                    | What it does                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm --filter @whip/desktop dev`                          | `tauri dev` against local `wrangler dev` (run `pnpm dev` first)                  |
| `pnpm --filter @whip/desktop tauri build --bundles nsis`   | Release build + NSIS installer (needs the updater signing env vars, see 08 §3)   |
| `pnpm --filter @whip/desktop tauri build --debug`          | Bundled SPA against `VITE_API_BASE` (production by default), devtools enabled    |
| `pnpm --filter @whip/desktop version:bump <x.y.z>`         | Sync the desktop version (tauri.conf.json, package.json, Cargo.toml)             |
| `git tag desktop-vX.Y.Z && git push origin desktop-vX.Y.Z` | Build all platforms in CI → draft GitHub Release (publish it to ship the update) |

## Environment variables

Configured in `apps/api/wrangler.jsonc` (`vars`) or as secrets. Locally, put them in `apps/api/.dev.vars`.

| Name                                        | Where             | Purpose                                                       |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| `ENVIRONMENT`                               | `vars`            | `local` / `staging` / `production`                            |
| `DEV_AUTH`                                  | `.dev.vars` only  | `1` enables the dev identity header (local only)              |
| `BETTER_AUTH_SECRET`                        | secret            | Session signing secret for Better Auth                        |
| `RESEND_API_KEY` (or Email Service binding) | secret            | Sign-in code delivery (not needed locally)                    |
| `MIN_DESKTOP_VERSION`                       | `vars` (optional) | Oldest supported desktop client, reported by `/api/v1/health` |

> **Never run a bare `wrangler deploy`.** The top level of `wrangler.jsonc` is the local-only
> config (`whip-local`, `whip-core-local`, `DEV_AUTH=1`, `workers_dev: false`); always pass
> `--env staging` or `--env production` (the scripts above and CI do).

## Dev identity

Locally you don't need to sign in. When `ENVIRONMENT === "local"` **and** `DEV_AUTH === "1"`, the
API accepts an `X-Whip-Dev-User: <user-id>` header as the authenticated user. Staging and
production never set `DEV_AUTH`, and the Worker refuses to start if `DEV_AUTH` is set outside
`local`. Email sign-in codes are printed to the `wrangler dev` console instead of being emailed.
(Auth is being implemented; see `apps/api/src/infrastructure/auth/`.)
