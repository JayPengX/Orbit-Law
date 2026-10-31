// The app's pieces as HTML: an article with its links, a law's contents, a
// bill item's stage bar and timeline. Strings, so the tests read them and
// a long law (民法: 1,225 articles) draws in one go.
import { linkText, paragraphs } from './refs.mjs';
import { consLinks } from './cons.mjs';
import { STAGES, STAGES_EN, PROMULGATED, stageOf, openRound } from './bills.mjs';
import { headingDepth, ymd } from './search.mjs';
import { noticeBefore } from './notices.mjs';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const artLabel = (k, en = false) => (en ? `Article ${k}` : `第 ${k} 條`);

// One article: its 項 as paragraphs (款 lines inside), every reference a
// link carrying where it goes. `ctx`: { names, keys, p (this law), en, marked,
// self (a regulation's law, for 本法) }.
export function articleHtml([, k, text], ctx = {}) {
  const deleted = /^（刪除）$|^\(刪除\)$/.test(text.trim());
  const paras = ctx.en ? String(text).split('\n').filter(Boolean).map(l => [l]) : paragraphs(text);
  const body = paras
    .map((lines, i) => {
      const para = i + 1;
      const inner = lines
        .map((line, j) => {
          const bare = line.replace(/^[\s　]+/, '');
          const html = ctx.en ? esc(bare) : linkText(bare, { names: ctx.names, keys: ctx.keys, at: k, para, self: ctx.self }).map(s => (typeof s === 'string' ? plainHtml(s) : refHtml(s, ctx.p, k))).join('');
          // 款 hung under its 項, 目 under its 款, a carried-on line under its 款's text.
          return j ? `<span class="lw-item${/^[\s　]*[（(]/.test(line) ? ' sub' : /^[\s　]/.test(line) ? ' more' : ''}">${html}</span>` : html;
        })
        .join('');
      return `<p class="lw-para" data-para="${para}">${inner}</p>`;
    })
    .join('');
  const fresh = (ctx.fresh ? `<span class="lw-fresh">${esc(ctx.fresh)}</span>` : '') + (ctx.pending ? `<button type="button" class="lw-pending" data-item="${esc(ctx.pendingItem || '')}">${esc(ctx.pending)}</button>` : '');
  return `<article class="lw-art${deleted ? ' gone' : ''}${ctx.marked ? ' marked' : ''}" id="a-${esc(k)}" data-k="${esc(k)}"><button class="lw-no" type="button" data-art="${esc(k)}">${esc(artLabel(k, ctx.en))}</button>${fresh}${body}</article>`;
}

// A plain run: text, with any 大法官解釋 or 憲法法庭判決 a link to it in 裁判.
export const plainHtml = s => (/釋字|憲判/.test(s) ? consLinks(s).map(x => (typeof x === 'string' ? esc(x) : `<a class="lw-cons" href="#r=${esc(x.id)}">${esc(x.t)}</a>`)).join('') : esc(s));

// Text that isn't an article (a ruling's holding and reasons, a rule): every
// article it names by its law (刑法第二百十八條, 道路交通管理處罰條例第五十五條及
// 第五十六條) a link, and any 釋字 too; a bare 第X條 (whose law the text
// doesn't say) stays plain. (Jay 2026-10-27: the rulings read as plain text.)
export const linkedHtml = (text, names = new Map()) =>
  /條/.test(text) ? linkText(String(text ?? ''), { names }).map(r => (typeof r === 'string' ? plainHtml(r) : r.law && r.from ? refHtml(r) : esc(r.t))).join('') : plainHtml(String(text ?? ''));

