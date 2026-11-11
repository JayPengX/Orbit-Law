// 你追蹤的法案週報 (lib/weekly.mjs): what moved this week, what the AI is given, what 我的 shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekSince, weekPicks, artBits, weekInput, weekOf, lawId } from '../public/lib/weekly.mjs';

const NOW = Date.parse('2026-11-11T04:00:00Z'); // 12:00 in Taiwan
const items = [
  { k: '11:1', n: '食品安全衛生管理法', u: '2026-11-10', about: '強化食品安全查驗分工' },
  { k: '11:2', n: '道路交通管理處罰條例', u: '2026-11-20', about: '委員會排定下週審查' },
  { k: '11:3', n: '民法', u: '2026-10-01', about: '舊進度' },
  { k: '11:4', n: '勞動基準法', u: '2026-11-09', about: '', pr: { about: '特休可以累積' } },
  { k: '11:5', n: '撤回的法案', u: '2026-11-09', about: 'x', dropped: true }
];
const changes = {
  items: [
    { p: 'K0040075', n: '酒駕毒駕防制教育及酒癮毒品戒癮治療實施管理辦法', m: '20261030', seen: '2026-11-06', amended: ['5'] },
    { p: 'F0150059', n: '高雄榮民總醫院臺南分院編制表', m: '20261030', seen: '2026-11-06', amended: ['1'] },
    { p: 'B0000001', n: '民法', m: '20260101', seen: '2026-01-05', amended: ['1'] }
  ]
};

test('the week: bills moved on a day already come, laws just amended, no staff tables', () => {
  assert.equal(weekSince(NOW), '2026-11-04');
  const { bills, laws } = weekPicks(items, changes, NOW);
  assert.deepEqual(bills.map(it => it.k), ['11:1', '11:4'], 'a day still to come, an old move and a withdrawn bill are left out');
  assert.deepEqual(laws.map(lawId), ['K0040075@20261030']);
});

test('a law\'s changed articles as short bits: where the text parts, and what it replaced', () => {
  // ([old, new], as data/diff/ keeps them.)
  const bits = artBits({ arts: { 5: ['處新臺幣六千元以上一萬元以下罰鍰。', '處新臺幣一萬元以上三萬元以下罰鍰。'], 2: ['完成酒駕毒駕防制教育訓練，始得報考；酒駕毒駕者', '完成酒駕防制教育訓練，始得報考；酒駕者'], '5-1': [null, '受處分人應接受戒癮治療。'], 9: ['本條刪除前之文字', null] } });
  assert.equal(bits.length, 4);
  assert.match(bits.find(b => b.startsWith('第5條')), /^第5條：…處新臺幣【.+】（原：.+）/);
  assert.equal(bits.find(b => b.startsWith('第2條')), '第2條：…完成酒駕【刪去：毒駕】…訓練，始得報考；酒駕【刪去：毒駕】', 'each change on its own, not the whole article');
  assert.ok(bits.includes('第5-1條：受處分人應接受戒癮治療。'));
  assert.ok(bits.includes('第9條：刪除：本條刪除前之文字'));
  assert.ok(artBits({ arts: { 1: ['長'.repeat(900), '很'.repeat(900)] } })[0].length <= 260);
});

test('the AI\'s input: a bill by its purpose, a law by its articles, nothing empty', () => {
  const picks = weekPicks(items, changes, NOW);
  const input = weekInput(picks, new Map([['K0040075', { arts: { 5: ['舊', '新'] } }]]));
  assert.deepEqual(input.map(x => [x.id, x.kind]), [['11:1', 'bill'], ['11:4', 'bill'], ['K0040075@20261030', 'law']]);
  assert.equal(input[1].about, '特休可以累積', 'the proposals\' purpose when the bill has none of its own');
  assert.equal(weekInput(picks, new Map()).length, 2, 'a law with no diff on hand waits');
});

test('我的\'s 這一週: only what you follow, each with the night\'s line', () => {
  const mine = { laws: { K0040075: '2026-11-01', F0150059: '2026-11-01' }, items: { '11:4': '2026-11-01', '11:3': '2026-09-01' } };
  const weekly = { lines: { '11:4': '特休沒休完可以留到明年', 'K0040075@20261030': '酒駕吊照重考前要上課' } };
  const rows = weekOf(mine, items, changes, weekly, NOW);
  assert.deepEqual(rows.map(x => [x.kind, x.line]), [['law', '酒駕吊照重考前要上課'], ['law', ''], ['bill', '特休沒休完可以留到明年']], 'a followed staff table still shows, with its own words');
  assert.deepEqual(weekOf(mine, items, changes, null, NOW).map(x => x.line), ['', '', '']);
});
