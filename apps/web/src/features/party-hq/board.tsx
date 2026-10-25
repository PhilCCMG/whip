import { cn, DisplayTitle, Kicker, PipMeter, Portrait, Slash } from '@whip/ui';
import { Link } from 'react-router';
import type { PartyView } from '../../api/types';
import { signed } from '../../lib/format';
import { campaignPath } from '../../lib/params';
import {
  asPercent,
  cohesionLabel,
  stabilityLabel,
  unityLabel,
  WHIP_LABEL,
} from '../tea-room/flavour';

type Faction = PartyView['factions'][number];

const toProfile = (campaignId: string, id: string) =>
  campaignPath(campaignId, `politicians/${encodeURIComponent(id)}`);

const nameLink =
  'hover:underline hover:decoration-whip hover:decoration-2 hover:underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2';

/* ----------------------------------------------------------------------------
 * The leadership: two portrait plates
 * ------------------------------------------------------------------------- */

export function LeaderPlate({
  role,
  person,
  colour,
  campaignId,
  note,
}: {
  role: string;
  person: { id: string; name: string };
  colour: string;
  campaignId: string;
  note: string;
}) {
  return (
    <Link
      to={toProfile(campaignId, person.id)}
      className="group flex min-w-0 items-center gap-3 bg-ink p-3 text-paper outline-1 -outline-offset-1 outline-paper/15 hover:bg-moss-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-paper-bright"
    >
      <Portrait seed={person.id} partyColour={colour} size="lg" className="shrink-0" />
      <span className="flex min-w-0 flex-col-reverse">
        <span className="mt-1.5 block text-[12px] leading-snug text-paper/75">{note}</span>
        <span className="mt-1 block font-display text-[1.35rem] leading-[0.92] font-black text-paper-bright uppercase [font-stretch:70%] group-hover:underline group-hover:decoration-whip group-hover:decoration-2">
          {person.name}
        </span>
        <Kicker className="text-lamp">{role}</Kicker>
      </span>
    </Link>
  );
}

/* ----------------------------------------------------------------------------
 * Gauges: big number, satirical verdict, flat segmented bar
 * ------------------------------------------------------------------------- */

