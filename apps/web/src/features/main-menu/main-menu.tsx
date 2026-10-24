import { cn, Keycap, ReturnKeyIcon, WhipIcon, WhipWordmark } from '@whip/ui';
import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { isSignedOutError, useCampaigns, useMe, useSignOut } from '../../api/hooks';
import { isMockMode } from '../../api/runtime';
import { formatNumber, formatSimDate } from '../../lib/format';
import { campaignPath } from '../../lib/params';
import { useSettingsStore } from '../../stores/settings-store';
import { toast } from '../../stores/toast-store';
import { menuMusic, useMenuMusic } from '../audio/use-menu-music';
import { uiSound, useClickSounds, useUiSoundPreload } from '../audio/use-ui-sound';
import { COPYRIGHT_SHORT } from '../boot/legal-copy';
import { usePlatform } from '../../platform/use-platform';
import { APP_VERSION, SEAT } from './copy';
import { usePrefersTap } from './input-mode';
import { MenuList, type MenuItem } from './menu-list';
import { MenuBackdrop } from './menu-backdrop';
import { NewsTicker } from './news-ticker';
import { PromptBar, type Prompt } from './prompt-bar';
import { QuitConfirm } from './quit-confirm';
import { CreditsScreen } from './screens/credits';
import { LoadCareerScreen } from './screens/load-career';
import { NewCareerScreen } from './screens/new-career';
import { SettingsScreen } from './screens/settings';
import { SignInScreen } from './screens/sign-in';

type Screen = 'new' | 'load' | 'settings' | 'credits' | 'signin';
const SCREENS = new Set<string>(['new', 'load', 'settings', 'credits', 'signin']);

const TITLE_SEEN_KEY = 'whip.title-seen';

