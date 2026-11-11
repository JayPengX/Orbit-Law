// A 鄉鎮市民代表會's own site, read the way its 公所's CMS draws it (the "twgov" PHP pages many 公所 run:
// iframdeputy_list, iframcirculated_list, iframmeeting_list…), so that other 代表會 on it come with a line each.
//   竹北市民代表會: its site moved into 竹北市公所's (www.zhubei.gov.tw/jbc/; jbc.gov.tw is gone). It serves only
//   Taiwan, in Big5: the build reads it through the proxy's door (Orbit-Core law-page.js, which decodes it).
// (彰化's 代表會 are on their county's platform or their 公所's sites instead: lib/town-chcg.mjs.)
// What it has: the members by district with photos; each session of the term (議事錄): every sitting's 會議紀錄,
// 致詞, 施政報告, 市政總質詢 by day, 決議案, 附錄 (PDFs) and each sitting day's recording (錄音檔, Google Drive);
// the 議事日程表 (PDF); the news, where each session's days are announced before it meets.
// The build (scripts/build-town.mjs) writes council/town/<tc>.json and each session's papers read from their
// PDFs (council/town/<tc>/<paperFile>.json: 決議案 as rows, 總質詢 as who said what, the rest as text); the app
// draws them (app.mjs openTown).
import { billPdfParts, cjkTight } from './council.mjs';

