import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { careerMusic, menuMusic } from '../features/audio/use-menu-music';
import { uiSound } from '../features/audio/use-ui-sound';
import { CAMPAIGN_ID } from '../mocks/fixtures';
import { useSettingsStore } from '../stores/settings-store';
import { renderApp } from '../test/render-app';

let click: MockInstance<() => boolean>;
let whoosh: MockInstance<() => boolean>;
let stampHeavy: MockInstance<() => boolean>;

beforeEach(() => {
  click = vi.spyOn(uiSound, 'click').mockReturnValue(true);
  whoosh = vi.spyOn(uiSound, 'whoosh').mockReturnValue(true);
  stampHeavy = vi.spyOn(uiSound, 'stampHeavy').mockReturnValue(true);
  useSettingsStore.setState({ motion: 'reduced' });
});
afterEach(() => {
  vi.restoreAllMocks();
  useSettingsStore.setState({ motion: 'system' });
});

const office = () => screen.findByRole('heading', { name: 'Office', level: 1 });

describe('game shell (HUD)', () => {
  it('shows the week, capital and the player in the HUD', async () => {
    renderApp(`/c/${CAMPAIGN_ID}`);
    await office();
    expect(screen.getByRole('group', { name: /^Week 3, Monday 17 Sep 2029/ })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /^Political capital 3, \+1 a week/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Rachel Danby').length).toBeGreaterThan(0);
  });

  it('switches places with the number keys, ticking once per change', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/c/${CAMPAIGN_ID}`);
    await office();

    await user.keyboard('2');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${CAMPAIGN_ID}/parliament`),
    );
    expect(await screen.findByRole('heading', { name: 'Chamber', level: 1 })).toBeInTheDocument();
    await user.keyboard('3');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/${CAMPAIGN_ID}/politicians`),
    );
    expect(await screen.findByRole('heading', { name: 'Tea Room', level: 1 })).toBeInTheDocument();
    await user.keyboard('5');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${CAMPAIGN_ID}/history`));
    // Wait for the Archive to be on screen, not just in the router: the shell's key handler
    // judges "already there" from the rendered place.
    expect(await screen.findByRole('heading', { name: 'Archive', level: 1 })).toBeInTheDocument();
    // Already there: no navigation, no tick.
    await user.keyboard('5');
    await user.keyboard('1');
    await office();
    expect(click).toHaveBeenCalledTimes(4);

    // The places are links with their key shown; the current one is marked.
    const nav = screen.getAllByRole('navigation', { name: 'Places' })[0]!;
    expect(within(nav).getByRole('link', { name: /Office/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('ignores place keys while typing', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/c/${CAMPAIGN_ID}/politicians`);
    const search = await screen.findByRole('searchbox').catch(() => screen.findByRole('textbox'));
    await user.type(search, '2');
    expect(router.state.location.pathname).toBe(`/c/${CAMPAIGN_ID}/politicians`);
  });

  it('asks before ending the week with free slots and open dispatches', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}`);
    await office();

    await user.click(screen.getByRole('button', { name: 'End week' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'End the week?' });
    expect(confirm).toHaveTextContent('4 diary slots unfilled');
    expect(confirm).toHaveTextContent('2 dispatches unanswered');
    // Keep planning has focus, so a stray Enter doesn't end the week.
    expect(within(confirm).getByRole('button', { name: /Keep planning/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // Esc closed the confirm; it did not open the pause menu.
    expect(screen.queryByRole('dialog', { name: 'Paused' })).not.toBeInTheDocument();

    // E asks, E again confirms; the week resolves (whoosh) and the report opens.
    await user.keyboard('e');
    await screen.findByRole('alertdialog');
    expect(whoosh).not.toHaveBeenCalled();
    // Opening the confirm is not the week ending: no stamp yet.
    expect(stampHeavy).not.toHaveBeenCalled();
    await user.keyboard('e');
    const report = await screen.findByRole('dialog', { name: /The week in Westminster/ });
    expect(whoosh).toHaveBeenCalledTimes(1);
    expect(stampHeavy).toHaveBeenCalledTimes(1);
    expect(within(report).getByRole('button', { name: 'Continue to week 4' })).toHaveFocus();
  });

  it('stamps the week ended from "End week anyway", which does not also click', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}`);
    await office();
    await user.click(screen.getByRole('button', { name: 'End week' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'End the week?' });
    // The confirm opening ticks; the END WEEK button itself is data-sfx="off".
    expect(click).toHaveBeenCalledTimes(1);
    expect(stampHeavy).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: /End week anyway/ }));
    await screen.findByRole('dialog', { name: /The week in Westminster/ });
    expect(stampHeavy).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('plays the week-change transition before the report (full motion)', async () => {
    useSettingsStore.setState({ motion: 'full' });
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}`);
    await office();
    await user.keyboard('ee');
    expect(await screen.findByRole('status')).toHaveTextContent('Week 3');
    expect(
      screen.queryByRole('dialog', { name: /The week in Westminster/ }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('dialog', { name: /The week in Westminster/ }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('opens the pause menu with Esc and resumes with Esc', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}`);
    await office();

    await user.keyboard('{Escape}');
    const pause = await screen.findByRole('dialog', { name: 'Paused' });
    const items = within(pause).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringMatching(/^Resume/),
      expect.stringMatching(/^Induction/),
      expect.stringMatching(/^Settings/),
      expect.stringMatching(/^Save & exit/),
    ]);
    expect(items[0]).toHaveFocus();
    // Place keys are off while paused.
    await user.keyboard('2');
    expect(screen.getByRole('heading', { name: 'Office', level: 1 })).toBeInTheDocument();

    // Settings opens in place; Esc steps back to the pause list, Esc again resumes.
    await user.click(within(pause).getByRole('menuitem', { name: /^Settings/ }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await within(pause).findByRole('menuitem', { name: /^Resume/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Paused' })).not.toBeInTheDocument(),
    );
  });

  it('leaves Esc to an open planner instead of pausing', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}`);
    await office();
    await user.keyboard('p');
    await screen.findByRole('dialog', { name: 'Plan an action' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Paused' })).not.toBeInTheDocument();
  });

  it('saves and exits to the main menu from the pause menu', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/c/${CAMPAIGN_ID}`);
    await office();
    await user.click(screen.getByRole('button', { name: 'Menu (Esc)' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Save & exit/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('menu', { name: 'Main menu' })).toBeInTheDocument();
  });
});

describe('career music', () => {
  it('loops the career track across tabs and crossfades back to the menu theme on exit', async () => {
    const career = careerMusic();
    const menu = menuMusic();
    const enter = vi.spyOn(career, 'enter');
    const leave = vi.spyOn(career, 'leave');
    const user = userEvent.setup();
    const { router } = renderApp(`/c/${CAMPAIGN_ID}`);
    await office();
    expect(enter).toHaveBeenCalledTimes(1);
    expect(career.state.wanted).toBe(true);
    expect(menu.state.wanted).toBe(false);

    // Changing places keeps the same track going: no leave, no second enter.
    await user.keyboard('2');
    expect(await screen.findByRole('heading', { name: 'Chamber', level: 1 })).toBeInTheDocument();
    await user.keyboard('1');
    await office();
    expect(enter).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Menu (Esc)' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Save & exit/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await screen.findByRole('menu', { name: 'Main menu' });
    expect(leave).toHaveBeenCalledTimes(1);
    expect(career.state.wanted).toBe(false);
    expect(menu.state.wanted).toBe(true);
  });
});
