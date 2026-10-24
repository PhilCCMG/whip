# 03 — Simulation Engine

Status: **Accepted** (approved 2026-10-24)

`packages/simulation` is the heart of WHIP. It is pure TypeScript: no React, no HTTP, no
Cloudflare bindings, no database, no `Date.now()`, no `Math.random()`, no env vars.
ESLint rules (`no-restricted-globals`, `no-restricted-properties`, `no-restricted-imports`)
enforce this in CI.

## 1. Public interface

```ts
// Create a world from static scenario content and a seed.
createCampaignState(scenario: ScenarioDefinition, opts: { seed: number; playerSetup: PlayerSetup }, ctx: SimulationContext): GameState

// Validate and queue a diary action for the current week (cheap, no turn processing).
planAction(state: GameState, action: ActionRequest, ctx: SimulationContext): PlanResult  // { state, outcome: Accepted | Rejected(reason) }

// Resolve one week.
advanceSimulation(state: GameState, actions: ActionRequest[], ctx: SimulationContext): SimulationResult

interface SimulationContext {
  content: ContentRegistry;        // traits, offices, event definitions, issues — injected, not imported
  simulationVersion: number;       // asserted against the engine's own version
  options?: { checkInvariants?: boolean; trace?: boolean };
}

interface SimulationResult {
  state: GameState;                // new state (input is never mutated)
  history: HistoryRecord[];        // append-only records to persist
  notifications: Notification[];   // player-facing inbox items
  actionOutcomes: ActionOutcome[]; // per submitted action: resolved / rejected + explanation
  events: EventInstance[];         // newly raised events
  metrics: { phaseTimingsMs?: Record<PhaseKey, number> } // only when a clock is injected (tests/bench)
}
```

Content is **injected** through `SimulationContext` rather than imported, so tests can run the
engine against tiny fixture content and the engine never depends on `packages/content`.

## 2. Determinism

1. **Seeded PRNG** — `sfc32` (small, fast, 128-bit state, passes PractRand to large sizes). State is four
   uint32s stored in `GameState.meta.rng`.
2. **Named sub-streams** — each phase draws from `rng.fork(turn, phaseKey)` (hash of root seed + turn +
   phase key). Adding a new phase or an extra draw in one phase does **not** shift randomness in other
   phases. This keeps old regression fixtures stable as the game grows.
3. **Ordered iteration** — all loops over entities use sorted ID arrays.
4. **No floating-point hazards across engines** — the engine runs only server-side (V8) and in tests
   (V8), so transcendental `Math.*` results are consistent. We still avoid them in hot rules and round
   stored values to integers or fixed decimals so snapshots are stable.
5. **Canonical serialization** — the snapshot is produced by a `canonicalStringify` (sorted keys) so the
   same state always hashes to the same SHA-256. Determinism tests compare hashes.
6. **Version pinning** — `SIMULATION_VERSION` is a constant in the package. Results are reproducible
   for a given `(initial state, actions, version, seed)`. When rules change, the version bumps and
   golden-hash fixtures are deliberately re-recorded.

## 3. Turn model

- **One turn = one week** (Monday → Sunday). The player fills a **diary** of N slots
  (default 5: one per sitting day) with actions during the `planning` phase. `planAction` validates
  each one immediately so the UI gets instant feedback; nothing resolves until the week advances.
- `advanceSimulation` resolves the whole week atomically.
- **Finer resolution**: significant events (a key division, a leadership contest) are modelled as
  *sub-steps inside a phase* (e.g. the Parliament phase resolves each scheduled division on its own
  day in date order). We don't need a general variable-timestep scheduler yet. If a later feature needs
  the player to act *mid-week* (an emergency negotiation), the turn ends early with an
  `interrupt` pending event that the player resolves before the remainder of the week runs. This is
  designed for but **not built** in the slice.

## 4. Phase pipeline

