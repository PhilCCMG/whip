import {
  PromiseParamsSchema,
  TargetParamsSchema,
  type Effect,
  type IneligibilityReason,
} from '@whip/domain';
import { stageLabel, VOTE_LABEL } from '../chronicle/templates';
import { decideVote } from '../parliament/vote-utility';
import { compatibility, getRelationship } from '../relationships/relationships';
import {
  clamp,
  displayName,
  findDivision,
  getBill,
  getPolitician,
  isFactionLeader,
  nameOf,
} from '../state/access';
import {
  memory,
  reason,
  rel,
  revealIntentions,
  sittingActor,
  sittingTarget,
  traitResponse,
} from './common';
import type { ActionDefinition } from './types';

export const meetPolitician: ActionDefinition<'meet_politician'> = {
  kind: 'meet_politician',
  label: 'Meet a colleague',
  description:
    'A private conversation. Builds a little goodwill and reveals how they intend to vote.',
  params: TargetParamsSchema,
  paramDescriptors: [{ name: 'targetId', label: 'Who', type: 'politician' }],
  slots: 1,
  priority: 40,
  baseCapitalCost: 0,
  capitalCost: () => 0,
  positionEligibility: (_s, actor) => sittingActor(actor),
  paramEligibility: (s, actor, p) => sittingTarget(s, actor, p.targetId),
  describe: (s, p) => `Meet ${nameOf(s, p.targetId)}`,
  resolve(state, actor, p, env) {
    const target = getPolitician(state, p.targetId);
    const compat = compatibility(actor, target);
    const jitter = env.rng.range(0.8, 1.2);
    const base = (2 + actor.skills.negotiation / 5) * (0.6 + 0.6 * compat) * jitter;
    const effects: Effect[] = [
      rel(
        target.id,
        actor.id,
        {
          trust: Math.round(base * 0.6),
          affinity: Math.round(base * 0.9),
          respect: Math.round((actor.skills.oratory - 9) / 4),
        },
        'a private meeting',
        memory('met', 5, 1),
      ),
      rel(actor.id, target.id, { affinity: 1 }, 'a private meeting', memory('met', 5, 1)),
    ];
    const reveal = revealIntentions(state, actor, target, env.ctx.content, 'private meeting');
    effects.push(...reveal.effects);
    const mood =
      compat > 0.5
        ? 'It went well; there were biscuits.'
        : compat < 0
          ? 'It was frosty, even by Westminster standards.'
          : 'Cordial enough, in the British sense.';
    const summary = [`You met ${displayName(target)} over tea. ${mood}`, ...reveal.text].join(' ');
    return {
      status: 'succeeded',
      summary,
      effects,
      scheduled: [],
      history: {
        template: 'action.meet_politician',
        vars: {
          target: displayName(target),
          detail: mood,
        },
        importance: 1,
        subjectIds: [target.id],
      },
    };
  },
};

export const buildRelationship: ActionDefinition<'build_relationship'> = {
  kind: 'build_relationship',
  label: 'Build a relationship',
  description:
    'Invest real time in a colleague. Vain colleagues respond to flattery, principled ones to substance.',
  params: TargetParamsSchema,
  paramDescriptors: [{ name: 'targetId', label: 'Who', type: 'politician' }],
  slots: 2,
  priority: 45,
  baseCapitalCost: 1,
  capitalCost: () => 1,
  positionEligibility: (_s, actor) => sittingActor(actor),
  paramEligibility: (s, actor, p) => sittingTarget(s, actor, p.targetId),
  describe: (s, p) => `Build a relationship with ${nameOf(s, p.targetId)}`,
  resolve(state, actor, p, env) {
    const target = getPolitician(state, p.targetId);
    const content = env.ctx.content;
    // Flattery if the actor's charm outweighs their command of detail.
    const flattery =
      actor.skills.media + actor.skills.oratory / 2 >=
      actor.skills.policy + actor.skills.negotiation / 2;
    const mult = traitResponse(
      target,
      content,
      flattery ? 'flatteryResponse' : 'substanceResponse',
    );
    const skill = flattery ? actor.skills.media : actor.skills.policy;
    const compat = compatibility(actor, target);
    const jitter = env.rng.range(0.85, 1.15);
    const respect = Math.round((3 + skill / 3) * mult * jitter);
    const affinity = Math.round(
      (4 + actor.skills.negotiation / 4) * mult * (0.7 + 0.5 * compat) * jitter,
    );
    const trust = Math.round(2 * mult);
    const effects: Effect[] = [
      rel(
        target.id,
        actor.id,
        { trust, respect, affinity },
        flattery ? 'flattery' : 'a serious conversation about policy',
        memory(flattery ? 'flattered' : 'worked_together', 10, 0.5),
      ),
      rel(
        actor.id,
        target.id,
        { affinity: 2 },
        'time spent together',
        memory('worked_together', 8, 0.5),
      ),
    ];
    const landed =
      mult >= 1.3
        ? 'It landed very well; they have started using your first name.'
        : mult <= 0.7
          ? 'It did not land. They checked their phone twice.'
          : 'It went fine, which is to say nobody left early.';
    return {
      status: mult <= 0.7 ? 'partial' : 'succeeded',
      summary: `You spent time with ${displayName(target)}, leaning on ${flattery ? 'charm' : 'substance'}. ${landed}`,
      effects,
      scheduled: [],
      history: {
        template: 'action.build_relationship',
        vars: { target: displayName(target), detail: landed },
        importance: 1,
        subjectIds: [target.id],
      },
    };
  },
};

