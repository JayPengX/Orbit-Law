// Orbit Law: Taiwan's laws to read, with every reference a link, the bills
// in 立法院 that will change them, and 問法律, questions answered from the
// articles themselves. Behind Quadra Pass like every Quadra/Orbit app (on a
// phone, from the Home Screen); the laws and bills are public data built
// each day onto this site (scripts/build-data.mjs), so reading costs
// nothing and works offline once opened. What's followed rides on the Pass.
//
// Tabs: 首頁 (ask, today's bills, topics), 法規 (search and topics, then a
// law to read), 問法律, 立法 (bills by stage), 追蹤 (followed and moved).

import { quadraSession, installGate, topActions, tabBar, watchUpdates, keepOffline, haptic } from '#kit/quadra.mjs';
import { h, sheet, search, toast } from '#kit/ui.mjs';
import { nameMap, parentLaw } from './lib/refs.mjs';
import { searchLaws, parseJump, ymd, relatedLaws } from './lib/search.mjs';
import { lawHtml, articleHtml, articlesBetween, contents, timeline, esc, artLabel, freshMarks } from './lib/view.mjs';
import { PASSED, PROMULGATED } from './lib/bills.mjs';
import { loadMine, saveMine, toggleFollow, markSeen, addRecent, toggleMark, isMarked, lawsChanged, newCount, today, encodeMine, decodeMine, mergeMine } from './lib/store.mjs';
import { W, en } from './lib/lang.mjs';
import { askLaw, askBill, askDiff, askError, passFetch, MAX_Q } from './lib/ask.mjs';
import { searchText, groupHits } from './lib/fulltext.mjs';
import { COURTS, courtOf, rulingUrl } from './lib/rulings.mjs';
import { noticeUrl, isOpen } from './lib/notices.mjs';
import { linkTrail } from './lib/stack.mjs';
import { TOPICS, topicOf } from './lib/topics.mjs';
import { topicTile, topicName, progress, stageShort, partyChips, shortDay, billCard, lawRow, funnel, billFunnel, diffHtml, stepOf, STEPS } from './lib/cards.mjs';
import { chatLaw, chatError, STARTERS, MAX_CHAT_Q } from './lib/chat.mjs';
import { loadChats, saveChats, putChat, renameChat, dropChat, newChatId } from './lib/chats.mjs';

const $ = id => document.getElementById(id);
const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
document.documentElement.lang = en ? 'en' : 'zh-Hant';

// ---- Quadra Pass: the Home Screen gate, the sign-in, the account button -----------------

const q = quadraSession('law', { lang: en ? 'en' : 'zh' });
window.__fxStarted = true;
const gated = installGate('law');
topActions(q);
// The AI routes count per Pass: each call carries this app's session.
const ai = passFetch(q);

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

const state = { rulingLaws: {}, lawRulings: {}, regLaws: {}, deleg: { to: {}, rest: [], from: [] }, latestRulings: [], tab: 'home', rows: [], byCode: new Map(), names: new Map(), items: [], itemsByLaw: new Map(), notices: [], noticesByLaw: new Map(), changes: { items: [] }, mine: loadMine(), law: null, showEn: false, query: '', topic: '' };
// What's followed: this phone's copy, then the Pass's (merged, written back).
let pass = null;
const save = () => {
  saveMine(state.mine);
  badge();
  if (pass) (pass.changed(), pass.sync());
};
// The 追蹤 tab's count: what moved, among what this device follows, since it last looked.
const badge = () => tabs.badge('mine', newCount(state.mine, state.items, state.changes));
let itemsReady = Promise.resolve();
let rulingsReady = Promise.resolve();
let delegReady = Promise.resolve();
let ordersReady = Promise.resolve();

// Topics, worked out once per law (by its code) or bill without a law (by name).
const topics = new Map();
function topicFor(p, name) {
  const key = p || name;
  if (!topics.has(key)) {
    const row = p && state.byCode.get(p);
    topics.set(key, topicOf(name || row?.[1] || '', row?.[3] || ''));
  }
  return topics.get(key);
}
const itemTopic = it => topicFor(it.p || '', it.n);
const rowTopic = row => topicFor(row[0], row[1]);
const shortName = n => String(n || '').replace(/^中華民國/, '');
// A law's or regulation's name by its code, in English when it has one.
const nameOf = (p, fallback = '') => { const r = state.byCode.get(p); return (en && r?.[6]) || shortName(r?.[1] || fallback); };

// ---- Tabs ------------------------------------------------------------------------------

const TABS = ['home', 'laws', 'ask', 'bills', 'mine'];
const tabs = tabBar({
  tabs: [
    { id: 'home', label: W('首頁', 'Home'), icon: 'home' },
    { id: 'laws', label: W('法規', 'Laws'), icon: 'book' },
    { id: 'ask', label: W('問法律', 'Ask'), icon: '<path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.5L6 19.5V16a2.5 2.5 0 0 1-1.5-2.3z"/><path d="M9.6 8.8a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 1.8-2.4 3"/><circle cx="12" cy="14.3" r=".4"/>' },
    { id: 'bills', label: W('立法', 'Bills'), icon: 'live' },
    { id: 'mine', label: W('追蹤', 'Following'), icon: 'star' }
  ],
  // The app keeps the address itself (#law=…, #item=…).
  hash: () => null,
  onSelect: (id, { again } = {}) => {
    if (id === 'laws') return go(again || !state.law ? 'tab=laws' : `law=${state.law.p}`);
    go(id === 'home' ? '' : `tab=${id}`);
  },
  label: W('分頁', 'Tabs')
});

function showTab(id) {
  state.tab = id;
  tabs.select(id);
  for (const t of TABS) $(`panel-${t}`).hidden = t !== id;
}
// A page's large title (and a line over it).
const pageHead = (title, over = '') => `<header class="lw-head">${over ? `<p class="lw-over">${esc(over)}</p>` : ''}<h1 class="q-large-title">${esc(title)}</h1></header>`;
const headNode = (title, over) => h('div', { html: pageHead(title, over) }).firstChild;

// ---- Routing: #law=B0000001&a=184 · #tab=bills · #item=11-01126 · #tab=ask&q=… ------------

function go(hash, { replace = false } = {}) {
  const url = hash ? `#${hash}` : location.pathname + location.search;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  route();
}
addEventListener('popstate', route);

async function route() {
  const p = new URLSearchParams(location.hash.slice(1));
  document.querySelector('dialog[open]')?.close();
  const tab = p.get('tab');
  if (p.get('law')) {
    showTab('laws');
    await openLaw(p.get('law'), p.get('a'), p.get('find'));
  } else if (tab === 'bills' || p.get('item')) {
    showTab('bills');
    drawBills();
    await itemsReady;
    if (p.get('item')) openItem(p.get('item').replace('-', ':'));
  } else if (tab === 'mine') {
    showTab('mine');
    drawMine();
  } else if (tab === 'ask') {
    showTab('ask');
    drawAsk();
    if (p.get('q')) {
      history.replaceState(null, '', '#tab=ask');
      ask(p.get('q'));
    }
  } else if (tab === 'laws') {
    state.law = null;
    state.topic = TOPICS[p.get('topic')] ? p.get('topic') : '';
    showTab('laws');
    drawLaws();
  } else {
    showTab('home');
    drawHome();
  }
  // Each screen opens with the tab bar's labels showing.
  document.documentElement.classList.remove('q-tabs-small');
}

// ---- Shared pieces ----------------------------------------------------------------------

const section = (title, body, { more = '', moreHref = '', cls = '' } = {}) =>
  body ? `<section class="q-section lw-sec${cls ? ` ${cls}` : ''}"><div class="q-section-head"><h2>${esc(title)}</h2>${more ? `<a href="${esc(moreHref)}">${esc(more)}</a>` : ''}</div>${body}</section>` : '';
const list = rows => (rows.length ? `<div class="lw-list">${rows.join('')}</div>` : '');
const rail = cards => (cards.length ? `<div class="lw-rail">${cards.join('')}</div>` : '');
const grid = cards => (cards.length ? `<div class="lw-grid">${cards.join('')}</div>` : '');

function lawSub(row) {
  const [, , level, cat, m, gone, enName] = row;
  const what = level === '命令' ? W('命令', 'Regulation') : level === '憲法' ? W('憲法', 'Constitution') : en ? (typeof enName === 'string' ? enName : '') : String(cat || '').split('＞').pop();
  return [what, m && `${W('修正', 'Rev.')} ${shortDay(m)}`, gone && W('已廢止', 'Repealed')].filter(Boolean).join(' · ');
}
// A law's row; the judgments citing it as a tag when nothing else is on the right.
const lawItem = (row, sub, extra = '', href) => lawRow(row, { topic: rowTopic(row), sub: sub ?? lawSub(row), extra: extra || (state.rulingLaws[row[0]] ? `<span class="lw-tag court">${ICON_GAVEL}${state.rulingLaws[row[0]]}</span>` : ''), href });
const ICON_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
const ICON_GAVEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 4 6 6M11.5 6.5l6 6M13 5l-5.5 5.5 6 6L19 11M10.5 13.5 4 20"/></svg>';
const countTag = (n, tone = '') => `<span class="lw-tag${tone ? ` ${tone}` : ''}">${esc(n)}</span>`;

function changeText(c) {
  const n = c.added.length + c.amended.length + c.removed.length;
  return `${W('修正', 'Amended')} ${shortDay(c.m)}${n ? ` · ${W(`${n} 條`, `${n} articles`)}` : ''}`;
}
const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const ICON_SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 3.8 2.2 6.4 6.6 7.4-4.4 1-6.1 3.6-6.6 7.4-.5-3.8-2.2-6.4-6.6-7.4 4.4-1 6.1-3.6 6.6-7.4zM19 15c.3 1.9 1.1 3 3 3.5-1.9.5-2.7 1.6-3 3.5-.3-1.9-1.1-3-3-3.5 1.9-.5 2.7-1.6 3-3.5z"/></svg>';

// ---- 首頁 ---------------------------------------------------------------------------------

