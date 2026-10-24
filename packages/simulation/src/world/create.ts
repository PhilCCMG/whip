import {
  formatSimDate,
  NATIONS,
  PlayerSetupSchema,
  SKILL_KEYS,
  type AmbitionKey,
  type Bill,
  type CastSpec,
  type Constituency,
  type ConstituencyId,
  type ContentRegistry,
  type Division,
  type ElectionResult,
  type Faction,
  type FactionId,
  type GameState,
  type Gender,
  type Ideology,
  type IssueKey,
  type IssueStances,
  type Nation,
  type OfficeKey,
  type Party,
  type PartyId,
  type PlayerSetup,
  type Politician,
  type PoliticianId,
  type RegionKey,
  type ScenarioDefinition,
  type ScenarioPartySpec,
  type SimDate,
  type Skills,
  type Stance,
  type TraitKey,
  type Urbanity,
} from '@whip/domain';
import { computeFidelity } from '../ai/fidelity';
import { headlineText } from '../chronicle/templates';
import {
  assertVersion,
  SIMULATION_VERSION,
  STATE_SCHEMA_VERSION,
  type SimulationContext,
} from '../context';
import { Rng, rootRngState } from '../rng';
import { clamp, formatNumber, majorityOf, round, compareStrings } from '../state/access';
import { TurnContext } from '../turn/context';
import { ConstituencyNamer, slugify } from './names';
import { buildInitialRelationships } from './relationships';

export interface CreateCampaignInput {
  scenario: ScenarioDefinition;
  seed: number;
  player: PlayerSetup;
}

/** Earlier general elections, for "first elected" dates of returning MPs. */
const PAST_ELECTIONS = [
  '2005-05-05',
  '2010-05-06',
  '2015-05-07',
  '2017-06-08',
  '2019-12-12',
  '2024-07-04',
] as SimDate[];

interface SeatSlot {
  nation: Nation;
  partyId: PartyId;
}

interface Draft {
  scenario: ScenarioDefinition;
  content: ContentRegistry;
  root: GameState['meta']['rng'];
  politicians: Map<PoliticianId, Politician>;
  constituencies: Map<ConstituencyId, Constituency>;
  usedNames: Set<string>;
  counters: Record<string, number>;
}

function fork(d: Draft, key: string): Rng {
  return Rng.fork(d.root, 0, `world:${key}`);
}

function partySpec(d: Draft, id: PartyId): ScenarioPartySpec {
  const p = d.scenario.parties.find((x) => x.id === id);
  if (!p) throw new Error(`Scenario has no party ${id}`);
  return p;
}

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

function birthDate(rng: Rng, minAge: number, maxAge: number, on: SimDate): SimDate {
  const year = Number(on.slice(0, 4)) - rng.int(minAge, maxAge);
  return `${year}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}` as SimDate;
}

/* ----------------------------------------------------------------------------
 * Constituencies
 * ------------------------------------------------------------------------- */

function runnerUpFor(rng: Rng, winner: PartyId, nation: Nation, d: Draft): PartyId {
  const gov = d.scenario.governmentPartyId;
  const opp =
    d.scenario.parties
      .filter((p) => !p.isGovernment && p.seats > 0)
      .sort((a, b) => b.seats - a.seats)[0]?.id ?? gov;
  const scp = d.scenario.parties.find(
    (p) => p.seatsByNation.scotland === p.seats && p.seats > 0,
  )?.id;
  const ind = d.scenario.parties.find((p) => p.whipStrength === 0)?.id;
  const lr = d.scenario.parties.find(
    (p) => !p.isGovernment && p.id !== opp && p.seatsByNation.england > 20,
  )?.id;
  if (nation === 'northern_ireland') return winner === ind ? opp : (ind ?? opp);
  if (nation === 'scotland' && scp && winner !== scp) return scp;
  if (winner === gov) return rng.chance(0.7) || !lr ? opp : lr;
  return rng.chance(0.75) ? gov : lr && lr !== winner ? lr : opp;
}

function buildResult(
  rng: Rng,
  date: SimDate,
  electorate: number,
  winner: PartyId,
  runner: PartyId,
  majority: number,
  winnerMp: PoliticianId,
  d: Draft,
): ElectionResult {
  const turnout = round(rng.range(0.55, 0.72), 3);
  const total = Math.round(electorate * turnout);
  const others = d.scenario.parties.map((p) => p.id).filter((p) => p !== winner && p !== runner);
  const otherShare = rng.range(0.08, 0.24);
  const otherVotes = Math.round(total * otherShare);
  const m = Math.min(majority, Math.max(1, total - otherVotes - 2));
  const runnerVotes = Math.floor((total - otherVotes - m) / 2);
  const winnerVotes = runnerVotes + m;
  const votes: Record<PartyId, number> = { [winner]: winnerVotes, [runner]: runnerVotes };
  // Distribute the rest among two other parties, each below the runner-up.
  const picks = rng.sample(others, 2);
  let remaining = otherVotes;
  picks.forEach((p, i) => {
    const v = i === picks.length - 1 ? remaining : Math.round(remaining * rng.range(0.5, 0.8));
    votes[p] = Math.min(v, Math.max(0, runnerVotes - 1));
    remaining -= v;
  });
  return { date, votes, turnout, winnerId: winnerMp, winnerPartyId: winner };
}

