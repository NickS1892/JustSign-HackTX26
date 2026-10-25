// Run with Node 24+: node --test tests/sign-matcher.test.mjs (no model or camera required).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'justsign-test-'));
for (const file of ['config', 'matcher']) {
  const source = await readFile(new URL(`../src/game/${file}.ts`, import.meta.url), 'utf8');
  await writeFile(join(dir, `${file}.mjs`), stripTypeScriptTypes(source).replace("'./config'", "'./config.mjs'"));
}
const { compareSigns, normalizeFrame, mirrorFrame, compareHandImage } = await import(pathToFileURL(join(dir, 'matcher.mjs')));
after(() => rm(dir, { recursive: true, force: true }));

function frame(t, motion = true) {
  const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .4, z: 0, visibility: 1 }));
  pose[11] = { x: .3, y: .4, z: 0 }; pose[12] = { x: .7, y: .4, z: 0 };
  pose[13] = { x: .25, y: .6, z: 0 }; pose[14] = { x: .75, y: .6, z: 0 };
  const offset = motion ? .4 * Math.sin(t / 2000 * Math.PI * 2) : 0;
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: .45 + offset + (i % 4) * .015, y: .6 - Math.floor(i / 4) * .025, z: 0 }));
  return { timestampMs: t, pose, leftHand: hand, rightHand: [] };
}
const sequence = (fn = t => frame(t)) => Array.from({ length: 24 }, (_, i) => fn(i * 1000 / 12));
const ref = sequence();

test('identical movement completes with full score', () => {
  const r = compareSigns(ref, ref, 2000);
  assert.equal(r.score, 100); assert.equal(r.completed, true);
});
test('translation and uniform scale do not affect matching', () => {
  const transform = p => ({ ...p, x: p.x * .7 + .12, y: p.y * .7 + .08 });
  const moved = ref.map(f => ({ ...f, pose: f.pose.map(transform), leftHand: f.leftHand.map(transform) }));
  assert.equal(compareSigns(ref, moved, 2000).score, 100);
});
test('holding one pose cannot complete a moving sign', () => {
  const r = compareSigns(ref, sequence(t => frame(t, false)), 2000);
  assert.equal(r.completed, false); assert.ok(r.score < 72);
});
test('missing hands and missing shoulders cannot earn points', () => {
  assert.equal(compareSigns(ref, ref.map(f => ({ ...f, leftHand: [] })), 2000).completed, false);
  assert.equal(compareSigns(ref, ref.map(f => ({ ...f, pose: [] })), 2000).score, 0);
  assert.equal(normalizeFrame({ ...ref[0], pose: [] }), null);
});
test('sparse frames cannot fill a full attempt or hide dropped tracking', () => {
  const sparse = ref.filter((_, i) => i % 3 === 0);
  assert.equal(compareSigns(ref, sparse, 2000).completed, false);
  assert.equal(compareSigns(ref, ref.slice(0, 10), 2000).completed, false);
  assert.equal(compareSigns(ref, [], 2000).score, 0);
});
test('timing is penalized even with similar movement', () => {
  const delayed = sequence(t => ({ ...frame(Math.max(0, t - 400)), timestampMs: t }));
  const r = compareSigns(ref, delayed, 2000);
  assert.ok(r.timingScore < 90); assert.ok(r.score < 100);
});
test('reversing movement is not accepted as the expected sign', () => {
  const reverse = ref.toReversed().map((f, i) => ({ ...f, timestampMs: i * 1000 / 12 }));
  assert.equal(compareSigns(ref, reverse, 2000).completed, false);
});
test('mirror mode is explicit and swaps anatomical hands', () => {
  const mirrored = ref.map(mirrorFrame);
  assert.equal(compareSigns(ref, mirrored, 2000).completed, false);
  assert.equal(compareSigns(ref, mirrored, 2000, true).score, 100);
});
test('invalid data and invalid reference timing do not pass', () => {
  assert.equal(compareSigns(ref, ref, NaN).score, 0);
  assert.equal(compareSigns(ref, ref, Infinity).completed, false);
  const bad = ref.map(f => ({ ...f, leftHand: f.leftHand.map(p => ({ ...p, x: NaN })) }));
  assert.equal(compareSigns(ref, bad, 2000).completed, false);
  assert.equal(compareSigns(bad, ref, 2000).completed, false);
});


test('image matching accepts a scaled, translated, mirrored hand without body landmarks', () => {
  const reference = frame(0, false);
  const attempts = Array.from({length: 48}, (_, i) => ({timestampMs: i * 1000 / 12, pose: [], rightHand: [], leftHand: reference.leftHand.map(p => ({...p, x: 1 - p.x * .7, y: p.y * .7 + .1}))}));
  const result = compareHandImage(reference, attempts);
  assert.equal(result.score, 100); assert.equal(result.completed, true);
});
test('image matching rejects missing hands, sparse tracking and different shapes', () => {
  const reference = frame(0, false);
  assert.equal(compareHandImage(reference, []).completed, false);
  const attempts = Array.from({length: 48}, (_, i) => ({...reference, timestampMs: i * 1000 / 12}));
  assert.equal(compareHandImage(reference, attempts.slice(0, 8)).completed, false);
  assert.equal(compareHandImage(reference, attempts.map(f => ({...f, leftHand: []}))).completed, false);
  assert.equal(compareHandImage(reference, attempts.map(f => ({...f, leftHand: f.leftHand.map((p, i) => ({...p, x: p.x + (i === 8 ? .5 : 0)}))}))).completed, false);
});
