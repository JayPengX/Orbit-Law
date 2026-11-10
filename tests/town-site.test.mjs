// A 代表會's own site (public/lib/town-site.mjs): 竹北's pages, read as its 公所's CMS draws them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOWN_SITES, big5q, cnNum, townMembers, townSessions, sessionItems, kindOf, itemName, pageFiles, audioDays, listRows, sessionNews, sessionState, sessionUrl } from '../public/lib/town-site.mjs';

const site = TOWN_SITES['10004010'];

test('town site: a session page’s address carries its title in Big5', () => {
  assert.equal(big5q('第10屆第19次臨時'), '%B2%C410%A9%A1%B2%C419%A6%B8%C1%7B%AE%C9');
  assert.equal(sessionUrl(site, '第10屆第8次定期'), 'https://www.zhubei.gov.tw/iframmeeting2_list.php?menu=1412&typeid=1452&title=%B2%C410%A9%A1%B2%C48%A6%B8%A9%77%B4%C1');
  assert.deepEqual(['一', '十', '十二', '二十', '三十五'].map(cnNum), [1, 10, 12, 20, 35]);
});

test('town site: a district’s members, their titles and photos', () => {
  const one = (id, n, title) => `<td><a href="iframdeputyview.php?typeid=1438&deputy_id=${id}"><img src="admin/upload/small_twgov_img_${id}.jpg"  alt="${n}代表" border="0"></a></td><td><a href="iframdeputyview.php?typeid=1438&deputy_id=${id}">${n}代表</a></td><td>姓　　名：${n}<br />性　　別：男<br />職　　稱：${title}<br />行動電話：0900<br /></td>`;
  const got = townMembers(one(2, '林啟賢', '代表會主席') + one(5, '何宜芯', '代表'), site, 1438);
  assert.deepEqual(got.map(x => [x.n, x.title, x.area, x.img]), [
    ['林啟賢', '主席', '第二選區', 'https://www.zhubei.gov.tw/admin/upload/small_twgov_img_2.jpg'],
    ['何宜芯', '代表', '第二選區', 'https://www.zhubei.gov.tw/admin/upload/small_twgov_img_5.jpg']
  ]);
  // Nothing personal kept (their phones and addresses stay on the site).
  assert.deepEqual(Object.keys(got[0]).sort(), ['area', 'id', 'img', 'n', 'title', 'url']);
});

test('town site: the 議事錄’s sessions, and a session’s parts by kind', () => {
  const idx = `<a role="button" href="iframmeeting2_list.php?menu=1412&typeid=1452&title=第10屆第19次臨時" title="第10屆第19次臨時會">x</a><a href="iframmeeting2_list.php?menu=1412&typeid=1452&title=第10屆第8次定期" title="第10屆第8次定期會">y</a>`;
  assert.deepEqual(townSessions(idx), [
    { key: '第10屆第19次臨時', n: '第19次臨時會', term: 10, no: 19, kind: '臨時會' },
    { key: '第10屆第8次定期', n: '第8次定期會', term: 10, no: 8, kind: '定期會' }
  ]);
  const a = (id, t) => `<a class="special-link"  href="iframmeeting2_list.php?menu=1412&typeid=1452&title=第10屆第8次定期&circulated_id=${id}"  title="第10屆第8次定期會(${t})">`;
  const items = sessionItems([a(1, '第一次會議'), a(2, '延長會第一次會議'), a(3, '參、施政報告'), a(4, '肆、市政總質詢_第一天'), a(5, '伍、決議案'), a(6, '柒、會議錄音檔')].join(''));
  assert.deepEqual(items.map(i => [i.id, i.k, i.n, i.ext]), [
    [1, '會議紀錄', '第一次會議', false],
    [2, '會議紀錄', '延長會第一次會議', true],
    [3, '施政報告', '施政報告', false],
    [4, '總質詢', '總質詢 第一天', false],
    [5, '決議案', '決議案', false],
    [6, '錄音', '會議錄音檔', false]
  ]);
  assert.equal(kindOf('貳、致詞'), '致詞');
  assert.equal(itemName('第10屆第8次定期會(陸、附錄)', '附錄'), '附錄');
});

test('town site: a page’s PDFs, and a session’s days with their recordings', () => {
  const page = `<a href="admin/upload/twgov_file_1.pdf" target="_blank" title="[開新分頁下載]第10屆第8次定期會決議案.pdf">第10屆第8次定期會決議案</a>&nbsp;&nbsp;937.37K&nbsp;&nbsp;<br><p><span>最後更新日期：</span> <span>2026-10-12</span></p>`;
  assert.deepEqual(pageFiles(page, site.base), { files: [{ n: '第10屆第8次定期會決議案', url: 'https://www.zhubei.gov.tw/admin/upload/twgov_file_1.pdf', size: '937.37KB' }], upd: '2026-10-12' });
  const row = (t, id) => `<tr><td>${t}</td><td><a href="https://drive.google.com/file/d/${id}/view?usp=sharing">收聽</a></td></tr>`;
  const html = `<table><tr><td>會議日期</td><td>錄音檔線上收聽</td></tr>${row('第10屆第8次定期會( 115年9月29日 )', 'b')}${row('第10屆第8次定期會(115年9月23日)', 'a')}${row('第10屆第8次定期會延長會(115年10月5日)', 'c')}</table>`;
  assert.deepEqual(audioDays(html), [
    { d: '2026-09-23', drive: 'a', ext: false },
    { d: '2026-09-29', drive: 'b', ext: false },
    { d: '2026-10-05', drive: 'c', ext: true }
  ]);
});

