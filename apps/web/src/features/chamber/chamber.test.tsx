import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { divisionAnnouncement } from '../../game-ui/division-copy';
import { DivisionTally } from '../../game-ui/division-tally';
import {
  CAMPAIGN_ID,
  hdbSecondReadingForecast,
  hdbSecondReadingResult,
  parliamentFixture,
} from '../../mocks/fixtures';
import { renderApp } from '../../test/render-app';
import { chamberLayout } from './layout';
import { countdownLabel, forecastCall, stageIndex, weeksUntil, whipLines } from './model';
import { ForecastBoard } from './next-division';
import { WhipMark } from './whip-lines';

describe('whip lines', () => {
  it('counts the lines the way the whips underline them', () => {
    expect(whipLines('Three-line whip')).toBe(3);
    expect(whipLines('Two-line whip')).toBe(2);
    expect(whipLines('One-line whip')).toBe(1);
    expect(whipLines('Whipped')).toBe(1);
    expect(whipLines('Free vote (England-only bill)')).toBe(0);
    expect(whipLines('No whip')).toBe(0);
  });

  it('draws one underline per line, and names the whip for screen readers', () => {
    const { container, rerender } = render(
      <WhipMark
        whip={{ partyId: 'p', shortName: 'NPP', instruction: 'Three-line whip', direction: 'aye' }}
      />,
    );
    expect(container.querySelectorAll('[data-whip-line]')).toHaveLength(3);
    expect(screen.getByText('NPP: Three-line whip, aye')).toBeInTheDocument();

    rerender(
      <WhipMark
        whip={{ partyId: 'p', shortName: 'LR', instruction: 'Two-line whip', direction: 'abstain' }}
      />,
    );
    expect(container.querySelectorAll('[data-whip-line]')).toHaveLength(2);

    rerender(
      <WhipMark
        whip={{ partyId: 'p', shortName: 'SCP', instruction: 'Free vote', direction: null }}
      />,
    );
    expect(container.querySelectorAll('[data-whip-line]')).toHaveLength(0);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });
});

describe('the whips’ forecast', () => {
  it('only calls it safe when the unknowns could not overturn the lead', () => {
    expect(forecastCall({ ayes: 318, noes: 214, abstain: 71, unknown: 46 }).call).toBe('safe-aye');
    expect(forecastCall({ ayes: 300, noes: 280, abstain: 20, unknown: 50 }).call).toBe('toss-up');
    expect(forecastCall({ ayes: 300, noes: 270, abstain: 20, unknown: 50 }).call).toBe('lean-aye');
    expect(forecastCall({ ayes: 200, noes: 330, abstain: 20, unknown: 60 }).call).toBe('safe-no');
  });

  it('shows the unknowns as their own column on the board', () => {
    render(<ForecastBoard forecast={{ ayes: 318, noes: 214, abstain: 71, unknown: 46 }} />);
    const unknown = screen.getByText('Unknown').closest('div')!;
    expect(within(unknown).getByText('Not yet known to you')).toBeInTheDocument();
    expect(within(unknown).getByText(/46/)).toBeInTheDocument();
    for (const label of ['Aye', 'No', 'Abstain']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('counts down in weeks', () => {
    expect(countdownLabel(weeksUntil('2029-09-17', '2029-09-26'))).toBe('Next week');
    expect(countdownLabel(weeksUntil('2029-09-03', '2029-09-26'))).toBe('In 3 weeks');
    expect(countdownLabel(weeksUntil('2029-09-24', '2029-09-26'))).toBe('This week');
    expect(stageIndex('Report stage and third reading')).toBe(3);
  });
});

describe('the division announcement', () => {
  it('reads the tellers’ figures, Ayes to the right first', () => {
    const { tellers, verdict } = divisionAnnouncement({ ayes: 308, noes: 270 });
    expect(tellers).toBe('The Ayes to the right: 308. The Noes to the left: 270.');
    expect(verdict).toMatch(/^The Ayes have it/);
    expect(divisionAnnouncement({ ayes: 200, noes: 301 }).verdict).toMatch(/^The Noes have it/);
  });

  it('stamps the result and calls the roll of rebels with their reasons', () => {
    const d = hdbSecondReadingResult('no', 'Rachel Danby');
    render(
      <MemoryRouter>
        <DivisionTally division={d} campaignId={CAMPAIGN_ID} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(new RegExp(`The Ayes to the right: ${d.ayes}\\. The Noes to the left`)),
    ).toBeInTheDocument();
    expect(screen.getByText('Carried')).toBeInTheDocument();
    expect(screen.getByText('Government win')).toBeInTheDocument();
    const reasoned = d.rebels.find((r) => r.reason);
    expect(reasoned).toBeDefined();
    expect(screen.getAllByText(reasoned!.reason!).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Rachel Danby' })).toBeInTheDocument();
  });
});

describe('the chamber layout', () => {
  it('seats every Member and puts the player on their own benches', () => {
    const gov = parliamentFixture.composition.filter((c) => c.inGovernment);
    const opp = parliamentFixture.composition.filter((c) => !c.inGovernment);
    const layout = chamberLayout(gov, opp, { id: 'pol_player', partyId: 'party.npp' });
    const seated = layout.seats.filter((s) => s.partyId).length;
    expect(seated).toBe(parliamentFixture.totalSeats);
    expect(layout.player?.bank).toBe('gov');
  });
});

describe('CHAMBER screen', () => {
  it('draws the House, the next division and the Order Paper; Enter opens a division', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}/parliament`);
    expect(await screen.findByRole('heading', { name: 'Chamber', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: /Working majority/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Seats by party' })).toBeInTheDocument();

    const forecast = hdbSecondReadingForecast();
    const next = screen.getByRole('region', { name: forecast.billTitle });
    expect(within(next).getByText('Not yet known to you')).toBeInTheDocument();
    expect(
      within(next).getByText(`Waverers you know of (${forecast.waverers.length})`),
    ).toBeInTheDocument();

    const order = screen.getByRole('list', { name: 'Order Paper' });
    const items = within(order).getAllByRole('button');
    expect(items.length).toBeGreaterThan(0);

    const recent = screen.getByRole('list', { name: 'Recent divisions' });
    const first = within(recent).getAllByRole('button')[0]!;
    first.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'The tellers’ report' });
    expect(within(dialog).getByText(/The Ayes to the right/)).toBeInTheDocument();
  });
});
