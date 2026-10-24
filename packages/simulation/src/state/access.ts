import type {
  Bill,
  BillId,
  Constituency,
  ConstituencyId,
  ContentRegistry,
  Division,
  DivisionId,
  Faction,
  FactionId,
  GameState,
  OfficeKey,
  Party,
  PartyId,
  Politician,
  PoliticianId,
} from '@whip/domain';

/*
 * Read helpers over GameState. They never mutate. Lookups of ids that must exist throw, so
 * corrupted references fail loudly instead of silently changing outcomes.
 */

export function getPolitician(state: GameState, id: PoliticianId): Politician {
  const p = state.politicians.byId[id];
  if (!p) throw new Error(`Unknown politician ${id}`);
  return p;
}
export function findPolitician(state: GameState, id: string): Politician | undefined {
  return state.politicians.byId[id as PoliticianId];
}
export function getParty(state: GameState, id: PartyId): Party {
  const p = state.parties.byId[id];
  if (!p) throw new Error(`Unknown party ${id}`);
  return p;
}
export function getFaction(state: GameState, id: FactionId): Faction {
  const f = state.factions.byId[id];
  if (!f) throw new Error(`Unknown faction ${id}`);
  return f;
}
export function getConstituency(state: GameState, id: ConstituencyId): Constituency {
  const c = state.constituencies.byId[id];
  if (!c) throw new Error(`Unknown constituency ${id}`);
  return c;
}
export function getBill(state: GameState, id: BillId): Bill {
  const b = state.parliament.bills.byId[id];
  if (!b) throw new Error(`Unknown bill ${id}`);
  return b;
}
export function getDivision(state: GameState, id: DivisionId): Division {
  const d = state.parliament.divisions.byId[id];
  if (!d) throw new Error(`Unknown division ${id}`);
  return d;
}
export function findDivision(state: GameState, id: string): Division | undefined {
  return state.parliament.divisions.byId[id as DivisionId];
}

export function playerId(state: GameState): PoliticianId {
  return state.player.politicianId;
}
export function getPlayer(state: GameState): Politician {
  return getPolitician(state, state.player.politicianId);
}

export function isSitting(p: Politician): boolean {
  return p.status === 'mp' && p.constituencyId !== null;
}

/** Sorted ids of sitting MPs (state.politicians.ids is kept sorted). */
export function sittingMpIds(state: GameState): PoliticianId[] {
  return state.politicians.ids.filter((id) => {
    const p = state.politicians.byId[id];
    return p !== undefined && isSitting(p);
  });
}

export function displayName(p: Politician): string {
  return p.name.honorific
    ? `${p.name.honorific} ${p.name.first} ${p.name.last}`
    : `${p.name.first} ${p.name.last}`;
}
export function nameOf(state: GameState, id: PoliticianId | null): string {
  if (id === null) return 'nobody';
  const p = state.politicians.byId[id];
  return p ? displayName(p) : String(id);
}

export function holdsOffice(p: Politician, key: OfficeKey): boolean {
  return p.offices.some((o) => o.officeKey === key);
}

/** Holder of a government or opposition office, or null when vacant/not in play. */
export function officeHolder(state: GameState, key: OfficeKey): PoliticianId | null {
  return state.government.appointments[key] ?? state.parliament.oppositionAppointments[key] ?? null;
}

export function isGovernmentOffice(state: GameState, key: OfficeKey): boolean {
  return key in state.government.appointments;
}

/** Holds a ministerial office (cabinet, minister, whip, PM). PPS posts are not ministerial. */
export function isMinister(p: Politician, content: ContentRegistry): boolean {
  return p.offices.some((o) => content.offices[o.officeKey]?.ministerial === true);
}

/** On the "payroll vote": any government post including PPS (bound by collective responsibility). */
export function isOnPayroll(state: GameState, p: Politician): boolean {
  return p.offices.some((o) => isGovernmentOffice(state, o.officeKey));
}

export function isGovernmentParty(state: GameState, partyId: PartyId | null): boolean {
  return partyId !== null && state.parliament.governmentPartyIds.includes(partyId);
}