function constituencyFrom(
  d: Draft,
  rng: Rng,
  id: ConstituencyId,
  name: string,
  nation: Nation,
  region: RegionKey,
  urbanity: Urbanity,
  winner: PartyId,
  runner: PartyId,
  majority: number,
  mpId: PoliticianId,
  overrides: { homeownerShare?: number; concerns?: Partial<Record<IssueKey, number>> },
): Constituency {
  const electorate = rng.int(64000, 80000);
  const base = d.scenario.concernsByUrbanity[urbanity];
  const concerns: Partial<Record<IssueKey, number>> = {};
  for (const k of Object.keys(d.content.issues).sort() as IssueKey[]) {
    const v = (base[k] ?? 0) + rng.range(-0.15, 0.15);
    const o = overrides.concerns?.[k];
    const val = o !== undefined ? o : v;
    if (Math.abs(val) >= 0.02) concerns[k] = round(clamp(val, -1, 1), 2);
  }
  const wp = partySpec(d, winner).ideology;
  const rp = partySpec(d, runner).ideology;
  const leanings: Ideology = {
    economic: round(
      clamp(wp.economic * 0.55 + rp.economic * 0.35 + rng.normalish() * 8, -100, 100),
    ),
    social: round(clamp(wp.social * 0.55 + rp.social * 0.35 + rng.normalish() * 8, -100, 100)),
  };
  const homeBase = urbanity === 'urban' ? 0.48 : urbanity === 'suburban' ? 0.68 : 0.72;
  return {
    id,
    externalCode: null,
    name,
    nation,
    region,
    electorate,
    demographics: {
      medianAge: rng.int(urbanity === 'urban' ? 32 : 38, urbanity === 'urban' ? 40 : 50),
      graduateShare: round(
        clamp(rng.range(0.2, 0.45) + (urbanity === 'urban' ? 0.08 : 0), 0, 1),
        2,
      ),
      homeownerShare:
        overrides.homeownerShare ?? round(clamp(homeBase + rng.range(-0.08, 0.08), 0, 1), 2),
      urbanity,
    },
    economy: {
      unemploymentRate: round(rng.range(0.02, 0.08), 3),
      medianIncomeIndex: rng.int(80, 125),
    },
    leanings,
    concerns,
    currentMpId: mpId,
    results: [
      buildResult(rng, d.scenario.electionDate, electorate, winner, runner, majority, mpId, d),
    ],
  };
}

/* ----------------------------------------------------------------------------
 * Politicians
 * ------------------------------------------------------------------------- */

function generateSkills(rng: Rng): Skills {
  const s = {} as Skills;
  for (const k of SKILL_KEYS) s[k] = clamp(Math.round(10 + rng.normalish() * 2.6), 3, 18);
  return s;
}

function generateTraits(rng: Rng, content: ContentRegistry): TraitKey[] {
  const roll = rng.float();
  const n = roll < 0.05 ? 0 : roll < 0.65 ? 1 : 2;
  const out: TraitKey[] = [];
  const all = (Object.keys(content.traits).sort() as TraitKey[]).filter(
    (k) => (content.traits[k]?.weight ?? 0) > 0,
  );
  for (let i = 0; i < n; i++) {
    const allowed = all.filter(
      (k) =>
        !out.includes(k) &&
        !out.some(
          (o) => content.traits[o]?.excludes.includes(k) || content.traits[k]?.excludes.includes(o),
        ),
    );
    if (allowed.length === 0) break;
    out.push(rng.weighted(allowed, (k) => content.traits[k]?.weight ?? 0));
  }
  return out.sort();
}

function generateStances(
  d: Draft,
  rng: Rng,
  party: ScenarioPartySpec,
  faction: FactionSpecLike | null,
  concerns: Partial<Record<IssueKey, number>>,
): IssueStances {
  const out: IssueStances = {};
  for (const k of Object.keys(d.content.issues).sort() as IssueKey[]) {
    const v =
      (party.stanceBaseline[k] ?? 0) +
      (faction?.stanceShift[k] ?? 0) +
      (concerns[k] ?? 0) * 0.8 +
      rng.normalish() * 0.55;
    out[k] = clamp(Math.round(v), -2, 2) as Stance;
  }
  return out;
}

