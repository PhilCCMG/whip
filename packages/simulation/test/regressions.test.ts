import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type {
  ContentRegistry,
  EventDefinition,
  EventInstance,
  EventInstanceId,
  GameState,
  OfficeKey,
  PoliticianId,
} from '@whip/domain';
import { relationshipKey } from '@whip/domain';
import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  advanceSimulation,
  checkInvariants,
  forecastDivision,
  Rng,
  voteUtility,
  type SimulationContext,
} from '../src';
import { bindOption } from '../src/events/bind';
import { defaultRelationship } from '../src/relationships/relationships';
import { cloneJson } from '../src/state/clone';
import { compareStrings } from '../src/state/access';
import { formatId, nextId } from '../src/state/ids';
import { TurnContext } from '../src/turn/context';
import { BILL, content, ctx, newGame, pid, planAll, play, SECOND_READING } from './helpers';

const PM_OFFICE = 'office.prime_minister' as OfficeKey;
const CW_OFFICE = 'office.chief_whip' as OfficeKey;

/** A working copy plus a turn context, for driving rules directly. */
function working(s: GameState): { draft: GameState; tc: TurnContext } {
  const draft = cloneJson(s);
  return { draft, tc: new TurnContext(draft, ctx) };
}

/** Give `allyIds` an edge of trust 60 towards `actorId` (rebellion allies need trust ≥ 20). */
function withAllies(s: GameState, actorId: PoliticianId, allyIds: PoliticianId[]): GameState {
  const draft = cloneJson(s);
  for (const a of allyIds) {
    const e = defaultRelationship(draft, a, actorId);
    draft.relationships.edges[relationshipKey(a, actorId)] = { ...e, trust: 60 };
  }
  return draft;
}

function sameParty(s: GameState, id: PoliticianId, n: number): PoliticianId[] {
  const party = s.politicians.byId[id]!.partyId;
  return s.politicians.ids
    .filter((o) => {
      const p = s.politicians.byId[o]!;
      return o !== id && p.partyId === party && p.status === 'mp' && !p.isPlayer;
    })
    .slice(0, n);
}

describe('rebellion recruitment pushes allies towards the rebel, away from the whip', () => {
  const s = newGame(101);
  const div = s.parliament.divisions.byId[SECOND_READING]!;

  function recruit(actorId: PoliticianId, vote: 'no' | 'abstain') {
    const allies = sameParty(s, actorId, 4);
    const state = withAllies(s, actorId, allies);
    const { draft, tc } = working(state);
    const res = ACTIONS.rebel_against_party.resolve(
      draft,
      draft.politicians.byId[actorId]!,
      { divisionId: SECOND_READING, vote },
      { ctx, tc, rng: Rng.fromSeed(1) },
    );
    const pushes = res.effects.filter(
      (e): e is Extract<typeof e, { kind: 'division.pressure' }> => e.kind === 'division.pressure',
    );
    const before = allies.map((a) => voteUtility(draft, draft.politicians.byId[a]!, div, content));
    tc.emitAll(draft, pushes);
    const after = allies.map((a) =>
      voteUtility(
        draft,
        draft.politicians.byId[a]!,
        draft.parliament.divisions.byId[div.id]!,
        content,
      ),
    );
    return { pushes, allies, before, after };
  }

  it('an abstain-rebel against a no whip pulls allies towards aye/abstain, not no', () => {
    // The Conservatives whip no on the bill; Richard Vane abstains in protest.
    const { pushes, allies, before, after } = recruit(pid('pol_richard_vane'), 'abstain');
    const targets = pushes.map((p) => p.targetId);
    for (const a of allies) expect(targets).toContain(a);
    for (const p of pushes) expect(p.delta).toBeGreaterThan(0);
    allies.forEach((_, i) => expect(after[i]!.utility).toBeGreaterThan(before[i]!.utility));
  });

  it('a no-rebel against an aye whip still pulls allies towards no', () => {
    const npp = sameParty(s, s.government.primeMinisterId, 40).find(
      (id) => s.politicians.byId[id]!.offices.length === 0,
    )!;
    const { pushes } = recruit(npp, 'no');
    expect(pushes.length).toBeGreaterThan(0);
    for (const p of pushes) expect(p.delta).toBeLessThan(0);
  });
});