test('town site: the news sets a session’s days before it meets', () => {
  assert.deepEqual(sessionNews('本會第10屆第8次定期會訂於本(115)年9月23日至10月4日(共12天)召開。'), { term: 10, n: '第8次定期會', ext: false, from: '2026-09-23', to: '2026-10-04' });
  assert.deepEqual(sessionNews('本會第10屆第8次定期會延長會訂於本(115)年10月5日至10月9日召開(共計5天)。'), { term: 10, n: '第8次定期會', ext: true, from: '2026-10-05', to: '2026-10-09' });
  assert.deepEqual(sessionNews('本會第10屆第19次臨時會訂於本(115)年8月26日至8月28日召開(共計3天)。'), { term: 10, n: '第19次臨時會', ext: false, from: '2026-08-26', to: '2026-08-28' });
  assert.equal(sessionNews('【轉知】內政部政治獻金法宣導'), null);
  assert.deepEqual(listRows('<a  href="iframcirculatedview.php?menu=1411&typeid=1420&circulated_id=15801" title="本會第10屆">x</a>'), [{ id: 15801, t: '本會第10屆' }]);
  const s = { from: '2026-09-23', to: '2026-10-09' };
  assert.deepEqual(['2026-09-01', '2026-09-23', '2026-10-09', '2026-10-10'].map(d => sessionState(s, d)), ['ahead', 'on', 'on', 'past']);
});

test('town site: a 決議案 PDF read into its resolutions (names one above another, rows whose name sits mid-text)', async () => {
  const { resolutions } = await import('../public/lib/town-site.mjs');
  const form = `新竹縣竹北市民代表會第 10 屆第 8 次定期會延長會決議案
                                      編號：乙字第 2 號
                          葉信輝
類       別 農   業 提案人           附 署 人 曾美琴、邵啟月
                          曾玉菱
          建請公所針對遮蔽照明之枝葉適
案       由 度修剪，以維護用路安全。

          部分樹木枝葉生長茂密，已有遮蔽路燈之情形。
說       明

辦       法

大 會 議 決 照案通過。

備       註

中   華    民    國   1   1   5   年   1   0   月   8   日
新竹縣竹北市民代表會第 10 屆第 8 次定期會延長會決議案
        環 保
類   別       提案人         市長 鄭朝方   案 號     甲字第 2 號
        衛 生
      本市三里非自來水用戶歷年未納入一
案   由 般廢棄物清除處理費徵收範圍，提請審議。
      一、本市三里鄰近垃圾衛生掩埋場。
說   明
      二、爰提案送請審議。
        俟貴會審議通過後，免徵一般廢
辦   法
        棄物清除處理費。

大會議決 照案通過。

備   註
中   華   民   國   1   1    5   年   1   0   月   8     日
`;
  assert.deepEqual(resolutions(form), [
    { 案號: '乙字第2號', 類別: '農業', 提案人: '葉信輝、曾玉菱', 附署人: '曾美琴、邵啟月', 案由: '建請公所針對遮蔽照明之枝葉適度修剪，以維護用路安全。', 說明: '部分樹木枝葉生長茂密，已有遮蔽路燈之情形。', 議決: '照案通過。', d: '2026-10-08', ext: true },
    { 案號: '甲字第2號', 類別: '環保、衛生', 提案人: '市長鄭朝方', 案由: '本市三里非自來水用戶歷年未納入一般廢棄物清除處理費徵收範圍，提請審議。', 說明: '一、本市三里鄰近垃圾衛生掩埋場。\n二、爰提案送請審議。', 辦法: '俟貴會審議通過後，免徵一般廢棄物清除處理費。', 議決: '照案通過。', d: '2026-10-08', ext: true }
  ]);
});

test('town site: a 總質詢 transcript by who spoke, its questions by member, and a paper as text', async () => {
  const { transcript, questions, paperText } = await import('../public/lib/town-site.mjs');
  const t = transcript(`肆、市政總質詢
時  間:115 年 9 月 30 日(第一天)
第四次會議紀錄逐字稿如下:
林主席啟賢:
  來，我們請何宜芯代表。
何代表宜芯:
  主席、市長，大家早安、大家好，那宜芯這邊在今天做我第一次的質詢，仁義市場整建期間的門是關起來的還是開放的？
                    1
\f邵所長慧芬:
  感謝代表的關心，門有管制。
(何代表:那工期大概是多
久時間？)
(邵所長:預計在 12 月竣工。)
林主席啟賢:
  來，我們請張美珠代表。
張代表美珠:
  謝謝主席，我延續那個市場的問題，攤位可以買賣嗎？
`);
  assert.equal(t.d, '2026-09-30');
  assert.equal(t.nth, '第一天');
  assert.deepEqual(t.turns.map(x => [x.w, x.r]), [['林啟賢', '主席'], ['何宜芯', '代表'], ['邵慧芬', '所長'], ['何宜芯', '代表'], ['邵慧芬', '所長'], ['林啟賢', '主席'], ['張美珠', '代表']]);
  assert.equal(t.turns[3].t, '那工期大概是多久時間？');
  assert.equal(t.turns[4].t, '預計在12月竣工。');
  assert.deepEqual(questions(t.turns), [
    { w: '何宜芯', from: 1, to: 5, gist: '仁義市場整建期間的門是關起來的還是開放的？' },
    { w: '張美珠', from: 6, to: 6, gist: '攤位可以買賣嗎？' }
  ]);
  assert.equal(paperText('第一次會議\n\n時   間：115 年 9 月 23 日上午 10 時\n出   席：林主席啟賢、葉副主席信輝、\n      范格菱\n開 幕 式：\n    一、行禮如儀。\n                1\n'), '第一次會議\n時間：115年9月23日上午10時\n出席：林主席啟賢、葉副主席信輝、范格菱\n開幕式：\n一、行禮如儀。');
});