type FactionSpecLike = ScenarioDefinition['factions'][number];

function nameFor(d: Draft, rng: Rng, gender: Gender): { first: string; last: string } {
  const pool =
    gender === 'female'
      ? d.content.names.female
      : gender === 'male'
        ? d.content.names.male
        : d.content.names.nonbinary;
  for (let i = 0; i < 100; i++) {
    const first = rng.pick(pool);
    const last = rng.pick(d.content.names.surnames);
    const full = `${first} ${last}`;
    if (!d.usedNames.has(full)) {
      d.usedNames.add(full);
      return { first, last };
    }
  }
  throw new Error('Name pools exhausted');
}

function blankPolitician(
  id: PoliticianId,
): Omit<
  Politician,
  | 'name'
  | 'dateOfBirth'
  | 'gender'
  | 'partyId'
  | 'constituencyId'
  | 'ideology'
  | 'stances'
  | 'traits'
  | 'skills'
  | 'ambition'
  | 'riskTolerance'
  | 'partyLoyalty'
> {
  return {
    id,
    factionId: null,
    status: 'mp',
    offices: [],
    reputation: { public: 0, party_members: 0, colleagues: 0, media: 0, whips: 0 },
    politicalCapital: 0,
    localStanding: 20,
    endorsedBy: [],
    newIntake: false,
    isPlayer: false,
    castKey: null,
    career: [],
    rebellions: [],
    rebellionCount: 0,
    fidelity: 'low',
    ai: { lastPlannedTurn: 0, recentActions: [] },
  };
}

/* ----------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */

/**
 * Generate a campaign world from scenario content and a seed (07 §2–3): 650 seats matching the seat
 * totals and nation splits, the named cast in their seats, the player in their marginal, generated
 * MPs around party/faction centroids, a sparse initial relationship web, the government formed and
 * the bill introduced. Deterministic for (scenario, seed, player, content, SIMULATION_VERSION).
 */
