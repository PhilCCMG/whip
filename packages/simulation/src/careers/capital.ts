import type { ContentRegistry, Politician } from '@whip/domain';

/** Political capital cap (07 §4.1). */
export const CAPITAL_CAP = 12;

/**
 * Weekly capital income (07 §4.1): +1 base, +1 per ministerial/PPS office, +1 per 3 endorsements
 * held, +1 if reputation with the whips ≥ 30. The balance never exceeds CAPITAL_CAP.
 */
export function capitalIncome(
  p: Politician,
  content: ContentRegistry,
): { total: number; breakdown: { label: string; value: number }[] } {
  const breakdown: { label: string; value: number }[] = [{ label: 'Base', value: 1 }];
  const offices = p.offices.filter(
    (o) => content.offices[o.officeKey]?.earnsCapital === true,
  ).length;
  if (offices > 0) breakdown.push({ label: 'Office', value: offices });
  const endorsements = Math.floor(p.endorsedBy.length / 3);
  if (endorsements > 0) breakdown.push({ label: 'Endorsements', value: endorsements });
  if (p.reputation.whips >= 30) breakdown.push({ label: 'Standing with the whips', value: 1 });
  const total = breakdown.reduce((s, b) => s + b.value, 0);
  return { total, breakdown };
}

/** Income actually credited this week, respecting the cap. */
export function cappedIncome(p: Politician, content: ContentRegistry): number {
  return Math.max(0, Math.min(capitalIncome(p, content).total, CAPITAL_CAP - p.politicalCapital));
}
