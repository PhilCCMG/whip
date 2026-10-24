import {
  ContentRegistrySchema,
  HEADLINE_TEMPLATE_KEYS,
  HISTORY_TEMPLATE_KEYS,
  NATIONS,
  ScenarioDefinitionSchema,
  type RoleRef,
} from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { loadContentRegistry, scenarios } from './index';

const content = loadContentRegistry();
const scenario = scenarios.firstWeeks;

describe('content registry', () => {
  it('passes Zod validation', () => {
    const result = ContentRegistrySchema.safeParse(content);
    if (!result.success) throw new Error(result.error.message);
    expect(result.success).toBe(true);
  });

  it('keys match their record keys', () => {
    for (const [k, v] of Object.entries(content.traits)) expect(v.key).toBe(k);
    for (const [k, v] of Object.entries(content.offices)) expect(v.key).toBe(k);
    for (const [k, v] of Object.entries(content.events)) expect(v.key).toBe(k);
  });

  it('defines the six slice events with valid default options', () => {
    expect(Object.keys(content.events).sort()).toEqual([
      'event.constituency_green_belt_protest',
      'event.government_concession',
      'event.lobby_journalist_call',
      'event.minister_considers_position',
      'event.pps_offer',
      'event.whips_office_summons',
    ]);
    for (const ev of Object.values(content.events)) {
      expect(ev.options.map((o) => o.key)).toContain(ev.defaultOptionKey);
      for (const o of ev.options) {
        for (const t of Object.keys(o.ai.traitModifiers))
          expect(content.traits).toHaveProperty([t]);
        for (const e of o.effects) {
          const refs: RoleRef[] = [];
          if ('from' in e) refs.push(e.from, e.to);
          if ('who' in e) refs.push(e.who);
          for (const r of refs) {
            if (r.startsWith('faction:')) {
              expect(scenario.factions.map((f) => f.id)).toContain(r.slice('faction:'.length));
            }
          }
        }
      }
    }
  });

  it('provides every template key', () => {
    for (const k of HISTORY_TEMPLATE_KEYS) expect(content.templates.history[k]).toBeDefined();
    for (const k of HEADLINE_TEMPLATE_KEYS)
      expect(content.templates.headlines[k].length).toBeGreaterThan(0);
  });

  it('has trait exclusions that reference real traits', () => {
    for (const t of Object.values(content.traits)) {
      for (const x of t.excludes) expect(content.traits).toHaveProperty([x]);
    }
  });

  it('has enough distinct surnames and first names for 650 MPs', () => {
    expect(new Set(content.names.surnames).size).toBe(content.names.surnames.length);
    expect(content.names.surnames.length * content.names.female.length).toBeGreaterThan(5000);
  });
});

describe('scenario firstWeeks', () => {
  it('passes Zod validation', () => {
    const result = ScenarioDefinitionSchema.safeParse(scenario);
    if (!result.success) throw new Error(result.error.message);
    expect(result.success).toBe(true);
  });

  it('seat totals and nation splits match the spec', () => {
    const total = scenario.parties.reduce((s, p) => s + p.seats, 0);
    expect(total).toBe(650);
    for (const p of scenario.parties) {
      const sum = NATIONS.reduce((s, n) => s + p.seatsByNation[n], 0);
      expect(sum, p.id).toBe(p.seats);
    }
    const byNation = Object.fromEntries(
      NATIONS.map((n) => [n, scenario.parties.reduce((s, p) => s + p.seatsByNation[n], 0)]),
    );
    expect(byNation).toEqual({ england: 543, scotland: 57, wales: 32, northern_ireland: 18 });
    const seats = Object.fromEntries(scenario.parties.map((p) => [p.id, p.seats]));
    expect(seats).toEqual({
      'party.npp': 362,
      'party.con': 168,
      'party.lr': 58,
      'party.scp': 32,
      'party.sov': 12,
      'party.grn': 6,
      'party.ind': 12,
    });
  });

  it('has the 13-person cast with valid references', () => {
    expect(scenario.cast).toHaveLength(13);
    const keys = new Set(scenario.cast.map((c) => c.key));
    for (const c of scenario.cast) {
      for (const t of c.traits) expect(content.traits, `${c.key} ${t}`).toHaveProperty([t]);
      for (const o of c.offices) expect(content.offices, `${c.key} ${o}`).toHaveProperty([o]);
      expect(content.ambitions).toHaveProperty([c.ambition.target]);
      expect(scenario.parties.map((p) => p.id)).toContain(c.partyId);
      // Cast seat nation must have room for the party there.
      const p = scenario.parties.find((pp) => pp.id === c.partyId);
      expect(p?.seatsByNation[c.seat.nation] ?? 0, c.key).toBeGreaterThan(0);
    }
    for (const f of scenario.factions) expect(keys.has(f.leaderCastKey), f.id).toBe(true);
    for (const b of scenario.bills) expect(keys.has(b.sponsorCastKey)).toBe(true);
    const seatIds = [...scenario.cast.map((c) => c.seat.id), scenario.player.seat.id];
    expect(new Set(seatIds).size).toBe(seatIds.length);
  });

  it('has 18 generated cabinet posts and offices that exist', () => {
    expect(new Set(scenario.generatedCabinetOffices).size).toBe(18);
    for (const o of [
      ...scenario.generatedCabinetOffices,
      ...scenario.governmentOffices,
      ...scenario.oppositionOffices,
      ...scenario.vacantOffices,
    ]) {
      expect(content.offices, o).toHaveProperty([o]);
    }
  });

  it('schedules the second reading on turn 4 (Wed 26 Sept 2029) and third reading on turn 10', () => {
    const bill = scenario.bills[0];
    expect(bill?.divisions.map((d) => [d.stage, d.turn, d.date])).toEqual([
      ['second_reading', 4, '2029-09-26'],
      ['third_reading', 10, '2029-11-07'],
    ]);
    expect(bill?.issues).toEqual({
      'issue.housing_targets': 2,
      'issue.local_control': -2,
      'issue.green_belt': -1,
      'issue.social_housing': 0,
    });
    for (const p of scenario.parties) expect(bill?.whipping[p.id], p.id).toBeDefined();
  });

  it('puts the player in Ashby and Wold with a 1,840 majority over CON', () => {
    expect(scenario.player.seat).toMatchObject({
      id: 'con.ashby_and_wold',
      majority: 1840,
      runnerUpPartyId: 'party.con',
      nation: 'england',
    });
  });
});

describe('scenario cross-references', () => {
  it('cast relationships reference cast members (or the player)', () => {
    const keys = new Set([...scenario.cast.map((c) => c.key), 'player']);
    for (const r of scenario.castRelationships) {
      expect(keys.has(r.from), r.from).toBe(true);
      expect(keys.has(r.to), r.to).toBe(true);
      expect(r.from).not.toBe(r.to);
    }
  });

  it('party leaders and chief whips are cast members of that party', () => {
    for (const p of scenario.parties) {
      for (const key of [p.leaderCastKey, p.chiefWhipCastKey]) {
        if (key === null) continue;
        expect(scenario.cast.find((c) => c.key === key)?.partyId, `${p.id} ${key}`).toBe(p.id);
      }
    }
  });
});
