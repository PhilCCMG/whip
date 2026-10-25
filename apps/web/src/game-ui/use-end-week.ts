import { useCallback, useEffect, useState } from 'react';
import { useAdvance } from '../api/hooks';
import type { CareerOverview } from '../api/types';
import { uiSound } from '../features/audio/use-ui-sound';
import { useReducedMotion } from '../stores/settings-store';

/** How long the end-week transition holds at least, so the change of week reads as an event. */
export const TRANSITION_MS = 1300;

export interface EndWeekBlockers {
  freeSlots: number;
  pendingEvents: number;
}

export function blockersOf(overview: CareerOverview): EndWeekBlockers {
  return {
    freeSlots: Math.max(0, overview.diary.slotsTotal - overview.diary.slotsUsed),
    pendingEvents: overview.pendingEvents.length,
  };
}

const hasBlockers = (b: EndWeekBlockers) => b.freeSlots > 0 || b.pendingEvents > 0;

/**
 * End-week state: request → (confirm if there are free slots or unanswered dispatches) → the
 * transition (whoosh) while the week resolves → the turn report. The shell renders the pieces.
 */
export function useEndWeek(campaignId: string, overview: CareerOverview | undefined) {
  const advance = useAdvance(campaignId);
  const reduced = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [transition, setTransition] = useState<{ turn: number; started: number } | null>(null);

  const start = useCallback(() => {
    if (!overview || advance.isPending) return;
    setConfirming(false);
    uiSound.whoosh();
    setTransition({ turn: overview.campaign.turn, started: performance.now() });
    advance.mutate(undefined, {
      // A failed advance drops straight back to the office (the error shows as a toast).
      onError: () => setTransition(null),
    });
  }, [overview, advance]);

  const request = useCallback(() => {
    if (!overview || advance.isPending || transition) return;
    if (confirming) return start();
    if (hasBlockers(blockersOf(overview))) {
      uiSound.click();
      setConfirming(true);
    } else start();
  }, [overview, advance.isPending, transition, confirming, start]);

  const cancel = useCallback(() => setConfirming(false), []);

  // Hold the transition for its minimum length, then let the report through.
  // Done once this advance (not a previous one) has resolved the week we left.
  const succeeded = advance.isSuccess && advance.data.turn === transition?.turn;
  useEffect(() => {
    if (!transition || !succeeded) return;
    const left = reduced
      ? 0
      : Math.max(0, TRANSITION_MS - (performance.now() - transition.started));
    const t = setTimeout(() => setTransition(null), left);
    return () => clearTimeout(t);
  }, [transition, succeeded, reduced]);

  return {
    blockers: overview ? blockersOf(overview) : { freeSlots: 0, pendingEvents: 0 },
    confirming,
    request,
    confirm: start,
    cancel,
    pending: advance.isPending,
    transition,
  };
}
