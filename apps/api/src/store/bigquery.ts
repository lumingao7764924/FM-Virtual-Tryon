import { BigQuery } from '@google-cloud/bigquery';
import type { Finder } from '@tryon/shared';
import { SnapshotFinderRepo, SnapshotUserRepo, type AppendTable, type UserRow } from './snapshot.js';
import type { EventRepo, EventRow, Repos } from './types.js';

/** Config tables are tiny; keep them in memory and re-read at most this often (other instances' writes). */
const SNAPSHOT_TTL_MS = 30_000;

type Row = Record<string, unknown>;

/** BigQuery TIMESTAMP / DATE come back as `{ value }` wrappers. */
function scalar(value: unknown): unknown {
  return value && typeof value === 'object' && 'value' in value ? (value as { value: unknown }).value : value;
}

class BigQuerySnapshotTable<T> implements AppendTable<T> {
  private rows: T[] | null = null;
  private loadedAt = 0;
  private loading: Promise<T[]> | null = null;

  constructor(
    private readonly bq: BigQuery,
    private readonly dataset: string,
    private readonly table: string,
    private readonly selectSql: string,
    private readonly fromRow: (row: Row) => T,
    private readonly toRow: (item: T) => Row
  ) {}

  async all(): Promise<T[]> {
    if (this.rows && Date.now() - this.loadedAt < SNAPSHOT_TTL_MS) return this.rows;
    this.loading ??= this.bq
      .query({ query: this.selectSql })
      .then(([rows]) => {
        this.rows = (rows as Row[]).map(this.fromRow);
        this.loadedAt = Date.now();
        return this.rows;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  async append(items: T[]): Promise<void> {
    if (!items.length) return;
    await this.bq.dataset(this.dataset).table(this.table).insert(items.map(this.toRow));
    this.rows?.push(...items);
  }
}

class BigQueryEventRepo implements EventRepo {
  constructor(
    private readonly bq: BigQuery,
    private readonly dataset: string
  ) {}

  async insert(rows: EventRow[]): Promise<void> {
    if (!rows.length) return;
    await this.bq
      .dataset(this.dataset)
      .table('events')
      .insert(
        rows.map((row) => ({ insertId: row.event_id, json: row })),
        { raw: true }
      );
  }

  async query(finderId: string, from: string, to: string): Promise<EventRow[]> {
    const [rows] = await this.bq.query({
      query: `
        SELECT * EXCEPT (event_date, client_ts, received_at),
          CAST(event_date AS STRING) AS event_date,
          FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', client_ts) AS client_ts,
          FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', received_at) AS received_at
        FROM \`${this.dataset}.events\`
        WHERE CAST(event_date AS STRING) BETWEEN @from AND @to AND finder_id = @finderId`,
      params: { finderId, from, to },
    });
    return rows as EventRow[];
  }
}

export function createBigQueryRepos(projectId: string, dataset: string): Repos {
  const bq = new BigQuery({ projectId });
  const ref = (table: string) => `\`${projectId}.${dataset}.${table}\``;

  const finders = new BigQuerySnapshotTable<Finder>(
    bq,
    dataset,
    'finder_versions',
    `SELECT payload FROM ${ref('finder_versions')} ORDER BY finder_id, version`,
    (row) => JSON.parse(String(row.payload)) as Finder,
    (finder) => ({
      finder_id: finder.id,
      version: finder.version,
      code: finder.code,
      status: finder.status,
      title: finder.title,
      brand: finder.brand,
      payload: JSON.stringify(finder),
      updated_at: finder.updatedAt,
      updated_by: finder.updatedBy,
      created_at: finder.createdAt,
      created_by: finder.createdBy,
    })
  );

  const users = new BigQuerySnapshotTable<UserRow>(
    bq,
    dataset,
    'admin_users',
    `SELECT * FROM ${ref('admin_users')} ORDER BY updated_at`,
    (row) => ({
      email: String(row.email),
      name: String(row.name ?? ''),
      role: row.role as UserRow['role'],
      status: row.status as UserRow['status'],
      deleted: Boolean(row.deleted),
      createdAt: String(scalar(row.created_at) ?? ''),
      createdBy: String(row.created_by ?? ''),
      updatedAt: String(scalar(row.updated_at) ?? ''),
      updatedBy: String(row.updated_by ?? ''),
    }),
    (user) => ({
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      deleted: Boolean(user.deleted),
      created_at: user.createdAt || null,
      created_by: user.createdBy,
      updated_at: user.updatedAt,
      updated_by: user.updatedBy,
    })
  );

  return {
    finders: new SnapshotFinderRepo(finders),
    users: new SnapshotUserRepo(users),
    events: new BigQueryEventRepo(bq, dataset),
  };
}
