import { cn, DisplayTitle, Keycap, Kicker } from '@whip/ui';
import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode, RefObject } from 'react';

/**
 * The in-game modal: an ink sheet with a red top rule over a flat ink veil. Radix Dialog
 * underneath (focus trap, Esc to close, labelled by its title). No shadow, no rounded corners.
 *
 * Sizes: `md` for pickers and confirms, `lg` for the action planner, `full` for takeovers such as
 * the turn report (which supplies its own header).
 */
export function DispatchFrame({
  open,
  onOpenChange,
  title,
  kicker,
  description,
  size = 'md',
  tone = 'ink',
  header,
  footer,
  children,
  className,
  closeLabel = 'Close',
  initialFocus,
}: {
  /** Element to focus on open (default: the first focusable one). */
  initialFocus?: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  size?: 'md' | 'lg' | 'full';
  tone?: 'ink' | 'desk';
  /** Replace the default header (title stays required for the accessible name). */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink/85 motion-safe:animate-in-fade" />
        <D.Content
          className={cn(
            'fixed z-50 flex flex-col text-paper outline-none motion-safe:animate-in-rise',
            tone === 'ink' ? 'bg-ink' : 'bg-desk',
            size === 'full'
              ? 'inset-0'
              : cn(
                  'top-1/2 left-1/2 max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 outline-2 outline-paper/20',
                  size === 'md' ? 'max-w-xl' : 'max-w-5xl',
                ),
            className,
          )}
          onOpenAutoFocus={(e) => {
            if (!initialFocus?.current) return;
            e.preventDefault();
            initialFocus.current.focus({ preventScroll: true });
          }}
          // Without a description, tell Radix there is none (it wires one up when there is).
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          {header ?? (
            <div className="shrink-0">
              <div aria-hidden="true" className="h-1.5 bg-whip" />
              <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-4 md:px-6">
                <div className="min-w-0">
                  {kicker && <Kicker className="mb-2 text-paper/75">{kicker}</Kicker>}
                  <D.Title asChild>
                    <DisplayTitle as="h2" size="lg" slash className="text-paper-bright">
                      {title}
                    </DisplayTitle>
                  </D.Title>
                  {description && (
                    <D.Description className="mt-2 max-w-[62ch] text-[14px] text-paper/80">
                      {description}
                    </D.Description>
                  )}
                </div>
                <D.Close
                  aria-label={closeLabel}
                  className="flex h-10 shrink-0 cursor-pointer items-center gap-2 px-2 text-[11px] font-bold tracking-[0.08em] text-paper/80 uppercase hover:text-paper-bright focus-visible:outline-2 focus-visible:outline-whip"
                >
                  <Keycap aria-hidden="true" className="max-sm:hidden">
                    Esc
                  </Keycap>
                  <X aria-hidden="true" className="size-5" />
                </D.Close>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
          {footer && (
            <div className="shrink-0 border-t-2 border-paper/15 px-5 py-3 md:px-6">{footer}</div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const DispatchTitle = D.Title;
