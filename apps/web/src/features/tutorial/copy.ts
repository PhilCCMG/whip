/**
 * Every word Ken Bramley says in the Members' induction (docs/architecture/11-tutorial.md), in one
 * place for editing. Voice: docs/architecture/10-voice-and-copy.md. Dry, kind, faintly weary;
 * one to three sentences; the mechanic must be clear from the line alone.
 */
import type { TutorialStepId } from './steps';

export const MENTOR = {
  name: 'Ken Bramley MP',
  title: 'Father of the House',
  /** Portrait seed: the same procedural face he has in the Tea Room. */
  seed: 'pol_bramley',
  partyColour: '#C8322B',
} as const;

export const LINES: Record<TutorialStepId, string> = {
  welcome:
    'Ken Bramley. Father of the House, which mostly means I know where the good chairs are. I’ll show you round. Ignore me whenever you like; everyone else does.',
  hud: 'Four things up here matter. The rest is wallpaper.',
  diary:
    'Five diary slots a week, Monday to Friday. Whatever you do with your week goes in them. Open the planner: Plan action, or press P.',
  'first-meeting':
    'Every action shows its price: diary slots and political capital. A meeting is one slot and no capital. Try Daniel Osei; he came in with you and hasn’t been ruined yet.',
  dispatch:
    'A dispatch. Somebody wants something, as they always will. Pick an answer: it costs what it says, and it happens when the week does.',
  'end-week':
    'When the diary’s as full as you can bear, press END WEEK. The whole week happens at once, which is the only merciful thing about it.',
  'the-papers':
    'The papers. Read Your Week first: everything you did is stamped, whatever the leader writers make of it. Continue when you’ve had enough.',
  fog: 'The whips’ board says “unknown” because nobody tells the whips the truth. Go and ask people. Over tea, ideally.',
  'find-out':
    'A meeting tells you how a colleague means to vote. Plan one with anyone marked “?”; Find out does it in one click.',
  relationships:
    'Open anyone’s file. Trust, respect and affinity run both ways, and colleagues remember everything, chiefly what you’d rather they didn’t.',
  factions:
    'Party HQ: the camps, who leads them, and who is climbing the ladder. Join one or don’t. Both have consequences; only one comes with friends.',
  'your-vote':
    'You vote with the whip unless you plan otherwise. Speak for the bill, against it, rebel, or promise your vote to a colleague. Rebellion costs capital, and the Chief Whip’s affection costs more.',
  division:
    'The House has divided. The tally shows how each party went and who defied the whip. The whips had it written down before the doors closed.',
  graduation:
    'That’s the induction. You now know more than most Members and several ministers. The Archive keeps everything you’ve done; so, I’m afraid, does everyone else.',
};

/** The HUD tour (step `hud`): one coach mark per readout. Keyed by `data-tutorial` target. */
export const HUD_TOUR: { target: string; title: string; line: string }[] = [
  {
    target: 'hud-week',
    title: 'The week',
    line: 'The calendar. The Housing Delivery Bill’s second reading is in week 4, and the whips are counting the days.',
  },
  {
    target: 'hud-capital',
    title: 'Political capital',
    line: 'Favours, goodwill and the benefit of the doubt. You earn a little every week and spend it on anything that matters.',
  },
  {
    target: 'hud-influence',
    title: 'Influence',
    line: 'How much the building listens when you speak. At the moment, politely.',
  },
  {
    target: 'end-week',
    title: 'End week',
    line: 'Nothing you plan happens until you press this. Then all of it happens at once.',
  },
];

export const UI = {
  counter: (n: number, total: number) => `Induction ${n}/${total}`,
  gotIt: 'Got it',
  next: 'Next',
  skip: 'Skip induction',
  reopen: 'Show Bramley’s note',
  confirmTitle: 'Skip the induction?',
  confirmBody: 'Bramley goes back to his good chair. You can call him again from the menu.',
  confirmKeep: 'Keep going',
  confirmSkip: 'Skip it',
  where: (place: string, key: string) => `In the ${place} · press ${key}`,
  stamp: 'Induction complete',
  regionLabel: 'Members’ induction',
  menuLabel: 'Induction',
  menuResume: 'Bramley picks up where he left off',
  menuRestart: 'Bramley shows you round again',
  menuStart: 'Ken Bramley shows you round',
} as const;