export function createCampaignState(input: CreateCampaignInput, ctx: SimulationContext): GameState {
  assertVersion(ctx);
  const setup = PlayerSetupSchema.parse(input.player);
  const scenario = input.scenario;
  const content = ctx.content;
  const seed = input.seed >>> 0;
  const d: Draft = {
    scenario,
    content,
    root: rootRngState(seed),
    politicians: new Map(),
    constituencies: new Map(),
    usedNames: new Set(),
    counters: {},
  };
  const gov = scenario.governmentPartyId;
  const castByKey = new Map(scenario.cast.map((c) => [c.key, c]));
  const castId = (key: string | null): PoliticianId | null =>
    key ? (castByKey.get(key)?.id ?? null) : null;
  const election = scenario.electionDate;

  // 1. Seat plan: (nation, party) slots minus the authored cast and player seats.
  const authoredSeats: { nation: Nation; partyId: PartyId }[] = [
    ...scenario.cast.map((c) => ({ nation: c.seat.nation, partyId: c.partyId })),
    { nation: scenario.player.seat.nation, partyId: gov },
  ];
  const slots: SeatSlot[] = [];
  for (const nation of NATIONS) {
    for (const p of scenario.parties) {
      const authored = authoredSeats.filter(
        (s) => s.nation === nation && s.partyId === p.id,
      ).length;
      const n = p.seatsByNation[nation] - authored;
      if (n < 0)
        throw new Error(`Scenario places more ${p.id} cast in ${nation} than it has seats`);
      for (let i = 0; i < n; i++) slots.push({ nation, partyId: p.id });
    }
  }

  // 2. Names and seats for generated slots.
  const usedSeatNames = new Set<string>([
    ...scenario.cast.map((c) => c.seat.name),
    scenario.player.seat.name,
  ]);
  const usedIds = new Set<string>([
    ...scenario.cast.map((c) => c.seat.id),
    scenario.player.seat.id,
  ]);
  const nameRng = fork(d, 'seat_names');
  const namers = Object.fromEntries(
    NATIONS.map((n) => [n, new ConstituencyNamer(content.places[n], nameRng, usedSeatNames)]),
  ) as Record<Nation, ConstituencyNamer>;
  const seatRng = fork(d, 'seats');
  const politicianRng = fork(d, 'politicians');
  interface GenSeat {
    slot: SeatSlot;
    id: ConstituencyId;
    name: string;
    region: RegionKey;
    urbanity: Urbanity;
    majority: number;
    runner: PartyId;
    mpId: PoliticianId;
    newIntake: boolean;
  }
  const generated: GenSeat[] = [];
  let polN = 0;
  for (const slot of slots) {
    const name = namers[slot.nation].name();
    let id = `con.${slugify(name)}`;
    let k = 2;
    while (usedIds.has(id)) id = `con.${slugify(name)}_${k++}`;
    usedIds.add(id);
    const spec = partySpec(d, slot.partyId);
    const region = seatRng.weighted(scenario.regions[slot.nation], (r) => r.weight).key;
    const urbanity: Urbanity =
      region === 'region.london'
        ? seatRng.chance(0.85)
          ? 'urban'
          : 'suburban'
        : seatRng.weighted(['urban', 'suburban', 'rural'] as const, (u) => spec.urbanityWeights[u]);
    const [lo, hi] = spec.majorityRange;
    const u = seatRng.float();
    const majority = Math.round(lo + (hi - lo) * u * u);
    const runner = runnerUpFor(seatRng, slot.partyId, slot.nation, d);
    const newIntakeP = spec.isGovernment
      ? clamp(scenario.newIntakeShare * (majority < 6000 ? 1.8 : 0.45), 0, 0.95)
      : 0.12;
    polN += 1;
    generated.push({
      slot,
      id: id as ConstituencyId,
      name,
      region,
      urbanity,
      majority,
      runner,
      mpId: `pol_${pad(polN)}` as PoliticianId,
      newIntake: seatRng.chance(newIntakeP),
    });
  }
  d.counters['pol'] = polN;

  // 3. Speaker: a long-serving government MP in a safe seat (does not vote, joins no faction).
  const speakerSeat = seatRng.pick(
    generated.filter(
      (g) => g.slot.partyId === scenario.speakerPartyId && !g.newIntake && g.majority > 10000,
    ),
  );

  // 4. Faction membership for generated government-party MPs (weighted by seat profile).
  const factionOf = new Map<PoliticianId, FactionId>();
  const factionRng = fork(d, 'factions');
  for (const f of scenario.factions) {
    const party = partySpec(d, f.partyId);
    const castMembers = scenario.cast.filter((c) => c.factionId === f.id).length;
    const playerMember = scenario.player.presets[setup.ideologyPreset].factionId === f.id ? 1 : 0;
    const quota = Math.max(0, Math.round(f.share * party.seats) - castMembers - playerMember);
    let pool = generated.filter(
      (g) => g.slot.partyId === f.partyId && g !== speakerSeat && !factionOf.has(g.mpId),
    );
    for (let i = 0; i < quota && pool.length > 0; i++) {
      const pick = factionRng.weighted(pool, (g) => {
        let w = f.urbanityAffinity[g.urbanity] * (f.regionAffinity[g.region] ?? 1);
        if (g.majority < 5000) w *= 1 + f.marginalAffinity;
        return w;
      });
      factionOf.set(pick.mpId, f.id);
      pool = pool.filter((g) => g !== pick);
    }
  }

  // 5. Generated MPs and their seats.
  for (const g of generated) {
    const rng = politicianRng;
    const spec = partySpec(d, g.slot.partyId);
    const fid = g === speakerSeat ? null : (factionOf.get(g.mpId) ?? null);
    const fspec = fid ? (scenario.factions.find((f) => f.id === fid) ?? null) : null;
    const c = constituencyFrom(
      d,
      seatRng,
      g.id,
      g.name,
      g.slot.nation,
      g.region,
      g.urbanity,
      g.slot.partyId,
      g.runner,
      g.majority,
      g.mpId,
      {},
    );
    d.constituencies.set(c.id, c);
    const genderRoll = rng.float();
    const gender: Gender = genderRoll < 0.47 ? 'female' : genderRoll < 0.985 ? 'male' : 'nonbinary';
    const centre = fspec?.ideology ?? spec.ideology;
    const traits = generateTraits(rng, content);
    const ambitionKeys = (Object.keys(content.ambitions).sort() as AmbitionKey[]).filter(
      (k) => (content.ambitions[k]?.weight ?? 0) > 0,
    );
    const ambition = rng.weighted(ambitionKeys, (k) => content.ambitions[k]?.weight ?? 0);
    const issueKeys = Object.keys(content.issues).sort() as IssueKey[];
    let risk = rng.weighted([-2, -1, 0, 1, 2], (r) => [1, 3, 5, 3, 1][r + 2] ?? 0);
    if (traits.includes('trait.maverick') || traits.includes('trait.combative')) risk += 1;
    if (traits.includes('trait.cautious')) risk -= 1;
    const loyalty = clamp(
      Math.round(
        spec.loyaltyMean +
          (fspec?.loyaltyShift ?? 0) +
          rng.normalish() * 16 +
          (g.newIntake ? 6 : 0),
      ),
      -100,
      100,
    );
    const firstElected = g.newIntake ? election : rng.pick(PAST_ELECTIONS);
    const name = nameFor(d, rng, gender);
    const p: Politician = {
      ...blankPolitician(g.mpId),
      name: { ...name, honorific: null },
      dateOfBirth: birthDate(rng, g.newIntake ? 28 : 36, g.newIntake ? 52 : 72, scenario.startDate),
      gender,
      partyId: g.slot.partyId,
      factionId: fid,
      constituencyId: c.id,
      ideology: {
        economic: round(clamp(centre.economic + rng.normalish() * spec.ideologySpread, -100, 100)),
        social: round(clamp(centre.social + rng.normalish() * spec.ideologySpread, -100, 100)),
      },
      stances: generateStances(d, rng, spec, fspec, c.concerns),
      traits,
      skills: generateSkills(rng),
      ambition: {
        target: ambition,
        intensity: rng.int(1, 5),
        cause:
          ambition === 'ambition.policy_cause' ? (fspec?.demands[0] ?? rng.pick(issueKeys)) : null,
      },
      riskTolerance: clamp(risk, -2, 2),
      partyLoyalty: loyalty,
      politicalCapital: rng.int(1, 4),
      reputation: {
        public: rng.int(-5, 10),
        party_members: rng.int(0, 15),
        colleagues: g.newIntake ? 0 : rng.int(0, 20),
        media: rng.int(-5, 10),
        whips: clamp(Math.round((loyalty - 40) / 3), -100, 100),
      },
      localStanding: rng.int(10, 40),
      newIntake: g.newIntake,
      career: [
        {
          date: firstElected,
          turn: 0,
          kind: 'elected',
          officeKey: null,
          text: g.newIntake
            ? `Elected MP for ${c.name} (majority ${formatNumber(g.majority)})`
            : `First elected for ${c.name}`,
        },
      ],
    };
    if (g === speakerSeat) {
      p.offices.push({ officeKey: 'office.speaker', since: election });
      p.ai = null;
    }
    d.politicians.set(p.id, p);
  }

  // 6. The named cast and their seats.
  const castRng = fork(d, 'cast');
  for (const cs of scenario.cast) {
    const seat = cs.seat;
    const c = constituencyFrom(
      d,
      castRng,
      seat.id,
      seat.name,
      seat.nation,
      seat.region,
      seat.urbanity,
      cs.partyId,
      seat.runnerUpPartyId,
      seat.majority,
      cs.id,
      {
        homeownerShare: seat.homeownerShare,
        concerns: seat.concerns,
      },
    );
    d.constituencies.set(c.id, c);
    d.usedNames.add(`${cs.first} ${cs.last}`);
    d.politicians.set(cs.id, castPolitician(d, castRng, cs, c));
  }

  // 7. The player.
  const ps = scenario.player.seat;
  const playerSeat = constituencyFrom(
    d,
    fork(d, 'player'),
    ps.id,
    ps.name,
    ps.nation,
    ps.region,
    ps.urbanity,
    gov,
    ps.runnerUpPartyId,
    ps.majority,
    scenario.player.id,
    {
      homeownerShare: ps.homeownerShare,
      concerns: ps.concerns,
    },
  );
  d.constituencies.set(playerSeat.id, playerSeat);
  d.politicians.set(scenario.player.id, playerPolitician(d, setup, playerSeat));

  // 8. Parties, factions, offices.
  const politicianIds = [...d.politicians.keys()].sort();
  const byParty = (pid: PartyId) =>
    politicianIds.map((id) => d.politicians.get(id) as Politician).filter((p) => p.partyId === pid);
  const officeRng = fork(d, 'offices');
  const appointments: Record<OfficeKey, PoliticianId | null> = {};
  for (const k of [...scenario.governmentOffices, ...scenario.generatedCabinetOffices])
    appointments[k] = null;
  const opposition: Record<OfficeKey, PoliticianId | null> = {};
  for (const k of scenario.oppositionOffices) opposition[k] = null;
  for (const cs of scenario.cast) {
    for (const o of cs.offices) {
      if (o in appointments) appointments[o] = cs.id;
      else if (o in opposition) opposition[o] = cs.id;
    }
  }
  const cabinetPool = byParty(gov)
    .filter(
      (p) =>
        !p.isPlayer &&
        p.castKey === null &&
        !p.newIntake &&
        p.offices.length === 0 &&
        p.factionId !== 'faction.heartlands' &&
        p.factionId !== 'faction.shire_suburbs',
    )
    .map((p) => ({ p, score: p.skills.administration + p.skills.policy + officeRng.range(0, 6) }))
    .sort((a, b) => b.score - a.score || compareStrings(a.p.id, b.p.id));
  scenario.generatedCabinetOffices.forEach((office, i) => {
    const pick = cabinetPool[i];
    if (!pick) return;
    appointments[office] = pick.p.id;
    pick.p.skills.administration = clamp(pick.p.skills.administration + 2, 1, 20);
    pick.p.skills.policy = clamp(pick.p.skills.policy + 2, 1, 20);
    pick.p.partyLoyalty = clamp(pick.p.partyLoyalty + 15, -100, 100);
    pick.p.politicalCapital += 2;
    pick.p.reputation.public += 8;
  });
  for (const [k, holder] of [...Object.entries(appointments), ...Object.entries(opposition)] as [
    OfficeKey,
    PoliticianId | null,
  ][]) {
    if (holder === null) continue;
    const p = d.politicians.get(holder);
    if (p && !p.offices.some((o) => o.officeKey === k))
      p.offices.push({ officeKey: k, since: election });
  }

  const parties: Record<PartyId, Party> = {};
  for (const spec of scenario.parties) {
    const members = byParty(spec.id).filter((p) =>
      p.offices.every((o) => o.officeKey !== 'office.speaker'),
    );
    const best = (skill: keyof Skills) =>
      members
        .slice()
        .sort((a, b) => b.skills[skill] - a.skills[skill] || compareStrings(a.id, b.id))[0]?.id ??
      null;
    const leaderId = castId(spec.leaderCastKey) ?? (spec.whipStrength > 0 ? best('oratory') : null);
    const chiefWhipId =
      castId(spec.chiefWhipCastKey) ?? (spec.whipStrength > 0 ? best('intrigue') : null);
    parties[spec.id] = {
      id: spec.id,
      name: spec.name,
      shortName: spec.shortName,
      colour: spec.colour,
      ideology: { ...spec.ideology },
      leaderId,
      chiefWhipId,
      whipStrength: spec.whipStrength,
      factionIds: scenario.factions
        .filter((f) => f.partyId === spec.id)
        .map((f) => f.id)
        .sort(),
      membership: spec.membership,
      funds: spec.funds,
      standing: { nationalPollShare: spec.pollShare },
      unity: clamp(Math.round(spec.loyaltyMean), -100, 100),
    };
  }
  const factions: Record<FactionId, Faction> = {};
  for (const f of scenario.factions) {
    factions[f.id] = {
      id: f.id,
      partyId: f.partyId,
      name: f.name,
      ideology: { ...f.ideology },
      leaderId: castId(f.leaderCastKey),
      memberIds: politicianIds.filter((id) => d.politicians.get(id)?.factionId === f.id),
      cohesion: f.cohesion,
      demands: [...f.demands],
    };
  }

  // 9. Parliament & government.
  const bills: Record<string, Bill> = {};
  const divisions: Record<string, Division> = {};
  for (const b of scenario.bills) {
    const sponsorId = castId(b.sponsorCastKey);
    if (!sponsorId) throw new Error(`Bill ${b.id} sponsor ${b.sponsorCastKey} is not in the cast`);
    bills[b.id] = {
      id: b.id,
      title: b.title,
      summary: b.summary,
      sponsorId,
      departmentKey: b.departmentKey,
      issues: { ...b.issues },
      stage: 'first_reading',
      stageDates: { first_reading: b.introducedOn },
      whipping: Object.fromEntries(Object.entries(b.whipping).map(([k, w]) => [k, { ...w }])),
      divisionIds: b.divisions.map((x) => x.id),
      amendments: [],
      englandOnly: b.englandOnly,
    };
    for (const dv of b.divisions) {
      divisions[dv.id] = {
        id: dv.id,
        billId: b.id,
        stage: dv.stage,
        scheduledFor: dv.date,
        turn: dv.turn,
        status: 'scheduled',
        declarations: {},
        pressure: {},
        whipIntel: {},
        whipAttention: {},
        result: null,
      };
    }
  }
  const seats: Record<PartyId, number> = {};
  for (const spec of scenario.parties) seats[spec.id] = byParty(spec.id).length;
  const pm = scenario.cast.find((c) => c.offices.includes('office.prime_minister'));
  if (!pm) throw new Error('Scenario cast has no Prime Minister');
  const fatherOfHouse = scenario.cast.find((c) => c.isFatherOfHouse)?.id ?? null;
  const totalPoll = scenario.parties.reduce((s, p) => s + p.pollShare, 0);

  const state: GameState = {
    meta: {
      schemaVersion: STATE_SCHEMA_VERSION,
      simulationVersion: SIMULATION_VERSION,
      contentVersion: content.version,
      scenarioKey: scenario.key,
      seed,
      turn: 1,
      date: scenario.startDate,
      rng: d.root,
      idCounters: { ...d.counters },
      historySeq: 0,
    },
    player: {
      politicianId: scenario.player.id,
      plannedActions: [],
      diarySlots: scenario.player.diarySlots,
      knowledge: { intentions: {}, intel: [] },
      setup,
    },
    politicians: { byId: Object.fromEntries(d.politicians), ids: politicianIds },
    parties: { byId: parties, ids: Object.keys(parties).sort() as PartyId[] },
    factions: { byId: factions, ids: Object.keys(factions).sort() as FactionId[] },
    constituencies: {
      byId: Object.fromEntries(d.constituencies),
      ids: [...d.constituencies.keys()].sort(),
    },
    relationships: { edges: {} },
    parliament: {
      session: { number: scenario.sessionNumber, openedOn: scenario.startDate },
      seats,
      governmentPartyIds: [gov],
      confidenceAndSupply: [],
      bills: { byId: bills, ids: Object.keys(bills).sort() as Bill['id'][] },
      divisions: { byId: divisions, ids: Object.keys(divisions).sort() as Division['id'][] },
      speakerId: speakerSeat?.mpId ?? null,
      fatherOfHouseId: fatherOfHouse,
      sittingWeeks: { recesses: scenario.recesses.map((r) => ({ ...r })) },
      oppositionAppointments: opposition,
    },
    government: {
      primeMinisterId: pm.id,
      partyIds: [gov],
      appointments,
      priorities: [...scenario.priorities],
      agenda: scenario.bills.map((b) => b.id),
      stability: 20,
      lastDefeatTurn: null,
    },
    opinion: {
      polls: Object.fromEntries(
        scenario.parties.map((p) => [p.id, round(p.pollShare / totalPoll, 4)]),
      ),
      governmentApproval: 12,
    },
    events: { pending: [], cooldowns: {} },
    scheduled: [],
    careers: {
      promotionRequests: [],
      lastPromotionRequestTurn: {},
      reshuffleRequestedTurn: null,
      lastReshuffleTurn: null,
    },
    recentHistory: [],
    inbox: [],
    briefing: { turn: 1, date: scenario.startDate, headlines: [] },
  };

  // 10. Relationships (needs the assembled state for derived defaults).
  state.relationships.edges = buildInitialRelationships(state, scenario, fork(d, 'relationships'));

  // 11. Fidelity tiers, opening history, briefing and inbox.
  for (const [id, tier] of computeFidelity(state, content)) {
    const p = state.politicians.byId[id];
    if (p) p.fidelity = tier;
  }
  openingChronicle(state, scenario, ctx);
  return state;
}

