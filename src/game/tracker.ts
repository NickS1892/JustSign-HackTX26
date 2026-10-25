import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { fetchModelBytes } from '../components/model-cache';
import type { HandTracker, Handedness } from './types';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** Person 1 may replace this adapter without changing recognition or the UI. */
export async function createHandTracker(): Promise<HandTracker> {
  const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
  const bytes = await fetchModelBytes(MODEL);
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetBuffer: new Uint8Array(bytes), delegate },
    runningMode: 'VIDEO' as const,
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let model: HandLandmarker;
  try {
    model = await HandLandmarker.createFromOptions(files, options('GPU'));
  } catch {
    model = await HandLandmarker.createFromOptions(files, options('CPU'));
  }

  // VIDEO mode rejects a timestamp that does not advance, which happens when
  // two samples land in the same millisecond on a fast machine.
  let lastTimestamp = -1;
  return {
    detect(video, timestampMs) {
      const timestamp = Math.max(timestampMs, lastTimestamp + 1);
      lastTimestamp = timestamp;
      const result = model.detectForVideo(video, timestamp);
      const hands = result.landmarks.map((landmarks, i) => ({
        landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
        handedness: (result.handedness[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right') as Handedness,
        score: result.handedness[i]?.[0]?.score ?? 1,
      }));
      return { timestampMs: timestamp, hands };
    },
    close: () => model.close(),
  };
}
