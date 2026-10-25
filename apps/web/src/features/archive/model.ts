import type { HistoryItem } from '../../api/types';
import { addDays } from '../../lib/format';

/** Items arrive newest first; group consecutive items by turn, keeping that order. */
export function groupByWeek(items: HistoryItem[]): { turn: number; items: HistoryItem[] }[] {
  const groups: { turn: number; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.turn === item.turn) last.items.push(item);
    else groups.push({ turn: item.turn, items: [item] });
  }
  return groups;
}

/** Monday of the week the items fall in. */
export function weekStart(items: HistoryItem[]): string {
  const first = items.map((i) => i.simDate).sort()[0] ?? '2029-09-03';
  const d = new Date(`${first}T00:00:00Z`);
  return addDays(first, -((d.getUTCDay() + 6) % 7));
}