export const seekEndorsement: ActionDefinition<'seek_endorsement'> = {
  kind: 'seek_endorsement',
  label: 'Seek an endorsement',
  description:
    'Ask an office holder, faction leader or the Father of the House to back you for promotion. You will owe them.',
  params: TargetParamsSchema,
  paramDescriptors: [{ name: 'targetId', label: 'Who', type: 'politician' }],
  slots: 1,
  priority: 50,
  baseCapitalCost: 1,
  capitalCost: () => 1,
  positionEligibility: (_s, actor) => sittingActor(actor),
  paramEligibility(s, actor, p) {
    const out: IneligibilityReason[] = sittingTarget(s, actor, p.targetId);
    if (out.length > 0) return out;
    const t = getPolitician(s, p.targetId);
    const qualifies =
      t.offices.length > 0 || isFactionLeader(s, t.id) || s.parliament.fatherOfHouseId === t.id;
    if (!qualifies)
      out.push(
        reason(
          'invalid_target',
          `${displayName(t)} holds no office, leads no faction and is not the Father of the House.`,
        ),
      );
    if (actor.endorsedBy.includes(t.id))
      out.push(reason('duplicate', `${displayName(t)} already endorses you.`));
    return out;
  },
  describe: (s, p) => `Seek ${nameOf(s, p.targetId)}'s endorsement`,
  resolve(state, actor, p, env) {
    const target = getPolitician(state, p.targetId);
    const r = getRelationship(state, target.id, actor.id);
    const sameParty = actor.partyId !== null && actor.partyId === target.partyId;
    const sameFaction = actor.factionId !== null && actor.factionId === target.factionId;
    const chance = clamp(
      0.1 +
        (r.respect + r.trust) / 120 +
        (sameFaction ? 0.1 : 0) +
        (sameParty ? 0.05 : -0.3) +
        (actor.skills.negotiation - 10) / 50,
      0.03,
      0.9,
    );
    const success = env.rng.chance(chance);
    if (success) {
      return {
        status: 'succeeded',
        summary: `${displayName(target)} agreed to endorse you. You owe them a favour, and they will remember which one.`,
        effects: [
          { kind: 'endorsement.add', endorserId: target.id, endorseeId: actor.id },
          rel(
            actor.id,
            target.id,
            { obligation: 1, affinity: 2 },
            'an endorsement',
            memory('endorsed', 15, 0.5),
          ),
          rel(target.id, actor.id, { respect: 2 }, 'asked for an endorsement'),
          {
            kind: 'career.record',
            politicianId: actor.id,
            entryKind: 'endorsed',
            officeKey: null,
            text: `Endorsed by ${displayName(target)}`,
          },
        ],
        scheduled: [],
        history: {
          template: 'action.seek_endorsement.success',
          vars: { target: displayName(target) },
          importance: actor.isPlayer ? 2 : 1,
          subjectIds: [target.id],
        },
      };
    }
    return {
      status: 'failed',
      summary: `${displayName(target)} declined to endorse you, citing "timing" (it was about a ${Math.round(chance * 100)}% chance).`,
      effects: [
        rel(
          actor.id,
          target.id,
          { affinity: -1 },
          'a refused endorsement',
          memory('refused_endorsement', -5, 1),
        ),
        rel(target.id, actor.id, { respect: -1 }, 'asked too soon'),
      ],
      scheduled: [],
      history: {
        template: 'action.seek_endorsement.failure',
        vars: { target: displayName(target) },
        importance: 1,
        subjectIds: [target.id],
      },
    };
  },
};

