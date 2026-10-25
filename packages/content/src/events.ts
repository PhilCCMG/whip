import type { EventDefinition } from '@whip/domain';

/** The six slice events (07 §4.5). Bodies use {addressee} {bill} {office} {subject} {date}. */
export const eventList: EventDefinition[] = [
  {
    key: 'event.whips_office_summons',
    title: "A word from the whips' office",
    body:
      'A handwritten note in your pigeonhole: the Chief Whip would like "a quick word" about the {bill} before the vote on {date}. ' +
      'In this building, a quick word is never quick, and rarely just the one.',
    audience: 'player',
    trigger: { kind: 'whips_suspect_waverer', chance: 0.6, maxWeeksBeforeDivision: 2 },
    cooldownWeeks: 3,
    expiresAfterWeeks: 1,
    defaultOptionKey: 'non_committal',
    options: [
      {
        key: 'reassure',
        label: 'Reassure them',
        description:
          'Tell the whips they can count on your vote. They will remember it, and so will you, later.',
        capitalCost: 0,
        effects: [
          {
            kind: 'relationship',
            from: 'chief_whip',
            to: 'addressee',
            trust: 8,
            respect: 2,
            affinity: 2,
          },
          {
            kind: 'relationship',
            from: 'deputy_chief_whip',
            to: 'addressee',
            trust: 5,
            respect: 0,
            affinity: 0,
          },
          { kind: 'capital', who: 'addressee', delta: 1 },
          { kind: 'reputation', who: 'addressee', audience: 'whips', delta: 5 },
          { kind: 'declare_vote', vote: 'aye' },
        ],
        ai: {
          base: 0.6,
          traitModifiers: { 'trait.loyalist': 0.3, 'trait.ambitious': 0.2, 'trait.maverick': -0.3 },
        },
      },
      {
        key: 'non_committal',
        label: 'Stay non-committal',
        description: 'Nod, sip the tea, promise nothing. The whips have seen this before.',
        capitalCost: 0,
        effects: [
          {
            kind: 'relationship',
            from: 'chief_whip',
            to: 'addressee',
            trust: -2,
            respect: 0,
            affinity: 0,
          },
        ],
        ai: { base: 0.4, traitModifiers: { 'trait.cautious': 0.3 } },
      },
      {
        key: 'warn_them',
        label: 'Warn them you have doubts',
        description:
          'Be straight with the whips: as it stands, you cannot support it. Honesty is admired here, briefly.',
        capitalCost: 0,
        effects: [
          {
            kind: 'relationship',
            from: 'chief_whip',
            to: 'addressee',
            trust: -8,
            respect: 3,
            affinity: -3,
          },
          {
            kind: 'relationship',
            from: 'faction:faction.heartlands',
            to: 'addressee',
            trust: 4,
            respect: 8,
            affinity: 3,
          },
          { kind: 'reputation', who: 'addressee', audience: 'whips', delta: -6 },
          { kind: 'whips_learn_intention' },
        ],
        ai: {
          base: 0.2,
          traitModifiers: {
            'trait.principled': 0.3,
            'trait.maverick': 0.3,
            'trait.loyalist': -0.3,
          },
        },
      },
    ],
  },
  {
    key: 'event.constituency_green_belt_protest',
    title: 'Placards on the village green',
    body:
      'Residents have called a protest against the {bill}, fearing the new targets will open the green belt ' +
      "around {subject}'s constituency to developers. There is a banner, a tea urn, and a local reporter asking where {addressee} stands.",
    audience: 'any',
    trigger: {
      kind: 'constituency_protest',
      issueKey: 'issue.green_belt',
      minConcern: 0.6,
      chance: 0.45,
      firstTurn: 1,
      lastTurn: 4,
    },
    cooldownWeeks: 6,
    expiresAfterWeeks: 1,
    defaultOptionKey: 'back_the_bill',
    options: [
      {
        key: 'join_protest',
        label: 'Join the protest',
        description:
          'Stand with your constituents in the drizzle, in front of the cameras. The whips own a television.',
        capitalCost: 0,
        effects: [
          { kind: 'local_standing', who: 'addressee', delta: 12 },
          { kind: 'reputation', who: 'addressee', audience: 'media', delta: 3 },
          {
            kind: 'relationship',
            from: 'chief_whip',
            to: 'addressee',
            trust: -10,
            respect: 0,
            affinity: -3,
          },
          { kind: 'reputation', who: 'addressee', audience: 'whips', delta: -6 },
          { kind: 'loyalty', who: 'addressee', delta: -8 },
        ],
        ai: {
          base: 0.35,
          traitModifiers: {
            'trait.maverick': 0.3,
            'trait.loyalist': -0.3,
            'trait.cautious': -0.05,
          },
        },
      },
      {
        key: 'meet_organisers',
        label: 'Meet the organisers',
        description:
          'Hear them out privately over weak coffee in the village hall. It will cost you a diary slot next week.',
        capitalCost: 0,
        effects: [
          { kind: 'local_standing', who: 'addressee', delta: 5 },
          { kind: 'slots_next_week', who: 'addressee', delta: -1 },
        ],
        ai: { base: 0.5, traitModifiers: { 'trait.cautious': 0.2, 'trait.diligent': 0.1 } },
      },
      {
        key: 'back_the_bill',
        label: 'Back the bill',
        description:
          'Defend the government line: the country needs the homes, just perhaps not these ones. Your constituents may not forgive it.',
        capitalCost: 0,
        effects: [
          { kind: 'local_standing', who: 'addressee', delta: -8 },
          {
            kind: 'relationship',
            from: 'chief_whip',
            to: 'addressee',
            trust: 4,
            respect: 2,
            affinity: 0,
          },
          { kind: 'reputation', who: 'addressee', audience: 'whips', delta: 3 },
        ],
        ai: { base: 0.3, traitModifiers: { 'trait.loyalist': 0.4, 'trait.ambitious': 0.2 } },
      },
    ],
  },
  {
    key: 'event.lobby_journalist_call',
    title: 'A call from the lobby',
    body:
      "A political correspondent is writing about the {bill} and wants {addressee}'s take, strictly on background. " +
      'Background, in this building, is read by the whips with their breakfast.',
    audience: 'player',
    trigger: { kind: 'journalist_call', chance: 0.3, firstTurn: 1 },
    cooldownWeeks: 3,
    expiresAfterWeeks: 1,
    defaultOptionKey: 'decline',
    options: [
      {
        key: 'brief_loyally',
        label: 'Give the loyal line',
        description: "Talk up the bill. Safe, dull and much appreciated in the whips' office.",
        capitalCost: 0,
        effects: [
          { kind: 'reputation', who: 'addressee', audience: 'media', delta: 3 },
          {
            kind: 'relationship',
            from: 'chief_whip',
            to: 'addressee',
            trust: 3,
            respect: 0,
            affinity: 0,
          },
        ],
        ai: { base: 0.5, traitModifiers: { 'trait.loyalist': 0.3 } },
      },
      {
        key: 'share_doubts',
        label: 'Share your doubts',
        description:
          'Be candid about the bill. Excellent copy, and a leak of your intentions with your name barely disguised.',
        capitalCost: 0,
        effects: [
          { kind: 'reputation', who: 'addressee', audience: 'media', delta: 7 },
          { kind: 'reputation', who: 'addressee', audience: 'whips', delta: -5 },
          {
            kind: 'relationship',
            from: 'chief_whip',
            to: 'addressee',
            trust: -5,
            respect: 0,
            affinity: -2,
          },
          { kind: 'whips_learn_intention' },
          { kind: 'intel', text: "A lobby story hints at {addressee}'s doubts about the {bill}." },
        ],
        ai: { base: 0.3, traitModifiers: { 'trait.maverick': 0.3, 'trait.vain': 0.2 } },
      },
      {
        key: 'decline',
        label: 'Decline to comment',
        description:
          'Say nothing at all. Journalists remember who returns their calls, and who does not.',
        capitalCost: 0,
        effects: [{ kind: 'reputation', who: 'addressee', audience: 'media', delta: -2 }],
        ai: { base: 0.3, traitModifiers: { 'trait.cautious': 0.3 } },
      },
    ],
  },
  {
    key: 'event.government_concession',
    title: 'Government weighs a concession',
    body:
      'With the whips counting more rebels than the majority can comfortably absorb, Downing Street is ' +
      'considering an amendment to the {bill}: a social-housing quota in every new development. Nobody will call it a U-turn.',
    audience: 'npc',
    trigger: { kind: 'forecast_rebellion', fractionOfMajority: 0.5, maxWeeksBeforeDivision: 2 },
    cooldownWeeks: 99,
    expiresAfterWeeks: 0,
    defaultOptionKey: 'hold_firm',
    options: [
      {
        key: 'concede',
        label: 'Concede a social-housing quota',
        description: 'Amend the bill to buy off the Heartlands, and call it listening.',
        capitalCost: 0,
        effects: [
          { kind: 'amend_bill', issueKey: 'issue.social_housing', stance: 1 },
          { kind: 'stability', delta: -2 },
          {
            kind: 'relationship',
            from: 'faction:faction.heartlands',
            to: 'prime_minister',
            trust: 8,
            respect: 4,
            affinity: 2,
          },
          {
            kind: 'relationship',
            from: 'bill_sponsor',
            to: 'prime_minister',
            trust: -3,
            respect: -2,
            affinity: -3,
          },
        ],
        ai: {
          base: 0.3,
          traitModifiers: { 'trait.cautious': 0.3, 'trait.pragmatic': 0.2, 'trait.stubborn': -0.3 },
        },
      },
      {
        key: 'hold_firm',
        label: 'Hold firm',
        description: 'No concessions: the whips will deliver, or know why not.',
        capitalCost: 0,
        effects: [
          {
            kind: 'relationship',
            from: 'faction:faction.heartlands',
            to: 'prime_minister',
            trust: -5,
            respect: 0,
            affinity: -3,
          },
        ],
        ai: {
          base: 0.5,
          traitModifiers: {
            'trait.combative': 0.2,
            'trait.stubborn': 0.3,
            'trait.principled': 0.1,
          },
        },
      },
    ],
  },
  {
    key: 'event.minister_considers_position',
    title: 'A minister considers their position',
    body: 'After the defeat of the {bill}, {addressee} is said to be "considering their position" as {office}. Friends describe the mood as reflective; the removal van is on standby.',
    audience: 'npc',
    trigger: { kind: 'engine' },
    cooldownWeeks: 4,
    expiresAfterWeeks: 0,
    defaultOptionKey: 'stay_on',
    options: [
      {
        key: 'resign',
        label: 'Resign',
        description: 'Take responsibility, write a gracious letter and return to the back benches.',
        capitalCost: 0,
        effects: [
          { kind: 'resign_office' },
          { kind: 'reputation', who: 'addressee', audience: 'public', delta: 4 },
        ],
        ai: {
          base: 0.3,
          traitModifiers: { 'trait.principled': 0.3, 'trait.vain': 0.25, 'trait.ambitious': 0.15 },
        },
      },
      {
        key: 'stay_on',
        label: 'Stay on',
        description: 'Ride out the storm and hope the lobby finds someone else by Friday.',
        capitalCost: 0,
        effects: [{ kind: 'reputation', who: 'addressee', audience: 'media', delta: -5 }],
        ai: { base: 0.55, traitModifiers: { 'trait.cautious': 0.2, 'trait.loyalist': 0.2 } },
      },
    ],
  },
  {
    key: 'event.pps_offer',
    title: 'An offer from Downing Street',
    body:
      'The Prime Minister would like {addressee} to serve as {office}. It is the first rung of the ladder, ' +
      'and it comes with a lanyard and collective responsibility: no more rebellions, and a great deal more nodding.',
    audience: 'player',
    trigger: { kind: 'engine' },
    cooldownWeeks: 0,
    expiresAfterWeeks: 1,
    defaultOptionKey: 'decline',
    options: [
      {
        key: 'accept',
        label: 'Accept',
        description: 'Take the job, the lanyard and the obligation to agree.',
        capitalCost: 0,
        effects: [
          { kind: 'accept_office' },
          {
            kind: 'relationship',
            from: 'prime_minister',
            to: 'addressee',
            trust: 3,
            respect: 2,
            affinity: 2,
          },
        ],
        ai: { base: 0.8, traitModifiers: { 'trait.ambitious': 0.3 } },
      },
      {
        key: 'decline',
        label: 'Decline',
        description:
          'Keep your freedom on the back benches. Downing Street does not ask twice, often.',
        capitalCost: 0,
        effects: [
          { kind: 'decline_office' },
          {
            kind: 'relationship',
            from: 'prime_minister',
            to: 'addressee',
            trust: 0,
            respect: -5,
            affinity: -2,
          },
        ],
        ai: { base: 0.2, traitModifiers: { 'trait.maverick': 0.3 } },
      },
    ],
  },
];
