// 彰化's 代表會 on the county's platform (public/lib/town-chcg.mjs): 和美, 福興, 伸港's pages as they draw them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionOf, paperKind, chcgLinks, chcgMenu, chcgMembers, dayIn, driveId, pdfSpan, yearOf, chcgUrl, tsoPage, tsoUrl, folderOf, nameSpan, formUrl, formList, wpPost, wpDay, joomlaList, joomlaArticle, penghuList, penghuPost, penghuDay, ccmsPage, ccmsFile, ccmsNews, pthgName, driveEntries, driveFolderId, boxList, boxFiles, westDay, linkFiles, pageMore, ytId } from '../public/lib/town-chcg.mjs';
import { TOWN_SITES } from '../public/lib/town-site.mjs';

test('town chcg: a session from however a link names it', () => {
  const k = (n, t = 22) => sessionOf(n, t)?.key;
  assert.equal(k('第22屆第18、19次臨時會日程表'), '第22屆第18、19次臨時會');
  assert.equal(k('第22屆第1.2次臨時會'), '第22屆第1、2次臨時會');
  assert.equal(k('第21屆第1-2次臨時會紀錄_2025', 21), '第21屆第1、2次臨時會');
  assert.equal(k('第22屆第13、14臨時會議事錄'), '第22屆第13、14次臨時會');
  assert.equal(k('第12次臨時會議事錄', 21), '第21屆第12次臨時會');
  assert.deepEqual(sessionOf('第22屆第2次定期會延會日程表_2025', 22), { key: '第22屆第2次定期會', n: '第2次定期會', term: 22, no: 2, kind: '定期會', ext: true });
  assert.equal(sessionOf('112年經建考察', 22), null);
  assert.equal(sessionOf('第22屆定期會', 22), null);
  assert.equal(k('下載第22屆第二次定期會延長會日程表'), '第22屆第2次定期會');
  assert.equal(k('第三屆第18次臨時會', 3), '第3屆第18次臨時會');
  assert.equal(sessionOf('第22屆第4次定期延長會議事日程表', 22).ext, true);
  assert.equal(sessionOf('第22屆第1-5次臨時會錄音', 22), null);
  assert.deepEqual(['議事日程表', '代表提案第1號', '第1號提案表', '第22屆第7次定期會議事錄', '第21屆第3次臨時會紀錄', '鄉長施政總報告'].map(paperKind), ['議事日程表', '提案', '提案', '會議紀錄', '會議紀錄', '施政報告']);
});

test('town chcg: a page’s attachments, the menu’s sessions, the members', () => {
  const page = `<div class="dropdown-menu"></div><li><a class="nav-link" role="button" data-toggle="dropdown" href="#"> 代表會錄音檔</a> <div class="dropdown-menu"> <a class="dropdown-item" href="mainV2.aspx?main_id=43088&amp;act_id=24">第22屆第1.2次臨時會</a> <a class="dropdown-item" href="mainV2.aspx?main_id=43948&amp;act_id=24">第22屆第1次定期會</a> </div></li>
  <div class="att-data"> <ul> <li><a href="https://ctrl.chcg.gov.tw/files/68_1_第22屆第7次定期會議事日程表.pdf" target="_blank">議事日程表</a></li> <li><a href="https://drive.google.com/file/d/1ZKpNX3i-v01i26/view?usp=sharing">第22屆第18、19次臨時會1150817</a></li> <li><a href="http://">x</a></li> </ul></div>`;
  assert.deepEqual(chcgMenu(page), { 代表會錄音檔: [{ id: 43088, n: '第22屆第1.2次臨時會' }, { id: 43948, n: '第22屆第1次定期會' }] });
  const links = chcgLinks(page);
  assert.deepEqual(links.map(l => l.n), ['議事日程表', '第22屆第18、19次臨時會1150817']);
  assert.equal(dayIn(links[1].n), '2026-08-17');
  assert.equal(dayIn('1150417-a'), '2026-04-17');
  assert.equal(dayIn('錄音分割檔1_2025'), '');
  assert.equal(driveId(links[1].url), '1ZKpNX3i-v01i26');
  const fx = `<div class="editor-block"><a href="x.jpg"><img src="https://ctrl.chcg.gov.tw/files/a.jpg" /></a> 代表-陳秀玲 <a><img src="https://ctrl.chcg.gov.tw/files/b.jpg" /></a> 副主席-陳益昌 <img src="./images1/main/icon_ie.gif" /></div><a id="AccesskeyZ">`;
  assert.deepEqual(chcgMembers(fx, '第一選區').map(p => [p.n, p.title]), [['陳秀玲', '代表'], ['陳益昌', '副主席']]);
  const hm = `<div class="editor-block"><td>姓名</td><img src="/UserFiles/a.jpg"> <td>周保方</td><td>一、現任和美鎮民代表會副主席 二、現任聯興宮主任委員</td></div>AccesskeyZ`;
  assert.deepEqual(chcgMembers(hm, '第一選區'), [{ n: '周保方', title: '副主席', area: '第一選區', img: 'https://ctrl.chcg.gov.tw/UserFiles/a.jpg' }]);
});

