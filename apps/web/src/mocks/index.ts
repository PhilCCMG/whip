/**
 * Mock API entry point. Only import this dynamically behind `import.meta.env.VITE_API_MOCK` so it
 * stays out of the production bundle.
 */
import { createMockBackend } from './backend';

export const mockBackend = createMockBackend({ latencyMs: 180 });

export { createMockBackend, type MockBackend } from './backend';
export { buildCatalogue, ACTION_DEFS } from './catalogue';
export * from './fixtures';
export type * from './types';
