import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ID, turnReportFixture } from '../mocks/fixtures';
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
  });
});
