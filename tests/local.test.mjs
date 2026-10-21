// 地方法規: the cities' pages read into rows and text, what is kept, what is read again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decode, rocLong, localKeep, localWant, needsRead, tidyText, platformText, tpeList, tpeText, ntpcList, ntpcText, ntpcCode } from '../public/lib/local.mjs';

test('dates and entities', () => {
  assert.equal(rocLong('民國 115 年 07 月 22 日 公發布'), '2026-07-22');
  assert.equal(rocLong('民國 100 年 6 月 1 日'), '2011-06-01');
  assert.equal(rocLong('無'), '');
  assert.equal(decode('&#x81EA;&#x6CBB;&#160;&amp;&lt;'), '自治 &<');
});

test('kept: the four kinds, no repealed, one per name (newest), 自治條例 first', () => {
  const row = (id, name, date, type) => ({ id, name, date, type });
  const kept = localKeep([row('A', '甲自治條例', '2020-01-01', '自治條例'), row('B', '乙公告', '', '系統公告'), row('C', '廢止丙要點', '', '行政規則'), row('D', '', '', '自治規則')]);
  assert.deepEqual(kept, [['A', '甲自治條例', '2020-01-01', '自治條例']]);
  const items = new Map([
    ['1', row('1', '丁要點', '2020-01-01', '行政規則')],
    ['2', row('2', '戊辦法', '2021-01-01', '自治規則')],
    ['3', row('3', '甲自治條例', '2019-01-01', '自治條例')],
    ['4', row('4', '戊辦法', '2023-01-01', '自治規則')],
    ['5', row('5', '己', '', '訴願決定書')]
  ]);
  assert.deepEqual(localWant(items).map(r => r.id), ['3', '4', '1']);
});

test('read again: never read, a moved date, or old when the list has no dates', () => {
  assert.ok(needsRead({ date: '2020-01-01' }, undefined, '2026-10-21'));
  assert.ok(!needsRead({ date: '2020-01-01' }, { stamp: '2020-01-01' }, '2026-10-21'));
  assert.ok(needsRead({ date: '2021-05-05' }, { stamp: '2020-01-01' }, '2026-10-21'));
  assert.ok(!needsRead({ date: '' }, { stamp: '2026-10-01' }, '2026-10-21'));
  assert.ok(needsRead({ date: '' }, { stamp: '2026-09-01' }, '2026-10-21'));
});

test('double-spaced text is closed up, gaps become one blank line', () => {
  assert.equal(tidyText('第1條\n\n甲乙丙\n\n丁戊己\n\n\n\n\n\n第2條\n\n庚辛\n\n壬癸  \n\n'), '第1條\n甲乙丙\n丁戊己\n\n第2條\n庚辛\n壬癸');
  // Already single-spaced: untouched.
  assert.equal(tidyText('一、甲\n二、乙\n\n三、丙'), '一、甲\n二、乙\n\n三、丙');
});

const tpeRow = (kind, id, name) => `<tr><td headers="cate-col-1">1.</td><td headers="cate-col-2">${kind}</td><td headers="cate-col-3"><ins>1</ins><a title="x" href="/Law/LawSearch/LawInformation/${id}?realID=01-01-1004">${name}</a></td></tr>`;

test('臺北市: a category page into rows and the last page', () => {
  const html = tpeRow('&#x81EA;&#x6CBB;&#x689D;&#x4F8B;', 'FL005874', '&#x81FA;&#x5317;&#x5E02;&#x5E02;&#x5EAB;&#x81EA;&#x6CBB;&#x689D;&#x4F8B;') + tpeRow('行政規則', 'FL005127', '臺北市政府國際事務委員會設置要點') + '<a class="page-link" href="/x&page=162" page="162" title="前往最終頁">最終頁</a>';
  const r = tpeList(html);
  assert.equal(r.pages, 162);
  assert.deepEqual(r.rows.map(x => [x.id, x.name, x.type]), [['FL005874', '臺北市市庫自治條例', '自治條例'], ['FL005127', '臺北市政府國際事務委員會設置要點', '行政規則']]);
  assert.equal(tpeList('<p>nothing</p>').pages, 1);
});

