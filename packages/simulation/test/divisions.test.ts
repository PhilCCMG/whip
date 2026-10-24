import {
  relationshipKey,
  type ActionRequest,
  type GameState,
  type PoliticianId,
} from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { advanceSimulation, forecastDivision, selectors } from '../src';
import { BILL, ctx, newGame, play, SECOND_READING } from './helpers';

function secondReading(s: GameState) {
  const d = s.parliament.divisions.byId[SECOND_READING]!;
  if (!d.result) throw new Error('second reading not held');
  return d.result;
}

/** Make the given MPs the player's close allies (as if cultivated earlier). */
function withAllies(s: GameState, ids: PoliticianId[]): GameState {
  const me = s.player.politicianId;
  const edges = { ...s.relationships.edges };
  for (const id of ids) {
    const base = selectors.relationship(s, id, me);
    edges[relationshipKey(id, me)] = {
      ...base,
      trust: 60,
      respect: 40,
      affinity: 45,
      memories: [],
    };
  }
  return { ...s, relationships: { edges } };
}

describe('division resolution', () => {
  const seed = 9;
  const start = newGame(seed);
  const run = play(start, 4);
  const result = secondReading(run.state);

  it('resolves MP by MP: counts sum to eligible voters and the Speaker does not vote', () => {
    expect(result.ayes + result.noes + result.abstentions).toBe(result.eligible);
    expect(result.eligible).toBe(649);
    expect(Object.keys(result.votes)).toHaveLength(649);
    expect(result.votes[run.state.parliament.speakerId!]).toBeUndefined();
    expect(result.passed).toBe(result.ayes > result.noes);
    // The player follows the three-line whip by default.
    expect(result.votes[run.state.player.politicianId]).toBe('aye');
    const report = run.results[3]!.divisions[0]!;
    expect(report.byParty.reduce((n, p) => n + p.ayes + p.noes + p.abstentions, 0)).toBe(649);
    expect(report.rebels.length).toBe(result.rebels.length);
    expect(report.rebels.every((r) => r.reason.length > 0)).toBe(true);
  });

  it('rebels are punished by the Chief Whip (trust −15/−25 with a memory)', () => {
    const before = run.results[2]!.state;
    const after = run.state;
    const cw = after.government.appointments['office.chief_whip' as never]!;
    const nppRebels = result.rebels.filter(
      (r) => after.politicians.byId[r.politicianId]?.partyId === 'party.npp',
    );
    expect(nppRebels.length).toBeGreaterThan(5);
    for (const r of nppRebels) {
      if (r.politicianId === cw) continue;
      const pre = selectors.relationship(before, cw, r.politicianId).trust;
      const post = selectors.relationship(after, cw, r.politicianId);
      expect(post.trust).toBeLessThanOrEqual(Math.max(-100, pre - 24));
      expect(post.memories.some((m) => m.kind === 'rebelled' && m.refId === SECOND_READING)).toBe(
        true,
      );
      expect(
        after.politicians.byId[r.politicianId]!.rebellions.some(
          (x) => x.divisionId === SECOND_READING,
        ),
      ).toBe(true);
    }
  });

  it('heavy player + ally lobbying measurably shifts votes compared with a control run (same seed)', () => {
    const waverers = forecastDivision(
      start,
      start.parliament.divisions.byId[SECOND_READING]!,
      ctx.content,
    ).waverers.slice(0, 12);
    const allied = withAllies(start, waverers);
    const lobby = (turn: number): ActionRequest[] => {
      const targets = waverers.slice(((turn - 1) * 3) % 12, (((turn - 1) * 3) % 12) + 3);
      const reqs: ActionRequest[] = [
        { kind: 'oppose_legislation', params: { billId: BILL, lobbyTargetIds: targets } },
      ];
      if (turn === 3)
        reqs.push({
          kind: 'rebel_against_party',
          params: { divisionId: SECOND_READING, vote: 'no' },
        });
      return reqs;
    };
    // Give the player enough capital for a campaign.
    const rich = (s: GameState): GameState => ({
      ...s,
      politicians: {
        ...s.politicians,
        byId: {
          ...s.politicians.byId,
          [s.player.politicianId]: { ...selectors.player(s), politicalCapital: 10 },
        },
      },
    });
    const control = secondReading(play(rich(allied), 4).state);
    const treated = secondReading(play(rich(allied), 4, lobby).state);
    const me = start.player.politicianId;
    const rebelsExcludingPlayer = (r: typeof control) =>
      r.rebels.filter(
        (x) =>
          x.politicianId !== me && start.politicians.byId[x.politicianId]?.partyId === 'party.npp',
      ).length;
    expect(treated.votes[me]).toBe('no');
    expect(control.votes[me]).toBe('aye');
    expect(rebelsExcludingPlayer(treated)).toBeGreaterThan(rebelsExcludingPlayer(control));
    // The margin moves by more than the player's own switch (2).
    expect(control.margin - treated.margin).toBeGreaterThan(2);
    const flipped = waverers.filter((id) => control.votes[id] !== treated.votes[id]);
    expect(flipped.length).toBeGreaterThan(0);
  });

  it('different seeds give different margins and rebel lists', () => {
    const other = secondReading(play(newGame(seed + 1), 4).state);
    expect(other.margin === result.margin && other.rebels.length === result.rebels.length).toBe(
      false,
    );
  });

  it('later divisions still resolve (third reading, turn 10) if the bill survives', () => {
    const long = play(start, 10);
    const third = long.state.parliament.divisions.byId['div.hdb_third_reading' as never]!;
    const bill = long.state.parliament.bills.byId[BILL as never]!;
    if (secondReading(long.state).passed) {
      expect(third.status).toBe('held');
      expect(['passed', 'defeated']).toContain(bill.stage);
    } else {
      expect(bill.stage).toBe('defeated');
      expect(third.status).toBe('cancelled');
    }
    expect(advanceSimulation(long.state, [], ctx).state.meta.turn).toBe(12);
  });
});