const dayLine = () => new Date().toLocaleDateString(en ? 'en-US' : 'zh-TW', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Taipei' });
const LIVE = it => !it.dropped && !it.held && it.open && it.stage >= 1 && it.stage < PASSED;

function drawHome() {
  const panel = $('panel-home');
  const starters = STARTERS.map(([zh, e]) => `<a class="lw-starter" href="#tab=ask&amp;q=${encodeURIComponent(W(zh, e))}">${esc(W(zh, e))}</a>`).join('');
  const hero = `<a class="lw-hero" href="#tab=ask"><span class="lw-hero-top">${ICON_SPARK}<span>${W('問法律', 'Ask the law')}</span></span><strong>${W('遇到法律問題？用白話問', 'A legal question? Ask in plain words')}</strong><span class="lw-hero-box"><span>${W('例如：房東不退押金怎麼辦？', 'e.g. My landlord won’t return my deposit')}</span><i>${ICON_SEND}</i></span></a><div class="lw-starters rail">${starters}</div>`;

  // 立法院: the latest day anything moved, and the bills that moved last.
  const items = state.items.filter(it => !it.dropped && it.u);
  const latest = items.reduce((m, it) => (it.u > m ? it.u : m), '');
  const moved = [...items].sort((a, b) => (a.u < b.u ? 1 : a.u > b.u ? -1 : b.stage - a.stage)).slice(0, 10);
  const movedToday = items.filter(it => it.u === latest).length;
  const stats = `<div class="lw-stats">${[
    [W('審議中', 'Moving'), state.items.filter(LIVE).length, 'tab=bills&f=moving', 'indigo'],
    [W('協商・二讀', 'On the floor'), state.items.filter(it => LIVE(it) && it.stage >= 4).length, 'tab=bills&f=talks', 'orange'],
    [W('本屆三讀', 'Passed'), state.items.filter(it => it.stage >= PASSED).length, 'tab=bills&f=passed', 'green']
  ]
    .map(([l, n, href, tone]) => `<a class="lw-stat ${tone}" href="#${href}"><b>${n}</b><span>${esc(l)}</span></a>`)
    .join('')}</div>`;
  const bills = state.items.length ? stats + rail(moved.map(it => billCard(it, { topic: itemTopic(it), en }))) : `<div class="lw-rail">${'<span class="lw-bill q-skel"></span>'.repeat(3)}</div>`;
  const billsHead = latest ? W(`${shortDay(latest)} 有 ${movedToday} 案有進度`, `${movedToday} moved on ${shortDay(latest)}`) : '';

  const recent = state.mine.recent.map(p => state.byCode.get(p)).filter(Boolean).slice(0, 4);
  const amended = state.changes.items.filter(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令').slice(0, 5);

  panel.innerHTML =
    pageHead('Orbit Law', dayLine()) +
    hero +
    section(W('立法院動態', 'In 立法院'), (billsHead ? `<p class="lw-sub">${esc(billsHead)}</p>` : '') + bills, { more: W('全部', 'All'), moreHref: '#tab=bills' }) +
    section(W('最新判決', 'Latest rulings'), rail(state.latestRulings.map(rulingCard))) +
    section(W('最近看過', 'Recent'), list(recent.map(r => lawItem(r)))) +
    section(W('依主題找法規', 'Laws by topic'), state.rows.length ? topicGrid() : '') +
    section(W('最近修法', 'Just amended'), list(amended.map(c => lawItem(state.byCode.get(c.p), changeText(c), countTag(W('修正', 'New'), 'green')))), { more: W('更多', 'More'), moreHref: '#tab=laws' });
}

// A judgment as a card: its court, its matter, the day, the articles it cites (each opens).
// A card header has room for a short name only.
const COURT_SHORT = { TPS: 'Supreme Court', TPA: 'Admin. Court', JCC: 'Const. Court' };
function rulingCard([jid, d, t, cites]) {
  const court = (en ? COURT_SHORT[courtOf(jid)] : COURTS[courtOf(jid)]?.[0]) || '';
  const chips = cites.map(c => { const [p, k] = c.split(':'); const row = state.byCode.get(p); return row ? citeChip(p, k, row[1]) : ''; }).join('');
  return `<div class="lw-bill lw-ruling" style="--t:${TOPICS.justice.color}"><span class="lw-bill-top">${topicTile('justice', 'sm')}<span class="lw-bill-stage court">${esc(court)}</span><span class="lw-bill-day">${esc(shortDay(d))}</span></span><a class="lw-bill-name" href="${esc(rulingUrl(jid))}" target="_blank" rel="noopener">${esc(t || jid)}</a><span class="lw-cites">${chips}</span></div>`;
}

function topicGrid() {
  const counts = {};
  for (const r of state.rows) if (r[2] !== '命令' && !r[5]) counts[rowTopic(r)] = (counts[rowTopic(r)] || 0) + 1;
  return `<div class="lw-topics">${Object.keys(TOPICS)
    .map(id => `<a class="lw-topic" href="#tab=laws&amp;topic=${id}" style="--t:${TOPICS[id].color}">${topicTile(id)}<span>${esc(topicName(id, en))}</span><small>${counts[id] ? W(`${counts[id]} 部`, `${counts[id]}`) : ''}</small></a>`)
    .join('')}</div>`;
}

// ---- 法規: search, topics, the common laws -----------------------------------------------

const COMMON = ['中華民國憲法', '民法', '中華民國刑法', '民事訴訟法', '刑事訴訟法', '行政程序法', '勞動基準法', '道路交通管理處罰條例', '個人資料保護法', '消費者保護法'];

const box = search({ placeholder: W('法規名稱，或「民法184」', 'Law name, or 民法184'), onInput: v => ((state.query = v), drawResults()), onSubmit: v => jump(v) });

function drawLaws() {
  const panel = $('panel-laws');
  const chips = h('div', { class: 'q-chips lw-chips' }, [
    h('button', { type: 'button', class: 'q-chip', 'aria-pressed': String(!state.topic), text: W('全部', 'All'), onclick: () => go('tab=laws', { replace: true }) }),
    ...Object.keys(TOPICS).map(id => h('button', { type: 'button', class: 'q-chip lw-tchip', style: `--t:${TOPICS[id].color}`, 'aria-pressed': String(state.topic === id), html: `<i></i>${esc(topicName(id, en))}`, onclick: () => go(`tab=laws&topic=${id}`, { replace: true }) }))
  ]);
  panel.replaceChildren(headNode(state.topic ? topicName(state.topic, en) : W('法規', 'Laws')), box, chips, h('div', { id: 'results' }));
  box.hidden = false;
  drawResults();
  const on = chips.querySelector('[aria-pressed="true"]');
  if (on && state.topic) chips.scrollLeft = on.offsetLeft - 16;
}

function drawResults() {
  const out = $('results');
  if (!out) return;
  const q = state.query.trim();
  if (q) {
    const jumpTo = parseJump(state.rows, q);
    let found = searchLaws(state.rows, q);
    if (state.topic) found = found.filter(r => rowTopic(r) === state.topic);
    const jumpRow = jumpTo && lawRow([jumpTo.row[0], `${jumpTo.row[1]} ${artLabel(jumpTo.key, en)}`], { topic: rowTopic(jumpTo.row), sub: W('直接打開這一條', 'Open this article'), href: `#law=${jumpTo.row[0]}&a=${jumpTo.key}` });
    out.innerHTML = (jumpRow ? section(W('直接打開', 'Go to'), list([jumpRow])) : '') + section(W('法規', 'Laws'), list(found.map(r => lawItem(r)))) + `<div id="text-hits"></div>`;
    if (!jumpTo) textHits(q, !found.length);
    return;
  }
  if (state.topic) {
    const laws = state.rows.filter(r => r[2] !== '命令' && !r[5] && rowTopic(r) === state.topic).sort((a, b) => (a[4] < b[4] ? 1 : -1));
    const regs = state.rows.filter(r => r[2] === '命令' && rowTopic(r) === state.topic).length;
    out.innerHTML = section(W(`${laws.length} 部法律，最近修正的在前`, `${laws.length} laws, latest amended first`), list(laws.slice(0, 300).map(r => lawItem(r)))) + (regs ? `<p class="lw-none">${W(`另有 ${regs} 個命令，可用搜尋找`, `${regs} regulations too: search to find them`)}</p>` : '');
    return;
  }
  const amended = state.changes.items.filter(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令').slice(0, 8);
  out.innerHTML =
    section(W('常用', 'Common'), list(COMMON.map(n => state.rows.find(r => r[1] === n)).filter(Boolean).map(r => lawItem(r)))) +
    section(W('最近修法', 'Just amended'), list(amended.map(c => lawItem(state.byCode.get(c.p), changeText(c), countTag(W('修正', 'New'), 'green')))));
}

// 全文檢索: the laws whose articles hold the words, most articles first
// (a tap opens the law showing only those articles).
let textTimer = 0;
function textHits(q, alone) {
  clearTimeout(textTimer);
  const out = $('text-hits');
  const none = text => `<div class="q-empty lw-empty-sm"><strong>${esc(text)}</strong><p>${W('也可以到「問法律」用白話問', 'Or ask it in plain words under Ask')}</p><a class="q-btn" href="#tab=ask&amp;q=${encodeURIComponent(q)}">${W('問法律', 'Ask')}</a></div>`;
  if ([...q].length < 2) return void (alone && (out.innerHTML = none(W('找不到這個法規', 'No law by that name'))));
  textTimer = setTimeout(async () => {
    let ids;
    try {
      ids = await searchText(q, n => data(`text/${n}.json`));
    } catch {
      return;
    }
    if (state.query.trim() !== q || !document.body.contains(out)) return;
    const rows = groupHits(ids)
      .map(g => state.rows[g.law] && (!state.topic || rowTopic(state.rows[g.law]) === state.topic) && lawItem(state.rows[g.law], W(`${g.arts.length} 條提到「${q}」`, `${g.arts.length} articles mention “${q}”`), '', `#law=${state.rows[g.law][0]}&find=${encodeURIComponent(q)}`))
      .filter(Boolean);
    out.innerHTML = rows.length ? section(W('條文內容', 'In the text'), list(rows)) : alone ? none(W('沒有法規或條文提到這個', 'Nothing found')) : '';
  }, 250);
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
  if (state.law?.p !== p || !panel.querySelector('.lw-law')) {
    let law;
    try {
      law = await lawFile(p);
    } catch {
      panel.innerHTML = `<div class="q-empty"><strong>${W('這個法規打不開', 'This law can’t be opened')}</strong><p>${W('請稍後再試。', 'Try again later.')}</p></div>`;
      return;
    }
    // The bills on this law mark its articles: waited for briefly (kept by the phone after the first time).
    await Promise.race([itemsReady, new Promise(r => setTimeout(r, 1500))]);
    // A regulation's row (its name's links, its family) comes with the regulations' index.
    if (!state.byCode.has(p)) await Promise.race([ordersReady, new Promise(r => setTimeout(r, 3000))]);
    // The top courts' judgments citing its articles: marked on them (waited for briefly).
    state.lawRulings = {};
    await Promise.race([rulingsReady, new Promise(r => setTimeout(r, 1500))]);
    if (state.rulingLaws[p]) state.lawRulings = (await Promise.race([data(`rulings/${p}.json`).catch(() => ({})), new Promise(r => setTimeout(() => r({}), 2000))])) || {};
    // 授權: the regulations made under its articles, or (a regulation) what it rests on.
    state.deleg = { to: {}, rest: [], from: [] };
    await Promise.race([delegReady, new Promise(r => setTimeout(r, 1500))]);
    if (state.regLaws[p] || state.byCode.get(p)?.[2] === '命令') state.deleg = { ...state.deleg, ...((await Promise.race([data(`deleg/${p}.json`).catch(() => null), new Promise(r => setTimeout(() => r(null), 2000))])) || {}) };
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

// A regulation's 本法: the law it carries out.
const selfOf = law => (state.byCode.get(law.p)?.[2] === '命令' ? parentLaw(state.rows, law.n) : '');

async function drawLaw() {
  const law = state.law;
  const panel = $('panel-laws');
  const row = state.byCode.get(law.p) || [law.p, law.n, law.l || '', '', law.m, law.ab, 0, 0];
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
  const live = items.find(it => !it.dropped && it.stage < PROMULGATED && it.open);
  const followed = Boolean(state.mine.laws[law.p]);
  const name = (state.showEn && row[6] && (law.e || row[6])) || law.n;
  const head = h('div', { class: 'lw-bar' }, [
    h('button', { class: 'lw-back', type: 'button', 'aria-label': W('返回', 'Back'), html: ICON.back, onclick: () => (history.length > 1 && location.hash ? history.back() : go('tab=laws')) }),
    h('div', { class: 'lw-title' }, [h('h2', { text: name })]),
    h('div', { class: 'lw-tools' }, [
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('找條文', 'Find'), html: ICON.find, onclick: () => toggleFind() }),
      h('button', { type: 'button', class: `lw-tool${followed ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'laws', law.p) ? toast(W('已追蹤：修法時會標出來', 'Following: amendments will show')) : null, save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.laws[law.p])), haptic()) }),
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('更多', 'More'), html: ICON.more, onclick: () => lawMenu(law, row) })
    ])
  ]);

  // The overview: what this is at a glance, then what's moving on it.
  const topic = rowTopic(row);
  const nArts = law.a.filter(a => a[0] === 'A').length;
  const change = state.changes.items.find(c => c.p === law.p && c.m === law.m);
  const chips = [
    [row[2] === '命令' ? W('命令', 'Regulation') : law.l === '憲法' || row[2] === '憲法' ? W('憲法', 'Constitution') : W('法律', 'Act'), ''],
    [topicName(topic, en), 'topic'],
    [W(`${nArts} 條`, `${nArts} articles`), ''],
    law.m && [`${W('修正', 'Rev.')} ${ymd(law.m)}`, ''],
    law.ab && [W('已廢止', 'Repealed'), 'red']
  ].filter(Boolean);
  const partyText = live ? partyChips(live.by, en, 2).replace(/<b>/g, ' ').replace(/<[^>]+>/g, '  ').replace(/\s{2,}/g, ' · ').replace(/^ · | · $/g, '').trim() : '';
  const over = h('div', { class: 'lw-over-card', style: `--t:${TOPICS[topic].color}` }, [
    h('div', { class: 'lw-over-top', html: `${topicTile(topic, 'lg')}<div class="lw-over-name"><strong>${esc(name)}</strong><span class="lw-meta">${chips.map(([t, c]) => `<span class="lw-tag ${c}">${esc(t)}</span>`).join('')}</span></div>` }),
    change ? h('button', { type: 'button', class: 'lw-strip green', html: `<b>${W('最近修法', 'Just amended')}</b><span>${esc(changeText(change))}</span><em>${W('看修了什麼', 'What changed')}</em>`, onclick: () => diffSheet(law, change) }) : null,
    live ? h('button', { type: 'button', class: 'lw-strip indigo', html: `<b>${W('立法院審議中', 'In 立法院')}</b><span>${esc([stageShort(live, en), partyText].filter(Boolean).join(' · '))}</span><em>${W('看進度', 'Progress')}</em>${progress(live, en)}`, onclick: () => go(`item=${live.k.replace(':', '-')}`) }) : null,
    draftStrip(law),
    basisStrip(law),
    regsStrip(law),
    rulingStrip(law)
  ].filter(Boolean));
  const toc = contents(law).filter(c => c.depth <= 1);
  const chapters = toc.length > 1 ? h('div', { class: 'q-chips lw-chaps', html: toc.map(c => `<button type="button" class="q-chip" data-id="${c.id}">${esc(c.title.replace(/\s+/g, ' '))}</button>`).join(''), onclick: e => { const b = e.target.closest('[data-id]'); if (b) scrollToHeading(b.dataset.id); } }) : null;
  const fw = shown.fw ? h('p', { class: 'lw-fw', text: shown.fw }) : null;
  const body = h('div', { class: `lw-law${state.showEn ? ' en' : ''}`, html: lawHtml(shown, { names: state.names, self: selfOf(law), en: state.showEn, fresh: freshMarks(state.changes, law, en), pending: live ? Object.fromEntries(Object.entries(live.arts || {}).map(([k, n]) => [k, W(`${n} 個修正提案`, n > 1 ? `${n} proposals` : '1 proposal')])) : {}, pendingItem: live?.k.replace(':', '-'), marks: state.mine.marks.filter(m => m.p === law.p).map(m => m.k) }) });
  const find = h('div', { class: 'lw-find', hidden: true }, [search({ placeholder: W('在這部法規裡找字', 'Find in this law'), onInput: v => filterLaw(v) }), h('small', { class: 'lw-find-n' })]);
  const hint = h('p', { class: 'lw-hint', html: `${ICON_SPARK}<span>${W('點條號可以白話解釋或問 AI；點底線字看引用的條文', 'Tap an article number to explain or ask; tap underlined words to see what they cite')}</span>` });
  // ⚖ 判決 N beside each article the top courts cited.
  for (const [k, list] of Object.entries(state.lawRulings)) body.querySelector(`#a-${CSS.escape(k)} .lw-no`)?.insertAdjacentHTML('afterend', `<button type="button" class="lw-rul" data-art="${esc(k)}">${ICON_GAVEL}${W(`判決 ${list.length}`, `${list.length} ruling${list.length > 1 ? 's' : ''}`)}</button>`);
  // 📄 子法 N beside each article that calls for regulations (after any 判決 badge).
  for (const [k, list] of Object.entries(state.deleg.to)) {
    const no = body.querySelector(`#a-${CSS.escape(k)} .lw-no`);
    (no?.nextElementSibling?.classList.contains('lw-rul') ? no.nextElementSibling : no)?.insertAdjacentHTML('afterend', `<button type="button" class="lw-rul lw-regs" data-art="${esc(k)}">${ICON_DOC}${W(`子法 ${list.length}`, `${list.length} rule${list.length > 1 ? 's' : ''}`)}</button>`);
  }
  panel.replaceChildren(head, find, over, ...[chapters, hint, fw, body].filter(Boolean));
  box.hidden = true;
}

// 最高法院判決: how many cite this law, and which articles (a tap: the list, by article).
function rulingStrip(law) {
  const arts = Object.entries(state.lawRulings);
  if (!arts.length) return null;
  const n = state.rulingLaws[law.p] || new Set(arts.flatMap(([, l]) => l.map(x => x[0]))).size;
  const sorted = arts.sort((a, b) => b[1].length - a[1].length);
  return h('button', { type: 'button', class: 'lw-strip slate', html: `<b>${W('最高法院判決', 'Top-court rulings')}</b><span>${esc(W(`${n} 則判決引用 ${arts.length} 條`, `${n} cite ${arts.length} articles`))}</span><em>${W('看判決', 'See')}</em>`, onclick: () => {
    const s = sheet({ title: W(`${shortName(law.n)} · 判決`, `${nameOf(law.p, law.n)} · rulings`), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-list in-sheet', html: sorted.map(([k, l]) => `<button type="button" class="lw-row" data-k="${esc(k)}">${topicTile('justice', 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(artLabel(k, en))}</span><small>${esc(l[0][2] || '')}</small></span><span class="lw-tag court">${ICON_GAVEL}${l.length}</span></button>`).join('') }) });
    s.el.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      s.close();
      openRulings(b.dataset.k);
    });
  } });
}
// 子法: every regulation made under this law, by the article that calls for it.
function regsStrip(law) {
  const arts = Object.entries(state.deleg.to).sort((a, b) => artOrder(a[0]) - artOrder(b[0]));
  const rest = state.deleg.rest;
  const n = new Set([...arts.flatMap(([, l]) => l), ...rest].map(r => r[0])).size;
  if (!n) return null;
  const row = (p, name, label) => `<button type="button" class="lw-row" data-p="${esc(p)}">${topicTile(rowTopic(state.byCode.get(p) || [p, name, '命令']), 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(nameOf(p, name))}</span>${label ? `<small>${esc(label)}</small>` : ''}</span></button>`;
  return h('button', { type: 'button', class: 'lw-strip teal', html: `<b>${W('子法', 'Rules made under it')}</b><span>${esc(W(`${n} 個辦法、細則`, `${n} regulations`))}</span><em>${W('看子法', 'See')}</em>`, onclick: () => {
    const rows = [...arts.flatMap(([k, l]) => l.map(([p, name]) => row(p, name, artLabel(k, en)))), ...rest.map(([p, name]) => row(p, name, ''))];
    regSheet(W(`${nameOf(law.p, law.n)} · 子法`, `${nameOf(law.p, law.n)} · rules`), rows.join(''));
  } });
}
const artOrder = k => { const [a, b = 0] = k.split('-').map(Number); return a + b / 1000; };
function regSheet(title, rows) {
  const s = sheet({ title, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-list in-sheet wrap', html: rows }) });
  s.el.addEventListener('click', e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    s.close();
    go(`law=${b.dataset.p}${b.dataset.k ? `&a=${b.dataset.k}` : ''}`);
  });
}
function openRegs(k) {
  const list = state.deleg.to[k] || [];
  if (list.length === 1) return go(`law=${list[0][0]}`);
  regSheet(W(`${artLabel(k)} 的子法`, `Rules under Art. ${k}`), list.map(([p, name]) => `<button type="button" class="lw-row" data-p="${esc(p)}">${topicTile(rowTopic(state.byCode.get(p) || [p, name, '命令']), 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(nameOf(p, name))}</span></span></button>`).join(''));
}
// A regulation's 授權依據: the law and article it is made under (a tap: there).
function basisStrip(law) {
  const from = state.deleg.from.filter(([p]) => state.byCode.has(p));
  if (!from.length) return null;
  const label = ([p, k]) => `${nameOf(p)}${k ? (en ? ` Art. ${k}` : artLabel(k)) : ''}`;
  return h('button', { type: 'button', class: 'lw-strip teal', html: `<b>${W('授權依據', 'Made under')}</b><span>${esc(from.slice(0, 2).map(label).join('、') + (from.length > 2 ? W(` 等 ${from.length} 條`, ` +${from.length - 2}`) : ''))}</span><em>${W('看條文', 'Open')}</em>`, onclick: () => {
    if (from.length === 1) return go(`law=${from[0][0]}${from[0][1] ? `&a=${from[0][1]}` : ''}`);
    regSheet(W('授權依據', 'Made under'), from.map(([p, k]) => `<button type="button" class="lw-row" data-p="${esc(p)}" data-k="${esc(k)}">${topicTile(rowTopic(state.byCode.get(p)), 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(label([p, k]))}</span></span></button>`).join(''));
  } });
}

function openRulings(k) {
  const law = state.law;
  const kw = `${law.n.replace(/^中華民國/, '')}第${k.replace('-', '條之')}條`.replace(/條之(\d+)條$/, '條之$1');
  if (state.lawRulings[k]?.length) rulingsSheet(`${law.n}${artLabel(k)}`, state.lawRulings[k], kw);
}

// A ministry's draft of this law still open for comment (預告).
function draftStrip(law) {
  const draft = (state.noticesByLaw.get(law.p) || []).find(n => isOpen(n, today()));
  return draft ? h('a', { class: 'lw-strip orange', href: noticeUrl(draft.id), target: '_blank', rel: 'noopener', html: `<b>${esc(W(`${draft.gov}預告修法`, `Draft by ${draft.gov}`))}</b><span>${esc(W(`意見至 ${shortDay(draft.to)}`, `comments till ${shortDay(draft.to)}`))}</span><em>${W('去留言', 'Comment')}</em>` }) : null;
}

function scrollToHeading(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + scrollY - (document.querySelector('.lw-bar')?.offsetHeight || 0) - 8;
  scrollTo({ top: y });
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
  const place = () => el.scrollIntoView({ block: 'start' });
  place();
  requestAnimationFrame(() => requestAnimationFrame(place));
  setTimeout(place, 250);
  // (The jump scrolled the page: the tab bar keeps its labels all the same.)
  setTimeout(() => document.documentElement.classList.remove('q-tabs-small'), 400);
  flash(para ? el.querySelector(`[data-para="${para}"]`) || el : el);
}
function flash(el) {
  el.classList.remove('lw-flash');
  void el.offsetWidth;
  el.classList.add('lw-flash');
}

function showContents(law) {
  const all = contents(law);
  if (!all.length) return toast(W('這部法規沒有分章', 'No chapters in this law'));
  const s = sheet({ title: W('目錄', 'Contents'), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-toc', html: all.map(c => `<button type="button" class="d${c.depth}" data-id="${c.id}"><span>${esc(c.title)}</span>${c.first ? `<small>${esc(artLabel(c.first, en))}</small>` : ''}</button>`).join('') }) });
  s.el.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    s.close();
    scrollToHeading(b.dataset.id);
  });
}

function lawMenu(law, row) {
  const rows = [];
  if (contents(law).length) rows.push([W('目錄', 'Contents'), () => showContents(law)]);
  if (row[6] || state.showEn) rows.push([state.showEn ? '中文條文' : 'English text', () => ((state.showEn = !state.showEn), drawLaw())]);
  if (law.h) rows.push([W('沿革', 'History'), () => textSheet(W('沿革', 'History'), law.h)]);
  if (law.eff) rows.push([W('施行日期', 'In force'), () => textSheet(W('施行日期', 'In force'), law.eff)]);
  for (const it of state.itemsByLaw.get(law.p) || []) rows.push([`${W(`立法院第 ${it.term} 屆`, `立法院 term ${it.term}`)} · ${stageShort(it, en)}`, () => go(`item=${it.k.replace(':', '-')}`)]);
  for (const r of relatedLaws(state.rows, row)) rows.push([r[1], () => go(`law=${r[0]}`), W('相關法規', 'Related law')]);
  rows.push([W('全國法規資料庫原文', 'Official text (MOJ)'), () => open(`https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${law.p}`, '_blank', 'noopener')]);
  const s = sheet({ title: law.n, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'q-list' }, rows.map(([label, fn, sub]) => h('button', { class: 'q-cell chevron', type: 'button', onclick: () => (s.close(), fn()) }, [h('span', { class: 'q-cell-text' }, [h('span', { text: label }), sub ? h('small', { text: sub }) : null].filter(Boolean))]))) });
}
function textSheet(title, text) {
  sheet({ title, closeLabel: W('關閉', 'Close'), body: h('pre', { class: 'lw-pre', text }) });
}

// 修了什麼: the latest amendment, article by article, the changed words marked.
async function diffSheet(law, change) {
  const out = h('div', { class: 'lw-diffs', html: `<span class="q-skel" style="height:96px"></span>` });
  sheet({ title: `${shortName(law.n)} · ${W('修了什麼', 'What changed')}`, closeLabel: W('關閉', 'Close'), cls: 'lw-diff-sheet', body: [h('p', { class: 'lw-sub', text: changeText(change) }), out] });
  let d;
  try {
    d = await data(`diff/${law.p}.json`);
  } catch {
    d = null;
  }
  const keys = d?.arts ? Object.keys(d.arts) : [...change.added, ...change.amended, ...change.removed];
  if (d?.arts && keys.length)
    out.before(
      aiBox(W('白話說明這次修了什麼', 'Explain what changed'), async () => {
        const r = await askDiff({ p: law.p, arts: keys.slice(0, 8), lang: en ? 'en' : 'zh' }, ai);
        return r.error ? r : { ...r, html: `${r.answer ? `<p class="lw-lead">${esc(r.answer)}</p>` : ''}${r.points.length ? `<ul class="lw-points">${r.points.map(pt => `<li>${esc(pt.text)} ${pt.cites.map(c => citeChip(law.p, c, '')).join('')}</li>`).join('')}</ul>` : ''}` };
      })
    );
  out.innerHTML = keys.length
    ? keys
        .map(k => {
          const [was, now] = d?.arts?.[k] || [null, law.a.find(a => a[0] === 'A' && a[1] === k)?.[2] || null];
          const kind = !was ? ['新增', 'New', 'green'] : !now || /^[（(]刪除[）)]$/.test(now.trim()) ? ['刪除', 'Removed', 'red'] : ['修正', 'Amended', 'indigo'];
          return `<article class="lw-diff"><header><a class="lw-ref" href="#law=${esc(law.p)}&amp;a=${esc(k)}" data-law="${esc(law.p)}" data-from="${esc(k)}" data-to="${esc(k)}" data-para="0">${esc(artLabel(k, en))}</a>${countTag(W(kind[0], kind[1]), kind[2])}</header><p>${!was ? `<ins>${esc(now)}</ins>` : !now ? `<del>${esc(was)}</del>` : diffHtml(was, now)}</p></article>`;
        })
        .join('') + (d ? '' : `<p class="lw-none">${W('舊條文這次讀不到，先列出修正後的條文', 'The old text isn’t here; the articles as they are now')}</p>`)
    : `<p class="lw-none">${W('這次修正沒有條文變動', 'No articles changed')}</p>`;
}

// An article's own menu (its number tapped): explain, ask, bookmark, copy, rulings.
function articleMenu(k) {
  const law = state.law;
  const marked = isMarked(state.mine, law.p, k);
  const label = `${law.n}${artLabel(k)}`;
  const kw = `${law.n.replace(/^中華民國/, '')}第${k.replace('-', '條之')}條`.replace(/條之(\d+)條$/, '條之$1');
  const rows = [
    [W('白話解釋', 'Explain in plain words'), () => explain(law, k), 'spark'],
    [W('問法律：帶著這一條問', 'Ask about this article'), () => askWith(law, [k]), 'ask'],
    [marked ? W('取消書籤', 'Remove bookmark') : W('加入書籤', 'Bookmark'), () => (toggleMark(state.mine, law.p, k), save(), document.getElementById(`a-${k}`)?.classList.toggle('marked', !marked)), 'mark'],
    [W('複製條文', 'Copy text'), () => copyArticle(k), 'copy'],
    ...(state.lawRulings[k]?.length ? [[W(`最高法院等裁判（${state.lawRulings[k].length}）`, `Top-court rulings (${state.lawRulings[k].length})`), () => rulingsSheet(label, state.lawRulings[k], kw), 'court']] : []),
    [W('在司法院搜尋裁判', 'Search 司法院 rulings'), () => open(`https://judgment.judicial.gov.tw/LAW_Mobile_FJUD/FJUD/qryresult.aspx?kw=${encodeURIComponent(kw)}`, '_blank', 'noopener'), 'out']
  ];
  const s = sheet({ title: label, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-menu' }, rows.map(([t, fn, ic]) => h('button', { class: `lw-menu-row ${ic}`, type: 'button', onclick: () => (s.close(), fn()), html: `<i>${MENU_ICON[ic]}</i><span>${esc(t)}</span>` }))) });
}

// 白話解釋: the answer, each point with the article it cites (tap: the
// article in a sheet), suggested questions, and a box for one's own.
// `ks`: one article key, or a few (a linked range, up to 8: answered together).
function explain(law, ks) {
  ks = [].concat(ks).slice(0, 8);
  const one = ks.length === 1;
  const out = h('div', { class: 'lw-ask' });
  const input = h('input', { type: 'text', class: 'lw-ask-q', maxlength: String(MAX_Q), enterkeyhint: 'send', placeholder: W('問這一條…', 'Ask about it…') });
  const form = h('form', { class: 'lw-composer in-sheet', onsubmit: e => (e.preventDefault(), input.value.trim() && run(input.value)) }, [input, h('button', { class: 'lw-send', type: 'submit', 'aria-label': W('問', 'Ask'), html: ICON_SEND })]);
  const sugg = h('div', { class: 'lw-starters', html: [W('適用在誰身上？', 'Who does it apply to?'), W('違反會怎樣？', 'What if it’s broken?'), W('有什麼例外？', 'Any exceptions?')].map(t => `<button type="button" class="lw-starter">${esc(t)}</button>`).join(''), onclick: e => { const b = e.target.closest('button'); if (b) run(b.textContent); } });
  const note = h('p', { class: 'lw-ask-note', text: one ? W('AI 只依這一條的條文回答，不是法律意見。', 'AI, from this article’s text only. Not legal advice.') : W('AI 只依這幾條的條文回答，不是法律意見。', 'AI, from these articles’ text only. Not legal advice.') });
  sheet({ title: `${shortName(law.n)}${one ? artLabel(ks[0], en) : `${artLabel(ks[0], en)}–${ks[ks.length - 1]}`}`, closeLabel: W('關閉', 'Close'), cls: 'lw-ask-sheet', body: [out, sugg, form, note] });
  async function run(q = '') {
    out.innerHTML = `<div class="lw-answer">${q ? `<p class="lw-asked">${esc(q)}</p>` : ''}<div class="lw-typing"><i></i><i></i><i></i></div></div>`;
    const r = await askLaw({ p: law.p, arts: ks, q, lang: en ? 'en' : 'zh' }, ai);
    if (r.error) return void (out.innerHTML = `<div class="lw-answer"><p class="lw-none">${esc(askError(r.error, en))}</p></div>`);
    const points = r.points.map(pt => `<li>${esc(pt.text)} ${pt.cites.map(c => citeChip(law.p, c, '')).join('')}</li>`).join('');
    out.innerHTML = `<div class="lw-answer">${q ? `<p class="lw-asked">${esc(q)}</p>` : ''}${r.covered ? `${r.answer ? `<p class="lw-lead">${esc(r.answer)}</p>` : ''}<ul class="lw-points">${points}</ul>` : `<p>${esc(r.answer || (one ? W('這一條沒有規定這件事。', 'This article doesn’t cover that.') : W('這幾條沒有規定這件事。', 'These articles don’t cover that.')))}</p>`}</div>`;
  }
  run();
}

// An AI explanation on a tap: the button, then the answer in its place.
function aiBox(label, run) {
  const el = h('div', { class: 'lw-ai' });
  const btn = h('button', { type: 'button', class: 'lw-ai-btn', html: `${ICON_SPARK}<span>${esc(label)}</span>` });
  btn.addEventListener('click', async () => {
    el.innerHTML = `<div class="lw-msg ai"><div class="lw-typing"><i></i><i></i><i></i></div></div>`;
    const r = await run();
    el.innerHTML = r.error ? `<div class="lw-msg ai thin"><p class="lw-none">${esc(askError(r.error, en))}</p></div>` : `<div class="lw-msg ai${r.covered ? '' : ' thin'}">${r.html}<p class="lw-srcs">${W('AI 依條文回答，不是法律意見', 'AI, from the text only. Not legal advice')}${r.left != null ? ` · ${W(`今天還能問 ${r.left} 次`, `${r.left} left today`)}` : ''}</p></div>`;
  });
  el.append(btn);
  return el;
}

// A cited article as a chip: a tap opens it over the page (peek).
const citeChip = (p, k, n) => `<a class="lw-ref lw-cite" href="#law=${esc(p)}&amp;a=${esc(k)}" data-law="${esc(p)}" data-from="${esc(k)}" data-to="${esc(k)}" data-para="0">${esc(n ? `${shortName(n)} ` : '')}${esc(en ? `Art. ${k}` : `第${k}條`)}</a>`;

// The top courts' rulings citing an article (newest first), each opening at 司法院.
function rulingsSheet(label, rulings, kw) {
  const rows = rulings.map(([jid, d, t]) => `<a class="q-cell" href="${esc(rulingUrl(jid))}" target="_blank" rel="noopener"><span class="q-cell-text"><span>${esc(t || jid)}</span><small>${[COURTS[courtOf(jid)]?.[en ? 1 : 0], jid.split(',').slice(1, 4).join(' '), ymd(d)].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join(' · ')}</small></span></a>`).join('');
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
  const sub = e.target.closest('.lw-regs');
  if (sub) return openRegs(sub.dataset.art);
  const rul = e.target.closest('.lw-rul');
  if (rul) return openRulings(rul.dataset.art);
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
  const body = arts.length ? arts.map(a => articleHtml(a, { names: state.names, self: selfOf(law), keys, p: law.p })).join('') : `<p class="lw-none">${W(`${law.n}沒有收錄${artLabel(from)}（可能已刪除或改號）`, `Article ${from} isn’t in this law (repealed or renumbered)`)}</p>`;
  const content = h('div', { class: 'lw-peek', html: body });
  const openFull = h('button', { class: 'q-btn block', type: 'button', text: W('打開整部法規', 'Open the whole law'), onclick: () => (trail.current?.close(), go(`law=${p}&a=${from}`)) });
  const lead = trail.length + (back ? 0 : 1) > 1 ? h('button', { class: 'lw-back', type: 'button', 'aria-label': W('上一條', 'Back'), html: ICON.back, onclick: () => { const prev = trail.back(); if (prev) peek(...prev, { back: true }); } }) : null;
  const title = `${law.n === state.law?.n ? '' : shortName(law.n)}${from === to ? artLabel(from, en) : `${artLabel(from, en)}–${to}`}`;
  // 白話解釋 of what's shown: the article, or a range of up to 8 together.
  const live = arts.filter(a => !/^[（(]刪除[）)]$/.test(a[2].trim())).map(a => a[1]);
  const explainBtn = live.length && live.length <= 8 ? h('button', { class: 'q-btn primary block lw-spark-btn', type: 'button', html: `${ICON_SPARK}<span>${live.length > 1 ? W(`白話解釋這 ${live.length} 條`, `Explain these ${live.length}`) : W('白話解釋', 'Explain in plain words')}</span>`, onclick: () => (trail.current?.close(), explain(law, live)) }) : null;
  const s = sheet({ title, lead, closeLabel: W('關閉', 'Close'), cls: 'lw-peek-sheet', body: [content, h('div', { class: 'lw-peek-foot' }, [explainBtn, openFull].filter(Boolean))], onClose: () => trail.closed(s) });
  // The new sheet is on the trail before the old one closes (its close lands late).
  trail.show(s, [p, from, to, para], { back })?.close();
  if (para) flash(content.querySelector(`[data-para="${para}"]`) || content);
}

// ---- 問法律: questions answered from the articles, each point citing one ----------------

const chat = { id: newChatId(), turns: [], pin: null, busy: false };
// Saved chats (on this phone): every answered chat, newest first.
let chats = loadChats();
const keepChat = () => (chats = saveChats(putChat(chats, chat)));
function newChat() {
  if (chat.busy) return;
  Object.assign(chat, { id: newChatId(), turns: [], pin: null });
  drawPin();
  drawChat();
}
function openChat(id) {
  const c = chats.find(x => x.id === id);
  if (!c || chat.busy) return;
  Object.assign(chat, { id: c.id, turns: c.turns.map(t => ({ ...t })), pin: c.pin });
  drawPin();
  drawChat();
  requestAnimationFrame(() => [...document.querySelectorAll('#chat .lw-msg.me')].pop()?.scrollIntoView({ block: 'start' }));
}

// 對話紀錄: the saved chats; a tap continues one, … renames or deletes it.
function chatHistory() {
  const when = u => { const d = new Date(u); return d.toDateString() === new Date().toDateString() ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : `${d.getMonth() + 1}/${d.getDate()}`; };
  const rows = () =>
    chats.length
      ? chats.map(c => `<div class="lw-chat-row${c.id === chat.id ? ' on' : ''}"><button type="button" class="lw-chat-open" data-id="${esc(c.id)}"><span class="lw-row-name">${esc(c.t)}</span><small>${esc(when(c.u))} · ${esc(((n) => W(`${n} 個問題`, `${n} question${n > 1 ? 's' : ''}`))(c.turns.filter(t => t.role === 'user').length))}</small></button><button type="button" class="lw-chat-more" data-more="${esc(c.id)}" aria-label="${W('更多', 'More')}">${ICON.more}</button></div>`).join('') + `<button type="button" class="lw-chat-clear">${W('刪除全部對話', 'Delete all chats')}</button>`
      : `<p class="lw-none">${W('還沒有對話。問的問題會存在這支手機上。', 'No chats yet. Your questions are kept on this phone.')}</p>`;
  const body = h('div', { class: 'lw-chat-list', html: rows() });
  const s = sheet({ title: W('對話紀錄', 'Chats'), closeLabel: W('關閉', 'Close'), body });
  body.addEventListener('click', e => {
    const o = e.target.closest('.lw-chat-open');
    if (o) return void (s.close(), openChat(o.dataset.id));
    const m = e.target.closest('.lw-chat-more');
    if (m) {
      const c = chats.find(x => x.id === m.dataset.more);
      const menu = sheet({ title: c.t, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-menu' }, [
        h('button', { class: 'lw-menu-row ask', type: 'button', html: `<i>${MENU_ICON.ask}</i><span>${W('繼續這個對話', 'Continue')}</span>`, onclick: () => (menu.close(), s.close(), openChat(c.id)) }),
        h('form', { class: 'lw-rename', onsubmit: e => {
          e.preventDefault();
          chats = saveChats(renameChat(chats, c.id, e.currentTarget.elements.t.value));
          body.innerHTML = rows();
          menu.close();
        } }, [h('i', { html: MENU_ICON.edit }), h('input', { name: 't', value: c.t, maxlength: '60', enterkeyhint: 'done', 'aria-label': W('對話名稱', 'Chat name') }), h('button', { type: 'submit', text: W('改名', 'Rename') })]),
        h('button', { class: 'lw-menu-row warn', type: 'button', html: `<i>${MENU_ICON.trash}</i><span>${W('刪除', 'Delete')}</span>`, onclick: () => {
          chats = saveChats(dropChat(chats, c.id));
          if (c.id === chat.id) newChat();
          body.innerHTML = rows();
          menu.close();
          toast(W('已刪除', 'Deleted'));
        } })
      ]) });
      return;
    }
    if (e.target.closest('.lw-chat-clear') && confirm(W('刪除這支手機上的全部對話？', 'Delete every chat on this phone?'))) {
      chats = saveChats([]);
      newChat();
      body.innerHTML = rows();
    }
  });
}

function askWith(law, ks) {
  chat.pin = { p: law.p, n: law.n, arts: ks.slice(0, 8) };
  go('tab=ask');
}

function drawAsk() {
  const panel = $('panel-ask');
  if (!panel.firstChild) {
    const input = h('textarea', { class: 'lw-ask-q', rows: '1', maxlength: String(MAX_CHAT_Q), enterkeyhint: 'send', placeholder: W('用白話問法律問題…', 'Ask a legal question…') });
    input.addEventListener('input', () => ((input.style.height = 'auto'), (input.style.height = `${Math.min(120, input.scrollHeight)}px`)));
    const form = h('form', { class: 'lw-composer' }, [h('div', { class: 'lw-pin', hidden: true }), input, h('button', { class: 'lw-send', type: 'submit', 'aria-label': W('送出', 'Send'), html: ICON_SEND })]);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v || chat.busy) return;
      input.value = '';
      input.style.height = 'auto';
      ask(v);
    });
    input.addEventListener('keydown', e => e.key === 'Enter' && !e.shiftKey && !e.isComposing && (e.preventDefault(), form.requestSubmit()));
    const tools = h('div', { class: 'lw-ask-tools' }, [
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('對話紀錄', 'Chats'), html: MENU_ICON.history, onclick: () => chatHistory() }),
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('新對話', 'New chat'), html: MENU_ICON.edit, onclick: () => newChat() })
    ]);
    panel.append(h('div', { class: 'lw-ask-head' }, [headNode(W('問法律', 'Ask the law')), tools]), h('div', { class: 'lw-chat', id: 'chat' }), form);
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-ask]');
      if (b) ask(b.dataset.ask);
      if (e.target.closest('.lw-pin-x')) ((chat.pin = null), drawPin());
      if (e.target.closest('.lw-new')) newChat();
    });
  }
  drawPin();
  drawChat();
}

