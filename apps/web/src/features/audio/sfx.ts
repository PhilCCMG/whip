/**
 * UI sound effects on the Web Audio API: each sample is fetched and decoded once, then played
 * through an `AudioBufferSourceNode` → per-category `GainNode` → master gain.
 *
 * The AudioContext is created on the first user gesture (or straight away if the page already
 * had one), so browsers don't log an autoplay warning; bytes can be fetched before that. A sound
 * asked for before its buffer is decoded plays as soon as it is, if that is still timely.
 * Anything that throws (no Web Audio, decode failure) leaves the engine silently doing nothing.
 * Anti-spam is per sound (`SFX_SPEC`): a minimum gap between starts, and long sounds (whoosh,
 * bell) never overlap themselves.
 */

export type SfxName = 'click' | 'whoosh' | 'stamp-heavy' | 'stamp' | 'page-turn' | 'division-bell';

/** Every sound the engine knows. */
export const SFX_NAMES: readonly SfxName[] = [
  'click',
  'whoosh',
  'stamp-heavy',
  'stamp',
  'page-turn',
  'division-bell',
];

/** The slices of the Web Audio API the engine uses (fakes in tests). */
export interface AudioParamLike {
  value: number;
}
export interface AudioNodeLike {
  connect(destination: unknown): unknown;
}
export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}
export interface BufferLike {
  duration: number;
}
export interface SourceLike extends AudioNodeLike {
  buffer: BufferLike | null;
  playbackRate: AudioParamLike;
  start(when?: number): void;
}
export interface ContextLike {
  state: string;
  destination: unknown;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
  resume(): Promise<void>;
}

type GestureTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface SfxOptions {
  /** Where each sample lives; a sound with no source stays silent. */
  sources: Partial<Record<SfxName, string>>;
  /** Returns null when Web Audio is unavailable. */
  createContext?: () => ContextLike | null;
  fetchBytes?: (url: string) => Promise<ArrayBuffer | null>;
  /** Milliseconds, monotonic. */
  now?: () => number;
  /** 0–1, for playback-rate variation (not the simulation RNG). */
  random?: () => number;
  gestureTarget?: GestureTarget | null;
  /** Whether the page has already had a user gesture (context can start now). */
  hasUserActivation?: () => boolean;
  /** Called when a sound actually starts, with its length in ms (the app ducks music on it). */
  onStart?: (name: SfxName, durationMs: number) => void;
}

export interface SfxEngine {
  /** Fetch (and, once a context exists, decode) these sounds. Safe to call repeatedly. */
  prepare(names?: SfxName[]): void;
  /** Create/resume the context. Call from inside a user gesture. */
  unlock(): void;
  /** Play a sound. Returns false when it was skipped (muted, throttled, overlapping, no audio). */
  play(name: SfxName): boolean;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  dispose(): void;
  readonly state: { enabled: boolean; volume: number; hasContext: boolean };
}

/** Minimum gap between clicks, so key-repeat doesn't machine-gun. */
export const CLICK_THROTTLE_MS = 40;
/** ±3% playback-rate variation on the click. */
export const CLICK_RATE_SPREAD = 0.03;
/**
 * Category levels under the effects volume. The click is quiet UI feedback; the page turn sits
 * just above it (it often lands with a click); the bell is long and dense, so it stays under the
 * stamps it leads into; the stamps are short verdicts; the whoosh is the one big transition.
 */
export const CATEGORY_LEVEL = {
  ui: 0.35,
  transition: 0.6,
  stamp: 0.5,
  paper: 0.4,
  bell: 0.45,
} as const;
export type SfxCategory = keyof typeof CATEGORY_LEVEL;

export interface SfxSpec {
  category: SfxCategory;
  /** Minimum time between two starts of this sound (anti-spam). */
  minGapMs: number;
  /** Never start again while the previous play is still sounding. */
  exclusive: boolean;
  /** How late a not-yet-decoded sound may still start. */
  lateMs: number;
  /** ± playback-rate variation, so repeats don't sound mechanical. */
  rateSpread: number;
}

export const SFX_SPEC: Record<SfxName, SfxSpec> = {
  click: {
    category: 'ui',
    minGapMs: CLICK_THROTTLE_MS,
    exclusive: false,
    lateMs: 150,
    rateSpread: CLICK_RATE_SPREAD,
  },
  whoosh: { category: 'transition', minGapMs: 0, exclusive: true, lateMs: 600, rateSpread: 0 },
  'stamp-heavy': {
    category: 'stamp',
    minGapMs: 300,
    exclusive: false,
    lateMs: 200,
    rateSpread: 0.02,
  },
  stamp: { category: 'stamp', minGapMs: 200, exclusive: false, lateMs: 200, rateSpread: 0.04 },
  'page-turn': {
    category: 'paper',
    minGapMs: 350,
    exclusive: false,
    lateMs: 400,
    rateSpread: 0.03,
  },
  'division-bell': {
    category: 'bell',
    minGapMs: 0,
    exclusive: true,
    lateMs: 1000,
    rateSpread: 0,
  },
};

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;

type AudioContextCtor = new (options?: { latencyHint?: string }) => ContextLike;

function defaultCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createSfxEngine(options: SfxOptions): SfxEngine {
  const ctor = options.createContext ? null : defaultCtor();
  const supported = !!options.createContext || !!ctor;
  const createContext =
    options.createContext ?? (() => (ctor ? new ctor({ latencyHint: 'interactive' }) : null));
  const fetchBytes =
    options.fetchBytes ??
    ((url: string) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)));
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const target =
    options.gestureTarget !== undefined
      ? options.gestureTarget
      : typeof window !== 'undefined'
        ? window
        : null;
  const hasUserActivation =
    options.hasUserActivation ??
    (() =>
      typeof navigator !== 'undefined' &&
      !!(navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation
        ?.hasBeenActive);

  let ctx: ContextLike | null = null;
  let failed = false;
  let master: GainLike | null = null;
  const categories: Partial<Record<SfxCategory, GainLike>> = {};
  const bytes = new Map<SfxName, Promise<ArrayBuffer | null>>();
  const decoding = new Map<SfxName, Promise<BufferLike | null>>();
  const buffers = new Map<SfxName, BufferLike>();
  let enabled = true;
  let volume = 0.5;
  /** Per sound: when it last started (anti-spam), and until when it is still sounding. */
  const lastStart = new Map<SfxName, number>();
  const busyUntil = new Map<SfxName, number>();
  let listening = false;

  function applyGains() {
    if (master) master.gain.value = enabled ? 1 : 0;
    for (const [cat, node] of Object.entries(categories)) {
      node.gain.value = CATEGORY_LEVEL[cat as SfxCategory] * volume;
    }
  }

  function ensureContext(): ContextLike | null {
    if (ctx || failed || !supported) return ctx;
    try {
      const c = createContext();
      if (!c) {
        failed = true;
        return null;
      }
      master = c.createGain();
      master.connect(c.destination);
      for (const cat of Object.keys(CATEGORY_LEVEL) as SfxCategory[]) {
        const g = c.createGain();
        g.connect(master);
        categories[cat] = g;
      }
      ctx = c;
      applyGains();
      // Decode whatever has been fetched already.
      for (const name of bytes.keys()) void decode(name);
    } catch {
      failed = true;
      ctx = null;
    }
    return ctx;
  }

  function resume() {
    const c = ctx;
    if (!c || c.state !== 'suspended') return;
    try {
      c.resume().catch(() => {});
    } catch {
      // Ignore: the next gesture tries again.
    }
  }

  function ensureBytes(name: SfxName): Promise<ArrayBuffer | null> {
    let p = bytes.get(name);
    if (!p) {
      try {
        const url = options.sources[name];
        p = url ? fetchBytes(url).catch(() => null) : Promise.resolve(null);
      } catch {
        p = Promise.resolve(null);
      }
      bytes.set(name, p);
    }
    return p;
  }

  function decode(name: SfxName): Promise<BufferLike | null> {
    const c = ctx;
    if (!c) return Promise.resolve(null);
    let p = decoding.get(name);
    if (!p) {
      p = ensureBytes(name)
        .then((data) => (data ? c.decodeAudioData(data) : null))
        .then((buf) => {
          if (buf) buffers.set(name, buf);
          return buf;
        })
        .catch(() => null);
      decoding.set(name, p);
    }
    return p;
  }

  function onGesture() {
    ensureContext();
    resume();
    if (!ctx || ctx.state !== 'suspended') removeGestureListeners();
  }
  function addGestureListeners() {
    if (!target || listening) return;
    listening = true;
    for (const g of GESTURES) target.addEventListener(g, onGesture, { capture: true });
  }
  function removeGestureListeners() {
    if (!target || !listening) return;
    listening = false;
    for (const g of GESTURES) target.removeEventListener(g, onGesture, { capture: true });
  }

  function start(name: SfxName, buf: BufferLike) {
    const c = ctx;
    const spec = SFX_SPEC[name];
    const out = categories[spec.category];
    if (!c || !out) return;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      if (spec.rateSpread > 0) {
        src.playbackRate.value = 1 + (random() * 2 - 1) * spec.rateSpread;
      }
      src.connect(out);
      src.start();
      const ms = (buf.duration * 1000) / src.playbackRate.value;
      if (spec.exclusive) busyUntil.set(name, now() + ms);
      options.onStart?.(name, ms);
    } catch {
      // A failed play is never worth surfacing.
    }
  }

  return {
    prepare(names = ['click', 'whoosh']) {
      if (!supported) return;
      addGestureListeners();
      if (hasUserActivation()) ensureContext();
      for (const name of names) {
        void ensureBytes(name);
        if (ctx) void decode(name);
      }
    },
    unlock() {
      onGesture();
    },
    play(name) {
      if (!enabled || volume <= 0 || !supported || failed) return false;
      const spec = SFX_SPEC[name];
      const t = now();
      if (t - (lastStart.get(name) ?? -Infinity) < spec.minGapMs) return false;
      if (spec.exclusive && t < (busyUntil.get(name) ?? -Infinity)) return false;
      const c = ensureContext();
      if (!c) return false;
      resume();
      lastStart.set(name, t);
      const buf = buffers.get(name);
      if (buf) {
        start(name, buf);
        return true;
      }
      // Not decoded yet: hold the slot (no overlap) and play if it arrives in time.
      if (spec.exclusive) busyUntil.set(name, t + spec.lateMs);
      void decode(name).then((b) => {
        if (b && enabled && now() - t <= spec.lateMs) start(name, b);
      });
      return true;
    },
    setEnabled(on) {
      enabled = on;
      applyGains();
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      applyGains();
    },
    dispose() {
      removeGestureListeners();
    },
    get state() {
      return { enabled, volume, hasContext: !!ctx };
    },
  };
}
