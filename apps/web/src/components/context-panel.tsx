import { cn, SectionLabel } from '@whip/ui';
import { Link } from 'react-router';
import type { CareerOverview, Notification } from '../api/types';
import { formatShortDate, weekdayName } from '../lib/format';
import { campaignPath } from '../lib/params';
import { PoliticianLink } from './politician-bits';

const severityBar: Record<Notification['severity'], string> = {
  info: 'bg-moss-400',
  good: 'bg-good',
  warning: 'bg-warning',
  critical: 'bg-whip',
};

function notificationHref(campaignId: string, n: Notification): string | null {
  if (!n.link) return null;
  switch (n.link.kind) {
    case 'politician':
      return campaignPath(campaignId, `politicians/${encodeURIComponent(n.link.id)}`);
    case 'bill':
    case 'division':
      return campaignPath(campaignId, 'parliament');
    case 'history':
      return campaignPath(campaignId, 'history');
    case 'event':
      return campaignPath(campaignId);
  }
}

export function Inbox({ overview }: { overview: CareerOverview }) {
  const { notifications } = overview;
  const id = overview.campaign.id;
  return (
    <section aria-labelledby="ctx-inbox">
      <SectionLabel id="ctx-inbox" number="B" className="mb-2">
        Inbox
        <span className="ml-1.5 font-sans text-xs font-semibold opacity-60">
          {notifications.length}
        </span>
      </SectionLabel>
      {notifications.length === 0 ? (
        <p className="text-sm opacity-60">Nothing new. Quiet weeks don’t last.</p>
      ) : (
        <ul className="grid gap-px">
          {notifications.map((n) => {
            const href = notificationHref(id, n);
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={cn('w-[3px] shrink-0', severityBar[n.severity])}
                />
                <span className="min-w-0 py-2 pr-2">
                  <span className="block text-[13px] leading-snug font-semibold">{n.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug opacity-70">{n.body}</span>
                </span>
              </>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link
                    to={href}
                    className="flex gap-2.5 bg-white/[0.03] hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-2.5 bg-white/[0.03]">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Intelligence({ overview }: { overview: CareerOverview }) {
  const id = overview.campaign.id;
  return (
    <section aria-labelledby="ctx-intel">
      <SectionLabel id="ctx-intel" number="C" className="mb-2">
        Political intelligence
      </SectionLabel>
      {overview.intelligence.length === 0 ? (
        <p className="text-sm opacity-60">
          You haven’t heard anything yet. Meet colleagues to learn how they’ll vote.
        </p>
      ) : (
        <ol className="grid gap-2.5">
          {overview.intelligence.map((item, i) => (
            <li
              key={`${item.turn}-${i}`}
              className="grid grid-cols-[2.25rem_1fr] gap-2 text-[13px]"
            >
              <span className="pt-px text-[11px] font-semibold opacity-55 tabular">
                Wk {item.turn}
              </span>
              <span className="leading-snug">
                {item.text}
                {item.politicianId && (
                  <>
                    {' '}
                    <PoliticianLink
                      campaignId={id}
                      id={item.politicianId}
                      name="Profile"
                      className="text-xs font-semibold text-paper/80"
                    />
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const kindMark: Record<CareerOverview['upcoming'][number]['kind'], string> = {
  division: 'bg-whip',
  reading: 'bg-paper',
  event: 'bg-warning',
  other: 'bg-moss-400',
};

export function Upcoming({ overview }: { overview: CareerOverview }) {
  return (
    <section aria-labelledby="ctx-upcoming">
      <SectionLabel id="ctx-upcoming" number="A" className="mb-2">
        Coming up
      </SectionLabel>
      {overview.upcoming.length === 0 ? (
        <p className="text-sm opacity-60">Nothing scheduled.</p>
      ) : (
        <ol className="grid">
          {overview.upcoming.map((u, i) => (
            <li
              key={`${u.date}-${i}`}
              className="grid grid-cols-[3.5rem_1fr] items-baseline gap-2 border-b border-white/10 py-1.5 text-[13px]"
            >
              <span className="text-[11px] leading-tight font-semibold tabular opacity-70">
                {weekdayName(u.date)}
                <br />
                {formatShortDate(u.date)}
              </span>
              <span className="flex items-baseline gap-2 leading-snug">
                <span aria-hidden="true" className={cn('size-2 shrink-0', kindMark[u.kind])} />
                {u.label}
                {u.kind === 'division' && <span className="sr-only">(division)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ContextPanelContent({ overview }: { overview: CareerOverview }) {
  return (
    <div className="grid gap-7 px-4 py-4">
      <Upcoming overview={overview} />
      <Inbox overview={overview} />
      <Intelligence overview={overview} />
    </div>
  );
}
