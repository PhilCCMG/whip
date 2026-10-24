import { Badge, bandColour, cn, Meter, Panel, PanelBody, PanelHeader, StatMeter } from '@whip/ui';
import { useParty } from '../api/hooks';
import { PoliticianLink } from '../components/politician-bits';
import { ErrorState, Loading } from '../components/states';
import { signed } from '../lib/format';
import { useCampaignId } from '../lib/params';

function Pips({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${label}: ${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cn('h-4 w-2.5', i < value ? 'bg-whip' : 'bg-white/15')} />
      ))}
    </span>
  );
}

export function Component() {
  const id = useCampaignId();
  const q = useParty(id);
  if (q.isPending) return <Loading label="Loading the party" />;
  if (q.isError)
    return <ErrorState className="m-5" error={q.error} onRetry={() => void q.refetch()} />;
  const party = q.data;
  const maxInfluence = Math.max(...party.powerMap.map((m) => m.influence), 1);

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-4 lg:p-5">
      <header
        className="grid gap-5 bg-ink px-5 pt-4 pb-5 text-paper lg:grid-cols-[minmax(0,1fr)_auto]"
        style={{ borderTop: `6px solid ${party.colour}` }}
      >
        <div>
          <p className="text-xs text-paper/60">
            {party.inGovernment ? 'Party of government' : 'In opposition'} · {party.seats} seats ·{' '}
            {party.pollShare.toFixed(0)}% in the polls
          </p>
          <h1 className="mt-2 font-display text-[clamp(2.2rem,5.5vw,3.75rem)] leading-[0.9] font-black font-stretch-condensed">
            {party.name}
          </h1>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="inline text-paper/60">Leader </dt>
              <dd className="inline">
                <PoliticianLink campaignId={id} id={party.leader.id} name={party.leader.name} />
              </dd>
            </div>
            {party.chiefWhip && (
              <div>
                <dt className="inline text-paper/60">Chief Whip </dt>
                <dd className="inline">
                  <PoliticianLink
                    campaignId={id}
                    id={party.chiefWhip.id}
                    name={party.chiefWhip.name}
                  />
                </dd>
              </div>
            )}
          </dl>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:w-[440px]">
          <div>
            <dt className="text-[11px] text-paper/60">Unity</dt>
            <dd className="font-display text-4xl leading-none font-black font-stretch-condensed tabular">
              {Math.round(party.unity)}
            </dd>
            <Meter
              value={party.unity}
              colour={bandColour(party.unity / 100)}
              className="mt-1.5"
              aria-label="Unity"
            />
          </div>
          <div>
            <dt className="text-[11px] text-paper/60">Whip strength</dt>
            <dd className="mt-1.5">
              <Pips value={party.whipStrength} max={5} label="Whip strength" />
            </dd>
          </div>
          {party.governmentStability !== null && (
            <div>
              <dt className="text-[11px] text-paper/60">Government stability</dt>
              <dd className="font-display text-4xl leading-none font-black font-stretch-condensed tabular">
                {Math.round(party.governmentStability)}
              </dd>
              <Meter
                value={party.governmentStability}
                colour={bandColour(party.governmentStability / 100)}
                className="mt-1.5"
                aria-label="Government stability"
              />
            </div>
          )}
        </dl>
      </header>

      <section aria-labelledby="factions-title">
        <h2 id="factions-title" className="sr-only">
          Factions
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {party.factions.map((f, i) => (
            <Panel
              key={f.id}
              aria-labelledby={`f-${f.id}`}
              className={cn('bg-paper', f.playerIsMember && 'outline-2 outline-whip')}
            >
              <PanelHeader
                number={i + 1}
                title={f.name}
                titleId={`f-${f.id}`}
                actions={f.playerIsMember ? <Badge tone="whip">Your faction</Badge> : null}
              >
                <p className="mt-1 text-xs text-moss-600">
                  Led by <PoliticianLink campaignId={id} id={f.leader.id} name={f.leader.name} /> ·{' '}
                  {f.memberCount} MPs
                </p>
              </PanelHeader>
              <PanelBody className="grid gap-3">
                <StatMeter label="Cohesion" value={f.cohesion} banded />
                {f.leaderTrustInPlayer !== null && (
                  <StatMeter
                    label={`${f.leader.name.split(' ').at(-1) ?? 'Leader'}’s trust in you`}
                    value={f.leaderTrustInPlayer}
                    min={-100}
                    max={100}
                    centred
                    display={signed(Math.round(f.leaderTrustInPlayer))}
                    colour={f.leaderTrustInPlayer < 0 ? 'var(--color-whip)' : 'var(--color-good)'}
                  />
                )}
                <p className="text-xs text-moss-600 tabular">
                  Economic {signed(Math.round(f.ideology.economic))} · Social{' '}
                  {signed(Math.round(f.ideology.social))}
                </p>
                {f.demands.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold">Demands</h3>
                    <ul className="mt-1 grid gap-1 text-sm">
                      {f.demands.map((d) => (
                        <li key={d} className="border-l-[3px] border-whip pl-2 leading-snug">
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </PanelBody>
            </Panel>
          ))}
        </div>
      </section>

      <Panel aria-labelledby="power-title" className="bg-paper">
        <PanelHeader number={party.factions.length + 1} title="Power map" titleId="power-title">
          <p className="mt-1 text-xs text-moss-600">The most influential members of the party.</p>
        </PanelHeader>
        <PanelBody>
          <ol className="grid gap-x-8 lg:grid-cols-2">
            {party.powerMap.map((m, i) => (
              <li
                key={m.id}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(4rem,40%)_2.5rem] items-center gap-2 border-b border-moss-200 py-1.5 text-sm"
              >
                <span className="text-xs text-moss-600 tabular">{i + 1}</span>
                <span className="min-w-0">
                  <PoliticianLink
                    campaignId={id}
                    id={m.id}
                    name={m.name}
                    className="block truncate"
                  />
                  <span className="block truncate text-xs text-moss-600">
                    {m.offices.join(', ') || 'Backbencher'}
                  </span>
                </span>
                <span className="h-2 bg-moss-100" aria-hidden="true">
                  <span
                    className="block h-full"
                    style={{
                      width: `${(m.influence / maxInfluence) * 100}%`,
                      backgroundColor: party.colour,
                    }}
                  />
                </span>
                <span className="text-right font-semibold tabular">{Math.round(m.influence)}</span>
              </li>
            ))}
          </ol>
        </PanelBody>
      </Panel>
    </div>
  );
}