test('town chcg: a session’s days from its 議事日程表 or its 議事錄', () => {
  assert.deepEqual(pdfSpan('彰化縣福興鄉民代表會\n第 22 屆第 7 次定期會議事日程表\n民國 115 年  議 程\n05 月 04 日   一   1    代表報到\n05 月 15 日   五   12 討論提案、臨時動議、閉幕典禮\n議事大要：審議本鄉 114 年度總決算'), { from: '2026-05-04', to: '2026-05-15' });
  assert.deepEqual(pdfSpan('紀錄\n時間：中華民國 115 年 5 月 19 日起至 5 月 26 止\n5 月 20 日（星期三）：第二次會'), { from: '2026-05-19', to: '2026-05-26' });
  // (A table headed 月 and 日.)
  assert.deepEqual(pdfSpan(' 115 年     期   別\n月     日\n4     15   三   1 代表報到\n4     16   四   2 討論提案\n4     17   五   3 閉會'), { from: '2026-04-15', to: '2026-04-17' });
  // (Over the new year.)
  assert.deepEqual(pdfSpan('民國 114 年\n12 月 29 日 一 1 報到\n1 月 2 日 五 4 閉會'), { from: '2025-12-29', to: '2026-01-02' });
  assert.equal(pdfSpan('沒有日期'), null);
  // (No year: placed between the sessions of its kind numbered around it.)
  const md = pdfSpan('第 22 屆第 16、17 次臨時會議事日程表\n08 月 03 日 一 1 報到\n08 月 10 日 一 6 閉會');
  assert.deepEqual(md, { md: [[8, 3, '一'], [8, 10, '一']] });
  const s = { kind: '臨時會', no: 16, ...md };
  assert.deepEqual(yearOf(s, [s, { kind: '臨時會', no: 15, from: '2025-12-15', to: '2025-12-17' }, { kind: '定期會', no: 8, from: '2026-10-19' }]), { from: '2026-08-03', to: '2026-08-10' });
});

