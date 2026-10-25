import { describe, expect, it } from 'vitest';
import { DEFAULT_TUTORIAL, mergeTutorial } from '../../api/tutorial-merge';
import {
  captureBaseline,
  detectCompletions,
  eligibleSteps,
  isRunning,
  refreshBaseline,
  selectActive,
  stepNumber,
} from './engine';
import { intersects, placeCard, type Rect } from './placement';
import { STEP_IDS, STEPS, type TutorialFacts, type TutorialStepId } from './steps';

const facts = (over: Partial<TutorialFacts> = {}): TutorialFacts => ({
  turn: 1,
  place: 'office',
  dossierOpen: false,
  modal: null,
  planned: [],
  pendingEvents: 0,
  forecastUnknown: null,
  reportDivisions: 0,
  visits: { office: 1 },
  reportsClosed: 0,
  divisionReportsClosed: 0,
  ...over,
});

/** Everything before `id` in the registry, as completed. */
const before = (id: TutorialStepId) => new Set(STEP_IDS.slice(0, STEP_IDS.indexOf(id)));
const step = (id: TutorialStepId) => STEPS.find((s) => s.id === id)!;

/** Does `id`'s detector fire for `now`, judged against a baseline taken at `then`? */
function completes(
  id: TutorialStepId,
  then: TutorialFacts,
  now: TutorialFacts,
  acked = false,
): boolean {
  return (
    detectCompletions([step(id)], now, { [id]: captureBaseline(then) }, { [id]: acked }).length > 0
  );
}

