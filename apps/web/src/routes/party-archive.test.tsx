import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryItem } from '../api/types';
import { groupByWeek, weekStart } from '../features/archive/model';
import { whipsNote } from '../features/tea-room/flavour';
import { CAMPAIGN_ID, PLAYER_ID } from '../mocks/fixtures';
import { useSettingsStore } from '../stores/settings-store';
import { useUiStore } from '../stores/ui-store';
import { renderApp } from '../test/render-app';

const initial = useUiStore.getState();
beforeEach(() => {
  useSettingsStore.setState({ motion: 'reduced' });
  useUiStore.setState({ historyFilters: {} });
});
afterEach(() => {
  useSettingsStore.setState({ motion: 'system' });
  useUiStore.setState(initial, true);
});

describe('Party HQ', () => {
  it('draws the leadership, gauges and the rival camps', async () => {
    renderApp(`/c/${CAMPAIGN_ID}/party`);
    expect(await screen.findByRole('heading', { name: 'Party HQ', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Whip strength' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    expect(screen.getByRole('meter', { name: 'Unity' })).toHaveAttribute('aria-valuetext');

    const card = screen.getByRole('article', { name: 'Heartlands' });
    expect(within(card).getByText('Led by')).toBeInTheDocument();
    expect(within(card).getByText('Bernadette Walsh')).toBeInTheDocument();
    expect(within(card).getByText(/71 MPs/)).toBeInTheDocument();
    expect(within(card).getByRole('meter', { name: 'Cohesion' })).toHaveAttribute(
      'aria-valuenow',
      '78',
    );
    expect(within(card).getByRole('meter', { name: 'Trust in you' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    expect(within(card).getByText(/social-housing quota/)).toBeInTheDocument();
    expect(within(card).getAllByText('Demand').length).toBe(2);

    // The power ladder is ranked.
    const ladder = screen.getByRole('region', { name: 'Who matters' });
    expect(within(ladder).getAllByRole('listitem')[0]).toHaveTextContent(/1.*Helen Ashdown/);
  });
});

describe('Archive', () => {
  it('groups the record by week and filters by type and by the player', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}/history`);
    expect(await screen.findByRole('heading', { name: 'Archive', level: 1 })).toBeInTheDocument();
    const weeks = await screen.findAllByRole('heading', { level: 2, name: /^Week \d\d$/ });
    expect(weeks.length).toBeGreaterThan(0);
    // Newest week first.
    const nums = weeks.map((w) => Number(w.textContent?.replace(/\D/g, '')));
    expect([...nums].sort((a, b) => b - a)).toEqual(nums);

    await user.click(screen.getByRole('button', { name: 'Divisions' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Divisions' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    await waitFor(() => {
      expect(useUiStore.getState().historyFilters.type).toBe('division');
      expect(screen.queryByText('Talks')).toBeNull();
      expect(screen.getAllByText('Division').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: 'All papers' }));
    await user.click(screen.getByRole('button', { name: 'Only my career' }));
    expect(useUiStore.getState().historyFilters.politicianId).toBe(PLAYER_ID);
    expect(screen.getByRole('button', { name: 'Only my career' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('groups consecutive items by turn and finds the Monday', () => {
    const item = (seq: number, turn: number, simDate: string): HistoryItem => ({
      seq,
      turn,
      simDate,
      type: 'event',
      importance: 2,
      title: `t${seq}`,
      summary: '',
      actorIds: [],
      subjectIds: [],
    });
    const groups = groupByWeek([
      item(5, 3, '2029-09-19'),
      item(4, 3, '2029-09-17'),
      item(3, 2, '2029-09-12'),
    ]);
    expect(groups.map((g) => [g.turn, g.items.length])).toEqual([
      [3, 2],
      [2, 1],
    ]);
    expect(weekStart(groups[0]!.items)).toBe('2029-09-17');
  });
});

describe('dossier flavour', () => {
  it('derives the whips’ note deterministically from traits', () => {
    const a = whipsNote('pol_walsh', ['principled', 'stubborn']);
    expect(whipsNote('pol_walsh', ['principled', 'stubborn'])).toBe(a);
    expect(whipsNote('pol_walsh', ['trait.principled', 'trait.stubborn'])).toBe(a);
    expect(whipsNote('pol_x', [])).toMatch(/\w/);
  });
});
