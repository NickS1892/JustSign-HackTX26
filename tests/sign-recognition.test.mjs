// Run with Node 22+: node --test tests/sign-recognition.test.mjs
// No model download, camera or browser is required.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeHand, SHAPES } from './helpers/synthetic-hand.mjs';

const dir = await mkdtemp(join(tmpdir(), 'justsign-test-'));
for (const file of ['config', 'types', 'sign-database', 'recognizer']) {
  const source = await readFile(new URL(`../src/game/${file}.ts`, import.meta.url), 'utf8');
  await writeFile(
    join(dir, `${file}.mjs`),
    stripTypeScriptTypes(source).replace(/'\.\/(config|types|sign-database|recognizer)'/g, "'./$1.mjs'"),
  );
}
const recognizer = await import(pathToFileURL(join(dir, 'recognizer.mjs')));
const database = await import(pathToFileURL(join(dir, 'sign-database.mjs')));
const { GAME_CONFIG } = await import(pathToFileURL(join(dir, 'config.mjs')));
const {
  evaluateTarget, extractFeatures, isDecisive, recognizeFrame, recognizeHand,
  satisfaction, scoreSign, tipPosition, HoldTracker, MotionTracker,
} = recognizer;
const signOf = letter => database.allSigns().find(s => s.letter === letter);
after(() => rm(dir, { recursive: true, force: true }));

