import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askError, askLaw } from '../public/lib/ask.mjs';
import { chatError, chatLaw } from '../public/lib/chat.mjs';

const src = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');

test('the guard pausing AI (503 paused) reads in plain words', () => {
  assert.match(askError('paused'), /暫停/);
  assert.match(askError('paused', true), /paused/);
  assert.match(chatError('paused'), /暫停/);
  assert.match(chatError('paused', true), /paused/);
});

test('a bare #budget=<k> opens over 立法, not 首頁', () => {
  const branch = src.match(/\} else if \(tab === 'bills'[^\n]*\{/)[0];
  assert.match(branch, /p\.get\('budget'\)/);
});

test('a budget link tapped outside 立法 opens over the screen it was on', () => {
  assert.match(src, /match\(\/\^#tab=bills&f=budget&budget=\(\[\^&\]\+\)\$\/\)\)\) return e\.preventDefault\(\), overHere\('budget'/);
  const re = /^#tab=bills&f=budget&budget=([^&]+)$/;
  assert.equal(decodeURIComponent('#tab=bills&f=budget&budget=116%E7%B8%BD'.match(re)[1]), '116總');
});

test('測試工具 aiFail answers its error and sends nothing; off, nothing changes', async () => {
  let sent = 0;
  const fetcher = async () => (sent++, new Response(JSON.stringify({ error: 'cap', left: 0 }), { status: 429 }));
  globalThis.ORBIT_TEST = { flags: { aiFail: 'paused' } };
  try {
    assert.deepEqual(await askLaw({ p: 'B0000001', arts: ['1'] }, fetcher), { error: 'paused', left: 0 });
    assert.deepEqual(await chatLaw({ q: 'x' }, { fetcher }), { error: 'paused', left: 0 });
    assert.equal(sent, 0);
  } finally {
    delete globalThis.ORBIT_TEST;
  }
  assert.equal((await askLaw({ p: 'B0000001', arts: ['1'] }, fetcher)).error, 'cap');
  assert.equal(sent, 1);
});