describe('the premiership and role pointers stay consistent', () => {
  const s = newGame(102);

  it('resign_office never vacates the premiership', () => {
    const pm = s.government.primeMinisterId;
    const ev: EventInstance = {
      id: 'evt_test' as EventInstanceId,
      definitionKey: 'event.minister_considers_position',
      raisedTurn: 1,
      expiresTurn: 2,
      addresseeId: pm,
      subjects: { politicianIds: [pm], billId: null, divisionId: null, officeKey: null },
      status: 'pending',
      resolution: null,
    };
    const option = {
      key: 'resign',
      label: 'Resign',
      description: 'Resign.',
      capitalCost: 0,
      effects: [{ kind: 'resign_office' as const }],
      ai: { base: 0, traitModifiers: {} },
    };
    const bound = bindOption(s, ev, option, content, 1);
    expect(bound.effects.some((e) => e.kind === 'office.vacate' && e.officeKey === PM_OFFICE)).toBe(
      false,
    );
    // Even a direct vacate effect cannot leave the premiership empty.
    const { draft, tc } = working(s);
    tc.emit(draft, { kind: 'office.vacate', officeKey: PM_OFFICE, reason: 'resigned', note: 'x' });
    expect(draft.government.appointments[PM_OFFICE]).toBe(pm);
    expect(checkInvariants(draft, ctx)).toEqual([]);
  });

  it('appointing a new Prime Minister moves primeMinisterId and the party leadership', () => {
    const { draft, tc } = working(s);
    const successor = sameParty(s, s.government.primeMinisterId, 60).find(
      (id) => draft.politicians.byId[id]!.offices.length === 0,
    )!;
    tc.emit(draft, {
      kind: 'office.appoint',
      officeKey: PM_OFFICE,
      politicianId: successor,
      reason: 'test',
    });
    expect(draft.government.primeMinisterId).toBe(successor);
    expect(draft.parties.byId[draft.politicians.byId[successor]!.partyId!]!.leaderId).toBe(
      successor,
    );
    expect(checkInvariants(draft, ctx)).toEqual([]);
  });

  it('vacating the Chief Whip clears party.chiefWhipId; the invariant catches a stale pointer', () => {
    const { draft, tc } = working(s);
    const cw = draft.government.appointments[CW_OFFICE]!;
    const party = draft.politicians.byId[cw]!.partyId!;
    expect(draft.parties.byId[party]!.chiefWhipId).toBe(cw);
    tc.emit(draft, { kind: 'office.vacate', officeKey: CW_OFFICE, reason: 'resigned', note: 'x' });
    expect(draft.parties.byId[party]!.chiefWhipId).toBeNull();
    expect(checkInvariants(draft, ctx)).toEqual([]);
    draft.parties.byId[party]!.chiefWhipId = cw;
    expect(checkInvariants(draft, ctx).map((v) => v.code)).toContain('role_pointer');
  });
});

describe('RNG streams are keyed by planned action, not queue position', () => {
  /** NPC-sourced lobbying pressure and whip intel, ignoring anything touching `skip`. */
  function npcDivisionData(s: GameState, skip: Set<string>) {
    const d = s.parliament.divisions.byId[SECOND_READING]!;
    const pressure: Record<string, Record<string, number>> = {};
    for (const [target, p] of Object.entries(d.pressure)) {
      if (skip.has(target)) continue;
      const bySource = Object.fromEntries(
        Object.entries(p.bySource).filter(([src]) => !skip.has(src)),
      );
      pressure[target] = bySource;
    }
    return { pressure, whipIntel: d.whipIntel, declarations: d.declarations };
  }

  it('an extra player diary action does not change unrelated NPC action outcomes', () => {
    const s = newGame(103);
    const me = s.player.politicianId;
    const unrelated = pid('pol_0600');
    const base = [
      { kind: 'meet_politician' as const, params: { targetId: 'pol_bernadette_walsh' } },
    ];
    const extra = [...base, { kind: 'meet_politician' as const, params: { targetId: unrelated } }];
    const a = advanceSimulation(planAll(s, base), [], ctx).state;
    const b = advanceSimulation(planAll(s, extra), [], ctx).state;
    const skip = new Set<string>([me, unrelated]);
    const da = npcDivisionData(a, skip);
    const db = npcDivisionData(b, skip);
    // Sanity: NPCs did lobby this week, so there is something to compare.
    expect(Object.keys(da.pressure).length).toBeGreaterThan(0);
    expect(db).toEqual(da);
    // NPC→NPC relationships not involving the player or the extra target are identical too.
    const npcEdges = (st: GameState) =>
      Object.fromEntries(
        Object.entries(st.relationships.edges).filter(
          ([, e]) => !skip.has(e.from) && !skip.has(e.to),
        ),
      );
    expect(npcEdges(b)).toEqual(npcEdges(a));
  });
});

