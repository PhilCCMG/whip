import type { CampaignSummary } from '@whip/contracts';
import type {
  CampaignIndex,
  CampaignIndexPage,
  CampaignIndexRecord,
  CampaignProjection,
  CreateKeyMatch,
} from '../application/ports';

interface Row extends CampaignIndexRecord {
  deletedAt: string | null;
  wipeConfirmedAt: string | null;
  createKey: string | null;
  createRequestHash: string | null;
}

/** In-memory `CampaignIndex` for unit tests (same semantics as D1CampaignIndex, minus paging). */
export class InMemoryCampaignIndex implements CampaignIndex {
  readonly rows = new Map<string, Row>();
  /** Test hook: the next `activate` call throws. */
  failNextActivate = false;

  listForOwner(ownerId: string, page: { limit: number }): Promise<CampaignIndexPage> {
    const items = [...this.rows.values()]
      .filter((r) => r.ownerId === ownerId && r.deletedAt === null && r.status === 'active')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, page.limit)
      .map(strip);
    return Promise.resolve({ items, nextCursor: null });
  }

  get(id: string): Promise<CampaignIndexRecord | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.deletedAt === null ? strip(row) : null);
  }

  insertInitialising(r: {
    id: string;
    ownerId: string;
    name: string;
    scenarioKey: string;
    simulationVersion: number;
    createdAt: string;
    createKey?: string;
    createRequestHash?: string;
  }): Promise<'inserted' | 'duplicate_key'> {
    if (
      r.createKey !== undefined &&
      [...this.rows.values()].some((x) => x.ownerId === r.ownerId && x.createKey === r.createKey)
    ) {
      return Promise.resolve('duplicate_key');
    }
    this.rows.set(r.id, {
      id: r.id,
      ownerId: r.ownerId,
      name: r.name,
      scenarioKey: r.scenarioKey,
      status: 'initialising',
      revision: 0,
      simDate: null,
      turn: 0,
      playerName: null,
      playerPoliticianId: null,
      simulationVersion: r.simulationVersion,
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
      deletedAt: null,
      wipeConfirmedAt: null,
      createKey: r.createKey ?? null,
      createRequestHash: r.createRequestHash ?? null,
    });
    return Promise.resolve('inserted');
  }

  findByCreateKey(ownerId: string, createKey: string): Promise<CreateKeyMatch | null> {
    const row = [...this.rows.values()].find(
      (x) => x.ownerId === ownerId && x.createKey === createKey,
    );
    return Promise.resolve(
      row
        ? {
            record: strip(row),
            requestHash: row.createRequestHash,
            deleted: row.deletedAt !== null,
          }
        : null,
    );
  }

  activate(s: CampaignSummary & { playerPoliticianId: string | null }): Promise<void> {
    if (this.failNextActivate) {
      this.failNextActivate = false;
      return Promise.reject(new Error('simulated D1 failure'));
    }
    const row = this.rows.get(s.id);
    if (row) {
      Object.assign(row, {
        status: 'active',
        revision: s.revision,
        simDate: s.simDate,
        turn: s.turn,
        playerName: s.playerName,
        playerPoliticianId: s.playerPoliticianId,
        simulationVersion: s.simulationVersion,
        updatedAt: s.updatedAt,
      });
    }
    return Promise.resolve();
  }

  upsertProjection(id: string, p: CampaignProjection): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.revision < p.revision) Object.assign(row, p);
    return Promise.resolve();
  }

  softDelete(id: string, at: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.deletedAt === null) row.deletedAt = at;
    return Promise.resolve();
  }

  confirmWipe(id: string, at: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.deletedAt !== null) row.wipeConfirmedAt = at;
    return Promise.resolve();
  }

  listStaleInitialising(createdBefore: string, limit: number): Promise<string[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.status === 'initialising' && r.deletedAt === null)
        .filter((r) => r.createdAt < createdBefore)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit)
        .map((r) => r.id),
    );
  }

  listUnconfirmedWipes(limit: number): Promise<string[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.deletedAt !== null && r.wipeConfirmedAt === null)
        .slice(0, limit)
        .map((r) => r.id),
    );
  }

  hardDelete(id: string): Promise<void> {
    if (this.rows.get(id)?.status === 'initialising') this.rows.delete(id);
    return Promise.resolve();
  }
}

function strip(row: Row): CampaignIndexRecord {
  const { deletedAt: _d, wipeConfirmedAt: _w, createKey: _k, createRequestHash: _h, ...rest } = row;
  return { ...rest };
}
