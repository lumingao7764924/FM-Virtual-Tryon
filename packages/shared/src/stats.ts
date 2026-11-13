import type { FeedbackChoice } from './events.js';

export type FeedbackCounts = Record<FeedbackChoice, number>;

export interface FunnelStep {
  key: 'page_view' | 'camera_granted' | 'scan_complete' | 'result_shown' | 'link_click';
  label: string;
  /** Distinct sessions that reached this step. */
  sessions: number;
}

export interface DailyStat {
  date: string;
  visitors: number;
  sessions: number;
  scans: number;
  results: number;
  linkClicks: number;
}

export interface BreakdownRow {
  key: string;
  sessions: number;
  scans: number;
  linkClicks: number;
}

export interface ShadeStat {
  variantId: string;
  sku: string;
  name: string;
  hex: string;
  /** Times shown as the best match. */
  best: number;
  /** Times shown in any of the three slots. */
  shown: number;
  selected: number;
  linkClicks: number;
  /** Feedback attributed to the best-match shade of that result. */
  feedback: FeedbackCounts;
}

export interface ButtonStat {
  buttonId: string;
  label: string;
  clicks: number;
}

export interface FinderStats {
  from: string;
  to: string;
  channels: string[];
  totals: {
    visitors: number;
    sessions: number;
    pageViews: number;
    scans: number;
    results: number;
    linkClicks: number;
    cameraDenied: number;
    feedback: FeedbackCounts;
    feedbackDismissed: number;
    /** Median scan_complete durationMs (camera live → capture). */
    medianScanMs: number | null;
  };
  funnel: FunnelStep[];
  daily: DailyStat[];
  byChannel: BreakdownRow[];
  byDevice: BreakdownRow[];
  byOs: BreakdownRow[];
  undertones: { key: string; count: number }[];
  shades: ShadeStat[];
  buttons: ButtonStat[];
}

export const STATS_MAX_DAYS = 366;

export function emptyFeedback(): FeedbackCounts {
  return { too_light: 0, just_right: 0, too_deep: 0 };
}
