import type { TextTemplates } from '@whip/domain';

/**
 * Deterministic history templates (the career record and the chronicle). Placeholders in braces
 * are filled by the engine: {actor} {target} {bill} {stage} {office} {ayes} {noes} {abstentions}
 * {margin} {count} {party} {promiser} {promisee} {vote} {detail} {option} {event} {constituency}
 * {majority} {faction} {date}. Titles state what happened; summaries add the voice
 * (docs/architecture/10-voice-and-copy.md). Newspaper stories live in ./newspaper.
 */
export const textTemplates: TextTemplates = {
  history: {
    'campaign.created': {
      title: 'A new Parliament assembles',
      summary:
        '{actor} takes their seat as the Member for {constituency}, one of {count} new MPs on the government benches, all of them certain they will be different.',
    },
    'election.won': {
      title: '{actor} elected for {constituency}',
      summary:
        '{actor} won {constituency} for the {party} with a majority of {majority}: enough to win, not enough to relax.',
    },
    'action.meet_politician': {
      title: '{actor} met {target}',
      summary:
        '{actor} and {target} met privately at Westminster, over tea that neither of them drank. {detail}',
    },
    'action.build_relationship': {
      title: '{actor} cultivated {target}',
      summary:
        '{actor} spent time with {target}: lunch in the Members’ Dining Room and a long walk back through Portcullis House, laughing at the right moments. {detail}',
    },
    'action.seek_endorsement.success': {
      title: '{target} endorsed {actor}',
      summary:
        '{target} agreed to put in a word for {actor} with the people who matter. {actor} now owes a favour, and favours accrue interest.',
    },
    'action.seek_endorsement.failure': {
      title: '{target} declined to endorse {actor}',
      summary:
        '{actor} asked {target} for support and was told, with great warmth, that it was too soon.',
    },
    'action.make_political_promise': {
      title: '{actor} gave {target} a promise',
      summary:
        '{actor} promised {target} to vote {vote} on the {bill} ({stage}). Promises are free to make and expensive to break.',
    },
    'action.support_legislation': {
      title: '{actor} backed the {bill}',
      summary:
        '{actor} spoke up for the {bill} and worked the tea room on its behalf, to approving nods from the front bench. {detail}',
    },
    'action.oppose_legislation': {
      title: '{actor} came out against the {bill}',
      summary:
        '{actor} publicly opposed the {bill} and lobbied colleagues to do the same. The whips took notes. {detail}',
    },
    'action.rebel_against_party': {
      title: '{actor} vowed to defy the whip',
      summary:
        '{actor} told colleagues they will vote {vote} on the {bill} ({stage}), whatever the whips say, and the whips will have something to say. {detail}',
    },
    'action.request_promotion': {
      title: '{actor} let it be known they want a job',
      summary: '{actor} made the case to the whips for a role in government, modestly, at length.',
    },
    'action.respond_to_event': {
      title: '{actor}: {event}',
      summary: '{actor} chose to {option}.',
    },
    'action.call_reshuffle': {
      title: '{actor} calls a reshuffle',
      summary:
        'Downing Street confirmed that {actor} will reshape the government this week. Ministers have started keeping their phones charged.',
    },
    'action.rejected': {
      title: '{actor} could not {detail}',
      summary:
        'The plan fell through: {detail}. It happens to the best of them, and more often to the rest.',
    },
    'division.passed': {
      title: '{bill} passes {stage}, {ayes} to {noes}',
      summary:
        'The House approved the {bill} at {stage} by {ayes} votes to {noes} (majority {margin}). {count} government MPs defied the whip, and the whips know who they are.',
    },
    'division.defeated': {
      title: 'Government defeated on the {bill}',
      summary:
        'The {bill} fell at {stage} by {noes} votes to {ayes}. {count} government MPs defied the whip in a long night for Downing Street, and a longer morning.',
    },
    appointment: {
      title: '{actor} appointed {office}',
      summary:
        '{actor} has been appointed {office}, and has been told where the kettle is. {detail}',
    },
    resignation: {
      title: '{actor} resigns as {office}',
      summary:
        '{actor} has resigned as {office}, citing a desire to spend more time on the back benches. {detail}',
    },
    dismissal: {
      title: '{actor} sacked as {office}',
      summary:
        '{actor} has been removed as {office}; the ministerial car has already left. {detail}',
    },
    'promise.kept': {
      title: '{promiser} kept their word to {promisee}',
      summary:
        '{promiser} voted {vote} on the {bill}, as promised to {promisee}. Colleagues noted it, the way one notes a comet.',
    },
    'promise.broken': {
      title: '{promiser} broke a promise to {promisee}',
      summary:
        '{promiser} had promised {promisee} to vote {vote} on the {bill}, and did not. It will not be forgotten, or forgiven, or mentioned in public.',
    },
    'relationship.warmed': {
      title: '{actor} and {target} grow closer',
      summary: "{actor}'s view of {target} improved markedly: {detail}. The tea room has noticed.",
    },
    'relationship.soured': {
      title: '{actor} turns on {target}',
      summary:
        "{actor}'s view of {target} worsened sharply: {detail}. Nobody is calling it a feud yet.",
    },
    'event.resolved': {
      title: '{event}',
      summary: '{actor} chose to {option}.',
    },
    'policy.concession': {
      title: 'Government amends the {bill}',
      summary:
        'Ministers have tabled an amendment to the {bill}: {detail}. Downing Street insists it is not a U-turn, merely a turn.',
    },
    'promotion.refused': {
      title: '{actor} passed over',
      summary:
        '{actor} asked for a job in government. The answer, for now, is a warm and well-meaning no.',
    },
  },
};
