import { createDefaultFinderSettings, type Finder } from '@tryon/shared';
import type { FinderRepo } from './store/types.js';

const SHADES: [string, string, string, Finder['variants'][number]['undertone']][] = [
  ['01 Porcelain', 'DEMO-01C', '#F6DCC8', 'cool'],
  ['02 Ivory', 'DEMO-02N', '#F3D3BA', 'neutral'],
  ['03 Vanilla', 'DEMO-03W', '#F0CDA6', 'warm'],
  ['04 Light Beige', 'DEMO-04N', '#E8C2A2', 'auto'],
  ['05 Natural', 'DEMO-05W', '#DDB28B', 'auto'],
  ['06 Sand', 'DEMO-06N', '#D3A783', 'auto'],
  ['07 Honey', 'DEMO-07W', '#C99568', 'warm'],
  ['08 Tan', 'DEMO-08N', '#B88160', 'auto'],
  ['09 Caramel', 'DEMO-09W', '#A56E48', 'auto'],
  ['10 Mocha', 'DEMO-10C', '#8C5A42', 'cool'],
  ['11 Espresso', 'DEMO-11N', '#6E4533', 'auto'],
];

/** Local dry-run only: give an empty store one active demo finder at /s/demo. */
export async function seedDemoFinder(repo: FinderRepo): Promise<boolean> {
  if ((await repo.listLatest()).length) return false;
  const settings = createDefaultFinderSettings();
  settings.undertone.enabled = true;
  settings.feedback.enabled = true;
  settings.privacy.note =
    'We use your camera only to estimate your skin tone on this device.\nNo photo or video leaves your phone.';
  const now = new Date().toISOString();
  await repo.append({
    id: 'fd_demo',
    code: 'demo',
    title: 'Demo Cushion Foundation',
    brand: 'Skintific',
    notes: '本地演示数据',
    status: 'active',
    variants: SHADES.map(([name, sku, hex, undertone], index) => ({
      id: `v${index + 1}`,
      name,
      sku,
      hex,
      undertone,
      enabled: true,
      links: (index === 0 ? { amazon: 'https://www.amazon.com/s?k=skintific+porcelain' } : {}) as Record<string, string>,
    })),
    buttons: [
      { id: 'amazon', label: 'BUY ON AMAZON', url: 'https://www.amazon.com/s?k=skintific', style: 'primary', enabled: true },
      { id: 'tiktok', label: 'BUY ON TIKTOK SHOP', url: 'https://www.tiktok.com/@skintific', style: 'secondary', enabled: true },
    ],
    settings,
    version: 1,
    createdAt: now,
    createdBy: 'seed',
    updatedAt: now,
    updatedBy: 'seed',
  });
  return true;
}
