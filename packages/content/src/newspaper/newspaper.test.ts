import {
  FILLER_SECTION_KEYS,
  NewspaperContentSchema,
  PAPER_STYLES,
  POLITICS_STORY_KINDS,
  STORY_TONES,
  type StoryTemplate,
} from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { newspaperContent } from './index';

/** Same substitution rule as the engine's fillTemplate. */
function fill(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (m: string, k: string) => vars[k] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deliberately long, worst-case sample values for every slot the engine fills. */
const SAMPLE: Record<string, string> = {
  player: 'Alexandra Fotheringham-Price',
  playerFirst: 'Alexandra',
  playerLast: 'Fotheringham-Price',
  seat: 'Ashby and Wold',
  seatMajority: '1,840',
  pm: 'Helen Ashdown',
  pmLast: 'Ashdown',
  chiefWhip: 'Gareth Pryce',
  chiefWhipLast: 'Pryce',
  sponsor: 'Priya Nair',
  sponsorLast: 'Nair',
  party: 'National Progressive Party',
  partyShort: 'NPP',
  opposition: 'Constitutional Party',
  govMajority: '74',
  bill: 'Housing Delivery Bill',
  rebelLeader: 'Bernadette Walsh',
  rebelLeaderLast: 'Walsh',
  rebelLeader2: 'Tom Fairley',
  rebelLeader2Last: 'Fairley',
  actor: 'Sir Richard Vane-Tempest',
  actorLast: 'Vane-Tempest',
  office: 'Chief Secretary to the Treasury',
  target: 'Bernadette Walsh',
  targetLast: 'Walsh',
  ayes: '318',
  noes: '291',
  margin: '27',
  count: '24',
  changes: '11 changes',
  Changes: '11 changes',
  stage: 'second reading',
  Stage: 'Second reading',
  date: 'Wednesday 26 September 2029',
  rebels: 'Bernadette Walsh, Daniel Osei, Tom Fairley and 21 others',
  govRebels: '24 government MPs',
  rebelCount: '24 rebels',
  voteVerb: 'voted against',
  voteIntent: 'vote against',
  lobbyStance: 'against',
  protestSeat: 'Melbridge and the Vale',
  protestMp: 'Tom Fairley',
  share: '41',
  oppShare: '29',
  pollGap: 'a lead of 12 points',
  stability: '-24',
  place: 'Melbridge and the Vale',
  place2: 'Little Cowley North',
  councillor: 'Brenda Oakes-Whitworth',
  councillor2: 'Desmond Pargeter',
  mp: 'Fenella Ashcombe',
  mpLast: 'Ashcombe',
  mpSeat: 'Swaleby and the Moors',
  minister: 'Rupert Okonkwo-Lane',
  ministerLast: 'Okonkwo-Lane',
  n: '7',
  big: '384',
  prevHeadline: 'Whips sweat as Housing Delivery Bill scrapes through by 12',
  vegetable: 'runner bean',
  animal: 'pot-bellied pig',
  petName: 'Mrs Pickles',
  venue: 'the leisure centre',
  villageEvent: 'the conker championship',
  road: 'Station Road',
  pub: 'the Dog and Division Bell',
  weekday: 'Wednesday',
  politicalEditor: 'Saoirse Doyle-Bennett',
  lobby: 'Nadia Okafor-Reed',
  sketch: 'Rory Fenwick-Lowe',
  local: 'Ravi Mistry-Hale',
  sport: 'Euan Threlfall',
};

const words = (s: string) => s.split(/\s+/).filter((w) => w.length > 0).length;
const sentences = (s: string) => (s.match(/[.?!](?=["'”’)]*(\s|$))/g) ?? []).length;
const ALL: StoryTemplate[] = [...newspaperContent.politics, ...newspaperContent.filler];

/** Things the paper must never contain (10-voice-and-copy.md: no exclamations, no real brands). */
const FORBIDDEN =
  /!|\blol\b|\b(Times|Guardian|Telegraph|Daily Mail|Mirror|The Sun|Express|Observer|BBC|WhatsApp|Twitter|Facebook|Instagram|TikTok)\b/;

describe('newspaper content', () => {
  it('passes Zod validation', () => {
    const r = NewspaperContentSchema.safeParse(newspaperContent);
    if (!r.success) throw new Error(r.error.message);
  });

  it('has large template pools with unique ids', () => {
    expect(newspaperContent.politics.length).toBeGreaterThanOrEqual(40);
    expect(newspaperContent.filler.length).toBeGreaterThanOrEqual(60);
    const ids = ALL.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every story kind for every paper style and tone', () => {
    for (const kind of POLITICS_STORY_KINDS) {
      const pool = newspaperContent.politics.filter((t) => t.kind === kind);
      expect(pool.length, kind).toBeGreaterThanOrEqual(2);
      for (const style of PAPER_STYLES) {
        for (const tone of STORY_TONES) {
          const usable = pool.filter(
            (t) =>
              (t.styles === undefined || t.styles.includes(style)) &&
              (t.tone === undefined || t.tone === tone),
          );
          expect(usable.length, `${kind} / ${style} / ${tone}`).toBeGreaterThan(0);
        }
      }
    }
    for (const section of FILLER_SECTION_KEYS) {
      expect(
        newspaperContent.filler.filter((t) => t.kind === section).length,
        section,
      ).toBeGreaterThanOrEqual(8);
    }
  });

  it('every template renders with sample data within the length limits', () => {
    const problems: string[] = [];
    const check = (ok: boolean, msg: string) => {
      if (!ok) problems.push(msg);
    };
    for (const t of ALL) {
      const headline = fill(t.headline, SAMPLE);
      const standfirst = fill(t.standfirst, SAMPLE);
      const body = fill(t.body, SAMPLE);
      for (const [part, text] of [
        ['headline', headline],
        ['standfirst', standfirst],
        ['body', body],
      ] as const) {
        check(!/\{\w+\}/.test(text), `${t.id} ${part}: unfilled slot in "${text}"`);
        check(!FORBIDDEN.test(text), `${t.id} ${part}: forbidden text in "${text}"`);
      }
      check(words(headline) <= 12, `${t.id} headline has ${words(headline)} words: "${headline}"`);
      check(headline.length <= 90, `${t.id} headline too long`);
      check(sentences(standfirst) <= 1, `${t.id} standfirst not one sentence: "${standfirst}"`);
      check(standfirst.length <= 200, `${t.id} standfirst too long (${standfirst.length})`);
      check(body.length > 0, `${t.id} body empty`);
      check(sentences(body) <= 3, `${t.id} body has ${sentences(body)} sentences: "${body}"`);
      check(body.length <= 420, `${t.id} body too long (${body.length})`);
    }
    expect(problems).toEqual([]);
  });

  it('has three distinct mastheads whose bylines render', () => {
    const styles = newspaperContent.mastheads.map((m) => m.style).sort();
    expect(styles).toEqual(['broadsheet', 'record', 'tabloid']);
    for (const m of newspaperContent.mastheads) {
      for (const list of Object.values(m.bylines)) {
        for (const b of list) expect(fill(b, SAMPLE), `${m.key}: ${b}`).not.toMatch(/\{\w+\}/);
      }
      for (const s of m.slogans) expect(s).not.toMatch(FORBIDDEN);
    }
    expect(new Set(newspaperContent.journalists).size).toBe(newspaperContent.journalists.length);
  });
});
