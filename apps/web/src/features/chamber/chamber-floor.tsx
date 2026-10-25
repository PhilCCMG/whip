import { cn, Kicker } from '@whip/ui';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { ParliamentView } from '../../api/types';
import { uiSound } from '../audio/use-ui-sound';
import {
  CELL,
  chamberLayout,
  FLOOR,
  LOBBY,
  PITCH,
  ROWS,
  TABLE,
  type Layout,
  type Party,
  type Seat,
} from './layout';

/** The floor of the House, drawn flat: benches, table, despatch boxes, the Speaker, the Bar. */
function ChamberDrawing({
  layout,
  active,
  onHover,
}: {
  layout: Layout;
  active: string | null;
  onHover: (partyId: string | null) => void;
}) {
  const { width, height, bankX, bankW, floorTop, floorBottom, seats, player } = layout;
  const midY = (floorTop + floorBottom) / 2;
  const tableX = bankX + 24;
  const tableW = Math.round(bankW * 0.36);
  const barX = bankX + bankW + 22;
  const label = 'font-sans text-[8.5px] font-bold tracking-[0.12em] uppercase';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto max-h-[30rem] w-full"
      aria-hidden="true"
      focusable="false"
      onMouseLeave={() => onHover(null)}
    >
      {/* Carpet. */}
      <rect x={0} y={floorTop} width={width} height={floorBottom - floorTop} fill={FLOOR} />
      {/* The red lines: two sword-lengths apart. */}
      <rect x={bankX} y={floorTop + 9} width={bankW} height={1.6} fill="var(--color-whip)" />
      <rect x={bankX} y={floorBottom - 10.6} width={bankW} height={1.6} fill="var(--color-whip)" />

      {/* Lobby labels: Ayes to the Speaker's right, Noes to the left. */}
      <text x={bankX} y={13} className={label} fill="var(--color-paper)" opacity={0.7}>
        Opposition benches
      </text>
      <text
        x={bankX + bankW}
        y={13}
        textAnchor="end"
        className={label}
        fill="var(--color-paper)"
        opacity={0.55}
      >
        No lobby →
      </text>
      <text x={bankX} y={height - 7} className={label} fill="var(--color-paper)" opacity={0.7}>
        Government benches · the Speaker’s right
      </text>
      <text
        x={bankX + bankW}
        y={height - 7}
        textAnchor="end"
        className={label}
        fill="var(--color-paper)"
        opacity={0.55}
      >
        Aye lobby →
      </text>

      {/* Seats, grouped by party for hover. */}
      {Object.entries(groupBy(seats)).map(([pid, group]) => (
        <g
          key={pid}
          opacity={active && pid !== active ? 0.28 : 1}
          onMouseEnter={() => onHover(pid === '' ? null : pid)}
          className="transition-opacity duration-150"
        >
          {group.map((s, i) => (
            <rect key={i} x={s.x} y={s.y} width={CELL} height={CELL} fill={s.colour} />
          ))}
        </g>
      ))}

      {/* The Table of the House, despatch boxes and the Mace. */}
      <rect x={tableX} y={midY - 17} width={tableW} height={34} fill={TABLE} />
      <rect
        x={tableX + tableW * 0.3}
        y={midY - 17}
        width={16}
        height={7}
        fill="var(--color-paper-deep)"
      />
      <rect
        x={tableX + tableW * 0.3}
        y={midY + 10}
        width={16}
        height={7}
        fill="var(--color-paper-deep)"
      />
      <rect
        x={tableX + tableW * 0.62}
        y={midY - 1.5}
        width={tableW * 0.3}
        height={3}
        fill="var(--color-lamp)"
      />
      {/* Clerks at the Speaker's end of the Table. */}
      {[-10, 0, 10].map((dy) => (
        <rect
          key={dy}
          x={tableX + 4}
          y={midY + dy - 3}
          width={6}
          height={6}
          fill="var(--color-moss-400)"
        />
      ))}
      <text
        x={tableX + tableW + 8}
        y={midY + 3}
        className={label}
        fill="var(--color-paper)"
        opacity={0.55}
      >
        The Table
      </text>

      {/* The Speaker's chair, canopied. */}
      <polygon
        points={`${bankX - 52},${midY - 26} ${bankX - 38},${midY - 36} ${bankX - 24},${midY - 26}`}
        fill="var(--color-lamp)"
      />
      <rect x={bankX - 50} y={midY - 26} width={24} height={44} fill="var(--color-moss-800)" />
      <rect x={bankX - 45} y={midY - 14} width={14} height={20} fill="var(--color-paper-deep)" />
      <text
        x={bankX - 38}
        y={midY + 32}
        textAnchor="middle"
        className={label}
        fill="var(--color-paper)"
        opacity={0.7}
      >
        Speaker
      </text>

      {/* The Bar of the House. */}
      <rect
        x={barX}
        y={floorTop + 4}
        width={2.5}
        height={floorBottom - floorTop - 8}
        fill="var(--color-paper-bright)"
        opacity={0.75}
      />
      <text
        x={barX + 12}
        y={midY}
        className={label}
        fill="var(--color-paper)"
        opacity={0.7}
        transform={`rotate(90 ${barX + 12} ${midY})`}
        textAnchor="middle"
      >
        The Bar
      </text>

      {/* Your seat: lit, with the slash beside the bank. */}
      {player && (
        <g>
          <rect
            x={player.x - 1.5}
            y={player.y - 1.5}
            width={CELL + 3}
            height={CELL + 3}
            fill="var(--color-paper-bright)"
          />
          <rect
            x={player.x + 1.5}
            y={player.y + 1.5}
            width={CELL - 3}
            height={CELL - 3}
            fill="var(--color-ink)"
          />
          {player.bank === 'gov' ? (
            <>
              <rect
                x={player.x + CELL / 2 - 0.75}
                y={player.y + CELL + 1.5}
                width={1.5}
                height={floorBottom + ROWS * PITCH - player.y - CELL + 1}
                fill="var(--color-paper-bright)"
              />
              <polygon
                points={slashPoints(player.x + CELL / 2 + 4, height - 18, 16)}
                fill="var(--color-whip)"
              />
              <text
                x={player.x + CELL / 2 + 16}
                y={height - 5}
                className="font-display text-[12px] font-black uppercase"
                fill="var(--color-paper-bright)"
              >
                You
              </text>
            </>
          ) : (
            <>
              <rect
                x={player.x + CELL / 2 - 0.75}
                y={LOBBY - 2}
                width={1.5}
                height={player.y - LOBBY + 0.5}
                fill="var(--color-paper-bright)"
              />
              <polygon
                points={slashPoints(player.x + CELL / 2 + 4, 2, 16)}
                fill="var(--color-whip)"
              />
              <text
                x={player.x + CELL / 2 + 16}
                y={15}
                className="font-display text-[12px] font-black uppercase"
                fill="var(--color-paper-bright)"
              >
                You
              </text>
            </>
          )}
        </g>
      )}
    </svg>
  );
}

