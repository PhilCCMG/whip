import { cn } from '@whip/ui';

/** The red confirm button used across the front-end screens. */
export const primaryButton = cn(
  'inline-flex h-12 min-w-44 cursor-pointer items-center justify-center bg-whip px-6 font-display text-xl font-black text-white uppercase [font-stretch:72%]',
  'transition-colors duration-100 hover:bg-whip-dark disabled:cursor-wait disabled:opacity-70',
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-paper-bright',
);
