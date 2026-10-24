# 02 — Domain Model

Status: **Accepted** (approved 2026-10-24)

The domain model lives in `packages/domain`. It is plain TypeScript types plus Zod
schemas for anything that crosses a trust boundary (save files, content definitions).
It has **no runtime dependencies other than Zod**.

## 1. Conventions

| Concern | Convention |
|---|---|
| IDs | Branded strings with a type prefix: `pol_…`, `pty_…`, `con_…`, `bil_…`, `div_…`, `off_…`, `evt_…`, `fac_…`. Stable for the life of a campaign. Generated deterministically by the simulation (`idFactory(prefix, counter)`), never `crypto.randomUUID()` inside the engine. |
| Collections | `Record<Id, Entity>` plus a sorted `ids: Id[]` index where iteration order matters. The engine **never** iterates `Object.keys()` of an unsorted map to make a decision. |
| Dates | `SimDate` = ISO calendar date string `YYYY-MM-DD` (simulation time). `TurnNumber` = integer week index since campaign start. Wall-clock timestamps exist only in persistence (`createdAt` etc.), never in `GameState`. |
| Numbers | Every numeric attribute has a documented **unit and range**. No unexplained "0–100" scores. |
| Content refs | Traits, offices, event templates, issues are referenced by **content keys** (`trait.ambitious`, `office.chancellor`) defined in `packages/content`. |

## 2. Attribute semantics (the "no arbitrary 0–100" rule)

| Attribute | Type / range | Meaning |
|---|---|---|
| **Ideology** | `{ economic: -100..100, social: -100..100 }` | Two-axis position. Economic: −100 = state-led collectivist, +100 = free-market. Social: −100 = liberal/progressive, +100 = traditional/authoritarian. Distance between two positions (Euclidean, max ≈ 283) is the basis of political alignment. |
| **Issue stances** | `Record<IssueKey, -2..+2>` | Ordinal: strongly oppose / oppose / neutral / support / strongly support on specific issues (e.g. `issue.housing_targets`). Bills declare which issues they touch. |
| **Skills** | `1..20` integers (Football Manager convention) | 10 = typical MP. 15+ = notably gifted. 5− = a liability. Skills: `oratory`, `negotiation`, `administration`, `intrigue`, `media`, `policy`. Used as modifiers in action resolution, never alone. |
| **Traits** | `TraitKey[]` (content) | Discrete personality facts (`trait.ambitious`, `trait.loyalist`, `trait.principled`, `trait.schemer`, `trait.vain`, `trait.cautious`). Traits change AI utility weights and relationship responses. |
| **Ambition** | `{ target: AmbitionKey, intensity: 1..5 }` | What they want (`ambition.cabinet`, `ambition.leadership`, `ambition.safe_seat`, `ambition.policy_cause`, `ambition.quiet_life`) and how badly. |
| **Risk tolerance** | `-2..+2` | Willingness to take career risks (rebel, defect, plot). |
| **Political capital** | integer ≥ 0, unbounded | The spendable "currency" of influence. Earned weekly from office, reputation and favours; spent on actions. |
| **Influence** | derived, not stored | Computed each turn from office, faction standing, relationships and reputation. Explainable breakdown is returned to the UI. |
| **Reputation** | `Record<Audience, -100..100>` per audience: `public`, `party_members`, `colleagues`, `media`, `whips` | Net perception. 0 = unknown/neutral. Movements are logged with reasons. |
| **Party loyalty** | `-100..100` | Disposition towards the party line. Drives rebellion likelihood together with whip strength. |

## 3. Core entities

### Campaign (persistence aggregate, not part of `GameState`)
```ts
interface CampaignRecord {
  id: CampaignId; ownerId: UserId; name: string;
  simulationVersion: number;   // rules version that last advanced it
  stateSchemaVersion: number;  // shape version of the stored GameState
  currentDate: SimDate; turn: TurnNumber;
  playerPoliticianId: PoliticianId;
  phase: GamePhase;            // 'planning' | 'resolving' (resolving only exists transiently)
  revision: number;            // optimistic-concurrency counter, +1 per committed change
  createdAt: string; updatedAt: string; // wall-clock, persistence only
}
```
The seed and RNG state live **inside** `GameState` so the snapshot is self-contained.

### GameState (the canonical simulation state, serialized as one snapshot)
```ts
interface GameState {
  meta: { schemaVersion; scenarioKey; turn; date; rng: RngState; idCounters };
  player: { politicianId; plannedActions: PlannedAction[]; diarySlots: number };
  politicians: EntityTable<Politician>;
  parties: EntityTable<Party>;
  factions: EntityTable<Faction>;
  constituencies: EntityTable<Constituency>;
  relationships: RelationshipTable;      // directional edges, see §4
  parliament: Parliament;
  government: Government;
  opinion: PublicOpinion;
  events: { pending: EventInstance[]; cooldowns: Record<EventKey, TurnNumber> };
  scheduled: ScheduledEffect[];          // delayed effects queue, see 03 §5
  recentHistory: HistoryRecord[];        // ring buffer (last ~12 weeks) for AI memory + UI
}
```
Full history is **not** in the state; it is appended to the campaign DO history table (see 04-persistence).

