import type { DivisionResult } from '../api/types';

/** The Speaker's line once the tellers have reported. */
export function divisionAnnouncement(d: Pick<DivisionResult, 'ayes' | 'noes'>): {
  tellers: string;
  verdict: string;
} {
  const tellers = `The Ayes to the right: ${d.ayes}. The Noes to the left: ${d.noes}.`;
  const verdict =
    d.ayes > d.noes
      ? 'The Ayes have it, the Ayes have it. Unlock.'
      : d.noes > d.ayes
        ? 'The Noes have it, the Noes have it. Unlock.'
        : 'The numbers being equal, the Speaker votes to keep things as they were. Unlock.';
  return { tellers, verdict };
}

/** "Carried" / "Defeated": what the Clerk writes in the Journal. */
export function divisionVerdict(d: Pick<DivisionResult, 'passed'>): 'Carried' | 'Defeated' {
  return d.passed ? 'Carried' : 'Defeated';
}
