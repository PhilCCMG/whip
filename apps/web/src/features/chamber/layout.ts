import type { ParliamentView } from '../../api/types';
import { stableHash } from './model';

export type Party = ParliamentView['composition'][number];

/* Flat colours local to the chamber drawing (the green leather and the carpet). */
export const BENCH = '#284a3a';
export const FLOOR = '#1a3229';
export const TABLE = '#3d5653';

export const ROWS = 6;
export const CELL = 9;
export const PITCH = 11;
const GANGWAY = 16;
const SPEAKER_END = 92;
const BAR_END = 74;
export const LOBBY = 22;
const FLOOR_H = 104;

export interface Seat {
  x: number;
  y: number;
  partyId: string | null;
  colour: string;
}

export interface Layout {
  width: number;
  height: number;
  cols: number;
  bankX: number;
  bankW: number;
  floorTop: number;
  floorBottom: number;
  seats: Seat[];
  player: { x: number; y: number; bank: 'gov' | 'opp' } | null;
}

/**
 * Seat the House: each bank fills column by column from the Speaker's end, front bench first,
 * so a party sits as a block along the bench (the official opposition opposite the government
 * front bench, smaller parties below the gangway). Empty places stay green leather.
 */
export function chamberLayout(
  government: Party[],
  opposition: Party[],
  player: { id: string; partyId: string } | null,
): Layout {
  const govSeats = government.reduce((s, p) => s + p.seats, 0);
  const oppSeats = opposition.reduce((s, p) => s + p.seats, 0);
  const cols = Math.max(40, Math.ceil(Math.max(govSeats, oppSeats) / ROWS));
  const gangwayAfter = Math.round(cols * 0.62);
  const bankX = SPEAKER_END;
  const bankW = cols * PITCH + GANGWAY;
  const width = SPEAKER_END + bankW + BAR_END;
  const oppTop = LOBBY;
  const floorTop = oppTop + ROWS * PITCH;
  const floorBottom = floorTop + FLOOR_H;
  const height = floorBottom + ROWS * PITCH + LOBBY;
  const colX = (c: number) => bankX + c * PITCH + (c >= gangwayAfter ? GANGWAY : 0);

  const seats: Seat[] = [];
  let playerSeat: Layout['player'] = null;

  const fill = (parties: Party[], bank: 'gov' | 'opp') => {
    const order: (Party | null)[] = [];
    for (const p of parties) for (let i = 0; i < p.seats; i++) order.push(p);
    // The player's place: a back-bench seat (rows 2–4) part way along their party's block.
    let mine = -1;
    const pp = player ? parties.find((p) => p.partyId === player.partyId) : undefined;
    if (player && pp) {
      const start = order.indexOf(pp);
      const end = start + pp.seats - 1;
      const firstCol = Math.ceil(start / ROWS);
      const fullCols = Math.max(1, Math.floor((end + 1) / ROWS) - firstCol);
      const h = stableHash(player.id);
      const col = firstCol + Math.min(fullCols - 1, Math.floor(fullCols * 0.3) + (h % 9));
      const row = 2 + (h % 3);
      mine = Math.max(start, Math.min(end, col * ROWS + row));
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < ROWS; r++) {
        const i = c * ROWS + r;
        const p = order[i] ?? null;
        const x = colX(c);
        const y = bank === 'gov' ? floorBottom + r * PITCH : floorTop - (r + 1) * PITCH + 2;
        seats.push({ x, y, partyId: p?.partyId ?? null, colour: p?.colour ?? BENCH });
        if (i === mine) playerSeat = { x, y, bank };
      }
    }
  };
  fill(government, 'gov');
  fill(opposition, 'opp');

  return {
    width,
    height,
    cols,
    bankX,
    bankW,
    floorTop,
    floorBottom,
    seats,
    player: playerSeat,
  };
}
