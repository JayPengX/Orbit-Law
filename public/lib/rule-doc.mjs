// A rule read off an agency's or a city's site, made into the shape a law has
// (data/law/<pcode>.json: { p, n, l, c, m, a: [['C', '', heading] | ['A', key, text]] }),
// so the one reader draws every kind the same way: its 目錄, each 條 or 點 with
// its number, every reference a link, find in it, ☆, 繼續閱讀, 修了什麼.
// The sites hand us text in every shape (第一條 on its own line, 第一條 and its
// text on one line, a 要點's 一、二、 run together in one block, lines wrapped
// at a fixed width); textBlocks (view.mjs) reads them, and this hangs its
// blocks into parts. A text with neither 條 nor 點 stays one block ('T').
import { textBlocks } from './view.mjs';
import { cnNumber } from './refs.mjs';
import { ruleParts } from './kinds.mjs';

const ART = /^第\s*([一二三四五六七八九十百千零〇0-9０-９]+)\s*[條点點](?:\s*之\s*([一二三四五六七八九十0-9０-９]+))?/;
const HEAD = /^第\s*[一二三四五六七八九十百0-9０-９]+\s*[編章節款目](?:[\s　]|$)/;
const wide = s => String(s).replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xff10));
const num = s => cnNumber(wide(s).replace(/\s+/g, ''));

// 第三條之一 → '3-1'; 第 12 條 → '12'.
export function partKey(no) {
  const m = String(no || '').replace(/\s+/g, '').match(ART);
  if (!m) return '';
  const a = num(m[1]);
  if (!(a > 0)) return '';
  const b = m[2] ? num(m[2]) : 0;
  return b > 0 ? `${a}-${b}` : String(a);
}

// A one-blob text (some sites give every 條 in one line: …。第二條 …): each 第X條 after a 。 starts a line.
function lineArticles(t) {
  return String(t || '').replace(/(?<=[。；」])[\s　]*(?=第\s*[一二三四五六七八九十百0-9０-９]+\s*條(?:之[一二三四五六七八九十0-9]+)?[\s　]*[^\s　，。、之第]{2})/g, '\n');
}
// Fixed-width lines (臺中's: 第一條 then 20 spaces, then the text; a wrapped 。 on its own line).
const OWN_LINE = /^[\s　]*第\s*[一二三四五六七八九十百0-9０-９]+\s*條(?:之[一二三四五六七八九十0-9]+)?[\s　]*$/gm;
function tidy(t) {
  let s = String(t || '')
    .replace(/\r/g, '')
    .replace(/^[\s　]*(第\s*[一二三四五六七八九十百0-9０-９]+\s*條(?:之[一二三四五六七八九十0-9]+)?)[\s　]{2,}/gm, '$1 ')
    .replace(/\n[\s　]*([。，；、）」])/g, '$1');
  // 第一條本辦法依…: a 條 with its text straight after it, at a line's start. Only in a text that
  // doesn't set its 條 on lines of their own (臺北's 第 6 條 then 第四條所定… is a reference, not a 條).
  if ((s.match(OWN_LINE) || []).length < 2) s = s.replace(/^[\s　]*(第\s*[一二三四五六七八九十百0-9０-９]+\s*條(?:之[一二三四五六七八九十0-9]+)?)(?=[^\s　，。、；之第條及或至規所]{2})/gm, '$1 ');
  return s;
}

// A text that is only a pointer to its attachment (詳如附件全文, 請詳閱全文檔案): the reader says so and opens the source.
const ATTACHED = /^[^。\n]{0,30}(附件|全文檔案|圖表)[^。\n]{0,20}。?$/;

const lineOf = b => `${b.no || ''}${b.t || ''}`.trim();

