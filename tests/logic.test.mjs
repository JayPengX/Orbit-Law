// The logic, without a browser: law records, links, bills and their stages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { artKey, pcodeOf, compactLaw, diffLaws, mergeChanges, indexRow } from '../public/lib/data.mjs';
import { cnNumber, linkText, paragraphs, nameMap } from '../public/lib/refs.mjs';
import { stageOf, compactBill, billStage, foldBills, lawOfTitle, changedSince, mergeBills, PASSED, PROMULGATED } from '../public/lib/bills.mjs';

const law = (p, n, arts, m = '20260101') => ({ p, n, m, a: arts.map(([k, t]) => ['A', k, t]) });

test('Chinese numerals and article keys', () => {
  assert.equal(cnNumber('一百八十四'), 184);
  assert.equal(cnNumber('十一'), 11);
  assert.equal(cnNumber('十'), 10);
  assert.equal(cnNumber('一千零五'), 1005);
  assert.equal(cnNumber('二百三十一'), 231);
  assert.equal(cnNumber('12'), 12);
  assert.ok(Number.isNaN(cnNumber('abc')));
  assert.equal(artKey('第 231-1 條'), '231-1');
  assert.equal(artKey('Article 7'), '7');
  assert.equal(pcodeOf('https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=b0000001'), 'B0000001');
});

test('a MOJ record is made small: headings, keys, clean lines', () => {
  const l = compactLaw({ LawURL: 'x?pcode=C0000001', LawName: '中華民國刑法 ', LawLevel: '法律', LawModifiedDate: '20250101', LawArticles: [{ ArticleType: 'C', ArticleNo: '', ArticleContent: '   第 一 章 法例' }, { ArticleType: 'A', ArticleNo: '第 2 條', ArticleContent: '一。  \r\n二。\r\n' }] });
  assert.equal(l.n, '中華民國刑法');
  assert.deepEqual(l.a, [['C', '', '第 一 章 法例'], ['A', '2', '一。\n二。']]);
  assert.deepEqual(indexRow(l, true), ['C0000001', '中華民國刑法', '法律', '', '20250101', 0, 1, 1]);
  assert.equal(compactLaw({ LawName: 'x' }), null, 'no pcode, no law');
});

const names = nameMap([['B0000001', '民法', '法律', '', '', 0, 1, 1], ['C0000001', '中華民國刑法', '法律', '', '', 0, 1, 1], ['X1', '舊法', '法律', '', '', 1, 0, 1]]);

test('links: named laws carry through the sentence, 本法 comes back, unknown laws link nothing', () => {
  const s = linkText('依民法第一百八十四條、第一百八十五條及刑法第十條之一規定；第二條至第五條準用之。', { names });
  const refs = s.filter(x => typeof x === 'object');
  assert.deepEqual(refs.map(r => [r.t, r.law, r.from, r.to]), [
    ['民法第一百八十四條', 'B0000001', '184', '184'],
    ['第一百八十五條', 'B0000001', '185', '185'],
    ['刑法第十條之一', 'C0000001', '10-1', '10-1'],
    ['第二條至第五條', '', '2', '5']
  ]);
  assert.equal(s.map(x => (typeof x === 'string' ? x : x.t)).join(''), '依民法第一百八十四條、第一百八十五條及刑法第十條之一規定；第二條至第五條準用之。', 'nothing lost');
  const unknown = linkText('依某某組織條例第七條及第八條規定。依本法第三條。', { names }).filter(x => typeof x === 'object');
  assert.deepEqual(unknown.map(r => [r.t, r.law, r.from]), [['本法第三條', '', '3']]);
  assert.deepEqual(linkText('第七條第二項', { names })[0], { t: '第七條第二項', law: '', from: '7', to: '7', para: 2 });
});

test('links: 前條, 前N條, 前項 and 第N項 inside the law', () => {
  const keys = ['1', '2', '2-1', '3'];
  const r = linkText('前條及前三條、前項、第一項', { keys, at: '3', para: 2 }).filter(x => typeof x === 'object');
  assert.deepEqual(r.map(x => [x.t, x.from, x.to, x.para]), [['前條', '2-1', '2-1', 0], ['前三條', '1', '2-1', 0], ['前項', '', '', 1], ['第一項', '', '', 1]]);
  assert.equal(linkText('前條', { keys, at: '1' }).length, 1, 'the first article has no 前條');
  assert.equal(linkText('前項', { para: 1 })[0], '前項', 'the first 項 has no 前項');
  assert.equal(names.get('刑法'), 'C0000001', 'short names');
});

test('paragraphs: 款 and 目 stay inside their 項', () => {
  assert.deepEqual(paragraphs('甲如下：\n一、乙。\n二、丙。\n（一）丁。\n前項之規定。'), [['甲如下：', '一、乙。', '二、丙。', '（一）丁。'], ['前項之規定。']]);
});

