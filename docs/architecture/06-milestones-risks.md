# 06 — Milestones, Risks and Open Questions

## 1. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | **Architecture agreed** | Docs + ADRs approved (this stage) |
| M1 | **Foundation** | pnpm workspace, strict TS, ESLint/Prettier, Vitest; packages scaffolded; Worker + D1 migrations + CampaignDO skeleton; SPA served by Worker; `pnpm dev`, `pnpm check` (typecheck+lint+test), `pnpm build` green; CI workflow |
| M2 | **Engine core** | Domain types + Zod; RNG with forks; phase pipeline; effect interpreter; scheduled effects; invariants; determinism golden-hash test |
| M3 | **Slice content + mechanics** | Scenario "First Weeks" (~650 generated MPs across 5 parties, ~650 constituencies, named NPC cast ~12); relationships; 8 actions; utility AI; one bill with second-reading division; consequences |
| M4 | **Persistence + API** | Commit protocol, idempotency, revision conflicts, history queries, ownership; Better Auth email OTP + dev identity |
| M5 | **Frontend slice** | All slice screens wired to the API; responsive; turn report |
| M6 | **Verification** | Typecheck, lint, unit, integration (end-to-end flow), builds, benchmark report committed to `docs/architecture/benchmarks.md` |

After M6 the next candidates are, in this order: elections and the electoral model, reshuffles and
ministerial careers, leadership contests, a fuller legislative calendar, then the economy. They are
**not** in this scope.

## 2. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Serialization/gzip of a multi-MB state dominates CPU | Medium | Medium | DO keeps hot state in memory; benchmark early (M2); keep state compact (sparse relationships, history out of state) |
| Game feels "spreadsheet-y" despite systems | High | High | Explainable reasons everywhere, named NPC cast with conflicting goals, narrative turn report; playtest the slice before widening scope |
| Balancing emergent systems (runaway rebellion, nothing happens) | High | Medium | Seeded batch-simulation tests that assert distributions (e.g. "government wins 60–90% of whipped votes over 200 seeds") |
| Better Auth fast-moving minor versions | Medium | Low | Pin exact version, isolate behind `infrastructure/auth` |
| Cloudflare Email Service is beta | Medium | Low | `EmailSender` interface, Resend fallback |
| DO + D1 index drift | Low | Low | D1 index is a repairable projection; DO is authoritative |
| Save compatibility across rule changes | Medium | High | Schema version + forward migrations + fixture-save tests from day one |
| `@cloudflare/vitest-plugin` requires Vitest ≥ 4.1 | Low | Low | Standardise on Vitest 4.x across the repo |
| Determinism broken by careless iteration/`Math.random` | Medium | High | Lint bans, sorted-ID iteration helpers, golden-hash test in CI |

## 3. Uncertainties

- The actual state size for 650 MPs and its relationship density. Estimate: 1–3 MB raw, 150–500 KB gzipped. M2 will measure it.
- Whether the in-DO hot-state cache survives long enough between player turns to matter. DOs are
  evicted when idle, so a cold load costs one decompress and parse, which is fine.
- Real constituency data (ONS boundaries and electorate) has licensing and import work to do. The slice
  uses **generated fictional constituencies**, with a schema ready for real codes.
