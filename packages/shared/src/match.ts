import { classifyUndertone, deltaE00, hexToLab, normalizeHex, type Lab, type Undertone } from './color.js';

export const DEPTH_STEP_MIN = -10;
export const DEPTH_STEP_MAX = 10;
export const DEFAULT_NEAR_POOL_SIZE = 7;
export const DEFAULT_NEAR_MAX_EXTRA_DE = 10;

export type UndertoneSetting = Undertone | 'auto';

/** Minimal variant shape the matcher needs; admin/scan variants extend it. */
export interface MatchableVariant {
  id: string;
  hex: string;
  /** Explicit tone wins; 'auto' / empty falls back to hex Lab classification. */
  undertone?: UndertoneSetting | null;
  enabled?: boolean;
}

export interface MatchOptions {
  /** -10 (deeper) … +10 (lighter); each step ≈ 0.4 L. */
  depthStep?: number;
  nearPoolSize?: number;
  nearMaxExtraDe?: number;
}

export interface ScoredShade<V extends MatchableVariant = MatchableVariant> {
  variant: V;
  hex: string;
  de: number;
  shadeLab: Lab;
  undertone: Undertone;
}

export type ShadeRole = 'lighter' | 'best' | 'deeper';

export interface RecommendedShade<V extends MatchableVariant = MatchableVariant> extends ScoredShade<V> {
  role: ShadeRole;
}

export type UndertonePreference = Undertone | null | undefined;

export function clampDepthStep(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(DEPTH_STEP_MIN, Math.min(DEPTH_STEP_MAX, Math.round(number)));
}

export function shadeMatchScore(skinLab: Lab, shadeLab: Lab, depthStep = 0): number {
  // depthStep -10..+10: soft product dial (deeper ← 0 → lighter), not raw score +1.
  const step = clampDepthStep(depthStep);
  // ~0.4 L per step → ±10 ≈ ±4 L.
  const lift = 6 + step * 0.4;
  const targetL = Math.min(100, Math.max(0, skinLab[0] + lift));
  const hue = deltaE00([targetL, skinLab[1], skinLab[2]], [targetL, shadeLab[1], shadeLab[2]]);
  const depthGap = shadeLab[0] - targetL;
  // +step (lighter): punish deep more / light less. -step (deeper): opposite.
  const darkerWeight = Math.max(0.55, Math.min(1.25, 0.95 + step * 0.02));
  const lighterWeight = Math.max(0.25, Math.min(0.8, 0.5 - step * 0.015));
  const depthPenalty =
    depthGap < 0 ? Math.abs(depthGap) * darkerWeight : Math.abs(depthGap) * lighterWeight;
  return hue * 0.45 + depthPenalty;
}

export function resolveVariantUndertone(variant: MatchableVariant, shadeLab: Lab): Undertone {
  const explicit = variant.undertone;
  if (explicit === 'cool' || explicit === 'neutral' || explicit === 'warm') return explicit;
  return classifyUndertone(shadeLab);
}

export function scoreCatalog<V extends MatchableVariant>(
  variants: readonly V[],
  skinLab: Lab,
  options: MatchOptions = {}
): ScoredShade<V>[] {
  const scored: ScoredShade<V>[] = [];
  (variants || []).forEach((variant) => {
    if (variant.enabled === false) return;
    const hex = normalizeHex(variant.hex);
    if (!hex) return;
    const shadeLab = hexToLab(hex);
    scored.push({
      variant,
      hex,
      de: shadeMatchScore(skinLab, shadeLab, options.depthStep ?? 0),
      shadeLab,
      undertone: resolveVariantUndertone(variant, shadeLab),
    });
  });
  scored.sort((left, right) => left.de - right.de);
  return scored;
}

export function buildNearPool<V extends MatchableVariant>(
  scored: ScoredShade<V>[],
  options: MatchOptions = {}
): ScoredShade<V>[] {
  if (!scored?.length) return [];
  const size = options.nearPoolSize ?? DEFAULT_NEAR_POOL_SIZE;
  const maxExtra = options.nearMaxExtraDe ?? DEFAULT_NEAR_MAX_EXTRA_DE;
  const bestDe = scored[0].de;
  return scored.filter((item) => item.de <= bestDe + maxExtra).slice(0, size);
}

function lightnessOf(item: ScoredShade | undefined): number {
  return item?.shadeLab?.[0] ?? 0;
}

