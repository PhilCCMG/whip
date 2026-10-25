import {
  LegislationParamsSchema,
  RebelParamsSchema,
  type DivisionId,
  type Effect,
  type GameState,
  type IneligibilityReason,
  type LegislationParams,
  type Politician,
  type Vote,
} from '@whip/domain';
import { stageLabel, VOTE_LABEL } from '../chronicle/templates';
import { LOBBY } from '../parliament/tuning';
import { demandValue, directionSign, whipFor } from '../parliament/vote-utility';
import { receptiveness } from '../relationships/relationships';
import {
  billBeforeHouse,
  chiefWhipId,
  clamp,
  displayName,
  findDivision,
  getBill,
  getPolitician,
  isGovernmentParty,
  isSitting,
  nameOf,
  nextDivisionOfBill,
  officeHolder,
  round,
  compareStrings,
} from '../state/access';
import { memory, reason, rel, sittingActor, sittingTarget } from './common';
import type { ActionDefinition, ActionResolution, ResolveEnv } from './types';

function legislationEligibility(
  s: GameState,
  actor: Politician,
  p: LegislationParams,
): IneligibilityReason[] {
  const out: IneligibilityReason[] = [];
  const bill = s.parliament.bills.byId[p.billId];
  if (!bill || !billBeforeHouse(bill)) {
    out.push(reason('bill_not_before_house', 'That bill is not before the House.'));
    return out;
  }
  if (!nextDivisionOfBill(s, bill.id))
    out.push(reason('bill_not_before_house', 'No division on that bill is coming up.'));
  const seen = new Set<string>();
  for (const t of p.lobbyTargetIds) {
    if (seen.has(t))
      out.push(reason('invalid_params', 'Each lobbying target can be listed only once.'));
    seen.add(t);
    out.push(...sittingTarget(s, actor, t));
  }
  return out;
}

/** Lobbying pressure on each target towards `dir` (+1 aye, −1 no), weighted by their regard for the actor. */
function lobbyEffects(
  state: GameState,
  actor: Politician,
  p: LegislationParams,
  divisionId: DivisionId,
  dir: 1 | -1,
  env: ResolveEnv,
): Effect[] {
  const skill = 0.6 + (actor.skills.negotiation + actor.skills.oratory) / 50;
  return p.lobbyTargetIds.map((t) => {
    const delta =
      dir * LOBBY.base * receptiveness(state, t, actor.id) * skill * env.rng.range(0.85, 1.15);
    return {
      kind: 'division.pressure' as const,
      divisionId,
      targetId: t,
      sourceId: actor.id,
      delta: round(delta, 4),
      reason:
        dir > 0
          ? `lobbied by ${displayName(actor)} to back the bill`
          : `lobbied by ${displayName(actor)} to oppose the bill`,
    };
  });
}

/** Leaders of the actor's party factions whose line opposes the bill (they warm to opponents). */
function opposingFactionLeaders(
  state: GameState,
  actor: Politician,
  billIssues: Record<string, number | undefined>,
): string[] {
  const out: string[] = [];
  for (const fid of state.factions.ids) {
    const f = state.factions.byId[fid];
    if (!f || f.partyId !== actor.partyId || f.leaderId === null || f.leaderId === actor.id)
      continue;
    const line =
      f.demands.reduce((s, d) => s + demandValue(billIssues[d] ?? 0), 0) /
      Math.max(1, f.demands.length);
    if (line < 0) out.push(f.leaderId);
  }
  return out;
}

