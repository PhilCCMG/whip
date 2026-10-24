import type { ContentRegistry, FidelityTier, GameState, PartyId, PoliticianId } from '@whip/domain';
import { hashInt } from '../rng';
import { isFactionLeader, isPartyLeader, isSitting } from '../state/access';

/** How many turns back a player interaction keeps an NPC at high fidelity. */
const RECENT_CONTACT_TURNS = 4;
/** Parties whose backbenchers are "salient" (medium tier) in the slice. */
function salientParty(state: GameState, partyId: PartyId | null): boolean {
  if (partyId === null) return false;
  if (state.parliament.governmentPartyIds.includes(partyId)) return true;
  // The official opposition: the largest non-government party.
  let best: PartyId | null = null;
  let bestSeats = -1;
  for (const pid of state.parties.ids) {
    if (state.parliament.governmentPartyIds.includes(pid)) continue;
    const s = state.parliament.seats[pid] ?? 0;
    if (s > bestSeats) {
      best = pid;
      bestSeats = s;
    }
  }
  return best === partyId;
}

/**
 * Fidelity tiers (doc 03 §7), recomputed each turn from salience: office, leadership, the cast,
 * recent contact with the player and public commitments on a live division ⇒ high; other members of
 * salient parties ⇒ medium; everyone else ⇒ low. Tiers change how often NPCs plan, never the rules.
 */
export function computeFidelity(
  state: GameState,
  _content: ContentRegistry,
): Map<PoliticianId, FidelityTier> {
  const out = new Map<PoliticianId, FidelityTier>();
  const playerId = state.player.politicianId;
  const recent = new Set<PoliticianId>();
  for (const key of Object.keys(state.relationships.edges)) {
    const e = state.relationships.edges[key];
    if (!e || (e.from !== playerId && e.to !== playerId)) continue;
    if (
      e.memories.some(
        (m) =>
          m.turn >= state.meta.turn - RECENT_CONTACT_TURNS &&
          m.kind !== 'new_intake' &&
          m.kind !== 'regional_group',
      )
    ) {
      recent.add(e.from === playerId ? e.to : e.from);
    }
  }
  const declared = new Set<PoliticianId>();
  for (const did of state.parliament.divisions.ids) {
    const d = state.parliament.divisions.byId[did];
    if (!d || d.status !== 'scheduled') continue;
    for (const pid of Object.keys(d.declarations) as PoliticianId[]) {
      if (d.declarations[pid]?.source !== 'promise') declared.add(pid);
    }
  }
  for (const id of state.politicians.ids) {
    const p = state.politicians.byId[id];
    if (!p) continue;
    let tier: FidelityTier;
    if (!isSitting(p)) tier = 'low';
    else if (
      p.isPlayer ||
      p.castKey !== null ||
      p.offices.length > 0 ||
      isPartyLeader(state, id) ||
      isFactionLeader(state, id) ||
      state.parliament.fatherOfHouseId === id ||
      recent.has(id) ||
      declared.has(id)
    ) {
      tier = 'high';
    } else if (salientParty(state, p.partyId)) tier = 'medium';
    else tier = 'low';
    out.set(id, tier);
  }
  return out;
}

/** Medium-tier NPCs plan every 4th week, staggered deterministically by hash(id) % 4. */
export function plansThisTurn(id: PoliticianId, tier: FidelityTier, turn: number): boolean {
  if (tier === 'high') return true;
  if (tier === 'medium') return (hashInt(id) + turn) % 4 === 0;
  return false;
}
