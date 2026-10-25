import { useEffect, useState } from 'react';
import { useReducedMotion } from '../stores/settings-store';

/**
 * A number that counts up from zero once, for results reveals (division tallies). While it runs,
 * the moving figure is hidden from assistive tech and the final value is read instead; once it
 * lands it is a plain number. Reduced motion (setting or OS): the final value, straight away.
 */
export function CountUp({
  value,
  durationMs = 1400,
  delayMs = 0,
}: {
  value: number;
  durationMs?: number;
  delayMs?: number;
}) {
  const reduced = useReducedMotion();
  const canAnimate = !reduced && typeof requestAnimationFrame === 'function';
  const [shown, setShown] = useState<number | null>(canAnimate ? 0 : null);

  useEffect(() => {
    if (!canAnimate) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      start ??= t + delayMs;
      const p = Math.min(1, Math.max(0, (t - start) / durationMs));
      // Ease out: quick at first, settling on the result like a teller's final count.
      if (p >= 1) return setShown(null);
      setShown(Math.round(value * (1 - (1 - p) ** 3)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canAnimate, value, durationMs, delayMs]);

  if (shown === null || !canAnimate) return <>{value}</>;
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}