test('town chcg: the three towns, each with its pages', () => {
  for (const tc of ['10007030', '10007050', '10007060']) assert.ok(TOWN_SITES[tc].chcg && TOWN_SITES[tc].term && TOWN_SITES[tc].home);
  assert.equal(chcgUrl(TOWN_SITES['10007030'], 31342), 'https://ctrl.chcg.gov.tw/main/main_act3/main.aspx?main_id=31342&act_id=23');
  assert.equal(chcgUrl(TOWN_SITES['10007060'], 5784), 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?main_id=5784&act_id=24');
});

test('town chcg: a 公所 site’s page: its files, the pages under it, its list’s other pages', () => {
  const url = tsoUrl('dacun', 40566);
  assert.equal(url, 'https://www.chcg.gov.tw/TSO/dacun/07other/main.aspx?main_id=40566');
  const html = `<title> 第22屆定期會-定期會-大村鄉民代表會-彰化縣政府大村鄉公所 </title><a href="../07other/main.aspx?main_id=3" title="移至公所簡介">公所簡介</a>
  <div id="div_print"><a href="#hypAccesskeyC" id="hypAccesskeyC" title="中央內容區塊">:::</a>
  <a href='../../getFile.aspx?file_id=410811&amp;dir=dacun&amp;file=1&amp;type=3&amp;did=40566'>下載第22屆第一次定期會日程表 （64.00KB）</a>
  <a href="https://drive.google.com/drive/folders/1ag3L7MY2KG8">第22屆第一次定期會錄音檔</a>
  <a href='main.aspx?main_id=43065'>第22屆第1次臨時會</a> <a href='main.aspx?main_id=31609&txtQKeyword=&page=2'>2</a>
  </div></form><footer><a href="../07other/main.aspx?main_id=9">網站導覽</a></footer>`;
  const p = tsoPage(html, url);
  assert.equal(p.title, '第22屆定期會');
  assert.deepEqual(p.links, [
    { n: '第22屆第一次定期會日程表', url: 'https://www.chcg.gov.tw/TSO/getFile.aspx?file_id=410811&dir=dacun&file=1&type=3&did=40566' },
    { n: '第22屆第一次定期會錄音檔', url: 'https://drive.google.com/drive/folders/1ag3L7MY2KG8' }
  ]);
  assert.deepEqual(p.kids, [{ id: 43065, n: '第22屆第1次臨時會' }]);
  assert.deepEqual(p.more, [2]);
  assert.ok(folderOf(p.links[1].url) && !folderOf('https://drive.google.com/file/d/1ZK/view'));
  // (A recording named with what the sitting did and its day, 溪湖's.)
  assert.equal(dayIn('綜合質詢114.5.9'), '2025-05-09');
  // (Days written 115.8.12.)
  assert.deepEqual(pdfSpan('第 19 次臨時會議事日程表\n115.8.12   三   1  報到\n115.8.14   五   3  閉會'), { from: '2026-08-12', to: '2026-08-14' });
});

test('town chcg: 永靖, 田尾, 秀水: days in a paper’s name, recordings on HiNet, a 議事錄 opening with its 日程表', () => {
  assert.deepEqual(nameSpan('第22屆第1次定期會議事日程表(112.5.15-5.26)'), { from: '2023-05-15', to: '2023-05-26' });
  // (Its last day's year mistyped; over the new year.)
  assert.deepEqual(nameSpan('第22屆第3次定期會-議事錄(113.5.13-112.5.24)'), { from: '2024-05-13', to: '2024-05-24' });
  assert.deepEqual(nameSpan('第22屆第9次臨時會(114.12.29-1.2)'), { from: '2025-12-29', to: '2026-01-02' });
  assert.equal(nameSpan('第22屆第7次定期會議事錄'), null);
  const page = `<div class="table-type-1-block mb-4 editor-block"><p><a href="https://ottlive.hinet.net/webapp/tianwei_town/watch?v=2307" target="_blank"><font>第22屆第1次定期會議事錄音</font></a></p><p><a href="https://drive.google.com/drive/u/1/folders/13Pom">第22屆第13次臨時會錄音檔</a></p></div>`;
  assert.deepEqual(chcgLinks(page).map(l => l.n), ['第22屆第1次定期會議事錄音', '第22屆第13次臨時會錄音檔']);
  // (Every sitting's 時間 line.)
  assert.deepEqual(pdfSpan('第 7 次定期會議事錄\n時 間 ：民國 115 年 04 月 24 日\n出席：\n時 間 ：民國 115 年 04 月 28 日~04 月 29 日\n時 間 ：民國 115 年 04 月 30 日、05 月 04 日\n'), { from: '2026-04-24', to: '2026-05-04' });
  // (Its 日程表 first, rows split by the layout, then one 時間 line and talk of other days.)
  assert.deepEqual(pdfSpan('議事日程表\n民國 115 年 09: 00\n04 月 30            報 到\n           四   1\n05 月 01 日 五    2 勞動節國定假日\n05 月 11 日 一   12 討論提案\n一、時 間：民國 115 年 5 月 4 日上午九時\n 5 月 25 日華龍宮王爺的聖誕'), { from: '2026-04-30', to: '2026-05-11' });
  // (鹿港's lists on its 公所's site.)
  const b = 'https://www.lukang.gov.tw/';
  assert.equal(formUrl(b, '2,6,52', 1), 'https://www.lukang.gov.tw/form/index?Parser=2,6,52,,,,,,,,1');
  const f = formList(`<ul class="list"><li class="list_date"><span class="list_word text_le "><a href="/df_ufiles/052/第22屆第7次定期會議事錄.pdf" target="_blank">第22屆第7次定期會議事錄</a></span></li><li class="list_date"><span><a href="https://gofile.me/7ZkLt/KVm9" title="x">【第22屆】第22屆第8次定期會錄音檔連結</a></span></li></ul>【所在頁數：第1頁／共4頁】`, b);
  assert.deepEqual(f, { links: [{ n: '第22屆第7次定期會議事錄', url: 'https://www.lukang.gov.tw/df_ufiles/052/%E7%AC%AC22%E5%B1%86%E7%AC%AC7%E6%AC%A1%E5%AE%9A%E6%9C%9F%E6%9C%83%E8%AD%B0%E4%BA%8B%E9%8C%84.pdf' }, { n: '第22屆第8次定期會錄音檔連結', url: 'https://gofile.me/7ZkLt/KVm9' }], pages: 4 });
  // (名間's posts on WordPress: a file a post, a picture when that's all it holds, a 議事錄's cover left out.)
  const w = wpPost({ date: '2026-11-07T10:00:00', title: { rendered: '第22屆第8次定期會錄音檔' }, content: { rendered: '<audio src="https://x.tw/wp-content/uploads/2026/11/22-8定期會10月19日錄音檔.mp3?_=1"></audio><a href="https://x.tw/wp-content/uploads/2026/01/議事錄封面.pdf">封面</a>' } });
  assert.deepEqual(w.links.map(l => l.n), ['22-8定期會10月19日錄音檔']);
  assert.equal(wpDay(w.links[0].n, w.date), '2026-10-19');
  assert.equal(wpDay('114年12月10日錄音檔', '2026-01-02'), '2025-12-10');
  assert.deepEqual(wpPost({ title: { rendered: '第22屆第19次臨時會議日程表' }, content: { rendered: '<p><img src="https://mjtc.sweb.tw/wp-content/uploads/第22屆19次臨時會議程表.webp" /></p>' } }).links.map(l => l.n), ['第22屆19次臨時會議程表']);
  assert.equal(paperKind('第22屆第9次臨時會議程表'), '議事日程表');
  assert.deepEqual(pdfSpan('一、時 間：中華民國 115 年 5 月 4 日上午 9 時起\n一、時 間：中華民國 115 年 5 月 15 日上午 9 時起'), { from: '2026-05-04', to: '2026-05-15' });
  // (東河's Joomla: a category's articles, an article's attachments and Drive recordings.)
  const jb = 'https://www.donghe.gov.tw', jp = '/home/index.php/x/y';
  assert.deepEqual(joomlaList(`<a href="${jp}/6997-22-48">第22屆第19次臨時會錄音</a><a href="/home/index.php/z">議事日程表</a>`, jb, jp), [{ n: '第22屆第19次臨時會錄音', url: `${jb}${jp}/6997-22-48` }]);
  const art = `<div itemprop="articleBody"><a class="at_icon" href="https://www.donghe.gov.tw/home/attachments/article/6527/a.pdf"><img/></a><a class="at_url" href="https://www.donghe.gov.tw/home/attachments/article/6527/a.pdf">第22屆第7次定期會議事日程表.pdf</a><a href="https://drive.google.com/file/d/1eSw/view?usp=drive_link">第22屆第19次臨時會錄音1</a></div></article><a href="x.pdf">footer</a>`;
  assert.deepEqual(joomlaArticle(art, jb).map(l => l.n), ['第22屆第7次定期會議事日程表', '第22屆第19次臨時會錄音1']);
});

test('town chcg: e-land’s CCMS page (頭城): its papers by title, its recordings under the line naming the session', () => {
  const k = (n, t = 22) => sessionOf(n, t)?.key;
  // (廿 for 二十, and a term written without its 第: neither read as this term's.)
  assert.equal(k('第廿一屆第七次臨時會議事錄'), '第21屆第7次臨時會');
  assert.equal(k('第廿二屆第二次定期會 議事錄(112.10.30-112.11.15)'), '第22屆第2次定期會');
  assert.equal(k('21屆第16次臨時會錄音'), '第21屆第16次臨時會');
  assert.equal(k('22屆第3次臨時會錄音'), '第22屆第3次臨時會');
  const base = 'https://toucheng.e-land.gov.tw/cp.aspx?n=8894';
  const u = btoa('/001/Upload/452/relfile/13121/2505/cff4.pdf');
  assert.equal(ccmsFile(`https://www-ws.e-land.gov.tw/Download.ashx?u=${encodeURIComponent(u)}&amp;n=x`, base), 'https://www-ws.e-land.gov.tw/001/Upload/452/relfile/13121/2505/cff4.pdf');
  const html = `<li><div class="list-text file-download-multiple" data-index="31"><div class="in"><div class="hd"><div class="in"><div data-index="0" > <span ><a >第22屆第11次臨時會議事預定日程表</a></span></div></div></div><div class="ct"><div class="in"><ul data-index="1"><li class="odt"><span><a href="https://www-ws.e-land.gov.tw/Download.ashx?u=${btoa('/001/a.odt')}" title="[另開新視窗]x.odt">odt</a></span></li><li class="pdf" > <span ><a href="https://www-ws.e-land.gov.tw/Download.ashx?u=${btoa('/001/a.pdf')}" title="[另開新視窗]第22屆第11次臨時會議事預定日程表.pdf" >pdf</a></span></li></ul></div></div></div></div></li>
    <p><strong>22屆第3次</strong><strong>定期大會</strong><strong>錄音</strong></p><p><a href="https://www-ws.e-land.gov.tw/001/c/1.mp3" target="_blank" title="錄音檔">113.05.14A</a></p><p><a href="https://www-ws.e-land.gov.tw/001/c/2.mp3" title="錄音檔">113.05.14B</a><a href="https://www-ws.e-land.gov.tw/001/c/3.mp3" title="113.05.15錄音檔"><span color="#0066cc"></span></a></p><p>&nbsp;</p>`;
  const p = ccmsPage(html, base);
  assert.deepEqual(p.files, [{ n: '第22屆第11次臨時會議事預定日程表', url: 'https://www-ws.e-land.gov.tw/001/a.pdf' }]);
  assert.deepEqual(p.audio.map(a => [a.head, a.n, dayIn(a.n)]), [
    ['22屆第3次定期大會錄音', '113.05.14A', '2024-05-14'],
    ['22屆第3次定期大會錄音', '113.05.14B', '2024-05-14'],
    ['22屆第3次定期大會錄音', '113.05.15錄音檔', '2024-05-15']
  ]);
  assert.equal(k(p.audio[0].head), '第22屆第3次定期會');
});

test('town chcg: a "boxlists" site (壯圍): its lists, a page’s files, recordings named by the Western day', () => {
  const base = 'https://juanwei.e-land.gov.tw/';
  const list = `<div class="tab-content mt-3" id="pills-tabContent"> 2026-10-01 <a href="/boxlists/1103?menu_id=13" target=""> 【議事日程】 壯圍鄉民代表會22屆第19次臨時會預定議事日程表及議事日程表 </a> <hr> 2026-06-17 <a href="/uploads/boxlists/add_1781679174_3jF8GP3oop.pdf" target=""> 【議事日程】 壯圍鄉民代表會22屆第18次臨時會議事日程表 <i class="fas fa-download"></i> </a><a href="https://juanwei.e-land.gov.tw/boxlists?menu_id=13&amp;page=3">3</a>`;
  assert.deepEqual(boxList(list, base), {
    links: [
      { n: '壯圍鄉民代表會22屆第19次臨時會預定議事日程表及議事日程表', url: `${base}boxlists/1103?menu_id=13`, files: true },
      { n: '壯圍鄉民代表會22屆第18次臨時會議事日程表', url: `${base}uploads/boxlists/add_1781679174_3jF8GP3oop.pdf`, files: false }
    ],
    pages: 3
  });
  const files = `<b>相關附件：</b><br> <a href="/uploads/boxlist/file_1_a.wav" target="_blank"><i class="fas fa-download"></i> 20260915.WAV</a><br> <a href="/uploads/boxlist/file_1_b.pdf" target="_blank"><i></i> 壯圍鄉民代表會第22屆第19次臨時會議事錄.pdf</a><br> </div> </p> <a class="text-center" href="/boxlists/?menu_id=15">回上頁</a>`;
  assert.deepEqual(boxFiles(files, base).map(f => f.n), ['20260915', '壯圍鄉民代表會第22屆第19次臨時會議事錄']);
  assert.equal(westDay('20260511112647'), '1150511');
  assert.equal(westDay('20251007第一日'), '1141007第一日');
  assert.equal(dayIn(westDay('20260915')), '2026-09-15');
  assert.equal(westDay('壯圍'), '');
  // (A deadline in an agenda's notes isn't one of its days.)
  assert.deepEqual(pdfSpan('宜蘭縣壯圍鄉民代表會第 22 屆第 19 次臨時會議事日程表\n 115 年 9 月 15 日 115 年 9 月 16 日 115 年 9 月 17 日\n 一、如有提案請於 9 月 8 日前將提案逕送本會彙集。'), { from: '2026-09-15', to: '2026-09-17' });
});

test('town chcg: CCMS pages that nest their papers (礁溪, 員山), a session’s Drive recording, a list of posts', () => {
  const base = 'https://jiaosi.e-land.gov.tw/cp.aspx?n=14230';
  const f = (title, u) => `<div class="list-text file-download-multiple" data-index="1"><div class="in"><div class="hd"><div class="in"><div data-index="0" > <span ><a >${title}</a></span></div></div></div><div class="ct"><div class="in"><ul data-index="1"><li class="pdf" > <span ><a href="https://www-ws.e-land.gov.tw/Download.ashx?u=${btoa(u)}" target="_blank" title="[另開新視窗]${title}.pdf" >pdf</a></span></li></ul> </div></div></div></div>`;
  const html = `<div class="group-list file-download-multiple" data-index="1" data-type="4"><div class="in"><div class="hd"><div class="in"><div data-index="0" class="headH3" > <span ><a >相關檔案</a></span></div></div></div><div class="ct"><div class="in"><ul data-index="1"><li data-index="1"> ${f('0327●宜蘭縣礁溪鄉民代表會第22屆第2次定期會會議紀錄', '/001/a.pdf')}</li><li>${f('2201臨時會議事錄', '/001/b.pdf')}</li></ul></div></div></div></div>
    <div class="area-editor user-edit fr-view"><p><a href="https://drive.google.com/file/d/1U_B/view?usp=sharing" title="錄音檔">第22屆第八次定期會錄音檔</a></p></div>`;
  const p = ccmsPage(html, base);
  assert.deepEqual(p.files.map(x => [sessionOf(x.n, 22)?.key, x.url]), [
    ['第22屆第2次定期會', 'https://www-ws.e-land.gov.tw/001/a.pdf'],
    ['第22屆第1次臨時會', 'https://www-ws.e-land.gov.tw/001/b.pdf']
  ]);
  assert.deepEqual(p.audio.map(a => [sessionOf(a.head, 22)?.key, a.url]), [['第22屆第8次定期會', 'https://drive.google.com/file/d/1U_B/view?usp=sharing']]);
  assert.deepEqual(ccmsNews('<a href="News_Content.aspx?n=14231&amp;s=408742" title="第22屆第19次臨時會會議紀錄">第22屆…</a>', 'https://jiaosi.e-land.gov.tw/News.aspx?n=14231'), [{ n: '第22屆第19次臨時會會議紀錄', url: 'https://jiaosi.e-land.gov.tw/News_Content.aspx?n=14231&s=408742' }]);
});

test('town chcg: a plain page of files (羅東), its names’ days without dots', () => {
  const html = `<a href="records/no22/temp/%E7%BE%85%E6%9D%B1%E9%8E%AE%E6%B0%91%E4%BB%A3%E8%A1%A8%E6%9C%83%E7%AC%AC22%E5%B1%86%E7%AC%AC17%E6%AC%A1%E8%87%A8%E6%99%82%E6%9C%83%E8%AD%B0%E4%BA%8B%E9%8C%84.pdf"><img src="x.png"/></a><a href="records/a.pdf">第二十二屆第十八次臨時會議事錄1150629-0701</a><a href="record22.html">第22屆</a>`;
  const f = linkFiles(html, 'https://lotong200.e-land.gov.tw/record.html');
  assert.deepEqual(f.map(x => sessionOf(x.n, 22)?.key), ['第22屆第17次臨時會', '第22屆第18次臨時會']);
  assert.deepEqual(nameSpan(f[1].n), { from: '2026-06-29', to: '2026-07-01' });
});

test('town chcg: a plain page of videos (羅東’s recorder.html): each under the heading naming its session', () => {
  const html = `<h2>第<strong>22屆第7次定期會影音檔</strong></h2><h3><a href="https://youtu.be/HrNKUdS8GiU" target="_blank">1150511開議</a></h3><h3>&nbsp;</h3><h2>第<strong>22屆第16-19次臨時會影音檔</strong></h2><h3><a href="https://youtu.be/OxJzK_aIt6I">1150316審議公所第1-3號提案</a></h3><a href="recorder22_1150316-1150701.html"><img src="x.jpg"></a>`;
  const f = linkFiles(html, 'https://lotong200.e-land.gov.tw/recorder.html');
  assert.deepEqual(f, [
    { n: '第22屆第7次定期會影音檔 1150511開議', url: 'https://youtu.be/HrNKUdS8GiU' },
    { n: '第22屆第16次臨時會影音檔 1150316審議公所第1-3號提案', url: 'https://youtu.be/OxJzK_aIt6I' }
  ]);
  assert.equal(ytId(f[0].url), 'HrNKUdS8GiU');
  assert.equal(dayIn(f[0].n), '2026-05-11');
  assert.deepEqual(pageMore(html, 'https://lotong200.e-land.gov.tw/recorder.html', '^recorder22[_-]'), ['https://lotong200.e-land.gov.tw/recorder22_1150316-1150701.html']);
});

test('town build: no name imported twice (a clash stops the whole build before it starts)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../scripts/build-town.mjs', import.meta.url), 'utf8');
  const names = [...src.matchAll(/^import \{([^}]+)\} from/gm)].flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop()).filter(Boolean));
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

