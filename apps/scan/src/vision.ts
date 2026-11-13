import { FRAME_MAX_EDGE, type Landmark } from '@tryon/shared';

const VISION_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
const VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface VideoLandmarker {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { faceLandmarks?: Landmark[][] };
}

let videoLandmarkerPromise: Promise<VideoLandmarker> | null = null;

async function loadLandmarker(runningMode: 'VIDEO'): Promise<VideoLandmarker> {
  const vision = await import(/* @vite-ignore */ VISION_MODULE);
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
}

export function getVideoLandmarker(): Promise<VideoLandmarker> {
  if (!videoLandmarkerPromise) {
    videoLandmarkerPromise = loadLandmarker('VIDEO').catch((error) => {
      videoLandmarkerPromise = null;
      throw error;
    });
  }
  return videoLandmarkerPromise;
}

export function resetVideoLandmarker(): void {
  videoLandmarkerPromise = null;
}

export function requestCameraStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user' },
  });
}

/** Draws the current video frame (max 640px edge) and returns its pixels. */
export function drawVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): ImageData {
  const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
