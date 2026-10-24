import { and, asc, desc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { CampaignSummary } from '@whip/contracts';
import {
  type CampaignIndex,
  type CampaignIndexPage,
  type CampaignIndexRecord,
  type CampaignProjection,
  type CreateKeyMatch,
  InvalidCursorError,
} from '../../application/ports';
import type { Db } from './client';
import { campaigns, type CampaignRow } from './schema';

/**
 * `CampaignIndex` over D1 (Drizzle). A derived projection of the Campaign DOs plus the ownership
 * check used before any DO call (docs/architecture/04-persistence.md §3 step 8, 05 §1 Security).
 */
export class D1CampaignIndex implements CampaignIndex {
  constructor(private readonly db: Db) {}

  async listForOwner(
    ownerId: string,
    page: { cursor?: string; limit: number },
  ): Promise<CampaignIndexPage> {
    const after = page.cursor === undefined ? null : decodeCursor(page.cursor);
    const rows = await this.db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.ownerId, ownerId),
          isNull(campaigns.deletedAt),
          // `initialising` rows are not playable yet (and stale ones are cleaned up later).
          eq(campaigns.status, 'active'),
          after
            ? or(
                lt(campaigns.updatedAt, after.updatedAt),
                and(eq(campaigns.updatedAt, after.updatedAt), lt(campaigns.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(campaigns.updatedAt), desc(campaigns.id))
      .limit(page.limit + 1);
    const items = rows.slice(0, page.limit).map(toRecord);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  async get(id: string): Promise<CampaignIndexRecord | null> {
    const row = await this.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)))
      .get();
    return row ? toRecord(row) : null;
  }

  async insertInitialising(r: {
    id: string;
    ownerId: string;
    name: string;
    scenarioKey: string;
    simulationVersion: number;
    createdAt: string;
    createKey?: string;
    createRequestHash?: string;
  }): Promise<'inserted' | 'duplicate_key'> {
    const insert = this.db.insert(campaigns).values({
      id: r.id,
      ownerId: r.ownerId,
      name: r.name,
      scenarioKey: r.scenarioKey,
      status: 'initialising',
      revision: 0,
      simulationVersion: r.simulationVersion,
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
      createKey: r.createKey ?? null,
      createRequestHash: r.createRequestHash ?? null,
    });
    if (r.createKey === undefined) {
      await insert;
      return 'inserted';
    }
    // (owner_id, create_key) is unique: a concurrent/retried create with the same key inserts nothing.
    const rows = await insert
      .onConflictDoNothing({ target: [campaigns.ownerId, campaigns.createKey] })
      .returning({ id: campaigns.id });
    return rows.length > 0 ? 'inserted' : 'duplicate_key';
  }

  async findByCreateKey(ownerId: string, createKey: string): Promise<CreateKeyMatch | null> {
    const row = await this.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.ownerId, ownerId), eq(campaigns.createKey, createKey)))
      .get();
    if (!row) return null;
    return {
      record: toRecord(row),
      requestHash: row.createRequestHash,
      deleted: row.deletedAt !== null,
    };
  }

  async activate(s: CampaignSummary & { playerPoliticianId: string | null }): Promise<void> {
    await this.db
      .update(campaigns)
      .set({
        status: 'active',
        revision: s.revision,
        simDate: s.simDate,
        turn: s.turn,
        playerName: s.playerName,
        playerPoliticianId: s.playerPoliticianId,
        simulationVersion: s.simulationVersion,
        updatedAt: s.updatedAt,
      })
      .where(eq(campaigns.id, s.id));
  }

  async upsertProjection(id: string, p: CampaignProjection): Promise<void> {
    await this.db
      .update(campaigns)
      .set({ revision: p.revision, turn: p.turn, simDate: p.simDate, updatedAt: p.updatedAt })
      .where(and(eq(campaigns.id, id), lt(campaigns.revision, p.revision)));
  }

  async softDelete(id: string, at: string): Promise<void> {
    await this.db
      .update(campaigns)
      .set({ deletedAt: at })
      .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)));
  }

  async confirmWipe(id: string, at: string): Promise<void> {
    await this.db
      .update(campaigns)
      .set({ wipeConfirmedAt: at })
      .where(and(eq(campaigns.id, id), isNotNull(campaigns.deletedAt)));
  }

  async listStaleInitialising(createdBefore: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, 'initialising'),
          isNull(campaigns.deletedAt),
          lt(campaigns.createdAt, createdBefore),
        ),
      )
      .orderBy(asc(campaigns.createdAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async listUnconfirmedWipes(limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(isNotNull(campaigns.deletedAt), isNull(campaigns.wipeConfirmedAt)))
      .orderBy(asc(campaigns.deletedAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async hardDelete(id: string): Promise<void> {
    // Guarded: only ever removes rows that never became playable.
    await this.db
      .delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.status, 'initialising')));
  }
}

function toRecord(row: CampaignRow): CampaignIndexRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    scenarioKey: row.scenarioKey,
    status: row.status,
    revision: row.revision,
    simDate: row.simDate,
    turn: row.turn,
    playerName: row.playerName,
    playerPoliticianId: row.playerPoliticianId,
    simulationVersion: row.simulationVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function encodeCursor(updatedAt: string, id: string): string {
  return btoa(JSON.stringify([updatedAt, id]))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  try {
    const json = atob(cursor.replaceAll('-', '+').replaceAll('_', '/'));
    const value: unknown = JSON.parse(json);
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string'
    ) {
      return { updatedAt: value[0], id: value[1] };
    }
  } catch {
    // fall through
  }
  throw new InvalidCursorError();
}