test("town ccms: 苑裡's lists of the files themselves, 秀林's sittings on YouTube, 頭份's Drive folder", () => {
  const list = `<table><tbody><tr>
<td class="CCMS_jGridView_td_Class_0 " data-title="主題" headers="CCMS_jGridView_TH_1"><span><a href="https://webws.miaoli.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvNDg2L3JlbGZpbGUvMTM3NzEvOTg4ODAzLzFjMDA1OTU1LTdkZDMtNGFjYi1iYzA3LTg5MWI3Nzk2ODFmYi5wZGY%3d&n=x&icon=.pdf" title="[另開新視窗]第22屆第17次臨時會議事錄(.pdf)" Target="_blank">第22屆第17次臨時會議事錄</a></span></td><td class="CCMS_jGridView_td_Class_1 "><span>115-08-31</span></td>
</tr></tbody></table>`;
  assert.deepEqual(ccmsNews(list, 'https://www.yuanli.gov.tw/News.aspx?n=7528&sms=13771'), [
    { n: '第22屆第17次臨時會議事錄', url: 'https://webws.miaoli.gov.tw/001/Upload/486/relfile/13771/988803/1c005955-7dd3-4acb-bc07-891b779681fb.pdf', file: true }
  ]);
  const post = `<div class="area-essay page-caption-p"><p>花蓮縣秀林鄉民代表會第 22 屆第 8 次定期大會，錄音檔內容請點選以下連結。</p>
<p><a href="https://youtu.be/p1HQdJvsrJg" title="115年10月13日錄音檔"> 115年10月13日錄音檔 </a></p>
<p><a href="https://youtu.be/UA55sVPwrLk" title="115年11月2日錄音檔">115年11月2日錄音檔</a></p></div>
<a href="https://drive.google.com/drive/folders/13Ynkqo-3DueSlqTqpp9hNHFM7e1hsB5O?usp=share_link" title="[另開新視窗]第二屆第八次定期會及延會錄音檔" target="_blank" >第二屆第八次定期會及延會錄音檔</a>`;
  const a = ccmsPage(post, 'https://www.shlin.gov.tw/').audio;
  assert.deepEqual(a.map(x => [x.n, x.url]), [
    ['115年10月13日錄音檔', 'https://youtu.be/p1HQdJvsrJg'],
    ['115年11月2日錄音檔', 'https://youtu.be/UA55sVPwrLk'],
    ['第二屆第八次定期會及延會錄音檔', 'https://drive.google.com/drive/folders/13Ynkqo-3DueSlqTqpp9hNHFM7e1hsB5O?usp=share_link']
  ]);
  assert.equal(dayIn(a[0].n), '2026-10-13');
  assert.equal(dayIn(a[1].n), '2026-11-02');
});

