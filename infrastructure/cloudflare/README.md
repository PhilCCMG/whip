# Cloudflare provisioning

`apps/api/wrangler.jsonc` is the source of truth for bindings (ADR-0001, deviation 1). This file
covers the one-off resources and secrets behind it.

> **Always deploy with `--env staging` or `--env production`** (`pnpm deploy:staging|production`, or
> CI). The top level of `wrangler.jsonc` is the **local-only** config: Worker `whip-local`,
> `workers_dev: false`, D1 `whip-core-local` / R2 `whip-saves-local` (never created remotely). A bare `wrangler deploy` can therefore only ever target a separate,
> route-less `whip-local` Worker bound to a non-existent placeholder D1 id, never production. The
> plain `deploy` script in `apps/api` refuses to run.

**Plan:** Workers **Paid** is required (CPU time for weekly turns, Durable Objects with SQLite at scale).

## Environment matrix

|                                | local                                            | staging                               | production                                   |
| ------------------------------ | ------------------------------------------------ | ------------------------------------- | -------------------------------------------- |
| Worker                         | `whip-local` (`wrangler dev` only)               | `whip-staging` (workers.dev)          | `whip` (custom domain)                       |
| `ENVIRONMENT`                  | `local`                                          | `staging`                             | `production`                                 |
| D1 (`DB`)                      | `whip-core-local` (local SQLite, `.wrangler/`)   | `whip-core-staging`                   | `whip-core`                                  |
| R2 (`SAVES`)                   | `whip-saves-local` (local)                       | `whip-saves-staging`                  | `whip-saves`                                 |
| R2 (`RELEASES`, desktop)       | `whip-releases-local` (local)                    | — (not bound)                         | `whip-releases` (created 2026-10-25)         |
| DO (`CAMPAIGN` → `CampaignDO`) | local                                            | separate namespace                    | separate namespace                           |
| Auth                           | Dev identity header (`DEV_AUTH=1`) + Better Auth | Better Auth, behind Cloudflare Access | Better Auth (public)                         |
| Deploy                         | —                                                | Auto on `main` (GitHub Actions)       | Manual, gated by GitHub environment approval |

## One-off provisioning

```sh
cd apps/api
npx wrangler login

# D1 — copy each printed database_id into wrangler.jsonc (env.staging / env.production)
npx wrangler d1 create whip-core-staging
npx wrangler d1 create whip-core

# R2
npx wrangler r2 bucket create whip-saves-staging
npx wrangler r2 bucket create whip-saves
npx wrangler r2 bucket create whip-releases   # desktop installers/updates (done 2026-10-25)

# Schema
npx wrangler d1 migrations apply whip-core-staging --remote --env staging
npx wrangler d1 migrations apply whip-core --remote --env production
```

The Durable Object namespace is created on first deploy from the `migrations`
(`new_sqlite_classes: ["CampaignDO"]`) entry. **Never edit or remove an applied DO migration tag**.
Add a new tag for renames or deletes.

Top-level D1 `database_id` (`0000…0000`) is a placeholder used only for local dev
(`pnpm db:migrate:local` → `wrangler d1 migrations apply whip-core-local --local`). Never create
`whip-core-local` / `whip-saves-local` remotely.

## Cron trigger

Every environment has `triggers.crons: ["17 * * * *"]` (hourly). The Worker's `scheduled` handler
runs the campaign maintenance sweep (docs/architecture/04-persistence.md §4): it deletes
`initialising` campaigns older than 10 minutes (DO wipe + D1 row) and retries DO wipes of
soft-deleted campaigns whose `wipe_confirmed_at` is unset. Results are logged as `campaign_sweep`.
Cron triggers are created/updated by `wrangler deploy --env …`; check them under the Worker's
_Settings → Triggers_.

## Secrets

Set per environment (`--env staging` / `--env production`):

| Secret               | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Better Auth session signing (`openssl rand -base64 32`)                          |
| `RESEND_API_KEY`     | Email OTP delivery via Resend, if not using the Cloudflare Email Service binding |

```sh
npx wrangler secret put BETTER_AUTH_SECRET --env staging
npx wrangler secret put RESEND_API_KEY --env staging
```

`DEV_AUTH` must **never** be set outside local. The Worker throws at startup if it is.
`BETTER_AUTH_SECRET` is mandatory outside local: without it every auth call throws. The built-in
dev secret is only used when `ENVIRONMENT=local` **and** the request host is loopback.

