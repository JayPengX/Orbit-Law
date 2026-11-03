// 首頁's 為你推薦 (lib/foryou.mjs): the laws worth reading next, ranked by the
// family's one engine (the kit's rank with feedback.mjs's lift).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forYou, COMMON, lawItem } from '../public/lib/foryou.mjs';

// index.json's rows: [code, name, kind, MOJ category, date, abolished].
const law = (code, name, topic) => ({ row: [code, name, '法律', '', '20200101', 0], topic });
const LAWS = [
  law('A1', '中華民國憲法', 'gov'),
  law('B1', '民法', 'justice'),
  law('C1', '中華民國刑法', 'justice'),
  law('N1', '勞動基準法', 'labor'),
  law('N2', '勞工保險條例', 'labor'),
  law('N3', '職業安全衛生法', 'labor'),
  law('N4', '性別平等工作法', 'labor'),
  law('N5', '就業服務法', 'labor'),
  law('K1', '道路交通管理處罰條例', 'traffic'),
  law('K2', '公路法', 'traffic'),
  law('H1', '全民健康保險法', 'health'),
  law('H2', '醫療法', 'health'),
  law('F1', '農業發展條例', 'farm'),
  law('F2', '漁業法', 'farm')
];
const rows = LAWS.map(x => x.row);
const topics = new Map(LAWS.map(x => [x.row[0], x.topic]));
const topicOf = r => topics.get(r[0]);
const rulings = { A1: 900, B1: 5000, C1: 4000, N1: 800, N2: 200, N3: 60, N4: 30, N5: 40, K1: 300, K2: 20, H1: 100, H2: 90, F1: 5, F2: 2 };
const byCode = code => rows.find(r => r[0] === code);
const NOW = Date.parse('2026-11-03T12:00:00Z');

test('nothing read yet: the everyday laws people use, not one subject', () => {
  const out = forYou({ rows, rulings, topicOf, now: NOW });
  assert.equal(out.length, 8);
  const top3 = out.slice(0, 3).map(r => r[1]);
  assert.ok(top3.every(n => COMMON.includes(n)), top3.join());
  assert.ok(new Set(out.slice(0, 4).map(topicOf)).size >= 3);
});

test("what's read leads: a labour reader gets labour laws, never one read lately, and the shelf isn't one colour", () => {
  const recent = ['N1', 'N2'].map(byCode);
  const out = forYou({ rows, recent, rulings, topicOf, now: NOW });
  assert.ok(!out.some(r => ['N1', 'N2'].includes(r[0])));
  assert.equal(topicOf(out[0]), 'labor');
  assert.ok(out.filter(r => topicOf(r) === 'labor').length >= 3);
  assert.ok(out.slice(0, 3).some(r => topicOf(r) !== 'labor'));
  // A kept law (☆) counts too.
  const kept = forYou({ rows, starred: [byCode('K2')], rulings, topicOf, now: NOW });
  assert.ok(kept.slice(0, 3).some(r => r[0] === 'K1'));
});

test('a subject passed over day after day makes way, one opened rises (the lift)', () => {
  const recent = ['N1'].map(byCode);
  const plain = forYou({ rows, recent, rulings, topicOf, now: NOW });
  const down = forYou({ rows, recent, rulings, topicOf, now: NOW, lift: item => (item.keys.includes('topic:labor') ? 0.4 : 1) });
  assert.ok(down.slice(0, 3).filter(r => topicOf(r) === 'labor').length < plain.slice(0, 3).filter(r => topicOf(r) === 'labor').length);
  const up = forYou({ rows, rulings, topicOf, now: NOW, lift: item => (item.keys.includes('topic:health') ? 2.5 : 1) });
  assert.equal(topicOf(up[0]), 'health');
  assert.deepEqual(lawItem(byCode('H1'), topicOf), { id: 'law:H1', keys: ['topic:health'] });
});
