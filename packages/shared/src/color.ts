export type Lab = [number, number, number];

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type Undertone = 'cool' | 'neutral' | 'warm';

export function normalizeHex(raw: unknown): string | null {
  let hex = String(raw ?? '').trim();
  if (!hex) return null;
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return hex.toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex);
  if (!value) throw new Error(`Invalid hex color: ${hex}`);
  return [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16),
  ];
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const red = srgbToLinear(r);
  const green = srgbToLinear(g);
  const blue = srgbToLinear(b);
  const x = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = red * 0.0193339 + green * 0.119192 + blue * 0.9503041;
  const pivot = (channel: number) => (channel > 0.008856 ? Math.cbrt(channel) : 7.787 * channel + 16 / 116);
  const fx = pivot(x / 0.95047);
  const fy = pivot(y / 1);
  const fz = pivot(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

export function deltaE00(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const toRad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const cBar = (C1 + C2) / 2;
  const cBar7 = cBar ** 7;
  const G = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hue = (a: number, b: number) => {
    const degrees = Math.atan2(b, a) * (180 / Math.PI);
    return degrees < 0 ? degrees + 360 : degrees;
  };
  const h1 = hue(a1p, b1);
  const h2 = hue(a2p, b2);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2 - h1;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * toRad);

  let hBar = h1 + h2;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) <= 180) hBar = (h1 + h2) / 2;
    else if (h1 + h2 < 360) hBar = (h1 + h2 + 360) / 2;
    else hBar = (h1 + h2 - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hBar - 30) * toRad) +
    0.24 * Math.cos(2 * hBar * toRad) +
    0.32 * Math.cos((3 * hBar + 6) * toRad) -
    0.2 * Math.cos((4 * hBar - 63) * toRad);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cBarp = (C1p + C2p) / 2;
  const cBarp7 = cBarp ** 7;
  const Rc = 2 * Math.sqrt(cBarp7 / (cBarp7 + 25 ** 7));
  const lBar = (L1 + L2) / 2;
  const Sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const Sc = 1 + 0.045 * cBarp;
  const Sh = 1 + 0.015 * cBarp * T;
  const Rt = -Math.sin(2 * dTheta * toRad) * Rc;
  const dC = dCp / Sc;
  const dH = dHp / Sh;

  return Math.sqrt((dLp / Sl) ** 2 + dC ** 2 + dH ** 2 + Rt * dC * dH);
}

export function averageTrimmedRgb(
  pixels: ArrayLike<number>[],
  darkTrimRatio = 0.15,
  lightTrimRatio = darkTrimRatio
): Rgb | null {
  if (!pixels.length) return null;
  const ranked = pixels
    .map((pixel) => ({
      pixel,
      luma: 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2],
    }))
    .sort((left, right) => left.luma - right.luma);
  const darkTrim = Math.floor(ranked.length * darkTrimRatio);
  const lightTrim = Math.floor(ranked.length * lightTrimRatio);
  const kept =
    darkTrim + lightTrim > 0 && darkTrim + lightTrim < ranked.length
      ? ranked.slice(darkTrim, ranked.length - lightTrim)
      : ranked;
  const total = kept.reduce(
    (sum, item) => [sum[0] + item.pixel[0], sum[1] + item.pixel[1], sum[2] + item.pixel[2]],
    [0, 0, 0]
  );
  return {
    r: Math.round(total[0] / kept.length),
    g: Math.round(total[1] / kept.length),
    b: Math.round(total[2] / kept.length),
  };
}

export function averageSkinSamples(samples: Rgb[]): Rgb | null {
  if (!samples?.length) return null;
  const total = samples.reduce(
    (sum, rgb) => [sum[0] + rgb.r, sum[1] + rgb.g, sum[2] + rgb.b],
    [0, 0, 0]
  );
  return {
    r: Math.round(total[0] / samples.length),
    g: Math.round(total[1] / samples.length),
    b: Math.round(total[2] / samples.length),
  };
}

// Absolute hex undertone from Lab a*/b* (not SKU suffix names).
export function classifyUndertone(lab: Lab | null | undefined): Undertone {
  if (!lab) return 'neutral';
  const axis = lab[2] - lab[1] * 0.55;
  if (axis > 6) return 'warm';
  if (axis < -1) return 'cool';
  return 'neutral';
}

export function normalizeUndertoneLabel(value: unknown): Undertone | null {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!key) return null;
  if (key === 'cool' || key === 'c' || key === '冷') return 'cool';
  if (key === 'neutral' || key === 'n' || key === 'neu' || key === '中' || key === '中性') return 'neutral';
  if (key === 'warm' || key === 'w' || key === '暖') return 'warm';
  return null;
}
