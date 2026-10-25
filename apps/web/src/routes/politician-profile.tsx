import { useParams } from 'react-router';
import { useCampaignState, useCatalogue, useParliament, usePolitician } from '../api/hooks';
import type { PoliticianProfile } from '../api/types';
import { ErrorState, Loading } from '../components/states';
import {
  Connections,
  DossierHeader,
  DossierSheet,
  RelationshipSheet,
  WhipsNote,
  type QuickAction,
} from '../features/tea-room/dossier';
import { formatSimDate } from '../lib/format';
import { useCampaignId } from '../lib/params';
import { useUiStore } from '../stores/ui-store';

const QUICK = [
  { kind: 'meet_politician', label: 'Meet', slots: 1, capital: 0, primary: true },
  { kind: 'build_relationship', label: 'Build relationship', slots: 2, capital: 1, primary: false },
] as const;

/**
 * TEA ROOM › a colleague's dossier. Portrait and facts up top with the known vote and the two
 * quick actions (which open the Office planner prefilled); the paper file in the main column;
 * the whips' note, the relationship both ways and their connections down the side.
 */
function Dossier({ p, campaignId }: { p: PoliticianProfile; campaignId: string }) {
  const openPlanner = useUiStore((s) => s.openPlanner);
  const state = useCampaignState(campaignId);
  const parliament = useParliament(campaignId);
  const catalogue = useCatalogue(campaignId, !p.isPlayer);
  const player = state.data?.player;
  const next = parliament.data?.upcomingDivisions[0];

  const actions: QuickAction[] = QUICK.map((q) => {
    const item = catalogue.data?.items.find((i) => i.kind === q.kind);
    return {
      key: q.kind,
      label: q.label,
      slots: item?.slots ?? q.slots,
      capital: item?.capitalCost ?? q.capital,
      primary: q.primary,
      disabledReason:
        item && !item.eligible ? (item.reasons[0] ?? 'Not possible this week.') : undefined,
      onPress: () =>
        openPlanner({ kind: q.kind, params: { targetId: p.id }, labels: { [p.id]: p.name } }),
    };
  });

  return (
    <div className="flex min-h-full flex-col">
      <DossierHeader
        p={p}
        campaignId={campaignId}
        majority={p.isPlayer ? (player?.majority ?? null) : null}
        nextDivision={next ? formatSimDate(next.scheduledFor, { year: false }) : null}
        actions={actions}
      />
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start items-start gap-8 px-4 py-6 md:px-8 md:py-7 xl:grid-cols-[minmax(0,1fr)_25rem] xl:grid-rows-[auto_auto_1fr] xl:gap-x-10 2xl:grid-cols-[minmax(0,1fr)_27rem]">
        <div className="order-3 xl:order-none xl:col-start-1 xl:row-span-3 xl:row-start-1">
          <DossierSheet p={p} you={player?.ideology ?? null} />
        </div>
        <div className="order-1 xl:order-none xl:col-start-2 xl:row-start-1">
          <WhipsNote p={p} />
        </div>
        <div className="order-2 xl:order-none xl:col-start-2 xl:row-start-2">
          {p.isPlayer ? (
            <p className="bg-ink p-4 text-[13px] text-paper/85 outline-2 -outline-offset-2 outline-paper/15">
              This is your own file. The whips keep a copy, and it is longer.
            </p>
          ) : (
            <RelationshipSheet p={p} playerName={player?.name ?? 'you'} />
          )}
        </div>
        <div className="order-4 xl:order-none xl:col-start-2 xl:row-start-3">
          <Connections p={p} campaignId={campaignId} playerId={player?.id} />
        </div>
      </div>
    </div>
  );
}

export function Component() {
  const id = useCampaignId();
  const { politicianId = '' } = useParams();
  const q = usePolitician(id, politicianId);
  if (q.isPending) return <Loading label="Pulling the file" className="text-paper" />;
  if (q.isError)
    return (
      <ErrorState
        className="m-5 bg-paper text-ink"
        error={q.error}
        onRetry={() => void q.refetch()}
      />
    );
  return <Dossier p={q.data} campaignId={id} />;
}
