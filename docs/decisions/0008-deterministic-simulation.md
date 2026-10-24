# ADR-0008: Deterministic simulation

- Status: Accepted
- Date: 2026-10-24

## Context

Simulation bugs, balancing and save compatibility all depend on being able to reproduce a run exactly.
Adding a phase or a draw must not silently change unrelated outcomes, and rule changes must be
visible and deliberate.

## Decision

`packages/simulation` is pure and deterministic:

1. **Seeded PRNG**: `sfc32` (128-bit state, four uint32s in `GameState.meta.rng`).
2. **Named forks**: each phase draws from `rng.fork(turn, phaseKey)` (hash of root seed, turn and
   phase key). Adding a phase or draw does not shift randomness in other phases.
3. **Ordered iteration**: all loops use sorted ID arrays; never `Object.keys()` of an unsorted map for decisions.
4. **Float hygiene**: it runs only on V8 (server and tests); we still avoid transcendental `Math.*` in
   hot rules and round stored values to integers or fixed decimals.
5. **Canonical serialization**: `canonicalStringify` (sorted keys) → SHA-256. Determinism tests
   compare **golden hashes**.
6. **Version pinning**: `SIMULATION_VERSION` constant. Results are reproducible for
   `(initial state, actions, version, seed)`. Rule changes bump it and golden hashes are re-recorded deliberately.
7. **Lint bans**: ESLint `no-restricted-globals`, `no-restricted-properties`, `no-restricted-imports`
   forbid `Math.random`, `Date`/`Date.now()`, env vars and Cloudflare imports in the package.
8. IDs come from `idFactory(prefix, counter)`, never `crypto.randomUUID()`. Wall-clock time never appears in `GameState`.

## Consequences

### Positive
- Reproducible bugs and regression fixtures that stay stable as the game grows.
- Seeded batch tests can assert balance distributions.

### Negative
- Discipline: sorted iteration and no ambient APIs everywhere.
- Intentional rule changes require re-recording golden hashes.
- Risk of regressions if the lint rules are bypassed (rated Medium likelihood, High impact in the risk register).

## Alternatives considered

- **Single global RNG stream**: any extra draw shifts every later outcome and breaks fixtures.
- **`Math.random` / wall-clock time**: not reproducible.
- **Cross-engine float determinism**: unnecessary because the engine runs only on V8.