function closestOnSide<V extends MatchableVariant>(
  anchor: ScoredShade<V>,
  candidates: ScoredShade<V>[],
  side: 'lighter' | 'deeper'
): ScoredShade<V> | null {
  const anchorL = lightnessOf(anchor);
  const pool = (candidates || []).filter((item) => {
    const lightness = lightnessOf(item);
    return side === 'lighter' ? lightness > anchorL : lightness < anchorL;
  });
  pool.sort((left, right) => {
    const gapLeft = Math.abs(lightnessOf(left) - anchorL);
    const gapRight = Math.abs(lightnessOf(right) - anchorL);
    if (gapLeft !== gapRight) return gapLeft - gapRight;
    return left.de - right.de;
  });
  return pool[0] || null;
}

function isPreference(value: UndertonePreference): value is Undertone {
  return value === 'cool' || value === 'warm' || value === 'neutral';
}

// From the near pool: prefer selected undertone, then fill missing lighter/deeper only inside the pool.
export function pickRecommendationCandidates<V extends MatchableVariant>(
  near: ScoredShade<V>[],
  preference: UndertonePreference
): ScoredShade<V>[] {
  if (!near?.length) return [];

  let preferred = isPreference(preference) ? near.filter((item) => item.undertone === preference) : near.slice();
  // No shades in that undertone → fall back to the near pool (still no far padding).
  if (!preferred.length) preferred = near.slice();

  const selected = preferred.slice(0, 3);
  if (selected.length >= 3) return selected;

  const anchor = selected[0];
  const selectedIds = new Set(selected.map((item) => item.variant.id));
  let remaining = near.filter((item) => !selectedIds.has(item.variant.id));
  const anchorL = lightnessOf(anchor);
  const hasLighter = selected.some((item) => lightnessOf(item) > anchorL);
  const hasDeeper = selected.some((item) => lightnessOf(item) < anchorL);

  if (!hasLighter && selected.length < 3) {
    const pick = closestOnSide(anchor, remaining, 'lighter');
    if (pick) {
      selected.push(pick);
      remaining = remaining.filter((item) => item.variant.id !== pick.variant.id);
    }
  }
  if (!hasDeeper && selected.length < 3) {
    const pick = closestOnSide(anchor, remaining, 'deeper');
    if (pick) selected.push(pick);
  }
  return selected;
}

export function rankVariants<V extends MatchableVariant>(
  variants: readonly V[],
  skinLab: Lab,
  limit?: number,
  preference?: UndertonePreference,
  options: MatchOptions = {}
): ScoredShade<V>[] {
  const max = Math.max(1, limit || (options.nearPoolSize ?? DEFAULT_NEAR_POOL_SIZE));
  const near = buildNearPool(scoreCatalog(variants, skinLab, options), options);
  if (!near.length) return [];
  if (isPreference(preference)) {
    return pickRecommendationCandidates(near, preference).slice(0, max);
  }
  return near.slice(0, max);
}

// 1 → Best; 2 → score-best + lighter/deeper; 3 → sort by L as Lighter | Best | Deeper.
export function arrangeShadeRoles<V extends MatchableVariant>(items: ScoredShade<V>[]): RecommendedShade<V>[] {
  if (!items?.length) return [];
  if (items.length === 1) return [{ ...items[0], role: 'best' }];

  if (items.length === 2) {
    const byScore = [...items].sort((left, right) => left.de - right.de);
    const best = byScore[0];
    const other = byScore[1];
    if (lightnessOf(other) > lightnessOf(best)) {
      return [
        { ...other, role: 'lighter' },
        { ...best, role: 'best' },
      ];
    }
    return [
      { ...best, role: 'best' },
      { ...other, role: 'deeper' },
    ];
  }

  const byLightness = [...items].sort((left, right) => lightnessOf(left) - lightnessOf(right));
  const deeper = byLightness[0];
  const best = byLightness[1];
  const lighter = byLightness[byLightness.length - 1];
  return [
    { ...lighter, role: 'lighter' },
    { ...best, role: 'best' },
    { ...deeper, role: 'deeper' },
  ];
}

export function recommendShades<V extends MatchableVariant>(
  variants: readonly V[],
  skinLab: Lab,
  preference?: UndertonePreference,
  options: MatchOptions = {}
): RecommendedShade<V>[] {
  const near = buildNearPool(scoreCatalog(variants, skinLab, options), options);
  return arrangeShadeRoles(pickRecommendationCandidates(near, preference));
}
