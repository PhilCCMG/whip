import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, beforeAll } from 'vitest';
import { setApiFetch } from '../api/runtime';
import { useToastStore } from '../stores/toast-store';
import { useUiStore } from '../stores/ui-store';

const initialUi = useUiStore.getState();

/**
 * Load every lazy route module before the file's tests run. Otherwise the first test to visit a
 * route pays for a cold import + transform inside its findBy window, which under a parallel run
 * can outlast it (the router renders nothing until the module arrives). Imports are cached, so
 * the router's own lazy() calls then resolve at once.
 */
beforeAll(async () => {
  const { routes } = await import('../router');
  const lazies = (rs: RouteObject[]): (() => Promise<unknown>)[] =>
    rs.flatMap((r) => [
      ...(typeof r.lazy === 'function' ? [r.lazy as () => Promise<unknown>] : []),
      ...lazies(r.children ?? []),
    ]);
  await Promise.all(lazies(routes).map((load) => load()));
}, 60_000);

beforeAll(() => {
  // jsdom gaps used by Radix primitives.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!('scrollIntoView' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {} });
  }
  // jsdom has no media playback: resolve play() quietly so the menu music can run in tests.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: () => {},
  });
  if (!('hasPointerCapture' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'hasPointerCapture', { value: () => false });
  }
});

afterEach(() => {
  cleanup();
  setApiFetch(null);
  useUiStore.setState(initialUi, true);
  useToastStore.setState({ toasts: [] });
});
