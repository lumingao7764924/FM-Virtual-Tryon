import type { Undertone } from './color.js';
import type { ShadeRole } from './match.js';

/** Scan-page events (replaces the Shopify GA4 `data-fm-track` events). */
export const TRACK_EVENTS = [
  'page_view',
  'qr_shown',
  'privacy_accept',
  'camera_granted',
  'camera_denied',
  'scan_complete',
  'undertone_select',
  'result_shown',
  'shade_select',
  'link_click',
  'feedback',
  'feedback_dismiss',
  'scan_again',
] as const;

export type TrackEventName = (typeof TRACK_EVENTS)[number];

export type FeedbackChoice = 'too_light' | 'just_right' | 'too_deep';

export interface RecommendedSlot {
  variantId: string;
  sku: string;
  role: ShadeRole;
}

/** Event-specific fields; all optional so one flat row fits every event. */
export interface TrackEventProps {
  channel?: string;
  variantId?: string;
  sku?: string;
  role?: ShadeRole;
  buttonId?: string;
  url?: string;
  /** null = "I'm not sure". */
  undertone?: Undertone | null;
  feedback?: FeedbackChoice;
  recommended?: RecommendedSlot[];
  skinLab?: [number, number, number];
  durationMs?: number;
}

export interface TrackEvent extends TrackEventProps {
  eventId: string;
  name: TrackEventName;
  finderCode: string;
  finderVersion: number;
  visitorId: string;
  sessionId: string;
  /** Client ISO timestamp; server also stamps receive time. */
  clientTs: string;
}

export interface TrackBatch {
  events: TrackEvent[];
}

export const MAX_TRACK_BATCH = 50;

export function isTrackEventName(value: unknown): value is TrackEventName {
  return typeof value === 'string' && (TRACK_EVENTS as readonly string[]).includes(value);
}
