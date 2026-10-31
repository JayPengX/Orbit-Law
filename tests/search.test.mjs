// 法規 search by name: what people type (a name, a short name, the start of
// one, part of one) and what has to come first. Rows are the real index's
// (tests/fixtures/law-names.json: every law and 命令 these queries reach,
// taken from data/index.json + orders.json on 2026-10-31).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rankLaws, likelyLaw } from '../public/lib/search.mjs';

const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/law-names.json', import.meta.url)));
// [query, the law on the card on top (or null), the first names after it, in order]
const GOLD = [
  ['憲法', '中華民國憲法', ['中華民國憲法增修條文', '憲法訴訟法']],
  ['憲法增', '中華民國憲法增修條文', []],
  ['憲法增修', '中華民國憲法增修條文', []],
  ['憲法增修條文', '中華民國憲法增修條文', []],
  ['增修條文', '中華民國憲法增修條文', []],
  ['刑法', '中華民國刑法', ['中華民國刑法施行法']],
  ['民法', '民法', []],
  ['勞基法', '勞動基準法', []],
  ['勞基', '勞動基準法', []],
  ['勞動基', null, ['勞動基準法']],
  ['勞動', null, ['勞動基準法']],
  ['個資', '個人資料保護法', []],
  ['個資法', '個人資料保護法', []],
  ['民訴', '民事訴訟法', []],
  ['刑訴', '刑事訴訟法', []],
  ['行訴', '行政訴訟法', []],
  ['行程', '行政程序法', []],
  ['憲訴', '憲法訴訟法', []],
  ['道交', '道路交通管理處罰條例', []],
  ['消保', '消費者保護法', []],
  ['國賠', '國家賠償法', []],
  ['兒少', '兒童及少年福利與權益保障法', []],
  ['勞保', '勞工保險條例', []],
  ['勞退', '勞工退休金條例', []],
  ['健保', '全民健康保險法', []],
  ['公投', '公民投票法', []],
  ['選罷', '公職人員選舉罷免法', []],
  ['性平', '性別平等工作法', ['性別平等教育法']],
  ['公司', '公司法', []],
  ['所得稅', '所得稅法', []],
  ['著作權', '著作權法', []],
  ['地方制度', '地方制度法', []],
  ['家暴法', '家庭暴力防治法', []],
  ['立法院', null, ['立法院職權行使法', '立法院組織法']],
  ['刑事', null, ['刑事訴訟法']],
  ['民事', null, ['民事訴訟法']],
  ['個人資料', null, ['個人資料保護法']],
  ['道路', null, ['道路交通管理處罰條例']]
];

// As 找法 shows them: the card on top, then the laws (not 命令) by name.
const shown = q => {
  const top = likelyLaw(rows, q);
  const laws = rankLaws(rows, q, 30).filter(([s, r]) => s < 4 && r !== top && r[2] !== '命令').map(([, r]) => r[1]);
  return { top: top ? top[1] : null, laws };
};

for (const [q, top, next] of GOLD)
  test(`search 「${q}」: ${top || 'no card'}${next.length ? `, then ${next.join(', ')}` : ''}`, () => {
    const got = shown(q);
    assert.equal(got.top, top);
    assert.deepEqual(got.laws.slice(0, next.length), next);
  });

test('search: a repealed law is never the card, and comes last', () => {
  const more = [...rows, ['A0000005', '動員戡亂時期臨時條款', '憲法', '', '', 1], ['X1', '動員戡亂時期國家安全法', '法律', '', '', 1]];
  assert.equal(likelyLaw(more, '動員戡亂時期臨時條款'), null);
  assert.equal(likelyLaw(more, '臨時條款'), null);
  assert.equal(rankLaws(more, '國家安全').at(-1)[1][1], '動員戡亂時期國家安全法');
});

test('search: one character finds names but means no one law', () => {
  assert.equal(likelyLaw(rows, '憲'), null);
  assert.ok(rankLaws(rows, '憲').length > 1);
});
