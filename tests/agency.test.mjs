// 行政規則 from the agencies' open data: parsing, filtering, linking, sharding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRuleName, isoDate, tag, parseFsc, parseMnd, parseNdc, parseHakka, parseMoa, nameLaws, citedLaws, linkRules, byLaw } from '../public/lib/agency.mjs';
import { nameMap } from '../public/lib/refs.mjs';

const laws = [
  ['G0400001', '證券交易法', '法律', '', '19680430', 0, '', 183],
  ['G0400002', '證券交易', '法律', '', '19680430', 0, '', 1],
  ['H0030001', '大學法', '法律', '', '19480112', 0, '', 30],
  ['F0050001', '軍人保險條例', '法律', '', '19530101', 0, '', 30],
  ['Z0000001', '舊法', '法律', '', '19530101', 1, '', 3]
];
const names = nameMap(laws);

test('rule names: 要點 yes, rulings and repealed no', () => {
  assert.ok(isRuleName('證券金融事業申請設立及核發營業執照審核要點'));
  assert.ok(isRuleName('期貨商應行注意事項'));
  assert.ok(!isRuleName('廢止某某作業要點'));
  assert.ok(!isRuleName(''));
  assert.ok(!isRuleName('金管銀字第0940000號令'));
});

test('xml bits and dates', () => {
  assert.equal(tag('<a><x><![CDATA[ 甲&乙 ]]></x></a>', 'x'), '甲&乙');
  assert.equal(tag('<x>a &amp; b</x>', 'x'), 'a & b');
  assert.equal(tag('<y/>', 'x'), '');
  assert.equal(isoDate('20180810000000'), '2018-08-10');
  assert.equal(isoDate('2024.05.20 10:00'), '2024-05-20');
  assert.equal(isoDate(''), '');
});

const fsc = (kind, state, name, id, body) => `<Law><法規類別>${kind}</法規類別><公發布日>20200101</公發布日><修正日期>20220406</修正日期><異動性質>${state}</異動性質><法規名稱>${name}</法規名稱><法規內容><![CDATA[${body}]]></法規內容><圖表附件><檔案><下載網址>https://law.fsc.gov.tw/Download.ashx?type=LAW&amp;id=${id}&amp;FileID=1</下載網址></檔案></圖表附件></Law>`;

test('金管會: rules in force with an id, no rulings, no abolished', () => {
  const xml = '<LAWS>' + [
    fsc('行政規則', '修正', '證券金融事業審核要點', 'FL007248', '一、本要點依證券交易法第十八條規定訂定之。'),
    fsc('行政規則', '訂定', '', 'FL000001', ''),
    fsc('行政規則', '廢止', '舊要點', 'FL000002', ''),
    fsc('法規命令', '修正', '某辦法', 'FL000003', ''),
    fsc('行政規則', '訂定', '無附件作業規定', '', '')
  ].join('') + '</LAWS>';
  const r = parseFsc(xml);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].id, r[0].date, r[0].url], ['FSC:FL007248', '2022-04-06', 'https://law.fsc.gov.tw/LawContent.aspx?id=FL007248']);
  assert.equal(r.stats.noId, 1);
});

test('國防部, 國發會, 客委會, 農業部 sources', () => {
  const mnd = '<Direction><LawModel><LawName>軍人保險監理會設置要點</LawName><Level>行政規則</Level><ModifiedDate>20180810</ModifiedDate><Url>https://law.mnd.gov.tw/scp/NewsDetail.aspx?no=77</Url><Articles><![CDATA[一、國防部依軍人保險條例第四條第二項規定，設監理會，特訂定本要點。]]></Articles></LawModel><LawModel><LawName>無網址要點</LawName><Level>行政規則</Level></LawModel></Direction>';
  const m = parseMnd(mnd);
  assert.deepEqual(m.map(x => [x.id, x.agency, x.date]), [['MND:77', '國防部', '2018-08-10']]);
  const ndc = '<LAWS><法規><法規位階>06:行政規則§159,II,2</法規位階><法規名稱>中長期資金運用策劃及推動要點</法規名稱><法規網址>https://theme.ndc.gov.tw/lawout/LawContent.aspx?id=FL037508</法規網址><法規異動日期>20240520</法規異動日期><廢止註記>\n</廢止註記></法規><法規><法規位階>05:法規命令</法規位階><法規名稱>某辦法</法規名稱><法規網址>https://x/y</法規網址></法規></LAWS>';
  assert.deepEqual(parseNdc(ndc).map(x => x.id), ['NDC:FL037508']);
  const h = parseHakka([{ category: '行政規則', act_title: '補助作業要點', Date: '20120210', URL: 'https://www.hakka.gov.tw/x?serno=20951' }, { category: '法律', act_title: '客家基本法', URL: 'https://x' }, { category: '行政規則', act_title: '無網址要點', Date: '20120210' }]);
  assert.deepEqual(h.map(x => x.id), ['HAKKA:20951']);
  const rows = [{ '法規中文名稱': '漁業證明書核發作業規定', '公(發)布日期': '20090323000000', '中文內容': '依漁業法第四十四條', '發布單位': '農業部' }];
  assert.deepEqual(parseMoa(rows), [], 'no page for it: dropped');
  assert.equal(parseMoa(rows, n => `https://law.moa.gov.tw/?q=${n}`)[0].date, '2009-03-23');
});

