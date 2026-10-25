import { cn, Kicker, WhipWordmark } from '@whip/ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useClickSounds } from '../features/audio/use-ui-sound';
import { useBackKey } from '../features/main-menu/keys';
import { MenuList, type MenuItem } from '../features/main-menu/menu-list';
import { QuitConfirm } from '../features/main-menu/quit-confirm';
import { SettingsScreen } from '../features/main-menu/screens/settings';
import { usePlatform } from '../platform/use-platform';

/**
 * The in-game pause menu (Esc). The front end's ink panel and slash edge over a flat veil of the
 * game, with the main menu's list. Settings reuses the front-end screen as-is.
 */
export function PauseMenu({
  campaignName,
  weekLabel,
  onResume,
}: {
  campaignName: string | undefined;
  weekLabel: string | undefined;
  onResume: () => void;
}) {
  const navigate = useNavigate();
  const platform = usePlatform();
  const [screen, setScreen] = useState<'list' | 'settings'>('list');
  const [quitting, setQuitting] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickSounds(rootRef);

  // Esc / Backspace on the list resumes; on Settings the screen's own back key returns here.
  useBackKey(onResume, screen === 'list' && !quitting);

  // Take focus onto the list on open; give it back to whatever had it in the game on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    rootRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"][tabindex="0"]')
      ?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const items: MenuItem[] = [
    { id: 'resume', label: 'Resume', sub: weekLabel },
    { id: 'settings', label: 'Settings', sub: 'Sound, motion and text size' },
    {
      id: 'exit',
      label: 'Save & exit',
      sub: 'To the main menu. It’s all on the record.',
    },
    ...(platform?.isDesktop ? [{ id: 'quit', label: 'Quit', sub: 'Back to the desktop' }] : []),
  ];

  const activate = (id: string) => {
    if (id === 'resume') onResume();
    else if (id === 'settings') setScreen('settings');
    else if (id === 'exit') void navigate('/', { state: { skipTitle: true } });
    else if (id === 'quit') setQuitting(true);
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Paused"
      className="fixed inset-0 z-[60] flex text-paper"
    >
      {/* Flat veil over the game, then the ink panel and its red edge stripe. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-in-fade bg-ink/80"
        onClick={onResume}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 animate-in-right bg-ink',
          screen === 'list'
            ? 'md:[clip-path:polygon(0_0,40%_0,34%_100%,0_100%)]'
            : 'md:[clip-path:polygon(0_0,60%_0,54%_100%,0_100%)]',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 hidden animate-in-right bg-whip md:block',
          screen === 'list'
            ? '[clip-path:polygon(40%_0,40.6%_0,34.6%_100%,34%_100%)]'
            : '[clip-path:polygon(60%_0,60.6%_0,54.6%_100%,54%_100%)]',
        )}
      />
      <div className="relative flex w-full flex-col overflow-y-auto px-4 py-8 md:px-[clamp(1.5rem,5vw,5rem)] md:py-[8vh]">
        {screen === 'list' ? (
          <div className="flex flex-1 animate-in-right flex-col md:max-w-[30vw] md:min-w-[20rem]">
            <WhipWordmark aria-hidden="true" className="h-auto w-40 text-paper-bright" />
            <Kicker className="mt-6 text-paper/75">Proceedings suspended</Kicker>
            <p className="mt-1 font-display text-2xl leading-none font-black text-paper-bright uppercase [font-stretch:70%]">
              {campaignName ?? 'Your career'}
            </p>
            <nav aria-label="Pause menu" className="mt-10 md:mt-auto md:mb-[6vh]">
              {quitting ? (
                <QuitConfirm
                  onCancel={() => setQuitting(false)}
                  onConfirm={() => void platform?.quit()}
                />
              ) : (
                <MenuList
                  label="Pause menu"
                  items={items}
                  index={Math.min(cursor, items.length - 1)}
                  onIndexChange={setCursor}
                  onActivate={activate}
                />
              )}
            </nav>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 animate-in-left flex-col">
            <SettingsScreen onBack={() => setScreen('list')} />
          </div>
        )}
      </div>
    </div>
  );
}
