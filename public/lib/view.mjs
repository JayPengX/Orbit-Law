// The app's pieces as HTML: an article with its links, a law's contents, a
// bill item's stage bar and timeline. Strings, so the tests read them and
// a long law (民法: 1,225 articles) draws in one go.
import { linkText, paragraphs } from './refs.mjs';
import { consLinks } from './cons.mjs';
import { STAGES, STAGES_EN, PROMULGATED, stageOf, openRound } from './bills.mjs';
import { headingDepth, ymd } from './search.mjs';
import { noticeBefore, noticeUrl } from './notices.mjs';

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
          const html = ctx.en ? esc(line) : linkText(line, { names: ctx.names, keys: ctx.keys, at: k, para, self: ctx.self }).map(s => (typeof s === 'string' ? plainHtml(s) : refHtml(s, ctx.p, k))).join('');
          return j ? `<span class="lw-item">${html}</span>` : html;
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