test('臺北市: a law page into name, date and articles', () => {
  const art = (no, body) => `<li><div class="row">${no ? `<div class="col-no">${no}</div>` : ''}<div class="col-data"><div class="law-articlepre">${body}</div></div><div class="col-link"></div></div></li>`;
  const html = `<a class="law-link" title="x" href="/Law/LawSearch/LawInformation/FL005874">臺北市市庫自治條例</a><dfn>北市03－06－1001</dfn><dfn>自治條例</dfn><dfn>&#x6C11;&#x570B; 100 &#x5E74; 06 &#x6708; 16 &#x65E5;</dfn><dfn class="pre">中華民國100年6月16日令修正</dfn><ul class="law law-content">${art('第 1 條', '為健全財政，<br>制定本自治條例。')}${art('第 2 條', '主管機關為財政局。')}</ul>`;
  assert.deepEqual(tpeText(html), { name: '臺北市市庫自治條例', date: '2011-06-16', text: '第 1 條\n為健全財政，\n制定本自治條例。\n\n第 2 條\n主管機關為財政局。' });
  // A 要點 has no article numbers: its own 一、二、 stand.
  assert.equal(tpeText(`<ul class="law law-content">${art('', '一、為辦理甲。')}${art('', '二、乙。')}</ul>`).text, '一、為辦理甲。\n\n二、乙。');
});

test('新北市: a kind page into rows; the text page by fcode', () => {
  const list = '<a id="x" href="/Scripts/FLAWDAT01.aspx?lncode=1C0130046">新北市營業衛生管理自治條例</a><a href="/Scripts/FLAWDAT01.aspx?lncode=1C0000072">新北市議會組織自治條例</a>';
  assert.deepEqual(ntpcList(list, '自治條例').map(x => [x.id, x.name, x.type]), [['1C0130046', '新北市營業衛生管理自治條例', '自治條例'], ['1C0000072', '新北市議會組織自治條例', '自治條例']]);
  assert.equal(ntpcCode('1C0130046'), 'C0130046');
  const row = (label, body) => `<tr><td class="col-th"><a id="a" href="FLAWDOC01.aspx?fcode=C1&amp;flno=1">${label}</a>&nbsp;&nbsp;</td><td class="col-td"><pre>${body}</pre></td></tr>`;
  const page = `<a id="cph_content_lawheader_hlkLNNAME" href="/Scripts/FLAWDAT01.aspx?lncode=1C1">新北市甲辦法</a> (民國 115 年 08 月 07 日 修正)</td>${row('第&#160;&#160;1&#160;&#160;條', '為乙，<b>訂定</b>本辦法。')}${row('第&#160;&#160;2&#160;&#160;條', '丙&amp;丁。')}`;
  assert.deepEqual(ntpcText(page), { name: '新北市甲辦法', date: '2026-08-07', text: '第 1 條\n為乙，訂定本辦法。\n\n第 2 條\n丙&丁。' });
  assert.equal(ntpcText(`<a id="cph_content_lawheader_hlkLNNAME" href="x">新北市乙要點</a> (民國 115 年 08 月 07 日 修正)${row('1', '一、為甲。')}`).text, '一、為甲。');
});

test('the 主管法規 platform: one text block, or 臺中市 table of articles', () => {
  assert.equal(platformText('<div id="ctl00_cp_content_divLawContent">第1條<br>甲。</div>'), '第1條\n甲。');
  const td = body => `<tr><td scope="row" class="th"></td><td><div class="ClearCss"><span>${body}</span></div></td></tr>`;
  const table = `<table><tr><td colspan="2" class="th law-char" scope="col">第一章　總則</td></tr>${td('第一條　　為甲，<br>&nbsp; &nbsp; 乙。')}${td('第二條　　丙。')}</table>`;
  assert.equal(platformText(table), '第一章　總則\n\n第一條　　為甲，\n    乙。\n\n第二條　　丙。');
  assert.equal(platformText('<p>nothing</p>'), '');
});
