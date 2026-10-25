import { cn, Keycap, Portrait, ReturnKeyIcon, Slash, Stamp } from '@whip/ui';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { isEditable, modalOpen } from '../../game-ui/keys';
import { PLACES } from '../../game-ui/places';
import { useReducedMotion } from '../../stores/settings-store';
import { uiSound } from '../audio/use-ui-sound';
import { HUD_TOUR, LINES, MENTOR, UI } from './copy';
import { selectActive, stepNumber } from './engine';
import { MOBILE_BREAKPOINT, placeCard, type Rect } from './placement';
import { TOTAL_STEPS, type TutorialStep } from './steps';
import { setTutorialEscape, useTutorialSession } from './store';
import type { TutorialController } from './use-tutorial';

/* ----------------------------------------------------------------------------
 * Reading the screen: which targets are visible, where they are, where to dock
 * ------------------------------------------------------------------------- */

interface Scan {
  key: string;
  present: Set<string>;
  rects: Record<string, Rect & { inView: boolean }>;
  /** Actionable UI the floating card must never cover (`data-tutorial-avoid`). */
  avoid: Rect[];
  /** The open modal's dock for the card (DispatchFrame renders it). */
  slot: HTMLElement | null;
  viewport: { width: number; height: number };
}

const EMPTY: Scan = {
  key: '',
  present: new Set(),
  rects: {},
  avoid: [],
  slot: null,
  viewport: { width: 1280, height: 800 },
};

const visible = (el: Element) =>
  typeof (el as HTMLElement).checkVisibility === 'function'
    ? (el as HTMLElement).checkVisibility()
    : true;

function scanDom(): Scan {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const dialog = dialogs[dialogs.length - 1] ?? null;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const present = new Set<string>();
  const rects: Scan['rects'] = {};
  // Only the top layer counts: with a modal open, targets behind it are not "on screen".
  for (const el of (dialog ?? document).querySelectorAll('[data-tutorial]')) {
    const id = el.getAttribute('data-tutorial');
    if (!id || present.has(id) || !visible(el)) continue;
    if (!dialog && el.closest('[role="dialog"]')) continue;
    const r = el.getBoundingClientRect();
    // Clipped by the scroller it lives in: the desk, or a modal's body.
    const scroller = el.closest('#main, .overflow-y-auto');
    const clip = scroller?.getBoundingClientRect() ?? { top: 0, bottom: viewport.height };
    const inView = r.bottom > clip.top + 8 && r.top < clip.bottom - 8;
    present.add(id);
    rects[id] = { left: r.left, top: r.top, width: r.width, height: r.height, inView };
  }
  const avoid: Rect[] = [];
  for (const el of (dialog ?? document).querySelectorAll('[data-tutorial-avoid]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > viewport.height) continue;
    avoid.push({ left: r.left, top: r.top, width: r.width, height: r.height });
  }
  const slot = dialog?.querySelector<HTMLElement>('[data-tutorial-slot]') ?? null;
  const key = JSON.stringify([
    viewport,
    !!slot,
    avoid.map((r) => [Math.round(r.left), Math.round(r.top)]),
    Object.entries(rects).map(([k, r]) => [
      k,
      Math.round(r.left),
      Math.round(r.top),
      Math.round(r.width),
      Math.round(r.height),
      r.inView,
    ]),
  ]);
  return { key, present, rects, avoid, slot, viewport };
}

/** Re-reads the screen a few times a second (and on scroll/resize). Cheap: a handful of nodes. */
function useScan(enabled: boolean): Scan {
  const [scan, setScan] = useState<Scan>(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let last = '';
    let slot: HTMLElement | null = null;
    const tick = () => {
      const next = scanDom();
      if (next.key === last && next.slot === slot) return;
      last = next.key;
      slot = next.slot;
      setScan(next);
    };
    tick();
    const id = window.setInterval(tick, 200);
    window.addEventListener('resize', tick);
    window.addEventListener('scroll', tick, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', tick);
      window.removeEventListener('scroll', tick, true);
    };
  }, [enabled]);
  return enabled ? scan : EMPTY;
}

