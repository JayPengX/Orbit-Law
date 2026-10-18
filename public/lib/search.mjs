// Finding a law: by its name, a short name people use (民訴, 勞基法), or the
// characters of one in order (個資 → 個人資料保護法); and a jump straight to
// an article (民法184, 刑法第十條之一, 勞基法 24-1).
import { SHORT_NAMES, cnNumber } from './refs.mjs';

const subseq = (q, s) => {
  let i = 0;
  for (const ch of s) if (ch === q[i] && ++i === q.length) return true;
  return false;
};
const enMatch = (name, query) => {
  const n = name.toLowerCase(), q = String(query).trim().toLowerCase().replace(/\s+/g, ' ');
  return q.length < 3 ? -1 : n === q ? 0 : n.startsWith(q) ? 2 : n.includes(q) ? 3 : -1;
};
const tidy = q => String(q || '').replace(/[\s　「」『』]/g, '');

// rows: the index's [p, n, l, c, m, abandoned, …]. Best first: exact, short
// name, start, inside, in order; then laws in force, 憲法 and 法律, short names.
export function searchLaws(rows, query, limit = 50) {
  const q = tidy(query);
  if (!q) return [];
  const full = SHORT_NAMES[q];
  const scored = [];
  for (const r of rows) {
    const n = r[1];
    let s = n === q ? 0 : n === full ? 1 : n.startsWith(q) ? 2 : n.includes(q) ? 3 : q.length >= 2 && subseq(q, n) ? 4 : -1;
    // An English name (index [6]), words in any case: 'civil code', 'labor'.
    if (s < 0 && typeof r[6] === 'string' && /[a-z]/i.test(q)) s = enMatch(r[6], query);
    if (s < 0) continue;
    scored.push([s + (r[5] ? 10 : 0), n.length, r]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(x => x[2]);
}

// '民法184', '刑法第十條之一', '勞基法 24-1' → { row, key } (the law the name
// finds best, the article key), or null.
export function parseJump(rows, query) {
  const q = tidy(query);
  const m = q.match(/^(.+?)第?([0-9零〇一二三四五六七八九十百千]+)(?:條)?(?:(?:之|-)([0-9零〇一二三四五六七八九十]+))?條?$/);
  if (!m) return null;
  const n = cnNumber(m[2]);
  const sub = m[3] ? cnNumber(m[3]) : 0;
  if (!(n > 0) || (m[3] && !(sub > 0))) return null;
  const [row] = searchLaws(rows, m[1], 1);
  return row ? { row, key: sub ? `${n}-${sub}` : String(n) } : null;
}

// 異動日期 20260817 → 2026/08/17 (or 115/08/17 民國, as Taiwan writes it).
export function ymd(s, { roc = false } = {}) {
  const m = String(s || '').match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!m) return '';
  return `${roc ? Number(m[1]) - 1911 : m[1]}/${m[2]}/${m[3]}`;
}

// A 編/章/節 heading's depth (0 編 … 4 目), for the contents.
export function headingDepth(title) {
  const m = String(title).match(/第\s*[0-9零一二三四五六七八九十百]+\s*(?:之\s*[0-9一二三四五六七八九十]+\s*)?([編章節款目])/);
  return m ? '編章節款目'.indexOf(m[1]) : 1;
}

// A law's own family by name: its 施行法 and 施行細則 (names that start
// with it), and from those, the law they carry out. Repealed ones left out.
export function relatedLaws(rows, row, limit = 12) {
  const name = row[1];
  let base = name.replace(/(施行細則|施行法|施行條例)$/, '');
  // 民法親屬編施行法 carries out 民法 (its 編 is no law of its own).
  if (base !== name && !rows.some(r => r[1] === base)) base = base.replace(/(總則|[^法律]{1,3}編)$/, '');
  return rows
    .filter(r => r[0] !== row[0] && !r[5] && (r[1] === base || (r[1].startsWith(base) && r[1].length > base.length)))
    .sort((a, b) => (a[1] === base ? -1 : b[1] === base ? 1 : a[1].length - b[1].length || (a[1] < b[1] ? -1 : 1)))
    .slice(0, limit);
}