test('修法追蹤: what an amendment changed, kept for a while, one entry per version', () => {
  const d = diffLaws(law('B1', '甲法', [['1', 'a'], ['2', 'b']], '20250101'), law('B1', '甲法', [['1', 'a'], ['2', 'B'], ['3', 'c']], '20260101'));
  assert.deepEqual([d.added, d.amended, d.removed, d.was], [['3'], ['2'], [], '20250101']);
  assert.deepEqual(diffLaws(null, law('B2', '新法', [['1', 'a']])).added, [], 'a new law lists nothing as added');
  const now = new Date('2026-10-18T00:00:00Z');
  const prev = { items: [{ p: 'B1', m: '20260101', seen: '2026-10-01' }, { p: 'OLD', m: '1', seen: '2026-01-01' }] };
  const merged = mergeChanges(prev, [{ ...d }], now, 120);
  assert.deepEqual(merged.items.map(i => [i.p, i.seen]), [['B1', '2026-10-18']], 'the same version once, the old one dropped');
});

test('stages: raw 立法院 statuses fold into one scale', () => {
  assert.deepEqual(stageOf('排入院會 (交司法及法制委員會)'), { stage: 1, committee: '司法及法制委員會' });
  assert.equal(stageOf('交付審查').stage, 1);
  assert.equal(stageOf('委員會審查').stage, 2);
  assert.equal(stageOf('委員會發文').stage, 2);
  assert.equal(stageOf('審查完畢').stage, 3);
  assert.equal(stageOf('逕付二讀').stage, 3);
  assert.equal(stageOf('逕付二讀(交付協商)').stage, 4);
  assert.equal(stageOf('黨團協商').stage, 4);
  assert.equal(stageOf('二讀').stage, 5);
  assert.equal(stageOf('審查完畢(三讀)').stage, PASSED);
  assert.equal(stageOf('三讀').stage, PASSED);
  assert.ok(stageOf('退回程序委員會').held);
  assert.ok(stageOf('同意撤回').dropped);
  assert.ok(stageOf('不予審議').dropped);
});

const raw = (id, over = {}) => ({ 議案編號: id, 議案名稱: '「甲法第二條條文修正草案」，請審議案。', 提案單位: '', 提案來源: '委員提案', 屆: 11, 提案日期: '2026-01-01', 最新進度日期: '2026-02-01', 議案狀態: '交付審查', 法律編號: ['001'], '法律編號:str': ['甲法'], 議案流程: [{ 狀態: '排入院會 (交內政委員會)', 日期: ['2026-01-02'] }], 關連議案: [], ...over });

test('bills: every version on one law in a term is one item; 三讀 then the MOJ copy makes it 總統公布', () => {
  const a = compactBill(raw('1'));
  assert.equal(a.t, '甲法第二條條文修正草案');
  assert.deepEqual(a.flow, [['2026-01-02', 1, '排入院會 (交內政委員會)']]);
  const b = compactBill(raw('2', { 提案來源: '政府提案', 議案狀態: '三讀', 議案流程: [{ 狀態: '三讀', 日期: ['2026-03-01'] }] }));
  const c = compactBill(raw('3', { 議案狀態: '同意撤回' }));
  const d = compactBill(raw('4', { 法律編號: [], '法律編號:str': [], 議案名稱: '「甲法部分條文修正草案」，請審議案。' }));
  assert.equal(billStage(c).dropped, true);
  const [item, ...rest] = foldBills([a, b, c, d], { pcodes: new Map([['甲法', 'P1']]) });
  assert.equal(rest.length, 0, 'the title names the same law');
  assert.deepEqual([item.n, item.p, item.stage, item.passed, item.open, item.count, item.gov], ['甲法', 'P1', PASSED, '2026-03-01', 2, 4, true]);
  const [pub] = foldBills([a, b], { pcodes: new Map([['甲法', 'P1']]), modified: new Map([['P1', '20260320']]) });
  assert.deepEqual([pub.stage, pub.pub], [PROMULGATED, '20260320']);
  const [old] = foldBills([a, b], { pcodes: new Map([['甲法', 'P1']]), modified: new Map([['P1', '20250101']]) });
  assert.equal(old.stage, PASSED, 'an MOJ copy older than the vote is not the new law');
  assert.equal(foldBills([c])[0].dropped, true);
});

test('bills: titles name their law; merge keeps the newest; changed since last look', () => {
  assert.equal(lawOfTitle('民法部分條文修正草案', new Map([['民法', 'B']])), '民法');
  assert.equal(lawOfTitle('「行政法人法第二條條文修正草案」'), '行政法人法');
  assert.equal(lawOfTitle('寵物食品安全管理法草案'), '寵物食品安全管理法');
  assert.deepEqual(mergeBills([{ id: '1', u: 'a' }, { id: '2', u: 'a' }], [{ id: '1', u: 'b' }]).map(b => b.u), ['b', 'a']);
  assert.deepEqual(changedSince([{ k: 'x', u: '2026-02-01' }, { k: 'y', u: '2026-01-01' }], { x: '2026-01-15', y: '2026-01-01' }).map(i => i.k), ['x']);
});
