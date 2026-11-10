// A 鄉鎮市民代表會's own site, read the way its 公所's CMS draws it (the "twgov" PHP pages many 公所 run:
// iframdeputy_list, iframcirculated_list, iframmeeting_list…), so that other 代表會 on it come with a line each.
//   竹北市民代表會: its site moved into 竹北市公所's (www.zhubei.gov.tw/jbc/; jbc.gov.tw is gone). It serves only
//   Taiwan, in Big5: the build reads it through the proxy's door (Orbit-Core law-page.js, which decodes it).
// (彰化's 和美, 伸港, 福興 are on their county's platform instead: lib/town-chcg.mjs.)
// What it has: the members by district with photos; each session of the term (議事錄): every sitting's 會議紀錄,
// 致詞, 施政報告, 市政總質詢 by day, 決議案, 附錄 (PDFs) and each sitting day's recording (錄音檔, Google Drive);
// the 議事日程表 (PDF); the news, where each session's days are announced before it meets.
// The build (scripts/build-town.mjs) writes council/town/<tc>.json and each session's papers read from their
// PDFs (council/town/<tc>/<paperFile>.json: 決議案 as rows, 總質詢 as who said what, the rest as text); the app
// draws them (app.mjs openTown).
import { billPdfParts, cjkTight } from './council.mjs';

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
  10007250: { n: '竹塘鄉民代表會', home: 'https://www.chcg.gov.tw/TSO/zhutang/07other/main.aspx?main_id=30492', term: 22, ends: '2026-12-25', chcg: { tso: 'zhutang', pages: [30492, 30493, 26407, 26408] } }
};

const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
// 一…九十九 as a number.
export const cnNum = s => {
  if (/^\d+$/.test(s)) return +s;
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
