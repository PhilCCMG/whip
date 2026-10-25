import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_ID } from '../mocks/fixtures';
import { useSettingsStore } from '../stores/settings-store';
import { useUiStore } from '../stores/ui-store';
import { renderApp } from '../test/render-app';

const initial = useUiStore.getState();
beforeEach(() => {
  useSettingsStore.setState({ motion: 'reduced' });
  useUiStore.setState({ politicianFilters: { sort: 'influence' }, rosterView: 'grid' });
});
afterEach(() => {
  useSettingsStore.setState({ motion: 'system' });
  useUiStore.setState(initial, true);
});

const roster = () => screen.findByRole('list', { name: 'Members' });

describe('Tea Room roster', () => {
  it('draws its own screen and filters by party, faction and search', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}/politicians`);
    expect(await screen.findByRole('heading', { name: 'Tea Room', level: 1 })).toBeInTheDocument();
    let list = await roster();
    expect(within(list).getByText('Bernadette Walsh')).toBeInTheDocument();

    // Party: only the Constitutional Party.
    const partyGroup = await screen.findByRole('group', { name: 'Party' });
    await user.click(await within(partyGroup).findByRole('button', { name: /CON/ }));
    expect(within(partyGroup).getByRole('button', { name: /CON/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Members' })).queryByText('Bernadette Walsh'),
      ).toBeNull(),
    );
    list = await roster();
    expect(within(list).getByText('Sir Richard Vane')).toBeInTheDocument();

    // Back to all parties, then a faction.
    await user.click(within(partyGroup).getByRole('button', { name: 'All' }));
    const factionGroup = screen.getByRole('group', { name: /faction/i });
    await user.click(within(factionGroup).getByRole('button', { name: 'Heartlands' }));
    await waitFor(async () => {
      const l = await roster();
      expect(within(l).getByText('Bernadette Walsh')).toBeInTheDocument();
      expect(within(l).queryByText('Sir Richard Vane')).toBeNull();
      expect(within(l).queryByText('Tom Fairley')).toBeNull();
    });

    // Search narrows it to one.
    await user.click(within(factionGroup).getByRole('button', { name: 'Any' }));
    await user.type(screen.getByRole('searchbox'), 'Fairley');
    await waitFor(async () => {
      const l = await roster();
      expect(within(l).getAllByRole('listitem')).toHaveLength(1);
      expect(within(l).getByText('Tom Fairley')).toBeInTheDocument();
    });
  });

  it('shows known votes as stamps and unknown ones as “?”, and switches to the register', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}/politicians`);
    const list = await roster();
    const walsh = within(list).getByText('Bernadette Walsh').closest('li')!;
    expect(within(walsh).getByText('Intends to vote no')).toBeInTheDocument();
    const osei = within(list).getByText('Daniel Osei').closest('li')!;
    expect(within(osei).getByText('Voting intention unknown')).toBeInTheDocument();
    expect(within(osei).getByText('?')).toBeInTheDocument();
    // Their view of you as pips.
    expect(within(walsh).getByRole('img', { name: 'Trust +4' })).toBeInTheDocument();

    // V switches to the dense register.
    await user.keyboard('v');
    const table = await screen.findByRole('table', { name: 'Members of Parliament' });
    expect(within(table).getByRole('rowheader', { name: /Bernadette Walsh/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Register/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('politician dossier', () => {
  it('shows the relationship both ways, memories and a stable whips’ note', async () => {
    renderApp(`/c/${CAMPAIGN_ID}/politicians/pol_walsh`);
    expect(
      await screen.findByRole('heading', { name: 'Bernadette Walsh', level: 1 }),
    ).toBeInTheDocument();
    const theirs = screen.getByRole('region', { name: 'Their view of you' });
    const yours = screen.getByRole('region', { name: 'Your view of them' });
    expect(within(theirs).getByRole('meter', { name: 'Trust' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    expect(within(yours).getByRole('meter', { name: 'Trust' })).toHaveAttribute(
      'aria-valuenow',
      '15',
    );
    expect(within(yours).getByRole('meter', { name: 'Respect' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    expect(screen.getByText('Week 2')).toBeInTheDocument();
    expect(screen.getByText(/Spoke with .* after the Heartlands open meeting/)).toBeInTheDocument();
    // Known intention: stamped.
    expect(screen.getAllByText('Intends to vote no').length).toBeGreaterThan(0);
    // Skills as FM attribute cells, traits as badges.
    expect(screen.getByRole('button', { name: 'Principled' })).toBeInTheDocument();
    expect(screen.getByText('Whips’ note')).toBeInTheDocument();
  });

  it('keeps an unknown intention hidden (fog of war) and opens the planner prefilled', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}/politicians/pol_osei`);
    await screen.findByRole('heading', { name: 'Daniel Osei', level: 1 });
    expect(screen.getByText('Voting intention unknown')).toBeInTheDocument();
    expect(screen.getByText(/Nobody has asked/)).toBeInTheDocument();
    expect(screen.queryByText(/Intends to vote/)).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Meet/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Meet a colleague' })).toBeInTheDocument();
    expect(useUiStore.getState().plannerPrefill).toMatchObject({
      kind: 'meet_politician',
      params: { targetId: 'pol_osei' },
    });
    // Osei is beyond the first page of search results, but the chosen target is still shown.
    const results = within(dialog).getByRole('list', { name: 'Search results' });
    await waitFor(() => expect(within(results).getAllByRole('listitem').length).toBeGreaterThan(1));
    expect(within(results).queryByText('Daniel Osei')).toBeNull();
    const selected = within(dialog).getByRole('list', { name: 'Selected' });
    expect(
      within(selected).getByRole('button', { name: 'Remove Daniel Osei' }),
    ).toBeInTheDocument();

    // Removing it clears the choice.
    await user.click(within(selected).getByRole('button', { name: 'Remove Daniel Osei' }));
    expect(within(dialog).queryByRole('list', { name: 'Selected' })).toBeNull();
  });
});
