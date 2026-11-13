import { normalizeHex } from './color.js';
import type { FieldError, FinderSaveInput } from './admin.js';
import {
  createDefaultFinderSettings,
  type FinderLinkButton,
  type FinderSettings,
  type FinderStatus,
  type FinderVariant,
} from './finder.js';
import { DEPTH_STEP_MAX, DEPTH_STEP_MIN, type UndertoneSetting } from './match.js';

export const FINDER_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const BUTTON_ID_PATTERN = /^[a-z0-9_-]{1,30}$/;
export const MAX_VARIANTS = 200;
export const MAX_BUTTONS = 6;
export const NEAR_POOL_SIZE_RANGE = [1, 20] as const;
export const NEAR_MAX_EXTRA_DE_RANGE = [1, 40] as const;
export const FEEDBACK_DELAY_RANGE = [3, 5] as const;

export const FINDER_BRANDS = ['Skintific', 'TimePhoria', 'Glad2Glow', 'Facerinna', 'Glosspoppi'] as const;
export type FinderBrand = (typeof FINDER_BRANDS)[number];

/** Canonical brand name (case-insensitive match), or null when not in the list. */
export function normalizeBrand(value: unknown): FinderBrand | null {
  const key = String(value ?? '').trim().toLowerCase();
  return FINDER_BRANDS.find((brand) => brand.toLowerCase() === key) ?? null;
}

const UNDERTONE_SETTINGS: readonly UndertoneSetting[] = ['auto', 'cool', 'neutral', 'warm'];

