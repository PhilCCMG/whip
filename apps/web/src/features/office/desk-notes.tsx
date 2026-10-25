import { cn, Kicker } from '@whip/ui';
import { Link } from 'react-router';
import type { CareerOverview, Notification } from '../../api/types';
import { PoliticianLink } from '../../components/politician-bits';
import { DeskHeading } from '../../game-ui/game-screen';
import { campaignPath } from '../../lib/params';

const severityMark: Record<Notification['severity'], string> = {
  info: 'bg-paper/50',
  good: 'bg-good',
  warning: 'bg-lamp',
  critical: 'bg-whip',
};
const severityText: Record<Notification['severity'], string> = {
  info: 'Note',
  good: 'Good news',
  warning: 'Warning',
  critical: 'Urgent',
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
      return null;
  }
}

/** What the player has heard: torn-off notes pinned to the desk. */
export function Whispers({ overview }: { overview: CareerOverview }) {
  const id = overview.campaign.id;
  return (
    <section aria-labelledby="whispers-title">
      <DeskHeading
        id="whispers-title"
        title="Whispers"
        meta="Overheard in corridors. Strictly unattributable."
      />
      {overview.intelligence.length === 0 ? (
        <p className="mt-3 text-[13px] text-paper/75">
          Nobody tells you anything yet. Meet colleagues to hear how they’ll vote.
        </p>
      ) : (
        <ol className="mt-4 grid gap-2">
          {overview.intelligence.map((item, i) => (
            <li
              key={`${item.turn}-${i}`}
              className={cn(
                'relative bg-paper-deep px-3 pt-2.5 pb-2 text-ink',
                i % 3 === 1 && 'md:ml-3',
                i % 3 === 2 && 'md:mr-3',
              )}
            >
              {/* The pin. */}
              <span aria-hidden="true" className="absolute -top-1 left-4 size-2.5 bg-whip" />
              <Kicker className="text-ink/65">Week {item.turn}</Kicker>
              <p className="mt-1 text-[13px] leading-snug">
                {item.text}
                {item.politicianId && (
                  <>
                    {' '}
                    <PoliticianLink
                      campaignId={id}
                      id={item.politicianId}
                      name="Profile"
                      className="text-[12px]"
                    />
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Notifications as an inbox of dispatches: a coloured mark for urgency, title, one line. */
export function Inbox({ overview }: { overview: CareerOverview }) {
  const { notifications } = overview;
  const id = overview.campaign.id;
  return (
    <section aria-labelledby="inbox-title">
      <DeskHeading
        id="inbox-title"
        title="Inbox"
        meta={
          notifications.length === 0
            ? 'Your inbox is empty. Enjoy it while it lasts.'
            : `${notifications.length} this week`
        }
      />
      {notifications.length > 0 && (
        <ul className="mt-4 grid gap-px bg-paper/10">
          {notifications.map((n) => {
            const href = notificationHref(id, n);
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={cn('mt-1 size-2.5 shrink-0', severityMark[n.severity])}
                />
                <span className="min-w-0">
                  <span className="sr-only">{severityText[n.severity]}: </span>
                  <span className="block text-[13px] leading-snug font-bold text-paper-bright">
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-paper/75">
                    {n.body}
                  </span>
                </span>
              </>
            );
            return (
              <li key={n.id} className="bg-desk">
                {href ? (
                  <Link
                    to={href}
                    className="flex gap-3 px-3 py-2.5 hover:bg-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-whip"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3 px-3 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
