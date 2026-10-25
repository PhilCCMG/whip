import {
  addDays,
  formatSimDate,
  MAX_RECENT_STORY_TEMPLATES,
  NEWSPAPER_SECTION_KEYS,
  type ArticleRefKind,
  type BylineRole,
  type ContentRegistry,
  type DivisionId,
  type FillerSectionKey,
  type GameState,
  type Headline,
  type MastheadDefinition,
  type NewsArticle,
  type NewspaperEdition,
  type NewspaperSectionKey,
  type PaperStyle,
  type PartyId,
  type Politician,
  type PoliticianId,
  type PoliticsStoryKind,
  type SimDate,
  type StoryTemplate,
  type StoryTone,
  type Vote,
} from '@whip/domain';
import { hashInt, Rng } from '../rng';
import {
  chiefWhipId,
  compareStrings,
  displayName,
  findPolitician,
  formatNumber,
  getBill,
  getDivision,
  getPolitician,
  governmentMajority,
  isGovernmentParty,
  isSitting,
  majorityOf,
  scheduledDivisions,
} from '../state/access';
import type { TurnContext } from '../turn/context';
import { fillTemplate, stageLabel, type TemplateVars } from './templates';

/*
 * The weekly newspaper (docs/architecture/10-voice-and-copy.md). Deterministic: every random
 * choice comes from the turn's `newspaper` RNG stream (or turn 0's for the opening edition), and
 * candidates are gathered in record / sorted-id order. The paper is copy only: building it never
 * changes the simulation.
 */

type Ref = { kind: ArticleRefKind; id: string };

interface Story {
  kind: PoliticsStoryKind;
  importance: number;
  vars: TemplateVars;
  refs: Ref[];
  /** Same-kind stories beyond the cap are dropped (see KIND_CAPS). */
  group?: string;
}

/** Lead + politics stories per edition. */
const MAX_POLITICS = 7;
/** Government rebellions at least this big make their own story. */
const REBELLION_STORY = 5;
const DRAMATIC_REBELLION = 15;
const COMFORTABLE_MARGIN = 40;
/** At most this many stories per group (default 1 per kind). */
const GROUP_CAPS: Record<string, number> = { gossip: 2, relationship: 2, appointment: 2 };
const FILLER_WEIGHTS: Record<FillerSectionKey, number> = {
  constituencies: 3,
  and_finally: 3,
  letters: 2,
  weather: 2,
  sport: 2,
  classifieds: 1.5,
  corrections: 1,
};
const BYLINE_FOR_FILLER: Record<FillerSectionKey, BylineRole | null> = {
  constituencies: 'local',
  and_finally: 'local',
  letters: null,
  weather: 'weather',
  sport: 'sport',
  classifieds: null,
  corrections: null,
};

const VOTE_VERB: Record<Vote, string> = {
  aye: 'voted for',
  no: 'voted against',
  abstain: 'abstained on',
};
const VOTE_INTENT: Record<Vote, string> = {
  aye: 'vote for',
  no: 'vote against',
  abstain: 'abstain on',
};

function lastName(p: Politician): string {
  return p.name.last;
}

function plural(n: number, one: string, many: string): string {
  if (n === 0) return `no ${many}`;
  return n === 1 ? `one ${one}` : `${n} ${many}`;
}

