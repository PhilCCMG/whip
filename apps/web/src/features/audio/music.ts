/**
 * Menu music: one looping track, faded in on the title/menu screens and out when a career opens.
 *
 * Browsers block audible autoplay until the page has had a user gesture, so a refused `play()`
 * parks the request and retries on the next pointer or key press. The desktop shell allows
 * autoplay, so there it simply starts. Nothing is fetched until `prepare()` (preload="none").
 */

/** The parts of HTMLAudioElement the controller uses (a fake in tests). */
export interface AudioLike {
  src: string;
  loop: boolean;
  preload: string;
  volume: number;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
}

export interface MusicOptions {
  src: string;
  createAudio?: () => AudioLike;
  /** Where gesture listeners go (window in the app). */
  gestureTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  fadeMs?: number;
  stepMs?: number;
}

export interface MusicController {
  /** Create the element and start buffering. Safe to call repeatedly. */
  prepare(): void;
  /** Music wanted (title/menu on screen): play and fade up to the volume. */
  enter(): void;
  /** Music not wanted (career open): fade down, then pause. */
  leave(): void;
  /** Call from inside a user gesture (e.g. "press any key") to unlock playback. */
  unlock(): void;
  setVolume(volume: number): void;
  setEnabled(enabled: boolean): void;
  /** Scale the music down (e.g. 0.7 under a transition whoosh); 1 restores it. */
  duck(factor: number, fadeMs?: number): void;
  /** Test/teardown helper. */
  dispose(): void;
  readonly state: { wanted: boolean; enabled: boolean; volume: number; waitingForGesture: boolean };
}

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;

export function createMusicController(options: MusicOptions): MusicController {
  const fadeMs = options.fadeMs ?? 600;
  const stepMs = options.stepMs ?? 30;
  const target =
    options.gestureTarget !== undefined
      ? options.gestureTarget
      : typeof window !== 'undefined'
        ? window
        : null;
  const createAudio = options.createAudio ?? (() => new Audio());

  let audio: AudioLike | null = null;
  let wanted = false;
  let enabled = true;
  let volume = 0.6;
  let waiting = false;
  let duckFactor = 1;
  let timer: ReturnType<typeof setInterval> | null = null;

  const level = () => (wanted && enabled ? volume * duckFactor : 0);

  function ensure(): AudioLike {
    if (!audio) {
      audio = createAudio();
      audio.preload = 'none';
      audio.loop = true;
      audio.volume = 0;
      audio.src = options.src;
    }
    return audio;
  }

  function stopFade() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function fadeTo(to: number, ms = fadeMs) {
    const a = audio;
    if (!a) return;
    stopFade();
    const from = a.volume;
    const steps = Math.max(1, Math.round(ms / stepMs));
    let i = 0;
    timer = setInterval(() => {
      i++;
      a.volume = Math.min(1, Math.max(0, from + ((to - from) * i) / steps));
      if (i >= steps) {
        stopFade();
        if (to === 0) a.pause();
      }
    }, stepMs);
  }

  function onGesture() {
    removeGestureListeners();
    waiting = false;
    sync();
  }
  function addGestureListeners() {
    if (!target || waiting) return;
    waiting = true;
    for (const g of GESTURES) target.addEventListener(g, onGesture, { capture: true });
  }
  function removeGestureListeners() {
    if (!target) return;
    for (const g of GESTURES) target.removeEventListener(g, onGesture, { capture: true });
  }

  /** Bring playback in line with `wanted`, `enabled` and `volume`. */
  function sync() {
    const goal = level();
    if (goal === 0) {
      if (audio && !audio.paused) fadeTo(0);
      return;
    }
    const a = ensure();
    if (a.paused) {
      a.volume = 0;
      let result: Promise<void> | void;
      try {
        result = a.play();
      } catch {
        addGestureListeners();
        return;
      }
      if (result && typeof result.then === 'function') {
        result.then(
          () => {
            if (level() > 0) fadeTo(level());
            else a.pause();
          },
          () => addGestureListeners(),
        );
        return;
      }
    }
    fadeTo(goal);
  }

  return {
    prepare() {
      const a = ensure();
      if (a.preload !== 'auto') {
        a.preload = 'auto';
        a.load();
      }
    },
    enter() {
      wanted = true;
      sync();
    },
    leave() {
      wanted = false;
      sync();
    },
    unlock() {
      if (level() > 0) {
        removeGestureListeners();
        waiting = false;
        sync();
      }
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      if (audio && !audio.paused) fadeTo(level());
    },
    setEnabled(on) {
      enabled = on;
      sync();
    },
    duck(factor, ms = 150) {
      duckFactor = Math.min(1, Math.max(0, factor));
      if (audio && !audio.paused && wanted && enabled) fadeTo(level(), ms);
    },
    dispose() {
      stopFade();
      removeGestureListeners();
      waiting = false;
      audio?.pause();
      audio = null;
      wanted = false;
      duckFactor = 1;
    },
    get state() {
      return { wanted, enabled, volume, waitingForGesture: waiting };
    },
  };
}
