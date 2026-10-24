import { cn } from '@whip/ui';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useSettingsStore } from '../../../stores/settings-store';
import { uiSound } from '../../audio/use-ui-sound';
import { DOWN_KEYS, UP_KEYS, useBackKey } from '../keys';
import { OptionTiles, ScreenHeader } from '../screen-kit';

/** The element that takes focus when ↑/↓ lands on a row. */
const ROW_FOCUS = '[role="radio"][tabindex="0"], [role="slider"]';

function Row({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div
      data-setting-row
      className="grid gap-3 border-t border-paper/20 pt-4 sm:grid-cols-[11rem_1fr] sm:gap-6"
    >
      <div>
        <p className="font-display text-2xl leading-none font-black text-paper-bright uppercase [font-stretch:72%]">
          {label}
        </p>
        <p className="mt-1.5 text-[13px] text-paper/75">{help}</p>
      </div>
      <div className="content-start">{children}</div>
    </div>
  );
}

/** Ten flat bars, ←/→ (or A/D) in 10% steps. ARIA slider. */
function VolumeBars({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const steps = Math.round(value * 10);
  // Tick after the change, so moving the Effects bars previews the new level.
  const set = (n: number) => {
    const next = Math.min(10, Math.max(0, n));
    if (next === steps) return;
    onChange(next / 10);
    uiSound.click();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      set(steps - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      set(steps + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      set(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      set(10);
    }
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={steps * 10}
      aria-valuetext={`${steps * 10}%`}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className="flex w-fit items-center gap-4 py-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper-bright"
    >
      <span className="flex h-9 items-end gap-1" data-sfx="off">
        {Array.from({ length: 10 }, (_, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => set(i + 1 === steps ? i : i + 1)}
            className={cn(
              'w-3.5 cursor-pointer',
              i < steps ? (disabled ? 'bg-paper/40' : 'bg-paper-bright') : 'bg-paper/15',
            )}
            style={{ height: `${40 + i * 6.6}%` }}
          />
        ))}
      </span>
      <span className="w-[4ch] font-display text-xl font-black text-paper-bright tabular-nums [font-stretch:75%]">
        {steps * 10}
      </span>
    </div>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const titleId = useId();
  const settings = useSettingsStore();
  const bodyRef = useRef<HTMLDivElement>(null);
  useBackKey(onBack);

  useEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>(ROW_FOCUS)?.focus();
  }, []);

  /** ↑/↓ move between rows; ←/→ change the value inside a row. */
  const onKeyDown = (e: KeyboardEvent) => {
    if (!UP_KEYS.has(e.key) && !DOWN_KEYS.has(e.key)) return;
    const rows = [...(bodyRef.current?.querySelectorAll<HTMLElement>('[data-setting-row]') ?? [])];
    const i = rows.findIndex((g) => g.contains(document.activeElement));
    const next = rows[i + (UP_KEYS.has(e.key) ? -1 : 1)]?.querySelector<HTMLElement>(ROW_FOCUS);
    e.preventDefault();
    if (next) {
      next.focus();
      uiSound.click();
    }
  };

  return (
    <section aria-labelledby={titleId} className="flex w-full max-w-[40rem] flex-col">
      <ScreenHeader id={titleId} title="Settings" onBack={onBack}>
        <p className="mt-3 text-[15px] text-paper/80">Saved in this browser.</p>
      </ScreenHeader>
      <div
        ref={bodyRef}
        onKeyDown={onKeyDown}
        className="mt-8 grid gap-7 overflow-y-auto pb-2 scrollbar-thin"
      >
        <Row
          label="Sound"
          help="All game audio: music and effects. Press M in the menus to toggle it."
        >
          <OptionTiles
            label="Sound"
            orientation="horizontal"
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={settings.sound ? 'on' : 'off'}
            onChange={(v) => settings.set('sound', v === 'on')}
          />
        </Row>
        <Row label="Music" help="Volume of the menu music.">
          <VolumeBars
            label="Music volume"
            value={settings.musicVolume}
            disabled={!settings.sound}
            onChange={(v) => settings.set('musicVolume', v)}
          />
        </Row>
        <Row label="Effects" help="Volume of menu clicks and transitions.">
          <VolumeBars
            label="Effects volume"
            value={settings.effectsVolume}
            disabled={!settings.sound}
            onChange={(v) => settings.set('effectsVolume', v)}
          />
        </Row>
        <Row
          label="Motion"
          help="The backdrop drift, the news crawl and screen transitions. System follows your device."
        >
          <OptionTiles
            label="Motion"
            orientation="horizontal"
            options={[
              { value: 'system', label: 'System' },
              { value: 'reduced', label: 'Reduced' },
              { value: 'full', label: 'Full' },
            ]}
            value={settings.motion}
            onChange={(v) => settings.set('motion', v)}
          />
        </Row>
        <Row label="Text size" help="Scales all text and controls in the game.">
          <OptionTiles
            label="Text size"
            orientation="horizontal"
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'large', label: 'Large' },
            ]}
            value={settings.textSize}
            onChange={(v) => settings.set('textSize', v)}
          />
        </Row>
      </div>
    </section>
  );
}
