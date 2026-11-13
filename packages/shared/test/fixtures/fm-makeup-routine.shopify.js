(function () {
  const VISION_MODULE =
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
  const VISION_WASM =
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
  const FACE_MODEL =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  // Cheeks + jaw only for skin (forehead often hits bangs and skews light/dark).
  const CHEEK_AND_JAW = [50, 101, 280, 330, 172, 397];
  // Keep pose locked long enough for autofocus + multi-frame average.
  const HOLD_CAPTURE_MS = 3000;
  const SKIN_SAMPLE_MAX = 10;

  let videoLandmarkerPromise = null;

  function shopifyRoot() {
    return window.Shopify?.routes?.root || '/';
  }

  function cartAddUrl() {
    const themeAddUrl = window.themeVariables?.routes?.cartAddUrl;
    return themeAddUrl ? `${themeAddUrl}.js` : `${shopifyRoot()}cart/add.js`;
  }

  function cartJsonUrl() {
    const themeCartUrl = window.themeVariables?.routes?.cartUrl;
    return themeCartUrl ? `${themeCartUrl}.js` : `${shopifyRoot()}cart.js`;
  }

  function cartSectionsParam() {
    return window.themeVariables?.settings?.cartSections || 'cart-drawer,cart-icon-bubble,mini-cart';
  }

  function openMiniCart(addJson) {
    const cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer?.renderContents && addJson?.sections) {
      cartDrawer.renderContents(addJson);
      cartDrawer.open?.();
      return;
    }

    const drawerComponent = document.querySelector('cart-drawer-component');
    drawerComponent?.open?.();
  }

  function publishThemeCart(addJson) {
    return fetch(cartJsonUrl())
      .then((response) => {
        if (!response.ok) throw new Error('Cart fetch failed');
        return response.json();
      })
      .then((cartContent) => {
        if (addJson?.sections) cartContent.sections = addJson.sections;

        document.documentElement.dispatchEvent(
          new CustomEvent('variant:added', {
            bubbles: true,
            detail: {
              variant: addJson?.items?.[0] || addJson,
            },
          })
        );
        document.documentElement.dispatchEvent(
          new CustomEvent('cart:updated', {
            bubbles: true,
            detail: { cart: cartContent },
          })
        );
        document.documentElement.dispatchEvent(
          new CustomEvent('cart:refresh', {
            bubbles: true,
            detail: {
              cart: cartContent,
              openMiniCart: true,
              open: true,
            },
          })
        );

        openMiniCart(addJson);
      });
  }

  function htmlToText(html) {
    const source = String(html || '');
    if (!source) return '';
    const withBreaks = source
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n</p>')
      .replace(/<\/li>/gi, '\n</li>')
      .replace(/<\/div>/gi, '\n</div>');

    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
      return doc.body.textContent || '';
    }

    return withBreaks
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }

  function normalizeHex(raw) {
    let hex = String(raw || '').trim();
    if (!hex) return null;
    if (!hex.startsWith('#')) hex = `#${hex}`;
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    return hex.toUpperCase();
  }

  function normalizeKey(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function parseShadeMap(html) {
    const map = new Map();
    const text = htmlToText(html);

    text.split(/\n+/).forEach((line) => {
      const trimmed = line.trim();
      const hexAt = trimmed.indexOf('#');
      if (hexAt < 0) return;

      const names = trimmed
        .slice(0, hexAt)
        .replace(/[:：]+\s*$/, '')
        .split('|')
        .map((name) => name.trim())
        .filter(Boolean);
      const hexes = trimmed
        .slice(hexAt)
        .split(/[|,]/)
        .map(normalizeHex)
        .filter(Boolean);
      if (!names.length || hexes.length !== 1) return;

      names.forEach((name) => {
        map.set(normalizeKey(name), hexes[0]);
      });
    });

    return map;
  }

  function resolveHex(variant, _product, shadeMap) {
    const sku = normalizeKey(variant?.sku);
    if (sku && shadeMap.has(sku)) return shadeMap.get(sku);

    const values = [variant?.option1, variant?.option2, variant?.option3, variant?.title];
    for (let index = 0; index < values.length; index += 1) {
      const key = normalizeKey(values[index]);
      if (key && key !== 'default title' && shadeMap.has(key)) return shadeMap.get(key);
    }
    return null;
  }

  function srgbToLinear(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  function rgbToLab(r, g, b) {
    const red = srgbToLinear(r);
    const green = srgbToLinear(g);
    const blue = srgbToLinear(b);
    const x = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
    const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
    const z = red * 0.0193339 + green * 0.119192 + blue * 0.9503041;
    const pivot = (channel) => (channel > 0.008856 ? Math.cbrt(channel) : 7.787 * channel + 16 / 116);
    const fx = pivot(x / 0.95047);
    const fy = pivot(y / 1);
    const fz = pivot(z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function deltaE00(lab1, lab2) {
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

    const hue = (a, b) => {
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

  function averageTrimmedRgb(pixels, darkTrimRatio = 0.15, lightTrimRatio = darkTrimRatio) {
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

  function clampDepthStep(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(-10, Math.min(10, Math.round(number)));
  }

  function shadeMatchScore(skinLab, shadeLab, depthStep = 0) {
    // depthStep -10..+10: soft product dial (deeper ← 0 → lighter), not raw score +1.
    const step = clampDepthStep(depthStep);
    // ~0.4 L per step → ±10 ≈ ±4 L (gentler than 0.7).
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

  // Absolute hex undertone from Lab a*/b* (not SKU suffix names).
  function classifyUndertone(lab) {
    if (!lab) return 'neutral';
    const axis = lab[2] - lab[1] * 0.55;
    if (axis > 6) return 'warm';
    if (axis < -1) return 'cool';
    return 'neutral';
  }

  function normalizeUndertoneLabel(value) {
    const key = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    if (!key) return null;
    if (key === 'cool' || key === 'c' || key === '冷') return 'cool';
    if (key === 'neutral' || key === 'n' || key === 'neu' || key === '中' || key === '中性') return 'neutral';
    if (key === 'warm' || key === 'w' || key === '暖') return 'warm';
    return null;
  }

  // Product metafield lines: cool:SKU1,SKU2 / neutral:... / warm:...
  function parseUndertoneSkuMap(raw) {
    const map = new Map();
    const text = htmlToText(raw);
    text.split(/\n+/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const splitAt = trimmed.search(/[:：]/);
      if (splitAt < 0) return;
      const tone = normalizeUndertoneLabel(trimmed.slice(0, splitAt));
      if (!tone) return;
      trimmed
        .slice(splitAt + 1)
        .split(/[,|，、]/)
        .map((sku) => normalizeKey(sku))
        .filter(Boolean)
        .forEach((sku) => {
          map.set(sku, tone);
        });
    });
    return map;
  }

  // Product SKU tone map wins; otherwise fall back to hex Lab classification.
  function resolveVariantUndertone(variant, shadeLab, toneMap) {
    const sku = normalizeKey(variant?.sku);
    if (sku && toneMap?.has(sku)) return toneMap.get(sku);
    return classifyUndertone(shadeLab);
  }

  function preferenceLab(skinLab, preference) {
    if (!skinLab) return skinLab;
    const [lightness, a, b] = skinLab;
    if (preference === 'cool') return [lightness + 4, a + 3, b - 4];
    if (preference === 'warm') return [lightness - 4, a - 2, b + 5];
    return skinLab;
  }

  const NEAR_POOL_SIZE = 7;
  const NEAR_MAX_EXTRA_DE = 10;

  function scoreCatalog(product, skinLab, shadeMap, toneMap, depthStep) {
    const scored = [];
    (product?.variants || []).forEach((variant) => {
      if (variant.available === false) return;
      const hex = resolveHex(variant, product, shadeMap);
      if (!hex) return;
      const shadeLab = rgbToLab(...hexToRgb(hex));
      scored.push({
        product,
        variant,
        hex,
        de: shadeMatchScore(skinLab, shadeLab, depthStep),
        shadeLab,
        undertone: resolveVariantUndertone(variant, shadeLab, toneMap),
      });
    });
    scored.sort((left, right) => left.de - right.de);
    return scored;
  }

  function buildNearPool(scored) {
    if (!scored?.length) return [];
    const bestDe = scored[0].de;
    return scored.filter((item) => item.de <= bestDe + NEAR_MAX_EXTRA_DE).slice(0, NEAR_POOL_SIZE);
  }

  function closestOnSide(anchor, candidates, side) {
    const anchorL = anchor?.shadeLab?.[0] ?? 0;
    const pool = (candidates || []).filter((item) => {
      const lightness = item.shadeLab?.[0] ?? 0;
      return side === 'lighter' ? lightness > anchorL : lightness < anchorL;
    });
    pool.sort((left, right) => {
      const gapLeft = Math.abs((left.shadeLab?.[0] ?? 0) - anchorL);
      const gapRight = Math.abs((right.shadeLab?.[0] ?? 0) - anchorL);
      if (gapLeft !== gapRight) return gapLeft - gapRight;
      return left.de - right.de;
    });
    return pool[0] || null;
  }

  // From the near pool: prefer selected undertone, then fill missing lighter/deeper only inside the pool.
  function pickRecommendationCandidates(near, preference) {
    if (!near?.length) return [];

    const usePreference = preference === 'cool' || preference === 'warm' || preference === 'neutral';
    let preferred = usePreference ? near.filter((item) => item.undertone === preference) : near.slice();
    // No shades in that absolute undertone → fall back to the near pool (still no far padding).
    if (!preferred.length) preferred = near.slice();

    const selected = preferred.slice(0, 3);
    if (selected.length >= 3) return selected;

    const anchor = selected[0];
    const selectedIds = new Set(selected.map((item) => item.variant.id));
    let remaining = near.filter((item) => !selectedIds.has(item.variant.id));
    const anchorL = anchor.shadeLab?.[0] ?? 0;
    const hasLighter = selected.some((item) => (item.shadeLab?.[0] ?? 0) > anchorL);
    const hasDeeper = selected.some((item) => (item.shadeLab?.[0] ?? 0) < anchorL);

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

  function rankVariants(product, skinLab, shadeMap, limit, preference, toneMap, depthStep) {
    const max = Math.max(1, limit || NEAR_POOL_SIZE);
    const near = buildNearPool(scoreCatalog(product, skinLab, shadeMap, toneMap, depthStep));
    if (!near.length) return [];
    if (preference === 'cool' || preference === 'warm' || preference === 'neutral') {
      return pickRecommendationCandidates(near, preference).slice(0, max);
    }
    return near.slice(0, max);
  }

  function recommendShades(product, skinLab, shadeMap, preference, toneMap, depthStep) {
    const near = buildNearPool(scoreCatalog(product, skinLab, shadeMap, toneMap, depthStep));
    return arrangeShadeRoles(pickRecommendationCandidates(near, preference));
  }

  // 1 → Best; 2 → score-best + lighter/deeper; 3 → sort by L as Lighter | Best | Deeper.
  function arrangeShadeRoles(items) {
    if (!items?.length) return [];
    if (items.length === 1) return [{ ...items[0], role: 'best' }];

    if (items.length === 2) {
      const byScore = [...items].sort((left, right) => left.de - right.de);
      const best = byScore[0];
      const other = byScore[1];
      if ((other.shadeLab?.[0] ?? 0) > (best.shadeLab?.[0] ?? 0)) {
        return [
          { ...other, role: 'cooler' },
          { ...best, role: 'best' },
        ];
      }
      return [
        { ...best, role: 'best' },
        { ...other, role: 'deeper' },
      ];
    }

    const byLightness = [...items].sort(
      (left, right) => (left.shadeLab?.[0] ?? 0) - (right.shadeLab?.[0] ?? 0)
    );
    const deeper = byLightness[0];
    const best = byLightness[1];
    const cooler = byLightness[byLightness.length - 1];
    return [
      { ...cooler, role: 'cooler' },
      { ...best, role: 'best' },
      { ...deeper, role: 'deeper' },
    ];
  }

  function hexToRgb(hex) {
    const value = normalizeHex(hex);
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16),
    ];
  }

  function loadLandmarker(runningMode) {
    return import(VISION_MODULE).then(async (vision) => {
      const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM);
      const options = {
        runningMode,
        // Detect a second face so we can reject crowded frames during shade sampling.
        numFaces: 2,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      };
      try {
        return await vision.FaceLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
        });
      } catch {
        return vision.FaceLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' },
        });
      }
    });
  }

  function getVideoLandmarker() {
    if (!videoLandmarkerPromise) {
      videoLandmarkerPromise = loadLandmarker('VIDEO').catch((error) => {
        videoLandmarkerPromise = null;
        throw error;
      });
    }
    return videoLandmarkerPromise;
  }

  function resetVideoLandmarker() {
    videoLandmarkerPromise = null;
  }

  function requestCameraStream() {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user' },
    });
  }

  // QR deep-link: warm MediaPipe as soon as this file parses (camera needs a user gesture on iOS).
  try {
    if (
      typeof URLSearchParams !== 'undefined' &&
      new URLSearchParams(globalThis.location?.search || '').get('fm_shade') === '1'
    ) {
      getVideoLandmarker().catch(() => {});
    }
  } catch {
    /* ignore non-browser test hosts */
  }

  function sampleRegions(canvas, centers, radius) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const { width, height } = canvas;
    const image = context.getImageData(0, 0, width, height).data;
    const seen = new Set();
    const pixels = [];
    const r = Math.max(4, radius);

    centers.forEach((center) => {
      const cx = center.x;
      const cy = center.y;
      const yStart = Math.max(0, Math.floor(cy - r));
      const yEnd = Math.min(height - 1, Math.ceil(cy + r));
      const xStart = Math.max(0, Math.floor(cx - r));
      const xEnd = Math.min(width - 1, Math.ceil(cx + r));
      for (let y = yStart; y <= yEnd; y += 1) {
        for (let x = xStart; x <= xEnd; x += 1) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy > r * r) continue;
          const key = y * width + x;
          if (seen.has(key)) continue;
          seen.add(key);
          const index = key * 4;
          pixels.push([image[index], image[index + 1], image[index + 2]]);
        }
      }
    });

    return pixels;
  }

  function landmarkPoint(landmarks, index) {
    const point = landmarks?.[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return point;
  }

  function faceWidthNorm(landmarks) {
    const left = landmarkPoint(landmarks, 234);
    const right = landmarkPoint(landmarks, 454);
    if (!left || !right) return 0;
    return Math.hypot(right.x - left.x, right.y - left.y);
  }

  function faceChecks(landmarks, extraFaces) {
    const empty = { position: false, straight: false };
    if (!landmarks || landmarks.length < 300) return empty;
    const left = landmarkPoint(landmarks, 234);
    const right = landmarkPoint(landmarks, 454);
    const nose = landmarkPoint(landmarks, 1);
    const forehead = landmarkPoint(landmarks, 10);
    const chin = landmarkPoint(landmarks, 152);
    const eyeL = landmarkPoint(landmarks, 33);
    const eyeR = landmarkPoint(landmarks, 263);
    if (!left || !right || !nose || !forehead || !chin || !eyeL || !eyeR) return empty;

    const faceWidth = Math.hypot(right.x - left.x, right.y - left.y);
    const cx = (left.x + right.x) / 2;
    const cy = (forehead.y + chin.y) / 2;
    const inFrame = forehead.y > 0.05 && chin.y < 0.95 && left.x > 0.04 && right.x < 0.96;
    // Looser distance/centering than the drawn guide (guide size stays fixed in CSS).
    let position =
      inFrame && faceWidth >= 0.4 && faceWidth < 0.84 && cx > 0.28 && cx < 0.72 && cy > 0.24 && cy < 0.78;

    // Reject when another similarly large face is in frame (avoid sampling the wrong person).
    if (position && Array.isArray(extraFaces)) {
      const crowded = extraFaces.some((other) => {
        const otherWidth = faceWidthNorm(other);
        return otherWidth >= 0.22 && otherWidth >= faceWidth * 0.55;
      });
      if (crowded) position = false;
    }

    // Look straight = face toward camera (yaw/roll/pitch). Keep strict so samples are frontal.
    const midX = (eyeL.x + eyeR.x) / 2;
    const yaw = faceWidth > 0 ? Math.abs(nose.x - midX) / faceWidth : 1;
    const roll = Math.abs(Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x));
    const span = chin.y - forehead.y;
    const pitch = span > 0.05 ? (nose.y - forehead.y) / span : 1;
    const straight = yaw < 0.16 && roll < 0.24 && pitch > 0.36 && pitch < 0.76;
    return { position, straight };
  }

  function pixelLuma(pixels) {
    const rgb = averageTrimmedRgb(pixels, 0.1);
    if (!rgb) return null;
    return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  }

  // Cheeks drive lighting (stable). Forehead is advisory only — bangs often darken landmark 10.
  const LIGHT_CHEEK_AVG_MIN = 60;
  const LIGHT_CHEEK_AVG_MAX = 205;
  const LIGHT_CHEEK_POINT_MIN = 48;
  const LIGHT_CHEEK_POINT_MAX = 220;
  const LIGHT_CHEEK_DELTA_MAX = 60;
  const LIGHT_FOREHEAD_MAX = 230;

  function lightingOk(canvas, landmarks) {
    if (!canvas?.width || !landmarks) return false;
    const width = canvas.width;
    const height = canvas.height;
    const left = landmarkPoint(landmarks, 234);
    const right = landmarkPoint(landmarks, 454);
    if (!left || !right) return false;
    const faceWidth = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
    const radius = Math.max(4, faceWidth * 0.06);
    const lumas = [50, 280, 10]
      .map((index) => landmarkPoint(landmarks, index))
      .filter(Boolean)
      .map((point) => pixelLuma(sampleRegions(canvas, [{ x: point.x * width, y: point.y * height }], radius)))
      .filter((value) => value != null);
    if (lumas.length < 3) return false;
    const cheekL = lumas[0];
    const cheekR = lumas[1];
    const forehead = lumas[2];
    const cheekAvg = (cheekL + cheekR) / 2;
    const cheeksOk =
      cheekL >= LIGHT_CHEEK_POINT_MIN &&
      cheekL <= LIGHT_CHEEK_POINT_MAX &&
      cheekR >= LIGHT_CHEEK_POINT_MIN &&
      cheekR <= LIGHT_CHEEK_POINT_MAX &&
      Math.abs(cheekL - cheekR) <= LIGHT_CHEEK_DELTA_MAX;
    const cheekLevelOk = cheekAvg >= LIGHT_CHEEK_AVG_MIN && cheekAvg <= LIGHT_CHEEK_AVG_MAX;
    // Only reject forehead when blown out; dark bangs should not fail Lighting.
    const foreheadOk = forehead <= LIGHT_FOREHEAD_MAX;
    return cheeksOk && cheekLevelOk && foreheadOk;
  }

  function skinFromLandmarks(canvas, landmarks) {
    if (!landmarks || landmarks.length < 300) return null;
    const width = canvas.width;
    const height = canvas.height;
    const left = landmarks[234];
    const right = landmarks[454];
    const faceWidth =
      left && right ? Math.hypot((right.x - left.x) * width, (right.y - left.y) * height) : width * 0.4;
    const radius = Math.max(4, faceWidth * 0.06);
    const points = CHEEK_AND_JAW.map((index) => landmarks[index])
      .filter(Boolean)
      .map((point) => ({ x: point.x * width, y: point.y * height }));
    if (!points.length) return null;
    // Milder dark trim — heavy trim was pushing readings too light/white.
    return averageTrimmedRgb(sampleRegions(canvas, points, radius), 0.28, 0.08);
  }

  function averageSkinSamples(samples) {
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

  function drawVideoFrame(video, canvas) {
    const maxEdge = 640;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  globalThis.FmMakeupRoutineCore = {
    parseShadeMap,
    resolveHex,
    rgbToLab,
    deltaE00,
    averageTrimmedRgb,
    averageSkinSamples,
    clampDepthStep,
    shadeMatchScore,
    scoreCatalog,
    buildNearPool,
    pickRecommendationCandidates,
    rankVariants,
    recommendShades,
    arrangeShadeRoles,
    classifyUndertone,
    normalizeUndertoneLabel,
    parseUndertoneSkuMap,
    resolveVariantUndertone,
    preferenceLab,
    normalizeHex,
    faceChecks,
    lightingOk,
  };

  const root = globalThis;

  class FmMakeupPdp extends HTMLElement {
    #initialized = false;
    #config = {};
    #shadeMap = new Map();
    #toneMap = new Map();
    #depthStep = 0;
    #skinLab = null;
    #undertone = null;
    #adding = false;
    #open = false;
    #video = null;
    #canvas = null;
    #status = null;
    #results = null;
    #back = null;
    #matches = [];
    #selected = 0;
    #overlay = null;
    #popup = null;
    #privacy = null;
    #feedback = null;
    #drawer = null;
    #stream = null;
    #cameraToken = 0;
    #scanning = false;
    #busy = false;
    #captured = false;
    #landmarkerReset = false;
    #holdReadyAt = 0;
    #skinSamples = [];
    #countdown = null;
    #videoTime = 0;
    #lastDetect = 0;
    #frame = 0;
    #feedbackTimer = 0;
    #feedbackDone = false;

    connectedCallback() {
      if (this.#initialized) return;
      this.#initialized = true;
      const script = this.querySelector('[data-fm-pdp-config]');
      try {
        this.#config = JSON.parse(script?.textContent || '{}');
      } catch {
        this.#config = {};
      }
      this.#shadeMap = parseShadeMap(this.#config.shadeMap || '');
      this.#toneMap = parseUndertoneSkuMap(this.#config.shadeToneMap || '');
      this.#depthStep = clampDepthStep(this.#config.depthStep);
      this.#video = this.querySelector('[data-fm-video]');
      this.#canvas = this.querySelector('[data-fm-canvas]');
      this.#status = this.querySelector('[data-fm-status]');
      this.#countdown = this.querySelector('[data-fm-countdown]');
      this.#results = this.querySelector('[data-fm-results]');
      this.#back = this.querySelector('[data-fm-back]');
      this.#overlay = this.querySelector('[data-fm-overlay]');
      this.#popup = this.querySelector('[data-fm-popup]');
      this.#privacy = this.querySelector('[data-fm-privacy]');
      this.#feedback = this.querySelector('[data-fm-feedback]');
      this.#drawer = this.querySelector('[data-fm-drawer]');
      this.querySelector('[data-fm-open]')?.addEventListener('click', this.#onOpen);
      this.#back?.addEventListener('click', this.#onBack);
      this.#results?.addEventListener('click', this.#onResultsClick);
      this.#privacy?.querySelector('[data-fm-privacy-accept]')?.addEventListener('click', this.#onPrivacyAccept);
      this.#feedback?.addEventListener('click', this.#onFeedbackClick);
      [this.#overlay, this.#popup, this.#privacy, this.#drawer].forEach((node) =>
        node?.addEventListener('click', this.#onCloseClick)
      );
      document.addEventListener('keydown', this.#onKey);
      const fromPhone = new URLSearchParams(window.location.search).get('fm_shade') === '1';
      if (fromPhone) this.#setOpen(true);
    }

    disconnectedCallback() {
      document.removeEventListener('keydown', this.#onKey);
      this.#clearFeedback(true);
      this.#stopCamera();
      [this.#overlay, this.#popup, this.#privacy, this.#feedback, this.#drawer].forEach((node) => {
        if (node && node.parentElement === document.body) node.remove();
      });
      this.#initialized = false;
      this.#open = false;
    }

    #label(key, fallback) {
      return this.#config.labels?.[key] || fallback;
    }

    #onOpen = () => {
      this.#setOpen(true);
    };

    #onBack = () => {
      this.#undertone = null;
      this.#startCamera();
    };

    #onCloseClick = (event) => {
      if (event.target.closest('[data-fm-close]')) this.#setOpen(false);
    };

    #onPrivacyAccept = () => {
      if (this.#privacy) this.#privacy.hidden = true;
      if (this.#drawer) {
        this.#drawer.hidden = false;
        this.#drawer.classList.add('is-open');
      }
      this.#mountLayer();
      this.#drawer?.querySelector('[data-fm-close]')?.focus();
      this.#startCamera();
    };

    #undertoneEnabled() {
      return Boolean(this.#config.undertone?.enabled);
    }

    #onKey = (event) => {
      if (event.key !== 'Escape' || !this.#open) return;
      if (this.#feedback && !this.#feedback.hidden) {
        this.#dismissFeedback();
        return;
      }
      this.#setOpen(false);
    };

    #setOpen(open) {
      this.#open = open;
      document.documentElement.classList.toggle('fm-pdp-lock', open);
      if (!open) {
        this.#adding = false;
        this.#undertone = null;
        this.#clearFeedback(true);
        if (this.#drawer) {
          this.#drawer.hidden = true;
          this.#drawer.classList.remove('is-open', 'is-ready', 'is-undertone', 'is-rescan');
        }
        if (this.#back) this.#back.hidden = true;
        if (this.#popup) this.#popup.hidden = true;
        if (this.#privacy) this.#privacy.hidden = true;
        if (this.#overlay) this.#overlay.hidden = true;
        this.#stopCamera();
        this.#restoreLayer();
        return;
      }
      if (this.#overlay) this.#overlay.hidden = false;
      const fromPhone = new URLSearchParams(window.location.search).get('fm_shade') === '1';
      const showQr = !fromPhone && this.#preferPhone();
      const showPrivacy = Boolean(this.#privacy) && !fromPhone && !showQr;
      if (this.#drawer) {
        this.#drawer.hidden = showQr || showPrivacy;
        this.#drawer.classList.toggle('is-open', !showQr && !showPrivacy);
      }
      if (this.#popup) this.#popup.hidden = !showQr;
      if (this.#privacy) this.#privacy.hidden = !showPrivacy;
      this.#mountLayer();
      if (showQr) {
        this.#showQr();
        this.#popup?.querySelector('[data-fm-close]')?.focus();
        return;
      }
      if (showPrivacy) {
        this.#privacy?.querySelector('[data-fm-privacy-accept]')?.focus();
        return;
      }
      this.#drawer?.querySelector('[data-fm-close]')?.focus();
      this.#startCamera();
    }

    #mountLayer() {
      // Visible surface last so paint order wins among equal max z-index siblings.
      const stack = [this.#overlay];
      if (this.#popup && !this.#popup.hidden) stack.push(this.#popup);
      if (this.#privacy && !this.#privacy.hidden) stack.push(this.#privacy);
      if (this.#drawer && !this.#drawer.hidden) stack.push(this.#drawer);
      if (this.#feedback && !this.#feedback.hidden) stack.push(this.#feedback);
      stack.forEach((node) => {
        if (node) document.body.appendChild(node);
      });
    }

    #restoreLayer() {
      [this.#overlay, this.#popup, this.#privacy, this.#feedback, this.#drawer].forEach((node) => {
        if (node && node.parentElement !== this) this.appendChild(node);
      });
    }

    #feedbackEnabled() {
      return Boolean(this.#config.feedback?.enabled);
    }

    #feedbackDelayMs() {
      const seconds = Number(this.#config.feedback?.delay);
      const clamped = Number.isFinite(seconds) ? Math.min(5, Math.max(3, seconds)) : 4;
      return clamped * 1000;
    }

    #feedbackProductName() {
      return (
        (this.#config.columns || [])[0]?.title ||
        (this.#config.columns || [])[0]?.products?.[0]?.title ||
        ''
      );
    }

    #feedbackSkus() {
      return (this.#matches || [])
        .map((item) => String(item?.variant?.sku || '').trim())
        .filter(Boolean)
        .join(',');
    }

    #clearFeedback(resetDone = false) {
      if (this.#feedbackTimer) {
        clearTimeout(this.#feedbackTimer);
        this.#feedbackTimer = 0;
      }
      if (this.#feedback) this.#feedback.hidden = true;
      if (resetDone) this.#feedbackDone = false;
    }

    #dismissFeedback() {
      this.#feedbackDone = true;
      this.#clearFeedback();
    }

    #scheduleFeedback() {
      this.#clearFeedback(true);
      if (!this.#feedbackEnabled() || !this.#matches.length || !this.#feedback) return;
      this.#feedbackTimer = setTimeout(() => this.#showFeedback(), this.#feedbackDelayMs());
    }

    #showFeedback() {
      this.#feedbackTimer = 0;
      if (!this.#open || this.#feedbackDone || !this.#feedbackEnabled() || !this.#matches.length) return;
      const config = this.#config.feedback || {};
      const title = this.#feedback.querySelector('[data-fm-feedback-title]');
      const options = this.#feedback.querySelector('[data-fm-feedback-options]');
      if (title) title.textContent = config.title || 'How is the shade depth?';
      if (options) {
        options.replaceChildren();
        const name = this.#feedbackProductName();
        const sku = this.#feedbackSkus();
        [
          {
            track: 'find_shade_too_light',
            label: config.lighterLabel || 'Too light',
            className: 'fm-pdp__feedback-option',
          },
          {
            track: 'find_shade_just_right',
            label: config.justRightLabel || 'Just right',
            className: 'fm-pdp__feedback-option is-primary',
          },
          {
            track: 'find_shade_too_deep',
            label: config.deeperLabel || 'Too deep',
            className: 'fm-pdp__feedback-option',
          },
        ].forEach((option) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = option.className;
          button.dataset.fmFeedbackChoice = 'true';
          button.dataset.fmTrack = option.track;
          button.dataset.fmName = name;
          button.dataset.fmSku = sku;
          button.textContent = option.label;
          options.appendChild(button);
        });
      }
      this.#feedback.hidden = false;
      this.#mountLayer();
      this.#feedback.querySelector('[data-fm-feedback-close]')?.focus();
    }

    #onFeedbackClick = (event) => {
      if (event.target.closest('[data-fm-feedback-close]')) {
        this.#dismissFeedback();
        return;
      }
      // Defer hide so document-level data-fm-track listeners still see the click.
      if (event.target.closest('[data-fm-feedback-choice]')) {
        setTimeout(() => this.#dismissFeedback(), 0);
      }
    };

    #preferPhone() {
      return window.matchMedia('(min-width: 750px)').matches && window.matchMedia('(pointer: fine)').matches;
    }

    #shadeLink() {
      const url = new URL(window.location.href);
      url.searchParams.set('fm_shade', '1');
      return url.toString();
    }

    #onResultsClick = (event) => {
      if (event.target.closest('[data-fm-scan-again]')) {
        this.#clearFeedback(true);
        this.#startCamera();
        return;
      }
      this.#onAdd(event);
    };

    async #showQr() {
      const img = this.#popup?.querySelector('[data-fm-qr-img]');
      if (this.#popup) this.#popup.hidden = false;
      if (!img || img.dataset.ready === 'true') return;
      const link = this.#shadeLink();
      try {
        const module = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
        const QRCode = module.default || module;
        img.src = await QRCode.toDataURL(link, {
          margin: 1,
          width: 400,
          color: { dark: '#111111', light: '#ffffff' },
        });
        img.dataset.ready = 'true';
      } catch {
        img.alt = link;
      }
    }

    #hideQr() {
      if (this.#popup) this.#popup.hidden = true;
    }

    #startCamera() {
      // Instantly cover/hide the result sheet before removing is-ready (avoids grow-to-fullscreen).
      this.#clearFeedback(true);
      this.#drawer?.classList.add('is-rescan');
      this.#stopCamera();
      const token = this.#cameraToken;
      this.#hideQr();
      this.#captured = false;
      this.#holdReadyAt = 0;
      this.#skinSamples = [];
      this.#setCountdown('');
      this.#skinLab = null;
      this.#undertone = null;
      this.#drawer?.classList.remove('is-live', 'is-ready', 'is-undertone');
      if (this.#back) this.#back.hidden = true;
      if (this.#canvas) this.#canvas.hidden = true;
      this.#results?.replaceChildren();
      this.#matches = [];
      this.#paintGates({ lighting: false, straight: false, position: false });
      if (!navigator.mediaDevices?.getUserMedia) {
        this.#drawer?.classList.remove('is-rescan');
        this.#setOpen(false);
        return;
      }
      this.#landmarkerReset = false;
      // Auto-prompt immediately (QR deep-link included). Deny once → leave.
      const modelReady = getVideoLandmarker().catch(() => getVideoLandmarker());
      requestCameraStream()
        .then(async (stream) => {
          if (token !== this.#cameraToken || !this.#open) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          this.#stream = stream;
          const video = this.#video;
          video.srcObject = stream;
          video.playsInline = true;
          video.muted = true;
          video.hidden = false;
          if (this.#canvas) this.#canvas.hidden = false;
          const track = stream.getVideoTracks()[0];
          track?.addEventListener('ended', () => {
            if (this.#scanning && this.#open) this.#setOpen(false);
          });
          await video.play();
          if (token !== this.#cameraToken || !this.#open) return;
          try {
            await modelReady;
          } catch {
            if (token !== this.#cameraToken || !this.#open) return;
            this.#drawer?.classList.remove('is-rescan');
            this.#setStatus(this.#label('manualPick', "Couldn't read a face. Try again."));
            return;
          }
          if (token !== this.#cameraToken || !this.#open) return;
          await new Promise((resolve) => {
            if (typeof video.requestVideoFrameCallback === 'function') {
              video.requestVideoFrameCallback(() => resolve());
            } else {
              setTimeout(resolve, 200);
            }
          });
          if (token !== this.#cameraToken || !this.#open) return;
          this.#drawer?.classList.remove('is-rescan');
          this.#drawer?.classList.add('is-live');
          this.#scanning = true;
          this.#drawer?.classList.add('is-scanning');
          this.#loop();
        })
        .catch(() => {
          if (token !== this.#cameraToken || !this.#open) return;
          this.#drawer?.classList.remove('is-rescan');
          this.#setOpen(false);
        });
    }

    #stopCamera() {
      this.#cameraToken += 1;
      this.#scanning = false;
      this.#busy = false;
      if (this.#frame) cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      this.#stream?.getTracks().forEach((track) => track.stop());
      this.#stream = null;
      if (this.#video) {
        this.#video.srcObject = null;
        this.#video.hidden = true;
      }
      this.#drawer?.classList.remove('is-scanning');
    }

    #loop = () => {
      if (!this.#scanning) return;
      const now = performance.now();
      if (!this.#busy && now - this.#lastDetect >= 70) {
        this.#lastDetect = now;
        this.#detectFrame();
      }
      this.#frame = requestAnimationFrame(this.#loop);
    };

    async #detectFrame() {
      if (!this.#scanning || this.#busy) return;
      const video = this.#video;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      this.#busy = true;
      try {
        const landmarker = await getVideoLandmarker();
        if (!this.#scanning) return;
        drawVideoFrame(video, this.#canvas);
        const stamp = Math.max(performance.now(), this.#videoTime + 1);
        this.#videoTime = stamp;
        const result = landmarker.detectForVideo(video, stamp);
        const faces = result?.faceLandmarks || [];
        const landmarks = faces[0];
        const pose = faceChecks(landmarks, faces.slice(1));
        const lighting = landmarks ? lightingOk(this.#canvas, landmarks) : false;
        this.#paintGates({ lighting, straight: pose.straight, position: pose.position });
        const ready = Boolean(lighting && pose.straight && pose.position);
        if (!landmarks) {
          this.#holdReadyAt = 0;
          this.#skinSamples = [];
          this.#setCountdown('');
          this.#setStatus(this.#label('moveFace', 'Move your face into the frame.'));
        } else if (!ready) {
          this.#holdReadyAt = 0;
          this.#skinSamples = [];
          this.#setCountdown('');
          this.#setStatus(this.#label('holdChecks', 'Match lighting, face direction, and position.'));
        } else {
          const now = performance.now();
          if (!this.#holdReadyAt) this.#holdReadyAt = now;
          const sample = skinFromLandmarks(this.#canvas, landmarks);
          if (sample) {
            this.#skinSamples.push(sample);
            if (this.#skinSamples.length > SKIN_SAMPLE_MAX) this.#skinSamples.shift();
          }
          const remainingMs = HOLD_CAPTURE_MS - (now - this.#holdReadyAt);
          if (remainingMs > 0) {
            const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
            this.#setCountdown(String(seconds));
            this.#setStatus(`${this.#label('holdStill', 'Hold still…')} ${seconds}`);
          } else {
            this.#setCountdown('');
            this.#setStatus(this.#label('holdStill', 'Hold still…'));
            if (!this.#captured) {
              this.#captured = true;
              this.#capture(landmarks);
            }
          }
        }
      } catch {
        this.#holdReadyAt = 0;
        this.#setCountdown('');
        if (!this.#landmarkerReset) {
          this.#landmarkerReset = true;
          resetVideoLandmarker();
        }
        this.#setStatus(this.#label('manualPick', "Couldn't read a face. Try again."));
      } finally {
        this.#busy = false;
      }
    }

    #setCountdown(text) {
      if (!this.#countdown) return;
      const value = String(text || '').trim();
      this.#countdown.textContent = value;
      this.#countdown.hidden = !value;
    }

    #capture(landmarks) {
      const rgb =
        averageSkinSamples(this.#skinSamples) || skinFromLandmarks(this.#canvas, landmarks);
      this.#skinSamples = [];
      this.#stopCamera();
      this.#canvas.hidden = false;
      if (!rgb) {
        this.#captured = false;
        this.#setStatus(this.#label('manualPick', "Couldn't read a face. Try again."));
        return;
      }
      this.#skinLab = rgbToLab(rgb.r, rgb.g, rgb.b);
      if (this.#undertoneEnabled()) {
        this.#undertone = null;
        this.#showUndertoneStep();
        return;
      }
      this.#recommend();
    }

    #paintGates(gates) {
      this.#drawer?.querySelectorAll('[data-fm-gate]').forEach((item) => {
        const passed = Boolean(gates[item.dataset.fmGate]);
        item.classList.toggle('is-ok', passed);
        const state = item.querySelector('[data-fm-gate-state]');
        if (state) state.textContent = passed ? 'True' : 'False';
      });
    }

    #showUndertoneStep() {
      this.#drawer?.classList.add('is-ready', 'is-undertone');
      if (this.#back) this.#back.hidden = false;
      this.#renderUndertone();
      this.#setStatus('');
    }

    #renderUndertone() {
      if (!this.#results) return;
      this.#results.replaceChildren();
      const config = this.#config.undertone || {};
      const title = document.createElement('p');
      title.className = 'fm-pdp__undertone-title';
      title.textContent = config.title || 'What is your undertone?';
      this.#results.appendChild(title);

      const row = document.createElement('div');
      row.className = 'fm-pdp__undertone-options';
      const options = Array.isArray(config.options) ? config.options : [];
      options.forEach((option) => {
        const id = option.id || '';
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `fm-pdp__undertone-card${this.#undertone === id ? ' is-selected' : ''}`;
        card.dataset.fmUndertone = id;
        card.style.background = option.background || '#d8d8d8';
        const label = document.createElement('span');
        label.className = 'fm-pdp__undertone-label';
        label.textContent = option.label || id;
        card.appendChild(label);
        const description = String(option.description || '').trim();
        if (description) {
          const desc = document.createElement('span');
          desc.className = 'fm-pdp__undertone-desc';
          desc.textContent = description;
          card.appendChild(desc);
        }
        card.addEventListener('click', () => {
          this.#undertone = id;
          this.#renderUndertone();
        });
        row.appendChild(card);
      });
      this.#results.appendChild(row);

      const unsure = document.createElement('button');
      unsure.type = 'button';
      unsure.className = 'fm-pdp__undertone-unsure';
      unsure.dataset.fmUndertoneUnsure = 'true';
      unsure.textContent = config.unsureLabel || "I'M NOT SURE";
      unsure.addEventListener('click', () => {
        this.#undertone = null;
        this.#recommend();
      });
      this.#results.appendChild(unsure);

      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'fm-pdp__undertone-next';
      next.dataset.fmUndertoneNext = 'true';
      next.dataset.fmTrack = 'find_shade_undertone';
      next.dataset.fmName =
        (this.#config.columns || [])[0]?.title ||
        (this.#config.columns || [])[0]?.products?.[0]?.title ||
        '';
      const selected = options.find((option) => option.id === this.#undertone);
      const undertoneName = String(selected?.label || this.#undertone || '').trim();
      if (undertoneName) next.dataset.fmUndertone = undertoneName;
      next.textContent = config.nextLabel || 'NEXT';
      next.disabled = !this.#undertone;
      next.addEventListener('click', () => {
        if (!this.#undertone) return;
        this.#recommend();
      });
      this.#results.appendChild(next);
    }

    #recommend() {
      if (!this.#skinLab) return;
      this.#drawer?.classList.remove('is-undertone');
      this.#drawer?.classList.add('is-ready');
      if (this.#back) this.#back.hidden = true;
      const column = (this.#config.columns || [])[0];
      const product = (column?.products || [])[0];
      const preference = this.#undertoneEnabled() ? this.#undertone : null;
      this.#matches = recommendShades(
        product,
        this.#skinLab,
        this.#shadeMap,
        preference,
        this.#toneMap,
        this.#depthStep
      );
      const bestIndex = this.#matches.findIndex((item) => item.role === 'best');
      this.#selected = bestIndex >= 0 ? bestIndex : 0;
      this.#render(this.#matches);
      this.#setStatus(this.#matches.length ? this.#label('skinReady', 'Skin tone captured.') : this.#label('emptyColumn', 'No matching shade'));
      this.#scheduleFeedback();
    }

    #matchTitle(item) {
      if (item?.role === 'cooler') return this.#label('matchCooler', 'Lighter');
      if (item?.role === 'deeper') return this.#label('matchDeeper', 'Deeper');
      return this.#label('matchBest', 'Best match');
    }

    #render(items) {
      this.#results.replaceChildren();
      const title = document.createElement('p');
      title.className = 'fm-pdp__sheet-title';
      const selected = items[this.#selected] || items[0];
      title.textContent = items.length
        ? this.#matchTitle(selected)
        : this.#label('emptyColumn', 'No matching shade');
      this.#results.appendChild(title);

      if (items.length) {
        const row = document.createElement('div');
        row.className = 'fm-pdp__shades';
        items.forEach((item, index) => {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = `fm-pdp__shade${index === this.#selected ? ' is-selected' : ''}`;
          swatch.style.background = item.hex;
          swatch.setAttribute('aria-label', this.#shadeName(item));
          swatch.addEventListener('click', () => {
            this.#selected = index;
            this.#render(this.#matches);
          });
          row.appendChild(swatch);
        });
        this.#results.appendChild(row);

        const item = items[this.#selected] || items[0];
        const product = document.createElement('p');
        product.className = 'fm-pdp__product';
        product.textContent = item.product.title || '';
        const shade = document.createElement('p');
        shade.className = 'fm-pdp__shade-name';
        shade.textContent = this.#shadeName(item);
        this.#results.append(product, shade);
        if (item.variant.price) {
          const price = document.createElement('p');
          price.className = 'fm-pdp__price';
          if (item.variant.comparePrice) {
            const sale = document.createElement('span');
            sale.className = 'fm-pdp__price-sale';
            sale.textContent = item.variant.price;
            const compare = document.createElement('s');
            compare.className = 'fm-pdp__price-compare';
            compare.textContent = item.variant.comparePrice;
            price.append(sale, compare);
          } else {
            price.textContent = item.variant.price;
          }
          this.#results.appendChild(price);
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fm-pdp__bag';
        button.dataset.fmAdd = 'true';
        button.dataset.fmTrack = 'find_shade_atc';
        button.dataset.fmName = item.product?.title || '';
        button.dataset.fmSku = item.variant?.sku || '';
        button.dataset.variantId = String(item.variant.id);
        button.textContent = this.#label('addToCart', 'ADD TO CART');
        this.#results.appendChild(button);
      }

      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'fm-pdp__scan';
      again.dataset.fmScanAgain = 'true';
      again.textContent = this.#label('scanAgain', 'SCAN AGAIN');
      this.#results.appendChild(again);
    }

    #shadeName(item) {
      const title = item?.variant?.title;
      if (title && title !== 'Default Title') return title;
      return item?.product?.title || '';
    }

    #onAdd = (event) => {
      const button = event.target.closest('[data-fm-add]');
      if (!button || this.#adding) return;
      const id = Number(button.closest('[data-variant-id]')?.dataset.variantId);
      if (!id) return;
      this.#adding = true;
      button.disabled = true;
      button.textContent = this.#label('adding', 'Adding...');
      fetch(cartAddUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          items: [{
            id,
            quantity: 1,
            // Hidden from cart/checkout (leading _). Saved on the order line as source = find_shade.
            properties: { _source: 'find_shade' },
          }],
          sections: cartSectionsParam(),
          sections_url: window.location.pathname,
        }),
      })
        .then(async (response) => {
          const responseJson = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(responseJson.description || 'Add to cart failed');
          return responseJson;
        })
        .then((responseJson) => publishThemeCart(responseJson))
        .then(() => {
          this.#setOpen(false);
        })
        .catch(() => {
          button.disabled = false;
          button.textContent = this.#label('error', 'Could not add to bag');
          this.#adding = false;
        });
    };

    #setStatus(text) {
      if (this.#status) this.#status.textContent = text || '';
    }
  }

  root.FmMakeupScanLoaded = true;
  if (root.customElements && !root.customElements.get('fm-makeup-pdp')) {
    root.customElements.define('fm-makeup-pdp', FmMakeupPdp);
  }
})();
