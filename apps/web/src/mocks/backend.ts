/**
 * In-browser mock of the WHIP API (docs/architecture/05-api-auth-frontend.md §1).
 * Serves the real /api/v1 routes from an in-memory world so the SPA can be built and tested before the
 * Worker exists. Every request body is parsed with its contracts schema and every response is
 * validated against its contracts schema before it is returned.
 */
import {
  ActionCatalogueResponseSchema,
  AdvanceRequestSchema,
  CampaignListResponseSchema,
  CampaignSummarySchema,
  CancelActionRequestSchema,
  CancelActionResponseSchema,
  CareerOverviewSchema,
  CreateCampaignRequestSchema,
  ERROR_HTTP_STATUS,
  HealthResponseSchema,
  HistoryPageSchema,
  HistoryQuerySchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  MeResponseSchema,
  ParliamentViewSchema,
  PartyViewSchema,
  PlanActionRequestSchema,
  PlanActionResponseSchema,
  PoliticianListQuerySchema,
  PoliticianListResponseSchema,
  PoliticianProfileSchema,
  PoliticianSummarySchema,
  TurnReportSchema,
  TutorialStateSchema,
  TutorialUpdateSchema,
  type ErrorCode,
  type TutorialState,
} from '@whip/contracts';
import type { z } from 'zod';
import { DEFAULT_TUTORIAL, mergeTutorial } from '../api/tutorial-merge';
import { buildCatalogue, slotsLeft } from './catalogue';
import {
  CAMPAIGN_ID,
  FACTIONS,
  HDB_2R_DIVISION_ID,
  HDB_ID,
  PLAYER_ID,
  SECOND_CAMPAIGN_ID,
  addDays,
  buildWorld,
  greenBeltProtestEvent,
  hdbSecondReadingResult,
  hdbThirdReadingForecast,
  lobbyJournalistEvent,
  seedWorld,
  turnReportFixture,
  upcomingFor,
} from './fixtures';
import {
  newspaperFixture,
  openingNewspaperFixture,
  quietNewspaperFixture,
} from './newspaper-fixture';
import type {
  ActionOutcome,
  DivisionResult,
  Headline,
  HistoryItem,
  MockWorld,
  Notification,
  PlannedAction,
  PoliticianProfile,
  TurnReport,
  Vote,
} from './types';

export interface MockBackend {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Simulate the campaign advancing on another device (next mutation gets REVISION_CONFLICT). */
  bumpRevision(campaignId: string): void;
  /** Restore the seeded worlds and forget idempotency keys. */
  reset(): void;
}

class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface ParsedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: string | null;
}

interface Reply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const API_PREFIX = '/api/v1';

function validated<S extends z.ZodType>(schema: S, data: unknown, where: string): z.infer<S> {
  const res = schema.safeParse(data);
  if (!res.success) {
    throw new Error(`[mock api] invalid response for ${where}: ${res.error.message}`);
  }
  return res.data;
}

function parseBody<S extends z.ZodType>(schema: S, raw: string | null): z.infer<S> {
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError('VALIDATION_FAILED', 'Request body is not valid JSON.');
  }
  const res = schema.safeParse(json);
  if (!res.success) {
    throw new HttpError('VALIDATION_FAILED', 'Request body failed validation.', {
      issues: res.error.issues,
    });
  }
  return res.data;
}

