import {
  STATS_MAX_DAYS,
  emptyFeedback,
  type BreakdownRow,
  type FeedbackChoice,
  type Finder,
  type FinderStats,
  type FunnelStep,
  type RecommendedSlot,
  type ShadeStat,
} from '@tryon/shared';
import { badRequest } from '../errors.js';
import type { EventRepo, EventRow } from '../store/types.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const NO_CHANNEL = '(direct)';

const FUNNEL: Omit<FunnelStep, 'sessions'>[] = [
  { key: 'page_view', label: '打开页面' },
  { key: 'camera_granted', label: '开启相机' },
  { key: 'scan_complete', label: '完成扫脸' },
  { key: 'result_shown', label: '看到推荐' },
  { key: 'link_click', label: '点击跳转' },
];

export interface StatsQuery {
  from: string;
  to: string;
  channel: string;
}

function parseRecommended(raw: string | null): RecommendedSlot[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

class Breakdown {
  private readonly rows = new Map<string, { sessions: Set<string>; scans: number; linkClicks: number }>();

  add(key: string, row: EventRow) {
    let entry = this.rows.get(key);
    if (!entry) this.rows.set(key, (entry = { sessions: new Set(), scans: 0, linkClicks: 0 }));
    entry.sessions.add(row.session_id);
    if (row.event_name === 'scan_complete') entry.scans += 1;
    if (row.event_name === 'link_click') entry.linkClicks += 1;
  }

  toRows(): BreakdownRow[] {
    return [...this.rows]
      .map(([key, entry]) => ({ key, sessions: entry.sessions.size, scans: entry.scans, linkClicks: entry.linkClicks }))
      .sort((a, b) => b.sessions - a.sessions);
  }
}

export function validateStatsRange(from: string, to: string) {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) throw badRequest('日期格式应为 YYYY-MM-DD');
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (!(span >= 0)) throw badRequest('开始日期不能晚于结束日期');
  if (span > STATS_MAX_DAYS) throw badRequest(`最多查询 ${STATS_MAX_DAYS} 天`);
}

/** Pure aggregation over raw event rows (shared by local + BigQuery storage). */
export function aggregateStats(finder: Finder, allRows: EventRow[], query: StatsQuery): FinderStats {
  const channels = [...new Set(allRows.map((row) => row.channel ?? NO_CHANNEL))].sort();
  const rows = query.channel ? allRows.filter((row) => (row.channel ?? NO_CHANNEL) === query.channel) : allRows;

  const variants = new Map(finder.variants.map((variant) => [variant.id, variant]));
  const buttonLabels = new Map(finder.buttons.map((button) => [button.id, button.label]));
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const funnelSessions = new Map(FUNNEL.map((step) => [step.key, new Set<string>()]));
  const daily = new Map(
    datesBetween(query.from, query.to).map((date) => [
      date,
      { visitors: new Set<string>(), sessions: new Set<string>(), scans: 0, results: 0, linkClicks: 0 },
    ])
  );
  const byChannel = new Breakdown();
  const byDevice = new Breakdown();
  const byOs = new Breakdown();
  const undertones = new Map<string, number>();
  const shades = new Map<string, ShadeStat>();
  const buttons = new Map<string, number>();
  const feedback = emptyFeedback();
  const durations: number[] = [];
  const counts = { pageViews: 0, scans: 0, results: 0, linkClicks: 0, cameraDenied: 0, feedbackDismissed: 0 };

  const shade = (variantId: string | null, sku?: string | null): ShadeStat | null => {
    if (!variantId) return null;
    let stat = shades.get(variantId);
    if (!stat) {
      const variant = variants.get(variantId);
      stat = {
        variantId,
        sku: variant?.sku ?? sku ?? '',
        name: variant?.name ?? '(已删除)',
        hex: variant?.hex ?? '#CCCCCC',
        best: 0,
        shown: 0,
        selected: 0,
        linkClicks: 0,
        feedback: emptyFeedback(),
      };
      shades.set(variantId, stat);
    }
    return stat;
  };

  for (const row of rows) {
    visitors.add(row.visitor_id);
    sessions.add(row.session_id);
    funnelSessions.get(row.event_name as FunnelStep['key'])?.add(row.session_id);
    byChannel.add(row.channel ?? NO_CHANNEL, row);
    byDevice.add(row.device, row);
    byOs.add(row.os, row);
    const day = daily.get(row.event_date);
    day?.visitors.add(row.visitor_id);
    day?.sessions.add(row.session_id);

    switch (row.event_name) {
      case 'page_view':
        counts.pageViews += 1;
        break;
      case 'camera_denied':
        counts.cameraDenied += 1;
        break;
      case 'scan_complete':
        counts.scans += 1;
        if (day) day.scans += 1;
        if (row.duration_ms != null) durations.push(row.duration_ms);
        break;
      case 'undertone_select':
        if (row.undertone) undertones.set(row.undertone, (undertones.get(row.undertone) ?? 0) + 1);
        break;
      case 'result_shown':
        counts.results += 1;
        if (day) day.results += 1;
        for (const slot of parseRecommended(row.recommended)) {
          const stat = shade(slot.variantId, slot.sku);
          if (!stat) continue;
          stat.shown += 1;
          if (slot.role === 'best') stat.best += 1;
        }
        break;
      case 'shade_select': {
        const stat = shade(row.variant_id, row.sku);
        if (stat) stat.selected += 1;
        break;
      }
      case 'link_click': {
        counts.linkClicks += 1;
        if (day) day.linkClicks += 1;
        const stat = shade(row.variant_id, row.sku);
        if (stat) stat.linkClicks += 1;
        if (row.button_id) buttons.set(row.button_id, (buttons.get(row.button_id) ?? 0) + 1);
        break;
      }
      case 'feedback': {
        const choice = row.feedback as FeedbackChoice | null;
        if (!choice) break;
        feedback[choice] += 1;
        const best = parseRecommended(row.recommended).find((slot) => slot.role === 'best');
        const stat = shade(best?.variantId ?? null, best?.sku);
        if (stat) stat.feedback[choice] += 1;
        break;
      }
      case 'feedback_dismiss':
        counts.feedbackDismissed += 1;
        break;
    }
  }

  return {
    from: query.from,
    to: query.to,
    channels,
    totals: {
      visitors: visitors.size,
      sessions: sessions.size,
      ...counts,
      feedback,
      medianScanMs: median(durations),
    },
    funnel: FUNNEL.map((step) => ({ ...step, sessions: funnelSessions.get(step.key)!.size })),
    daily: [...daily].map(([date, day]) => ({
      date,
      visitors: day.visitors.size,
      sessions: day.sessions.size,
      scans: day.scans,
      results: day.results,
      linkClicks: day.linkClicks,
    })),
    byChannel: byChannel.toRows(),
    byDevice: byDevice.toRows(),
    byOs: byOs.toRows(),
    undertones: [...undertones].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    shades: [...shades.values()].sort((a, b) => b.best - a.best || b.shown - a.shown),
    buttons: [...buttons]
      .map(([buttonId, clicks]) => ({ buttonId, label: buttonLabels.get(buttonId) ?? buttonId, clicks }))
      .sort((a, b) => b.clicks - a.clicks),
  };
}

export class StatsService {
  constructor(private readonly repo: EventRepo) {}

  async forFinder(finder: Finder, query: StatsQuery): Promise<FinderStats> {
    validateStatsRange(query.from, query.to);
    return aggregateStats(finder, await this.repo.query(finder.id, query.from, query.to), query);
  }
}
