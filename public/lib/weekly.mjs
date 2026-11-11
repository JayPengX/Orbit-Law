// 你追蹤的法案週報: what code does around the one AI step (the proxy's law-weekly,
// Orbit-Core law-ai.js, run once a night by scripts/build-weekly.mjs and shared).
//   weekSince(now)            the week's first day (Taiwan's), 'YYYY-MM-DD'
//   weekPicks(items, changes) the bills that moved and the laws just amended this week
//   artBits(diff)             a law's changed articles as short "what's new" bits, for the AI
//   weekInput(picks, diffs)   the AI's input, a batch at a time
//   weekOf(mine, …)           the 我的 tab's 這一週: what you follow that moved, each with its line
import { today } from './store.mjs';

export const WEEK_DAYS = 7;
export const WEEK_BATCH = 40;
// Rules no one reads for what they change (a unit's staff table, its own office rules).
const PLUMBING = /編制表|編組表|組織規程|處務規程|辦事細則|組織準則|員額/;

const dayStr = d => d.toISOString().slice(0, 10);
export const weekSince = (now = Date.now()) => dayStr(new Date(Number(now) + 8 * 3600e3 - WEEK_DAYS * 864e5));

// The bills whose 最新進度日期 came this week (never a day still to come), the
// laws first seen amended this week; a bill once (by its key), a law by its version.
export function weekPicks(items, changes, now = Date.now()) {
  const since = weekSince(now), to = today(new Date(now));
  const bills = (items || []).filter(it => it?.k && it.u >= since && it.u <= to && !it.dropped && (it.about || it.pr?.about));
  const laws = (changes?.items || []).filter(c => c?.p && c.m && c.seen >= since && !PLUMBING.test(c.n || ''));
  return { bills, laws };
}
export const lawId = c => `${c.p}@${c.m}`;

// What changed inside an article: its words compared character by character
// (the longest common run), each change shown with a few words before it,
// 【the new words】 and （原：what they replaced）, or 【刪去：words taken out】; three at most.
function hunks(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0, cur = null;
  const close = () => cur && (out.push(cur), (cur = null));
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      // (A run of four or fewer between two changes joins them.)
      let k = 0;
      while (i + k < n && j + k < m && a[i + k] === b[j + k]) k++;
      if (cur && k <= 4 && i + k < n + 1 && (i + k < n || j + k < m)) ((cur.was += a.slice(i, i + k)), (cur.now += b.slice(j, j + k)));
      else close();
      i += k;
      j += k;
    } else {
      cur ||= { at: j, was: '', now: '' };
      if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) cur.now += b[j++];
      else cur.was += a[i++];
    }
  }
  close();
  return out;
}
const cut = (t, n) => (t.length > n ? `${t.slice(0, n)}…` : t);
function partOf(oldT, newT) {
  const a = String(oldT || '').replace(/\s+/g, ''), b = String(newT || '').replace(/\s+/g, '');
  if (!a) return cut(b, 240);
  if (!b) return `刪除：${cut(a, 200)}`;
  if (a.length * b.length > 4e6) return cut(b, 240);
  return hunks(a, b)
    .slice(0, 3)
    .map(h => `…${b.slice(Math.max(0, h.at - 10), h.at)}${h.now ? `【${cut(h.now, 70)}】${h.was ? `（原：${cut(h.was, 40)}）` : ''}` : `【刪去：${cut(h.was, 40)}】`}`)
    .join('')
    .slice(0, 250);
}
// data/diff/<p>.json's { arts: { key: [old, new] } } (lib/data.mjs diffTexts) → '第10條：…【new】（原：old）', six at most.
export function artBits(diff) {
  return Object.entries(diff?.arts || {})
    .slice(0, 6)
    .map(([k, [was, now] = []]) => `第${k}條：${partOf(was, now)}`)
    .filter(s => s.length > 6);
}

// The AI's items: a bill by its stated purpose, a law by what its articles now say.
export function weekInput({ bills = [], laws = [] }, diffs = new Map()) {
  return [
    ...bills.map(it => ({ id: it.k, kind: 'bill', name: it.n, about: String(it.about || it.pr?.about || '').slice(0, 320), arts: [] })),
    ...laws.map(c => ({ id: lawId(c), kind: 'law', name: c.n, about: '', arts: artBits(diffs.get(c.p)) }))
  ].filter(x => x.about || x.arts.length);
}

// 這一週 on 我的: the followed bills that moved this week and the followed laws
// amended this week, each with the night's line (or nothing: the row's own words stand).
export function weekOf(mine, items, changes, weekly, now = Date.now()) {
  const { bills } = weekPicks(items, changes, now);
  const since = weekSince(now);
  const lines = weekly?.lines || {};
  return [
    ...(changes?.items || []).filter(c => mine?.laws?.[c.p] && c.seen >= since).map(c => ({ kind: 'law', c, line: lines[lawId(c)] || '' })),
    ...bills.filter(it => mine?.items?.[it.k]).sort((a, b) => (a.u < b.u ? 1 : -1)).map(it => ({ kind: 'bill', it, line: lines[it.k] || '' }))
  ];
}
