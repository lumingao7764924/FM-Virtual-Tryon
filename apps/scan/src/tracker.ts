import { MAX_TRACK_BATCH, type TrackEvent, type TrackEventName, type TrackEventProps } from '@tryon/shared';

const ENDPOINT = '/api/public/events';
const FLUSH_DELAY_MS = 2000;
const VISITOR_KEY = 'fm_tryon_vid';
const SESSION_KEY = 'fm_tryon_sid';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function storedId(storage: Storage | undefined, key: string): string {
  try {
    const existing = storage?.getItem(key);
    if (existing) return existing;
    const id = randomId();
    storage?.setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

export interface Tracker {
  track(name: TrackEventName, props?: TrackEventProps): void;
  /** Send queued events now (e.g. before navigating away). */
  flush(): void;
}

export function createTracker(finderCode: string, finderVersion: number, channel: string): Tracker {
  const visitorId = storedId(globalThis.localStorage, VISITOR_KEY);
  const sessionId = storedId(globalThis.sessionStorage, SESSION_KEY);
  let queue: TrackEvent[] = [];
  let timer = 0;

  const send = (events: TrackEvent[]) => {
    const body = JSON.stringify({ events });
    if (import.meta.env.DEV) console.debug('[track]', events.map((event) => event.name).join(', '), events);
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return;
    fetch(ENDPOINT, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(
      () => {}
    );
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    while (queue.length) send(queue.splice(0, MAX_TRACK_BATCH));
  };

  const track = (name: TrackEventName, props: TrackEventProps = {}) => {
    queue.push({
      ...(channel ? { channel } : {}),
      ...props,
      eventId: randomId(),
      name,
      finderCode,
      finderVersion,
      visitorId,
      sessionId,
      clientTs: new Date().toISOString(),
    });
    if (queue.length >= MAX_TRACK_BATCH) flush();
    else if (!timer) timer = window.setTimeout(flush, FLUSH_DELAY_MS);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  return { track, flush };
}