test("town pdfSpan: an agenda with no year, its weekdays pick the year (苑裡's)", () => {
  const agenda = `苗栗縣苑裡鎮民代表會第 22 屆第 7 次定期會議事日程表
日     期     星 期                                 備   註
04 月 27 日   一
04 月 28 日   二                                   第 1 次會議
04 月 29 日   三     下里勘查鎮政建設                      第 2 次會議
05 月 07 日   四     討論提案-代表會                      第 7 次會議
05 月 08 日         1.討論提案-公所
            五     2.人民請願案                       第 8 次會議`;
  const p = pdfSpan(agenda);
  assert.deepEqual(p.md.at(-1), [5, 8]);
  // (With no dated session of its kind around it, the latest year its weekdays fit; with one, the year near it that fits.)
  assert.deepEqual(yearOf({ kind: '定期會', no: 7, md: p.md }, []), { from: '2026-04-27', to: '2026-05-08' });
  assert.deepEqual(yearOf({ kind: '定期會', no: 7, md: p.md }, [{ kind: '定期會', no: 6, from: '2025-11-10' }]), { from: '2026-04-27', to: '2026-05-08' });
  // (No weekdays: as before, nothing without a neighbour.)
  assert.equal(yearOf({ kind: '定期會', no: 7, md: [[4, 27], [5, 8]] }, []), null);
});

