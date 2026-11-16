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
import { useI18n, type MessageKey } from '@/i18n';
import type { FinderDetail } from '@/lib/finders';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type TabKey = 'basic' | 'variants' | 'undertone' | 'matching' | 'buttons' | 'texts';

const TABS: { key: TabKey; label: MessageKey }[] = [
  { key: 'basic', label: 'editor.tab.basic' },
  { key: 'variants', label: 'editor.tab.variants' },
  { key: 'undertone', label: 'editor.tab.undertone' },
  { key: 'matching', label: 'editor.tab.matching' },
  { key: 'buttons', label: 'editor.tab.buttons' },
  { key: 'texts', label: 'editor.tab.texts' },
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
  const { t } = useI18n();
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
        toast({ title: t('editor.fixFields'), description: t('editor.fixCount', { count: err.fields.length }), variant: 'destructive' });
      } else if (err instanceof ApiError && err.status === 409 && err.code === 'version_conflict') {
        setConflict(true);
      } else {
        toast({ title: t('editor.saveFail'), description: errorMessage(err), variant: 'destructive' });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (draft) void persist(toSaveInput(draft), t('editor.saved'));
  }

  function toggleStatus() {
    if (!draft) return;
    const status = draft.status === 'active' ? 'disabled' : 'active';
    void persist({ ...toSaveInput(draft), status }, status === 'active' ? t('editor.enabled') : t('editor.disabled'));
  }

  async function restoreVersion(version: number) {
    try {
      const { finder } = await apiFetch<{ finder: Finder }>(`/api/finders/${id}/versions/${version}`);
      update((d) => {
        const keep = { version: d.version, status: d.status, code: d.code };
        Object.assign(d, structuredClone(finder), keep);
      });
      setHistoryOpen(false);
      toast({ title: t('editor.restored'), description: t('editor.restoreHint') });
    } catch (err) {
      toast({ title: t('editor.restoreFail'), description: errorMessage(err), variant: 'destructive' });
    }
  }

  if (loadError) {
    return (
      <div className="p-4 md:p-6">
        <Alert variant="destructive">
          <AlertTitle>{t('editor.openFail')}</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!draft || !detail) return <p className="p-6 text-sm text-muted-foreground">{t('editor.loading')}</p>;

  const sectionProps = { draft, update, errors, readOnly };
  const active = draft.status === 'active';

  return (
    <div className="pb-24">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <div className="sticky top-0 z-20 space-y-3 border-b bg-background/95 px-3 py-3 backdrop-blur">
          <PageHeader
            title={
              <div className="flex min-w-0 items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => nav('/finders')} aria-label={t('editor.back')}>
                  <ArrowLeft />
                </Button>
                <h1 className="truncate text-2xl font-semibold tracking-tight">{detail.finder.title}</h1>
              </div>
            }
            actions={
              <>
                <Button variant="outline" size="sm" onClick={() => nav(`/finders/${id}/analytics`)}>
                  <ChartColumn /> {t('editor.analytics')}
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
                  <QrCode /> {t('editor.qr')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                  <History /> {t('editor.history')}
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
              <AlertDescription>{t('editor.readOnly')}</AlertDescription>
            </Alert>
          ) : null}

          <div className="overflow-x-auto">
            <TabsList>
              {TABS.map((item) => (
                <TabsTrigger key={item.key} value={item.key} className="relative">
                  {t(item.label)}
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
              {dirty ? t('editor.dirty') : t('editor.clean')}
            </p>
            <div className="flex gap-2">
              {dirty ? (
                <Button variant="ghost" onClick={() => applyDetail(detail)} disabled={saving}>
                  <Undo2 /> {t('editor.revert')}
                </Button>
              ) : null}
              <Button variant={active ? 'outline' : 'secondary'} onClick={toggleStatus} disabled={saving}>
                {active ? <PowerOff /> : <Power />}
                {active ? t('editor.saveDisable') : dirty ? t('editor.saveEnable') : t('editor.enable')}
              </Button>
              <Button onClick={save} disabled={saving || !dirty}>
                <Save /> {t('editor.save')}
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
            <DialogTitle>{t('editor.conflictTitle')}</DialogTitle>
            <DialogDescription>{t('editor.conflictBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflict(false)}>
              {t('editor.conflictLater')}
            </Button>
            <Button onClick={() => void load()}>{t('editor.conflictReload')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('editor.leaveTitle')}</DialogTitle>
            <DialogDescription>{t('editor.leaveBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.proceed?.()}>
              {t('editor.leave')}
            </Button>
            <Button onClick={() => blocker.reset?.()}>{t('editor.stay')}</Button>
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
  const { t } = useI18n();
  const [items, setItems] = useState<FinderVersionMeta[]>([]);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ items: FinderVersionMeta[] }>(`/api/finders/${finderId}/versions`)
      .then((res) => setItems(res.items))
      .catch((err) => toast({ title: t('editor.historyFail'), description: errorMessage(err), variant: 'destructive' }));
  }, [open, finderId, currentVersion, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('editor.historyTitle')}</DialogTitle>
          <DialogDescription>{t('editor.historyBody')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 divide-y overflow-y-auto rounded-md border">
          {items.map((item) => (
            <div key={item.version} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {formatDateTime(item.updatedAt)}
                  {item.version === currentVersion ? <span className="ml-2 text-xs text-muted-foreground">{t('editor.current')}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{item.updatedBy}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                {onRestore && item.version !== currentVersion ? (
                  <Button variant="outline" size="sm" onClick={() => onRestore(item.version)}>
                    {t('editor.loadVersion')}
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