Phases run in a fixed, documented order. Each phase is a function
`(draft: GameState, turn: TurnContext) => void` that mutates a **working copy** (`structuredClone`
of the input once per turn) and pushes effects/records into `TurnContext`. The caller still sees a pure
function: input in, new state out.

| # | Phase | Why it runs here |
|---|---|---|
| 0 | **Begin turn**: advance date, compute fidelity tiers, fork RNG streams | Everything below needs the new date and tiers |
| 1 | **Scheduled effects**: apply delayed effects whose `dueTurn ≤ turn` | Consequences of *last* week land before anyone acts this week |
| 2 | **AI planning**: NPCs choose actions from the *start-of-week* state | NPCs plan simultaneously with the player; nobody sees others' moves this week (fair, order-independent) |
| 3 | **Action resolution**: player + NPC actions resolved in deterministic order (`priority`, then `actorId`, then submission index) | Single code path for everyone; effects emitted, not ad-hoc mutations |
| 4 | **Relationships**: memory decay, drift towards baseline, obligation ageing | After the week's interactions, before anyone votes on the basis of them |
| 5 | **Party & factions**: faction cohesion, party unity, whip operations (whips lean on waverers) | Whips act on the latest relationship picture, just before the division |
| 6 | **Parliament**: bills move through stages; divisions scheduled this week are resolved MP by MP | Votes reflect this week's lobbying and whipping |
| 7 | **Government**: PM reacts (discipline, reshuffle intent), stability update | Depends on division results |
| 8 | **Public opinion**: national poll drift from events/government performance | Depends on what just happened in Parliament & Government |
| 9 | **Indicators**: economic/social indicators (**stub in the slice**) | Placeholder so the pipeline order is fixed now |
| 10 | **Event generation**: evaluate event definition triggers against the end-of-week state | Events react to the whole week |
| 11 | **Careers & crises**: promotions, sackings, resignations, leadership challenges | After events so a scandal can trigger a resignation in the same week |
| 12 | **Chronicle**: compile history records, notifications, the weekly briefing; trim ring buffer; invariant checks | Last, so it sees everything |

### Avoiding double-application
- Phases never call each other. They only **emit `Effect`s** into the turn context, and effects are applied
  by one interpreter (`applyEffect`) as they are emitted. Each applied effect gets a deterministic
  `effectId = turn:phase:seq` that is recorded in its history record.
- An effect is applied exactly once: either immediately (`applyEffect`) **or** queued
  (`scheduleEffect(effect, dueTurn)`), never both. Queued effects are removed from `state.scheduled`
  in the same step they are applied.
- Derived values (seat totals, unity, influence) are recomputed from source data, never incremented, so
  recomputation is idempotent.

## 5. Delayed effects

```ts
interface ScheduledEffect { id; dueTurn: TurnNumber; effect: Effect; source: { kind; id }; condition?: Condition }
```
Example: *MakePoliticalPromise* — "I'll back your amendment if you vote with me" schedules a
`promise.check` effect for the promised turn. At that turn, phase 1 checks whether the promise was kept
and adjusts trust both ways. `condition` lets an effect cancel itself if circumstances changed (e.g. the
promisee lost their seat). Queue order: `(dueTurn, id)`.

## 6. AI politicians — utility-based and explainable

Every NPC with `fidelity: 'high'` (and `'medium'` NPCs on their staggered turn) runs:

```
candidates = actionCatalogue.filter(a => a.isEligible(state, npc))
                             .flatMap(a => a.enumerateTargets(state, npc))   // bounded: top-K targets
score(c)   = Σ weight_i(npc traits, ambition, risk) × consideration_i(state, c)  − cost(c)
choose     = top-scoring within diary slots, with RNG noise only for ties / small jitter
```
Considerations are small named functions (`careerGain`, `ideologicalFit`, `relationshipValue`,
`factionDemand`, `riskOfWhipAnger`…) each returning `-1..1` with a **reason string**. The chosen action
keeps its top 3 reasons, so the UI's *Political intelligence* panel can say: "Sarah Kemp is courting
the Chief Whip — ambitious, wants promotion, low risk."