function drawPin() {
  const el = document.querySelector('.lw-pin');
  if (!el) return;
  el.hidden = !chat.pin;
  if (chat.pin) el.innerHTML = `<span>${W('帶著', 'With')} ${esc(shortName(chat.pin.n))} ${esc(chat.pin.arts.map(k => artLabel(k, en)).join('、'))}</span><button type="button" class="lw-pin-x" aria-label="${W('移除', 'Remove')}">×</button>`;
}

function drawChat() {
  const out = $('chat');
  if (!out) return;
  if (!chat.turns.length) {
    out.innerHTML = `<div class="lw-ask-empty"><span class="lw-orb">${ICON_SPARK}</span><strong>${W('用白話問，回答附上條文', 'Ask in plain words, answered with the articles')}</strong><p>${W('從全部法律和命令裡找出相關條文，說明你可以怎麼做、會有什麼後果、該找哪個機關。', 'It finds the articles across every law and regulation, then says what you can do, what follows and who to contact.')}</p><div class="lw-starters col">${STARTERS.map(([zh, e]) => `<button type="button" class="lw-starter" data-ask="${esc(W(zh, e))}">${esc(W(zh, e))}</button>`).join('')}</div><p class="lw-ask-note">${W('AI 只依找到的條文回答，不是法律意見。', 'AI, from the articles it found only. Not legal advice.')}</p></div>`;
    return;
  }
  out.innerHTML = chat.turns.map(turnHtml).join('') + (chat.busy ? '' : `<button type="button" class="lw-new">${W('開始新對話', 'New chat')}</button>`);
}

