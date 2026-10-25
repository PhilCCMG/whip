import type { ActionKind, PlannedAction } from '../../api/types';

/** Short names for action kinds (card kickers in the diary, planner and turn report). */
export const KIND_LABEL: Record<ActionKind, string> = {
  meet_politician: 'Meeting',
  build_relationship: 'Relationship',
  seek_endorsement: 'Endorsement',
  make_political_promise: 'Promise',
  support_legislation: 'Backing a bill',
  oppose_legislation: 'Opposing a bill',
  rebel_against_party: 'Rebellion',
  request_promotion: 'Ambition',
  respond_to_event: 'Response',
  call_reshuffle: 'Reshuffle',
};

/** The politician an action targets, if its params name one (for the card's portrait). */
export function targetOf(action: Pick<PlannedAction, 'params'>): string | null {
  const t = action.params.targetId ?? action.params.politicianId;
  return typeof t === 'string' ? t : null;
}

interface Cell {
  action: PlannedAction | null;
  start: number;
  span: number;
}

/** Lay planned actions into consecutive day slots; the rest are free pages. */
export function layoutDiary(slotsTotal: number, planned: PlannedAction[]): Cell[] {
  const cells: Cell[] = [];
  let cursor = 0;
  for (const a of planned) {
    if (a.slots <= 0) continue;
    const span = Math.min(a.slots, Math.max(slotsTotal - cursor, 1));
    cells.push({ action: a, start: cursor, span });
    cursor += span;
  }
  for (; cursor < slotsTotal; cursor++) cells.push({ action: null, start: cursor, span: 1 });
  return cells;
}
