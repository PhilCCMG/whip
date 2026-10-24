import {
  MAX_MEMORIES_PER_EDGE,
  relationshipKey,
  type GameState,
  type MemoryKind,
  type PoliticianId,
  type Relationship,
  type ScenarioDefinition,
} from '@whip/domain';
import { defaultRelationship } from '../relationships/relationships';
import type { Rng } from '../rng';
import { clamp } from '../state/access';

interface Delta {
  trust?: number;
  respect?: number;
  affinity?: number;
  rivalry?: number;
}

/**
 * Sparse initial relationship web (07 §2–3): the authored cast web, new-intake friendships, regional
 * groups, faction ties and a few old-colleague links. Each stored edge starts from the derived
 * default plus the deltas below, so unstored pairs remain consistent with stored ones.
 */
export function buildInitialRelationships(
  state: GameState,
  scenario: ScenarioDefinition,
  rng: Rng,
): Record<string, Relationship> {
  const edges: Record<string, Relationship> = {};
  const add = (
    from: PoliticianId,
    to: PoliticianId,
    d: Delta,
    kind: MemoryKind | null,
    weight = 8,
    decaysBy = 0.2,
  ) => {
    if (from === to) return;
    const key = relationshipKey(from, to);
    const e = edges[key] ?? defaultRelationship(state, from, to);
    e.trust = clamp(Math.round(e.trust + (d.trust ?? 0)), -100, 100);
    e.respect = clamp(Math.round(e.respect + (d.respect ?? 0)), -100, 100);
    e.affinity = clamp(Math.round(e.affinity + (d.affinity ?? 0)), -100, 100);
    e.rivalry = clamp(e.rivalry + (d.rivalry ?? 0), 0, 3);
    if (
      kind &&
      e.memories.length < MAX_MEMORIES_PER_EDGE &&
      !e.memories.some((m) => m.kind === kind)
    ) {
      e.memories.push({ turn: 0, kind, weight, decaysBy, refId: null });
    }
    edges[key] = e;
  };
  const playerId = state.player.politicianId;
  const castIds = new Map(scenario.cast.map((c) => [c.key, c.id]));
  const resolve = (key: string): PoliticianId | undefined =>
    key === 'player' ? playerId : castIds.get(key);

  // 1. Authored cast web.
  for (const r of scenario.castRelationships) {
    const from = resolve(r.from);
    const to = resolve(r.to);
    if (!from || !to) continue;
    const warm = r.trust + r.respect + r.affinity >= 0;
    add(from, to, r, 'old_colleague', warm ? 12 : -12, 0.1);
  }

  const all = state.politicians.ids
    .map((id) => state.politicians.byId[id])
    .filter((p): p is NonNullable<typeof p> => p !== undefined && p.status === 'mp');
  const gov = scenario.governmentPartyId;

  // 2. New intake: each new MP knows a few of their cohort (mutual).
  const intake = all.filter((p) => p.newIntake && p.partyId === gov);
  for (const p of intake) {
    const others = intake.filter((o) => o.id !== p.id && o.castKey === null && !o.isPlayer);
    for (const o of rng.sample(others, p.isPlayer ? 4 : 2)) {
      const t = rng.int(5, 20);
      const a = rng.int(5, 20);
      add(p.id, o.id, { trust: t, affinity: a }, 'new_intake');
      add(o.id, p.id, { trust: t, affinity: a }, 'new_intake');
    }
  }

  // 3. Regional groups: party colleagues from the same region.
  const groups = new Map<string, PoliticianId[]>();
  for (const p of all) {
    if (p.partyId === null || p.constituencyId === null) continue;
    const region = state.constituencies.byId[p.constituencyId]?.region ?? 'region.unknown';
    const key = `${p.partyId}|${region}`;
    const list = groups.get(key) ?? [];
    list.push(p.id);
    groups.set(key, list);
  }
  for (const key of [...groups.keys()].sort()) {
    const members = groups.get(key) ?? [];
    for (const id of members) {
      const others = members.filter((o) => o !== id);
      const isPlayer = id === playerId;
      for (const o of rng.sample(others, isPlayer ? 3 : 2)) {
        add(id, o, { trust: rng.int(5, 15), affinity: rng.int(5, 15) }, 'regional_group');
        if (isPlayer)
          add(o, id, { trust: rng.int(3, 10), affinity: rng.int(3, 10) }, 'regional_group');
      }
    }
  }

  // 4. Factions: ties to the leader and a couple of fellow members.
  for (const fid of state.factions.ids) {
    const f = state.factions.byId[fid];
    if (!f || f.leaderId === null) continue;
    for (const m of f.memberIds) {
      if (m === f.leaderId) continue;
      add(
        m,
        f.leaderId,
        { trust: rng.int(0, 35), respect: rng.int(10, 40), affinity: rng.int(0, 20) },
        'faction_comrade',
        10,
        0.1,
      );
      if (rng.chance(0.25))
        add(f.leaderId, m, { trust: rng.int(5, 20), affinity: rng.int(0, 10) }, 'faction_comrade');
      for (const o of rng.sample(
        f.memberIds.filter((x) => x !== m && x !== f.leaderId),
        2,
      )) {
        add(m, o, { trust: rng.int(3, 10), affinity: rng.int(3, 12) }, 'faction_comrade');
      }
    }
  }

  // 5. Old colleagues among returning MPs (some warm, some not).
  const returning = all.filter((p) => !p.newIntake && !p.isPlayer);
  const byParty = new Map<string, PoliticianId[]>();
  for (const p of returning) {
    const list = byParty.get(p.partyId ?? 'none') ?? [];
    list.push(p.id);
    byParty.set(p.partyId ?? 'none', list);
  }
  for (const key of [...byParty.keys()].sort()) {
    const members = byParty.get(key) ?? [];
    for (const id of members) {
      for (const o of rng.sample(
        members.filter((x) => x !== id),
        2,
      )) {
        add(
          id,
          o,
          {
            trust: rng.int(-10, 15),
            respect: rng.int(0, 15),
            affinity: rng.int(-10, 15),
            rivalry: rng.chance(0.05) ? 1 : 0,
          },
          'old_colleague',
          5,
          0.1,
        );
      }
    }
  }
  // Canonical key order (sorted) so a fresh state and a reloaded one are laid out identically.
  const sorted: Record<string, Relationship> = {};
  for (const k of Object.keys(edges).sort()) {
    const e = edges[k];
    if (e) sorted[k] = e;
  }
  return sorted;
}
