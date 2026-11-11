// 彰化縣's 代表會 on the county's own platform (ctrl.chcg.gov.tw/main/main_act3/, an ASP.NET CMS a 代表會 an
// act_id): 和美 (23), 福興 (24), 伸港 (41). Each lays its papers out its own way, so lib/town-site.mjs TOWN_SITES
// names, a town, where they are (`chcg`):
//   lists: pages whose links are one kind each (和美's 議事日程, 錄音檔, 議事錄; 伸港's 議事錄 by kind), every link
//          naming its session (第22屆第18、19次臨時會…);
//   menus: the site's menu groups whose items are a session's page each (福興's 會議相關資訊: the 議事日程表,
//          提案表, 議事錄 of one session; 代表會錄音檔: its recordings as MP3 parts).
//   areas: the district pages (photo, then name and title).
// A session's days come from its 議事日程表 or its 議事錄's 時間 line (PDFs, read at build: `pdfSpan`).
//   tso:   the rest publish on their 公所's site (www.chcg.gov.tw/TSO/<dir>/07other/main.aspx: 大村, 埤頭, 竹塘…):
//          a few pages to start from, each listing files (getFile.aspx) and pages under it (`tsoPage`), followed
//          two deep; a link that doesn't name its session takes its page's.
//   forms: a 公所's own site on the "Parser" CMS (鹿港: www.lukang.gov.tw/form/index?Parser=2,6,52): lists a
//          kind each, ten a page (`formList`), files under df_ufiles/ named as the paper.
//   wp:    a 代表會 posting on WordPress (名間's own site, 大武's on its 公所's): its posts whose titles name a
//          session (`wpUrl`, `wpPost`), each holding its files (PDF, Word, MP3s by day, Drive).
//   joomla: a 公所 site on Joomla (臺東's 東河): category lists (?start=10…) of articles named by session, each
//          article's attachments and Drive files (`joomlaList`, `joomlaArticle`).
//   ccms:  pages on e-land's CCMS (宜蘭's 頭城): file blocks titled by paper and recordings under a line naming the
//          session (`ccmsPage`); a recording dated in another session's days goes to that one.
//   files: a 代表會's own plain pages (羅東's record.html), every file linked named by its session (`linkFiles`).
//   box:   a 代表會's own "boxlists" site (宜蘭's 壯圍): a list a kind (`boxList`), each line a file or a page of
//          files (`boxFiles`: the 議事錄 and its sittings' recordings named by day, `westDay`).
// The build (scripts/build-town.mjs chcgTown) writes council/town/<tc>.json in the same shape as the twgov sites'.

import { cnNum } from './town-site.mjs';

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
// 第12次臨時會議事錄 (the term the site's), 第22屆第13、14臨時會議事錄 (no 次), …定期會延會日程表 (its extension),
// 第22屆第二次定期會 (in words), 第廿二屆 (廿), 22屆第3次臨時會錄音 (no 第), 第22屆第4次定期延長會.
const NUM = '[\\d一二三四五六七八九十廿]';
const SESSION = new RegExp(`(?:第?(${NUM}+)屆)?第(${NUM}+(?:[、,，.\\-]${NUM}+)*)次?(定期|臨時)會?(延長會|延會)?`);
export function sessionOf(name, term) {
  const m = String(name).replace(/\s+/g, '').match(SESSION);
  if (!m) return null;
  const nos = m[2].split(/[、,，.\-]/).filter(Boolean).map(cnNum);
  if (!nos.length || nos.some(n => !n || n > 99)) return null;
  // (第1-5次: a run of sessions, a bundle of several: none of them.)
  if (/-/.test(m[2]) && nos.length === 2 && nos[1] - nos[0] > 1) return null;
  m[3] += '會';
  const t = cnNum(m[1] || '') || term;
  const n = `第${nos.join('、')}次${m[3]}`;
  return { key: `第${t}屆${n}`, n, term: t, no: nos[0], kind: m[3], ext: !!m[4] };
}

