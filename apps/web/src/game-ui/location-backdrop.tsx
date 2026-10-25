import { cn } from '@whip/ui';
import { useEffect, useState } from 'react';
import { useReducedMotion } from '../stores/settings-store';
import { SCENES, sceneSrcSet, type SceneKey } from './scenes';

/**
 * A painting as a decorative image filling its (positioned) parent: empty alt, aria-hidden,
 * absolutely placed so it never moves layout. Hidden until it has loaded, so the parent's solid
 * colour shows first.
 */
export function SceneImage({
  scene,
  sizes = '100vw',
  loading,
  className,
  onLoad,
  visible,
}: {
  scene: SceneKey;
  sizes?: string;
  loading?: 'lazy' | 'eager';
  className?: string;
  onLoad?: () => void;
  /** Controlled visibility (the cross-fade); otherwise visible once loaded. */
  visible?: boolean;
}) {
  const art = SCENES[scene];
  const [loaded, setLoaded] = useState(false);
  const shown = visible ?? loaded;
  return (
    <img
      src={art.src960}
      srcSet={sceneSrcSet(art)}
      sizes={sizes}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      data-scene={scene}
      {...(loading ? { loading } : {})}
      // A cached image can finish before React attaches onLoad: check on mount too.
      ref={(img) => {
        if (img?.complete && img.naturalWidth > 0 && !loaded) {
          setLoaded(true);
          onLoad?.();
        }
      }}
      onLoad={() => {
        setLoaded(true);
        onLoad?.();
      }}
      className={cn(
        'pointer-events-none absolute inset-0 size-full object-cover select-none',
        shown ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={{ objectPosition: art.crop }}
    />
  );
}

/** How long the tab-change cross-fade takes (matches `duration-[240ms]`); reduced motion swaps at once. */
const FADE_MS = 240;

/**
 * The current place's painting behind the whole screen, faded under a flat ink scrim so panels
 * and text keep their contrast (docs/architecture/09-game-ui.md §Art). Only the current scene's
 * image is in the DOM (plus the outgoing one while it fades), so nothing else is fetched.
 * Changing scene cross-fades quickly: the new painting fades in over the old once it has loaded;
 * under reduced motion (setting or OS) it swaps without animating.
 */
export function LocationBackdrop({ scene, className }: { scene: SceneKey; className?: string }) {
  const reduced = useReducedMotion();
  // `outgoing`: the painting still showing underneath while the new one loads and fades in.
  const [layers, setLayers] = useState<{ current: SceneKey; outgoing: SceneKey | null }>({
    current: scene,
    outgoing: null,
  });
  const [ready, setReady] = useState(false);

  // Adjust state while rendering when the scene changes (no effect round-trip, no flash).
  if (layers.current !== scene) {
    setLayers({ current: scene, outgoing: ready ? layers.current : layers.outgoing });
    setReady(false);
  }

  const { current } = layers;
  // Reduced motion: the old painting goes the moment the new one is ready (no fade to wait for).
  const outgoing = reduced && ready ? null : layers.outgoing;
  useEffect(() => {
    if (!ready || !outgoing) return;
    const t = window.setTimeout(() => setLayers((l) => ({ ...l, outgoing: null })), FADE_MS + 60);
    return () => window.clearTimeout(t);
  }, [ready, outgoing]);

  return (
    <div
      aria-hidden="true"
      data-testid="location-backdrop"
      data-scene={current}
      className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-ink', className)}
    >
      {outgoing && <SceneImage key={outgoing} scene={outgoing} visible />}
      <SceneImage
        key={current}
        scene={current}
        visible={ready}
        onLoad={() => setReady(true)}
        className={cn(!reduced && 'transition-opacity duration-[240ms] ease-out')}
      />
      {/* The scrim: one flat ink layer. Never a gradient. */}
      <div className="absolute inset-0 bg-ink/[0.86]" />
    </div>
  );
}
