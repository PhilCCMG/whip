import {
  relationshipKey,
  type ContentRegistry,
  type GameState,
  type Ideology,
  type Politician,
  type PoliticianId,
  type Relationship,
} from '@whip/domain';
import { clamp, getPolitician } from '../state/access';

/** Euclidean ideology distance, 0..~283. */
export function ideologyDistance(a: Ideology, b: Ideology): number {
  const de = a.economic - b.economic;
  const ds = a.social - b.social;
  return Math.sqrt(de * de + ds * ds);
}

/**
 * Political compatibility −1..1: ideology closeness plus shared party/faction. Derived, never stored
 * (doc 02 §4 "Political alignment is derived").
 */
export function compatibility(a: Politician, b: Politician): number {
  let c = 1 - ideologyDistance(a.ideology, b.ideology) / 80;
  if (a.partyId !== null && a.partyId === b.partyId) c += 0.3;
  if (a.factionId !== null && a.factionId === b.factionId) c += 0.25;
  return clamp(c, -1, 1);
}

/** Influence points of a politician's offices (used for derived respect and AI targeting). */
export function officeInfluence(p: Politician, content: ContentRegistry): number {
  let total = 0;
  for (const o of p.offices) total += content.offices[o.officeKey]?.influence ?? 0;
  return total;
}

/**
 * Default (unstored) relationship from → to, derived from party, faction, ideology and standing.
 * Integer-valued and deterministic. Stored edges start from this value when first adjusted.
 */
export function defaultRelationship(
  state: GameState,
  from: PoliticianId,
  to: PoliticianId,
): Relationship {
  const a = getPolitician(state, from);
  const b = getPolitician(state, to);
  let trust = 0;
  let respect = 0;
  let affinity = 0;
  if (a.partyId !== null && a.partyId === b.partyId) {
    trust += 10;
    respect += 8;
    affinity += 6;
    if (a.factionId !== null && a.factionId === b.factionId) {
      trust += 8;
      affinity += 6;
    }
  } else {
    trust -= 8;
    affinity -= 4;
    if (a.traits.includes('trait.tribal')) trust -= 8;
  }
  affinity += Math.round(8 - ideologyDistance(a.ideology, b.ideology) / 8);
  // Standing from office (state-only so the default needs no content): 8 per post, capped, +10 for the PM.
  respect +=
    Math.min(20, 8 * b.offices.length) + (state.government.primeMinisterId === to ? 10 : 0);
  if (b.traits.includes('trait.respected')) respect += 10;
  if (state.parliament.fatherOfHouseId === to) respect += 8;
  return {
    from,
    to,
    trust: clamp(trust, -100, 100),
    respect: clamp(respect, -100, 100),
    affinity: clamp(affinity, -100, 100),
    obligation: 0,
    rivalry: 0,
    memories: [],
  };
}

/** Stored edge or the derived default. */
export function getRelationship(
  state: GameState,
  from: PoliticianId,
  to: PoliticianId,
): Relationship {
  return (
    state.relationships.edges[relationshipKey(from, to)] ?? defaultRelationship(state, from, to)
  );
}

/**
 * How much `target` listens to `source` when lobbied: 0.1..1. Trust/respect/affinity raise it;
 * cross-party lobbying is halved unless trust ≥ 20 (07 §4.4).
 */
export function receptiveness(
  state: GameState,
  target: PoliticianId,
  source: PoliticianId,
): number {
  const rel = getRelationship(state, target, source);
  let f = 0.3 + (rel.trust + rel.respect + rel.affinity) / 200;
  const t = getPolitician(state, target);
  const s = getPolitician(state, source);
  if (t.partyId !== s.partyId && rel.trust < 20) f *= 0.5;
  if (t.traits.includes('trait.stubborn')) f *= 0.6;
  return clamp(f, 0.1, 1);
}

/** Ordered list of stored edges ending at `to` (scans the table; ~5k edges). */
export function incomingEdges(state: GameState, to: PoliticianId): Relationship[] {
  const out: Relationship[] = [];
  const suffix = `>${to}`;
  for (const key of Object.keys(state.relationships.edges).sort()) {
    if (key.endsWith(suffix)) {
      const e = state.relationships.edges[key];
      if (e) out.push(e);
    }
  }
  return out;
}
