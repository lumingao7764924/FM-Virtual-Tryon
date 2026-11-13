/**
 * Randomized parity against the Shopify theme-extension source (fixtures/fm-makeup-routine.shopify.js).
 * Shopify keys shades/tones by SKU text maps; here every variant carries hex + undertone directly.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  faceChecks,
  lightingOk,
  recommendShades,
  rgbToLab,
  skinFromLandmarks,
  type Landmark,
  type MatchableVariant,
  type Undertone,
  type UndertoneSetting,
} from '../src/index.js';

const source = readFileSync(new URL('./fixtures/fm-makeup-routine.shopify.js', import.meta.url), 'utf8');
const context: Record<string, any> = { console, HTMLElement: class {}, window: {} };
vm.createContext(context);
// Expose private helpers for comparison only.
vm.runInContext(
  source.replace('globalThis.FmMakeupRoutineCore = {', 'globalThis.FmMakeupRoutineCore = { skinFromLandmarks,'),
  context
);
const shopifyRaw = context.FmMakeupRoutineCore;
// vm-realm arrays/objects fail deepStrictEqual on prototype; normalize through JSON.
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const shopify = Object.fromEntries(
  Object.entries(shopifyRaw).map(([name, fn]) => [name, (...args: unknown[]) => plain((fn as Function)(...args))])
) as Record<string, (...args: any[]) => any>;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TONES: UndertoneSetting[] = ['auto', 'auto', 'cool', 'neutral', 'warm'];
const PREFS: (Undertone | null)[] = [null, 'cool', 'neutral', 'warm'];

test('recommendShades matches Shopify for random catalogs', () => {
  const rand = rng(20261113);
  const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const hex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
  let nonEmpty = 0;

  for (let trial = 0; trial < 3000; trial += 1) {
    const count = int(1, 16);
    const variants: MatchableVariant[] = [];
    for (let i = 0; i < count; i += 1) {
      const base = int(60, 250);
      variants.push({
        id: `v${i}`,
        hex: hex(base + int(-10, 20), base - int(10, 60), base - int(25, 100)),
        undertone: TONES[int(0, TONES.length - 1)],
        enabled: rand() > 0.1,
      });
    }
    const skinBase = int(70, 245);
    const skinLab = rgbToLab(skinBase, skinBase - int(15, 55), skinBase - int(30, 90));
    const preference = PREFS[int(0, PREFS.length - 1)];
    const depthStep = int(-10, 10);

    const ours = recommendShades(variants, skinLab, preference, { depthStep });

    const product = {
      variants: variants.map((variant) => ({
        id: variant.id,
        sku: `SKU-${variant.id}`,
        title: variant.id,
        available: variant.enabled !== false,
      })),
    };
    const shadeMap = new Map(variants.map((variant) => [`sku-${variant.id}`, variant.hex.toUpperCase()]));
    const toneMap = new Map(
      variants
        .filter((variant) => variant.undertone && variant.undertone !== 'auto')
        .map((variant) => [`sku-${variant.id}`, variant.undertone])
    );
    const theirs = shopify.recommendShades(product, skinLab, shadeMap, preference, toneMap, depthStep);

    const roleOf = (role: string) => (role === 'cooler' ? 'lighter' : role);
    assert.deepEqual(
      ours.map((item) => [item.variant.id, item.role, item.undertone]),
      theirs.map((item: any) => [item.variant.id, roleOf(item.role), item.undertone]),
      `trial ${trial}`
    );
    ours.forEach((item, index) => assert.equal(item.de, theirs[index].de, `trial ${trial} de`));
    if (ours.length) nonEmpty += 1;
  }
  assert.ok(nonEmpty > 2500, `expected most trials to produce results, got ${nonEmpty}`);
});

test('face gates + skin sampling match Shopify on random frames', () => {
  const rand = rng(7);
  const width = 64;
  const height = 48;
  for (let trial = 0; trial < 300; trial += 1) {
    const data = new Uint8ClampedArray(width * height * 4);
    const tone = 40 + Math.floor(rand() * 200);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, tone + Math.floor(rand() * 40));
      data[i + 1] = Math.max(0, tone - 30 + Math.floor(rand() * 40));
      data[i + 2] = Math.max(0, tone - 60 + Math.floor(rand() * 40));
      data[i + 3] = 255;
    }
    const pixels = { width, height, data };
    const fakeCanvas = { width, height, getContext: () => ({ getImageData: () => ({ data }) }) };

    const cx = 0.3 + rand() * 0.4;
    const cy = 0.3 + rand() * 0.4;
    const half = 0.1 + rand() * 0.35;
    const landmarks: Landmark[] = Array.from({ length: 468 }, () => ({
      x: cx + (rand() - 0.5) * half * 2,
      y: cy + (rand() - 0.5) * half * 2,
    }));
    landmarks[234] = { x: cx - half, y: cy + (rand() - 0.5) * 0.1 };
    landmarks[454] = { x: cx + half, y: cy + (rand() - 0.5) * 0.1 };
    landmarks[10] = { x: cx, y: cy - half * 1.1 };
    landmarks[152] = { x: cx, y: cy + half * 1.1 };
    landmarks[1] = { x: cx + (rand() - 0.5) * 0.2, y: cy + (rand() - 0.3) * 0.2 };

    assert.deepEqual(faceChecks(landmarks), { ...shopify.faceChecks(landmarks) }, `faceChecks ${trial}`);
    assert.equal(lightingOk(pixels, landmarks), shopify.lightingOk(fakeCanvas, landmarks), `lightingOk ${trial}`);

    assert.deepEqual(
      skinFromLandmarks(pixels, landmarks),
      { ...shopify.skinFromLandmarks(fakeCanvas, landmarks) },
      `skinFromLandmarks ${trial}`
    );
  }
});
