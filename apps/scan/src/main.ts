import './fm-makeup-pdp.css';
import './page.css';
import type { PublicFinder } from '@tryon/shared';
import { ShadeFinderApp } from './app';
import { demoFinder } from './mock';
import { createTracker } from './tracker';

const root = document.getElementById('app')!;

function showError(message: string) {
  const box = document.createElement('div');
  box.className = 'fm-page__error';
  box.textContent = message;
  root.replaceChildren(box);
}

async function loadFinder(code: string): Promise<PublicFinder | null> {
  try {
    const response = await fetch(`/api/public/finders/${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) return (await response.json()) as PublicFinder;
    if (response.status === 404 && code !== 'demo') return null;
  } catch {
    /* API not reachable — fall through to demo in dev */
  }
  if (import.meta.env.DEV && code === 'demo') return demoFinder();
  throw new Error('Finder unavailable');
}

async function boot() {
  const code = decodeURIComponent(window.location.pathname.match(/^\/s\/([^/]+)/)?.[1] || '');
  if (!code) {
    if (import.meta.env.DEV) {
      window.location.replace('/s/demo');
      return;
    }
    showError('Shade finder not found.');
    return;
  }

  let finder: PublicFinder | null;
  try {
    finder = await loadFinder(code);
  } catch {
    showError('Shade finder is temporarily unavailable. Please try again later.');
    return;
  }
  if (!finder) {
    showError('This shade finder is no longer available.');
    return;
  }

  const channel = new URLSearchParams(window.location.search).get('ch')?.trim().slice(0, 40) || '';
  const tracker = createTracker(finder.code, finder.version, channel);
  const app = new ShadeFinderApp(root, finder, tracker);
  if (import.meta.env.DEV) {
    // Console: fmDebug.capture(231, 196, 168)
    (window as unknown as Record<string, unknown>).fmDebug = {
      capture: (r: number, g: number, b: number) => app.debugCapture({ r, g, b }),
    };
  }
  app.start();
}

void boot();
