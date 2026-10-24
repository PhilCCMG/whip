import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageOn,
  diffDays,
  formatSimDate,
  isoWeekday,
  isSimDate,
  simDate,
  SimDateSchema,
} from './sim-date';

describe('SimDate', () => {
  it('accepts ISO dates and rejects other strings', () => {
    expect(SimDateSchema.parse('2026-05-07')).toBe('2026-05-07');
    expect(SimDateSchema.safeParse('07/05/2026').success).toBe(false);
  });

  it('isSimDate agrees with the schema', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(isSimDate(s)).toBe(SimDateSchema.safeParse(s).success);
      }),
    );
  });

  it('does calendar arithmetic without the platform Date', () => {
    const start = simDate('2029-09-03');
    expect(isoWeekday(start)).toBe(1); // Monday
    expect(addDays(start, 23)).toBe('2029-09-26');
    expect(isoWeekday(simDate('2029-09-26'))).toBe(3); // Wednesday
    expect(addDays(simDate('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(simDate('2029-12-31'), 1)).toBe('2030-01-01');
    expect(diffDays(start, simDate('2029-11-07'))).toBe(65);
    expect(formatSimDate(simDate('2029-09-26'))).toBe('Wednesday 26 September 2029');
    expect(ageOn(simDate('1991-04-12'), start)).toBe(38);
    expect(ageOn(simDate('1991-09-04'), start)).toBe(37);
  });

  it('addDays and diffDays are inverse', () => {
    fc.assert(
      fc.property(fc.integer({ min: -40000, max: 40000 }), (n) => {
        const d = addDays(simDate('2000-01-01'), n);
        expect(isSimDate(d)).toBe(true);
        expect(diffDays(simDate('2000-01-01'), d)).toBe(n);
      }),
    );
  });
});
