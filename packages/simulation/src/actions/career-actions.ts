import {
  EmptyParamsSchema,
  RespondToEventParamsSchema,
  type IneligibilityReason,
} from '@whip/domain';
import { bindOption, renderEvent } from '../events/bind';
import { holdsOffice, isGovernmentParty, isMinister } from '../state/access';
import { reason, sittingActor } from './common';
import type { ActionDefinition } from './types';

/** Turns that must pass between promotion requests (07 §4.1). */
export const PROMOTION_COOLDOWN_TURNS = 6;

export const requestPromotion: ActionDefinition<'request_promotion'> = {
  kind: 'request_promotion',
  label: 'Ask for promotion',
  description:
    'Make the case for a government job. Considered in the Careers phase: loyalty, endorsements and standing with the Chief Whip and PM count.',
  params: EmptyParamsSchema,
  paramDescriptors: [],
  slots: 1,
  priority: 80,
  baseCapitalCost: 2,
  capitalCost: () => 2,
  positionEligibility(s, actor, ctx) {
    const out: IneligibilityReason[] = sittingActor(actor);
    if (!isGovernmentParty(s, actor.partyId)) {
      out.push(
        reason(
          'not_eligible_position',
          'Only MPs of a governing party can be promoted into government.',
        ),
      );
    }
    if (isMinister(actor, ctx.content))
      out.push(reason('not_eligible_position', 'You already hold ministerial office.'));
    const last = s.careers.lastPromotionRequestTurn[actor.id];
    if (last !== undefined && s.meta.turn - last < PROMOTION_COOLDOWN_TURNS) {
      const wait = PROMOTION_COOLDOWN_TURNS - (s.meta.turn - last);
      out.push(
        reason(
          'cooldown',
          `You asked recently. Try again in ${wait} week${wait === 1 ? '' : 's'}.`,
        ),
      );
    }
    return out;
  },
  paramEligibility: () => [],
  describe: () => 'Ask the whips for a government job',
  resolve: (_s, actor) => ({
    status: 'succeeded',
    summary: 'You made your case to the whips. The answer will come by the end of the week.',
    effects: [{ kind: 'career.request_promotion', politicianId: actor.id }],
    scheduled: [],
    history: {
      template: 'action.request_promotion',
      vars: {},
      importance: actor.isPlayer ? 2 : 1,
      subjectIds: [],
    },
  }),
};

export const callReshuffle: ActionDefinition<'call_reshuffle'> = {
  kind: 'call_reshuffle',
  label: 'Call a reshuffle',
  description: 'Fill vacancies and move or sack ministers this week. Prime Minister only.',
  params: EmptyParamsSchema,
  paramDescriptors: [],
  slots: 0,
  priority: 20,
  baseCapitalCost: 0,
  capitalCost: () => 0,
  positionEligibility(s, actor) {
    const out = sittingActor(actor);
    if (!holdsOffice(actor, 'office.prime_minister')) {
      out.push(reason('not_eligible_position', 'Only the Prime Minister can call a reshuffle.'));
    }
    if (s.careers.reshuffleRequestedTurn === s.meta.turn)
      out.push(reason('duplicate', 'A reshuffle is already planned this week.'));
    return out;
  },
  paramEligibility: () => [],
  describe: () => 'Call a reshuffle',
  resolve: (_s, actor) => ({
    status: 'succeeded',
    summary: 'You will reshape the government this week.',
    effects: [{ kind: 'career.call_reshuffle', politicianId: actor.id }],
    scheduled: [],
    history: { template: 'action.call_reshuffle', vars: {}, importance: 4, subjectIds: [] },
  }),
};

export const respondToEvent: ActionDefinition<'respond_to_event'> = {
  kind: 'respond_to_event',
  label: 'Respond to an event',
  description: 'Decide how to handle something that has landed on your desk.',
  params: RespondToEventParamsSchema,
  paramDescriptors: [
    { name: 'eventId', label: 'Event', type: 'event_option' },
    { name: 'optionKey', label: 'Choice', type: 'event_option' },
  ],
  slots: 0,
  priority: 10,
  baseCapitalCost: 0,
  capitalCost(s, _actor, p, ctx) {
    const ev = s.events.pending.find((e) => e.id === p.eventId);
    const def = ev ? ctx.content.events[ev.definitionKey] : undefined;
    return def?.options.find((o) => o.key === p.optionKey)?.capitalCost ?? 0;
  },
  positionEligibility: (_s, actor) => sittingActor(actor),
  paramEligibility(s, actor, p, ctx) {
    const ev = s.events.pending.find((e) => e.id === p.eventId);
    if (!ev || ev.status !== 'pending' || ev.addresseeId !== actor.id) {
      return [reason('event_not_pending', 'There is no such decision waiting for you.')];
    }
    if (ev.expiresTurn < s.meta.turn)
      return [reason('event_not_pending', 'That decision has expired.')];
    const def = ctx.content.events[ev.definitionKey];
    if (!def?.options.some((o) => o.key === p.optionKey)) {
      return [reason('invalid_params', `"${p.optionKey}" is not one of the options.`)];
    }
    return [];
  },
  describe(s, p, ctx) {
    const ev = s.events.pending.find((e) => e.id === p.eventId);
    const r = ev ? renderEvent(s, ev, ctx.content) : null;
    const opt = r?.def.options.find((o) => o.key === p.optionKey);
    return r && opt ? `${r.title}: ${opt.label}` : 'Respond to an event';
  },
  resolve(state, _actor, p, env) {
    const ev = state.events.pending.find((e) => e.id === p.eventId);
    const r = ev ? renderEvent(state, ev, env.ctx.content) : null;
    const opt = r?.def.options.find((o) => o.key === p.optionKey);
    if (!ev || !r || !opt)
      return {
        status: 'failed',
        summary: 'The moment has passed.',
        effects: [],
        scheduled: [],
        history: null,
      };
    const bound = bindOption(state, ev, opt, env.ctx.content, env.tc.turn);
    return {
      status: 'succeeded',
      summary: `${r.title}: you chose to ${opt.label.toLowerCase()}.`,
      effects: [
        ...bound.effects,
        { kind: 'event.resolve', eventId: ev.id, optionKey: opt.key, expired: false },
      ],
      scheduled: bound.scheduled,
      history: {
        template: 'action.respond_to_event',
        vars: { event: r.title, option: opt.label.toLowerCase() },
        importance: 2,
        subjectIds: [ev.id],
      },
    };
  },
};
