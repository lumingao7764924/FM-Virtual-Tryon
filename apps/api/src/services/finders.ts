import { randomBytes } from 'node:crypto';
import {
  LIST_MAX_PAGE_SIZE,
  createDefaultFinderSettings,
  normalizeBrand,
  normalizeFinderSave,
  toFinderSummary,
  toPublicFinder,
  type Finder,
  type FinderCreateInput,
  type FinderStatus,
  type FinderSummary,
  type FinderVersionMeta,
  type PaginatedListResponse,
  type PublicFinder,
} from '@tryon/shared';
import { badRequest, conflict, forbidden, gone, notFound } from '../errors.js';
import { signPreview, verifyPreview, type PreviewPass } from '../preview.js';
import type { FinderRepo } from '../store/types.js';

const PUBLIC_CACHE_TTL_MS = 60_000;
const CODE_LENGTH = 8;
/** No 0/o/1/l/i so codes read unambiguously if ever typed by hand. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export interface FinderListQuery {
  page: number;
  pageSize: number;
  q: string;
  status: string;
  brand: string;
}

function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 8).toLowerCase()}`;
}

export class FinderService {
  private publicCache = new Map<string, { at: number; finder: Finder | null }>();

  constructor(private readonly repo: FinderRepo) {}

  async list(query: FinderListQuery): Promise<PaginatedListResponse<FinderSummary> & { brands: string[] }> {
    const all = await this.repo.listLatest();
    const q = query.q.trim().toLowerCase();
    const filtered = all
      .filter((finder) => !finder.deleted)
      .filter((finder) => !query.status || finder.status === query.status)
      .filter((finder) => !query.brand || finder.brand === query.brand)
      .filter(
        (finder) =>
          !q ||
          [finder.title, finder.code, finder.brand, ...finder.variants.map((variant) => variant.sku)]
            .join(' ')
            .toLowerCase()
            .includes(q)
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const pageSize = Math.min(LIST_MAX_PAGE_SIZE, Math.max(1, query.pageSize));
    const page = Math.max(1, query.page);
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize).map(toFinderSummary),
      total: filtered.length,
      page,
      pageSize,
      brands: [...new Set(all.filter((finder) => !finder.deleted).map((finder) => finder.brand).filter(Boolean))].sort(),
    };
  }

  async get(id: string): Promise<Finder> {
    const finder = await this.repo.getLatest(id);
    if (!finder || finder.deleted) throw notFound('试色项目不存在');
    return finder;
  }

  /** 只允许创建人删除。追加一行标记，已印出的正式码随即失效。 */
  async remove(id: string, actor: string): Promise<void> {
    const current = await this.get(id);
    if (current.createdBy !== actor) throw forbidden('只能删除自己创建的项目');
    const next: Finder = {
      ...current,
      deleted: true,
      status: 'disabled',
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    await this.repo.append(next);
    this.invalidate(current.code);
  }

  async history(id: string): Promise<FinderVersionMeta[]> {
    await this.get(id);
    return this.repo.history(id);
  }

  async getVersion(id: string, version: number): Promise<Finder> {
    const finder = await this.repo.getVersion(id, version);
    if (!finder) throw notFound('版本不存在');
    return finder;
  }

  /** True once any version was active — its QR may be printed, so the code is frozen. */
  async codeLocked(id: string): Promise<boolean> {
    return (await this.repo.history(id)).some((meta) => meta.status === 'active');
  }

  /** Random public code; never changes after creation so printed QR codes stay valid. */
  private async uniqueCode(): Promise<string> {
    const codes = new Set((await this.repo.listLatest()).map((finder) => finder.code));
    for (;;) {
      const bytes = randomBytes(CODE_LENGTH);
      const code = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
      if (!codes.has(code)) return code;
    }
  }

  async create(input: FinderCreateInput, actor: string): Promise<Finder> {
    const title = String(input.title ?? '').trim().slice(0, 120);
    if (!title) throw badRequest('请填写产品名称', [{ path: 'title', message: '请填写产品名称' }]);
    const brand = normalizeBrand(input.brand);
    if (!brand) throw badRequest('请选择品牌', [{ path: 'brand', message: '请选择品牌' }]);
    const code = await this.uniqueCode();
    const now = new Date().toISOString();
    const finder: Finder = {
      id: shortId('fd'),
      code,
      title,
      brand,
      notes: '',
      status: 'disabled',
      variants: [],
      buttons: [{ id: 'shop', label: 'SHOP NOW', url: '', style: 'primary', enabled: true }],
      settings: createDefaultFinderSettings(),
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    await this.repo.append(finder);
    return finder;
  }

  async save(id: string, raw: unknown, actor: string): Promise<Finder> {
    const current = await this.get(id);
    const { value, errors } = normalizeFinderSave({ ...(raw as object), code: current.code });
    if (errors.length) throw badRequest('保存失败：请检查标红的字段', errors);
    if (value.version !== current.version) {
      throw conflict(`该项目已被 ${current.updatedBy} 修改过，请刷新后再改`, 'version_conflict');
    }
    const next: Finder = {
      ...current,
      ...value,
      code: current.code,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    await this.repo.append(next);
    this.invalidate(current.code, next.code);
    return next;
  }

  async setStatus(id: string, status: FinderStatus, version: number, actor: string): Promise<Finder> {
    const current = await this.get(id);
    return this.save(id, { ...current, status, version }, actor);
  }

  async duplicate(id: string, actor: string): Promise<Finder> {
    const source = await this.get(id);
    const now = new Date().toISOString();
    const copy: Finder = {
      ...structuredClone(source),
      id: shortId('fd'),
      code: await this.uniqueCode(),
      title: `${source.title} (copy)`.slice(0, 120),
      status: 'disabled',
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    await this.repo.append(copy);
    return copy;
  }

  private invalidate(...codes: string[]) {
    codes.forEach((code) => this.publicCache.delete(code));
  }

  /** Active finder by public code (cached; scan page + event ingest). */
  async findActiveByCode(code: string): Promise<Finder | null> {
    const key = code.trim().toLowerCase();
    const cached = this.publicCache.get(key);
    if (cached && Date.now() - cached.at < PUBLIC_CACHE_TTL_MS) return cached.finder;
    const finder =
      (await this.repo.listLatest()).find((item) => item.code === key && item.status === 'active' && !item.deleted) ??
      null;
    this.publicCache.set(key, { at: Date.now(), finder });
    return finder;
  }

  async getPublic(code: string): Promise<PublicFinder> {
    const finder = await this.findActiveByCode(code);
    if (!finder) throw notFound('Shade finder not found');
    return toPublicFinder(finder);
  }

  /** Latest config for a code, including disabled. Preview only. */
  private async findLatestByCode(code: string): Promise<Finder | null> {
    const key = code.trim().toLowerCase();
    return (await this.repo.listLatest()).find((item) => item.code === key && !item.deleted) ?? null;
  }

  /** Signed 10-minute pass. Nothing is written to storage. */
  async issuePreview(id: string): Promise<PreviewPass & { code: string }> {
    const finder = await this.get(id);
    return { code: finder.code, ...signPreview(finder.code) };
  }

  /** Disabled finders stay reachable while the pass is valid. */
  async getPreview(code: string, token: string): Promise<PublicFinder> {
    const verdict = verifyPreview(token, code);
    if (verdict === 'expired') throw gone('This preview link has expired.');
    if (verdict !== 'ok') throw notFound('Shade finder not found');
    const finder = await this.findLatestByCode(code);
    if (!finder) throw notFound('Shade finder not found');
    return toPublicFinder(finder);
  }
}
