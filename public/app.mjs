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
import { searchLaws, parseJump, ymd } from './lib/search.mjs';
import { lawHtml, articleHtml, articlesBetween, contents, stageBar, stageLabel, timeline, esc, artLabel } from './lib/view.mjs';
import { PASSED } from './lib/bills.mjs';
import { loadMine, saveMine, toggleFollow, markSeen, addRecent, toggleMark, isMarked, lawsChanged } from './lib/store.mjs';
import { W, en } from './lib/lang.mjs';

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

const state = { tab: 'laws', rows: [], byCode: new Map(), names: new Map(), items: [], itemsByLaw: new Map(), changes: { items: [] }, mine: loadMine(), law: null, showEn: false, query: '' };
const save = () => saveMine(state.mine);
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
    await openLaw(q.get('law'), q.get('a'));
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
  const [p, n, , cat, m, gone] = row;
  return `<a class="q-cell chevron lw-law" href="#law=${esc(p)}"><span class="q-cell-text"><span>${esc(n)}</span><small>${esc(sub || [cat.split('＞').pop(), m && `${W('修正', 'Amended')} ${ymd(m)}`].filter(Boolean).join('・'))}${gone ? ` ・${W('已廢止', 'Repealed')}` : ''}</small></span></a>`;
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
      (found.length ? group(W('法規', 'Laws'), found.map(r => lawCell(r))) : jumpTo ? '' : `<p class="lw-none">${W('找不到這個法規', 'No law by that name')}</p>`);
    return;
  }
  const recent = state.mine.recent.map(p => state.byCode.get(p)).filter(Boolean);
  const amended = state.changes.items.slice(0, 8).map(c => state.byCode.get(c.p) && lawCell(state.byCode.get(c.p), changeText(c))).filter(Boolean);
  out.innerHTML = group(W('最近看過', 'Recent'), recent.map(r => lawCell(r))) + group(W('最近修法', 'Just amended'), amended) + group(W('常用', 'Common'), COMMON.map(n => state.rows.find(r => r[1] === n)).filter(Boolean).map(r => lawCell(r)));
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

