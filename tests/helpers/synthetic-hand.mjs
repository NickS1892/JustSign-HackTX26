/**
 * Builds the 21 MediaPipe hand landmarks for a described handshape, so the
 * recognition tests exercise the real feature maths instead of hand-written
 * feature vectors.
 *
 * The hand sits with its wrist at the origin and its fingers pointing along
 * -y. Fingers curl out of that plane toward +z, the way they fold onto the
 * palm, so a full curl really does bring the fingertip back to the knuckles.
 */

const FINGERS = [
  { name: 'index', mcp: { x: -0.085, y: -0.33, z: 0 }, segments: [0.126, 0.099, 0.075] },
  { name: 'middle', mcp: { x: -0.028, y: -0.35, z: 0 }, segments: [0.134, 0.106, 0.08 ] },
  { name: 'ring', mcp: { x: 0.028, y: -0.34, z: 0 }, segments: [0.126, 0.099, 0.075 ] },
  { name: 'pinky', mcp: { x: 0.082, y: -0.3, z: 0 }, segments: [0.101, 0.079, 0.06 ] },
];

const add = (p, v, s) => ({ x: p.x + v.x * s, y: p.y + v.y * s, z: p.z + v.z * s });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
function unit(v) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
/** Rotates `v` about `axis` by `angle` radians. */
function rotate(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return { x: v.x * c + k.x * s + axis.x * d, y: v.y * c + k.y * s + axis.y * d, z: v.z * c + k.z * s + axis.z * d };
}

/** One finger: flexes by the same amount at the knuckle and both joints. */
function fingerJoints(mcp, segments, curl, spreadRad, bendPerJoint) {
  let direction = { x: Math.sin(spreadRad), y: -Math.cos(spreadRad), z: 0 };
  const axis = unit(cross(direction, { x: 0, y: 0, z: 1 }));
  const joints = [mcp];
  for (const length of segments) {
    direction = rotate(direction, axis, curl * bendPerJoint);
    joints.push(add(joints[joints.length - 1], direction, length));
  }
  return joints;
}

/**
 * @param {{
 *   curl?: number[],        // index, middle, ring, pinky: 0 straight … 1 folded
 *   spreadDeg?: number[],   // fan each finger sideways
 *   thumb?: { curl?: number, splayDeg?: number },
 * }} shape
 */
export function makeHand(shape = {}) {
  const curls = shape.curl ?? [0, 0, 0, 0];
  const spreads = shape.spreadDeg ?? [0, 0, 0, 0];
  const thumb = { curl: 0, splayDeg: 35, ...(shape.thumb ?? {}) };

  const landmarks = [{ x: 0, y: 0, z: 0 }];

  // Thumb: a small splay keeps it up the palm toward the knuckles (A, B, I);
  // a large one swings it out to the side of the hand (L, Y).
  const splay = (thumb.splayDeg * Math.PI) / 180;
  let direction = unit({ x: -Math.sin(splay), y: -Math.cos(splay), z: 0 });
  const axis = unit(cross(direction, { x: 0, y: 0, z: 1 }));
  let joint = { x: -0.07, y: -0.08, z: 0 };
  landmarks.push(joint);
  for (const length of [0.095, 0.085, 0.08]) {
    direction = rotate(direction, axis, thumb.curl * 0.8);
    joint = add(joint, direction, length);
    landmarks.push(joint);
  }

  FINGERS.forEach((finger, i) => {
    landmarks.push(...fingerJoints(finger.mcp, finger.segments, curls[i], (spreads[i] * Math.PI) / 180, 1.5));
  });
  return landmarks;
}

/** Ready-made shapes the tests reach for repeatedly. */
export const SHAPES = {
  open: { curl: [0, 0, 0, 0], spreadDeg: [-22, -7, 8, 24], thumb: { curl: 0, splayDeg: 72 } },
  fist: { curl: [1, 1, 1, 1], thumb: { curl: 0.3, splayDeg: 12 } },
  flatB: { curl: [0, 0, 0, 0], thumb: { curl: 0.3, splayDeg: 14 } },
  pointL: { curl: [0, 1, 1, 1], thumb: { curl: 0, splayDeg: 88 } },
  pinkyI: { curl: [1, 1, 1, 0], thumb: { curl: 0.3, splayDeg: 14 } },
  peaceV: { curl: [0, 0, 1, 1], spreadDeg: [-18, 18, 0, 0], thumb: { curl: 0.3, splayDeg: 14 } },
  threeW: { curl: [0, 0, 0, 1], spreadDeg: [-16, 0, 16, 0], thumb: { curl: 0.3, splayDeg: 16 } },
  shakaY: { curl: [1, 1, 1, 0], thumb: { curl: 0, splayDeg: 88 } },
  curveC: { curl: [0.45, 0.45, 0.45, 0.45], thumb: { curl: 0.45, splayDeg: 50 } },
  roundO: { curl: [0.62, 0.62, 0.62, 0.62], spreadDeg: [13, 4, -5, -15], thumb: { curl: 0.5, splayDeg: 12 } },
  pointD: { curl: [0, 0.8, 0.85, 0.85], thumb: { curl: 0.5, splayDeg: 22 } },
  halfway: { curl: [0.5, 0.5, 0.5, 0.5], thumb: { curl: 0.5, splayDeg: 45 } },
};