export function Gauge({
  label,
  value,
  verdict,
}: {
  label: string;
  value: number;
  verdict: string;
}) {
  const segs = 20;
  const n = Math.round((Math.max(0, Math.min(100, value)) / 100) * segs);
  const fill = value >= 55 ? 'bg-paper-bright' : value >= 35 ? 'bg-lamp' : 'bg-whip';
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)}: ${verdict}`}
      className="min-w-0"
    >
      <Kicker className="text-paper/70">{label}</Kicker>
      <div className="mt-1.5 flex items-end gap-2">
        <span className="font-display text-[2.6rem] leading-[0.85] font-black text-paper-bright tabular-nums [font-stretch:72%]">
          {Math.round(value)}
        </span>
        <span className="pb-0.5 text-[12px] leading-tight font-semibold text-lamp">{verdict}</span>
      </div>
      <span aria-hidden="true" className="mt-2 flex gap-[2px]">
        {Array.from({ length: segs }, (_, i) => (
          <span key={i} className={cn('h-2.5 flex-1', i < n ? fill : 'bg-paper/15')} />
        ))}
      </span>
    </div>
  );
}

/** Whip strength 1–5 as whip pips (slashes). */
export function WhipGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div
      role="meter"
      aria-label="Whip strength"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={v}
      aria-valuetext={`${v} of 5: ${WHIP_LABEL[v]}`}
      className="min-w-0"
    >
      <Kicker className="text-paper/70">Whip strength</Kicker>
      <div className="mt-1.5 flex items-end gap-2">
        <span className="font-display text-[2.6rem] leading-[0.85] font-black text-paper-bright tabular-nums [font-stretch:72%]">
          {v}
          <span className="text-[1.2rem] text-paper/60">/5</span>
        </span>
        <span className="pb-0.5 text-[12px] leading-tight font-semibold text-lamp">
          {WHIP_LABEL[v]}
        </span>
      </div>
      <span aria-hidden="true" className="mt-1.5 flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Slash key={i} className={cn('h-5 w-auto', i < v ? 'fill-whip' : 'fill-paper/15')} />
        ))}
      </span>
    </div>
  );
}

export function PartyGauges({ party }: { party: PartyView }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-5 sm:grid-cols-3">
      <Gauge label="Unity" value={party.unity} verdict={unityLabel(party.unity)} />
      <WhipGauge value={party.whipStrength} />
      {party.governmentStability !== null ? (
        <Gauge
          label="Government stability"
          value={party.governmentStability}
          verdict={stabilityLabel(party.governmentStability)}
        />
      ) : (
        <div>
          <Kicker className="text-paper/70">Government stability</Kicker>
          <p className="mt-2 text-[13px] text-paper/80">
            Not your problem. In opposition, everything is someone else’s fault.
          </p>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Rival camps: faction cards
 * ------------------------------------------------------------------------- */

export function FactionCard({
  f,
  campaignId,
  partySeats,
  colour,
}: {
  f: Faction;
  campaignId: string;
  partySeats: number;
  colour: string;
}) {
  const cohesion = asPercent(f.cohesion);
  const share = partySeats > 0 ? Math.min(1, f.memberCount / partySeats) : 0;
  const titleId = `faction-${f.id.replace(/[^a-z0-9_-]/gi, '-')}`;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'flex min-w-0 flex-col bg-paper-bright text-ink',
        f.playerIsMember && 'outline-3 -outline-offset-3 outline-whip',
      )}
    >
      <header className="flex items-stretch justify-between bg-ink text-paper-bright">
        <div className="flex min-w-0 flex-col-reverse px-3.5 py-3">
          <DisplayTitle
            as="h3"
            size="sm"
            id={titleId}
            className="mt-1.5 text-[1.45rem] leading-[0.95]"
          >
            {f.name}
          </DisplayTitle>
          <Kicker className="text-paper/70">
            Faction · {f.memberCount} MPs · {Math.round(share * 100)}% of the party
          </Kicker>
        </div>
        {f.playerIsMember && (
          <span className="grid shrink-0 place-items-center bg-whip px-2.5 text-center text-[10px] leading-tight font-bold tracking-[0.08em] text-white uppercase">
            Your
            <br />
            camp
          </span>
        )}
      </header>
      <div aria-hidden="true" className="flex h-1.5 bg-ink/10">
        <span style={{ width: `${share * 100}%`, backgroundColor: colour }} />
      </div>

      <div className="grid gap-4 p-3.5">
        <Link
          to={toProfile(campaignId, f.leader.id)}
          className="group flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whip"
        >
          <Portrait seed={f.leader.id} partyColour={colour} size="md" framed />
          <span className="flex min-w-0 flex-col-reverse">
            <span className="block truncate font-display text-[1.1rem] leading-tight font-black uppercase [font-stretch:72%] group-hover:underline group-hover:decoration-whip group-hover:decoration-2">
              {f.leader.name}
            </span>
            <Kicker className="text-ink/65">Led by</Kicker>
          </span>
        </Link>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <PipMeter
            label="Cohesion"
            value={cohesion}
            min={0}
            max={100}
            pips={10}
            display={Math.round(cohesion)}
            aria-valuetext={`${Math.round(cohesion)}: ${cohesionLabel(cohesion)}`}
          />
          {f.leaderTrustInPlayer !== null ? (
            <PipMeter
              label="Trust in you"
              value={f.leaderTrustInPlayer}
              min={-100}
              max={100}
              pips={10}
              display={signed(Math.round(f.leaderTrustInPlayer))}
            />
          ) : (
            <p className="text-[12px] text-ink/65">The leader has not formed a view of you.</p>
          )}
          <p className="col-span-2 -mt-1 text-[11px] font-semibold text-ink/65">
            {cohesionLabel(cohesion)} · Economic {signed(Math.round(f.ideology.economic))} · Social{' '}
            {signed(Math.round(f.ideology.social))}
          </p>
        </div>

        {f.demands.length > 0 && (
          <div>
            <Kicker className="mb-2 text-ink/65">Demands</Kicker>
            <ul className="grid gap-2">
              {f.demands.map((d, i) => (
                <li key={d} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 border-2 border-whip px-1 py-0.5 font-display text-[11px] leading-none font-black tracking-[0.06em] text-whip uppercase [font-stretch:75%]"
                    style={{ rotate: `${i % 2 === 0 ? -4 : 3}deg` }}
                  >
                    Demand
                  </span>
                  <span className="text-[13px] leading-snug font-semibold">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------------------
 * Who matters: the power ladder
 * ------------------------------------------------------------------------- */

export function PowerLadder({
  members,
  colour,
  campaignId,
  playerId,
}: {
  members: PartyView['powerMap'];
  colour: string;
  campaignId: string;
  playerId: string | undefined;
}) {
  const max = Math.max(1, ...members.map((m) => m.influence));
  return (
    <ol className="grid gap-1">
      {members.map((m, i) => {
        const top = i < 3;
        return (
          <li key={m.id}>
            <Link
              to={toProfile(campaignId, m.id)}
              className={cn(
                'group grid grid-cols-[2.25rem_auto_minmax(0,1fr)] items-center gap-x-3 bg-ink px-2.5 text-paper outline-1 -outline-offset-1 outline-paper/12 hover:bg-moss-900 sm:grid-cols-[2.5rem_auto_minmax(0,1fr)_minmax(6rem,34%)]',
                top ? 'py-2' : 'py-1.5',
                m.id === playerId && 'outline-2 -outline-offset-2 outline-whip',
                nameLink,
                'focus-visible:-outline-offset-2 focus-visible:outline-paper-bright',
              )}
            >
              <span
                className={cn(
                  'text-right font-display font-black tabular-nums [font-stretch:72%]',
                  top ? 'text-[1.9rem] text-lamp' : 'text-[1.3rem] text-paper/60',
                  'leading-none',
                )}
              >
                {i + 1}
              </span>
              <Portrait seed={m.id} partyColour={colour} size={top ? 'md' : 'sm'} />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate font-display font-black text-paper-bright uppercase [font-stretch:72%] group-hover:underline group-hover:decoration-whip group-hover:decoration-2',
                    top ? 'text-[1.2rem]' : 'text-[1rem]',
                    'leading-tight',
                  )}
                >
                  {m.name}
                  {m.id === playerId && (
                    <span className="ml-1.5 font-sans text-[10px] text-lamp">YOU</span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-paper/70">
                  {m.offices.join(', ') || 'Backbencher'}
                </span>
                <span className="mt-1 flex items-center gap-2 sm:hidden">
                  <InfluenceBar value={m.influence} max={max} colour={colour} />
                </span>
              </span>
              <span className="flex items-center gap-2 max-sm:hidden">
                <InfluenceBar value={m.influence} max={max} colour={colour} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function InfluenceBar({ value, max, colour }: { value: number; max: number; colour: string }) {
  return (
    <>
      <span aria-hidden="true" className="h-2.5 flex-1 bg-paper/12">
        <span
          className="block h-full"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: colour }}
        />
      </span>
      <span className="w-8 text-right font-display text-[1.05rem] leading-none font-black text-paper-bright tabular-nums [font-stretch:75%]">
        {Math.round(value)}
        <span className="sr-only"> influence</span>
      </span>
    </>
  );
}
