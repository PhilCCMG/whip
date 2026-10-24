import { cn } from '@whip/ui';
import { memo, useState } from 'react';
import menuBg from '../../assets/menu-bg.jpg';

export type BackdropMode = 'title' | 'menu' | 'screen';

/**
 * The front-end painting: Westminster at dusk, seen from a doorway. Full-bleed and anchored
 * right of centre so the palace, Elizabeth Tower and the figure with the despatch box stay in
 * frame; narrow screens crop towards the figure and the tower. Flat ink underneath while it
 * loads, a flat ink veil (never a gradient) on sub-screens, and a slow drift that the global
 * reduced-motion rules switch off.
 */
export const MenuBackdrop = memo(function MenuBackdrop({
  mode,
  className,
}: {
  mode: BackdropMode;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none inset-0 overflow-hidden bg-ink', className)}
    >
      <div
        className={cn(
          'absolute inset-0 transition-[scale,translate] duration-[1600ms] ease-[cubic-bezier(0.25,0.8,0.25,1)]',
          mode === 'title' ? 'scale-100' : 'scale-[1.04] md:-translate-x-[1%]',
        )}
      >
        <img
          src={menuBg}
          alt=""
          width={1672}
          height={941}
          decoding="async"
          fetchPriority="high"
          onLoad={() => setLoaded(true)}
          className={cn(
            'absolute inset-0 size-full animate-[whip-drift_60s_ease-in-out_infinite_alternate] object-cover object-[90%_50%] transition-opacity duration-700 md:object-[62%_50%]',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>
      {/* Flat veil for sub-screens: one solid ink layer at partial opacity. */}
      <div
        className={cn(
          'absolute inset-0 bg-ink transition-opacity duration-500',
          mode === 'screen' ? 'opacity-40' : 'opacity-0',
        )}
      />
    </div>
  );
});
