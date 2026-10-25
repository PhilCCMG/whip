import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { setApiFetch } from '../api/runtime';
import { Providers } from '../app';
import { uiSound } from '../features/audio/use-ui-sound';
import { createQueryClient } from '../lib/query-client';
import { createMockBackend } from '../mocks/backend';
import { CAMPAIGN_ID, careerOverviewFixture } from '../mocks/fixtures';
import { useEndWeek } from './use-end-week';

let click: MockInstance<() => boolean>;
let whoosh: MockInstance<() => boolean>;
let stampHeavy: MockInstance<() => boolean>;

beforeEach(() => {
  click = vi.spyOn(uiSound, 'click').mockReturnValue(true);
  whoosh = vi.spyOn(uiSound, 'whoosh').mockReturnValue(true);
  stampHeavy = vi.spyOn(uiSound, 'stampHeavy').mockReturnValue(true);
  setApiFetch(createMockBackend({ latencyMs: 0 }).fetch);
});
afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  return <Providers client={createQueryClient()}>{children}</Providers>;
}

const clear = {
  ...careerOverviewFixture,
  diary: { ...careerOverviewFixture.diary, slotsUsed: careerOverviewFixture.diary.slotsTotal },
  pendingEvents: [],
};

describe('END WEEK sounds', () => {
  it('stamps (no click) when the week ends straight away', () => {
    const { result } = renderHook(() => useEndWeek(CAMPAIGN_ID, clear), { wrapper });
    act(() => result.current.request());
    expect(stampHeavy).toHaveBeenCalledTimes(1);
    expect(whoosh).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });

  it('only clicks when the confirm opens; stamps once the week is actually ended', () => {
    const { result } = renderHook(() => useEndWeek(CAMPAIGN_ID, careerOverviewFixture), {
      wrapper,
    });
    act(() => result.current.request());
    expect(result.current.confirming).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(stampHeavy).not.toHaveBeenCalled();
    expect(whoosh).not.toHaveBeenCalled();

    // "End week anyway" (or E again).
    act(() => result.current.confirm());
    expect(stampHeavy).toHaveBeenCalledTimes(1);
    expect(whoosh).toHaveBeenCalledTimes(1);
  });

  it('does not stamp when the confirm is cancelled', () => {
    const { result } = renderHook(() => useEndWeek(CAMPAIGN_ID, careerOverviewFixture), {
      wrapper,
    });
    act(() => result.current.request());
    act(() => result.current.cancel());
    expect(stampHeavy).not.toHaveBeenCalled();
  });
});
