import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChartColumn, History, Power, PowerOff, QrCode, Save, Undo2 } from 'lucide-react';
import type { FieldError, Finder, FinderSaveInput, FinderVersionMeta } from '@tryon/shared';
import { ApiError, apiFetch, errorMessage } from '@/api';
import { useAuth } from '@/hooks/use-auth';
import { BasicSection } from '@/components/editor/basic-section';
import { ButtonsSection } from '@/components/editor/buttons-section';
import { MatchingSection } from '@/components/editor/matching-section';
import { TextsSection } from '@/components/editor/texts-section';
import { UndertoneSection } from '@/components/editor/undertone-section';
import { VariantsSection } from '@/components/editor/variants-section';
import type { UpdateDraft } from '@/components/editor/shared';
import { PageHeader } from '@/components/page-header';
import { QrDialog, type QrTarget } from '@/components/qr-dialog';
import { StatusBadge } from '@/components/status-badge';
import { toast } from '@/components/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FinderDetail } from '@/lib/finders';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type TabKey = 'basic' | 'variants' | 'undertone' | 'matching' | 'buttons' | 'texts';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'basic', label: '基本信息' },
  { key: 'variants', label: '色号变体' },
  { key: 'undertone', label: '冷中暖色调' },
  { key: 'matching', label: '匹配阈值' },
  { key: 'buttons', label: '跳转按钮' },
  { key: 'texts', label: '文案与样式' },
];

function tabOfError(path: string): TabKey {
  if (/^variants\.\d+\.links\./.test(path) || path.startsWith('buttons')) return 'buttons';
  if (path.startsWith('variants')) return 'variants';
  if (path.startsWith('settings.undertone')) return 'undertone';
  if (path.startsWith('settings.matching')) return 'matching';
  if (path.startsWith('settings')) return 'texts';
  return 'basic';
}

function toSaveInput(finder: Finder): FinderSaveInput {
  const { code, title, brand, notes, status, variants, buttons, settings, version } = finder;
  return { code, title, brand, notes, status, variants, buttons, settings, version };
}

const fingerprint = (finder: Finder | null) => (finder ? JSON.stringify(toSaveInput(finder)) : '');

