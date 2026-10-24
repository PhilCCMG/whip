import { describe, expect, it } from 'vitest';
import { checkInvariants, selectors, STATE_SCHEMA_VERSION } from '../src';
import { majorityOf } from '../src/state/access';
import { ctx, newGame, pid, SECOND_READING } from './helpers';

describe('createCampaignState (First Weeks)', () => {
  const s = newGame(2029);

  it('builds 650 MPs in 650 constituencies across 7 parties with the spec seat totals', () => {
    expect(s.constituencies.ids).toHaveLength(650);
    const mps = s.politicians.ids.filter((id) => s.politicians.byId[id]?.status === 'mp');
    expect(mps).toHaveLength(650);
    expect(s.parties.ids).toHaveLength(7);
    expect(selectors.seatTotals(s)).toEqual({
      'party.npp': 362,
      'party.con': 168,
      'party.lr': 58,
      'party.scp': 32,
      'party.sov': 12,
      'party.grn': 6,
      'party.ind': 12,
    });
    expect(selectors.governmentMajority(s)).toBe(74);
  });

  it('splits seats by nation (England 543, Scotland 57, Wales 32, NI 18); SCP Scottish; IND in NI', () => {
    const byNation: Record<string, number> = {};
    for (const id of s.constituencies.ids) {
      const c = s.constituencies.byId[id]!;
      byNation[c.nation] = (byNation[c.nation] ?? 0) + 1;
      const mp = s.politicians.byId[c.currentMpId!]!;
      if (mp.partyId === 'party.scp') expect(c.nation).toBe('scotland');
      if (mp.partyId === 'party.ind') expect(c.nation).toBe('northern_ireland');
    }
    expect(byNation).toEqual({ england: 543, scotland: 57, wales: 32, northern_ireland: 18 });
  });

  it('places the player in Ashby and Wold, a 1,840 marginal over CON, with 3 capital and 5 slots', () => {
    const me = selectors.player(s);
    expect(me.constituencyId).toBe('con.ashby_and_wold');
    const seat = s.constituencies.byId[me.constituencyId!]!;
    expect(majorityOf(seat)).toBe(1840);
    const result = seat.results[0]!;
    const runnerUp = Object.entries(result.votes).sort((a, b) => b[1] - a[1])[1]![0];
    expect(runnerUp).toBe('party.con');
    expect(me.politicalCapital).toBe(3);
    expect(s.player.diarySlots).toBe(5);
    expect(me.skills.negotiation).toBe(14);
    for (const k of ['oratory', 'administration', 'intrigue', 'media', 'policy'] as const) {
      expect(me.skills[k]).toBeGreaterThanOrEqual(9);
      expect(me.skills[k]).toBeLessThanOrEqual(12);
    }
  });

  it('includes the named cast in their roles, the Speaker and the Father of the House', () => {
    const office = (k: string) => s.government.appointments[k as never];
    expect(office('office.prime_minister')).toBe('pol_helen_ashdown');
    expect(office('office.chancellor')).toBe('pol_martin_coyle');
    expect(office('office.housing_secretary')).toBe('pol_priya_nair');
    expect(office('office.chief_whip')).toBe('pol_gareth_pryce');
    expect(office('office.deputy_chief_whip')).toBe('pol_lucy_hargreaves');
    expect(office('office.minister_of_state_housing')).toBeNull();
    expect(office('office.pps_housing')).toBeNull();
    expect(office('office.pps_chancellor')).toBeNull();
    expect(s.parliament.oppositionAppointments['office.leader_of_opposition' as never]).toBe(
      'pol_richard_vane',
    );
    expect(s.parties.byId['party.lr' as never]?.leaderId).toBe('pol_fiona_macrae');
    expect(s.parliament.fatherOfHouseId).toBe('pol_ken_bramley');
    const speaker = s.politicians.byId[s.parliament.speakerId!]!;
    expect(speaker.partyId).toBe('party.npp');
    expect(speaker.factionId).toBeNull();
    // 18 generated cabinet posts plus the Chancellor and Housing Secretary, all NPP.
    const cabinet = Object.entries(s.government.appointments).filter(
      ([k]) => ctx.content.offices[k as never]?.kind === 'cabinet',
    );
    expect(cabinet.length).toBe(20);
    for (const [, holder] of cabinet)
      expect(s.politicians.byId[holder!]?.partyId).toBe('party.npp');
    expect(s.politicians.byId['pol_sarah_kemp' as never]?.newIntake).toBe(true);
  });

  it('assigns about 35% of NPP MPs to no faction', () => {
    const npp = s.politicians.ids
      .map((id) => s.politicians.byId[id]!)
      .filter((p) => p.partyId === 'party.npp');
    const none = npp.filter((p) => p.factionId === null).length / npp.length;
    expect(none).toBeGreaterThan(0.3);
    expect(none).toBeLessThan(0.4);
    for (const f of s.factions.ids)
      expect(s.factions.byId[f]!.memberIds.length).toBeGreaterThan(40);
  });

  it('introduces the bill with its divisions and whips', () => {
    const bill = s.parliament.bills.byId['bill.housing_delivery' as never]!;
    expect(bill.stage).toBe('first_reading');
    expect(bill.sponsorId).toBe('pol_priya_nair');
    const div = s.parliament.divisions.byId[SECOND_READING]!;
    expect(div).toMatchObject({ turn: 4, scheduledFor: '2029-09-26', status: 'scheduled' });
    expect(bill.whipping['party.npp' as never]).toEqual({ line: 'three_line', direction: 'aye' });
  });

  it('has a sparse relationship web, and the player knows few colleagues', () => {
    const edges = Object.keys(s.relationships.edges).length;
    expect(edges).toBeGreaterThan(2000);
    expect(edges).toBeLessThan(8000);
    const mine = Object.values(s.relationships.edges).filter(
      (e) => e.from === s.player.politicianId,
    ).length;
    expect(mine).toBeGreaterThan(2);
    expect(mine).toBeLessThan(15);
    expect(
      selectors.relationship(s, pid('pol_daniel_osei'), s.player.politicianId).affinity,
    ).toBeGreaterThan(20);
  });

  it('satisfies all invariants and starts with a briefing and a welcome note', () => {
    expect(checkInvariants(s, ctx)).toEqual([]);
    expect(s.briefing.headlines.length).toBeGreaterThan(0);
    expect(s.inbox[0]?.title).toContain('Welcome');
    expect(s.recentHistory.map((h) => h.type)).toEqual(['election', 'campaign']);
    expect(s.meta).toMatchObject({
      turn: 1,
      date: '2029-09-03',
      schemaVersion: STATE_SCHEMA_VERSION,
    });
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(newGame(2029)).toEqual(s);
    expect(newGame(2030).politicians.byId['pol_0001' as never]).not.toEqual(
      s.politicians.byId['pol_0001' as never],
    );
  });
});
