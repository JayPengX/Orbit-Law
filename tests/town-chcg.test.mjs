// 彰化's 代表會 on the county's platform (public/lib/town-chcg.mjs): 和美, 福興, 伸港's pages as they draw them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionOf, paperKind, chcgLinks, chcgMenu, chcgMembers, dayIn, driveId, pdfSpan, chcgUrl } from '../public/lib/town-chcg.mjs';
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
});

test('town chcg: the three towns, each with its pages', () => {
  for (const tc of ['10007030', '10007050', '10007060']) assert.ok(TOWN_SITES[tc].chcg && TOWN_SITES[tc].term && TOWN_SITES[tc].home);
  assert.equal(chcgUrl(TOWN_SITES['10007030'], 31342), 'https://ctrl.chcg.gov.tw/main/main_act3/main.aspx?main_id=31342&act_id=23');
  assert.equal(chcgUrl(TOWN_SITES['10007060'], 5784), 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?main_id=5784&act_id=24');
});
