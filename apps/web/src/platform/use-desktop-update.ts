import { useCallback, useEffect, useRef, useState } from 'react';
import { checkCompatibility } from './compat';
import { getPlatform } from './index';
import type { AvailableUpdate, Platform, UpdateProgress } from './types';

export type DesktopUpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; update: AvailableUpdate }
  | { phase: 'downloading'; update: AvailableUpdate; progress: UpdateProgress }
  | { phase: 'installing'; update: AvailableUpdate }
  | { phase: 'error'; update: AvailableUpdate; message: string }
  /** The server no longer supports this build (`minDesktopVersion`). Play is blocked. */
  | { phase: 'required'; minVersion: string; update: AvailableUpdate | null }
  /** The server speaks another API major version. Play is blocked. */
  | { phase: 'incompatible'; apiVersion: string; update: AvailableUpdate | null };

export interface UseDesktopUpdate {
  state: DesktopUpdateState;
  appVersion: string | null;
  /** Check now (e.g. a "Check for updates" menu item). */
  check: () => Promise<void>;
  /** Download + install + relaunch the available update. */
  install: () => Promise<void>;
  /** Hide the "update available" prompt until the next check. */
  dismiss: () => void;
}

/**
 * Desktop auto-update + compatibility state (docs/architecture/08-desktop.md §Update flow).
 * On the web it stays `idle` and does nothing. Checks once on mount unless `checkOnMount` is false.
 */
export function useDesktopUpdate({ checkOnMount = true } = {}): UseDesktopUpdate {
  const [state, setState] = useState<DesktopUpdateState>({ phase: 'idle' });
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const platformRef = useRef<Platform | null>(null);
  /** The update found by the last check (install() reads it without depending on state). */
  const updateRef = useRef<AvailableUpdate | null>(null);
  const installing = useRef(false);

  const check = useCallback(async () => {
    const platform = (platformRef.current ??= await getPlatform());
    setAppVersion(platform.appVersion);
    if (!platform.isDesktop || installing.current) return;
    setState((s) => (s.phase === 'idle' ? { phase: 'checking' } : s));
    const [update, compat] = await Promise.all([
      platform.checkForUpdates(),
      checkCompatibility(platform.appVersion, platform.apiBase),
    ]);
    updateRef.current = update;
    if (compat?.status === 'update-required') {
      setState({ phase: 'required', minVersion: compat.minVersion, update });
    } else if (compat?.status === 'api-incompatible') {
      setState({ phase: 'incompatible', apiVersion: compat.apiVersion, update });
    } else if (update) {
      setState({ phase: 'available', update });
    } else {
      setState({ phase: 'idle' });
    }
  }, []);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update || installing.current) return;
    installing.current = true;
    setState({ phase: 'downloading', update, progress: { downloaded: 0, total: null } });
    try {
      await update.install((progress) => {
        const done = progress.total !== null && progress.downloaded >= progress.total;
        setState(
          done ? { phase: 'installing', update } : { phase: 'downloading', update, progress },
        );
      });
      setState({ phase: 'installing', update });
    } catch (e) {
      installing.current = false;
      setState({
        phase: 'error',
        update,
        message: e instanceof Error ? e.message : 'The update could not be installed.',
      });
    }
  }, []);

  const dismiss = useCallback(() => {
    setState((s) => (s.phase === 'available' || s.phase === 'error' ? { phase: 'idle' } : s));
  }, []);

  useEffect(() => {
    if (!checkOnMount) return;
    let cancelled = false;
    void getPlatform().then(() => {
      if (!cancelled) void check();
    });
    return () => {
      cancelled = true;
    };
  }, [check, checkOnMount]);

  return { state, appVersion, check, install, dismiss };
}
