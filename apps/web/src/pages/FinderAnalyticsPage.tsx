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
import { useI18n, type Locale, type MessageKey } from '@/i18n';
import { downloadText, type FinderDetail } from '@/lib/finders';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const RANGES: { value: string; label: MessageKey }[] = [
  { value: '0', label: 'stats.range.0' },
  { value: '6', label: 'stats.range.6' },
  { value: '29', label: 'stats.range.29' },
  { value: '89', label: 'stats.range.89' },
  { value: '364', label: 'stats.range.364' },
];

const WEEKDAYS: Record<Locale, string[]> = {
  zh: ['一', '二', '三', '四', '五', '六', '日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

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
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(monthOf(to || today));
  const [start, setStart] = useState<string | null>(null);
  const earliest = shiftDate(today, -STATS_MAX_DAYS);
  const cells = monthCells(cursor);
  const [year, month] = cursor.split('-').map(Number);
  const monthLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));

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
          {t('stats.through', { from, to })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setCursor(shiftMonth(cursor, -1))} aria-label={t('stats.prevMonth')}>
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={cursor >= monthOf(today)}
            onClick={() => setCursor(shiftMonth(cursor, 1))}
            aria-label={t('stats.nextMonth')}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAYS[locale].map((day) => (
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
        <p className="mt-2 text-xs text-muted-foreground">{start ? t('stats.pickEnd') : t('stats.pickStart')}</p>
      </PopoverContent>
    </Popover>
  );
}
const ALL = '__all__';

const LABEL_KEY: Record<string, MessageKey> = {
  '(direct)': 'stats.label.direct',
  mobile: 'stats.label.mobile',
  tablet: 'stats.label.tablet',
  desktop: 'stats.label.desktop',
  other: 'stats.label.other',
  cool: 'stats.label.cool',
  neutral: 'stats.label.neutral',
  warm: 'stats.label.warm',
  unsure: 'stats.label.unsure',
};

const FUNNEL_KEY: Record<string, MessageKey> = {
  page_view: 'stats.funnel.page',
  camera_granted: 'stats.funnel.camera',
  scan_complete: 'stats.funnel.scan',
  result_shown: 'stats.funnel.result',
  link_click: 'stats.funnel.link',
};

const FEEDBACK_KEY = { too_light: 'stats.light', just_right: 'stats.right', too_deep: 'stats.deep' } as const;

function feedbackAdvice(stats: FinderStats): MessageKey | null {
  const { too_light: light, just_right: right, too_deep: deep } = stats.totals.feedback;
  const total = light + right + deep;
  if (total < 20) return null;
  if (deep / total > 0.35 && deep > light * 1.5) return 'stats.advice.deep';
  if (light / total > 0.35 && light > deep * 1.5) return 'stats.advice.light';
  return null;
}

function shadesCsv(stats: FinderStats, t: (key: MessageKey) => string): string {
  const header = [t('stats.shade'), 'SKU', t('stats.hex'), t('stats.best'), t('stats.shown'), t('stats.selected'), t('stats.jumps'), t('stats.light'), t('stats.right'), t('stats.deep')];
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
  const { t } = useI18n();
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
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block w-full" role="img" aria-label={t('stats.dailyAria')}>
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
              <title>{t('stats.dailyTip', { date: day.date, count: day.sessions })}</title>
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
          {t('stats.dailyTip', { date: active.date, count: formatNumber(active.sessions) })}
        </p>
      ) : null}
    </div>
  );
}

