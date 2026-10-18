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
  assert.deepEqual(indexRow(l, 'Criminal Code'), ['C0000001', '中華民國刑法', '法律', '', '20250101', 0, 'Criminal Code', 1]);
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

import { courtOf, citesOf, compactRuling, mergeRulings, byLaw, inWindow } from '../public/lib/rulings.mjs';
test('rulings: top courts only, the articles cited by law name, newest kept per article', () => {
  assert.equal(courtOf('TPSV,112,台上,1234,20240101,1'), 'TPS');
  assert.equal(courtOf('JCCC,113,憲判,8,20240920,1'), 'JCC');
  assert.equal(courtOf('TPDV,112,訴,1,20240101,1'), '', 'a district court is not kept');
  const names = new Map([['民法', 'B1'], ['刑法', 'C1']]);
  assert.deepEqual(citesOf('依民法第１８４條第1項前段、第185條及第7條規定。另刑法第10條。', names).sort(), ['B1:184', 'B1:185', 'B1:7', 'C1:10'], 'a list after a law name is that law');
  const r = compactRuling({ JID: 'TPSV,1', JDATE: '20240102', JTITLE: '損害賠償', JFULL: '民法第184條' }, names);
  assert.deepEqual(r, ['TPSV,1', '2024-01-02', '損害賠償', ['B1:184']]);
  assert.deepEqual(compactRuling({ JID: 'TPSV,2', JDATE: '20240102', JFULLX: { JFULLCONTENT: '刑法第10條' } }, names)[3], ['C1:10']);
  const now = new Date('2026-10-18T00:00:00Z');
  const merged = mergeRulings([['A', '2026-01-01', '', ['B1:1']], ['OLD', '2020-01-01', '', ['B1:1']]], [['B', '2026-10-01', '', ['B1:1']], ['A', '2026-01-01', 'dup', []]], now);
  assert.deepEqual(merged.map(x => x[0]), ['B', 'A'], 'newest first, once each, the old one dropped');
  assert.deepEqual(byLaw(merged, 1), { B1: { 1: [['B', '2026-10-01', '']] } }, 'capped per article');
  assert.equal(inWindow(new Date('2026-10-18T19:30:00Z')), true, '03:30 Taiwan');
  assert.equal(inWindow(new Date('2026-10-18T04:00:00Z')), false, '12:00 Taiwan');
});

import { interpLinks } from '../public/lib/refs.mjs';
import { relatedLaws } from '../public/lib/search.mjs';
import { newCount } from '../public/lib/store.mjs';
test('cross-links: 大法官解釋 out to 憲法法庭, a law with its 施行法, the 追蹤 badge count', () => {
  const s = interpLinks('依司法院釋字第七四八號解釋之意旨，及大法官釋字第 499  號。');
  assert.equal(s[1].t, '司法院釋字第七四八號解釋');
  assert.match(s[1].url, /expno=748$/);
  assert.match(s[3].url, /expno=499$/);
  assert.equal(s.filter(x => typeof x === 'string').join(''), '依之意旨，及。');
  assert.deepEqual(interpLinks('第十條'), ['第十條']);
  const rows = [['B1', '民法'], ['B2', '民法總則施行法'], ['B3', '民法親屬編施行法'], ['B4', '民事訴訟法'], ['B5', '民法舊施行法', 0, 0, 0, 1]];
  assert.deepEqual(relatedLaws(rows, rows[0]).map(r => r[0]), ['B2', 'B3']);
  assert.deepEqual(relatedLaws(rows, rows[2]).map(r => r[0]), ['B1', 'B2']);
  const mine = { laws: { B1: '2026-10-01' }, items: { 'x:1': '2026-10-01', 'x:2': '2026-10-10' } };
  const items = [{ k: 'x:1', u: '2026-10-05' }, { k: 'x:2', u: '2026-10-05' }, { k: 'x:3', u: '2026-10-09' }];
  assert.equal(newCount(mine, items, { items: [{ p: 'B1', seen: '2026-10-02' }, { p: 'B9', seen: '2026-10-02' }] }), 2);
});

test('English: index rows carry MOJ’s English name; search finds it by words', () => {
  const law = { p: 'B1', n: '民法', l: '法律', c: '法務部', m: '20260817', a: [['A', '1', 'x']] };
  assert.equal(indexRow(law, 'Civil Code')[6], 'Civil Code');
  assert.equal(indexRow(law)[6], 0);
  const rows = [['B1', '民法', 0, 0, 0, 0, 'Civil Code'], ['B2', '民事訴訟法', 0, 0, 0, 0, 'Code of Civil Procedure'], ['C1', '勞動基準法', 0, 0, 0, 0, 0]];
  assert.deepEqual(searchLaws(rows, 'civil').map(r => r[0]), ['B1', 'B2']);
  assert.deepEqual(searchLaws(rows, 'Civil Code').map(r => r[0]), ['B1']);
  assert.deepEqual(searchLaws(rows, 'ci'), []);
});

