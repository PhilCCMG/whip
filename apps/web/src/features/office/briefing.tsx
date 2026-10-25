import { Newspaper as NewspaperIcon } from 'lucide-react';
import { useTurnReport } from '../../api/hooks';
import type { CareerOverview } from '../../api/types';
import { DeskHeading } from '../../game-ui/game-screen';
import { useUiStore } from '../../stores/ui-store';
import { NewspaperPage } from '../newspaper/newspaper';
import { paperFromHeadlines } from '../newspaper/paper-style';

/** Reopens the report from the most recent advance (kept server-side, so it survives a reload). */
function LastReportButton({ campaignId }: { campaignId: string }) {
  const report = useTurnReport(campaignId);
  const setTurnReportOpen = useUiStore((s) => s.setTurnReportOpen);
  if (!report.data) return null;
  return (
    <button
      type="button"
      onClick={() => setTurnReportOpen(true)}
      aria-label={`Last week’s report (week ${report.data.turn})`}
      className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase underline decoration-current/40 underline-offset-4 hover:decoration-whip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whip"
    >
      <NewspaperIcon aria-hidden="true" className="size-3.5" />
      Last week’s results
    </button>
  );
}

/** This morning's paper on the desk (the briefing), in its own masthead's style. */
export function Briefing({ overview }: { overview: CareerOverview }) {
  const { briefing, campaign } = overview;
  const paper =
    briefing.newspaper ?? paperFromHeadlines(briefing.headlines, campaign.simDate, briefing.turn);
  return (
    <section aria-labelledby="papers-title">
      <DeskHeading
        id="papers-title"
        title="The papers"
        meta="This morning’s edition, delivered with the coffee and the outrage"
      />
      <NewspaperPage
        className="mt-4"
        compact
        paper={paper}
        campaignId={campaign.id}
        aside={<LastReportButton campaignId={campaign.id} />}
      />
    </section>
  );
}