// Any plain text the sources hand us (a rule, a ruling's reasons, a bill's
// 說明, a draft's 總說明, a meeting's 事由) as its structure: 壹、 a heading,
// 一、 a point, （一） under it, 1. under that, (1) under that, 第X條 an
// article. Points run together on one line (…如下：一、…。二、…) are split
// where the numbers follow on (一 then 二), never inside 「」. A line the
// source broke mid-sentence (it doesn't end in 。：；) is joined back. A short
// numbered line with no full stop, followed by text, is a heading; 【12】
// (the court's paragraph number) is kept as a quiet number.
// → [{ k: 'item' | 'sub' | 'num' | 'par' | 'top' | 'art' | 'p' (+ ' more'), no, t, d (depth), head, pn }]
const CN = '[一二三四五六七八九十百]+';
const wide = s => s.replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xff10));
const KINDS = [
  ['top', /^([壹貳參肆伍陸柒捌玖拾]+)[、．]\s*/, m => `${m[1]}、`],
  ['item', new RegExp(`^(${CN})[、．]\\s*`), m => `${m[1]}、`],
  ['sub', new RegExp(`^[（(]\\s*(${CN})\\s*[）)]\\s*`), m => `（${m[1]}）`],
  ['num', /^([0-9０-９]{1,2})[、．.](?![0-9０-９])\s*/, m => `${wide(m[1])}.`],
  ['par', /^[（(]\s*([0-9０-９]{1,2})\s*[）)]\s*/, m => `（${wide(m[1])}）`]
];
const ART = /^(第\s*[一二三四五六七八九十百千0-9]+\s*條(?:之[一二三四五六七八九十0-9]+)?)(?:[\s　]+|$)/;
const ENDS = /[。：:；;」！？!?]$/;
const markOf = s => {
  for (const [k, re, no] of KINDS) {
    const m = s.match(re);
    if (m) return { k, no: no(m), n: numOf(m[1]), len: m[0].length };
  }
  return null;
};
const CN_N = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 壹: 1, 貳: 2, 參: 3, 肆: 4, 伍: 5, 陸: 6, 柒: 7, 捌: 8, 玖: 9 };
function numOf(s) {
  if (/^[0-9０-９]+$/.test(s)) return Number(wide(s));
  let n = 0, d = 0;
  for (const ch of s) {
    if (ch === '十' || ch === '拾') (n += (d || 1) * 10), (d = 0);
    else if (ch === '百') (n += (d || 1) * 100), (d = 0);
    else d = CN_N[ch] || 0;
  }
  return n + d;
}
// One line cut where a numbered point starts inside it: after 。：；」 or a
// space, outside 「」, its number the next in its kind (or a 1 starting one).
const INLINE = new RegExp(`(?<=[。：:；;」）)\\s　])[\\s　]*(?=[壹貳參肆伍陸柒捌玖拾]+、|${CN}、|[（(]\\s*(?:${CN}|[0-9０-９]{1,2})\\s*[）)]|[0-9０-９]{1,2}[、．.](?![0-9０-９]))`, 'g');
const B = '[。：:；;」\\s　]';
const TWO = { top: new RegExp(`${B}貳、`), item: new RegExp(`${B}二、`), sub: new RegExp(`${B}[（(]二[）)]`), num: new RegExp(`${B}[2２][、．.](?![0-9０-９])`), par: new RegExp(`${B}[（(][2２][）)]`) };
function splitInline(line, seen) {
  const cuts = [0];
  const head = markOf(line);
  if (head) seen[head.k] = head.n;
  let quote = 0, from = 0;
  for (const m of line.matchAll(INLINE)) {
    for (const ch of line.slice(from, m.index)) quote += ch === '「' || ch === '『' ? 1 : ch === '」' || ch === '』' ? -1 : 0;
    from = m.index;
    if (quote > 0) continue;
    const at = m.index + m[0].length;
    const mk = markOf(line.slice(at));
    if (!mk || !(mk.n === 1 || mk.n === (seen[mk.k] || 0) + 1)) continue;
    // A 1 that starts a kind needs its 2 later in the line (…如下：一、…。二、…).
    if (mk.n === 1 && !(seen[mk.k] > 0) && !TWO[mk.k].test(line.slice(at))) continue;
    seen[mk.k] = mk.n;
    cuts.push(at);
  }
  return cuts.map((c, i) => line.slice(c, cuts[i + 1]).replace(/[\s　]+$/, '')).filter(Boolean);
}
export function textBlocks(text) {
  const out = [];
  const seen = {};
  for (const raw of String(text ?? '').replace(/\r/g, '').split('\n')) {
    const whole = raw.replace(/^[\s　]+|[\s　]+$/g, '');
    if (!whole) continue;
    splitInline(whole, seen).forEach((seg, i) => {
      let line = seg;
      const pn = line.match(/\s*【(\d+)】$/);
      if (pn) line = line.slice(0, pn.index);
      const last = out.at(-1);
      let m, mk;
      if (!i && (m = line.match(ART))) out.push({ k: 'art', no: m[1].replace(/\s+/g, ''), t: line.slice(m[0].length) });
      else if ((mk = markOf(line))) {
        out.push({ k: mk.k, no: mk.no, n: mk.n, t: line.slice(mk.len) });
      } else if (last && !last.pn && !ENDS.test(last.t) && !(last.k !== 'art' && last.no && last.t.length <= 12 && !/[，,、]/.test(last.t))) last.t += line;
      else out.push({ k: last && last.k !== 'p' && last.k !== 'art' ? `${last.k.split(' ')[0]} more` : 'p', no: '', t: line });
      if (pn) out.at(-1).pn = pn[1];
      const b = out.at(-1);
      // A short numbered line with no sentence in it, before text: a heading.
      if (b.no && b.k !== 'art' && b.t.length <= 20 && !/[。；;，,：:]/.test(b.t)) b.maybe = true;
    });
  }
  // Depth: each kind's place among the kinds this text uses, in 壹 一 （一） 1. (1) order.
  const used = KINDS.map(([k]) => k).filter(k => out.some(b => b.k.split(' ')[0] === k));
  out.forEach((b, i) => {
    const base = b.k.split(' ')[0];
    b.d = Math.max(0, used.indexOf(base));
    const next = out[i + 1];
    if (b.maybe && next && (!next.no || next.k !== base) && !(out[i - 1]?.k === base && !out[i - 1].head)) {
      b.head = true;
      // What follows a heading is plain text, not more of a point.
      for (let j = i + 1; j < out.length && /more$/.test(out[j].k); j++) out[j].k = 'p';
    }
    delete b.maybe;
  });
  // A line between points that starts a new run (…略稱： then 一、 again) is plain text.
  out.forEach((b, i) => {
    const next = out[i + 1];
    if (/ more$/.test(b.k) && next?.n === 1 && next.k === b.k.split(' ')[0]) b.k = 'p';
  });
  return out;
}
// Kept for the tests and the rule sheet: the same blocks.
export const ruleBlocks = textBlocks;
const pnHtml = b => (b.pn ? ` <small class="lw-pn">${esc(b.pn)}</small>` : '');
export const proseHtml = (text, names) =>
  `<div class="lw-prose">${textBlocks(text)
    .map(b =>
      b.k === 'art'
        ? `<h5 class="lw-rule-art">${esc(b.no)}</h5>${b.t ? `<p class="lw-rule p">${linkedHtml(b.t, names)}</p>` : ''}`
        : b.head
          ? `<h5 class="lw-rule-h d${b.d}">${esc(b.no)}${linkedHtml(b.t, names)}${pnHtml(b)}</h5>`
          : `<p class="lw-rule ${b.k} d${b.d}">${b.no ? `<b>${esc(b.no)}</b>` : ''}<span>${linkedHtml(b.t, names)}${pnHtml(b)}</span></p>`
    )
    .join('')}</div>`;
