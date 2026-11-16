import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { FINDER_BRANDS, type AdminRole, type AdminUser, type AdminUserStatus, type FinderBrand, type ProjectScope } from '@tryon/shared';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { useI18n, type MessageKey } from '@/i18n';

type UserItem = AdminUser & { bootstrap: boolean };

function accessLabel(
  user: { role: AdminRole; brands: readonly string[]; scope: ProjectScope },
  t: (key: MessageKey) => string,
): string {
  if (user.role === 'admin') return t('users.allAccess');
  const brands = user.brands.length ? user.brands.join('、') : t('users.allBrands');
  return `${brands} · ${user.scope === 'own' ? t('users.scopeOwn') : t('users.scopeAll')}`;
}

type Editing = { mode: 'create' } | { mode: 'update'; user: UserItem };

export function UsersPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<UserItem[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<UserItem | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await apiFetch<{ items: UserItem[] }>('/api/admin/users')).items);
    } catch (err) {
      toast({ title: t('users.toastLoad'), description: errorMessage(err), variant: 'destructive' });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(user: UserItem) {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(user.email)}`, { method: 'DELETE' });
      toast({ title: t('users.toastRemoved'), variant: 'success' });
      setRemoving(null);
      void load();
    } catch (err) {
      toast({ title: t('users.toastRemoveFail'), description: errorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title={t('users.title')}
        actions={
          <Button onClick={() => setEditing({ mode: 'create' })}>
            <Plus /> {t('users.add')}
          </Button>
        }
      >
        <InfoHint title={t('users.hintTitle')}>{t('users.hint')}</InfoHint>
      </PageHeader>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.email')}</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('users.scope')}</TableHead>
              <TableHead>{t('users.status')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('users.updated')}</TableHead>
              <TableHead className="w-24 text-right">{t('users.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((user) => (
              <TableRow key={user.email}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>
                  {t(`role.${user.role}`)}
                  {user.bootstrap ? (
                    <Badge variant="outline" className="ml-2">
                      {t('users.fixed')}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{accessLabel(user, t)}</TableCell>
                <TableCell>
                  {user.status === 'active' ? (
                    <span className="text-emerald-600 dark:text-emerald-400">{t('users.active')}</span>
                  ) : (
                    <span className="text-muted-foreground">{t('users.disabled')}</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {user.bootstrap ? t('users.env') : `${formatDateTime(user.updatedAt)} · ${user.updatedBy}`}
                </TableCell>
                <TableCell className="text-right">
                  {user.bootstrap ? null : (
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing({ mode: 'update', user })} aria-label={t('users.edit')}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        disabled={user.email === session?.email}
                        onClick={() => setRemoving(user)}
                        aria-label={t('users.remove')}
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
            <DialogTitle>{t('users.removeTitle')}</DialogTitle>
            <DialogDescription>{t('users.removeBody', { email: removing?.email ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {t('users.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => removing && void remove(removing)}>
              {t('users.confirmRemove')}
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
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('editor');
  const [status, setStatus] = useState<AdminUserStatus>('active');
  const [scope, setScope] = useState<ProjectScope>('all');
  const [brands, setBrands] = useState<FinderBrand[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const user = editing.mode === 'update' ? editing.user : null;
    setEmail(user?.email ?? '');
    setRole(user?.role ?? 'editor');
    setStatus(user?.status ?? 'active');
    setScope(user?.scope ?? 'all');
    setBrands(user?.brands ? [...user.brands] : []);
  }, [editing]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const body = {
        email,
        role,
        status,
        scope: role === 'admin' ? 'all' : scope,
        brands: role === 'admin' ? [] : brands,
      };
      if (editing.mode === 'create') await apiFetch('/api/admin/users', { method: 'POST', json: body });
      else await apiFetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'PUT', json: body });
      toast({ title: t('users.toastSaved'), variant: 'success' });
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: t('users.toastSaveFail'), description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              {editing?.mode === 'create' ? t('users.dialogAdd') : t('users.dialogEdit')}
              <InfoHint title={t('users.permTitle')}>{t('users.perm')}</InfoHint>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="u-email">{t('users.googleEmail')}</Label>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('users.role')}</Label>
              <Select value={role} onValueChange={(value) => setRole(value as AdminRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['admin', 'editor', 'viewer'] as const).map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`role.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('users.status')}</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as AdminUserStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('users.active')}</SelectItem>
                  <SelectItem value="disabled">{t('users.disabled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {role === 'admin' ? null : (
          <>
          <div className="space-y-2">
            <Label>{t('users.projectScope')}</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as ProjectScope)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('users.scopeAll')}</SelectItem>
                <SelectItem value="own">{t('users.scopeOwn')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('users.brandScope')}</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={brands.length === 0}
                onCheckedChange={(checked) => {
                  if (checked) setBrands([]);
                  else setBrands([FINDER_BRANDS[0]]);
                }}
              />
              {t('users.allBrands')}
            </label>
            {brands.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {FINDER_BRANDS.map((brand) => (
                  <label key={brand} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={brands.includes(brand)}
                      onCheckedChange={(checked) =>
                        setBrands((current) => {
                          const next = checked ? [...current, brand] : current.filter((item) => item !== brand);
                          return next.length ? next : [brand];
                        })
                      }
                    />
                    {brand}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('users.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t('users.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
