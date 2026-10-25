import { describe, expect, it } from 'vitest';
import { portraitFeatures } from './portrait';

describe('portraitFeatures', () => {
  it('is deterministic per seed', () => {
    expect(portraitFeatures('pol_walsh')).toEqual(portraitFeatures('pol_walsh'));
  });

  it('varies across seeds', () => {
    const looks = new Set(
      Array.from({ length: 60 }, (_, i) => JSON.stringify(portraitFeatures(`pol_${i}`))),
    );
    expect(looks.size).toBe(60);
    const hair = new Set(Array.from({ length: 60 }, (_, i) => portraitFeatures(`pol_${i}`).hair));
    expect(hair.size).toBeGreaterThanOrEqual(6);
  });

  it('may wear the party colour as a tie', () => {
    const ties = Array.from({ length: 80 }, (_, i) => portraitFeatures(`p${i}`, '#123456').tie);
    expect(ties).toContain('#123456');
  });
});