function turnHtml(t) {
  if (t.role === 'user') return `<div class="lw-msg me"><p>${esc(t.text)}</p></div>`;
  if (t.wait) return `<div class="lw-msg ai"><div class="lw-typing"><i></i><i></i><i></i></div><small class="lw-srcs">${W('找條文中…', 'Finding the articles…')}</small></div>`;
  if (t.error) return `<div class="lw-msg ai"><p class="lw-none">${esc(chatError(t.error, en))}</p></div>`;
  const r = t.r;
  const name = new Map(r.sources.map(s => [`${s.p}:${s.key}`, s.n]));
  const chips = cites => cites.map(c => { const [p, k] = c.split(':'); return citeChip(p, k, name.get(c)); }).join('');
  const block = (cls, icon, title, inner) => `<div class="lw-block ${cls}"><h4><i>${icon}</i>${esc(title)}</h4>${inner}</div>`;
  const parts = [
    r.answer ? `<p class="lw-lead">${esc(r.answer)}</p>` : '',
    r.points.length ? `<ul class="lw-points">${r.points.map(pt => `<li>${esc(pt.text)} ${chips(pt.cites)}</li>`).join('')}</ul>` : '',
    r.consequences.length ? block('red', MENU_ICON.warn, W('後果', 'What follows'), `<ul class="lw-points">${r.consequences.map(pt => `<li>${esc(pt.text)} ${chips(pt.cites)}</li>`).join('')}</ul>`) : '',
    r.agency ? block('blue', MENU_ICON.gov, W('找哪個機關', 'Who to contact'), `<p>${esc(r.agency)}</p>`) : '',
    r.next.length ? block('green', MENU_ICON.steps, W('下一步', 'Next steps'), `<ol class="lw-steps">${r.next.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`) : '',
    r.sources.length ? `<p class="lw-srcs">${W(`依據 ${r.sources.length} 條條文`, `From ${r.sources.length} articles`)}${r.left != null ? ` · ${W(`今天還能問 ${r.left} 次`, `${r.left} left today`)}` : ''}</p>` : ''
  ].join('');
  const follow = r.followups.length ? `<div class="lw-starters">${r.followups.map(f => `<button type="button" class="lw-starter" data-ask="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : '';
  return `<div class="lw-msg ai${r.covered ? '' : ' thin'}">${parts}</div>${follow}`;
}

