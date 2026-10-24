import type { TextTemplates } from '@whip/domain';

/**
 * Deterministic text templates. Placeholders in braces are filled by the engine:
 * {actor} {target} {bill} {stage} {office} {ayes} {noes} {abstentions} {margin} {count} {party}
 * {promiser} {promisee} {vote} {detail} {option} {event} {constituency} {majority} {faction} {date}.
 */
export const textTemplates: TextTemplates = {
  history: {
    'campaign.created': {
      title: 'A new Parliament assembles',
      summary:
        '{actor} takes their seat as the Member for {constituency}, one of {count} new MPs on the government benches.',
    },
    'election.won': {
      title: '{actor} elected for {constituency}',
      summary: '{actor} won {constituency} for the {party} with a majority of {majority}.',
    },
    'action.meet_politician': {
      title: '{actor} met {target}',
      summary: '{actor} and {target} met privately at Westminster. {detail}',
    },
    'action.build_relationship': {
      title: '{actor} cultivated {target}',
      summary:
        '{actor} spent time with {target}: lunch in the Members’ Dining Room and a long walk back through Portcullis House. {detail}',
    },
    'action.seek_endorsement.success': {
      title: '{target} endorsed {actor}',
      summary:
        '{target} agreed to put in a word for {actor} with the people who matter. {actor} now owes a favour.',
    },
    'action.seek_endorsement.failure': {
      title: '{target} declined to endorse {actor}',
      summary: '{actor} asked {target} for support, and was politely told it was too soon.',
    },
    'action.make_political_promise': {
      title: '{actor} gave {target} a promise',
      summary: '{actor} promised {target} to vote {vote} on the {bill} ({stage}).',
    },
    'action.support_legislation': {
      title: '{actor} backed the {bill}',
      summary: '{actor} spoke up for the {bill} and worked the tea room on its behalf. {detail}',
    },
    'action.oppose_legislation': {
      title: '{actor} came out against the {bill}',
      summary:
        '{actor} publicly opposed the {bill} and lobbied colleagues to do the same. {detail}',
    },
    'action.rebel_against_party': {
      title: '{actor} vowed to defy the whip',
      summary:
        '{actor} told colleagues they will vote {vote} on the {bill} ({stage}), whatever the whips say. {detail}',
    },
    'action.request_promotion': {
      title: '{actor} let it be known they want a job',
      summary: '{actor} made the case to the whips for a role in government.',
    },
    'action.respond_to_event': {
      title: '{actor}: {event}',
      summary: '{actor} chose to {option}.',
    },
    'action.call_reshuffle': {
      title: '{actor} calls a reshuffle',
      summary: 'Downing Street confirmed that {actor} will reshape the government this week.',
    },
    'action.rejected': {
      title: '{actor} could not {detail}',
      summary: 'The plan fell through: {detail}.',
    },
    'division.passed': {
      title: '{bill} passes {stage}, {ayes} to {noes}',
      summary:
        'The House approved the {bill} at {stage} by {ayes} votes to {noes} (majority {margin}). {count} government MPs defied the whip.',
    },
    'division.defeated': {
      title: 'Government defeated on the {bill}',
      summary:
        'The {bill} fell at {stage} by {noes} votes to {ayes}. {count} government MPs defied the whip in a humiliating night for Downing Street.',
    },
    appointment: {
      title: '{actor} appointed {office}',
      summary: '{actor} has been appointed {office}. {detail}',
    },
    resignation: {
      title: '{actor} resigns as {office}',
      summary: '{actor} has resigned as {office}. {detail}',
    },
    dismissal: {
      title: '{actor} sacked as {office}',
      summary: '{actor} has been removed as {office}. {detail}',
    },
    'promise.kept': {
      title: '{promiser} kept their word to {promisee}',
      summary: '{promiser} voted {vote} on the {bill}, as promised to {promisee}.',
    },
    'promise.broken': {
      title: '{promiser} broke a promise to {promisee}',
      summary:
        '{promiser} had promised {promisee} to vote {vote} on the {bill}, and did not. It will not be forgotten.',
    },
    'relationship.warmed': {
      title: '{actor} and {target} grow closer',
      summary: "{actor}'s view of {target} improved markedly: {detail}.",
    },
    'relationship.soured': {
      title: '{actor} turns on {target}',
      summary: "{actor}'s view of {target} worsened sharply: {detail}.",
    },
    'event.resolved': {
      title: '{event}',
      summary: '{actor} chose to {option}.',
    },
    'policy.concession': {
      title: 'Government amends the {bill}',
      summary: 'Ministers have tabled an amendment to the {bill}: {detail}.',
    },
    'promotion.refused': {
      title: '{actor} passed over',
      summary: '{actor} asked for a job in government. The answer, for now, is no.',
    },
  },
  headlines: {
    'division.won_comfortably': [
      {
        text: '{bill} sails through {stage}',
        standfirst: 'Ayes {ayes}, noes {noes}: the whips deliver a majority of {margin}.',
      },
      {
        text: 'Comfortable win for Ashdown on housing',
        standfirst: 'The {bill} clears {stage} by {margin} votes.',
      },
    ],
    'division.won_narrowly': [
      {
        text: 'Squeaker: {bill} survives by {margin}',
        standfirst: '{count} government MPs defied the whip in a nervous night for Number 10.',
      },
      {
        text: 'Whips sweat as {bill} scrapes through',
        standfirst: 'Majority of just {margin} at {stage}.',
      },
    ],
    'division.lost': [
      {
        text: 'GOVERNMENT DEFEATED',
        standfirst:
          'The {bill} falls at {stage}, {noes} to {ayes}. {count} rebels sink the flagship.',
      },
      {
        text: 'Housing bill crashes in Commons humiliation',
        standfirst: '{count} government MPs walk through the No lobby.',
      },
    ],
    'division.rebellion': [
      {
        text: '{count} rebels defy the whip on housing',
        standfirst: 'Biggest rebellion of the new Parliament.',
      },
      { text: 'Backbench revolt: {count} break ranks', standfirst: 'The whips will want names.' },
    ],
    'division.upcoming': [
      {
        text: 'Whips count heads ahead of {bill} vote',
        standfirst: 'The {stage} division is due on {date}.',
      },
      {
        text: 'Countdown to the housing vote',
        standfirst: 'MPs vote on the {bill} ({stage}) on {date}.',
      },
    ],
    resignation: [
      { text: '{actor} quits', standfirst: '{actor} resigns as {office}.' },
      {
        text: 'Resignation rocks the government',
        standfirst: '{actor} walks out of the {office} post.',
      },
    ],
    appointment: [
      { text: '{actor} gets the call', standfirst: 'Appointed {office}.' },
      { text: 'New job for {actor}', standfirst: '{actor} becomes {office}.' },
    ],
    reshuffle: [
      {
        text: 'Ashdown reshuffles her team',
        standfirst: '{count} changes as the Prime Minister reasserts control.',
      },
      { text: 'Reshuffle: winners and losers', standfirst: '{count} posts change hands.' },
    ],
    concession: [
      {
        text: 'Government blinks on social housing',
        standfirst: 'An amendment to the {bill} aims to win back the Heartlands.',
      },
      { text: 'U-turn? Ministers rewrite the {bill}', standfirst: '{detail}' },
    ],
    'stability.low': [
      { text: 'Is Ashdown losing control?', standfirst: 'Government stability slides to {count}.' },
    ],
    'player.rebelled': [
      {
        text: 'New MP {actor} defies the whip',
        standfirst: 'The Member for {constituency} votes {vote} on the {bill}.',
      },
    ],
    'player.promoted': [
      { text: 'Rising star: {actor} lands first job', standfirst: '{actor} becomes {office}.' },
    ],
    quiet_week: [
      {
        text: 'Westminster settles into the new term',
        standfirst: 'The tea room is busy; the lobby less so.',
      },
      {
        text: 'All eyes on the housing bill',
        standfirst: 'Government whips are confident; backbenchers less so.',
      },
      {
        text: 'A quiet week in the Commons',
        standfirst: 'But the arithmetic is never quite as simple as it looks.',
      },
    ],
  },
};
