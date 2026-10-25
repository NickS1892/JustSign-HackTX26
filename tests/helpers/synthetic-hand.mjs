/**
 * Builds the 21 MediaPipe hand landmarks for a described handshape, so the
 * recognition tests exercise the real feature maths instead of hand-written
 * feature vectors.
 *
 * The hand sits with its wrist at the origin and its fingers pointing along
 * -y. Fingers curl out of that plane toward +z, the way they fold onto the
 * palm, so a full curl really does bring the fingertip back to the knuckles.
 * `rotateDeg` turns the whole hand in the image plane for the letters that are
 * the same shape pointed a different way (G, H, P, Q).
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

/** Midpoint between two neighbouring fingers' middle joints. */
function gapPoint(landmarks, first, second) {
  const a = landmarks[first];
  const b = landmarks[second];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

const GAPS = { indexGap: [6, 10], middleGap: [10, 14], ringGap: [14, 18] };

/**
 * @param {{
 *   curl?: number[],        // index, middle, ring, pinky: 0 straight … 1 folded
 *   spreadDeg?: number[],   // fan each finger sideways
 *   thumb?: { curl?: number, splayDeg?: number, reachTo?: keyof typeof GAPS, lift?: number },
 *   crossIndexMiddle?: boolean,  // R: the middle finger crosses over the index
 *   rotateDeg?: number,          // turn the whole hand in the image plane
 * }} shape
 */
export function makeHand(shape = {}) {
  const curls = shape.curl ?? [0, 0, 0, 0];
  const spreads = shape.spreadDeg ?? [0, 0, 0, 0];
  const thumb = { curl: 0, splayDeg: 35, lift: 0, ...(shape.thumb ?? {}) };

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

  // R crosses the middle finger over the index: the tips swap sides while the
  // knuckles stay put, which is exactly what the converge feature looks for.
  if (shape.crossIndexMiddle) {
    for (const [a, b] of [[7, 11], [8, 12]]) {
      const ax = landmarks[a].x;
      const bx = landmarks[b].x;
      const middle = (ax + bx) / 2;
      const overlap = (bx - ax) * 0.15;
      landmarks[a] = { ...landmarks[a], x: middle + overlap };
      landmarks[b] = { ...landmarks[b], x: middle - overlap };
    }
  }

  // K, M, N, S and T all put the thumb at a particular finger gap; aim the
  // whole thumb chain at that point instead of guessing a splay angle.
  if (thumb.reachTo) {
    const [first, second] = GAPS[thumb.reachTo];
    const target = gapPoint(landmarks, first, second);
    target.y -= thumb.lift * 0.12;
    const base = landmarks[1];
    for (let i = 1; i <= 3; i++) {
      const fraction = i / 3;
      landmarks[i + 1] = {
        x: base.x + (target.x - base.x) * fraction,
        y: base.y + (target.y - base.y) * fraction,
        z: base.z + (target.z - base.z) * fraction + Math.sin(fraction * Math.PI) * 0.03,
      };
    }
  }

  if (shape.rotateDeg) {
    const angle = (shape.rotateDeg * Math.PI) / 180;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    return landmarks.map(p => ({ x: p.x * c - p.y * sn, y: p.x * sn + p.y * c, z: p.z }));
  }
  return landmarks;
}

/** Ready-made shapes the tests reach for repeatedly. */
export const SHAPES = {
  // Not a letter: an open, spread hand should match nothing in the table.
  open: { curl: [0, 0, 0, 0], spreadDeg: [-22, -7, 8, 24], thumb: { curl: 0, splayDeg: 72 } },
  halfway: { curl: [0.5, 0.5, 0.5, 0.5], thumb: { curl: 0.5, splayDeg: 45 } },

  A: { curl: [1, 1, 1, 1], thumb: { curl: 0.3, splayDeg: 30 } },
  B: { curl: [0, 0, 0, 0], thumb: { curl: 0.3, splayDeg: 14 } },
  C: { curl: [0.45, 0.45, 0.45, 0.45], thumb: { curl: 0.45, splayDeg: 50 } },
  D: { curl: [0, 0.8, 0.85, 0.85], thumb: { curl: 0.5, splayDeg: 22 } },
  E: { curl: [0.72, 0.72, 0.72, 0.72], thumb: { curl: 0.5, splayDeg: 10 } },
  F: { curl: [0.62, 0, 0, 0], spreadDeg: [0, -3, 4, 12], thumb: { curl: 0.5, splayDeg: 14 } },
  G: { curl: [0, 1, 1, 1], thumb: { curl: 0.2, splayDeg: 18 }, rotateDeg: 90 },
  H: { curl: [0, 0, 1, 1], thumb: { curl: 0.5, splayDeg: 16 }, rotateDeg: 90 },
  I: { curl: [1, 1, 1, 0], thumb: { curl: 0.3, splayDeg: 14 } },
  J: { curl: [1, 1, 1, 0], thumb: { curl: 0.3, splayDeg: 14 } },
  K: { curl: [0, 0, 1, 1], spreadDeg: [-15, 15, 0, 0], thumb: { reachTo: 'indexGap', lift: 0.6 } },
  L: { curl: [0, 1, 1, 1], thumb: { curl: 0, splayDeg: 88 } },
  M: { curl: [1, 1, 1, 1], thumb: { reachTo: 'ringGap' } },
  N: { curl: [1, 1, 1, 1], thumb: { reachTo: 'middleGap' } },
  O: { curl: [0.55, 0.55, 0.55, 0.55], spreadDeg: [13, 4, -5, -15], thumb: { curl: 0.45, splayDeg: 14 } },
  P: { curl: [0, 0, 1, 1], spreadDeg: [-15, 15, 0, 0], thumb: { reachTo: 'indexGap', lift: 0.6 }, rotateDeg: 180 },
  Q: { curl: [0, 1, 1, 1], thumb: { curl: 0.2, splayDeg: 18 }, rotateDeg: 180 },
  R: { curl: [0.08, 0.08, 1, 1], thumb: { curl: 0.5, splayDeg: 16 }, crossIndexMiddle: true },
  S: { curl: [1, 1, 1, 1], thumb: { curl: 0.45, splayDeg: 72 } },
  T: { curl: [1, 1, 1, 1], thumb: { reachTo: 'indexGap', lift: 0.5 } },
  U: { curl: [0, 0, 1, 1], thumb: { curl: 0.3, splayDeg: 14 } },
  V: { curl: [0, 0, 1, 1], spreadDeg: [-18, 18, 0, 0], thumb: { curl: 0.3, splayDeg: 14 } },
  W: { curl: [0, 0, 0, 1], spreadDeg: [-16, 0, 16, 0], thumb: { curl: 0.3, splayDeg: 16 } },
  X: { curl: [0.5, 1, 1, 1], thumb: { curl: 0.5, splayDeg: 20 } },
  Y: { curl: [1, 1, 1, 0], thumb: { curl: 0, splayDeg: 88 } },
  Z: { curl: [0, 1, 1, 1], thumb: { curl: 0.4, splayDeg: 20 } },
  HORNS: { curl: [0, 1, 1, 0], thumb: { curl: 0.4, splayDeg: 18 } },
};
