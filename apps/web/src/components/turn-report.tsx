import {
  CapitalIcon,
  cn,
  DisplayTitle,
  Keycap,
  Kicker,
  ResourceCounter,
  ReturnKeyIcon,
  Stamp,
} from '@whip/ui';
import { useRef } from 'react';
import type { ActionOutcome, TurnReport } from '../api/types';
import { NewspaperPage } from '../features/newspaper/newspaper';
import { paperFromHeadlines } from '../features/newspaper/paper-style';
import { KIND_LABEL } from '../features/office/model';
import { DispatchFrame, DispatchTitle } from '../game-ui/dispatch-frame';
import { DivisionTally } from '../game-ui/division-tally';
import { useSoundCues } from '../features/audio/cues';
import { useReducedMotion } from '../stores/settings-store';
import {
  OUTCOME_STAMP_DELAY_MS,
  OUTCOME_STAMP_STEP_MS,
  reportSoundCues,
} from './turn-report-sounds';
import { formatSimDate, signed } from '../lib/format';

const STAMP: Record<ActionOutcome['status'], { text: string; tone: 'good' | 'warning' | 'bad' }> = {
  succeeded: { text: 'Success', tone: 'good' },
  partial: { text: 'Partial', tone: 'warning' },
  failed: { text: 'Failed', tone: 'bad' },
  rejected: { text: 'Refused', tone: 'bad' },
};

function effectTone(line: string) {
  if (/[+]\d/.test(line)) return 'text-good-strong';
  if (/[−-]\d/.test(line)) return 'text-whip-dark';
  return 'text-ink/80';
}

