// Orbit Law: Taiwan's laws to read, with every reference a link, and the
// bills in 立法院 that will change them. An Orbit app with no Pass: the data
// is public and built each day onto this site (scripts/build-data.mjs), so
// reading costs nothing and works offline once opened.
//
// Tabs: 法規 (search, then a law to read), 立法 (every law with bills in
// this term, by stage), 追蹤 (what this device follows, and what moved).

import { tabBar, watchUpdates, keepOffline, haptic } from '#kit/quadra.mjs';
import { h, sheet, search, toast } from '#kit/ui.mjs';
import { nameMap } from './lib/refs.mjs';
import { searchLaws, parseJump, ymd, relatedLaws } from './lib/search.mjs';
import { lawHtml, articleHtml, articlesBetween, contents, stageBar, stageLabel, timeline, esc, artLabel, freshMarks } from './lib/view.mjs';
import { PASSED } from './lib/bills.mjs';
import { loadMine, saveMine, toggleFollow, markSeen, addRecent, toggleMark, isMarked, lawsChanged, newCount, today } from './lib/store.mjs';
import { W, en } from './lib/lang.mjs';
import { askLaw, askError, MAX_Q } from './lib/ask.mjs';
import { searchText, groupHits } from './lib/fulltext.mjs';
import { COURTS, courtOf, rulingUrl } from './lib/rulings.mjs';
import { noticeUrl, isOpen } from './lib/notices.mjs';
import { linkTrail } from './lib/stack.mjs';

const $ = id => document.getElementById(id);
const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
document.documentElement.lang = en ? 'en' : 'zh-Hant';

// ---- Data (this site's, kept by the service worker) --------------------------------

const cache = new Map();
async function data(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`./data/${path}`).then(r => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}
const lawFile = p => data(`law/${p}.json`);
const enFile = p => data(`en/${p}.json`);

const state = { rulingLaws: {}, lawRulings: {}, tab: 'laws', rows: [], byCode: new Map(), names: new Map(), items: [], itemsByLaw: new Map(), notices: [], noticesByLaw: new Map(), changes: { items: [] }, mine: loadMine(), law: null, showEn: false, query: '' };
const save = () => (saveMine(state.mine), badge());
// The 追蹤 tab's count: what moved, among what this device follows, since it last looked.
const badge = () => tabs.badge('mine', newCount(state.mine, state.items, state.changes));
let itemsReady = Promise.resolve();

// ---- Tabs ------------------------------------------------------------------------------

const tabs = tabBar({
  tabs: [
    { id: 'laws', label: W('法規', 'Laws'), icon: 'book' },
    { id: 'bills', label: W('立法', 'Bills'), icon: 'live' },
    { id: 'mine', label: W('追蹤', 'Following'), icon: 'star' }
  ],
  onSelect: (id, { again } = {}) => {
    if (again && id === 'laws' && state.law) return go('');
    go(id === 'laws' ? (state.law ? `law=${state.law.p}` : '') : `tab=${id}`);
  },
  label: W('分頁', 'Tabs')
});

function showTab(id) {
  state.tab = id;
  tabs.select(id);
  for (const t of ['laws', 'bills', 'mine']) $(`panel-${t}`).hidden = t !== id;
}

// ---- Routing: #law=B0000001&a=184 · #tab=bills · #item=11-01126 ----------------------

function go(hash, { replace = false } = {}) {
  const url = hash ? `#${hash}` : location.pathname + location.search;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  route();
}
addEventListener('popstate', route);

async function route() {
  const q = new URLSearchParams(location.hash.slice(1));
  document.querySelector('dialog[open]')?.close();
  if (q.get('law')) {
    showTab('laws');
    await openLaw(q.get('law'), q.get('a'), q.get('find'));
  } else if (q.get('tab') === 'bills' || q.get('item')) {
    showTab('bills');
    drawBills();
    await itemsReady;
    if (q.get('item')) openItem(q.get('item').replace('-', ':'));
  } else if (q.get('tab') === 'mine') {
    showTab('mine');
    drawMine();
  } else {
    state.law = null;
    showTab('laws');
    drawHome();
  }
}

// ---- 法規: search and the home list ---------------------------------------------------

const COMMON = ['中華民國憲法', '民法', '中華民國刑法', '民事訴訟法', '刑事訴訟法', '行政程序法', '勞動基準法', '道路交通管理處罰條例', '個人資料保護法', '消費者保護法'];

const box = search({ placeholder: W('法規名稱，或「民法184」', 'Law name, or 民法184'), onInput: v => ((state.query = v), drawResults()), onSubmit: v => jump(v) });