export function FinderAnalyticsPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
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
    <div>
      <div className="sticky top-0 z-20 space-y-3 border-b bg-background/95 px-3 py-3 backdrop-blur">
      <PageHeader
        title={
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => nav('/finders')} aria-label={t('stats.back')}>
              <ArrowLeft />
            </Button>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{detail?.finder.title ?? t('stats.fallbackTitle')}</h1>
          </div>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => nav(`/finders/${id}`)}>
            <Pencil /> {t('stats.edit')}
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
            {query.kind === 'custom' ? <SelectItem value="custom">{t('stats.custom')}</SelectItem> : null}
            {RANGES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {t(item.label)}
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
            <SelectItem value={ALL}>{t('stats.allChannels')}</SelectItem>
            {stats?.channels.map((key) => (
              <SelectItem key={key} value={key}>
                {LABEL_KEY[key] ? t(LABEL_KEY[key]) : key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label={t('stats.refresh')}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
        </Button>
        <InfoHint title={t('stats.methodTitle')}>{t('stats.method')}</InfoHint>
      </div>
      </div>

      <div className="space-y-4 p-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {stats && totals ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label={t('stats.visitors')} value={formatNumber(totals.visitors)} sub={t('stats.opens', { count: formatNumber(totals.sessions) })} />
            <KpiCard
              label={t('stats.scans')}
              value={formatNumber(totals.scans)}
              sub={totals.medianScanMs != null ? t('stats.median', { seconds: (totals.medianScanMs / 1000).toFixed(1) }) : undefined}
            />
            <KpiCard label={t('stats.clicks')} value={formatNumber(totals.linkClicks)} sub={t('stats.clickRate', { rate: formatPercent(totals.linkClicks, totals.results) })} />
            <KpiCard
              label={t('stats.feedback')}
              value={formatNumber(feedbackTotal)}
              sub={t('stats.feedbackSub', { rate: formatPercent(totals.feedback.just_right, feedbackTotal), count: totals.cameraDenied })}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('stats.funnel')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.funnel.map((step, index) => {
                  const prev = index ? stats.funnel[index - 1].sessions : step.sessions;
                  return (
                    <div key={step.key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{FUNNEL_KEY[step.key] ? t(FUNNEL_KEY[step.key]) : step.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(step.sessions)}
                          {index ? ` · ${t('stats.prevStep', { rate: formatPercent(step.sessions, prev) })}` : ''}
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
                <p className="text-xs text-muted-foreground">{t('stats.funnelNote')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('stats.feedback')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FeedbackBar counts={totals.feedback} className="h-4" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(Object.keys(FEEDBACK_KEY) as (keyof typeof FEEDBACK_KEY)[]).map((key) => (
                    <div key={key} className="rounded-md border p-2">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`size-2 rounded-full ${FEEDBACK_COLORS[key]}`} />
                        {t(FEEDBACK_KEY[key])}
                      </div>
                      <p className="text-lg font-semibold tabular-nums">{totals.feedback[key]}</p>
                      <p className="text-xs text-muted-foreground">{formatPercent(totals.feedback[key], feedbackTotal)}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('stats.dismissed', { count: totals.feedbackDismissed })}</p>
                {advice ? (
                  <Alert>
                    <AlertDescription>{t(advice)}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('stats.daily')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyLine days={stats.daily} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('stats.shades')}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={!stats.shades.length}
                onClick={() => {
                  downloadText(shadesCsv(stats, t), `${detail?.finder.code ?? id}-shades-${stats.from}_${stats.to}.csv`, 'text/csv');
                  toast({ title: t('stats.exported'), variant: 'success' });
                }}
              >
                <Download /> {t('stats.export')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-40">{t('stats.shade')}</TableHead>
                      <TableHead className="text-right">{t('stats.best')}</TableHead>
                      <TableHead className="text-right">{t('stats.shown')}</TableHead>
                      <TableHead className="text-right">{t('stats.selected')}</TableHead>
                      <TableHead className="text-right">{t('stats.jumps')}</TableHead>
                      <TableHead className="min-w-44">{t('stats.feedbackCol')}</TableHead>
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
                          {t('stats.noShades')}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <BreakdownCard title={t('stats.byChannel')} rows={stats.byChannel.map((row) => ({ key: row.key, label: LABEL_KEY[row.key] ? t(LABEL_KEY[row.key]) : row.key, value: row.sessions }))} />
            <BreakdownCard title={t('stats.byButton')} rows={stats.buttons.map((row) => ({ key: row.buttonId, label: row.label, value: row.clicks }))} />
            <BreakdownCard title={t('stats.byTone')} rows={stats.undertones.map((row) => ({ key: row.key, label: LABEL_KEY[row.key] ? t(LABEL_KEY[row.key]) : row.key, value: row.count }))} />
            <BreakdownCard title={t('stats.byDevice')} rows={stats.byDevice.map((row) => ({ key: row.key, label: LABEL_KEY[row.key] ? t(LABEL_KEY[row.key]) : row.key, value: row.sessions }))} />
            <BreakdownCard title={t('stats.byOs')} rows={stats.byOs.map((row) => ({ key: row.key, label: LABEL_KEY[row.key] ? t(LABEL_KEY[row.key]) : row.key, value: row.sessions }))} />
          </div>
        </>
      ) : null}
      </div>
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
