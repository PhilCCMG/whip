import { cn, Kicker, Slash } from '@whip/ui';
import { Search } from 'lucide-react';
import { forwardRef, useId, type ReactNode } from 'react';

/**
 * Game controls on the desk: a labelled row of flat toggle buttons. The active one is a paper
 * tab with the red slash; the rest are ink with a thin rule. Buttons tick via the shell's
 * delegated click sound.
 */
export function ToggleRow<T extends string | number | undefined>({
  label,
  options,
  value,
  onChange,
  className,
  hideLabel = false,
}: {
  label: string;
  options: readonly {
    value: T;
    label: ReactNode;
    swatch?: string | null | undefined;
    title?: string;
  }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <Kicker id={id} className={cn('mb-1.5 text-paper/70', hideLabel && 'sr-only')}>
        {label}
      </Kicker>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value ?? 'all')}
              type="button"
              aria-pressed={active}
              title={o.title}
              onClick={() => !active && onChange(o.value)}
              className={cn(
                'inline-flex h-8 cursor-pointer items-center gap-1.5 px-2.5 text-[12px] leading-none font-bold tracking-[0.06em] uppercase',
                'focus-visible:outline-2 focus-visible:-outline-offset-2',
                active
                  ? 'bg-paper-bright text-ink focus-visible:outline-whip'
                  : 'bg-ink text-paper/80 outline-1 -outline-offset-1 outline-paper/15 hover:bg-moss-900 hover:text-paper-bright focus-visible:outline-paper-bright',
              )}
            >
              {active && <Slash className="-ml-0.5 h-3.5 w-auto" />}
              {o.swatch !== undefined && (
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0"
                  style={{ backgroundColor: o.swatch ?? 'var(--color-moss-400)' }}
                />
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Search on the desk: an ink field with a hard edge and a keycap hint. */
export const DeskSearch = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    label: string;
    placeholder?: string;
    hotkey?: string;
    className?: string;
  }
>(function DeskSearch({ value, onChange, label, placeholder, hotkey, className }, ref) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <Kicker className="mb-1.5 text-paper/70">
        <label htmlFor={id}>{label}</label>
      </Kicker>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-paper/60"
        />
        <input
          ref={ref}
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="h-8 w-full bg-paper-bright pr-9 pl-8 text-[13px] text-ink placeholder:text-ink/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-whip [&::-webkit-search-cancel-button]:hidden"
        />
        {hotkey && !value && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-1.5 grid h-5 min-w-5 -translate-y-1/2 place-items-center border border-ink/40 px-1 text-[11px] leading-none font-bold text-ink/70"
          >
            {hotkey}
          </kbd>
        )}
      </div>
    </div>
  );
});

/** "MORE MEMBERS" / "OLDER PAPERS": a full-width flat bar at the foot of a list. */
export function MoreBar({
  onClick,
  busy,
  label,
  busyLabel,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="group flex h-11 w-full cursor-pointer items-center justify-center gap-2 bg-ink font-display text-[1.05rem] leading-none font-black tracking-[0.04em] text-paper-bright uppercase outline-1 -outline-offset-1 outline-paper/20 [font-stretch:72%] hover:bg-moss-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-paper-bright disabled:cursor-wait disabled:opacity-70"
    >
      <Slash className="h-4 w-auto" />
      {busy ? busyLabel : label}
    </button>
  );
}