/** Bring a desk target into the middle of the screen (only the desk scrolls; the shell never). */
function scrollToCentre(el: HTMLElement, reduced: boolean) {
  const main = el.closest<HTMLElement>('#main, .overflow-y-auto');
  if (!main) return el.scrollIntoView({ block: 'nearest' });
  const r = el.getBoundingClientRect();
  const m = main.getBoundingClientRect();
  const top = main.scrollTop + r.top - m.top - Math.max(16, (m.height - r.height) / 2);
  main.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
}

/* ----------------------------------------------------------------------------
 * Pieces
 * ------------------------------------------------------------------------- */

const btn =
  'flex h-10 cursor-pointer items-center gap-2 px-4 font-display text-lg leading-none font-black uppercase [font-stretch:72%] focus-visible:outline-3 focus-visible:outline-offset-2';

function NamePlate({ counter, compact = false }: { counter: string; compact?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
      <p className="min-w-0">
        <span className="inline-block bg-paper-bright py-1 pr-4 pl-2 whitespace-nowrap font-display text-[1.05rem] leading-none font-black text-ink uppercase [clip-path:polygon(0_0,100%_0,calc(100%-0.6rem)_100%,0_100%)] [font-stretch:72%]">
          {MENTOR.name}
        </span>
        <span className="sr-only"> · </span>
        <span
          className={cn(
            'block text-[10px] leading-none font-bold tracking-[0.12em] whitespace-nowrap text-lamp uppercase',
            compact ? 'mt-1' : 'mt-1.5',
          )}
        >
          {MENTOR.title}
        </span>
      </p>
      <span className="shrink-0 pt-0.5 text-[10px] leading-none font-bold tracking-[0.1em] text-paper/75 uppercase tabular-nums">
        {counter}
      </span>
    </div>
  );
}

function SkipConfirm({ onKeep, onSkip }: { onKeep: () => void; onSkip: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => keepRef.current?.focus({ preventScroll: true }), []);
  return (
    <div role="group" aria-label={UI.confirmTitle} className="bg-whip px-4 py-3 text-white">
      <p className="font-display text-xl leading-none font-black uppercase [font-stretch:70%]">
        {UI.confirmTitle}
      </p>
      <p className="mt-1 text-[12.5px] leading-snug font-semibold text-white/90">
        {UI.confirmBody}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          ref={keepRef}
          type="button"
          onClick={onKeep}
          className="h-10 cursor-pointer border-2 border-white px-3 text-[13px] font-bold uppercase hover:bg-white hover:text-whip focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {UI.confirmKeep}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="h-10 cursor-pointer bg-ink px-3 text-[13px] font-bold text-paper-bright uppercase hover:bg-moss-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {UI.confirmSkip}
        </button>
      </div>
    </div>
  );
}

interface CardProps {
  compact?: boolean;
  step: TutorialStep;
  counter: string;
  title?: string | undefined;
  line: string;
  where?: string | undefined;
  primaryLabel: string;
  enterHint: boolean;
  onPrimary: () => void;
  showMe?: (() => void) | undefined;
  targetId: string | undefined;
  confirming: boolean;
  onAskSkip: () => void;
  onKeep: () => void;
  onSkip: () => void;
}