export const ruleHtml = proseHtml;

// The ministry's fixed-width notes (a law's 施行日期, 沿革): "N." entries
// whose lines wrap mid-number, spaces around every number. → [{ no, t }],
// lines joined, the spaces gone. A wrapped line that starts its own date
// (a 行政院 公告 under an amendment) is its own entry.
const tidy = s => s.replace(/\s+/g, ' ').replace(/ (?=[^\x00-\x7f])|(?<=[^\x00-\x7f]) /g, '').trim();
export function noteEntries(text) {
  const out = [];
  for (const raw of String(text ?? '').replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const m = raw.match(/^\s*(\d+)\s*\.\s*/);
    const line = m ? raw.slice(m[0].length) : raw.trim();
    if (m || !out.length || /^中華民國[一二三四五六七八九十百零〇]+年/.test(line)) out.push({ no: m ? Number(m[1]) : 0, t: line });
    else out.at(-1).t += line;
  }
  return out.map(e => ({ ...e, t: tidy(e.t) }));
}
// 第8、14、32～36、979-1條 in the ministry's notes: each number a link.
export function noteArtsHtml(t, p, keys = new Set()) {
  return esc(t).replace(/第([\d、～~\-－]+)條/g, (all, list) =>
    `第${list
      .split('、')
      .map(part => {
        const [a, b] = part.split(/[～~]/).map(x => x.replace(/[－-]/g, '-'));
        if (!keys.has(a)) return esc(part);
        const to = b && keys.has(b) ? b : a;
        return `<a class="lw-ref" href="#law=${esc(p)}&amp;a=${esc(a)}" data-law="${esc(p)}" data-from="${esc(a)}" data-to="${esc(to)}" data-para="0">${esc(part)}</a>`;
      })
      .join('、')}條`
  );
}
// The ministry's notes (施行日期; 沿革 when it can't be read as a timeline)
// as numbered points, article numbers linked.
export function notesHtml(law, text) {
  const keys = new Set(law.a.filter(a => a[0] === 'A').map(a => a[1]));
  const items = noteEntries(text);
  return `<div class="lw-prose">${items.map(e => `<p class="lw-rule${e.no ? ' num' : ' p'} d0">${e.no ? `<b>${e.no}.</b>` : ''}<span>${noteArtsHtml(e.t, law.p, keys)}</span></p>`).join('')}</div>`;
}

