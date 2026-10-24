import type {
  CampaignSummary,
  CareerOverview,
  ParliamentView,
  PartyView,
  PoliticianProfile,
  TurnReport,
} from '@whip/contracts';
import { canonicalStringify } from '../application/canonical-json';
import type {
  ActionRequest,
  Diary,
  PoliticianListQuery,
  PoliticianListResponse,
} from '../application/dto';
import type { EngineRuntime, HistoryRowInput } from '../application/engine';

/**
 * TEST-ONLY engine: tiny deterministic states so persistence, concurrency and routes can be tested
 * before `@whip/simulation` exists. Selected by `ENGINE=fake` (src/composition.ts), which is refused
 * outside ENVIRONMENT=local. Never import this from production code paths other than composition.
 */

export interface FakeState {
  kind: 'fake-game-state';
  schemaVersion: 1;
  seed: number;
  turn: number;
  simDate: string;
  capital: number;
  player: { id: string; name: string };
  planned: { id: string; kind: ActionRequest['kind']; params: Record<string, unknown> }[];
  nextPlannedId: number;
}

export interface FakeHistory {
  turn: number;
  simDate: string;
  type: 'action_outcome' | 'event' | 'campaign';
  importance: number;
  actorIds: string[];
  subjectIds: string[];
  title: string;
  summary: string;
}

export interface FakeAdvanceResult {
  resolved: FakeState['planned'];
  capitalChange: number;
}

export const FAKE_DIARY_SLOTS = 3;
export const FAKE_PLAYER_ID = 'pol-player';

const PARTIES = [
  { id: 'party-red', name: 'Red Party', shortName: 'RED', colour: '#d7261e', seats: 330 },
  { id: 'party-blue', name: 'Blue Party', shortName: 'BLU', colour: '#1e4fd7', seats: 320 },
];

const NPCS = [
  { id: 'pol-1', name: 'Bernadette Walsh', partyId: 'party-red' },
  { id: 'pol-2', name: 'Callum Reid', partyId: 'party-red' },
  { id: 'pol-3', name: 'Priya Natarajan', partyId: 'party-blue' },
];

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function labelFor(p: FakeState['planned'][number]): string {
  const target = NPCS.find((n) => n.id === p.params.politicianId);
  return target ? `${p.kind} with ${target.name}` : p.kind;
}

/**
 * TEST hook: a planned action's `params.padBytes` (≤ 8 MB) inflates its history summary and its
 * turn-report outcome by that many bytes, to exercise the DO row-size caps.
 */
function padding(p: FakeState['planned'][number]): string {
  const n = p.params.padBytes;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  return ` ${'x'.repeat(Math.min(Math.floor(n), 8_000_000))}`;
}

function diaryOf(state: FakeState): Diary {
  return {
    slotsTotal: FAKE_DIARY_SLOTS,
    slotsUsed: state.planned.length,
    planned: state.planned.map((p) => ({
      id: p.id,
      kind: p.kind,
      label: labelFor(p),
      slots: 1,
      capitalCost: 1,
      params: p.params,
    })),
  };
}

function partyOf(id: string) {
  const p = PARTIES.find((x) => x.id === id);
  if (!p) throw new Error(`unknown party ${id}`);
  return p;
}

const neutralRelationship = { trust: 0, respect: 0, affinity: 0, obligation: 0, rivalry: 0 };
const reputation = { public: 50, party_members: 50, colleagues: 50, media: 50, whips: 50 };

function politicianSummary(state: FakeState, id: string) {
  const isPlayer = id === state.player.id;
  const npc = NPCS.find((n) => n.id === id);
  if (!isPlayer && !npc) return null;
  const party = partyOf(npc?.partyId ?? 'party-red');
  return {
    id,
    name: isPlayer ? state.player.name : (npc?.name ?? id),
    partyId: party.id,
    partyShort: party.shortName,
    partyColour: party.colour,
    constituencyName: isPlayer ? 'Fakesborough' : `${npc?.name.split(' ')[1] ?? 'Some'}ton`,
    offices: [],
    factionId: null,
    factionName: null,
    status: 'mp',
    influence: isPlayer ? 10 : 20,
    isPlayer,
    relationshipToPlayer: isPlayer ? null : neutralRelationship,
    knownIntention: null,
  };
}