function lawCell(row, sub = '') {
  const [p, n, , cat, m, gone, enName] = row;
  // In English: the law's English name (MOJ's translation) in place of its 主管機關 category.
  const what = en ? (typeof enName === 'string' ? enName : '') : cat.split('＞').pop();
  return `<a class="q-cell chevron lw-law" href="#law=${esc(p)}"><span class="q-cell-text"><span>${esc(n)}</span><small>${esc(sub || [what, m && `${W('修正', 'Rev.')} ${ymd(m)}`].filter(Boolean).join('・'))}${gone ? ` ・${W('已廢止', 'Repealed')}` : ''}</small></span></a>`;
}
const group = (head, cells) => (cells.length ? `<section class="q-list-group">${head ? `<h3 class="q-list-head">${esc(head)}</h3>` : ''}<div class="q-list">${cells.join('')}</div></section>` : '');

function drawHome() {
  const panel = $('panel-laws');
  if (!panel.contains(box)) panel.replaceChildren(box, h('div', { id: 'results' }));
  box.hidden = false;
  drawResults();
}

function drawResults() {
  const out = $('results');
  if (!out) return;
  const q = state.query.trim();
  if (q) {
    const jumpTo = parseJump(state.rows, q);
    const found = searchLaws(state.rows, q);
    out.innerHTML =
      (jumpTo ? group('', [`<a class="q-cell chevron lw-law" href="#law=${esc(jumpTo.row[0])}&amp;a=${esc(jumpTo.key)}"><span class="q-cell-text"><span>${esc(jumpTo.row[1])} ${esc(artLabel(jumpTo.key, en))}</span><small>${W('直接打開這一條', 'Open this article')}</small></span></a>`]) : '') +
      (found.length ? group(W('法規', 'Laws'), found.map(r => lawCell(r))) : '') +
      `<div id="text-hits"></div>`;
    if (!jumpTo) textHits(q, !found.length);
    return;
  }
  const recent = state.mine.recent.map(p => state.byCode.get(p)).filter(Boolean);
  const amended = state.changes.items.slice(0, 8).map(c => state.byCode.get(c.p) && lawCell(state.byCode.get(c.p), changeText(c))).filter(Boolean);
  out.innerHTML = group(W('最近看過', 'Recent'), recent.map(r => lawCell(r))) + group(W('最近修法', 'Just amended'), amended) + group(W('常用', 'Common'), COMMON.map(n => state.rows.find(r => r[1] === n)).filter(Boolean).map(r => lawCell(r)));
}

// 全文檢索: the laws whose articles hold the words, most articles first
// (a tap opens the law showing only those articles).
let textTimer = 0;
function textHits(q, alone) {
  clearTimeout(textTimer);
  const out = $('text-hits');
  if ([...q].length < 2) return void (alone && (out.innerHTML = `<p class="lw-none">${W('找不到這個法規', 'No law by that name')}</p>`));
  textTimer = setTimeout(async () => {
    let ids;
    try {
      ids = await searchText(q, n => data(`text/${n}.json`));
    } catch {
      return;
    }
    if (state.query.trim() !== q || !document.body.contains(out)) return;
    const rows = groupHits(ids).map(g => state.rows[g.law] && `<a class="q-cell chevron lw-law" href="#law=${esc(state.rows[g.law][0])}&amp;find=${encodeURIComponent(q)}"><span class="q-cell-text"><span>${esc(state.rows[g.law][1])}</span><small>${esc(W(`${g.arts.length} 條提到「${q}」`, `${g.arts.length} articles mention “${q}”`))}</small></span></a>`).filter(Boolean);
    out.innerHTML = rows.length ? group(W('條文內容', 'In the text'), rows) : alone ? `<p class="lw-none">${W('沒有法規或條文提到這個', 'Nothing found')}</p>` : '';
  }, 250);
}

function changeText(c) {
  const n = c.added.length + c.amended.length + c.removed.length;
  return `${W('修正', 'Amended')} ${ymd(c.m)}${n ? `・${W(`${n} 條`, `${n} articles`)}` : ''}`;
}

function jump(q) {
  const j = parseJump(state.rows, q);
  if (j) return go(`law=${j.row[0]}&a=${j.key}`);
  const [first] = searchLaws(state.rows, q, 1);
  if (first) go(`law=${first[0]}`);
}

// ---- The reader --------------------------------------------------------------------------

async function openLaw(p, at, find = '') {
  const panel = $('panel-laws');
  if (state.law?.p !== p) {
    let law;
    try {
      law = await lawFile(p);
    } catch {
      panel.replaceChildren(h('p', { class: 'lw-none', text: W('這個法規打不開，請稍後再試', 'This law can’t be opened right now') }));
      return;
    }
    // The bills on this law mark its articles: waited for briefly (kept by the phone after the first time).
    await Promise.race([itemsReady, new Promise(r => setTimeout(r, 1500))]);
    state.lawRulings = {};
    if (state.rulingLaws[p]) data(`rulings/${p}.json`).then(r => state.law?.p === p && (state.lawRulings = r)).catch(() => {});
    state.law = law;
    state.showEn = en && Boolean(state.byCode.get(p)?.[6]);
    addRecent(state.mine, p);
    markSeen(state.mine, 'laws', p);
    save();
    await drawLaw();
  }
  if (find) {
    const f = document.querySelector('.lw-find');
    if (f) {
      f.hidden = false;
      f.querySelector('input').value = find;
      filterLaw(find);
    }
  }
  if (at) requestAnimationFrame(() => focusArticle(at));
  else scrollTo({ top: 0 });
}

