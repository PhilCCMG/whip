import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCompatibility, compareVersions, compatibility } from './compat';
import { IS_DESKTOP_BUILD, apiUrl, normaliseApiBase, sessionScope } from './config';
import { COMMANDS, createDesktopPlatform } from './desktop';
import { getPlatform, setPlatformForTests } from './index';
import type { TauriBridge, TauriUpdate, UpdaterEvent } from './tauri-bridge';
import { bearerHeaders, readSessionToken } from './token';
import { createWebPlatform } from './web';

describe('token headers', () => {
  it('builds a bearer header only when there is a token', () => {
    expect(bearerHeaders('abc.def')).toEqual({ Authorization: 'Bearer abc.def' });
    expect(bearerHeaders(' abc.def ')).toEqual({ Authorization: 'Bearer abc.def' });
    expect(bearerHeaders(null)).toEqual({});
    expect(bearerHeaders('')).toEqual({});
    expect(bearerHeaders('   ')).toEqual({});
  });

  it('reads set-auth-token from a response or headers', () => {
    expect(readSessionToken(new Response(null, { headers: { 'set-auth-token': 't.s' } }))).toBe(
      't.s',
    );
    expect(readSessionToken(new Headers({ 'Set-Auth-Token': ' t.s ' }))).toBe('t.s');
    expect(readSessionToken(new Response(null))).toBeNull();
  });
});

describe('config', () => {
  it('is not a desktop build under test', () => {
    expect(IS_DESKTOP_BUILD).toBe(false);
  });

  it('normalises the API base to an origin', () => {
    expect(normaliseApiBase(undefined)).toBe('');
    expect(normaliseApiBase('  ')).toBe('');
    expect(normaliseApiBase('https://playwhip.com/')).toBe('https://playwhip.com');
    expect(normaliseApiBase('http://localhost:8787')).toBe('http://localhost:8787');
    expect(() => normaliseApiBase('playwhip.com')).toThrow();
    expect(() => normaliseApiBase('ftp://playwhip.com')).toThrow();
    expect(() => normaliseApiBase('https://playwhip.com/api')).toThrow();
  });

  it('builds API URLs and credential-store scopes', () => {
    expect(apiUrl('/api/v1/me', '')).toBe('/api/v1/me');
    expect(apiUrl('api/v1/me', 'https://playwhip.com')).toBe('https://playwhip.com/api/v1/me');
    expect(sessionScope('https://playwhip.com', 'tauri.localhost')).toBe('playwhip.com');
    expect(sessionScope('http://localhost:8787', 'x')).toBe('localhost:8787');
    expect(sessionScope('', 'localhost:5173')).toBe('localhost:5173');
  });
});

describe('web platform', () => {
  afterEach(() => setPlatformForTests(null));

  it('is same-origin, cookie-based and inert', async () => {
    const web = createWebPlatform('');
    expect(web).toMatchObject({
      kind: 'web',
      isDesktop: false,
      apiBase: '',
      fetchCredentials: 'include',
      appVersion: null,
    });
    expect(web.getAuthHeaders()).toEqual({});
    await web.setSessionToken('t.s');
    expect(web.getAuthHeaders()).toEqual({});
    expect(web.hasSessionToken()).toBe(false);
    const res = new Response(null, { headers: { 'set-auth-token': 't.s' } });
    expect(await web.captureSessionToken(res)).toBe(false);
    await expect(web.clearSessionToken()).resolves.toBeUndefined();
    await expect(web.quit()).resolves.toBeUndefined();
    await expect(web.checkForUpdates()).resolves.toBeNull();
  });

  it('toggles the Fullscreen API on the web', async () => {
    const request = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = request;
    await createWebPlatform('').toggleFullscreen();
    expect(request).toHaveBeenCalledOnce();
  });

  it('getPlatform() returns the web platform outside a desktop build', async () => {
    const p = await getPlatform();
    expect(p.kind).toBe('web');
    expect(await getPlatform()).toBe(p);
  });
});

function fakeBridge(opts: { stored?: string | null; failStore?: boolean; update?: TauriUpdate }) {
  const store = new Map<string, string>();
  if (opts.stored) store.set('session@playwhip.com', opts.stored);
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const process = {
    exit: vi.fn(() => Promise.resolve()),
    relaunch: vi.fn(() => Promise.resolve()),
  };
  const bridge: TauriBridge = {
    core: {
      invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
        calls.push([cmd, args]);
        if (opts.failStore && cmd.startsWith('session_')) {
          return Promise.reject(new Error('no secret service'));
        }
        const key = `session@${String(args?.scope)}`;
        if (cmd === COMMANDS.tokenGet) return Promise.resolve((store.get(key) ?? null) as T);
        if (cmd === COMMANDS.tokenSet) store.set(key, String(args?.token));
        if (cmd === COMMANDS.tokenClear) store.delete(key);
        if (cmd === COMMANDS.toggleFullscreen) return Promise.resolve(true as T);
        return Promise.resolve(undefined as T);
      },
    },
    app: { getVersion: () => Promise.resolve('0.1.0') },
    updater: { check: () => Promise.resolve(opts.update ?? null) },
    process,
  };
  return { bridge, store, calls, process };
}

