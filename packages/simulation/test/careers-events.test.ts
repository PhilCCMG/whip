import { HISTORY_TYPES, relationshipKey, type EventInstanceId, type GameState } from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { advanceSimulation, diaryCapacity, planAction, selectors } from '../src';
import { BILL, ctx, newGame, pid, planAll, play, SECOND_READING } from './helpers';

const DEFEAT_SEED = 95028; // government loses the second reading with no player input
const CONCESSION_SEED = 15838; // the PM concedes a social-housing quota before the vote

describe('government consequences', () => {
  it('a defeat costs 25 stability, raises minister_considers_position for the sponsor, and leads to a reshuffle', () => {
    const run = play(newGame(DEFEAT_SEED), 6);
    const week4 = run.results[3]!;
    expect(week4.divisions[0]?.governmentWon).toBe(false);
    const before = run.results[2]!.state.government.stability;
    expect(week4.state.government.stability).toBeLessThanOrEqual(before - 25 + 5);
    expect(week4.state.government.lastDefeatTurn).toBe(4);
    expect(
      week4.events.some(
        (e) =>
          e.definitionKey === 'event.minister_considers_position' &&
          e.addresseeId === 'pol_priya_nair',
      ),
    ).toBe(true);
    // The headline reports the defeat.
    expect(week4.headlines[0]?.importance).toBe(5);
    // After a defeat the PM reshuffles (07 §4.3): a resignation or a reshuffle opens posts that get filled.
    const all = run.results.flatMap((r) => r.history);
    expect(all.some((h) => h.type === 'appointment')).toBe(true);
    const bill = run.state.parliament.bills.byId[BILL as never]!;
    expect(bill.stage).toBe('defeated');
  });

  it('the government can concede, moving the bill (social_housing 0 → +1)', () => {
    const run = play(newGame(CONCESSION_SEED), 4);
    const bill = run.state.parliament.bills.byId[BILL as never]!;
    expect(bill.issues['issue.social_housing']).toBe(1);
    expect(bill.amendments[0]).toMatchObject({ issueKey: 'issue.social_housing', from: 0, to: 1 });
    const rec = run.results.flatMap((r) => r.history).find((h) => h.type === 'policy_announcement');
    expect(rec?.title).toContain('amends');
  });
});

describe('player career', () => {
  /** A well-regarded, endorsed, loyal player. */
  function standing(s: GameState): GameState {
    const me = selectors.player(s);
    const cw = pid('pol_gareth_pryce');
    const pm = pid('pol_helen_ashdown');
    const edges = { ...s.relationships.edges };
    for (const from of [cw, pm])
      edges[relationshipKey(from, me.id)] = {
        ...selectors.relationship(s, from, me.id),
        trust: 60,
        respect: 60,
      };
    return {
      ...s,
      relationships: { edges },
      politicians: {
        ...s.politicians,
        byId: {
          ...s.politicians.byId,
          [me.id]: {
            ...me,
            partyLoyalty: 85,
            politicalCapital: 6,
            endorsedBy: [cw, pid('pol_ken_bramley'), pid('pol_martin_coyle')],
          },
        },
      },
    };
  }

  it('can be offered a PPS post after asking, and accepting appoints them', () => {
    let s = planAll(standing(newGame(41)), [{ kind: 'request_promotion', params: {} }]);
    const week1 = advanceSimulation(s, [], ctx);
    const offer = week1.events.find((e) => e.definitionKey === 'event.pps_offer');
    expect(offer, 'expected an offer event').toBeDefined();
    if (!offer) return;
    expect(offer.addresseeId).toBe(s.player.politicianId);
    s = week1.state;
    const accept = planAction(
      s,
      { kind: 'respond_to_event', params: { eventId: offer.id, optionKey: 'accept' } },
      ctx,
    );
    expect(accept.ok).toBe(true);
    const week2 = advanceSimulation(accept.ok ? accept.state : s, [], ctx);
    const me = selectors.player(week2.state);
    expect(me.offices.map((o) => o.officeKey)).toContain(offer.subjects.officeKey);
    expect(
      week2.notifications.some((n) => n.severity === 'good' && n.title.startsWith('You are now')),
    ).toBe(true);
    expect(
      selectors.capitalIncome(week2.state, me.id, ctx).breakdown.map((b) => b.label),
    ).toContain('Office');
    // A PPS who rebels is sacked (collective responsibility).
    const rebel = planAll(week2.state, [
      { kind: 'rebel_against_party', params: { divisionId: SECOND_READING, vote: 'no' } },
    ]);
    const after = play(rebel, 2).state;
    expect(selectors.player(after).offices).toHaveLength(0);
  });

  it('a weak request is refused with an explanation', () => {
    const s = newGame(42);
    const rich = {
      ...s,
      politicians: {
        ...s.politicians,
        byId: {
          ...s.politicians.byId,
          [s.player.politicianId]: {
            ...selectors.player(s),
            partyLoyalty: -40,
            politicalCapital: 5,
          },
        },
      },
    };
    const r = advanceSimulation(
      planAll(rich, [{ kind: 'request_promotion', params: {} }]),
      [],
      ctx,
    );
    expect(r.events.some((e) => e.definitionKey === 'event.pps_offer')).toBe(false);
    expect(r.notifications.some((n) => n.title === 'Not this time')).toBe(true);
  });
});

