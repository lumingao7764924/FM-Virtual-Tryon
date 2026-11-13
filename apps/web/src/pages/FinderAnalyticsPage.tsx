import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarRange, ChevronLeft, ChevronRight, Download, Pencil, RefreshCw } from 'lucide-react';
import { STATS_MAX_DAYS, type DailyStat, type FinderStats } from '@tryon/shared';
import { apiFetch, errorMessage } from '@/api';
import { InfoHint } from '@/components/info-hint';
import { PageHeader } from '@/components/page-header';
import { BarList, FEEDBACK_COLORS, FeedbackBar, KpiCard } from '@/components/stat-bars';
import { StatusBadge } from '@/components/status-badge';
import { toast } from '@/components/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadText, type FinderDetail } from '@/lib/finders';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const RANGES = [
  { value: '0', label: '今天' },
  { value: '6', label: '近 7 天' },
  { value: '29', label: '近 30 天' },
  { value: '89', label: '近 90 天' },
  { value: '364', label: '近一年' },
];

type RangeQuery = { kind: 'days'; days: string } | { kind: 'custom'; from: string; to: string };

function shiftDate(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthCells(month: string): { date: string; inMonth: boolean }[] {
  const [year, mon] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - lead);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const ymd = date.toISOString().slice(0, 10);
    return { date: ymd, inMonth: ymd.startsWith(month) };
  });
}

function RangePicker({
  from,
  to,
  today,
  disabled,
  onChange,
}: {
  from: string;
  to: string;
  today: string;
  disabled?: boolean;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(monthOf(to || today));
  const [start, setStart] = useState<string | null>(null);
  const earliest = shiftDate(today, -STATS_MAX_DAYS);
  const cells = monthCells(cursor);
  const week = ['一', '二', '三', '四', '五', '六', '日'];

  function pick(date: string) {
    if (date > today || date < earliest) return;
    if (!start || (start && date === start)) {
      setStart(date);
      return;
    }
    const nextFrom = date < start ? date : start;
    const nextTo = date < start ? start : date;
    if (nextFrom < shiftDate(nextTo, -STATS_MAX_DAYS)) return;
    setStart(null);
    setOpen(false);
    onChange(nextFrom, nextTo);
  }

  const previewFrom = start ?? from;
  const previewTo = start ? start : to;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setStart(null);
          setCursor(monthOf(to || today));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 w-56 justify-start px-2.5 font-normal" disabled={disabled}>
          <CalendarRange />
          {from} 至 {to}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setCursor(shiftMonth(cursor, -1))} aria-label="上个月">
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium">{cursor.replace('-', '年')}月</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={cursor >= monthOf(today)}
            onClick={() => setCursor(shiftMonth(cursor, 1))}
            aria-label="下个月"
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {week.map((day) => (
            <span key={day} className="flex h-7 w-10 items-center justify-center">
              {day}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const blocked = cell.date > today || cell.date < earliest;
            const inRange = cell.date >= previewFrom && cell.date <= previewTo;
            const edge = cell.date === previewFrom || cell.date === previewTo;
            return (
              <button
                key={cell.date}
                type="button"
                disabled={blocked}
                onClick={() => pick(cell.date)}
                className={cn(
                  'h-10 w-10 rounded-md text-sm',
                  !cell.inMonth && 'text-muted-foreground/50',
                  inRange && !edge && 'bg-primary/10',
                  edge && 'bg-primary text-primary-foreground',
                  blocked && 'cursor-not-allowed opacity-30',
                )}
              >
                {Number(cell.date.slice(8))}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{start ? '再点一天作为结束' : '先点开始日期，再点结束日期'}</p>
      </PopoverContent>
    </Popover>
  );
}
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

function DailyLine({ days }: { days: DailyStat[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const height = 200;
  const pad = { l: 36, r: 12, t: 16, b: 28 };

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const max = Math.max(1, ...days.map((day) => day.sessions));
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const xAt = (index: number) => pad.l + (days.length <= 1 ? plotW / 2 : (index / (days.length - 1)) * plotW);
  const yAt = (value: number) => pad.t + (1 - value / max) * plotH;
  const line = days.map((day, index) => `${index ? 'L' : 'M'}${xAt(index).toFixed(1)},${yAt(day.sessions).toFixed(1)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const active = hover === null ? null : days[hover];

  return (
    <div ref={box} className="relative w-full">
      {width > 0 ? (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block w-full" role="img" aria-label="每日打开次数">
        {[0, max].map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={yAt(tick)} y2={yAt(tick)} className="stroke-border" strokeWidth="1" />
            <text x={pad.l - 6} y={yAt(tick) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {tick}
            </text>
          </g>
        ))}
        <path d={line} fill="none" className="stroke-primary" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {days.map((day, index) => (
          <g key={day.date}>
            <circle cx={xAt(index)} cy={yAt(day.sessions)} r={hover === index ? 4 : 2.5} className="fill-primary" />
            <rect
              x={xAt(index) - plotW / Math.max(days.length, 1) / 2}
              y={pad.t}
              width={plotW / Math.max(days.length, 1)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${day.date} 打开 ${day.sessions}`}</title>
            </rect>
            {index % labelEvery === 0 || index === days.length - 1 ? (
              <text x={xAt(index)} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {day.date.slice(5)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      ) : (
        <div className="h-[200px]" />
      )}
      {active && hover !== null ? (
        <p
          className="pointer-events-none absolute top-0 rounded border bg-background px-2 py-1 text-xs shadow-sm"
          style={{ left: `${(xAt(hover) / width) * 100}%`, transform: 'translateX(-50%)' }}
        >
          {active.date} · 打开 {formatNumber(active.sessions)}
        </p>
      ) : null}
    </div>
  );
}

export function FinderAnalyticsPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [detail, setDetail] = useState<FinderDetail | null>(null);
  const [stats, setStats] = useState<FinderStats | null>(null);
  const [query, setQuery] = useState<RangeQuery>({ kind: 'days', days: '6' });
  const [today, setToday] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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
      const params = new URLSearchParams();
      if (query.kind === 'days') params.set('days', query.days);
      else {
        params.set('from', query.from);
        params.set('to', query.to);
      }
      if (channel !== ALL) params.set('channel', channel);
      const next = await apiFetch<FinderStats>(`/api/finders/${id}/stats?${params}`);
      setStats(next);
      setToday(next.today);
      setFrom(next.from);
      setTo(next.to);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, query, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = stats?.totals;
  const feedbackTotal = totals ? totals.feedback.too_light + totals.feedback.just_right + totals.feedback.too_deep : 0;
  const advice = stats ? feedbackAdvice(stats) : null;
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
        <Select
          value={query.kind === 'days' ? query.days : 'custom'}
          onValueChange={(value) => {
            if (value !== 'custom') setQuery({ kind: 'days', days: value });
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {query.kind === 'custom' ? <SelectItem value="custom">自定义</SelectItem> : null}
            {RANGES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {today && from && to ? (
          <RangePicker
            from={from}
            to={to}
            today={today}
            disabled={loading}
            onChange={(nextFrom, nextTo) => setQuery({ kind: 'custom', from: nextFrom, to: nextTo })}
          />
        ) : null}
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
          当天按服务器 UTC 日期计算，和入库日期一致，不看浏览器时间。访客 = 同一台设备浏览器；会话 = 一次打开页面（关掉标签页后重新开算新会话）。漏斗按会话去重。深浅反馈记在当次「最佳匹配」色号上。
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
              <DailyLine days={stats.daily} />
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
