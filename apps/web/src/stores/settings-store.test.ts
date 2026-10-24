import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'whip.settings';

async function freshStore() {
  vi.resetModules();
  const mod = await import('./settings-store');
  return mod.useSettingsStore;
}

beforeEach(() => localStorage.clear());

describe('settings store', () => {
  it('defaults the effects volume to half', async () => {
    const store = await freshStore();
    expect(store.getState().effectsVolume).toBe(0.5);
  });

  it('persists the effects volume and reads it back', async () => {
    let store = await freshStore();
    store.getState().set('effectsVolume', 0.3);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toMatchObject({
      effectsVolume: 0.3,
      musicVolume: 0.6,
      sound: true,
    });
    store = await freshStore();
    expect(store.getState().effectsVolume).toBe(0.3);
  });

  it('clamps or ignores bad stored volumes', async () => {
    localStorage.setItem(KEY, JSON.stringify({ effectsVolume: 4, musicVolume: 'loud' }));
    const store = await freshStore();
    expect(store.getState().effectsVolume).toBe(1);
    expect(store.getState().musicVolume).toBe(0.6);
  });
});
