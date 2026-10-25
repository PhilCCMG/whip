import type { Headline, Newspaper } from '../../api/types';

/**
 * Each fictional paper has its own look (docs/architecture/09-game-ui.md §Newspaper):
 * - broadsheet (The Morning Whip): mixed-case headlines at normal width, hairline rules, dry.
 * - tabloid (The Daily Clarion): red masthead block, huge condensed capitals, black bars.
 * - record (The Westminster Gazette): wide spaced capitals between double rules, pompous.
 * Unknown titles get one of the three from a stable hash, so a new paper still looks deliberate.
 */
export type PaperKind = 'broadsheet' | 'tabloid' | 'record';

const KNOWN: Record<string, PaperKind> = {
  'the morning whip': 'broadsheet',
  'the daily clarion': 'tabloid',
  'the westminster gazette': 'record',
};

export function paperKind(title: string): PaperKind {
  const known = KNOWN[title.trim().toLowerCase()];
  if (known) return known;
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (['broadsheet', 'tabloid', 'record'] as const)[h % 3]!;
}

/**
 * Headline classes by paper and importance (5 = splash). Size comes before leading: tailwind-merge
 * lets a later font-size drop an earlier line-height.
 */
export function headlineClass(kind: PaperKind, importance: number): string {
  const i = Math.max(1, Math.min(5, importance));
  switch (kind) {
    case 'tabloid':
      return [
        i >= 5
          ? 'text-[clamp(2.6rem,5.6vw,4.6rem)]'
          : i === 4
            ? 'text-[1.9rem]'
            : i === 3
              ? 'text-[1.4rem]'
              : 'text-[1.1rem]',
        'font-display font-black uppercase [font-stretch:66%] leading-[0.86]',
      ].join(' ');
    case 'record':
      return [
        i >= 5
          ? 'text-[clamp(2rem,4vw,3.1rem)]'
          : i === 4
            ? 'text-[1.6rem]'
            : i === 3
              ? 'text-[1.25rem]'
              : 'text-[1.05rem]',
        'font-display font-bold [font-stretch:78%] leading-[0.98] tracking-[-0.005em]',
      ].join(' ');
    case 'broadsheet':
      return [
        i >= 5
          ? 'text-[clamp(1.9rem,3.6vw,2.8rem)]'
          : i === 4
            ? 'text-[1.5rem]'
            : i === 3
              ? 'text-[1.2rem]'
              : 'text-[1.02rem]',
        'font-display font-extrabold [font-stretch:92%] leading-[1.02] tracking-[-0.015em]',
      ].join(' ');
  }
}

/** Synthesise a paper from plain headlines (API responses without `newspaper`). */
export function paperFromHeadlines(
  headlines: Headline[],
  simDate: string,
  turn: number,
): Newspaper {
  const sorted = [...headlines].sort((a, b) => b.importance - a.importance);
  const toArticle = (h: Headline, i: number) => ({
    id: `h${turn}-${i}`,
    headline: h.text,
    ...(h.standfirst ? { standfirst: h.standfirst } : {}),
    importance: h.importance,
    filler: false,
    refs: [],
  });
  const [lead, ...rest] = sorted.map(toArticle);
  return {
    masthead: {
      title: 'The Morning Whip',
      slogan: 'Read in the tea room since 1871',
      price: '£2.20',
      edition: `Week ${turn}`,
      date: simDate,
    },
    lead: lead ?? {
      id: `h${turn}-quiet`,
      headline: 'Nothing happens in Westminster, sources confirm',
      standfirst: 'Colleagues describe the calm as “suspicious”.',
      importance: 4,
      filler: false,
      refs: [],
    },
    sections: rest.length ? [{ key: 'politics', title: 'Politics', articles: rest }] : [],
  };
}
