import { CapitalIcon, cn, Keycap, Portrait, ResourceCounter, WhipIcon } from '@whip/ui';
import { Menu, Volume2, VolumeX } from 'lucide-react';
import { NavLink } from 'react-router';
import { isMockMode } from '../api/runtime';
import type { CareerOverview } from '../api/types';
import { parseSimDate, signed } from '../lib/format';
import { campaignPath } from '../lib/params';
import { useSettingsStore } from '../stores/settings-store';
import { PLACES } from './places';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The week as a tear-off calendar block: a red header with the week number over a paper leaf
 * showing the date. The single most prominent readout in the HUD.
 */
export function HudCalendar({ turn, simDate }: { turn: number; simDate: string }) {
  const d = parseSimDate(simDate);
  const label = `Week ${turn}, ${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return (
    <div className="flex h-full items-stretch" role="group" aria-label={label}>
      <div aria-hidden="true" className="flex w-[4.25rem] flex-col bg-paper-bright text-ink">
        <span className="bg-whip py-[3px] text-center text-[10px] leading-none font-black tracking-[0.12em] text-white uppercase">
          Week
        </span>
        <span className="grid flex-1 place-items-center font-display text-[2rem] leading-none font-black tabular-nums [font-stretch:70%]">
          {String(turn).padStart(2, '0')}
        </span>
      </div>
      <div aria-hidden="true" className="flex flex-col justify-center px-3 max-sm:hidden">
        <span className="text-[10px] leading-none font-bold tracking-[0.12em] text-paper/70 uppercase">
          {DAYS[d.getUTCDay()]}
        </span>
        <span className="mt-1 font-display text-[1.35rem] leading-none font-black text-paper-bright uppercase tabular-nums [font-stretch:72%]">
          {d.getUTCDate()} {MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()}
        </span>
      </div>
      <div aria-hidden="true" className="flex flex-col justify-center px-2.5 sm:hidden">
        <span className="font-display text-lg leading-none font-black text-paper-bright uppercase tabular-nums [font-stretch:72%]">
          {d.getUTCDate()} {MONTHS[d.getUTCMonth()]}
        </span>
      </div>
    </div>
  );
}

export function HudResources({ overview }: { overview: CareerOverview }) {
  const { politicalCapital, capitalIncome, influence } = overview.standing;
  return (
    <div className="flex items-center gap-5">
      <ResourceCounter
        label="Capital"
        value={politicalCapital}
        delta={`${signed(capitalIncome)}/wk`}
        deltaTone={capitalIncome > 0 ? 'good' : capitalIncome < 0 ? 'bad' : 'neutral'}
        icon={<CapitalIcon className="text-lamp text-lg" />}
        aria-label={`Political capital ${politicalCapital}, ${signed(capitalIncome)} a week`}
        role="group"
      />
      <ResourceCounter
        className="max-md:hidden"
        label="Influence"
        value={Math.round(influence.total)}
        delta={`${overview.standing.endorsements.length} endorsed`}
        aria-label={`Influence ${Math.round(influence.total)}`}
        role="group"
      />
    </div>
  );
}

export function HudPlayer({ overview }: { overview: CareerOverview }) {
  const { player } = overview;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Portrait seed={player.id} partyColour={player.partyColour} size="sm" className="size-10" />
      <div className="min-w-0 max-lg:hidden">
        <p className="truncate font-display text-[1.05rem] leading-none font-black text-paper-bright uppercase [font-stretch:72%]">
          {player.name}
        </p>
        <p className="mt-1 truncate text-[11px] leading-none font-semibold text-paper/70">
          {player.offices[0] ?? 'Backbencher'} · {player.constituencyName}
        </p>
      </div>
    </div>
  );
}

export function MuteButton() {
  const sound = useSettingsStore((s) => s.sound);
  const set = useSettingsStore((s) => s.set);
  return (
    <button
      type="button"
      onClick={() => set('sound', !sound)}
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
  );
}

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Menu (Esc)"
      className="flex h-11 shrink-0 cursor-pointer items-center gap-2 px-2 text-[11px] font-bold tracking-[0.08em] text-paper/85 uppercase hover:text-paper-bright focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-whip"
    >
      <Menu aria-hidden="true" className="size-5" />
      <span className="max-md:hidden">Menu</span>
      <Keycap aria-hidden="true" className="max-md:hidden">
        Esc
      </Keycap>
    </button>
  );
}

/** The HUD's top strip: calendar, resources, the player, sound and menu. */
export function HudBar({
  overview,
  onMenu,
}: {
  overview: CareerOverview | undefined;
  onMenu: () => void;
}) {
  return (
    <div className="flex h-14 shrink-0 items-stretch gap-3 bg-ink pr-2 text-paper sm:gap-5 md:pr-4">
      <span className="grid w-14 shrink-0 place-items-center max-sm:hidden" aria-hidden="true">
        <WhipIcon className="size-8" />
      </span>
      {overview ? (
        <>
          <HudCalendar turn={overview.campaign.turn} simDate={overview.campaign.simDate} />
          <HudResources overview={overview} />
          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-3">
            {isMockMode && (
              <span className="text-[11px] font-bold tracking-[0.06em] text-warning uppercase max-xl:hidden">
                Demo data
              </span>
            )}
            <HudPlayer overview={overview} />
            <MuteButton />
            <MenuButton onClick={onMenu} />
          </div>
        </>
      ) : (
        <div className="ml-auto flex items-center gap-2">
          <MuteButton />
          <MenuButton onClick={onMenu} />
        </div>
      )}
    </div>
  );
}

/**
 * Screen navigation as place tabs. Desktop: a strip of angled plates under the HUD, each with
 * its number key. Mobile: a fixed bottom bar.
 */
export function PlaceTabs({
  campaignId,
  variant,
  badges,
}: {
  campaignId: string;
  variant: 'strip' | 'bar';
  badges?: Partial<Record<string, number>> | undefined;
}) {
  if (variant === 'bar') {
    return (
      <nav
        aria-label="Places"
        className="shrink-0 bg-ink pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {PLACES.map((p) => (
            <li key={p.key}>
              <NavLink
                to={campaignPath(campaignId, p.path)}
                end={p.path === ''}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-[0.06em] uppercase',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-whip',
                    isActive ? 'bg-paper-bright text-ink' : 'text-paper/75',
                  )
                }
              >
                <span
                  aria-hidden="true"
                  className="font-display text-lg leading-none font-black [font-stretch:70%]"
                >
                  {p.hotkey}
                </span>
                {p.short}
                {!!badges?.[p.key] && (
                  <span className="absolute top-1.5 right-2 bg-whip px-1 text-[10px] leading-4 text-white tabular-nums">
                    {badges[p.key]}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Places" className="shrink-0 bg-ink max-md:hidden">
      <ul className="flex h-12 items-end gap-1 border-b-[3px] border-paper-bright px-4">
        {PLACES.map((p) => (
          <li key={p.key} className="h-10">
            <NavLink
              to={campaignPath(campaignId, p.path)}
              end={p.path === ''}
              title={`${p.blurb} (${p.hotkey})`}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-full items-center gap-2.5 pr-[1.6rem] pl-4 [clip-path:polygon(0_0,100%_0,calc(100%-0.75rem)_100%,0_100%)]',
                  'font-display text-[1.35rem] leading-none font-black uppercase [font-stretch:70%]',
                  'focus-visible:outline-none focus-visible:[&>.focus-ring]:block',
                  isActive
                    ? 'bg-paper-bright text-ink'
                    : 'bg-moss-900 text-paper-muted hover:bg-moss-800 hover:text-paper-bright',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Keycap
                    aria-hidden="true"
                    tone={isActive ? 'light' : 'dark'}
                    className="h-5 min-w-5 text-[10px]"
                  >
                    {p.hotkey}
                  </Keycap>
                  {p.label}
                  {!!badges?.[p.key] && (
                    <span className="bg-whip px-1.5 py-0.5 font-sans text-[11px] leading-none font-bold text-white tabular-nums">
                      {badges[p.key]}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className="focus-ring absolute inset-x-1 bottom-1 hidden h-[3px] bg-whip"
                  />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
