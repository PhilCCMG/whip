import { useEffect, useId, useRef, type ReactNode } from 'react';
import studioLogo from '../../../assets/ccmg-logo-white.svg';
import { AFFILIATION_NOTICE, COPYRIGHT, FICTION_NOTICE, STUDIO_NAME } from '../../boot/legal-copy';
import { APP_VERSION } from '../copy';
import { useBackKey } from '../keys';
import { ScreenHeader } from '../screen-kit';

/**
 * Sound effect attributions (docs/brand/THIRD-PARTY-ASSETS.md). Plain text on purpose: no
 * external links from the game. The music, the whoosh and the division bells are CheatCode Media
 * Group's own and need no credit.
 */
const AUDIO_CREDITS = [
  '"Click" by complex_waveform (freesound.org), licensed under CC BY 4.0',
  '"thick-stamp-nosub.wav" by newagesoup (freesound.org), licensed under CC BY 4.0',
  '"Page Turn 01" by LilMati (freesound.org), CC0',
  '"traditional stamp.wav" by I.fekry (freesound.org), CC0',
] as const;

const AUDIO_CREDIT = (
  <ul className="grid gap-1">
    {AUDIO_CREDITS.map((line) => (
      <li key={line}>{line}</li>
    ))}
  </ul>
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
