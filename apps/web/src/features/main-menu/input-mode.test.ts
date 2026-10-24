import { describe, expect, it } from 'vitest';
import { prefersTap } from './input-mode';

const base = { coarse: false, hoverNone: false, anyFine: true, maxTouchPoints: 0 };

describe('prefersTap', () => {
  it('says press on a mouse or trackpad machine', () => {
    expect(prefersTap(base)).toBe(false);
  });

  it('says tap on a phone or tablet (coarse primary pointer)', () => {
    expect(prefersTap({ coarse: true, hoverNone: true, anyFine: false, maxTouchPoints: 5 })).toBe(
      true,
    );
  });

  it('says tap when the device cannot hover and has no fine pointer', () => {
    expect(prefersTap({ ...base, hoverNone: true, anyFine: false })).toBe(true);
  });

  it('says press on a touch laptop that also has a trackpad', () => {
    expect(prefersTap({ ...base, maxTouchPoints: 10, anyFine: true })).toBe(false);
  });

  it('falls back to touch points when media queries say nothing useful', () => {
    expect(prefersTap({ ...base, anyFine: false, maxTouchPoints: 1 })).toBe(true);
    expect(prefersTap({ ...base, anyFine: false, maxTouchPoints: 0 })).toBe(false);
  });
});
