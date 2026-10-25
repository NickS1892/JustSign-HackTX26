import { GAME_CONFIG as C } from './config';
import { allSigns } from './sign-database';
import type {
  Expectation,
  FeatureVector,
  HandObservation,
  Landmark,
  Recognition,
  SignDefinition,
} from './types';

const WRIST = 0;
const CHAINS: Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', readonly number[]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const finite = (p: Landmark | undefined): p is Landmark => !!p && [p.x, p.y, p.z].every(Number.isFinite);
const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const remap = (v: number, low: number, high: number) => clamp01((v - low) / (high - low));

function angleBetween(a: Landmark, b: Landmark, c: Landmark, d: Landmark): number {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v = { x: d.x - c.x, y: d.y - c.y, z: d.z - c.z };
  const lu = Math.hypot(u.x, u.y, u.z);
  const lv = Math.hypot(v.x, v.y, v.z);
  if (lu < 1e-9 || lv < 1e-9) return 0;
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (lu * lv);
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

/** Total bend along a joint chain, in radians: 0 is a perfectly straight finger. */
function totalTurn(points: Landmark[]): number {
  let turn = 0;
  for (let i = 0; i + 2 < points.length; i++) turn += angleBetween(points[i], points[i + 1], points[i + 1], points[i + 2]);
  return turn;
}

function chainLength(points: Landmark[]): number {
  let length = 0;
  for (let i = 0; i + 1 < points.length; i++) length += dist(points[i], points[i + 1]);
  return length;
}

/**
 * How straight a finger is, 0–1, from two independent cues: how far the tip
 * reaches from the wrist compared with the length of the finger itself, and
 * how much the joints turn. Both are ratios of distances or angles, so the
 * result does not change with hand size, camera distance or rotation.
 */
function extension(hand: Landmark[], chain: readonly number[]): number {
  const joints = [hand[WRIST], ...chain.map(i => hand[i])];
  const length = chainLength(joints);
  if (length < 1e-9) return 0;
  const reach = remap(dist(joints[0], joints[joints.length - 1]) / length, 0.5, 0.92);
  const straight = clamp01(1 - totalTurn(joints) / 4.4);
  return 0.45 * reach + 0.55 * straight;
}

/** The thumb hinges off the side of the palm, so it is measured on its own chain. */
function thumbExtension(hand: Landmark[]): number {
  const joints = CHAINS.thumb.map(i => hand[i]);
  const length = chainLength(joints);
  if (length < 1e-9) return 0;
  const reach = remap(dist(joints[0], joints[3]) / length, 0.62, 0.97);
  const straight = clamp01(1 - totalTurn(joints) / 2.6);
  return 0.45 * reach + 0.55 * straight;
}

/**
 * How far two neighbouring fingers fan apart, as the angle between them.
 * Fingertip separation would do as well if fingers were the same length; the
 * angle stays near zero for parallel fingers whatever their length.
 */
function spread(hand: Landmark[], a: keyof typeof CHAINS, b: keyof typeof CHAINS): number {
  const angle = angleBetween(
    hand[CHAINS[a][0]], hand[CHAINS[a][3]],
    hand[CHAINS[b][0]], hand[CHAINS[b][3]],
  );
  return remap(angle, 0.06, 0.5);
}

/**
 * Turns 21 landmarks into the scale-free, rotation-free, mirror-free
 * measurements the sign database is written against. Nothing here depends on
 * which hand is signing or which way it faces, so left-handed signers and a
 * mirrored camera preview both work without special cases.
 */
export function extractFeatures(landmarks: Landmark[]): FeatureVector | null {
  if (landmarks.length !== 21 || !landmarks.every(finite)) return null;
  const palm = dist(landmarks[WRIST], landmarks[CHAINS.middle[0]]);
  if (palm < 1e-6) return null;

  const tips = [CHAINS.thumb[3], CHAINS.index[3], CHAINS.middle[3], CHAINS.ring[3], CHAINS.pinky[3]].map(i => landmarks[i]);
  let pairs = 0;
  let gathered = 0;
  for (let i = 0; i < tips.length; i++) for (let j = i + 1; j < tips.length; j++) { gathered += dist(tips[i], tips[j]); pairs++; }

  const thumbTip = landmarks[CHAINS.thumb[3]];
  // How close the thumb comes to the knuckle row: high when it is folded in
  // over the palm, low when it is held out at the side of the hand.
  const overFingers = Math.min(
    ...[CHAINS.index[0], CHAINS.middle[0], CHAINS.ring[0]].map(i => dist(thumbTip, landmarks[i])),
  );

  return {
    thumbExtension: thumbExtension(landmarks),
    indexExtension: extension(landmarks, CHAINS.index),
    middleExtension: extension(landmarks, CHAINS.middle),
    ringExtension: extension(landmarks, CHAINS.ring),
    pinkyExtension: extension(landmarks, CHAINS.pinky),
    indexMiddleSpread: spread(landmarks, 'index', 'middle'),
    middleRingSpread: spread(landmarks, 'middle', 'ring'),
    ringPinkySpread: spread(landmarks, 'ring', 'pinky'),
    // Unsigned angle from the palm's long axis: 0 alongside the hand, 1 straight out.
    thumbSplay: remap(
      angleBetween(landmarks[CHAINS.thumb[0]], thumbTip, landmarks[WRIST], landmarks[CHAINS.middle[0]]),
      0.3,
      1.25,
    ),
    thumbIndexPinch: 1 - remap(dist(thumbTip, landmarks[CHAINS.index[3]]) / palm, 0, 0.9),
    thumbMiddlePinch: 1 - remap(dist(thumbTip, landmarks[CHAINS.middle[3]]) / palm, 0, 0.9),
    thumbAcrossPalm: 1 - remap(overFingers / palm, 0, 1),
    fingertipGather: 1 - remap(gathered / pairs / palm, 0, 0.75),
  };
}

/** 1 inside the band, falling off linearly over `softness` outside it. */
export function satisfaction(value: number, expectation: Expectation): number {
  const softness = expectation.softness ?? 0.18;
  const low = expectation.min ?? -Infinity;
  const high = expectation.max ?? Infinity;
  if (value >= low && value <= high) return 1;
  return clamp01(1 - (value < low ? low - value : value - high) / softness);
}

export interface SignScore {
  confidence: number;
  /** The expectation the attempt meets worst, for live coaching. */
  weakest?: Expectation;
}

/**
 * How well a hand fits one database row. The weighted mean is scaled by the
 * worst-met expectation so that an otherwise perfect shape with one finger in
 * the wrong place cannot quietly pass.
 */
export function scoreSign(features: FeatureVector, sign: SignDefinition): SignScore {
  let total = 0;
  let weights = 0;
  let worst = 1;
  let weakest: Expectation | undefined;
  for (const expectation of sign.expects) {
    const met = satisfaction(features[expectation.key], expectation);
    const weight = expectation.weight ?? 1;
    total += met * weight;
    weights += weight;
    if (met < worst) { worst = met; weakest = expectation; }
  }
  if (!weights) return { confidence: 0 };
  return { confidence: (total / weights) * (0.6 + 0.4 * worst), weakest };
}

/** The database row that best explains one already-extracted hand. */
export function recognizeFeatures(features: FeatureVector): Recognition {
  let best: Recognition = { confidence: 0, runnerUp: 0 };
  for (const sign of allSigns()) {
    const { confidence } = scoreSign(features, sign);
    if (confidence > best.confidence) best = { sign, confidence, runnerUp: best.confidence };
    else if (confidence > best.runnerUp) best = { ...best, runnerUp: confidence };
  }
  return best;
}

/** The database row that best explains one hand, with the runner-up alongside. */
export function recognizeHand(landmarks: Landmark[]): Recognition {
  const features = extractFeatures(landmarks);
  return features ? recognizeFeatures(features) : { confidence: 0, runnerUp: 0 };
}

/** The best reading across every hand currently in frame. */
export function recognizeFrame(hands: readonly HandObservation[]): Recognition {
  let best: Recognition = { confidence: 0, runnerUp: 0 };
  for (const hand of hands) {
    if (hand.score < C.minHandScore) continue;
    const reading = recognizeHand(hand.landmarks);
    if (reading.confidence > best.confidence) best = reading;
  }
  return best;
}

export interface TargetEvaluation {
  /** The closest any hand in frame comes to the target, 0–1. */
  confidence: number;
  /** True when some hand holds the target well enough, and reads as it. */
  matching: boolean;
  /** What that hand is doing worst, for live coaching. */
  weakest?: Expectation;
}

/**
 * Judges a frame against the sign the player was asked for.
 *
 * Each hand is judged on its own, so a second hand resting in shot can never
 * outvote the signing one: the round passes as soon as any single hand both
 * fits the target and reads as the target rather than as some other letter.
 */
export function evaluateTarget(hands: readonly HandObservation[], target: SignDefinition): TargetEvaluation {
  let confidence = 0;
  let matching = false;
  let weakest: Expectation | undefined;
  for (const hand of hands) {
    if (hand.score < C.minHandScore) continue;
    const features = extractFeatures(hand.landmarks);
    if (!features) continue;
    const scored = scoreSign(features, target);
    if (scored.confidence > confidence) { confidence = scored.confidence; weakest = scored.weakest; }
    if (scored.confidence >= C.minConfidence && recognizeFeatures(features).sign?.id === target.id) matching = true;
  }
  return { confidence, matching, weakest };
}

/** True when a reading is confident enough, and clear enough of the runner-up, to act on. */
export function isDecisive(reading: Recognition): boolean {
  return !!reading.sign && reading.confidence >= C.minConfidence && reading.confidence - reading.runnerUp >= C.minMargin;
}

/**
 * Accumulates how long the right shape has been held.
 *
 * The player is never asked to be in position at a particular moment: the
 * round is won the instant the shape has been held for `holdMs`, whenever that
 * happens. A short drop-out — a frame where the hand blurs or the tracker loses
 * a finger — is absorbed by `holdGraceMs` instead of starting the hold over.
 */
export class HoldTracker {
  private held = 0;
  private slack = 0;
  private last?: number;

  private holdMs: number;
  private graceMs: number;

  constructor(holdMs: number = C.holdMs, graceMs: number = C.holdGraceMs) {
    this.holdMs = holdMs;
    this.graceMs = graceMs;
  }

  reset(): void {
    this.held = 0;
    this.slack = 0;
    this.last = undefined;
  }

  /** Feeds one sample and returns how much of the hold is complete, 0–1. */
  update(nowMs: number, matching: boolean): number {
    // A long pause (a hidden tab, a stalled camera) must not bank hold time.
    const delta = this.last === undefined ? 0 : Math.min(250, Math.max(0, nowMs - this.last));
    this.last = nowMs;
    if (matching) {
      this.held += delta;
      this.slack = 0;
    } else if (this.held > 0) {
      this.slack += delta;
      if (this.slack > this.graceMs) { this.held = 0; this.slack = 0; }
    }
    return this.progress;
  }

  get progress(): number {
    return clamp01(this.held / this.holdMs);
  }

  get complete(): boolean {
    return this.held >= this.holdMs;
  }
}