const desktopOpts = { apiBase: 'https://playwhip.com', scope: 'playwhip.com', warn: () => {} };

describe('desktop platform', () => {
  it('loads the stored token and sends it as a bearer header, never cookies', async () => {
    const { bridge } = fakeBridge({ stored: 'tok.sig' });
    const p = await createDesktopPlatform(bridge, desktopOpts);
    expect(p).toMatchObject({
      kind: 'desktop',
      isDesktop: true,
      apiBase: 'https://playwhip.com',
      fetchCredentials: 'omit',
      appVersion: '0.1.0',
    });
    expect(p.hasSessionToken()).toBe(true);
    expect(p.getAuthHeaders()).toEqual({ Authorization: 'Bearer tok.sig' });
  });

  it('captures set-auth-token into the credential store and clears it on sign-out', async () => {
    const { bridge, store } = fakeBridge({});
    const p = await createDesktopPlatform(bridge, desktopOpts);
    expect(p.getAuthHeaders()).toEqual({});
    expect(await p.captureSessionToken(new Response(null))).toBe(false);
    const signIn = new Response('{}', { headers: { 'set-auth-token': 'new.sig' } });
    expect(await p.captureSessionToken(signIn)).toBe(true);
    expect(store.get('session@playwhip.com')).toBe('new.sig');
    expect(p.getAuthHeaders()).toEqual({ Authorization: 'Bearer new.sig' });
    await p.clearSessionToken();
    expect(store.size).toBe(0);
    expect(p.getAuthHeaders()).toEqual({});
  });

  it('keeps the token in memory only when the credential store fails', async () => {
    const warn = vi.fn();
    const { bridge } = fakeBridge({ failStore: true });
    const p = await createDesktopPlatform(bridge, { ...desktopOpts, warn });
    await p.setSessionToken('mem.sig');
    expect(p.getAuthHeaders()).toEqual({ Authorization: 'Bearer mem.sig' });
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('mem.sig');
  });

  it('quits, toggles fullscreen and installs updates with progress, then relaunches', async () => {
    const events: UpdaterEvent[] = [
      { event: 'Started', data: { contentLength: 100 } },
      { event: 'Progress', data: { chunkLength: 40 } },
      { event: 'Progress', data: { chunkLength: 60 } },
      { event: 'Finished' },
    ];
    const update: TauriUpdate = {
      version: '0.2.0',
      currentVersion: '0.1.0',
      body: ' Notes ',
      date: null,
      downloadAndInstall(onEvent) {
        events.forEach((e) => onEvent?.(e));
        return Promise.resolve();
      },
    };
    const { bridge, calls, process } = fakeBridge({ update });
    const p = await createDesktopPlatform(bridge, desktopOpts);

    await p.toggleFullscreen();
    expect(calls.some(([c]) => c === COMMANDS.toggleFullscreen)).toBe(true);
    await p.quit();
    expect(process.exit).toHaveBeenCalledWith(0);

    const found = await p.checkForUpdates();
    expect(found).toMatchObject({ version: '0.2.0', currentVersion: '0.1.0', notes: 'Notes' });
    const progress: number[] = [];
    await found?.install((pr) => progress.push(pr.downloaded));
    expect(progress).toEqual([0, 40, 100, 100]);
    expect(process.relaunch).toHaveBeenCalledOnce();
  });

  it('treats a failing update check as "no update"', async () => {
    const { bridge } = fakeBridge({});
    bridge.updater = { check: () => Promise.reject(new Error('offline')) };
    const p = await createDesktopPlatform(bridge, desktopOpts);
    await expect(p.checkForUpdates()).resolves.toBeNull();
  });
});

describe('compatibility', () => {
  const health = { status: 'ok' as const, simulationVersion: 1, environment: 'production' };

  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.3')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
  });

  it('flags a too-old client and a different API major', () => {
    expect(compatibility(health, '0.1.0')).toEqual({ status: 'ok' });
    expect(
      compatibility({ ...health, apiVersion: '1.4.0', minDesktopVersion: '0.1.0' }, '0.1.0'),
    ).toEqual({ status: 'ok' });
    expect(compatibility({ ...health, minDesktopVersion: '0.2.0' }, '0.1.9')).toEqual({
      status: 'update-required',
      minVersion: '0.2.0',
    });
    expect(compatibility({ ...health, apiVersion: '2.0.0' }, '0.1.0')).toEqual({
      status: 'api-incompatible',
      apiVersion: '2.0.0',
    });
    // The web build has no app version: never "update required".
    expect(compatibility({ ...health, minDesktopVersion: '9.0.0' }, null)).toEqual({
      status: 'ok',
    });
  });

  it('fetches health from the API base and tolerates failures', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        Response.json({ ...health, apiVersion: '1.1.0', minDesktopVersion: '0.3.0' }),
      ),
    );
    expect(await checkCompatibility('0.2.0', 'https://playwhip.com', fetchImpl)).toEqual({
      status: 'update-required',
      minVersion: '0.3.0',
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://playwhip.com/api/v1/health');
    const offline = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await checkCompatibility('0.2.0', '', offline)).toBeNull();
  });
});
