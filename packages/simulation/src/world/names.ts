import type { PlaceNameParts } from '@whip/domain';
import type { Rng } from '../rng';

/** `con.<slug>` style slug: lowercase, `&` → and, non-alphanumerics → `_`. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Deterministic generator of unique, plausible constituency names for one nation: plain towns,
 * stem+ending compounds, compass-qualified seats ("Ashford North") and paired seats
 * ("Melbridge and the Vale").
 */
export class ConstituencyNamer {
  private readonly bases: string[];
  private next = 0;
  constructor(
    private readonly parts: PlaceNameParts,
    private readonly rng: Rng,
    private readonly used: Set<string>,
  ) {
    const compounds: string[] = [];
    for (const s of parts.stems) for (const e of parts.endings) compounds.push(`${s}${e}`);
    this.bases = rng.shuffle([...parts.towns, ...rng.shuffle(compounds)]);
  }

  private base(): string {
    const b = this.bases[this.next % this.bases.length] ?? 'Newtown';
    this.next += 1;
    return b;
  }

  name(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      const roll = this.rng.float();
      let candidate: string;
      if (roll < 0.62) candidate = this.base();
      else if (roll < 0.82) candidate = `${this.base()} ${this.rng.pick(this.parts.qualifiers)}`;
      else if (roll < 0.94) candidate = `${this.base()} and ${this.rng.pick(this.parts.districts)}`;
      else candidate = `${this.base()} and ${this.base()}`;
      if (!this.used.has(candidate)) {
        this.used.add(candidate);
        return candidate;
      }
    }
    // Exhausted plain forms: fall back to a numbered qualifier (never expected with current content).
    const b = this.base();
    let n = 2;
    while (this.used.has(`${b} ${n}`)) n++;
    const fallback = `${b} ${n}`;
    this.used.add(fallback);
    return fallback;
  }
}
