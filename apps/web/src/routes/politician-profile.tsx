import {
  Badge,
  Button,
  cn,
  Panel,
  PanelBody,
  PanelHeader,
  PartyChip,
  StatMeter,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  bandColour,
} from '@whip/ui';
import { ArrowLeft, Handshake, MessageSquare } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useCampaignState, usePolitician } from '../api/hooks';
import type { PoliticianProfile, RelationshipSummary } from '../api/types';
import { KnownVoteBadge, PoliticianLink } from '../components/politician-bits';
import { ErrorState, Loading } from '../components/states';
import { formatShortDate, REPUTATION_LABELS, sequence, signed, SKILL_LABELS } from '../lib/format';
import { campaignPath, useCampaignId } from '../lib/params';
import { useUiStore } from '../stores/ui-store';

function IdeologyPlot({
  them,
  you,
  name,
}: {
  them: { economic: number; social: number };
  you: { economic: number; social: number } | null;
  name: string;
}) {
  const x = (v: number) => 50 + (v / 100) * 46;
  const y = (v: number) => 50 - (v / 100) * 46;
  return (
    <figure className="grid w-full max-w-[240px] gap-2">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Ideology: economic ${Math.round(them.economic)}, social ${Math.round(them.social)}${you ? `. You: economic ${Math.round(you.economic)}, social ${Math.round(you.social)}` : ''}`}
        className="aspect-square w-full max-w-[260px] text-ink"
      >
        <rect
          x={4}
          y={4}
          width={92}
          height={92}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={0.5}
        />
        <line
          x1={50}
          y1={4}
          x2={50}
          y2={96}
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={0.5}
        />
        <line
          x1={4}
          y1={50}
          x2={96}
          y2={50}
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={0.5}
        />
        <text x={6} y={53.5} fontSize={3.6} fill="currentColor" opacity={0.6} dy={3}>
          Left
        </text>
        <text
          x={94}
          y={53.5}
          fontSize={3.6}
          fill="currentColor"
          opacity={0.6}
          textAnchor="end"
          dy={3}
        >
          Right
        </text>
        <text x={52} y={8.5} fontSize={3.6} fill="currentColor" opacity={0.6}>
          Conservative
        </text>
        <text x={52} y={94} fontSize={3.6} fill="currentColor" opacity={0.6}>
          Liberal
        </text>
        {you && (
          <g>
            <line
              x1={x(you.economic)}
              y1={y(you.social)}
              x2={x(them.economic)}
              y2={y(them.social)}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={0.5}
              strokeDasharray="1 1"
            />
            <rect
              x={x(you.economic) - 2}
              y={y(you.social) - 2}
              width={4}
              height={4}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.9}
            />
          </g>
        )}
        <circle cx={x(them.economic)} cy={y(them.social)} r={2.8} fill="var(--color-whip)" />
      </svg>
      <figcaption className="flex gap-4 text-xs text-moss-600">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-whip" /> {name}
        </span>
        {you && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 border border-ink" /> You
          </span>
        )}
      </figcaption>
    </figure>
  );
}

const STANCE_LABEL: Record<number, string> = {
  [-2]: 'Strongly against',
  [-1]: 'Against',
  0: 'Neutral',
  1: 'For',
  2: 'Strongly for',
};

function StanceRow({ label, stance }: { label: string; stance: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-moss-200 py-1.5 text-sm">
      <span className="truncate">{label}</span>
      <span className="flex items-center gap-2">
        <span className="sr-only">{STANCE_LABEL[stance]}</span>
        <span aria-hidden="true" className="flex gap-px">
          {[-2, -1, 0, 1, 2].map((v) => (
            <span
              key={v}
              className={cn(
                'h-3 w-4',
                v === 0
                  ? stance === 0
                    ? 'bg-ink'
                    : 'bg-moss-200'
                  : (v < 0 && stance <= v) || (v > 0 && stance >= v)
                    ? v < 0
                      ? 'bg-whip'
                      : 'bg-good'
                    : 'bg-moss-100',
              )}
            />
          ))}
        </span>
      </span>
    </li>
  );
}

function SkillBar({ label, value }: { label: string; value: number }) {
  const colour = bandColour(value / 20);
  return (
    <li className="grid grid-cols-[7rem_1fr_1.75rem] items-center gap-2 text-sm">
      <span>{label}</span>
      <span className="flex h-3 gap-px" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className="flex-1"
            style={{ backgroundColor: i < value ? colour : 'var(--color-moss-100)' }}
          />
        ))}
      </span>
      <span
        className="text-right font-display text-lg leading-none font-black font-stretch-condensed tabular"
        style={{ color: colour }}
      >
        {value}
        <span className="sr-only"> of 20</span>
      </span>
    </li>
  );
}

function RelationshipBlock({ title, rel }: { title: string; rel: RelationshipSummary | null }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-moss-600">{title}</h3>
      {!rel ? (
        <p className="text-sm text-moss-600">You haven’t met properly yet.</p>
      ) : (
        <div className="grid gap-2">
          {(['trust', 'respect', 'affinity'] as const).map((k) => (
            <StatMeter
              key={k}
              label={k.charAt(0).toUpperCase() + k.slice(1)}
              value={rel[k]}
              min={-100}
              max={100}
              centred
              display={signed(Math.round(rel[k]))}
              colour={rel[k] < 0 ? 'var(--color-whip)' : 'var(--color-good)'}
            />
          ))}
          <p className="flex gap-3 text-xs">
            <span>
              Obligation <strong className="tabular">{signed(Math.round(rel.obligation))}</strong>
            </span>
            <span>
              Rivalry <strong className="tabular">{rel.rivalry}/3</strong>
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

const kindLabel = { ally: 'Ally', rival: 'Rival', patron: 'Patron', protege: 'Protégé' } as const;

function Profile({ p, campaignId }: { p: PoliticianProfile; campaignId: string }) {
  const openPlanner = useUiStore((s) => s.openPlanner);
  const state = useCampaignState(campaignId);
  const you = state.data?.player.ideology ?? null;
  const plan = (kind: 'meet_politician' | 'build_relationship') =>
    openPlanner({ kind, params: { targetId: p.id }, labels: { [p.id]: p.name } });
  const next = sequence();

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-4 lg:p-5">
      <Link
        to={campaignPath(campaignId, 'politicians')}
        className="inline-flex items-center gap-1 justify-self-start text-xs font-semibold text-moss-600 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" /> All members
      </Link>

      <header
        className="grid gap-4 bg-ink px-5 pt-4 pb-5 text-paper md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        style={{ borderTop: `6px solid ${p.partyColour ?? 'var(--color-moss-400)'}` }}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-paper/70">
            <PartyChip
              colour={p.partyColour}
              label={p.partyShort ?? 'Independent'}
              className="text-paper"
            />
            <span>{p.constituencyName ?? 'No seat'}</span>
            <span>Age {p.age}</span>
            {p.status !== 'sitting' && p.status !== 'active' && (
              <Badge tone="warning">{p.status}</Badge>
            )}
          </div>
          <h1 className="mt-2 font-display text-[clamp(2.4rem,6vw,4rem)] leading-[0.88] font-black font-stretch-condensed">
            {p.name}
          </h1>
          <p className="mt-2 text-sm text-paper/80">
            {p.offices.length > 0 ? p.offices.join(' · ') : 'Backbencher'}
            {p.factionName && <span className="text-paper/60"> · {p.factionName}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="text-right">
            <p className="text-[11px] text-paper/60">Influence</p>
            <p className="font-display text-4xl leading-none font-black font-stretch-condensed tabular">
              {Math.round(p.influence)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-paper/60">Next vote</p>
            <KnownVoteBadge vote={p.knownIntention} className="mt-1 text-xs" />
          </div>
          {!p.isPlayer && (
            <div className="flex gap-2">
              <Button variant="whip" size="sm" onClick={() => plan('meet_politician')}>
                <MessageSquare aria-hidden="true" /> Meet
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-paper"
                onClick={() => plan('build_relationship')}
              >
                <Handshake aria-hidden="true" /> Build relationship
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {!p.isPlayer && (
          <Panel aria-labelledby="rel-title" className="bg-paper">
            <PanelHeader number={next()} title="You and them" titleId="rel-title" />
            <PanelBody className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <RelationshipBlock title="How they see you" rel={p.relationship.towardsPlayer} />
                <RelationshipBlock title="How you see them" rel={p.relationship.fromPlayer} />
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold text-moss-600">What they remember</h3>
                {p.relationship.memories.length === 0 ? (
                  <p className="text-sm text-moss-600">Nothing yet.</p>
                ) : (
                  <ul className="grid gap-1">
                    {p.relationship.memories.map((m, i) => (
                      <li key={i} className="grid grid-cols-[2.75rem_1fr] text-sm">
                        <span className="text-xs text-moss-600 tabular">Wk {m.turn}</span>
                        {m.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </PanelBody>
          </Panel>
        )}

        <Panel aria-labelledby="skills-title" className="bg-paper">
          <PanelHeader number={next()} title="Skills" titleId="skills-title" />
          <PanelBody className="grid gap-4">
            <ul className="grid gap-1.5">
              {Object.entries(p.skills).map(([k, v]) => (
                <SkillBar key={k} label={SKILL_LABELS[k] ?? k} value={v} />
              ))}
            </ul>
            {p.ambition && (
              <div className="flex items-center justify-between border-t border-moss-200 pt-3 text-sm">
                <span>
                  <span className="text-xs text-moss-600">Ambition </span>
                  <strong>{p.ambition.label}</strong>
                </span>
                <span
                  className="flex gap-0.5"
                  aria-label={`Intensity ${p.ambition.intensity} of 5`}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-3 w-2',
                        i < p.ambition!.intensity ? 'bg-whip' : 'bg-moss-200',
                      )}
                    />
                  ))}
                </span>
              </div>
            )}
            {p.traits.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Traits">
                {p.traits.map((t) => (
                  <li key={t.key}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          tabIndex={0}
                          className="inline-block border border-ink/30 px-1.5 py-0.5 text-xs font-semibold"
                        >
                          {t.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t.description}</TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="ideo-title" className="bg-paper">
          <PanelHeader number={next()} title="Politics" titleId="ideo-title" />
          <PanelBody className="grid justify-items-stretch gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:grid-cols-1 [&>figure]:justify-self-center">
            <IdeologyPlot
              them={p.ideology}
              you={p.isPlayer ? null : you}
              name={p.name.split(' ').at(-1) ?? p.name}
            />
            <ul aria-label="Stances on issues">
              {p.stances.map((s) => (
                <StanceRow key={s.issueKey} label={s.label} stance={s.stance} />
              ))}
            </ul>
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="rep-title" className="bg-paper">
          <PanelHeader number={next()} title="Reputation" titleId="rep-title" />
          <PanelBody className="grid gap-2">
            {Object.entries(p.reputation).map(([k, v]) => (
              <StatMeter key={k} label={REPUTATION_LABELS[k] ?? k} value={v} banded />
            ))}
            <StatMeter label="Party loyalty" value={p.partyLoyalty} banded className="mt-2" />
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="links-title" className="bg-paper">
          <PanelHeader number={next()} title="Key relationships" titleId="links-title" />
          <PanelBody>
            {p.keyRelationships.length === 0 ? (
              <p className="text-sm text-moss-600">No known alliances or rivalries.</p>
            ) : (
              <ul className="grid gap-1">
                {p.keyRelationships.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between border-b border-moss-200 py-1 text-sm"
                  >
                    <PoliticianLink campaignId={campaignId} id={r.id} name={r.name} />
                    <Badge
                      tone={
                        r.kind === 'rival' ? 'critical' : r.kind === 'ally' ? 'good' : 'neutral'
                      }
                    >
                      {kindLabel[r.kind]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="career-title" className="bg-paper">
          <PanelHeader number={next()} title="Career" titleId="career-title" />
          <PanelBody>
            <ol className="grid gap-1.5 border-l-2 border-ink pl-3">
              {p.career.map((c, i) => (
                <li key={i} className="text-sm">
                  <span className="block text-xs text-moss-600 tabular">
                    {formatShortDate(c.date)} {c.date.slice(0, 4)}
                  </span>
                  {c.text}
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

export function Component() {
  const id = useCampaignId();
  const { politicianId = '' } = useParams();
  const q = usePolitician(id, politicianId);
  if (q.isPending) return <Loading label="Loading profile" />;
  if (q.isError)
    return <ErrorState className="m-5" error={q.error} onRetry={() => void q.refetch()} />;
  return <Profile p={q.data} campaignId={id} />;
}
