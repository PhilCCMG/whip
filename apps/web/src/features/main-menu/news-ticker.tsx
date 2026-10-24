import { cn } from '@whip/ui';
import { useEffect, useState } from 'react';
import { useReducedMotion } from '../../stores/settings-store';
import { HEADLINES } from './copy';

/** A running division count that drifts while the lobbies fill. Flavour only. */
function DivisionCount() {
  const reduced = useReducedMotion();
  const [count, setCount] = useState({ ayes: 312, noes: 287 });
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setCount((c) => {
        // Settle around a narrow government win, never running away.
        const ayes = c.ayes + (Math.random() < 0.5 ? 1 : 0) - (c.ayes > 330 ? 6 : 0);
        const noes = c.noes + (Math.random() < 0.45 ? 1 : 0) - (c.noes > 305 ? 6 : 0);
        return { ayes, noes };
      });
    }, 1800);
    return () => clearInterval(t);
  }, [reduced]);
  return (
    <div className="flex h-full shrink-0 items-stretch font-display font-black uppercase [font-stretch:75%]">
      <span className="flex items-center bg-whip px-3 text-[13px] tracking-[0.04em] text-white">
        Division
      </span>
      <span className="flex items-center gap-1.5 bg-ink px-3 text-[13px] text-paper-bright tabular-nums">
        Ayes <span className="w-[3ch] text-right">{count.ayes}</span>
        <span className="mx-1 h-3 w-px bg-paper/40" />
        Noes <span className="w-[3ch] text-right">{count.noes}</span>
      </span>
    </div>
  );
}

/** Bottom crawl: division count on the left, fictional wire headlines running right to left. */
export function NewsTicker({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const run = (copy: number) => (
    <span className="flex shrink-0 items-center" aria-hidden={copy > 0 || undefined}>
      {HEADLINES.map((h) => (
        <span key={h} className="flex items-center whitespace-nowrap">
          <span className="px-5">{h}</span>
          <span className="h-2 w-2 bg-whip" />
        </span>
      ))}
    </span>
  );
  return (
    <div
      aria-hidden="true"
      className={cn('flex h-8 items-stretch overflow-hidden bg-paper text-ink', className)}
    >
      <DivisionCount />
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'flex h-full w-max items-center font-display text-[13px] font-extrabold uppercase [font-stretch:80%]',
            !reduced && 'animate-[whip-crawl_90s_linear_infinite]',
          )}
        >
          {run(0)}
          {run(1)}
        </div>
      </div>
    </div>
  );
}
