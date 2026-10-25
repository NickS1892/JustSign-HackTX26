import { FilesetResolver, HolisticLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { fetchModelBytes } from '../components/model-cache';
import type { SignTracker } from './types';

/** Person 1 may replace this adapter without changing extraction, matching or UI. */
export async function createSignTracker(): Promise<SignTracker> {
  const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
  const bytes = await fetchModelBytes('https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task');
  let model: HolisticLandmarker;
  try {
    model = await HolisticLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: new Uint8Array(bytes), delegate: 'GPU' }, runningMode: 'IMAGE',
    });
  } catch {
    model = await HolisticLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: new Uint8Array(bytes), delegate: 'CPU' }, runningMode: 'IMAGE',
    });
  }
  let hands: HandLandmarker;
  try {
    hands = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numHands: 2,
    });
  } catch (error) { model.close(); throw error; }
  return {
    detectHands(source, timestampMs) {
      const result = hands.detect(source);
      return { timestampMs, pose: [], leftHand: result.landmarks[0] ?? [], rightHand: result.landmarks[1] ?? [] };
    },
    detect(video, timestampMs) {
      const result = model.detect(video);
      return { timestampMs, pose: result.poseLandmarks[0] ?? [], leftHand: result.leftHandLandmarks[0] ?? [], rightHand: result.rightHandLandmarks[0] ?? [] };
    },
    close: () => { model.close(); hands.close(); },
  };
}

