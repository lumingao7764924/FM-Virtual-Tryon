import { createDefaultFinderSettings, type PublicFinder } from '@tryon/shared';

const SHADES: [string, string, string, PublicFinder['variants'][number]['undertone']][] = [
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

/** Local demo config for `/s/demo` until the API serves real finders. */
export function demoFinder(): PublicFinder {
  const settings = createDefaultFinderSettings();
  settings.undertone.enabled = true;
  settings.feedback.enabled = true;
  settings.privacy.note =
    'We use your camera only to estimate your skin tone on this device.\nNo photo or video leaves your phone.';
  return {
    code: 'demo',
    title: 'Demo Cushion Foundation',
    brand: 'Skintific',
    version: 1,
    variants: SHADES.map(([name, sku, hex, undertone], index) => ({
      id: `v${index + 1}`,
      name,
      sku,
      hex,
      undertone,
      links: (index === 0 ? { amazon: 'https://www.amazon.com/s?k=skintific+porcelain' } : {}) as Record<string, string>,
    })),
    buttons: [
      { id: 'amazon', label: 'BUY ON AMAZON', url: 'https://www.amazon.com/s?k=skintific', style: 'primary' },
      { id: 'tiktok', label: 'BUY ON TIKTOK SHOP', url: 'https://www.tiktok.com/@skintific', style: 'secondary' },
    ],
    settings,
  };
}
