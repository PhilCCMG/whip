import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootGate, BootSequence } from './boot-sequence';
import { FICTION_NOTICE, LEGAL_HEADING, PHOTOSENSITIVITY_NOTICE } from './legal-copy';
import { BOOT_CARDS, BOOT_FADE_MS } from './timing';

const cardTime = (i: number) => BOOT_FADE_MS * 2 + (BOOT_CARDS[i]?.hold ?? 0);

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => void act(() => vi.advanceTimersByTime(ms));
const press = (key = 'Enter') =>
  void act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });

describe('boot sequence', () => {
  it('runs studio card, then the legal notice, then completes', () => {
    const done = vi.fn();
    render(<BootSequence onComplete={done} />);
    expect(screen.getByRole('img', { name: 'CheatCode Media Group Ltd' })).toBeInTheDocument();

    tick(cardTime(0));
    expect(screen.getByRole('heading', { name: LEGAL_HEADING })).toBeInTheDocument();
    expect(screen.getByText(FICTION_NOTICE)).toBeInTheDocument();
    expect(screen.getByText(/consult a doctor/).closest('p')).toHaveTextContent(
      PHOTOSENSITIVITY_NOTICE,
    );
    expect(
      screen.getByText('© 2026 CheatCode Media Group Ltd. All rights reserved.'),
    ).toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();

    tick(cardTime(1));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('is skippable card by card after a second, and swallows the key', () => {
    const done = vi.fn();
    const underneath = vi.fn();
    window.addEventListener('keydown', underneath);
    render(<BootSequence onComplete={done} />);

    press(); // too early: ignored
    expect(screen.queryByRole('heading', { name: LEGAL_HEADING })).not.toBeInTheDocument();
    tick(1000);
    press();
    expect(screen.getByRole('heading', { name: LEGAL_HEADING })).toBeInTheDocument();
    tick(1000);
    void act(() => {
      window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(done).toHaveBeenCalledTimes(1);
    expect(underneath).not.toHaveBeenCalled();
    window.removeEventListener('keydown', underneath);
  });

  it('signals boot-ready once painted', () => {
    const ready = vi.fn();
    window.addEventListener('whip:boot-ready', ready);
    render(<BootSequence onComplete={() => {}} />);
    tick(100);
    expect(ready).toHaveBeenCalled();
    window.removeEventListener('whip:boot-ready', ready);
  });

  it('shows once per browser session on the web', () => {
    const first = render(
      <BootGate>
        <p>app</p>
      </BootGate>,
    );
    expect(screen.getByTestId('boot-sequence')).toBeInTheDocument();
    expect(screen.getByText('app')).toBeInTheDocument();
    tick(cardTime(0));
    tick(cardTime(1));
    expect(screen.queryByTestId('boot-sequence')).not.toBeInTheDocument();
    first.unmount();

    render(
      <BootGate>
        <p>app</p>
      </BootGate>,
    );
    expect(screen.queryByTestId('boot-sequence')).not.toBeInTheDocument();
  });
});
