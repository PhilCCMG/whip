import { cn } from '@whip/ui';
import { Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useDeleteCampaign } from '../../../api/hooks';
import type { CampaignSummary } from '../../../api/types';
import { ErrorState, Loading } from '../../../components/states';
import { formatSimDate, formatTimestamp } from '../../../lib/format';
import { campaignPath } from '../../../lib/params';
import { toast } from '../../../stores/toast-store';
import { uiSound } from '../../audio/use-ui-sound';
import { DOWN_KEYS, UP_KEYS, useBackKey } from '../keys';
import { SlashCursor } from '../menu-list';
import { ScreenHeader } from '../screen-kit';
import { primaryButton } from '../styles';

export function LoadCareerScreen({
  campaigns,
  isPending,
  error,
  onRetry,
  onBack,
  onNewCareer,
}: {
  campaigns: CampaignSummary[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  onBack: () => void;
  onNewCareer: () => void;
}) {
  const titleId = useId();
  const navigate = useNavigate();
  const del = useDeleteCampaign();
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const keepRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const safeIndex = Math.min(index, Math.max(0, campaigns.length - 1));

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (confirming) return;
    const active = document.activeElement;
    if (listRef.current?.contains(active) || active === document.body || active === null) {
      rowRefs.current[safeIndex]?.focus({ preventScroll: false });
    }
  }, [safeIndex, confirming, campaigns.length]);

  useBackKey(() => {
    if (del.isPending) return false;
    if (confirming) setConfirming(null);
    else onBack();
    return true;
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (confirming || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = campaigns.length;
    if (n === 0) return;
    if (UP_KEYS.has(e.key)) {
      e.preventDefault();
      moveTo((safeIndex - 1 + n) % n);
    } else if (DOWN_KEYS.has(e.key)) {
      e.preventDefault();
      moveTo((safeIndex + 1) % n);
    } else if (e.key === 'Delete' || e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      const c = campaigns[safeIndex];
      if (c) {
        setConfirming(c.id);
        uiSound.click();
      }
    }
  };

  /** Cursor move by keys or hover: ticks only when the selection changes. */
  const moveTo = (i: number) => {
    if (i === safeIndex) return;
    setIndex(i);
    uiSound.click();
  };

  const load = (c: CampaignSummary) => {
    uiSound.whoosh();
    void navigate(campaignPath(c.id));
  };

  const doDelete = (c: CampaignSummary) => {
    del.mutate(c.id, {
      onSuccess: () => {
        toast({ title: 'Career deleted', description: c.name });
        setConfirming(null);
      },
    });
  };

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-0 w-full max-w-[52rem] flex-1 flex-col"
    >
      <ScreenHeader id={titleId} title="Load career" onBack={onBack}>
        <p className="mt-3 text-[15px] text-paper/80">
          {campaigns.length > 0
            ? `${campaigns.length} saved ${campaigns.length === 1 ? 'career' : 'careers'}, most recent first.`
            : 'Your saved careers appear here.'}
        </p>
      </ScreenHeader>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
        {isPending ? (
          <Loading label="Loading careers" className="px-0 text-paper" />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} className="text-paper" />
        ) : campaigns.length === 0 ? (
          <div className="grid justify-items-start gap-4 py-4">
            <p className="text-[15px] text-paper/80">
              No saved careers. Start one and it will be saved here every week.
            </p>
            <button type="button" className={primaryButton} onClick={onNewCareer} autoFocus>
              New career
            </button>
          </div>
        ) : (
          <ul
            ref={listRef}
            aria-label="Saved careers"
            onKeyDown={onKeyDown}
            className="grid grid-cols-[minmax(0,1fr)] gap-1.5"
          >
            {campaigns.map((c, i) => {
              const selected = i === safeIndex;
              const isConfirming = confirming === c.id;
              if (isConfirming) {
                return (
                  <li
                    key={c.id}
                    role="alertdialog"
                    aria-label={`Delete ${c.name}?`}
                    className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-whip px-5 py-4 text-white"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-2xl leading-none font-black uppercase [font-stretch:70%]">
                        Delete “{c.name}”?
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-white/90">
                        {c.playerName}’s career ends here. This can’t be undone.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        ref={keepRef}
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={del.isPending}
                        className="h-11 min-w-24 cursor-pointer border-2 border-white px-4 font-bold uppercase hover:bg-white hover:text-whip focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => doDelete(c)}
                        disabled={del.isPending}
                        className="h-11 min-w-24 cursor-pointer bg-ink px-4 font-bold text-paper-bright uppercase hover:bg-moss-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait"
                      >
                        {del.isPending ? 'Deleting…' : 'Delete career'}
                      </button>
                    </div>
                  </li>
                );
              }
              return (
                <li
                  key={c.id}
                  className={cn(
                    'group relative flex items-stretch transition-colors duration-150',
                    selected
                      ? 'bg-paper-bright text-ink'
                      : 'bg-white/[0.04] text-paper hover:bg-white/[0.08]',
                  )}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') moveTo(i);
                  }}
                >
                  <button
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    type="button"
                    tabIndex={selected ? 0 : -1}
                    aria-current={selected ? 'true' : undefined}
                    onFocus={() => setIndex(i)}
                    onClick={() => load(c)}
                    data-sfx="off"
                    aria-label={`Load ${c.name}: ${c.playerName}, week ${c.turn}`}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 px-4 py-3.5 text-left outline-none focus-visible:outline-none"
                  >
                    <SlashCursor className={cn('h-12 w-auto shrink-0', !selected && 'opacity-0')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[clamp(1.6rem,2.6vw,2.2rem)] leading-none font-black uppercase [font-stretch:70%]">
                        {c.name}
                      </span>
                      <span
                        className={cn(
                          'mt-1 block truncate text-[13px] font-semibold',
                          selected ? 'text-ink/75' : 'text-paper/75',
                        )}
                      >
                        {c.playerName}
                        <span className="sm:hidden"> · Week {c.turn}</span>
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block font-display text-2xl leading-none font-black uppercase tabular-nums [font-stretch:75%]">
                        Week {c.turn}
                      </span>
                      <span
                        className={cn(
                          'mt-1 block text-[13px] font-semibold tabular-nums',
                          selected ? 'text-ink/75' : 'text-paper/75',
                        )}
                      >
                        {formatSimDate(c.simDate)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'hidden w-28 shrink-0 text-right text-[12px] font-semibold md:block',
                        selected ? 'text-ink/70' : 'text-paper/65',
                      )}
                    >
                      Last played
                      <span className="block tabular-nums">{formatTimestamp(c.updatedAt)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => {
                      setIndex(i);
                      setConfirming(c.id);
                    }}
                    aria-label={`Delete ${c.name}`}
                    className={cn(
                      'grid w-14 shrink-0 cursor-pointer place-items-center transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-whip',
                      selected
                        ? 'text-ink/70 hover:bg-whip hover:text-white'
                        : 'text-paper/40 hover:text-paper',
                    )}
                  >
                    <Trash2 aria-hidden="true" className="size-5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
