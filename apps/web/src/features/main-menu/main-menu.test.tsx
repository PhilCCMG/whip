import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { FetchLike } from '../../api/client';
import { setApiFetch } from '../../api/runtime';
import { useSettingsStore } from '../../stores/settings-store';
import { renderApp } from '../../test/render-app';
import { uiSound } from '../audio/use-ui-sound';

const menu = () => screen.findByRole('menu', { name: 'Main menu' });
const selected = () =>
  within(screen.getByRole('menu', { name: 'Main menu' }))
    .getAllByRole('menuitem')
    .find((el) => el.getAttribute('aria-current') === 'true');

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

let click: MockInstance<() => boolean>;
let whoosh: MockInstance<() => boolean>;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  click = vi.spyOn(uiSound, 'click').mockReturnValue(true);
  whoosh = vi.spyOn(uiSound, 'whoosh').mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('main menu', () => {
  it('starts from the title screen, moves the cursor with the keyboard and opens screens', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: /press enter to start/i }));
    await menu();
    await waitFor(() => expect(selected()).toHaveTextContent(/^Continue/));
    expect(selected()).toHaveTextContent('Rachel Danby');

    await user.keyboard('{ArrowDown}');
    expect(selected()).toHaveTextContent(/^New career/);
    await user.keyboard('s');
    expect(selected()).toHaveTextContent(/^Load career/);
    await user.keyboard('{ArrowUp}');
    expect(selected()).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'New career' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await menu();
    expect(selected()).toHaveTextContent(/^New career/);

    // The last item is Sign out; Credits sits just above it.
    await user.keyboard('{End}{ArrowUp}{Enter}');
    expect(await screen.findByRole('heading', { name: 'Credits' })).toBeInTheDocument();
    await user.keyboard('{Backspace}');
    await menu();
  });

  it('creates a career through the character-creation steps', async () => {
    const user = userEvent.setup();
    const { backend, router } = renderApp('/?screen=new');
    const bodies: unknown[] = [];
    const spy: FetchLike = async (input, init) => {
      if (init?.method === 'POST' && urlOf(input).endsWith('/api/v1/campaigns')) {
        bodies.push(JSON.parse(init.body as string));
      }
      return backend.fetch(input, init);
    };
    setApiFetch(spy);

    const first = await screen.findByLabelText('First name');
    await waitFor(() => expect(first).toHaveFocus());
    // Empty names are caught before moving on.
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('first and last name');

    await user.type(first, 'Rachel');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByLabelText('Last name')).toHaveFocus();
    await user.keyboard('Danby{Enter}');

    const strengths = await screen.findByRole('radiogroup', { name: 'Your strength' });
    expect(within(strengths).getByRole('radio', { name: /Negotiation/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(strengths).getByRole('radio', { name: /Intrigue/ })).toBeChecked();
    expect(screen.getByRole('figure', { name: 'Your candidate' })).toHaveTextContent('Intrigue');
    await user.keyboard('{Enter}');

    const leaning = await screen.findByRole('radiogroup', { name: 'Where you sit in the party' });
    await user.click(within(leaning).getByRole('radio', { name: /Heartlands/ }));
    await user.keyboard('{Enter}');

    // Steps, tiles and confirms tick; nothing so far is a big transition.
    expect(click).toHaveBeenCalled();
    expect(whoosh).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Take your seat' }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\//), {
      timeout: 5000,
    });
    // Sworn in: the one whoosh into the game.
    expect(whoosh).toHaveBeenCalledTimes(1);
    expect(bodies).toEqual([
      {
        name: 'Ashby & Wold',
        scenarioKey: 'first_weeks',
        player: {
          firstName: 'Rachel',
          lastName: 'Danby',
          gender: 'female',
          strength: 'intrigue',
          ideologyPreset: 'heartlands',
        },
      },
    ]);
  });

  it('steps back through character creation with Esc', async () => {
    const user = userEvent.setup();
    renderApp('/?screen=new');
    await user.type(await screen.findByLabelText('First name'), 'Tom');
    await user.type(screen.getByLabelText('Last name'), 'Avery{Enter}');
    await screen.findByRole('radiogroup', { name: 'Your strength' });
    await user.keyboard('{Escape}');
    expect(await screen.findByLabelText('First name')).toHaveValue('Tom');
    await user.keyboard('{Escape}');
    await menu();
  });

  it('deletes a save after an in-screen confirmation', async () => {
    const user = userEvent.setup();
    renderApp('/?screen=load');
    const list = await screen.findByRole('list', { name: 'Saved careers' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    await user.click(within(list).getByRole('button', { name: 'Delete The Kesworth gamble' }));
    const confirm = await screen.findByRole('alertdialog', { name: /Delete The Kesworth gamble/ });
    expect(within(confirm).getByRole('button', { name: 'Keep' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Delete The Kesworth gamble' }));
    await user.click(await screen.findByRole('button', { name: 'Delete career' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
  });

  it('offers sign-in when the API says there is no session, and signs in with a code', async () => {
    const user = userEvent.setup();
    const { backend } = renderApp('/');
    let signedIn = false;
    const auth: { path: string; body: unknown }[] = [];
    const unauthenticated = () =>
      new Response(
        JSON.stringify({
          error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.', requestId: 'r1' },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    setApiFetch(async (input, init) => {
      const url = new URL(urlOf(input), 'http://localhost');
      if (url.pathname.startsWith('/api/auth/')) {
        auth.push({ path: url.pathname, body: JSON.parse(init?.body as string) });
        if (url.pathname === '/api/auth/sign-in/email-otp') signedIn = true;
        return new Response('{}', { status: 200 });
      }
      if (!signedIn) return unauthenticated();
      return backend.fetch(input, init);
    });

    await screen.findByRole('button', { name: /press enter to start/i });
    await user.keyboard('{Enter}');
    await menu();
    await waitFor(() => expect(selected()).toHaveTextContent(/^Sign in/));
    expect(screen.getByRole('menuitem', { name: /^New career/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await user.keyboard('pat@example.test{Enter}');
    const code = await screen.findByLabelText('6-digit code');
    await user.type(code, '123456{Enter}');

    await menu();
    await waitFor(() => expect(selected()).toHaveTextContent(/^Continue/));
    expect(screen.getByRole('menuitem', { name: /^Sign out/ })).toBeInTheDocument();
    expect(auth).toEqual([
      {
        path: '/api/auth/email-otp/send-verification-otp',
        body: { email: 'pat@example.test', type: 'sign-in' },
      },
      { path: '/api/auth/sign-in/email-otp', body: { email: 'pat@example.test', otp: '123456' } },
    ]);
  });

  it('mutes music from the HUD and the M key, and sets the volume in Settings', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ sound: true, musicVolume: 0.6 });
    renderApp('/?screen=settings');

    const volume = await screen.findByRole('slider', { name: 'Music volume' });
    expect(volume).toHaveAttribute('aria-valuenow', '60');
    await user.click(volume);
    await user.keyboard('{ArrowRight}');
    expect(useSettingsStore.getState().musicVolume).toBeCloseTo(0.7);
    expect(JSON.parse(localStorage.getItem('whip.settings') ?? '{}')).toMatchObject({
      musicVolume: 0.7,
    });

    await user.click(screen.getByRole('button', { name: /^Mute sound/ }));
    expect(useSettingsStore.getState().sound).toBe(false);
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();

    await user.keyboard('m');
    expect(useSettingsStore.getState().sound).toBe(true);
    expect(screen.getByRole('button', { name: /^Mute sound/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('menu sounds', () => {
  const skipTitle = () => sessionStorage.setItem('whip.title-seen', '1');

  it('whooshes once from the title, then only ticks on ordinary navigation', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /press enter to start/i }));
    await menu();
    expect(whoosh).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();

    await waitFor(() => expect(selected()).toHaveTextContent(/^Continue/));
    await user.keyboard('{ArrowDown}');
    expect(click).toHaveBeenCalledTimes(1);
    await user.keyboard('s');
    expect(click).toHaveBeenCalledTimes(2);

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Load career' })).toBeInTheDocument();
    expect(click).toHaveBeenCalledTimes(3);
    await user.keyboard('{ArrowDown}');
    expect(click).toHaveBeenCalledTimes(4);
    await user.keyboard('{Escape}');
    await menu();
    expect(click).toHaveBeenCalledTimes(5);
    expect(whoosh).toHaveBeenCalledTimes(1);
  });

  it('ticks on hover only when the selection changes, and once per click', async () => {
    const user = userEvent.setup();
    skipTitle();
    renderApp('/');
    await menu();
    await waitFor(() => expect(selected()).toHaveTextContent(/^Continue/));
    click.mockClear();

    const settings = screen.getByRole('menuitem', { name: /^Settings/ });
    await user.hover(settings);
    expect(selected()).toBe(settings);
    expect(click).toHaveBeenCalledTimes(1);
    await user.click(settings);
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(click).toHaveBeenCalledTimes(2);
    expect(whoosh).not.toHaveBeenCalled();
  });

  it('whooshes (and does not click) when Continue enters a career', async () => {
    const user = userEvent.setup();
    skipTitle();
    const { router } = renderApp('/');
    await menu();
    await waitFor(() => expect(selected()).toHaveTextContent(/^Continue/));
    expect(whoosh).not.toHaveBeenCalled();
    click.mockClear();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\//));
    expect(whoosh).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });

  it('whooshes when a save is loaded', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/?screen=load');
    const list = await screen.findByRole('list', { name: 'Saved careers' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    const row = within(list).getByRole('button', { name: /^Load The Kesworth gamble/ });
    // Hovering onto another save ticks; loading it whooshes instead of clicking.
    await user.hover(row);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockClear();
    await user.click(row);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\//));
    expect(whoosh).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });

  it('sets the effects volume in Settings', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ sound: true, effectsVolume: 0.5 });
    renderApp('/?screen=settings');
    const effects = await screen.findByRole('slider', { name: 'Effects volume' });
    expect(effects).toHaveAttribute('aria-valuenow', '50');
    effects.focus();
    click.mockClear();
    await user.keyboard('{ArrowRight}');
    expect(useSettingsStore.getState().effectsVolume).toBeCloseTo(0.6);
    expect(JSON.parse(localStorage.getItem('whip.settings') ?? '{}')).toMatchObject({
      effectsVolume: 0.6,
    });
    // The tick previews the new level; at the top, a further press changes nothing and is silent.
    expect(click).toHaveBeenCalledTimes(1);
    await user.keyboard('{End}{ArrowRight}');
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('credits the click sample with working licence and source links', async () => {
    renderApp('/?screen=credits');
    await screen.findByRole('heading', { name: 'Credits' });
    const licence = screen.getByRole('link', { name: 'CC BY 4.0' });
    expect(licence).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    expect(licence).toHaveAttribute('target', '_blank');
    expect(licence.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('link', { name: '"Click"' })).toHaveAttribute(
      'href',
      'https://freesound.org/s/213148/',
    );
    expect(licence.closest('dd')).toHaveTextContent(
      '"Click" by complex_waveform (freesound.org) — licensed under CC BY 4.0',
      { normalizeWhitespace: false },
    );
  });

  it('opens credit links through the platform adapter', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      renderApp('/?screen=credits');
      await user.click(await screen.findByRole('link', { name: 'CC BY 4.0' }));
      await waitFor(() =>
        expect(open).toHaveBeenCalledWith(
          'https://creativecommons.org/licenses/by/4.0/',
          '_blank',
          'noopener',
        ),
      );
      expect(open).toHaveBeenCalledOnce();
    } finally {
      open.mockRestore();
    }
  });
});
