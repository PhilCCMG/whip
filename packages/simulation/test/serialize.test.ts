import { describe, expect, it } from 'vitest';
import {
  advanceSimulation,
  canonicalStringify,
  deserializeState,
  hashState,
  serializeState,
  StateLoadError,
  STATE_SCHEMA_VERSION,
} from '../src';
import { ctx, newGame, play } from './helpers';

function loadError(fn: () => unknown): StateLoadError {
  try {
    fn();
  } catch (e) {
    if (e instanceof StateLoadError) return e;
    throw e;
  }
  throw new Error('expected StateLoadError');
}

describe('serialisation', () => {
  const fresh = newGame(11);
  const later = play(fresh, 4).state;

  it('round-trips losslessly and canonically (fresh and after the division)', () => {
    for (const s of [fresh, later]) {
      const json = serializeState(s);
      const back = deserializeState(json);
      expect(back).toEqual(s);
      expect(serializeState(back)).toBe(json);
      expect(hashState(back)).toBe(hashState(s));
    }
  });

  it('canonical JSON ignores key insertion order', () => {
    expect(canonicalStringify({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
      canonicalStringify({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }),
    );
    expect(canonicalStringify({ a: undefined, b: 'x', 'we"ird': 1 })).toBe(
      '{"b":"x","we\\"ird":1}',
    );
    expect(() => canonicalStringify({ a: Number.NaN })).toThrow();
  });

  it('rejects malformed JSON, non-objects and corrupt state', () => {
    expect(loadError(() => deserializeState('{not json')).code).toBe('invalid_json');
    expect(loadError(() => deserializeState('[1,2]')).code).toBe('not_an_object');
    expect(loadError(() => deserializeState('{}')).code).toBe('invalid_state');

    const broken = JSON.parse(serializeState(fresh)) as {
      politicians: { byId: Record<string, { skills: { oratory: unknown } }> };
    };
    const first = Object.values(broken.politicians.byId)[0]!;
    first.skills.oratory = 'eloquent';
    const err = loadError(() => deserializeState(JSON.stringify(broken)));
    expect(err.code).toBe('invalid_state');
    expect(err.issues.join(' ')).toContain('oratory');

    const missing = JSON.parse(serializeState(fresh)) as Record<string, unknown>;
    delete missing.parliament;
    expect(loadError(() => deserializeState(JSON.stringify(missing))).code).toBe('invalid_state');
  });

  it('rejects states from a future schema version', () => {
    const future = JSON.parse(serializeState(fresh)) as { meta: { schemaVersion: number } };
    future.meta.schemaVersion = STATE_SCHEMA_VERSION + 1;
    expect(loadError(() => deserializeState(JSON.stringify(future))).code).toBe('future_schema');
  });

  it('rejects unknown keys loudly instead of stripping them (same-version saves)', () => {
    const top = JSON.parse(serializeState(fresh)) as Record<string, unknown>;
    top.legacyField = 1;
    const e1 = loadError(() => deserializeState(JSON.stringify(top)));
    expect(e1.code).toBe('invalid_state');
    expect(e1.issues.join(' ')).toContain('legacyField');

    const nested = JSON.parse(serializeState(later)) as {
      politicians: { byId: Record<string, Record<string, unknown>> };
      parliament: { divisions: { byId: Record<string, { result: Record<string, unknown> }> } };
    };
    Object.values(nested.politicians.byId)[0]!.nickname = 'Bertie';
    const e2 = loadError(() => deserializeState(JSON.stringify(nested)));
    expect(e2.code).toBe('invalid_state');
    expect(e2.issues.join(' ')).toContain('nickname');
  });

  it('migrates a v2 save (briefing without a newspaper) to v3, and the next advance prints one', () => {
    const v2 = JSON.parse(serializeState(later)) as {
      meta: { schemaVersion: number };
      briefing: Record<string, unknown>;
    };
    v2.meta.schemaVersion = 2;
    delete v2.briefing.newspaper;
    delete v2.briefing.recentStoryTemplates;
    const back = deserializeState(JSON.stringify(v2));
    expect(back.meta.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(back.briefing.newspaper).toBeNull();
    expect(back.briefing.recentStoryTemplates).toEqual([]);
    expect(back.briefing.headlines).toEqual(later.briefing.headlines);
    const next = advanceSimulation(back, [], ctx);
    expect(next.state.briefing.newspaper).not.toBeNull();
    expect(next.newspaper.lead.headline.length).toBeGreaterThan(0);
  });

  it('migrates a v1 save (no rebellionCount) to the current schema', () => {
    const v1 = JSON.parse(serializeState(later)) as {
      meta: { schemaVersion: number };
      politicians: { byId: Record<string, { rebellions: unknown[]; rebellionCount?: number }> };
    };
    v1.meta.schemaVersion = 1;
    for (const p of Object.values(v1.politicians.byId)) delete p.rebellionCount;
    const back = deserializeState(JSON.stringify(v1));
    expect(back.meta.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    for (const id of back.politicians.ids) {
      const p = back.politicians.byId[id]!;
      expect(p.rebellionCount).toBe(p.rebellions.length);
    }
    expect(back.politicians.ids.some((id) => back.politicians.byId[id]!.rebellionCount > 0)).toBe(
      true,
    );
  });
});