function castPolitician(d: Draft, rng: Rng, cs: CastSpec, c: Constituency): Politician {
  const stances: IssueStances = {};
  const spec = partySpec(d, cs.partyId);
  const fspec = cs.factionId
    ? (d.scenario.factions.find((f) => f.id === cs.factionId) ?? null)
    : null;
  const generatedStances = generateStances(d, rng, spec, fspec, c.concerns);
  for (const k of Object.keys(d.content.issues).sort() as IssueKey[])
    stances[k] = cs.stances[k] ?? generatedStances[k] ?? 0;
  const hasOffice = cs.offices.length > 0;
  return {
    ...blankPolitician(cs.id),
    name: { first: cs.first, last: cs.last, honorific: cs.honorific },
    dateOfBirth: cs.dateOfBirth,
    gender: cs.gender,
    partyId: cs.partyId,
    factionId: cs.factionId,
    constituencyId: c.id,
    ideology: { ...cs.ideology },
    stances,
    traits: [...cs.traits].sort(),
    skills: { ...cs.skills },
    ambition: { ...cs.ambition },
    riskTolerance: cs.riskTolerance,
    partyLoyalty: cs.partyLoyalty,
    politicalCapital: 4 + (hasOffice ? 2 : 0),
    reputation: {
      public: hasOffice ? rng.int(10, 30) : rng.int(0, 15),
      party_members: rng.int(10, 30),
      colleagues: cs.traits.includes('trait.respected') ? 40 : cs.newIntake ? 5 : rng.int(10, 30),
      media: hasOffice ? rng.int(10, 30) : rng.int(0, 15),
      whips: clamp(Math.round((cs.partyLoyalty - 40) / 2), -100, 100),
    },
    localStanding: rng.int(20, 45),
    newIntake: cs.newIntake,
    castKey: cs.key,
    career: [
      {
        date: cs.firstElected,
        turn: 0,
        kind: 'elected',
        officeKey: null,
        text: cs.newIntake
          ? `Elected MP for ${c.name} (majority ${formatNumber(majorityOf(c))})`
          : `First elected for ${c.name}`,
      },
    ],
  };
}

