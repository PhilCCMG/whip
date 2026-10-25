import { useCampaignState, useParty } from '../api/hooks';
import { ErrorState, Loading } from '../components/states';
import { FactionCard, LeaderPlate, PartyGauges, PowerLadder } from '../features/party-hq/board';
import { Compass, type CompassPoint } from '../features/tea-room/bits';
import { asPercent, pickBy } from '../features/tea-room/flavour';
import { DeskHeading, GameScreenHeader } from '../game-ui/game-screen';
import { useCampaignId } from '../lib/params';

const LEADER_NOTES = [
  'Enjoys the full confidence of colleagues, for the moment.',
  'Has never once considered resigning. Publicly.',
  'Described by allies as “a safe pair of hands” and by others as “hands”.',
] as const;
const WHIP_NOTES = [
  'Keeps a little black book. It is a large book.',
  'Has offered colleagues “every support”, which they found ominous.',
  'Remembers every vote you have cast. And several you have not.',
] as const;

/**
 * PARTY HQ: the party as a faction-politics board. The leadership and three gauges, the rival
 * camps as cards, and the power ladder beside a compass of where the camps stand.
 */
export function Component() {
  const id = useCampaignId();
  const q = useParty(id);
  const state = useCampaignState(id);
  if (q.isPending) return <Loading label="Consulting the whips" className="text-paper" />;
  if (q.isError)
    return (
      <ErrorState
        className="m-5 bg-paper text-ink"
        error={q.error}
        onRetry={() => void q.refetch()}
      />
    );
  const party = q.data;
  const player = state.data?.player;
  const poll = asPercent(party.pollShare);

  const points: CompassPoint[] = [
    {
      id: party.id,
      label: party.shortName,
      kind: 'mark',
      quiet: true,
      colour: party.colour,
      ...party.ideology,
    },
    ...party.factions.map((f) => ({
      id: f.id,
      label: f.name.split(/\s|&/)[0] ?? f.name,
      kind: 'mark' as const,
      colour: 'var(--color-lamp)',
      ...f.ideology,
    })),
    ...(player ? [{ id: 'you', label: 'You', kind: 'you' as const, ...player.ideology }] : []),
  ];

  // Zoom the compass onto the camps: they cluster, and a full-scale map hides the argument.
  const spread = Math.max(...points.flatMap((pt) => [Math.abs(pt.economic), Math.abs(pt.social)]));
  const domain = Math.min(100, Math.max(40, Math.ceil((spread * 1.15) / 10) * 10));

  return (
    <div className="flex min-h-full flex-col">
      <GameScreenHeader
        title="Party HQ"
        kicker={`${party.name} · ${party.inGovernment ? 'Party of government' : 'In opposition'} · ${party.seats} seats · ${poll.toFixed(0)}% in the polls`}
        crop="15% 55%"
      />
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-9 px-4 py-6 md:px-8 md:py-7">
        <section aria-labelledby="lead-title" className="grid gap-4">
          <DeskHeading
            id="lead-title"
            title="The leadership"
            meta="Who runs the party, and how well."
          />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-center">
            <div className="grid gap-2 sm:grid-cols-2">
              <LeaderPlate
                role="Leader"
                person={party.leader}
                colour={party.colour}
                campaignId={id}
                note={pickBy(party.leader.id, LEADER_NOTES)}
              />
              {party.chiefWhip && (
                <LeaderPlate
                  role="Chief Whip"
                  person={party.chiefWhip}
                  colour={party.colour}
                  campaignId={id}
                  note={pickBy(party.chiefWhip.id, WHIP_NOTES)}
                />
              )}
            </div>
            <PartyGauges party={party} />
          </div>
        </section>

        <section aria-labelledby="camps-title" className="grid gap-4">
          <DeskHeading
            id="camps-title"
            title="Rival camps"
            meta={`${party.factions.length} factions, each certain it is the real party`}
          />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
            {party.factions.map((f) => (
              <FactionCard
                key={f.id}
                f={f}
                campaignId={id}
                partySeats={party.seats}
                colour={party.colour}
              />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-9 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-x-10">
          <section aria-labelledby="power-title" className="grid content-start gap-4">
            <DeskHeading
              id="power-title"
              title="Who matters"
              meta="Ranked by influence. Rankings disputed by everyone below first place."
            />
            <PowerLadder
              members={party.powerMap}
              colour={party.colour}
              campaignId={id}
              playerId={player?.id}
            />
          </section>
          <section aria-labelledby="map-title" className="grid content-start gap-4">
            <DeskHeading
              id="map-title"
              title="Where the camps stand"
              meta={`Outline: you · party colour: the party line · map centre, ±${domain} each way`}
            />
            <div className="bg-ink p-3 outline-1 -outline-offset-1 outline-paper/15">
              <Compass
                tone="paper"
                labelPoints
                domain={domain}
                points={points}
                className="mx-auto aspect-square w-full max-w-[22rem]"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
