import {
  CapitalIcon,
  DisplayTitle,
  Kicker,
  PartyChip,
  PipMeter,
  Portrait,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@whip/ui';
import type { CareerOverview } from '../../api/types';
import { formatNumber, REPUTATION_LABELS, signed, SKILL_LABELS } from '../../lib/format';

/** The player as a character sheet: who they are, what they can spend, how they're regarded. */
export function CharacterSheet({ overview }: { overview: CareerOverview }) {
  const { player, standing } = overview;
  const skills = Object.entries(player.skills).sort((a, b) => b[1] - a[1]);
  return (
    <section
      aria-labelledby="sheet-title"
      className="bg-ink text-paper outline-2 -outline-offset-2 outline-paper/15"
    >
      <div className="h-1.5" style={{ backgroundColor: player.partyColour }} aria-hidden="true" />
      <div className="flex gap-4 p-4">
        <Portrait
          seed={player.id}
          partyColour={player.partyColour}
          size="lg"
          className="size-[5.5rem]"
        />
        <div className="min-w-0">
          <PartyChip
            colour={player.partyColour}
            label={player.partyName}
            className="text-paper/85"
          />
          <DisplayTitle as="h2" size="md" id="sheet-title" className="mt-1.5 text-paper-bright">
            {player.name}
          </DisplayTitle>
          <p className="mt-1 text-[12px] text-paper/75">
            {player.offices[0] ?? 'Backbencher'} · Member for {player.constituencyName}
          </p>
          <p className="mt-0.5 text-[12px] text-paper/75">
            {player.factionName ? `${player.factionName} faction` : 'No faction'}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 border-y border-paper/15">
        {[
          {
            label: 'Capital',
            value: (
              <>
                <CapitalIcon className="mr-1 text-[0.6em] text-lamp" />
                {standing.politicalCapital}
              </>
            ),
            sub: `${signed(standing.capitalIncome)} next week`,
          },
          {
            label: 'Influence',
            value: Math.round(standing.influence.total),
            sub: `${standing.endorsements.length} endorsements`,
          },
          {
            label: 'Majority',
            value: player.majority === null ? '—' : formatNumber(player.majority),
            sub: `Loyalty ${Math.round(standing.partyLoyalty)}`,
          },
        ].map(({ label, value, sub }, i) => (
          <div
            key={label}
            className={i > 0 ? 'border-l border-paper/15 px-3 py-2.5' : 'px-3 py-2.5'}
          >
            <dt className="text-[10px] font-bold tracking-[0.08em] text-paper/70 uppercase">
              {label}
            </dt>
            <dd className="mt-1 flex items-center font-display text-[1.9rem] leading-none font-black text-paper-bright tabular-nums [font-stretch:72%]">
              {value}
            </dd>
            <dd className="mt-1 text-[11px] text-paper/70">{sub}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 p-4">
        <div>
          <Kicker className="mb-2 text-paper/70">Skills</Kicker>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {skills.map(([key, v]) => (
              <PipMeter
                key={key}
                tone="paper"
                label={SKILL_LABELS[key] ?? key}
                value={v}
                min={0}
                max={20}
                pips={10}
              />
            ))}
          </div>
        </div>

        <div>
          <Kicker className="mb-2 text-paper/70">Reputation</Kicker>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {Object.entries(standing.reputation).map(([k, v]) => (
              <PipMeter
                key={k}
                tone="paper"
                label={REPUTATION_LABELS[k] ?? k}
                value={v}
                min={-100}
                max={100}
                pips={10}
                display={signed(Math.round(v))}
              />
            ))}
          </div>
        </div>

        <div>
          <Kicker className="mb-1.5 text-paper/70">Where your influence comes from</Kicker>
          <ul className="grid">
            {standing.influence.breakdown.map((b) => (
              <li
                key={b.label}
                className="flex items-baseline justify-between gap-3 border-b border-paper/10 py-1 text-[13px]"
              >
                <span>{b.label}</span>
                <span
                  className={
                    b.value < 0
                      ? 'font-bold text-whip tabular-nums'
                      : 'font-bold text-paper-bright tabular-nums'
                  }
                >
                  {signed(Math.round(b.value))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {player.traits.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Traits">
            {player.traits.map((t) => (
              <li key={t.key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="inline-block bg-paper-bright px-2 py-1 text-[11px] font-bold tracking-[0.04em] text-ink uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whip"
                    >
                      {t.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t.description}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
        {standing.endorsements.length > 0 && (
          <p className="text-[12px] text-paper/75">
            Endorsed by{' '}
            <span className="font-semibold text-paper-bright">
              {standing.endorsements.map((e) => e.name).join(', ')}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
