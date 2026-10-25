import { GAME_CONFIG as C } from './config';
import { allSigns } from './sign-database';
import type {
  Expectation,
  FeatureVector,
  HandObservation,
  Landmark,
  MotionTemplate,
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

/** How much two neighbouring fingers have closed across each other, 0–1. */
function crossing(hand: Landmark[]): number {
  const [indexMcp, indexTip] = [hand[CHAINS.index[0]], hand[CHAINS.index[3]]];
  const [middleMcp, middleTip] = [hand[CHAINS.middle[0]], hand[CHAINS.middle[3]]];
  const along = {
    x: indexTip.x - indexMcp.x + middleTip.x - middleMcp.x,
    y: indexTip.y - indexMcp.y + middleTip.y - middleMcp.y,
    z: indexTip.z - indexMcp.z + middleTip.z - middleMcp.z,
  };
  const length = Math.hypot(along.x, along.y, along.z);
  if (length < 1e-9) return 0;
  const unit = { x: along.x / length, y: along.y / length, z: along.z / length };
  const across = (a: Landmark, b: Landmark) => {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const projected = d.x * unit.x + d.y * unit.y + d.z * unit.z;
    return Math.hypot(d.x - projected * unit.x, d.y - projected * unit.y, d.z - projected * unit.z);
  };
  const knuckles = across(indexMcp, middleMcp);
  if (knuckles < 1e-9) return 0;
  return 1 - remap(across(indexTip, middleTip) / knuckles, 0, 1.1);
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

  // Where the hand points, in image space: 1 fingers up, 0.5 sideways, 0 down.
  // Only the vertical component is used, so it stays mirror invariant while
  // separating K from P and G from Q.
  const palmAxisY = (landmarks[WRIST].y - landmarks[CHAINS.middle[0]].y) / palm;

  /**
   * Which gap between the fingers the thumb is tucked into — the one thing
   * that separates M, N and T, which are otherwise the same fist.
   *
   * The gaps are only a finger's width apart, so a plain distance reads high
   * for all three at once. Each gap is scored on how much *closer* the thumb
   * is to it than to its neighbours, then damped by how near the thumb is to
   * any of them at all, which keeps a thumb held out at the side near zero.
   */
  const gapDistance = (a: keyof typeof CHAINS, b: keyof typeof CHAINS) => {
    const first = landmarks[CHAINS[a][1]];
    const second = landmarks[CHAINS[b][1]];
    return dist(thumbTip, {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      z: (first.z + second.z) / 2,
    });
  };
  const gaps = {
    index: gapDistance('index', 'middle'),
    middle: gapDistance('middle', 'ring'),
    ring: gapDistance('ring', 'pinky'),
  };
  const inGap = (which: keyof typeof gaps) => {
    const mine = gaps[which];
    const nearestOther = Math.min(...Object.entries(gaps).filter(([k]) => k !== which).map(([, d]) => d));
    const proximity = 1 - remap(mine / palm, 0.1, 0.55);
    const relative = clamp01(0.5 + (nearestOther - mine) / (0.45 * palm));
    return proximity * relative;
  };

  // A folded finger lying over the thumb ends up closer to the wrist than the
  // thumb knuckle it covers; this reads the stacking without needing depth.
  const coveringTips = [CHAINS.index[3], CHAINS.middle[3], CHAINS.ring[3]].map(i => landmarks[i]);
  const thumbKnuckle = landmarks[CHAINS.thumb[1]];
  const covered = coveringTips.filter(tip => dist(tip, thumbKnuckle) < palm * 0.75).length;

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
    thumbRingPinch: 1 - remap(dist(thumbTip, landmarks[CHAINS.ring[3]]) / palm, 0, 0.9),
    thumbPinkyPinch: 1 - remap(dist(thumbTip, landmarks[CHAINS.pinky[3]]) / palm, 0, 0.9),
    thumbAcrossPalm: 1 - remap(overFingers / palm, 0, 1),
    fingertipGather: 1 - remap(gathered / pairs / palm, 0, 0.75),
    pointingUp: clamp01((palmAxisY + 1) / 2),
    thumbInIndexGap: inGap('index'),
    thumbInMiddleGap: inGap('middle'),
    thumbInRingGap: inGap('ring'),
    // Crossed fingers (R) end up side by side across the hand rather than
    // apart. Separation is measured across the fingers, ignoring how far
    // along them the tips sit, so two fingers of different lengths held
    // parallel still read as not crossed.
    indexMiddleConverge: crossing(landmarks),
    thumbUnderFingers: covered / 3,
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

/**
 * The database row that best explains one already-extracted hand.
 *
 * Signs that are a movement are left out: J and Z share their handshape with
 * I and a plain point, so a still frame can never be one. They are reached
 * only by being the round's target and completing their path.
 */
export function recognizeFeatures(features: FeatureVector): Recognition {
  let best: Recognition = { confidence: 0, runnerUp: 0 };
  for (const sign of allSigns()) {
    if (sign.motion) continue;
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
  /** The hand that fits best, for signs that also have a path to trace. */
  landmarks?: Landmark[];
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
  let landmarks: Landmark[] | undefined;
  for (const hand of hands) {
    if (hand.score < C.minHandScore) continue;
    const features = extractFeatures(hand.landmarks);
    if (!features) continue;
    const scored = scoreSign(features, target);
    if (scored.confidence > confidence) {
      confidence = scored.confidence;
      weakest = scored.weakest;
      landmarks = hand.landmarks;
    }
    if (scored.confidence < C.minConfidence) continue;
    // A moving sign shares its handshape with a still one (J with I, Z with a
    // plain point), so it is the path that tells them apart, not the argmax.
    if (target.motion || recognizeFeatures(features).sign?.id === target.id) matching = true;
  }
  return { confidence, matching, weakest, landmarks };
}

/** True when a reading is confident enough, and clear enough of the runner-up, to act on. */
export function isDecisive(reading: Recognition): boolean {
  return !!reading.sign && reading.confidence >= C.minConfidence && reading.confidence - reading.runnerUp >= C.minMargin;
}

/** Where a tracked fingertip was, in palm widths relative to the wrist. */
interface TipSample { t: number; x: number; y: number }

const TIP_INDEX: Record<MotionTemplate['tip'], number> = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
};

/**
 * Where the traced fingertip is on screen, in palm widths.
 *
 * Drawing a J or a Z moves the whole hand, so this has to be an absolute
 * position rather than one relative to the wrist. Dividing by palm width
 * keeps the distances the template asks for the same whether the signer is
 * close to the camera or far from it.
 */
export function tipPosition(landmarks: Landmark[], tip: MotionTemplate['tip']): TipSample | null {
  if (landmarks.length !== 21 || !landmarks.every(finite)) return null;
  const palm = dist(landmarks[WRIST], landmarks[CHAINS.middle[0]]);
  if (palm < 1e-6) return null;
  const point = landmarks[TIP_INDEX[tip]];
  // Image y grows downward; flip it so "up" in the template means up on screen.
  return { t: 0, x: point.x / palm, y: -point.y / palm };
}

/**
 * Watches a fingertip trace a path.
 *
 * J and Z are the only letters that are a movement rather than a pose, so they
 * need more than a held shape. The template lists legs the tip must travel in
 * order; each leg completes once the tip has moved far enough along its
 * direction since the previous leg finished. Travel is measured in palm
 * widths, so hand size and camera distance do not matter. Sideways legs
 * ignore which way, which keeps the path the same for a left-handed signer.
 * The handshape has to stay correct throughout, so an idle hand drifting
 * across the frame cannot complete a path.
 */
export class MotionTracker {
  private samples: TipSample[] = [];
  private leg = 0;
  private anchor?: TipSample;

  private template: MotionTemplate;

  constructor(template: MotionTemplate) {
    this.template = template;
  }

  reset(): void {
    this.samples = [];
    this.leg = 0;
    this.anchor = undefined;
  }

  /** Feeds one sample and returns how much of the path is done, 0–1. */
  update(nowMs: number, landmarks: Landmark[] | null): number {
    const sample = landmarks ? tipPosition(landmarks, this.template.tip) : null;
    if (!sample) {
      // Losing the hand drops the path: half a J is not a J.
      this.reset();
      return 0;
    }
    sample.t = nowMs;
    this.samples.push(sample);
    const cutoff = nowMs - this.template.windowMs;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    if (!this.anchor || this.anchor.t < cutoff) {
      this.anchor = this.samples[0];
      this.leg = 0;
    }

    for (let guard = 0; guard < this.template.legs.length && this.leg < this.template.legs.length; guard++) {
      const leg = this.template.legs[this.leg];
      const dx = sample.x - this.anchor.x;
      const dy = sample.y - this.anchor.y;
      const travelled =
        leg.direction === 'up' ? dy : leg.direction === 'down' ? -dy : Math.abs(dx);
      if (travelled < leg.travel) break;
      this.leg++;
      this.anchor = { ...sample };
    }
    return this.progress;
  }

  get progress(): number {
    return clamp01(this.leg / this.template.legs.length);
  }

  get complete(): boolean {
    return this.leg >= this.template.legs.length;
  }
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
