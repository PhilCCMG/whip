import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '../stores/settings-store';
import { Providers } from '../app';
import { createQueryClient, REVISION_CONFLICT_MESSAGE } from '../lib/query-client';
import { routes } from '../router';
import { CAMPAIGN_ID } from '../mocks/fixtures';
import { renderApp } from '../test/render-app';

const diaryCount = () => screen.findByText(/slots? free of 5/);

// Reduced motion: END WEEK goes straight to the report (the transition has its own test).
beforeEach(() => useSettingsStore.setState({ motion: 'reduced' }));
afterEach(() => useSettingsStore.setState({ motion: 'system' }));

/** END WEEK with free slots asks first; confirm it. */
async function endWeek(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'End week' }));
  await user.click(await screen.findByRole('button', { name: /End week anyway/ }));
}

describe('career overview (mock mode)', () => {
  it('plans an action from the catalogue with a politician picker', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}`);

    expect(await screen.findByText('Meet Daniel Osei')).toBeInTheDocument();
    expect(await diaryCount()).toHaveTextContent('4 slots free of 5');

    await user.click(screen.getByRole('button', { name: 'Plan action' }));
    const dialog = await screen.findByRole('dialog');
    // Ineligible actions are listed but disabled, with their reasons.
    const reshuffle = await within(dialog).findByRole('button', { name: /^Call a reshuffle/ });
    expect(reshuffle).toBeDisabled();
    expect(reshuffle).toHaveTextContent(/Prime Minister/);

    await user.click(within(dialog).getByRole('button', { name: /^Build a relationship/ }));
    await user.type(within(dialog).getByLabelText(/colleague|politician|who/i), 'Walsh');
    await user.click(await within(dialog).findByRole('button', { name: /Bernadette Walsh/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Add to diary' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/2 slots free of 5/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bernadette Walsh/).length).toBeGreaterThan(0);
    // Capital went from 3 to 2.
    expect(screen.getByText(/2 capital to spend/)).toBeInTheDocument();
  });

  it('shows a toast and refetches when the career advanced elsewhere', async () => {
    const user = userEvent.setup();
    const { backend } = renderApp(`/c/${CAMPAIGN_ID}`);
    await screen.findByText('Meet Daniel Osei');

    backend.bumpRevision(CAMPAIGN_ID);
    await user.click(screen.getByRole('button', { name: 'Plan action' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: /^Ask for promotion/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Add to diary' }));

    expect(await screen.findByText(REVISION_CONFLICT_MESSAGE)).toBeInTheDocument();

    // After the refetch the client knows the new revision, so trying again succeeds.
    await waitFor(async () => {
      await user.click(within(dialog).getByRole('button', { name: 'Add to diary' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await screen.findByText(/3 slots free of 5/)).toBeInTheDocument();
  });

  it('ends the week and opens the turn report', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}`);
    await screen.findByText('Meet Daniel Osei');

    await endWeek(user);
    const report = await screen.findByRole('dialog');
    expect(within(report).getByText('The week in Westminster')).toBeInTheDocument();
    expect(within(report).getByText('Meet Daniel Osei')).toBeInTheDocument();
    expect(within(report).getByText(/^Week 3 · w\/c/)).toBeInTheDocument();
    await user.click(within(report).getByRole('button', { name: /Continue to week 4/ }));
    // The HUD calendar has turned over to the new week.
    expect(await screen.findByRole('group', { name: /^Week 4,/ })).toBeInTheDocument();
  });

  it('reopens last week’s report after a reload', async () => {
    const user = userEvent.setup();
    const first = renderApp(`/c/${CAMPAIGN_ID}`);
    await screen.findByText('Meet Daniel Osei');
    // Nothing has been played yet in this session, so there is no report to reopen.
    expect(screen.queryByRole('button', { name: /Last week’s report/ })).not.toBeInTheDocument();

    await endWeek(user);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Continue to week 4/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    first.unmount();

    // "Reload": same server, fresh query cache, fresh router.
    const router = createMemoryRouter(routes, { initialEntries: [`/c/${CAMPAIGN_ID}`] });
    render(
      <Providers client={createQueryClient()}>
        <RouterProvider router={router} />
      </Providers>,
    );
    const button = await screen.findByRole('button', { name: /Last week’s report \(week 3\)/ });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(button);
    const report = await screen.findByRole('dialog');
    expect(within(report).getByText('The week in Westminster')).toBeInTheDocument();
    expect(within(report).getByText('Meet Daniel Osei')).toBeInTheDocument();
    expect(within(report).getByText(/Week 4 begins/)).toBeInTheDocument();
  });
});