// A reference: to an article (its law or this one), or to a 項 of the
// article it sits in.
export function refHtml(r, p, at) {
  if (!r.from) return `<a class="lw-ref para" href="#" data-law="${esc(p)}" data-from="${esc(at)}" data-para="${r.para}">${esc(r.t)}</a>`;
  return `<a class="lw-ref" href="#law=${esc(r.law || p)}&amp;a=${esc(r.from)}" data-law="${esc(r.law || p)}" data-from="${esc(r.from)}" data-to="${esc(r.to)}" data-para="${r.para}">${esc(r.t)}</a>`;
}

// The whole law, headings and articles in order.
export function lawHtml(law, ctx = {}) {
  const keys = law.a.filter(a => a[0] === 'A').map(a => a[1]);
  const marks = new Set(ctx.marks || []);
  // The articles the latest amendment added or changed: { key: label }.
  const fresh = ctx.fresh || {};
  // The articles open bills would change: { key: label }, and the item they open.
  const pending = ctx.pending || {};
  let h = 0;
  return law.a
    .map(a => (a[0] === 'C' ? `<h2 class="lw-h d${headingDepth(a[2])}" id="h-${h++}">${esc(a[2])}</h2>` : articleHtml(a, { ...ctx, keys, p: law.p, marked: marks.has(a[1]), fresh: fresh[a[1]] || '', pending: pending[a[1]] || '' })))
    .join('');
}

// The contents: each heading with the first article under it.
export function contents(law) {
  const out = [];
  let h = 0;
  for (let i = 0; i < law.a.length; i++) {
    const a = law.a[i];
    if (a[0] !== 'C') continue;
    const first = law.a.slice(i + 1).find(x => x[0] === 'A');
    out.push({ id: `h-${h++}`, title: a[2], depth: headingDepth(a[2]), first: first?.[1] || '' });
  }
  return out;
}

// The articles a reference reaches (a range: every key between, in order).
export function articlesBetween(law, from, to = from) {
  const arts = law.a.filter(a => a[0] === 'A');
  const i = arts.findIndex(a => a[1] === from);
  if (i < 0) return [];
  const j = arts.findIndex(a => a[1] === to);
  return arts.slice(i, Math.max(i, j) + 1).slice(0, 20);
}

// A bill item's timeline: the first day each stage was reached, across
// the versions in the open round (else all of them, 總統公布 from the MOJ copy).
// `notices`: the law's 預告 (join.gov.tw); the one before the round's first
// proposal goes first, as the step before 提案 (stage -1, with its link).
export function timeline(item, all, en = false, notices = []) {
  const round = openRound(all);
  const bills = round.length ? round : all;
  const first = new Map();
  for (const b of bills) for (const [d, s, raw] of b.flow) if (s >= 0 && d && (!first.has(s) || d < first.get(s).d)) first.set(s, { d, raw });
  if (item.pub && !round.length) first.set(PROMULGATED, { d: ymd(item.pub).replaceAll('/', '-'), raw: '' });
  const proposed = bills.map(b => b.d).filter(Boolean).sort()[0];
  if (proposed && !first.has(0)) first.set(0, { d: proposed, raw: '' });
  const names = en ? STAGES_EN : STAGES;
  const steps = names.map((n, i) => ({ stage: i, name: n, date: first.get(i)?.d || '', raw: first.get(i)?.raw || '', done: i <= item.stage }));
  const draft = noticeBefore(notices, first.get(0)?.d);
  return draft ? [{ stage: -1, name: en ? 'Draft posted' : '預告', date: draft.from, raw: draft.t, done: true, url: `#notice=${draft.id}`, by: draft.gov }, ...steps] : steps;
}

export { stageOf, ymd };

// The latest amendment's marks for a law (修法追蹤): its added and amended
// articles, labelled 新增 / 修正 with the day.
export function freshMarks(changes, law, en = false) {
  const c = (changes?.items || []).find(x => x.p === law.p && x.m === law.m);
  if (!c) return {};
  const day = ymd(c.m);
  const out = {};
  for (const k of c.amended) out[k] = `${en ? 'Amended' : '修正'} ${day}`;
  for (const k of c.added) out[k] = `${en ? 'New' : '新增'} ${day}`;
  return out;
}
