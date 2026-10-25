import { GAME_CONFIG as C } from './config';
import type { Landmark, MatchResult, SignFrame } from './types';

type Feature = { body: number[]; left: number[] | null; right: number[] | null };
const finite = (p: Landmark | undefined): p is Landmark => !!p && [p.x, p.y, p.z].every(Number.isFinite);
const visible = (p: Landmark | undefined): p is Landmark => finite(p) && (p.visibility ?? 1) >= 0.5;

/** Body coordinates retain hand location; wrist-relative coordinates retain finger shape.
 * Only image x/y are used: independently estimated hand/pose z origins are incompatible. */
export function normalizeFrame(frame: SignFrame): Feature | null {
  const a = frame.pose[11], b = frame.pose[12];
  if (!visible(a) || !visible(b)) return null;
  const scale = Math.hypot(a.x - b.x, a.y - b.y);
  if (scale < 0.03) return null;
  const origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const body: number[] = [];
  for (const i of [0, 13, 14]) {
    const p = frame.pose[i];
    if (!visible(p)) return null;
    body.push((p.x - origin.x) / scale, (p.y - origin.y) / scale);
  }
  function hand(points: Landmark[]): number[] | null {
    if (points.length !== 21 || !points.every(finite)) return null;
    const wrist = points[0];
    const palm = Math.hypot(points[9].x - wrist.x, points[9].y - wrist.y);
    if (palm < 0.005) return null;
    // Hand position is as important as shape (e.g. signs at the chin vs forehead).
    const out = [(wrist.x - origin.x) / scale, (wrist.y - origin.y) / scale];
    for (const p of points.slice(1)) out.push((p.x - wrist.x) / palm, (p.y - wrist.y) / palm);
    return out;
  }
  return { body, left: hand(frame.leftHand), right: hand(frame.rightHand) };
}

const rms = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
function distance(a: Feature | null, b: Feature | null): number {
  if (!a || !b) return 2;
  const hand = (x: number[] | null, y: number[] | null) => x && y ? 0.55 * rms(x.slice(0, 2), y.slice(0, 2)) + 0.45 * rms(x.slice(2), y.slice(2)) : x || y ? 2 : 0;
  const count = Number(!!a.left || !!b.left) + Number(!!a.right || !!b.right);
  return 0.2 * rms(a.body, b.body) + 0.8 * (hand(a.left, b.left) + hand(a.right, b.right)) / Math.max(1, count);
}

/** Explicit mirror mode swaps anatomical hands and reflects x before normalization. */
export function mirrorFrame(frame: SignFrame): SignFrame {
  const flip = (ps: Landmark[]) => ps.map(p => ({ ...p, x: 1 - p.x }));
  const pose = flip(frame.pose);
  for (const [a, b] of [[11, 12], [13, 14], [15, 16]]) [pose[a], pose[b]] = [pose[b], pose[a]];
  return { timestampMs: frame.timestampMs, pose, leftHand: flip(frame.rightHand), rightHand: flip(frame.leftHand) };
}

function timeline(frames: SignFrame[], durationMs: number): Array<Feature | null> {
  const sorted = frames.filter(f => Number.isFinite(f.timestampMs) && f.timestampMs >= 0 && f.timestampMs <= durationMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  let index = 0;
  return Array.from({ length: Math.max(2, Math.ceil(durationMs / 1000 * C.sampleFps)) }, (_, i) => {
    const t = i * 1000 / C.sampleFps;
    while (index + 1 < sorted.length && Math.abs(sorted[index + 1].timestampMs - t) <= Math.abs(sorted[index].timestampMs - t)) index++;
    const f = sorted[index];
    // Tracking gaps remain gaps; a single frame cannot fill a whole performance.
    return f && Math.abs(f.timestampMs - t) <= 1000 / C.sampleFps * 0.75 ? normalizeFrame(f) : null;
  });
}

export function compareSigns(reference: SignFrame[], attempt: SignFrame[], durationMs: number, mirror = false): MatchResult {
  const fail = (feedback: string): MatchResult => ({ score: 0, completed: false, movementScore: 0, timingScore: 0, coverage: 0, feedback });
  if (!Number.isFinite(durationMs) || durationMs < C.minVideoSeconds * 1000 || durationMs > C.maxVideoSeconds * 1000) return fail('Invalid reference duration.');
  if (reference.length < C.minFrames || attempt.length < C.minFrames) return fail('Keep your upper body and hands in frame for the full sign.');
  const ref = timeline(reference, durationMs), user = timeline(mirror ? attempt.map(mirrorFrame) : attempt, durationMs);
  const valid = (r: Feature | null, u: Feature | null) => !!r && !!u && (!!r.left || !!r.right) && (!r.left || !!u.left) && (!r.right || !!u.right);
  const referenceCoverage = ref.filter(r => r && (r.left || r.right)).length / ref.length;
  if (referenceCoverage < C.minCoverage) return fail('Reference tracking is incomplete. Import a clearer video.');
  const coverage = ref.filter((r, i) => valid(r, user[i])).length / ref.length;
  const n = ref.length, window = Math.ceil(n * C.alignmentWindow);
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const steps = Array.from({ length: n + 1 }, () => new Uint16Array(n + 1));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(1, i - window); j <= Math.min(n, i + window); j++) {
    const candidates = [[i - 1, j - 1], [i - 1, j], [i, j - 1]];
    const [a, b] = candidates.reduce((best, p) => dp[p[0]][p[1]] < dp[best[0]][best[1]] ? p : best);
    dp[i][j] = dp[a][b] + distance(ref[i - 1], user[j - 1]);
    steps[i][j] = steps[a][b] + 1;
  }
  const toScore = (cost: number) => Math.round(100 * Math.exp(-cost / C.spatialTolerance));
  const movementScore = toScore(dp[n][n] / steps[n][n]);
  // Unwarped error measures whether the same pose occurred at the expected time.
  const timingScore = toScore(ref.reduce((s, r, i) => s + distance(r, user[i]), 0) / n);
  const score = Math.round((movementScore * 0.8 + timingScore * 0.2) * coverage);
  const completed = coverage >= C.minCoverage && score >= C.completionScore;
  const feedback = coverage < C.minCoverage ? 'Tracking lost: keep your face, shoulders and hands visible.'
    : completed ? 'Sign completed! Great movement and hand placement.'
    : timingScore < movementScore - 12 ? 'Good shapes. Follow the demonstration timing more closely.'
    : 'Try matching the finger shapes and hand position more closely.';
  return { score, completed, movementScore, timingScore, coverage, feedback };
}
