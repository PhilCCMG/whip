import { X } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { cn } from '../lib/utils';

export interface ToastItem {
  id: string;
  title: string;
  description?: string | undefined;
  tone?: 'info' | 'good' | 'warning' | 'critical' | undefined;
}

/** The tone as a flat square mark (no coloured side bars). */
const toneMark = {
  info: 'bg-paper/60',
  good: 'bg-good',
  warning: 'bg-warning',
  critical: 'bg-whip',
} as const;

export interface ToasterProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  duration?: number;
}

/**
 * Presentational toaster: the app owns the list of toasts. Top right, under the in-game HUD and
 * tabs, so it never covers END WEEK. Flat ink, no shadow.
 */
export function Toaster({ toasts, onDismiss, duration = 6000 }: ToasterProps) {
  return (
    <ToastPrimitive.Provider duration={duration} swipeDirection="right">
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          onOpenChange={(open) => {
            if (!open) onDismiss(t.id);
          }}
          className="relative flex gap-3 bg-ink py-3 pr-10 pl-3 text-paper outline-2 -outline-offset-2 outline-paper/25 motion-safe:animate-in-left"
        >
          <span
            aria-hidden="true"
            className={cn('mt-1 size-2.5 shrink-0', toneMark[t.tone ?? 'info'])}
          />
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
      <ToastPrimitive.Viewport className="fixed top-16 right-3 z-[60] flex w-[min(380px,calc(100vw-1.5rem))] flex-col gap-2 outline-none md:top-[7.25rem] md:right-4" />
    </ToastPrimitive.Provider>
  );
}