export function FinderEditorPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { canEdit } = useAuth();
  const readOnly = !canEdit;
  const [detail, setDetail] = useState<FinderDetail | null>(null);
  const [draft, setDraft] = useState<Finder | null>(null);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<TabKey>('basic');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const applyDetail = useCallback((next: FinderDetail) => {
    setDetail(next);
    setDraft(structuredClone(next.finder));
    setErrors([]);
    setConflict(false);
  }, []);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      applyDetail(await apiFetch<FinderDetail>(`/api/finders/${id}`));
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [id, applyDetail]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => fingerprint(draft) !== fingerprint(detail?.finder ?? null), [draft, detail]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const update = useCallback<UpdateDraft>((recipe) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      recipe(next);
      return next;
    });
  }, []);

  const errorTabs = useMemo(() => new Set(errors.map((error) => tabOfError(error.path))), [errors]);

  async function persist(body: FinderSaveInput, successTitle: string) {
    setSaving(true);
    try {
      const next = await apiFetch<FinderDetail>(`/api/finders/${id}`, { method: 'PUT', json: body });
      applyDetail(next);
      toast({ title: successTitle, variant: 'success' });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) {
        setErrors(err.fields);
        setTab(tabOfError(err.fields[0].path));
        toast({ title: '有内容需要修改', description: `${err.fields.length} 处问题，已标红`, variant: 'destructive' });
      } else if (err instanceof ApiError && err.status === 409 && err.code === 'version_conflict') {
        setConflict(true);
      } else {
        toast({ title: '保存失败', description: errorMessage(err), variant: 'destructive' });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (draft) void persist(toSaveInput(draft), '已保存');
  }

  function toggleStatus() {
    if (!draft) return;
    const status = draft.status === 'active' ? 'disabled' : 'active';
    void persist({ ...toSaveInput(draft), status }, status === 'active' ? '已启用' : '已停用');
  }

  async function restoreVersion(version: number) {
    try {
      const { finder } = await apiFetch<{ finder: Finder }>(`/api/finders/${id}/versions/${version}`);
      update((d) => {
        const keep = { version: d.version, status: d.status, code: d.code };
        Object.assign(d, structuredClone(finder), keep);
      });
      setHistoryOpen(false);
      toast({ title: '已载入历史内容', description: '确认无误后点「保存」生效' });
    } catch (err) {
      toast({ title: '载入失败', description: errorMessage(err), variant: 'destructive' });
    }
  }

  if (loadError) {
    return (
      <div className="p-4 md:p-6">
        <Alert variant="destructive">
          <AlertTitle>无法打开项目</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!draft || !detail) return <p className="p-6 text-sm text-muted-foreground">加载中…</p>;

  const sectionProps = { draft, update, errors, readOnly };
  const active = draft.status === 'active';

  return (
    <div className="pb-24">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <div className="sticky top-0 z-20 space-y-3 border-b bg-background/95 px-3 py-3 backdrop-blur">
          <PageHeader
            title={
              <div className="flex min-w-0 items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => nav('/finders')} aria-label="返回列表">
                  <ArrowLeft />
                </Button>
                <h1 className="truncate text-2xl font-semibold tracking-tight">{detail.finder.title}</h1>
              </div>
            }
            actions={
              <>
                <Button variant="outline" size="sm" onClick={() => nav(`/finders/${id}/analytics`)}>
                  <ChartColumn /> 数据
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setQrTarget({
                      id: detail.finder.id,
                      code: detail.finder.code,
                      title: detail.finder.title,
                      scanUrl: detail.scanUrl,
                      active,
                    })
                  }
                >
                  <QrCode /> 二维码
                </Button>
                <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                  <History /> 历史
                </Button>
              </>
            }
          >
            <StatusBadge status={detail.finder.status} />
            <span className="text-xs text-muted-foreground">
              {detail.finder.updatedBy} · {formatDateTime(detail.finder.updatedAt)}
            </span>
          </PageHeader>

          {readOnly ? (
            <Alert>
              <AlertDescription>你的账号是只读权限，只能查看配置。</AlertDescription>
            </Alert>
          ) : null}

          <div className="overflow-x-auto">
            <TabsList>
              {TABS.map((item) => (
                <TabsTrigger key={item.key} value={item.key} className="relative">
                  {item.label}
                  {errorTabs.has(item.key) ? <span className="ml-1 size-1.5 rounded-full bg-destructive" /> : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <div className="p-3">
          <TabsContent value="basic" className="mt-0">
            <BasicSection {...sectionProps} scanUrl={detail.scanUrl} />
          </TabsContent>
          <TabsContent value="variants" className="mt-0">
            <VariantsSection {...sectionProps} />
          </TabsContent>
          <TabsContent value="undertone" className="mt-0">
            <UndertoneSection {...sectionProps} />
          </TabsContent>
          <TabsContent value="matching" className="mt-0">
            <MatchingSection {...sectionProps} />
          </TabsContent>
          <TabsContent value="buttons" className="mt-0">
            <ButtonsSection {...sectionProps} />
          </TabsContent>
          <TabsContent value="texts" className="mt-0">
            <TextsSection {...sectionProps} />
          </TabsContent>
        </div>
      </Tabs>

      {readOnly ? null : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:left-60">
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            <p className={cn('text-sm', dirty ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
              {dirty ? '有未保存的修改' : '所有修改已保存'}
            </p>
            <div className="flex gap-2">
              {dirty ? (
                <Button variant="ghost" onClick={() => applyDetail(detail)} disabled={saving}>
                  <Undo2 /> 撤销修改
                </Button>
              ) : null}
              <Button variant={active ? 'outline' : 'secondary'} onClick={toggleStatus} disabled={saving}>
                {active ? <PowerOff /> : <Power />}
                {active ? '保存并停用' : dirty ? '保存并启用' : '启用'}
              </Button>
              <Button onClick={save} disabled={saving || !dirty}>
                <Save /> 保存
              </Button>
            </div>
          </div>
        </div>
      )}

      <QrDialog target={qrTarget} onOpenChange={(open) => !open && setQrTarget(null)} />
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        finderId={id}
        currentVersion={detail.finder.version}
        onRestore={readOnly ? undefined : restoreVersion}
      />

      <Dialog open={conflict} onOpenChange={setConflict}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>内容已被其他人修改</DialogTitle>
            <DialogDescription>
              在你编辑期间，有人保存了新版本。重新加载会丢掉你当前未保存的修改。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflict(false)}>
              先不处理
            </Button>
            <Button onClick={() => void load()}>重新加载最新版本</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>离开前要保存吗？</DialogTitle>
            <DialogDescription>当前有未保存的修改，离开后会丢失。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.proceed?.()}>
              不保存，直接离开
            </Button>
            <Button onClick={() => blocker.reset?.()}>留在此页</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryDialog({
  open,
  onOpenChange,
  finderId,
  currentVersion,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finderId: string;
  currentVersion: number;
  onRestore?: (version: number) => void;
}) {
  const [items, setItems] = useState<FinderVersionMeta[]>([]);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ items: FinderVersionMeta[] }>(`/api/finders/${finderId}/versions`)
      .then((res) => setItems(res.items))
      .catch((err) => toast({ title: '加载历史失败', description: errorMessage(err), variant: 'destructive' }));
  }, [open, finderId, currentVersion]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>修改历史</DialogTitle>
          <DialogDescription>每次保存都会留一份记录。载入历史内容后需要再保存才会生效（启用状态保持当前值）。</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 divide-y overflow-y-auto rounded-md border">
          {items.map((item) => (
            <div key={item.version} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {formatDateTime(item.updatedAt)}
                  {item.version === currentVersion ? <span className="ml-2 text-xs text-muted-foreground">当前</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{item.updatedBy}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                {onRestore && item.version !== currentVersion ? (
                  <Button variant="outline" size="sm" onClick={() => onRestore(item.version)}>
                    载入
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