function playerPolitician(d: Draft, setup: PlayerSetup, c: Constituency): Politician {
  const s = d.scenario;
  const rng = fork(d, 'player_attributes');
  const preset = s.player.presets[setup.ideologyPreset];
  const [lo, hi] = s.player.skillRange;
  const skills = {} as Skills;
  for (const k of SKILL_KEYS) skills[k] = rng.int(lo, hi);
  skills[setup.strength] = s.player.strengthValue;
  const stances: IssueStances = {};
  const spec = partySpec(d, s.governmentPartyId);
  for (const k of Object.keys(d.content.issues).sort() as IssueKey[]) {
    stances[k] =
      preset.stances[k] ?? (clamp(Math.round(spec.stanceBaseline[k] ?? 0), -2, 2) as Stance);
  }
  d.usedNames.add(`${setup.firstName} ${setup.lastName}`);
  return {
    ...blankPolitician(s.player.id),
    name: { first: setup.firstName, last: setup.lastName, honorific: null },
    dateOfBirth: s.player.dateOfBirth,
    gender: setup.gender,
    partyId: s.governmentPartyId,
    factionId: preset.factionId,
    constituencyId: c.id,
    ideology: { ...preset.ideology },
    stances,
    traits: [],
    skills,
    ambition: {
      target: s.player.ambition.target,
      intensity: s.player.ambition.intensity,
      cause: null,
    },
    riskTolerance: preset.riskTolerance,
    partyLoyalty: preset.partyLoyalty,
    politicalCapital: s.player.startingCapital,
    localStanding: 20,
    newIntake: true,
    isPlayer: true,
    castKey: null,
    fidelity: 'high',
    ai: null,
    career: [
      {
        date: s.electionDate,
        turn: 0,
        kind: 'elected',
        officeKey: null,
        text: `Elected MP for ${c.name} (majority ${formatNumber(majorityOf(c))})`,
      },
    ],
  };
}