test('laws a name speaks of: longest, not repealed, short names need to lead', () => {
  assert.deepEqual(nameLaws(laws, '證券交易法第十八條授權作業要點'), ['G0400001', 'G0400002']);
  assert.deepEqual(nameLaws(laws, '證券交易法施行細則作業要點'), ['G0400001', 'G0400002']);
  assert.deepEqual(nameLaws(laws, '空軍大學法律事務處理要點'), [], '大學法 inside a word is not the law');
  assert.deepEqual(nameLaws(laws, '舊法作業要點'), [], 'repealed laws are not linked');
  assert.deepEqual(nameLaws(laws, '大學法作業要點'), ['H0030001']);
});

test('laws cited without an article', () => {
  assert.deepEqual(citedLaws('一、國防部依軍人保險條例規定，設監理會', names), ['F0050001']);
  assert.deepEqual(citedLaws('依據：依據大學法第二十條，訂定', names), ['H0030001']);
  assert.deepEqual(citedLaws('一、為辦理業務，特訂定本要點。', names), []);
});

const raw = (id, name, text, date = '2022-01-01') => ({ id, name, agency: '金管會', date, url: `https://x/${id}`, text });

test('link: basis articles and laws, name-only, unlinked kept, known skipped, newest per name', () => {
  const rules = linkRules([
    raw('A', '證券金融事業審核要點', '一、本要點依證券交易法第十八條規定訂定之。'),
    raw('B', '大學法招生辦法', '一、為辦理招生。'),
    raw('C', '內部差勤要點', '一、差勤。'),
    raw('D', '已有的證券交易法辦法', '依證券交易法第十八條訂定'),
    raw('E', '大學法招生辦法', '一、為辦理招生。', '2023-01-01'),
    raw('F', '證券交易法第十八條作業要點', '無')
  ], laws, names, new Set(['已有的證券交易法辦法']));
  const by = Object.fromEntries(rules.map(r => [r[0], r]));
  assert.deepEqual(Object.keys(by).sort(), ['A', 'C', 'E', 'F']);
  assert.deepEqual(by.C.slice(5), [[], []], 'no law found: still kept');
  assert.deepEqual(by.A.slice(5), [['G0400001:18'], ['G0400001']]);
  assert.deepEqual(by.E.slice(5), [[], ['H0030001']]);
  assert.deepEqual(by.F[5], []);
  assert.deepEqual(rules.map(r => r[3]), ['2023-01-01', '2022-01-01', '2022-01-01', '2022-01-01'], 'newest first');
});

test('shards: by article, the rest by name, counted once', () => {
  const rules = [
    ['A', '甲要點', '金管會', '2022-01-01', 'https://x/A', ['G0400001:18', 'G0400001:19'], ['G0400001']],
    ['B', '乙要點', '國防部', '2022-01-01', 'https://x/B', [], ['G0400001', 'H0030001']]
  ];
  const { files, counts } = byLaw(rules);
  assert.deepEqual(files.G0400001.to['18'], [['A', '甲要點', '金管會', 'https://x/A']]);
  assert.deepEqual(files.G0400001.rest, [['B', '乙要點', '國防部', 'https://x/B']]);
  assert.deepEqual(files.H0030001.to, {});
  assert.deepEqual(counts, { G0400001: 2, H0030001: 1 });
});

import { vendorLeaves, vendorList, vendorText, rocDate, vendorRule, textFile } from '../public/lib/agency.mjs';