function legislationResolve(
  state: GameState,
  actor: Politician,
  p: LegislationParams,
  env: ResolveEnv,
  support: boolean,
): ActionResolution {
  const bill = getBill(state, p.billId);
  const div = nextDivisionOfBill(state, bill.id);
  if (!div)
    return {
      status: 'failed',
      summary: 'There is no division left to lobby for. The tea room was very understanding.',
      effects: [],
      scheduled: [],
      history: null,
    };
  const vote: Vote = support ? 'aye' : 'no';
  const effects: Effect[] = [
    {
      kind: 'division.declare',
      divisionId: div.id,
      politicianId: actor.id,
      vote,
      source: 'statement',
    },
  ];
  const govBill = isGovernmentParty(state, getPolitician(state, bill.sponsorId).partyId);
  const govMember = isGovernmentParty(state, actor.partyId);
  const cw = chiefWhipId(state);
  const pm = state.government.primeMinisterId;
  const loto = officeHolder(state, 'office.leader_of_opposition');
  const mediaGain = Math.round((actor.skills.oratory - 8) / 3);
  if (mediaGain !== 0)
    effects.push({
      kind: 'reputation.adjust',
      politicianId: actor.id,
      audience: 'media',
      delta: mediaGain,
      reason: 'a public intervention',
    });

  // A government MP backing a government bill (or opposing an opposition one) pleases the whips.
  const loyalStance = govBill === govMember ? support : !support;
  if (govMember && cw !== null && cw !== actor.id) {
    effects.push(
      loyalStance
        ? rel(cw, actor.id, { trust: 3, respect: 2 }, 'backed the government publicly')
        : rel(
            cw,
            actor.id,
            { trust: -6, respect: 1 },
            'opposed the government publicly',
            memory('rebelled', -10, 0.5, div.id),
          ),
    );
    effects.push({
      kind: 'reputation.adjust',
      politicianId: actor.id,
      audience: 'whips',
      delta: loyalStance ? 3 : -6,
      reason: loyalStance ? 'loyal intervention' : 'public opposition',
    });
    if (pm !== actor.id)
      effects.push(
        rel(
          pm,
          actor.id,
          loyalStance ? { respect: 2 } : { respect: -2, trust: -2 },
          loyalStance ? 'backed the bill' : 'opposed the bill',
        ),
      );
    if (loyalStance && bill.sponsorId !== actor.id)
      effects.push(rel(bill.sponsorId, actor.id, { trust: 3, affinity: 2 }, 'backed my bill'));
  }
  if (govMember && !loyalStance) {
    for (const leader of opposingFactionLeaders(state, actor, bill.issues)) {
      effects.push(
        rel(
          leader as Politician['id'],
          actor.id,
          { respect: 4, affinity: 2 },
          'stood up to the government',
        ),
      );
    }
    if (loto !== null && loto !== actor.id)
      effects.push(rel(loto, actor.id, { respect: 3 }, 'broke ranks'));
  }
  effects.push(...lobbyEffects(state, actor, p, div.id, support ? 1 : -1, env));

  const names = p.lobbyTargetIds.map((t) => nameOf(state, t));
  const detail = names.length > 0 ? `Lobbied ${names.join(', ')}.` : '';
  return {
    status: 'succeeded',
    summary:
      `${support ? `You spoke up for the ${bill.title}, to approving nods from the front bench.` : `You came out against the ${bill.title}. Somewhere, a whip uncapped a pen.`} ${detail}`.trim(),
    effects,
    scheduled: [],
    history: {
      template: support ? 'action.support_legislation' : 'action.oppose_legislation',
      vars: { bill: bill.title, detail },
      importance: actor.isPlayer ? 2 : 1,
      subjectIds: [bill.id, ...p.lobbyTargetIds],
    },
  };
}

export const supportLegislation: ActionDefinition<'support_legislation'> = {
  kind: 'support_legislation',
  label: 'Support a bill',
  description: 'Back a bill in public and lobby up to three colleagues to vote for it.',
  params: LegislationParamsSchema,
  paramDescriptors: [
    { name: 'billId', label: 'Bill', type: 'bill' },
    { name: 'lobbyTargetIds', label: 'Lobby', type: 'politicians', max: 3 },
  ],
  slots: 1,
  priority: 60,
  baseCapitalCost: 1,
  capitalCost: () => 1,
  positionEligibility: (_s, actor) => sittingActor(actor),
  paramEligibility: legislationEligibility,
  describe: (s, p) => `Support the ${s.parliament.bills.byId[p.billId]?.title ?? 'bill'}`,
  resolve: (s, actor, p, env) => legislationResolve(s, actor, p, env, true),
};

