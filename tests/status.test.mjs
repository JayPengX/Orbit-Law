import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { statusOf, PARTS } from '../scripts/build-status.mjs';

test('each part: when it was built and how many, a missing one as 0', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'law-status-'));
  await writeFile(join(dir, 'index.json'), JSON.stringify({ built: '2026-11-10T19:40:00.000Z', laws: [1, 2, 3] }));
  await mkdir(join(dir, 'bills'));
  await writeFile(join(dir, 'bills', 'all.json'), JSON.stringify({ built: '2026-11-10T19:45:00.000Z', bills: [1] }));
  const s = await statusOf(pathToFileURL(dir + '/'), 5);
  assert.equal(s.built, 5);
  assert.deepEqual(s.parts.laws, { built: Date.parse('2026-11-10T19:40:00.000Z'), n: 3 });
  assert.deepEqual(s.parts.bills, { built: Date.parse('2026-11-10T19:45:00.000Z'), n: 1 });
  assert.deepEqual(s.parts.councils, { built: 0, n: 0 });
  assert.deepEqual(Object.keys(s.parts), Object.keys(PARTS));
});
