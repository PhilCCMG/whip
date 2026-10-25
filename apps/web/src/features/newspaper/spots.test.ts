import { describe, expect, it } from 'vitest';
import type { Article, Newspaper, NewspaperSectionKey } from '../../api/types';
import { MAX_SPOTS, SPOTS, spotFor, spotsForPaper, type SpotKey } from './art';

let seq = 0;
const story = (headline: string, over: Partial<Article> = {}): Article => ({
  id: `a${++seq}`,
  headline,
  importance: 1,
  filler: true,
  refs: [],
  ...over,
});
const section = (key: NewspaperSectionKey, ...articles: Article[]) => ({
  key,
  title: key,
  articles,
});
type Sections = Newspaper['sections'];

describe('spotFor', () => {
  it.each<[string, SpotKey]>([
    ['Lost ring found inside prize marrow in Cranford', 'marrow'],
    ['Allotment row over runner beans', 'marrow'],
    ['Escaped llama leads slow police chase through Halfield', 'llama'],
    ['Pothole on Mill Lane granted local landmark status', 'pothole'],
    ['Speed bump declared too bumpy by residents', 'pothole'],
    ["Commons cat appointed to select committee 'by mistake'", 'cat-ministerial-car'],
    ['Swan delays Commons committee by sitting on the minutes', 'swan'],
    ['Tortoise returns home after 7 years, offers no explanation', 'tortoise'],
    ['Scarecrow resembling councillor removed from field', 'scarecrow'],
    ["Cranford rejects new bus shelter as 'too modern'", 'bus-shelter'],
    ['Parish council feud over hanging baskets enters third year', 'parish-council'],
  ])('%s → %s', (headline, key) => {
    expect(spotFor(story(headline))?.key).toBe(key);
  });

  it('reads the standfirst and body too', () => {
    expect(
      spotFor(
        story('Record turnout in Cranford', {
          standfirst: 'Credit the weather.',
          body: 'The produce show ran late.',
        }),
      )?.key,
    ).toBe('marrow');
  });

  it('puts the specific subject before the council that ignores it', () => {
    expect(spotFor(story('Pothole outlives most of the council'))?.key).toBe('pothole');
  });

  it('matches whole words only: a councillor is not a council', () => {
    expect(spotFor(story('Councillor opens library, praises library'))).toBeUndefined();
    expect(spotFor(story('Business as usual in the scatter of categories'))).toBeUndefined();
  });

  it('has no fallback picture when nothing matches', () => {
    expect(spotFor(story('Gnome stolen in Cranford sends postcards from abroad'))).toBeUndefined();
  });

  it('never pictures a political story, whatever it mentions', () => {
    expect(spotFor(story('Council tax bill passes', { filler: false }))).toBeUndefined();
  });

  it('is deterministic', () => {
    const a = story('Runaway llama found asleep in bus station');
    expect(spotFor(a)).toBe(spotFor({ ...a }));
    expect(spotFor(a)?.key).toBe('llama');
  });
});

describe('spotsForPaper', () => {
  it('always puts the raincloud in the Weather box, even with no keyword', () => {
    const forecast = story('Fog over Westminster, visibility poor');
    const spots = spotsForPaper([section('weather', forecast)]);
    expect(spots.get(forecast.id)).toBe(SPOTS.weather);
    expect(spots.size).toBe(1);
  });

  it(`stops at ${MAX_SPOTS} a paper, the Weather box's included`, () => {
    const filler = [
      story('Swan sits on the minutes'),
      story('Tortoise comes home'),
      story('Scarecrow removed'),
      story('Pothole honoured'),
    ];
    const forecast = story('Outlook: unsettled');
    const spots = spotsForPaper([
      section('and_finally', filler[0]!, filler[1]!),
      section('weather', forecast),
      section('constituencies', filler[2]!, filler[3]!),
    ]);
    expect(spots.size).toBe(MAX_SPOTS);
    expect(spots.get(forecast.id)?.key).toBe('weather');
    expect(spots.get(filler[0]!.id)?.key).toBe('swan');
    expect(spots.get(filler[1]!.id)?.key).toBe('tortoise');
    expect(spots.has(filler[2]!.id)).toBe(false);
  });

  it('runs each picture once a paper', () => {
    const a = story('Parish council in uproar');
    const b = story('Council spends £300 on report into council spending');
    const c = story('Swan sits on the minutes');
    const spots = spotsForPaper([section('constituencies', a, b, c)] satisfies Sections);
    expect(spots.get(a.id)?.key).toBe('parish-council');
    expect(spots.has(b.id)).toBe(false);
    expect(spots.get(c.id)?.key).toBe('swan');
  });

  it('never pictures the politics, letters, classifieds or corrections', () => {
    const spots = spotsForPaper([
      section('politics', story('Council funding row: swan-themed bill', { filler: false })),
      section('letters', story('The marrow question')),
      section('classifieds', story('Lost: one bus')),
      section('corrections', story('Clarification on a marrow')),
      section('sport', story('Swan stops play')),
    ]);
    expect(spots.size).toBe(0);
  });

  it('skips a non-filler story wherever it is printed', () => {
    const political = story('Tortoise-paced reforms', { filler: false });
    expect(spotsForPaper([section('and_finally', political)]).size).toBe(0);
  });
});