function slashPoints(x: number, y: number, h: number): string {
  const lean = h * 0.23;
  const w = h * 0.2;
  return `${x + lean},${y} ${x + lean + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

function groupBy(seats: Seat[]): Record<string, Seat[]> {
  const out: Record<string, Seat[]> = {};
  for (const s of seats) (out[s.partyId ?? ''] ??= []).push(s);
  return out;
}

/** Phones: the two banks as proportional bars facing across the Table. */
function CompactChamber({
  government,
  opposition,
  total,
  active,
}: {
  government: Party[];
  opposition: Party[];
  total: number;
  active: string | null;
}) {
  const bank = (parties: Party[], label: string) => {
    const seats = parties.reduce((s, p) => s + p.seats, 0);
    return (
      <div className="grid gap-1.5">
        <p className="flex justify-between text-[10px] font-bold tracking-[0.1em] text-paper/75 uppercase">
          <span>{label}</span>
          <span className="tabular-nums">{seats}</span>
        </p>
        <div className="flex h-7 gap-[2px] bg-[#284a3a] p-[3px]">
          {parties.map((p) => (
            <span
              key={p.partyId}
              className={cn('transition-opacity', active && active !== p.partyId && 'opacity-30')}
              style={{ background: p.colour, flexGrow: p.seats, flexBasis: 0 }}
            />
          ))}
          <span style={{ flexGrow: Math.max(0, total / 2 - seats), flexBasis: 0 }} />
        </div>
      </div>
    );
  };
  return (
    <div aria-hidden="true" className="grid gap-2">
      {bank(opposition, 'Opposition benches')}
      <div className="relative flex h-8 items-center bg-[#1a3229] px-2">
        <span className="h-full w-3 bg-moss-800" />
        <span className="ml-3 h-3 w-1/3 bg-[#3d5653]" />
        <span className="ml-auto text-[9px] font-bold tracking-[0.12em] text-paper/60 uppercase">
          The Bar
        </span>
        <span className="ml-2 h-6 w-[2px] bg-paper-bright/70" />
      </div>
      {bank(government, 'Government benches')}
    </div>
  );
}

/**
 * THE HOUSE: the Commons from above. Seats are blocks in party colours; hover a bench or move
 * through the party key (arrow keys) to read who sits where. Your own seat is lit and slashed.
 */
export function ChamberFloor({
  parliament,
  player,
  className,
}: {
  parliament: ParliamentView;
  player: { id: string; partyId: string; constituencyName: string } | null;
  className?: string;
}) {
  const government = parliament.composition.filter((c) => c.inGovernment);
  const opposition = parliament.composition
    .filter((c) => !c.inGovernment)
    .sort((a, b) => b.seats - a.seats);
  const parties = [...government, ...opposition];
  const layout = chamberLayout(government, opposition, player);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const active = hovered ?? focused;
  const shown = parties.find((p) => p.partyId === active) ?? null;
  const keyRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [cursor, setCursor] = useState(0);

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    const jump = e.key === 'Home' ? 0 : e.key === 'End' ? parties.length - 1 : null;
    if (!delta && jump === null) return;
    e.preventDefault();
    const next = jump ?? (cursor + delta + parties.length) % parties.length;
    setCursor(next);
    keyRefs.current[next]?.focus();
    uiSound.click();
  };

  const half = Math.floor(parliament.totalSeats / 2) + 1;

  return (
    <div
      className={cn(
        'grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_16rem] xl:gap-6',
        className,
      )}
    >
      <div>
        <div className="max-md:hidden">
          <ChamberDrawing layout={layout} active={active} onHover={setHovered} />
        </div>
        <div className="md:hidden">
          <CompactChamber
            government={government}
            opposition={opposition}
            total={parliament.totalSeats}
            active={active}
          />
        </div>
      </div>

      <div className="grid gap-3 xl:border-l xl:border-paper/15 xl:pl-5">
        {/* Readout: the bench under the cursor, or your own place. */}
        <div
          aria-live="polite"
          className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-paper/15 pb-3 xl:min-h-[6.5rem] xl:flex-col xl:items-start xl:justify-end"
        >
          {shown ? (
            <>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  style={{ background: shown.colour }}
                />
                <span className="font-display text-[1.35rem] leading-[0.95] font-black text-paper-bright uppercase [font-stretch:70%]">
                  {shown.name}
                </span>
              </span>
              <span className="text-[13px] font-semibold text-paper/80 tabular-nums">
                {shown.seats} {shown.seats === 1 ? 'seat' : 'seats'} ·{' '}
                {shown.inGovernment ? 'Government' : 'Opposition'} ·{' '}
                {Math.round((shown.seats / parliament.totalSeats) * 100)}% of the House
              </span>
            </>
          ) : (
            <span className="text-[13px] leading-snug text-paper/80">
              {player ? (
                <>
                  <span className="font-bold text-paper-bright">You</span> sit on the{' '}
                  {government.some((g) => g.partyId === player.partyId)
                    ? 'government'
                    : 'opposition'}{' '}
                  back benches, Member for {player.constituencyName}.{' '}
                </>
              ) : null}
              <span className="text-paper/65">
                {half} votes win a division if everyone turns up, which they never do.
              </span>
            </span>
          )}
        </div>

        {/* Party key: one tab stop, arrows move along it. */}
        <div className="grid gap-2">
          <Kicker className="text-paper/65">Benches · hover or arrow keys</Kicker>
          <ul
            aria-label="Seats by party"
            className="flex flex-wrap gap-1.5 xl:grid xl:gap-[2px]"
            onKeyDown={onKey}
          >
            {parties.map((p, i) => (
              <li key={p.partyId}>
                <button
                  ref={(el) => {
                    keyRefs.current[i] = el;
                  }}
                  type="button"
                  tabIndex={i === cursor ? 0 : -1}
                  aria-label={`${p.name}: ${p.seats} seats, ${p.inGovernment ? 'government' : 'opposition'}`}
                  onMouseEnter={() => setHovered(p.partyId)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => {
                    setCursor(i);
                    setFocused(p.partyId);
                  }}
                  onBlur={() => setFocused(null)}
                  className={cn(
                    'flex h-8 w-full cursor-pointer items-center gap-2 bg-desk px-2 text-[12px] font-bold text-paper-bright tabular-nums outline-none hover:bg-moss-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-paper-bright',
                    active === p.partyId && 'bg-moss-800',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-2 shrink-0"
                    style={{ background: p.colour }}
                  />
                  <span className="xl:hidden">{p.shortName}</span>
                  <span className="min-w-0 truncate text-left max-xl:hidden">{p.name}</span>
                  <span className="ml-auto pl-2 font-display text-[15px] leading-none font-black [font-stretch:75%]">
                    {p.seats}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
