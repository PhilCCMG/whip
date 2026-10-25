import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TutorialState } from '@whip/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../api/client';
import { createMockBackend, type MockBackend } from '../../mocks/backend';
import { CAMPAIGN_ID } from '../../mocks/fixtures';
import { useSettingsStore } from '../../stores/settings-store';
import { renderApp } from '../../test/render-app';
import { uiSound } from '../audio/use-ui-sound';
import { LINES } from './copy';
import { useTutorialSession } from './store';

beforeEach(() => {
  vi.spyOn(uiSound, 'click').mockReturnValue(true);
  vi.spyOn(uiSound, 'whoosh').mockReturnValue(true);
  useSettingsStore.setState({ motion: 'reduced' });
  useTutorialSession.setState({ campaignId: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  useSettingsStore.setState({ motion: 'system' });
});

const json = (res: Response) => res.json() as Promise<unknown>;

async function newCareer(backend: MockBackend, tutorial?: boolean): Promise<string> {
  const res = await backend.fetch('/api/v1/campaigns', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Induction test',
      scenarioKey: 'first_weeks',
      ...(tutorial === undefined ? {} : { tutorial }),
      player: {
        firstName: 'Rachel',
        lastName: 'Danby',
        gender: 'female',
        strength: 'negotiation',
        ideologyPreset: 'moderniser',
      },
    }),
  });
  return ((await json(res)) as { id: string }).id;
}

const tutorialState = async (backend: MockBackend, id: string) =>
  (await json(await backend.fetch(`/api/v1/campaigns/${id}/tutorial`))) as TutorialState;

/** The induction card for a step, by its data attributes. */
async function card(step: string) {
  await waitFor(() =>
    expect(document.querySelector(`aside[data-step="${step}"]`)).toBeInTheDocument(),
  );
  return document.querySelector<HTMLElement>(`aside[data-step="${step}"]`)!;
}

const targetOf = (el: HTMLElement) => el.getAttribute('data-target');

async function start(tutorial?: boolean) {
  const backend = createMockBackend({ latencyMs: 0 });
  const id = await newCareer(backend, tutorial);
  const app = renderApp(`/c/${id}`, undefined, backend);
  await screen.findByRole('heading', { name: 'Office', level: 1 });
  return { ...app, id, backend };
}

describe('mock backend: tutorial endpoints', () => {
  it('defaults new careers to the induction, merges PUTs, and never touches the revision', async () => {
    const backend = createMockBackend();
    const on = await newCareer(backend);
    const off = await newCareer(backend, false);
    expect((await tutorialState(backend, on)).enabled).toBe(true);
    expect((await tutorialState(backend, off)).enabled).toBe(false);
    // A seeded career with nothing stored reads as the default.
    expect(await tutorialState(backend, CAMPAIGN_ID)).toMatchObject({
      enabled: false,
      completed: [],
      updatedAt: null,
    });

    const put = (body: unknown) =>
      backend
        .fetch(`/api/v1/campaigns/${on}/tutorial`, { method: 'PUT', body: JSON.stringify(body) })
        .then(json);
    await put({ completeSteps: ['welcome', 'hud'] });
    const twice = (await put({ completeSteps: ['hud', 'diary'] })) as TutorialState;
    expect(twice.completed).toEqual(['welcome', 'hud', 'diary']);
    expect(((await put({ reset: true })) as TutorialState).completed).toEqual([]);
    const bad = await backend.fetch(`/api/v1/campaigns/${on}/tutorial`, {
      method: 'PUT',
      body: JSON.stringify({ completeSteps: ['Not A Step!'] }),
    });
    expect(bad.status).toBe(400);
    const summary = (await json(await backend.fetch(`/api/v1/campaigns/${on}`))) as {
      revision: number;
    };
    expect(summary.revision).toBe(1);
  });
});

