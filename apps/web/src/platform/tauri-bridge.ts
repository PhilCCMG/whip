/**
 * The slice of Tauri's JS API the desktop platform uses, read from `window.__TAURI__`
 * (`app.withGlobalTauri: true` in tauri.conf.json, which also injects the updater and process
 * plugin APIs). Using the globals instead of the `@tauri-apps/*` npm packages keeps apps/web free
 * of Tauri dependencies; the shapes below match @tauri-apps/api 2.x and plugin-updater 2.x.
 */

export type UpdaterEvent =
  | { event: 'Started'; data: { contentLength?: number | null } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

export interface TauriUpdate {
  version: string;
  currentVersion: string;
  date?: string | null;
  body?: string | null;
  downloadAndInstall(onEvent?: (event: UpdaterEvent) => void): Promise<void>;
}

export interface TauriBridge {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
  app: { getVersion(): Promise<string> };
  updater?: { check(): Promise<TauriUpdate | null> };
  process?: { exit(code?: number): Promise<void>; relaunch(): Promise<void> };
}

declare global {
  interface Window {
    __TAURI__?: TauriBridge;
  }
}

/** The injected bridge when running inside the WHIP desktop shell, else null. */
export function getTauriBridge(): TauriBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.__TAURI__;
  return bridge?.core && bridge.app ? bridge : null;
}
