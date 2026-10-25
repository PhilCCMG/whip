import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Newspaper } from '../../api/types';
import { CAMPAIGN_ID } from '../../mocks/fixtures';
import { newspaperFixture, openingNewspaperFixture } from '../../mocks/newspaper-fixture';
import { renderApp } from '../../test/render-app';
import { captionFor, MAX_SPOTS, PHOTOS, photoFor, SPOTS } from './art';
import { NewspaperPage } from './newspaper';

function renderPaper(paper: Newspaper, compact = false) {
  return renderApp('/', [
    {
      path: '/',
      element: <NewspaperPage paper={paper} campaignId={CAMPAIGN_ID} compact={compact} />,
    },
  ]);
}

const titled = (title: string): Newspaper => ({
  ...newspaperFixture,
  masthead: { ...newspaperFixture.masthead, title },
});

describe('painted mastheads', () => {
  it.each([
    ['The Morning Whip', 'morning-whip'],
    ['The Daily Clarion', 'daily-clarion'],
    ['The Westminster Gazette', 'westminster-gazette'],
  ])('%s prints its own masthead, named by its title', async (title, file) => {
    renderPaper(titled(title));
    const heading = await screen.findByRole('heading', { level: 2, name: title });
    const img = within(heading).getByRole('img', { name: title });
    expect(img.getAttribute('src')).toMatch(new RegExp(`${file}\\.webp`));
    expect(img).toHaveAttribute('width');
    expect(img).toHaveAttribute('height');
    // Edition, date and price stay as text.
    expect(
      screen.getAllByText(newspaperFixture.masthead.price, { exact: false }).length,
    ).toBeGreaterThan(0);
  });

  it('sets an unknown paper’s title in type', async () => {
    renderPaper(titled('The Evening Ferret'));
    const heading = await screen.findByRole('heading', { level: 2, name: 'The Evening Ferret' });
    expect(heading).toHaveTextContent('The Evening Ferret');
    expect(within(heading).queryByRole('img')).toBeNull();
  });
});

describe('the lead photo', () => {
  it('runs on the lead story and nowhere else', async () => {
    renderPaper(newspaperFixture);
    const lead = await screen.findByRole('heading', {
      level: 3,
      name: newspaperFixture.lead.headline,
    });
    const figures = document.querySelectorAll('figure');
    expect(figures).toHaveLength(1);
    expect(lead.closest('article')).toContainElement(figures[0] as HTMLElement);

    const photo = photoFor(newspaperFixture.lead);
    const img = within(figures[0] as HTMLElement).getByRole('img', { name: photo.alt });
    expect(img.getAttribute('srcset')).toContain(`${photo.src640} 640w`);
    expect(img.getAttribute('srcset')).toContain(`${photo.src} 1280w`);
    expect(
      within(figures[0] as HTMLElement).getByText(captionFor(photo, newspaperFixture.lead.id)),
    ).toBeInTheDocument();

    for (const s of newspaperFixture.sections)
      for (const a of s.articles) {
        const h = screen.queryByRole('heading', { name: a.headline });
        if (h) expect(within(h.closest('article')!).queryByRole('figure')).toBeNull();
      }
  });

  it('is left out of the compact office briefing', async () => {
    renderPaper(newspaperFixture, true);
    await screen.findByRole('heading', { level: 3, name: newspaperFixture.lead.headline });
    expect(document.querySelector('figure')).toBeNull();
  });
});

describe('photoFor', () => {
  const story = (headline: string, refs: Newspaper['lead']['refs'] = []) => ({
    headline,
    refs,
  });

  it('chooses by what the story is about', () => {
    expect(photoFor(story('Minister quits in expenses row')).key).toBe('press-scrum');
    expect(photoFor(story('Reshuffle: three promoted, one moved sideways')).key).toBe(
      'reshuffle-door',
    );
    expect(photoFor(story('Backbench revolt: 115 rebels break ranks')).key).toBe('the-lobby');
    expect(photoFor(story('Leader’s conference speech promises a bold new vision')).key).toBe(
      'podium',
    );
    expect(photoFor(story('By-election candidates brave the rain in Cranford')).key).toBe(
      'wet-hustings',
    );
    expect(photoFor(story('Housing bill clears its second reading')).key).toBe('commons-exterior');
    expect(photoFor(openingNewspaperFixture.lead).key).toBe('commons-exterior');
  });

  it('falls back on the refs, then the press scrum', () => {
    expect(photoFor(story('A quiet week', [{ kind: 'constituency', id: 'c_1' }])).key).toBe(
      'wet-hustings',
    );
    expect(photoFor(story('A quiet week', [{ kind: 'bill', id: 'bill.x' }])).key).toBe(
      'commons-exterior',
    );
    expect(photoFor(story('Nothing to see here')).key).toBe('press-scrum');
  });

  it('captions every photo deterministically', () => {
    for (const p of Object.values(PHOTOS)) {
      expect(p.captions.length).toBeGreaterThan(1);
      expect(captionFor(p, 'ed5-01')).toBe(captionFor(p, 'ed5-01'));
      expect(p.captions).toContain(captionFor(p, 'anything'));
    }
  });
});

describe('filler spot art', () => {
  const spotImages = () => [...document.querySelectorAll<HTMLImageElement>('img[data-spot]')];

  it('puts the raincloud in the Weather box, floated beside the forecast, as decoration', async () => {
    renderPaper(newspaperFixture);
    const weather = await screen.findByRole('region', { name: 'Weather' });
    const img = weather.querySelector('img[data-spot]');
    expect(img).toHaveAttribute('data-spot', 'weather');
    expect(img).toHaveAttribute('src', SPOTS.weather.src);
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveClass('float-right');
    expect(img!.closest('figure')).toBeNull(); // no frame, no caption
    // The gnome matches nothing, so And Finally prints no picture.
    const finally_ = screen.getByRole('region', { name: 'And Finally…' });
    expect(finally_.querySelector('img[data-spot]')).toBeNull();
  });

  it('pictures a filler story that names its subject, and never a political one', async () => {
    const swan = {
      id: 'spot-swan',
      headline: 'Swan delays Commons committee by sitting on the minutes',
      standfirst: 'Members could not approve the record of the previous meeting for an hour.',
      importance: 1,
      filler: true,
      refs: [],
    };
    const paper: Newspaper = {
      ...newspaperFixture,
      sections: newspaperFixture.sections.map((s) =>
        s.key === 'and_finally' ? { ...s, articles: [swan, ...s.articles] } : s,
      ),
    };
    renderPaper(paper);
    const h = await screen.findByRole('heading', { name: swan.headline });
    expect(h.closest('article')!.querySelector('img[data-spot]')).toHaveAttribute(
      'data-spot',
      'swan',
    );
    expect(spotImages().length).toBeLessThanOrEqual(MAX_SPOTS);
    const politicsTitle = paper.sections.find((s) => s.key === 'politics')!.title;
    const politics = screen.getByRole('region', { name: politicsTitle });
    expect(politics.querySelector('img[data-spot]')).toBeNull();
    expect(
      screen
        .getByRole('heading', { level: 3, name: paper.lead.headline })
        .closest('article')!
        .querySelector('img[data-spot]'),
    ).toBeNull();
  });

  it('prints the paper on newsprint, under its own paper colour', async () => {
    renderPaper(newspaperFixture);
    const heading = await screen.findByRole('heading', { level: 2 });
    const sheet = heading.closest('section')!;
    expect(sheet).toHaveClass('paper-texture');
    expect(sheet.style.getPropertyValue('--paper-texture')).toMatch(/newsprint.*\.webp/);
  });
});