test("town pdfSpan: a 月/日 table's weekdays kept (埔心's), the year they fit", () => {
  const p = pdfSpan('彰化縣埔心鄉民代表會第 22 屆第 14 次臨時會議事日程表\n月       日\n    9   22   一                報到、開幕典禮\n    9   23   二        一       討論提案\n    9   24   三        二       討論提案、臨時動議、閉會');
  assert.deepEqual(p, { md: [[9, 22, '一'], [9, 23, '二'], [9, 24, '三']] });
  assert.deepEqual(yearOf({ kind: '臨時會', no: 14, md: p.md }, []), { from: '2025-09-22', to: '2025-09-24' });
});

test("town penghu: 澎湖's 代表會 lists, a post's files and its sittings' videos", () => {
  const base = 'https://event.penghu.gov.tw/Rhuxi/';
  const list = `<div class="list "> <a href="home.jsp?id=16&act=view&dataserno=202611090006" title="第22屆第8次定期會"> <div class="info"> <span class="date">2026-11-09</span> <span class="unit">澎湖縣湖西鄉民代表會</span></div></a></div>
<span class="num"> <a href="javascript:list(1,1)" title="第1頁">1</a>, <a href="javascript:list(4,1)" title="第4頁">4</a>, </span>`;
  assert.deepEqual(penghuList(list, base), { links: [{ n: '第22屆第8次定期會', url: 'https://event.penghu.gov.tw/Rhuxi/home.jsp?id=16&act=view&dataserno=202611090006', on: '2026-11-09' }], pages: 4 });
  const post = `<div>請以 LibreOffice 開啟文件</div><div>第22屆第8次定期會 </div><a href="/uploaddowndoc?file=unit01/202609171532020.ods&filedisplay=x.ods&flag=doc" onclick="readfile()">檔案大小(22K) </a>
<div>第22屆第8次定期會延長會 </div><a href="/uploaddowndoc?file=unit01/202610141110250.doc&filedisplay=y.doc&flag=doc">檔案大小(52K) </a><a href="/uploaddowndoc?file=unit01/202610141110250.pdf&filedisplay=y.pdf&flag=pdf">檔案大小(61K)</a>
<video id="movie" preload controls loop poster="/video/unit01/202611091539110.jpg"> <source src="/video/unit01/202611091539110.mp4" type="video/mp4" /> 不支援 </video> <div>第22屆第8次定期會10.06-1</div>
<video id="movie" preload controls loop poster="/video/unit01/202611091542050.jpg"> <source src="/video/unit01/202611091542050.mp4" type="video/mp4" /> 不支援 </video> <div>第22屆第8次定期會10.06-2</div> 瀏覽人次：3 人`;
  const p = penghuPost(post, base);
  assert.deepEqual(p.files, [
    { n: '第22屆第8次定期會', url: 'https://event.penghu.gov.tw/uploaddowndoc?file=unit01/202609171532020.ods&filedisplay=x.ods&flag=doc' },
    { n: '第22屆第8次定期會延長會', url: 'https://event.penghu.gov.tw/uploaddowndoc?file=unit01/202610141110250.pdf&filedisplay=y.pdf&flag=pdf' }
  ]);
  assert.deepEqual(p.videos[1], { n: '第22屆第8次定期會10.06-2', url: 'https://event.penghu.gov.tw/video/unit01/202611091542050.mp4', pic: 'https://event.penghu.gov.tw/video/unit01/202611091542050.jpg' });
  assert.equal(penghuDay(p.videos[1].n, '2026-11-09'), '1151006-2');
  assert.equal(dayIn(penghuDay(p.videos[1].n, '2026-11-09')), '2026-10-06');
  // (As written, 白沙's; a December sitting posted in January; no day, 望安's: its part.)
  assert.equal(penghuDay('第22屆第20次臨時會第2次會議115年10月29日', '2026-10-29'), '1151029');
  assert.equal(penghuDay('第22屆第5次臨時會12.20-1', '2027-01-05'), '1151220-1');
  assert.equal(penghuDay('第22屆第19次臨時會影音檔-3', '2026-09-09'), '3');
  for (const tc of ['10016010', '10016020', '10016030', '10016040', '10016050', '10016060']) assert.ok(TOWN_SITES[tc].chcg.penghu.lists);
});

