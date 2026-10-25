import type { NewspaperContent } from '@whip/domain';
import { fillerTemplates } from './filler';
import { journalists, mastheads, pools } from './mastheads';
import { politicsTemplates } from './politics';

/** Newspaper content injected into the engine via `ContentRegistry.newspaper`. */
export const newspaperContent: NewspaperContent = {
  mastheads,
  journalists,
  politics: politicsTemplates,
  filler: fillerTemplates,
  pools,
};

export { fillerTemplates, journalists, mastheads, politicsTemplates, pools };
