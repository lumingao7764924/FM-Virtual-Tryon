import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Finder } from '@tryon/shared';
import { SnapshotFinderRepo, SnapshotUserRepo, type AppendTable, type UserRow } from './snapshot.js';
import type { EventRepo, EventRow, Repos } from './types.js';

/** Append-only JSONL file; mirrors BigQuery insert-only tables for local dry runs. */
class JsonlTable<T> implements AppendTable<T> {
  private rows: T[] | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async all(): Promise<T[]> {
    if (!this.rows) {
      try {
        const textContent = await readFile(this.file, 'utf8');
        this.rows = textContent
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line) as T);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        this.rows = [];
      }
    }
    return this.rows;
  }

  async append(items: T[]): Promise<void> {
    if (!items.length) return;
    const rows = await this.all();
    rows.push(...items);
    const payload = items.map((item) => JSON.stringify(item)).join('\n') + '\n';
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      await appendFile(this.file, payload, 'utf8');
    });
    await this.writing;
  }
}

class LocalEventRepo implements EventRepo {
  constructor(private readonly table: JsonlTable<EventRow>) {}

  async insert(rows: EventRow[]): Promise<void> {
    await this.table.append(rows);
  }

  async query(finderId: string, from: string, to: string): Promise<EventRow[]> {
    return (await this.table.all()).filter(
      (row) => row.finder_id === finderId && row.event_date >= from && row.event_date <= to
    );
  }
}

export function createLocalRepos(dataDir: string): Repos {
  return {
    finders: new SnapshotFinderRepo(new JsonlTable<Finder>(path.join(dataDir, 'finder_versions.jsonl'))),
    users: new SnapshotUserRepo(new JsonlTable<UserRow>(path.join(dataDir, 'admin_users.jsonl'))),
    events: new LocalEventRepo(new JsonlTable<EventRow>(path.join(dataDir, 'events.jsonl'))),
  };
}
