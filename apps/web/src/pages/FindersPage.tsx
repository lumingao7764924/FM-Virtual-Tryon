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

type ListResponse = PaginatedListResponse<FinderSummary> & { brands: string[] };

const PAGE_SIZE = 20;
const ALL = '__all__';

export function FindersPage() {
  const nav = useNavigate();
  const { canEdit, session } = useAuth();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(ALL);
  const [brand, setBrand] = useState(ALL);
  const [page, setPage] = useState(1);
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [removing, setRemoving] = useState<FinderSummary | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (query) params.set('q', query);
      if (status !== ALL) params.set('status', status);
      if (brand !== ALL) params.set('brand', brand);
      setData(await apiFetch<ListResponse>(`/api/finders?${params}`));
    } catch (err) {
      toast({ title: '加载失败', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, query, status, brand]);

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
      toast({ title: '获取链接失败', description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function copyLink(item: FinderSummary) {
    try {
      await copyText((await detail(item.id)).scanUrl);
      toast({ title: '扫码链接已复制', variant: 'success' });
    } catch (err) {
      toast({ title: '复制失败', description: errorMessage(err), variant: 'destructive' });
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
      toast({ title: '预览码生成失败', description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function remove(item: FinderSummary) {
    setRemovingBusy(true);
    try {
      await apiFetch(`/api/finders/${item.id}`, { method: 'DELETE' });
      toast({ title: '已删除', variant: 'success' });
      setRemoving(null);
      void load();
    } catch (err) {
      toast({ title: '删除失败', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setRemovingBusy(false);
    }
  }

  async function toggleStatus(item: FinderSummary) {
    const next = item.status === 'active' ? 'disabled' : 'active';
    try {
      await apiFetch(`/api/finders/${item.id}/status`, { method: 'POST', json: { status: next, version: item.version } });
      toast({ title: next === 'active' ? '已启用' : '已停用', variant: 'success' });
      void load();
    } catch (err) {
      toast({ title: '操作失败', description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function duplicate(item: FinderSummary) {
    try {
      const res = await apiFetch<FinderDetail>(`/api/finders/${item.id}/duplicate`, { method: 'POST', json: {} });
      toast({ title: '已复制为新项目（停用状态）', variant: 'success' });
      nav(`/finders/${res.finder.id}`);
    } catch (err) {
      toast({ title: '复制失败', description: errorMessage(err), variant: 'destructive' });
    }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(q.trim());
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="采集列表"
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> 新建采集
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={search} className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索名称 / 品牌 / SKU" value={q} onChange={(e) => setQ(e.target.value)} />
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
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value="active">启用中</SelectItem>
            <SelectItem value="disabled">已停用</SelectItem>
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
            <SelectItem value={ALL}>全部品牌</SelectItem>
            {data?.brands.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>产品</TableHead>
              <TableHead className="hidden sm:table-cell">色号数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="hidden lg:table-cell">最后修改</TableHead>
              <TableHead className="w-12 text-right">操作</TableHead>
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
                      <Button variant="ghost" size="icon" aria-label="操作">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => nav(`/finders/${item.id}/analytics`)}>
                        <ChartColumn /> 查看数据
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => nav(`/finders/${item.id}`)}>
                        <Pencil /> {canEdit ? '编辑' : '查看配置'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void preview(item)}>
                        <ExternalLink /> 预览
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void openQr(item)}>
                        <QrCode /> 下载二维码
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void copyLink(item)}>
                        <Copy /> 复制链接
                      </DropdownMenuItem>
                      {canEdit ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => void duplicate(item)}>
                            <CopyPlus /> 复制项目
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void toggleStatus(item)}
                            variant={item.status === 'active' ? 'destructive' : 'default'}
                          >
                            {item.status === 'active' ? <PowerOff /> : <Power />}
                            {item.status === 'active' ? '停用' : '启用'}
                          </DropdownMenuItem>
                          {session?.email === item.createdBy ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(item)}>
                              <Trash2 /> 删除
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
                  {query || status !== ALL || brand !== ALL ? '没有符合条件的项目' : '还没有项目，点右上角「新建采集」开始'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      {data && data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            共 {data.total} 个 · 第 {page}/{totalPages} 页
          </span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            下一页
          </Button>
        </div>
      ) : null}

      <QrDialog target={qrTarget} onOpenChange={(open) => !open && setQrTarget(null)} />
      <Dialog open={removing !== null} onOpenChange={(open) => !open && !removingBusy && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除「{removing?.title}」？</DialogTitle>
            <DialogDescription>删除后项目从列表消失，已经印出的正式二维码也不能再扫。此操作不能恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={removingBusy} onClick={() => setRemoving(null)}>
              取消
            </Button>
            <Button variant="destructive" disabled={removingBusy} onClick={() => removing && void remove(removing)}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreateFinderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => nav(`/finders/${id}`)} />
    </div>
  );
}

function CreateFinderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setBrand('');
    }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch<FinderDetail>('/api/finders', { method: 'POST', json: { title, brand } });
      onOpenChange(false);
      onCreated(res.finder.id);
    } catch (err) {
      toast({ title: '创建失败', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>新建采集</DialogTitle>
            <DialogDescription>一个产品一个项目、一个二维码。创建后再补充色号和按钮，默认是停用状态。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-title">产品名称</Label>
            <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-brand">品牌</Label>
            <BrandSelect id="new-brand" value={brand} onChange={setBrand} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={busy || !title.trim() || !brand}>
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
