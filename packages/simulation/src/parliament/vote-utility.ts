import {
  DECLARATION_PRECEDENCE,
  type Bill,
  type ContentRegistry,
  type Declaration,
  type Division,
  type GameState,
  type Politician,
  type PoliticianId,
  type Stance,
  type Vote,
  type WhipInstruction,
} from '@whip/domain';
import { hashUnit } from '../rng';
import {
  clamp,
  formatNumber,
  getBill,
  getConstituency,
  getPolitician,
  isGovernmentParty,
  isOnPayroll,
  majorityOf,
  round,
  signed,
  sortedEntries,
  compareStrings,
} from '../state/access';
import { VOTE } from './tuning';

export type VoteTermKey =
  | 'ideology'
  | 'whip'
  | 'payroll'
  | 'career'
  | 'pressure'
  | 'faction'
  | 'cause'
  | 'constituency'
  | 'commitment'
  | 'noise';

/** One explained component of an MP's vote utility (positive = towards aye). */
export interface VoteTerm {
  key: VoteTermKey;
  label: string;
  value: number;
}

export interface VoteBreakdown {
  /** Final utility after any abstain-whip dampening. */
  utility: number;
  terms: VoteTerm[];
}

export type VoteRule = 'utility' | 'declared' | 'abstainer' | 'player';

export interface VoteDecision {
  vote: Vote;
  rule: VoteRule;
  breakdown: VoteBreakdown;
}

/** How far a bill meets a demand on one issue: stance −2..2 → −1..1 (neutral 0 counts as unmet). */
export function demandValue(stance: number): number {
  return clamp((stance - 0.6) / 1.4, -1, 1);
}

export function whipFor(bill: Bill, mp: Politician): WhipInstruction | null {
  if (mp.partyId === null) return null;
  return bill.whipping[mp.partyId] ?? null;
}

/** Whip direction as a sign: aye +1, no −1, abstain/none 0. */
export function directionSign(v: Vote | null): number {
  return v === 'aye' ? 1 : v === 'no' ? -1 : 0;
}

function isWhipped(w: WhipInstruction | null): w is WhipInstruction & { direction: Vote } {
  return w !== null && (w.line === 'three_line' || w.line === 'two_line') && w.direction !== null;
}

function traitProduct(
  mp: Politician,
  content: ContentRegistry,
  pick: (t: ContentRegistry['traits'][keyof ContentRegistry['traits']]) => number,
): number {
  let m = 1;
  for (const t of mp.traits) {
    const def = content.traits[t];
    if (def) m *= pick(def);
  }
  return m;
}

/** 0.05..1.1: how strongly the whip binds this MP. */
export function loyaltyFactor(mp: Politician, content: ContentRegistry): number {
  let eff = mp.partyLoyalty;
  for (const t of mp.traits) eff += content.traits[t]?.vote.loyaltyBonus ?? 0;
  return clamp(0.35 + eff / 150, 0.05, 1.1);
}

/** 0.2 (safe) .. 1 (marginal) from the seat majority. */
export function marginality(majority: number): number {
  return clamp(1.15 - majority / 15000, 0.2, 1);
}

/**
 * Explained vote utility for one MP on one division (doc 03 §8). Positive = aye. Pure: depends only
 * on state, so forecasts made earlier in the week match the eventual vote unless something changes.
 */
