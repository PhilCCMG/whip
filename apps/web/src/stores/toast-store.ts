import type { ToastItem } from '@whip/ui';
import { create } from 'zustand';

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'> & { id?: string }) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) =>
    set((s) => {
      const id = toast.id ?? `t${++counter}`;
      // A toast with a fixed id replaces its previous instance instead of stacking.
      return { toasts: [...s.toasts.filter((t) => t.id !== id), { ...toast, id }].slice(-4) };
    }),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (t: Omit<ToastItem, 'id'> & { id?: string }) =>
  useToastStore.getState().push(t);