The interface is `interface PoliticianMind { plan(state, npcId, ctx): PlannedAction[] }`, so a richer
planner (GOAP, MCTS over action sequences) can replace the utility planner later without changing
the action system. No LLM dependency in the simulation.

## 7. Fidelity tiers

Recomputed in phase 0 from a **salience score** (office held, faction leadership, relationship strength
with the player, involvement in current bills/events):

| Tier | Who (typical) | Processing |
|---|---|---|
| high | Player, PM, cabinet, whips, faction leaders, anyone the player has interacted with recently, anyone tied to a live division (~40–80) | Full AI planning and action resolution every week |
| medium | Other MPs of salient parties (~200–300) | AI planning every 4th week, staggered by `hash(id) % 4` (deterministic) |
| low | Everyone else | No planning; aggregate drift only (relationships decay, loyalty drifts towards faction mean). Still **votes individually** in divisions, using the same vote-utility function |

Tiering changes how *often* someone acts, never the *rules* they follow.

## 8. Divisions (the core mechanic of the slice)

For each MP, `voteUtility(mp, bill, stage)` sums explained terms:

- **Ideological fit**: bill issue stances vs MP stances/ideology.
- **Whip pressure**: whip instruction × party whip strength × MP's party loyalty.
- **Career calculus**: ambition × perceived cost of defying the whips (risk tolerance moderates).
- **Personal pressure**: lobbying received this session, trust/obligation towards the lobbyists (incl. the player).
- **Faction line**: faction demands × faction cohesion.
- **Constituency**: local interest in the bill's issues × marginality of their seat.
- Small seeded noise.

Decision: `aye` / `no` / `abstain` by thresholds (abstention when utility is near zero and the whip is
weak). Results are stored per MP, with the top reasons kept for MPs who are high fidelity or
who rebelled.

## 9. Action system

```ts
interface ActionDefinition<K extends ActionKind, P> {
  kind: K;
  params: z.ZodType<P>;                         // shape validation
  diarySlots: number;                           // time cost
  capitalCost(state, actor, p): number;         // political-capital cost
  eligibility(state, actor, p): Eligibility;    // position-based: office, status, party role; returns reasons
  resolve(state, actor, p, rng): Effect[];      // emits effects — never mutates
  priority: number;                             // resolution ordering within a week
}
```
Initial catalogue: `MeetPolitician`, `BuildRelationship`, `SeekEndorsement`, `MakePoliticalPromise`,
`SupportLegislation`, `OpposeLegislation`, `RebelAgainstParty`, `RequestPromotion`.
`AdvanceWeek` is **not** a diary action. It is the turn command (`POST /advance`), because it is the
one action that can't be queued.

Eligibility is about *position* (e.g. `RequestPromotion` requires being an MP of a governing party and
not already in cabinet; PM-only actions check `holdsOffice('office.prime_minister')`). The API calls the
same `planAction`, so the server is the only authority.

## 10. Invariants (checked in tests and optionally at runtime)

- Each constituency has at most one current MP, and that MP's `constituencyId` points back.
- Seat totals equal the count of sitting MPs per party.
- Every office in `government.appointments` is held by a sitting member of a governing party (or a peer where allowed).
- Every relationship endpoint exists; no self-edges.
- `division.result` vote counts equal the number of MPs eligible to vote.
- Political capital ≥ 0; all bounded attributes within range.
- `scheduled` contains no effect with `dueTurn < turn`.

## 11. Performance budget

Target: **< 50 ms CPU** per weekly advance for 650 MPs + ~5k relationship edges in the Worker,
excluding (de)serialization. Expected hot spots: (1) AI target enumeration (O(NPCs × candidates)),
which we bound by top-K and tiering; (2) divisions (O(MPs) per division, cheap); (3) JSON
parse/stringify + gzip of a ~1–3 MB state, likely the **dominant cost**. A Vitest bench
(`pnpm bench`) measures each phase plus serialization against a generated 650-MP world.