### GitHub Actions secrets — owner steps

Used by `deploy.yml` (Worker deploy + D1 migrations), `desktop-release.yml` (R2 upload) and
`desktop-promote.yml` (R2 channel write). As of 2026-10-25 only `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` exist. Add them as **repository** secrets: the release
workflow's upload job has no GitHub environment, and repository secrets are also visible to the
`staging`/`production` environment jobs.

1. Cloudflare dashboard (account **CheatCode Media Group**) → _My Profile → API Tokens → Create
   Token → Custom token_:
   - Name: `whip-github-actions`
   - Permissions (all **Account**-level): **Workers Scripts: Edit**, **D1: Edit**,
     **Workers R2 Storage: Edit**, **Account Settings: Read**. If deploys need to manage the
     `playwhip.com` custom domain, add **Zone › Workers Routes: Edit** for that zone.
   - Account resources: _Include → CheatCode Media Group_. Optionally restrict client IPs/TTL.
   - Create, copy the token (shown once).
2. Add the repository secrets (or _Settings → Secrets and variables → Actions_):

   ```sh
   gh secret set CLOUDFLARE_API_TOKEN --repo PhilCCMG/whip          # paste the token
   gh secret set CLOUDFLARE_ACCOUNT_ID --repo PhilCCMG/whip --body 660a68b9eb6593c8ab0fefff75044d89
   ```

3. _Settings → Environments_: create `staging` and `production`; on `production` add yourself as
   a **required reviewer** (gates production deploys and desktop promotes).
4. Optional: repository variable `DESKTOP_TAG_PLATFORMS` = `windows` | `windows+linux` | `all`
   (default `all`) to choose what a `desktop-v*` tag builds — macOS minutes bill at 10× on a
   private repo (docs/architecture/08-desktop.md §4).

Check with `gh secret list --repo PhilCCMG/whip`.

## Desktop releases (R2 `whip-releases`)

Layout, routes and the release → promote flow are in docs/architecture/08-desktop.md §4. In short:
`desktop/releases/{version}/…` + `manifest.json` (immutable, uploaded by `desktop-release.yml` or
`pnpm desktop:release:local`), and `desktop/channels/stable.json` (written only by
`desktop-promote.yml` / `pnpm desktop:release promote`). A release is live only while the channel
points at it. Inspect by hand:

```sh
cd apps/api
npx wrangler r2 object get whip-releases/desktop/channels/stable.json --pipe --remote
```

Staging has no `RELEASES` binding (a binding to a missing bucket fails deploy). To add one, create
`whip-releases-staging` and add the binding to `env.staging` in wrangler.jsonc.

## Cloudflare Access for staging

Staging must not be public.

1. Zero Trust → Access → Applications → _Add application_ → Self-hosted.
2. Domain: `whip-staging.<account>.workers.dev` (or enable Access in the Worker's
   _Settings → Domains & Routes → workers.dev → Cloudflare Access_).
3. Policy: allow the team's emails / an identity-provider group.
4. Do the same for any future admin/debug routes in production.

Better Auth still runs behind Access on staging, so it exercises the real sign-in flow.

## Rate limiting (defence in depth)

Better Auth rate-limits `/api/auth/*` per client IP (`cf-connecting-ip`) in D1 (`rateLimit`
table): email-OTP send 3 per 10 min, OTP sign-in/verify 10 per 10 min, everything else 100 per
minute. Because that costs D1 writes per auth request, also add a Cloudflare **WAF rate-limiting
rule** in front (Security → WAF → Rate limiting rules), per zone, on production (and staging):

- **If** URI path starts with `/api/auth/` and method is `POST`
- **Counting** by IP, e.g. **20 requests per 1 minute** (stricter, e.g. 5 per 10 min, for
  `/api/auth/email-otp/send-verification-otp` if your plan allows a second rule)
- **Action**: Block (or Managed Challenge) for 10 minutes

The WAF absorbs floods before they reach the Worker; Better Auth's per-endpoint limits still apply
behind it (and on workers.dev, where zone WAF rules don't apply).

## Observability

`observability.enabled` is on in wrangler.jsonc. The API logs one JSON line per request
(`requestId`, method, route, status, durationMs) and never logs emails, tokens or bodies. Query it
in Workers Logs.