/** One action's result, stamped. The stamps land one after another. */
function Outcome({ outcome, index }: { outcome: ActionOutcome; index: number }) {
  const stamp = STAMP[outcome.status];
  return (
    <li className="relative grid gap-1.5 border-t border-ink/30 py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col-reverse">
          <h4 className="mt-1 font-display text-[1.15rem] leading-[0.95] font-black uppercase [font-stretch:72%]">
            {outcome.label}
          </h4>
          <span className="text-[10px] leading-none font-bold tracking-[0.08em] text-ink/65 uppercase">
            {KIND_LABEL[outcome.kind]}
          </span>
        </div>
        <Stamp
          tone={stamp.tone}
          size="sm"
          angle={index % 2 ? 4 : -5}
          className="shrink-0 animate-stamp"
          style={{ animationDelay: `${OUTCOME_STAMP_DELAY_MS + index * OUTCOME_STAMP_STEP_MS}ms` }}
        >
          {stamp.text}
        </Stamp>
      </div>
      <p className="text-[13px] leading-snug text-ink/85">{outcome.summary}</p>
      {outcome.effects.length > 0 && (
        <ul className="grid gap-0.5 text-[12px]">
          {outcome.effects.map((e) => (
            <li key={e} className={cn('font-semibold tabular-nums', effectTone(e))}>
              {e}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * "Your week": the player's results as a boxed insert in the paper's narrow column. The
 * mechanics (stamped outcomes, the capital change) stay plain whatever the paper says.
 */
function YourWeek({ report }: { report: TurnReport }) {
  return (
    <section
      aria-labelledby="tr-actions"
      data-tutorial="your-week"
      className="bg-paper-bright p-3 text-ink outline-2 -outline-offset-2 outline-ink"
    >
      <div className="-mx-3 -mt-3 mb-3 flex items-center justify-between gap-3 bg-ink px-3 py-2 text-paper-bright">
        <h3
          id="tr-actions"
          className="font-display text-[1.35rem] leading-none font-black uppercase [font-stretch:68%]"
        >
          Your week
        </h3>
        <ResourceCounter
          size="sm"
          label="Capital"
          value={signed(report.capitalChange)}
          icon={<CapitalIcon className="text-lamp" />}
          aria-label={`Political capital ${signed(report.capitalChange)} this week`}
          role="group"
        />
      </div>
      {report.actionOutcomes.length === 0 ? (
        <p className="text-[13px] text-ink/80">You planned nothing this week. Nobody noticed.</p>
      ) : (
        <ul>
          {report.actionOutcomes.map((o, i) => (
            <Outcome key={o.plannedActionId ?? `${o.kind}-${i}`} outcome={o} index={i} />
          ))}
        </ul>
      )}
    </section>
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
  const paper =
    report.newspaper ?? paperFromHeadlines(report.headlines, report.simDate, report.turn);
  return (
    <div className="grid gap-6">
      <header className="text-paper-bright">
        <DisplayTitle as="h2" size="xl" slash>
          The week in Westminster
        </DisplayTitle>
        <Kicker className="mt-3 text-paper/80">
          Week {report.turn} · w/c {formatSimDate(report.simDate)} · Week {report.nextTurn} begins{' '}
          {formatSimDate(report.nextSimDate)}
        </Kicker>
      </header>

      <NewspaperPage paper={paper} campaignId={campaignId} insert={<YourWeek report={report} />} />

      {report.divisions.length > 0 && (
        <section
          aria-label={report.divisions.length === 1 ? 'The division' : 'Divisions'}
          className="grid gap-6"
        >
          {report.divisions.map((d, i) => (
            <div key={d.id} data-tutorial={i === 0 ? 'division-tally' : undefined}>
              <DivisionTally division={d} campaignId={campaignId} />
            </div>
          ))}
        </section>
      )}

      {report.notifications.length > 0 && (
        <section aria-labelledby="tr-notes">
          <h3
            id="tr-notes"
            className="mb-3 font-display text-[1.4rem] leading-none font-black text-paper-bright uppercase [font-stretch:68%]"
          >
            Also on the wires
          </h3>
          <ul className="grid gap-2 md:grid-cols-3">
            {report.notifications.map((note) => (
              <li key={note.id} className="bg-paper-deep px-3 py-2.5 text-ink">
                <p className="text-[13px] font-bold">{note.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink/80">{note.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * THE WEEK IN WESTMINSTER: a full-screen results takeover after END WEEK. Continue (Enter, or
 * Esc) returns to the office for the new week.
 */
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
  const continueRef = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  // The paper turns, the stamps land, the bell rings: once per opening, in step with the reveal.
  useSoundCues(report ? reportSoundCues(report, reduced) : [], open && !!report);
  if (!report) return null;
  return (
    <DispatchFrame
      open={open}
      onOpenChange={onOpenChange}
      size="full"
      tone="desk"
      title="The week in Westminster"
      initialFocus={continueRef}
      header={
        <div className="flex h-12 shrink-0 items-center justify-between gap-4 bg-ink px-4 md:px-6">
          <DispatchTitle className="font-display text-xl leading-none font-black text-paper-bright uppercase [font-stretch:70%]">
            <span className="sr-only">The week in Westminster: results for week {report.turn}</span>
            <span aria-hidden="true">
              Results <span className="text-paper/60">· week {report.turn}</span>
            </span>
          </DispatchTitle>
          <ResourceCounter
            size="sm"
            label="Capital"
            value={signed(report.capitalChange)}
            icon={<CapitalIcon className="text-lamp" />}
            aria-label={`Political capital ${signed(report.capitalChange)} this week`}
            role="group"
            className="text-paper-bright"
          />
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
          <p className="text-[12px] font-bold tracking-[0.06em] text-paper/80 uppercase max-sm:hidden">
            Week {report.nextTurn} · {formatSimDate(report.nextSimDate)}
          </p>
          <button
            ref={continueRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-14 cursor-pointer items-center gap-4 bg-whip pr-5 pl-7 font-display text-[1.75rem] leading-none font-black text-white uppercase [font-stretch:68%] [clip-path:polygon(0.9rem_0,100%_0,100%_100%,0_100%)] hover:bg-whip-dark focus-visible:outline-3 focus-visible:-outline-offset-6 focus-visible:outline-paper-bright max-sm:w-full max-sm:justify-center"
          >
            Continue to week {report.nextTurn}
            <Keycap
              aria-hidden="true"
              className="h-7 gap-1 border-white/80 bg-transparent px-2 text-white"
            >
              <ReturnKeyIcon />
            </Keycap>
          </button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[78rem] px-3 py-5 md:px-8 md:py-8">
        <TurnReportContent report={report} campaignId={campaignId} />
      </div>
    </DispatchFrame>
  );
}
