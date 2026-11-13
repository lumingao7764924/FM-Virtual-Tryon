import { averageTrimmedRgb, type Rgb } from './color.js';

/** Normalized MediaPipe face landmark (x/y in 0..1). */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

/** RGBA pixels, e.g. CanvasRenderingContext2D.getImageData(). */
export interface PixelBuffer {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface FaceGates {
  lighting: boolean;
  straight: boolean;
  position: boolean;
}

// Cheeks + jaw only for skin (forehead often hits bangs and skews light/dark).
export const CHEEK_AND_JAW = [50, 101, 280, 330, 172, 397];
// Keep pose locked long enough for autofocus + multi-frame average.
export const HOLD_CAPTURE_MS = 3000;
export const SKIN_SAMPLE_MAX = 10;
export const DETECT_INTERVAL_MS = 70;
export const FRAME_MAX_EDGE = 640;

export function sampleRegions(
  pixels: PixelBuffer,
  centers: { x: number; y: number }[],
  radius: number
): [number, number, number][] {
  const { width, height, data } = pixels;
  const seen = new Set<number>();
  const out: [number, number, number][] = [];
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
        out.push([data[index], data[index + 1], data[index + 2]]);
      }
    }
  });

  return out;
}

function landmarkPoint(landmarks: Landmark[] | null | undefined, index: number): Landmark | null {
  const point = landmarks?.[index];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

function faceWidthNorm(landmarks: Landmark[]): number {
  const left = landmarkPoint(landmarks, 234);
  const right = landmarkPoint(landmarks, 454);
  if (!left || !right) return 0;
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function faceChecks(
  landmarks: Landmark[] | null | undefined,
  extraFaces?: Landmark[][]
): { position: boolean; straight: boolean } {
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

function pixelLuma(pixels: [number, number, number][]): number | null {
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

export function lightingOk(pixels: PixelBuffer | null | undefined, landmarks: Landmark[] | null | undefined): boolean {
  if (!pixels?.width || !landmarks) return false;
  const { width, height } = pixels;
  const left = landmarkPoint(landmarks, 234);
  const right = landmarkPoint(landmarks, 454);
  if (!left || !right) return false;
  const faceWidth = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
  const radius = Math.max(4, faceWidth * 0.06);
  const lumas = [50, 280, 10]
    .map((index) => landmarkPoint(landmarks, index))
    .filter((point): point is Landmark => Boolean(point))
    .map((point) => pixelLuma(sampleRegions(pixels, [{ x: point.x * width, y: point.y * height }], radius)))
    .filter((value): value is number => value != null);
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

export function skinFromLandmarks(pixels: PixelBuffer, landmarks: Landmark[] | null | undefined): Rgb | null {
  if (!landmarks || landmarks.length < 300) return null;
  const { width, height } = pixels;
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
  return averageTrimmedRgb(sampleRegions(pixels, points, radius), 0.28, 0.08);
}
