import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithCode, signOut } from '../api/auth';
import { createApiClient, type FetchLike } from '../api/client';
import { setApiFetch } from '../api/runtime';
import { renderApp } from '../test/render-app';
import { COMMANDS, createDesktopPlatform } from './desktop';
import { SESSION_EXPIRED_EVENT } from './events';
import { setPlatformForTests } from './index';
import type { TauriBridge } from './tauri-bridge';
import { createWebPlatform } from './web';

/** A desktop platform over a fake Tauri bridge with an in-memory credential store. */
async function desktopPlatform(stored: string | null = null) {
  const store = new Map<string, string>();
  if (stored) store.set('playwhip.com', stored);
  const exit = vi.fn(() => Promise.resolve());
  const bridge: TauriBridge = {
    core: {
      invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
        const scope = String(args?.scope);
        if (cmd === COMMANDS.tokenGet) return Promise.resolve((store.get(scope) ?? null) as T);
        if (cmd === COMMANDS.tokenSet) store.set(scope, String(args?.token));
        if (cmd === COMMANDS.tokenClear) store.delete(scope);
        return Promise.resolve(undefined as T);
      },
    },
    app: { getVersion: () => Promise.resolve('0.1.0') },
    updater: { check: () => Promise.resolve(null) },
    process: { exit, relaunch: () => Promise.resolve() },
  };
  const platform = await createDesktopPlatform(bridge, {
    apiBase: 'https://playwhip.com',
    scope: 'playwhip.com',
    warn: () => {},
  });
  setPlatformForTests(platform);
  return { platform, store, exit };
}

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  // Health for the desktop compatibility check (UpdatePrompt is not mounted by renderApp).
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json({}))),
  );
});
afterEach(() => {
  setPlatformForTests(null);
  setApiFetch(null);
  vi.unstubAllGlobals();
});

describe('desktop auth transport', () => {
  it('sends bearer auth without cookies to the API origin, and captures set-auth-token', async () => {
    const { platform, store } = await desktopPlatform();
    const calls: [string, RequestInit | undefined][] = [];
    setApiFetch((input, init) => {
      calls.push([urlOf(input), init]);
      return Promise.resolve(
        Response.json({ token: 'x' }, { headers: { 'set-auth-token': 'fresh.sig' } }),
      );
    });
    await signInWithCode('p@example.test', '123456');
    expect(calls[0]?.[0]).toBe('https://playwhip.com/api/auth/sign-in/email-otp');
    expect(calls[0]?.[1]?.credentials).toBe('omit');
    expect(store.get('playwhip.com')).toBe('fresh.sig');
    expect(platform.getAuthHeaders()).toEqual({ Authorization: 'Bearer fresh.sig' });

    await signOut();
    const headers = calls[1]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fresh.sig');
    expect(store.size).toBe(0);
    expect(platform.hasSessionToken()).toBe(false);
  });

  it('forgets the token on sign-out even when the server is unreachable', async () => {
    const { store } = await desktopPlatform('old.sig');
    setApiFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(signOut()).rejects.toThrow();
    expect(store.size).toBe(0);
  });

  it('clears a rejected token on 401 and announces the expired session', async () => {
    const { platform, store } = await desktopPlatform('stale.sig');
    const seen: RequestInit[] = [];
    const fetchImpl: FetchLike = (_input, init) => {
      seen.push(init ?? {});
      return Promise.resolve(
        Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }, { status: 401 }),
      );
    };
    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    const api = createApiClient({
      fetch: () => fetchImpl,
      baseUrl: 'https://playwhip.com/api/v1',
      platform: () => Promise.resolve(platform),
    });
    await expect(api.get('/me', { safeParse: () => ({}) } as never)).rejects.toMatchObject({
      status: 401,
    });
    expect(new Headers(seen[0]?.headers).get('authorization')).toBe('Bearer stale.sig');
    expect(seen[0]?.credentials).toBe('omit');
    expect(store.size).toBe(0);
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  });
});

describe('QUIT (desktop only)', () => {
  const items = async () =>
    within(await screen.findByRole('menu', { name: 'Main menu' }))
      .getAllByRole('menuitem')
      .map((el) => el.textContent ?? '');

  it('is not offered in the browser', async () => {
    setPlatformForTests(createWebPlatform(''));
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: /press enter to start/i }));
    await waitFor(async () => expect((await items()).some((t) => /Credits/.test(t))).toBe(true));
    expect((await items()).some((t) => /^Quit/.test(t))).toBe(false);
  });

  it('is the last item on desktop, confirms in the menu, then exits', async () => {
    const user = userEvent.setup();
    const { exit } = await desktopPlatform();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /press enter to start/i }));
    await waitFor(async () => expect((await items()).at(-1)).toMatch(/^Quit/));

    await user.keyboard('{End}{Enter}');
    const dialog = await screen.findByRole('alertdialog', { name: 'Quit WHIP?' });
    expect(within(dialog).getByRole('button', { name: 'Keep playing' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(exit).not.toHaveBeenCalled();

    await user.keyboard('{End}{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Quit to desktop' }));
    expect(exit).toHaveBeenCalledWith(0);
  });
});