async function ask(text) {
  if (chat.busy) return;
  if (state.tab !== 'ask') {
    showTab('ask');
    drawAsk();
  }
  chat.busy = true;
  const history = chat.turns.filter(t => t.role === 'user' || t.r).map(t => (t.role === 'user' ? { role: 'user', text: t.text } : { role: 'model', text: t.r.answer, cites: t.r.points.flatMap(p => p.cites) }));
  chat.turns.push({ role: 'user', text }, { role: 'model', wait: true });
  drawChat();
  [...document.querySelectorAll('#chat .lw-msg.me')].pop()?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const pin = chat.pin ? [{ p: chat.pin.p, arts: chat.pin.arts }] : [];
  const r = await chatLaw({ q: text, history, pin, lang: en ? 'en' : 'zh' }, { fetcher: ai });
  chat.turns[chat.turns.length - 1] = r.error ? { role: 'model', error: r.error } : { role: 'model', r };
  chat.busy = false;
  keepChat();
  drawChat();
}

// ---- 立法: every law with bills this term, by stage --------------------------------------

const BILL_FILTERS = [
  ['moving', W('審議中', 'Moving')],
  ['talks', W('協商・二讀', 'Floor')],
  ['passed', W('已三讀', 'Passed')],
  ['notice', W('預告', 'Drafts')],
  ['all', W('全部', 'All')]
];
let billFilter = 'moving';
let billQuery = '';
let billStep = -1;
let billMore = {};
const billBox = search({ placeholder: W('搜尋法案，例如「長照」', 'Search bills'), onInput: v => ((billQuery = v.trim()), (billMore = {}), drawBillList()) });