// A 代表會 on its 屏東 公所's site (www.pthg.gov.tw/<town>/): its lists read as CCMS's, its page the 代表會's own
// (or the 公所's).
const pthg = (n, town, home, lists, drive) => {
  const base = `https://www.pthg.gov.tw/${town}/`;
  return { n, home: base + (home || 'Default.aspx'), term: 22, ends: '2026-12-25', chcg: { ccms: lists.map(l => base + l), ...(drive ? { drive } : {}) } };
};
// 新竹縣's 公所 sites on the county's platform (<town>.hsinchu.gov.tw, CCMS): a 代表會's lists, News.aspx, a post a paper
// or a session's recordings (`ccms`).
const hcg = (n, town, term, lists) => {
  const base = `https://${town}.hsinchu.gov.tw/`;
  return { n, home: base + lists[0], term, ends: '2026-12-25', chcg: { ccms: lists.map(l => base + l) } };
};
export const TOWN_SITES = {
  // 新竹縣竹北市 (內政部's town code)
  10004010: {
    n: '竹北市民代表會',
    base: 'https://www.zhubei.gov.tw/',
    home: 'https://www.zhubei.gov.tw/jbc/',
    term: 10,
    ends: '2026-12-25',
    areas: { 1437: '第一選區', 1438: '第二選區', 1439: '第三選區', 1440: '第四選區' },
    members: 1409,
    record: [1412, 1452],
    agenda: [1412, 1422],
    news: [1411, 1420]
  },
  // 彰化縣's 代表會 on the county's platform (lib/town-chcg.mjs: what each page holds).
  10007030: {
    n: '和美鎮民代表會',
    home: 'https://ctrl.chcg.gov.tw/main/main_act3/main.aspx?act_id=23',
    term: 22,
    ends: '2026-12-25',
    chcg: { act: 23, page: 'main.aspx', areas: { 5336: '第一選區', 5337: '第二選區', 5338: '第三選區', 5339: '第四選區' }, lists: { 31342: '議事日程表', 31343: '錄音', 31891: '會議紀錄' } }
  },
  10007050: {
    n: '伸港鄉民代表會',
    home: 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?act_id=41',
    term: 21,
    ends: '2026-12-25',
    chcg: { act: 41, areas: {}, lists: { 48320: '議事日程表', 48323: '會議紀錄', 48324: '會議紀錄' } }
  },
  10007060: {
    n: '福興鄉民代表會',
    home: 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?act_id=24',
    term: 22,
    ends: '2026-12-25',
    chcg: { act: 24, areas: { 5784: '第一選區', 5785: '第二選區', 5786: '第三選區' }, menus: { 會議相關資訊: 'papers', 代表會錄音檔: '錄音' } }
  },
  10007110: {
    n: '溪湖鎮民代表會',
    home: 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?act_id=174',
    term: 22,
    ends: '2026-12-25',
    chcg: { act: 174, lists: { 24811: '會議紀錄', 24809: '議事日程表', 29562: '會議紀錄' }, menus: { 議事錄音檔: '錄音' } }
  },
  10007040: {
    n: '線西鄉民代表會',
    home: 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?act_id=452',
    term: 22,
    ends: '2026-12-25',
    chcg: { act: 452, lists: { 34119: '議事日程表', 34120: '錄音', 34121: '會議紀錄' } }
  },
  10007070: {
    n: '秀水鄉民代表會',
    home: 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?act_id=410',
    term: 22,
    ends: '2026-12-25',
    chcg: { act: 410, lists: { 30463: '議事日程表', 30464: '錄音', 30465: '會議紀錄', 29606: '決議案' } }
  },
  // (永靖's names carry each session's days: 議事日程表(112.5.15-5.26).)
  10007160: {
    n: '永靖鄉民代表會',
    home: 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?act_id=407',
    term: 22,
    ends: '2026-12-25',
    chcg: { act: 407, lists: { 29109: '議事日程表', 29110: '會議紀錄', 31482: '會議紀錄' } }
  },
  // (田尾's recordings are on HiNet's 影音, a session each.)
  10007210: {
    n: '田尾鄉民代表會',
    home: 'https://ctrl.chcg.gov.tw/main/main_act3/mainV2.aspx?act_id=409',
    term: 22,
    ends: '2026-12-25',
    chcg: { act: 409, lists: { 43210: '會議紀錄', 43211: '會議紀錄', 43846: '錄音', 43213: '錄音' } }
  },
  // (鹿港's on its 公所's own site, the "Parser" CMS; its recordings a shared folder a session.)
  10007020: {
    n: '鹿港鎮民代表會',
    home: 'https://www.lukang.gov.tw/content/index?Parser=1,6,44',
    term: 22,
    ends: '2026-12-25',
    chcg: { cms: 'https://www.lukang.gov.tw/', forms: { '28,6,51': '議事日程表', '2,6,52': '會議紀錄', '28,6,53': '會議紀錄', '28,6,54': '錄音' } }
  },
  // The rest on their 公所's site (07other pages to start from).
  10007090: { n: '芬園鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/fenyuan/07other/main.aspx?main_id=28292', term: 22, ends: '2026-12-25', chcg: { tso: 'fenyuan', pages: [28292, 29561] } },
  10007100: { n: '員林市民代表會', home: 'https://www.chcg.gov.tw/TSO/yuanlin/07other/main.aspx?main_id=42689', term: 3, ends: '2026-12-25', chcg: { tso: 'yuanlin', pages: [42689] } },
  10007120: { n: '田中鎮民代表會', home: 'https://www.chcg.gov.tw/TSO/tianzhong/07other/main.aspx?main_id=29591', term: 22, ends: '2026-12-25', chcg: { tso: 'tianzhong', pages: [29591] } },
  10007130: { n: '大村鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/dacun/07other/main.aspx?main_id=31608', term: 22, ends: '2026-12-25', chcg: { tso: 'dacun', pages: [31608, 31609] } },
  10007150: { n: '埔心鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/puxin/07other/main.aspx?main_id=26825', term: 22, ends: '2026-12-25', chcg: { tso: 'puxin', pages: [26825] } },
  10007170: { n: '社頭鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/shetou/07other/main.aspx?main_id=30437', term: 22, ends: '2026-12-25', chcg: { tso: 'shetou', pages: [30437] } },
  10007180: { n: '二水鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/ershui/07other/main.aspx?main_id=29566', term: 22, ends: '2026-12-25', chcg: { tso: 'ershui', pages: [29566] } },
  10007190: { n: '北斗鎮民代表會', home: 'https://www.chcg.gov.tw/TSO/beidou/07other/main.aspx?main_id=50884', term: 22, ends: '2026-12-25', chcg: { tso: 'beidou', pages: [50884, 48780, 46227, 42823] } },
  10007200: { n: '二林鎮民代表會', home: 'https://www.chcg.gov.tw/TSO/erlin/07other/main.aspx?main_id=3571', term: 22, ends: '2026-12-25', chcg: { tso: 'erlin', pages: [3571] } },
  10007220: { n: '埤頭鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/pitou/07other/main.aspx?main_id=31440', term: 22, ends: '2026-12-25', chcg: { tso: 'pitou', pages: [31440, 31849, 31442, 31443] } },
  10007240: { n: '大城鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/dacheng/07other/main.aspx?main_id=31070', term: 22, ends: '2026-12-25', chcg: { tso: 'dacheng', pages: [31070, 31071, 32713] } },
  10007250: { n: '竹塘鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/zhutang/07other/main.aspx?main_id=30492', term: 22, ends: '2026-12-25', chcg: { tso: 'zhutang', pages: [30492, 30493, 26407, 26408] } },
  // 南投縣名間鄉: its own site on WordPress (lib/town-chcg.mjs `wp`).
  10008060: { n: '名間鄉民代表會', home: 'https://mjtc.sweb.tw/', term: 22, ends: '2026-12-25', chcg: { wp: 'https://mjtc.sweb.tw/' } },
  // 臺東縣太麻里鄉: the same Joomla as 東河's, its 議事日程表 and 錄音檔及議事錄 (minutes on Drive, each sitting's
  // recording on YouTube) an article a session.
  10014090: { n: '太麻里鄉民代表會', home: 'http://www.taimali.gov.tw/home/index.php/news-events/2020-09-22-02-57-47.html', term: 22, ends: '2026-12-25', chcg: { joomla: { base: 'http://www.taimali.gov.tw', lists: ['/home/index.php/news-events/2020-09-22-02-57-47/議事日程表.html', '/home/index.php/news-events/2020-09-22-02-57-47/議事日程表-2.html'] } } },
  // 臺東's 關山 and 鹿野, 南投's 中寮: their 代表會's papers and recordings in Drive folders linked from the 公所's site.
  10014030: { n: '關山鎮民代表會', home: 'https://www.guanshan.gov.tw/about/about12', term: 22, ends: '2026-12-25', chcg: { drive: { '1nQE-X1IY4kHg1BymoaCtnB-sEi5M330b': '議事日程表', '1OaW0E_09OYgJ3tuaeUJ8A9rLyliG5EGW': '會議紀錄', '1bzOb-3YUidiDQcKaCxDhNCSCXeLz10G9': '會議紀錄', '18-zPlfeUMvtMWxeh6gbGXB2MHXdQLHpk': '錄音' } } },
  10014050: { n: '鹿野鄉民代表會', home: 'https://drive.google.com/drive/folders/1xo7nirbK-GTIfkmTxaKD0yCzcUoUNBx0', term: 22, ends: '2026-12-25', chcg: { drive: { '16OGEOiO2ANt7EvRB1IEdwkSsSbmaKVVF': '議事日程表', '16_wgYsUkEmQdpYbG2QEz41pTfIt9U8WW': '會議紀錄', '14cG5KMtVRCey68ovOCTZ3cN5xcKQuulS': '會議紀錄', '1Vs2ijFOprR16EmhdKSke9QubCvqK-jH5': '錄音' } } },
  // 南投縣草屯鎮: the 代表會's 議事錄, 議事紀錄 and 議事錄音 lists on its 公所's site, a post each (`files`, `more`).
  10008030: { n: '草屯鎮民代表會', home: 'https://www.tsaotun.gov.tw/list/epresentative01', term: 22, ends: '2026-12-25', chcg: { files: ['https://www.tsaotun.gov.tw/list/epresentative07-2', 'https://www.tsaotun.gov.tw/list/epresentative07-4', 'https://www.tsaotun.gov.tw/list/epresentative07-5'], more: 'epresentative07-[245]\\?model=view&(amp;)?view=\\d+', reads: 20 } },
  10008080: { n: '中寮鄉民代表會', home: 'https://drive.google.com/drive/folders/19OSUnadZd10nQftJuhCVbTEKe-Ww11H_', term: 22, ends: '2026-12-25', chcg: { drive: { '13sJWQ6RShIgB3OrT4KvvO0d5jAx9uZaN': '議事日程表', '151pWSSZjaRkJBuo41r6OLFWfO20fbIQY': '會議紀錄', '1Bof6SzTPnb0OPHgM74pcQscJF8bEtKef': '會議紀錄', '13OluT6EbOdfJYlfeMrEoOAI853VnRtcF': '錄音' } } },
  // 嘉義縣's other 代表會 on their 公所's CCMS (<town>.cyhg.gov.tw, read through the door): 竹崎 a post a session,
  // 阿里山 a post a paper or recording, 新港, 義竹 and 鹿草 their 議事公開 lists.
  10010140: { n: '竹崎鄉民代表會', home: 'https://chuchi.cyhg.gov.tw/cp.aspx?n=1645', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://chuchi.cyhg.gov.tw/News.aspx?n=10285&sms=21208'] } },
  10010180: { n: '阿里山鄉民代表會', home: 'https://alishan.cyhg.gov.tw/News.aspx?n=102886&sms=111390', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://alishan.cyhg.gov.tw/News.aspx?n=102886&sms=111390'] } },
  10010070: { n: '新港鄉民代表會', home: 'https://singang.cyhg.gov.tw/News.aspx?n=9205&sms=20550', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://singang.cyhg.gov.tw/News.aspx?n=9205&sms=20550'] } },
  10010100: { n: '義竹鄉民代表會', home: 'https://yijhu.cyhg.gov.tw/News.aspx?n=10216&sms=21195', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://yijhu.cyhg.gov.tw/News.aspx?n=10216&sms=21195'] } },
  10010110: { n: '鹿草鄉民代表會', home: 'https://lutsau.cyhg.gov.tw/News.aspx?n=10282&sms=21207', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://lutsau.cyhg.gov.tw/News.aspx?n=10282&sms=21207'] } },
  // (大埔, 布袋, 民雄 and 六腳: Drive folders linked from their 公所's 代表會 pages.)
  10010170: { n: '大埔鄉民代表會', home: 'https://dapu.cyhg.gov.tw/cp.aspx?n=10534', term: 22, ends: '2026-12-25', chcg: { drive: { '1AcKW-N5GD3UyM5O4_uXQ2piMkpH-rDgk': '會議紀錄' } } },
  10010030: { n: '布袋鎮民代表會', home: 'https://budai.cyhg.gov.tw/cp.aspx?n=373', term: 22, ends: '2026-12-25', chcg: { drive: { '1txo2kn8kPV01GHryZYTcBwZvlD2kzE5M': '議事日程表', '13oLEugcAaLZLkzzGrfyO-GktA4JAVwlH': '會議紀錄', '1YElJ7O8Q-wxC3yjFEn5hwaBJWFGPkip1': '會議紀錄', '1mHS6ERy2Tny8L3goyuY7NZiYWJMAAPYY': '錄音' } } },
  10010050: { n: '民雄鄉民代表會', home: 'https://minsyong.cyhg.gov.tw/cp.aspx?n=458', term: 22, ends: '2026-12-25', chcg: { drive: { '1vKtcSHUv6rrAqWySnOqoUeuK5oAOJhuY': '議事日程表', '1EWQYEVmZARfXMawQSDkUB4O69_moQf3w': '會議紀錄', '1AIyLgYdNeMHDLMA87AyOMBhgBZ8mR7pR': '錄音', '108iwVTX5OBEOf2B5jOSJLIYzPNUqMPvv': '施政報告' } } },
  10010080: { n: '六腳鄉民代表會', home: 'https://lioujiao.cyhg.gov.tw/cp.aspx?n=657', term: 22, ends: '2026-12-25', chcg: { drive: { '1vuDhUuzrEYsNI9h8-Co028zyCrpoxB4W': '議事日程表', '1I6qbHdlos22sRGWArxEpK-EvVcbGMB4J': '會議紀錄', '1RtdnDlD2JhzM75AyWiXNXP38wJ-qAnNI': '錄音' } } },
  // 嘉義縣梅山鄉: its 議事公開區 (a Google Site) one Drive folder, a folder a session with its 日程表, 議事錄 and
  // recording.
  10010150: { n: '梅山鄉民代表會', home: 'https://sites.google.com/view/meishan-2017/', term: 22, ends: '2026-12-25', chcg: { drive: { '1Aq504mbojd2be0hhS4UMRckPmqyjjy8R': '其他' } } },
  // 臺東縣東河鄉: on its 公所's Joomla site (`joomla`: 議事日程表, 議事錄 and recordings, an article each).
  10014070: {
    n: '東河鄉民代表會',
    home: 'https://www.donghe.gov.tw/home/index.php/2020-05-28-08-11-47',
    term: 22,
    ends: '2026-12-25',
    chcg: { joomla: { base: 'https://www.donghe.gov.tw', lists: ['/home/index.php/2020-05-28-08-11-47/2020-05-28-08-33-38', '/home/index.php/2020-05-28-08-11-47/2020-05-28-08-34-00'] } }
  },
  // 宜蘭縣頭城鎮: its page on the 公所's site (e-land's CCMS, `ccms`): every session's 日程表 and minutes, and its
  // sittings' recordings.
  10002040: { n: '頭城鎮民代表會', home: 'https://toucheng.e-land.gov.tw/cp.aspx?n=8894', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://toucheng.e-land.gov.tw/cp.aspx?n=8894'] } },
  // 宜蘭縣礁溪鄉: its pages on the 公所's site (議事日程, 定期會 and 臨時會 會議紀錄, a session's recording on Drive).
  10002050: {
    n: '礁溪鄉民代表會',
    home: 'https://jiaosi.e-land.gov.tw/cl.aspx?n=7819',
    term: 22,
    ends: '2026-12-25',
    chcg: { ccms: ['https://jiaosi.e-land.gov.tw/cp.aspx?n=12800', 'https://jiaosi.e-land.gov.tw/cp.aspx?n=14230', 'https://jiaosi.e-land.gov.tw/News.aspx?n=14231&sms=13265', 'https://jiaosi.e-land.gov.tw/cp.aspx?n=12801'] }
  },
  // 宜蘭縣蘇澳鎮: its 議事錄 on the 公所's site, a post a session (CCMS News.aspx).
  10002030: { n: '蘇澳鎮民代表會', home: 'https://www.suao.gov.tw/News.aspx?n=14773&sms=15166', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.suao.gov.tw/News.aspx?n=14773&sms=15166'] } },
  // 宜蘭縣員山鄉: its pages on the 公所's site (議事錄, Word or PDF; recordings by kind, named 2205-0512).
  10002070: {
    n: '員山鄉民代表會',
    home: 'https://www.yuanshan.gov.tw/cl.aspx?n=12811',
    term: 22,
    ends: '2026-12-25',
    chcg: { ccms: ['https://www.yuanshan.gov.tw/cp.aspx?n=15082', { url: 'https://www.yuanshan.gov.tw/cp.aspx?n=15127', kind: '定期會' }, { url: 'https://www.yuanshan.gov.tw/cp.aspx?n=15128', kind: '臨時會' }] }
  },
  // 宜蘭縣羅東鎮: its own plain site (`files`): every 議事錄 on one page, its sittings' videos on YouTube a page a
  // few months (`more`).
  10002020: { n: '羅東鎮民代表會', home: 'https://lotong200.e-land.gov.tw/', term: 22, ends: '2026-12-25', chcg: { files: ['https://lotong200.e-land.gov.tw/record.html', 'https://lotong200.e-land.gov.tw/recorder.html'], more: '^recorder22[_-]' } },
  // 宜蘭縣壯圍鄉: its own site ("boxlists", `box`): 議事日程, 會議記錄, 議事錄下載 (with its sittings' recordings).
  10002060: { n: '壯圍鄉民代表會', home: 'https://juanwei.e-land.gov.tw/', term: 22, ends: '2026-12-25', chcg: { box: { base: 'https://juanwei.e-land.gov.tw/', menus: { 13: '議事日程表', 14: '會議紀錄', 15: '會議紀錄' } } } },
  // 花蓮縣秀林鄉: its lists on the 公所's site (CCMS): 開會日程表, 議事錄, and 質詢錄音檔 (a post a session, its
  // sittings' videos on YouTube by day).
  10015110: {
    n: '秀林鄉民代表會',
    home: 'https://www.shlin.gov.tw/cl.aspx?n=40815',
    term: 22,
    ends: '2026-12-25',
    chcg: { ccms: ['https://www.shlin.gov.tw/News.aspx?n=40844&sms=28909', 'https://www.shlin.gov.tw/News.aspx?n=40846&sms=28911', 'https://www.shlin.gov.tw/News.aspx?n=40847&sms=28912'] }
  },
  // 花蓮's 鳳林 (議事錄 files listed) and 萬榮 (議事日程表, 議事錄, recordings a list each), on the county's CCMS.
  10015020: { n: '鳳林鎮民代表會', home: 'https://www.fonglin.gov.tw/cl.aspx?n=11773', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.fonglin.gov.tw/News.aspx?n=5560&sms=26456'] } },
  10015120: { n: '萬榮鄉民代表會', home: 'https://www.wanrung.gov.tw/cl.aspx?n=8781', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.wanrung.gov.tw/News.aspx?n=8783&sms=14642', 'https://www.wanrung.gov.tw/News.aspx?n=8784&sms=14643', 'https://www.wanrung.gov.tw/News.aspx?n=10554&sms=14644'] } },
  // 花蓮縣壽豐鄉: its 議事專區 on the 公所's site, a session's 議事日程表 a post.
  10015060: { n: '壽豐鄉民代表會', home: 'https://www.shoufeng.gov.tw/News.aspx?n=5266&sms=17220', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.shoufeng.gov.tw/News.aspx?n=5266&sms=17220'] } },
  // 苗栗縣苑裡鎮: its 議事日程公告 and 議事錄 on the 公所's site, lists of the files themselves.
  10005020: {
    n: '苑裡鎮民代表會',
    home: 'https://www.yuanli.gov.tw/cl.aspx?n=7523',
    term: 22,
    ends: '2026-12-25',
    chcg: { ccms: ['https://www.yuanli.gov.tw/News.aspx?n=7527&sms=13770', 'https://www.yuanli.gov.tw/News.aspx?n=7528&sms=13771'] }
  },
  // 苗栗縣's other 代表會 on their 公所's CCMS sites, as 苑裡's: 卓蘭, 銅鑼, 頭屋 (lists of the files themselves), 南庄,
  // 西湖, 三灣 (a post a paper), 大湖 (a post a session, its recordings by day), 泰安 (its sittings' videos).
  10005070: { n: '卓蘭鎮民代表會', home: 'https://www.juolan.gov.tw/cl.aspx?n=3171', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.juolan.gov.tw/News.aspx?n=4462&sms=13067'] } },
  10005080: { n: '大湖鄉民代表會', home: 'https://www.dahu.gov.tw/News.aspx?n=3225&sms=10566', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.dahu.gov.tw/News.aspx?n=3225&sms=10566'] } },
  10005100: { n: '銅鑼鄉民代表會', home: 'https://www.tongluo.gov.tw/News.aspx?n=3358&sms=10617', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.tongluo.gov.tw/News.aspx?n=3358&sms=10617'] } },
  10005110: { n: '南庄鄉民代表會', home: 'https://www.nanchuang.gov.tw/News.aspx?n=5586&sms=13179', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.nanchuang.gov.tw/News.aspx?n=5586&sms=13179'] } },
  10005120: { n: '頭屋鄉民代表會', home: 'https://www.touwu.gov.tw/cl.aspx?n=3494', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.touwu.gov.tw/News.aspx?n=4498&sms=11454'] } },
  10005140: { n: '西湖鄉民代表會', home: 'https://www.xihu.gov.tw/News.aspx?n=3648&sms=10751', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.xihu.gov.tw/News.aspx?n=3648&sms=10751'] } },
  10005160: { n: '三灣鄉民代表會', home: 'https://www.sanwan.gov.tw/News.aspx?n=5795&sms=13124', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.sanwan.gov.tw/News.aspx?n=5795&sms=13124'] } },
  10005180: { n: '泰安鄉民代表會', home: 'https://www.taian.gov.tw/cl.aspx?n=4249', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.taian.gov.tw/News.aspx?n=4912&sms=11757'] } },
  // (公館's 議事公開資料夾: cp pages, its recordings in tabs, a session a tab.)
  10005090: { n: '公館鄉民代表會', home: 'https://www.kungkuan.gov.tw/cl.aspx?n=5686', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.kungkuan.gov.tw/cp.aspx?n=5687', 'https://www.kungkuan.gov.tw/cp.aspx?n=5691', 'https://www.kungkuan.gov.tw/cp.aspx?n=5692'] } },
  // (竹南's minutes in a video list, News_Video.aspx; 三義's recordings a post a sitting.)
  10005040: { n: '竹南鎮民代表會', home: 'https://www.chunan.gov.tw/News_Video.aspx?n=5504&sms=12999', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.chunan.gov.tw/News_Video.aspx?n=5504&sms=12999'] } },
  10005130: { n: '三義鄉民代表會', home: 'https://www.sanyi.gov.tw/cl.aspx?n=3540', term: 22, ends: '2026-12-25', chcg: { ccms: ['https://www.sanyi.gov.tw/News.aspx?n=5643&sms=13065'] } },
  // 南投縣鹿谷鄉: the 代表會's 會議資訊 on the 公所's Laravel site (`lara`), a post a session with its 議程表, 決議案 and
  // recordings.
  10008070: { n: '鹿谷鄉民代表會', home: 'https://www.lugu.gov.tw/representative/meetinginfor', term: 22, ends: '2026-12-25', chcg: { lara: 'https://www.lugu.gov.tw/representative/meetinginfor' } },
  // 澎湖縣's 代表會, each a site on the county's platform (`penghu`): its lists by id, 開會日程表, 議事錄 and 開會影音檔
  // (each sitting's MP4, played in the app).
  10016010: { n: '馬公市民代表會', home: 'https://event.penghu.gov.tw/Rmarkun/', term: 12, ends: '2026-12-25', chcg: { penghu: { base: 'https://event.penghu.gov.tw/Rmarkun/', lists: { 25: '議事日程表', 23: '會議紀錄', 24: '錄音' } } } },
  10016020: { n: '湖西鄉民代表會', home: 'https://event.penghu.gov.tw/Rhuxi/', term: 22, ends: '2026-12-25', chcg: { penghu: { base: 'https://event.penghu.gov.tw/Rhuxi/', lists: { 14: '議事日程表', 15: '會議紀錄', 16: '錄音' } } } },
  10016030: { n: '白沙鄉民代表會', home: 'https://event.penghu.gov.tw/Rbaisha/', term: 22, ends: '2026-12-25', chcg: { penghu: { base: 'https://event.penghu.gov.tw/Rbaisha/', lists: { 13: '議事日程表', 33: '會議紀錄', 34: '錄音' } } } },
  10016050: { n: '望安鄉民代表會', home: 'https://event.penghu.gov.tw/Rwangan/', term: 22, ends: '2026-12-25', chcg: { penghu: { base: 'https://event.penghu.gov.tw/Rwangan/', lists: { 20: '議事日程表', 21: '會議紀錄', 22: '錄音' } } } },
  10016040: { n: '西嶼鄉民代表會', home: 'https://event.penghu.gov.tw/Rhsiyu/', term: 22, ends: '2026-12-25', chcg: { penghu: { base: 'https://event.penghu.gov.tw/Rhsiyu/', lists: { 31: '議事日程表', 32: '議事日程表', 34: '會議紀錄', 35: '錄音' } } } },
  10016060: { n: '七美鄉民代表會', home: 'https://event.penghu.gov.tw/Rchimi/', term: 22, ends: '2026-12-25', chcg: { penghu: { base: 'https://event.penghu.gov.tw/Rchimi/', lists: { 14: '議事日程表', 15: '會議紀錄', 16: '錄音' } } } },
  // 新竹縣's 代表會 on their 公所's sites (`hcg`); 北埔's on its 公所's twgov CMS, lists of rows a paper each (`circ`).
  10004020: hcg('竹東鎮民代表會', 'zhudong', 20, ['News.aspx?n=1805&sms=12085', 'News.aspx?n=1806&sms=12086']),
  10004040: hcg('關西鎮民代表會', 'guanxi', 22, ['News.aspx?n=1881&sms=12120']),
  10004070: hcg('芎林鄉民代表會', 'qionglin', 22, ['News.aspx?n=702&sms=10954', 'News.aspx?n=703&sms=10955', 'News.aspx?n=704&sms=10956']),
  10004090: {
    n: '北埔鄉民代表會',
    home: 'https://www.beipu.gov.tw/iframcirculated_list.php?menu=2503&typeid=2588&typeid2=2589',
    term: 22,
    ends: '2026-12-25',
    chcg: { base: 'https://www.beipu.gov.tw/', circ: { 'iframcirculated_list.php?menu=2503&typeid=2588&typeid2=2589': '議事日程表', 'iframcirculated_list.php?menu=2503&typeid=2588&typeid2=2590': '會議紀錄', 'iframcirculated_list.php?menu=2503&typeid=2588&typeid2=2591': '議事錄' } }
  },
  10004100: hcg('寶山鄉民代表會', 'baoshan', 20, ['News.aspx?n=1207&sms=11702']),
  10004130: hcg('五峰鄉民代表會', 'wufeng', 22, ['News.aspx?n=2446&sms=12605', 'News.aspx?n=2447&sms=12606', 'News.aspx?n=2448&sms=12607', 'News.aspx?n=2451&sms=12610']),
  // 屏東縣's 代表會, each on its 公所's site on the county's platform (www.pthg.gov.tw/<town>/, CCMS, `pthg`): its
  // lists, 議事日程, 議事錄, 會議紀錄, 錄音檔, a post a paper (News.aspx) or the files themselves (News4.aspx).
  10013020: pthg('潮州鎮民代表會', 'chaujou', '', ['News.aspx?n=2BD7E34B1FA9DE68&sms=FE998E099AB9C80D', 'News.aspx?n=552B4C06A26159F0&sms=A47C0C44021E1F8B', 'News.aspx?n=48999AEAF832497E&sms=6C99D43425CF7F1E']),
  10013030: pthg('東港鎮民代表會', 'TownDto', 'Content_List.aspx?n=E086313952FEB899', ['News4.aspx?n=4B660CAD4E87BCF9&sms=DA851960F3010CCD', 'News4.aspx?n=C57A8D23F9DE6EC9&sms=6DC0432987A1E063', 'News4.aspx?n=5BC3ACAE7BAEF411&sms=70C53AA948741E48']),
  10013040: pthg('恆春鎮民代表會', 'townhengchuen', 'Content_List.aspx?n=74E2B73BEBB98AD1', ['News.aspx?n=B9510FD225101968&sms=F6150A7982F05C51', 'News.aspx?n=19606101ACDEC197&sms=7F19BC00CC682085', 'News.aspx?n=F5C21FD86BCF330C&sms=1146F1A67261F368'], { '16ONhHjExiqLuVSUpg-RoxF9O0xNBrXjT': '錄音', '19od3Xpmbc-8IQBerftYUaOe-oqT3yhAP': '會議紀錄' }),
  10013050: pthg('萬丹鄉民代表會', 'TownWto', '', ['News.aspx?n=9803C9E0AC050AA9&sms=682D04929C42CE30']),
  10013060: pthg('長治鄉民代表會', 'TownCgt', 'Content_List.aspx?n=8828DA518CB9BFB6', ['News.aspx?n=4CCADEECFDAC9FC5&sms=6686DC0E36079892', 'News.aspx?n=D724C4D44EB03CF2&sms=3C1F79E16CBC03BB', 'News.aspx?n=7BFAC30E7552C8A0&sms=3B9213EA1EBD2082', 'News.aspx?n=C6A575245A3C0BFB&sms=C810C4B52132AA86']),
  10013080: pthg('九如鄉民代表會', 'townjrt', '', ['News4.aspx?n=F4792B1C105B5191&sms=2AB978601B0F61DD', 'News4.aspx?n=FB04D9A78A3C739D&sms=9D5E61992BB25CB6', 'News4.aspx?n=919502A395B67BD0&sms=FFD817132E8F6E86', 'News4.aspx?n=1567CED5D1624614&sms=A5AE589FCBB93C8A']),
  10013100: pthg('鹽埔鄉民代表會', 'townyto', 'Content_List.aspx?n=EA60C5A2A7C878EB', ['News.aspx?n=FF9E5B2B0CD52C88&sms=52997E49D0423677', 'News.aspx?n=1CDED89AFEAB5662&sms=AA293155FC682C35', 'News.aspx?n=8E2C79DD23F3259B&sms=66FB242F0BCD1ED5', 'News.aspx?n=F347290E7ADD0B35&sms=F4D37FADDF9AA0CE']),
  // (高樹's lists a page a session, `tree`.)
  10013110: {
    ...pthg('高樹鄉民代表會', 'towngto', 'Content_List.aspx?n=676E4F46FF4E28A3', []),
    chcg: {
      ccms: [
        ['AF3772AECB4BB6EF', '議事日程表'],
        ['30D2791FE1D783FB', '會議紀錄'],
        ['53B60E340F199962', '會議紀錄'],
        ['48BD604FB3730F2C', '錄音']
      ].map(([n, kind]) => ({ url: `https://www.pthg.gov.tw/towngto/Content_List.aspx?n=${n}`, kind, tree: true }))
    }
  },
  10013120: pthg('萬巒鄉民代表會', 'townwlt', 'Content_List.aspx?n=D9DFE2863442AA76', ['News4.aspx?n=551C8DD2D964BFCB&sms=71EE79FCECB60957', 'News4.aspx?n=DFB1DBE7F843A07C&sms=A4955D72353BA43A', 'News4.aspx?n=6B6248F2DAFDE5D2&sms=D6848D760540FAB5', 'News4.aspx?n=72168AA13C1702C3&sms=507BFDE5988D5E73']),
  10013130: {
    n: '內埔鄉民代表會',
    home: 'https://www.neipu.gov.tw/Default.aspx',
    term: 22,
    ends: '2026-12-25',
    chcg: { ccms: ['https://www.neipu.gov.tw/News9.aspx?n=73006AAF027D5950&sms=E47D2CCFAE573CB1', 'https://www.neipu.gov.tw/cp.aspx?n=23CA5C5A3C0CA4AA', 'https://www.neipu.gov.tw/News9.aspx?n=7F48936772DA47CD&sms=B05912F4A70DF048', 'https://www.neipu.gov.tw/News9.aspx?n=2834DE8F3E95BA4B&sms=0B7FDF1F0251CF2E'] }
  },
  10013140: pthg('竹田鄉民代表會', 'townjtt', 'Content_List.aspx?n=E6E304E9FBDB5408', ['News.aspx?n=69D5B7ED81CB0BF1&sms=BB92A8BA2DA4F0A3', 'News.aspx?n=1B524EAABAD708FB&sms=3119A5F6542618B5', 'News.aspx?n=9C6129E8A75E716A&sms=A80F7B814D226997', 'News.aspx?n=51E1079B8777FEDC&sms=AE2650C42C62B3D6']),
  10013150: pthg('新埤鄉民代表會', 'townsto', 'Content_List.aspx?n=E1034B9FD87160B4', ['News4.aspx?n=76688DC8DF4D7D75&sms=AA3ACA7466F4EA0C', 'News4.aspx?n=D9C794247BB808FA&sms=8522BE5113C26E04', 'News4.aspx?n=91B121FE3FA7C24D&sms=8DE1EA4A08B8B8CA', 'News4.aspx?n=54F12373A13C468C&sms=9422EB2029B91CEA']),
  10013160: pthg('枋寮鄉民代表會', 'TownFto', 'News.aspx?n=644343AB89A77598&sms=B1C9111A2D484F98', ['News.aspx?n=644343AB89A77598&sms=B1C9111A2D484F98']),
  10013200: pthg('南州鄉民代表會', 'nanchoue', 'Content_List.aspx?n=E7B4C3839449DDDC', ['News.aspx?n=E829F1FB44AB4210&sms=5775F40C4318FF68', 'News.aspx?n=4FC6F6E419011D18&sms=A93FF7215A08096E', 'News.aspx?n=CFA32B53BE512DC9&sms=0CD5C4AA1C3496D2']),
  10013180: pthg('崁頂鄉民代表會', 'townkto', 'Content_List.aspx?n=073BA0F5DB6D14AD', ['News.aspx?CategorySN=2856&n=E4BB700FFE472598&sms=93634CFE5A3C009B', 'News.aspx?CategorySN=2857&n=6F60A46B2B77A963&sms=93634CFE5A3C009B', 'News.aspx?CategorySN=2856&n=3FCE315F4528F5FC&sms=C1678D1C94E195C1', 'News.aspx?CategorySN=2857&n=34431136D94CDB6B&sms=C1678D1C94E195C1', 'News.aspx?CategorySN=2856&n=D25B817BA7873290&sms=1E376F200F2FB2C4', 'News.aspx?CategorySN=2857&n=6C8D36E85705FBF6&sms=1E376F200F2FB2C4']),
  10013220: pthg('琉球鄉民代表會', 'liuchiu', '', ['News4.aspx?n=36628D1E6C779524&sms=F551AB21303A941F', 'News4.aspx?n=DA762B6EE9CF6B16&sms=1E8085DB69373A96', 'News4.aspx?n=4F487E959DCFAC24&sms=18831A50100AD6F0', 'News4.aspx?n=8254BAFC3CD63BB4&sms=D23DB9489C7AFD5B']),
  10013230: pthg('車城鄉民代表會', 'checheng', '', ['News4.aspx?n=F92708912C032A0D&sms=60ADCDE6789100AE', 'News4.aspx?n=F2031CEF0CE38670&sms=A714D12A90027B0B', 'News4.aspx?n=491B63DE94871D9B&sms=85B62D0D72FE46F2', 'News4.aspx?n=57B98A88F4AF61B1&sms=C2BF5D260404B812']),
  10013260: pthg('三地門鄉民代表會', 'sandimen', 'Content_List.aspx?n=574E51BEBA2E10EF', ['News4.aspx?n=E04757296D5B98F5&sms=096C6BC1FEF3951D', 'News4.aspx?n=A3516369192BA232&sms=B39520BC69B9114C', 'News4.aspx?n=4056741A449F4B08&sms=BBBBBA4B984422C2', 'News4.aspx?n=62A68EADCF6F4EF6&sms=86B55CA5873D7006']),
  10013270: pthg('霧臺鄉民代表會', 'wutai', 'Content_List.aspx?n=F5E152052B66D756', ['News4.aspx?n=72D1F185E353167D&sms=0B8469FA6307CBBC', 'News4.aspx?n=54D6A1F3F8423729&sms=AF564190E463481C']),
  10013290: pthg('泰武鄉民代表會', 'TownTto', '', ['News.aspx?CategorySN=2877&n=9EC7CB286DB78221&sms=CB24F8ACC1374FD4', 'News.aspx?CategorySN=2877&n=9259084FE1FEEAA3&sms=E976AEB9B32E695D', 'News.aspx?CategorySN=2877&n=69378FCFBC1D8E0B&sms=CC916E7EF69104CF', 'News.aspx?CategorySN=2877&n=A74C62B8A64FB3B9&sms=08E69B9D53AF1797']),
  10013300: pthg('來義鄉民代表會', 'laiyi', 'Content_List.aspx?n=0FCB9C22CDEF2A46', ['News.aspx?n=5C9FB2F12E598D43&sms=8873617612F73874', 'News.aspx?n=1349BB5D3A0A2D56&sms=4FE8CF55F5DC1BD5', 'News.aspx?n=48FBF3D9A5A25582&sms=1756AB9F2AF6F8FF', 'News.aspx?n=1AFF5C9C19B3D3A1&sms=7D36163B5527E057']),
  10013310: pthg('春日鄉民代表會', 'TownCrt', 'Content_List.aspx?n=BC9B23F9A2337F24', ['News.aspx?n=8303D01C859FFD0E&sms=21D5C7681B41DD95', 'News.aspx?n=ED9E6401D5294C7E&sms=17C94250BA4F97FB', 'News.aspx?n=92186DA90A15F0F2&sms=8B62BB18FD4C9C48']),
  // (Or its papers in Google Drive folders, a folder a kind (`drive`), linked from its 公所's site.)
  10013090: { n: '里港鄉民代表會', home: 'https://www.pthg.gov.tw/townlto/Default.aspx', term: 22, ends: '2026-12-25', chcg: { drive: { '1FRLUktuuoRcfnxP0uohIUk-sdQAyyC31': '議事日程表', '1uhgA6Fit_0RIw5tqN2DyRIi2Zy7_QrUe': '會議紀錄', '1xGq--MlRQvWZirKVeGKcOODDsRfQqnmT': '會議紀錄', '1H7kwkmfRHugNnADHMdBRCvuf44T0Vd5T': '錄音' } } },
  10013170: { n: '新園鄉民代表會', home: 'https://www.pthg.gov.tw/TownSyt/Content_List.aspx?n=DF0C09BCBB33A7D2', term: 22, ends: '2026-12-25', chcg: { drive: { '15XOlAlX9_2_ftznS5uQ8RxCwjSfh8XKc': '議事日程表', '1geoyKrfUv9YS3kN0F5L7Tu0zZ75Q87yh': '會議紀錄', '1sac9F7qZ0JhV4wjQZw0e6QiiiY53El3y': '會議紀錄', '1uC4MJNFQDRfsrhHABwF2DJ6t3Od4O5JD': '錄音' } } },
  10013190: { n: '林邊鄉民代表會', home: 'https://www.pthg.gov.tw/townlbt/Content_List.aspx?n=650970F8ECD6C427', term: 22, ends: '2026-12-25', chcg: { drive: { '16k6hHt-rF8Y7cQW3JOWwBcFmNWiq2hNZ': '議事日程表', '1x3Yzfd1KuWPvHQMEW18gDe38I-RS9pA1': '會議紀錄', '1iy3gi4rXHP_WM61EZPUkrWjrfWX7bOPe': '錄音' } } },
  10013330: pthg('牡丹鄉民代表會', 'townmdt', 'Content_List.aspx?n=F9FE0E52D0430998', ['News4.aspx?n=745049388DB633BD&sms=6BA31A8C64C2BE82', 'News4.aspx?n=23ECDB63D55D3EF3&sms=FB0AEC125E58A640', 'News4.aspx?n=52D6A8FDFDB8ABCD&sms=9D649335C071674A', 'News4.aspx?n=4E32C02210011481&sms=F46C320E23B22954'])
};

const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
// 一…九十九 as a number.
export const cnNum = s => {
  if (/^\d+$/.test(s)) return +s;
  // (廿 for 二十: 第廿二屆.)
  if (/^廿/.test(s)) s = String(s).replace(/^廿/, '二十');
  const m = String(s).match(/^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/);
  if (!m || !s) return 0;
  return m[2] ? (m[1] ? CN[m[1]] : 1) * 10 + (m[3] ? CN[m[3]] : 0) : CN[m[1] || m[3]] || 0;
};

const pad = n => String(n).padStart(2, '0');
const roc = (y, m, d) => `${+y + 1911}-${pad(m)}-${pad(d)}`;
const text = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const abs = (base, u) => new URL(String(u).replace(/^\.\.\//, ''), base).href;

// A page's address with Big5 in its query (the CMS reads `title=` as Big5): each character's two bytes, from
// the decoder's own table (Node's TextDecoder knows Big5; it has no encoder).
let big5;
export function big5q(s) {
  if (!big5) {
    big5 = new Map();
    const dec = new TextDecoder('big5');
    for (let a = 0x81; a <= 0xfe; a++)
      for (let b = 0x40; b <= 0xfe; b++) {
        if (b > 0x7e && b < 0xa1) continue;
        const ch = dec.decode(new Uint8Array([a, b]));
        if (ch.length === 1 && ch !== '�' && !big5.has(ch)) big5.set(ch, [a, b]);
      }
  }
  return [...String(s)].map(c => (c.charCodeAt(0) < 128 ? encodeURIComponent(c) : (big5.get(c) || []).map(x => `%${x.toString(16).toUpperCase()}`).join(''))).join('');
}

export const listUrl = (site, [menu, typeid], page = 0) => `${site.base}iframcirculated_list.php?menu=${menu}&typeid=${typeid}${page ? `&Page=${page}` : ''}`;
export const membersUrl = (site, typeid) => `${site.base}iframdeputy_list.php?menu=${site.members}&typeid=${typeid}`;
export const recordUrl = site => `${site.base}iframmeeting_list.php?menu=${site.record[0]}&typeid=${site.record[1]}`;
export const sessionUrl = (site, key) => `${site.base}iframmeeting2_list.php?menu=${site.record[0]}&typeid=${site.record[1]}&title=${big5q(key)}`;
export const itemUrl = (site, id) => `${site.base}iframmeeting2_list.php?menu=${site.record[0]}&typeid=${site.record[1]}&circulated_id=${id}`;
export const viewUrl = (site, [menu, typeid], id) => `${site.base}iframcirculatedview.php?menu=${menu}&typeid=${typeid}&circulated_id=${id}`;

// A district's members: name, title (主席, 副主席, 代表), photo, their page.
export function townMembers(html, site, typeid) {
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/iframdeputyview\.php\?[^"']*deputy_id=(\d+)["'][^>]*>\s*<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["']/g)) {
    const [, id, img, alt] = m;
    if (seen.has(id)) continue;
    seen.add(id);
    const rest = html.slice(m.index, m.index + 3000);
    const n = (rest.match(/姓\s*名：\s*([^<\s]+)/) || [])[1] || alt.replace(/(副?主席|代表)$/, '');
    const title = (rest.match(/職\s*稱：\s*([^<\s]+)/) || [])[1] || '代表';
    out.push({ n, title: title.replace(/^代表會/, ''), area: site.areas[typeid] || '', id: +id, img: abs(site.base, img), url: `${site.base}iframdeputyview.php?menu=${site.members}&typeid=${typeid}&deputy_id=${id}` });
  }
  return out;
}

// The term's sessions in the 議事錄's index, newest first: { key (the page's title=), n (第8次定期會), term, no, kind }.
export function townSessions(html) {
  const out = [];
  for (const [, key, title] of String(html).matchAll(/iframmeeting2_list\.php\?[^"']*title=([^"'&]+)["'][^>]*title=["']([^"']+)["']/g)) {
    const m = title.match(/第(\d+)屆第(\d+)次(定期會|臨時會)/);
    if (!m || out.some(x => x.key === key)) continue;
    out.push({ key, n: `第${m[2]}次${m[3]}`, term: +m[1], no: +m[2], kind: m[3] });
  }
  return out;
}

// What a sub-item is, from its label in the session's page (壹、會議記錄's 第一次會議 … 柒、會議錄音檔).
export function kindOf(label) {
  const s = String(label);
  if (/錄音/.test(s)) return '錄音';
  if (/次會議/.test(s)) return '會議紀錄';
  if (/總質詢/.test(s)) return '總質詢';
  if (/施政報告/.test(s)) return '施政報告';
  if (/決議/.test(s)) return '決議案';
  if (/致詞/.test(s)) return '致詞';
  if (/附錄/.test(s)) return '附錄';
  return '其他';
}
// A label without its session and its numbering: 第一次會議, 延長會第二次會議, 總質詢第一天, 決議案.
export const itemName = (label, kind) => {
  let s = String(label).replace(/^.*?\(|\)\s*$/g, '').replace(/^[壹貳參肆伍陸柒捌玖拾]+、/, '').replace(/[_＿]/g, ' ').trim();
  if (kind === '總質詢') s = s.replace(/^市政總質詢\s*/, '總質詢 ');
  return s.replace(/\s+/g, ' ');
};
// A session's page: its parts, in the page's order, each with its circulated id.
export function sessionItems(html) {
  const out = [];
  for (const [, id, title] of String(html).matchAll(/iframmeeting2_list\.php\?[^"']*circulated_id=(\d+)["'][^>]*title=["']([^"']+)["']/g)) {
    if (out.some(x => x.id === +id)) continue;
    const k = kindOf(title);
    out.push({ id: +id, k, n: itemName(title, k), ext: /延長會/.test(title) });
  }
  return out;
}

// One page's files: its PDFs (name, address, size) and when it was last changed.
export function pageFiles(html, base) {
  const s = String(html);
  const files = [];
  for (const [, href, name, size] of s.matchAll(/<a[^>]*href=["']([^"']*admin\/upload\/[^"']+)["'][^>]*>([^<]*)<\/a>(?:\s|&nbsp;)*([\d.]+\s*[KMG])?/gi)) {
    const url = abs(base, href);
    if (files.some(f => f.url === url)) continue;
    files.push({ n: text(name), url, ...(size ? { size: size.replace(/\s/g, '') + 'B' } : {}) });
  }
  const upd = (s.match(/最後更新日期：\s*<\/span>\s*<span>\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
  return { files, upd };
}

// The recordings' page: a row a sitting day, its Google Drive file (played in the app by Drive's own player).
export function audioDays(html) {
  const out = [];
  for (const [, row] of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const id = (row.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || [])[1];
    const t = text(row);
    const m = t.match(/(1\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (!id || !m) continue;
    out.push({ d: roc(m[1], m[2], m[3]), drive: id, ext: /延長會/.test(t) });
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

// A list page's rows: { id, t } (its title), and the day where the list shows one.
export function listRows(html) {
  const out = [];
  for (const m of String(html).matchAll(/iframcirculatedview\.php\?[^"']*circulated_id=(\d+)["'][^>]*title=["']([^"']+)["']/g)) {
    const id = +m[1];
    if (out.some(x => x.id === id)) continue;
    out.push({ id, t: m[2].replace(/^\[開新分頁下載\]/, '').trim() });
  }
  return out;
}

// A session's days as the news announces them: 本會第10屆第8次定期會訂於本(115)年9月23日至10月4日(共12天)召開。
export function sessionNews(title, posted = '') {
  const m = String(title).match(/第(\d+)屆第(\d+)次(定期會|臨時會)(延長會)?[^0-9（(]*[（(](1\d{2})[）)]年(\d{1,2})月(\d{1,2})日(?:\s*[至到-]\s*(?:(\d{1,2})月)?(\d{1,2})日)?/);
  if (!m) return null;
  const [, term, no, kind, ext, y, m1, d1, m2, d2] = m;
  const from = roc(y, m1, d1);
  let to = d2 ? roc(+m2 && +m2 < +m1 ? +y + 1 : y, m2 || m1, d2) : from;
  return { term: +term, n: `第${no}次${kind}`, ext: !!ext, from, to, ...(posted ? { posted } : {}) };
}

// A session's place in time on `day`: 開會中, 將開會 or past.
export const sessionState = (x, day) => (x.from && x.from <= day && day <= (x.ext?.to || x.to) ? 'on' : x.from > day ? 'ahead' : 'past');

// A Google Drive file itself (a sitting's .m4a: streamed by the phone, ranges and CORS open), its own player and page.
export const driveFile = id => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`;
export const drivePlayer = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
export const drivePage = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

// Where a session's papers, read from their PDFs, are kept: council/town/<tc>/<this>.json (t10-8r: 定期會, -e: 臨時會).
export const paperFile = s => `t${s.term}-${s.no}${s.kind === '定期會' ? 'r' : 'e'}`;

const CJK = /[㐀-鿿]/;
const ymd = s => {
  const m = String(s).replace(/\s+/g, '').match(/(?:中華民國)?(1\d{2})年(\d{1,2})月(\d{1,2})日/);
  return m ? roc(m[1], m[2], m[3]) : '';
};

// A 決議案 PDF: one form a resolution. Each: 案號 (甲字 from the 公所, 乙字 from members, 動議字 moved in the
// chamber), 類別, 提案人, 附署人, 案由, 說明, 辦法, 議決, its day, and whether the 延長會 passed it.
export function resolutions(text) {
  const out = [];
  const forms = String(text || '').replace(/\f/g, '\n').split(/\n(?=[^\n]*代表會第\s*\d+\s*屆[^\n]*決議案\s*\n)/);
  for (const form of forms) {
    const lines = form.split('\n');
    if (!/決議案\s*$/.test(lines[0])) continue;
    const at = lines.findIndex(l => /提案人/.test(l) && /類\s*別/.test(l));
    if (at < 0) continue;
    const l = lines[at];
    const by = l.indexOf('提案人');
    const co = l.search(/附\s*署\s*人/);
    const no = l.search(/案\s*號/);
    const catFrom = l.match(/類\s*別/).index + l.match(/類\s*別/)[0].length;
    // The row's columns: its own line, and a word above or below it where a cell holds two (警政 / 交通; two
    // proposers one above the other).
    const cols = [[catFrom, by], [by + 3, co > 0 ? co : no > 0 ? no : l.length], [co > 0 ? co + l.slice(co).match(/附\s*署\s*人/)[0].length : -1, no > 0 ? no : l.length]];
    const fragment = x => x && x.trim() && x.replace(/\s/g, '').length <= 15 && !/[號：:。]|決議案|字第/.test(x) && !/^\s*(案\s*由|說\s*明)/.test(x);
    const above = fragment(lines[at - 1]) ? lines[at - 1] : '';
    const below = fragment(lines[at + 1]) ? lines[at + 1] : '';
    const cell = ([a, b]) =>
      a < 0
        ? ''
        : [above, l, below]
            .map(x => cjkTight(x.slice(a, b).trim()))
            .filter(Boolean)
            .join('、');
    const r = {};
    const num = form.match(/(?:案\s*號|編\s*號\s*[：:])\s*(\S*?字\s*第\s*\d+\s*號)/);
    if (num) r['案號'] = num[1].replace(/\s+/g, '');
    const kind = cell(cols[0]).replace(/(公用|文化|社會)、(事業|觀光|福利)/g, '$1$2');
    if (kind) r['類別'] = kind;
    const who = cell(cols[1]);
    if (who) r['提案人'] = who;
    const also = cell(cols[2]);
    if (also) r['附署人'] = also;
    // The table below the row of names, read as a council's bill form is.
    const body = billPdfParts(['提案人', '', ...lines.slice(at + 1 + (below ? 1 : 0))].join('\n'), { centred: true });
    for (const k of ['案由', '說明', '辦法', '議決']) if (body[k] && !/^如案由[。.]?$/.test(body[k])) r[k] = body[k];
    if (!r['案由']) continue;
    const d = ymd(lines.slice(lines.findIndex(x => /^\s*備\s*註/.test(x))).join(' '));
    if (d) r.d = d;
    if (/延長會/.test(lines[0])) r.ext = true;
    out.push(r);
  }
  return out;
}

// Who speaks in a 代表會's transcript: 林主席啟賢 → 林啟賢, 主席.
const ROLES = ['主任秘書', '副主席', '主席', '代表', '副市長', '市長', '秘書', '代理主任', '主任', '所長', '課長', '隊長', '園長', '館長', '管理員', '組員', '主計', '人事', '政風'];
export function speaker(s) {
  for (const r of ROLES) if (s.slice(1).startsWith(r) && s.length > r.length + 1) return { w: s[0] + s.slice(1 + r.length), r };
  return { w: s, r: '' };
}

// A 總質詢 PDF (逐字稿): its day and its turns, each { w (name), r (role), t (paragraphs, \n between) }. Short
// back-and-forth set in brackets ((何代表:…)) are turns too.
export function transcript(text) {
  const lines = String(text || '').replace(/\f/g, '\n').split('\n').filter(l => !/^\s*\d{1,3}\s*$/.test(l));
  const head = lines.slice(0, 12).join('\n');
  const d = ymd((head.match(/時\s*間\s*[:：]\s*([^\n(（]+)/) || [])[1] || '');
  const nth = (head.match(/[(（](第[一二三四五六七八九十]+天)[)）]/) || [])[1] || '';
  const turns = [];
  const short = new Map();
  let cur = null;
  let open = false;
  const said = (t, fresh) => {
    if (!cur) return;
    t = t.trim();
    if (!t) return;
    if (fresh || !cur.p.length) cur.p.push(t);
    else cur.p[cur.p.length - 1] += t;
  };
  for (const l of lines) {
    const main = l.match(/^\s*([㐀-鿿]{3,9})[:：]\s*$/);
    if (main && !/如下|方式|時間|地點/.test(main[1])) {
      const who = speaker(main[1]);
      if (who.r) short.set(main[1][0] + who.r, who.w);
      turns.push((cur = { ...who, p: [] }));
      open = false;
      continue;
    }
    const aside = l.match(/^\s*[(（]([㐀-鿿]{2,6})[:：](.*)$/);
    if (aside && cur) {
      const s = aside[1];
      const who = short.get(s) ? { w: short.get(s), r: s.slice(1) } : speaker(s);
      turns.push((cur = { ...who, p: [] }));
      open = true;
      said(aside[2].replace(/[)）]\s*$/, ''), true);
      if (/[)）]\s*$/.test(aside[2])) open = false;
      continue;
    }
    if (open && /[)）]\s*$/.test(l)) {
      said(l.replace(/[)）]\s*$/, ''));
      open = false;
      continue;
    }
    said(l, /^\s{2,}/.test(l) && !open);
  }
  const out = turns.filter(x => x.p.length).map(({ w, r, p }) => ({ w, r, t: p.map(cjkTight).join('\n') }));
  return { d, nth, turns: out };
}

// The day's questions: from a member's first word to the next member's, each { w (who asked), from, to (turns),
// gist (what about, their first sentence past the greetings) }.
const ASKS = new Set(['代表', '副主席']);
export function questions(turns) {
  const out = [];
  turns.forEach((x, i) => {
    if (!ASKS.has(x.r)) return;
    const last = out.at(-1);
    if (last && last.w === x.w) return void (last.to = i);
    if (last) last.to = Math.max(last.to, i - 1);
    out.push({ w: x.w, from: i, to: i, gist: gist(x.t) });
  });
  if (out.length) out.at(-1).to = turns.length - 1;
  // A block runs to the turn before the next one's chair call.
  for (let k = 0; k < out.length - 1; k++) {
    let end = out[k + 1].from - 1;
    while (end > out[k].from && turns[end].r === '主席' && turns[end - 1]?.r !== '主席' && end === out[k + 1].from - 1) end--;
    out[k].to = Math.max(out[k].to, end);
  }
  return out;
}
export function gist(t) {
  let s = String(t).replace(/\n/g, '');
  s = s.replace(/^.{0,220}?(?:大家早安、大家好|大家午安、大家好|大家好|大家早安|大家午安|大家早)[，,。！!、]*/, '');
  s = s.replace(/^(?:謝謝主席|感謝主席|主席)[，,、]*/, '');
  // The opening words (第一次質詢, 我延續…, 我想詢問一下) aren't what it's about.
  const parts = s.split(/(?<=[，,；;])/);
  while (parts.length > 1 && parts[0].length < 26 && /第[一二三四五六七八九十\d]+次|質詢|發言|延續|趁這個機會|詢問一下|請問一下|問一下|請教|想問|在這邊|再延伸/.test(parts[0])) parts.shift();
  s = parts.join('').replace(/^(?:那|因為|就是|然後)+/, '');
  const m = s.match(/^.{8,}?[。？?！!]/);
  s = m ? m[0] : s;
  return s.length > 80 ? `${s.slice(0, 78)}…` : s;
}

// Any other paper (會議紀錄, 致詞, 施政報告): its text in paragraphs, the page numbers and the PDF's breaks gone.
export function paperText(text) {
  const lines = String(text || '').replace(/\f/g, '\n').split('\n').filter(l => !/^\s*[-－]?\s*\d{1,3}\s*[-－]?\s*$/.test(l));
  const paras = [];
  let gap = true;
  for (const l of lines) {
    const t = l.trim();
    if (!t) {
      gap = true;
      continue;
    }
    // A new paragraph: after a blank, an item (一、 (一) 1.), a label (時 間：), or a line indented after one that ended.
    const fresh = gap || /^([壹貳參肆伍陸柒捌玖拾]+、|[一二三四五六七八九十]+、|[（(][一二三四五六七八九十\d]+[)）]|\d+[.、])/.test(t) || /^[㐀-鿿](\s*[㐀-鿿]){1,5}\s*[：:]/.test(t) || (/^\s{2,}/.test(l) && /[。：:！？]$/.test(paras.at(-1) || ''));
    if (fresh || !paras.length) paras.push(t);
    else paras[paras.length - 1] += t;
    gap = false;
  }
  return paras.map(p => cjkTight(p).replace(/^([㐀-鿿])\s+([㐀-鿿])\s*([：:])/, '$1$2$3')).filter(p => CJK.test(p) || p.length > 3).join('\n');
}

// A 書面質詢 PDF (a 總質詢 day's paper that's a form, not a transcript): each form's member, day, the office asked,
// what's asked (its 事項 and 說明), and the 公所's written reply (its 函's 說明, else none yet) with the reply's day.
const items = lines => {
  const paras = [];
  for (const t of lines.map(l => l.trim()).filter(Boolean)) {
    if (!paras.length || /^([一二三四五六七八九十]+、|[（(][一二三四五六七八九十\d]+[)）]|\d+[.、])/.test(t)) paras.push(t);
    else paras[paras.length - 1] += t;
  }
  return paras.map(p => cjkTight(p).replace(/\s*([，。、：；）」])\s*/g, '$1').replace(/\s*([（「])\s*/g, '$1')).join('\n');
};
export function written(text) {
  const out = [];
  const forms = String(text || '').replace(/\f/g, '\n').split(/\n(?=[^\n]*書面質詢表\s*\n)/);
  for (const form of forms) {
    const lines = form.split('\n');
    if (!/書面質詢表\s*$/.test(lines[0])) continue;
    const no = (form.match(/書面第\s*(\d+)\s*號/) || [])[1] || '';
    const at = lines.findIndex(l => /日\s*期/.test(l) && /年/.test(l));
    if (at < 0) continue;
    const w = (lines[at].replace(/日\s*期[\s\S]*$/, '').match(/[㐀-鿿]{2,4}/) || [])[0] || '';
    const d = ymd(lines[at]);
    const toAt = lines.findIndex((l, i) => i > at && /^\s*對\s*象/.test(l));
    const to = cjkTight(lines.slice(at + 1, toAt < 0 ? at + 4 : toAt).map(l => l.replace(/^\s*(質\s*詢|代\s*表)\s*/, '').trim()).filter(Boolean).join(''));
    // The ask: from 對象 to the reply table (or the 公所's 函), the left labels (質詢 事項 說明) taken off.
    const end = lines.findIndex((l, i) => i > toAt && (/質\s*詢\s*答\s*覆/.test(l) || /公所\s*函/.test(l)));
    const body = lines.slice(toAt + 1, end < 0 ? lines.length : end).map(l => l.replace(/^(質\s*詢|事\s*項|說\s*明|對\s*象)(?=\s)/, ' '));
    const gap = body.findIndex((l, i) => i > 0 && !l.trim() && body[i - 1].trim());
    const ask = items(gap < 0 ? body : body.slice(0, gap));
    const why = gap < 0 ? '' : items(body.slice(gap));
    // The reply: the 函's 說明 (its 主旨 when it has none), up to 正本; the margins' dots and 裝訂線 taken off.
    const fn = lines.findIndex(l => /公所\s*函/.test(l));
    let reply = '';
    let rd = '';
    if (fn >= 0) {
      const rest = lines.slice(fn).map(l => l.replace(/^\s*[.．]\s?/, '').replace(/^\s*[裝訂線]\s*$/, '').replace(/^[裝訂線](?=\s{2})/, ' '));
      rd = ymd((rest.find(l => /發文日期/.test(l)) || '').replace(/^.*發文日期/, ''));
      const s0 = rest.findIndex(l => /^\s*說\s*明\s*[：:]/.test(l));
      const s1 = rest.findIndex((l, i) => i > s0 && /^\s*(正\s*本|副\s*本)\s*[：:]/.test(l));
      // (Its first line, 依據 the 代表會's letter, says nothing.)
      if (s0 >= 0) reply = items(rest.slice(s0 + 1, s1 < 0 ? rest.length : s1).filter(l => !/^\s*第\s*\d+\s*頁/.test(l))).split('\n').filter(p => !/^一、依據.{0,60}函辦理。?$/.test(p)).join('\n');
    }
    out.push({ no, w, d, to, ask, why, reply, rd });
  }
  return out;
}