export const opposeLegislation: ActionDefinition<'oppose_legislation'> = {
  kind: 'oppose_legislation',
  label: 'Oppose a bill',
  description:
    'Come out against a bill and lobby up to three colleagues to vote it down. The whips will notice.',
  params: LegislationParamsSchema,
  paramDescriptors: [
    { name: 'billId', label: 'Bill', type: 'bill' },
    { name: 'lobbyTargetIds', label: 'Lobby', type: 'politicians', max: 3 },
  ],
  slots: 1,
  priority: 60,
  baseCapitalCost: 1,
  capitalCost: () => 1,
  positionEligibility: (_s, actor) => sittingActor(actor),
  paramEligibility: legislationEligibility,
  describe: (s, p) => `Oppose the ${s.parliament.bills.byId[p.billId]?.title ?? 'bill'}`,
  resolve: (s, actor, p, env) => legislationResolve(s, actor, p, env, false),
};

/** Allies who might follow a rebel: same-party sitting MPs whose trust in the actor is ≥ 20. */
export function rebellionAllies(
  state: GameState,
  actorId: Politician['id'],
  divisionId: string,
): { id: Politician['id']; trust: number }[] {
  const actor = getPolitician(state, actorId);
  const div = findDivision(state, divisionId);
  const out: { id: Politician['id']; trust: number }[] = [];
  const suffix = `>${actorId}`;
  for (const key of Object.keys(state.relationships.edges)) {
    if (!key.endsWith(suffix)) continue;
    const e = state.relationships.edges[key];
    if (!e || e.trust < 20) continue;
    const p = state.politicians.byId[e.from];
    if (!p || !isSitting(p) || p.partyId !== actor.partyId) continue;
    if (div?.declarations[p.id]?.source === 'rebellion') continue;
    out.push({ id: p.id, trust: e.trust });
  }
  return out.sort((a, b) => b.trust - a.trust || compareStrings(a.id, b.id)).slice(0, 12);
}

