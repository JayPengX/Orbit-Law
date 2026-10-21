// 預告: the step before a bill — a ministry posts its draft amendment on
// join.gov.tw (公共政策網路參與平臺) for comment, usually 14–60 days, before
// 行政院 sends it to 立法院. Fetched at build time (the site sends no CORS
// header) and kept only when the draft names a law this app has.

// type: nonfinish (open now) or history (closed), newest first, 200 a page.
export const noticesUrl = (type = 'nonfinish', page = 1) => `https://join.gov.tw/policies/search?page=${page}&size=200&type=${type}&sort=publishDate,desc`;
// About one 立法院 term: a draft's 預告 step stays on its bill's timeline.
export const KEEP_DAYS = 4 * 365;
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
  return { id: r.policyUid, t, gov: r.pubGovName || (cut ? cut[1] : '') || r.undertakeGov || '', from: twDay(r.publishDate), to: twDay(r.offlineDate), laws, kind: /預告廢止/.test(t) ? 'repeal' : /預告(?:訂定|制定)/.test(t) ? 'new' : 'amend' };
}

// The kept list: fresh ones over last build's, a year back by the comment
// period's end, newest first.
export function mergeNotices(prev, fresh, now = new Date(), days = KEEP_DAYS) {
  const cutoff = twDay(now.getTime() - days * 864e5);
  const by = new Map();
  for (const n of [...fresh, ...(prev || [])]) if (n?.id && !by.has(n.id) && n.to >= cutoff) by.set(n.id, n);
  return [...by.values()].sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
}

// The 預告 that led to a round of bills: the latest draft of the law posted
// on or before the round's first proposal, within two years of it.
export function noticeBefore(notices, proposed) {
  if (!proposed) return null;
  const earliest = `${Number(proposed.slice(0, 4)) - 2}${proposed.slice(4)}`;
  return (notices || []).filter(n => n.from && n.from <= proposed && n.from >= earliest).sort((a, b) => (a.from < b.from ? 1 : -1))[0] || null;
}

// Still open for comment on `day` (YYYY-MM-DD, Taiwan).
export const isOpen = (n, day) => n.to >= day;

// ---- A draft's own words: the 行政院公報 PDF join.gov.tw posts with it ----
// (公告, then 總說明 — why and what — then the 條文對照表: the draft's
// text, today's text and the reason, article by article). Read at build
// time with poppler's `pdftotext -bbox` (each word with its box), so the
// table's columns come from where its words sit on the page.

const ARTICLE = /^第[一二三四五六七八九十百零〇\d]+條(之[一二三四五六七八九十\d]+)?/;
const PAGE_HEAD = /^行政院公報$|^第\d+卷$|^第\d+期$|^\d{8}$|篇$/;
const joinLines = lines => lines.map(s => s.trim()).filter(Boolean).reduce((s, l) => (s && /^([一二三四五六七八九十]+、|（[一二三四五六七八九十]+）|\(\d+\)|\d+\.)/.test(l) ? `${s}\n${l}` : s + l), '');

// The words of `pdftotext -bbox` as [{ page, x0, y0, x1, t }].
export function bboxWords(xhtml) {
  const words = [];
  let page = -1;
  for (const m of String(xhtml).matchAll(/<page\b|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)) {
    if (m[0] === '<page') page++;
    else words.push({ page, x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), t: m[4].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") });
  }
  return words;
}

// Words into lines: same page, same baseline (within 3pt), left to right.
function linesOf(words) {
  const lines = [];
  for (const w of [...words].sort((a, b) => a.page - b.page || a.y0 - b.y0 || a.x0 - b.x0)) {
    const l = lines.at(-1);
    if (l && l.page === w.page && Math.abs(l.y - w.y0) < 3) l.words.push(w);
    else lines.push({ page: w.page, y: w.y0, words: [w] });
  }
  for (const l of lines) l.text = l.words.map(w => w.t).join('');
  // (Running heads and page numbers out.)
  return lines.filter(l => !l.words.every(w => PAGE_HEAD.test(w.t)) && !l.words.every(w => /^[\d\s\-－—]+$/.test(w.t)));
}

// What a draft says about itself: its 總說明 (why, in the agency's words)
// and its 對照表 rows [{ a: article, now: draft text, old: today's text, why }].
// For a new rule (訂定) the table has no 現行條文 and `old` is ''.
export function readDraft(words) {
  const lines = linesOf(words);
  const at = re => lines.findIndex(l => re.test(l.text));
  const sum = at(/總說明$/);
  const tab = at(/對照表$/);
  const about = sum >= 0 ? joinLines(lines.slice(sum + 1, tab > sum ? tab : undefined).filter(l => !/草$/.test(l.text) || l.words.length > 1).map(l => l.text)).replace(/^案總說明/, '') : '';
  const rows = [];
  if (tab >= 0) {
    // Columns from the header's words (修正條文 / 增訂條文 / 條文, 現行條文, 說明): a word belongs where its centre falls.
    const head = lines.slice(tab, tab + 4).find(l => l.words.some(w => /^說\s*明$/.test(w.t)));
    if (head) {
      const cols = head.words.map(w => (w.x0 + w.x1) / 2);
      const bound = cols.slice(1).map((c, i) => (c + cols[i]) / 2);
      const colOf = w => bound.filter(b => (w.x0 + w.x1) / 2 > b).length;
      const n = cols.length;
      const body = lines.slice(lines.indexOf(head) + 1).filter(l => !(l.words.some(w => /^說\s*明$/.test(w.t)) && l.words.length <= n) && !/對照表$/.test(l.text));
      const left = Math.min(...body.flatMap(l => l.words.filter(w => colOf(w) === 0).map(w => w.x0)));
      let row = null;
      for (const l of body) {
        const first = l.words.filter(w => colOf(w) === 0);
        const starts = first.length && first[0].x0 - left < 4 && ARTICLE.test(first[0].t);
        if (starts) rows.push((row = { a: first[0].t.match(ARTICLE)[0], cells: Array.from({ length: n }, () => []) }));
        if (!row) continue;
        for (let c = 0; c < n; c++) {
          const t = l.words.filter(w => colOf(w) === c).map(w => w.t).join('');
          if (t) row.cells[c].push(t);
        }
      }
      for (const r of rows) {
        const [now, old, why] = n >= 3 ? r.cells.map(joinLines) : [joinLines(r.cells[0]), '', joinLines(r.cells[1] || [])];
        const bare = t => t.replace(ARTICLE, '').trim();
        Object.assign(r, { now: bare(now), old: bare(old), why });
        delete r.cells;
      }
    }
  }
  return { about, rows };
}

// A draft's purpose in a line, from its 總說明: the "為…" clause before
// "爰擬具…" (what the agency wants), else its last sentence; at most `max` chars.
export function draftWhy(about, max = 90) {
  const s = String(about || '').replace(/\s+/g, '').replace(/，{2,}/g, '，');
  const sentences = s.split(/(?<=。)/).filter(Boolean);
  const key = sentences.find(x => /爰/.test(x));
  let t = key ? key.split('爰')[0] : sentences.at(-1) || '';
  t = t.replace(/^(另|又|並|現|因此|是以|故)，?/, '').replace(/^本次修正(係|為|乃)?/, '').replace(/[，,。]+$/, '');
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
