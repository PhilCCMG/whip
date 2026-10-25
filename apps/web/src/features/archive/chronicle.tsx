import { cn, Kicker, Plate, Slash, Stamp } from '@whip/ui';
import {
  BadgeCheck,
  Crown,
  DoorOpen,
  Flag,
  Flame,
  Footprints,
  Handshake,
  Landmark,
  Megaphone,
  Newspaper,
  Scale,
  UserMinus,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import type { HistoryItem, HistoryType } from '../../api/types';
import { formatShortDate, formatSimDate, plural } from '../../lib/format';
import { weekStart } from './model';

type Tone = 'ink' | 'good' | 'bad' | 'warning';

const TYPE_META: Record<
  HistoryType,
  { label: string; stamp: string; tone: Tone; Icon: LucideIcon }
> = {
  division: { label: 'Division', stamp: 'Division', tone: 'ink', Icon: Vote },
  appointment: { label: 'Appointment', stamp: 'Appointed', tone: 'good', Icon: BadgeCheck },
  resignation: { label: 'Resignation', stamp: 'Resigned', tone: 'bad', Icon: DoorOpen },
  dismissal: { label: 'Dismissal', stamp: 'Sacked', tone: 'bad', Icon: UserMinus },
  election: { label: 'Election', stamp: 'Elected', tone: 'ink', Icon: Landmark },
  leadership_contest: { label: 'Leadership', stamp: 'Leadership', tone: 'warning', Icon: Crown },
  scandal: { label: 'Scandal', stamp: 'Scandal', tone: 'bad', Icon: Flame },
  policy_announcement: { label: 'Policy', stamp: 'Policy', tone: 'ink', Icon: Megaphone },
  negotiation: { label: 'Talks', stamp: 'Talks', tone: 'ink', Icon: Handshake },
  relationship_change: { label: 'Relations', stamp: 'Relations', tone: 'ink', Icon: Users },
  action_outcome: { label: 'Action', stamp: 'Action', tone: 'ink', Icon: Footprints },
  event: { label: 'Event', stamp: 'Event', tone: 'warning', Icon: Newspaper },
  promise: { label: 'Promise', stamp: 'Promise', tone: 'warning', Icon: Scale },
  campaign: { label: 'Campaign', stamp: 'Campaign', tone: 'ink', Icon: Flag },
};

const involves = (item: HistoryItem, playerId: string | undefined) =>
  !!playerId && (item.actorIds.includes(playerId) || item.subjectIds.includes(playerId));

/** A front-page cutting: big headline, stamp, standfirst. Importance 4–5. */
function Clipping({ item, mine }: { item: HistoryItem; mine: boolean }) {
  const meta = TYPE_META[item.type];
  return (
    <li className="relative border-t-4 border-ink bg-paper-bright px-4 pt-3 pb-4 outline-1 -outline-offset-1 outline-ink/15">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col-reverse">
          <h3
            className={cn(
              'mt-1.5 font-display font-black uppercase [font-stretch:70%]',
              item.importance >= 5 ? 'text-[clamp(1.6rem,3vw,2.2rem)]' : 'text-[1.5rem]',
              'leading-[0.92]',
            )}
          >
            {item.title}
          </h3>
          <Kicker className="flex items-center gap-1.5 text-ink/65">
            {mine && <Slash className="h-3 w-auto" />}
            {mine && <span className="text-whip">Your career ·</span>}
            <span>{formatShortDate(item.simDate)}</span>
            <span aria-hidden="true">·</span>
            <span>{item.importance >= 5 ? 'Front page' : 'Major'}</span>
          </Kicker>
        </div>
        <Stamp size="sm" tone={meta.tone} angle={item.seq % 2 ? -5 : 4} className="mt-1 shrink-0">
          {meta.stamp}
        </Stamp>
      </div>
      <p className="mt-2 max-w-[68ch] text-[14px] leading-[1.55] text-ink/85">{item.summary}</p>
    </li>
  );
}

/** A ledger line: date, type mark, title and summary. Importance 1–3. */
function LedgerLine({ item, mine }: { item: HistoryItem; mine: boolean }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.Icon;
  return (
    <li className="grid grid-cols-[3.25rem_1.5rem_minmax(0,1fr)] items-start gap-x-2.5 border-b border-ink/12 py-2.5 sm:grid-cols-[3.75rem_1.5rem_minmax(0,1fr)_auto]">
      <span className="pt-0.5 text-[11px] font-bold tracking-[0.04em] text-ink/65 uppercase tabular-nums">
        {formatShortDate(item.simDate)}
      </span>
      <span
        className={cn(
          'grid size-6 place-items-center',
          meta.tone === 'bad'
            ? 'bg-whip text-white'
            : meta.tone === 'good'
              ? 'bg-good-strong text-paper-bright'
              : 'bg-ink text-paper-bright',
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{meta.label}</span>
      </span>
      <div className="min-w-0">
        <h3
          className={cn(
            item.importance >= 3 ? 'text-[15px] font-bold' : 'text-[14px] font-semibold',
            'leading-snug',
          )}
        >
          {mine && (
            <span className="mr-1.5 inline-flex items-center gap-1 align-[1px] text-[10px] font-bold tracking-[0.08em] text-whip uppercase">
              <Slash className="h-2.5 w-auto" />
              You
            </span>
          )}
          {item.title}
        </h3>
        <p className="mt-0.5 max-w-[72ch] text-[13px] leading-snug text-ink/75">{item.summary}</p>
      </div>
      <span className="pt-0.5 text-[10px] font-bold tracking-[0.08em] text-ink/55 uppercase max-sm:hidden">
        {meta.label}
      </span>
    </li>
  );
}

/** One week of the record: a week plate, then cuttings and ledger lines on a sheet. */
export function WeekPage({
  turn,
  items,
  playerId,
}: {
  turn: number;
  items: HistoryItem[];
  playerId: string | undefined;
}) {
  const major = items.filter((i) => i.importance >= 4);
  const minor = items.filter((i) => i.importance < 4);
  const headingId = `week-${turn}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-3 animate-deal">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <Plate tone="paper" edge="right" className="py-1.5 pl-3">
          <h2
            id={headingId}
            className="font-display text-[1.9rem] leading-[0.9] font-black uppercase [font-stretch:70%]"
          >
            Week {String(turn).padStart(2, '0')}
          </h2>
        </Plate>
        <p className="pb-1 text-[12px] font-semibold text-paper/75 tabular-nums">
          w/c {formatSimDate(weekStart(items))} · {plural(items.length, 'entry', 'entries')}
        </p>
        <span aria-hidden="true" className="mb-2 h-px min-w-8 flex-1 bg-paper/20" />
      </header>
      <div className="grid gap-3 bg-paper p-3 text-ink md:p-4">
        {major.length > 0 && (
          <ol
            aria-label={`Week ${turn}: major stories`}
            className={cn('grid gap-2.5', major.length > 1 && 'lg:grid-cols-2')}
          >
            {major.map((item) => (
              <Clipping key={item.seq} item={item} mine={involves(item, playerId)} />
            ))}
          </ol>
        )}
        {minor.length > 0 && (
          <ol aria-label={`Week ${turn}: the record`} className="grid">
            {minor.map((item) => (
              <LedgerLine key={item.seq} item={item} mine={involves(item, playerId)} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
