import {
  MAX_TRACK_BATCH,
  isTrackEventName,
  type FeedbackChoice,
  type Finder,
  type ShadeRole,
  type Undertone,
} from '@tryon/shared';
import type { EventRepo, EventRow } from '../store/types.js';
import type { FinderService } from './finders.js';

const ROLES: readonly ShadeRole[] = ['lighter', 'best', 'deeper'];
const UNDERTONES: readonly Undertone[] = ['cool', 'neutral', 'warm'];
const FEEDBACK: readonly FeedbackChoice[] = ['too_light', 'just_right', 'too_deep'];
const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function finiteOrNull(value: unknown, digits = 2): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

export function deviceFromUserAgent(userAgent: string): { device: string; os: string } {
  const ua = userAgent.toLowerCase();
  const os = /iphone|ipad|ipod/.test(ua)
    ? 'ios'
    : /android/.test(ua)
      ? 'android'
      : /windows/.test(ua)
        ? 'windows'
        : /mac os/.test(ua)
          ? 'macos'
          : 'other';
  const device = /ipad|tablet/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))
    ? 'tablet'
    : /mobi|iphone|ipod|android/.test(ua)
      ? 'mobile'
      : 'desktop';
  return { device, os };
}

export class EventService {
  constructor(
    private readonly repo: EventRepo,
    private readonly finders: FinderService
  ) {}

  /** Validate + enrich a beacon batch. Unknown / inactive finders and malformed events are dropped. */
  async ingest(body: unknown, userAgent: string): Promise<{ accepted: number; dropped: number }> {
    const events = Array.isArray((body as { events?: unknown })?.events)
      ? ((body as { events: unknown[] }).events.slice(0, MAX_TRACK_BATCH) as Record<string, unknown>[])
      : [];
    const receivedAt = new Date();
    const { device, os } = deviceFromUserAgent(userAgent);
    const finderCache = new Map<string, Finder | null>();
    const rows: EventRow[] = [];

    for (const event of events) {
      if (!event || typeof event !== 'object' || !isTrackEventName(event.name)) continue;
      const eventId = str(event.eventId, 64);
      const visitorId = str(event.visitorId, 64);
      const sessionId = str(event.sessionId, 64);
      const code = str(event.finderCode, 40)?.toLowerCase();
      if (!eventId || !ID_PATTERN.test(eventId) || !visitorId || !sessionId || !code) continue;

      if (!finderCache.has(code)) finderCache.set(code, await this.finders.findActiveByCode(code));
      const finder = finderCache.get(code);
      if (!finder) continue;

      const clientTs = str(event.clientTs, 40);
      const skinLab = Array.isArray(event.skinLab) && event.skinLab.length === 3 ? event.skinLab : null;
      const recommended = Array.isArray(event.recommended)
        ? event.recommended.slice(0, 3).map((slot: Record<string, unknown>) => ({
            variantId: str(slot?.variantId, 40),
            sku: str(slot?.sku, 80),
            role: pick(slot?.role, ROLES),
          }))
        : null;
      const undertone = event.undertone === null ? 'unsure' : pick(event.undertone, UNDERTONES);

      rows.push({
        event_id: eventId,
        event_name: event.name,
        event_date: receivedAt.toISOString().slice(0, 10),
        finder_id: finder.id,
        finder_code: finder.code,
        finder_version: Number.isInteger(event.finderVersion) ? (event.finderVersion as number) : finder.version,
        visitor_id: visitorId,
        session_id: sessionId,
        channel: str(event.channel, 40),
        variant_id: str(event.variantId, 40),
        sku: str(event.sku, 80),
        role: pick(event.role, ROLES),
        button_id: str(event.buttonId, 30),
        url: str(event.url, 2000),
        undertone: event.name === 'undertone_select' || event.name === 'result_shown' ? undertone : null,
        feedback: pick(event.feedback, FEEDBACK),
        recommended: recommended ? JSON.stringify(recommended) : null,
        skin_l: skinLab ? finiteOrNull(skinLab[0]) : null,
        skin_a: skinLab ? finiteOrNull(skinLab[1]) : null,
        skin_b: skinLab ? finiteOrNull(skinLab[2]) : null,
        duration_ms: finiteOrNull(event.durationMs, 0),
        device,
        os,
        user_agent: userAgent.slice(0, 300),
        client_ts: clientTs && !Number.isNaN(Date.parse(clientTs)) ? clientTs : null,
        received_at: receivedAt.toISOString(),
      });
    }

    await this.repo.insert(rows);
    return { accepted: rows.length, dropped: events.length - rows.length };
  }
}