export function voteUtility(
  state: GameState,
  mp: Politician,
  division: Division,
  content: ContentRegistry,
): VoteBreakdown {
  const bill = getBill(state, division.billId);
  const terms: VoteTerm[] = [];
  const principle = traitProduct(mp, content, (d) => d.vote.principleWeight);

  // Ideological fit: bill stances against the MP's issue stances.
  let dot = 0;
  for (const [issue, billStance] of sortedEntries(bill.issues) as [
    keyof Bill['issues'],
    Stance,
  ][]) {
    dot += billStance * (mp.stances[issue] ?? 0);
  }
  terms.push({
    key: 'ideology',
    label: 'Views on the bill',
    value: clamp(dot / 8, -1, 1) * VOTE.ideology * principle,
  });

  // Whip pressure, payroll vote and career calculus.
  const whip = whipFor(bill, mp);
  const party = mp.partyId !== null ? state.parties.byId[mp.partyId] : undefined;
  let abstainPull = 0;
  if (isWhipped(whip) && party) {
    const pull =
      VOTE.lineWeight[whip.line] *
      (party.whipStrength / 5) *
      loyaltyFactor(mp, content) *
      VOTE.whip;
    const dir = directionSign(whip.direction);
    const lineLabel = whip.line === 'three_line' ? 'Three-line whip' : 'Two-line whip';
    if (dir !== 0) {
      terms.push({ key: 'whip', label: `${lineLabel} (${whip.direction})`, value: dir * pull });
      if (isGovernmentParty(state, mp.partyId) && isOnPayroll(state, mp)) {
        terms.push({
          key: 'payroll',
          label: 'Collective responsibility',
          value: dir * VOTE.payroll,
        });
      }
      const amb = content.ambitions[mp.ambition.target];
      if (amb?.careerist) {
        const v = dir * (mp.ambition.intensity / 5) * VOTE.career * (1 - 0.2 * mp.riskTolerance);
        terms.push({ key: 'career', label: 'Career prospects', value: v });
      }
    } else {
      abstainPull = pull;
    }
  }

  // Lobbying received for this division.
  const pressure = division.pressure[mp.id];
  if (pressure && pressure.total !== 0) {
    terms.push({
      key: 'pressure',
      label: 'Lobbying',
      value: clamp(pressure.total, -VOTE.pressureCap, VOTE.pressureCap),
    });
  }

  // Faction line (+ per-division seeded faction mood, which correlates members' votes).
  if (mp.factionId !== null) {
    const f = state.factions.byId[mp.factionId];
    if (f && f.demands.length > 0) {
      let sum = 0;
      for (const d of f.demands) sum += demandValue(bill.issues[d] ?? 0);
      const mood =
        (hashUnit(state.meta.seed, division.id, f.id, 'mood') * 2 - 1) * VOTE.factionMood;
      const v = (sum / f.demands.length + mood) * f.cohesion * VOTE.faction * principle;
      terms.push({ key: 'faction', label: `${f.name} line`, value: v });
    }
  }

  // Personal cause.
  if (
    mp.ambition.target === 'ambition.policy_cause' &&
    mp.ambition.cause !== null &&
    mp.ambition.cause in bill.issues
  ) {
    const v =
      demandValue(bill.issues[mp.ambition.cause] ?? 0) *
      (mp.ambition.intensity / 5) *
      VOTE.cause *
      principle;
    const label = content.issues[mp.ambition.cause]?.label ?? mp.ambition.cause;
    terms.push({ key: 'cause', label: `Cause: ${label.toLowerCase()}`, value: v });
  }

  // Constituency interest × marginality.
  if (mp.constituencyId !== null) {
    const c = getConstituency(state, mp.constituencyId);
    let local = 0;
    for (const [issue, billStance] of sortedEntries(bill.issues) as [
      keyof Bill['issues'],
      Stance,
    ][]) {
      local += (billStance / 2) * (c.concerns[issue] ?? 0);
    }
    const seatWorry = mp.ambition.target === 'ambition.safe_seat' ? 1.5 : 1;
    const majority = majorityOf(c);
    const v = local * marginality(majority) * VOTE.constituency * seatWorry;
    if (v !== 0)
      terms.push({
        key: 'constituency',
        label: `Constituency (majority ${formatNumber(majority)})`,
        value: v,
      });
  }

  // Soft commitment: a promise made to a colleague.
  const decl = division.declarations[mp.id];
  if (decl && decl.source === 'promise') {
    terms.push({
      key: 'commitment',
      label: 'Promise to a colleague',
      value: directionSign(decl.vote) * VOTE.promise,
    });
  }

  terms.push({
    key: 'noise',
    label: 'Personal judgement',
    value: (hashUnit(state.meta.seed, division.id, mp.id, 'noise') * 2 - 1) * VOTE.noise,
  });

  let utility = 0;
  for (const t of terms) utility += t.value;
  if (abstainPull > 0) utility *= 1 - Math.min(0.9, abstainPull * VOTE.abstainDampen);
  if (decl && decl.source === 'promise' && decl.vote === 'abstain') utility *= 0.3;
  return { utility, terms };
}

