import { describe, expect, it } from 'vitest';
import { advanceSimulation, selectors } from '../src';
import { BILL, ctx, newGame, pid, planAll, SECOND_READING } from './helpers';

describe('selectors', () => {
  const s = newGame(61);
  const me = s.player.politicianId;

  it('divisionForecast uses only the viewer’s knowledge (fog of war)', () => {
    const f = selectors.divisionForecast(s, SECOND_READING, me, ctx);
    // At the start the player knows only their own intention.
    expect(f.ayes + f.noes + f.abstain).toBe(1);
    expect(f.unknown).toBe(648);
    expect(f.viewerIntendedVote).toBe('aye');
    // Unknowns are projected onto party whips.
    expect(f.expectedIfLoyal.ayes + f.expectedIfLoyal.noes + f.expectedIfLoyal.abstain).toBe(649);
    const npp = f.byParty.find((p) => p.partyId === 'party.npp')!;
    expect(npp.whip).toEqual({ line: 'three_line', direction: 'aye' });

    // Meeting someone reveals their intention and it shows up in the forecast.
    const after = advanceSimulation(
      planAll(s, [{ kind: 'meet_politician', params: { targetId: 'pol_bernadette_walsh' } }]),
      [],
      ctx,
    ).state;
    const f2 = selectors.divisionForecast(after, SECOND_READING, me, ctx);
    expect(f2.unknown).toBeLessThan(648);
    expect(
      selectors.knownIntention(after, me, pid('pol_bernadette_walsh'), SECOND_READING, ctx),
    ).not.toBe('unknown');
    // Another viewer's knowledge is not the player's.
    expect(
      selectors.knownIntention(after, pid('pol_tom_fairley'), pid('pol_0001'), SECOND_READING, ctx),
    ).toBe('unknown');
  });

  it('public statements are visible to everyone', () => {
    const after = advanceSimulation(
      planAll(s, [{ kind: 'support_legislation', params: { billId: BILL, lobbyTargetIds: [] } }]),
      [],
      ctx,
    ).state;
    expect(selectors.knownIntention(after, pid('pol_tom_fairley'), me, SECOND_READING, ctx)).toBe(
      'aye',
    );
  });

  it('influence has an explainable breakdown that sums to the total', () => {
    for (const id of [me, s.government.primeMinisterId, pid('pol_ken_bramley')]) {
      const inf = selectors.influence(s, id, ctx);
      expect(inf.breakdown.reduce((n, b) => n + b.value, 0)).toBe(inf.total);
    }
    expect(selectors.influence(s, s.government.primeMinisterId, ctx).total).toBeGreaterThan(
      selectors.influence(s, me, ctx).total,
    );
    const all = selectors.influenceAll(s, ctx);
    expect(all.get(me)).toEqual(selectors.influence(s, me, ctx));
  });

  it('relationship returns stored edges or the derived default', () => {
    const stored = Object.values(s.relationships.edges)[0]!;
    expect(selectors.relationship(s, stored.from, stored.to)).toBe(stored);
    const def = selectors.relationship(s, pid('pol_0001'), pid('pol_0600'));
    expect(def.memories).toEqual([]);
    expect(def.from).toBe('pol_0001');
  });

  it('exposes projection helpers', () => {
    expect(selectors.player(s).isPlayer).toBe(true);
    expect(selectors.majority(s, me)).toBe(1840);
    expect(selectors.capitalIncome(s, me, ctx).total).toBe(1);
    expect(selectors.upcoming(s)[0]).toMatchObject({
      kind: 'division',
      refId: SECOND_READING,
      date: '2029-09-26',
    });
    expect(selectors.officeLabels(s, s.government.primeMinisterId, ctx)).toEqual([
      'Prime Minister',
    ]);
    expect(selectors.age(s, me)).toBe(38);
    expect(selectors.pendingEvents(s, me, ctx)).toEqual([]);
  });
});
