# 07 — Vertical Slice: "First Weeks"

Status: **Accepted**. This is the build spec for Stage C. Parallel agents treat §5 (engine public API)
and `@whip/contracts` as the seams between them.

## 1. Premise

September 2029. The **National Progressive Party** has just won a general election with a nominal
majority of ~70. The player is a newly elected NPP backbencher in a marginal seat. Parliament returns on
**Monday 3 September 2029** (turn 1). The government's flagship **Housing Delivery Bill** (mandatory
local housing targets that override local planning objections) gets its first reading in week 1, with a
**three-line-whipped Second Reading division on Wednesday 26 September (turn 4)**. Report stage and third
reading follow in **turn 10**.

The bill splits the governing party. Modernisers back it. The left worries that it is a developer
giveaway without social housing. MPs for suburban and shire marginals fear green-belt anger. The Chief
Whip has the arithmetic, *on paper*.

The parties, people and places are fictional. The institutions (Commons, whips, readings, PPS roles)
are real.

## 2. World

### Parties (650 seats)

| Key | Name | Seats | Ideology (econ, social) | Whip strength | Stance on bill |
|---|---|---|---|---|---|
| `party.npp` | National Progressive Party | 362 | (−30, −20) | 4 | Government, three-line **aye** |
| `party.con` | Constitutional Party | 168 | (+45, +30) | 4 | Three-line **no** |
| `party.lr` | Liberal Reform | 58 | (0, −45) | 2 | Two-line **abstain** (split) |
| `party.scp` | Scottish Commonwealth Party | 32 | (−35, −30) | 3 | No whip on an England-only bill (free vote; mostly abstain) |
| `party.sov` | Sovereignty Party | 12 | (+30, +65) | 3 | **no** |
| `party.grn` | Green Coalition | 6 | (−55, −60) | 2 | **no** (wants social-housing quotas) |
| `party.ind` | Independents & others (incl. NI parties) | 12 | varied | — | none |

The Speaker (an NPP member) does not vote. Seats are generated to these totals. Nations: England 543,
Scotland 57, Wales 32, Northern Ireland 18. SCP seats are Scottish, and NI seats go to `party.ind`.

### NPP factions
- `faction.modernisers`: centrist, pro-bill. Leader: Chancellor Martin Coyle.
- `faction.heartlands`: the left. Demands `issue.social_housing`. Leader: Bernadette Walsh.
- `faction.shire_suburbs`: marginal-seat moderates. Cares about `issue.green_belt`. Convenor: Tom Fairley.
- About 35% of NPP MPs belong to no faction.

### Issues (content keys)
`issue.housing_targets`, `issue.green_belt` (protection), `issue.social_housing`, `issue.local_control`,
`issue.public_spending`, `issue.immigration`. The bill's stances are housing_targets +2, local_control −2,
green_belt −1 and social_housing 0. A government concession event can raise social_housing to +1.

### Named cast (high fidelity)

| Name | Role | Traits / ambition | Wants |
|---|---|---|---|
| Helen Ashdown | PM, NPP leader (modernisers) | principled, cautious; ambition: legacy | Bill passes; stability |
| Martin Coyle | Chancellor (modernisers leader) | schemer, ambitious; ambition: leadership (5) | Nair weakened, without the bill failing badly |
| Priya Nair | Housing Secretary, bill sponsor | ambitious, vain; ambition: leadership (4) | Bill passes big; credit |
| Gareth Pryce | Chief Whip | loyalist, intimidating (intrigue 16) | Zero rebels; punishes disloyalty |
| Lucy Hargreaves | Deputy Chief Whip | loyalist, cautious | Information on waverers |
| Bernadette Walsh | Heartlands leader, veteran backbencher | principled, stubborn; ambition: policy_cause (social_housing) | Social-housing concession, or else defeat the bill |
| Tom Fairley | Shire & Suburbs convenor | cautious; ambition: safe_seat | Green-belt protections; seat survival |
| Ken Bramley | Father of the House | loyalist, respected (oratory 15) | Party unity. Kingmaker endorser |
| Sarah Kemp | New-intake NPP MP | ambitious, schemer; ambition: cabinet (5) | First PPS job, i.e. the player's rival |
| Daniel Osei | New-intake NPP MP | idealist, principled; ambition: policy_cause | Friend-in-waiting; leans Heartlands |
| Sir Richard Vane | Leader of the Opposition (CON) | ambitious, combative | Embarrass the government, court NPP rebels |
| Imogen Clarke | CON housing spokesperson | schemer | Turn Shire & Suburbs MPs |
| Fiona MacRae | LR leader | cautious, principled | Extract concessions for abstaining |

Other MPs are generated from name pools with ideology sampled around their party/faction centroid, and
skills, traits and ambitions drawn from content distributions.

### Offices in the slice
`office.prime_minister`, `office.chancellor`, `office.housing_secretary`, `office.chief_whip`,
`office.deputy_chief_whip`, 18 other cabinet posts (held by generated NPP MPs; names from content),
`office.minister_of_state_housing` (vacant at the start; the reshuffle target),
`office.pps_housing`, `office.pps_chancellor` (vacant; the realistic player promotion),
`office.leader_of_opposition`, `office.shadow_housing`.

