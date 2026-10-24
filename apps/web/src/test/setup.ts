import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { setApiFetch } from '../api/runtime';
import { useToastStore } from '../stores/toast-store';
import { useUiStore } from '../stores/ui-store';

const initialUi = useUiStore.getState();

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
