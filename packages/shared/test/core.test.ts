import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  arrangeShadeRoles,
  averageTrimmedRgb,
  buildNearPool,
  clampDepthStep,
  classifyUndertone,
  deltaE00,
  faceChecks,
  hexToLab,
  normalizeHex,
  normalizeUndertoneLabel,
  rankVariants,
  recommendShades,
  resolveVariantLinks,
  resolveVariantUndertone,
  rgbToLab,
  scoreCatalog,
  shadeMatchScore,
  type Landmark,
  type Lab,
  type MatchableVariant,
  type ScoredShade,
} from '../src/index.js';

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) <= 0.001, `${label}: expected ${expected}, got ${actual}`);
}

const v = (id: string, hex: string, extra: Partial<MatchableVariant> = {}): MatchableVariant => ({ id, hex, ...extra });

test('deltaE00 reference pairs', () => {
  const pairs: [Lab, Lab, number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
  ];
  pairs.forEach(([a, b, expected], index) => assertClose(deltaE00(a, b), expected, `pair ${index + 1}`));
  assert.equal(deltaE00([50, 0, 0], [50, 0, 0]), 0);
});

test('rgbToLab endpoints and hex normalization', () => {
  assertClose(rgbToLab(255, 255, 255)[0], 100, 'white L');
  assertClose(rgbToLab(0, 0, 0)[0], 0, 'black L');
  assert.equal(normalizeHex('abc'), '#AABBCC');
  assert.equal(normalizeHex(' #c47b7b '), '#C47B7B');
  assert.equal(normalizeHex('#12345'), null);
});

test('ranking excludes disabled and far shades', () => {
  const skin = rgbToLab(231, 196, 168);
  const ranked = rankVariants(
    [v('1', '#E7C4A8'), v('2', '#5A3826'), v('4', '#E7C4A8', { enabled: false })],
    skin,
    3
  );
  assert.ok(!ranked.some((item) => item.variant.id === '4'), 'disabled variant excluded');
  assert.equal(ranked[0].variant.id, '1');
  assert.ok(!ranked.some((item) => item.variant.id === '2'), 'far deep shade not padded in');
});

test('slightly lighter shade ranks ahead of darker', () => {
  const lightness = rankVariants([v('11', '#9B694F'), v('12', '#D2A888')], rgbToLab(180, 130, 105), 2);
  assert.equal(lightness[0].variant.id, '12');
  const nearTie = rankVariants([v('21', '#A06A4E'), v('22', '#E0B89A')], rgbToLab(200, 155, 125), 2);
  assert.equal(nearTie[0].variant.id, '22');
});

test('undertone classification and explicit override', () => {
  assert.equal(classifyUndertone(rgbToLab(230, 180, 190)), 'cool');
  assert.equal(classifyUndertone(rgbToLab(220, 180, 120)), 'warm');
  assert.equal(normalizeUndertoneLabel(' COOL '), 'cool');
  assert.equal(normalizeUndertoneLabel('暖'), 'warm');
  const warmLab = hexToLab('#F5E2C2');
  assert.equal(resolveVariantUndertone(v('a', '#F5E2C2', { undertone: 'cool' }), warmLab), 'cool');
  assert.equal(resolveVariantUndertone(v('a', '#F5E2C2', { undertone: 'auto' }), warmLab), classifyUndertone(warmLab));
  assert.equal(resolveVariantUndertone(v('a', '#F5E2C2'), warmLab), classifyUndertone(warmLab));
});

test('depth step clamps and shifts preference', () => {
  assert.equal(clampDepthStep(100), 10);
  assert.equal(clampDepthStep(-99), -10);
  assert.equal(clampDepthStep('abc'), 0);
  const skin = rgbToLab(200, 155, 125);
  const light = hexToLab('#E0B89A');
  const deep = hexToLab('#A06A4E');
  const gap = (step: number) => shadeMatchScore(skin, light, step) - shadeMatchScore(skin, deep, step);
  assert.ok(gap(10) < gap(0) && gap(-10) > gap(0));
});

test('undertone preference stays inside near pool', () => {
  const catalog = [
    v('31', '#E8B0B8'),
    v('32', '#E2A8B0'),
    v('33', '#C4A060'),
    v('34', '#B89555'),
    v('35', '#D2B8A0'),
  ];
  const skin = rgbToLab(210, 170, 150);
  const coolRec = recommendShades(catalog, skin, 'cool');
  assert.ok(coolRec.length > 0 && coolRec.length <= 3);
  const lighter = coolRec.find((item) => item.role === 'lighter');
  const best = coolRec.find((item) => item.role === 'best');
  if (lighter && best) assert.ok(lighter.shadeLab[0] >= best.shadeLab[0]);

  const onlyWarm = recommendShades([v('41', '#C4A060'), v('42', '#B89555')], skin, 'cool');
  assert.ok(onlyWarm.length > 0 && onlyWarm.length <= 2);
});

test('far espresso never enters fair-skin pool', () => {
  const catalog = [v('51', '#F9DEC9'), v('52', '#F8D3B9'), v('53', '#76554C')];
  const fair = rgbToLab(231, 196, 168);
  assert.ok(!buildNearPool(scoreCatalog(catalog, fair)).some((item) => item.variant.id === '53'));
  const neutral = recommendShades(catalog, fair, 'neutral');
  assert.ok(!neutral.some((item) => item.variant.id === '53'));
  assert.ok(neutral.length <= 2);
});

