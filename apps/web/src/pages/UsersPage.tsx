import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { AdminRole, AdminUser, AdminUserStatus } from '@tryon/shared';
import { apiFetch, errorMessage } from '@/api';
import { useAuth } from '@/hooks/use-auth';
import { InfoHint } from '@/components/info-hint';
import { PageHeader } from '@/components/page-header';
import { toast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';

type UserItem = AdminUser & { bootstrap: boolean };

const ROLE_LABEL: Record<AdminRole, string> = { admin: '管理员', editor: '编辑', viewer: '只读' };
const ROLE_HINT = '管理员：全部功能 + 管理账号；编辑：新建 / 修改项目；只读：只能看配置和数据。';

type Editing = { mode: 'create' } | { mode: 'update'; user: UserItem };

export function UsersPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<UserItem[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<UserItem | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await apiFetch<{ items: UserItem[] }>('/api/admin/users')).items);
    } catch (err) {
      toast({ title: '加载失败', description: errorMessage(err), variant: 'destructive' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(user: UserItem) {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(user.email)}`, { method: 'DELETE' });
      toast({ title: '已移除', variant: 'success' });
      setRemoving(null);
      void load();
    } catch (err) {
      toast({ title: '移除失败', description: errorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="账号管理"
        actions={
          <Button onClick={() => setEditing({ mode: 'create' })}>
            <Plus /> 添加账号
          </Button>
        }
      >
        <InfoHint title="登录白名单">
          只有名单里的 Google 账号（含个人 Gmail）才能登录后台。标「固定」的是服务器环境变量 ADMIN_EMAILS 里的管理员，不能在这里删除。
        </InfoHint>
      </PageHeader>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="hidden md:table-cell">最后修改</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((user) => (
              <TableRow key={user.email}>
                <TableCell>
                  <p className="font-medium">{user.email}</p>
                  {user.name ? <p className="text-xs text-muted-foreground">{user.name}</p> : null}
                </TableCell>
                <TableCell>
                  {ROLE_LABEL[user.role]}
                  {user.bootstrap ? (
                    <Badge variant="outline" className="ml-2">
                      固定
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  {user.status === 'active' ? (
                    <span className="text-emerald-600 dark:text-emerald-400">正常</span>
                  ) : (
                    <span className="text-muted-foreground">已停用</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {user.bootstrap ? '环境变量' : `${formatDateTime(user.updatedAt)} · ${user.updatedBy}`}
                </TableCell>
                <TableCell className="text-right">
                  {user.bootstrap ? null : (
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing({ mode: 'update', user })} aria-label="编辑">
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        disabled={user.email === session?.email}
                        onClick={() => setRemoving(user)}
                        aria-label="移除"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <UserDialog editing={editing} onClose={() => setEditing(null)} onSaved={load} />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>移除账号</DialogTitle>
            <DialogDescription>{removing?.email} 将无法再登录后台。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => removing && void remove(removing)}>
              移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: Editing | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('editor');
  const [status, setStatus] = useState<AdminUserStatus>('active');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const user = editing.mode === 'update' ? editing.user : null;
    setEmail(user?.email ?? '');
    setName(user?.name ?? '');
    setRole(user?.role ?? 'editor');
    setStatus(user?.status ?? 'active');
  }, [editing]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const body = { email, name, role, status };
      if (editing.mode === 'create') await apiFetch('/api/admin/users', { method: 'POST', json: body });
      else await apiFetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'PUT', json: body });
      toast({ title: '已保存', variant: 'success' });
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: '保存失败', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing?.mode === 'create' ? '添加账号' : '编辑账号'}</DialogTitle>
            <DialogDescription>{ROLE_HINT}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="u-email">Google 邮箱</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={editing?.mode === 'update'}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-name">备注名（可空）</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={role} onValueChange={(value) => setRole(value as AdminRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as AdminRole[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {ROLE_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as AdminUserStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">正常</SelectItem>
                  <SelectItem value="disabled">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