import { compactNotice, mergeNotices, lawsOfNotice, twDay, isOpen } from '../public/lib/notices.mjs';
test('預告: drafts naming one of our laws, agency from the title, kept for a term', () => {
  const names = new Map([['產業創新條例', 'J1'], ['民法', 'B1']]);
  const law = { policyUid: 'u1', policyTitle: '經濟部公告：預告修正「產業創新條例」第四十三條。', pubGovName: null, publishDate: 1789442998000, offlineDate: 1794671999000 };
  const n = compactNotice(law, names);
  assert.deepEqual(n, { id: 'u1', t: '預告修正「產業創新條例」第四十三條。', gov: '經濟部', from: '2026-09-15', to: '2026-11-14', laws: ['J1'], kind: 'amend' });
  assert.equal(compactNotice({ policyUid: 'u2', policyTitle: '教育部公告：預告「教保服務人員條例施行細則」部分條文修正草案' }, names), null);
  assert.equal(compactNotice({ policyUid: 'u3', policyTitle: '法務部公告：預告廢止「民法」' }, names).kind, 'repeal');
  assert.deepEqual(lawsOfNotice('「民法」及「民法」', names), ['B1']);
  assert.equal(twDay(Date.UTC(2026, 9, 18, 17)), '2026-10-19');
  const old = { ...n, id: 'u0', from: '2022-01-01', to: '2022-02-01' };
  assert.deepEqual(mergeNotices([old, n], [{ ...n, t: 'new' }], new Date('2026-10-18')).map(x => x.t), ['new']);
  assert.ok(isOpen(n, '2026-11-14') && !isOpen(n, '2026-11-15'));
});

import { linkTrail } from '../public/lib/stack.mjs';
test('peek trail: a replaced sheet closing late keeps the trail; back walks it; the last close ends it', () => {
  const t = linkTrail();
  const a = {}, b = {}, c = {};
  assert.equal(t.show(a, ['B1', '14']), null);
  assert.equal(t.show(b, ['B1', '15-1']), a);
  t.closed(a); // the first sheet's close event, after the second opened
  assert.equal(t.show(c, ['B1', '14']), b);
  t.closed(b);
  assert.equal(t.length, 3);
  assert.deepEqual(t.back(), ['B1', '15-1']);
  const b2 = {};
  t.show(b2, ['B1', '15-1'], { back: true });
  t.closed(c);
  assert.deepEqual(t.back(), ['B1', '14']);
  const a2 = {};
  t.show(a2, ['B1', '14'], { back: true });
  assert.equal(t.back(), null);
  t.closed(b2); // not on screen: ignored
  assert.equal(t.length, 1);
  t.closed(a2);
  assert.equal(t.length, 0);
});

import { noticeBefore } from '../public/lib/notices.mjs';
test('預告 on the timeline: the latest draft before the round, within two years', () => {
  const ns = [{ id: 'a', from: '2025-01-10', t: 'x', gov: '經濟部' }, { id: 'b', from: '2025-06-01', t: 'y', gov: '經濟部' }, { id: 'c', from: '2026-01-01', t: 'z', gov: '經濟部' }];
  assert.equal(noticeBefore(ns, '2025-09-01').id, 'b');
  assert.equal(noticeBefore(ns, '2024-12-01'), null);
  assert.equal(noticeBefore(ns, '2028-01-02'), null);
  assert.equal(noticeBefore(ns, ''), null);
  const it = { stage: 1, open: true };
  const bills = [{ d: '2025-09-01', flow: [['2025-09-05', 1, '一讀']] }];
  const steps = timeline(it, bills, false, ns);
  assert.deepEqual([steps[0].name, steps[0].date, steps[0].stage, steps[1].name], ['預告', '2025-06-01', -1, '提案']);
  assert.equal(timeline(it, bills, false, []).length, 8);
});

test('命令: a regulation comes after a law of the same match, and joins its law’s family', () => {
  const rows = [['C1', '勞動基準法施行細則', '命令', '', '', 0, 0], ['B1', '勞動基準法', '法律', '', '', 0, 0]];
  assert.deepEqual(searchLaws(rows, '勞動基準').map(r => r[0]), ['B1', 'C1']);
  assert.deepEqual(relatedLaws(rows, rows[1]).map(r => r[0]), ['C1']);
  assert.deepEqual(relatedLaws(rows, rows[0]).map(r => r[0]), ['B1']);
});

