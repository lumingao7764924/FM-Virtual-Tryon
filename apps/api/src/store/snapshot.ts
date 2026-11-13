import type { AdminUser, Finder, FinderVersionMeta } from '@tryon/shared';
import type { FinderRepo, UserRepo } from './types.js';

/** Insert-only table whose rows are cheap enough to keep in memory (config + users, not events). */
export interface AppendTable<T> {
  /** Rows in write order (later rows win). */
  all(): Promise<T[]>;
  append(items: T[]): Promise<void>;
}

export class SnapshotFinderRepo implements FinderRepo {
  constructor(private readonly table: AppendTable<Finder>) {}

  private async latestMap(): Promise<Map<string, Finder>> {
    const latest = new Map<string, Finder>();
    for (const row of await this.table.all()) {
      const current = latest.get(row.id);
      if (!current || row.version > current.version) latest.set(row.id, row);
    }
    return latest;
  }

  async listLatest(): Promise<Finder[]> {
    return [...(await this.latestMap()).values()];
  }

  async getLatest(id: string): Promise<Finder | null> {
    return (await this.latestMap()).get(id) ?? null;
  }

  async getVersion(id: string, version: number): Promise<Finder | null> {
    return (await this.table.all()).find((row) => row.id === id && row.version === version) ?? null;
  }

  async history(id: string): Promise<FinderVersionMeta[]> {
    return (await this.table.all())
      .filter((row) => row.id === id)
      .sort((left, right) => right.version - left.version)
      .map(({ version, status, updatedAt, updatedBy }) => ({ version, status, updatedAt, updatedBy }));
  }

  async append(finder: Finder): Promise<void> {
    await this.table.append([finder]);
  }
}

export type UserRow = AdminUser & { deleted?: boolean };

export class SnapshotUserRepo implements UserRepo {
  constructor(private readonly table: AppendTable<UserRow>) {}

  async listLatest(): Promise<UserRow[]> {
    const latest = new Map<string, UserRow>();
    for (const row of await this.table.all()) latest.set(row.email, row);
    return [...latest.values()];
  }

  async append(user: UserRow): Promise<void> {
    await this.table.append([user]);
  }
}
