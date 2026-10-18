// 政府公告: ministries' notices and news from their RSS feeds (勞動部 公布欄,
// 行政院 院會決議…), kept so the AI can quote exact figures (最低工資) with
// the source. Built nightly (scripts/build-news.mjs → data/ai/news.json);
// a feed keeps only its latest items, so each night's are merged in.
export const KEEP_DAYS = 3 * 365;
export const TEXT_MAX = 300;
// At most this many kept (newest first): the AI Worker reads the whole file.
export const KEEP_MAX = 3000;

const strip = s =>
  String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const tag = (x, t) => (x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';
const day = s => {
  const d = new Date(strip(s));
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() + 8 * 36e5).toISOString().slice(0, 10);
};

// An RSS feed's items: [date YYYY-MM-DD (Taiwan), agency, title, url, text].
export function parseFeed(xml, agency) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, x]) => {
      const text = strip(tag(x, 'description'));
      return [day(tag(x, 'pubDate')), agency, strip(tag(x, 'title')), strip(tag(x, 'link')), text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text];
    })
    // (Daily press digests say nothing on their own.)
    .filter(r => r[2] && r[3] && !/每日新聞|新聞輿情/.test(r[2]));
}

// The kept list: newest first, one per url, older than `days` dropped.
export function mergeNews(prev, fresh, now = new Date(), days = KEEP_DAYS) {
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10);
  const by = new Map();
  for (const r of [...fresh, ...(prev || [])]) if (!by.has(r[3]) && (!r[0] || r[0] >= cutoff)) by.set(r[3], r);
  return [...by.values()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).slice(0, KEEP_MAX);
}

// The notices that best match a question: shared two-character pieces,
// the title counting double, newer first on a tie. (The AI Worker does the same.)
const SAME = [['基本工資', '最低工資'], ['時薪', '每小時工資'], ['月薪', '每月工資']];
const pairs = s => {
  const t = String(s).replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};
export function matchNews(items, q, n = 5) {
  let query = String(q);
  for (const group of SAME) if (group.some(w => query.includes(w))) query += group.join('');
  const want = pairs(query);
  if (!want.size) return [];
  const score = r => {
    let s = 0;
    for (const p of pairs(r[2])) if (want.has(p)) s += 2;
    for (const p of pairs(r[4])) if (want.has(p)) s += 0.25;
    return s;
  };
  return items
    .map(r => [score(r), r])
    .filter(([s]) => s >= 4)
    .sort((a, b) => b[0] - a[0] || (a[1][0] < b[1][0] ? 1 : -1))
    .slice(0, n)
    .map(([, r]) => r);
}