export function voteFromUtility(u: number): Vote {
  return u > VOTE.threshold ? 'aye' : u < -VOTE.threshold ? 'no' : 'abstain';
}

/** Strongest declaration (rebellion > statement > promise), or null. */
export function strongestDeclaration(division: Division, id: PoliticianId): Declaration | null {
  return division.declarations[id] ?? null;
}

export function declarationOutranks(next: Declaration, current: Declaration | undefined): boolean {
  return (
    current === undefined ||
    DECLARATION_PRECEDENCE[next.source] >= DECLARATION_PRECEDENCE[current.source]
  );
}

/**
 * The player's vote: rebellion/statement/promise declarations first, else the party whip's
 * direction, else (free vote) their own utility (07 §4.2).
 */
export function playerIntendedVote(
  state: GameState,
  division: Division,
  content: ContentRegistry,
): Vote {
  const me = getPolitician(state, state.player.politicianId);
  const decl = division.declarations[me.id];
  if (decl) return decl.vote;
  const whip = whipFor(getBill(state, division.billId), me);
  if (isWhipped(whip)) return whip.direction;
  return voteFromUtility(voteUtility(state, me, division, content).utility);
}

/** Members who never vote on this bill: Scottish members on an England-only free vote. */
function isStructuralAbstainer(state: GameState, mp: Politician, bill: Bill): boolean {
  if (!bill.englandOnly || mp.constituencyId === null) return false;
  const whip = whipFor(bill, mp);
  if (isWhipped(whip)) return false;
  return getConstituency(state, mp.constituencyId).nation === 'scotland';
}

/** Full vote decision for any eligible MP (the Speaker is excluded by the caller). */
export function decideVote(
  state: GameState,
  mp: Politician,
  division: Division,
  content: ContentRegistry,
): VoteDecision {
  const breakdown = voteUtility(state, mp, division, content);
  if (mp.isPlayer)
    return { vote: playerIntendedVote(state, division, content), rule: 'player', breakdown };
  const decl = division.declarations[mp.id];
  if (decl && decl.source !== 'promise') return { vote: decl.vote, rule: 'declared', breakdown };
  const bill = getBill(state, division.billId);
  if (isStructuralAbstainer(state, mp, bill))
    return { vote: 'abstain', rule: 'abstainer', breakdown };
  const party = mp.partyId !== null ? state.parties.byId[mp.partyId] : undefined;
  if (
    party &&
    party.whipStrength === 0 &&
    Math.abs(breakdown.utility) <= VOTE.lowInterestThreshold
  ) {
    // Low-interest independents (07 §4.2).
    return { vote: 'abstain', rule: 'abstainer', breakdown };
  }
  return { vote: voteFromUtility(breakdown.utility), rule: 'utility', breakdown };
}

/** "Three-line whip (aye) +0.52" — the top-n terms by magnitude. */
export function topReasons(b: VoteBreakdown, n = 3): string[] {
  return b.terms
    .filter((t) => t.key !== 'noise' || Math.abs(t.value) > 0.08)
    .slice()
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value) || compareStrings(x.key, y.key))
    .slice(0, n)
    .map((t) => `${t.label} ${signed(round(t.value, 2))}`);
}

/** The single strongest term pulling against the whip direction (for rebel reasons). */
export function rebelReason(b: VoteBreakdown, whipDirection: Vote | null, vote: Vote): string {
  const want = whipDirection === null ? 0 : directionSign(whipDirection);
  const against = b.terms
    .filter((t) => (want === 0 ? true : Math.sign(t.value) === -want))
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value) || compareStrings(x.key, y.key))[0];
  if (!against) return `Voted ${vote} against the whip`;
  return against.label;
}