describe('induction progression', () => {
  it('has the 14 steps of the spec, in order', () => {
    expect(STEPS.map((s) => s.id)).toEqual([...STEP_IDS]);
    expect(STEPS).toHaveLength(14);
    expect(stepNumber('first-meeting')).toBe(4);
  });

  it('starts with the welcome and walks the opening steps in order', () => {
    const f = facts();
    expect(selectActive(new Set(), f)?.id).toBe('welcome');
    expect(selectActive(new Set(['welcome']), f)?.id).toBe('hud');
    expect(selectActive(new Set(['welcome', 'hud']), f)?.id).toBe('diary');
    expect(selectActive(before('first-meeting'), f)?.id).toBe('first-meeting');
  });

  it('runs only while enabled, not skipped and not graduated', () => {
    expect(isRunning(undefined)).toBe(false);
    expect(isRunning(DEFAULT_TUTORIAL)).toBe(false);
    expect(isRunning({ ...DEFAULT_TUTORIAL, enabled: true })).toBe(true);
    expect(isRunning({ ...DEFAULT_TUTORIAL, enabled: true, dismissed: true })).toBe(false);
    expect(isRunning({ ...DEFAULT_TUTORIAL, enabled: true, completed: ['graduation'] })).toBe(
      false,
    );
  });

  it('diary completes when the planner opens', () => {
    expect(completes('diary', facts(), facts())).toBe(false);
    expect(completes('diary', facts(), facts({ modal: 'planner' }))).toBe(true);
  });

  it('first-meeting completes when any meeting is planned, and shows inside the planner', () => {
    const meet = facts({ planned: [{ id: 'pa_1', kind: 'meet_politician', targetId: 'pol_x' }] });
    expect(completes('first-meeting', facts(), meet)).toBe(true);
    expect(
      completes(
        'first-meeting',
        facts(),
        facts({ planned: [{ id: 'p', kind: 'seek_endorsement' }] }),
      ),
    ).toBe(false);
    expect(selectActive(before('first-meeting'), facts({ modal: 'planner' }))?.id).toBe(
      'first-meeting',
    );
  });

  it('dispatch waits for a dispatch; later steps go ahead meanwhile', () => {
    const done = before('dispatch');
    // No dispatch yet: the dispatch step waits and END WEEK is taught instead.
    expect(eligibleSteps(done, facts()).map((s) => s.id)).not.toContain('dispatch');
    expect(selectActive(done, facts())?.id).toBe('end-week');
    // A dispatch arrives: it takes its turn (it comes first).
    expect(selectActive(done, facts({ pendingEvents: 1 }))?.id).toBe('dispatch');
    const answered = facts({ planned: [{ id: 'pa_9', kind: 'respond_to_event' }] });
    expect(completes('dispatch', facts({ pendingEvents: 1 }), answered)).toBe(true);
    expect(completes('dispatch', facts({ pendingEvents: 1 }), facts({ pendingEvents: 1 }))).toBe(
      false,
    );
  });

  it('end-week completes when the week is ended', () => {
    expect(completes('end-week', facts(), facts({ turn: 1 }))).toBe(false);
    expect(completes('end-week', facts(), facts({ turn: 2 }))).toBe(true);
  });

  it('the-papers shows only on the turn report and completes when it is continued', () => {
    const done = before('the-papers');
    expect(selectActive(done, facts({ turn: 2 }))?.id).not.toBe('the-papers');
    const open = facts({ turn: 2, modal: 'report' });
    expect(selectActive(done, open)?.id).toBe('the-papers');
    expect(completes('the-papers', open, facts({ turn: 2, reportsClosed: 1 }))).toBe(true);
    expect(completes('the-papers', open, open)).toBe(false);
  });

  it('fog completes after a visit to the Chamber, once read or left', () => {
    const then = facts({ turn: 2 });
    const there = facts({ turn: 2, place: 'chamber', visits: { office: 1, chamber: 1 } });
    expect(completes('fog', then, there)).toBe(false);
    expect(completes('fog', then, there, true)).toBe(true);
    expect(completes('fog', then, { ...there, place: 'office' })).toBe(true);
    // Already standing in the Chamber when it became eligible counts as having arrived.
    expect(completes('fog', there, there, true)).toBe(true);
  });

  it('find-out completes when an intention is revealed or a new meeting is planned', () => {
    const then = facts({
      turn: 2,
      forecastUnknown: 40,
      planned: [{ id: 'old', kind: 'meet_politician' }],
    });
    expect(completes('find-out', then, { ...then })).toBe(false);
    expect(completes('find-out', then, { ...then, forecastUnknown: 39 })).toBe(true);
    expect(
      completes('find-out', then, {
        ...then,
        planned: [...then.planned, { id: 'new', kind: 'meet_politician', targetId: 'pol_y' }],
      }),
    ).toBe(true);
    // A forecast still loading at the time is filled in when it arrives.
    const loading = captureBaseline(facts({ forecastUnknown: null }));
    expect(refreshBaseline(loading, facts({ forecastUnknown: 12 })).forecastUnknown).toBe(12);
  });

  it('relationships completes after a dossier is opened', () => {
    const then = facts({ place: 'tea-room', visits: { 'tea-room': 1 } });
    const file = facts({
      place: 'tea-room',
      dossierOpen: true,
      visits: { 'tea-room': 1, dossier: 1 },
    });
    expect(completes('relationships', then, file)).toBe(false);
    expect(completes('relationships', then, file, true)).toBe(true);
    expect(completes('relationships', then, { ...file, dossierOpen: false })).toBe(true);
  });

  it('factions completes after a visit to Party HQ', () => {
    const hq = facts({ place: 'party-hq', visits: { office: 1, 'party-hq': 1 } });
    expect(completes('factions', facts(), { ...hq, place: 'office' })).toBe(true);
    expect(completes('factions', facts(), facts())).toBe(false);
  });

  it('your-vote completes on a stance on the bill, or on reaching week 4', () => {
    const then = facts({ turn: 3 });
    expect(completes('your-vote', then, facts({ turn: 3 }))).toBe(false);
    expect(
      completes(
        'your-vote',
        then,
        facts({ turn: 3, planned: [{ id: 'x', kind: 'rebel_against_party' }] }),
      ),
    ).toBe(true);
    expect(completes('your-vote', then, facts({ turn: 4 }))).toBe(true);
  });

  it('division shows on a report with a division and completes when it is continued', () => {
    const done = before('division');
    const report = facts({ turn: 5, modal: 'report', reportDivisions: 1 });
    expect(selectActive(done, { ...report, reportDivisions: 0 })).toBeNull();
    expect(selectActive(done, report)?.id).toBe('division');
    expect(completes('division', report, { ...report, reportsClosed: 1 })).toBe(false);
    expect(
      completes('division', report, { ...report, modal: null, divisionReportsClosed: 1 }),
    ).toBe(true);
    // Then graduation, back on the desk.
    expect(selectActive(new Set([...done, 'division']), facts({ turn: 5 }))?.id).toBe('graduation');
  });

  it('prefers a step whose target is on screen', () => {
    const done = before('dispatch');
    const f = facts({ turn: 2, pendingEvents: 1, place: 'chamber' });
    const withFog = new Set([...done, 'end-week', 'the-papers']);
    expect(selectActive(withFog, f)?.id).toBe('dispatch');
    expect(selectActive(withFog, f, new Set(['forecast', 'place-office']))?.id).toBe('fog');
  });

  it('shows nothing over a modal the step does not belong to', () => {
    expect(selectActive(new Set(), facts({ modal: 'other' }))).toBeNull();
    expect(selectActive(new Set(), facts({ modal: 'report' }))).toBeNull();
  });
});

