// 預告: the step before a bill — a ministry posts its draft amendment on
// join.gov.tw (公共政策網路參與平臺) for comment, usually 14–60 days, before
// 行政院 sends it to 立法院. Fetched at build time (the site sends no CORS
// header) and kept only when the draft names a law this app has.

export const NOTICES_URL = 'https://join.gov.tw/policies/search?page=1&size=200&type=nonfinish&sort=publishDate,desc';
export const KEEP_DAYS = 365;
export const noticeUrl = id => `https://join.gov.tw/policies/detail/${id}`;

// Epoch ms → the Taiwan day, YYYY-MM-DD.
export const twDay = ms => (ms ? new Date(Number(ms) + 8 * 3600e3).toISOString().slice(0, 10) : '');

// The laws a notice's title names in 「」: pcodes of those the index knows.
export function lawsOfNotice(title, names) {
  const out = [];
  for (const m of String(title).matchAll(/「([^」]+)」/g)) {
    const p = names.get(m[1].trim());
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

// A join.gov.tw record made small, or null when it names none of our laws:
// { id, t (title less the agency), gov, from, to, laws, kind: 'amend'|'repeal'|'new' }.
export function compactNotice(r, names) {
  const title = String(r.policyTitle || '').trim();
  const laws = lawsOfNotice(title, names);
  if (!r.policyUid || !laws.length) return null;
  const cut = title.match(/^(.+?)公告[：:]\s*(.+)$/);
  const t = cut ? cut[2] : title;
  return { id: r.policyUid, t, gov: r.pubGovName || (cut ? cut[1] : ''), from: twDay(r.publishDate), to: twDay(r.offlineDate), laws, kind: /預告廢止/.test(t) ? 'repeal' : /預告(?:訂定|制定)/.test(t) ? 'new' : 'amend' };
}

// The kept list: fresh ones over last build's, a year back by the comment
// period's end, newest first.
export function mergeNotices(prev, fresh, now = new Date(), days = KEEP_DAYS) {
  const cutoff = twDay(now.getTime() - days * 864e5);
  const by = new Map();
  for (const n of [...fresh, ...(prev || [])]) if (n?.id && !by.has(n.id) && n.to >= cutoff) by.set(n.id, n);
  return [...by.values()].sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
}

// Still open for comment on `day` (YYYY-MM-DD, Taiwan).
export const isOpen = (n, day) => n.to >= day;
