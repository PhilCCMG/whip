import type { Effect, GameState } from '@whip/domain';
import { rel } from '../actions/common';
import {
  getBill,
  getDivision,
  getPolitician,
  isGovernmentParty,
  isMinister,
} from '../state/access';
import type { TurnContext } from '../turn/context';

/** Government consequences of this week's divisions (07 §4.3). */
const STABILITY = { comfortable: 5, narrow: -5, defeat: -25 } as const;
const COMFORTABLE_MARGIN = 40;
const NARROW_MARGIN = 20;

/** Phase 7 — government reacts to division results: stability, the sponsor's standing, resignations. */
export function governmentPhase(draft: GameState, tc: TurnContext): void {
  for (const divId of tc.divisionsHeld) {
    const div = getDivision(draft, divId);
    const res = div.result;
    if (!res) continue;
    const bill = getBill(draft, div.billId);
    const sponsor = getPolitician(draft, bill.sponsorId);
    if (!isGovernmentParty(draft, sponsor.partyId)) continue;
    const effects: Effect[] = [];
    if (res.governmentWon) {
      if (res.margin >= COMFORTABLE_MARGIN) {
        effects.push({
          kind: 'government.stability',
          delta: STABILITY.comfortable,
          reason: `comfortable win on the ${bill.title}`,
        });
      } else if (res.margin < NARROW_MARGIN) {
        effects.push({
          kind: 'government.stability',
          delta: STABILITY.narrow,
          reason: `narrow escape on the ${bill.title}`,
        });
        tc.flags.add('headline:narrow');
      }
    } else {
      effects.push({
        kind: 'government.stability',
        delta: STABILITY.defeat,
        reason: `defeat on the ${bill.title}`,
      });
      draft.government.lastDefeatTurn = tc.turn;
      const pm = draft.government.primeMinisterId;
      if (pm !== sponsor.id)
        effects.push(rel(pm, sponsor.id, { respect: -20, trust: -5 }, `lost the ${bill.title}`));
      effects.push({
        kind: 'reputation.adjust',
        politicianId: sponsor.id,
        audience: 'colleagues',
        delta: -10,
        reason: 'lost a flagship bill',
      });
      effects.push({
        kind: 'reputation.adjust',
        politicianId: sponsor.id,
        audience: 'media',
        delta: -10,
        reason: 'lost a flagship bill',
      });
      if (isMinister(sponsor, tc.content)) {
        const office =
          sponsor.offices.find((o) => tc.content.offices[o.officeKey]?.ministerial)?.officeKey ??
          null;
        effects.push({
          kind: 'event.raise',
          definitionKey: 'event.minister_considers_position',
          addresseeId: sponsor.id,
          subjects: {
            politicianIds: [sponsor.id],
            billId: bill.id,
            divisionId: div.id,
            officeKey: office,
          },
        });
      }
    }
    tc.emitAll(draft, effects);
  }
}