function openingChronicle(
  state: GameState,
  scenario: ScenarioDefinition,
  ctx: SimulationContext,
): void {
  const tc = new TurnContext(state, ctx);
  const me = state.politicians.byId[state.player.politicianId];
  if (!me || me.constituencyId === null) return;
  const seat = state.constituencies.byId[me.constituencyId];
  if (!seat) return;
  const name = `${me.name.first} ${me.name.last}`;
  const party = state.parties.byId[scenario.governmentPartyId];
  const newIntake = state.politicians.ids.filter((id) => {
    const p = state.politicians.byId[id];
    return p?.newIntake === true && p.partyId === scenario.governmentPartyId;
  }).length;
  tc.record(state, {
    type: 'election',
    payload: {
      constituencyId: seat.id,
      partyId: scenario.governmentPartyId,
      majority: majorityOf(seat),
    },
    importance: 3,
    template: 'election.won',
    vars: {
      actor: name,
      constituency: seat.name,
      party: party?.name ?? '',
      majority: formatNumber(majorityOf(seat)),
    },
    actorIds: [me.id],
    subjectIds: [seat.id],
    date: scenario.electionDate,
  });
  tc.record(state, {
    type: 'campaign',
    payload: { note: scenario.title },
    importance: 2,
    template: 'campaign.created',
    vars: { actor: name, constituency: seat.name, count: newIntake },
    actorIds: [me.id],
    subjectIds: [],
  });
  const firstDivision = state.parliament.divisions.ids
    .map((id) => state.parliament.divisions.byId[id])
    .filter((x): x is Division => x !== undefined)
    .sort((a, b) => a.turn - b.turn)[0];
  const bill = firstDivision ? state.parliament.bills.byId[firstDivision.billId] : undefined;
  const headlines = [headlineText(ctx.content, 'quiet_week', {}, state.meta.seed, 0)];
  if (firstDivision && bill) {
    headlines.unshift(
      headlineText(
        ctx.content,
        'division.upcoming',
        {
          bill: bill.title,
          stage: 'second reading',
          date: formatSimDate(firstDivision.scheduledFor),
        },
        state.meta.seed,
        0,
      ),
    );
  }
  // The briefing belongs to the week now open for planning (turn 1 at creation).
  state.briefing = {
    turn: state.meta.turn,
    date: state.meta.date,
    headlines: headlines.map((h, i) => ({
      text: h.text,
      standfirst: h.standfirst === '' ? null : h.standfirst,
      importance: i === 0 ? 3 : 1,
    })),
  };
  tc.notify(state, {
    severity: 'info',
    title: `Welcome to Westminster, ${me.name.first}`,
    body: `You hold ${seat.name} by ${formatNumber(majorityOf(seat))} votes. The ${bill?.title ?? 'flagship bill'} comes to a vote on ${firstDivision ? formatSimDate(firstDivision.scheduledFor) : 'soon'}; the whips expect you to back it.`,
    link: bill ? { kind: 'bill', id: bill.id } : null,
  });
}
