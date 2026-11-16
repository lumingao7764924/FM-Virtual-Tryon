import type { Undertone } from './color.js';
import {
  DEFAULT_NEAR_MAX_EXTRA_DE,
  DEFAULT_NEAR_POOL_SIZE,
  type MatchableVariant,
  type UndertoneSetting,
} from './match.js';

export type FinderStatus = 'active' | 'disabled';

export interface FinderLinkButton {
  id: string;
  label: string;
  /** Default target; a variant may override it via `FinderVariant.links[button.id]`. */
  url: string;
  style: 'primary' | 'secondary';
  enabled: boolean;
}

export interface FinderVariant extends MatchableVariant {
  id: string;
  name: string;
  sku: string;
  hex: string;
  undertone: UndertoneSetting;
  enabled: boolean;
  /** Reserved; icon upload is not offered yet. */
  iconUrl?: string | null;
  /** buttonId → URL override for this shade. */
  links: Record<string, string>;
}

export interface FinderUndertoneOption {
  id: Undertone;
  label: string;
  description: string;
  background: string;
}

export interface FinderSettings {
  matching: {
    depthStep: number;
    nearPoolSize: number;
    nearMaxExtraDe: number;
  };
  undertone: {
    enabled: boolean;
    title: string;
    nextLabel: string;
    unsureLabel: string;
    options: FinderUndertoneOption[];
  };
  feedback: {
    enabled: boolean;
    delaySeconds: number;
    title: string;
    lighterLabel: string;
    justRightLabel: string;
    deeperLabel: string;
  };
  privacy: {
    /** Plain text; blank hides the consent step. */
    note: string;
    confirmLabel: string;
  };
  labels: {
    holdHint: string;
    scanAgain: string;
    detecting: string;
    manualPick: string;
    skinReady: string;
    cameraDenied: string;
    moveFace: string;
    holdChecks: string;
    holdStill: string;
    emptyColumn: string;
    matchBest: string;
    matchLighter: string;
    matchDeeper: string;
    gateLighting: string;
    gateStraight: string;
    gatePosition: string;
  };
}

export interface Finder {
  id: string;
  /** Public slug used in the scan URL `/s/{code}`. */
  code: string;
  title: string;
  brand: string;
  notes: string;
  status: FinderStatus;
  variants: FinderVariant[];
  buttons: FinderLinkButton[];
  settings: FinderSettings;
  version: number;
  updatedAt: string;
  updatedBy: string;
  createdAt: string;
  createdBy: string;
  /** 创建人删除后不再出现在列表和扫码页。 */
  deleted?: boolean;
}

/** What the public scan page receives (no admin-only fields). */
export interface PublicFinder {
  code: string;
  title: string;
  brand: string;
  version: number;
  variants: Omit<FinderVariant, 'enabled'>[];
  buttons: Omit<FinderLinkButton, 'enabled'>[];
  settings: FinderSettings;
}

export function createDefaultFinderSettings(): FinderSettings {
  return {
    matching: {
      depthStep: 0,
      nearPoolSize: DEFAULT_NEAR_POOL_SIZE,
      nearMaxExtraDe: DEFAULT_NEAR_MAX_EXTRA_DE,
    },
    undertone: {
      enabled: false,
      title: 'What is your undertone?',
      nextLabel: 'NEXT',
      unsureLabel: "I'M NOT SURE",
      options: [
        { id: 'cool', label: 'COOL', description: '', background: '#FED0B9' },
        { id: 'neutral', label: 'NEUTRAL', description: '', background: '#EECCAE' },
        { id: 'warm', label: 'WARM', description: '', background: '#F19F64' },
      ],
    },
    feedback: {
      enabled: false,
      delaySeconds: 4,
      title: 'How is the shade depth?',
      lighterLabel: 'Too light',
      justRightLabel: 'Just right',
      deeperLabel: 'Too deep',
    },
    privacy: {
      note: '',
      confirmLabel: 'CONTINUE',
    },
    labels: {
      holdHint: 'Hold still for a moment',
      scanAgain: 'SCAN AGAIN',
      detecting: 'Starting camera…',
      manualPick: "Couldn't read a face. Try again.",
      skinReady: 'Skin tone captured.',
      cameraDenied: 'Allow camera access to scan your face.',
      moveFace: 'Move your face into the frame.',
      holdChecks: 'Match lighting, face direction, and position.',
      holdStill: 'Hold still…',
      emptyColumn: 'No matching shade',
      matchBest: 'Best match',
      matchLighter: 'Lighter',
      matchDeeper: 'Deeper',
      gateLighting: 'Lighting',
      gateStraight: 'Look straight',
      gatePosition: 'Face position',
    },
  };
}

export interface ResolvedLink {
  buttonId: string;
  label: string;
  style: FinderLinkButton['style'];
  url: string;
}

/** Buttons to render under a recommended shade; variant URL overrides the button default. */
export function resolveVariantLinks(
  buttons: readonly (Omit<FinderLinkButton, 'enabled'> & { enabled?: boolean })[],
  variant: Pick<FinderVariant, 'links'>
): ResolvedLink[] {
  return buttons
    .filter((button) => button.enabled !== false)
    .map((button) => ({
      buttonId: button.id,
      label: button.label,
      style: button.style,
      url: String(variant.links?.[button.id] || button.url || '').trim(),
    }))
    .filter((link) => /^https?:\/\//i.test(link.url));
}

export function toPublicFinder(finder: Finder): PublicFinder {
  return {
    code: finder.code,
    title: finder.title,
    brand: finder.brand,
    version: finder.version,
    variants: finder.variants
      .filter((variant) => variant.enabled)
      .map(({ enabled: _enabled, ...variant }) => variant),
    buttons: finder.buttons
      .filter((button) => button.enabled)
      .map(({ enabled: _enabled, ...button }) => button),
    settings: finder.settings,
  };
}
