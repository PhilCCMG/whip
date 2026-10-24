import type { GameState } from '@whip/domain';

/**
 * Digits in generated id counters. Zero-padded so that plain code-unit string order (what
 * `Array.prototype.sort()` and `compareStrings` use) equals numeric order up to 10^8 ids per
 * prefix: decades of weekly turns stay correctly ordered (`sch_00010000` > `sch_00009999`).
 */
export const ID_COUNTER_DIGITS = 8;

/** `${prefix}_${counter}` with the counter zero-padded to ID_COUNTER_DIGITS. */
export function formatId<T extends string>(prefix: string, n: number): T {
  return `${prefix}_${String(n).padStart(ID_COUNTER_DIGITS, '0')}` as T;
}

/**
 * Deterministic id factory: `${prefix}_${counter}` with the counter stored in
 * `state.meta.idCounters`. Mutates the (draft) state's counter, so call it only on a working copy.
 */
export function nextId<T extends string>(state: GameState, prefix: string): T {
  const n = (state.meta.idCounters[prefix] ?? 0) + 1;
  state.meta.idCounters[prefix] = n;
  return formatId<T>(prefix, n);
}