// What a paper is, from its name.
export function paperKind(name) {
  const s = String(name);
  if (/日程|議程/.test(s)) return '議事日程表';
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
  // (The attachments' list, or links written into the page's own text: 田尾's recordings on HiNet's 影音.)
  const blocks = [...String(html).matchAll(/class="att-data"[^>]*>([\s\S]*?)<\/ul>|class="[^"]*editor-block[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map(m => m[1] || m[2]);
  for (const block of blocks)
    for (const [, href, name] of block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const url = abs(href);
      if (!/\/files\/.+\.\w+$|drive\.google\.com\/(file\/d\/|drive\/(u\/\d\/)?folders\/)|youtu|ottlive\.hinet\.net\/.+watch/.test(url) || out.some(x => x.url === url)) continue;
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

// A recording named with its day (和美: 第22屆第7次定期會1150519, …錄音檔1140919; 福興's MP3s: 1150417-a; 溪湖:
// 綜合質詢114.5.9): that day.
export const dayIn = name => {
  const m = String(name).match(/(?<!\d)(1\d{2})(\d{2})(\d{2})(?!\d)/) || String(name).match(/(?<![\d.])(1\d{2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/);
  return m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? roc(m[1], m[2], m[3]) : '';
};
export const driveId = url => (String(url).match(/drive\.google\.com\/file\/d\/([\w-]+)/) || [])[1] || '';

// A session's first and last day, from its 議事日程表 (民國 115 年 … 05 月 04 日 … 05 月 15 日) or its 議事錄's
// 時間 line (時間：中華民國 115 年 5 月 19 日起至 5 月 26 止), or a table headed 月, 日 (115 年 … 4  15  三), or
// days written 115.8.12.
// A session's days as its paper's name gives them: 第22屆第1次定期會議事日程表(112.5.15-5.26).
export function nameSpan(name) {
  // (Or without dots, 羅東's 議事錄1150413-0415.)
  const m = String(name || '').match(/(?<![\d.])(1\d{2})\.(\d{1,2})\.(\d{1,2})\s*[-~～－]\s*(?:(1\d{2})\.)?(\d{1,2})\.(\d{1,2})(?![\d.])/) || String(name || '').match(/(?<!\d)(1\d{2})(\d{2})(\d{2})\s*[-~～－]\s*(1\d{2})?(\d{2})(\d{2})(?!\d)/);
  if (!m || +m[2] > 12 || +m[5] > 12) return null;
  const from = roc(m[1], m[2], m[3]);
  // (Its last day's year when it says one that fits, else the first's, or the next past December.)
  let to = roc(m[4] || m[1], m[5], m[6]);
  if (to < from) to = roc(+m[1] + (+m[5] < +m[2] ? 1 : 0), m[5], m[6]);
  return to < addMonths(from, 2) ? { from, to } : null;
}
const addMonths = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + n, +d.slice(8, 10))).toISOString().slice(0, 10);

export function pdfSpan(text) {
  const s = String(text || '').replace(/[ \t　]+/g, ' ');
  // (The 民國 year where it says so: a 臨時會 in December may be about next year's 115年度 budget.)
  const dotted = [...s.slice(0, 4000).matchAll(/(?<![\d.])(1\d{2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/g)].filter(m => +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31);
  if (dotted.length && !/月\s*\d{1,2}\s*日/.test(s.slice(0, 4000))) {
    const days = dotted.map(m => roc(m[1], m[2], m[3])).sort();
    return { from: days[0], to: days.at(-1) };
  }
  const y = +(s.match(/民國\s*(1\d{2})\s*年/) || s.match(/(1\d{2})\s*年(?!度)/) || [])[1];
  // (Every sitting's 時間 line in a 議事錄, 時間：民國 115 年 04 月 24 日 … 04 月 30 日、05 月 04 日: the session's days.)
  const lines = [...s.matchAll(/^\s*(?:[一二三四五六七八九十]+、\s*)?時\s*間\s*[：:][^\n]*月[^\n]*/gm)].map(m => m[0]);
  const line = (s.match(/時\s*間\s*[：:][^\n]*月[^\n]*/) || [])[0];
  // (Its 日程表's rows first, 05 月 04 日 一 1 代表報到, which a 議事錄 may open with ahead of its 時間 lines.)
  const head = s.slice(0, Math.min(8000, line ? s.indexOf(line) : 8000));
  const rows = [...head.matchAll(/^ ?\d{1,2} ?月 ?\d{1,2}(?!\d)(?: ?日)? +(?:[一二三四五六日] |[^\d\s])[^\n]*/gm)].map(m => m[0]);
  const src = rows.length > 1 ? rows.join('\n') : lines.length > 1 && y && within(spanIn(y, mds(lines.join('\n'))), 45) ? lines.join('\n') : line || s.slice(0, 4000);
  const ok = ([m, d]) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
  let ds = mds(src);
  // (A table with 月 and 日 as its heads: 4  15  三  1 代表報到…)
  if (!ds.length) ds = [...src.matchAll(/^\s*(\d{1,2})\s+(\d{1,2})\s+[一二三四五六日]\s/gm)].map(m => [+m[1], +m[2]]).filter(ok);
  if (!ds.length) return null;
  // (No year on it, 08 月 03 日 alone: its months and days, the year found from the sessions around it, `yearOf`.)
  if (!y) return { md: ds };
  return spanIn(y, ds);
}
// (Not a deadline in its notes: 如有提案請於 9 月 8 日前…)
const mds = src => [...src.matchAll(/(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})(?!\d)(?!\s*日?\s*以?前)\s*日?/g)].map(m => [+m[1], +m[2]]).filter(([m, d]) => m >= 1 && m <= 12 && d >= 1 && d <= 31);
const within = (span, days) => span && (Date.parse(span.to) - Date.parse(span.from)) / 864e5 <= days;
const spanIn = (y, ds) => {
  if (!ds.length) return null;
  const first = ds[0][0];
  // (A session over the new year: its January days in the next year.)
  const days = ds.map(([m, d]) => roc(m < first - 6 ? y + 1 : y, m, d)).sort();
  return { from: days[0], to: days.at(-1) };
};

// A session whose papers give no year: the year that puts it after the session of its kind numbered before it and
// before the one numbered after (臨時會 and 定期會 are each numbered in order).
export function yearOf(s, all) {
  const dated = all.filter(x => x.kind === s.kind && x.from && x !== s);
  const prev = dated.filter(x => x.no < s.no).sort((a, b) => b.no - a.no)[0];
  const next = dated.filter(x => x.no > s.no).sort((a, b) => a.no - b.no)[0];
  const base = +(prev || next)?.from.slice(0, 4);
  if (!base) return null;
  for (const y of [base, base + 1, base - 1]) {
    const span = spanIn(y - 1911, s.md);
    if ((!prev || span.from >= prev.from) && (!next || span.to <= next.from)) return span;
  }
  return null;
}

// A 公所 site's page (TSO): its title, its files and links ({ n, url }), the pages under it ({ id, n }), and its
// list's other pages.
export const TSO = 'https://www.chcg.gov.tw/TSO/';
export const tsoUrl = (dir, id) => `${TSO}${dir}/07other/main.aspx?main_id=${id}`;
export function tsoPage(html, url) {
  const s = String(html);
  const title = text((s.match(/<title>([\s\S]*?)<\/title>/) || [])[1]).split('-')[0].trim();
  const at = s.indexOf('id="hypAccesskeyC"');
  const end = s.indexOf('</form>', at);
  const body = at < 0 ? '' : s.slice(at, end > at ? end : undefined);
  const links = [];
  const kids = [];
  for (const [, href, inner] of body.matchAll(/<a [^>]*href=['"]\s*([^'"]+?)\s*['"][^>]*>([\s\S]*?)<\/a>/g)) {
    const n = text(inner).replace(/^下載\s*/, '').replace(/\s*[（(][\d.]+\s*[KMG]B[）)]\s*$/i, '').replace(/\.(pdf|docx?|odt)$/i, '').trim();
    let u;
    try {
      u = new URL(href.replace(/&amp;/g, '&'), url).href;
    } catch {
      continue;
    }
    const kid = u.match(/07other\/main\.aspx\?main_id=(\d+)$/);
    if (kid && n) kids.some(k => k.id === +kid[1]) || kids.push({ id: +kid[1], n });
    else if (/getFile\.aspx|\/files\/.+\.\w+$|drive\.google\.com\/(file|drive)|youtu/.test(u) && n && !links.some(l => l.url === u)) links.push({ n, url: u });
  }
  // (A long list's other pages: &page=2…)
  const more = [...new Set([...body.matchAll(/[?&;]page=(\d+)/g)].map(m => +m[1]).filter(n => n > 1))].sort((a, b) => a - b);
  return { title, links, kids, more };
}
export const folderOf = url => /drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(String(url));

// A list on the "Parser" CMS many 公所 sites run (鹿港's): its items ({ n, url }) and how many pages it has.
export const formUrl = (base, parser, pg = 0) => `${base}form/index?Parser=${parser}${pg ? `,,,,,,,,${pg}` : ''}`;
export function formList(html, base) {
  const links = [];
  for (const [, li] of String(html).matchAll(/<li class="list_date">([\s\S]*?)<\/li>/g)) {
    const [, href] = li.match(/href="([^"]+)"/) || [];
    if (!href || /^javascript/i.test(href)) continue;
    let url;
    try {
      url = new URL(href.replace(/&amp;/g, '&'), base).href;
    } catch {
      continue;
    }
    const n = text(li).replace(/^【[^】]*】\s*/, '').replace(/\s*\(另開視窗\)$/, '');
    if (n && !links.some(l => l.url === url)) links.push({ n, url });
  }
  const pages = +(String(html).match(/共\s*(\d+)\s*頁/) || [])[1] || 1;
  return { links, pages };
}

// A 代表會's posts on WordPress (its REST API): those whose titles have 屆第 in them, newest first.
export const wpUrl = (base, q, pg = 1) => `${base}wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&per_page=100&page=${pg}&_fields=date,title,content`;
const fileName = url => {
  try {
    return decodeURIComponent(url.split(/[?#]/)[0].split('/').pop()).replace(/\.\w+$/, '');
  } catch {
    return '';
  }
};
// A post: its title, its day and its files ({ n: the file's own name, url }); a 議事錄's cover (封面) left out.
export function wpPost(p) {
  const links = [];
  const pics = [];
  for (const [, href] of String(p?.content?.rendered || '').matchAll(/(?:href|src)="([^"]+)"/g)) {
    let url;
    try {
      url = new URL(href.replace(/&amp;/g, '&').replace(/\?_=\d+$/, '')).href;
    } catch {
      continue;
    }
    // (A post that is only a picture, 名間's 議程表: the picture.)
    if (/\/uploads\/.+\.(webp|jpe?g|png)$/i.test(url) && !pics.some(l => l.url === url)) pics.push({ n: fileName(url), url });
    if (!/\.(pdf|docx?|odt|mp3|m4a)$/i.test(url) && !/drive\.google\.com\/(file\/d\/|drive\/(u\/\d+\/)?folders\/)|youtu/.test(url)) continue;
    const n = fileName(url);
    if (/封面/.test(n) || links.some(l => l.url === url)) continue;
    links.push({ n, url });
  }
  return { title: text(p?.title?.rendered), date: String(p?.date || '').slice(0, 10), links: links.length ? links : pics.slice(0, 2) };
}
// A recording named by its month and day (22-8定期會10月19日錄音檔): that day, in the year of the post it's in.
export function wpDay(name, posted) {
  const m = String(name).match(/(\d{1,2})月(\d{1,2})日/);
  if (!m || !posted) return '';
  const y = +posted.slice(0, 4) - (+m[1] > +posted.slice(5, 7) + 1 ? 1 : 0);
  return `${y}-${pad(m[1])}-${pad(m[2])}`;
}

// A Joomla category's articles ({ n, url }): the links under its own path.
export function joomlaList(html, base, path) {
  const arts = [];
  for (const [, href, name] of String(html).matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]{2,80})<\/a>/g)) {
    if (!href.startsWith(`${path}/`)) continue;
    const url = new URL(href.replace(/&amp;/g, '&'), base).href;
    if (!arts.some(a => a.url === url)) arts.push({ n: text(name), url });
  }
  return arts;
}
// A Joomla article's files: its attachments, PDFs, Drive files, recordings ({ n, url }).
export function joomlaArticle(html, base) {
  const h = String(html);
  const i = h.indexOf('itemprop="articleBody"');
  if (i < 0) return [];
  const end = h.indexOf('</article>', i);
  const links = [];
  for (const [, href, name] of h.slice(i, end > 0 ? end : undefined).matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    let url;
    try {
      url = new URL(href.replace(/&amp;/g, '&'), base).href;
    } catch {
      continue;
    }
    if (!/\.(pdf|docx?|odt|mp3|m4a)$/i.test(url) && !/drive\.google\.com\/(file\/d\/|drive\/(u\/\d+\/)?folders\/)|youtu/.test(url)) continue;
    const n = text(name).replace(/\.\w{2,4}$/, '');
    const was = links.find(l => l.url === url);
    if (was) was.n ||= n;
    else links.push({ n, url });
  }
  return links.map(l => ({ n: l.n || fileName(l.url), url: l.url }));
}

// e-land's CCMS (宜蘭's 公所 and 代表會 sites, cp.aspx?n=…; 雲林's too): a page of file blocks
// (`file-download-multiple`: a title, then its files as Download.ashx?u=<the file's path in base64>), and recordings
// written into its text: a bold line naming a session (22屆第3次臨時會錄音), then a link a sitting named by its day
// (113.05.14A). Files: { n, url } with the file's own address (its kind in its name); audio: { head, n, url }.
export const ccmsFile = (href, base) => {
  let url;
  try {
    url = new URL(String(href).replace(/&amp;/g, '&'), base);
  } catch {
    return '';
  }
  const u = /Download\.ashx$/i.test(url.pathname) && url.searchParams.get('u');
  if (!u) return url.href;
  try {
    const path = atob(u);
    return /^\/[\x21-\x7e]+$/.test(path) ? new URL(path, url.origin).href : url.href;
  } catch {
    return url.href;
  }
};
export function ccmsPage(html, base) {
  const h = String(html);
  const files = [];
  // (Blocks may hold blocks, 相關檔案 around each paper's: each block's own files, up to the next block.)
  for (const chunk of h.split(/class="[^"]*file-download-multiple[^"]*"/).slice(1)) {
    // (A title that kept its file's ending, 第22屆第12次臨時會議事錄.doc: without it.)
    const hd = text((chunk.match(/<div class="hd">([\s\S]*?)<div class="ct">/) || [])[1]).replace(/\.(pdf|docx?|odt|mp3)$/i, '');
    const ct = chunk.slice(chunk.indexOf('<div class="ct">'));
    const got = new Map();
    for (const [a, href] of ct.slice(0, ct.indexOf('</ul>') + 1 || undefined).matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)) {
      const url = ccmsFile(href, base);
      // (Its file's name: [另開新視窗]0327●第22屆第2次定期會會議紀錄.pdf.)
      // (員山's 2201定期會會議紀錄: the term and the session in four digits.)
      const t = ((a.match(/title="([^"]*)"/) || [])[1] || '').replace(/\[另開新視窗\]/g, '').replace(/\.\w{2,4}$/, '').replace(/^(\d{2})(\d{2})(?=(定期|臨時)會)/, (_, t, n) => `第${t}屆第${+n}次`).replace(/^[\d\s\-_.●]+(?=\D)/, '').trim();
      if (url && !/^javascript/i.test(href)) (got.get(t) || got.set(t, []).get(t)).push(url);
    }
    // (A block titled by its paper: that paper, in one format or more, its PDF; 相關檔案: each file by its own name.)
    const one = hd && !/^(相關檔案|附件)/.test(hd);
    for (const [t, urls] of one && got.size ? [[hd, [...got.values()].flat()]] : got) {
      const n = (t || hd).replace(/^(\d{2})(\d{2})(?=(定期|臨時)會)/, (_, t, n) => `第${t}屆第${+n}次`);
      const url = urls.find(u => /\.pdf$/i.test(u)) || urls[0];
      if (n && url) files.push({ n, url });
    }
  }
  const audio = [];
  let head = '';
  for (const [, p] of h.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)) {
    const as = [...p.matchAll(/<a [^>]*href="([^"]+\.(?:mp3|m4a|wav))"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const a of as) audio.push({ head, n: text(a[2]) || (a[0].match(/title="([^"]*)"/) || [])[1] || '', url: ccmsFile(a[1], base) });
    // (A session's recording on Drive, named by its session: 礁溪's 第22屆第八次定期會錄音檔.)
    for (const [, href, name] of p.matchAll(/<a [^>]*href="(https:\/\/drive\.google\.com\/file\/d\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) audio.push({ head: text(name).replace(/\s+/g, ''), n: text(name), url: href.replace(/&amp;/g, '&') });
    if (!as.length && /錄音/.test(text(p))) head = text(p).replace(/\s+/g, '');
  }
  return { files, audio };
}
// A CCMS list of posts (News.aspx: 礁溪's 臨時會 minutes, a post a session): { n, url } of each post.
export function ccmsNews(html, base) {
  const out = [];
  for (const [, href, title] of String(html).matchAll(/<a [^>]*href="(News_Content\.aspx\?[^"]+)"[^>]*title="([^"]*)"/g)) {
    const url = new URL(href.replace(/&amp;/g, '&'), base).href;
    if (!out.some(o => o.url === url)) out.push({ n: title.replace(/\[另開新視窗\]/g, '').trim(), url });
  }
  return out;
}

// A 代表會's own site on the "boxlists" CMS (宜蘭's 壯圍: juanwei.e-land.gov.tw/boxlists?menu_id=14): a list a kind,
// each line its day and a link, 【會議記錄】 and the paper's name, either the file itself (/uploads/boxlists/…) or a
// page of files (/boxlists/1105: 議事錄 and its sittings' recordings, 20260915.WAV); ?page=2… ({ links, pages }).
export function boxList(html, base) {
  const h = String(html);
  const links = [];
  for (const [, href, name] of h.matchAll(/<a href="(\/(?:uploads\/boxlists?\/[^"]+|boxlists\/\d+[^"]*))"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = new URL(href.replace(/&amp;/g, '&'), base).href;
    const n = text(name).replace(/^【[^】]*】\s*/, '');
    if (n && !links.some(l => l.url === url)) links.push({ n, url, files: /\/boxlists\/\d+/.test(href) });
  }
  const pages = Math.max(1, ...[...h.matchAll(/[?&;]page=(\d+)/g)].map(m => +m[1]));
  return { links, pages };
}
// A boxlists page's files ({ n, url }): its 相關附件.
export function boxFiles(html, base) {
  const h = String(html);
  const i = h.indexOf('相關附件');
  if (i < 0) return [];
  const end = h.indexOf('回上頁', i);
  return [...h.slice(i, end > 0 ? end : undefined).matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, href, name]) => ({ n: text(name).replace(/\.\w{2,4}$/, ''), url: new URL(href.replace(/&amp;/g, '&'), base).href }));
}
// A recording's file named by its day as the West writes it (20260511112647, 20260915, 20251007第一日): that day as
// the sites write it, 1150511 (and the rest of its name).
export const westDay = name => {
  const m = String(name).match(/^(20\d{2})(\d{2})(\d{2})(?:\d{6})?(?!\d)(.*)$/);
  return m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? `${+m[1] - 1911}${m[2]}${m[3]}${m[4]}` : '';
};

// A plain site's page of files (羅東's own record.html): every link to a paper or a recording ({ n, url }), named by
// its text when that names a session, else by its file (羅東鎮民代表會第22屆第1次定期會議事錄.pdf); a video on
// YouTube (recorder.html: 1150511開議) by the heading over it naming its session (第22屆第7次定期會影音檔).
export const ytId = url => (String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|embed\/))([\w-]{11})/) || [])[1] || '';
export function linkFiles(html, base) {
  const out = [];
  let head = '';
  for (const [, hx, href, name] of String(html).matchAll(/<h[1-4][^>]*>((?:(?!<a |<\/h)[\s\S])*?)<\/h[1-4]>|<a [^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    // (A heading over several, 第22屆第16-19次臨時會影音檔: its first; each video then goes to the session its day is in.)
    if (hx !== undefined) {
      const t = text(hx).replace(/\s+/g, '').replace(/第(\d+)[-~～]\d+次/, '第$1次');
      if (sessionOf(t)) head = t;
      continue;
    }
    if (!href) continue;
    let url;
    try {
      url = new URL(href.replace(/&amp;/g, '&'), base).href;
    } catch {
      continue;
    }
    const yt = ytId(url);
    if (!yt && !/\.(pdf|docx?|odt|mp3|m4a|wav)$/i.test(url.split(/[?#]/)[0]) && !/drive\.google\.com\/file\/d\//.test(url)) continue;
    const t = text(name);
    const n = sessionOf(t) ? t : yt ? (head ? `${head} ${t}` : '') : fileName(url) || t;
    if (n && !out.some(o => o.url === url)) out.push({ n, url });
  }
  return out;
}
// A plain site's other pages to read with it (羅東's recorder22_1140825-1141217.html), by a pattern of their names.
export const pageMore = (html, base, re) => [...new Set([...String(html).matchAll(/href="([^"#]+)"/g)].map(m => m[1]).filter(u => new RegExp(re).test(u)).map(u => new URL(u.replace(/&amp;/g, '&'), base).href))];
