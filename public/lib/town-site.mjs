// A 鄉鎮市民代表會's own site, read the way its 公所's CMS draws it (the "twgov" PHP pages many 公所 run:
// iframdeputy_list, iframcirculated_list, iframmeeting_list…), so that other 代表會 on it come with a line each.
//   竹北市民代表會: its site moved into 竹北市公所's (www.zhubei.gov.tw/jbc/; jbc.gov.tw is gone). It serves only
//   Taiwan, in Big5: the build reads it through the proxy's door (Orbit-Core law-page.js, which decodes it).
// What it has: the members by district with photos; each session of the term (議事錄): every sitting's 會議紀錄,
// 致詞, 施政報告, 市政總質詢 by day, 決議案, 附錄 (PDFs) and each sitting day's recording (錄音檔, Google Drive);
// the 議事日程表 (PDF); the news, where each session's days are announced before it meets.
// The build (scripts/build-town.mjs) writes council/town/<tc>.json; the app draws it (app.mjs openTown).

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
  }
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