import { parentLaw } from '../public/lib/refs.mjs';
test('links in a regulation: 本法 is its law, 本細則 is itself', () => {
  const rows = [['N1', '勞動基準法', '法律'], ['N2', '勞動基準法施行細則', '命令'], ['N3', '勞動', '法律', '', '', 1]];
  assert.equal(parentLaw(rows, '勞動基準法施行細則'), 'N1');
  assert.equal(parentLaw(rows, '道路交通安全規則'), '');
  const names = nameMap(rows);
  const s = linkText('依本法第七十條規定，本細則第二條及第三條。', { names, self: 'N1' }).filter(x => typeof x === 'object');
  assert.deepEqual(s.map(x => [x.law, x.from]), [['N1', '70'], ['', '2'], ['', '3']]);
  assert.deepEqual(linkText('本法第七十條', { names }).filter(x => typeof x === 'object').map(x => x.law), ['']);
});

import { diffTexts } from '../public/lib/data.mjs';
test('修正 texts: old and new per changed article', () => {
  const a = { p: 'B1', m: '1', a: [['A', '1', 'old one'], ['A', '2', 'same'], ['A', '3', 'gone']] };
  const b = { p: 'B1', m: '2', a: [['A', '1', 'new one'], ['A', '2', 'same'], ['A', '4', 'added']] };
  assert.deepEqual(diffTexts(a, b), { p: 'B1', m: '2', was: '1', arts: { 4: [null, 'added'], 1: ['old one', 'new one'], 3: ['gone', null] } });
});

import { sponsorOf } from '../public/lib/bills.mjs';
test('sponsors: 行政院, a caucus, a legislator by party', () => {
  const parties = new Map([['李坤城', '民主進步黨']]);
  assert.equal(sponsorOf('行政院', parties), '行政院');
  assert.equal(sponsorOf('本院台灣民眾黨黨團', parties), '台灣民眾黨');
  assert.equal(sponsorOf('本院委員李坤城等21人', parties), '民主進步黨');
  assert.equal(sponsorOf('本院委員王某等3人', parties), '');
});

