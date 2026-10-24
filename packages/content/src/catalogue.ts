import type {
  AmbitionDefinition,
  IssueDefinition,
  OfficeDefinition,
  SkillDefinition,
  SkillKey,
} from '@whip/domain';

export const issueList: IssueDefinition[] = [
  {
    key: 'issue.housing_targets',
    label: 'Mandatory housing targets',
    description: 'Binding local housebuilding targets that override local planning objections.',
    stanceLabels: ['Strongly opposes', 'Opposes', 'Neutral', 'Supports', 'Strongly supports'],
  },
  {
    key: 'issue.green_belt',
    label: 'Green-belt protection',
    description: 'Keeping the green belt free of development.',
    stanceLabels: [
      'Would build on it',
      'Relaxed about release',
      'Neutral',
      'Protective',
      'Fiercely protective',
    ],
  },
  {
    key: 'issue.social_housing',
    label: 'Social housing',
    description:
      'Council and housing-association homes for social rent, including quotas in new developments.',
    stanceLabels: ['Strongly opposes', 'Sceptical', 'Neutral', 'Supports', 'Champions'],
  },
  {
    key: 'issue.local_control',
    label: 'Local control of planning',
    description: 'Letting councils and communities decide what gets built where.',
    stanceLabels: ['Centralist', 'Leans central', 'Neutral', 'Localist', 'Fiercely localist'],
  },
  {
    key: 'issue.public_spending',
    label: 'Public spending',
    description: 'Higher public investment and spending, even at the cost of borrowing or tax.',
    stanceLabels: ['Austerity hawk', 'Restraint', 'Neutral', 'Investment', 'Big state'],
  },
  {
    key: 'issue.immigration',
    label: 'Tighter immigration control',
    description: 'Reducing net migration through stricter controls.',
    stanceLabels: ['Strongly opposes', 'Opposes', 'Neutral', 'Supports', 'Strongly supports'],
  },
];

export const skillList: SkillDefinition[] = [
  {
    key: 'oratory',
    label: 'Oratory',
    description: 'Commanding the chamber and the conference hall.',
  },
  {
    key: 'negotiation',
    label: 'Negotiation',
    description: 'Finding the deal that both sides can sell.',
  },
  {
    key: 'administration',
    label: 'Administration',
    description: 'Running a department, a whips office or a campaign.',
  },
  {
    key: 'intrigue',
    label: 'Intrigue',
    description: 'Knowing what is said in the tea room before it is said.',
  },
  { key: 'media', label: 'Media', description: 'Handling the lobby, the studio and the feed.' },
  { key: 'policy', label: 'Policy', description: 'Mastery of detail; the bill, clause by clause.' },
];
export const skillKeys: SkillKey[] = skillList.map((s) => s.key);

export const ambitionList: AmbitionDefinition[] = [
  {
    key: 'ambition.cabinet',
    label: 'A seat at the Cabinet table',
    description: 'Wants ministerial office, and eventually Cabinet.',
    weight: 30,
    careerist: true,
  },
  {
    key: 'ambition.leadership',
    label: 'The leadership',
    description: 'Wants to lead the party, and the country.',
    weight: 5,
    careerist: true,
  },
  {
    key: 'ambition.safe_seat',
    label: 'Holding the seat',
    description: 'Wants above all to be re-elected.',
    weight: 22,
    careerist: false,
  },
  {
    key: 'ambition.policy_cause',
    label: 'A cause',
    description: 'In politics to change one thing.',
    weight: 18,
    careerist: false,
  },
  {
    key: 'ambition.quiet_life',
    label: 'A quiet life',
    description: 'Content on the back benches; avoids trouble.',
    weight: 20,
    careerist: false,
  },
  {
    key: 'ambition.legacy',
    label: 'Legacy',
    description: 'Thinks about how history will remember them.',
    weight: 5,
    careerist: false,
  },
];

function office(
  key: OfficeDefinition['key'],
  label: string,
  kind: OfficeDefinition['kind'],
  rank: number,
  influence: number,
  departmentKey: OfficeDefinition['departmentKey'] = null,
): OfficeDefinition {
  const ministerial =
    kind === 'prime_minister' || kind === 'cabinet' || kind === 'minister' || kind === 'whip';
  return {
    key,
    label,
    kind,
    ministerial,
    earnsCapital: ministerial || kind === 'pps',
    departmentKey,
    influence,
    rank,
  };
}