async function drawLaw() {
  const law = state.law;
  const panel = $('panel-laws');
  const row = state.byCode.get(law.p) || [];
  let shown = law;
  if (state.showEn) {
    try {
      const e = await enFile(law.p);
      shown = { ...law, a: e.a, fw: e.fw };
    } catch {
      state.showEn = false;
    }
  }
  const items = state.itemsByLaw.get(law.p) || [];
  const live = items.find(it => !it.dropped && it.stage < 7 && it.open);
  const followed = Boolean(state.mine.laws[law.p]);
  const head = h('div', { class: 'lw-bar' }, [
    h('button', { class: 'lw-back', type: 'button', 'aria-label': W('返回', 'Back'), html: '<svg viewBox="0 0 12 20"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>', onclick: () => (history.length > 1 && location.hash ? history.back() : go('')) }),
    h('div', { class: 'lw-title' }, [h('h2', { text: state.showEn ? row[6] && (law.e || law.n) : law.n }), h('small', { text: [law.l === '憲法' && W('憲法', 'Constitution'), law.m && `${W('修正', 'Rev.')} ${ymd(law.m)}`, law.ab && W('已廢止', 'Repealed')].filter(Boolean).join('・') })]),
    h('div', { class: 'lw-tools' }, [
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('找條文', 'Find'), html: ICON.find, onclick: () => toggleFind() }),
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('目錄', 'Contents'), html: ICON.list, onclick: () => showContents(law) }),
      h('button', { type: 'button', class: `lw-tool${followed ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'laws', law.p) ? toast(W('已追蹤：修法時會標出來', 'Following: amendments will show')) : null, save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.laws[law.p])), haptic()) }),
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('更多', 'More'), html: ICON.more, onclick: () => lawMenu(law, row) })
    ])
  ]);
  const banner = live
    ? h('button', { type: 'button', class: 'lw-banner', onclick: () => go(`item=${live.k.replace(':', '-')}`) }, [h('span', { text: W('立法院審議中', 'Bills in 立法院') }), h('span', { class: 'lw-banner-stage', html: `${stageBar(live, en)} ${esc(stageLabel(live, en))}` })])
    : null;
  // A ministry's draft of this law still open for comment (預告).
  const draft = (state.noticesByLaw.get(law.p) || []).find(n => isOpen(n, today()));
  const notice = draft ? h('a', { class: 'lw-banner', href: noticeUrl(draft.id), target: '_blank', rel: 'noopener' }, [h('span', { text: W(`${draft.gov}預告修法`, `Draft by ${draft.gov}`) }), h('span', { class: 'lw-banner-stage', text: W(`意見至 ${shortDay(draft.to)}`, `comments till ${shortDay(draft.to)}`) })]) : null;
  const fw = shown.fw ? h('p', { class: 'lw-fw', text: shown.fw }) : null;
  const body = h('div', { class: `lw-law${state.showEn ? ' en' : ''}`, html: lawHtml(shown, { names: state.names, en: state.showEn, fresh: freshMarks(state.changes, law, en), pending: live ? Object.fromEntries(Object.entries(live.arts || {}).map(([k, n]) => [k, W(`${n} 個修正提案`, n > 1 ? `${n} proposals` : '1 proposal')])) : {}, pendingItem: live?.k.replace(':', '-'), marks: state.mine.marks.filter(m => m.p === law.p).map(m => m.k) }) });
  const find = h('div', { class: 'lw-find', hidden: true }, [search({ placeholder: W('在這部法規裡找字', 'Find in this law'), onInput: v => filterLaw(v) }), h('small', { class: 'lw-find-n' })]);
  panel.replaceChildren(head, find, ...[notice, banner, fw, body].filter(Boolean));
  box.hidden = true;
}

// 找條文: only the articles with the words in them (and no headings) while
// there's something typed; all back when it's cleared.
function toggleFind() {
  const f = document.querySelector('.lw-find');
  if (!f) return;
  f.hidden = !f.hidden;
  if (f.hidden) filterLaw('');
  else f.querySelector('input')?.focus();
}
let findTimer = 0;
function filterLaw(v) {
  clearTimeout(findTimer);
  findTimer = setTimeout(() => {
    const q = v.trim();
    const law = document.querySelector('.lw-law');
    if (!law) return;
    let n = 0;
    for (const el of law.children) {
      if (el.classList.contains('lw-h')) el.hidden = Boolean(q);
      else {
        const hit = !q || el.textContent.includes(q);
        el.hidden = !hit;
        if (hit && q) n++;
      }
    }
    const count = document.querySelector('.lw-find-n');
    if (count) count.textContent = q ? W(`${n} 條`, `${n} articles`) : '';
  }, 120);
}

function focusArticle(k, para = 0) {
  const el = document.getElementById(`a-${k}`);
  if (!el) return toast(W(`這部法規沒有${artLabel(k)}`, `No Article ${k} in this law`));
  // Twice: articles off screen are drawn lazily (content-visibility), so the
  // first jump lands on estimated heights; the second on real ones.
  const place = () => {
    el.scrollIntoView({ block: 'start' });
  };
  place();
  requestAnimationFrame(() => requestAnimationFrame(place));
  setTimeout(place, 250);
  flash(para ? el.querySelector(`[data-para="${para}"]`) || el : el);
}
function flash(el) {
  el.classList.remove('lw-flash');
  void el.offsetWidth;
  el.classList.add('lw-flash');
}

function showContents(law) {
  const list = contents(law);
  if (!list.length) return toast(W('這部法規沒有分章', 'No chapters in this law'));
  const s = sheet({ title: W('目錄', 'Contents'), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-toc', html: list.map(c => `<button type="button" class="d${c.depth}" data-first="${esc(c.first)}" data-id="${c.id}">${esc(c.title)}${c.first ? `<small>${esc(artLabel(c.first, en))}</small>` : ''}</button>`).join('') }) });
  s.el.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    s.close();
    const el = document.getElementById(b.dataset.id);
    el?.scrollIntoView({ block: 'start' });
    scrollBy(0, -(document.querySelector('.lw-bar')?.offsetHeight || 0) - 70);
  });
}

function lawMenu(law, row) {
  const rows = [];
  if (row[6] || state.showEn) rows.push([state.showEn ? '中文條文' : 'English text', () => ((state.showEn = !state.showEn), drawLaw())]);
  if (law.h) rows.push([W('沿革', 'History'), () => textSheet(W('沿革', 'History'), law.h)]);
  if (law.eff) rows.push([W('施行日期', 'In force'), () => textSheet(W('施行日期', 'In force'), law.eff)]);
  for (const it of state.itemsByLaw.get(law.p) || []) rows.push([`${W('立法院', '立法院')} ${W(`第 ${it.term} 屆`, `term ${it.term}`)}・${stageLabel(it, en)}`, () => go(`item=${it.k.replace(':', '-')}`)]);
  for (const r of relatedLaws(state.rows, row)) rows.push([r[1], () => go(`law=${r[0]}`), W('相關法規', 'Related law')]);
  rows.push([W('全國法規資料庫原文', 'Official text (MOJ)'), () => open(`https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${law.p}`, '_blank', 'noopener')]);
  const s = sheet({ title: law.n, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'q-list' }, rows.map(([label, fn, sub]) => h('button', { class: 'q-cell chevron', type: 'button', onclick: () => (s.close(), fn()) }, [h('span', { class: 'q-cell-text' }, [h('span', { text: label }), sub ? h('small', { text: sub }) : null].filter(Boolean))]))) });
}
function textSheet(title, text) {
  sheet({ title, closeLabel: W('關閉', 'Close'), body: h('pre', { class: 'lw-pre', text }) });
}

// An article's own menu (its number tapped): bookmark, copy, rulings that cite it.
function articleMenu(k) {
  const law = state.law;
  const marked = isMarked(state.mine, law.p, k);
  const label = `${law.n}${artLabel(k)}`;
  const kw = `${law.n.replace(/^中華民國/, '')}第${k.replace('-', '條之')}條`.replace(/條之(\d+)條$/, '條之$1');
  const rows = [
    [W('白話解釋（AI）', 'Explain in plain words (AI)'), () => explain(law, k)],
    [marked ? W('取消書籤', 'Remove bookmark') : W('加入書籤', 'Bookmark'), () => (toggleMark(state.mine, law.p, k), save(), document.getElementById(`a-${k}`)?.classList.toggle('marked', !marked))],
    [W('複製條文', 'Copy text'), () => copyArticle(k)],
    ...(state.lawRulings[k]?.length ? [[W(`最高法院等裁判（${state.lawRulings[k].length}）`, `Top-court rulings (${state.lawRulings[k].length})`), () => rulingsSheet(label, state.lawRulings[k], kw)]] : []),
    [W('在司法院搜尋裁判', 'Search 司法院 rulings'), () => open(`https://judgment.judicial.gov.tw/LAW_Mobile_FJUD/FJUD/qryresult.aspx?kw=${encodeURIComponent(kw)}`, '_blank', 'noopener')]
  ];
  const s = sheet({ title: label, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'q-list' }, rows.map(([t, fn]) => h('button', { class: 'q-cell', type: 'button', onclick: () => (s.close(), fn()) }, [h('span', { class: 'q-cell-text' }, [h('span', { text: t })])]))) });
}
// 白話解釋: the answer, each point with the article it cites (tap: the
// article in a sheet), and a box for a question about the same article.
// `ks`: one article key, or a few (a linked range, up to 8: answered together).
function explain(law, ks) {
  ks = [].concat(ks).slice(0, 8);
  const one = ks.length === 1;
  const out = h('div', { class: 'lw-ask' });
  const input = h('input', { type: 'text', class: 'lw-ask-q', maxlength: String(MAX_Q), enterkeyhint: 'send', placeholder: one ? W('問這一條，例如「適用在誰身上？」', 'Ask about this article') : W('問這幾條，例如「差別在哪？」', 'Ask about these articles') });
  const form = h('form', { class: 'lw-ask-form', onsubmit: e => (e.preventDefault(), run(input.value)) }, [input, h('button', { class: 'q-btn primary', type: 'submit', text: W('問', 'Ask') })]);
  const note = h('p', { class: 'lw-ask-note', text: one ? W('AI 只依這一條的條文回答，不是法律意見。', 'AI, from this article’s text only. Not legal advice.') : W('AI 只依這幾條的條文回答，不是法律意見。', 'AI, from these articles’ text only. Not legal advice.') });
  sheet({ title: `${law.n}${one ? artLabel(ks[0]) : `${artLabel(ks[0])}–${ks[ks.length - 1]}`}`, closeLabel: W('關閉', 'Close'), cls: 'lw-ask-sheet', body: [out, form, note] });
  async function run(q = '') {
    out.innerHTML = `<p class="lw-none">${W('解釋中…', 'Explaining…')}</p>`;
    const r = await askLaw({ p: law.p, arts: ks, q, lang: en ? 'en' : 'zh' });
    if (r.error) return void (out.innerHTML = `<p class="lw-none">${esc(askError(r.error, en))}</p>`);
    const points = r.points.map(pt => `<li>${esc(pt.text)} ${pt.cites.map(c => `<a class="lw-ref" href="#law=${esc(law.p)}&amp;a=${esc(c)}" data-law="${esc(law.p)}" data-from="${esc(c)}" data-to="${esc(c)}" data-para="0">${esc(artLabel(c, en))}</a>`).join(' ')}</li>`).join('');
    out.innerHTML = (q ? `<p class="lw-ask-asked">${esc(q)}</p>` : '') + (r.covered ? `${r.answer ? `<p>${esc(r.answer)}</p>` : ''}<ul>${points}</ul>` : `<p>${esc(r.answer || one ? W('這一條沒有規定這件事。', 'This article doesn’t cover that.') : W('這幾條沒有規定這件事。', 'These articles don’t cover that.'))}</p>`);
  }
  run();
}

