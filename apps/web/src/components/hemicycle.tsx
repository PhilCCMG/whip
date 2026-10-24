import { useMemo } from 'react';

export interface SeatGroup {
  id: string;
  label: string;
  colour: string;
  seats: number;
}

/**
 * Seats laid out in concentric half-rings, filled left to right in group order (so the
 * government sits on one side, the opposition on the other).
 */
export function Hemicycle({
  groups,
  majorityLine,
  className,
}: {
  groups: SeatGroup[];
  majorityLine?: number;
  className?: string;
}) {
  const total = groups.reduce((s, g) => s + g.seats, 0);
  const { seats, radius } = useMemo(() => layout(total), [total]);
  const colours = useMemo(() => {
    const out: string[] = [];
    for (const g of groups) for (let i = 0; i < g.seats; i++) out.push(g.colour);
    return out;
  }, [groups]);
  const W = 200;
  const H = 104;
  const summary = groups.map((g) => `${g.label} ${g.seats}`).join(', ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`House of Commons, ${total} seats: ${summary}`}
      className={className}
    >
      {seats.map((s, i) => (
        <circle
          key={i}
          cx={100 + s.x}
          cy={100 - s.y}
          r={radius}
          fill={colours[i] ?? 'currentColor'}
        />
      ))}
      {majorityLine !== undefined && (
        <line
          x1={100}
          y1={100 - 18}
          x2={100}
          y2={100 - 98}
          stroke="currentColor"
          strokeWidth={0.6}
          strokeDasharray="1.5 1.5"
          opacity={0.6}
        />
      )}
      <text x={100} y={99} textAnchor="middle" fontSize={11} fontWeight={800} fill="currentColor">
        {total}
      </text>
    </svg>
  );
}

function layout(total: number) {
  const rows = Math.max(4, Math.round(Math.sqrt(total / 4.2)));
  const inner = 26;
  const outer = 96;
  const step = (outer - inner) / (rows - 1);
  const radii = Array.from({ length: rows }, (_, r) => inner + r * step);
  const sum = radii.reduce((s, r) => s + r, 0);
  // Seats per row proportional to radius; fix rounding on the outer row.
  const counts = radii.map((r) => Math.round((total * r) / sum));
  const diff = total - counts.reduce((s, c) => s + c, 0);
  counts[rows - 1] = (counts[rows - 1] ?? 0) + diff;
  const seats: { x: number; y: number; angle: number }[] = [];
  radii.forEach((r, ri) => {
    const n = counts[ri] ?? 0;
    for (let i = 0; i < n; i++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * i) / (n - 1);
      seats.push({ x: r * Math.cos(angle), y: r * Math.sin(angle), angle });
    }
  });
  seats.sort((a, b) => b.angle - a.angle || a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
  const radius = Math.min(step * 0.42, 2.4);
  return { seats, rows, radius };
}
