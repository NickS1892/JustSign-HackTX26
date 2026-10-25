import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('package manifest supports npm without a self-link', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies[pkg.name], undefined);
  assert.ok(Object.values(pkg.dependencies).every(value => !value.startsWith('link:')));
});

test('direct WASM preparation works from a path containing spaces', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'justsign startup '));
  try {
    await copyFile(new URL('../copy-wasm.js', import.meta.url), join(dir, 'copy-wasm.js'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    const visionDir = join(dir, 'node_modules', '@mediapipe', 'tasks-vision');
    await mkdir(visionDir, { recursive: true });
    await writeFile(join(visionDir, 'package.json'), JSON.stringify({ name: '@mediapipe/tasks-vision' }));
    await writeFile(join(visionDir, 'vision_wasm_internal.js'), '// loader fixture');
    await writeFile(join(visionDir, 'vision_wasm_internal.wasm'), 'wasm fixture');
    execFileSync(process.execPath, [join(dir, 'copy-wasm.js')], { cwd: dir, stdio: 'pipe' });
    assert.equal(await readFile(join(dir, 'public', 'wasm', 'vision_wasm_internal.js'), 'utf8'), '// loader fixture');
    assert.equal(await readFile(join(dir, 'public', 'wasm', 'vision_wasm_internal.wasm'), 'utf8'), 'wasm fixture');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
