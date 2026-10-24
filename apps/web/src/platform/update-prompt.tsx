import { cn, Keycap, ReturnKeyIcon } from '@whip/ui';
import { useEffect } from 'react';
import { getPlatform } from './index';
import { useDesktopUpdate, type UseDesktopUpdate } from './use-desktop-update';

function percent(downloaded: number, total: number | null): number | null {
  return total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
}

function quit() {
  void getPlatform().then((p) => p.quit());
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

/** The red slash from the wordmark (same geometry as the main-menu cursor). */
function Slash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 64" aria-hidden="true" className={cn('fill-whip', className)}>
      <polygon points="15,0 24,0 9,64 0,64" />
    </svg>
  );
}

// Front-end button language (features/main-menu/styles.ts): flat red, condensed display caps.
const primary =
  'inline-flex h-11 cursor-pointer items-center justify-center gap-2.5 bg-whip px-5 font-display text-lg font-black text-white uppercase [font-stretch:72%] transition-colors duration-100 hover:bg-whip-dark focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-paper-bright';
const secondary =
  'inline-flex h-11 cursor-pointer items-center justify-center gap-2.5 border-2 border-paper/50 px-4 text-[12px] font-bold tracking-[0.08em] text-paper uppercase transition-colors duration-100 hover:border-paper-bright hover:text-paper-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-whip';
const label = 'text-[11px] font-bold tracking-[0.2em] text-whip uppercase';

/**
 * Desktop update UI, in the main menu's language (flat ink, red slash, keycaps). Mount once at
 * the app root; it renders nothing on the web. Pass `controller` to share one
 * `useDesktopUpdate()` with a "Check for updates" item.
 *
 * - Update available: a flat ink card above the prompt bar. "UPDATE AVAILABLE · v0.2.0 ·
 *   [U] RESTART TO UPDATE · LATER".
 * - Update required (`minDesktopVersion`) or a new API major: full-screen block.
 *   [Enter] restart to update, [Q] quit.
 */
export function UpdatePrompt({ controller }: { controller?: UseDesktopUpdate }) {
  const own = useDesktopUpdate({ checkOnMount: !controller });
  const { state, appVersion, install, dismiss } = controller ?? own;
  const blocking = state.phase === 'required' || state.phase === 'incompatible';
  const canInstall =
    state.phase === 'available' || state.phase === 'error' || (blocking && !!state.update);

  // Keys: U on the card; Enter / Q on the blocking screen. Never while typing (sign-in code).
  useEffect(() => {
    if (!canInstall && !blocking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || typing(e)) return;
      const k = e.key.toLowerCase();
      if (canInstall && (k === 'u' || (blocking && k === 'enter'))) {
        e.preventDefault();
        e.stopPropagation();
        void install();
      } else if (blocking && k === 'q') {
        e.preventDefault();
        quit();
      } else if (blocking) {
        // The game behind is unusable: swallow menu keys.
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [canInstall, blocking, install]);

  if (state.phase === 'idle' || state.phase === 'checking') return null;

  const update = 'update' in state ? state.update : null;
  const progress =
    state.phase === 'downloading'
      ? percent(state.progress.downloaded, state.progress.total)
      : state.phase === 'installing'
        ? 100
        : null;
  const busy = state.phase === 'downloading' || state.phase === 'installing';

  const progressBar = busy && (
    <div className="mt-4">
      <div
        className="h-1 w-full bg-paper/15"
        role="progressbar"
        aria-label="Update download"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(progress !== null && { 'aria-valuenow': progress })}
      >
        <div
          className="h-full bg-whip transition-[width] duration-150"
          style={{ width: `${progress ?? 12}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] font-bold tracking-[0.12em] text-paper/75 uppercase tabular-nums">
        {state.phase === 'installing'
          ? 'Installing — WHIP will restart'
          : `Downloading${progress !== null ? ` · ${progress}%` : '…'}`}
      </p>
    </div>
  );

  if (state.phase === 'required' || state.phase === 'incompatible') {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="whip-update-required-title"
        className="fixed inset-0 z-[100] isolate flex animate-in-fade items-center bg-ink text-paper"
      >
        {/* The menu's red edge stripe, at the wordmark slash angle. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 hidden bg-whip md:block md:[clip-path:polygon(70%_0,70.6%_0,63.6%_100%,63%_100%)]"
        />
        <div className="w-full max-w-xl px-6 md:px-[clamp(1.5rem,6vw,6rem)]">
          <p className={label}>
            {state.phase === 'required' ? 'Update required' : 'Server upgraded'}
          </p>
          <h2
            id="whip-update-required-title"
            className="mt-3 font-display text-5xl leading-[0.9] font-black text-paper-bright uppercase [font-stretch:70%] md:text-6xl"
          >
            {update ? `Update to v${update.version}` : 'This version is out of date'}
          </h2>
          <p className="mt-4 max-w-[44ch] text-[15px] leading-snug text-paper/80">
            {state.phase === 'required'
              ? `WHIP ${appVersion ? `v${appVersion} ` : ''}is no longer supported: v${state.minVersion} or newer is needed.`
              : `The server now speaks API ${state.apiVersion}. Update the game to keep playing.`}{' '}
            Your careers are safe on the server.
          </p>
          {progressBar}
          {!busy && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {update ? (
                <button type="button" className={primary} onClick={() => void install()}>
                  <Keycap aria-hidden="true" className="gap-1 px-2 font-sans text-[11px]">
                    <ReturnKeyIcon className="text-[12px]" />
                    Enter
                  </Keycap>
                  Restart to update
                </button>
              ) : (
                <p className="text-sm font-semibold text-paper/80">
                  Download the latest version from playwhip.com.
                </p>
              )}
              <button type="button" className={secondary} onClick={quit}>
                <Keycap aria-hidden="true">Q</Keycap>
                Quit
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!update) return null;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Game update"
      className="fixed right-4 bottom-28 z-[90] flex w-[min(24rem,calc(100vw-2rem))] animate-in-left gap-4 bg-ink p-5 text-paper md:right-[clamp(1.5rem,4vw,4rem)]"
    >
      <Slash className="h-16 w-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={label}>{state.phase === 'error' ? 'Update failed' : 'Update available'}</p>
        <p className="mt-1.5 font-display text-3xl leading-none font-black text-paper-bright uppercase [font-stretch:70%]">
          v{update.version}
        </p>
        <p className="mt-1 text-[12px] font-semibold text-paper/70">
          {state.phase === 'error' ? state.message : `You have v${update.currentVersion}`}
        </p>
        {progressBar}
        {!busy && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => void install()}>
              <Keycap aria-hidden="true">U</Keycap>
              {state.phase === 'error' ? 'Retry' : 'Restart to update'}
            </button>
            <button type="button" className={secondary} onClick={dismiss}>
              Later
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
