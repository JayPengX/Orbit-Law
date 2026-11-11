import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Orbit's own look is the app's only look (Orbit-Core docs/DESIGN.md §11):
// the page says so before anything draws, its stylesheet after the app's own.
const read = f => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('the look is always on: data-look="native" on <html>, look.css after law.css', () => {
  const html = read('index.html');
  assert.match(html, /<html[^>]*data-look="native"/);
  const app = html.indexOf('./law.css');
  assert.ok(app > 0 && html.indexOf('./look.css') > app);
});

// 首頁 leads with one field for both ways in: Enter or 搜尋法規 finds laws,
// 問法律 (the main action) asks in plain words; both carry what was typed.
test('首頁 leads with one field and its two ways: 搜尋法規 and 問法律', () => {
  const src = read('app.mjs');
  const home = src.slice(src.indexOf('function drawHome()'), src.indexOf('\n}\n', src.indexOf('function drawHome()')));
  assert.match(home, /panel\.replaceChildren\(card,/);
  const card = src.slice(src.indexOf('function findCard()'), src.indexOf('\n}\n', src.indexOf('function findCard()')));
  assert.match(card, /findGo\(input\.value, 's'\)/);
  assert.match(card, /is-ask[^\n]*findGo\(input\.value, 'a'\)/);
  assert.match(src, /tab=ask&q=\$\{encodeURIComponent\(q\)\}/);
  assert.match(src, /tab=laws&q=\$\{encodeURIComponent\(q\)\}/);
});

// Colour is what it names: graphite cards; the app's colour only on 問法律.
test('the home never fills a card with the app\'s colour', () => {
  const css = read('look.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const accent = [...css.matchAll(/([^{}]+)\{[^}]*background: var\(--q-accent\)/g)].map(m => m[1].trim());
  assert.deepEqual(accent, ["html[data-look='native'] .nv-way.is-ask"]);
});

// A day strip is one row that scrolls, in a column too: Law's rule that wraps
// a column's chips turned a council's term of days into a wall of dates down
// the column (Jay's iPad, 2026-11-11).
test('a column\'s wrapping chips never take the day strip', () => {
  const css = read('law.css');
  for (const m of css.matchAll(/([^{}]*\.q-chips[^{}]*)\{([^}]*)\}/g)) {
    if (!/flex-wrap:\s*wrap/.test(m[2])) continue;
    for (const sel of m[1].split(',')) if (/\.q-chips(?![-\w])/.test(sel) && !/\.q-day-strip|\.wrap\b/.test(sel)) assert.match(sel, /:not\(\.q-day-strip\)/, `${sel.trim()} wraps day strips`);
  }
});