### Politician
```ts
interface Politician {
  id; name: { first; last; honorific? }; dateOfBirth: SimDate; gender;
  partyId: PartyId | null; factionId: FactionId | null;
  constituencyId: ConstituencyId | null;
  status: 'mp' | 'candidate' | 'former_mp' | 'peer' | 'retired';
  offices: OfficeHolding[];            // { officeKey, since: SimDate }
  ideology: Ideology; stances: Partial<Record<IssueKey, Stance>>;
  traits: TraitKey[]; skills: Skills; ambition: Ambition; riskTolerance;
  reputation: Reputation; partyLoyalty; politicalCapital;
  career: CareerEntry[];               // compact milestones (elected, appointed, sacked…)
  fidelity: 'high' | 'medium' | 'low'; // recomputed each turn, see 03 §7
  ai: { lastPlannedTurn: TurnNumber; goals: AiGoal[] } | null; // null for the player
}
```

### Party / Faction
```ts
interface Party {
  id; name; shortName; colour; ideology: Ideology;   // centroid of the leadership's line
  leaderId; chiefWhipId; whipStrength: 1..5;          // organisational discipline
  factionIds; membership: number; funds: number;      // organisation characteristics
  standing: { nationalPollShare: 0..1 };              // electoral standing
  unity: -100..100;                                   // derived & smoothed
}
interface Faction { id; partyId; name; ideology; leaderId; memberIds; cohesion: 0..1; demands: IssueKey[] }
```

### Constituency (import-ready)
```ts
interface Constituency {
  id; externalCode?: string;        // ONS GSS code (e.g. E14001234) for future boundary imports
  name; nation: 'england'|'scotland'|'wales'|'northern_ireland'; region: RegionKey;
  electorate: number;
  demographics: { medianAge; graduateShare; homeownerShare; urbanity: 'urban'|'suburban'|'rural' };
  economy: { unemploymentRate; medianIncomeIndex };
  leanings: Ideology;               // electorate's centroid
  currentMpId: PoliticianId | null;
  results: ElectionResult[];        // { date, votes: Record<PartyId, number>, turnout, winnerId }
}
```
Boundary geometry is **not** in game state — it is a static asset (R2/CDN) keyed by `externalCode`.

### Parliament / Government
```ts
interface Parliament {
  session: { number; openedOn: SimDate };
  seats: Record<PartyId, number>;            // derived from MPs, cached
  governmentPartyIds: PartyId[];
  confidenceAndSupply: { partyId; strength: -2..2 }[]; // formal arrangements ≠ guaranteed votes
  bills: EntityTable<Bill>;
  divisions: EntityTable<Division>;          // scheduled and held
  sittingWeeks: …;                           // recess calendar from content
}
interface Bill { id; title; sponsorId; departmentKey; issues: Partial<Record<IssueKey, Stance>>;
  stage: 'first_reading'|'second_reading'|'committee'|'report'|'third_reading'|'passed'|'defeated'|'withdrawn';
  stageDates; whipping: Record<PartyId, WhipInstruction> }  // 'three_line'|'two_line'|'free'|'none', direction
interface Division { id; billId; stage; scheduledFor: SimDate;
  result?: { ayes; noes; abstentions; votes: Record<PoliticianId, 'aye'|'no'|'abstain'>; explanations? } }
interface Government { primeMinisterId; partyIds; appointments: Record<OfficeKey, PoliticianId>;
  priorities: IssueKey[]; agenda: BillId[]; stability: -100..100 }
```
The vote outcome is always **computed from individual MPs**; the seat majority is only an input to
whip behaviour and narrative, never the answer.

## 4. Relationships (directional)

Stored as edges `from → to`. `A→B` and `B→A` are independent: a minister may be indifferent to a
backbencher who idolises them.

```ts
interface Relationship {
  from: PoliticianId; to: PoliticianId;
  trust: -100..100;      // belief that `to` keeps their word
  respect: -100..100;    // regard for `to`'s competence/standing
  affinity: -100..100;   // personal warmth
  obligation: number;    // favours `from` owes `to` (integer, can be negative = `to` owes `from`)
  rivalry: 0..3;         // 0 none … 3 bitter
  memories: Memory[];    // capped list: { turn, kind, weight, decaysBy } — "you rebelled with me", "you broke a promise"
}
```
- **Political alignment** is *derived* (ideology distance + shared faction), not stored.
- Only *meaningful* edges are stored (sparse). Unstored edges resolve to a default derived from
  party/faction membership and ideology. That keeps the table in the low thousands for 650 MPs.
- Memories decay deterministically; strong memories (betrayal) decay slowly.

## 5. Events: definitions vs instances vs history

| Layer | Lives in | Shape |
|---|---|---|
| **EventDefinition** | `packages/content` (static, versioned, Zod-validated at build/test) | `key`, `trigger` (declarative conditions + weight), `audience`, `options[]` each with `effects: Effect[]`, `cooldownWeeks` |
| **EventInstance** | `GameState.events.pending` | `id`, `definitionKey`, `turn`, bound `subjects` (politician/bill ids), chosen option (once resolved) |
| **HistoryRecord** | Campaign Durable Object `history` table (append-only), plus a short ring buffer in state | `seq`, `turn`, `date`, `type` (discriminated union: `election`, `appointment`, `resignation`, `division`, `leadership_contest`, `scandal`, `policy_announcement`, `negotiation`, `relationship_change`, `action_outcome`…), `importance: 1..5`, `actorIds`, `subjectIds`, `payload` |

`Effect` is a discriminated union of data (e.g. `{ kind: 'relationship.adjust', from, to, trust: +5, reason }`),
interpreted by the engine. Effects are data so they can be logged, scheduled, explained in the UI and
tested — and so NPCs and the player share one effect vocabulary.