test('vendor: leaf categories, list rows, text', () => {
  const q = ['01', '0101', '0102', '02'].map(i => `<input name="cbCategoryID${i}" type="checkbox" id="cbCategoryID${i}" value="${i}" />`).join('');
  assert.deepEqual(vendorLeaves(q), ['0101', '0102', '02']);
  assert.deepEqual(vendorLeaves('<input id="cbCategoryIDA000" value="A000"><input id="cbCategoryIDA100" value="A100">'), ['A000', 'A100']);
  assert.equal(rocDate('115.09.01'), '2026-09-01');
  const row = (n, d, id, name, t) => `<tr><td class="aCenter" width="1%">${n}.</td><td class="aCenter" width="6%">${d}</td><td class="aCenter"><i class="x"></i><a id="a" href="LawContent.aspx?id=${id}">${name}</a></td><td class="aCenter" width="10%">${t}</td></tr>`;
  const html = `<h3><i></i>畜牧目 - 畜牧行政：50\n 筆 </h3>${row(1, '115.09.01', 'GL000650', '漁業法第四十四條作業規定', '行政規則')}${row(2, '104.01.02', 'GL000651', '某辦法', '法規命令')}`;
  const { total, rows } = vendorList(html);
  assert.equal(total, 50);
  assert.deepEqual(rows.map(r => [r.id, r.name, r.date, r.type]), [['GL000650', '漁業法第四十四條作業規定', '2026-09-01', '行政規則'], ['GL000651', '某辦法', '2015-01-02', '法規命令']]);
  const c = '<div id="ctl00_cp_content_divLawContent08" class="ClearCss">一、本要點依大學法<br>\n&nbsp; &nbsp; 第一條訂定。</div>';
  assert.ok(vendorText(c).startsWith('一、本要點依大學法\n') && vendorText(c).includes('第一條訂定'));
  const r = vendorRule('MOA', '農業部', 'https://law.moa.gov.tw', 'GL1', '某要點', '2026-01-01', c);
  assert.equal(r.id, 'MOA:GL1');
  assert.notEqual(textFile('MOA:GL1'), textFile(vendorRule('MOE', '教育部', 'https://edu.law.moe.gov.tw', 'GL1', '某要點', '2026-01-01', c).id), 'same id on two sites: two text files');
  assert.equal(r.url, 'https://law.moa.gov.tw/LawContent.aspx?id=GL1');
});

test('names that hold a law name anywhere link to it', () => {
  const ls = [['A1', '漁業法', '法律', '', '', 0, '', 1]];
  assert.deepEqual(nameLaws(ls, '遠洋漁業條例依漁業法規定之作業規定'), ['A1']);
  assert.deepEqual(nameLaws(ls, '漁業法第四十四條作業規定'), ['A1']);
  assert.deepEqual(nameLaws(ls, '漁業署作業規定'), []);
});

import { vendorWant, staleFirst, listedRows, listedKeep } from '../public/lib/agency.mjs';
import { searchLaws } from '../public/lib/search.mjs';

const li = (id, name, type, date = '2018-08-30') => ({ id, name, date, type });

test('vendor rules: 行政規則 and 其他 kept (教育部 files the 學生會 注意事項 under 其他), the rest not', () => {
  const items = new Map([
    ['GL001809', li('GL001809', '高級中等學校輔導學生會及其他相關自治組織運作注意事項', '其他')],
    ['GL1', li('GL1', '某作業要點', '行政規則')],
    ['GL2', li('GL2', '某辦法', '法規命令')],
    ['GL3', li('GL3', '大學法', '法律')],
    ['GL4', li('GL4', '已有的辦法', '行政規則')],
    ['GL5', li('GL5', '某作業要點', '行政規則', '2020-01-01')],
    ['GL6', li('GL6', '廢止某要點', '行政規則')],
    ['GL7', li('GL7', '教育部令', '其他')]
  ]);
  const want = vendorWant(items, new Set(['已有的辦法']));
  assert.deepEqual(want.map(r => r.id).sort(), ['GL001809', 'GL5'], 'one per name, the newest; no 令, 法律, 命令, known or repealed');
});

test('listing carries over: the longest unlisted category first, rows kept in between, a dropped category leaves', () => {
  const listed = { a: { at: 300, rows: [['1', '甲要點', '2020-01-01', '行政規則']] }, b: { at: 100, rows: [['2', '乙要點', '2020-01-01', '其他']] }, gone: { at: 1, rows: [['9', '丙要點', '2020-01-01', '行政規則']] } };
  assert.deepEqual(staleFirst(['a', 'new1', 'b', 'new2'], listed), ['new1', 'new2', 'b', 'a'], 'never listed first (site order), then the oldest');
  assert.deepEqual([...listedRows(['a', 'b'], listed).keys()], ['1', '2'], 'categories of the site now; "gone" left with its category');
  assert.equal(listedRows(['a', 'b'], { a: listed.a, b: { at: 5, rows: [] } }).size, 1, 'a category listed again replaces its rows');
  assert.deepEqual(listedKeep([li('1', 'x', '行政規則'), li('2', 'y', '法律')]), [['1', 'x', '2018-08-30', '行政規則']]);
});

test('a rule is found by name in the app search, even in the middle of its name', () => {
  const rows = [['教育部:GL001809', '高級中等學校輔導學生會及其他相關自治組織運作注意事項', '教育部', 'https://edu.law.moe.gov.tw/LawContent.aspx?id=GL001809', 1], ['教育部:GL2', '大專校院學生會辦法', '教育部', 'u']];
  for (const q of ['高級中等學校輔導學生會及其他相關自治組織運作注意事項', '輔導學生會', '學生會']) assert.ok(searchLaws(rows, q).some(r => r[0] === '教育部:GL001809'), q);
  assert.deepEqual(searchLaws(rows, '輔導學生會').map(r => r[0]), ['教育部:GL001809']);
});
