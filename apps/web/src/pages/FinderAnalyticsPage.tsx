import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Pencil, RefreshCw } from 'lucide-react';
import type { FinderStats } from '@tryon/shared';
import { apiFetch, errorMessage } from '@/api';
import { InfoHint } from '@/components/info-hint';
import { PageHeader } from '@/components/page-header';
import { BarList, FEEDBACK_COLORS, FeedbackBar, KpiCard } from '@/components/stat-bars';
import { StatusBadge } from '@/components/status-badge';
import { toast } from '@/components/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadText, type FinderDetail } from '@/lib/finders';
import { daysAgo, formatNumber, formatPercent, ymd } from '@/lib/format';

const RANGES = [
  { value: '0', label: '今天' },
  { value: '6', label: '近 7 天' },
  { value: '29', label: '近 30 天' },
  { value: '89', label: '近 90 天' },
  { value: '364', label: '近一年' },
];
const ALL = '__all__';

const LABELS: Record<string, string> = {
  '(direct)': '未标渠道',
  mobile: '手机',
  tablet: '平板',
  desktop: '电脑',
  ios: 'iOS',
  android: 'Android',
  windows: 'Windows',
  macos: 'macOS',
  other: '其他',
  cool: '冷调',
  neutral: '中性',
  warm: '暖调',
  unsure: '不确定',
};

const label = (key: string) => LABELS[key] ?? key;

const FEEDBACK_LABEL = { too_light: '偏浅', just_right: '刚好', too_deep: '偏深' } as const;

function feedbackAdvice(stats: FinderStats): string | null {
  const { too_light: light, just_right: right, too_deep: deep } = stats.totals.feedback;
  const total = light + right + deep;
  if (total < 20) return null;
  if (deep / total > 0.35 && deep > light * 1.5) return '「偏深」反馈明显偏多，可以在「匹配阈值」里把深浅档位往正数（偏浅）调 1–2 档。';
  if (light / total > 0.35 && light > deep * 1.5) return '「偏浅」反馈明显偏多，可以在「匹配阈值」里把深浅档位往负数（偏深）调 1–2 档。';
  return null;
}

function shadesCsv(stats: FinderStats): string {
  const header = ['色号', 'SKU', '色值', '最佳推荐次数', '出现次数', '被点选', '跳转点击', '偏浅', '刚好', '偏深'];
  const rows = stats.shades.map((s) => [
    s.name,
    s.sku,
    s.hex,
    s.best,
    s.shown,
    s.selected,
    s.linkClicks,
    s.feedback.too_light,
    s.feedback.just_right,
    s.feedback.too_deep,
  ]);
  const escape = (value: unknown) => `"${String(value).replace(/"/g, '""')}"`;
  return `\uFEFF${[header, ...rows].map((row) => row.map(escape).join(',')).join('\n')}`;
}

