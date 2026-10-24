import type { CreateCampaignRequest } from '@whip/contracts';

export type Player = CreateCampaignRequest['player'];

export const APP_VERSION = 'v0.1';
export const SEAT = { name: 'Ashby & Wold', majority: 1840 } as const;

export const GENDERS: { value: Player['gender']; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Non-binary' },
];

export const STRENGTHS: { value: Player['strength']; label: string; blurb: string }[] = [
  { value: 'oratory', label: 'Oratory', blurb: 'Speeches move votes and headlines.' },
  { value: 'negotiation', label: 'Negotiation', blurb: 'Meetings land better. Deals stick.' },
  { value: 'intrigue', label: 'Intrigue', blurb: 'You hear things. The whips hear less.' },
  { value: 'policy', label: 'Policy', blurb: 'You know the detail of every bill.' },
];

export const PRESETS: { value: Player['ideologyPreset']; label: string; blurb: string }[] = [
  { value: 'moderniser', label: 'Moderniser', blurb: 'Close to the leadership and the bill.' },
  { value: 'heartlands', label: 'Heartlands', blurb: 'The party’s left. Wants social housing.' },
  {
    value: 'independent',
    label: 'Independent-minded',
    blurb: 'Your own view, your own seat.',
  },
];

export const labelOf = <T extends string>(list: { value: T; label: string }[], v: T) =>
  list.find((o) => o.value === v)?.label ?? v;

/** Fictional wire copy for the bottom crawl. */
export const HEADLINES = [
  'Housing Delivery Bill reaches second reading in four weeks',
  'Green belt campaigners march on Ashby town hall',
  'Chief Whip: “We have the numbers”',
  'Opposition demands a consultation on the new towns',
  'Backbench unease “larger than expected”, say party sources',
  'Liberal Reform table an amendment on social rent',
  'Wold parish councils vote to oppose the Ashby bypass',
  'Prime Minister to address the parliamentary party on Monday',
];