// The top courts' rulings citing an article (newest first), each opening at 司法院.
function rulingsSheet(label, list, kw) {
  const rows = list.map(([jid, d, t]) => `<a class="q-cell" href="${esc(rulingUrl(jid))}" target="_blank" rel="noopener"><span class="q-cell-text"><span>${esc(t || jid)}</span><small>${esc([COURTS[courtOf(jid)]?.[en ? 1 : 0], jid.split(',').slice(1, 4).join(' '), ymd(d)].filter(Boolean).join('・'))}</small></span></a>`).join('');
  const more = `<a class="lw-out" href="https://judgment.judicial.gov.tw/LAW_Mobile_FJUD/FJUD/qryresult.aspx?kw=${encodeURIComponent(kw)}" target="_blank" rel="noopener">${W('在司法院搜尋更多', 'More at 司法院')}</a>`;
  sheet({ title: label, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-rulings', html: `<div class="q-list">${rows}</div>${more}` }) });
}

async function copyArticle(k) {
  const a = state.law.a.find(x => x[0] === 'A' && x[1] === k);
  try {
    await navigator.clipboard.writeText(`${state.law.n}${artLabel(k)}\n${a[2]}`);
    toast(W('已複製', 'Copied'));
  } catch {
    toast(W('無法複製', 'Couldn’t copy'));
  }
}

// ---- Links: a tap opens the article in a sheet, the reader stays put ----------------

document.addEventListener('click', e => {
  const pend = e.target.closest('.lw-pending');
  if (pend) return go(`item=${pend.dataset.item}`);
  const no = e.target.closest('.lw-no');
  if (no && !no.closest('dialog')) return articleMenu(no.dataset.art);
  const a = e.target.closest('a.lw-ref:not(.out)');
  if (!a) return;
  e.preventDefault();
  const { law, from, to, para } = a.dataset;
  // A 項 of the article it sits in: shown in place.
  if (a.classList.contains('para')) {
    const art = a.closest('.lw-art');
    const el = art?.querySelector(`[data-para="${para}"]`);
    if (el) return flash(el);
    return;
  }
  peek(law, from, to || from, Number(para) || 0);
});

const trail = linkTrail();
async function peek(p, from, to, para, { back = false } = {}) {
  let law;
  try {
    law = await lawFile(p);
  } catch {
    return toast(W('這部法規打不開', 'Can’t open that law'));
  }
  const arts = articlesBetween(law, from, to);
  const keys = law.a.filter(a => a[0] === 'A').map(a => a[1]);
  const body = arts.length ? arts.map(a => articleHtml(a, { names: state.names, keys, p: law.p })).join('') : `<p class="lw-none">${W(`${law.n}沒有收錄${artLabel(from)}（可能已刪除或改號）`, `Article ${from} isn’t in this law (repealed or renumbered)`)}</p>`;
  const content = h('div', { class: 'lw-peek', html: body });
  const openFull = h('button', { class: 'q-btn primary block', type: 'button', text: W('打開整部法規', 'Open the whole law'), onclick: () => (trail.current?.close(), go(`law=${p}&a=${from}`)) });
  const lead = trail.length + (back ? 0 : 1) > 1 ? h('button', { class: 'lw-back', type: 'button', 'aria-label': W('上一條', 'Back'), html: ICON.back, onclick: () => { const prev = trail.back(); if (prev) peek(...prev, { back: true }); } }) : null;
  const title = `${law.n === state.law?.n ? '' : law.n}${from === to ? artLabel(from, en) : `${artLabel(from, en)}–${to}`}`;
  // 白話解釋 of what's shown: the article, or a range of up to 8 together.
  const live = arts.filter(a => !/^[（(]刪除[）)]$/.test(a[2].trim())).map(a => a[1]);
  const ask = live.length && live.length <= 8 ? h('button', { class: 'q-btn block', type: 'button', text: live.length > 1 ? W(`白話解釋這 ${live.length} 條（AI）`, `Explain these ${live.length} (AI)`) : W('白話解釋（AI）', 'Explain in plain words (AI)'), onclick: () => (trail.current?.close(), explain(law, live)) }) : null;
  const s = sheet({ title, lead, closeLabel: W('關閉', 'Close'), cls: 'lw-peek-sheet', body: [content, h('div', { class: 'lw-peek-foot' }, [ask, openFull].filter(Boolean))], onClose: () => trail.closed(s) });
  // The new sheet is on the trail before the old one closes (its close lands late).
  trail.show(s, [p, from, to, para], { back })?.close();
  if (para) flash(content.querySelector(`[data-para="${para}"]`) || content);
}

// ---- 立法: every law with bills this term ----------------------------------------------

const BILL_FILTERS = [
  ['notice', W('預告', 'Draft')],
  ['moving', W('進行中', 'Active')],
  ['talks', W('協商', 'Floor')],
  ['passed', W('已三讀', 'Passed')],
  ['all', W('全部', 'All')]
];
let billFilter = 'moving';
let billQuery = '';
const billBox = search({ placeholder: W('搜尋法案', 'Search bills'), onInput: v => ((billQuery = v.trim()), drawBillList()) });

function drawBills() {
  const panel = $('panel-bills');
  if (!panel.firstChild) {
    const chips = h('div', { class: 'q-chips lw-filters', role: 'tablist' }, BILL_FILTERS.map(([id, label]) => h('button', { type: 'button', class: 'q-chip', role: 'tab', 'data-f': id, 'aria-selected': String(id === billFilter), text: label, onclick: () => ((billFilter = id), chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.f === id))), drawBillList()) })));
    panel.append(billBox, chips, h('div', { id: 'bill-list' }));
  }
  drawBillList();
}