/** The 18 generated cabinet posts (held by generated NPP MPs). */
export const generatedCabinetOfficeKeys = [
  'office.foreign_secretary',
  'office.home_secretary',
  'office.health_secretary',
  'office.education_secretary',
  'office.defence_secretary',
  'office.justice_secretary',
  'office.work_and_pensions_secretary',
  'office.business_secretary',
  'office.energy_secretary',
  'office.environment_secretary',
  'office.transport_secretary',
  'office.culture_secretary',
  'office.science_secretary',
  'office.scotland_secretary',
  'office.wales_secretary',
  'office.northern_ireland_secretary',
  'office.leader_of_the_house',
  'office.chief_secretary_to_the_treasury',
] as const;

export const officeList: OfficeDefinition[] = [
  office('office.prime_minister', 'Prime Minister', 'prime_minister', 0, 40, 'dept.number_ten'),
  office('office.chancellor', 'Chancellor of the Exchequer', 'cabinet', 1, 26, 'dept.treasury'),
  office('office.foreign_secretary', 'Foreign Secretary', 'cabinet', 2, 20, 'dept.foreign'),
  office('office.home_secretary', 'Home Secretary', 'cabinet', 3, 20, 'dept.home'),
  office(
    'office.housing_secretary',
    'Secretary of State for Housing',
    'cabinet',
    4,
    18,
    'dept.housing',
  ),
  office('office.chief_whip', 'Chief Whip', 'whip', 5, 22, 'dept.whips'),
  office('office.health_secretary', 'Health Secretary', 'cabinet', 6, 16, 'dept.health'),
  office('office.education_secretary', 'Education Secretary', 'cabinet', 7, 15, 'dept.education'),
  office('office.defence_secretary', 'Defence Secretary', 'cabinet', 8, 15, 'dept.defence'),
  office('office.justice_secretary', 'Justice Secretary', 'cabinet', 9, 14, 'dept.justice'),
  office(
    'office.work_and_pensions_secretary',
    'Work and Pensions Secretary',
    'cabinet',
    10,
    14,
    'dept.work_pensions',
  ),
  office('office.business_secretary', 'Business Secretary', 'cabinet', 11, 14, 'dept.business'),
  office('office.energy_secretary', 'Energy Secretary', 'cabinet', 12, 13, 'dept.energy'),
  office(
    'office.environment_secretary',
    'Environment Secretary',
    'cabinet',
    13,
    13,
    'dept.environment',
  ),
  office('office.transport_secretary', 'Transport Secretary', 'cabinet', 14, 13, 'dept.transport'),
  office('office.culture_secretary', 'Culture Secretary', 'cabinet', 15, 12, 'dept.culture'),
  office('office.science_secretary', 'Science Secretary', 'cabinet', 16, 12, 'dept.science'),
  office('office.scotland_secretary', 'Scotland Secretary', 'cabinet', 17, 11, 'dept.scotland'),
  office('office.wales_secretary', 'Wales Secretary', 'cabinet', 18, 11, 'dept.wales'),
  office(
    'office.northern_ireland_secretary',
    'Northern Ireland Secretary',
    'cabinet',
    19,
    11,
    'dept.northern_ireland',
  ),
  office(
    'office.leader_of_the_house',
    'Leader of the House of Commons',
    'cabinet',
    20,
    13,
    'dept.commons',
  ),
  office(
    'office.chief_secretary_to_the_treasury',
    'Chief Secretary to the Treasury',
    'cabinet',
    21,
    13,
    'dept.treasury',
  ),
  office('office.deputy_chief_whip', 'Deputy Chief Whip', 'whip', 22, 12, 'dept.whips'),
  office(
    'office.minister_of_state_housing',
    'Minister of State for Housing',
    'minister',
    23,
    9,
    'dept.housing',
  ),
  office('office.pps_housing', 'PPS to the Housing Secretary', 'pps', 40, 4, 'dept.housing'),
  office('office.pps_chancellor', 'PPS to the Chancellor', 'pps', 41, 4, 'dept.treasury'),
  office('office.speaker', 'Speaker of the House of Commons', 'speaker', 50, 15, 'dept.commons'),
  office(
    'office.leader_of_opposition',
    'Leader of the Opposition',
    'opposition_leader',
    60,
    25,
    null,
  ),
  office('office.shadow_housing', 'Shadow Housing Secretary', 'shadow', 61, 8, null),
];