function drawBills() {
  const panel = $('panel-bills');
  const f = new URLSearchParams(location.hash.slice(1)).get('f');
  if (f && BILL_FILTERS.some(([id]) => id === f)) ((billFilter = f), (billStep = -1));
  if (!panel.firstChild) {
    const chips = h('div', { class: 'q-chips lw-chips', role: 'tablist' }, BILL_FILTERS.map(([id, label]) => h('button', { type: 'button', class: 'q-chip', role: 'tab', 'data-f': id, text: label, onclick: () => setBillFilter(id) })));
    panel.append(headNode(W('立法', 'Bills'), W('立法院第 11 屆', 'Legislative Yuan, term 11')), billBox, h('div', { id: 'bill-funnel' }), chips, h('div', { id: 'bill-list' }));
    panel.addEventListener('click', e => {
      const col = e.target.closest('.lw-funnel-col');
      if (col) {
        billStep = billStep === Number(col.dataset.step) ? -1 : Number(col.dataset.step);
        if (billStep < 0) billFilter = 'moving';
        billMore = {};
        return drawBillList();
      }
      const more = e.target.closest('[data-more]');
      if (more) ((billMore[more.dataset.more] = (billMore[more.dataset.more] || 0) + 40), drawBillList());
    });
  }
  drawBillList();
}
function setBillFilter(id) {
  billFilter = id;
  billStep = -1;
  billMore = {};
  drawBillList();
}

