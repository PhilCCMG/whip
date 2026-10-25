/**
 * The in-game screens, named for places in Westminster. Number keys 1–5 jump between them.
 * `path` is relative to the campaign (`/c/:id/<path>`).
 */
export interface Place {
  key: 'office' | 'chamber' | 'tea-room' | 'party-hq' | 'archive';
  label: string;
  /** Short form for the mobile tab bar. */
  short: string;
  /** What the place is for, in plain words (tab tooltip and screen kicker). */
  blurb: string;
  path: string;
  hotkey: string;
}

export const PLACES: readonly Place[] = [
  {
    key: 'office',
    label: 'Office',
    short: 'Office',
    blurb: 'Your diary, your desk, your prospects',
    path: '',
    hotkey: '1',
  },
  {
    key: 'chamber',
    label: 'Chamber',
    short: 'Chamber',
    blurb: 'Where bills go to be amended beyond recognition',
    path: 'parliament',
    hotkey: '2',
  },
  {
    key: 'tea-room',
    label: 'Tea Room',
    short: 'Tea Room',
    blurb: '650 colleagues, several of them friends',
    path: 'politicians',
    hotkey: '3',
  },
  {
    key: 'party-hq',
    label: 'Party HQ',
    short: 'Party',
    blurb: 'Your party, its factions and its grudges',
    path: 'party',
    hotkey: '4',
  },
  {
    key: 'archive',
    label: 'Archive',
    short: 'Archive',
    blurb: 'Everything that happened, on the record',
    path: 'history',
    hotkey: '5',
  },
];

/** The place a campaign sub-path belongs to (`politicians/pol_x` is the Tea Room). */
export function placeFor(subPath: string): Place {
  const first = subPath.split('/')[0] ?? '';
  return PLACES.find((p) => p.path === first) ?? PLACES[0]!;
}
