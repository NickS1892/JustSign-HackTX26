export interface Landmark { x: number; y: number; z: number; visibility?: number }
/** Anatomical left/right, in unmirrored image coordinates; timestamp in milliseconds. */
export interface SignFrame {
  timestampMs: number;
  pose: Landmark[];
  leftHand: Landmark[];
  rightHand: Landmark[];
}
export interface SignReference {
  id: string;
  name: string;
  kind?: 'image' | 'video';
  videoUrl: string;
  durationMs: number;
  frames: SignFrame[];
}
export interface MatchResult {
  score: number;
  completed: boolean;
  movementScore: number;
  timingScore: number;
  coverage: number;
  feedback: string;
}
/** A small adapter contract for Person 1's camera / landmark implementation. */
export interface SignTracker {
  detect(source: HTMLVideoElement, timestampMs: number): SignFrame;
  detectHands?(source: HTMLVideoElement | HTMLImageElement, timestampMs: number): SignFrame;
  close(): void;
}

