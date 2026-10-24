const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse a SimDate ("2029-09-17") as a UTC calendar date. */
export function parseSimDate(simDate: string): Date {
  const [y, m, d] = simDate.split('-').map(Number);
  return new Date(Date.UTC(y ?? 2029, (m ?? 1) - 1, d ?? 1));
}

export function toSimDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(simDate: string, days: number): string {
  const d = parseSimDate(simDate);
  d.setUTCDate(d.getUTCDate() + days);
  return toSimDate(d);
}

/** "Mon 17 Sep 2029" */
export function formatSimDate(simDate: string, opts: { year?: boolean } = {}): string {
  const d = parseSimDate(simDate);
  const base = `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
  return opts.year === false ? base : `${base} ${d.getUTCFullYear()}`;
}

/** "17 Sep" */
export function formatShortDate(simDate: string): string {
  const d = parseSimDate(simDate);
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

export function weekdayName(simDate: string): string {
  return DAY[parseSimDate(simDate).getUTCDay()] ?? '';
}

/** "Week 3 · Mon 17 Sep 2029" */
export function formatTurn(turn: number, simDate: string): string {
  return `Week ${turn} · ${formatSimDate(simDate)}`;
}

/** "+6", "−3", "0" (true minus sign for tabular alignment). */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2029-09-17T…" → "17 Sep 2029" for wall-clock timestamps (createdAt / updatedAt). */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const SKILL_LABELS: Record<string, string> = {
  oratory: 'Oratory',
  negotiation: 'Negotiation',
  administration: 'Administration',
  intrigue: 'Intrigue',
  media: 'Media',
  policy: 'Policy',
};

export const REPUTATION_LABELS: Record<string, string> = {
  public: 'Public',
  party_members: 'Party members',
  colleagues: 'Colleagues',
  media: 'Media',
  whips: 'Whips',
};

export function humanise(key: string): string {
  const s = key.replace(/^[a-z]+\./, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Numbering for sections that may or may not render: `const next = sequence(); next() // 1`. */
export function sequence(start = 0): () => number {
  let n = start;
  return () => ++n;
}
