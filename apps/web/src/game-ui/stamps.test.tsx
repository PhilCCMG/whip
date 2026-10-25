import { render, screen } from '@testing-library/react';
import { Stamp } from '@whip/ui';
import { describe, expect, it } from 'vitest';
import { OUTCOME_STAMP, STAMPS, stampImage, verdictStamp } from './stamps';

describe('Stamp with an inked mark', () => {
  it('keeps the word as its text and hides the picture from assistive tech', () => {
    render(
      <p data-testid="row">
        <Stamp tone="good" size="sm" image={STAMPS.success} className="animate-stamp">
          Success
        </Stamp>
      </p>,
    );
    const row = screen.getByTestId('row');
    expect(row).toHaveTextContent('Success');
    expect(screen.getByText('Success')).toHaveClass('sr-only');
    const img = row.querySelector('img')!;
    expect(img).toHaveAttribute('src', STAMPS.success.src);
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    // Nothing else is announced: no image role, the word is the name.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('keeps its animation class and timing on the stamp itself', () => {
    render(
      <Stamp
        image={STAMPS.carried}
        className="animate-stamp"
        style={{ animationDelay: '1900ms' }}
        data-testid="stamp"
      >
        Carried
      </Stamp>,
    );
    const stamp = screen.getByTestId('stamp');
    expect(stamp).toHaveClass('animate-stamp');
    expect(stamp.style.animationDelay).toBe('1900ms');
  });

  it('stays type-set without one', () => {
    render(<Stamp tone="bad">Refused</Stamp>);
    const stamp = screen.getByText('Refused');
    expect(stamp).not.toHaveClass('sr-only');
    expect(stamp.querySelector('img')).toBeNull();
    expect(stamp).toHaveClass('border-whip');
  });
});

describe('which mark a word gets', () => {
  it.each([
    ['Success', 'success'],
    ['PARTIAL', 'partial'],
    ['Failed', 'failed'],
    ['Backfired', 'backfired'],
    ['Defeated', 'defeated'],
    ['Carried', 'carried'],
    ['Noted', 'noted'],
    ['Division', 'division'],
    ['Confidential', 'confidential'],
  ] as const)('%s prints the %s mark', (word, key) => {
    expect(stampImage(word)).toBe(STAMPS[key]);
  });

  it('leaves words without a mark type-set', () => {
    for (const word of ['Refused', 'Royal Assent', 'Appointed', 'Scandal'])
      expect(stampImage(word)).toBeUndefined();
  });

  it('maps each action outcome to the mark that prints its word', () => {
    expect(OUTCOME_STAMP.succeeded).toEqual({
      text: 'Success',
      tone: 'good',
      image: STAMPS.success,
    });
    expect(OUTCOME_STAMP.partial).toEqual({
      text: 'Partial',
      tone: 'warning',
      image: STAMPS.partial,
    });
    expect(OUTCOME_STAMP.failed).toEqual({ text: 'Failed', tone: 'bad', image: STAMPS.failed });
    // A refused action has no inked REFUSED mark: it keeps the type-set stamp, not FAILED.
    expect(OUTCOME_STAMP.rejected).toEqual({ text: 'Refused', tone: 'bad' });
  });

  it('stamps the ayes having it CARRIED and the noes having it DEFEATED', () => {
    expect(verdictStamp({ passed: true })).toEqual({
      text: 'Carried',
      tone: 'paper',
      image: STAMPS.carried,
    });
    expect(verdictStamp({ passed: false })).toEqual({
      text: 'Defeated',
      tone: 'bad',
      image: STAMPS.defeated,
    });
  });

  it('keeps the round seals for seals, not words', () => {
    expect(STAMPS['noted-round'].round).toBe(true);
    expect(STAMPS['division-round'].round).toBe(true);
    expect(stampImage('Noted')).toBe(STAMPS.noted);
  });
});
