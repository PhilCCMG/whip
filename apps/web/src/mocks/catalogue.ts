import type { ActionKind } from '@whip/contracts';
import type { ActionCatalogueItem, ActionCatalogueResponse, MockWorld } from './types';

type Param = ActionCatalogueItem['params'][number];

interface ActionDef {
  kind: ActionKind;
  label: string;
  description: string;
  slots: number;
  capitalCost: number;
}

export const ACTION_DEFS: Record<ActionKind, ActionDef> = {
  meet_politician: {
    kind: 'meet_politician',
    label: 'Meet a colleague',
    description:
      'A coffee in Portcullis House. Small relationship gain, and you learn how they intend to vote.',
    slots: 1,
    capitalCost: 0,
  },
  build_relationship: {
    kind: 'build_relationship',
    label: 'Build a relationship',
    description:
      'Invest real time in someone: dinner, a constituency visit, a favour. Larger gains in affinity and respect.',
    slots: 2,
    capitalCost: 1,
  },
  seek_endorsement: {
    kind: 'seek_endorsement',
    label: 'Seek an endorsement',
    description: 'Ask a senior figure to put in a word for your promotion. You will owe them.',
    slots: 1,
    capitalCost: 1,
  },
  make_political_promise: {
    kind: 'make_political_promise',
    label: 'Make a promise',
    description:
      'Commit your vote on a coming division to win someone’s trust. Break it and they will remember.',
    slots: 1,
    capitalCost: 0,
  },
  support_legislation: {
    kind: 'support_legislation',
    label: 'Support a bill',
    description: 'Speak up for a bill and lobby up to three colleagues towards the Aye lobby.',
    slots: 1,
    capitalCost: 1,
  },
  oppose_legislation: {
    kind: 'oppose_legislation',
    label: 'Oppose a bill',
    description:
      'Speak against a bill and lobby up to three colleagues to vote no. The whips will notice.',
    slots: 1,
    capitalCost: 1,
  },
  rebel_against_party: {
    kind: 'rebel_against_party',
    label: 'Rebel against the whip',
    description:
      'Commit to voting against your party and recruit allies who trust you. The whips may find out.',
    slots: 1,
    capitalCost: 2,
  },
  request_promotion: {
    kind: 'request_promotion',
    label: 'Ask for promotion',
    description:
      'Let the Chief Whip know you want a job. Works best with endorsements and a loyal record.',
    slots: 1,
    capitalCost: 2,
  },
  respond_to_event: {
    kind: 'respond_to_event',
    label: 'Respond to an event',
    description: 'Choose how to handle something in your inbox.',
    slots: 0,
    capitalCost: 0,
  },
  call_reshuffle: {
    kind: 'call_reshuffle',
    label: 'Call a reshuffle',
    description: 'Reshape the government. Fills vacancies and may move or sack ministers.',
    slots: 0,
    capitalCost: 0,
  },
};

const KIND_ORDER = Object.keys(ACTION_DEFS) as ActionKind[];

export function slotsLeft(world: MockWorld): number {
  return world.overview.diary.slotsTotal - world.overview.diary.slotsUsed;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function buildCatalogue(world: MockWorld): ActionCatalogueResponse {
  const left = slotsLeft(world);
  const capital = world.overview.standing.politicalCapital;
  const turn = world.summary.turn;
  const divisions = world.parliament.upcomingDivisions;
  const divisionOptions = divisions.map((d) => ({
    id: d.id,
    label: `${d.billTitle}: ${d.stage}`,
    hint: d.scheduledFor,
  }));
  const billOptions = world.parliament.bills
    .filter((b) => b.stage !== 'Royal Assent')
    .map((b) => ({ id: b.id, label: b.title, hint: b.stage }));
  const voteOptions = [
    { id: 'aye', label: 'Aye' },
    { id: 'no', label: 'No' },
    { id: 'abstain', label: 'Abstain' },
  ];
  const planned = world.overview.diary.planned;

  const politician = (name: string, label: string): Param => ({ name, label, type: 'politician' });

  const paramsFor = (kind: ActionKind): Param[] => {
    switch (kind) {
      case 'meet_politician':
        return [politician('targetId', 'Who to meet')];
      case 'build_relationship':
        return [politician('targetId', 'Who to invest in')];
      case 'seek_endorsement':
        return [politician('targetId', 'Who to ask')];
      case 'make_political_promise':
        return [
          politician('targetId', 'Who to promise'),
          {
            name: 'divisionId',
            label: 'On which division',
            type: 'division',
            options: divisionOptions,
          },
          { name: 'vote', label: 'Your vote', type: 'vote', options: voteOptions },
        ];
      case 'support_legislation':
      case 'oppose_legislation':
        return [
          { name: 'billId', label: 'Bill', type: 'bill', options: billOptions },
          { name: 'lobbyTargetIds', label: 'Colleagues to lobby', type: 'politicians', max: 3 },
        ];
      case 'rebel_against_party':
        return [
          { name: 'divisionId', label: 'Division', type: 'division', options: divisionOptions },
          {
            name: 'vote',
            label: 'Your vote',
            type: 'vote',
            options: voteOptions.filter((v) => v.id !== 'aye'),
          },
        ];
      case 'respond_to_event':
        return [
          {
            name: 'eventId',
            label: 'Event',
            type: 'event_option',
            options: world.overview.pendingEvents.map((e) => ({ id: e.id, label: e.title })),
          },
          {
            name: 'optionKey',
            label: 'Response',
            type: 'event_option',
            options: world.overview.pendingEvents.flatMap((e) =>
              // As in the real catalogue, `hint` carries the event id the option belongs to.
              e.options.map((o) => ({ id: o.key, label: o.label, hint: e.id })),
            ),
          },
        ];
      case 'request_promotion':
      case 'call_reshuffle':
        return [];
    }
  };

  const items = KIND_ORDER.map((kind): ActionCatalogueItem => {
    const def = ACTION_DEFS[kind];
    const reasons: string[] = [];
    if (def.slots > left)
      reasons.push(`Needs ${plural(def.slots, 'diary slot')} — ${left} left this week.`);
    if (def.capitalCost > capital)
      reasons.push(`Needs ${def.capitalCost} political capital — you have ${capital}.`);
    if (kind === 'call_reshuffle') reasons.push('Only the Prime Minister can call a reshuffle.');
    if (
      (kind === 'make_political_promise' || kind === 'rebel_against_party') &&
      divisions.length === 0
    ) {
      reasons.push('No divisions are scheduled.');
    }
    if (kind === 'request_promotion') {
      const last = world.meta.lastPromotionRequestTurn;
      if (last !== null && turn - last < 6)
        reasons.push(`You asked recently. Try again in week ${last + 6}.`);
      if (planned.some((p) => p.kind === 'request_promotion'))
        reasons.push('Already in your diary this week.');
      if (world.overview.player.offices.length > 0) reasons.push('You already hold an office.');
    }
    if (kind === 'rebel_against_party' && planned.some((p) => p.kind === 'rebel_against_party')) {
      reasons.push('Already in your diary this week.');
    }
    if (kind === 'respond_to_event' && world.overview.pendingEvents.length === 0) {
      reasons.push('Nothing in your inbox needs a response.');
    }
    return {
      kind,
      label: def.label,
      description: def.description,
      slots: def.slots,
      capitalCost: def.capitalCost,
      eligible: reasons.length === 0,
      reasons,
      params: paramsFor(kind),
    };
  });
  return { items };
}
