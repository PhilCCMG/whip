import { cn, Stamp } from '@whip/ui';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { DivisionResult } from '../../api/types';
import { DispatchFrame } from '../../game-ui/dispatch-frame';
import { DivisionTally } from '../../game-ui/division-tally';
import { verdictStamp } from '../../game-ui/stamps';
import { formatSimDate } from '../../lib/format';
import { uiSound } from '../audio/use-ui-sound';

const voteWord = { aye: 'Aye', no: 'No', abstain: 'Abstained' } as const;

/**
 * DIVISION LISTS: past divisions as the Journal records them, one line each. Arrow keys move
 * down the list; Enter opens the full tellers' report.
 */
export function DivisionList({
  divisions,
  campaignId,
}: {
  divisions: DivisionResult[];
  campaignId: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const open = divisions.find((d) => d.id === openId) ?? null;

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const jump = e.key === 'Home' ? 0 : e.key === 'End' ? divisions.length - 1 : null;
    if (!delta && jump === null) return;
    e.preventDefault();
    const next = jump ?? Math.min(divisions.length - 1, Math.max(0, cursor + delta));
    setCursor(next);
    refs.current[next]?.focus();
    uiSound.click();
  };

  if (divisions.length === 0) {
    return (
      <p className="bg-ink px-4 py-5 text-[13px] text-paper/75">
        No divisions yet this session. The House has so far agreed with itself.
      </p>
    );
  }

  return (
    <>
      <ul aria-label="Recent divisions" onKeyDown={onKey} className="grid gap-[2px]">
        {divisions.map((d, i) => {
          const total = Math.max(1, d.ayes + d.noes + d.abstentions);
          const mark = verdictStamp(d);
          return (
            <li key={d.id}>
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                tabIndex={i === cursor ? 0 : -1}
                onFocus={() => setCursor(i)}
                onClick={() => setOpenId(d.id)}
                aria-haspopup="dialog"
                className="group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 bg-ink px-4 py-3 text-left outline-none hover:bg-moss-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-paper-bright md:grid-cols-[6.5rem_minmax(0,1fr)_minmax(10rem,16rem)_auto]"
              >
                <span className="text-[11px] font-bold tracking-[0.08em] text-paper/70 uppercase tabular-nums max-md:col-span-2">
                  {formatSimDate(d.heldOn)}
                </span>
                <span className="grid min-w-0 gap-1">
                  <span className="truncate font-display text-[1.25rem] leading-none font-black text-paper-bright uppercase [font-stretch:70%]">
                    {d.billTitle}
                  </span>
                  <span className="text-[12px] text-paper/75">
                    {d.stage}
                    {d.playerVote && <> · you voted {voteWord[d.playerVote]}</>}
                    {d.rebels.length > 0 && (
                      <>
                        {' '}
                        · {d.rebels.length} {d.rebels.length === 1 ? 'rebel' : 'rebels'}
                      </>
                    )}
                  </span>
                </span>
                <span className="grid gap-1.5 max-md:col-span-2 max-md:row-start-3">
                  <span className="flex justify-between font-display text-[1.35rem] leading-none font-black text-paper-bright tabular-nums [font-stretch:70%]">
                    <span>
                      <span className="sr-only">Ayes </span>
                      {d.ayes}
                    </span>
                    <span>
                      <span className="sr-only">Noes </span>
                      {d.noes}
                    </span>
                  </span>
                  <span aria-hidden="true" className="flex h-1.5 gap-px">
                    <span className="bg-aye" style={{ flexGrow: d.ayes / total }} />
                    <span className="bg-abstain" style={{ flexGrow: d.abstentions / total }} />
                    <span className="bg-no" style={{ flexGrow: d.noes / total }} />
                  </span>
                </span>
                <span className="flex items-center gap-3 max-md:col-start-2 max-md:row-start-2">
                  <Stamp
                    tone={mark.tone}
                    {...(mark.image ? { image: mark.image } : {})}
                    size="sm"
                    angle={i % 2 ? 3 : -4}
                    className={cn(!mark.image && !d.governmentWon && 'bg-ink')}
                  >
                    {mark.text}
                  </Stamp>
                  <span
                    aria-hidden="true"
                    className="text-[10px] font-bold tracking-[0.08em] text-paper/60 uppercase max-lg:hidden"
                  >
                    Open ↵
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <DispatchFrame
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        size="lg"
        title="The tellers’ report"
        kicker={open ? `Division lists · ${formatSimDate(open.heldOn)}` : undefined}
      >
        {open && (
          <div className="px-3 pb-4 md:px-5 md:pb-6">
            <DivisionTally division={open} campaignId={campaignId} />
          </div>
        )}
      </DispatchFrame>
    </>
  );
}
