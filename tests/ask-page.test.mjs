// 問法律 on an iPad (Jay 2026-11-06): it was capped at a 760 reading width, so
// opening it shrank the page to a narrow column, left empty space and moved
// the rail. It takes the page's width as every tab does. Its start was six
// fixed questions home already shows ("試試這樣問 is shit"): now four worth
// asking, each saying why it's there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askIdeas, STARTERS, EVERYDAY } from '../public/lib/chat.mjs';

const css = readFileSync(new URL('../public/law.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');

test('問法律 never narrows the page on a wide screen', () => {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/--q-page-max/.test(m[2])) assert.doesNotMatch(m[1], /lw-tab=['"]?ask/, `${m[1].trim()} narrows 問法律`);
  }
});

test('its questions flow into columns on a wide page, as every long list does', () => {
  assert.doesNotMatch(css, /#panel-ask \.lw-list\)/);
  assert.match(app, /class="lw-list lw-ask-list lw-ideas"/);
});

test('an answer: its text and its cards in two parts (side by side on a wide page)', () => {
  assert.match(app, /<div class="lw-msg-main">\$\{main\}<\/div>/);
  assert.match(css, /@container lw-chat \(min-width: 760px\)/);
  assert.match(css, /\.lw-msg-main,\s*\.lw-msg-side\s*\{\s*display: contents;/);
});

test('four questions, never home’s fixed ones when nothing is known', () => {
  const ideas = askIdeas({ now: Date.UTC(2026, 10, 6) });
  assert.equal(ideas.length, 4);
  for (const x of ideas) {
    assert.ok(!STARTERS.some(([zh]) => zh === x.q), `${x.q} is one of home's`);
    assert.ok(EVERYDAY.some(([zh]) => zh === x.q));
    assert.equal(x.why, '常見情況');
  }
  assert.notDeepEqual(ideas.map(x => x.q), askIdeas({ now: Date.UTC(2026, 10, 7) }).map(x => x.q), 'a different few the next day');
});

test('what you read, follow and what just moved come first, each saying why', () => {
  const ideas = askIdeas({
    reading: [{ kind: 'bill', id: 'x', title: 'x', href: '#item=x' }, { kind: 'law', id: 'B0000001', title: '民法', href: '#law=B0000001&a=184' }],
    items: [
      { k: 'a', n: '勞動基準法', u: '2026-10-01' },
      { k: 'b', n: '道路交通管理處罰條例', u: '2026-11-01' },
      { k: 'c', n: '舊法', u: '2026-11-05', dropped: true }
    ],
    followed: { a: '2026-10-01' },
    people: true,
    lawTopic: p => (p === 'B0000001' ? 'justice' : 'gov'),
    itemTopic: it => (it.k === 'a' ? 'labor' : 'traffic')
  });
  assert.deepEqual(ideas.map(x => [x.q, x.why, x.topic]), [
    ['民法第 184 條在說什麼？', '剛看過', 'justice'],
    ['勞動基準法要改什麼？', '你追蹤的法案', 'labor'],
    ['我追蹤的立委投了什麼票？', '你追蹤的立委', 'gov'],
    ['道路交通管理處罰條例要改什麼？', '立法院最新進度', 'traffic']
  ]);
  assert.equal(askIdeas({ en: true, people: true })[0].q, 'How did my legislators vote?');
});

// Jay's iPhone 11-11: the verdict under Orbit AI's mark (a flex row), drawn on one line
// before it's fitted, set the answer's width, and the whole chat ran past the screen.
test('an AI line never sets the answer\'s width: its words take the head\'s', () => {
  assert.match(app, /const aiLine = [^\n]*lw-verdict q-fit-wrap[^\n]*class="lw-ai-head"/);
  const rule = sel => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.>]/g, m => `\\${m}`)}\\s*\\{([^}]*)\\}`))?.[1] || '';
  const verdict = rule('.lw-ai-head > .lw-verdict');
  assert.match(verdict, /width:\s*0;/, 'its own width is none: a long verdict can\'t widen the answer');
  assert.match(verdict, /min-width:\s*0;/);
  assert.match(verdict, /flex:\s*1 1 0;/);
  assert.match(rule('.lw-ai-head'), /min-width:\s*0;/);
});
