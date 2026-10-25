import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uiSound } from '../features/audio/use-ui-sound';
import { VERDICT_STAMP_DELAY_MS } from '../game-ui/division-tally';
import { CAMPAIGN_ID, turnReportFixture } from '../mocks/fixtures';
import { useSettingsStore } from '../stores/settings-store';
import { TurnReportDialog } from './turn-report';
import {
  BELL_MS,
  OUTCOME_STAMP_DELAY_MS,
  OUTCOME_STAMP_STEP_MS,
  reportSoundCues,
  STAMP_IMPACT_MS,
} from './turn-report-sounds';

const outcome = turnReportFixture.actionOutcomes[0]!;
const many = { actionOutcomes: Array.from({ length: 7 }, () => outcome), divisions: [] };
const at = (cues: ReturnType<typeof reportSoundCues>, sound: string) =>
  cues.filter((c) => c.sound === sound).map((c) => c.at);

describe('reportSoundCues', () => {
  it('turns the page first, then stamps in step with the stamp animation, capped at three', () => {
    const cues = reportSoundCues(many, false);
    expect(cues[0]).toEqual({ at: 0, sound: 'page-turn' });
    const stamps = at(cues, 'stamp');
    expect(stamps).toEqual(
      [0, 1, 2].map((i) => OUTCOME_STAMP_DELAY_MS + i * OUTCOME_STAMP_STEP_MS + STAMP_IMPACT_MS),
    );
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i]! - stamps[i - 1]!).toBeGreaterThanOrEqual(250);
    }
  });

  it('plays one stamp under reduced motion', () => {
    expect(at(reportSoundCues(many, true), 'stamp')).toHaveLength(1);
  });

  it('rings the bell once for the division, then declares it as the verdict stamp lands', () => {
    const cues = reportSoundCues(
      {
        ...turnReportFixture,
        divisions: [...turnReportFixture.divisions, ...turnReportFixture.divisions],
      },
      false,
    );
    const [bell] = at(cues, 'division-bell');
    const [verdict] = at(cues, 'stamp-heavy');
    expect(at(cues, 'division-bell')).toHaveLength(1);
    expect(bell).toBeGreaterThan(Math.max(...at(cues, 'stamp')));
    expect(verdict).toBe(VERDICT_STAMP_DELAY_MS + STAMP_IMPACT_MS);
    expect(verdict).toBeGreaterThan(bell!);
  });

  it('declares the result after the bell under reduced motion', () => {
    const cues = reportSoundCues(turnReportFixture, true);
    const [bell] = at(cues, 'division-bell');
    expect(at(cues, 'stamp-heavy')).toEqual([bell! + BELL_MS]);
  });

  it('has no bell or verdict in a week without a division', () => {
    const cues = reportSoundCues({ ...turnReportFixture, divisions: [] }, false);
    expect(at(cues, 'division-bell')).toEqual([]);
    expect(at(cues, 'stamp-heavy')).toEqual([]);
  });
});

describe('TurnReportDialog sounds', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useSettingsStore.setState({ motion: 'full' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useSettingsStore.setState({ motion: 'system' });
  });

  it('plays the report’s cues when it opens, and stops them when it closes', () => {
    const page = vi.spyOn(uiSound, 'pageTurn').mockReturnValue(true);
    const stamp = vi.spyOn(uiSound, 'stamp').mockReturnValue(true);
    const bell = vi.spyOn(uiSound, 'divisionBell').mockReturnValue(true);
    const heavy = vi.spyOn(uiSound, 'stampHeavy').mockReturnValue(true);
    const props = { report: turnReportFixture, campaignId: CAMPAIGN_ID, onOpenChange: () => {} };
    const { rerender } = render(<TurnReportDialog {...props} open={false} />, {
      wrapper: MemoryRouter,
    });
    vi.advanceTimersByTime(3000);
    expect(page).not.toHaveBeenCalled();

    rerender(<TurnReportDialog {...props} open />);
    vi.advanceTimersByTime(1500);
    expect(page).toHaveBeenCalledTimes(1);
    expect(stamp).toHaveBeenCalledTimes(Math.min(3, turnReportFixture.actionOutcomes.length));
    expect(bell).toHaveBeenCalledTimes(1);

    rerender(<TurnReportDialog {...props} open={false} />);
    vi.advanceTimersByTime(3000);
    expect(heavy).not.toHaveBeenCalled();
  });
});