export function slugifyCode(text: string): string {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function int(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function num(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Fill missing keys from defaults, clamp numbers, trim strings. */
export function normalizeFinderSettings(raw: unknown, errors: FieldError[] = []): FinderSettings {
  const defaults = createDefaultFinderSettings();
  const input = obj(raw);
  const matching = obj(input.matching);
  const undertone = obj(input.undertone);
  const feedback = obj(input.feedback);
  const privacy = obj(input.privacy);
  const labels = obj(input.labels);

  const color = (value: unknown, fallback: string, path: string) => {
    if (value == null || value === '') return fallback;
    const hex = normalizeHex(value);
    if (!hex) errors.push({ path, message: '颜色格式应为 #RRGGBB' });
    return hex || fallback;
  };

  const optionsInput = Array.isArray(undertone.options) ? undertone.options.map(obj) : [];
  const options = defaults.undertone.options.map((option, index) => {
    const found = optionsInput.find((item) => item.id === option.id) || {};
    return {
      id: option.id,
      label: text(found.label ?? option.label, 40) || option.label,
      description: text(found.description ?? option.description, 300),
      background: color(found.background, option.background, `settings.undertone.options.${index}.background`),
    };
  });

  const labelsOut = { ...defaults.labels };
  (Object.keys(labelsOut) as (keyof FinderSettings['labels'])[]).forEach((key) => {
    labelsOut[key] = text(labels[key] ?? defaults.labels[key], 120) || defaults.labels[key];
  });

  return {
    matching: {
      depthStep: int(matching.depthStep, [DEPTH_STEP_MIN, DEPTH_STEP_MAX], defaults.matching.depthStep),
      nearPoolSize: int(matching.nearPoolSize, NEAR_POOL_SIZE_RANGE, defaults.matching.nearPoolSize),
      nearMaxExtraDe: num(matching.nearMaxExtraDe, NEAR_MAX_EXTRA_DE_RANGE, defaults.matching.nearMaxExtraDe),
    },
    undertone: {
      enabled: bool(undertone.enabled, defaults.undertone.enabled),
      title: text(undertone.title ?? defaults.undertone.title, 120),
      nextLabel: text(undertone.nextLabel ?? defaults.undertone.nextLabel, 40) || defaults.undertone.nextLabel,
      unsureLabel: text(undertone.unsureLabel ?? defaults.undertone.unsureLabel, 40) || defaults.undertone.unsureLabel,
      options,
    },
    feedback: {
      enabled: bool(feedback.enabled, defaults.feedback.enabled),
      delaySeconds: int(feedback.delaySeconds, FEEDBACK_DELAY_RANGE, defaults.feedback.delaySeconds),
      title: text(feedback.title ?? defaults.feedback.title, 120),
      lighterLabel: text(feedback.lighterLabel ?? defaults.feedback.lighterLabel, 40) || defaults.feedback.lighterLabel,
      justRightLabel:
        text(feedback.justRightLabel ?? defaults.feedback.justRightLabel, 40) || defaults.feedback.justRightLabel,
      deeperLabel: text(feedback.deeperLabel ?? defaults.feedback.deeperLabel, 40) || defaults.feedback.deeperLabel,
    },
    privacy: {
      note: text(privacy.note ?? defaults.privacy.note, 2000),
      confirmLabel: text(privacy.confirmLabel ?? defaults.privacy.confirmLabel, 40) || defaults.privacy.confirmLabel,
    },
    labels: labelsOut,
  };
}

function normalizeButtons(raw: unknown, errors: FieldError[]): FinderLinkButton[] {
  const list = Array.isArray(raw) ? raw.map(obj) : [];
  if (list.length > MAX_BUTTONS) errors.push({ path: 'buttons', message: `最多 ${MAX_BUTTONS} 个跳转按钮` });
  const seen = new Set<string>();
  return list.slice(0, MAX_BUTTONS).map((item, index) => {
    const id = text(item.id, 30).toLowerCase();
    if (!BUTTON_ID_PATTERN.test(id)) {
      errors.push({ path: `buttons.${index}.id`, message: '按钮 ID 只能用小写字母、数字、-、_' });
    } else if (seen.has(id)) {
      errors.push({ path: `buttons.${index}.id`, message: '按钮 ID 重复' });
    }
    seen.add(id);
    const label = text(item.label, 40);
    if (!label) errors.push({ path: `buttons.${index}.label`, message: '请填写按钮文字' });
    const url = text(item.url, 2000);
    if (url && !isHttpUrl(url)) errors.push({ path: `buttons.${index}.url`, message: '链接需以 http:// 或 https:// 开头' });
    return {
      id,
      label,
      url,
      style: item.style === 'secondary' ? 'secondary' : 'primary',
      enabled: bool(item.enabled, true),
    };
  });
}

function normalizeVariants(raw: unknown, buttonIds: Set<string>, errors: FieldError[]): FinderVariant[] {
  const list = Array.isArray(raw) ? raw.map(obj) : [];
  if (list.length > MAX_VARIANTS) errors.push({ path: 'variants', message: `最多 ${MAX_VARIANTS} 个变体` });
  const seenIds = new Set<string>();
  const seenSkus = new Map<string, number>();
  return list.slice(0, MAX_VARIANTS).map((item, index) => {
    const id = text(item.id, 40);
    if (!id) errors.push({ path: `variants.${index}.id`, message: '缺少变体 ID' });
    else if (seenIds.has(id)) errors.push({ path: `variants.${index}.id`, message: '变体 ID 重复' });
    seenIds.add(id);

    const name = text(item.name, 80);
    if (!name) errors.push({ path: `variants.${index}.name`, message: '请填写变体名称' });

    const sku = text(item.sku, 80);
    if (sku) {
      const key = sku.toLowerCase();
      if (seenSkus.has(key)) errors.push({ path: `variants.${index}.sku`, message: `SKU 与第 ${seenSkus.get(key)! + 1} 行重复` });
      else seenSkus.set(key, index);
    }

    const hex = normalizeHex(item.hex);
    if (!hex) errors.push({ path: `variants.${index}.hex`, message: '色值格式应为 #RRGGBB' });

    const undertone = UNDERTONE_SETTINGS.includes(item.undertone as UndertoneSetting)
      ? (item.undertone as UndertoneSetting)
      : 'auto';

    const links: Record<string, string> = {};
    Object.entries(obj(item.links)).forEach(([buttonId, value]) => {
      const url = text(value, 2000);
      if (!url || !buttonIds.has(buttonId)) return;
      if (!isHttpUrl(url)) {
        errors.push({ path: `variants.${index}.links.${buttonId}`, message: '链接需以 http:// 或 https:// 开头' });
        return;
      }
      links[buttonId] = url;
    });

    const iconUrl = text(item.iconUrl, 2000);
    return {
      id,
      name,
      sku,
      hex: hex || String(item.hex ?? ''),
      undertone,
      enabled: bool(item.enabled, true),
      ...(iconUrl ? { iconUrl } : {}),
      links,
    };
  });
}

/** Normalize an editor save body; `errors` empty means it can be persisted. */
export function normalizeFinderSave(raw: unknown): { value: FinderSaveInput; errors: FieldError[] } {
  const input = obj(raw);
  const errors: FieldError[] = [];

  const code = text(input.code, 40).toLowerCase();
  if (!FINDER_CODE_PATTERN.test(code)) {
    errors.push({ path: 'code', message: '链接编码需 3–40 位，小写字母 / 数字 / -，且不能以 - 开头或结尾' });
  }
  const title = text(input.title, 120);
  if (!title) errors.push({ path: 'title', message: '请填写产品名称' });
  const brand = normalizeBrand(input.brand);
  if (!brand) errors.push({ path: 'brand', message: '请选择品牌' });
  const status: FinderStatus = input.status === 'active' ? 'active' : 'disabled';

  const buttons = normalizeButtons(input.buttons, errors);
  const variants = normalizeVariants(input.variants, new Set(buttons.map((button) => button.id)), errors);
  if (status === 'active' && !variants.some((variant) => variant.enabled && normalizeHex(variant.hex))) {
    errors.push({ path: 'variants', message: '启用前至少需要 1 个启用中的变体' });
  }

  const version = Number(input.version);
  if (!Number.isInteger(version) || version < 0) errors.push({ path: 'version', message: '缺少版本号' });

  return {
    value: {
      code,
      title,
      brand: brand ?? '',
      notes: text(input.notes, 1000),
      status,
      variants,
      buttons,
      settings: normalizeFinderSettings(input.settings, errors),
      version: Number.isInteger(version) ? version : 0,
    },
    errors,
  };
}
