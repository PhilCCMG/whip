import { cn } from '@whip/ui';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { uiSound } from '../audio/use-ui-sound';
import { DOWN_KEYS, UP_KEYS } from './keys';
import { SlashCursor } from './menu-list';

/** Sub-screen title block: a big condensed heading, plus an on-screen Back for touch. */
export function ScreenHeader({
  title,
  onBack,
  children,
  id,
}: {
  title: string;
  onBack: () => void;
  children?: ReactNode;
  id: string;
}) {
  return (
    <header className="shrink-0">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 mb-3 flex min-h-11 cursor-pointer items-center gap-1 pr-3 text-[13px] font-bold tracking-[0.06em] text-paper/80 uppercase hover:text-paper-bright focus-visible:outline-2 focus-visible:outline-whip md:hidden"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
        Back
      </button>
      <h2
        id={id}
        tabIndex={-1}
        className="flex items-start gap-3 font-display text-[clamp(2.6rem,5vw,4.5rem)] leading-[0.88] font-black text-paper-bright uppercase outline-none [font-stretch:66%]"
      >
        <SlashCursor className="mt-[0.06em] h-[0.82em] w-auto shrink-0" />
        {title}
      </h2>
      {children}
    </header>
  );
}

export interface TileOption<T extends string> {
  value: T;
  label: string;
  blurb?: string;
}

/**
 * Large selectable tiles as an ARIA radio group with a roving tabindex. Arrow keys (and W/S
 * when vertical) move and select, as in a native radio group; Enter calls `onConfirm`.
 */
export function OptionTiles<T extends string>({
  label,
  options,
  value,
  onChange,
  onConfirm,
  orientation = 'vertical',
  autoFocus = false,
  className,
  onEscapeEdge,
}: {
  label: string;
  options: TileOption<T>[];
  value: T;
  onChange: (v: T) => void;
  onConfirm?: () => void;
  orientation?: 'vertical' | 'horizontal';
  autoFocus?: boolean;
  className?: string;
  /** Horizontal groups: ↑/↓ leave the group (direction -1 / 1). */
  onEscapeEdge?: (direction: -1 | 1) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (autoFocus) refs.current[current]?.focus({ preventScroll: true });
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (i: number) => {
    const n = options.length;
    const next = (i + n) % n;
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const prev =
      orientation === 'vertical'
        ? UP_KEYS.has(e.key) || e.key === 'ArrowLeft'
        : e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
    const next =
      orientation === 'vertical'
        ? DOWN_KEYS.has(e.key) || e.key === 'ArrowRight'
        : e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
    // Clicks and Space reach the menu's delegated click sound; key moves and Enter tick here.
    if (prev) {
      e.preventDefault();
      select(current - 1);
      uiSound.click();
    } else if (next) {
      e.preventDefault();
      select(current + 1);
      uiSound.click();
    } else if (
      orientation === 'horizontal' &&
      onEscapeEdge &&
      (UP_KEYS.has(e.key) || DOWN_KEYS.has(e.key))
    ) {
      e.preventDefault();
      onEscapeEdge(UP_KEYS.has(e.key) ? -1 : 1);
      uiSound.click();
    } else if (e.key === 'Enter' && onConfirm) {
      e.preventDefault();
      onConfirm();
      uiSound.click();
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      className={cn(
        orientation === 'vertical' ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2',
        className,
      )}
    >
      {options.map((o, i) => {
        const checked = i === current;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-field
            onClick={() => select(i)}
            onDoubleClick={() => onConfirm?.()}
            className={cn(
              'group relative flex min-h-11 cursor-pointer items-center gap-3 border-2 text-left transition-[background-color,border-color,color,translate] duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-bright',
              orientation === 'vertical' ? 'px-4 py-3' : 'px-4 py-2',
              checked
                ? 'border-paper-bright bg-paper-bright text-ink'
                : 'border-paper/25 bg-ink text-paper hover:border-paper/60',
            )}
          >
            {orientation === 'vertical' && (
              <SlashCursor className={cn('h-8 w-auto shrink-0', !checked && 'fill-paper/20')} />
            )}
            <span className="min-w-0">
              <span
                className={cn(
                  'block font-display leading-none font-black uppercase [font-stretch:72%]',
                  orientation === 'vertical' ? 'text-[26px]' : 'text-lg',
                )}
              >
                {o.label}
              </span>
              {o.blurb && (
                <span
                  className={cn(
                    'mt-1 block text-[13px] font-medium',
                    checked ? 'text-ink/75' : 'text-paper/70',
                  )}
                >
                  {o.blurb}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