async function openLaw(p, at) {
  const panel = $('panel-laws');
  if (state.law?.p !== p) {
    let law;
    try {
      law = await lawFile(p);
    } catch {
      panel.replaceChildren(h('p', { class: 'lw-none', text: W('這個法規打不開，請稍後再試', 'This law can’t be opened right now') }));
      return;
    }
    state.law = law;
    state.showEn = en && Boolean(state.byCode.get(p)?.[6]);
    addRecent(state.mine, p);
    markSeen(state.mine, 'laws', p);
    save();
    await drawLaw();
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
    h('div', { class: 'lw-title' }, [h('h2', { text: state.showEn ? row[6] && (law.e || law.n) : law.n }), h('small', { text: [law.l, law.m && `${W('修正', 'Amended')} ${ymd(law.m)}`, law.ab && W('已廢止', 'Repealed')].filter(Boolean).join('・') })]),
    h('div', { class: 'lw-tools' }, [
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('目錄', 'Contents'), html: ICON.list, onclick: () => showContents(law) }),
      h('button', { type: 'button', class: `lw-tool${followed ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'laws', law.p) ? toast(W('已追蹤：修法時會標出來', 'Following: amendments will show')) : null, save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.laws[law.p])), haptic()) }),
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('更多', 'More'), html: ICON.more, onclick: () => lawMenu(law, row) })
    ])
  ]);
  const banner = live
    ? h('button', { type: 'button', class: 'lw-banner', onclick: () => go(`item=${live.k.replace(':', '-')}`) }, [h('span', { text: W('立法院審議中', 'Bills in 立法院') }), h('span', { class: 'lw-banner-stage', html: `${stageBar(live, en)} ${esc(stageLabel(live, en))}` })])
    : null;
  const fw = shown.fw ? h('p', { class: 'lw-fw', text: shown.fw }) : null;
  const body = h('div', { class: `lw-law${state.showEn ? ' en' : ''}`, html: lawHtml(shown, { names: state.names, en: state.showEn, marks: state.mine.marks.filter(m => m.p === law.p).map(m => m.k) }) });
  panel.replaceChildren(head, ...[banner, fw, body].filter(Boolean));
  box.hidden = true;
}

function focusArticle(k, para = 0) {
  const el = document.getElementById(`a-${k}`);
  if (!el) return toast(W(`這部法規沒有${artLabel(k)}`, `No Article ${k} in this law`));
  el.scrollIntoView({ block: 'start' });
  scrollBy(0, -(document.querySelector('.lw-bar')?.offsetHeight || 0) - 70);
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
  rows.push([W('全國法規資料庫原文', 'Official text (MOJ)'), () => open(`https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${law.p}`, '_blank', 'noopener')]);
  const s = sheet({ title: law.n, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'q-list' }, rows.map(([label, fn]) => h('button', { class: 'q-cell chevron', type: 'button', onclick: () => (s.close(), fn()) }, [h('span', { class: 'q-cell-text' }, [h('span', { text: label })])]))) });
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
    [marked ? W('取消書籤', 'Remove bookmark') : W('加入書籤', 'Bookmark'), () => (toggleMark(state.mine, law.p, k), save(), document.getElementById(`a-${k}`)?.classList.toggle('marked', !marked))],
    [W('複製條文', 'Copy text'), () => copyArticle(k)],
    [W('相關裁判（司法院）', 'Court rulings citing it'), () => open(`https://judgment.judicial.gov.tw/LAW_Mobile_FJUD/FJUD/qryresult.aspx?kw=${encodeURIComponent(kw)}`, '_blank', 'noopener')]
  ];
  const s = sheet({ title: label, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'q-list' }, rows.map(([t, fn]) => h('button', { class: 'q-cell', type: 'button', onclick: () => (s.close(), fn()) }, [h('span', { class: 'q-cell-text' }, [h('span', { text: t })])]))) });
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
  const no = e.target.closest('.lw-no');
  if (no && !no.closest('dialog')) return articleMenu(no.dataset.art);
  const a = e.target.closest('a.lw-ref');
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

let peekSheet = null;
const peekStack = [];
async function peek(p, from, to, para, { back = false } = {}) {
  let law;
  try {
    law = await lawFile(p);
  } catch {
    return toast(W('這部法規打不開', 'Can’t open that law'));
  }
  if (!back) peekStack.push([p, from, to, para]);
  const arts = articlesBetween(law, from, to);
  const keys = law.a.filter(a => a[0] === 'A').map(a => a[1]);
  const body = arts.length ? arts.map(a => articleHtml(a, { names: state.names, keys, p: law.p })).join('') : `<p class="lw-none">${W(`${law.n}沒有收錄${artLabel(from)}（可能已刪除或改號）`, `Article ${from} isn’t in this law (repealed or renumbered)`)}</p>`;
  const content = h('div', { class: 'lw-peek', html: body });
  const openFull = h('button', { class: 'q-btn primary block', type: 'button', text: W('打開整部法規', 'Open the whole law'), onclick: () => (peekSheet?.close(), go(`law=${p}&a=${from}`)) });
  const lead = peekStack.length > 1 ? h('button', { class: 'lw-back', type: 'button', 'aria-label': W('上一條', 'Back'), html: ICON.back, onclick: () => (peekStack.pop(), peek(...peekStack[peekStack.length - 1], { back: true })) }) : null;
  const title = `${law.n === state.law?.n ? '' : law.n}${from === to ? artLabel(from, en) : `${artLabel(from, en)}–${to}`}`;
  if (peekSheet) peekSheet.close();
  peekSheet = sheet({ title, lead, closeLabel: W('關閉', 'Close'), cls: 'lw-peek-sheet', body: [content, h('div', { class: 'lw-peek-foot' }, [openFull])], onClose: () => (peekSheet = null) });
  // (A sheet replaced by the next link keeps the stack; closing for good clears it.)
  peekSheet.el.addEventListener('close', () => setTimeout(() => !peekSheet && (peekStack.length = 0), 0));
  if (para) flash(content.querySelector(`[data-para="${para}"]`) || content);
}

// ---- 立法: every law with bills this term ----------------------------------------------

const BILL_FILTERS = [
  ['moving', W('進行中', 'Moving')],
  ['talks', W('協商・二讀', 'Floor')],
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
  let items = state.items;
  if (billQuery) items = items.filter(it => it.n.includes(billQuery));
  if (billFilter === 'moving') items = items.filter(it => !it.dropped && !it.held && it.open && it.stage >= 1 && it.stage < PASSED);
  if (billFilter === 'talks') items = items.filter(it => !it.dropped && it.open && it.stage >= 4 && it.stage < PASSED);
  if (billFilter === 'passed') items = items.filter(it => it.stage >= PASSED);
  const shown = items.slice(0, 200);
  out.innerHTML = shown.length ? group('', shown.map(it => itemCell(it))) + (items.length > shown.length ? `<p class="lw-none">${W(`還有 ${items.length - shown.length} 項，請用搜尋`, `${items.length - shown.length} more: search to find them`)}</p>` : '') : `<p class="lw-none">${W('沒有符合的法案', 'No bills match')}</p>`;
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
  const steps = timeline(it, bills, en);
  const follow = h('button', { type: 'button', class: `lw-tool${state.mine.items[k] ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'items', k), save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.items[k])), haptic()) });
  const line = h('ol', { class: 'lw-timeline', html: steps.map(s => `<li class="${s.done ? 'done' : ''}${s.stage === it.stage ? ' now' : ''}"><b>${esc(s.name)}</b><span>${esc(s.date ? ymd(s.date) : '')}</span></li>`).join('') });
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
    })
    .catch(() => {});
  data('changes.json')
    .then(c => {
      state.changes = c;
      if (state.tab === 'laws' && !state.law) drawResults();
      if (state.tab === 'mine') drawMine();
    })
    .catch(() => {});
  await route();
  $('loading')?.setAttribute('hidden', '');
  window.__fxStarted = true;
}

await start();
keepOffline();
watchUpdates({ current: BUILD, key: 'orbitLaw', cachePrefix: 'orbit-law-', busy: () => Boolean(document.querySelector('dialog[open]')) });