export const rebelAgainstParty: ActionDefinition<'rebel_against_party'> = {
  kind: 'rebel_against_party',
  label: 'Rebel against the whip',
  description:
    'Commit to voting against your party and recruit allies who trust you. The whips may find out.',
  params: RebelParamsSchema,
  paramDescriptors: [
    { name: 'divisionId', label: 'Division', type: 'division' },
    { name: 'vote', label: 'Your vote', type: 'vote' },
  ],
  slots: 1,
  priority: 70,
  baseCapitalCost: 2,
  capitalCost: () => 2,
  positionEligibility(s, actor) {
    const out = sittingActor(actor);
    if (actor.partyId === null)
      out.push(reason('not_whipped', 'Independents have no whip to defy.'));
    else if ((s.parties.byId[actor.partyId]?.whipStrength ?? 0) === 0)
      out.push(reason('not_whipped', 'Your group does not issue whips.'));
    return out;
  },
  paramEligibility(s, actor, p) {
    const out: IneligibilityReason[] = [];
    const div = findDivision(s, p.divisionId);
    if (!div || div.status !== 'scheduled' || div.turn < s.meta.turn) {
      out.push(reason('division_not_scheduled', 'That division is not scheduled in the future.'));
      return out;
    }
    const whip = whipFor(getBill(s, div.billId), actor);
    if (
      !whip ||
      (whip.line !== 'three_line' && whip.line !== 'two_line') ||
      whip.direction === null
    ) {
      out.push(reason('not_whipped', 'Your party has not whipped this division.'));
    } else if (whip.direction === p.vote) {
      out.push(
        reason(
          'invalid_params',
          `Your whip already says ${VOTE_LABEL[p.vote]}; that is not a rebellion.`,
        ),
      );
    }
    return out;
  },
  describe(s, p) {
    const div = findDivision(s, p.divisionId);
    return `Rebel: vote ${VOTE_LABEL[p.vote]}${div ? ` at ${stageLabel(div.stage)}` : ''}`;
  },
  resolve(state, actor, p, env) {
    const div = findDivision(state, p.divisionId);
    if (!div)
      return {
        status: 'failed',
        summary: 'The division no longer exists.',
        effects: [],
        scheduled: [],
        history: null,
      };
    const bill = getBill(state, div.billId);
    const effects: Effect[] = [
      {
        kind: 'division.declare',
        divisionId: div.id,
        politicianId: actor.id,
        vote: p.vote,
        source: 'rebellion',
      },
      {
        kind: 'reputation.adjust',
        politicianId: actor.id,
        audience: 'media',
        delta: 2,
        reason: 'a rebellion',
      },
    ];
    const allies = rebellionAllies(state, actor.id, div.id);
    // Recruitment pushes allies from the whip's line towards the rebel's vote (positive = aye):
    // a no-rebel against an aye whip pulls towards no; an abstain-rebel against a no whip pulls
    // towards aye/abstain. Allies are same-party, so they share the actor's whip.
    const whip = whipFor(bill, actor);
    const towards = Math.sign(directionSign(p.vote) - directionSign(whip?.direction ?? null));
    for (const a of allies) {
      const strength =
        LOBBY.recruit * (0.5 + (a.trust - 20) / 80) * (p.vote === 'abstain' ? 0.5 : 1);
      effects.push({
        kind: 'division.pressure',
        divisionId: div.id,
        targetId: a.id,
        sourceId: actor.id,
        delta: round(towards * clamp(strength, 0, 0.2), 4),
        reason: `recruited by ${displayName(actor)}`,
      });
      if (state.politicians.byId[a.id]?.isPlayer) {
        effects.push({
          kind: 'knowledge.intel',
          text: `${displayName(actor)} took you aside to ask you to join a rebellion on the ${bill.title}: they will vote ${VOTE_LABEL[p.vote]}. "No pressure," they added.`,
          politicianId: actor.id,
        });
        effects.push({
          kind: 'knowledge.intention',
          politicianId: actor.id,
          divisionId: div.id,
          value: p.vote,
          source: 'told you directly',
        });
      }
    }
    const whipsKnow = env.rng.chance(clamp(0.65 - actor.skills.intrigue / 40, 0.1, 0.6));
    const cw = chiefWhipId(state);
    if (
      whipsKnow &&
      actor.partyId !== null &&
      isGovernmentParty(state, actor.partyId) &&
      cw !== null &&
      cw !== actor.id
    ) {
      effects.push({
        kind: 'division.whip_intel',
        divisionId: div.id,
        politicianId: actor.id,
        vote: p.vote,
      });
      effects.push(
        rel(
          cw,
          actor.id,
          { trust: -5 },
          'plotting a rebellion',
          memory('rebelled', -10, 0.5, div.id),
        ),
      );
    } else if (whipsKnow) {
      effects.push({
        kind: 'division.whip_intel',
        divisionId: div.id,
        politicianId: actor.id,
        vote: p.vote,
      });
    }
    const detail = `${allies.length} colleague${allies.length === 1 ? '' : 's'} who trust them are being sounded out.`;
    return {
      status: 'succeeded',
      summary: `You will vote ${VOTE_LABEL[p.vote]} at ${stageLabel(div.stage)}, whatever the whips say. ${allies.length} ${allies.length === 1 ? 'ally' : 'allies'} sounded out. ${whipsKnow ? 'The whips have heard, and are being very calm about it.' : 'The whips do not know yet.'}`,
      effects,
      scheduled: [],
      history: {
        template: 'action.rebel_against_party',
        vars: { vote: VOTE_LABEL[p.vote], bill: bill.title, stage: stageLabel(div.stage), detail },
        importance: actor.isPlayer || actor.castKey !== null ? 3 : 1,
        subjectIds: [div.id],
      },
    };
  },
};
