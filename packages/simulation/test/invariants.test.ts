import fc from 'fast-check';
import type { ActionRequest, GameState } from '@whip/domain';
import { describe, expect, it } from 'vitest';
import {
  advanceSimulation,
  cancelPlannedAction,
  checkInvariants,
  hashState,
  planAction,
} from '../src';
import { BILL, ctx, deepFreeze, newGame, play, SECOND_READING, strictCtx } from './helpers';

describe('invariants', () => {
  it('hold after creation and after 12 turns across several seeds', () => {
    for (const seed of [1, 17, 99]) {
      const s = newGame(seed);
      expect(checkInvariants(s, ctx)).toEqual([]);
      // strictCtx runs checkInvariants at the end of every advance and throws on a violation.
      const end = play(s, 12, undefined, strictCtx).state;
      expect(checkInvariants(end, ctx)).toEqual([]);
      expect(end.meta.turn).toBe(13);
    }
  });

  it('detects a corrupted state', () => {
    const s = structuredClone(newGame(2));
    s.parliament.seats['party.npp' as never] = 1;
    const npp = s.politicians.byId['pol_tom_fairley' as never]!;
    npp.politicalCapital = -1;
    const codes = checkInvariants(s, ctx).map((v) => v.code);
    expect(codes).toContain('seats');
    expect(codes).toContain('capital');
  });
});

describe('purity', () => {
  it('never mutates its input (deep-frozen state through plan, cancel and advance)', () => {
    const s = deepFreeze(play(newGame(5), 2).state);
    const hash = hashState(s);
    const planned = planAction(
      s,
      { kind: 'meet_politician', params: { targetId: 'pol_tom_fairley' } },
      ctx,
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const frozenPlanned = deepFreeze(planned.state);
    cancelPlannedAction(frozenPlanned, planned.planned.id);
    const r = advanceSimulation(
      frozenPlanned,
      [{ kind: 'support_legislation', params: { billId: BILL, lobbyTargetIds: [] } }],
      ctx,
    );
    expect(r.state.meta.turn).toBe(s.meta.turn + 1);
    expect(hashState(s)).toBe(hash);
  });
});

/** Random player behaviour: a few actions per week from a small pool of kinds and targets. */
const targetArb = fc.constantFrom(
  'pol_bernadette_walsh',
  'pol_tom_fairley',
  'pol_ken_bramley',
  'pol_gareth_pryce',
  'pol_sarah_kemp',
  'pol_daniel_osei',
  'pol_richard_vane',
  'pol_0042',
  'pol_player',
);
const requestArb: fc.Arbitrary<ActionRequest> = fc.oneof(
  targetArb.map((t) => ({ kind: 'meet_politician' as const, params: { targetId: t } })),
  targetArb.map((t) => ({ kind: 'build_relationship' as const, params: { targetId: t } })),
  targetArb.map((t) => ({ kind: 'seek_endorsement' as const, params: { targetId: t } })),
  fc.tuple(targetArb, fc.constantFrom('aye', 'no', 'abstain')).map(([t, v]) => ({
    kind: 'make_political_promise' as const,
    params: { targetId: t, divisionId: SECOND_READING, vote: v },
  })),
  fc
    .subarray(['pol_tom_fairley', 'pol_daniel_osei', 'pol_0100', 'pol_0200'], { maxLength: 3 })
    .map((ids) => ({
      kind: 'support_legislation' as const,
      params: { billId: BILL, lobbyTargetIds: ids },
    })),
  fc.subarray(['pol_tom_fairley', 'pol_daniel_osei', 'pol_0100'], { maxLength: 3 }).map((ids) => ({
    kind: 'oppose_legislation' as const,
    params: { billId: BILL, lobbyTargetIds: ids },
  })),
  fc.constantFrom('no', 'abstain').map((v) => ({
    kind: 'rebel_against_party' as const,
    params: { divisionId: SECOND_READING, vote: v },
  })),
  fc.constant({ kind: 'request_promotion' as const, params: {} }),
  fc.constant({ kind: 'call_reshuffle' as const, params: {} }),
  fc.constant({ kind: 'meet_politician' as const, params: { nonsense: true } }),
);

describe('property: invariants under random action sequences', () => {
  it('holds for random diaries over 6 weeks', () => {
    const base = newGame(123);
    fc.assert(
      fc.property(
        fc.array(fc.array(requestArb, { maxLength: 4 }), { minLength: 6, maxLength: 6 }),
        fc.boolean(),
        (weeks, respond) => {
          let s: GameState = base;
          for (const week of weeks) {
            for (const req of week) {
              const r = planAction(s, req, ctx);
              if (r.ok) s = r.state;
            }
            const pending = s.events.pending.find((e) => e.addresseeId === s.player.politicianId);
            const extra: ActionRequest[] =
              respond && pending
                ? [
                    {
                      kind: 'respond_to_event',
                      params: {
                        eventId: pending.id,
                        optionKey: ctx.content.events[pending.definitionKey]!.options[0]!.key,
                      },
                    },
                  ]
                : [];
            s = advanceSimulation(s, extra, ctx).state;
            const violations = checkInvariants(s, ctx);
            if (violations.length > 0) throw new Error(violations.map((v) => v.message).join('; '));
          }
        },
      ),
      { numRuns: 6, seed: 42 },
    );
  });
});
