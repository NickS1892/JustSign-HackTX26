// Run with Node 22+: node --test tests/high-scores.test.mjs
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A stand-in for the browser's localStorage, switchable to a failing one. */
const store = new Map();
let failing = false;
globalThis.localStorage = {
  getItem: key => {
    if (failing) throw new Error('storage blocked');
    return store.has(key) ? store.get(key) : null;
  },
  setItem: (key, value) => {
    if (failing) throw new Error('storage blocked');
    store.set(key, String(value));
  },
  removeItem: key => {
    if (failing) throw new Error('storage blocked');
    store.delete(key);
  },
};

const dir = await mkdtemp(join(tmpdir(), 'justsign-scores-'));
for (const file of ['types', 'high-scores']) {
  const source = await readFile(new URL(`../src/game/${file}.ts`, import.meta.url), 'utf8');
  await writeFile(join(dir, `${file}.mjs`), stripTypeScriptTypes(source).replace("'./types'", "'./types.mjs'"));
}
const { clearScores, highScore, recordScore } = await import(pathToFileURL(join(dir, 'high-scores.mjs')));
after(() => rm(dir, { recursive: true, force: true }));
beforeEach(() => { store.clear(); failing = false; });

const KEY = 'justsign-high-scores-v1';

test('the first score of a mode becomes its best', () => {
  assert.equal(highScore('sprint'), undefined);
  assert.deepEqual(recordScore('sprint', 7), { best: 7, isNew: true });
  assert.equal(highScore('sprint').score, 7);
});

test('only a better score replaces the best', () => {
  recordScore('sprint', 7);
  assert.deepEqual(recordScore('sprint', 4), { best: 7, isNew: false });
  assert.deepEqual(recordScore('sprint', 7), { best: 7, isNew: false }, 'tying is not beating');
  assert.deepEqual(recordScore('sprint', 8), { best: 8, isNew: true });
  assert.equal(highScore('sprint').score, 8);
});

test('the two modes keep separate bests', () => {
  recordScore('sprint', 7);
  recordScore('practice', 5200);
  assert.equal(highScore('sprint').score, 7);
  assert.equal(highScore('practice').score, 5200);
});

test('a best records the day it was set', () => {
  recordScore('practice', 100);
  assert.match(highScore('practice').setOn, /^\d{4}-\d{2}-\d{2}$/);
});

test('scores survive being written and read back', () => {
  recordScore('practice', 1234);
  assert.match(store.get(KEY), /1234/);
  assert.equal(highScore('practice').score, 1234);
});

test('hand-edited or corrupt storage is ignored rather than trusted', () => {
  for (const junk of ['not json', '[]', 'null', '{"sprint":{"score":"lots"}}', '{"sprint":{"score":-5}}']) {
    store.set(KEY, junk);
    assert.equal(highScore('sprint'), undefined, `accepted ${junk}`);
  }
  store.set(KEY, '{"sprint":{"score":9.7}}');
  assert.equal(highScore('sprint').score, 10, 'a stored score is read back as a whole number');
});

test('a score still counts for the session when storage refuses to save', () => {
  failing = true;
  assert.deepEqual(recordScore('sprint', 6), { best: 6, isNew: true });
  assert.equal(highScore('sprint'), undefined, 'nothing was saved, and nothing threw');
});

test('clearing removes the stored bests', () => {
  recordScore('sprint', 7);
  clearScores();
  assert.equal(highScore('sprint'), undefined);
  failing = true;
  clearScores();
});