export const fakeRuntime: EngineRuntime<FakeState, FakeAdvanceResult, FakeHistory> = {
  engine: {
    version: 1,
    create(input) {
      const state: FakeState = {
        kind: 'fake-game-state',
        schemaVersion: 1,
        seed: input.seed,
        turn: 1,
        simDate: '2026-01-05',
        capital: 5,
        player: { id: FAKE_PLAYER_ID, name: `${input.player.firstName} ${input.player.lastName}` },
        planned: [],
        nextPlannedId: 1,
      };
      return {
        state,
        history: [
          {
            turn: 1,
            simDate: state.simDate,
            type: 'campaign',
            importance: 3,
            actorIds: [FAKE_PLAYER_ID],
            subjectIds: [],
            title: 'Campaign begins',
            summary: `${state.player.name} takes their seat.`,
          },
        ],
      };
    },
    meta: (s) => ({
      turn: s.turn,
      simDate: s.simDate,
      playerPoliticianId: s.player.id,
      playerName: s.player.name,
    }),
    planAction(state, request) {
      if (request.kind === 'call_reshuffle') {
        return { ok: false, reasons: ['Only the Prime Minister can call a reshuffle.'] };
      }
      if (state.planned.length >= FAKE_DIARY_SLOTS) {
        return { ok: false, reasons: ['Your diary is full this week.'] };
      }
      if (state.capital < 1) return { ok: false, reasons: ['Not enough political capital.'] };
      const id = `pa-${state.nextPlannedId}`;
      return {
        ok: true,
        plannedActionId: id,
        state: {
          ...state,
          capital: state.capital - 1,
          nextPlannedId: state.nextPlannedId + 1,
          planned: [...state.planned, { id, kind: request.kind, params: request.params }],
        },
      };
    },
    cancelPlannedAction(state, plannedActionId) {
      if (!state.planned.some((p) => p.id === plannedActionId)) return null;
      return {
        ...state,
        capital: state.capital + 1,
        planned: state.planned.filter((p) => p.id !== plannedActionId),
      };
    },
    advance(state) {
      const turn = state.turn + 1;
      const simDate = addDays(state.simDate, 7);
      const history: FakeHistory[] = state.planned.map((p) => ({
        turn: state.turn,
        simDate: state.simDate,
        type: 'action_outcome',
        importance: 2,
        actorIds: [state.player.id],
        subjectIds: typeof p.params.politicianId === 'string' ? [p.params.politicianId] : [],
        title: labelFor(p),
        summary: `${state.player.name} completed ${p.kind}.${padding(p)}`,
      }));
      history.push({
        turn,
        simDate,
        type: 'event',
        importance: 1,
        actorIds: [],
        subjectIds: [],
        title: `Week ${turn} begins`,
        summary: 'Parliament sits.',
      });
      return {
        state: { ...state, turn, simDate, capital: state.capital + 2, planned: [] },
        history,
        result: { resolved: state.planned, capitalChange: 2 },
      };
    },
    serialize: (state) => canonicalStringify(state),
    deserialize(json) {
      const s = JSON.parse(json) as Partial<FakeState>;
      if (s.kind !== 'fake-game-state' || s.schemaVersion !== 1) {
        throw new Error('Not a fake game state.');
      }
      return s as FakeState;
    },
  },

  projections: {
    careerOverview(state, campaign: CampaignSummary): CareerOverview {
      const party = partyOf('party-red');
      return {
        campaign,
        player: {
          id: state.player.id,
          name: state.player.name,
          partyId: party.id,
          partyName: party.name,
          partyColour: party.colour,
          constituencyName: 'Fakesborough',
          majority: 1234,
          offices: [],
          factionName: null,
          skills: { oratory: 3 },
          traits: [],
          ideology: { economic: 0, social: 0 },
        },
        standing: {
          politicalCapital: state.capital,
          capitalIncome: 2,
          influence: { total: 10, breakdown: [{ label: 'Backbencher', value: 10 }] },
          reputation,
          partyLoyalty: 60,
          endorsements: [],
        },
        diary: diaryOf(state),
        pendingEvents: [],
        notifications: [],
        briefing: { turn: state.turn, headlines: [{ text: 'Fake news day', importance: 1 }] },
        upcoming: [],
        intelligence: [],
      };
    },
    actionCatalogue: (state) => ({
      items: [
        {
          kind: 'meet_politician',
          label: 'Meet a politician',
          description: 'Spend an hour with a colleague.',
          slots: 1,
          capitalCost: 1,
          eligible: state.planned.length < FAKE_DIARY_SLOTS && state.capital >= 1,
          reasons: [],
          params: [
            {
              name: 'politicianId',
              label: 'Who',
              type: 'politician',
              options: NPCS.map((n) => ({ id: n.id, label: n.name })),
            },
          ],
        },
        {
          kind: 'call_reshuffle',
          label: 'Call a reshuffle',
          description: 'Reorganise the government.',
          slots: 1,
          capitalCost: 5,
          eligible: false,
          reasons: ['Only the Prime Minister can call a reshuffle.'],
          params: [],
        },
      ],
    }),
    parliament: (): ParliamentView => ({
      session: { number: 1, openedOn: '2026-01-05' },
      composition: PARTIES.map((p, i) => ({
        partyId: p.id,
        name: p.name,
        shortName: p.shortName,
        colour: p.colour,
        seats: p.seats,
        inGovernment: i === 0,
      })),
      totalSeats: 650,
      governmentMajority: 10,
      bills: [],
      upcomingDivisions: [],
      recentDivisions: [],
    }),
    party: (state): PartyView => {
      const p = partyOf('party-red');
      return {
        id: p.id,
        name: p.name,
        shortName: p.shortName,
        colour: p.colour,
        ideology: { economic: -10, social: 5 },
        inGovernment: true,
        seats: p.seats,
        pollShare: 0.4,
        unity: 70,
        whipStrength: 3,
        leader: { id: 'pol-1', name: 'Bernadette Walsh' },
        chiefWhip: { id: 'pol-2', name: 'Callum Reid' },
        governmentStability: 60,
        factions: [],
        powerMap: [{ id: state.player.id, name: state.player.name, influence: 10, offices: [] }],
      };
    },
    politicianList(state, query: PoliticianListQuery): PoliticianListResponse {
      const all = [state.player.id, ...NPCS.map((n) => n.id)]
        .map((id) => politicianSummary(state, id))
        .filter((p) => p !== null)
        .filter((p) => query.partyId === undefined || p.partyId === query.partyId)
        .filter(
          (p) =>
            query.search === undefined || p.name.toLowerCase().includes(query.search.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      const start = query.cursor ? Number(query.cursor) || 0 : 0;
      const items = all.slice(start, start + query.limit);
      const nextCursor = start + query.limit < all.length ? String(start + query.limit) : null;
      return { items, nextCursor };
    },
    politicianProfile(state, politicianId): PoliticianProfile | null {
      const s = politicianSummary(state, politicianId);
      if (!s) return null;
      return {
        ...s,
        age: 45,
        ideology: { economic: 0, social: 0 },
        stances: [],
        traits: [],
        skills: { oratory: 3 },
        ambition: null,
        reputation,
        partyLoyalty: 60,
        relationship: {
          towardsPlayer: s.isPlayer ? null : neutralRelationship,
          fromPlayer: s.isPlayer ? null : neutralRelationship,
          memories: [],
        },
        career: [{ date: '2024-07-04', text: 'Elected MP' }],
        keyRelationships: [],
      };
    },
    diary: (state) => ({ diary: diaryOf(state), politicalCapital: state.capital }),
    turnReport: ({ before, output, revision }): TurnReport => ({
      revision,
      turn: before.turn,
      simDate: before.simDate,
      nextTurn: output.state.turn,
      nextSimDate: output.state.simDate,
      headlines: [{ text: `Week ${output.state.turn}`, importance: 1 }],
      actionOutcomes: output.result.resolved.map((p) => ({
        plannedActionId: p.id,
        kind: p.kind,
        label: labelFor(p),
        status: 'succeeded',
        summary: `It went fine.${padding(p)}`,
        effects: [],
      })),
      divisions: [],
      notifications: [],
      capitalChange: output.result.capitalChange,
    }),
    historyRecordsToRows: (records): HistoryRowInput[] => records.map((r) => ({ ...r })),
  },
};
