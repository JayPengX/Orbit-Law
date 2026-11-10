// 彰化縣's 代表會 on the county's own platform (ctrl.chcg.gov.tw/main/main_act3/, an ASP.NET CMS a 代表會 an
// act_id): 和美 (23), 福興 (24), 伸港 (41). Each lays its papers out its own way, so lib/town-site.mjs TOWN_SITES
// names, a town, where they are (`chcg`):
//   lists: pages whose links are one kind each (和美's 議事日程, 錄音檔, 議事錄; 伸港's 議事錄 by kind), every link
//          naming its session (第22屆第18、19次臨時會…);
//   menus: the site's menu groups whose items are a session's page each (福興's 會議相關資訊: the 議事日程表,
//          提案表, 議事錄 of one session; 代表會錄音檔: its recordings as MP3 parts).
//   areas: the district pages (photo, then name and title).
// A session's days come from its 議事日程表 or its 議事錄's 時間 line (PDFs, read at build: `pdfSpan`).
// The build (scripts/build-town.mjs chcgTown) writes council/town/<tc>.json in the same shape as the twgov sites'.

export const CHCG = 'https://ctrl.chcg.gov.tw/main/main_act3/';
export const chcgUrl = (site, id) => `${CHCG}${site.chcg.page || 'mainV2.aspx'}?main_id=${id}&act_id=${site.chcg.act}`;

const pad = n => String(n).padStart(2, '0');
const roc = (y, m, d) => `${+y + 1911}-${pad(m)}-${pad(d)}`;
const text = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const abs = u => {
  try {
    return new URL(String(u).replace(/&amp;/g, '&'), 'https://ctrl.chcg.gov.tw/').href;
  } catch {
    return '';
  }
};

// A session named in a link or a title: 第22屆第18、19次臨時會, 第21屆第1-2次臨時會紀錄, 第22屆第1.2次臨時會,
// 第12次臨時會議事錄 (the term the site's), 第22屆第13、14臨時會議事錄 (no 次), …定期會延會日程表 (its extension).
export function sessionOf(name, term) {
  const m = String(name)
    .replace(/\s+/g, '')
    .match(/(?:第(\d+)屆)?第([\d、,，.\-]+)次?(定期會|臨時會)(延長會|延會)?/);
  if (!m) return null;
  const nos = m[2].split(/[、,，.\-]/).filter(Boolean).map(Number);
  if (!nos.length || nos.some(n => !n || n > 99)) return null;
  const t = +m[1] || term;
  const n = `第${nos.join('、')}次${m[3]}`;
  return { key: `第${t}屆${n}`, n, term: t, no: nos[0], kind: m[3], ext: !!m[4] };
}

// What a paper is, from its name.
export function paperKind(name) {
  const s = String(name);
  if (/日程/.test(s)) return '議事日程表';
  if (/提案/.test(s)) return '提案';
  if (/決議/.test(s)) return '決議案';
  if (/質詢/.test(s)) return '總質詢';
  if (/施政/.test(s)) return '施政報告';
  if (/議事錄|紀錄|記錄/.test(s)) return '會議紀錄';
  return '其他';
}

// A page's attachments and links (its 附件下載 and 相關連結 lists): { n, url }.
export function chcgLinks(html) {
  const out = [];
  for (const [, block] of String(html).matchAll(/class="att-data"[^>]*>([\s\S]*?)<\/ul>/g))
    for (const [, href, name] of block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const url = abs(href);
      if (!/\/files\/.+\.\w+$|drive\.google\.com\/file\/d\/|youtu/.test(url) || out.some(x => x.url === url)) continue;
      out.push({ n: text(name), url });
    }
  return out;
}

// The site's menu: its groups' items, { group: [{ id, n }] }.
export function chcgMenu(html) {
  const out = {};
  for (const [, head, body] of String(html).matchAll(/data-toggle="dropdown"[^>]*>([^<]+)<\/a>\s*<div class="dropdown-menu">([\s\S]*?)<\/div>/g)) {
    const items = [...body.matchAll(/main_id=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/g)].map(([, id, n]) => ({ id: +id, n: text(n) }));
    out[text(head)] ||= items;
  }
  return out;
}

// A district page's members: a photo, then the name (福興: 副主席-陳益昌; 和美: the name, then 經歷 that may say
// 現任…副主席).
export function chcgMembers(html, area) {
  const s = String(html);
  const at = s.indexOf('editor-block');
  const end = s.indexOf('AccesskeyZ', at);
  const body = s.slice(at, end > at ? end : undefined);
  const out = [];
  const imgs = [...body.matchAll(/<img[^>]*src="([^"]+)"[^>]*>/g)].filter(m => !/images(?:-new|1)?\//.test(m[1]));
  imgs.forEach((m, i) => {
    const after = text(body.slice(m.index + m[0].length, imgs[i + 1]?.index ?? body.length));
    const x = after.match(/^(?:(主席|副主席|代表)\s*[-－:：]\s*)?([㐀-鿿]{2,4})(?=\s|$)/);
    if (!x || !abs(m[1]) || out.some(p => p.n === x[2])) return;
    const title = x[1] || (after.match(/現任[^，。\s]{0,10}?代表會(副?主席)/) || [])[1] || '代表';
    out.push({ n: x[2], title, area, img: abs(m[1]) });
  });
  return out;
}

// A recording named with its day (和美: 第22屆第7次定期會1150519, …錄音檔1140919; 福興's MP3s: 1150417-a): that day.
export const dayIn = name => {
  const m = String(name).match(/(1\d{2})(\d{2})(\d{2})(?!\d)/);
  return m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? roc(m[1], m[2], m[3]) : '';
};
export const driveId = url => (String(url).match(/drive\.google\.com\/file\/d\/([\w-]+)/) || [])[1] || '';

// A session's first and last day, from its 議事日程表 (民國 115 年 … 05 月 04 日 … 05 月 15 日) or its 議事錄's
// 時間 line (時間：中華民國 115 年 5 月 19 日起至 5 月 26 止), or a table headed 月, 日 (115 年 … 4  15  三).
export function pdfSpan(text) {
  const s = String(text || '').replace(/[ \t　]+/g, ' ');
  const y = +(s.match(/(?:民國\s*)?(1\d{2})\s*年/) || [])[1];
  if (!y) return null;
  const line = (s.match(/時\s*間\s*[：:][^\n]*月[^\n]*/) || [])[0];
  const src = line || s.slice(0, 4000);
  const ok = ([m, d]) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
  let ds = [...src.matchAll(/(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})(?!\d)\s*日?/g)].map(m => [+m[1], +m[2]]).filter(ok);
  // (A table with 月 and 日 as its heads: 4  15  三  1 代表報到…)
  if (!ds.length) ds = [...src.matchAll(/^\s*(\d{1,2})\s+(\d{1,2})\s+[一二三四五六日]\s/gm)].map(m => [+m[1], +m[2]]).filter(ok);
  if (!ds.length) return null;
  const first = ds[0][0];
  // (A session over the new year: its January days in the next year.)
  const days = ds.map(([m, d]) => roc(m < first - 6 ? y + 1 : y, m, d)).sort();
  return { from: days[0], to: days.at(-1) };
}
