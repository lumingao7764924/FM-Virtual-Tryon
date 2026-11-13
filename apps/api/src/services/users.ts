import { ADMIN_ROLES, type AdminRole, type AdminUser, type AdminUserStatus } from '@tryon/shared';
import { env } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import type { UserRepo } from '../store/types.js';

const CACHE_TTL_MS = 30_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ResolvedUser {
  email: string;
  name: string;
  role: AdminRole;
  bootstrap: boolean;
}

export interface UserListItem extends AdminUser {
  bootstrap: boolean;
}

export class UserService {
  private cache: { at: number; users: AdminUser[] } | null = null;

  constructor(private readonly repo: UserRepo) {}

  private async users(): Promise<AdminUser[]> {
    if (!this.cache || Date.now() - this.cache.at > CACHE_TTL_MS) {
      const rows = await this.repo.listLatest();
      this.cache = { at: Date.now(), users: rows.filter((row) => !row.deleted) };
    }
    return this.cache.users;
  }

  private isBootstrap(email: string): boolean {
    return env.adminEmails.includes(email.toLowerCase());
  }

  /** Allowlist check used on login and every authenticated request. */
  async resolve(email: string): Promise<ResolvedUser | null> {
    const key = email.trim().toLowerCase();
    if (this.isBootstrap(key)) {
      const stored = (await this.users()).find((user) => user.email === key);
      return { email: key, name: stored?.name || '', role: 'admin', bootstrap: true };
    }
    const user = (await this.users()).find((item) => item.email === key);
    if (!user || user.status !== 'active') return null;
    return { email: key, name: user.name, role: user.role, bootstrap: false };
  }

  async list(): Promise<UserListItem[]> {
    const users = await this.users();
    const items: UserListItem[] = users.map((user) => ({ ...user, bootstrap: this.isBootstrap(user.email) }));
    env.adminEmails.forEach((email) => {
      if (items.some((item) => item.email === email)) return;
      items.push({
        email,
        name: '',
        role: 'admin',
        status: 'active',
        createdAt: '',
        createdBy: 'ADMIN_EMAILS',
        updatedAt: '',
        updatedBy: 'ADMIN_EMAILS',
        bootstrap: true,
      });
    });
    return items.sort((left, right) => Number(right.bootstrap) - Number(left.bootstrap) || left.email.localeCompare(right.email));
  }

  async upsert(
    input: { email?: unknown; name?: unknown; role?: unknown; status?: unknown },
    actor: string,
    mode: 'create' | 'update'
  ): Promise<AdminUser> {
    const email = String(input.email ?? '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw badRequest('邮箱格式不正确', [{ path: 'email', message: '邮箱格式不正确' }]);
    const role = String(input.role ?? 'viewer') as AdminRole;
    if (!ADMIN_ROLES.includes(role)) throw badRequest('角色不正确', [{ path: 'role', message: '角色不正确' }]);
    const status: AdminUserStatus = input.status === 'disabled' ? 'disabled' : 'active';
    if (this.isBootstrap(email) && (role !== 'admin' || status !== 'active')) {
      throw forbidden('ADMIN_EMAILS 中的账号固定为启用的管理员');
    }

    const existing = (await this.users()).find((user) => user.email === email);
    if (mode === 'create' && existing) throw conflict('该邮箱已在名单中');
    if (mode === 'update' && !existing && !this.isBootstrap(email)) throw notFound('账号不存在');

    const now = new Date().toISOString();
    const user: AdminUser = {
      email,
      name: String(input.name ?? existing?.name ?? '').trim().slice(0, 60),
      role,
      status,
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || actor,
      updatedAt: now,
      updatedBy: actor,
    };
    await this.repo.append(user);
    this.cache = null;
    return user;
  }

  async remove(email: string, actor: string): Promise<void> {
    const key = email.trim().toLowerCase();
    if (this.isBootstrap(key)) throw forbidden('ADMIN_EMAILS 中的账号不能删除');
    if (key === actor) throw forbidden('不能删除自己');
    const existing = (await this.users()).find((user) => user.email === key);
    if (!existing) throw notFound('账号不存在');
    const now = new Date().toISOString();
    await this.repo.append({ ...existing, status: 'disabled', updatedAt: now, updatedBy: actor, deleted: true });
    this.cache = null;
  }

  /** Keep the latest Google display name on record after login. */
  async touchName(email: string, name: string): Promise<void> {
    const existing = (await this.users()).find((user) => user.email === email);
    if (!existing || !name || existing.name === name) return;
    await this.repo.append({ ...existing, name: name.slice(0, 60), updatedAt: new Date().toISOString() });
    this.cache = null;
  }
}
