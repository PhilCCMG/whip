import { Badge, cn, Tooltip, TooltipContent, TooltipTrigger } from '@whip/ui';
import { Link } from 'react-router';
import type { KnownVote, RelationshipSummary } from '../api/types';
import { signed } from '../lib/format';
import { campaignPath } from '../lib/params';

const voteTone = {
  aye: 'good',
  no: 'critical',
  abstain: 'warning',
  unknown: 'neutral',
} as const;

const voteText = { aye: 'Aye', no: 'No', abstain: 'Abstain', unknown: 'Unknown' } as const;

export function KnownVoteBadge({
  vote,
  className,
}: {
  vote: KnownVote | null;
  className?: string;
}) {
  if (!vote) return <span className="text-xs opacity-50">—</span>;
  return (
    <Badge tone={voteTone[vote]} className={className}>
      {voteText[vote]}
    </Badge>
  );
}

function chipTone(v: number) {
  if (v >= 20) return 'text-good-strong bg-good/15';
  if (v <= -20) return 'text-whip bg-whip/12';
  return 'bg-current/8';
}

/** Compact chips for how a politician regards the player. */
export function RelationshipChips({
  rel,
  className,
}: {
  rel: RelationshipSummary | null;
  className?: string;
}) {
  if (!rel) return <span className="text-xs opacity-50">Not acquainted</span>;
  const items = [
    ['Trust', rel.trust],
    ['Affinity', rel.affinity],
    ['Respect', rel.respect],
  ] as const;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {items.map(([label, v]) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-[3px] text-[11px] leading-none font-semibold tabular',
                chipTone(v),
              )}
            >
              <span className="opacity-70">{label[0]}</span>
              {signed(Math.round(v))}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {label} towards you: {signed(Math.round(v))}
          </TooltipContent>
        </Tooltip>
      ))}
      {rel.rivalry > 0 && (
        <Badge tone="critical" title={`Rivalry level ${rel.rivalry} of 3`}>
          Rival {rel.rivalry}
        </Badge>
      )}
    </span>
  );
}

export function PoliticianLink({
  campaignId,
  id,
  name,
  className,
}: {
  campaignId: string;
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      to={campaignPath(campaignId, `politicians/${encodeURIComponent(id)}`)}
      className={cn(
        'font-semibold underline decoration-current/25 underline-offset-2 hover:decoration-whip focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
    >
      {name}
    </Link>
  );
}
