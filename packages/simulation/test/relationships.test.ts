import { describe, expect, it } from 'vitest';
import { advanceSimulation, selectors } from '../src';
import { BILL, ctx, newGame, pid, planAll, play, SECOND_READING } from './helpers';

const WALSH = pid('pol_bernadette_walsh');

describe('relationship actions', () => {
  it('meet_politician warms the target a little and reveals their voting intention', () => {
    const s = newGame(21);
    const me = s.player.politicianId;
    const before = selectors.relationship(s, WALSH, me);
    expect(selectors.knownIntention(s, me, WALSH, SECOND_READING, ctx)).toBe('unknown');
    const r = advanceSimulation(
      planAll(s, [{ kind: 'meet_politician', params: { targetId: WALSH } }]),
      [],
      ctx,
    );
    const after = selectors.relationship(r.state, WALSH, me);
    expect(after.trust + after.affinity).toBeGreaterThan(before.trust + before.affinity);
    expect(after.memories.some((m) => m.kind === 'met')).toBe(true);
    const known = selectors.knownIntentionDetail(r.state, me, WALSH, SECOND_READING, ctx);
    expect(known.value).not.toBe('unknown');
    expect(known.source).toBe('private meeting');
    expect(r.actionOutcomes[0]?.effects.join(' ')).toContain('Bernadette Walsh');
  });

  it('build_relationship has a larger effect than a meeting', () => {
    const s = newGame(22);
    const me = s.player.politicianId;
    const target = pid('pol_ken_bramley');
    const base = selectors.relationship(s, target, me);
    const met = selectors.relationship(
      advanceSimulation(
        planAll(s, [{ kind: 'meet_politician', params: { targetId: target } }]),
        [],
        ctx,
      ).state,
      target,
      me,
    );
    const built = selectors.relationship(
      advanceSimulation(
        planAll(s, [{ kind: 'build_relationship', params: { targetId: target } }]),
        [],
        ctx,
      ).state,
      target,
      me,
    );
    const gain = (r: typeof base) => r.respect + r.affinity - base.respect - base.affinity;
    expect(gain(built)).toBeGreaterThan(gain(met));
  });
});

describe('promises', () => {
  /** Promise Walsh a No vote at second reading, then either keep it (rebel) or break it (back the bill). */
  function promiseRun(keep: boolean) {
    const promise = {
      kind: 'make_political_promise' as const,
      params: { targetId: WALSH, divisionId: SECOND_READING, vote: 'no' },
    };
    const followUp = keep
      ? { kind: 'rebel_against_party' as const, params: { divisionId: SECOND_READING, vote: 'no' } }
      : { kind: 'support_legislation' as const, params: { billId: BILL, lobbyTargetIds: [] } };
    return play(newGame(31), 5, (turn) => (turn === 1 ? [promise] : turn === 3 ? [followUp] : []));
  }

  it('a kept promise builds trust; a broken one costs 30 trust and leaves a memory', () => {
    const kept = promiseRun(true);
    const broken = promiseRun(false);
    const me = kept.state.player.politicianId;
    const keptRel = selectors.relationship(kept.state, WALSH, me);
    const brokenRel = selectors.relationship(broken.state, WALSH, me);
    expect(keptRel.trust - brokenRel.trust).toBeGreaterThanOrEqual(30);
    expect(brokenRel.memories.some((m) => m.kind === 'broke_promise')).toBe(true);
    expect(keptRel.memories.some((m) => m.kind === 'kept_promise')).toBe(true);
    const record = (run: typeof kept) =>
      run.results.flatMap((r) => r.history).find((h) => h.type === 'promise');
    expect(record(kept)).toMatchObject({ type: 'promise', payload: { kept: true } });
    expect(record(broken)).toMatchObject({ type: 'promise', payload: { kept: false } });
    expect(record(broken)?.title).toContain('broke a promise');
  });
});