## 3. Player

- A generated NPP MP for **`con.ashby_and_wold`**: an English suburban marginal with a 1,840-vote majority
  over CON, a high homeowner share and strong green-belt sensitivity.
- Skills average (9–12), with one chosen strength at campaign creation (`oratory` | `negotiation` | `intrigue`
  | `policy` → 14). Ideology is chosen from three presets: Moderniser-leaning, Heartlands-leaning,
  Independent-minded.
- Starts with **3 political capital** and **5 diary slots/week**. Knows few colleagues: initial
  relationships come from the new intake and the regional group.

## 4. Mechanics in scope

### 4.1 Actions (all usable by NPCs too, through the same definitions)

| Kind | Slots | Capital | Eligibility | Effect summary |
|---|---|---|---|---|
| `meet_politician` {targetId} | 1 | 0 | sitting MP; target is a sitting MP and not self | Small affinity/trust change from compatibility × negotiation. **Reveals target's current voting intention** on upcoming divisions (intel stored in the player's `knowledge`) |
| `build_relationship` {targetId} | 2 | 1 | as above | Larger affinity/respect gain. Trait-sensitive (vain responds to flattery; principled to substance) |
| `seek_endorsement` {targetId} | 1 | 1 | target holds office or is a faction leader or is Father of the House | On success, target endorses actor for promotion (stored). Actor owes obligation +1. Chance from target's respect/trust towards actor |
| `make_political_promise` {targetId, divisionId, vote} | 1 | 0 | division scheduled in future | Target's trust/affinity rises if the promise matches their wishes. Schedules a `promise.check` effect after the division. Broken promise → trust −30, memory `broke_promise` |
| `support_legislation` {billId, lobbyTargetIds ≤ 3} | 1 | 1 | bill before the House | Public support: whips' and government's view of actor +, reputation by oratory. Applies *lobbying pressure* towards aye on targets, weighted by their relationship to the actor |
| `oppose_legislation` {billId, lobbyTargetIds ≤ 3} | 1 | 1 | bill before the House | Mirror image. For a government MP: whips' view −, Heartlands/opposition respect + |
| `rebel_against_party` {divisionId, vote: 'no' or 'abstain'} | 1 | 2 | MP whose party has whipped the division | Commits actor's vote against the whip and recruits: allies with trust ≥ 20 towards actor get rebellion pressure. Whips learn of it with a probability set by intrigue |
| `request_promotion` {} | 1 | 2 | MP of a governing party, no ministerial office, not requested in the last 6 turns | Resolved in the Careers phase. Utility = loyalty record + endorsements + respect of Chief Whip/PM + vacancies. Success → PPS role. Failure → small respect loss, cooldown |
| `respond_to_event` {eventId, optionKey} | 0 | per option | pending event addressed to actor | Applies option effects |
| `call_reshuffle` {} | 0 | 0 | **holds `office.prime_minister`** | Careers phase this turn fills vacancies and may move/sack ministers. Used by PM AI after a defeat or resignation. It exists in the slice to prove position-based eligibility |

Capital income per turn: +1 base, +1 per ministerial/PPS office, +1 per 3 endorsements held,
and +1 if reputation with whips ≥ 30. Capped at 12.

### 4.2 Division resolution
`voteUtility` as in doc 03 §8. A positive utility means **aye**. Thresholds: `> +0.15` aye, `< −0.15` no,
otherwise abstain. Some MPs always abstain: SCP members on a free vote with England-only issues, and
low-interest independents. The **player's vote** is the party whip's direction by default. A
`rebel_against_party` action overrides it. `support_legislation` and `oppose_legislation` set the
player's intended vote (aye / no) when no rebellion is declared.

### 4.3 Consequences
- **Whips**: the Chief Whip's trust towards each government rebel falls by 15 (25 on a three-line whip),
  with a `rebelled` memory. Loyal waverers who were lobbied and stayed loyal gain whip respect.
- **Government**: margin ≥ 40 → stability +5. Margin < 20 → −5 and media headline. Defeat → −25, Nair
  respect −20, and the event `event.minister_considers_position` is raised for Nair.
- **Factions**: Heartlands cohesion rises if ≥ 15 members rebelled together. Rebels gain affinity with
  each other (shared memory).
- **Careers phase**: a resignation (Nair, after defeat, depending on vanity and ambition) or a reshuffle opens
  `office.minister_of_state_housing` and PPS slots. The PM fills them by candidate utility (loyalty,
  respect, faction balance, endorsements). **The player can be appointed** if their standing is high, and
  Sarah Kemp competes for the same posts.
- **Promises**: checked after each division.

### 4.4 NPC behaviour (utility AI)
- Nair and the whips use `support_legislation` and `meet_politician` on waverers with the lowest |utility|.
- Walsh uses `oppose_legislation`, `build_relationship` and `rebel_against_party`, recruiting Heartlands members and Osei.
- Fairley wavers. He responds to the green-belt event and to constituency pressure.
- Vane and Clarke lobby NPP waverers in shire seats with `oppose_legislation` (cross-party lobbying is allowed;
  the effect is weaker unless trust exists).
