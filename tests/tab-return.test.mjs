import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A tab you come back to stays as you left it (Jay 2026-11-05: "switching tab
// force it to scroll back up and sometimes switching tab cause it to flick").
// The kit's tabBar shows a tab drawn before at once, at its place, and the app
// draws it again once the pill lands. That second drawing must leave the
// same nodes when nothing changed, never empty a part filled later (the page
// goes short and Safari drops the reader up), and never scroll the law being
// read back to its top. Checked in Chromium and WebKit with a probe that taps
// away and back at the foot of every tab.
const src = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
const body = name => {
  const at = src.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
  assert.ok(at >= 0, `${name} is there`);
  return src.slice(at, src.indexOf('\n}\n', at));
};

test('paint() leaves a part alone when its words are the same', () => {
  // (The helper itself, run on a stand-in element.)
  const code = src.slice(src.indexOf('const drawn = new WeakMap();'), src.indexOf('// A part filled after its tab is drawn'));
  const paint = new Function(`${code}; return paint;`)();
  let writes = 0;
  const el = {
    _h: '',
    get firstChild() {
      return this._h ? {} : null;
    },
    set innerHTML(v) {
      writes++;
      this._h = v;
    }
  };
  assert.equal(paint(el, '<p>a</p>'), true);
  assert.equal(paint(el, '<p>a</p>'), false);
  assert.equal(paint(el, '<p>b</p>'), true);
  assert.equal(writes, 2);
});

test('every tab is drawn again through paint(), never rebuilt whole', () => {
  for (const [fn, pat] of [
    ['drawHome', /paint\(rest, cols\(/],
    ['drawMine', /paint\(\s*\$\('panel-mine'\)/],
    ['drawResults', /paint\(\s*out,/],
    ['drawBillList', /paint\(\s*out,/],
    ['drawRulingList', /paint\(out, cols\(/]
  ]) {
    const b = body(fn);
    assert.match(b, pat, `${fn} paints`);
    // (A shimmering stand-in before the data is in may still be written.)
    const raw = b.split('\n').filter(l => /\.innerHTML =/.test(l) && !/q-skel/.test(l));
    assert.deepEqual(raw, [], `${fn} writes innerHTML only through paint()`);
  }
  // 法規's list is kept, as its search box is.
  assert.match(body('drawLaws'), /resultsBox\]/);
});

test('a part filled later keeps its last drawing in place while it is read again', () => {
  assert.doesNotMatch(src, /`<div id="(mine-people|home-news)"><\/div>`/);
  assert.match(body('drawMine'), /laterHtml\('mine-people'\)/);
  assert.match(body('drawHome'), /laterHtml\('home-news'\)/);
  assert.match(body('drawTracked'), /fillLater\('mine-people'/);
  assert.match(body('fillHome'), /fillLater\('home-news'/);
});

test('法規 tapped again from another tab: the law being read stays where you were', () => {
  const b = body('openLaw');
  assert.match(b, /else if \(fresh\) scrollTo\(\{ top: 0 \}\)/);
  assert.doesNotMatch(b, /\n  else scrollTo\(\{ top: 0 \}\);/);
});

test('立法\'s pages tapped outside 立法 (a bill, a 立委 in 我的) open over that screen alike', () => {
  assert.match(src, /state\.tab !== 'bills' && \(m = [^\n]*\^#\(item\|who\|budget\|notice\|meet\)=/);
  const over = body('overHere');
  for (const open of ['openItem', 'openPerson', 'openNotice', 'openBudget', 'openMeet']) assert.match(over, new RegExp(open));
});