async function readRequest(input: RequestInfo | URL, init?: RequestInit): Promise<ParsedRequest> {
  let href: string;
  let method = 'GET';
  const headers = new Headers();
  let body: string | null = null;
  if (typeof Request !== 'undefined' && input instanceof Request) {
    href = input.url;
    method = input.method;
    input.headers.forEach((v, k) => headers.set(k, v));
    const text = await input.text();
    body = text || null;
  } else {
    href = typeof input === 'string' ? input : (input as URL).href;
  }
  if (init?.method) method = init.method;
  if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  if (init?.body !== undefined && init.body !== null) {
    body = typeof init.body === 'string' ? init.body : await new Response(init.body).text();
  }
  return {
    method: method.toUpperCase(),
    url: new URL(href, 'http://mock.whip.local'),
    headers,
    body,
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function signed(n: number) {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

const VOTE_WORD: Record<Vote, string> = { aye: 'aye', no: 'no', abstain: 'abstain' };

export function createMockBackend(options: { latencyMs?: number } = {}): MockBackend {
  const latency = options.latencyMs ?? 0;
  let worlds = new Map<string, MockWorld>();
  let idempotency = new Map<string, { fingerprint: string; reply: Reply }>();
  /** The report stored by each campaign's most recent advance (GET turn-report/latest). */
  let lastReports = new Map<string, TurnReport>();
  /** Members' induction state per campaign (UI metadata: never touches revision or ETag). */
  let tutorials = new Map<string, TutorialState>();
  let campaignCounter = 1;
  let requestCounter = 1;

  function reset() {
    worlds = new Map();
    worlds.set(CAMPAIGN_ID, structuredClone(seedWorld));
    worlds.set(
      SECOND_CAMPAIGN_ID,
      buildWorld({
        id: SECOND_CAMPAIGN_ID,
        name: 'The Kesworth gamble',
        player: {
          firstName: 'Tom',
          lastName: 'Avery',
          gender: 'male',
          strength: 'oratory',
          ideologyPreset: 'heartlands',
        },
        fresh: true,
        createdAt: '2026-10-12T18:20:00.000Z',
        updatedAt: '2026-10-14T22:11:09.000Z',
      }),
    );
    idempotency = new Map();
    lastReports = new Map();
    tutorials = new Map();
    campaignCounter = 1;
  }
  reset();

  /* ---------------- helpers ---------------- */

  function getWorld(id: string): MockWorld {
    const w = worlds.get(id);
    if (!w) throw new HttpError('NOT_FOUND', 'Campaign not found.');
    return w;
  }

  function etag(w: MockWorld) {
    return { ETag: `"${w.summary.id}:${w.summary.revision}"` };
  }

  function politician(w: MockWorld, id: unknown): PoliticianProfile {
    const p = typeof id === 'string' ? w.politicians.find((x) => x.id === id) : undefined;
    if (!p) throw new HttpError('VALIDATION_FAILED', 'Unknown politician.', { field: 'targetId' });
    return p;
  }

  function player(w: MockWorld): PoliticianProfile {
    return politician(w, PLAYER_ID);
  }

  function overview(w: MockWorld) {
    const { briefing } = w.overview;
    // Mock mode prints a paper for every briefing (the API sends one when it has generated it).
    const newspaper = briefing.newspaper ?? mockPaper('opening', w.summary.simDate);
    return { campaign: w.summary, ...w.overview, briefing: { ...briefing, newspaper } };
  }

  /**
   * Mock mode's papers: engine-generated editions (newspaper-fixture.ts), dated to the mock's
   * calendar. The opening edition until a week resolves; then the division edition for the week
   * of a division and the quiet one otherwise.
   */
  function mockPaper(kind: 'opening' | 'division' | 'quiet', date: string) {
    const base =
      kind === 'opening'
        ? openingNewspaperFixture
        : kind === 'division'
          ? newspaperFixture
          : quietNewspaperFixture;
    const paper = structuredClone(base);
    paper.masthead = { ...paper.masthead, date };
    return paper;
  }

  function bumpRev(w: MockWorld) {
    w.summary.revision += 1;
    w.summary.updatedAt = new Date().toISOString();
  }

  function str(params: Record<string, unknown>, name: string): string {
    const v = params[name];
    if (typeof v !== 'string' || v.length === 0) {
      throw new HttpError('VALIDATION_FAILED', `Missing parameter "${name}".`, { field: name });
    }
    return v;
  }

  function voteParam(params: Record<string, unknown>, allowAye = true): Vote {
    const v = str(params, 'vote');
    if (v === 'no' || v === 'abstain' || (allowAye && v === 'aye')) return v;
    throw new HttpError('VALIDATION_FAILED', 'Invalid vote.', { field: 'vote' });
  }

  function divisionParam(w: MockWorld, params: Record<string, unknown>) {
    const id = str(params, 'divisionId');
    const d = w.parliament.upcomingDivisions.find((x) => x.id === id);
    if (!d)
      throw new HttpError('ACTION_INELIGIBLE', 'That division is not scheduled.', {
        reasons: ['That division is not scheduled.'],
      });
    return d;
  }

  function billParam(w: MockWorld, params: Record<string, unknown>) {
    const id = str(params, 'billId');
    const b = w.parliament.bills.find((x) => x.id === id && x.stage !== 'Royal Assent');
    if (!b)
      throw new HttpError('ACTION_INELIGIBLE', 'That bill is not before the House.', {
        reasons: ['That bill is not before the House.'],
      });
    return b;
  }

  function lobbyTargets(w: MockWorld, params: Record<string, unknown>): PoliticianProfile[] {
    const raw = params.lobbyTargetIds;
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 3 || !raw.every((x) => typeof x === 'string')) {
      throw new HttpError('VALIDATION_FAILED', 'Lobby up to three colleagues.', {
        field: 'lobbyTargetIds',
      });
    }
    return raw.map((id) => politician(w, id));
  }

  function target(w: MockWorld, params: Record<string, unknown>): PoliticianProfile {
    const p = politician(w, str(params, 'targetId'));
    if (p.isPlayer)
      throw new HttpError('ACTION_INELIGIBLE', 'You cannot target yourself.', {
        reasons: ['You cannot target yourself.'],
      });
    return p;
  }

  function ineligible(reasons: string[]): never {
    throw new HttpError('ACTION_INELIGIBLE', reasons[0] ?? 'Action is not available.', { reasons });
  }

  /* ---------------- plan / cancel ---------------- */

  function plan(w: MockWorld, kind: PlannedAction['kind'], params: Record<string, unknown>) {
    const item = buildCatalogue(w).items.find((i) => i.kind === kind);
    if (!item) throw new HttpError('VALIDATION_FAILED', 'Unknown action.');
    if (!item.eligible) ineligible(item.reasons);
    let slots = item.slots;
    let capitalCost = item.capitalCost;
    let label: string;
    let removedEvent: MockWorld['overview']['pendingEvents'][number] | null = null;
    const cleanParams: Record<string, unknown> = { ...params };

    switch (kind) {
      case 'meet_politician':
        label = `Meet ${target(w, params).name}`;
        break;
      case 'build_relationship':
        label = `Build relationship with ${target(w, params).name}`;
        break;
      case 'seek_endorsement': {
        const t = target(w, params);
        const factionLeader = w.party.factions.some((f) => f.leader.id === t.id);
        if (t.offices.length === 0 && !factionLeader) {
          ineligible([`${t.name} holds no office and leads no faction.`]);
        }
        label = `Seek ${t.name}’s endorsement`;
        break;
      }
      case 'make_political_promise': {
        const t = target(w, params);
        const d = divisionParam(w, params);
        const v = voteParam(params);
        label = `Promise ${t.name}: ${VOTE_WORD[v]} on ${d.billTitle}`;
        break;
      }
      case 'support_legislation':
      case 'oppose_legislation': {
        const b = billParam(w, params);
        const targets = lobbyTargets(w, params);
        label = `${kind === 'support_legislation' ? 'Support' : 'Oppose'} the ${b.title}`;
        if (targets.length)
          label += ` (lobbying ${targets.map((t) => t.name.split(' ').slice(-1)[0]).join(', ')})`;
        break;
      }
      case 'rebel_against_party': {
        const d = divisionParam(w, params);
        const v = voteParam(params, false);
        label = `Rebel: vote ${VOTE_WORD[v]} on ${d.billTitle}`;
        break;
      }
      case 'request_promotion':
        label = 'Ask the Chief Whip for promotion';
        break;
      case 'respond_to_event': {
        const eventId = str(params, 'eventId');
        const optionKey = str(params, 'optionKey');
        const ev = w.overview.pendingEvents.find((e) => e.id === eventId);
        if (!ev) ineligible(['That event is no longer in your inbox.']);
        const opt = ev.options.find((o) => o.key === optionKey);
        if (!opt)
          throw new HttpError('VALIDATION_FAILED', 'Unknown event option.', { field: 'optionKey' });
        if (opt.capitalCost > w.overview.standing.politicalCapital) {
          ineligible([
            `Needs ${opt.capitalCost} political capital — you have ${w.overview.standing.politicalCapital}.`,
          ]);
        }
        slots = 0;
        capitalCost = opt.capitalCost;
        label = `${ev.title}: ${opt.label}`;
        removedEvent = ev;
        w.overview.pendingEvents = w.overview.pendingEvents.filter((e) => e.id !== ev.id);
        break;
      }
      case 'call_reshuffle':
        ineligible(['Only the Prime Minister can call a reshuffle.']);
    }

    if (slots > slotsLeft(w))
      ineligible([`Needs ${slots} diary slots — ${slotsLeft(w)} left this week.`]);

    const planned: PlannedAction = {
      id: `pa_${w.meta.nextPlannedId++}`,
      kind,
      label,
      slots,
      capitalCost,
      params: cleanParams,
    };
    if (removedEvent) w.meta.plannedEvents[planned.id] = removedEvent;
    w.overview.diary.planned.push(planned);
    w.overview.diary.slotsUsed += slots;
    w.overview.standing.politicalCapital -= capitalCost;
    bumpRev(w);
    return planned;
  }

  function cancel(w: MockWorld, plannedId: string) {
    const idx = w.overview.diary.planned.findIndex((p) => p.id === plannedId);
    const planned = w.overview.diary.planned[idx];
    if (!planned) throw new HttpError('NOT_FOUND', 'Planned action not found.');
    w.overview.diary.planned.splice(idx, 1);
    w.overview.diary.slotsUsed -= planned.slots;
    w.overview.standing.politicalCapital += planned.capitalCost;
    const ev = w.meta.plannedEvents[planned.id];
    if (ev) {
      w.overview.pendingEvents.push(ev);
      delete w.meta.plannedEvents[planned.id];
    }
    bumpRev(w);
  }

  /* ---------------- advance ---------------- */

  function adjustRelationship(
    p: PoliticianProfile,
    delta: Partial<Record<'trust' | 'respect' | 'affinity' | 'obligation', number>>,
  ) {
    const base = p.relationship.towardsPlayer ?? {
      trust: 0,
      respect: 0,
      affinity: 0,
      obligation: 0,
      rivalry: 0,
    };
    const next = {
      ...base,
      trust: clamp(base.trust + (delta.trust ?? 0), -100, 100),
      respect: clamp(base.respect + (delta.respect ?? 0), -100, 100),
      affinity: clamp(base.affinity + (delta.affinity ?? 0), -100, 100),
      obligation: clamp(base.obligation + (delta.obligation ?? 0), -100, 100),
    };
    p.relationship.towardsPlayer = next;
    p.relationshipToPlayer = next;
  }

  function adjustRep(
    w: MockWorld,
    key: keyof MockWorld['overview']['standing']['reputation'],
    delta: number,
  ) {
    const rep = w.overview.standing.reputation;
    rep[key] = clamp(rep[key] + delta, 0, 100);
    player(w).reputation = { ...rep };
  }

  function revealIntention(w: MockWorld, p: PoliticianProfile): string | null {
    const d = w.parliament.upcomingDivisions.find((x) => x.id === HDB_2R_DIVISION_ID);
    const actual = w.hiddenIntentions[p.id];
    if (!d || !actual) return null;
    const wasUnknown = p.knownIntention === 'unknown' || p.knownIntention === null;
    p.knownIntention = actual;
    if (wasUnknown && d.forecast.unknown > 0) {
      d.forecast.unknown -= 1;
      if (actual === 'aye') d.forecast.ayes += 1;
      else if (actual === 'no') d.forecast.noes += 1;
      else d.forecast.abstain += 1;
    }
    const existing = d.waverers.find((x) => x.id === p.id);
    if (existing) existing.known = actual;
    else if (p.partyShort === 'NPP' && actual !== 'aye') {
      d.waverers.push({ id: p.id, name: p.name, partyShort: p.partyShort, known: actual });
    }
    return `Revealed: ${p.name} intends to vote ${VOTE_WORD[actual]} on ${d.billTitle} ${d.stage.toLowerCase()}`;
  }

  function resolveAction(
    w: MockWorld,
    a: PlannedAction,
    turn: number,
    intel: MockWorld['overview']['intelligence'],
  ): ActionOutcome {
    const base = { plannedActionId: a.id, kind: a.kind, label: a.label };
    const params = a.params;
    const me = player(w);
    const skill = (k: string) => me.skills[k] ?? 10;
    switch (a.kind) {
      case 'meet_politician': {
        const t = politician(w, params.targetId);
        const trust = 2 + Math.round(skill('negotiation') / 4);
        const affinity = 1 + ((t.name.length + turn) % 4);
        adjustRelationship(t, { trust, affinity });
        const effects = [
          `${t.name}: trust ${signed(trust)}`,
          `${t.name}: affinity ${signed(affinity)}`,
        ];
        const revealed = revealIntention(w, t);
        if (revealed) {
          effects.push(revealed);
          intel.unshift({
            turn,
            text: `${t.name} told you over coffee that they will vote ${t.knownIntention ?? 'unknown'} on the housing bill.`,
            politicianId: t.id,
          });
        }
        t.relationship.memories.unshift({
          turn,
          text: `Met ${me.name} for coffee in Portcullis House`,
        });
        return {
          ...base,
          status: 'succeeded',
          summary: `A useful half-hour with ${t.name}.`,
          effects,
        };
      }
      case 'build_relationship': {
        const t = politician(w, params.targetId);
        const vain = t.traits.some((x) => x.key === 'vain');
        const affinity = vain ? 10 : 7;
        const respect = 5 + Math.round(skill('oratory') / 5);
        adjustRelationship(t, { affinity, respect, trust: 3 });
        t.relationship.memories.unshift({ turn, text: `Dinner with ${me.name}` });
        return {
          ...base,
          status: 'succeeded',
          summary: vain
            ? `${t.name} enjoyed being listened to.`
            : `A long dinner. ${t.name} warms to you.`,
          effects: [
            `${t.name}: affinity ${signed(affinity)}`,
            `${t.name}: respect ${signed(respect)}`,
            `${t.name}: trust +3`,
          ],
        };
      }
      case 'seek_endorsement': {
        const t = politician(w, params.targetId);
        const r = t.relationship.towardsPlayer;
        const ok = (r?.trust ?? 0) + (r?.respect ?? 0) >= 20;
        if (ok) {
          w.overview.standing.endorsements.push({ id: t.id, name: t.name });
          adjustRelationship(t, { obligation: -1 });
          return {
            ...base,
            status: 'succeeded',
            summary: `${t.name} agrees to put in a word for you.`,
            effects: [`Endorsement: ${t.name}`, `You owe ${t.name} a favour`],
          };
        }
        adjustRelationship(t, { respect: -2 });
        return {
          ...base,
          status: 'failed',
          summary: `${t.name} says it is "a little early" for that.`,
          effects: [`${t.name}: respect −2`],
        };
      }
      case 'make_political_promise': {
        const t = politician(w, params.targetId);
        adjustRelationship(t, { trust: 5, affinity: 2 });
        t.relationship.memories.unshift({
          turn,
          text: `${me.name} promised to vote ${String(params.vote)}`,
        });
        return {
          ...base,
          status: 'succeeded',
          summary: `${t.name} will hold you to it.`,
          effects: [
            `${t.name}: trust +5`,
            `${t.name}: affinity +2`,
            'Promise recorded: checked after the division',
          ],
        };
      }
      case 'support_legislation':
      case 'oppose_legislation': {
        const support = a.kind === 'support_legislation';
        const effects: string[] = [];
        const whips = support ? 4 : -6;
        adjustRep(w, 'whips', whips);
        effects.push(`Reputation with the whips: ${signed(whips)}`);
        adjustRep(w, 'public', 2);
        effects.push('Reputation with the public: +2');
        if (!support) {
          adjustRep(w, 'party_members', 3);
          effects.push('Reputation with party members: +3');
          const walsh = w.politicians.find((p) => p.id === 'pol_walsh');
          if (walsh) {
            adjustRelationship(walsh, { respect: 6 });
            effects.push('Bernadette Walsh: respect +6');
          }
        }
        const d = w.parliament.upcomingDivisions.find((x) => x.billId === params.billId);
        if (d && !w.overview.diary.planned.some((p) => p.kind === 'rebel_against_party'))
          d.playerIntendedVote = support ? 'aye' : 'no';
        for (const id of Array.isArray(params.lobbyTargetIds)
          ? (params.lobbyTargetIds as string[])
          : []) {
          const t = w.politicians.find((p) => p.id === id);
          if (t) effects.push(`${t.name}: lobbied towards ${support ? 'aye' : 'no'}`);
        }
        return {
          ...base,
          status: 'succeeded',
          summary: support
            ? 'Your speech landed well with the front bench.'
            : 'Your speech was cheered on the back benches, and noted by the whips.',
          effects,
        };
      }
      case 'rebel_against_party': {
        const v = params.vote === 'abstain' ? 'abstain' : 'no';
        const d = w.parliament.upcomingDivisions.find((x) => x.id === params.divisionId);
        if (d) d.playerIntendedVote = v;
        const caught = skill('intrigue') < 13;
        const effects = [`Your vote: ${v} (against the whip)`];
        if (caught) {
          const pryce = w.politicians.find((p) => p.id === 'pol_pryce');
          if (pryce) adjustRelationship(pryce, { trust: -10 });
          effects.push('The whips found out', 'Gareth Pryce: trust −10');
        }
        const osei = w.politicians.find((p) => p.id === 'pol_osei');
        if (osei && (osei.relationship.towardsPlayer?.trust ?? 0) >= 20)
          effects.push('Daniel Osei: rebellion pressure applied');
        return {
          ...base,
          status: 'succeeded',
          summary: caught
            ? 'You have committed to rebel, and the Whips’ Office already knows.'
            : 'You have quietly committed to rebel.',
          effects,
        };
      }
      case 'request_promotion': {
        w.meta.lastPromotionRequestTurn = turn;
        const pryce = w.politicians.find((p) => p.id === 'pol_pryce');
        if (pryce) adjustRelationship(pryce, { respect: 2 });
        return {
          ...base,
          status: 'partial',
          summary: 'Pryce noted your interest. "Keep your head down and we’ll see."',
          effects: ['Gareth Pryce: respect +2', 'Promotion requests on cooldown for 6 weeks'],
        };
      }
      case 'respond_to_event': {
        const key = String(params.optionKey);
        const effects: string[] = [];
        const hargreaves = w.politicians.find((p) => p.id === 'pol_hargreaves');
        switch (key) {
          case 'reassure':
            if (hargreaves) adjustRelationship(hargreaves, { trust: 8 });
            adjustRep(w, 'whips', 5);
            w.overview.standing.politicalCapital += 1;
            effects.push(
              'Lucy Hargreaves: trust +8',
              'Reputation with the whips: +5',
              'Political capital +1',
            );
            break;
          case 'warn':
            if (hargreaves) adjustRelationship(hargreaves, { trust: -6 });
            adjustRep(w, 'whips', -5);
            adjustRep(w, 'party_members', 3);
            effects.push(
              'Lucy Hargreaves: trust −6',
              'Reputation with the whips: −5',
              'Heartlands took note',
            );
            break;
          case 'join':
            adjustRep(w, 'public', 6);
            adjustRep(w, 'whips', -6);
            effects.push('Reputation with the public: +6', 'Reputation with the whips: −6');
            break;
          case 'meet_organisers':
            adjustRep(w, 'public', 2);
            effects.push('Reputation with the public: +2', 'One fewer diary slot next week');
            break;
          case 'back_bill':
            adjustRep(w, 'public', -4);
            adjustRep(w, 'whips', 4);
            effects.push('Reputation with the public: −4', 'Reputation with the whips: +4');
            break;
          case 'off_record':
            adjustRep(w, 'media', 5);
            effects.push('Reputation with the media: +5');
            break;
          default:
            effects.push('No lasting effect');
        }
        delete w.meta.plannedEvents[a.id];
        return { ...base, status: 'succeeded', summary: 'Handled.', effects };
      }
      case 'call_reshuffle':
        return {
          ...base,
          status: 'rejected',
          summary: 'Only the Prime Minister can call a reshuffle.',
          effects: [],
        };
    }
  }

  function headlinesFor(
    resolvingTurn: number,
    w: MockWorld,
    outcomes: ActionOutcome[],
    division: DivisionResult | null,
  ): Headline[] {
    const me = player(w);
    if (division) {
      const heads = [...turnReportFixture.headlines];
      if (division.playerVote && division.playerVote !== 'aye') {
        heads.splice(1, 0, {
          text: `${me.name} joins the housing rebels`,
          standfirst: 'The Member for Ashby and Wold defied a three-line whip in her first month.',
          importance: 4,
        });
      }
      return heads;
    }
    if (resolvingTurn === 3) {
      const heads: Headline[] = [
        {
          text: 'Government considers housing concession as rebel count climbs',
          standfirst:
            'Treasury sources say a social-housing amendment is "on the table" if Heartlands numbers hold.',
          importance: 5,
        },
        { text: 'Hargreaves’ list: the 40 names the whips are worried about', importance: 4 },
        {
          text: 'Wold Common rally draws hundreds',
          standfirst: 'Protesters call on their MP to "pick a side".',
          importance: 3,
        },
        { text: 'MacRae: Liberal Reform will abstain "for now"', importance: 2 },
      ];
      if (outcomes.some((o) => o.kind === 'support_legislation')) {
        heads.push({ text: `New Member for Ashby and Wold backs the bill`, importance: 2 });
      }
      return heads;
    }
    return [
      {
        text: 'Westminster digests the housing vote',
        standfirst: 'Ministers turn to the autumn Budget while the whips keep a long memory.',
        importance: 4,
      },
      { text: 'Coyle’s allies brief against Nair', importance: 3 },
      { text: 'Kemp tipped for the next PPS vacancy', importance: 2 },
    ];
  }

  function addHistory(w: MockWorld, item: Omit<HistoryItem, 'seq'>) {
    w.history.push({ seq: w.meta.nextSeq++, ...item });
  }

  function notify(w: MockWorld, turn: number, n: Omit<Notification, 'id' | 'turn'>): Notification {
    const full: Notification = { id: `ntf_${w.meta.nextNotificationId++}`, turn, ...n };
    w.overview.notifications.push(full);
    return full;
  }

  function advance(w: MockWorld): TurnReport {
    const resolvingTurn = w.summary.turn;
    const resolvedSimDate = w.summary.simDate;
    const nextTurn = resolvingTurn + 1;
    const me = player(w);
    const intel = w.overview.intelligence;
    const planned = [...w.overview.diary.planned];
    const capitalBefore =
      w.overview.standing.politicalCapital + planned.reduce((s, p) => s + p.capitalCost, 0);

    const outcomes = planned.map((p) => resolveAction(w, p, resolvingTurn, intel));
    for (const o of outcomes) {
      addHistory(w, {
        turn: resolvingTurn,
        simDate: addDays(w.summary.simDate, 2),
        type: 'action_outcome',
        importance: o.status === 'failed' ? 1 : 2,
        title: o.label,
        summary: o.summary,
        actorIds: [PLAYER_ID],
        subjectIds:
          typeof planned.find((p) => p.id === o.plannedActionId)?.params.targetId === 'string'
            ? [String(planned.find((p) => p.id === o.plannedActionId)?.params.targetId)]
            : [],
      });
    }

    const newNotifications: Notification[] = [];
    let division: DivisionResult | null = null;
    const hdb = w.parliament.bills.find((b) => b.id === HDB_ID);

    // Week 2 brings the first dispatch: the constituency notices the bill.
    if (
      resolvingTurn === 1 &&
      !w.overview.pendingEvents.some((e) => e.id === 'evt_green_belt_protest')
    ) {
      w.overview.pendingEvents.push(greenBeltProtestEvent(nextTurn));
    }

    if (resolvingTurn === 3 && hdb) {
      hdb.stage = 'Second reading';
      w.overview.pendingEvents.push(lobbyJournalistEvent(nextTurn));
      newNotifications.push(
        notify(w, nextTurn, {
          severity: 'warning',
          title: 'Division week',
          body: 'Second reading of the Housing Delivery Bill is on Wednesday. Three-line whip.',
          link: { kind: 'division', id: HDB_2R_DIVISION_ID },
        }),
      );
      addHistory(w, {
        turn: resolvingTurn,
        simDate: addDays(w.summary.simDate, 4),
        type: 'negotiation',
        importance: 4,
        title: 'Treasury floats a housing concession',
        summary: 'Coyle’s officials sketch a social-housing amendment.',
        actorIds: ['pol_coyle'],
        subjectIds: [HDB_ID],
      });
    }

    const pending2R = w.parliament.upcomingDivisions.find((d) => d.id === HDB_2R_DIVISION_ID);
    if (resolvingTurn >= 4 && pending2R) {
      const playerVote = pending2R.playerIntendedVote ?? 'aye';
      division = hdbSecondReadingResult(playerVote, me.name);
      w.parliament.recentDivisions.unshift(division);
      w.parliament.upcomingDivisions = [
        ...w.parliament.upcomingDivisions.filter((d) => d.id !== HDB_2R_DIVISION_ID),
        hdbThirdReadingForecast(),
      ];
      if (hdb) hdb.stage = 'Committee stage';
      if (w.party.governmentStability !== null)
        w.party.governmentStability = clamp(w.party.governmentStability + 5, 0, 100);
      w.party.unity = clamp(w.party.unity - 4, 0, 100);
      const heartlands = w.party.factions.find((f) => f.id === FACTIONS.heartlands.id);
      if (heartlands) heartlands.cohesion = clamp(heartlands.cohesion + 3, 0, 100);
      const pryce = w.politicians.find((p) => p.id === 'pol_pryce');
      if (playerVote !== 'aye') {
        if (pryce) adjustRelationship(pryce, { trust: -25 });
        adjustRep(w, 'whips', -15);
        newNotifications.push(
          notify(w, nextTurn, {
            severity: 'critical',
            title: 'You defied the whip',
            body: `You voted ${playerVote} on a three-line whip. Gareth Pryce will not forget.`,
            link: { kind: 'politician', id: 'pol_pryce' },
          }),
        );
      } else {
        adjustRep(w, 'whips', 3);
        newNotifications.push(
          notify(w, nextTurn, {
            severity: 'good',
            title: 'Second reading passed',
            body: `The Housing Delivery Bill passed ${division.ayes}–${division.noes}. You voted with the government.`,
            link: { kind: 'division', id: HDB_2R_DIVISION_ID },
          }),
        );
      }
      newNotifications.push(
        notify(w, nextTurn, {
          severity: 'warning',
          title: 'Daniel Osei rebelled',
          body: 'Your friend voted against the whip. The whips have noticed.',
          link: { kind: 'politician', id: 'pol_osei' },
        }),
      );
      for (const p of w.politicians) {
        if (p.knownIntention !== null && !p.isPlayer && p.status !== 'speaker')
          p.knownIntention = 'unknown';
      }
      addHistory(w, {
        turn: resolvingTurn,
        simDate: '2029-09-26',
        type: 'division',
        importance: 5,
        title: `Housing Delivery Bill: second reading passes ${division.ayes}–${division.noes}`,
        summary: `${division.rebels.length} government MPs rebelled, led by Bernadette Walsh.`,
        actorIds: division.rebels.map((r) => r.id),
        subjectIds: [HDB_ID],
      });
      intel.unshift({
        turn: resolvingTurn,
        text: 'The whips are drawing up a list of the rebels. Pryce is "taking names".',
        politicianId: 'pol_pryce',
      });
    }

    // Capital income: +1 base, +1 per office, +1 per 3 endorsements, +1 if whips reputation ≥ 30.
    const st = w.overview.standing;
    const income = clamp(
      1 +
        w.overview.player.offices.length +
        Math.floor(st.endorsements.length / 3) +
        (st.reputation.whips >= 30 ? 1 : 0),
      0,
      12,
    );
    st.capitalIncome = income;
    st.politicalCapital = clamp(st.politicalCapital + income, 0, 99);
    newNotifications.push(
      notify(w, nextTurn, {
        severity: 'info',
        title: 'Capital income',
        body: `You gained ${income} political capital this week.`,
      }),
    );
    st.partyLoyalty = clamp(
      st.partyLoyalty + (division?.playerVote && division.playerVote !== 'aye' ? -12 : 1),
      0,
      100,
    );
    st.influence.total = Math.round(
      st.influence.breakdown.reduce((s, b) => s + b.value, 0) + st.endorsements.length * 2,
    );

    // Roll the week.
    w.summary.turn = nextTurn;
    w.summary.simDate = addDays(w.summary.simDate, 7);
    bumpRev(w);
    w.overview.diary = { slotsTotal: 5, slotsUsed: 0, planned: [] };
    const headlines = headlinesFor(resolvingTurn, w, outcomes, division);
    const newspaper = mockPaper(division ? 'division' : 'quiet', resolvedSimDate);
    w.overview.briefing = { turn: nextTurn, headlines, newspaper };
    w.overview.upcoming = upcomingFor(
      w.summary.simDate,
      w.parliament.upcomingDivisions.some((d) => d.id === HDB_2R_DIVISION_ID),
    );
    w.overview.notifications = w.overview.notifications.slice(-14);
    w.overview.intelligence = intel.slice(0, 10);
    me.reputation = { ...st.reputation };

    return {
      revision: w.summary.revision,
      turn: resolvingTurn,
      simDate: resolvedSimDate,
      nextTurn,
      nextSimDate: w.summary.simDate,
      headlines,
      newspaper,
      actionOutcomes: outcomes,
      divisions: division ? [division] : [],
      notifications: newNotifications,
      capitalChange: st.politicalCapital - capitalBefore,
    };
  }

  /* ---------------- mutation wrapper ---------------- */

  function mutation<S extends z.ZodType<{ expectedRevision: number }>>(
    req: ParsedRequest,
    w: MockWorld,
    schema: S,
    run: (body: z.infer<S>) => Reply,
    /** Overrides the JSON body (DELETE carries expectedRevision in the query string). */
    rawBody: string | null = req.body,
  ): Reply {
    const fingerprint = `${req.method} ${req.url.pathname}${req.url.search} ${rawBody ?? ''}`;
    const key = requireKey(req);
    const stored = idempotency.get(key);
    if (stored) {
      if (stored.fingerprint === fingerprint) return stored.reply;
      throw new HttpError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request.',
      );
    }
    const body = parseBody(schema, rawBody);
    if (body.expectedRevision !== w.summary.revision) {
      throw new HttpError('REVISION_CONFLICT', 'Campaign has advanced on another device.', {
        currentRevision: w.summary.revision,
      });
    }
    const reply = run(body);
    idempotency.set(key, { fingerprint, reply });
    return reply;
  }

  function requireKey(req: ParsedRequest): string {
    const key = req.headers.get(IDEMPOTENCY_HEADER);
    if (!key) throw new HttpError('VALIDATION_FAILED', `Missing ${IDEMPOTENCY_HEADER} header.`);
    if (!IdempotencyKeySchema.safeParse(key).success)
      throw new HttpError('VALIDATION_FAILED', `Malformed ${IDEMPOTENCY_HEADER} header.`);
    return key;
  }

  /* ---------------- router ---------------- */

  function route(req: ParsedRequest): Reply {
    const path = req.url.pathname;
    if (!path.startsWith(API_PREFIX)) throw new HttpError('NOT_FOUND', 'Route not found.');
    const seg = path.slice(API_PREFIX.length).split('/').filter(Boolean);
    const m = req.method;
    const query = Object.fromEntries(req.url.searchParams.entries());

    if (seg[0] === 'health' && seg.length === 1 && m === 'GET') {
      return {
        status: 200,
        body: validated(
          HealthResponseSchema,
          { status: 'ok', simulationVersion: 1, environment: 'mock' },
          'health',
        ),
      };
    }
    if (seg[0] === 'me' && seg.length === 1 && m === 'GET') {
      return {
        status: 200,
        body: validated(
          MeResponseSchema,
          {
            user: { id: 'usr_mock', email: 'player@whip.local', name: 'Mock Player' },
            preferences: {},
          },
          'me',
        ),
      };
    }
    if (seg[0] !== 'campaigns') throw new HttpError('NOT_FOUND', 'Route not found.');

    if (seg.length === 1) {
      if (m === 'GET') {
        const items = [...worlds.values()]
          .map((w) => w.summary)
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
        return {
          status: 200,
          body: validated(CampaignListResponseSchema, { items, nextCursor: null }, 'campaigns'),
        };
      }
      if (m === 'POST') {
        const create = (): Reply => {
          const body = parseBody(CreateCampaignRequestSchema, req.body);
          const id = `cmp_new${campaignCounter++}`;
          const now = new Date().toISOString();
          const w = buildWorld({
            id,
            name: body.name,
            player: body.player,
            fresh: true,
            createdAt: now,
            updatedAt: now,
          });
          worlds.set(id, w);
          tutorials.set(id, {
            ...DEFAULT_TUTORIAL,
            enabled: body.tutorial ?? true,
            updatedAt: now,
          });
          return {
            status: 201,
            body: validated(CampaignSummarySchema, w.summary, 'create campaign'),
          };
        };
        if (!req.headers.get(IDEMPOTENCY_HEADER)) return create();
        const key = requireKey(req);
        const fingerprint = `POST ${path} ${req.body ?? ''}`;
        const stored = idempotency.get(key);
        if (stored) {
          if (stored.fingerprint === fingerprint) return stored.reply;
          throw new HttpError(
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was already used for a different request.',
          );
        }
        const reply = create();
        idempotency.set(key, { fingerprint, reply });
        return reply;
      }
      throw new HttpError('NOT_FOUND', 'Route not found.');
    }

    const w = getWorld(seg[1] ?? '');
    const sub = seg.slice(2);

    if (sub.length === 0) {
      if (m === 'GET')
        return {
          status: 200,
          body: validated(CampaignSummarySchema, w.summary, 'campaign'),
          headers: etag(w),
        };
      if (m === 'DELETE') {
        worlds.delete(w.summary.id);
        lastReports.delete(w.summary.id);
        tutorials.delete(w.summary.id);
        return { status: 204, body: null };
      }
    }

    const [head, arg] = sub;
    if (head === 'state' && sub.length === 1 && m === 'GET') {
      return {
        status: 200,
        body: validated(CareerOverviewSchema, overview(w), 'state'),
        headers: etag(w),
      };
    }
    if (head === 'actions') {
      if (arg === 'catalogue' && sub.length === 2 && m === 'GET') {
        return {
          status: 200,
          body: validated(ActionCatalogueResponseSchema, buildCatalogue(w), 'catalogue'),
          headers: etag(w),
        };
      }
      if (sub.length === 1 && m === 'POST') {
        return mutation(req, w, PlanActionRequestSchema, (body) => {
          const planned = plan(w, body.action.kind, body.action.params);
          return {
            status: 201,
            body: validated(
              PlanActionResponseSchema,
              {
                revision: w.summary.revision,
                planned,
                diary: w.overview.diary,
                politicalCapital: w.overview.standing.politicalCapital,
              },
              'plan action',
            ),
            headers: etag(w),
          };
        });
      }
      if (sub.length === 2 && arg && m === 'DELETE') {
        const qRev = req.url.searchParams.get('expectedRevision');
        const rawBody =
          qRev !== null ? JSON.stringify({ expectedRevision: Number(qRev) }) : req.body;
        return mutation(
          req,
          w,
          CancelActionRequestSchema,
          () => {
            cancel(w, arg);
            return {
              status: 200,
              body: validated(
                CancelActionResponseSchema,
                {
                  revision: w.summary.revision,
                  diary: w.overview.diary,
                  politicalCapital: w.overview.standing.politicalCapital,
                },
                'cancel action',
              ),
              headers: etag(w),
            };
          },
          rawBody,
        );
      }
    }
    if (head === 'advance' && sub.length === 1 && m === 'POST') {
      return mutation(req, w, AdvanceRequestSchema, () => {
        const report = advance(w);
        lastReports.set(w.summary.id, structuredClone(report));
        return {
          status: 200,
          body: validated(TurnReportSchema, report, 'advance'),
          headers: etag(w),
        };
      });
    }
    if (head === 'turn-report' && arg === 'latest' && sub.length === 2 && m === 'GET') {
      const report = lastReports.get(w.summary.id);
      if (!report) throw new HttpError('NOT_FOUND', 'No week has been played yet.');
      return {
        status: 200,
        body: validated(TurnReportSchema, report, 'latest turn report'),
        headers: etag(w),
      };
    }
    if (head === 'history' && sub.length === 1 && m === 'GET') {
      const q = HistoryQuerySchema.safeParse(query);
      if (!q.success)
        throw new HttpError('VALIDATION_FAILED', 'Invalid history query.', {
          issues: q.error.issues,
        });
      const { cursor, limit, type, politicianId, minImportance, fromTurn } = q.data;
      const before = cursor ? Number(cursor) : Infinity;
      const filtered = [...w.history]
        .reverse()
        .filter((h) => h.seq < before)
        .filter((h) => !type || h.type === type)
        .filter(
          (h) =>
            !politicianId ||
            h.actorIds.includes(politicianId) ||
            h.subjectIds.includes(politicianId),
        )
        .filter((h) => minImportance === undefined || h.importance >= minImportance)
        .filter((h) => fromTurn === undefined || h.turn >= fromTurn);
      const items = filtered.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor = filtered.length > limit && last ? String(last.seq) : null;
      return {
        status: 200,
        body: validated(HistoryPageSchema, { items, nextCursor }, 'history'),
        headers: etag(w),
      };
    }
    if (head === 'politicians' && m === 'GET') {
      if (sub.length === 1) {
        const q = PoliticianListQuerySchema.safeParse(query);
        if (!q.success)
          throw new HttpError('VALIDATION_FAILED', 'Invalid politicians query.', {
            issues: q.error.issues,
          });
        const { cursor, limit, partyId, factionId, search, sort } = q.data;
        const needle = search?.trim().toLowerCase();
        let rows = w.politicians.filter(
          (p) =>
            (!partyId || p.partyId === partyId) &&
            (!factionId || p.factionId === factionId) &&
            (!needle ||
              p.name.toLowerCase().includes(needle) ||
              (p.constituencyName ?? '').toLowerCase().includes(needle) ||
              p.offices.some((o) => o.toLowerCase().includes(needle))),
        );
        const surname = (n: string) => n.split(' ').slice(-1)[0] ?? n;
        rows = [...rows].sort((a, b) => {
          if (sort === 'influence') return b.influence - a.influence;
          if (sort === 'relationship') {
            const av = a.relationshipToPlayer
              ? a.relationshipToPlayer.trust + a.relationshipToPlayer.affinity
              : -999;
            const bv = b.relationshipToPlayer
              ? b.relationshipToPlayer.trust + b.relationshipToPlayer.affinity
              : -999;
            return bv - av;
          }
          return surname(a.name).localeCompare(surname(b.name)) || a.name.localeCompare(b.name);
        });
        const offset = cursor ? Number(cursor) || 0 : 0;
        const page = rows
          .slice(offset, offset + limit)
          .map((p) => PoliticianSummarySchema.parse(p));
        const nextCursor = offset + limit < rows.length ? String(offset + limit) : null;
        return {
          status: 200,
          body: validated(PoliticianListResponseSchema, { items: page, nextCursor }, 'politicians'),
          headers: etag(w),
        };
      }
      if (sub.length === 2 && arg) {
        const p = w.politicians.find((x) => x.id === arg);
        if (!p) throw new HttpError('NOT_FOUND', 'Politician not found.');
        return {
          status: 200,
          body: validated(PoliticianProfileSchema, p, 'politician'),
          headers: etag(w),
        };
      }
    }
    if (head === 'parliament' && sub.length === 1 && m === 'GET') {
      return {
        status: 200,
        body: validated(ParliamentViewSchema, w.parliament, 'parliament'),
        headers: etag(w),
      };
    }
    if (head === 'party' && sub.length === 1 && m === 'GET') {
      return { status: 200, body: validated(PartyViewSchema, w.party, 'party'), headers: etag(w) };
    }
    if (head === 'tutorial' && sub.length === 1) {
      const id = w.summary.id;
      if (m === 'GET') {
        const state = tutorials.get(id) ?? DEFAULT_TUTORIAL;
        return { status: 200, body: validated(TutorialStateSchema, state, 'tutorial') };
      }
      if (m === 'PUT') {
        // Idempotent by construction (set union, last write wins): no Idempotency-Key needed.
        const update = parseBody(TutorialUpdateSchema, req.body);
        const next = mergeTutorial(tutorials.get(id) ?? DEFAULT_TUTORIAL, update);
        tutorials.set(id, next);
        return { status: 200, body: validated(TutorialStateSchema, next, 'update tutorial') };
      }
    }
    throw new HttpError('NOT_FOUND', 'Route not found.');
  }

  async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = await readRequest(input, init);
    if (latency > 0) await sleep(latency);
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    const requestId = `req_mock_${requestCounter++}`;
    let reply: Reply;
    try {
      // Replies are deep-cloned so callers never hold references into mock state.
      const r = route(req);
      reply = { ...r, body: r.body === null ? null : structuredClone(r.body) };
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      const envelope: {
        error: { code: ErrorCode; message: string; requestId: string; details?: unknown };
      } = {
        error: { code: err.code, message: err.message, requestId },
      };
      if (err.details !== undefined) envelope.error.details = err.details;
      reply = { status: ERROR_HTTP_STATUS[err.code], body: envelope };
    }
    const headers = new Headers({ 'x-request-id': requestId, ...reply.headers });
    if (reply.body === null) return new Response(null, { status: reply.status, headers });
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers });
  }

  return {
    fetch: mockFetch,
    bumpRevision(campaignId: string) {
      const w = worlds.get(campaignId);
      if (w) bumpRev(w);
    },
    reset,
  };
}
