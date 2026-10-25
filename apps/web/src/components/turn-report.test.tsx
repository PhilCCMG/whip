import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ID, turnReportFixture } from '../mocks/fixtures';
import { newspaperFixture } from '../mocks/newspaper-fixture';
import { renderApp } from '../test/render-app';
import { TurnReportContent } from './turn-report';

describe('TurnReportContent', () => {
  it('renders headlines, outcomes and the division with rebels', async () => {
    renderApp('/', [
      {
        path: '/',
        element: <TurnReportContent report={turnReportFixture} campaignId={CAMPAIGN_ID} />,
      },
    ]);

    const lead = [...turnReportFixture.headlines].sort((a, b) => b.importance - a.importance)[0];
    expect(await screen.findByRole('heading', { name: lead?.text ?? '' })).toBeInTheDocument();

    for (const o of turnReportFixture.actionOutcomes) {
      expect(screen.getAllByText(o.label).length).toBeGreaterThan(0);
      for (const e of o.effects) expect(screen.getAllByText(e).length).toBeGreaterThan(0);
    }

    const division = turnReportFixture.divisions[0];
    expect(division).toBeDefined();
    const article = screen.getByRole('article', { name: new RegExp(division!.billTitle) });
    expect(within(article).getByText(String(division!.ayes))).toBeInTheDocument();
    expect(within(article).getByText(String(division!.noes))).toBeInTheDocument();
    expect(within(article).getByText(`Rebels (${division!.rebels.length})`)).toBeInTheDocument();
    for (const r of division!.rebels) {
      expect(within(article).getByRole('link', { name: r.name })).toBeInTheDocument();
    }
    expect(within(article).getByRole('table', { name: 'Votes by party' })).toBeInTheDocument();
    // The division lobby painting sits behind the tally's header band, purely decorative.
    const lobby = article.querySelector('img[data-scene="division-lobby"]');
    expect(lobby).toHaveAttribute('alt', '');
    expect(lobby).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('TurnReportContent as a newspaper', () => {
  it('prints the edition’s masthead and sections, with your week stamped alongside', async () => {
    const newspaper = newspaperFixture; // The Daily Clarion, division week
    renderApp('/', [
      {
        path: '/',
        element: (
          <TurnReportContent
            report={{ ...turnReportFixture, newspaper }}
            campaignId={CAMPAIGN_ID}
          />
        ),
      },
    ]);
    // The painted masthead is the heading's content; its alt keeps the heading named.
    const masthead = await screen.findByRole('heading', { name: 'The Daily Clarion' });
    expect(within(masthead).getByRole('img', { name: 'The Daily Clarion' })).toBeInTheDocument();
    expect(screen.getByText(newspaper.masthead.slogan)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: newspaper.lead.headline })).toBeInTheDocument();
    for (const section of newspaper.sections) {
      if (section.articles.length === 0) continue;
      expect(screen.getByRole('heading', { name: section.title })).toBeInTheDocument();
    }
    // The mechanics stay legible next to the spin: outcomes stamped, capital change shown.
    const yourWeek = screen.getByRole('region', { name: 'Your week' });
    expect(within(yourWeek).getAllByText('Success')).toHaveLength(2);
    expect(within(yourWeek).getByText('Partial')).toBeInTheDocument();
    expect(
      within(yourWeek).getByRole('group', { name: /Political capital \+1/ }),
    ).toBeInTheDocument();
  });

  it('falls back to the plain headlines when there is no paper', async () => {
    renderApp('/', [
      {
        path: '/',
        element: <TurnReportContent report={turnReportFixture} campaignId={CAMPAIGN_ID} />,
      },
    ]);
    const masthead = await screen.findByRole('heading', { name: 'The Morning Whip' });
    expect(within(masthead).getByRole('img', { name: 'The Morning Whip' })).toBeInTheDocument();
    for (const h of turnReportFixture.headlines) {
      expect(screen.getByRole('heading', { name: h.text })).toBeInTheDocument();
    }
  });
});
