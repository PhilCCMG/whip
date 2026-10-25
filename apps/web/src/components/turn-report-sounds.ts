import type { TurnReport } from '../api/types';
import { stampCues, type SoundCue } from '../features/audio/cues';
import { VERDICT_STAMP_DELAY_MS } from '../game-ui/division-tally';

/** "Your week": the first outcome stamp starts landing here, the rest one step apart. */
export const OUTCOME_STAMP_DELAY_MS = 300;
export const OUTCOME_STAMP_STEP_MS = 260;
/** From an `animate-stamp` start to the moment it hits the paper (the 260ms ease overshoots). */
export const STAMP_IMPACT_MS = 110;
/** The Commons division bells (4.06s): reduced motion declares the result once they stop. */
export const BELL_MS = 4060;

/**
 * The sound of the turn report opening, in step with its reveal: the paper turns, the outcome
 * stamps land (at most three heard), the division bell rings for the week's first division and
 * the verdict lands with the heavy stamp as the tellers' stamp hits. Reduced motion has no reveal:
 * the paper, one stamp, the bell, then the verdict once the bell has finished.
 */
export function reportSoundCues(
  report: Pick<TurnReport, 'actionOutcomes' | 'divisions'>,
  reduced: boolean,
): SoundCue[] {
  const cues: SoundCue[] = [{ at: 0, sound: 'page-turn' }];
  const landings = report.actionOutcomes.map(
    (_, i) => OUTCOME_STAMP_DELAY_MS + i * OUTCOME_STAMP_STEP_MS + STAMP_IMPACT_MS,
  );
  const stamps = stampCues(landings, { reduced, reducedAt: 350 });
  for (const at of stamps) cues.push({ at, sound: 'stamp' });

  if (report.divisions.length > 0) {
    const lastStamp = stamps[stamps.length - 1] ?? 0;
    const bell = Math.max(reduced ? 600 : 450, lastStamp + 250);
    const verdict = reduced ? bell + BELL_MS : VERDICT_STAMP_DELAY_MS + STAMP_IMPACT_MS;
    cues.push({ at: bell, sound: 'division-bell' });
    cues.push({ at: Math.max(verdict, bell + 300), sound: 'stamp-heavy' });
  }
  return cues;
}