const itemCell = (it, sub = '') =>
  `<a class="q-cell chevron lw-item-row" href="#item=${esc(it.k.replace(':', '-'))}"><span class="q-cell-text"><span>${esc(it.n)}</span><small>${stageBar(it, en)} ${esc(stageLabel(it, en))}・${esc(sub || itemSub(it))}</small></span></a>`;
const itemSub = it => [it.u && shortDay(it.u), it.count > 1 ? W(`${it.count} 版`, `${it.count} versions`) : ''].filter(Boolean).join('・');
// 2026-10-20 → 10/20 this year, 2025/10/20 before.
const shortDay = d => (d.slice(0, 4) === String(new Date().getFullYear()) ? ymd(d).slice(5) : ymd(d));

function drawBillList() {
  const out = $('bill-list');
  if (!out) return;
  if (billFilter === 'notice') return void (out.innerHTML = noticeList());
  let items = state.items;
  if (billQuery) items = items.filter(it => it.n.includes(billQuery));
  if (billFilter === 'moving') items = items.filter(it => !it.dropped && !it.held && it.open && it.stage >= 1 && it.stage < PASSED);
  if (billFilter === 'talks') items = items.filter(it => !it.dropped && it.open && it.stage >= 4 && it.stage < PASSED);
  if (billFilter === 'passed') items = items.filter(it => it.stage >= PASSED);
  const shown = items.slice(0, 200);
  out.innerHTML = shown.length ? group('', shown.map(it => itemCell(it))) + (items.length > shown.length ? `<p class="lw-none">${W(`還有 ${items.length - shown.length} 項，請用搜尋`, `${items.length - shown.length} more: search to find them`)}</p>` : '') : `<p class="lw-none">${W('沒有符合的法案', 'No bills match')}</p>`;
}

