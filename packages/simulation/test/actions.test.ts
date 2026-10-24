import type { GameState, IneligibilityReason } from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { ACTIONS, advanceSimulation, cancelPlannedAction, planAction, selectors } from '../src';
import { BILL, ctx, newGame, pid, planAll, SECOND_READING } from './helpers';

function reasonsOf(r: ReturnType<typeof planAction>): IneligibilityReason[] {
  if (r.ok) throw new Error('expected rejection');
  return r.reasons;
}

describe('action eligibility (position-based)', () => {
  const s = newGame(3);

  it('a backbencher cannot call a reshuffle; the Prime Minister can', () => {
    const reasons = reasonsOf(planAction(s, { kind: 'call_reshuffle', params: {} }, ctx));
    expect(reasons.map((r) => r.code)).toContain('not_eligible_position');
    expect(reasons[0]?.message).toBe('Only the Prime Minister can call a reshuffle.');
    const pm = s.politicians.byId[s.government.primeMinisterId]!;
    expect(ACTIONS.call_reshuffle.positionEligibility(s, pm, ctx)).toEqual([]);
  });

  it('an opposition MP cannot request promotion', () => {
    const vane = s.politicians.byId['pol_richard_vane' as never]!;
    const reasons = ACTIONS.request_promotion.positionEligibility(s, vane, ctx);
    expect(reasons.map((r) => r.message)).toContain(
      'Only MPs of a governing party can be promoted into government.',
    );
    // The same through planAction for a player who sits for the opposition.
    const me = selectors.player(s);
    const opposition: GameState = {
      ...s,
      politicians: {
        ...s.politicians,
        byId: { ...s.politicians.byId, [me.id]: { ...me, partyId: 'party.con' as never } },
      },
    };
    expect(
      reasonsOf(planAction(opposition, { kind: 'request_promotion', params: {} }, ctx)).map(
        (r) => r.code,
      ),
    ).toContain('not_eligible_position');
  });

  it('ministers cannot request promotion and requests have a cooldown', () => {
    const nair = s.politicians.byId['pol_priya_nair' as never]!;
    expect(
      ACTIONS.request_promotion.positionEligibility(s, nair, ctx).map((r) => r.message),
    ).toContain('You already hold ministerial office.');
    const rich = {
      ...s,
      politicians: {
        ...s.politicians,
        byId: {
          ...s.politicians.byId,
          [s.player.politicianId]: { ...selectors.player(s), politicalCapital: 8 },
        },
      },
    };
    const planned = planAction(rich, { kind: 'request_promotion', params: {} }, ctx);
    expect(planned.ok).toBe(true);
    const next = advanceSimulation(planned.ok ? planned.state : rich, [], ctx).state;
    expect(
      reasonsOf(planAction(next, { kind: 'request_promotion', params: {} }, ctx)).map(
        (r) => r.code,
      ),
    ).toContain('cooldown');
  });

  it('seek_endorsement requires an office holder, faction leader or the Father of the House', () => {
    const backbencher = s.politicians.ids.find((id) => {
      const p = s.politicians.byId[id]!;
      return (
        p.partyId === 'party.npp' &&
        p.offices.length === 0 &&
        p.castKey === null &&
        !p.isPlayer &&
        !s.factions.ids.some((f) => s.factions.byId[f]?.leaderId === id)
      );
    })!;
    expect(
      reasonsOf(
        planAction(s, { kind: 'seek_endorsement', params: { targetId: backbencher } }, ctx),
      )[0]?.code,
    ).toBe('invalid_target');
    expect(
      planAction(s, { kind: 'seek_endorsement', params: { targetId: 'pol_ken_bramley' } }, ctx).ok,
    ).toBe(true);
  });

  it('rebellion requires a whipped division and a vote against the whip', () => {
    expect(
      planAction(
        s,
        { kind: 'rebel_against_party', params: { divisionId: SECOND_READING, vote: 'no' } },
        ctx,
      ).ok,
    ).toBe(true);
    expect(
      reasonsOf(
        planAction(
          s,
          { kind: 'rebel_against_party', params: { divisionId: SECOND_READING, vote: 'aye' } },
          ctx,
        ),
      )[0]?.code,
    ).toBe('invalid_params');
    const fiona = s.politicians.byId['pol_fiona_macrae' as never]!;
    expect(
      ACTIONS.rebel_against_party.paramEligibility(
        s,
        fiona,
        { divisionId: SECOND_READING, vote: 'abstain' },
        ctx,
      )[0]?.message,
    ).toContain('already says');
  });
});

