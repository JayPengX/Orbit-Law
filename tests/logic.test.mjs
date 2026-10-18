// The logic, without a browser: law records, links, bills and their stages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { artKey, pcodeOf, compactLaw, diffLaws, mergeChanges, indexRow } from '../public/lib/data.mjs';
import { cnNumber, linkText, paragraphs, nameMap } from '../public/lib/refs.mjs';
import { stageOf, compactBill, billStage, foldBills, lawOfTitle, changedSince, mergeBills, articlesOfTitle, PASSED, PROMULGATED } from '../public/lib/bills.mjs';
import { timeline, articleHtml, articlesBetween, contents, freshMarks, lawHtml } from '../public/lib/view.mjs';
import { searchLaws, parseJump, headingDepth } from '../public/lib/search.mjs';
import { loadMine, toggleFollow, lawsChanged, toggleMark, isMarked, addRecent } from '../public/lib/store.mjs';

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
  const [newLaw] = foldBills([compactBill(raw('9', { 法律編號: [], '法律編號:str': [], 議案名稱: '「某某新設很長名稱的條例草案」，請審議案。' }))]);
  assert.match(newLaw.k, /^11:n[0-9a-f]{8}$/, 'a new law gets a short id');
  assert.equal(newLaw.n, '某某新設很長名稱的條例');
  assert.deepEqual([item.n, item.p, item.stage, item.passed, item.open, item.count, item.gov], ['甲法', 'P1', PASSED, '2026-03-01', 0, 4, true]);
  const [pub] = foldBills([a, b], { pcodes: new Map([['甲法', 'P1']]), modified: new Map([['P1', '20260320']]) });
  assert.deepEqual([pub.stage, pub.pub], [PROMULGATED, '20260320']);
  const [old] = foldBills([a, b], { pcodes: new Map([['甲法', 'P1']]), modified: new Map([['P1', '20250101']]) });
  assert.equal(old.stage, PASSED, 'an MOJ copy older than the vote is not the new law');
  assert.equal(foldBills([c])[0].dropped, true);
  // After the 三讀, a new version moving again is this term's open round.
  const e = compactBill(raw('5', { 最新進度日期: '2026-05-01', 議案流程: [{ 狀態: '黨團協商', 日期: ['2026-04-01'] }] }));
  const [again] = foldBills([a, b, e], { pcodes: new Map([['甲法', 'P1']]), modified: new Map([['P1', '20260320']]) });
  assert.deepEqual([again.stage, again.open, again.pub], [4, 1, '20260320'], 'a quiet version from before the vote is not open');
});

test('bills: titles name their law; merge keeps the newest; changed since last look', () => {
  assert.equal(lawOfTitle('民法部分條文修正草案', new Map([['民法', 'B']])), '民法');
  assert.equal(lawOfTitle('「行政法人法第二條條文修正草案」'), '行政法人法');
  assert.equal(lawOfTitle('寵物食品安全管理法草案'), '寵物食品安全管理法');
  assert.deepEqual(mergeBills([{ id: '1', u: 'a' }, { id: '2', u: 'a' }], [{ id: '1', u: 'b' }]).map(b => b.u), ['b', 'a']);
  assert.deepEqual(changedSince([{ k: 'x', u: '2026-02-01' }, { k: 'y', u: '2026-01-01' }], { x: '2026-01-15', y: '2026-01-01' }).map(i => i.k), ['x']);
});

test('search: names, short names, characters in order, jumps to an article', () => {
  const rows = [['B1', '民法', '法律', '', '', 0], ['B2', '民事訴訟法', '法律', '', '', 0], ['B3', '個人資料保護法', '法律', '', '', 0], ['C1', '中華民國刑法', '法律', '', '', 0], ['X', '民事舊法', '法律', '', '', 1]];
  assert.equal(searchLaws(rows, '民法')[0][1], '民法');
  assert.equal(searchLaws(rows, '民訴')[0][1], '民事訴訟法');
  assert.equal(searchLaws(rows, '個資')[0][1], '個人資料保護法');
  assert.equal(searchLaws(rows, '刑法')[0][1], '中華民國刑法');
  assert.equal(searchLaws(rows, '民事').pop()[1], '民事舊法', 'repealed laws last');
  assert.deepEqual([parseJump(rows, '民法184').row[0], parseJump(rows, '民法184').key], ['B1', '184']);
  assert.equal(parseJump(rows, '刑法第十條之一').key, '10-1');
  assert.equal(parseJump(rows, '民訴 24-1').key, '24-1');
  assert.equal(parseJump(rows, '民法'), null);
  assert.equal(headingDepth('第 一 編 總則'), 0);
  assert.equal(headingDepth('   第 三 節 意思表示'), 2);
});

test('view: article links carry their target; ranges; contents; the open round timeline', () => {
  const l = { p: 'B1', a: [['C', '', '第 一 章 法例'], ['A', '1', '甲。'], ['A', '2', '依第一條及民法第三條規定。\n前項情形。'], ['A', '3', '丙。']] };
  const html = articleHtml(l.a[2], { names: new Map([['民法', 'B1']]), keys: ['1', '2', '3'], p: 'B1' });
  assert.match(html, /data-law="B1" data-from="1"/);
  assert.match(html, /class="lw-ref para"[^>]*data-para="1"/);
  assert.deepEqual(articlesBetween(l, '1', '3').map(a => a[1]), ['1', '2', '3']);
  assert.deepEqual(articlesBetween(l, '9'), []);
  assert.deepEqual(contents(l), [{ id: 'h-0', title: '第 一 章 法例', depth: 1, first: '1' }]);
  assert.doesNotMatch(articleHtml(['A', '1', '<b>'], {}), /<b>/, 'text is escaped');
  const a = compactBill(raw('1'));
  const t = timeline({ stage: 1, pub: '' }, [a]);
  assert.deepEqual(t.slice(0, 3).map(s => [s.name, s.date, s.done]), [['提案', '2026-01-01', true], ['一讀', '2026-01-02', true], ['委員會審查', '', false]]);
});