// 預告: ministries' drafts open for comment on join.gov.tw (open ones first),
// the step before 行政院 sends a bill to 立法院.
function noticeList() {
  const day = today();
  let list = state.notices;
  if (billQuery) list = list.filter(n => n.t.includes(billQuery) || n.gov.includes(billQuery));
  const open = list.filter(n => isOpen(n, day)), closed = list.filter(n => !isOpen(n, day));
  const html = group(W('開放意見中', 'Open for comment'), open.map(n => noticeCell(n, day))) + group(W('已截止', 'Closed'), closed.slice(0, 100).map(n => noticeCell(n, day)));
  return html || `<p class="lw-none">${W('目前沒有預告中的法律修正草案', 'No draft amendments open for comment')}</p>`;
}
function noticeCell(n, day) {
  const when = isOpen(n, day) ? W(`意見至 ${shortDay(n.to)}`, `comments till ${shortDay(n.to)}`) : W(`${shortDay(n.to)} 截止`, `closed ${shortDay(n.to)}`);
  return `<a class="q-cell chevron" href="${esc(noticeUrl(n.id))}" target="_blank" rel="noopener"><span class="q-cell-text"><span>${esc(n.t)}</span><small>${esc([n.gov, when].filter(Boolean).join('・'))}</small></span></a>`;
}

