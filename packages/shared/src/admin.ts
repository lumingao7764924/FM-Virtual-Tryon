import type { Finder, FinderStatus } from './finder.js';
import { FINDER_BRANDS, type FinderBrand } from './validate.js';

export type AdminRole = 'admin' | 'editor' | 'viewer';
export type AdminUserStatus = 'active' | 'disabled';
/** all：品牌范围内的全部项目。own：只能看到并管理自己创建的。 */
export type ProjectScope = 'all' | 'own';

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
  /** 空数组表示全部品牌。 */
  brands: FinderBrand[];
  scope: ProjectScope;
}

export interface SessionInfo {
  email: string;
  name: string;
  picture: string;
  role: AdminRole;
  /** From ADMIN_EMAILS env; cannot be removed in the UI. */
  bootstrap: boolean;
  /** 空数组表示全部品牌。固定管理员始终为空。 */
  brands: FinderBrand[];
  scope: ProjectScope;
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

export function normalizeProjectScope(value: unknown): ProjectScope {
  return value === 'own' ? 'own' : 'all';
}

/** Drop unknown names. Empty means every brand. */
export function normalizeBrandScope(value: unknown): FinderBrand[] {
  if (!Array.isArray(value)) return [];
  const brands = value
    .map((item) => FINDER_BRANDS.find((brand) => brand.toLowerCase() === String(item).trim().toLowerCase()))
    .filter((brand): brand is FinderBrand => Boolean(brand));
  return [...new Set(brands)];
}

/** Brand list and ownership. Empty brands means every brand. A brand that was later removed still shows collections this person created. */
export function canAccessFinder(
  access: { email: string; brands: readonly string[]; scope: ProjectScope },
  finder: { brand: string; createdBy: string }
): boolean {
  const inBrand = access.brands.length === 0 || access.brands.includes(finder.brand);
  if (!inBrand) return finder.createdBy === access.email;
  if (access.scope === 'own' && finder.createdBy !== access.email) return false;
  return true;
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