describe('events', () => {
  it('"meet the organisers" costs a diary slot next week via a scheduled effect', () => {
    const s = newGame(43);
    const me = s.player.politicianId;
    const ev = {
      id: 'evt_9001' as EventInstanceId,
      definitionKey: 'event.constituency_green_belt_protest' as const,
      raisedTurn: 0,
      expiresTurn: 1,
      addresseeId: me,
      subjects: {
        politicianIds: [me],
        billId: BILL as never,
        divisionId: SECOND_READING,
        officeKey: null,
      },
      status: 'pending' as const,
      resolution: null,
    };
    const withEvent: GameState = { ...s, events: { ...s.events, pending: [ev] } };
    const planned = planAction(
      withEvent,
      { kind: 'respond_to_event', params: { eventId: ev.id, optionKey: 'meet_organisers' } },
      ctx,
    );
    expect(planned.ok).toBe(true);
    const week1 = advanceSimulation(planned.ok ? planned.state : withEvent, [], ctx);
    expect(
      week1.state.scheduled.some((x) => x.effect.kind === 'diary.adjust_slots' && x.dueTurn === 2),
    ).toBe(true);
    expect(diaryCapacity(week1.state)).toBe(4);
    expect(selectors.player(week1.state).localStanding).toBeGreaterThan(
      selectors.player(s).localStanding,
    );
    const week2 = advanceSimulation(week1.state, [], ctx);
    expect(diaryCapacity(week2.state)).toBe(5);
    expect(week2.state.events.pending.some((e) => e.id === ev.id)).toBe(false);
  });

  it('a player who publicly opposes the bill gets a word from the whips in some runs', () => {
    let summoned = 0;
    for (const seed of [51, 52, 53, 54, 55]) {
      const run = play(newGame(seed), 3, (turn) =>
        turn === 1
          ? [{ kind: 'oppose_legislation', params: { billId: BILL, lobbyTargetIds: [] } }]
          : [],
      );
      if (
        run.results.some((r) =>
          r.events.some((e) => e.definitionKey === 'event.whips_office_summons'),
        )
      )
        summoned++;
    }
    expect(summoned).toBeGreaterThan(0);
  });

  it('unanswered player events expire with their default option', () => {
    const run = play(newGame(44), 4);
    const raised = run.results
      .flatMap((r) => r.events)
      .filter((e) => e.addresseeId === run.state.player.politicianId);
    for (const ev of raised) {
      if (ev.expiresTurn < run.state.meta.turn)
        expect(run.state.events.pending.some((p) => p.id === ev.id)).toBe(false);
    }
  });
});

describe('chronicle', () => {
  it('produces titled history records, headlines, notifications and intelligence', () => {
    const run = play(newGame(45), 4, (turn) =>
      turn === 1 ? [{ kind: 'meet_politician', params: { targetId: 'pol_bernadette_walsh' } }] : [],
    );
    for (const r of run.results) {
      expect(r.headlines.length).toBeGreaterThan(0);
      for (const h of r.history) {
        expect(HISTORY_TYPES).toContain(h.type);
        expect(h.title.length).toBeGreaterThan(0);
        expect(h.summary).not.toMatch(/\{\w+\}/);
        expect(h.importance).toBeGreaterThanOrEqual(1);
        expect(h.importance).toBeLessThanOrEqual(5);
      }
    }
    const all = run.results.flatMap((r) => r.history);
    expect(all.some((h) => h.type === 'division' && h.importance === 5)).toBe(true);
    expect(
      all.some(
        (h) => h.type === 'action_outcome' && h.actorIds.includes(run.state.player.politicianId),
      ),
    ).toBe(true);
    expect(run.results.flatMap((r) => r.intelligence).length).toBeGreaterThan(0);
    expect(run.results[3]!.notifications.some((n) => n.link?.kind === 'division')).toBe(true);
    // History sequence numbers are unique and increasing.
    const seqs = all.map((h) => h.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