function titleSeen(): boolean {
  try {
    return sessionStorage.getItem(TITLE_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markTitleSeen() {
  try {
    sessionStorage.setItem(TITLE_SEEN_KEY, '1');
  } catch {
    // Storage blocked: the title screen shows again next visit, which is harmless.
  }
}

/**
 * The ink panel's diagonal right edge, per screen. The edge leans at the wordmark slash's angle;
 * the title screen shares the menu geometry, so starting the game only brings in the menu.
 */
const PANEL: Record<'title' | 'menu' | 'narrow' | 'wide', string> = {
  title:
    '[clip-path:polygon(0_52vh,100%_52vh,100%_100%,0_100%)] md:[clip-path:polygon(0_0,36%_0,29%_100%,0_100%)]',
  menu: '[clip-path:polygon(0_52vh,100%_52vh,100%_100%,0_100%)] md:[clip-path:polygon(0_0,36%_0,29%_100%,0_100%)]',
  narrow:
    '[clip-path:polygon(0_0,100%_0,100%_100%,0_100%)] md:[clip-path:polygon(0_0,56%_0,49%_100%,0_100%)]',
  wide: '[clip-path:polygon(0_0,100%_0,100%_100%,0_100%)] md:[clip-path:polygon(0_0,70%_0,63%_100%,0_100%)]',
};
const STRIPE: Record<keyof typeof PANEL, string> = {
  title: 'md:[clip-path:polygon(36%_0,36.6%_0,29.6%_100%,29%_100%)]',
  menu: 'md:[clip-path:polygon(36%_0,36.6%_0,29.6%_100%,29%_100%)]',
  narrow: 'md:[clip-path:polygon(56%_0,56.6%_0,49.6%_100%,49%_100%)]',
  wide: 'md:[clip-path:polygon(70%_0,70.6%_0,63.6%_100%,63%_100%)]',
};

const SCREEN_PANEL: Record<Screen, keyof typeof PANEL> = {
  new: 'wide',
  load: 'wide',
  settings: 'narrow',
  credits: 'narrow',
  signin: 'narrow',
};

function TitleCard({ onStart }: { onStart: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const tap = usePrefersTap();
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault();
      onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);
  return (
    // The whole screen is the start target: any key, click or tap.
    <div
      className="flex flex-1 cursor-pointer flex-col md:max-w-[24vw] md:min-w-[18rem]"
      onClick={onStart}
      // Starting plays the whoosh, not the click.
      data-sfx="off"
    >
      {/* Title up top, prompt low: two elements, not a lockup. */}
      <h1 className="mt-[calc(52dvh-3rem)] animate-in-right text-paper-bright md:mt-[8vh]">
        <WhipWordmark title="WHIP" className="h-auto w-[min(78%,18rem)] md:w-[min(100%,24rem)]" />
      </h1>
      <button
        ref={ref}
        type="button"
        aria-label={tap ? 'Tap to start' : 'Press Enter to start'}
        onClick={(e) => {
          e.stopPropagation();
          onStart();
        }}
        className="mt-8 flex min-h-11 w-fit cursor-pointer items-center gap-[0.75em] text-[12px] font-semibold tracking-[0.2em] text-paper uppercase outline-none animate-[whip-breathe_3s_ease-in-out_infinite_alternate] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper/50 md:mt-auto md:mb-[18vh]"
      >
        {tap ? (
          'Tap to start'
        ) : (
          <>
            Press
            <Keycap
              aria-hidden="true"
              className="h-[1.8em] min-w-[2.6em] px-[0.6em] text-[12px] tracking-normal"
            >
              <ReturnKeyIcon />
            </Keycap>
            to start
          </>
        )}
      </button>
    </div>
  );
}

export function MainMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const param = params.get('screen');
  const requested = param && SCREENS.has(param) ? (param as Screen) : null;

  const [started, setStarted] = useState(
    () =>
      titleSeen() ||
      requested !== null ||
      !!(location.state as { skipTitle?: boolean } | null)?.skipTitle,
  );
  const [cursor, setCursor] = useState<string | null>(null);

  const me = useMe();
  const campaigns = useCampaigns();
  const signOut = useSignOut();
  const signedOut = isSignedOutError(me.error) || isSignedOutError(campaigns.error);
  const signedIn = !!me.data && !signedOut;

  const list = useMemo(
    () => [...(campaigns.data?.items ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [campaigns.data],
  );
  const latest = list[0];

  // Signed out, career screens fall through to sign-in.
  const screen: Screen | null =
    requested && signedOut && (requested === 'new' || requested === 'load') ? 'signin' : requested;

  const platform = usePlatform();
  const [quitting, setQuitting] = useState(false);

  const baseItems: MenuItem[] = useMemo(() => {
    if (signedOut) {
      return [
        { id: 'signin', label: 'Sign in', sub: 'Get a 6-digit code by email' },
        { id: 'continue', label: 'Continue', sub: 'Sign in to see your careers', disabled: true },
        { id: 'new', label: 'New career', sub: 'Sign in to start a career', disabled: true },
        { id: 'load', label: 'Load career', disabled: true },
        { id: 'settings', label: 'Settings' },
        { id: 'credits', label: 'Credits' },
      ];
    }
    const out: MenuItem[] = [
      latest
        ? {
            id: 'continue',
            label: 'Continue',
            silent: true, // entering the career plays the whoosh instead
            sub: `${latest.playerName} · Week ${latest.turn} · ${formatSimDate(latest.simDate, { year: false })}`,
          }
        : {
            id: 'continue',
            label: 'Continue',
            sub: campaigns.isPending ? 'Checking your saves…' : 'No saved careers yet',
            disabled: true,
          },
      {
        id: 'new',
        label: 'New career',
        sub: `${SEAT.name}, majority ${formatNumber(SEAT.majority)}`,
      },
      {
        id: 'load',
        label: 'Load career',
        sub: list.length
          ? `${list.length} saved ${list.length === 1 ? 'career' : 'careers'}`
          : undefined,
        disabled: !campaigns.isError && list.length === 0,
      },
      { id: 'settings', label: 'Settings' },
      { id: 'credits', label: 'Credits' },
    ];
    if (signedIn && !isMockMode) {
      out.push({ id: 'signout', label: 'Sign out', sub: me.data?.user.email ?? undefined });
    }
    return out;
  }, [signedOut, signedIn, latest, list.length, campaigns.isPending, campaigns.isError, me.data]);

  // Desktop only: QUIT is always the last item (the browser build has nothing to quit to).
  const items: MenuItem[] = useMemo(
    () =>
      platform?.isDesktop
        ? [...baseItems, { id: 'quit', label: 'Quit', sub: 'Back to the desktop' }]
        : baseItems,
    [baseItems, platform],
  );

  const defaultId = signedOut ? 'signin' : latest ? 'continue' : 'new';
  const index = Math.max(
    0,
    items.findIndex(
      (i) => i.id === (cursor && items.some((x) => x.id === cursor) ? cursor : defaultId),
    ),
  );

  const open = (s: Screen) => setParams({ screen: s }, { state: { fromMenu: true } });
  const back = () => {
    if ((location.state as { fromMenu?: boolean } | null)?.fromMenu) void navigate(-1);
    else setParams({}, { replace: true });
  };

  const activate = (id: string) => {
    if (id === 'quit') setQuitting(true);
    else if (id === 'continue' && latest) {
      uiSound.whoosh();
      void navigate(campaignPath(latest.id));
    } else if (id === 'signout') {
      signOut.mutate(undefined, { onSuccess: () => toast({ title: 'Signed out' }) });
    } else if (SCREENS.has(id)) open(id as Screen);
  };

  useMenuMusic();
  useUiSoundPreload();
  const rootRef = useRef<HTMLDivElement>(null);
  useClickSounds(rootRef);
  const sound = useSettingsStore((s) => s.sound);
  const setSetting = useSettingsStore((s) => s.set);
  const toggleSound = () => setSetting('sound', !sound);

  // M toggles all sound anywhere on the front end (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'm' && e.key !== 'M')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const store = useSettingsStore.getState();
      store.set('sound', !store.sound);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const start = () => {
    // Inside the start gesture, so the browser lets the music play.
    menuMusic().unlock();
    uiSound.unlock();
    uiSound.whoosh();
    markTitleSeen();
    setStarted(true);
  };

  const mode: keyof typeof PANEL = !started ? 'title' : screen ? SCREEN_PANEL[screen] : 'menu';

  const prompts: Prompt[] = !started
    ? []
    : !screen
      ? [
          { keys: ['↑', '↓'], label: 'Select' },
          { keys: ['Enter'], label: 'Confirm' },
        ]
      : [
          ...(
            {
              new: [
                { keys: ['↑', '↓'], label: 'Move' },
                { keys: ['Enter'], label: 'Next' },
              ],
              load: [
                { keys: ['↑', '↓'], label: 'Select' },
                { keys: ['Enter'], label: 'Load' },
                { keys: ['Del'], label: 'Delete' },
              ],
              settings: [
                { keys: ['↑', '↓'], label: 'Select' },
                { keys: ['←', '→'], label: 'Change' },
              ],
              credits: [],
              signin: [{ keys: ['Enter'], label: 'Confirm' }],
            } satisfies Record<Screen, Prompt[]>
          )[screen],
          { keys: ['Esc'], label: 'Back', onPress: back },
        ];

  const account = isMockMode
    ? 'Demo data'
    : signedIn
      ? me.data?.user.email
        ? `Signed in as ${me.data.user.email}`
        : 'Signed in'
      : signedOut
        ? 'Not signed in'
        : '';

  return (
    <div
      ref={rootRef}
      className="relative isolate flex min-h-dvh flex-col overflow-x-hidden bg-ink text-paper md:h-dvh md:overflow-hidden"
    >
      <MenuBackdrop
        mode={!started ? 'title' : screen ? 'screen' : 'menu'}
        className="fixed md:absolute"
      />

      {/* The ink panel and its red edge stripe, both flat fills clipped to the slash angle. */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed inset-0 bg-ink/90 transition-[clip-path] duration-500 ease-[cubic-bezier(0.6,0,0.2,1)] md:absolute',
          PANEL[mode],
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 hidden bg-whip transition-[clip-path] duration-500 ease-[cubic-bezier(0.6,0,0.2,1)] md:block',
          STRIPE[mode],
        )}
      />

      {/* HUD */}
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-4 bg-ink px-4 text-[11px] font-bold tracking-[0.06em] uppercase md:px-[clamp(1.5rem,4vw,4rem)]">
        <div className="flex items-center gap-3">
          <WhipIcon className="size-7" />
          <span className="text-paper/75 tabular-nums">
            {platform?.appVersion ? `v${platform.appVersion}` : APP_VERSION} · Simulation{' '}
            {latest?.simulationVersion ?? 1}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-4 text-right">
          <span className="hidden text-paper/75 sm:inline">September 2029 · House of Commons</span>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={!sound}
            aria-label={sound ? 'Mute sound (M)' : 'Unmute sound (M)'}
            title={sound ? 'Mute sound (M)' : 'Unmute sound (M)'}
            className="grid size-11 shrink-0 cursor-pointer place-items-center text-paper/80 hover:text-paper-bright focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-whip"
          >
            {sound ? (
              <Volume2 aria-hidden="true" className="size-5" />
            ) : (
              <VolumeX aria-hidden="true" className="size-5 text-whip" />
            )}
          </button>
          {account && (
            <span
              className={cn(
                'truncate normal-case tracking-normal',
                isMockMode ? 'text-warning' : 'text-paper/75',
              )}
            >
              {account}
            </span>
          )}
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pt-6 pb-6 md:px-[clamp(1.5rem,6vw,6rem)] md:pt-[6vh]">
        {!started ? (
          <TitleCard onStart={start} />
        ) : !screen ? (
          <div
            key="menu"
            className="flex flex-1 animate-in-right flex-col md:max-w-[34vw] md:min-w-[22rem]"
          >
            <h1 className="mt-[calc(52dvh-3rem)] text-paper-bright md:mt-0">
              <WhipWordmark
                title="WHIP"
                className="h-auto w-[min(70%,15rem)] md:w-[min(100%,22rem)]"
              />
            </h1>
            <p className="mt-4 max-w-[32ch] text-[15px] leading-snug text-paper/80">
              The new Member for a marginal seat. The whips want your vote.
            </p>
            <nav aria-label="Main menu" className="mt-8 md:mt-auto md:mb-[7vh]">
              {quitting ? (
                <QuitConfirm
                  onCancel={() => setQuitting(false)}
                  onConfirm={() => void platform?.quit()}
                />
              ) : (
                <MenuList
                  label="Main menu"
                  items={items}
                  index={index}
                  onIndexChange={(i) => setCursor(items[i]?.id ?? null)}
                  onActivate={activate}
                />
              )}
            </nav>
          </div>
        ) : (
          <div key={screen} className="flex min-h-0 flex-1 animate-in-left flex-col">
            {screen === 'new' && <NewCareerScreen onBack={back} />}
            {screen === 'load' && (
              <LoadCareerScreen
                campaigns={list}
                isPending={campaigns.isPending}
                error={campaigns.error}
                onRetry={() => void campaigns.refetch()}
                onBack={back}
                onNewCareer={() =>
                  setParams({ screen: 'new' }, { replace: true, state: location.state as unknown })
                }
              />
            )}
            {screen === 'settings' && <SettingsScreen onBack={back} />}
            {screen === 'credits' && <CreditsScreen onBack={back} />}
            {screen === 'signin' && <SignInScreen onBack={back} onSignedIn={back} />}
          </div>
        )}
      </main>

      <footer className="relative z-10 shrink-0">
        <div className="hidden h-12 items-center justify-between gap-6 bg-ink px-[clamp(1.5rem,4vw,4rem)] md:flex">
          <small className="text-[11px] font-semibold text-paper/60">{COPYRIGHT_SHORT}</small>
          <PromptBar prompts={prompts} />
        </div>
        <NewsTicker />
      </footer>
    </div>
  );
}
