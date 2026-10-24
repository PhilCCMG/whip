# ADR-0001: Modular monolith in a pnpm monorepo

- Status: Accepted
- Date: 2026-10-24

## Context

WHIP needs a React SPA, an API, a Durable Object and a rules engine. The rules engine must be pure
and testable with no Cloudflare dependency. The team is small and the deployment target is a single
Cloudflare Worker.

## Decision

WHIP is a **modular monolith**: one Worker serves the SPA and the versioned API, in a pnpm
workspace with these packages:

- `apps/web` (React SPA), `apps/api` (Worker, CampaignDO, D1 schema/migrations via Drizzle, `wrangler.jsonc`)
- `packages/domain` (entity types, ID brands, Zod state schemas), `simulation` (pure engine),
  `content` (scenario definitions), `contracts` (API Zod schemas, DTOs, error codes), `ui`, `config`
- `infrastructure/cloudflare` (provisioning notes and scripts), `tests/integration` (workerd)

Allowed dependency direction, enforced in CI by `dependency-cruiser`:

```
domain ← content, simulation, contracts
{simulation, content, contracts, domain} ← api
{contracts, ui, domain(types)} ← web
```

`simulation` does **not** import `content`. Content is injected through `SimulationContext`, so the
engine can be tested with fixture content and content can be swapped per scenario.

**Deviations from the suggested layout**
1. `wrangler.jsonc`, D1 migrations and the DO class live in `apps/api`, not `infrastructure/cloudflare`.
   Wrangler, the Vite plugin and the Vitest plugin resolve config relative to the Worker; splitting
   them makes local dev brittle.
2. There is no separate `db` package. Only `apps/api` touches persistence.
3. The web app is not its own Worker or Pages project. It is served by the API Worker's Static
   Assets binding (one origin, no CORS, first-party cookies).

## Consequences

### Positive
- The engine stays framework-free and unit-testable.
- One deployable unit, one origin, simple local dev.
- Boundaries are mechanically enforced rather than by convention.

### Negative
- Discipline is needed to keep `apps/api` from absorbing logic that belongs in `simulation`.
- The dependency rules need maintenance as packages are added.

## Alternatives considered

- **Separate Pages project plus API Worker**: adds CORS, cross-origin cookies and two deploys.
- **A `db` package**: only one consumer exists, so it adds indirection for no benefit.
- **Config in `infrastructure/cloudflare`**: breaks tool config resolution (deviation 1).
