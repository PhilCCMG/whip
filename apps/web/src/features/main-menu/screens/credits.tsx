import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import studioLogo from '../../../assets/ccmg-logo-white.svg';
import { AFFILIATION_NOTICE, COPYRIGHT, FICTION_NOTICE, STUDIO_NAME } from '../../boot/legal-copy';
import { getPlatform } from '../../../platform';
import { APP_VERSION } from '../copy';
import { useBackKey } from '../keys';
import { ScreenHeader } from '../screen-kit';

/**
 * Opens via the platform adapter: a new tab on the web (no `window.opener`), the system browser on
 * desktop (a webview ignores `target="_blank"`). The attributes stay for semantics and fallbacks.
 */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    void getPlatform().then((p) => p.openExternal(href));
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={open}
      className="text-paper-bright underline decoration-paper/40 underline-offset-2 hover:decoration-paper-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whip"
    >
      {children}
    </a>
  );
}

/** Required attribution for the CC BY 4.0 click sample (docs/brand/THIRD-PARTY-ASSETS.md). */
const AUDIO_CREDIT = (
  <>
    <ExternalLink href="https://freesound.org/s/213148/">{'"Click"'}</ExternalLink> by
    complex_waveform (freesound.org) — licensed under{' '}
    <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExternalLink>
  </>
);

const CREDITS: [string, ReactNode][] = [
  ['Game', 'WHIP, a political career game about loyalty, ambition and the division lobby.'],
  ['Studio', STUDIO_NAME],
  ['Type', 'Archivo by Omnibus-Type. Inter by Rasmus Andersson.'],
  ['Audio', AUDIO_CREDIT],
  ['Version', `${APP_VERSION}, simulation 1.`],
];

export function CreditsScreen({ onBack }: { onBack: () => void }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useBackKey(onBack);
  useEffect(() => ref.current?.focus(), []);

  return (
    <section aria-labelledby={titleId} className="flex min-h-0 w-full max-w-[38rem] flex-col">
      <ScreenHeader id={titleId} title="Credits" onBack={onBack} />
      <div
        ref={ref}
        tabIndex={-1}
        className="mt-7 min-h-0 overflow-y-auto pr-1 pb-2 outline-none scrollbar-thin"
      >
        <img src={studioLogo} alt={STUDIO_NAME} className="h-auto w-[min(100%,15rem)]" />
        <dl className="mt-7 grid gap-4">
          {CREDITS.map(([k, v]) => (
            <div
              key={k}
              className="grid gap-1 border-t border-paper/20 pt-3 sm:grid-cols-[8rem_1fr] sm:gap-6"
            >
              <dt className="font-display text-xl leading-none font-black text-paper-bright uppercase [font-stretch:72%]">
                {k}
              </dt>
              <dd className="text-[15px] leading-relaxed text-paper/85">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 grid max-w-[60ch] gap-3 text-[13px] leading-relaxed text-paper/75">
          <p>{FICTION_NOTICE}</p>
          <p>{AFFILIATION_NOTICE}</p>
          <p className="font-semibold text-paper/85">{COPYRIGHT}</p>
        </div>
      </div>
    </section>
  );
}