export const makePoliticalPromise: ActionDefinition<'make_political_promise'> = {
  kind: 'make_political_promise',
  label: 'Make a promise',
  description:
    'Promise a colleague how you will vote. Kept promises build trust; broken ones are remembered for a long time.',
  params: PromiseParamsSchema,
  paramDescriptors: [
    { name: 'targetId', label: 'To whom', type: 'politician' },
    { name: 'divisionId', label: 'Division', type: 'division' },
    { name: 'vote', label: 'Your vote', type: 'vote' },
  ],
  slots: 1,
  priority: 30,
  baseCapitalCost: 0,
  capitalCost: () => 0,
  positionEligibility: (s, actor) => {
    const out = sittingActor(actor);
    if (s.parliament.speakerId === actor.id)
      out.push(reason('not_eligible_position', 'The Speaker does not vote.'));
    return out;
  },
  paramEligibility(s, actor, p) {
    const out = sittingTarget(s, actor, p.targetId);
    const div = findDivision(s, p.divisionId);
    if (!div || div.status !== 'scheduled' || div.turn < s.meta.turn) {
      out.push(reason('division_not_scheduled', 'That division is not scheduled in the future.'));
    }
    return out;
  },
  describe(s, p) {
    const div = findDivision(s, p.divisionId);
    return `Promise ${nameOf(s, p.targetId)} to vote ${VOTE_LABEL[p.vote]}${div ? ` at ${stageLabel(div.stage)}` : ''}`;
  },
  resolve(state, actor, p, env) {
    const target = getPolitician(state, p.targetId);
    const div = findDivision(state, p.divisionId);
    if (!div)
      return {
        status: 'failed',
        summary: 'The division no longer exists.',
        effects: [],
        scheduled: [],
        history: null,
      };
    const wants = decideVote(state, target, div, env.ctx.content).vote;
    const matches = wants === p.vote;
    const effects: Effect[] = [
      matches
        ? rel(
            target.id,
            actor.id,
            { trust: 6, affinity: 4 },
            'a welcome promise',
            memory('promised', 10, 0.5, div.id),
          )
        : rel(
            target.id,
            actor.id,
            { trust: 1 },
            'an unasked-for promise',
            memory('promised', 3, 0.5, div.id),
          ),
      {
        kind: 'division.declare',
        divisionId: div.id,
        politicianId: actor.id,
        vote: p.vote,
        source: 'promise',
      },
    ];
    if (actor.isPlayer) {
      effects.push({
        kind: 'knowledge.intention',
        politicianId: target.id,
        divisionId: div.id,
        value: wants,
        source: 'conversation',
      });
    }
    const bill = getBill(state, div.billId);
    return {
      status: 'succeeded',
      summary: `You promised ${displayName(target)} to vote ${VOTE_LABEL[p.vote]} at ${stageLabel(div.stage)}. ${matches ? 'It was exactly what they wanted to hear.' : `They had hoped for ${VOTE_LABEL[wants]}, and said so with their eyebrows.`}`,
      effects,
      scheduled: [
        {
          effect: {
            kind: 'promise.check',
            promiserId: actor.id,
            promiseeId: target.id,
            divisionId: div.id,
            vote: p.vote,
          },
          dueTurn: Math.max(div.turn + 1, env.tc.turn + 1),
          conditions: [{ kind: 'division_held', divisionId: div.id }],
        },
      ],
      history: {
        template: 'action.make_political_promise',
        vars: {
          target: displayName(target),
          vote: VOTE_LABEL[p.vote],
          bill: bill.title,
          stage: stageLabel(div.stage),
        },
        importance: actor.isPlayer ? 2 : 1,
        subjectIds: [target.id, div.id],
      },
    };
  },
};
