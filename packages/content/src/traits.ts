import type { TraitDefinition, TraitKey } from '@whip/domain';

type TraitInput = Omit<TraitDefinition, 'vote' | 'relationship' | 'excludes'> & {
  vote?: Partial<TraitDefinition['vote']>;
  relationship?: Partial<TraitDefinition['relationship']>;
  excludes?: TraitKey[];
};

function trait(input: TraitInput): TraitDefinition {
  return {
    key: input.key,
    label: input.label,
    description: input.description,
    weight: input.weight,
    ai: input.ai,
    vote: { loyaltyBonus: 0, principleWeight: 1, ...input.vote },
    relationship: {
      flatteryResponse: 1,
      substanceResponse: 1,
      grudgeMultiplier: 1,
      ...input.relationship,
    },
    excludes: input.excludes ?? [],
  };
}

/**
 * Personality traits. `ai` multiplies AI consideration weights; `vote` modifies vote utility;
 * `relationship` shapes how the holder responds to being courted or crossed.
 */
export const traitList: TraitDefinition[] = [
  trait({
    key: 'trait.ambitious',
    label: 'Ambitious',
    description: 'Wants to climb, and measures every week by whether they moved up a rung.',
    weight: 12,
    ai: { careerGain: 1.6, riskOfWhipAnger: 1.3, publicProfile: 1.2 },
    vote: { loyaltyBonus: 8 },
    excludes: ['trait.idealist'],
  }),
  trait({
    key: 'trait.principled',
    label: 'Principled',
    description:
      'Votes with conscience over convenience. Respects substance and remembers betrayals.',
    weight: 9,
    ai: { ideologicalFit: 1.5, careerGain: 0.7, factionDemand: 1.2 },
    vote: { principleWeight: 1.5, loyaltyBonus: -6 },
    relationship: { substanceResponse: 1.6, flatteryResponse: 0.5, grudgeMultiplier: 1.4 },
    excludes: ['trait.schemer'],
  }),
  trait({
    key: 'trait.cautious',
    label: 'Cautious',
    description: 'Dislikes risk. Waits to see which way the wind is blowing before committing.',
    weight: 11,
    ai: { riskOfWhipAnger: 1.6, publicProfile: 0.7 },
    vote: { loyaltyBonus: 6 },
    excludes: ['trait.combative'],
  }),
  trait({
    key: 'trait.schemer',
    label: 'Schemer',
    description: 'Plays the long game in the tea room. Collects favours and information.',
    weight: 6,
    ai: { relationshipValue: 1.5, careerGain: 1.2 },
    relationship: { grudgeMultiplier: 1.2 },
    excludes: ['trait.principled'],
  }),
  trait({
    key: 'trait.vain',
    label: 'Vain',
    description: 'Craves recognition. Flattery works; slights are not forgotten.',
    weight: 6,
    ai: { publicProfile: 1.6 },
    relationship: { flatteryResponse: 1.8, substanceResponse: 0.8, grudgeMultiplier: 1.3 },
  }),
  trait({
    key: 'trait.loyalist',
    label: 'Loyalist',
    description: 'The party comes first. Follows the whip and expects others to do the same.',
    weight: 12,
    ai: { whipDuty: 1.5, riskOfWhipAnger: 1.4, ideologicalFit: 0.8 },
    vote: { loyaltyBonus: 25 },
    excludes: ['trait.maverick'],
  }),
  trait({
    key: 'trait.intimidating',
    label: 'Intimidating',
    description: 'A presence in the corridor. Colleagues think twice before crossing them.',
    weight: 2,
    ai: { whipDuty: 1.3 },
  }),
  trait({
    key: 'trait.stubborn',
    label: 'Stubborn',
    description: 'Once decided, rarely moved. Lobbying bounces off.',
    weight: 5,
    ai: { factionDemand: 1.3 },
    vote: { principleWeight: 1.2 },
    relationship: { flatteryResponse: 0.6, substanceResponse: 0.8 },
  }),
  trait({
    key: 'trait.respected',
    label: 'Respected',
    description: 'Decades of service. Their word carries across the House.',
    weight: 2,
    ai: { relationshipValue: 1.1 },
  }),
  trait({
    key: 'trait.idealist',
    label: 'Idealist',
    description: 'Came into politics to change things. Impatient with compromise.',
    weight: 5,
    ai: { ideologicalFit: 1.4, factionDemand: 1.2, careerGain: 0.6 },
    vote: { principleWeight: 1.3, loyaltyBonus: -8 },
    relationship: { substanceResponse: 1.4, flatteryResponse: 0.7 },
    excludes: ['trait.ambitious'],
  }),
  trait({
    key: 'trait.combative',
    label: 'Combative',
    description: 'Relishes a fight at the despatch box and in the media.',
    weight: 5,
    ai: { publicProfile: 1.4, riskOfWhipAnger: 0.7 },
    excludes: ['trait.cautious'],
  }),
  trait({
    key: 'trait.pragmatic',
    label: 'Pragmatic',
    description: 'Will take half a loaf. Open to deals and concessions.',
    weight: 12,
    ai: { careerGain: 1.1, ideologicalFit: 0.8 },
    vote: { principleWeight: 0.8, loyaltyBonus: 5 },
    relationship: { substanceResponse: 1.2 },
  }),
  trait({
    key: 'trait.maverick',
    label: 'Maverick',
    description: 'An independent streak the whips have learned to fear.',
    weight: 4,
    ai: { riskOfWhipAnger: 0.5, ideologicalFit: 1.2, publicProfile: 1.2 },
    vote: { loyaltyBonus: -22, principleWeight: 1.2 },
    excludes: ['trait.loyalist'],
  }),
  trait({
    key: 'trait.charismatic',
    label: 'Charismatic',
    description: 'People like being around them. Doors open easily.',
    weight: 4,
    ai: { relationshipValue: 1.2, publicProfile: 1.2 },
  }),
  trait({
    key: 'trait.diligent',
    label: 'Diligent',
    description: 'Reads the bill, attends committee, answers every letter.',
    weight: 9,
    ai: { billStake: 1.3 },
    relationship: { substanceResponse: 1.3 },
  }),
  trait({
    key: 'trait.tribal',
    label: 'Tribal',
    description: 'Never trusts the other side. Cross-party approaches fall flat.',
    weight: 6,
    ai: { whipDuty: 1.1 },
    vote: { loyaltyBonus: 12 },
    relationship: { grudgeMultiplier: 1.2 },
  }),
];
