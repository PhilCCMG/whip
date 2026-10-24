import { useEffect, useRef } from 'react';

/** Calls `onVisible` when the returned ref's element scrolls into view (infinite scroll). */
export function useSentinel<T extends Element>(onVisible: () => void, enabled: boolean) {
  const ref = useRef<T>(null);
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) callback.current();
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}