export function FinderAnalyticsPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [detail, setDetail] = useState<FinderDetail | null>(null);
  const [stats, setStats] = useState<FinderStats | null>(null);
  const [range, setRange] = useState('29');
  const [channel, setChannel] = useState(ALL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<FinderDetail>(`/api/finders/${id}`)
      .then(setDetail)
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: daysAgo(Number(range)), to: ymd(new Date()) });
      if (channel !== ALL) params.set('channel', channel);
      setStats(await apiFetch<FinderStats>(`/api/finders/${id}/stats?${params}`));
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, range, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = stats?.totals;
  const feedbackTotal = totals ? totals.feedback.too_light + totals.feedback.just_right + totals.feedback.too_deep : 0;
  const advice = stats ? feedbackAdvice(stats) : null;
  const maxDaily = stats ? Math.max(1, ...stats.daily.map((day) => day.sessions)) : 1;
  const firstStep = stats?.funnel[0]?.sessions ?? 0;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title={
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => nav('/finders')} aria-label="返回列表">
              <ArrowLeft />
            </Button>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{detail?.finder.title ?? '数据'}</h1>
          </div>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => nav(`/finders/${id}`)}>
            <Pencil /> 编辑配置
          </Button>
        }
      >
        {detail ? <StatusBadge status={detail.finder.status} /> : null}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部渠道</SelectItem>
            {stats?.channels.map((key) => (
              <SelectItem key={key} value={key}>
                {label(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="刷新">
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
        </Button>
        <InfoHint title="统计口径">
          日期按 UTC 计。访客 = 同一台设备浏览器；会话 = 一次打开页面（关掉标签页后重新开算新会话）。漏斗按会话去重。深浅反馈记在当次「最佳匹配」色号上。
        </InfoHint>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {stats && totals ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="访客" value={formatNumber(totals.visitors)} sub={`${formatNumber(totals.sessions)} 次打开`} />
            <KpiCard
              label="完成扫脸"
              value={formatNumber(totals.scans)}
              sub={totals.medianScanMs != null ? `中位耗时 ${(totals.medianScanMs / 1000).toFixed(1)} 秒` : undefined}
            />
            <KpiCard label="跳转点击" value={formatNumber(totals.linkClicks)} sub={`点击率 ${formatPercent(totals.linkClicks, totals.results)}（/推荐次数）`} />
            <KpiCard
              label="深浅反馈"
              value={formatNumber(feedbackTotal)}
              sub={`刚好 ${formatPercent(totals.feedback.just_right, feedbackTotal)} · 拒绝相机 ${totals.cameraDenied}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">转化漏斗</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.funnel.map((step, index) => {
                  const prev = index ? stats.funnel[index - 1].sessions : step.sessions;
                  return (
                    <div key={step.key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{step.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(step.sessions)}
                          {index ? ` · 上一步 ${formatPercent(step.sessions, prev)}` : ''}
                        </span>
                      </div>
                      <div className="h-6 rounded bg-muted">
                        <div
                          className="flex h-6 items-center rounded bg-primary/80 px-2 text-xs text-primary-foreground"
                          style={{ width: `${firstStep ? Math.max(2, (step.sessions / firstStep) * 100) : 0}%` }}
                        >
                          {firstStep ? formatPercent(step.sessions, firstStep) : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">顾客可能在隐私确认或相机权限处离开，所以「开启相机」通常低于「打开页面」。</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">深浅反馈</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FeedbackBar counts={totals.feedback} className="h-4" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(Object.keys(FEEDBACK_LABEL) as (keyof typeof FEEDBACK_LABEL)[]).map((key) => (
                    <div key={key} className="rounded-md border p-2">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`size-2 rounded-full ${FEEDBACK_COLORS[key]}`} />
                        {FEEDBACK_LABEL[key]}
                      </div>
                      <p className="text-lg font-semibold tabular-nums">{totals.feedback[key]}</p>
                      <p className="text-xs text-muted-foreground">{formatPercent(totals.feedback[key], feedbackTotal)}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">关闭未选：{totals.feedbackDismissed} 次</p>
                {advice ? (
                  <Alert>
                    <AlertDescription>{advice}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">每日趋势（打开次数）</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-end gap-px overflow-x-auto">
                {stats.daily.map((day) => (
                  <div
                    key={day.date}
                    className="group flex min-w-1.5 flex-1 flex-col justify-end"
                    title={`${day.date}\n打开 ${day.sessions} · 扫脸 ${day.scans} · 推荐 ${day.results} · 点击 ${day.linkClicks}`}
                  >
                    <div
                      className="rounded-t-sm bg-primary/70 group-hover:bg-primary"
                      style={{ height: `${(day.sessions / maxDaily) * 100}%`, minHeight: day.sessions ? 2 : 0 }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{stats.from}</span>
                <span>{stats.to}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">色号表现</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={!stats.shades.length}
                onClick={() => {
                  downloadText(shadesCsv(stats), `${detail?.finder.code ?? id}-shades-${stats.from}_${stats.to}.csv`, 'text/csv');
                  toast({ title: '已导出', variant: 'success' });
                }}
              >
                <Download /> 导出 CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-40">色号</TableHead>
                      <TableHead className="text-right">最佳推荐</TableHead>
                      <TableHead className="text-right">出现</TableHead>
                      <TableHead className="text-right">点选</TableHead>
                      <TableHead className="text-right">跳转</TableHead>
                      <TableHead className="min-w-44">反馈（偏浅 / 刚好 / 偏深）</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.shades.map((shade) => {
                      const fb = shade.feedback;
                      return (
                        <TableRow key={shade.variantId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="size-5 shrink-0 rounded-full border" style={{ background: shade.hex }} />
                              <div className="min-w-0">
                                <p className="truncate text-sm">{shade.name}</p>
                                <p className="font-mono text-xs text-muted-foreground">{shade.sku}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{shade.best}</TableCell>
                          <TableCell className="text-right tabular-nums">{shade.shown}</TableCell>
                          <TableCell className="text-right tabular-nums">{shade.selected}</TableCell>
                          <TableCell className="text-right tabular-nums">{shade.linkClicks}</TableCell>
                          <TableCell>
                            <FeedbackBar counts={fb} />
                            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                              {fb.too_light} / {fb.just_right} / {fb.too_deep}
                            </p>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!stats.shades.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          这段时间还没有推荐记录
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <BreakdownCard title="渠道（打开次数）" rows={stats.byChannel.map((row) => ({ key: row.key, label: label(row.key), value: row.sessions }))} />
            <BreakdownCard title="跳转按钮（点击）" rows={stats.buttons.map((row) => ({ key: row.buttonId, label: row.label, value: row.clicks }))} />
            <BreakdownCard title="顾客选择的色调" rows={stats.undertones.map((row) => ({ key: row.key, label: label(row.key), value: row.count }))} />
            <BreakdownCard title="设备" rows={stats.byDevice.map((row) => ({ key: row.key, label: label(row.key), value: row.sessions }))} />
            <BreakdownCard title="系统" rows={stats.byOs.map((row) => ({ key: row.key, label: label(row.key), value: row.sessions }))} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { key: string; label: string; value: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <BarList rows={rows} />
      </CardContent>
    </Card>
  );
}