export function chiefWhipId(state: GameState): PoliticianId | null {
  return state.government.appointments['office.chief_whip'] ?? null;
}
export function deputyChiefWhipId(state: GameState): PoliticianId | null {
  return state.government.appointments['office.deputy_chief_whip'] ?? null;
}
export function primeMinisterId(state: GameState): PoliticianId {
  return state.government.primeMinisterId;
}

export function isFactionLeader(state: GameState, id: PoliticianId): boolean {
  return state.factions.ids.some((f) => state.factions.byId[f]?.leaderId === id);
}
export function isPartyLeader(state: GameState, id: PoliticianId): boolean {
  return state.parties.ids.some((p) => state.parties.byId[p]?.leaderId === id);
}

/** Majority of the most recent result in a constituency (winner minus runner-up). */
export function majorityOf(c: Constituency): number {
  const last = c.results[c.results.length - 1];
  if (!last) return 0;
  const votes = Object.values(last.votes).sort((a, b) => b - a);
  return (votes[0] ?? 0) - (votes[1] ?? 0);
}

export function seatMajority(state: GameState, p: Politician): number {
  if (p.constituencyId === null) return 0;
  return majorityOf(getConstituency(state, p.constituencyId));
}

/** Government seats minus all other seats (the conventional "working majority" ignores this nuance). */
export function governmentMajority(state: GameState): number {
  let gov = 0;
  let total = 0;
  for (const pid of state.parties.ids) {
    const seats = state.parliament.seats[pid] ?? 0;
    total += seats;
    if (state.parliament.governmentPartyIds.includes(pid)) gov += seats;
  }
  return gov - (total - gov);
}

/** Scheduled divisions sorted by (turn, date, id). */
export function scheduledDivisions(state: GameState): Division[] {
  return state.parliament.divisions.ids
    .map((id) => state.parliament.divisions.byId[id])
    .filter((d): d is Division => d !== undefined && d.status === 'scheduled')
    .sort(
      (a, b) =>
        a.turn - b.turn ||
        compareStrings(a.scheduledFor, b.scheduledFor) ||
        compareStrings(a.id, b.id),
    );
}

/** The next scheduled division of a bill, if any. */
export function nextDivisionOfBill(state: GameState, billId: BillId): Division | undefined {
  return scheduledDivisions(state).find((d) => d.billId === billId && d.turn >= state.meta.turn);
}

export function billBeforeHouse(b: Bill): boolean {
  return b.stage !== 'passed' && b.stage !== 'defeated' && b.stage !== 'withdrawn';
}

/**
 * Plain UTF-16 code-unit comparison (the same order as `Array.prototype.sort()` with no comparator).
 * Use this instead of locale-aware comparison, whose result depends on the host ICU data and locale and so
 * is not guaranteed deterministic across runtimes (ADR-0008 §3).
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortIds<T extends string>(ids: Iterable<T>): T[] {
  return Array.from(ids).sort();
}

/** Clamp to [min, max]; also normalises -0 to 0 so states round-trip through JSON exactly. */
export function clamp(v: number, min: number, max: number): number {
  const r = v < min ? min : v > max ? max : v;
  return r === 0 ? 0 : r;
}
/** Round to dp decimals (never returns -0). */
export function round(v: number, dp = 0): number {
  const f = 10 ** dp;
  const r = Math.round(v * f) / f;
  return r === 0 ? 0 : r;
}
export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** "12,345" — locale-independent thousands separator. */
export function formatNumber(n: number): string {
  const s = String(Math.abs(Math.round(n)));
  const withCommas = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${withCommas}` : withCommas;
}

/**
 * Object entries sorted by key. Use for any iteration whose order can affect results (including
 * floating-point sums): key insertion order differs between a live state and a deserialised one.
 */
export function sortedEntries<V>(obj: Partial<Record<string, V>>): [string, V][] {
  return Object.keys(obj)
    .sort()
    .map((k) => [k, obj[k] as V]);
}
export function sortedKeys(obj: object): string[] {
  return Object.keys(obj).sort();
}