async function openItem(k) {
  const it = state.items.find(x => x.k === k);
  if (!it) return;
  let bills;
  try {
    bills = await data(`bills/item/${encodeURIComponent(k.replace(':', '-'))}.json`);
  } catch {
    return toast(W('這個法案打不開，請稍後再試', 'This bill can’t be opened right now'));
  }
  markSeen(state.mine, 'items', k);
  save();
  const steps = timeline(it, bills, en, state.noticesByLaw.get(it.p));
  const follow = h('button', { type: 'button', class: `lw-tool${state.mine.items[k] ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'items', k), save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.items[k])), haptic()) });
  const line = h('ol', { class: 'lw-timeline', html: steps.map(s => `<li class="${s.done ? 'done' : ''}${s.stage === it.stage ? ' now' : ''}"><b>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.by ? `${s.by}${s.name}` : s.name)}</a>` : esc(s.name)}</b><span>${esc(s.date ? ymd(s.date) : '')}</span></li>`).join('') });
  const versions = [...bills].sort((a, b) => (a.u < b.u ? 1 : -1));
  const list = h(
    'div',
    { class: 'q-list lw-versions' },
    versions.map(b =>
      h('details', { class: 'lw-version', ontoggle: e => e.currentTarget.open && compareBill(b, e.currentTarget) }, [
        h('summary', {}, [h('span', { text: b.t }), h('small', { text: [b.by, b.st, b.u && ymd(b.u)].filter(Boolean).join('・') })]),
        h('div', { class: 'lw-compare', text: W('讀取對照表…', 'Loading…') })
      ])
    )
  );
  const openLawBtn = it.p ? h('button', { class: 'q-btn block', type: 'button', text: W('打開現行法規', 'Open the law in force'), onclick: () => (s.close(), go(`law=${it.p}`)) }) : null;
  const s = sheet({ title: it.n, lead: follow, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [h('p', { class: 'lw-item-state', html: `${stageBar(it, en)} ${esc(stageLabel(it, en))}・${W(`第 ${it.term} 屆`, `Term ${it.term}`)}` }), line, h('h3', { class: 'q-list-head', text: W(`${bills.length} 個版本`, `${bills.length} versions`) }), list, openLawBtn].filter(Boolean), onClose: () => location.hash.startsWith('#item=') && history.replaceState(null, '', '#tab=bills') });
}

