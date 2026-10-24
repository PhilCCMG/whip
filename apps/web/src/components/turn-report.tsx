import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Headline,
  SectionLabel,
} from '@whip/ui';
import type { ActionOutcome, TurnReport } from '../api/types';
import { formatSimDate, sequence, signed } from '../lib/format';
import { DivisionResultView } from './division-result';

const statusTone = {
  succeeded: 'good',
  partial: 'warning',
  failed: 'critical',
  rejected: 'critical',
} as const;

const statusText = {
  succeeded: 'Succeeded',
  partial: 'Partly worked',
  failed: 'Failed',
  rejected: 'Not allowed',
} as const;

function effectTone(line: string) {
  if (/[+]\d/.test(line)) return 'text-good-strong';
  if (/[−-]\d/.test(line)) return 'text-whip';
  return '';
}

function Outcome({ outcome }: { outcome: ActionOutcome }) {
  return (
    <li className="grid gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">{outcome.label}</h4>
        <Badge tone={statusTone[outcome.status]}>{statusText[outcome.status]}</Badge>
      </div>
      <p className="text-sm opacity-80">{outcome.summary}</p>
      {outcome.effects.length > 0 && (
        <ul className="mt-0.5 grid gap-x-4 text-xs sm:grid-cols-2">
          {outcome.effects.map((e) => (
            <li key={e} className={cn('font-medium tabular', effectTone(e))}>
              {e}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The body of a turn report, usable outside the dialog (tests, history). */
export function TurnReportContent({
  report,
  campaignId,
}: {
  report: TurnReport;
  campaignId: string;
}) {
  const [lead, ...rest] = [...report.headlines].sort((a, b) => b.importance - a.importance);
  const next = sequence();
  return (
    <div className="grid gap-7">
      {lead && (
        <section aria-label="Headlines" className="grid gap-4">
          <Headline
            as="h3"
            text={lead.text}
            standfirst={lead.standfirst}
            importance={lead.importance}
          />
          {rest.length > 0 && (
            <div className="grid gap-4 border-t border-foreground pt-3 sm:grid-cols-2">
              {rest.map((h) => (
                <Headline
                  key={h.text}
                  as="h4"
                  text={h.text}
                  standfirst={h.standfirst}
                  importance={Math.min(h.importance, 3)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {report.divisions.length > 0 && (
        <section aria-labelledby="tr-divisions">
          <SectionLabel id="tr-divisions" as="h3" number={next()} className="mb-3">
            {report.divisions.length === 1 ? 'The division' : 'Divisions'}
          </SectionLabel>
          <div className="grid gap-6">
            {report.divisions.map((d) => (
              <DivisionResultView key={d.id} division={d} campaignId={campaignId} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="tr-actions">
        <SectionLabel id="tr-actions" as="h3" number={next()} className="mb-1">
          Your week
        </SectionLabel>
        {report.actionOutcomes.length === 0 ? (
          <p className="py-2 text-sm opacity-65">You planned nothing this week.</p>
        ) : (
          <ul>
            {report.actionOutcomes.map((o, i) => (
              <Outcome key={o.plannedActionId ?? `${o.kind}-${i}`} outcome={o} />
            ))}
          </ul>
        )}
      </section>

      {report.notifications.length > 0 && (
        <section aria-labelledby="tr-notes">
          <SectionLabel id="tr-notes" as="h3" number={next()} className="mb-2">
            Also this week
          </SectionLabel>
          <ul className="grid gap-2">
            {report.notifications.map((note) => (
              <li key={note.id} className="border-l-[3px] border-current/30 pl-3 text-sm">
                <span className="font-semibold">{note.title}.</span>{' '}
                <span className="opacity-75">{note.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function TurnReportDialog({
  report,
  campaignId,
  open,
  onOpenChange,
}: {
  report: TurnReport | null | undefined;
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!report) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="bg-ink pb-4 text-paper">
          <p className="text-xs font-semibold text-paper/65">
            Week {report.turn} · w/c {formatSimDate(report.simDate)}
          </p>
          <DialogTitle className="mt-1 text-4xl sm:text-5xl">The week in Westminster</DialogTitle>
          <DialogDescription className="text-paper/75">
            Political capital {signed(report.capitalChange)} · Week {report.nextTurn} begins{' '}
            {formatSimDate(report.nextSimDate)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <TurnReportContent report={report} campaignId={campaignId} />
        </DialogBody>
        <DialogFooter>
          <Button variant="whip" onClick={() => onOpenChange(false)}>
            Start week {report.nextTurn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
