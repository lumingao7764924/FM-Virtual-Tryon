import type { Finder, FinderStatus } from './finder.js';

export type AdminRole = 'admin' | 'editor' | 'viewer';
export type AdminUserStatus = 'active' | 'disabled';

export const ADMIN_ROLES: readonly AdminRole[] = ['admin', 'editor', 'viewer'];

/** Allowlisted Google account. */
export interface AdminUser {
  email: string;
  name: string;
  role: AdminRole;
  status: AdminUserStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SessionInfo {
  email: string;
  name: string;
  picture: string;
  role: AdminRole;
  /** From ADMIN_EMAILS env; cannot be removed in the UI. */
  bootstrap: boolean;
}

export interface AuthConfig {
  googleClientId: string;
  /** Dev-only email login without Google (never on in production). */
  devLogin: boolean;
}

export interface FinderSummary {
  id: string;
  code: string;
  title: string;
  brand: string;
  status: FinderStatus;
  variantCount: number;
  buttonCount: number;
  version: number;
  updatedAt: string;
  updatedBy: string;
  createdAt: string;
  createdBy: string;
}

export interface FinderVersionMeta {
  version: number;
  status: FinderStatus;
  updatedAt: string;
  updatedBy: string;
}

/** Body for create (title/brand/code only) and full save (everything editable + expected version). */
export type FinderCreateInput = Pick<Finder, 'title' | 'brand'> & { code?: string };
export type FinderSaveInput = Pick<
  Finder,
  'code' | 'title' | 'brand' | 'notes' | 'status' | 'variants' | 'buttons' | 'settings' | 'version'
>;

export interface FieldError {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  fields?: FieldError[];
}

export function canEdit(role: AdminRole): boolean {
  return role === 'admin' || role === 'editor';
}

export function toFinderSummary(finder: Finder): FinderSummary {
  return {
    id: finder.id,
    code: finder.code,
    title: finder.title,
    brand: finder.brand,
    status: finder.status,
    variantCount: finder.variants.length,
    buttonCount: finder.buttons.length,
    version: finder.version,
    updatedAt: finder.updatedAt,
    updatedBy: finder.updatedBy,
    createdAt: finder.createdAt,
    createdBy: finder.createdBy,
  };
}