/** Bramley's mentor card: portrait, name plate, the line, and Got it / Skip. */
function MentorCard({
  variant,
  style,
  cardRef,
  ...p
}: CardProps & {
  variant: 'float' | 'inline';
  style?: CSSProperties | undefined;
  cardRef?: RefObject<HTMLElement | null>;
}) {
  const lineId = useId();
  const inline = variant === 'inline';
  // Phones get a compact card (it docks bottom-left, above END WEEK).
  const compact = variant === 'float' && p.compact;
  return (
    <aside
      ref={cardRef}
      aria-label={UI.regionLabel}
      aria-describedby={lineId}
      data-tutorial-card=""
      data-step={p.step.id}
      data-target={p.targetId ?? ''}
      data-sfx="off"
      style={style}
      className={cn(
        'bg-ink text-paper outline-2 -outline-offset-2 outline-paper/25',
        inline
          ? 'relative mx-4 mb-4 md:mx-6'
          : 'fixed z-[33] w-[min(23rem,calc(100vw-2rem))] motion-safe:animate-in-fade',
      )}
    >
      <div aria-hidden="true" className="h-1.5 bg-whip" />
      <div
        className={cn(
          'grid',
          compact ? 'gap-2 p-3' : 'gap-3 p-4',
          inline && 'md:grid-cols-[minmax(0,1fr)_auto] md:items-end',
        )}
      >
        <div className={cn('flex items-start gap-3', inline && 'md:col-span-2')}>
          <Portrait
            seed={MENTOR.seed}
            partyColour={MENTOR.partyColour}
            size="md"
            className={cn('shrink-0', compact ? 'size-9' : 'size-12')}
          />
          <NamePlate counter={p.counter} compact={inline} />
        </div>
        <div>
          {p.title && (
            <p className="mb-1 font-display text-[1.25rem] leading-none font-black text-paper-bright uppercase [font-stretch:70%]">
              {p.title}
            </p>
          )}
          <p
            id={lineId}
            aria-live="polite"
            className={cn(
              'max-w-[60ch] text-paper-bright',
              compact ? 'text-[13px] leading-[1.45]' : 'text-[14px] leading-[1.55]',
            )}
          >
            {p.line}
          </p>
          {p.where && (
            <p className="mt-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-lamp uppercase">
              <Slash aria-hidden="true" className="h-3.5 w-auto" />
              {p.where}
            </p>
          )}
        </div>
        {!p.confirming && (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
              inline && 'md:justify-end',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={p.onPrimary}
                className={cn(
                  btn,
                  'bg-paper-bright text-ink hover:bg-white focus-visible:outline-whip',
                )}
              >
                {p.primaryLabel}
                {p.enterHint && (
                  <Keycap aria-hidden="true" tone="light" className="h-5 min-w-5 text-[10px]">
                    <ReturnKeyIcon />
                  </Keycap>
                )}
              </button>
              {p.showMe && (
                <button
                  type="button"
                  onClick={p.showMe}
                  className={cn(
                    btn,
                    'text-paper-bright outline-2 -outline-offset-2 outline-paper/40 hover:bg-paper/10 focus-visible:outline-whip',
                  )}
                >
                  Show me
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={p.onAskSkip}
              className="h-10 cursor-pointer px-1 text-[11px] font-bold tracking-[0.08em] text-paper/75 uppercase hover:text-paper-bright focus-visible:outline-2 focus-visible:outline-whip"
            >
              {UI.skip}
            </button>
          </div>
        )}
      </div>
      {p.confirming && <SkipConfirm onKeep={p.onKeep} onSkip={p.onSkip} />}
    </aside>
  );
}

/** The card put away: a small plate that brings it back. */
function Chip({
  counter,
  onOpen,
  inline,
}: {
  counter: string;
  onOpen: () => void;
  inline: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-tutorial-card=""
      data-sfx="off"
      aria-label={`${UI.reopen} (${counter})`}
      className={cn(
        'flex h-10 cursor-pointer items-center gap-2 bg-ink pr-4 pl-1 text-[11px] font-bold tracking-[0.08em] text-paper-bright uppercase outline-2 -outline-offset-2 outline-paper/30 hover:bg-moss-900 focus-visible:outline-whip',
        inline
          ? 'mx-4 mb-4 md:mx-6'
          : 'fixed bottom-[calc(7rem+0.75rem+env(safe-area-inset-bottom))] left-4 z-[33] md:bottom-[5.25rem]',
      )}
    >
      <Portrait seed={MENTOR.seed} partyColour={MENTOR.partyColour} size="sm" className="size-8" />
      <Slash aria-hidden="true" className="h-4 w-auto" />
      <span className="tabular-nums">{counter}</span>
    </button>
  );
}

/** A pulsing red slash on the target's corner (still under reduced motion). */
function Marker({ rect, reduced }: { rect: Rect; reduced: boolean }) {
  return createPortal(
    <div
      aria-hidden="true"
      data-tutorial-marker=""
      className="pointer-events-none fixed z-[55]"
      style={{ left: rect.left - 8, top: Math.max(2, rect.top - 16) }}
    >
      <Slash className={cn('h-11 w-auto', !reduced && 'animate-tutorial-pulse')} />
    </div>,
    document.body,
  );
}

/** HUD tour coach mark: flat ink dim around a hard-edged frame with a red slash corner. */
function CoachMark({ rect }: { rect: Rect }) {
  const pad = 6;
  const r = {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const dim = 'pointer-events-none fixed z-[31] bg-ink/75';
  return (
    <div aria-hidden="true" data-tutorial-coach="">
      <div className={dim} style={{ left: 0, top: 0, right: 0, height: Math.max(0, r.top) }} />
      <div className={dim} style={{ left: 0, top: r.top + r.height, right: 0, bottom: 0 }} />
      <div
        className={dim}
        style={{ left: 0, top: r.top, width: Math.max(0, r.left), height: r.height }}
      />
      <div
        className={dim}
        style={{ left: r.left + r.width, top: r.top, right: 0, height: r.height }}
      />
      <div className="pointer-events-none fixed z-[32] outline-3 outline-paper-bright" style={r}>
        <Slash className={cn('absolute -left-3 h-8 w-auto', r.top < 20 ? '-bottom-4' : '-top-4')} />
      </div>
    </div>
  );
}

function GraduationStamp({ onDone, until }: { onDone: () => void; until: number }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, Math.max(0, until - Date.now()));
    return () => window.clearTimeout(t);
  }, [onDone, until]);
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-[calc(7rem+1rem+env(safe-area-inset-bottom))] left-4 z-[33] bg-paper-bright px-4 py-3 text-ink outline-2 -outline-offset-2 outline-ink md:bottom-[6rem]"
    >
      <Stamp tone="good" size="md" angle={-5} className="animate-stamp">
        {UI.stamp}
      </Stamp>
      <p className="mt-2.5 text-[11px] font-semibold text-ink/75">
        Signed: {MENTOR.name}, {MENTOR.title}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * The layer
 * ------------------------------------------------------------------------- */

/**
 * Presents the active induction step: Bramley's card docked by its target (or inside the open
 * modal), a pulsing slash on the target, and, for the HUD tour only, coach marks. It never
 * blocks input: no overlay catches clicks, and focus is only moved for the skip confirm.
 */
export function TutorialLayer({ controller }: { controller: TutorialController }) {
  const { running, facts, completed } = controller;
  const reduced = useReducedMotion();
  const session = useTutorialSession();
  const scan = useScan(running || session.stampUntil !== null);
  const cardRef = useRef<HTMLElement | null>(null);
  const [cardSize, setCardSize] = useState({ width: 368, height: 220 });

  const step = running && facts ? selectActive(completed, facts, scan.present) : null;
  const tour = step?.kind === 'tour';
  const marks = tour ? HUD_TOUR.filter((m) => scan.present.has(m.target)) : [];
  const markIndex = Math.min(session.tourIndex, Math.max(0, marks.length - 1));
  const mark = tour ? marks[markIndex] : undefined;
  const targetId = step
    ? tour
      ? mark?.target
      : step.targets.find((t) => scan.present.has(t))
    : undefined;
  const target = targetId ? scan.rects[targetId] : undefined;
  const collapsed = !!(step && session.collapsed[step.id]);
  const confirming = session.confirmingSkip;
  const onDesk = facts?.modal === null;
  const inModal = facts?.modal === 'planner' || facts?.modal === 'report';
  const showFloat = !!step && onDesk && !collapsed;

  // Measure the floating card (its line and controls change its height) to dock it.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!showFloat || !el) return;
    const measure = () => {
      const width = el.offsetWidth || 368;
      const height = el.offsetHeight || 220;
      setCardSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showFloat]);

  const stepId = step?.id;
  // A new step starts with its card open and the tour at its first mark.
  useEffect(() => {
    useTutorialSession.setState({ confirmingSkip: false });
  }, [stepId]);

  const collapse = () => {
    if (!step) return;
    session.setCollapsed(step.id, true);
  };

  const primary = () => {
    if (!step) return;
    uiSound.click();
    if (step.kind === 'ack') controller.acknowledge(step.id);
    else if (step.kind === 'tour') {
      if (markIndex < marks.length - 1) session.setTourIndex(markIndex + 1);
      else {
        session.setTourIndex(0);
        controller.complete(['hud']);
      }
    } else {
      session.ack(step.id);
      collapse();
    }
  };
  const live = useRef({ primary, collapse, confirming, collapsed, showFloat, tour });
  useEffect(() => {
    live.current = { primary, collapse, confirming, collapsed, showFloat, tour };
  });

  // Esc: cancel the skip confirm, else put the card away. Never the induction itself.
  useEffect(() => {
    if (!showFloat) return;
    setTutorialEscape(() => {
      const s = live.current;
      if (s.confirming) {
        useTutorialSession.getState().setConfirmingSkip(false);
        return true;
      }
      if (!s.showFloat || s.collapsed) return false;
      s.collapse();
      return true;
    });
    return () => setTutorialEscape(null);
  }, [showFloat]);

  // Enter advances the HUD tour when nothing else has focus.
  useEffect(() => {
    if (!tour || !showFloat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (isEditable(e.target) || modalOpen()) return;
      e.preventDefault();
      live.current.primary();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tour, showFloat]);

  const stamp =
    session.stampUntil !== null ? (
      <GraduationStamp
        until={session.stampUntil}
        onDone={() => useTutorialSession.setState({ stampUntil: null })}
      />
    ) : null;

  if (!step || !facts) return stamp;

  const n = stepNumber(step.id);
  const counter = UI.counter(n, TOTAL_STEPS);
  const place = targetId?.startsWith('place-')
    ? PLACES.find((p) => `place-${p.key}` === targetId)
    : undefined;
  const el = targetId
    ? (scan.slot?.closest('[role="dialog"]') ?? document).querySelector<HTMLElement>(
        `[data-tutorial="${targetId}"]`,
      )
    : null;
  const lastMark = !tour || markIndex >= marks.length - 1;

  const card: CardProps = {
    step,
    counter,
    title: mark?.title,
    line: mark?.line ?? LINES[step.id],
    where: place ? UI.where(place.label, place.hotkey) : undefined,
    primaryLabel: lastMark ? UI.gotIt : UI.next,
    enterHint: tour,
    onPrimary: primary,
    showMe:
      target && !target.inView && el
        ? () => {
            uiSound.click();
            scrollToCentre(el, reduced);
          }
        : undefined,
    targetId,
    compact: scan.viewport.width < MOBILE_BREAKPOINT,
    confirming,
    onAskSkip: () => {
      uiSound.click();
      session.setConfirmingSkip(true);
    },
    onKeep: () => {
      uiSound.click();
      session.setConfirmingSkip(false);
    },
    onSkip: () => {
      uiSound.click();
      session.setConfirmingSkip(false);
      controller.skip();
    },
  };

  const expand = () => {
    uiSound.click();
    session.setCollapsed(step.id, false);
  };

  const pos = showFloat
    ? placeCard(target && target.inView ? target : null, cardSize, scan.viewport, scan.avoid)
    : null;

  return (
    <>
      {inModal &&
        scan.slot &&
        createPortal(
          collapsed ? (
            <Chip counter={counter} onOpen={expand} inline />
          ) : (
            <MentorCard variant="inline" {...card} />
          ),
          scan.slot,
        )}
      {onDesk &&
        (collapsed ? (
          <Chip counter={counter} onOpen={expand} inline={false} />
        ) : (
          <MentorCard
            variant="float"
            cardRef={cardRef}
            style={pos ? { left: pos.left, top: pos.top } : undefined}
            {...card}
          />
        ))}
      {tour && target && onDesk && !collapsed && <CoachMark rect={target} />}
      {!tour && target?.inView && (onDesk || inModal) && <Marker rect={target} reduced={reduced} />}
      {stamp}
    </>
  );
}