/** "A, B, C and 4 others" (cast members first, then by name). */
function nameList(state: GameState, ids: PoliticianId[], max = 3): string {
  const people = ids
    .map((id) => getPolitician(state, id))
    .sort(
      (a, b) =>
        Number(b.castKey !== null) - Number(a.castKey !== null) ||
        compareStrings(displayName(a), displayName(b)),
    );
  const names = people.slice(0, max).map(displayName);
  const rest = people.length - names.length;
  if (rest > 0) return `${names.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

function toneFor(player: Politician): StoryTone {
  const media = player.reputation.media;
  if (media >= 10) return 'flattering';
  if (media <= -5) return 'sneering';
  return 'neutral';
}

/** Builds one edition: world slots, template choice with a no-repeat ring buffer, filler. */
class EditionBuilder {
  private readonly used = new Set<string>();
  private readonly recent: string[];
  private readonly recentIndex = new Map<string, number>();
  private readonly world: TemplateVars;
  private readonly staff: Record<string, string>;
  private readonly govBackbenchers: PoliticianId[];
  private readonly ministers: PoliticianId[];
  private articleSeq = 0;
  readonly masthead: MastheadDefinition;
  readonly tone: StoryTone;

  constructor(
    private readonly state: GameState,
    private readonly content: ContentRegistry,
    private readonly rng: Rng,
    style: PaperStyle,
    private readonly editionTurn: number,
    recent: string[],
  ) {
    const papers = content.newspaper.mastheads;
    const masthead = papers.find((m) => m.style === style) ?? papers[0];
    if (!masthead) throw new Error('Newspaper content has no mastheads');
    this.masthead = masthead;
    this.recent = recent.slice();
    this.recent.forEach((id, i) => this.recentIndex.set(id, i));
    const player = getPolitician(state, state.player.politicianId);
    this.tone = toneFor(player);
    this.staff = this.pickStaff();
    this.world = this.worldVars(player);
    const gov = new Set<PartyId>(state.parliament.governmentPartyIds);
    this.govBackbenchers = state.politicians.ids.filter((id) => {
      const p = state.politicians.byId[id];
      return (
        p !== undefined &&
        isSitting(p) &&
        !p.isPlayer &&
        p.offices.length === 0 &&
        p.partyId !== null &&
        gov.has(p.partyId)
      );
    });
    this.ministers = Object.keys(state.government.appointments)
      .sort(compareStrings)
      .filter((k) => content.offices[k as keyof typeof content.offices]?.kind === 'cabinet')
      .map((k) => state.government.appointments[k as keyof typeof state.government.appointments])
      .filter((id): id is PoliticianId => id !== null && id !== undefined);
  }

  /** The paper's staff: a stable cast of bylines per campaign and masthead. */
  private pickStaff(): Record<string, string> {
    const pool = this.content.newspaper.journalists;
    const taken = new Set<number>();
    const out: Record<string, string> = {};
    for (const role of ['politicalEditor', 'lobby', 'sketch', 'local', 'sport']) {
      let i = hashInt(this.state.meta.seed, this.masthead.key, role) % pool.length;
      while (taken.has(i) && taken.size < pool.length) i = (i + 1) % pool.length;
      taken.add(i);
      out[role] = pool[i] ?? 'Staff Reporter';
    }
    return out;
  }

  private worldVars(player: Politician): TemplateVars {
    const s = this.state;
    const seat = player.constituencyId ? s.constituencies.byId[player.constituencyId] : undefined;
    const pm = findPolitician(s, s.government.primeMinisterId);
    const cwId = chiefWhipId(s);
    const cw = cwId ? findPolitician(s, cwId) : undefined;
    const govParty = s.parties.byId[s.parliament.governmentPartyIds[0] ?? ('' as PartyId)];
    const opposition = s.parties.ids
      .map((id) => s.parties.byId[id])
      .filter((p) => p !== undefined && !s.parliament.governmentPartyIds.includes(p.id))
      .sort((a, b) => (s.parliament.seats[b!.id] ?? 0) - (s.parliament.seats[a!.id] ?? 0))[0];
    // The flagship (first) bill, even after it falls: the paper keeps writing about it.
    const anyBill = s.parliament.bills.byId[s.parliament.bills.ids[0] ?? ('' as never)];
    const sponsor = anyBill ? findPolitician(s, anyBill.sponsorId) : undefined;
    const rebelLeaders = s.factions.ids
      .map((id) => s.factions.byId[id])
      .filter(
        (f) =>
          f !== undefined &&
          f.leaderId !== null &&
          s.parliament.governmentPartyIds.includes(f.partyId) &&
          (sponsor === undefined || f.id !== sponsor.factionId),
      )
      .map((f) => getPolitician(s, f!.leaderId!));
    const leader = (i: number) => rebelLeaders[i];
    return {
      player: displayName(player),
      playerFirst: player.name.first,
      playerLast: lastName(player),
      seat: seat?.name ?? 'the constituency',
      seatMajority: seat ? formatNumber(majorityOf(seat)) : 'a few',
      pm: pm ? displayName(pm) : 'the Prime Minister',
      pmLast: pm ? lastName(pm) : 'the Prime Minister',
      chiefWhip: cw ? displayName(cw) : 'the Chief Whip',
      chiefWhipLast: cw ? lastName(cw) : 'the Chief Whip',
      sponsor: sponsor ? displayName(sponsor) : 'the minister',
      sponsorLast: sponsor ? lastName(sponsor) : 'the minister',
      party: govParty?.name ?? 'the government',
      partyShort: govParty?.shortName ?? 'government',
      opposition: opposition?.name ?? 'the opposition',
      govMajority: formatNumber(governmentMajority(s)),
      bill: anyBill?.title ?? 'flagship bill',
      rebelLeader: leader(0) ? displayName(leader(0)!) : 'a senior backbencher',
      rebelLeaderLast: leader(0) ? lastName(leader(0)!) : 'a senior backbencher',
      rebelLeader2: leader(1) ? displayName(leader(1)!) : 'another backbencher',
      rebelLeader2Last: leader(1) ? lastName(leader(1)!) : 'another backbencher',
      ...this.staff,
    };
  }

  /** Fresh local colour for one article (always the same number of draws). */
  private localVars(): TemplateVars {
    const s = this.state;
    const r = this.rng;
    const names = this.content.names;
    const seatIds = s.constituencies.ids;
    const seatName = () => s.constituencies.byId[r.pick(seatIds)]?.name ?? 'Little Snoring';
    const councillor = () =>
      `${r.pick([...names.female, ...names.male])} ${r.pick(names.surnames)}`;
    const place = seatName();
    let place2 = seatName();
    if (place2 === place) place2 = seatName();
    const mp = findPolitician(
      s,
      r.pick(this.govBackbenchers.length > 0 ? this.govBackbenchers : s.politicians.ids),
    );
    const minister = findPolitician(
      s,
      r.pick(this.ministers.length > 0 ? this.ministers : s.politicians.ids),
    );
    const vars: TemplateVars = {
      place,
      place2,
      councillor: councillor(),
      councillor2: councillor(),
      mp: mp ? displayName(mp) : 'a local MP',
      mpLast: mp ? lastName(mp) : 'the local MP',
      mpSeat:
        mp?.constituencyId !== null && mp?.constituencyId !== undefined
          ? (s.constituencies.byId[mp.constituencyId]?.name ?? place)
          : place,
      minister: minister ? displayName(minister) : 'a cabinet minister',
      ministerLast: minister ? lastName(minister) : 'the minister',
      n: r.int(2, 9),
      big: r.int(11, 400),
    };
    for (const key of Object.keys(this.content.newspaper.pools).sort(compareStrings)) {
      const pool = this.content.newspaper.pools[key];
      if (pool && pool.length > 0) vars[key] = r.pick(pool);
    }
    return vars;
  }

  /** Choose a template: right kind, style and tone; not used this edition; not recently used. */
  private choose<K extends string>(pool: StoryTemplate<K>[], kind: K): StoryTemplate<K> | null {
    const style = this.masthead.style;
    const fits = pool.filter(
      (t) =>
        t.kind === kind &&
        !this.used.has(t.id) &&
        (t.styles === undefined || t.styles.includes(style)) &&
        (t.tone === undefined || t.tone === this.tone),
    );
    if (fits.length === 0) return null;
    const fresh = fits.filter((t) => !this.recentIndex.has(t.id));
    const pick =
      fresh.length > 0
        ? this.rng.pick(fresh)
        : fits.reduce((best, t) =>
            (this.recentIndex.get(t.id) ?? -1) < (this.recentIndex.get(best.id) ?? -1) ? t : best,
          );
    this.used.add(pick.id);
    this.recent.push(pick.id);
    return pick;
  }

  private byline(role: BylineRole | null): string | null {
    if (role === null) return null;
    const options = this.masthead.bylines[role];
    return options.length > 0 ? fillTemplate(this.rng.pick(options), this.staff) : null;
  }

  private article(
    t: StoryTemplate,
    vars: TemplateVars,
    importance: number,
    filler: boolean,
    byline: BylineRole | null,
    refs: Ref[],
  ): NewsArticle {
    this.articleSeq += 1;
    let headline = fillTemplate(t.headline, vars);
    if (!filler && this.masthead.style === 'tabloid') headline = headline.toUpperCase();
    const standfirst = fillTemplate(t.standfirst, vars);
    const body = fillTemplate(t.body, vars);
    return {
      id: `ed${this.editionTurn}-${String(this.articleSeq).padStart(2, '0')}`,
      headline,
      standfirst: standfirst === '' ? null : standfirst,
      byline: this.byline(byline),
      body: body === '' ? null : body,
      importance: Math.max(1, Math.min(5, Math.round(importance))),
      filler,
      refs,
    };
  }

  politicsArticle(story: Story, role: BylineRole): NewsArticle | null {
    const t = this.choose(this.content.newspaper.politics, story.kind);
    if (!t) return null;
    const vars = { ...this.world, ...this.localVars(), ...story.vars };
    return this.article(t, vars, story.importance, false, role, story.refs);
  }

  fillerArticle(section: FillerSectionKey, prevHeadline: string | null): NewsArticle | null {
    const t = this.choose(this.content.newspaper.filler, section);
    if (!t) return null;
    const local = this.localVars();
    const vars: TemplateVars = { ...this.world, ...local };
    if (prevHeadline !== null) vars.prevHeadline = prevHeadline;
    const refs: Ref[] = [];
    const placeId = this.state.constituencies.ids.find(
      (id) => this.state.constituencies.byId[id]?.name === local.place,
    );
    if (placeId && /\{place\}/.test(`${t.headline} ${t.standfirst} ${t.body}`))
      refs.push({ kind: 'constituency', id: placeId });
    return this.article(t, vars, 1, true, BYLINE_FOR_FILLER[section], refs);
  }

  /** Weighted choice of distinct filler sections. */
  pickFillerSections(count: number, allowCorrections: boolean): FillerSectionKey[] {
    const keys = (Object.keys(FILLER_WEIGHTS) as FillerSectionKey[]).filter(
      (k) => allowCorrections || k !== 'corrections',
    );
    const out: FillerSectionKey[] = [];
    let remaining = keys;
    while (out.length < count && remaining.length > 0) {
      const k = this.rng.weighted(remaining, (x) => FILLER_WEIGHTS[x]);
      out.push(k);
      remaining = remaining.filter((x) => x !== k);
    }
    return out;
  }

  masthead_(date: SimDate): NewspaperEdition['masthead'] {
    const m = this.masthead;
    return {
      title: m.title,
      slogan: this.rng.pick(m.slogans),
      price: m.price,
      edition: `No. ${formatNumber(m.editionBase + this.editionTurn)} · ${this.rng.pick(m.editionLabels)}`,
      date,
    };
  }

  recentTemplates(): string[] {
    return this.recent.slice(-MAX_RECENT_STORY_TEMPLATES);
  }
}

/** Sort by importance (stable), apply per-kind / per-group caps, keep the first `max`. */
function selectStories(candidates: Story[], max: number): Story[] {
  const indexed = candidates.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => b.s.importance - a.s.importance || a.i - b.i);
  const counts = new Map<string, number>();
  // Tea-room stories (gossip, friendships, feuds) never feature the same person twice.
  const teaRoomPeople = new Set<string>();
  const out: Story[] = [];
  for (const { s } of indexed) {
    const group = s.group ?? s.kind;
    const cap = GROUP_CAPS[group] ?? 1;
    const n = counts.get(group) ?? 0;
    if (n >= cap) continue;
    if (group === 'gossip' || group === 'relationship') {
      const people = s.refs.filter((r) => r.kind === 'politician').map((r) => r.id);
      if (people.some((id) => teaRoomPeople.has(id))) continue;
      for (const id of people) teaRoomPeople.add(id);
    }
    counts.set(group, n + 1);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function assemble(
  b: EditionBuilder,
  stories: Story[],
  date: SimDate,
  previous: NewspaperEdition | null,
): NewspaperEdition {
  const articles: NewsArticle[] = [];
  stories.forEach((s, i) => {
    const role: BylineRole = i === 0 ? 'lead' : s.kind === 'player.sketch' ? 'sketch' : 'politics';
    const a = b.politicsArticle(s, role);
    if (a) articles.push(a);
  });
  const [lead, ...politics] = articles;
  if (!lead) throw new Error('Newspaper edition has no lead story');
  // Filler is about a quarter of the paper.
  const fillerCount = Math.max(2, Math.min(4, Math.round(articles.length / 3)));
  const prevHeadlines = previous
    ? [previous.lead, ...previous.sections.flatMap((s) => s.articles)].map((a) => a.headline)
    : [];
  const sections = new Map<NewspaperSectionKey, NewsArticle[]>();
  if (politics.length > 0) sections.set('politics', politics);
  for (const key of b.pickFillerSections(fillerCount, prevHeadlines.length > 0)) {
    const prev =
      prevHeadlines.length > 0
        ? (prevHeadlines[hashInt(key, date) % prevHeadlines.length] ?? null)
        : null;
    const a = b.fillerArticle(key, prev);
    if (a) sections.set(key, [a]);
  }
  return {
    paperKey: b.masthead.key,
    masthead: b.masthead_(date),
    lead,
    sections: NEWSPAPER_SECTION_KEYS.filter((k) => sections.has(k)).map((k) => ({
      key: k,
      title: b.masthead.sectionTitles[k],
      articles: sections.get(k) ?? [],
    })),
  };
}

/** Briefing headlines (the pre-newspaper API field) derived from the lead and politics column. */
export function headlinesFrom(edition: NewspaperEdition): Headline[] {
  const politics = edition.sections.find((s) => s.key === 'politics')?.articles ?? [];
  return [edition.lead, ...politics].slice(0, 5).map((a) => ({
    text: a.headline,
    standfirst: a.standfirst,
    importance: a.importance,
  }));
}

function person(state: GameState, id: PoliticianId): TemplateVars {
  const p = getPolitician(state, id);
  return { actor: displayName(p), actorLast: lastName(p) };
}
function targetVars(state: GameState, id: PoliticianId): TemplateVars {
  const p = getPolitician(state, id);
  return { target: displayName(p), targetLast: lastName(p) };
}
function officeVars(content: ContentRegistry, key: string): TemplateVars {
  return { office: content.offices[key as keyof typeof content.offices]?.label ?? key };
}
const polRef = (id: string): Ref => ({ kind: 'politician', id });

function pollStory(state: GameState, importance: number): Story | null {
  const govId = state.parliament.governmentPartyIds[0];
  if (!govId) return null;
  const opp = state.parties.ids
    .filter((id) => !state.parliament.governmentPartyIds.includes(id))
    .sort((a, b) => (state.parliament.seats[b] ?? 0) - (state.parliament.seats[a] ?? 0))[0];
  if (!opp) return null;
  const share = Math.round((state.opinion.polls[govId] ?? 0) * 100);
  const oppShare = Math.round((state.opinion.polls[opp] ?? 0) * 100);
  const gap = share - oppShare;
  return {
    kind: 'poll',
    importance,
    vars: {
      share,
      oppShare,
      pollGap:
        gap >= 0
          ? `a lead of ${plural(gap, 'point', 'points').replace(/^no points$/, 'no points')}`
          : `a deficit of ${plural(-gap, 'point', 'points')}`,
    },
    refs: [
      { kind: 'party', id: govId },
      { kind: 'party', id: opp },
    ],
  };
}

function upcomingStory(state: GameState, fromTurn: number, within: number): Story | null {
  const next = scheduledDivisions(state).find(
    (d) => d.turn > fromTurn && d.turn - fromTurn <= within,
  );
  if (!next) return null;
  return {
    kind: 'division.upcoming',
    importance: next.turn - fromTurn === 1 ? 3 : 2,
    vars: {
      bill: getBill(state, next.billId).title,
      stage: stageLabel(next.stage).toLowerCase(),
      Stage: stageLabel(next.stage),
      date: formatSimDate(next.scheduledFor),
    },
    refs: [
      { kind: 'division', id: next.id },
      { kind: 'bill', id: next.billId },
    ],
  };
}

/** Story candidates for the week just resolved, from its records and signals. */
function weeklyStories(draft: GameState, tc: TurnContext): { stories: Story[]; dramatic: boolean } {
  const out: Story[] = [];
  const me = getPolitician(draft, draft.player.politicianId);
  const playerRef = polRef(me.id);
  const content = tc.content;
  let dramatic = false;

  for (const divId of tc.divisionsHeld) {
    const div = getDivision(draft, divId);
    const res = div.result;
    if (!res) continue;
    const bill = getBill(draft, div.billId);
    const govRebels = res.rebels
      .map((r) => r.politicianId)
      .filter((id) => isGovernmentParty(draft, getPolitician(draft, id).partyId));
    const margin = Math.abs(res.ayes - res.noes);
    const vars: TemplateVars = {
      bill: bill.title,
      stage: stageLabel(div.stage).toLowerCase(),
      Stage: stageLabel(div.stage),
      ayes: res.ayes,
      noes: res.noes,
      margin,
      count: govRebels.length,
      govRebels: plural(govRebels.length, 'government MP', 'government MPs'),
      rebelCount: plural(govRebels.length, 'rebel', 'rebels'),
      date: formatSimDate(div.scheduledFor),
    };
    const refs: Ref[] = [
      { kind: 'division', id: div.id },
      { kind: 'bill', id: bill.id },
    ];
    const kind: PoliticsStoryKind = !res.governmentWon
      ? 'division.lost'
      : margin >= COMFORTABLE_MARGIN
        ? 'division.won_comfortably'
        : 'division.won_narrowly';
    if (!res.governmentWon || govRebels.length >= DRAMATIC_REBELLION) dramatic = true;
    out.push({ kind, importance: 5, vars, refs });
    if (govRebels.length >= REBELLION_STORY) {
      out.push({
        kind: 'division.rebellion',
        importance: 4,
        vars: { ...vars, rebels: nameList(draft, govRebels) },
        refs: [...refs, ...govRebels.slice(0, 3).map(polRef)],
      });
    }
    if (govRebels.length >= 1 && chiefWhipId(draft) !== null)
      out.push({ kind: 'division.chief_whip', importance: 3, vars, refs });
    const myVote = res.votes[me.id];
    if (myVote !== undefined) {
      if (res.rebels.some((r) => r.politicianId === me.id)) {
        dramatic = true;
        out.push({
          kind: 'player.rebelled',
          importance: 4,
          vars: { ...vars, voteVerb: VOTE_VERB[myVote] },
          refs: [playerRef, ...refs],
        });
      } else if (isGovernmentParty(draft, me.partyId)) {
        out.push({
          kind: 'division.player_loyal',
          importance: 2,
          vars,
          refs: [playerRef, ...refs],
        });
      }
    }
  }

  for (const r of tc.history) {
    switch (r.type) {
      case 'appointment': {
        const p = r.payload;
        const vars = { ...person(draft, p.politicianId), ...officeVars(content, p.officeKey) };
        if (p.politicianId === me.id)
          out.push({ kind: 'player.promoted', importance: 4, vars, refs: [playerRef] });
        else if (r.importance >= 3)
          out.push({
            kind: 'appointment',
            group: 'appointment',
            importance: 3,
            vars,
            refs: [polRef(p.politicianId)],
          });
        break;
      }
      case 'resignation':
      case 'dismissal': {
        const p = r.payload;
        if (r.importance < 3 && p.politicianId !== me.id) break;
        if (r.type === 'resignation' || r.importance >= 4) dramatic = true;
        out.push({
          kind: r.type,
          importance: r.type === 'resignation' ? 4 : 3,
          vars: { ...person(draft, p.politicianId), ...officeVars(content, p.officeKey) },
          refs: [polRef(p.politicianId)],
        });
        break;
      }
      case 'promise': {
        const p = r.payload;
        if (p.promiserId !== me.id) break;
        if (!p.kept) dramatic = true;
        out.push({
          kind: p.kept ? 'promise.kept' : 'promise.broken',
          importance: p.kept ? 3 : 4,
          vars: targetVars(draft, p.promiseeId),
          refs: [playerRef, polRef(p.promiseeId)],
        });
        break;
      }
      case 'relationship_change': {
        const p = r.payload;
        const from = getPolitician(draft, p.from);
        const to = getPolitician(draft, p.to);
        const notable = (x: Politician) => x.castKey !== null || x.isPlayer;
        if (!notable(from) || !notable(to)) break;
        const warmed = p.trust + p.respect + p.affinity > 0;
        out.push({
          kind: warmed ? 'relationship.warmed' : 'relationship.soured',
          group: 'relationship',
          importance: 2,
          vars: { ...person(draft, p.from), ...targetVars(draft, p.to) },
          refs: [polRef(p.from), polRef(p.to)],
        });
        break;
      }
      case 'policy_announcement':
        out.push({
          kind: 'concession',
          importance: 4,
          vars: { bill: getBill(draft, r.payload.billId).title },
          refs: [{ kind: 'bill', id: r.payload.billId }],
        });
        break;
      case 'event': {
        const p = r.payload;
        const actorId = r.actorIds[0];
        if (
          p.definitionKey === 'event.minister_considers_position' &&
          p.optionKey !== 'resign' &&
          actorId !== undefined
        ) {
          const holder = getPolitician(draft, actorId);
          const office = holder.offices.find((o) => content.offices[o.officeKey]?.ministerial);
          out.push({
            kind: 'minister.considering',
            importance: 3,
            vars: {
              ...person(draft, actorId),
              ...officeVars(content, office?.officeKey ?? 'office.housing_secretary'),
            },
            refs: [polRef(actorId)],
          });
        }
        break;
      }
      case 'action_outcome': {
        const p = r.payload;
        const actorId = r.actorIds[0];
        if (actorId === undefined || p.status === 'rejected') break;
        const actor = getPolitician(draft, actorId);
        const subject = r.subjectIds[0];
        if (actorId === me.id) {
          if (p.kind === 'support_legislation')
            out.push({ kind: 'player.backed_bill', importance: 2, vars: {}, refs: [playerRef] });
          else if (p.kind === 'oppose_legislation')
            out.push({ kind: 'player.opposed_bill', importance: 3, vars: {}, refs: [playerRef] });
          else if (p.kind === 'rebel_against_party' && subject) {
            const div = draft.parliament.divisions.byId[subject as DivisionId];
            const vote = div?.declarations[me.id]?.vote ?? 'no';
            out.push({
              kind: 'player.declared_rebellion',
              importance: 3,
              vars: { voteIntent: VOTE_INTENT[vote] },
              refs: [playerRef],
            });
          } else if (p.kind === 'seek_endorsement' && p.status === 'succeeded' && subject)
            out.push({
              kind: 'player.endorsed',
              importance: 2,
              vars: targetVars(draft, subject as PoliticianId),
              refs: [playerRef, polRef(subject)],
            });
          else if (p.kind === 'request_promotion' && p.status === 'failed')
            out.push({ kind: 'player.passed_over', importance: 2, vars: {}, refs: [playerRef] });
          break;
        }
        if (actor.castKey === null) break;
        if (
          (p.kind === 'build_relationship' || p.kind === 'seek_endorsement') &&
          subject &&
          findPolitician(draft, subject)
        ) {
          out.push({
            kind: 'gossip.courting',
            group: 'gossip',
            importance: 2,
            vars: { ...person(draft, actorId), ...targetVars(draft, subject as PoliticianId) },
            refs: [polRef(actorId), polRef(subject)],
          });
        } else if (p.kind === 'support_legislation' || p.kind === 'oppose_legislation') {
          out.push({
            kind: 'gossip.lobbying',
            group: 'gossip',
            importance: 2,
            vars: {
              ...person(draft, actorId),
              lobbyStance: p.kind === 'support_legislation' ? 'for' : 'against',
            },
            refs: [polRef(actorId)],
          });
        } else if (p.kind === 'rebel_against_party' && subject) {
          // Only plots the lobby could plausibly have heard of: the whips or the player know.
          const div = draft.parliament.divisions.byId[subject as DivisionId];
          const known =
            div?.whipIntel[actorId] !== undefined ||
            tc.intel.some((i) => i.politicianId === actorId);
          if (!known) break;
          out.push({
            kind: 'gossip.plotting',
            group: 'gossip',
            importance: 3,
            vars: {
              ...person(draft, actorId),
              voteIntent: VOTE_INTENT[div?.declarations[actorId]?.vote ?? 'no'],
            },
            refs: [polRef(actorId)],
          });
        }
        break;
      }
      default:
        break;
    }
  }

  for (const f of [...tc.flags].sort(compareStrings)) {
    if (!f.startsWith('headline:reshuffle:')) continue;
    const count = Number(f.split(':')[2] ?? 0);
    if (count > 0) {
      const changes = plural(count, 'change', 'changes');
      out.push({
        kind: 'reshuffle',
        importance: 4,
        vars: { count, changes, Changes: changes.charAt(0).toUpperCase() + changes.slice(1) },
        refs: [],
      });
    }
  }

  for (const ev of tc.raisedEvents) {
    if (ev.definitionKey !== 'event.constituency_green_belt_protest') continue;
    const mp = getPolitician(draft, ev.addresseeId);
    const seat = mp.constituencyId ? draft.constituencies.byId[mp.constituencyId] : undefined;
    if (!seat) continue;
    out.push({
      kind: 'protest',
      importance: 3,
      vars: { protestSeat: seat.name, protestMp: displayName(mp) },
      refs: [{ kind: 'constituency', id: seat.id }, polRef(mp.id)],
    });
  }

  if (draft.government.stability <= -20)
    out.push({
      kind: 'stability.low',
      importance: 3,
      vars: { stability: draft.government.stability },
      refs: [],
    });

  const upcoming = upcomingStory(draft, tc.turn, 2);
  if (upcoming) out.push(upcoming);

  // A poll every third week, after a division, or when the paper is thin.
  if (tc.turn % 3 === 0 || tc.divisionsHeld.length > 0 || out.length < 4) {
    const poll = pollStory(draft, 1);
    if (poll) out.push(poll);
  }

  // The sketch writer fills in when the paper has nothing else to say about the player.
  const playerKinds = out.some(
    (s) =>
      s.kind.startsWith('player.') ||
      s.kind.startsWith('promise.') ||
      s.kind === 'division.player_loyal',
  );
  if (!playerKinds) out.push({ kind: 'player.sketch', importance: 1, vars: {}, refs: [playerRef] });

  if (!out.some((s) => s.importance >= 3))
    out.push({ kind: 'quiet_week', importance: 3, vars: {}, refs: [] });

  // A resignation or rebellion by a cabinet minister is drama even without a division.
  if (out.some((s) => s.kind === 'resignation')) dramatic = true;
  return { stories: out, dramatic };
}

/**
 * The weekly edition, compiled in the chronicle phase from the week's records. Returns the edition
 * and the updated template ring buffer (both stored in the briefing).
 */
export function compileNewspaper(
  draft: GameState,
  tc: TurnContext,
): { edition: NewspaperEdition; recentStoryTemplates: string[] } {
  const { stories, dramatic } = weeklyStories(draft, tc);
  const style: PaperStyle = dramatic
    ? 'tabloid'
    : tc.divisionsHeld.length > 0
      ? 'record'
      : ((['broadsheet', 'record', 'tabloid'] as const)[tc.turn % 3] ?? 'broadsheet');
  const editionTurn = tc.turn + 1;
  const b = new EditionBuilder(
    draft,
    tc.content,
    tc.rng('newspaper'),
    style,
    editionTurn,
    draft.briefing.recentStoryTemplates,
  );
  const edition = assemble(
    b,
    selectStories(stories, MAX_POLITICS),
    addDays(tc.date, 5),
    draft.briefing.newspaper,
  );
  return { edition, recentStoryTemplates: b.recentTemplates() };
}

/** The opening edition at campaign creation: the new Parliament, the player, the flagship bill. */
export function openingNewspaper(
  state: GameState,
  content: ContentRegistry,
): { edition: NewspaperEdition; recentStoryTemplates: string[] } {
  const me = getPolitician(state, state.player.politicianId);
  const bill = state.parliament.bills.byId[state.parliament.bills.ids[0] ?? ('' as never)];
  const first = scheduledDivisions(state)[0];
  const billVars: TemplateVars = first
    ? {
        stage: stageLabel(first.stage).toLowerCase(),
        Stage: stageLabel(first.stage),
        date: formatSimDate(first.scheduledFor),
      }
    : { stage: 'second reading', Stage: 'Second reading', date: 'a date to be confirmed' };
  const pmId = state.government.primeMinisterId;
  const cw = chiefWhipId(state);
  const stories: Story[] = [
    { kind: 'opening.parliament', importance: 5, vars: {}, refs: [polRef(pmId)] },
    {
      kind: 'opening.bill',
      importance: 4,
      vars: billVars,
      refs: bill ? [{ kind: 'bill', id: bill.id }, polRef(bill.sponsorId)] : [],
    },
    { kind: 'opening.player', importance: 4, vars: {}, refs: [polRef(me.id)] },
    { kind: 'opening.rebels', importance: 3, vars: {}, refs: [] },
    { kind: 'opening.whips', importance: 3, vars: {}, refs: cw ? [polRef(cw)] : [] },
  ];
  const poll = pollStory(state, 2);
  if (poll) stories.push(poll);
  const b = new EditionBuilder(
    state,
    content,
    Rng.fork(state.meta.rng, 0, 'newspaper'),
    'broadsheet',
    state.meta.turn,
    [],
  );
  const edition = assemble(b, stories, state.meta.date, null);
  return { edition, recentStoryTemplates: b.recentTemplates() };
}
