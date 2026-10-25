import { TutorialStateSchema, type TutorialState } from '@whip/contracts';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../infrastructure/platform';
import { createGzipChunkCodec } from '../infrastructure/snapshot/gzip-chunk-codec';
import { fakeRuntime } from '../testing/fake-engine';
import { InMemoryCampaignStore } from '../testing/in-memory-campaign-store';
import { createCampaignService } from './campaign-service';
import type { DoResult, InitialiseInput } from './ports';
import {
  DEFAULT_TUTORIAL_STATE,
  MAX_TUTORIAL_STEPS,
  mergeTutorial,
  parseStoredTutorial,
} from './tutorial';

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';
const on: TutorialState = { enabled: true, completed: [], dismissed: false, updatedAt: T1 };

describe('mergeTutorial', () => {
  it('unions completed steps, keeping first-completion order and ignoring repeats', () => {
    const a = mergeTutorial(on, { completeSteps: ['welcome', 'diary'] }, T2);
    const b = mergeTutorial(a, { completeSteps: ['advance', 'welcome', 'advance'] }, T2);
    expect(b.completed).toEqual(['welcome', 'diary', 'advance']);
    expect(mergeTutorial(b, { completeSteps: ['diary'] }, T2).completed).toEqual(b.completed);
    expect(b.updatedAt).toBe(T2);
  });

  it(`caps stored steps at ${MAX_TUTORIAL_STEPS}, keeping the earliest`, () => {
    let s = on;
    for (let batch = 0; batch < 3; batch++) {
      const steps = Array.from({ length: 50 }, (_, i) => `s-${batch * 50 + i}`);
      s = mergeTutorial(s, { completeSteps: steps }, T2);
    }
    expect(s.completed).toHaveLength(MAX_TUTORIAL_STEPS);
    expect(s.completed[0]).toBe('s-0');
    expect(s.completed.at(-1)).toBe('s-99');
    expect(() => TutorialStateSchema.parse(s)).not.toThrow();
  });

  it('last write wins for enabled and dismissed; other fields untouched', () => {
    const s = mergeTutorial({ ...on, completed: ['welcome'] }, { dismissed: true }, T2);
    expect(s).toEqual({ enabled: true, completed: ['welcome'], dismissed: true, updatedAt: T2 });
    expect(mergeTutorial(s, { dismissed: false, enabled: false }, T2)).toMatchObject({
      enabled: false,
      dismissed: false,
      completed: ['welcome'],
    });
  });

  it('reset clears progress and dismissed and re-enables; later fields in the body apply after', () => {
    const prev: TutorialState = {
      enabled: false,
      completed: ['a', 'b'],
      dismissed: true,
      updatedAt: T1,
    };
    expect(mergeTutorial(prev, { reset: true }, T2)).toEqual({
      enabled: true,
      completed: [],
      dismissed: false,
      updatedAt: T2,
    });
    expect(mergeTutorial(prev, { reset: true, completeSteps: ['c'] }, T2).completed).toEqual(['c']);
  });

  it('parses stored JSON defensively', () => {
    expect(parseStoredTutorial(null)).toBeNull();
    expect(parseStoredTutorial('not json')).toBeNull();
    expect(parseStoredTutorial(JSON.stringify(on))).toEqual(on);
    expect(parseStoredTutorial('{"completed":[1,"x"]}')).toEqual({
      ...DEFAULT_TUTORIAL_STATE,
      completed: ['x'],
    });
  });
});

describe('CampaignService tutorial', () => {
  const input: InitialiseInput = {
    campaignId: 'c1',
    ownerId: 'u1',
    name: 'Test',
    scenarioKey: 'first_weeks',
    seed: 42,
    player: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      gender: 'female',
      strength: 'oratory',
      ideologyPreset: 'moderniser',
    },
    createdAt: T1,
  };

  function setup() {
    const store = new InMemoryCampaignStore();
    const service = createCampaignService({
      runtime: fakeRuntime,
      store,
      codec: createGzipChunkCodec(),
      clock: { nowIso: () => T2 },
      sha256: sha256Hex,
    });
    return { store, service };
  }

  function value<T>(r: DoResult<T>): T {
    if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
    return r.value;
  }

  it('is NOT_FOUND before the campaign exists', async () => {
    const { service } = setup();
    expect(await service.getTutorial()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await service.updateTutorial({ dismissed: true })).toMatchObject({ ok: false });
  });

  it('initialise writes the initial state (default enabled); retries keep progress', async () => {
    const { service } = setup();
    value(await service.initialise({ ...input, tutorial: true }));
    expect(value(await service.getTutorial())).toEqual({ ...on, updatedAt: T1 });
    value(await service.updateTutorial({ completeSteps: ['welcome'] }));
    value(await service.initialise({ ...input, tutorial: true }));
    expect(value(await service.getTutorial()).completed).toEqual(['welcome']);
  });

  it('tutorial:false starts disabled; a save without stored state reads as the default', async () => {
    const { service, store } = setup();
    value(await service.initialise({ ...input, tutorial: false }));
    expect(value(await service.getTutorial()).enabled).toBe(false);
    store.setTutorialJson('garbage');
    expect(value(await service.getTutorial())).toEqual(DEFAULT_TUTORIAL_STATE);
  });

  it('updates never bump the revision; concurrent updates all merge', async () => {
    const { service, store } = setup();
    value(await service.initialise(input));
    const results = await Promise.all([
      service.updateTutorial({ completeSteps: ['a'] }),
      service.updateTutorial({ completeSteps: ['b'] }),
      service.updateTutorial({ completeSteps: ['c'] }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(value(await service.getTutorial()).completed).toEqual(['a', 'b', 'c']);
    expect(store.currentRevision()).toBe(1);
  });
});
