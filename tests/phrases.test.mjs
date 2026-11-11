// 找法's made-ahead words (data/ai/phrases.json): a search in people's own words opens the article.
import test from 'node:test';
import assert from 'node:assert/strict';
import { phraseHits } from '../public/lib/find.mjs';

const G = [
  { p: 'B0000001', say: ['押金不退', '房東扣押金'], arts: ['431', '455'] },
  { p: 'N0030001', say: ['加班費'], arts: ['24'] },
  { p: 'N0030001', say: ['加班費怎麼算'], arts: ['32'] },
  { p: 'B0010042', say: ['遺產', '罰多少'], arts: ['100'] },
  { p: 'D0080067', say: ['罰多少', '會被罰錢嗎'], arts: ['19'] },
  { p: 'D0080068', say: ['會被罰錢嗎'], arts: ['1'] },
  { p: 'D0080069', say: ['會被罰錢嗎'], arts: ['2'] }
];

test('the very words first, then words inside the search; at most n, none twice', () => {
  assert.deepEqual(phraseHits(G, '房東 押金不退'), [{ p: 'B0000001', k: '431' }, { p: 'B0000001', k: '455' }]);
  assert.deepEqual(phraseHits(G, '加班費怎麼算'), [{ p: 'N0030001', k: '32' }]);
  assert.deepEqual(phraseHits(G, '加班費'), [{ p: 'N0030001', k: '24' }]);
  assert.deepEqual(phraseHits(G, '押金不退', 1), [{ p: 'B0000001', k: '431' }]);
  assert.deepEqual(phraseHits(G, '離婚'), []);
});

test('words too short to mean one thing, or said of three laws, find nothing', () => {
  assert.deepEqual(phraseHits(G, '遺產'), []);
  assert.deepEqual(phraseHits(G, '會被罰錢嗎'), []);
  assert.deepEqual(phraseHits(G, '闖紅燈罰多少'), []);
});
