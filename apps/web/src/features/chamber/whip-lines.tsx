import { cn } from '@whip/ui';
import type { Bill } from '../../api/types';
import { VOTE_WORD, WHIP_LINE_GLOSS, whipLines } from './model';

type Whip = Bill['whipping'][number];

/**
 * A party's whip as the whips' own letter prints it: the instruction underlined once, twice or
 * three times. A free vote has no line at all.
 */
export function WhipMark({
  whip,
  colour,
  tone = 'paper',
  className,
}: {
  whip: Whip;
  colour?: string | undefined;
  tone?: 'paper' | 'ink';
  className?: string;
}) {
  const lines = whipLines(whip.instruction);
  const word = whip.direction ? VOTE_WORD[whip.direction] : lines === 0 ? 'Free' : 'Whipped';
  const sr = `${whip.shortName}: ${whip.instruction}${whip.direction ? `, ${VOTE_WORD[whip.direction].toLowerCase()}` : ''}`;
  return (
    <span
      className={cn('inline-flex items-start gap-1.5', className)}
      title={`${whip.instruction}. ${WHIP_LINE_GLOSS[lines]}`}
      data-whip-lines={lines}
    >
      <span className="sr-only">{sr}</span>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {colour && <span className="h-3 w-1.5 shrink-0" style={{ background: colour }} />}
        <span className="text-[11px] font-bold tracking-[0.06em] opacity-75">{whip.shortName}</span>
      </span>
      <span aria-hidden="true" className="inline-grid justify-items-stretch">
        <span
          className={cn(
            'font-display text-[14px] leading-none font-black uppercase [font-stretch:75%]',
            lines === 0 && 'opacity-60',
          )}
        >
          {word}
        </span>
        <span className="mt-[3px] grid gap-[2px]">
          {Array.from({ length: lines }, (_, i) => (
            <span
              key={i}
              data-whip-line
              className={cn('h-[2px]', tone === 'paper' ? 'bg-ink' : 'bg-paper-bright')}
            />
          ))}
        </span>
      </span>
    </span>
  );
}