test("town pthg: 屏東's 公所 sites, a list's posts, a list of files (HitCount, its ending kept), a post's files and recordings", () => {
  assert.equal(pthgName('22-8定期會議事日程表1151102-1151113'), '第22屆第8次定期會議事日程表1151102-1151113');
  assert.equal(sessionOf(pthgName('22-9.10臨時會議事日程表'), 22).key, '第22屆第9、10次臨時會');
  assert.equal(pthgName('第22屆第7次定期會音檔'), '第22屆第7次定期會音檔');
  const posts = ccmsNews('<a id="ContentPlaceHolder1_gvIndex_lnkTitle_0" class="css_mark" href="News_Content.aspx?n=48999AEAF832497E&amp;sms=6C99D43425CF7F1E&amp;s=6EF538673C9ACAD1">第22屆第19次臨時會音檔</a>', 'https://www.pthg.gov.tw/chaujou/News.aspx?n=48999AEAF832497E&sms=6C99D43425CF7F1E');
  assert.deepEqual(posts, [{ n: '第22屆第19次臨時會音檔', url: 'https://www.pthg.gov.tw/chaujou/News_Content.aspx?n=48999AEAF832497E&sms=6C99D43425CF7F1E&s=6EF538673C9ACAD1' }]);
  const files = ccmsNews('<a id="ContentPlaceHolder1_dlindex_hptitle_0" title="22-8定期會議事日程表1151102-1151113.pdf(另開新視窗)" rel="noopener noreferrer" href="Common/HitCount.ashx?p=C5&amp;type=FB&amp;s=10" target="_blank"><a id="ContentPlaceHolder1_dlindex_hptitle_1" title="22-2定期會1121114會次5.mp3(另開新視窗)" href="Common/HitCount.ashx?p=D6&amp;type=FB&amp;s=11">', 'https://www.pthg.gov.tw/TownDto/News4.aspx?n=4B&sms=DA');
  assert.deepEqual(files, [
    { n: '第22屆第8次定期會議事日程表1151102-1151113', url: 'https://www.pthg.gov.tw/TownDto/Common/HitCount.ashx?p=C5&type=FB&s=10#.pdf', file: true },
    { n: '第22屆第2次定期會1121114會次5', url: 'https://www.pthg.gov.tw/TownDto/Common/HitCount.ashx?p=D6&type=FB&s=11#.mp3', file: true }
  ]);
  const box = items => `<div class="news_box03_data"> <ol> ${items} </ol> </div>`;
  assert.deepEqual(ccmsPage(box('<li><span>22-8定期大會議事日程-12日</span><ul><li><a href="https://www-ws.pthg.gov.tw/Upload/2015pthg/188/relfile/1/2/a.odt" title="x.odt">odt</a></li><li><a href="https://www-ws.pthg.gov.tw/Upload/2015pthg/188/relfile/1/2/a.pdf" title="22-8定期大會議事日程-12日.pdf">(83.42KB).pdf</a></li></ul></li>'), 'https://www.pthg.gov.tw/chaujou/News_Content.aspx'), {
    files: [{ n: '第22屆第8次定期大會議事日程-12日', url: 'https://www-ws.pthg.gov.tw/Upload/2015pthg/188/relfile/1/2/a.pdf' }],
    audio: []
  });
  assert.deepEqual(ccmsPage(box('<li><span>20260909錄音檔</span><ul><li><a title="20260909錄音檔" href="https://drive.google.com/file/d/18L5UYqXsr1DG0lbgz1v3DI92ObdjoHsv/view?usp=sharing"><img src="images/Icons/link.gif" /></a></li></ul></li>'), 'https://www.pthg.gov.tw/chaujou/News_Content.aspx'), {
    files: [],
    audio: [{ head: '', n: '1150909錄音檔', url: 'https://drive.google.com/file/d/18L5UYqXsr1DG0lbgz1v3DI92ObdjoHsv/view?usp=sharing' }]
  });
  assert.equal(dayIn('1150909錄音檔'), '2026-09-09');
  for (const tc of ['10013020', '10013030', '10013330']) assert.match(TOWN_SITES[tc].chcg.ccms[0], /^https:\/\/www\.pthg\.gov\.tw\/\w+\/News4?\.aspx\?n=\w+&sms=\w+$/);
});