- Kemp uses `seek_endorsement` with Pryce, Coyle and Bramley, then `request_promotion`, and is loyal on the bill.
- Coyle uses `build_relationship` with Kemp and Walsh (quietly hedging against Nair).

### 4.5 Events (content), small set
1. `event.whips_office_summons`: addressed to a government MP whom the whips believe is wavering. Options: *reassure* (whip trust +, capital +1), *non-committal* (nothing), *warn them* (whip trust −, Heartlands respect +).
2. `event.constituency_green_belt_protest`: the player's or Fairley's seat. Options: *join protest* (local reputation +, whip trust −), *meet organisers* (−1 slot next week via a scheduled effect), *back the bill* (local reputation −).
3. `event.lobby_journalist_call`: options shape media reputation and may leak intent.
4. `event.government_concession`: triggered when forecast rebels exceed the majority margin ÷ 2. The government amends the bill (social_housing +1), which moves Heartlands utilities.
5. `event.minister_considers_position`: NPC-only resolution, informational for the player.
6. `event.pps_offer`: raised when the player is appointed. Accept or decline.

### 4.6 History and briefing
Every action outcome, division, appointment, resignation, event resolution and notable relationship
change (|Δ| ≥ 10) becomes a `HistoryRecord` with importance 1–5. The **weekly briefing** is compiled
from the turn's top records into newspaper-style headlines, with deterministic templates from content.

## 5. Engine public API (the seam — exported from `@whip/simulation`)

```ts
export const SIMULATION_VERSION: number;      // 1
export const STATE_SCHEMA_VERSION: number;    // 1

export function createCampaignState(input: CreateCampaignInput, ctx: SimulationContext): GameState;
//   CreateCampaignInput = { scenario: ScenarioDefinition; seed: number; player: PlayerSetup }
//   PlayerSetup = { firstName; lastName; gender: 'female'|'male'|'nonbinary'; strength: SkillKey; ideologyPreset: 'moderniser'|'heartlands'|'independent' }

export function planAction(state: GameState, request: ActionRequest, ctx: SimulationContext): PlanActionResult;
//   ActionRequest = { kind: ActionKind; params: unknown }  (actor = player; params validated by the action's Zod schema)
//   PlanActionResult = { ok: true; state: GameState; planned: PlannedAction } | { ok: false; reasons: IneligibilityReason[] }

export function cancelPlannedAction(state: GameState, plannedActionId: string): GameState | null;

export function advanceSimulation(state: GameState, actions: ActionRequest[], ctx: SimulationContext): SimulationResult;
//   resolves state.player.plannedActions plus `actions`; see doc 03 §1 for SimulationResult

export function serializeState(state: GameState): string;          // canonical JSON (sorted keys)
export function deserializeState(json: string): GameState;         // parse → migrate → Zod-validate; throws StateLoadError
export function checkInvariants(state: GameState): InvariantViolation[];

// Pure read helpers used by API projections (no DTO types here — the API maps to @whip/contracts)
export const selectors: {
  player(state): Politician;
  influence(state, politicianId, ctx): { total: number; breakdown: { label: string; value: number }[] };
  actionCatalogue(state, actorId, ctx): { kind; label; slots; capitalCost; eligible: boolean; reasons: string[]; targets?: … }[];
  divisionForecast(state, divisionId, viewerId): { ayes; noes; abstain; unknown; byParty: … };  // uses viewer's knowledge — fog of war
  knownIntention(state, viewerId, politicianId, divisionId): 'aye'|'no'|'abstain'|'unknown';
  relationship(state, from, to): Relationship;   // stored or derived default
  seatTotals(state): Record<PartyId, number>;
};
```
`SimulationContext = { content: ContentRegistry; simulationVersion: number }`. `ContentRegistry` and
`ScenarioDefinition` types live in `@whip/domain`. The content *values* live in `@whip/content`, which
exports `loadContentRegistry()` and `scenarios.firstWeeks`.

**Fog of war**: the player's view of other MPs' voting intentions is `knowledge.intentions[pid][divId] =
{ value, asOfTurn }`, collected by meetings, whip events and public statements. Forecasts show
`unknown` for the rest, split by the party whip's expectation. This gives intelligence gathering a
purpose.

## 6. Acceptance for the slice

1. Create a campaign → world with 650 MPs, 650 constituencies, 7 parties, factions, the cast and the bill.
2. In turns 1–3 the player plans actions, which are validated (e.g. `request_promotion` is rejected for an
   opposition MP, and a PM-only action `call_reshuffle` would be rejected for a backbencher).
3. Turn 4: the second-reading division resolves MP by MP. The result depends on player and NPC lobbying.
   Different seeds and different player choices give different margins and rebel lists.
4. The consequences visibly propagate (whip relationships, stability, careers, briefing).
5. The same seed and actions give an identical state hash.
6. Batch property: across 200 seeds with no player input, the government wins second reading in
   roughly 60–95% of runs and rebels are mostly Heartlands or Shire & Suburbs. This is a balance check
   with tolerance, not an exact assertion.