describe('induction persistence merge', () => {
  it('unions completions, last-write-wins flags, and reset re-enables', () => {
    const a = mergeTutorial(DEFAULT_TUTORIAL, { completeSteps: ['welcome', 'hud'] }, 't1');
    const b = mergeTutorial(a, { completeSteps: ['hud', 'diary'], dismissed: true }, 't2');
    expect(b).toEqual({
      enabled: false,
      completed: ['welcome', 'hud', 'diary'],
      dismissed: true,
      updatedAt: 't2',
    });
    expect(mergeTutorial(b, { reset: true }, 't3')).toEqual({
      enabled: true,
      completed: [],
      dismissed: false,
      updatedAt: 't3',
    });
  });
});

describe('card placement', () => {
  const vp = { width: 1440, height: 900 };
  const card = { width: 368, height: 220 };
  const overlaps = (
    p: { left: number; top: number },
    r: { left: number; top: number; width: number; height: number },
  ) =>
    p.left < r.left + r.width &&
    p.left + card.width > r.left &&
    p.top < r.top + r.height &&
    p.top + card.height > r.top;

  it('docks bottom-left above the prompt bar without a target', () => {
    expect(placeCard(null, card, vp)).toEqual({ left: 16, top: 900 - 72 - 12 - 220 });
  });

  it('never covers its target or the END WEEK strip', () => {
    const endWeek = { left: 1056, top: 828, width: 384, height: 72 };
    const p = placeCard(endWeek, card, vp);
    expect(overlaps(p, endWeek)).toBe(false);
    expect(p.top + card.height).toBeLessThanOrEqual(900 - 72);
    const plan = { left: 900, top: 200, width: 160, height: 44 };
    expect(overlaps(placeCard(plan, card, vp), plan)).toBe(false);
  });

  it('on phones docks bottom-left, or at the top when the target is down there', () => {
    const phone = { width: 390, height: 844 };
    const low = { left: 0, top: 600, width: 390, height: 60 };
    expect(placeCard(null, card, phone).left).toBe(16);
    expect(placeCard(low, card, phone).top).toBe(64);
  });
});

describe('card placement: never over actionable UI', () => {
  // Layouts measured from the real screens (CSS px). Avoid = elements with data-tutorial-avoid.
  const endWeek1440 = { left: 1056, top: 828, width: 384, height: 72 };
  const endWeek390 = { left: 0, top: 676, width: 390, height: 56 };
  const cases: {
    name: string;
    vp: { width: number; height: number };
    card: { width: number; height: number };
    target: Rect;
    avoid: Rect[];
  }[] = [
    {
      // Dossier: relationships sheet in the right column; MEET and BUILD RELATIONSHIP above it.
      name: 'dossier 1440',
      vp: { width: 1440, height: 900 },
      card: { width: 368, height: 236 },
      target: { left: 996, top: 530, width: 400, height: 360 },
      avoid: [
        { left: 948, top: 290, width: 130, height: 44 },
        { left: 1080, top: 290, width: 290, height: 44 },
        endWeek1440,
      ],
    },
    {
      // Party HQ: the rival camps, full width; the leader plates (links) above them.
      name: 'party hq 1440',
      vp: { width: 1440, height: 900 },
      card: { width: 368, height: 236 },
      target: { left: 32, top: 470, width: 1376, height: 420 },
      avoid: [
        { left: 32, top: 334, width: 340, height: 96 },
        { left: 380, top: 334, width: 340, height: 96 },
        endWeek1440,
      ],
    },
    {
      name: 'dossier 390',
      vp: { width: 390, height: 844 },
      card: { width: 358, height: 190 },
      target: { left: 16, top: 900, width: 358, height: 360 },
      avoid: [
        { left: 16, top: 420, width: 120, height: 44 },
        { left: 140, top: 420, width: 230, height: 44 },
        endWeek390,
      ],
    },
    {
      name: 'party hq 390',
      vp: { width: 390, height: 844 },
      card: { width: 358, height: 190 },
      target: { left: 16, top: 560, width: 358, height: 600 },
      avoid: [{ left: 16, top: 300, width: 358, height: 96 }, endWeek390],
    },
    {
      name: 'end week 1440',
      vp: { width: 1440, height: 900 },
      card: { width: 368, height: 220 },
      target: endWeek1440,
      avoid: [endWeek1440, { left: 780, top: 274, width: 190, height: 44 }],
    },
  ];

  it.each(cases)('$name: the card clears its target and every avoided element', (c) => {
    const p = placeCard(c.target, c.card, c.vp, c.avoid);
    const rect = { ...p, width: Math.min(c.card.width, c.vp.width - 32), height: c.card.height };
    expect(intersects(rect, c.target)).toBe(false);
    for (const a of c.avoid) expect(intersects(rect, a)).toBe(false);
    // On screen, under the HUD and above the footer.
    expect(rect.top).toBeGreaterThanOrEqual(64);
    expect(rect.left + rect.width).toBeLessThanOrEqual(c.vp.width - 16);
  });
});