const feature = (shape, key) => extractFeatures(makeHand(shape))[key];
const close = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${a} is not within ${epsilon} of ${b}`);

/* ------------------------------- features ------------------------------ */

test('a straight finger reads as extended and a folded one does not', () => {
  assert.ok(feature(SHAPES.open, 'indexExtension') > 0.85);
  assert.ok(feature(SHAPES.A, 'indexExtension') < 0.1);
});

/** The one feature that is meant to change when the hand turns. */
const ORIENTED = ['pointingUp'];

test('features ignore hand size and position', () => {
  const base = extractFeatures(makeHand(SHAPES.V));
  const moved = makeHand(SHAPES.V).map(p => ({ x: p.x * 2.4 + 0.31, y: p.y * 2.4 - 0.17, z: p.z * 2.4 }));
  const scaled = extractFeatures(moved);
  for (const [key, value] of Object.entries(base)) close(value, scaled[key], 1e-9);
});

test('only the pointing feature changes when the hand turns', () => {
  const base = extractFeatures(makeHand(SHAPES.V));
  const angle = 1.6; // roughly a quarter turn, enough to read as sideways
  const turned = extractFeatures(
    makeHand(SHAPES.V).map(p => ({
      x: (p.x * Math.cos(angle) - p.y * Math.sin(angle)) * 2.4 + 0.31,
      y: (p.x * Math.sin(angle) + p.y * Math.cos(angle)) * 2.4 - 0.17,
      z: p.z * 2.4,
    })),
  );
  for (const [key, value] of Object.entries(base)) {
    if (ORIENTED.includes(key)) continue;
    // Rotating the coordinates costs a little floating-point precision; this
    // is still tighter than any change that could affect a match.
    close(value, turned[key], 1e-6);
  }
  assert.ok(base.pointingUp > turned.pointingUp + 0.2, 'turning the hand must move the pointing feature');
});

test('the pointing feature reads up, sideways and down', () => {
  close(feature({ rotateDeg: 0 }, 'pointingUp'), 1, 0.02);
  close(feature({ rotateDeg: 90 }, 'pointingUp'), 0.5, 0.05);
  close(feature({ rotateDeg: 180 }, 'pointingUp'), 0, 0.02);
});

test('features ignore which hand is signing', () => {
  const right = extractFeatures(makeHand(SHAPES.V));
  const left = extractFeatures(makeHand(SHAPES.V).map(p => ({ ...p, x: -p.x })));
  for (const [key, value] of Object.entries(right)) close(value, left[key], 1e-9);
});

test('fanning two fingers apart raises their spread and nothing else', () => {
  const together = feature({ curl: [0, 0, 1, 1] }, 'indexMiddleSpread');
  const apart = feature({ curl: [0, 0, 1, 1], spreadDeg: [-18, 18, 0, 0] }, 'indexMiddleSpread');
  assert.ok(together < 0.2, `together ${together}`);
  assert.ok(apart > 0.9, `apart ${apart}`);
  // Fingers of different lengths held parallel are not "spread".
  assert.ok(feature({ curl: [0, 0, 0, 0] }, 'ringPinkySpread') < 0.2);
});

test('invalid landmark data is rejected rather than scored', () => {
  assert.equal(extractFeatures([]), null);
  assert.equal(extractFeatures(makeHand().slice(0, 20)), null);
  const broken = makeHand();
  broken[8] = { x: NaN, y: 0, z: 0 };
  assert.equal(extractFeatures(broken), null);
});

/* ------------------------------ expectations --------------------------- */

test('a value inside its band is fully satisfied and falls off outside it', () => {
  const expectation = { key: 'indexExtension', min: 0.4, max: 0.6, softness: 0.2, coach: '' };
  assert.equal(satisfaction(0.5, expectation), 1);
  assert.equal(satisfaction(0.4, expectation), 1);
  assert.equal(satisfaction(0.6, expectation), 1);
  close(satisfaction(0.7, expectation), 0.5, 1e-9);
  close(satisfaction(0.3, expectation), 0.5, 1e-9);
  assert.equal(satisfaction(0.9, expectation), 0);
});

test('one badly missed expectation holds the whole sign back', () => {
  const sign = database.findSign('asl-b');
  const good = scoreSign(extractFeatures(makeHand(SHAPES.B)), sign).confidence;
  const oneFingerDown = scoreSign(
    extractFeatures(makeHand({ ...SHAPES.B, curl: [0, 0, 0, 1] })),
    sign,
  ).confidence;
  assert.ok(good > 0.9, `good ${good}`);
  assert.ok(good > oneFingerDown + 0.2, `${good} vs ${oneFingerDown}`);
});

test('the weakest expectation is reported so the player can be coached', () => {
  const { weakest } = scoreSign(extractFeatures(makeHand(SHAPES.A)), database.findSign('asl-l'));
  assert.ok(weakest, 'expected a weakest expectation');
  assert.ok(weakest.coach.length > 0);
});

/* ------------------------------- database ------------------------------ */

test('a draw never repeats a sign while the table still has unused rows', () => {
  const drawn = database.drawSigns(GAME_CONFIG.roundsPerSession);
  assert.equal(drawn.length, GAME_CONFIG.roundsPerSession);
  assert.equal(new Set(drawn.map(s => s.id)).size, drawn.length);
});

test('a draw larger than the table keeps going instead of running dry', () => {
  const drawn = database.drawSigns(database.allSigns().length + 3);
  assert.equal(drawn.length, database.allSigns().length + 3);
});

test('the database is a query layer with no way for a player to edit it', () => {
  assert.deepEqual(Object.keys(database).sort(), ['allSigns', 'drawSigns', 'findSign']);
  assert.throws(() => database.allSigns().push({}), TypeError);
});

test('every row is self-describing enough to put in front of a player', () => {
  for (const sign of database.allSigns()) {
    assert.ok(sign.letter.length <= 2, `${sign.id} should show a single glyph`);
    assert.ok(sign.hint.length > 20, `${sign.id} needs a usable hint`);
    assert.ok(sign.expects.length >= 4, `${sign.id} needs enough constraints to be specific`);
    assert.ok(sign.expects.every(e => e.coach.length > 0), `${sign.id} has an uncoached expectation`);
  }
});

/* ------------------------------ recognition ---------------------------- */

const EXPECTED = {
  A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', H: 'H', I: 'I',
  K: 'K', L: 'L', M: 'M', N: 'N', O: 'O', P: 'P', Q: 'Q', R: 'R', S: 'S',
  T: 'T', U: 'U', V: 'V', W: 'W', X: 'X', Y: 'Y', HORNS: '\u{1F918}',
};

for (const [shape, letter] of Object.entries(EXPECTED)) {
  test(`${shape} is recognised as ${letter}, clear of every other sign`, () => {
    const reading = recognizeHand(makeHand(SHAPES[shape]));
    assert.equal(reading.sign?.letter, letter);
    assert.ok(reading.confidence >= GAME_CONFIG.minConfidence, `confidence ${reading.confidence}`);
    assert.ok(isDecisive(reading), `not decisive: ${reading.confidence} vs ${reading.runnerUp}`);
  });
}

test('the whole alphabet and the horns are covered, and nothing shadows another', () => {
  const still = database.allSigns().filter(s => !s.motion);
  assert.equal(new Set(Object.values(EXPECTED)).size, still.length);
  const letters = database.allSigns().map(s => s.letter);
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    assert.ok(letters.includes(letter), `the alphabet is missing ${letter}`);
  }
  assert.ok(letters.includes('\u{1F918}'), 'the Hook \u2019em handshape is missing');
});

test('a still frame can never be a moving letter', () => {
  // J shares its handshape with I, and Z with a plain point, so the still
  // reading must stay on the letter that is actually a pose.
  assert.equal(recognizeHand(makeHand(SHAPES.J)).sign?.letter, 'I');
  assert.equal(recognizeHand(makeHand(SHAPES.Z)).sign?.letter, 'D');
  for (const sign of database.allSigns().filter(s => s.motion)) {
    assert.ok(sign.motion.legs.length >= 2, `${sign.letter} needs a path to trace`);
  }
});

test('a hand that is no particular sign is not forced into one', () => {
  for (const shape of [SHAPES.open, SHAPES.halfway, { curl: [0.3, 0.8, 0.2, 0.7], thumb: { splayDeg: 40, curl: 0.4 } }]) {
    const reading = recognizeHand(makeHand(shape));
    const target = database.findSign('asl-b');
    assert.ok(
      scoreSign(extractFeatures(makeHand(shape)), target).confidence < GAME_CONFIG.minConfidence ||
        reading.sign?.id === 'asl-c',
      'an unformed shape should not pass as a letter it is not',
    );
  }
});

test('an open spread hand is not accepted as the flat B handshape', () => {
  const confidence = scoreSign(extractFeatures(makeHand(SHAPES.open)), database.findSign('asl-b')).confidence;
  assert.ok(confidence < GAME_CONFIG.minConfidence, `open hand scored ${confidence} as B`);
});

test('reading a frame ignores hands the tracker is unsure about', () => {
  const hands = [
    { landmarks: makeHand(SHAPES.open), handedness: 'Left', score: 0.9 },
    { landmarks: makeHand(SHAPES.Y), handedness: 'Right', score: 0.95 },
  ];
  assert.equal(recognizeFrame(hands).sign?.letter, 'Y');
  assert.equal(recognizeFrame(hands.map(h => ({ ...h, score: 0.1 }))).sign, undefined);
  assert.equal(recognizeFrame([]).confidence, 0);
});

test('a second hand resting in shot cannot block the signing hand', () => {
  const target = database.findSign('asl-y');
  const hands = [
    // A well-formed C scores as highly for its own letter as the Y does for Y.
    { landmarks: makeHand(SHAPES.halfway), handedness: 'Left', score: 0.95 },
    { landmarks: makeHand(SHAPES.Y), handedness: 'Right', score: 0.95 },
  ];
  const evaluation = evaluateTarget(hands, target);
  assert.equal(evaluation.matching, true);
  assert.ok(evaluation.confidence >= GAME_CONFIG.minConfidence);
});

test('a hand forming the wrong letter does not satisfy the target', () => {
  const evaluation = evaluateTarget(
    [{ landmarks: makeHand(SHAPES.V), handedness: 'Right', score: 0.95 }],
    database.findSign('asl-w'),
  );
  assert.equal(evaluation.matching, false);
  assert.ok(evaluation.weakest, 'a miss should say what to fix');
});

test('an untracked or empty frame is simply not a match', () => {
  const target = database.findSign('asl-a');
  const empty = evaluateTarget([], target);
  assert.equal(empty.confidence, 0);
  assert.equal(empty.matching, false);
  assert.equal(empty.landmarks, undefined);
  const broken = [{ landmarks: makeHand(SHAPES.A).slice(0, 12), handedness: 'Right', score: 0.95 }];
  assert.equal(evaluateTarget(broken, target).matching, false);
});

test('a matched frame hands back the signing hand, for signs with a path', () => {
  const found = evaluateTarget(
    [{ landmarks: makeHand(SHAPES.J), handedness: 'Right', score: 0.95 }],
    signOf('J'),
  );
  assert.equal(found.matching, true, 'a moving sign matches on its handshape');
  assert.equal(found.landmarks?.length, 21);
});

/* -------------------------------- holding ------------------------------ */

test('the shape has to be held, not merely touched', () => {
  const hold = new HoldTracker(400, 150);
  hold.update(0, true);
  hold.update(100, true);
  assert.equal(hold.complete, false);
  hold.update(300, true);
  hold.update(420, true);
  assert.equal(hold.complete, true);
});

test('holding the sign early counts exactly as much as holding it late', () => {
  const early = new HoldTracker(400, 150);
  for (let t = 0; t <= 500; t += 100) early.update(t, true);
  assert.equal(early.complete, true);

  const late = new HoldTracker(400, 150);
  let t = 0;
  for (; t <= 9000; t += 100) late.update(t, false);
  assert.equal(late.complete, false, 'nothing should have accumulated while the shape was wrong');
  for (; t <= 9500; t += 100) late.update(t, true);
  assert.equal(late.complete, true);
});

test('a brief tracking flicker inside a hold does not restart it', () => {
  const hold = new HoldTracker(400, 200);
  hold.update(0, true);
  hold.update(100, true);
  hold.update(200, true);
  hold.update(300, false); // one dropped frame
  hold.update(400, true);
  hold.update(500, true);
  assert.equal(hold.complete, true);
});

test('letting the sign go for longer than the grace window restarts the hold', () => {
  const hold = new HoldTracker(400, 150);
  hold.update(0, true);
  hold.update(200, true);
  hold.update(400, false);
  hold.update(600, false);
  assert.equal(hold.progress, 0);
  hold.update(700, true);
  assert.equal(hold.complete, false);
});

test('a long stall cannot bank hold time', () => {
  const hold = new HoldTracker(400, 150);
  hold.update(0, true);
  hold.update(10_000, true);
  assert.equal(hold.complete, false);
});

test('reset clears progress between rounds', () => {
  const hold = new HoldTracker(400, 150);
  hold.update(0, true);
  hold.update(300, true);
  hold.reset();
  assert.equal(hold.progress, 0);
  hold.update(600, true);
  hold.update(700, true);
  assert.equal(hold.complete, false);
});

test('progress reports how much of the hold is done', () => {
  const hold = new HoldTracker(400, 150);
  hold.update(0, true);
  hold.update(200, true);
  close(hold.progress, 0.5);
  hold.update(400, true);
  assert.equal(hold.progress, 1);
  hold.update(600, true);
  assert.equal(hold.progress, 1, 'progress is capped at a full hold');
});

/* -------------------------------- motion ------------------------------- */

const PALM = 0.35;
const shift = (landmarks, dx, dy) => landmarks.map(p => ({ ...p, x: p.x + dx * PALM, y: p.y + dy * PALM }));

/** Draws `path` (in palm widths, screen axes) while holding `shape`. */
function trace(sign, shape, path, { holding = true } = {}) {
  const tracker = new MotionTracker(sign.motion);
  const base = makeHand(SHAPES[shape]);
  let t = 0;
  let dx = 0;
  let dy = 0;
  tracker.update(t, holding ? base : null);
  for (const [stepX, stepY] of path) {
    for (let i = 0; i < 10; i++) {
      t += 50;
      dx += stepX / 10;
      dy += stepY / 10;
      tracker.update(t, holding ? shift(base, dx, dy) : null);
    }
  }
  return tracker;
}

test('J is the I handshape plus a path, and the path has to be drawn', () => {
  const J = signOf('J');
  assert.ok(scoreSign(extractFeatures(makeHand(SHAPES.J)), J).confidence >= GAME_CONFIG.minConfidence);
  assert.equal(trace(J, 'J', [[0, 0.7], [-0.6, 0]]).complete, true);
  assert.equal(trace(J, 'J', [[0, 0], [0, 0]]).complete, false, 'holding still is an I, not a J');
  assert.equal(trace(J, 'J', [[0, 0.7]]).complete, false, 'half a J is not a J');
});

test('Z has to be drawn in order', () => {
  const Z = signOf('Z');
  assert.equal(trace(Z, 'Z', [[0.7, 0], [-0.5, 0.6], [0.7, 0]]).complete, true);
  assert.equal(trace(Z, 'Z', [[0, 0.6], [0.7, 0], [0.7, 0]]).complete, false, 'down first is not a Z');
  assert.equal(trace(Z, 'Z', [[0.2, 0], [-0.1, 0.1], [0.2, 0]]).complete, false, 'too small to be a Z');
});

test('losing the handshape drops the path rather than banking it', () => {
  const J = signOf('J');
  const tracker = new MotionTracker(J.motion);
  const base = makeHand(SHAPES.J);
  tracker.update(0, base);
  tracker.update(100, shift(base, 0, 0.7));
  assert.ok(tracker.progress > 0, 'the first leg should have registered');
  tracker.update(150, null);
  assert.equal(tracker.progress, 0);
});

test('a path is measured in palm widths, so camera distance does not matter', () => {
  const J = signOf('J');
  const far = new MotionTracker(J.motion);
  const base = makeHand(SHAPES.J).map(p => ({ x: p.x * 0.4, y: p.y * 0.4, z: p.z * 0.4 }));
  let t = 0;
  for (const [dx, dy] of [[0, 0.7], [-0.6, 0]]) {
    for (let i = 1; i <= 10; i++) {
      t += 50;
      far.update(t, base.map(p => ({ ...p, x: p.x + (dx * i) / 10 * PALM * 0.4, y: p.y + (dy * i) / 10 * PALM * 0.4 })));
    }
  }
  assert.equal(far.complete, true);
});

test('a tip position is rejected for broken landmarks', () => {
  assert.equal(tipPosition([], 'index'), null);
  assert.equal(tipPosition(makeHand().slice(0, 9), 'index'), null);
});

/* -------------------------------- config ------------------------------- */

test('holding is the only deadline: a round is long enough to settle into a shape', () => {
  assert.ok(GAME_CONFIG.holdMs < 1000, 'a hold the player has to sustain for a second is a timing test');
  assert.ok(GAME_CONFIG.roundMs >= GAME_CONFIG.holdMs * 10, 'a round must leave room to find the shape');
  assert.ok(GAME_CONFIG.holdGraceMs > 0, 'a dropped frame must not restart the hold');
});

test('the sprint is long enough to land several signs', () => {
  assert.equal(GAME_CONFIG.sprintMs, 10_000);
  assert.ok(GAME_CONFIG.sprintMs / (GAME_CONFIG.holdMs + GAME_CONFIG.sprintGapMs) >= 8, 'the sprint should reward speed');
});
