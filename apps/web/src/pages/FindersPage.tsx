import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartColumn,
  Copy,
  CopyPlus,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  QrCode,
  Search,
  Trash2,
} from 'lucide-react';
import type { FinderSummary, PaginatedListResponse } from '@tryon/shared';
import { apiFetch, errorMessage } from '@/api';
import { useAuth } from '@/hooks/use-auth';
import { BrandSelect } from '@/components/brand-select';
import { InfoHint } from '@/components/info-hint';
import { ListPager } from '@/components/list-pager';
import { PageHeader } from '@/components/page-header';
import { QrDialog, type QrTarget } from '@/components/qr-dialog';
import { StatusBadge } from '@/components/status-badge';
import { toast } from '@/components/toast';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { copyText, type FinderDetail } from '@/lib/finders';
import { formatDateTime } from '@/lib/format';
import { useI18n } from '@/i18n';

type ListResponse = PaginatedListResponse<FinderSummary> & { brands: string[] };

const ALL = '__all__';

export function FindersPage() {
  const nav = useNavigate();
  const { canEdit, session } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(ALL);
  const [brand, setBrand] = useState(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [removing, setRemoving] = useState<FinderSummary | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (query) params.set('q', query);
      if (status !== ALL) params.set('status', status);
      if (brand !== ALL) params.set('brand', brand);
      setData(await apiFetch<ListResponse>(`/api/finders?${params}`));
    } catch (err) {
      toast({ title: t('finders.toastLoad'), description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query, status, brand, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function detail(id: string) {
    return apiFetch<FinderDetail>(`/api/finders/${id}`);
  }

  async function openQr(item: FinderSummary) {
    try {
      const { scanUrl } = await detail(item.id);
      setQrTarget({
        id: item.id,
        code: item.code,
        title: item.title,
        scanUrl,
        active: item.status === 'active',
      });
    } catch (err) {
      toast({ title: t('finders.toastLink'), description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function copyLink(item: FinderSummary) {
    try {
      await copyText((await detail(item.id)).scanUrl);
      toast({ title: t('finders.toastCopied'), variant: 'success' });
    } catch (err) {
      toast({ title: t('finders.toastCopyFail'), description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function preview(item: FinderSummary) {
    try {
      const { scanUrl } = await detail(item.id);
      setQrTarget({
        id: item.id,
        code: item.code,
        title: item.title,
        scanUrl,
        active: item.status === 'active',
        preview: true,
      });
    } catch (err) {
      toast({ title: t('finders.toastPreview'), description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function remove(item: FinderSummary) {
    setRemovingBusy(true);
    try {
      await apiFetch(`/api/finders/${item.id}`, { method: 'DELETE' });
      toast({ title: t('finders.toastDeleted'), variant: 'success' });
      setRemoving(null);
      void load();
    } catch (err) {
      toast({ title: t('finders.toastDeleteFail'), description: errorMessage(err), variant: 'destructive' });
    } finally {
      setRemovingBusy(false);
    }
  }

  async function toggleStatus(item: FinderSummary) {
    const next = item.status === 'active' ? 'disabled' : 'active';
    try {
      await apiFetch(`/api/finders/${item.id}/status`, { method: 'POST', json: { status: next, version: item.version } });
      toast({ title: next === 'active' ? t('finders.toastEnabled') : t('finders.toastDisabled'), variant: 'success' });
      void load();
    } catch (err) {
      toast({ title: t('finders.toastActionFail'), description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function duplicate(item: FinderSummary) {
    try {
      const res = await apiFetch<FinderDetail>(`/api/finders/${item.id}/duplicate`, { method: 'POST', json: {} });
      toast({ title: t('finders.toastDuplicated'), variant: 'success' });
      nav(`/finders/${res.finder.id}`);
    } catch (err) {
      toast({ title: t('finders.toastCopyFail'), description: errorMessage(err), variant: 'destructive' });
    }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(q.trim());
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title={t('finders.title')}
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> {t('finders.create')}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={search} className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('finders.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('finders.allStatus')}</SelectItem>
            <SelectItem value="active">{t('status.active')}</SelectItem>
            <SelectItem value="disabled">{t('status.disabled')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={brand}
          onValueChange={(value) => {
            setBrand(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('finders.allBrands')}</SelectItem>
            {data?.brands.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card">
            <TableRow>
              <TableHead>{t('finders.product')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('finders.shades')}</TableHead>
              <TableHead>{t('finders.status')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('finders.updated')}</TableHead>
              <TableHead className="w-12 text-right">{t('finders.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => nav(`/finders/${item.id}`)}
                  >
                    <p className="font-medium">{item.title}</p>
                    {item.brand ? <p className="text-xs text-muted-foreground">{item.brand}</p> : null}
                  </button>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{item.variantCount}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  <p>{formatDateTime(item.updatedAt)}</p>
                  <p>
                    {item.updatedBy}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t('finders.actions')}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => nav(`/finders/${item.id}/analytics`)}>
                        <ChartColumn /> {t('finders.analytics')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => nav(`/finders/${item.id}`)}>
                        <Pencil /> {canEdit ? t('finders.edit') : t('finders.view')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void preview(item)}>
                        <ExternalLink /> {t('finders.preview')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void openQr(item)}>
                        <QrCode /> {t('finders.qr')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void copyLink(item)}>
                        <Copy /> {t('finders.copyLink')}
                      </DropdownMenuItem>
                      {canEdit ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => void duplicate(item)}>
                            <CopyPlus /> {t('finders.duplicate')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void toggleStatus(item)}
                            variant={item.status === 'active' ? 'destructive' : 'default'}
                          >
                            {item.status === 'active' ? <PowerOff /> : <Power />}
                            {item.status === 'active' ? t('finders.disable') : t('finders.enable')}
                          </DropdownMenuItem>
                          {session?.email === item.createdBy ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(item)}>
                              <Trash2 /> {t('finders.delete')}
                            </DropdownMenuItem>
                          ) : null}
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {!loading && data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {query || status !== ALL || brand !== ALL ? t('finders.emptyFiltered') : t('finders.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </div>
        <ListPager
          className="shrink-0 border-t px-3 py-2"
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Card>

      <QrDialog target={qrTarget} onOpenChange={(open) => !open && setQrTarget(null)} />
      <Dialog open={removing !== null} onOpenChange={(open) => !open && !removingBusy && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('finders.deleteTitle', { title: removing?.title ?? '' })}</DialogTitle>
            <DialogDescription>{t('finders.deleteBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={removingBusy} onClick={() => setRemoving(null)}>
              {t('finders.cancel')}
            </Button>
            <Button variant="destructive" disabled={removingBusy} onClick={() => removing && void remove(removing)}>
              {t('finders.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreateFinderDialog
        open={createOpen}
        brands={session?.brands ?? []}
        onOpenChange={setCreateOpen}
        onCreated={(id) => nav(`/finders/${id}`)}
      />
    </div>
  );
}

function CreateFinderDialog({
  open,
  brands,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  brands: readonly string[];
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setBrand(brands.length === 1 ? brands[0] : '');
    }
  }, [open, brands]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch<FinderDetail>('/api/finders', { method: 'POST', json: { title, brand } });
      onOpenChange(false);
      onCreated(res.finder.id);
    } catch (err) {
      toast({ title: t('finders.toastCreateFail'), description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              {t('finders.create')}
              <InfoHint title={t('finders.createTitle')}>{t('finders.createHint')}</InfoHint>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-title">{t('finders.productName')}</Label>
            <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-brand">{t('finders.brand')}</Label>
            <BrandSelect id="new-brand" value={brand} brands={brands} onChange={setBrand} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('finders.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !title.trim() || !brand}>
              {t('finders.submitCreate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
