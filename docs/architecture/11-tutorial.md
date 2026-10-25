# 11: Tutorial ("Members' induction")

Status: **Accepted** (2026-10-25)

## Concept

New careers start with an in-fiction **Members' induction** run by **Ken Bramley MP**, Father of the
House. He is loyal, respected, dry and faintly weary. It teaches by doing. Each step points at a real
element of the UI and completes when the player **actually does the thing**, never by clicking
"Next" on a modal. The induction tracks the scenario's real arc, weeks 1–4 up to the Second Reading
division, then signs off.

- It is on by default for new careers. It is a toggle on New Career ("Take the Members' induction").
- It never blocks play. Every step can be dismissed, the whole induction can be skipped (an
  in-game confirm, not a browser confirm), and it can be replayed from the pause menu
  ("Induction").
- It sits **outside the simulation**. Tutorial state is UI metadata stored per campaign on the
  server. It never changes `GameState`, revisions or determinism. Bramley's guidance is UI copy, and
  his real in-game relationship with the player does not change because of the tutorial.
- Voice: `10-voice-and-copy.md`. Bramley's lines are short (1–3 sentences), dry and useful. The
  mechanic must be clear from his line alone.

## Steps

Each step has an id, a **trigger** (when it becomes active), a **target** (the UI element it points
at), a **completion condition** (detected from real state or real UI events), and Bramley's line.
Steps activate in order. A step whose precondition isn't met yet waits; for example, "answer a
dispatch" waits until a dispatch exists.

| # | id | Screen | Completes when | Teaches |
|---|---|---|---|---|
| 1 | `welcome` | Office | Player acknowledges (the only "OK" step) | Who Bramley is, and that the induction can be skipped |
| 2 | `hud` | Office | Auto after a short tour of week, capital, influence and End Week (coach marks; Enter or click advances) | The HUD resources |
| 3 | `diary` | Office | The player opens the action planner | Diary slots, a week of 5 |
| 4 | `first-meeting` | Planner/Office | A `meet_politician` action is planned (Bramley suggests Daniel Osei, but any target counts) | Planning actions, slots and capital costs |
| 5 | `dispatch` | Office | The player answers any pending event, i.e. plans `respond_to_event` (waits if none) | Dispatches and choices |
| 6 | `end-week` | HUD | The player ends week 1 | Ending the week |
| 7 | `the-papers` | Turn report | The turn report is continued | The paper and "Your week"; outcomes are stamped |
| 8 | `fog` | Office/Chamber | The player visits CHAMBER and sees the forecast with unknowns | The whips' forecast and that intentions are hidden |
| 9 | `find-out` | Chamber/Tea Room | The player learns any colleague's intention (a meeting revealed one) **or** plans a meeting with a waverer | How intelligence works |
| 10 | `relationships` | Tea Room | The player opens any politician dossier | Trust, respect, affinity, both directions, memories |
| 11 | `factions` | Party HQ | The player visits PARTY HQ | Factions, your camp, the power ladder |
| 12 | `your-vote` | Chamber | The player plans `support_legislation`, `oppose_legislation`, `rebel_against_party` or `make_political_promise` on the bill, **or** reaches week 4 | Choosing a side and the cost of rebellion |
| 13 | `division` | Turn report | The Second Reading result is shown | How the vote was decided and its consequences |
| 14 | `graduation` | Office | Acknowledged | Sign-off. The Archive keeps your career |

The UI may merge or reorder steps if it plays better, but it must keep the same coverage and
"learn by doing" rule, and must update this table.

### Implementation (`apps/web/src/features/tutorial`)

The table above is implemented as written (no merges or reorders). `steps.ts` is the registry,
`engine.ts` the pure progression (eligible steps, the one to show, completion detected against a
baseline taken when each step became eligible), and `copy.ts` holds all of Bramley's lines.

- A step whose data precondition fails (`dispatch` with no dispatch yet) waits while later steps
  go ahead, then takes its turn as soon as it can. Doing a step's thing early still completes it.
- "Go and look" steps (`fog`, `relationships`, `factions`) complete once the player has arrived
  and either pressed **Got it** or moved on, so the line is read where it applies.
- Targets are `data-tutorial="…"` attributes on the real elements. A step lists several (the
  Chamber forecast, else the CHAMBER tab) and the first visible one wins. In the planner and the
  turn report the card docks inside the modal (`DispatchFrame`'s `data-tutorial-slot`).
- **Got it** and Esc put a `do` step's card away (a chip brings it back). They never complete it.
- Graduation completes every step id and shows a small "Induction complete" stamp. After that the
  induction stays silent until it is restarted from the pause menu ("Induction").
- A 404 from `GET /tutorial` (API not deployed yet) is read as the default, disabled state.

## Persistence (API)

`TutorialStateSchema` in `@whip/contracts`:

```ts
{ enabled: boolean; completed: string[]; dismissed: boolean; updatedAt: string | null }
```

- `GET  /api/v1/campaigns/:id/tutorial` returns `TutorialState`. Default for a campaign without
  stored state: `{ enabled: false, completed: [], dismissed: false, updatedAt: null }`.
- `PUT  /api/v1/campaigns/:id/tutorial` takes the body `TutorialUpdate`:
  `{ enabled?: boolean; completeSteps?: string[]; dismissed?: boolean; reset?: boolean }` and returns
  `TutorialState`.
  - Merge semantics: `completed` is a **set union** (idempotent, so retries and two devices are safe).
    `reset: true` clears `completed` and `dismissed` and sets `enabled: true`. Last write wins for
    `enabled` and `dismissed`.
  - Step ids: `^[a-z0-9-]{1,40}$`, max 50 per request, max 100 stored.
  - No `expectedRevision` or `Idempotency-Key` is needed. It does **not** bump the campaign
    revision or ETag.
- `CreateCampaignRequest.tutorial?: boolean` defaults to **true**, and sets the initial
  `enabled` state.
- Stored in the Campaign Durable Object's `meta` table under key `tutorial`. Ownership is checked
  in the Worker as for every campaign route.