test('store: follow, bookmarks, recent; followed laws amended since last look', () => {
  const mem = new Map();
  const store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const mine = loadMine(store);
  assert.equal(toggleFollow(mine, 'laws', 'B1', new Date('2026-10-01T00:00:00Z')), true);
  assert.deepEqual(lawsChanged(mine, { items: [{ p: 'B1', seen: '2026-10-05' }, { p: 'B2', seen: '2026-10-05' }, { p: 'B1', seen: '2026-09-01' }] }).length, 1);
  assert.equal(toggleMark(mine, 'B1', '184'), true);
  assert.equal(isMarked(mine, 'B1', '184'), true);
  addRecent(mine, 'B2');
  addRecent(mine, 'B1');
  addRecent(mine, 'B2');
  assert.deepEqual(mine.recent, ['B2', 'B1']);
  assert.deepEqual(loadMine({ getItem: () => '{bad' }).marks, [], 'a broken copy reads empty');
});

test('修法追蹤 marks: the latest amendment of the law on screen only', () => {
  const law = { p: 'B1', m: '20260817', a: [['A', '1', 'a'], ['A', '2', 'b']] };
  const changes = { items: [{ p: 'B1', m: '20260817', added: ['2'], amended: ['1'], removed: [] }, { p: 'B1', m: '20250101', added: [], amended: ['2'], removed: [] }] };
  assert.deepEqual(freshMarks(changes, law), { 1: '修正 2026/08/17', 2: '新增 2026/08/17' });
  assert.deepEqual(freshMarks(changes, { ...law, m: '20270101' }), {});
  assert.match(lawHtml(law, { fresh: freshMarks(changes, law) }), /lw-fresh">修正 2026\/08\/17/);
  assert.match(lawHtml(law, { pending: { 2: '3 個修正提案' }, pendingItem: '11-001' }), /id="a-2".*lw-pending" data-item="11-001">3 個修正提案/);
});

import { askLaw, askError } from '../public/lib/ask.mjs';
test('白話解釋: only points citing the articles asked about; failures in plain words', async () => {
  let sent;
  const ok = async (url, init) => ((sent = JSON.parse(init.body)), { ok: true, json: async () => ({ answer: '甲', points: [{ text: 'a', cites: ['184'] }, { text: 'b', cites: ['999'] }], covered: true, cached: false, left: 19 }) });
  const r = await askLaw({ p: 'B0000001', arts: ['184'], q: '  x  ' }, ok);
  assert.deepEqual(sent, { p: 'B0000001', arts: ['184'], q: 'x', lang: 'zh' });
  assert.deepEqual(r.points, [{ text: 'a', cites: ['184'] }]);
  assert.equal(r.covered, true);
  const none = await askLaw({ p: 'B', arts: ['1'] }, async () => ({ ok: true, json: async () => ({ answer: '', points: [{ text: 'x', cites: ['2'] }], covered: true }) }));
  assert.equal(none.covered, false, 'nothing cited right is not covered');
  assert.deepEqual(await askLaw({ p: 'B', arts: ['1'] }, async () => ({ ok: false, status: 429, json: async () => ({ error: 'cap', left: 0 }) })), { error: 'cap', left: 0 });
  assert.equal((await askLaw({ p: 'B', arts: ['1'] }, async () => { throw new Error(); })).error, 'offline');
  assert.equal((await askLaw({ p: 'B', arts: ['1'] }, async () => ({ ok: true, json: async () => ({}) }))).error, 'bad', 'an empty answer is a failure, not 沒有規定');
  assert.match(askError('cap'), /明天/);
  assert.match(askError('weird', true), /right now/);
});

test('bills: the articles a title names, counted over the open round', () => {
  assert.deepEqual(articlesOfTitle('老人福利法第二條、第九條及第二十二條條文修正草案'), ['2', '9', '22']);
  assert.deepEqual(articlesOfTitle('老人福利法增訂第二十五條之一條文草案'), ['25-1']);
  assert.deepEqual(articlesOfTitle('民法部分條文修正草案'), []);
  const a = compactBill(raw('1', { 議案名稱: '「甲法第二條條文修正草案」，請審議案。' }));
  const b = compactBill(raw('2', { 議案名稱: '「甲法第二條及第三條條文修正草案」，請審議案。' }));
  assert.deepEqual(foldBills([a, b])[0].arts, { 2: 2, 3: 1 });
});

import { bigrams, bucketOf, buildIndex, searchText, groupHits, PER_LAW } from '../public/lib/fulltext.mjs';
test('全文檢索: bigram buckets find articles holding every pair of the words', async () => {
  assert.deepEqual([...bigrams('損害，賠償')], ['損害', '賠償']);
  const laws = [{ a: [['C', '', '章'], ['A', '1', '負損害賠償責任'], ['A', '2', '損害']] }, { a: [['A', '1', '賠償損害之方法']] }];
  const idx = buildIndex(laws);
  const bucket = async n => idx.get(n);
  assert.deepEqual(await searchText('損害賠償', bucket), [0], 'only the article with all three pairs');
  assert.deepEqual(await searchText('損害', bucket), [0, 1, PER_LAW]);
  assert.deepEqual(await searchText('！', bucket), []);
  assert.deepEqual(groupHits([0, 1, PER_LAW]), [{ law: 0, arts: [0, 1] }, { law: 1, arts: [0] }]);
  assert.ok(bucketOf('損害') >= 0 && bucketOf('損害') < 2048);
});
