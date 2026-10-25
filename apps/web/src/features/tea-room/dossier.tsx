import {
  cn,
  CostChip,
  DisplayTitle,
  Kicker,
  PaperSheet,
  PipMeter,
  Portrait,
  Slash,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@whip/ui';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { PoliticianProfile, RelationshipSummary } from '../../api/types';
import menuBg from '../../assets/menu-bg.jpg';
import {
  formatNumber,
  formatShortDate,
  REPUTATION_LABELS,
  signed,
  SKILL_LABELS,
} from '../../lib/format';
import { campaignPath } from '../../lib/params';
import { Compass, IntentionStamp, RivalryMarks } from './bits';
import { whipsNote } from './flavour';

/* ----------------------------------------------------------------------------
 * Header: portrait, name, post, facts, known vote, quick actions
 * ------------------------------------------------------------------------- */

export interface QuickAction {
  key: string;
  label: string;
  slots: number;
  capital: number;
  disabledReason?: string | undefined;
  primary?: boolean;
  onPress: () => void;
}

export function DossierHeader({
  p,
  campaignId,
  majority,
  nextDivision,
  actions,
}: {
  p: PoliticianProfile;
  campaignId: string;
  majority: number | null;
  nextDivision: string | null;
  actions: QuickAction[];
}) {
  const facts: { label: string; value: ReactNode }[] = [
    { label: 'Seat', value: p.constituencyName ?? 'None' },
    ...(majority !== null ? [{ label: 'Majority', value: formatNumber(majority) }] : []),
    { label: 'Age', value: p.age },
    { label: 'Influence', value: Math.round(p.influence) },
    { label: 'Loyalty', value: Math.round(p.partyLoyalty) },
  ];
  const vote = p.knownIntention;
  const voteNote =
    vote === null
      ? 'No division on the order paper.'
      : vote === 'unknown'
        ? 'Nobody has asked. A meeting would settle it.'
        : 'From your last conversation. Subject to whipping.';
  return (
    <header className="relative isolate overflow-hidden bg-ink text-paper-bright">
      <img
        src={menuBg}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="absolute inset-0 -z-10 size-full object-cover"
        style={{ objectPosition: '88% 30%' }}
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-ink/[0.9]" />
      <div className="px-4 pt-4 md:px-8 md:pt-5">
        <Link
          to={campaignPath(campaignId, 'politicians')}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-paper/75 uppercase hover:text-paper-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-bright"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" /> Tea Room
        </Link>
      </div>
      <div className="grid gap-x-8 gap-y-5 px-4 pt-4 pb-5 md:grid-cols-[auto_minmax(0,1fr)] md:px-8 md:pb-6 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Portrait
          seed={p.id}
          partyColour={p.partyColour}
          size="xl"
          className="size-24 outline-2 -outline-offset-2 outline-paper/20 md:size-[9.5rem]"
        />
        <div className="min-w-0 self-end">
          <div className="flex flex-col-reverse">
            <DisplayTitle as="h1" size="xl" slash className="mt-2">
              {p.name}
            </DisplayTitle>
            <Kicker className="text-paper/75">
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block size-2.5 align-[-1px]"
                style={{ backgroundColor: p.partyColour ?? 'var(--color-moss-400)' }}
              />
              {p.partyShort ?? 'Independent'}
              {p.factionName ? ` · ${p.factionName}` : ' · No faction'}
              {p.status !== 'sitting' && p.status !== 'active' ? ` · ${p.status}` : ''}
            </Kicker>
          </div>
          <p className="mt-2 text-[15px] font-semibold text-paper/90">
            {p.offices.length > 0 ? p.offices.join(' · ') : 'Backbencher'}
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col-reverse">
                <dd className="mt-1 font-display text-[1.3rem] leading-none font-black text-paper-bright tabular-nums [font-stretch:72%]">
                  {f.value}
                </dd>
                <dt className="text-[10px] font-bold tracking-[0.08em] text-paper/70 uppercase">
                  {f.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
        {!p.isPlayer && (
          <div className="grid content-end gap-4 md:col-span-2 xl:col-span-1 xl:w-[28rem]">
            <div className="flex items-center gap-3 border-y border-paper/15 py-2.5">
              <IntentionStamp vote={vote} size="lg" angle={vote === 'unknown' ? 0 : -5} />
              <div className="min-w-0">
                <Kicker className="text-lamp">
                  Next division{nextDivision ? `: ${nextDivision}` : ''}
                </Kicker>
                <p className="mt-1 text-[12px] leading-snug text-paper/80">{voteNote}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <ActionButton key={a.key} action={a} />
              ))}
            </div>
            {actions.some((a) => a.disabledReason) && (
              <p className="text-[12px] text-lamp">
                {actions.find((a) => a.disabledReason)?.disabledReason}
              </p>
            )}
          </div>
        )}
      </div>
      <div aria-hidden="true" className="h-[3px] bg-whip" />
    </header>
  );
}