describe('event generation draws from one stream per definition', () => {
  it('adding an event definition does not shift the rolls of the others', () => {
    const extraKey = 'event.aaa_extra' as EventDefinition['key'];
    const journalist = content.events['event.lobby_journalist_call' as EventDefinition['key']]!;
    const extra: EventDefinition = {
      ...journalist,
      key: extraKey,
      trigger: { kind: 'journalist_call', chance: 0.5, firstTurn: 1 },
      options: journalist.options.map((o) => ({ ...o, effects: [] })),
    };
    const withExtra: ContentRegistry = {
      ...content,
      events: { ...content.events, [extraKey]: extra },
    };
    const extraCtx: SimulationContext = { ...ctx, content: withExtra };
    const raised = (c: SimulationContext) =>
      play(newGame(104), 6, () => [], c)
        .results.flatMap((r) => r.events)
        .filter((e) => e.definitionKey !== extraKey)
        .map((e) => `${e.raisedTurn}:${e.definitionKey}:${e.addresseeId}`);
    const plain = raised(ctx);
    expect(plain.length).toBeGreaterThan(0);
    expect(raised(extraCtx)).toEqual(plain);
  });
});

describe('forecast waverers follow the whip direction', () => {
  it('with a no whip, loyal MPs voting no are not waverers', () => {
    const s = cloneJson(newGame(105));
    const gov = s.parliament.governmentPartyIds[0]!;
    const bill = s.parliament.bills.byId[BILL as never]!;
    bill.whipping[gov] = { line: 'three_line', direction: 'no' };
    const div = s.parliament.divisions.byId[SECOND_READING]!;
    const f = forecastDivision(s, div, content);
    const backbench = s.politicians.ids.filter((id) => {
      const p = s.politicians.byId[id]!;
      return p.partyId === gov && p.status === 'mp' && p.offices.length === 0;
    });
    expect(f.waverers.length).toBeGreaterThan(0);
    // Comfortably loyal no-voters exist and are excluded (an aye-only test would include them all).
    const loyal = backbench.filter((id) => -(f.decisions.get(id)?.breakdown.utility ?? 0) >= 0.6);
    expect(loyal.length).toBeGreaterThan(0);
    for (const id of loyal) expect(f.waverers).not.toContain(id);
    for (const id of f.waverers) expect(-f.decisions.get(id)!.breakdown.utility).toBeLessThan(0.6);
  });
});

describe('political capital is clamped to 0..CAPITAL_CAP', () => {
  it('capital.adjust never exceeds 12 or goes below 0', () => {
    const { draft, tc } = working(newGame(106));
    const me = draft.player.politicianId;
    tc.emit(draft, { kind: 'capital.adjust', politicianId: me, delta: 50, reason: 'x' });
    expect(draft.politicians.byId[me]!.politicalCapital).toBe(12);
    tc.emit(draft, { kind: 'capital.adjust', politicianId: me, delta: -50, reason: 'x' });
    expect(draft.politicians.byId[me]!.politicalCapital).toBe(0);
  });
});

describe('deterministic ordering', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
    });
  }

  it('engine code never uses locale-dependent string comparison', () => {
    const offenders = sourceFiles(join(__dirname, '..', 'src')).filter((f) =>
      readFileSync(f, 'utf8').includes('.localeCompare('),
    );
    expect(offenders).toEqual([]);
  });

  it('generated ids sort numerically under plain string order', () => {
    expect(compareStrings(formatId('sch', 9999), formatId('sch', 10000))).toBe(-1);
    const s = cloneJson(newGame(107));
    s.meta.idCounters['evt'] = 99_999;
    const a = nextId<string>(s, 'evt');
    const b = nextId<string>(s, 'evt');
    expect(a).toBe('evt_00100000');
    expect([b, a].sort()).toEqual([a, b]);
  });
});

describe('the weekly briefing belongs to the week now open', () => {
  it('is turn 1 at creation and the next week after each advance', () => {
    const s = newGame(108);
    expect(s.briefing.turn).toBe(1);
    expect(s.briefing.turn).toBe(s.meta.turn);
    expect(s.briefing.date).toBe(s.meta.date);
    for (const st of play(s, 2).results.map((r) => r.state)) {
      expect(st.briefing.turn).toBe(st.meta.turn);
      expect(st.briefing.date).toBe(st.meta.date);
    }
  });
});
