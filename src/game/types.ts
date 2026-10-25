export interface Landmark { x: number; y: number; z: number }

/** MediaPipe reports which hand it believes it saw; recognition does not depend on it. */
export type Handedness = 'Left' | 'Right';

export interface HandObservation {
  /** The 21 hand landmarks, in unmirrored image coordinates. */
  landmarks: Landmark[];
  handedness: Handedness;
  /** Tracker confidence that a hand is present, 0–1. */
  score: number;
}

export interface TrackedFrame {
  timestampMs: number;
  hands: HandObservation[];
}

/** A small adapter contract for Person 1's camera / landmark implementation. */
export interface HandTracker {
  detect(source: HTMLVideoElement, timestampMs: number): TrackedFrame;
  close(): void;
}

/**
 * Every measurement the sign database is allowed to constrain. All are 0–1,
 * scale free and mirror invariant, so a sign reads the same from either hand.
 */
export type FeatureKey =
  | 'thumbExtension'
  | 'indexExtension'
  | 'middleExtension'
  | 'ringExtension'
  | 'pinkyExtension'
  | 'indexMiddleSpread'
  | 'middleRingSpread'
  | 'ringPinkySpread'
  | 'thumbSplay'
  | 'thumbIndexPinch'
  | 'thumbMiddlePinch'
  | 'thumbAcrossPalm'
  | 'fingertipGather';

export type FeatureVector = Readonly<Record<FeatureKey, number>>;

/** One tunable band in a sign definition: `value` should sit between min and max. */
export interface Expectation {
  key: FeatureKey;
  min?: number;
  max?: number;
  /** Relative importance inside its sign. Defaults to 1. */
  weight?: number;
  /** How far outside the band still earns partial credit. Defaults to 0.18. */
  softness?: number;
  /** Shown as coaching when this is the weakest part of the attempt. */
  coach: string;
}

export interface SignDefinition {
  id: string;
  /** The letter as it is written, e.g. "A". */
  letter: string;
  /** How the shape is described to the player. */
  label: string;
  hint: string;
  expects: readonly Expectation[];
}

export interface Recognition {
  /** The database entry that best explains the hand, or undefined if none did. */
  sign?: SignDefinition;
  /** How well `sign` fits, 0–1. */
  confidence: number;
  /** How well the runner-up fits, used to reject ambiguous shapes. */
  runnerUp: number;
}

export interface SignAttempt {
  letter: string;
  label: string;
  /** Highest confidence reached for the target during the round, 0–100. */
  bestMatch: number;
  /** Milliseconds from the round opening to the sign being held. */
  timeMs: number;
  completed: boolean;
  points: number;
}
