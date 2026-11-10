// 彰化's 代表會 on the county's platform (public/lib/town-chcg.mjs): 和美, 福興, 伸港's pages as they draw them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionOf, paperKind, chcgLinks, chcgMenu, chcgMembers, dayIn, driveId, pdfSpan, yearOf, chcgUrl, tsoPage, tsoUrl, folderOf, nameSpan, formUrl, formList, wpPost, wpDay, joomlaList, joomlaArticle } from '../public/lib/town-chcg.mjs';
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
  assert.deepEqual(md, { md: [[8, 3], [8, 10]] });
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
