import type { AdminUser, Finder, FinderVersionMeta } from '@tryon/shared';

/**
 * Storage contract. Rows are append-only (BigQuery friendly):
 * every finder save / user change writes a new row; readers take the latest per key.
 */
export interface FinderRepo {
  /** Latest version of every finder. */
  listLatest(): Promise<Finder[]>;
  getLatest(id: string): Promise<Finder | null>;
  getVersion(id: string, version: number): Promise<Finder | null>;
  history(id: string): Promise<FinderVersionMeta[]>;
  append(finder: Finder): Promise<void>;
}

export interface UserRepo {
  /** Latest row per email (including disabled / deleted). */
  listLatest(): Promise<(AdminUser & { deleted?: boolean })[]>;
  append(user: AdminUser & { deleted?: boolean }): Promise<void>;
}

/** One scan-page event as stored (snake_case = BigQuery columns). */
export interface EventRow {
  event_id: string;
  event_name: string;
  event_date: string;
  finder_id: string;
  finder_code: string;
  finder_version: number;
  visitor_id: string;
  session_id: string;
  channel: string | null;
  variant_id: string | null;
  sku: string | null;
  role: string | null;
  button_id: string | null;
  url: string | null;
  undertone: string | null;
  feedback: string | null;
  /** JSON array of { variantId, sku, role }. */
  recommended: string | null;
  skin_l: number | null;
  skin_a: number | null;
  skin_b: number | null;
  duration_ms: number | null;
  device: string;
  os: string;
  user_agent: string;
  client_ts: string | null;
  received_at: string;
}

export interface EventRepo {
  insert(rows: EventRow[]): Promise<void>;
  /** Rows for one finder within [from, to] dates (YYYY-MM-DD, inclusive). */
  query(finderId: string, from: string, to: string): Promise<EventRow[]>;
}

export interface Repos {
  finders: FinderRepo;
  users: UserRepo;
  events: EventRepo;
}