test('near pool options are configurable', () => {
  const catalog = [v('1', '#F9DEC9'), v('2', '#F8D3B9'), v('3', '#E7C4A8'), v('4', '#D2A888')];
  const fair = rgbToLab(231, 196, 168);
  assert.equal(buildNearPool(scoreCatalog(catalog, fair), { nearPoolSize: 2 }).length, 2);
  assert.equal(buildNearPool(scoreCatalog(catalog, fair), { nearMaxExtraDe: 0 }).length, 1);
});

test('role arrangement', () => {
  const item = (id: string, lab: Lab, de: number) => ({ variant: v(id, '#000000'), hex: '#000000', shadeLab: lab, de, undertone: 'neutral' }) as ScoredShade;
  const trio = arrangeShadeRoles([item('1', [60, 10, 10], 1), item('2', [70, 8, 8], 2), item('3', [50, 12, 12], 3)]);
  assert.deepEqual(trio.map((x) => x.role), ['lighter', 'best', 'deeper']);
  assert.deepEqual(trio.map((x) => x.variant.id), ['2', '1', '3']);
  const two = arrangeShadeRoles([item('1', [60, 10, 10], 1), item('2', [55, 8, 8], 2)]);
  assert.deepEqual(two.map((x) => x.role), ['best', 'deeper']);
});

test('trimmed average', () => {
  const trimmed = averageTrimmedRgb(
    [[0, 0, 0], [0, 0, 0], [100, 150, 200], [100, 150, 200], [100, 150, 200], [100, 150, 200], [255, 255, 255], [255, 255, 255]],
    0.25
  );
  assert.deepEqual(trimmed, { r: 100, g: 150, b: 200 });
});

test('face gates', () => {
  const marks = (overrides: Record<number, Landmark>) => {
    const list: Landmark[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
    Object.entries(overrides).forEach(([index, point]) => (list[Number(index)] = point));
    return list;
  };
  const frontal = marks({ 234: { x: 0.26, y: 0.5 }, 454: { x: 0.74, y: 0.5 }, 1: { x: 0.5, y: 0.52 }, 10: { x: 0.5, y: 0.24 }, 152: { x: 0.5, y: 0.8 }, 33: { x: 0.38, y: 0.4 }, 263: { x: 0.62, y: 0.4 } });
  assert.deepEqual(faceChecks(frontal), { position: true, straight: true });
  const turned = marks({ 234: { x: 0.26, y: 0.5 }, 454: { x: 0.74, y: 0.5 }, 1: { x: 0.66, y: 0.52 }, 10: { x: 0.5, y: 0.24 }, 152: { x: 0.5, y: 0.8 }, 33: { x: 0.38, y: 0.4 }, 263: { x: 0.62, y: 0.4 } });
  assert.equal(faceChecks(turned).straight, false);
  const distant = marks({ 234: { x: 0.46, y: 0.5 }, 454: { x: 0.54, y: 0.5 }, 1: { x: 0.5, y: 0.52 }, 10: { x: 0.5, y: 0.46 }, 152: { x: 0.5, y: 0.56 }, 33: { x: 0.48, y: 0.48 }, 263: { x: 0.52, y: 0.48 } });
  assert.equal(faceChecks(distant).position, false);
  const second = marks({ 234: { x: 0.06, y: 0.5 }, 454: { x: 0.34, y: 0.5 }, 1: { x: 0.2, y: 0.52 }, 10: { x: 0.2, y: 0.28 }, 152: { x: 0.2, y: 0.76 }, 33: { x: 0.14, y: 0.42 }, 263: { x: 0.26, y: 0.42 } });
  assert.equal(faceChecks(frontal, [second]).position, false);
  const tilted = marks({ 234: { x: 0.28, y: 0.4 }, 454: { x: 0.72, y: 0.58 }, 1: { x: 0.5, y: 0.52 }, 10: { x: 0.5, y: 0.24 }, 152: { x: 0.5, y: 0.8 }, 33: { x: 0.38, y: 0.34 }, 263: { x: 0.62, y: 0.5 } });
  assert.equal(faceChecks(tilted).straight, false);
});

test('variant links override button defaults', () => {
  const buttons = [
    { id: 'amz', label: 'Amazon', url: 'https://amazon.com/dp/DEFAULT', style: 'primary' as const, enabled: true },
    { id: 'tt', label: 'TikTok', url: '', style: 'secondary' as const, enabled: true },
    { id: 'off', label: 'Off', url: 'https://x.com', style: 'secondary' as const, enabled: false },
  ];
  assert.deepEqual(
    resolveVariantLinks(buttons, { links: { tt: 'https://shop.tiktok.com/p/1' } }).map((l) => [l.buttonId, l.url]),
    [
      ['amz', 'https://amazon.com/dp/DEFAULT'],
      ['tt', 'https://shop.tiktok.com/p/1'],
    ]
  );
  assert.deepEqual(resolveVariantLinks(buttons, { links: {} }).map((l) => l.buttonId), ['amz']);
});