function ActionButton({ action: a }: { action: QuickAction }) {
  const disabled = !!a.disabledReason;
  return (
    <button
      type="button"
      onClick={a.onPress}
      disabled={disabled}
      data-tutorial-avoid=""
      className={cn(
        'inline-flex h-11 cursor-pointer items-center gap-3 pr-2 pl-3.5 font-display text-[1.05rem] leading-none font-black tracking-[0.03em] uppercase [font-stretch:72%]',
        'focus-visible:outline-2 focus-visible:-outline-offset-4 disabled:cursor-not-allowed disabled:opacity-55',
        a.primary
          ? 'bg-whip text-white hover:bg-whip-dark focus-visible:outline-paper-bright'
          : 'bg-paper-bright text-ink hover:bg-paper focus-visible:outline-whip',
      )}
    >
      {a.label}
      <span className="flex gap-1">
        <CostChip kind="slots" value={a.slots} tone={a.primary ? 'ink' : 'ink'} />
        {a.capital > 0 && <CostChip kind="capital" value={a.capital} />}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Whips' note: a pinned slip, derived from traits by a stable hash
 * ------------------------------------------------------------------------- */

export function WhipsNote({ p }: { p: PoliticianProfile }) {
  return (
    <figure className="relative bg-paper-deep px-4 pt-3 pb-3 text-ink md:-rotate-[0.6deg]">
      <span
        aria-hidden="true"
        className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 bg-whip"
      />
      <Kicker className="text-ink/70">Whips’ note</Kicker>
      <blockquote className="mt-1.5 font-display text-[1.25rem] leading-[1.02] font-black uppercase [font-stretch:72%]">
        “
        {whipsNote(
          p.id,
          p.traits.map((t) => t.key),
        )}
        ”
      </blockquote>
      <figcaption className="mt-2 text-[11px] text-ink/65">
        Not for circulation. Circulated anyway.
      </figcaption>
    </figure>
  );
}

/* ----------------------------------------------------------------------------
 * Relationship both ways, with memories as a timeline
 * ------------------------------------------------------------------------- */

function ViewColumn({
  title,
  rel,
  empty,
}: {
  title: string;
  rel: RelationshipSummary | null;
  empty: string;
}) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="mb-2.5 font-display text-[1.05rem] leading-none font-black text-paper-bright uppercase [font-stretch:72%]">
        {title}
      </h3>
      {!rel ? (
        <p className="text-[12px] leading-snug text-paper/75">{empty}</p>
      ) : (
        <div className="grid gap-2.5">
          {(['trust', 'respect', 'affinity'] as const).map((k) => (
            <PipMeter
              key={k}
              tone="paper"
              label={k.charAt(0).toUpperCase() + k.slice(1)}
              value={rel[k]}
              min={-100}
              max={100}
              pips={10}
              display={signed(Math.round(rel[k]))}
            />
          ))}
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            <div className="flex gap-1.5">
              <dt className="text-paper/70">Owes</dt>
              <dd className="font-bold text-paper-bright tabular-nums">
                {signed(Math.round(rel.obligation))}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-paper/70">Rivalry</dt>
              <dd className="flex items-center gap-1 font-bold text-paper-bright">
                {rel.rivalry === 0 ? 'None' : <RivalryMarks level={rel.rivalry} />}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}

export function RelationshipSheet({ p, playerName }: { p: PoliticianProfile; playerName: string }) {
  const first = p.name.split(' ')[0] ?? p.name;
  return (
    <section
      aria-labelledby="rel-title"
      data-tutorial="relationships"
      className="bg-ink text-paper outline-2 -outline-offset-2 outline-paper/15"
    >
      <div
        aria-hidden="true"
        className="h-1.5"
        style={{ backgroundColor: p.partyColour ?? 'var(--color-moss-400)' }}
      />
      <div className="p-4">
        <DisplayTitle as="h2" size="md" slash id="rel-title" className="text-paper-bright">
          You and {first}
        </DisplayTitle>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-2">
          <ViewColumn
            title="Their view of you"
            rel={p.relationship.towardsPlayer}
            empty={`${first} has no settled view of ${playerName.split(' ')[0] ?? 'you'}. Yet.`}
          />
          <ViewColumn
            title="Your view of them"
            rel={p.relationship.fromPlayer}
            empty="You have not formed an opinion. Unusual in this building."
          />
        </div>
      </div>
      <div className="border-t border-paper/15 p-4">
        <Kicker className="mb-2.5 text-paper/70">What they remember</Kicker>
        {p.relationship.memories.length === 0 ? (
          <p className="text-[12px] text-paper/75">Nothing on file. Clean slate, for now.</p>
        ) : (
          <ol className="relative grid gap-3 pl-5">
            <span
              aria-hidden="true"
              className="absolute top-1 bottom-1 left-[5px] w-[2px] bg-paper/20"
            />
            {[...p.relationship.memories]
              .sort((a, b) => b.turn - a.turn)
              .map((m, i) => (
                <li key={`${m.turn}-${i}`} className="relative">
                  <span aria-hidden="true" className="absolute top-[3px] -left-5 size-3 bg-whip" />
                  <span className="block text-[10px] font-bold tracking-[0.08em] text-lamp uppercase tabular-nums">
                    Week {m.turn}
                  </span>
                  <span className="block text-[13px] leading-snug text-paper-bright">{m.text}</span>
                </li>
              ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * The paper dossier: attributes, character, politics, standing, career
 * ------------------------------------------------------------------------- */

function SheetSection({
  id,
  title,
  meta,
  children,
  className,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn('min-w-0', className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b-2 border-ink pb-1.5">
        <DisplayTitle as="h2" size="sm" slash id={id}>
          {title}
        </DisplayTitle>
        {meta && <span className="text-[11px] font-semibold text-ink/65">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function band(v: number) {
  if (v >= 15) return 'bg-good-strong text-paper-bright';
  if (v <= 5) return 'bg-whip text-white';
  if (v >= 11) return 'bg-ink text-paper-bright';
  return 'bg-ink/10 text-ink';
}

/** Skills 1–20 as FM attribute rows: label, a thin bar, the number in a banded cell. */
function Attributes({ skills }: { skills: Record<string, number> }) {
  return (
    <ul className="grid gap-x-6 sm:grid-cols-2">
      {Object.entries(skills).map(([k, v]) => (
        <li
          key={k}
          className="grid grid-cols-[minmax(0,1fr)_3rem_2.25rem] items-center gap-2 border-b border-ink/12 py-1"
        >
          <span className="truncate text-[13px] font-semibold">{SKILL_LABELS[k] ?? k}</span>
          <span aria-hidden="true" className="h-1.5 bg-ink/10">
            <span className="block h-full bg-ink/70" style={{ width: `${(v / 20) * 100}%` }} />
          </span>
          <span
            className={cn(
              'grid h-7 place-items-center font-display text-[1.1rem] leading-none font-black tabular-nums [font-stretch:75%]',
              band(v),
            )}
          >
            {v}
            <span className="sr-only"> of 20</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Traits({ traits }: { traits: PoliticianProfile['traits'] }) {
  if (traits.length === 0)
    return <p className="text-[13px] text-ink/70">No notable traits. Suspicious.</p>;
  return (
    <ul aria-label="Traits" className="flex flex-wrap gap-1.5">
      {traits.map((t) => (
        <li key={t.key}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-sfx="off"
                className="inline-flex h-7 cursor-help items-center gap-1.5 bg-ink px-2 text-[11px] font-bold tracking-[0.06em] text-paper-bright uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whip"
              >
                <Slash className="h-3 w-auto" />
                {t.label}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t.description}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

function Ambition({ ambition }: { ambition: PoliticianProfile['ambition'] }) {
  if (!ambition)
    return (
      <p className="text-[13px] text-ink/70">Claims to have no ambition. Nobody believes it.</p>
    );
  return (
    <div className="flex items-center justify-between gap-3 bg-paper px-3 py-2">
      <div className="min-w-0">
        <Kicker className="text-ink/65">Ambition</Kicker>
        <p className="mt-1 font-display text-[1.15rem] leading-none font-black uppercase [font-stretch:72%]">
          {ambition.label}
        </p>
      </div>
      <span
        role="img"
        aria-label={`Intensity ${ambition.intensity} of 5`}
        className="flex gap-[3px]"
      >
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn('h-5 w-2', i < ambition.intensity ? 'bg-whip' : 'bg-ink/12')}
          />
        ))}
      </span>
    </div>
  );
}

const STANCE_TEXT: Record<number, string> = {
  [-2]: 'Strongly against',
  [-1]: 'Against',
  0: 'Neutral',
  1: 'For',
  2: 'Strongly for',
};

/** Issue stances as a row of markers on a five-step track. */
function Stances({ stances }: { stances: PoliticianProfile['stances'] }) {
  return (
    <ul aria-label="Stances on issues" className="grid gap-1.5">
      {stances.map((s) => (
        <li
          key={s.issueKey}
          className="grid grid-cols-[minmax(0,1fr)_minmax(7.5rem,12rem)] items-center gap-4 lg:grid-cols-[minmax(0,13rem)_minmax(7.5rem,14rem)]"
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{s.label}</span>
            <span className="block text-[10px] font-bold tracking-[0.06em] text-ink/60 uppercase">
              {STANCE_TEXT[s.stance]}
            </span>
          </span>
          <span aria-hidden="true" className="grid grid-cols-5 gap-[2px]">
            {[-2, -1, 0, 1, 2].map((v) => (
              <span
                key={v}
                className={cn(
                  'relative grid h-5 place-items-center',
                  v === 0 ? 'bg-ink/18' : 'bg-ink/8',
                )}
              >
                {v === s.stance && (
                  <Slash
                    className={cn(
                      'h-5 w-auto',
                      s.stance < 0 ? 'fill-whip' : s.stance > 0 ? 'fill-good-strong' : 'fill-ink',
                    )}
                  />
                )}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Career as a CV strip: a ruled row of dated entries (a column on phones). */
function Career({ career }: { career: PoliticianProfile['career'] }) {
  if (career.length === 0) return <p className="text-[13px] text-ink/70">A blank page. For now.</p>;
  return (
    <ol className="grid grid-cols-[minmax(0,1fr)] gap-px bg-ink/15 sm:grid-flow-col sm:auto-cols-fr">
      {career.map((c, i) => (
        <li key={i} className="relative bg-paper-bright px-3 pt-2.5 pb-3">
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-x-0 top-0 h-[3px]',
              i === career.length - 1 ? 'bg-whip' : 'bg-ink',
            )}
          />
          <span className="block font-display text-[1.6rem] leading-none font-black tabular-nums [font-stretch:72%]">
            {c.date.slice(0, 4)}
          </span>
          <span className="mt-0.5 block text-[10px] font-bold tracking-[0.06em] text-ink/60 uppercase tabular-nums">
            {formatShortDate(c.date)}
          </span>
          <span className="mt-1.5 block text-[13px] leading-snug">{c.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function DossierSheet({
  p,
  you,
}: {
  p: PoliticianProfile;
  you: { economic: number; social: number } | null;
}) {
  const surname = p.name.split(' ').at(-1) ?? p.name;
  return (
    <PaperSheet
      tone="bright"
      as="article"
      aria-label={`Dossier: ${p.name}`}
      className="grid gap-8 p-4 md:p-6"
    >
      <div className="grid gap-8 min-[1400px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <SheetSection
          id="attr-title"
          title="Attributes"
          meta="1–20 · 15+ exceptional · 5 or less a worry"
        >
          <Attributes skills={p.skills} />
        </SheetSection>
        <SheetSection id="char-title" title="Character" meta="Hover or focus a trait">
          <div className="grid gap-3">
            <Traits traits={p.traits} />
            <Ambition ambition={p.ambition} />
          </div>
        </SheetSection>
      </div>

      <SheetSection
        id="pol-title"
        title="Politics"
        meta={you && !p.isPlayer ? 'Red diamond: them · square: you' : undefined}
      >
        <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
          <Compass
            className="aspect-square w-full max-w-[15rem] justify-self-center"
            points={[
              ...(you && !p.isPlayer
                ? [{ id: 'you', label: 'You', kind: 'you' as const, ...you }]
                : []),
              { id: p.id, label: surname, kind: 'them' as const, ...p.ideology },
            ]}
          />
          <Stances stances={p.stances} />
        </div>
      </SheetSection>

      <SheetSection id="rep-title" title="Standing" meta="Reputation by audience, −100 to +100">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(p.reputation).map(([k, v]) => (
            <PipMeter
              key={k}
              label={REPUTATION_LABELS[k] ?? k}
              value={v}
              min={-100}
              max={100}
              pips={10}
              display={signed(Math.round(v))}
            />
          ))}
          <PipMeter
            label="Party loyalty"
            value={p.partyLoyalty}
            min={-100}
            max={100}
            pips={10}
            display={signed(Math.round(p.partyLoyalty))}
          />
        </div>
      </SheetSection>

      <SheetSection id="career-title" title="Career">
        <Career career={p.career} />
      </SheetSection>
    </PaperSheet>
  );
}

/* ----------------------------------------------------------------------------
 * Connections: key relationships with portraits
 * ------------------------------------------------------------------------- */

const KIND = {
  ally: { label: 'Ally', cls: 'bg-good-strong text-paper-bright' },
  rival: { label: 'Rival', cls: 'bg-whip-dark text-white' },
  patron: { label: 'Patron', cls: 'bg-lamp text-ink' },
  protege: { label: 'Protégé', cls: 'bg-paper-bright text-ink' },
} as const;

export function Connections({
  p,
  campaignId,
  playerId,
}: {
  p: PoliticianProfile;
  campaignId: string;
  playerId: string | undefined;
}) {
  return (
    <section aria-labelledby="links-title">
      <DisplayTitle as="h2" size="md" slash id="links-title" className="text-paper-bright">
        Connections
      </DisplayTitle>
      <p className="mt-1.5 text-[12px] font-semibold text-paper/75">
        Who they owe, who they loathe.
      </p>
      {p.keyRelationships.length === 0 ? (
        <p className="mt-3 text-[13px] text-paper/75">
          No known alliances. Or nobody is admitting to one.
        </p>
      ) : (
        <ul className="mt-3 grid gap-1">
          {p.keyRelationships.map((r) => (
            <li key={r.id}>
              <Link
                to={campaignPath(campaignId, `politicians/${encodeURIComponent(r.id)}`)}
                className="flex items-center gap-3 bg-ink p-2 outline-1 -outline-offset-1 outline-paper/15 hover:bg-moss-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-paper-bright"
              >
                <Portrait seed={r.id} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[1.05rem] leading-tight font-black text-paper-bright uppercase [font-stretch:72%]">
                    {r.name}
                  </span>
                  {r.id === playerId && (
                    <span className="block text-[11px] font-semibold text-lamp">That’s you</span>
                  )}
                </span>
                <span
                  className={cn(
                    'px-1.5 py-1 text-[10px] leading-none font-bold tracking-[0.08em] uppercase',
                    KIND[r.kind].cls,
                  )}
                  style={{ rotate: r.kind === 'rival' ? '-3deg' : undefined }}
                >
                  {KIND[r.kind].label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
