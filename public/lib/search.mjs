// Finding a law: by its name, a short name people use (民訴, 勞基法), or the
// characters of one in order (個資 → 個人資料保護法); and a jump straight to
// an article (民法184, 刑法第十條之一, 勞基法 24-1).
import { SHORT_NAMES, cnNumber } from './refs.mjs';

const subseq = (q, s) => {
  let i = 0;
  for (const ch of s) if (ch === q[i] && ++i === q.length) return true;
  return false;
};
// The characters in order from the name's start, close together: 性平 in
// 性別平等教育法, 公投 in 公民投票法 (not 公司國外投資…).
const tight = (q, s) => {
  const c = [...q], n = [...s];
  if (n[0] !== c[0]) return false;
  let i = 0, at = 0;
  for (let j = 0; j < n.length && i < c.length; j++) if (n[j] === c[i]) (i++, (at = j));
  return i === c.length && at < c.length * 2;
};
const enMatch = (name, query) => {
  const n = name.toLowerCase(), q = String(query).trim().toLowerCase().replace(/\s+/g, ' ');
  return q.length < 3 ? -1 : n === q ? 0 : n.startsWith(q) ? 2 : n.includes(q) ? 3 : -1;
};
const tidy = q => String(q || '').replace(/[\s　「」『』]/g, '');

// Names people type for a law besides its own (search only; links and
// chips keep refs.mjs's SHORT_NAMES): every 簡稱 there, and a few more in
// everyday use.
export const ALIASES = {
  ...SHORT_NAMES,
  增修條文: '中華民國憲法增修條文',
  憲法增修: '中華民國憲法增修條文',
  刑法施行法: '中華民國刑法施行法',
  公投法: '公民投票法',
  健保法: '全民健康保險法',
  選罷法: '公職人員選舉罷免法',
  國安法: '國家安全法',
  家暴法: '家庭暴力防治法',
  性騷法: '性騷擾防治法',
  跟騷法: '跟蹤騷擾防制法',
  兩岸條例: '臺灣地區與大陸地區人民關係條例',
  食安法: '食品安全衛生管理法',
  公寓條例: '公寓大廈管理條例',
  國民法官: '國民法官法',
  貪污條例: '貪污治罪條例',
  組織犯罪條例: '組織犯罪防制條例',
  移民法: '入出國及移民法',
  營業稅法: '加值型及非加值型營業稅法',
  遺贈稅法: '遺產及贈與稅法',
  立院職權法: '立法院職權行使法',
  通保法: '通訊保障及監察法',
  資安法: '資通安全管理法',
  傳染病法: '傳染病防治法'
};
const ALIAS_KEYS = Object.keys(ALIASES);
const core = n => n.replace(/^中華民國/, '');
// 憲法 first, then 法律, then 命令; a law people name by a short name is
// one people look for (憲法訴訟法 before 憲法實施之準備程序).
const LEVEL = { 憲法: 0, 法律: 0.1, 命令: 0.5 };
const POPULAR = new Set(Object.values(ALIASES));

// How well each row's name answers the query, lower is better:
//   0 the name · 1 a short name, or 中華民國 + it (刑法, 憲法) · 1.5 the start of
//   a short name (勞基 → 勞基法, 憲法增 → 憲法增修條文) · 2 the name starts with it
//   (中華民國 left off: 憲法 → 憲法增修條文) · 3 in the name · 4 its characters
//   in order, near the start 3.5 (性平 → 性別平等教育法), anywhere 4.
// Then laws in force, 憲法 · 法律 · 命令, the ones with a short name, shorter.
// rows: the index's [p, n, l, c, m, abandoned, en, …]. → [[score, row], …] best first.
export function rankLaws(rows, query, limit = 50) {
  const q = tidy(query);
  if (!q) return [];
  const full = ALIASES[q];
  const two = [...q].length >= 2;
  // (兒少 starts 兒少法 and 兒少性剝削條例: the shortest short name is the one meant.)
  const partOf = new Map();
  if (two) for (const k of ALIAS_KEYS.filter(k => k !== q && k.startsWith(q)).sort((a, b) => a.length - b.length)) if (!partOf.has(ALIASES[k])) partOf.set(ALIASES[k], partOf.size ? 1.6 : 1.5);
  const scored = [];
  for (const r of rows) {
    const n = r[1];
    let s = n === q ? 0 : n === full || n === `中華民國${q}` ? 1 : partOf.has(n) ? partOf.get(n) : core(n).startsWith(q) || n.startsWith(q) ? 2 : n.includes(q) ? 3 : two && subseq(q, n) ? (tight(q, core(n)) ? 3.5 : 4) : -1;
    // An English name (index [6]), words in any case: 'civil code', 'labor'.
    if (s < 0 && typeof r[6] === 'string' && /[a-z]/i.test(q)) s = enMatch(r[6], query);
    if (s < 0) continue;
    const order = s + (r[5] ? 10 : 0) + (LEVEL[r[2]] ?? 0.3) - (POPULAR.has(n) ? 0.2 : 0);
    scored.push([order, core(n).length, s, r]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[3][1] < b[3][1] ? -1 : 1));
  return scored.slice(0, limit).map(x => [x[2], x[3]]);
}

export function searchLaws(rows, query, limit = 50) {
  return rankLaws(rows, query, limit).map(x => x[1]);
}

// The law a query names outright (預算法, 刑法 → 中華民國刑法, 憲法 → 中華民國憲法),
// in force, or null: shown on its own above the articles that only cite it.
export function exactLaw(rows, query) {
  const q = tidy(query);
  if (!q) return null;
  const names = [q, ALIASES[q], `中華民國${q}`];
  let best = null;
  for (const r of rows) {
    const i = names.indexOf(r[1]);
    if (i < 0 || r[5]) continue;
    const s = i + (r[2] === '命令' ? 3 : 0);
    if (!best || s < best[0]) best = [s, r];
  }
  return best && best[1];
}

// The law a query can only mean, though not named in full: the start of a
// short name (勞基 → 勞動基準法, 道交 → 道路交通管理處罰條例), or the one law
// or 命令 in force whose name holds it (憲法增 → 中華民國憲法增修條文, 地方制度
// → 地方制度法). Else null (勞動 is the start of many).
export function likelyLaw(rows, query) {
  const exact = exactLaw(rows, query);
  if (exact) return exact;
  if ([...tidy(query)].length < 2) return null;
  const ranked = rankLaws(rows, query, 400).filter(([, r]) => !r[5]);
  if (!ranked.length) return null;
  const [[s, top]] = ranked;
  if (s <= 1.5) return top;
  const named = ranked.filter(([x]) => x <= 3);
  return named.length === 1 ? top : null;
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