// A version's 對照表 (old and new text, article by article), from the
// 立法院 API on first opening only.
async function compareBill(b, el) {
  const out = el.querySelector('.lw-compare');
  if (out.dataset.done) return;
  out.dataset.done = '1';
  try {
    const r = await fetch(`https://v2.ly.govapi.tw/bill/${encodeURIComponent(b.id)}`);
    const j = await r.json();
    const tables = j?.data?.['對照表'] || [];
    const rows = tables.flatMap(t => t.rows || []);
    out.innerHTML =
      (rows.length
        ? rows
            .slice(0, 60)
            .map(row => {
              const now = row['修正'] || row['增訂'] || '';
              const old = row['現行'] || '';
              return `<div class="lw-cmp">${now ? `<p class="new"><b>${esc(row['增訂'] ? W('增訂', 'New') : W('修正', 'Proposed'))}</b>${esc(now)}</p>` : ''}${old ? `<p class="old"><b>${W('現行', 'Current')}</b>${esc(old)}</p>` : ''}${row['說明'] ? `<p class="why">${esc(row['說明'])}</p>` : ''}</div>`;
            })
            .join('')
        : `<p class="lw-none">${W('這個版本沒有對照表', 'No comparison table for this version')}</p>`) + `<a class="lw-out" href="https://ppg.ly.gov.tw/ppg/bills/${esc(b.id)}/details" target="_blank" rel="noopener">${W('立法院議事暨公報資訊網', 'On the 立法院 site')}</a>`;
  } catch {
    out.dataset.done = '';
    out.textContent = W('對照表讀不到，請稍後再試', 'Couldn’t load the table');
  }
}

// ---- 追蹤 ------------------------------------------------------------------------------

function drawMine() {
  const m = state.mine;
  const changedLaws = lawsChanged(m, state.changes);
  const items = state.items.filter(it => m.items[it.k]);
  const moved = items.filter(it => it.u > m.items[it.k]);
  const laws = Object.keys(m.laws).map(p => state.byCode.get(p)).filter(Boolean);
  const marks = m.marks.map(x => ({ ...x, row: state.byCode.get(x.p) })).filter(x => x.row);
  const news = [...changedLaws.map(c => lawCell(state.byCode.get(c.p), changeText(c))), ...moved.map(it => itemCell(it))];
  const html =
    group(W('自上次查看後的變動', 'New since you last looked'), news) +
    group(W('追蹤的法案', 'Bills'), items.map(it => itemCell(it))) +
    group(W('追蹤的法規', 'Laws'), laws.map(r => lawCell(r))) +
    group(W('書籤', 'Bookmarks'), marks.map(x => `<a class="q-cell chevron" href="#law=${esc(x.p)}&amp;a=${esc(x.k)}"><span class="q-cell-text"><span>${esc(x.row[1])} ${esc(artLabel(x.k, en))}</span></span></a>`));
  $('panel-mine').innerHTML = html || `<div class="q-empty"><strong>${W('還沒有追蹤', 'Nothing followed yet')}</strong><p>${W('在法規或法案上按 ☆，修法和審議進度會出現在這裡。', 'Tap ☆ on a law or a bill: amendments and progress show here.')}</p></div>`;
}

// ---- Icons (the app's own, line-drawn) ------------------------------------------------

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  find: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  back: svg('<path d="M15 4 7 12l8 8"/>')
};

// ---- Opening ---------------------------------------------------------------------------

async function start() {
  try {
    const index = await data('index.json');
    state.rows = index.laws;
    state.byCode = new Map(index.laws.map(r => [r[0], r]));
    state.names = nameMap(index.laws);
  } catch {
    $('panel-laws').replaceChildren(h('div', { class: 'q-empty' }, [h('strong', { text: W('法規資料讀不到', 'The laws couldn’t be loaded') }), h('p', { text: W('請連上網路再打開一次。', 'Connect and open again.') })]));
  }
  // Bills and changes: the screens that need them draw again once in.
  itemsReady = data('bills/items.json')
    .then(b => {
      state.items = b.items;
      state.itemsByLaw = new Map();
      for (const it of b.items) if (it.p) state.itemsByLaw.set(it.p, [...(state.itemsByLaw.get(it.p) || []), it]);
      if (state.tab === 'bills') drawBillList();
      if (state.tab === 'mine') drawMine();
      badge();
    })
    .catch(() => {});
  data('bills/notices.json')
    .then(n => {
      state.notices = n.notices || [];
      for (const x of state.notices) for (const p of x.laws) state.noticesByLaw.set(p, [...(state.noticesByLaw.get(p) || []), x]);
      if (state.tab === 'bills') drawBillList();
    })
    .catch(() => {});
  data('rulings/laws.json')
    .then(r => (state.rulingLaws = r))
    .catch(() => {});
  data('changes.json')
    .then(c => {
      state.changes = c;
      if (state.tab === 'laws' && !state.law) drawResults();
      if (state.tab === 'mine') drawMine();
      badge();
    })
    .catch(() => {});
  await route();
  $('loading')?.setAttribute('hidden', '');
  window.__fxStarted = true;
}

await start();
keepOffline();
watchUpdates({ current: BUILD, key: 'orbitLaw', cachePrefix: 'orbit-law-', busy: () => Boolean(document.querySelector('dialog[open]')) });