test("town drive: a Drive folder's entries as Drive shows it embedded, folders and files (里港's)", () => {
  const html = '<div class="flip-entry" id="entry-1"><a href="https://drive.google.com/drive/folders/1GOJF2hU32RjrB0GA0mKg-5ztdCwUNnG9" target="_blank"><div class="flip-entry-info"><div class="flip-entry-title">第22屆第7次定期大會</div></div></a></div>' +
    '<div class="flip-entry"><a href="https://drive.google.com/file/d/1XtESWUgDM41fmUxL_xqU07DJ-NWGT7uh/view?usp=drive" target="_blank"><div class="flip-entry-title">第21屆第10次臨時大會議事日程.doc</div></a></div>' +
    '<div class="flip-entry"><a href="https://drive.google.com/file/d/1YJ_E5CZ94osZTj8SqkOmPD2iqXQtgQPn/view?usp=drive"><div class="flip-entry-title">20201028.mp3</div></a></div>';
  assert.deepEqual(driveEntries(html), [
    { n: '第22屆第7次定期大會', folder: '1GOJF2hU32RjrB0GA0mKg-5ztdCwUNnG9' },
    { n: '第21屆第10次臨時大會議事日程', url: 'https://drive.google.com/file/d/1XtESWUgDM41fmUxL_xqU07DJ-NWGT7uh/view#.doc' },
    { n: '20201028', url: 'https://drive.google.com/file/d/1YJ_E5CZ94osZTj8SqkOmPD2iqXQtgQPn/view#.mp3' }
  ]);
  assert.equal(driveFolderId('https://drive.google.com/open?id=1YGBURDkKrsc_GwZUxUiTff3iEFa2Qs0i'), '1YGBURDkKrsc_GwZUxUiTff3iEFa2Qs0i');
  assert.equal(dayIn(westDay('20201028')), '2020-10-28');
});