import { stepOf, stageShort, progress, partyChips, billCard, funnel, diffWords, diffHtml, shortDay as cardDay } from '../public/lib/cards.mjs';
import { topicOf } from '../public/lib/topics.mjs';
test('cards: six steps, short stages, party chips, a bill card, the funnel', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(stepOf), [0, 1, 2, 2, 2, 3, 4, 5]);
  assert.equal(stageShort({ stage: 4 }), '協商中');
  assert.equal(stageShort({ stage: 6 }, true), 'Passed');
  assert.equal(stageShort({ stage: 2, held: true }), '暫緩');
  assert.match(progress({ stage: 4 }), /lw-prog moving/);
  assert.equal((progress({ stage: 4 }).match(/class="on/g) || []).length, 3);
  assert.match(partyChips([['民主進步黨', 3], ['行政院', 1]]), /民進黨<b>3<\/b>.*行政院<\/span>/);
  const card = billCard({ k: '11:01126', n: '老人福利法', stage: 4, u: '2026-10-20', count: 59, arts: { 2: 1, 8: 1 }, by: [['中國國民黨', 20]] }, { topic: 'welfare', now: new Date('2026-10-18') });
  assert.match(card, /href="#item=11-01126"/);
  assert.match(card, /10\/20/);
  assert.match(card, /59 版 · 2 條/);
  assert.match(card, /國民黨<b>20<\/b>/);
  assert.match(funnel([{ stage: 4, open: 1 }, { stage: 6, open: 0 }, { stage: 1, open: 1, dropped: true }]), /data-step="2"><b>1<\/b>.*data-step="4"><b>1<\/b>/s);
  assert.equal(cardDay('20250801', new Date('2026-01-01')), '2025/08/01');
  assert.equal(topicOf('老人福利法'), 'welfare');
});
test('before/after: the changed characters marked, long sameness shortened', () => {
  const d = diffWords('雇主應給付工資二萬元。', '雇主應給付工資三萬元。');
  assert.deepEqual(d, [{ t: '雇主應給付工資', op: '=' }, { t: '二', op: '-' }, { t: '三', op: '+' }, { t: '萬元。', op: '=' }]);
  assert.equal(diffWords('', '新增條文').map(x => x.op).join(), '+');
  const html = diffHtml('甲'.repeat(200) + '乙', '甲'.repeat(200) + '丙', { keep: 10 });
  assert.match(html, /…<\/span>甲{10}<del>乙<\/del><ins>丙<\/ins>/);
});

import { cleanChat, historyOf, chatLaw } from '../public/lib/chat.mjs';
test('問法律: only cites among its sources; soon when the route isn’t there', async () => {
  const c = cleanChat({ covered: true, answer: ' a ', sources: [{ p: 'B0000001', n: '民法', key: '421' }, { p: 'bad', key: '1' }], points: [{ text: 'x', cites: ['B0000001:421', 'B0000001:999'] }, { text: 'y', cites: ['C0000001:1'] }], consequences: [{ text: 'fine', cites: [] }], next: ['存證信函', 3], followups: ['f'] });
  assert.deepEqual(c.points, [{ text: 'x', cites: ['B0000001:421'] }]);
  assert.equal(c.covered, true);
  assert.equal(c.answer, 'a');
  assert.deepEqual(c.consequences, []);
  assert.deepEqual(c.next, ['存證信函']);
  assert.equal(c.sources.length, 1);
  assert.equal(cleanChat({ covered: true, points: [] }).covered, false);
  assert.equal(historyOf(Array.from({ length: 9 }, (_, i) => ({ role: 'user', text: String(i) }))).length, 6);
  const r = await chatLaw({ q: 'x' }, { fetcher: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  assert.equal(r.error, 'soon');
});

import { encodeMine, decodeMine, mergeMine } from '../public/lib/store.mjs';
test('mine on the Pass: round trip, newer copy decides, later seen days kept', () => {
  const a = { laws: { A: '2026-10-01', B: '2026-10-02' }, items: { '11:1': '2026-10-01' }, marks: [{ p: 'A', k: '1' }], recent: ['A', 'B'], t: 100, seenChanges: '' };
  const back = decodeMine(encodeMine(a));
  assert.deepEqual(back.laws, a.laws);
  assert.equal(decodeMine('nope'), null);
  assert.equal(decodeMine('{"v":2}'), null);
  // Theirs newer: B unfollowed there stays unfollowed; A's later day kept from ours.
  const theirs = { laws: { A: '2026-09-01', C: '2026-10-05' }, items: {}, marks: [], recent: ['C'], t: 200 };
  const m = mergeMine({ ...a, laws: { ...a.laws, A: '2026-10-09' } }, theirs);
  assert.deepEqual(m.laws, { A: '2026-10-09', C: '2026-10-05' });
  assert.deepEqual(m.items, {});
  assert.deepEqual(m.recent, ['C', 'A', 'B']);
  assert.equal(m.t, 200);
  // Ours newer: ours decides.
  assert.deepEqual(mergeMine(a, { ...theirs, t: 50 }).laws, a.laws);
});

test('問法律: the proxy 404 before the route ships reads as soon', async () => {
  const r = await chatLaw({ q: 'x' }, { fetcher: async () => ({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND' } }) }) });
  assert.equal(r.error, 'soon');
  const c = await chatLaw({ q: 'x' }, { fetcher: async () => ({ ok: false, status: 429, json: async () => ({ error: 'cap', left: 0 }) }) });
  assert.equal(c.error, 'cap');
});

import { passFetch, askBill, askDiff } from '../public/lib/ask.mjs';
test('AI calls carry the Law Pass session, a 401 asked once more with a new token', async () => {
  const urls = [];
  let n = 0;
  const s = { ensureToken: async ({ renew }) => (renew ? 'new' : 'old') };
  const f = passFetch(s, async (url, init) => (urls.push([url, init.headers['Content-Type']]), { status: n++ ? 200 : 401 }));
  const r = await f('https://w/law-chat', { method: 'POST', body: '{}' });
  assert.equal(r.status, 200);
  assert.deepEqual(urls, [['https://w/law-chat?v=1&qt=old', 'text/plain'], ['https://w/law-chat?v=1&qt=new', 'text/plain']]);
});
test('bill and diff explanations: shapes kept, cites only among the asked', async () => {
  const b = await askBill({ bill: '20' }, async () => ({ ok: true, json: async () => ({ answer: 'a', changes: [{ text: 'x', article: '5' }, { text: '' }], who: ['勞工'], covered: true }) }));
  assert.deepEqual(b.changes, [{ text: 'x', article: '5' }]);
  assert.deepEqual(b.who, ['勞工']);
  const d = await askDiff({ p: 'B', arts: ['1'] }, async () => ({ ok: true, json: async () => ({ answer: 'a', points: [{ text: 'y', cites: ['1', '9'] }], covered: true }) }));
  assert.deepEqual(d.points, [{ text: 'y', cites: ['1'] }]);
  const e = await askBill({ bill: '20' }, async () => ({ ok: false, status: 404, json: async () => ({ error: 'bill' }) }));
  assert.equal(e.error, 'bill');
});