function drawBillList() {
  const out = $('bill-list');
  if (!out) return;
  document.querySelectorAll('.lw-chips [data-f]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.f === billFilter && billStep < 0)));
  const fn = $('bill-funnel');
  if (fn) {
    const c = state.billCounts;
    fn.innerHTML = !state.items.length ? '' : c ? `<p class="lw-funnel-cap">${esc(W(`本屆 ${c.total.toLocaleString()} 份提案，涉及 ${state.items.length} 部法律`, `${c.total.toLocaleString()} bills this term, on ${state.items.length} laws`))}</p>${billFunnel(c, en)}` : funnel(state.items, en);
    fn.querySelectorAll('.lw-funnel-col').forEach(c => c.classList.toggle('on', Number(c.dataset.step) === billStep));
  }
  if (!state.items.length) return void (out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(4)}</div>`);
  if (billFilter === 'notice' && billStep < 0) return void (out.innerHTML = noticeList());
  let items = state.items;
  if (billQuery) items = items.filter(it => it.n.includes(billQuery));
  // (By bill: 提案 = items with a version not yet read; 審查 takes in 二讀, 三讀 公布.)
  if (billStep >= 0 && state.billCounts) items = items.filter(it => !it.dropped && (billStep === 0 ? it.w > 0 : billStep === 3 ? it.stage >= PASSED : it.open && (billStep === 1 ? stepOf(it.stage) === 1 : [2, 3].includes(stepOf(it.stage)))));
  else if (billStep >= 0) items = items.filter(it => !it.dropped && stepOf(it.stage) === billStep && (it.open || it.stage >= PASSED));
  else if (billFilter === 'moving') items = items.filter(LIVE);
  else if (billFilter === 'talks') items = items.filter(it => LIVE(it) && it.stage >= 4);
  else if (billFilter === 'passed') items = items.filter(it => it.stage >= PASSED);
  if (!items.length) return void (out.innerHTML = `<div class="q-empty lw-empty-sm"><strong>${W('沒有符合的法案', 'No bills match')}</strong></div>`);
  // Grouped by the step reached, furthest first; held and withdrawn last.
  const groups = new Map();
  for (const it of [...items].sort((a, b) => (a.u < b.u ? 1 : -1))) {
    const g = billStep === 0 && state.billCounts ? 'filed' : it.dropped ? 'dropped' : it.held ? 'held' : String(stepOf(it.stage));
    groups.set(g, [...(groups.get(g) || []), it]);
  }
  const order = ['filed', '5', '4', '3', '2', '1', '0', 'held', 'dropped'];
  const title = g => (g === 'filed' ? W('有新提案等一讀', 'New bills waiting for a 1st reading') : g === 'held' ? W('暫緩', 'On hold') : g === 'dropped' ? W('已撤回', 'Withdrawn') : g === '5' ? W('已公布', 'Now law') : g === '4' ? W('已三讀', 'Passed') : g === '2' ? W('委員會審查・協商', 'Committee & talks') : g === '3' ? W('二讀', '2nd reading') : g === '1' ? W('一讀', '1st reading') : STEPS[g][en ? 1 : 0]);
  out.innerHTML = order
    .filter(g => groups.has(g))
    .map(g => {
      const all = groups.get(g);
      const n = 20 + (billMore[g] || 0);
      const more = all.length > n ? `<button type="button" class="lw-more" data-more="${g}">${W(`再顯示 ${Math.min(40, all.length - n)} 項（共 ${all.length}）`, `Show ${Math.min(40, all.length - n)} more (${all.length})`)}</button>` : '';
      return `<section class="q-section lw-sec"><div class="q-section-head"><h2>${esc(title(g))}</h2><span class="lw-count">${all.length}</span></div>${grid(all.slice(0, n).map(it => billCard(it, { topic: itemTopic(it), en, wide: true })))}${more}</section>`;
    })
    .join('');
}

// 預告: ministries' drafts open for comment on join.gov.tw (open ones first),
// the step before 行政院 sends a bill to 立法院.
function noticeList() {
  const day = today();
  let rows = state.notices;
  if (billQuery) rows = rows.filter(n => n.t.includes(billQuery) || n.gov.includes(billQuery));
  const open = rows.filter(n => isOpen(n, day)), closed = rows.filter(n => !isOpen(n, day));
  const html = section(W('開放意見中', 'Open for comment'), grid(open.map(n => noticeCard(n, day)))) + section(W('已截止', 'Closed'), grid(closed.slice(0, 60).map(n => noticeCard(n, day))));
  return html || `<div class="q-empty lw-empty-sm"><strong>${W('目前沒有預告中的修法', 'No drafts open for comment')}</strong></div>`;
}
function noticeCard(n, day) {
  const openNow = isOpen(n, day);
  const topic = topicOf(n.t, '');
  const when = openNow ? W(`意見至 ${shortDay(n.to)}`, `till ${shortDay(n.to)}`) : W(`${shortDay(n.to)} 截止`, `closed ${shortDay(n.to)}`);
  return `<a class="lw-bill wide notice${openNow ? '' : ' closed'}" href="${esc(noticeUrl(n.id))}" target="_blank" rel="noopener" style="--t:${TOPICS[topic].color}"><span class="lw-bill-top">${topicTile(topic, 'sm')}<span class="lw-bill-stage">${openNow ? W('開放意見', 'Open') : W('已截止', 'Closed')}</span><span class="lw-bill-day">${esc(when)}</span></span><span class="lw-bill-name">${esc(n.t)}</span><span class="lw-bill-foot"><span class="lw-party" style="--p:#64748b">${esc(n.gov)}</span></span></a>`;
}

// A bill item: where it stands, who proposed it, what it changes (the
// newest version's 對照表, changed words marked), its steps and versions.
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
  const topic = itemTopic(it);
  const steps = timeline(it, bills, en, state.noticesByLaw.get(it.p));
  const follow = h('button', { type: 'button', class: `lw-tool${state.mine.items[k] ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'items', k) && toast(W('已追蹤：有進度會標出來', 'Following: progress will show')), save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.items[k])), haptic()) });
  const tone = it.dropped ? '' : it.held ? 'orange' : it.stage >= PASSED ? 'green' : 'indigo';
  const top = h('div', { class: 'lw-item-head', style: `--t:${TOPICS[topic].color}`, html: `${topicTile(topic, 'lg')}<span class="lw-meta">${countTag(stageShort(it, en), tone)}${countTag(topicName(topic, en), 'topic')}${it.u ? `<span class="lw-day">${esc(W(`${shortDay(it.u)} 更新`, `updated ${shortDay(it.u)}`))}</span>` : ''}</span>` });
  const prog = h('div', { class: 'lw-item-prog', html: progress(it, en, { labels: true }) });
  const who = it.by?.length ? h('div', { class: 'lw-item-who', html: `<h4>${W('誰提的', 'Proposed by')}</h4><div class="lw-parties">${partyChips(it.by, en, 6)}</div>` }) : null;
  const changes = h('div', { class: 'lw-item-diff', html: `<h4>${W('修什麼', 'What it changes')}</h4><div class="lw-diffs"><span class="q-skel" style="height:72px"></span></div>` });
  const line = h('details', { class: 'lw-fold' }, [h('summary', { text: W('審議過程', 'Steps so far') }), h('ol', { class: 'lw-timeline', html: steps.map(s => `<li class="${s.done ? 'done' : ''}${s.stage === it.stage ? ' now' : ''}"><b>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.by ? `${s.by}${s.name}` : s.name)}</a>` : esc(s.name)}</b><span>${esc(s.date ? ymd(s.date) : '')}</span></li>`).join('') })]);
  const versions = [...bills].sort((a, b) => (a.u < b.u ? 1 : -1));
  const vlist = h('details', { class: 'lw-fold' }, [
    h('summary', { text: W(`${bills.length} 個版本`, `${bills.length} versions`) }),
    h(
      'div',
      { class: 'lw-versions' },
      versions.map(b =>
        h('details', { class: 'lw-version', ontoggle: e => e.currentTarget.open && compareBill(b, e.currentTarget.querySelector('.lw-compare')) }, [
          h('summary', {}, [h('span', { text: b.t }), h('small', { text: [b.by, b.st, b.u && ymd(b.u)].filter(Boolean).join(' · ') })]),
          h('div', { class: 'lw-compare lw-diffs', text: W('讀取對照表…', 'Loading…') })
        ])
      )
    )
  ]);
  const openLawBtn = it.p ? h('button', { class: 'q-btn block', type: 'button', text: W('打開現行法規', 'Open the law in force'), onclick: () => (s.close(), go(`law=${it.p}`)) }) : null;
  const s = sheet({ title: W('法案', 'Bill'), lead: follow, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [h('h2', { class: 'lw-item-name', text: it.n }), top, prog, who, changes, line, vlist, openLawBtn].filter(Boolean), onClose: () => location.hash.startsWith('#item=') && history.replaceState(null, '', '#tab=bills') });
  // What it changes: the newest version with a table (a just-filed one may not have it yet).
  const order = [...new Set([bills.find(b => b.id === it.top), ...versions].filter(Boolean))];
  if (!order.length) return void changes.remove();
  (async () => {
    let pick = order[0];
    for (const b of order.slice(0, 4)) {
      const rows = await tableOf(b.id).catch(() => null);
      if (rows?.length) {
        pick = b;
        break;
      }
    }
    changes.querySelector('h4').after(
      aiBox(W('白話說明這個法案', 'Explain this bill'), async () => {
        const r = await askBill({ bill: pick.id, lang: en ? 'en' : 'zh' }, ai);
        return r.error ? r : { ...r, html: `${r.answer ? `<p class="lw-lead">${esc(r.answer)}</p>` : ''}${r.changes.length ? `<ul class="lw-points">${r.changes.map(c => `<li>${esc(c.text)}${c.article ? ` <span class="lw-cite">${esc(/^\d/.test(c.article) ? (en ? `Art. ${c.article}` : `第${c.article}條`) : c.article)}</span>` : ''}</li>`).join('')}</ul>` : ''}${r.who.length ? `<div class="lw-block blue"><h4><i>${MENU_ICON.gov}</i>${W('影響到誰', 'Who it affects')}</h4><div class="lw-meta">${r.who.map(w => countTag(w)).join('')}</div></div>` : ''}` };
      })
    );
    if (pick !== order[0]) changes.querySelector('h4').insertAdjacentHTML('beforeend', `<small> · ${esc(pick.by || '')}${W('的版本', '’s version')}</small>`);
    compareBill(pick, changes.querySelector('.lw-diffs'), { first: 3 });
  })();
}

// A version's 對照表 (old and new text, article by article), from the
// 立法院 API on first opening only: the changed words marked, the 說明 folded.
const tables = new Map();
function tableOf(id) {
  if (!tables.has(id))
    tables.set(
      id,
      fetch(`https://v2.ly.govapi.tw/bill/${encodeURIComponent(id)}`)
        .then(r => r.json())
        .then(j => (j?.data?.['對照表'] || []).flatMap(t => t.rows || []))
        .catch(e => (tables.delete(id), Promise.reject(e)))
    );
  return tables.get(id);
}
async function compareBill(b, out, { first = 60 } = {}) {
  if (!out || out.dataset.done) return;
  out.dataset.done = '1';
  try {
    const rows = await tableOf(b.id);
    const card = row => {
      const now = row['修正'] || row['增訂'] || '';
      const old = row['現行'] || '';
      const art = (now || old).match(/^\s*(第[一二三四五六七八九十百零〇\d]+條(之[一二三四五六七八九十\d]+)?)/)?.[1] || '';
      const kind = row['增訂'] || !old ? ['增訂', 'New', 'green'] : /^\s*(第\S+?條(之\S+?)?)?\s*[（(]?刪除[)）]?\s*$/.test(now) ? ['刪除', 'Removed', 'red'] : ['修正', 'Amended', 'indigo'];
      const text = kind[0] === '修正' ? diffHtml(old, now) : kind[0] === '增訂' ? `<ins>${esc(now)}</ins>` : `<del>${esc(old)}</del>`;
      return `<article class="lw-diff"><header><b>${esc(art || W('條文', 'Article'))}</b>${countTag(W(kind[0], kind[1]), kind[2])}</header><p>${text}</p>${row['說明'] ? `<details class="lw-why"><summary>${W('立法說明', 'Why')}</summary><p>${esc(row['說明'])}</p></details>` : ''}</article>`;
    };
    const rest = rows.length > first ? `<button type="button" class="lw-more">${W(`看全部 ${Math.min(60, rows.length)} 條`, `All ${Math.min(60, rows.length)} articles`)}</button>` : '';
    out.innerHTML = (rows.length ? rows.slice(0, first).map(card).join('') + rest : `<p class="lw-none">${W('這個版本沒有對照表', 'No comparison table for this version')}</p>`) + `<a class="lw-out" href="https://ppg.ly.gov.tw/ppg/bills/${esc(b.id)}/details" target="_blank" rel="noopener">${W('立法院議事暨公報資訊網', 'On the 立法院 site')}</a>`;
    const btn = out.querySelector('.lw-more');
    btn?.addEventListener('click', () => (btn.outerHTML = rows.slice(first, 60).map(card).join('')));
  } catch {
    out.dataset.done = '';
    out.innerHTML = `<p class="lw-none">${W('對照表讀不到，請稍後再試', 'Couldn’t load the table')}</p>`;
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
  const news = changedLaws.map(c => lawItem(state.byCode.get(c.p), changeText(c), countTag(W('新', 'New'), 'green')));
  const html =
    section(W('自上次查看後的變動', 'New since you last looked'), (moved.length ? grid(moved.map(it => billCard(it, { topic: itemTopic(it), en, wide: true }))) : '') + list(news)) +
    section(W('追蹤的法案', 'Bills'), grid(items.filter(it => !moved.includes(it)).map(it => billCard(it, { topic: itemTopic(it), en, wide: true })))) +
    section(W('追蹤的法規', 'Laws'), list(laws.map(r => lawItem(r)))) +
    section(W('書籤', 'Bookmarks'), list(marks.map(x => lawItem(x.row, artLabel(x.k, en), '', `#law=${x.p}&a=${x.k}`))));
  $('panel-mine').innerHTML =
    pageHead(W('追蹤', 'Following')) +
    (html ||
      `<div class="lw-empty"><span class="lw-orb star">${ICON.star}</span><strong>${W('追蹤法規和法案', 'Follow laws and bills')}</strong><p>${W('在法規或法案上按 ☆，修法和審議進度會出現在這裡，有變動時分頁上會有數字。', 'Tap ☆ on a law or a bill: amendments and progress show here, with a count on the tab when something moves.')}</p><div class="lw-empty-acts"><a class="q-btn primary" href="#tab=bills">${W('看立法動態', 'See bills')}</a><a class="q-btn" href="#tab=laws">${W('瀏覽法規', 'Browse laws')}</a></div></div>`);
}

// ---- Icons (the app's own, line-drawn) ------------------------------------------------

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  find: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  back: svg('<path d="M15 4 7 12l8 8"/>')
};
const MENU_ICON = {
  spark: ICON_SPARK,
  ask: svg('<path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.5L6 19.5V16a2.5 2.5 0 0 1-1.5-2.3z"/>'),
  mark: svg('<path d="M7 4h10v16l-5-3.5L7 20z"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>'),
  court: svg('<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7 3 12a2.5 2.5 0 0 0 4 0zM19 7l-2 5a2.5 2.5 0 0 0 4 0z"/>'),
  out: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'),
  warn: svg('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>'),
  gov: svg('<path d="M4 20h16M5 17h14M6 17V10M10 17V10M14 17V10M18 17V10M3.5 10h17L12 4z"/>'),
  history: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4M12 8v4.5l3 2"/>'),
  edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>'),
  steps: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>')
};

// ---- Opening ---------------------------------------------------------------------------

async function start() {
  try {
    const index = await data('index.json');
    state.rows = index.laws;
    state.byCode = new Map(index.laws.map(r => [r[0], r]));
    state.names = nameMap(index.laws);
  } catch {
    $('panel-home').innerHTML = `<div class="q-empty"><strong>${W('法規資料讀不到', 'The laws couldn’t be loaded')}</strong><p>${W('請連上網路再打開一次。', 'Connect and open again.')}</p></div>`;
  }
  const redraw = () => {
    if (state.tab === 'home') drawHome();
    if (state.tab === 'laws' && !state.law) drawResults();
    if (state.tab === 'mine') drawMine();
  };
  // 命令 (regulations): their own index, after the laws' (appended, so the
  // laws keep their places for 全文檢索); names, search and links take them in.
  ordersReady = data('orders.json')
    .then(o => {
      state.rows = [...state.rows, ...o.laws];
      for (const r of o.laws) state.byCode.set(r[0], r);
      state.names = nameMap(state.rows);
      if (state.tab === 'laws' && !state.law) drawResults();
      if (state.tab === 'mine') drawMine();
    })
    .catch(() => {});
  // Bills and changes: the screens that need them draw again once in.
  itemsReady = data('bills/items.json')
    .then(b => {
      state.items = b.items;
      state.billCounts = b.bills || null;
      state.itemsByLaw = new Map();
      for (const it of b.items) if (it.p) state.itemsByLaw.set(it.p, [...(state.itemsByLaw.get(it.p) || []), it]);
      if (state.tab === 'bills') drawBillList();
      redraw();
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
  delegReady = data('deleg.json').then(r => (state.regLaws = r || {})).catch(() => {});
  rulingsReady = data('rulings/laws.json')
    .then(r => {
      state.rulingLaws = r;
      if (state.tab === 'laws' && !state.law) drawResults();
    })
    .catch(() => {});
  data('rulings/latest.json')
    .then(r => {
      state.latestRulings = r.rulings || [];
      if (state.tab === 'home') drawHome();
    })
    .catch(() => {});
  data('changes.json')
    .then(c => {
      state.changes = c;
      redraw();
      badge();
    })
    .catch(() => {});
  await route();
  $('loading')?.setAttribute('hidden', '');
}

// What's followed on the Pass: the kit's sync (an older kit cached on a
// phone may lack it: this phone's copy only, then).
async function signIn() {
  const kit = await import('#kit/pass-sync.mjs').catch(() => null);
  if (kit?.passSync)
    pass = kit.passSync(q, {
      decode: decodeMine,
      encode: () => encodeMine(state.mine),
      apply: theirs => {
        const was = encodeMine(state.mine);
        state.mine = mergeMine(state.mine, theirs);
        if (encodeMine(state.mine) === was) return;
        saveMine(state.mine, undefined, state.mine.t);
        badge();
        if (state.tab === 'mine') drawMine();
        if (state.tab === 'home') drawHome();
      }
    });
  const first = await q.start();
  if (!pass) return;
  const m = state.mine;
  await pass.first(first, { local: Boolean(Object.keys(m.laws).length || Object.keys(m.items).length || m.marks.length || m.recent.length) });
  pass.watch();
  pass.sync();
}

if (!gated) {
  start();
  signIn();
  keepOffline();
}
watchUpdates({ current: BUILD, key: 'orbitLaw', cachePrefix: 'orbit-law-', busy: () => Boolean(document.querySelector('dialog[open]')) });
