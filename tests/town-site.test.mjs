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
