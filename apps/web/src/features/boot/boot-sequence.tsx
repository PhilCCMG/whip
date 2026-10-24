import { cn, Keycap } from '@whip/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import studioLogo from '../../assets/ccmg-logo-white.svg';
import { SlashCursor } from '../main-menu/menu-list';
import { signalBootReady } from '../../platform/boot';
import { markBootSeen, shouldShowBoot } from './environment';
import {
  AFFILIATION_NOTICE,
  COPYRIGHT,
  FICTION_NOTICE,
  LEGAL_HEADING,
  PHOTOSENSITIVITY_NOTICE,
  STUDIO_CAPTION,
  STUDIO_NAME,
} from './legal-copy';
import { BOOT_CARDS, BOOT_FADE_MS, BOOT_SKIP_AFTER_MS } from './timing';

type CardId = (typeof BOOT_CARDS)[number]['id'];

function StudioCard() {
  return (
    <div className="flex flex-col items-center gap-6">
      <img src={studioLogo} alt={STUDIO_NAME} className="h-auto w-[min(72vw,28rem)]" />
      <p className="text-[12px] font-bold tracking-[0.18em] text-paper/75 uppercase">
        {STUDIO_CAPTION}
      </p>
    </div>
  );
}

function LegalCard() {
  return (
    <div className="w-[min(100%,38rem)] text-left">
      <h2 className="flex items-start gap-3 font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-[0.95] font-black text-paper-bright uppercase [font-stretch:70%]">
        <SlashCursor className="h-[0.9em] w-auto shrink-0" />
        {LEGAL_HEADING}
      </h2>
      <div className="mt-5 grid gap-3 text-[14px] leading-relaxed text-paper/85">
        <p>{FICTION_NOTICE}</p>
        <p>{AFFILIATION_NOTICE}</p>
        <p className="border-t border-paper/20 pt-3">
          <strong className="font-semibold text-paper-bright">
            {PHOTOSENSITIVITY_NOTICE.split(':')[0]}:
          </strong>
          {PHOTOSENSITIVITY_NOTICE.slice(PHOTOSENSITIVITY_NOTICE.indexOf(':') + 1)}
        </p>
      </div>
      <p className="mt-6 text-[12px] font-semibold text-paper/65">{COPYRIGHT}</p>
    </div>
  );
}

const CARD_VIEW: Record<CardId, () => ReactNode> = { studio: StudioCard, legal: LegalCard };

/**
 * Console-style boot: studio card, then the fiction / photosensitivity notice. Any key, click or
 * tap skips the current card once it has been up for a second. Input is captured so it never
 * reaches the title screen underneath.
 */
export function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [{ index, visible, canSkip }, setCard] = useState({
    index: 0,
    visible: false,
    canSkip: false,
  });
  const shownAt = useRef(0);
  const done = useRef(false);

  const next = useCallback(() => {
    if (done.current) return;
    if (index + 1 < BOOT_CARDS.length) {
      setCard({ index: index + 1, visible: false, canSkip: false });
    } else {
      done.current = true;
      onComplete();
    }
  }, [index, onComplete]);

  useEffect(() => {
    const card = BOOT_CARDS[index];
    if (!card) return;
    shownAt.current = Date.now();
    const timers = [
      setTimeout(() => setCard((c) => ({ ...c, visible: true })), 20),
      setTimeout(() => setCard((c) => ({ ...c, canSkip: true })), BOOT_SKIP_AFTER_MS),
      setTimeout(() => setCard((c) => ({ ...c, visible: false })), BOOT_FADE_MS + card.hold),
      setTimeout(next, BOOT_FADE_MS * 2 + card.hold),
    ];
    return () => timers.forEach(clearTimeout);
  }, [index, next]);

  // First painted frame: the desktop shell shows its window on this (no white flash).
  useEffect(() => signalBootReady(), []);

  useEffect(() => {
    const onInput = (e: Event) => {
      if (e instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      if (e.type === 'keyup') return;
      if (Date.now() - shownAt.current >= BOOT_SKIP_AFTER_MS) next();
    };
    const types = ['keydown', 'keyup', 'pointerdown', 'click'] as const;
    for (const t of types) window.addEventListener(t, onInput, { capture: true });
    return () => {
      for (const t of types) window.removeEventListener(t, onInput, { capture: true });
    };
  }, [next]);

  const card = BOOT_CARDS[index];
  const View = card ? CARD_VIEW[card.id] : null;
  return (
    <div
      data-testid="boot-sequence"
      className="fixed inset-0 z-[100] flex flex-col bg-ink px-4 text-paper"
    >
      <div
        key={card?.id}
        aria-live="polite"
        className={cn(
          'flex flex-1 items-center justify-center transition-opacity ease-out',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        style={{ transitionDuration: `${BOOT_FADE_MS}ms` }}
      >
        {View && <View />}
      </div>
      <p
        aria-hidden="true"
        className={cn(
          'flex h-14 items-center justify-end gap-2 md:px-[clamp(1.5rem,4vw,4rem)] text-[11px] font-bold tracking-[0.06em] text-paper/70 uppercase transition-opacity duration-300',
          canSkip ? 'opacity-100' : 'opacity-0',
        )}
      >
        <Keycap>Any key</Keycap> Skip
      </p>
    </div>
  );
}

/** Renders the app with the boot sequence on top when this launch or session needs it. */
export function BootGate({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(shouldShowBoot);
  useEffect(() => {
    if (show) markBootSeen();
    else signalBootReady();
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {children}
      {show && <BootSequence onComplete={() => setShow(false)} />}
    </>
  );
}
