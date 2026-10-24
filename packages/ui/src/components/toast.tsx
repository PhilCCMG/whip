import { X } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { cn } from '../lib/utils';

export interface ToastItem {
  id: string;
  title: string;
  description?: string | undefined;
  tone?: 'info' | 'good' | 'warning' | 'critical' | undefined;
}

const toneBar = {
  info: 'bg-paper',
  good: 'bg-good',
  warning: 'bg-warning',
  critical: 'bg-whip',
} as const;

export interface ToasterProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  duration?: number;
}

/** Presentational toaster: the app owns the list of toasts. */
export function Toaster({ toasts, onDismiss, duration = 6000 }: ToasterProps) {
  return (
    <ToastPrimitive.Provider duration={duration} swipeDirection="right">
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          onOpenChange={(open) => {
            if (!open) onDismiss(t.id);
          }}
          className="relative flex gap-3 bg-ink py-3 pr-10 pl-0 text-paper shadow-[0_16px_40px_-16px_rgb(0_0_0/0.7)] motion-safe:animate-in-left"
        >
          <span aria-hidden="true" className={cn('w-1 shrink-0', toneBar[t.tone ?? 'info'])} />
          <div className="min-w-0">
            <ToastPrimitive.Title className="text-sm font-semibold">{t.title}</ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="mt-0.5 text-xs text-paper/70">
                {t.description}
              </ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="absolute top-2 right-2 inline-flex size-7 cursor-pointer items-center justify-center text-paper/60 hover:text-paper focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed right-4 bottom-20 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 outline-none lg:bottom-4" />
    </ToastPrimitive.Provider>
  );
}
