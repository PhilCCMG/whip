import { z } from 'zod';
import type { Brand } from './brand';

/**
 * In-game calendar date as an ISO `YYYY-MM-DD` string. The simulation never reads wall-clock time;
 * this is the only notion of "now" inside the engine.
 *
 * Arithmetic is pure integer maths on the proleptic Gregorian calendar (Howard Hinnant's
 * days-from-civil algorithm), so it never touches the platform `Date` object.
 */
export type SimDate = Brand<string, 'SimDate'>;

const SIM_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const SimDateSchema = z
  .string()
  .regex(SIM_DATE_PATTERN, 'Expected an ISO date (YYYY-MM-DD)')
  .transform((s) => s as SimDate);

/** Zod schema for a SimDate that is already typed (no transform; used inside state schemas). */
export const SimDateValueSchema = z.custom<SimDate>(
  (v) => typeof v === 'string' && SIM_DATE_PATTERN.test(v),
  'Expected an ISO date (YYYY-MM-DD)',
);

export function isSimDate(value: unknown): value is SimDate {
  return typeof value === 'string' && SIM_DATE_PATTERN.test(value);
}

/** Validates and brands a literal date. Throws on malformed input. */
export function simDate(value: string): SimDate {
  if (!isSimDate(value)) throw new Error(`Invalid SimDate: ${value}`);
  return value;
}

/** Days since 1970-01-01 for a civil date. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link daysFromCivil}. */
export function civilFromDays(z0: number): { y: number; m: number; d: number } {
  const z1 = z0 + 719468;
  const era = Math.floor(z1 / 146097);
  const doe = z1 - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

function parts(date: SimDate): { y: number; m: number; d: number } {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function toDayNumber(date: SimDate): number {
  const { y, m, d } = parts(date);
  return daysFromCivil(y, m, d);
}

export function fromDayNumber(days: number): SimDate {
  const { y, m, d } = civilFromDays(days);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}` as SimDate;
}

export function addDays(date: SimDate, days: number): SimDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: SimDate, b: SimDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: SimDate): number {
  // 1970-01-01 was a Thursday (ISO 4).
  const n = toDayNumber(date);
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Wednesday 26 September 2029". */
export function formatSimDate(date: SimDate): string {
  const { y, m, d } = parts(date);
  return `${WEEKDAYS[isoWeekday(date) - 1] ?? ''} ${d} ${MONTHS[m - 1] ?? ''} ${y}`;
}

/** Age in whole years on `on` for someone born on `born`. */
export function ageOn(born: SimDate, on: SimDate): number {
  const b = parts(born);
  const o = parts(on);
  let age = o.y - b.y;
  if (o.m < b.m || (o.m === b.m && o.d < b.d)) age -= 1;
  return age;
}