describe('diary slots and political capital', () => {
  it('limits the week to 5 slots (build_relationship costs 2)', () => {
    let s = newGame(4);
    const targets = [
      'pol_bernadette_walsh',
      'pol_tom_fairley',
      'pol_daniel_osei',
      'pol_sarah_kemp',
      'pol_ken_bramley',
    ];
    for (const t of targets) {
      const r = planAction(s, { kind: 'meet_politician', params: { targetId: t } }, ctx);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(selectors.diary(s)).toMatchObject({ slotsTotal: 5, slotsUsed: 5 });
    const sixth = reasonsOf(
      planAction(s, { kind: 'meet_politician', params: { targetId: 'pol_gareth_pryce' } }, ctx),
    );
    expect(sixth.map((r) => r.code)).toEqual(['insufficient_slots']);
    expect(sixth[0]?.message).toBe('Needs 1 diary slot; 0 left this week.');
  });

  it('reserves capital when planned, refunds it on cancel, and rejects unaffordable actions', () => {
    let s = newGame(5);
    expect(selectors.player(s).politicalCapital).toBe(3);
    const a = planAction(
      s,
      { kind: 'build_relationship', params: { targetId: 'pol_gareth_pryce' } },
      ctx,
    );
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    s = a.state;
    expect(selectors.player(s).politicalCapital).toBe(2);
    s = planAll(s, [
      { kind: 'support_legislation', params: { billId: BILL, lobbyTargetIds: [] } },
      { kind: 'seek_endorsement', params: { targetId: 'pol_ken_bramley' } },
    ]);
    expect(selectors.player(s).politicalCapital).toBe(0);
    const broke = reasonsOf(
      planAction(
        s,
        { kind: 'rebel_against_party', params: { divisionId: SECOND_READING, vote: 'no' } },
        ctx,
      ),
    );
    expect(broke.map((r) => r.code)).toContain('insufficient_capital');
    const cancelled = cancelPlannedAction(s, a.planned.id);
    expect(cancelled).not.toBeNull();
    expect(selectors.player(cancelled!).politicalCapital).toBe(1);
    expect(cancelled!.player.plannedActions.map((p) => p.id)).not.toContain(a.planned.id);
    expect(cancelPlannedAction(s, 'act_9999')).toBeNull();
  });

  it('spends the reserved capital on resolution and pays weekly income', () => {
    const s = planAll(newGame(6), [
      { kind: 'build_relationship', params: { targetId: 'pol_gareth_pryce' } },
    ]);
    const r = advanceSimulation(s, [], ctx);
    // 3 − 1 (spent) + 1 (base income) = 3.
    expect(selectors.player(r.state).politicalCapital).toBe(3);
    expect(r.capitalChange).toBe(0);
    expect(r.actionOutcomes[0]).toMatchObject({ kind: 'build_relationship', status: 'succeeded' });
  });
});

describe('parameter validation', () => {
  const s = newGame(8);

  it('rejects invalid params with readable reasons', () => {
    expect(reasonsOf(planAction(s, { kind: 'meet_politician', params: {} }, ctx))[0]).toMatchObject(
      { code: 'invalid_params' },
    );
    expect(
      reasonsOf(
        planAction(
          s,
          { kind: 'meet_politician', params: { targetId: s.player.politicianId } },
          ctx,
        ),
      )[0]?.code,
    ).toBe('self_target');
    expect(
      reasonsOf(
        planAction(s, { kind: 'meet_politician', params: { targetId: 'pol_nobody' } }, ctx),
      )[0]?.code,
    ).toBe('invalid_target');
    const tooMany = reasonsOf(
      planAction(
        s,
        {
          kind: 'support_legislation',
          params: {
            billId: BILL,
            lobbyTargetIds: ['pol_0001', 'pol_0002', 'pol_0003', 'pol_0004'],
          },
        },
        ctx,
      ),
    );
    expect(tooMany[0]?.message).toContain('At most 3');
    expect(
      reasonsOf(
        planAction(
          s,
          { kind: 'support_legislation', params: { billId: 'bill.nope', lobbyTargetIds: [] } },
          ctx,
        ),
      )[0]?.code,
    ).toBe('bill_not_before_house');
    expect(
      reasonsOf(
        planAction(
          s,
          {
            kind: 'make_political_promise',
            params: { targetId: 'pol_0001', divisionId: 'div.nope', vote: 'aye' },
          },
          ctx,
        ),
      )[0]?.code,
    ).toBe('division_not_scheduled');
    expect(
      reasonsOf(
        planAction(
          s,
          { kind: 'respond_to_event', params: { eventId: 'evt_0042', optionKey: 'x' } },
          ctx,
        ),
      )[0]?.code,
    ).toBe('event_not_pending');
    expect(
      reasonsOf(planAction(s, { kind: 'teleport' as never, params: {} }, ctx))[0]?.message,
    ).toContain('Unknown action');
  });

  it('rejects duplicates in the same week', () => {
    const once = planAll(s, [{ kind: 'meet_politician', params: { targetId: 'pol_tom_fairley' } }]);
    expect(
      reasonsOf(
        planAction(once, { kind: 'meet_politician', params: { targetId: 'pol_tom_fairley' } }, ctx),
      )[0]?.code,
    ).toBe('duplicate');
  });

  it('actions submitted with advanceSimulation are validated too', () => {
    const r = advanceSimulation(
      s,
      [
        { kind: 'call_reshuffle', params: {} },
        { kind: 'meet_politician', params: { targetId: pid('pol_daniel_osei') } },
      ],
      ctx,
    );
    expect(r.actionOutcomes.map((o) => [o.kind, o.status])).toEqual([
      ['call_reshuffle', 'rejected'],
      ['meet_politician', 'succeeded'],
    ]);
  });

  it('exposes an action catalogue with reasons for the player', () => {
    const items = selectors.actionCatalogue(s, s.player.politicianId, ctx);
    expect(items.map((i) => i.kind)).toHaveLength(10);
    const reshuffle = items.find((i) => i.kind === 'call_reshuffle')!;
    expect(reshuffle.eligible).toBe(false);
    expect(reshuffle.reasons).toContain('Only the Prime Minister can call a reshuffle.');
    const meet = items.find((i) => i.kind === 'meet_politician')!;
    expect(meet.eligible).toBe(true);
    expect(meet.params[0]?.options?.length).toBeGreaterThan(5);
    const support = items.find((i) => i.kind === 'support_legislation')!;
    expect(support.params.find((p) => p.name === 'billId')?.options?.[0]?.id).toBe(BILL);
  });
});