describe('Members’ induction (mock mode)', () => {
  it('walks steps 1–6 on their real targets, and the dispatch step waits for a dispatch', async () => {
    const user = userEvent.setup();
    const { id, backend } = await start();

    // 1. Welcome: Bramley's card, the only "OK" step.
    const welcome = await card('welcome');
    expect(welcome).toHaveTextContent('Ken Bramley MP');
    expect(welcome).toHaveTextContent('Father of the House');
    expect(welcome).toHaveTextContent('Induction 1/14');
    expect(welcome).toHaveTextContent(LINES.welcome);
    await user.click(within(welcome).getByRole('button', { name: 'Got it' }));

    // 2. The HUD tour: coach marks over week, capital, influence and END WEEK.
    const hud = await card('hud');
    await waitFor(() => expect(targetOf(hud)).toBe('hud-week'));
    expect(document.querySelector('[data-tutorial-coach]')).toBeInTheDocument();
    for (const next of ['hud-capital', 'hud-influence', 'end-week']) {
      await user.click(within(hud).getByRole('button', { name: /^Next/ }));
      await waitFor(() => expect(targetOf(hud)).toBe(next));
    }
    await user.click(within(hud).getByRole('button', { name: /^Got it/ }));

    // 3. Diary: points at Plan action; opening the planner completes it.
    const diary = await card('diary');
    await waitFor(() => expect(targetOf(diary)).toBe('plan-action'));
    expect(document.querySelector('[data-tutorial-coach]')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Plan action' }));

    // 4. First meeting: the card docks inside the planner, on the Meet card.
    const planner = await screen.findByRole('dialog');
    const meeting = await card('first-meeting');
    expect(planner).toContainElement(meeting);
    await waitFor(() => expect(targetOf(meeting)).toBe('action-meet_politician'));
    await user.click(await within(planner).findByRole('button', { name: /^Meet a colleague/ }));
    await user.type(within(planner).getByLabelText(/colleague|politician|who/i), 'Osei');
    await user.click(await within(planner).findByRole('button', { name: /Daniel Osei/ }));
    await user.click(within(planner).getByRole('button', { name: 'Add to diary' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // 5 waits (no dispatch in week 1), so 6: END WEEK is next.
    const endWeek = await card('end-week');
    await waitFor(() => expect(targetOf(endWeek)).toBe('end-week'));
    expect(document.querySelector('aside[data-step="dispatch"]')).not.toBeInTheDocument();
    await waitFor(async () =>
      expect((await tutorialState(backend, id)).completed).toEqual([
        'welcome',
        'hud',
        'diary',
        'first-meeting',
      ]),
    );

    await user.click(screen.getByRole('button', { name: 'End week' }));
    await user.click(await screen.findByRole('button', { name: /End week anyway/ }));

    // 7. The papers: inside the turn report, on Your week; Continue completes it.
    const report = await screen.findByRole('dialog', { name: /The week in Westminster/ });
    const papers = await card('the-papers');
    expect(report).toContainElement(papers);
    await waitFor(() => expect(targetOf(papers)).toBe('your-week'));
    await user.click(within(report).getByRole('button', { name: /Continue to week 2/ }));

    // Week 2 brings a dispatch: the waiting step takes its turn, on the letter.
    const dispatch = await card('dispatch');
    expect(dispatch).toHaveTextContent('Induction 5/14');
    await waitFor(() => expect(targetOf(dispatch)).toBe('dispatch'));
    await waitFor(async () =>
      expect((await tutorialState(backend, id)).completed).toEqual(
        expect.arrayContaining(['end-week', 'the-papers']),
      ),
    );
  });

  it('Esc puts the card away (not the induction) and the chip brings it back', async () => {
    const user = userEvent.setup();
    await start();
    await card('welcome');
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(document.querySelector('aside[data-step="welcome"]')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog', { name: 'Paused' })).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Show Bramley’s note \(Induction 1\/14\)/ }),
    );
    await card('welcome');
    // With the card away, Esc pauses as usual.
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('dialog', { name: 'Paused' })).toBeInTheDocument();
  });

  it('turns the page once per new step, not when the card is re-opened', async () => {
    const pageTurn = vi.spyOn(uiSound, 'pageTurn').mockReturnValue(true);
    const user = userEvent.setup();
    await start();
    const welcome = await card('welcome');
    await waitFor(() => expect(pageTurn).toHaveBeenCalledTimes(1));

    // Put away and brought back, then a resize: the same step, no new page.
    await user.keyboard('{Escape}');
    await user.click(
      screen.getByRole('button', { name: /Show Bramley’s note \(Induction 1\/14\)/ }),
    );
    await card('welcome');
    window.dispatchEvent(new Event('resize'));
    expect(pageTurn).toHaveBeenCalledTimes(1);

    // The next step is a new page.
    await user.click(within(await card('welcome')).getByRole('button', { name: 'Got it' }));
    await card('hud');
    await waitFor(() => expect(pageTurn).toHaveBeenCalledTimes(2));
    expect(welcome).not.toBeInTheDocument();
  });

  it('asks before skipping, inside the card, then dismisses on the server', async () => {
    const user = userEvent.setup();
    const { id, backend } = await start();
    const welcome = await card('welcome');
    await user.click(within(welcome).getByRole('button', { name: 'Skip induction' }));
    const confirm = within(welcome).getByRole('group', { name: 'Skip the induction?' });
    // Keep going has focus, so a stray Enter does not skip.
    expect(within(confirm).getByRole('button', { name: 'Keep going' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(within(welcome).queryByRole('group')).not.toBeInTheDocument();
    expect(await tutorialState(backend, id)).toMatchObject({ dismissed: false });

    await user.click(within(welcome).getByRole('button', { name: 'Skip induction' }));
    await user.click(within(welcome).getByRole('button', { name: 'Skip it' }));
    await waitFor(() => expect(document.querySelector('[data-tutorial-card]')).toBeNull());
    await waitFor(async () =>
      expect(await tutorialState(backend, id)).toMatchObject({ dismissed: true }),
    );
  });

  it('resumes a skipped induction and restarts a finished one from the pause menu', async () => {
    const user = userEvent.setup();
    const backend = createMockBackend({ latencyMs: 0 });
    const id = await newCareer(backend);
    const put = (body: unknown) =>
      backend.fetch(`/api/v1/campaigns/${id}/tutorial`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    await put({ completeSteps: ['welcome'], dismissed: true });
    renderApp(`/c/${id}`, undefined, backend);
    await screen.findByRole('heading', { name: 'Office', level: 1 });
    expect(document.querySelector('[data-tutorial-card]')).toBeNull();

    await user.keyboard('{Escape}');
    const pause = await screen.findByRole('dialog', { name: 'Paused' });
    await user.click(within(pause).getByRole('menuitem', { name: /^Induction.*left off/ }));
    // Picks up where it stopped: the HUD tour, step 2.
    expect(await card('hud')).toHaveTextContent('Induction 2/14');
    expect(await tutorialState(backend, id)).toMatchObject({ dismissed: false });

    // Graduate on the server, then restart from the menu: back to the welcome.
    await put({ completeSteps: ['graduation'] });
    await user.keyboard('{Escape}'); // card away
    await user.keyboard('{Escape}'); // pause
    const again = await screen.findByRole('dialog', { name: 'Paused' });
    await user.click(within(again).getByRole('menuitem', { name: /^Induction.*again/ }));
    expect(await card('welcome')).toHaveTextContent('Induction 1/14');
    await waitFor(async () =>
      expect(await tutorialState(backend, id)).toMatchObject({ completed: [], enabled: true }),
    );
  });

  it('stays out of the way for careers without the induction', async () => {
    await start(false);
    await new Promise((r) => setTimeout(r, 300));
    expect(document.querySelector('[data-tutorial-card]')).toBeNull();
  });

  it('treats a 404 from the tutorial route (API not deployed yet) as disabled', async () => {
    const backend = createMockBackend({ latencyMs: 0 });
    const id = await newCareer(backend);
    const fetch404: FetchLike = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/tutorial'))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: 'r' },
            }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          ),
        );
      return backend.fetch(input, init);
    };
    renderApp(`/c/${id}`, undefined, { ...backend, fetch: fetch404 });
    await screen.findByRole('heading', { name: 'Office', level: 1 });
    await new Promise((r) => setTimeout(r, 300));
    expect(document.querySelector('[data-tutorial-card]')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