// → the law-shaped doc. f: the text file ({ n, a, d, url, t, k?, L?, x?, s? }: s, its plain line made ahead); p: its id in Law.
export function ruleDoc(f, p, { sub = '' } = {}) {
  const r = ruleParts(p) || { dir: '', id: '' };
  const m = String(f.d || '').replace(/-/g, '');
  const base = { p, n: f.n || '', only: ATTACHED.test(String(f.t || '').trim()), l: f.k || sub || (r.dir === 'agency' ? '行政規則' : ''), c: f.a || '', m, url: f.url || '', dir: r.dir, laws: f.L || [], x: f.x || null, s: f.s || '' };
  // (The site's first line is often the rule's own name again.)
  const text = String(f.t || '').replace(/^[\s　]*([^\n]+)\n/, (all, l) => (l.replace(/[\s　]/g, '') === String(f.n || '').replace(/[\s　]/g, '') ? '' : all));
  const blocks = textBlocks(tidy(lineArticles(text)));
  const a = [];
  // Which comes first decides: a 第一條, or a 一、 (a 要點 that cites 第X條 of a law further in is still points).
  const firstArt = blocks.findIndex(b => b.k === 'art' && partKey(b.no));
  const firstPoint = blocks.findIndex(b => b.no && b.k !== 'art' && b.n === 1);
  // 條: each 第X條 block starts a part; what follows it is its text, a line each (款 and 目 hung by the reader).
  if (firstArt >= 0 && (firstPoint < 0 || firstArt < firstPoint)) {
    let cur = null;
    const lead = [];
    for (const b of blocks) {
      if (b.k === 'art' && partKey(b.no)) {
        cur = ['A', partKey(b.no), b.t ? b.t.trim() : ''];
        // (The same number twice, a site's slip: the second as 之一's place, never one over the other.)
        while (a.some(x => x[0] === 'A' && x[1] === cur[1])) cur[1] += "'";
        a.push(cur);
      } else if (b.head && HEAD.test(lineOf(b))) a.push(['C', '', lineOf(b)]), (cur = null);
      else if (!cur && HEAD.test(lineOf(b))) a.push(['C', '', lineOf(b)]);
      else if (cur) cur[2] = cur[2] ? `${cur[2]}\n${lineOf(b)}` : lineOf(b);
      else lead.push(lineOf(b));
    }
    for (const x of a) if (x[0] === 'A') x[2] = x[2].replace(/^\s+/, '');
    return { ...base, u: '條', a: lead.length ? [['T', '', lead.join('\n')], ...a] : a };
  }
  // 點: a 要點's top points (一、二、…, the shallowest numbered kind, counting up from 一), each a part.
  // Only when the text starts with its 一 (a heading before it at most): a 一、 further in is a 款 of
  // an article whose number the site left off (宜蘭's 組織規程), never a point.
  const first = firstPoint;
  const top = blocks[first];
  const kind = top?.k?.split(' ')[0];
  if (kind && blocks.slice(0, first).every(b => b.head || HEAD.test(lineOf(b))) && blocks.filter(b => b.k === kind).length >= 2) {
    let cur = null, want = 1;
    for (const b of blocks) {
      if (b.k === kind && b.n === want) {
        cur = ['A', String(b.n), (b.t || '').trim()];
        a.push(cur);
        want++;
      } else if (HEAD.test(lineOf(b)) || (b.head && b.k === 'top' && kind !== 'top') || (b.head && !cur)) a.push(['C', '', lineOf(b)]), (cur = b.head && !cur ? null : cur);
      else if (cur) cur[2] = cur[2] ? `${cur[2]}\n${lineOf(b)}` : lineOf(b);
    }
    if (a.filter(x => x[0] === 'A').length >= 2) return { ...base, u: '點', a };
    a.length = 0;
  }
  return { ...base, u: '', a: [['T', '', text.trim()]] };
}

// The parts of a doc as { key: text } (a diff between two versions of a rule).
export const partsOf = doc => Object.fromEntries((doc?.a || []).filter(x => x[0] === 'A').map(x => [x[1], x[2]]));

// What changed between two versions of a rule's text: { added, amended, removed }
// part keys, and each changed part's [was, now] (修了什麼, as a law's diff/<p>.json).
export function ruleDiff(oldDoc, doc) {
  const was = partsOf(oldDoc), now = partsOf(doc);
  const flat = s => String(s || '').replace(/[\s　]+/g, '');
  const added = [], amended = [], removed = [];
  for (const k of Object.keys(now)) if (!(k in was)) added.push(k);
  else if (flat(was[k]) !== flat(now[k])) amended.push(k);
  for (const k of Object.keys(was)) if (!(k in now)) removed.push(k);
  // A text with no parts: the whole of it, as one.
  if (!Object.keys(now).length && !Object.keys(was).length && flat(oldDoc?.a?.[0]?.[2]) !== flat(doc?.a?.[0]?.[2])) amended.push('');
  const arts = {};
  for (const k of [...added, ...amended, ...removed].slice(0, 40)) arts[k] = [was[k] ?? (k === '' ? oldDoc?.a?.[0]?.[2] : null) ?? null, now[k] ?? (k === '' ? doc?.a?.[0]?.[2] : null) ?? null];
  return { added, amended, removed, arts };
}

// A rule read again: what its new text changed against the last deploy's (`old`, `now`: text
// files' { n, d, t }), as the text file's `x` ({ m, was, added, amended, removed, arts }), or null
// when nothing in its parts moved (a site reformatting its spaces is no change).
export function ruleChange(old, now, p) {
  if (!old?.t || !now?.t) return null;
  const flat = s => String(s || '').replace(/[\s　]+/g, '');
  if (flat(old.t) === flat(now.t)) return null;
  const d = ruleDiff(ruleDoc(old, p), ruleDoc(now, p));
  if (!d.added.length && !d.amended.length && !d.removed.length) return null;
  const ymd8 = s => String(s || '').replace(/-/g, '');
  return { m: ymd8(now.d), was: ymd8(old.d), ...d };
}

// 修法追蹤 for rules (<dir>/changes.json): this build's changes over the last deploy's, one per
// rule and version, kept `days` days from when first seen, newest first.
export function mergeRuleChanges(prev, found, today, days = 120) {
  const since = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
  const out = new Map();
  for (const it of [...(prev?.items || []), ...found.map(f => ({ ...f, seen: f.seen || today }))]) {
    const k = `${it.p}|${it.m}`;
    if (it.seen < since) continue;
    out.set(k, out.has(k) ? { ...it, seen: out.get(k).seen } : it);
  }
  return { items: [...out.values()].sort((a, b) => (a.seen < b.seen ? 1 : a.seen > b.seen ? -1 : a.m < b.m ? 1 : -1)) };
}
