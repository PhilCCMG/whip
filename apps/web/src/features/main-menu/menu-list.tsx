import { cn } from '@whip/ui';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { uiSound } from '../audio/use-ui-sound';
import { DOWN_KEYS, UP_KEYS } from './keys';

export interface MenuItem {
  id: string;
  label: string;
  /** Second line under the label, e.g. the latest career or why the item is unavailable. */
  sub?: string | undefined;
  disabled?: boolean;
  /** No click on activation (the action plays its own sound, e.g. the whoosh into a career). */
  silent?: boolean;
}

/** The red slash from the wordmark, used as the menu cursor. */
export function SlashCursor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 64" aria-hidden="true" className={cn('fill-whip', className)}>
      <polygon points="15,0 24,0 9,64 0,64" />
    </svg>
  );
}

/**
 * A game-style vertical menu. One cursor: keyboard (↑/↓, W/S, Home/End) and pointer hover both
 * move `index`; Enter/Space or a click activates. ARIA menu pattern with a roving tabindex, so
 * disabled items stay reachable and are announced as unavailable.
 */
export function MenuList({
  items,
  index,
  onIndexChange,
  onActivate,
  label,
  autoFocus = true,
  className,
}: {
  items: MenuItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onActivate: (id: string) => void;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep DOM focus on the cursor while focus is in the menu (or nowhere in particular).
  useEffect(() => {
    const active = document.activeElement;
    const inMenu = !!listRef.current?.contains(active);
    if (inMenu || (autoFocus && (active === document.body || active === null))) {
      refs.current[index]?.focus({ preventScroll: true });
    }
  }, [index, autoFocus]);

  /** A cursor move by the player (keys or hover): ticks only when the selection changes. */
  const moveTo = (i: number) => {
    if (i === index) return;
    onIndexChange(i);
    uiSound.click();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const n = items.length;
    if (UP_KEYS.has(e.key)) {
      e.preventDefault();
      moveTo((index - 1 + n) % n);
    } else if (DOWN_KEYS.has(e.key)) {
      e.preventDefault();
      moveTo((index + 1) % n);
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveTo(n - 1);
    }
  };

  return (
    <div
      ref={listRef}
      role="menu"
      aria-label={label}
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      className={cn('flex flex-col', className)}
    >
      {items.map((item, i) => {
        const selected = i === index;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={selected ? 0 : -1}
            aria-disabled={item.disabled || undefined}
            aria-current={selected ? 'true' : undefined}
            data-selected={selected || undefined}
            data-sfx={item.silent ? 'off' : undefined}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') moveTo(i);
            }}
            onFocus={() => {
              if (!selected) onIndexChange(i);
            }}
            onClick={() => {
              if (!selected) onIndexChange(i);
              if (!item.disabled) onActivate(item.id);
            }}
            className={cn(
              'group relative flex min-h-11 w-full cursor-pointer items-start py-1.5 text-left outline-none select-none',
              'focus-visible:outline-none',
              item.disabled && 'cursor-default',
            )}
          >
            <SlashCursor
              className={cn(
                'absolute top-[0.35em] left-0 h-[clamp(2rem,4.2vw,3.6rem)] w-auto transition-[translate,opacity] duration-200 ease-out',
                selected ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0',
                selected && item.disabled && 'opacity-45',
              )}
            />
            <span
              className={cn(
                'block pl-[clamp(1.75rem,3vw,2.75rem)] transition-[translate,opacity,color] duration-200 ease-out',
                selected && 'translate-x-2',
                // Inactive items read as off-white, not grey; disabled ones fall back further.
                item.disabled
                  ? selected
                    ? 'text-paper/60'
                    : 'text-paper/35'
                  : selected
                    ? 'text-paper-bright'
                    : 'text-paper-muted',
              )}
            >
              <span className="block font-display text-[clamp(2.1rem,4.2vw,3.6rem)] leading-[0.92] font-black tracking-[-0.01em] uppercase [font-stretch:68%]">
                {item.label}
              </span>
              {item.sub && (
                <span
                  className={cn(
                    'mt-1 block max-w-[38ch] truncate text-[13px] font-semibold tabular-nums',
                    selected ? 'text-paper/85' : item.disabled ? 'text-paper/45' : 'text-paper/60',
                  )}
                >
                  {item.sub}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
