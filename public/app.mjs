// Orbit Law: Taiwan's laws to read, with every reference a link, the bills
// in 立法院 that will change them, and 問法律, questions answered from the
// articles themselves. Behind Orbit Pass like every Orbit app (on a
// phone, from the Home Screen); the laws and bills are public data built
// each day onto this site (scripts/build-data.mjs), so reading costs
// nothing and works offline once opened. What's followed rides on the Pass.
//
// Tabs: 首頁 (one search, 問法律, what's new on all three sides), then the
// three sides as equals: 法規 (laws to read), 裁判 (憲法法庭 and the top
// courts), 立法 (bills by stage); then 我的 (followed and moved). Each side
// links to the other two: an article shows its rulings and the bills on
// it, a ruling the articles and bills it touches, a bill the rulings on
// what it changes.

import * as kit from '#kit/orbit.mjs';
import { orbitSession, installGate, topActions, tabBar, watchUpdates, keepOffline, haptic } from '#kit/orbit.mjs';
import { h, sheet, search, toast, wireNavTitles, dayBar, dayStep, daySwipe, emptyHtml, sectionHtml } from '#kit/ui.mjs';
import { passSync } from '#kit/pass-sync.mjs';
import { dayOffOn, loadDayOff, placeOf } from '#kit/dayoff.mjs';
import { W, en } from '#kit/lang.mjs';
import { nameMap, parentLaw, abbr } from './lib/refs.mjs';
import { searchLaws, rankLaws, parseJump, likelyLaw, ymd, relatedLaws } from './lib/search.mjs';
import { expand, concepts, lawGroups, orderLaws, snippet, QUICK, QUICK_EN } from './lib/find.mjs';
// A quick search's name in the reader's language.
const quickName = w => (en && QUICK_EN[w]) || w;
import { lawHtml, articleHtml, articlesBetween, contents, timeline, esc, artLabel, freshMarks, plainHtml, linkedHtml, ruleHtml, proseHtml, notesHtml } from './lib/view.mjs';
import { PASSED, PROMULGATED, whyOf, openRound } from './lib/bills.mjs';
import { compactMeet, sittings, meetState, nextSitting, twNow, liveOf, liveHls } from './lib/agenda.mjs';
import { loadMine, saveMine, toggleFollow, markSeen, addRecent, toggleMark, isMarked, lawsChanged, newCount, today, encodeMine, decodeMine, mergeMine } from './lib/store.mjs';
import { askLaw, askBill, askDiff, askRuling, askError, passFetch, MAX_Q } from './lib/ask.mjs';
import { searchText } from './lib/fulltext.mjs';
import { COURTS, courtOf, rulingUrl, caseKind, caseNo, caseQuery, caseMatch, lowCode, lowCourtName, lowLevel } from './lib/rulings.mjs';
import { isCons, consLabel, consOrder, consOfJid, citedBy, interpPage, JUDGMENTS_PAGE } from './lib/cons.mjs';
import { noticeUrl, isOpen } from './lib/notices.mjs';
import { linkTrail } from './lib/stack.mjs';
import { TOPICS, topicOf, partyOf } from './lib/topics.mjs';
import { personVotes, alignment, pctText, INDEPENDENT, gazetteUrl, ivodUrl, personFeed, feedNew, voteWhat, budgetKey } from './lib/ly.mjs';
import { money, change, budgetSteps, BUDGET_STEPS, budgetDue, daysBetween } from './lib/budget.mjs';
import { topicTile, topicName, progress, stageShort, partyChips, shortDay, dayOf, billCard, lawRow, fit, funnel, billFunnel, diffBlocks, stepOf, STEPS, whereNow, articleChips, roundSteps, STEP_HELP } from './lib/cards.mjs';
import { readable, pageUrl, readPage, hasText } from './lib/reader.mjs';
import { textFile } from './lib/agency.mjs';
import { readJudgment, outcome, partiesLine } from './lib/judgment.mjs';
import { chatLaw, chatError, stageText, STARTERS, MAX_CHAT_Q, mineOf, CITIES, readCity, saveCity, citiesOf } from './lib/chat.mjs';
import { readLog, noteRead, lawPlace } from './lib/reading.mjs';
import { parseHistory } from './lib/history.mjs';
import { loadChats, saveChats, putChat, renameChat, dropChat, newChatId, chatGroups, chatGist, chatMatches, questionsIn } from './lib/chats.mjs';

const $ = id => document.getElementById(id);

// ---- Every screen (the kit's DESIGN §10): one column on a phone; on a
// wider page a tab's sections side by side, each laid out as on a phone.
// cols() takes the sections in the phone's order, each with the column it
// sits in when there are two (and three, where the tab lays out three).
let screen = kit.screenFit?.() || { wide: false, w3: false };
const nCols = (most = 2) => Math.min(most, screen.w3 ? 3 : screen.wide ? 2 : 1);
function cols(parts, most = 2) {
  const n = nCols(most);
  const shown = parts.filter(p => p[0]);
  if (n === 1) return shown.map(p => p[0]).join('');
  const out = Array.from({ length: n }, () => []);
  for (const [html, two, three = two] of shown) out[n === 3 ? three : two].push(html);
  // A column left empty (nothing followed there yet): the sections share them in turn.
  if (out.some(c => !c.length)) shown.forEach(([html], i) => (i < n ? (out[i] = [html]) : out[i % n].push(html)));
  return `<div class="q-cols${n === 3 ? ' q-cols-3' : ''} lw-cols">${out.map(c => `<div class="lw-col">${c.join('')}</div>`).join('')}</div>`;
}
// The screen turned or resized past a column: the tab laid out again.
kit.onScreen?.(now => {
  const was = [nCols(2), nCols(3)].join();
  screen = now;
  if ([nCols(2), nCols(3)].join() === was) return;
  if (state.tab === 'home') drawHome();
  if (state.tab === 'laws' && !state.law) drawResults();
  if (state.tab === 'rulings') drawRulingList();
  if (state.tab === 'mine') drawMine();
});
const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
document.documentElement.lang = en ? 'en' : 'zh-Hant';

// ---- Orbit Pass: the Home Screen gate, the sign-in, the account button -----------------

const q = orbitSession('law', { lang: en ? 'en' : 'zh' });
// Each question answered, one more toward the 十個問題 milestone.
const asked = () => kit.milestone?.(q, 'law');
// The app starts at once, beside boot.js's first look at version.json (a
// round trip every opening: on a phone's slow link it held every screen,
// kept copies too). A newer deploy found while the loading screen is still
// up is loaded then (boot.js reloads only behind it); found after, the watch.
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

const state = { consTop: [], lawCons: {}, rulingLaws: {}, lowLaws: {}, lowNames: {}, lawRulings: {}, regLaws: {}, agencyLaws: {}, agency: { to: {}, rest: [] }, deleg: { to: {}, rest: [], from: [] }, latestRulings: [], tab: 'home', rows: [], byCode: new Map(), names: new Map(), items: [], itemsByLaw: new Map(), notices: [], noticesByLaw: new Map(), changes: { items: [] }, mine: loadMine(), law: null, showEn: false, query: '', topic: '' };
// What's followed: this phone's copy, then the Pass's (merged, written back).
let pass = null;
const save = () => {
  saveMine(state.mine);
  badge();
  if (pass) (pass.changed(), pass.sync());
};
// The 追蹤 tab's count: what moved, among what this device follows, since it last looked.
const badge = () => tabs.badge('mine', newCount(state.mine, state.items, state.changes) + Object.entries(state.peopleNew || {}).reduce((n, [id, k]) => n + (state.mine.people?.[id] ? k : 0), 0));
let itemsReady = Promise.resolve();
let noticesReady = Promise.resolve();
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
const shortName = abbr;
// A name to show in big type: smaller as it gets longer, so it takes two lines, not four.
const nameSize = n => (String(n || '').length > 24 ? ' xlong' : String(n || '').length > 13 ? ' long' : '');
// A law's or regulation's name by its code, in English when it has one.
const nameOf = (p, fallback = '') => { const r = state.byCode.get(p); return (en && r?.[6]) || String(r?.[1] || fallback).replace(/^中華民國/, ''); };

// ---- Tabs ------------------------------------------------------------------------------

const ICON_SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 3.8 2.2 6.4 6.6 7.4-4.4 1-6.1 3.6-6.6 7.4-.5-3.8-2.2-6.4-6.6-7.4 4.4-1 6.1-3.6 6.6-7.4zM19 15c.3 1.9 1.1 3 3 3.5-1.9.5-2.7 1.6-3 3.5-.3-1.9-1.1-3-3-3.5 1.9-.5 2.7-1.6 3-3.5z"/></svg>';
const TABS = ['home', 'laws', 'rulings', 'bills', 'mine', 'ask'];
const tabs = tabBar({
  tabs: [
    { id: 'home', label: W('首頁', 'Home'), icon: 'home' },
    { id: 'laws', label: W('法規', 'Laws'), icon: 'book' },
    { id: 'rulings', label: W('裁判', 'Rulings'), icon: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7 3 12a2.5 2.5 0 0 0 4 0zM19 7l-2 5a2.5 2.5 0 0 0 4 0z"/>' },
    { id: 'bills', label: W('立法', 'Bills'), icon: 'live' },
    { id: 'mine', label: W('我的', 'Mine'), icon: 'star' }
  ],
  // 問法律: a place of its own, the round button beside the bar (lit while it's open).
  action: { id: 'ask', icon: ICON_SPARK, label: W('問法律', 'Ask the law'), onTap: () => (state.tab === 'ask' ? scrollTo({ top: 0, behavior: 'smooth' }) : go('tab=ask')) },
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
  document.documentElement.dataset.lwTab = id;
  tabs.select(id);
  for (const t of TABS) $(`panel-${t}`).hidden = t !== id;
}
// A page's large title (and a line over it).
const pageHead = (title, over = '') => `<header class="lw-head${title ? '' : ' bare'}">${over ? `<p class="lw-over">${esc(over)}</p>` : ''}${title ? `<h1 class="q-large-title q-nav-title" data-q-nav>${esc(title)}</h1>` : ''}</header>`;
// A tab's large title folds into the kit's small glass bar as it scrolls away.
const wireTitles = root => setTimeout(() => wireNavTitles(root));
const headNode = (title, over) => h('div', { html: pageHead(title, over) }).firstChild;

// ---- Routing: #law=B0000001&a=184 · #r=s748 · #tab=bills · #item=11-01126 · #tab=ask&q=… ------

function go(hash, { replace = false } = {}) {
  const url = hash ? `#${hash}` : location.pathname + location.search;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  route();
}
addEventListener('popstate', route);

async function route() {
  const p = new URLSearchParams(location.hash.slice(1));
  document.documentElement.toggleAttribute('data-lw-law', p.has('law'));
  document.querySelector('dialog[open]')?.close();
  const tab = p.get('tab');
  if (p.get('law')) {
    showTab('laws');
    await openLaw(p.get('law'), p.get('a'), p.get('find'));
  } else if (tab === 'bills' || p.get('item') || p.get('who') || p.get('meet') || p.get('notice')) {
    showTab('bills');
    drawBills();
    await itemsReady;
    if (p.get('item')) openItem(p.get('item').replace('-', ':'));
    if (p.get('who')) openPerson(p.get('who'));
    if (p.get('budget')) openBudget(p.get('budget'));
    if (p.get('notice')) noticesReady.then(() => openNotice(p.get('notice')));
    if (p.get('meet')) openMeet(p.get('meet'), p.get('d') || '');
  } else if (tab === 'rulings' || p.get('r') || p.get('jd')) {
    // A ruling's own link (#r=<id>; #jd=<司法院 id> from before), over 裁判.
    showTab('rulings');
    drawRulings();
    if (p.get('r') || p.get('jd')) openRuling(p.get('r') || p.get('jd'));
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
    // A search from a link (a quick question) is undone by Back; a typed one stays.
    if (p.has('q')) ((state.query = p.get('q')), (state.linkedQuery = true));
    else if (state.linkedQuery) ((state.query = ''), (state.linkedQuery = false));
    showTab('laws');
    drawLaws();
    {
      const input = box.querySelector('input');
      // Only the Home search pill (an empty q) opens the keyboard.
      if (input) (input.value = state.query), p.has('q') && !p.get('q') && input.focus();
    }
  } else {
    showTab('home');
    drawHome();
  }
}

// ---- Shared pieces ----------------------------------------------------------------------

const section = (title, body, { more = '', moreHref = '', cls = '' } = {}) => (body ? sectionHtml(title, body, { more, moreHref, cls: `lw-sec${cls ? ` ${cls}` : ''}` }) : '');
// An empty note with no picture (it sits in a list or a search's results); cls '': the full-size one.
const emptyNote = (title, body = '', cls = 'lw-empty-sm') => emptyHtml({ icon: '', title, body, cls });
const list = rows => (rows.length ? `<div class="lw-list">${rows.join('')}</div>` : '');
const rail = cards => (cards.length ? `<div class="lw-rail">${cards.join('')}</div>` : '');
const grid = cards => (cards.length ? `<div class="lw-grid">${cards.join('')}</div>` : '');

function lawSub(row) {
  const [, , level, , m, gone] = row;
  // The tile shows the topic, so a law's MOJ category is left out.
  const what = level === '命令' ? W('命令', 'Regulation') : '';
  return [what, m && `${W('修正', 'Rev.')} ${shortDay(m)}`, gone && W('已廢止', 'Repealed')].filter(Boolean).join(' · ');
}
// A law's row; the judgments citing it as a tag when nothing else is on the right.
// In English the row is named in English (where the MOJ has it).
const lawItem = (row, sub, extra = '', href) => lawRow(en ? [row[0], nameOf(row[0], row[1])] : row, { topic: rowTopic(row), sub: sub ?? lawSub(row), extra: extra || (state.rulingLaws[row[0]] || state.lowLaws[row[0]] ? `<span class="lw-tag court">${ICON_GAVEL}${(state.rulingLaws[row[0]] || 0) + (state.lowLaws[row[0]] || 0)}</span>` : ''), href });
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_YT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" fill="#ff0033"/><path d="M10 9v6l5-3z" fill="#fff"/></svg>';
const ICON_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
const ICON_GAVEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 4 6 6M11.5 6.5l6 6M13 5l-5.5 5.5 6 6L19 11M10.5 13.5 4 20"/></svg>';
const countTag = (n, tone = '') => `<span class="lw-tag${tone ? ` ${tone}` : ''}">${esc(n)}</span>`;

// What changed, by article: 改第 5、12 條・增第 30-1 條・刪第 8 條 (3 a kind,
// then 等); a new law or a whole rewrite by its article count. `brief` (a row's
// one line): past two articles of a kind, just how many (改 4 條).
function changeText(c, brief = false) {
  if (c.whole) return `${c.whole === 'new' ? W('制定', 'Enacted') : W('全文修正', 'Rewritten')} ${shortDay(c.m)} · ${W(`全文 ${c.count} 條`, `${c.count} articles`)}`;
  const keys = ks => ks.slice(0, 3).join(W('、', ', ')) + (ks.length > 3 ? W(` 等 ${ks.length} 條`, ` +${ks.length - 3}`) : W(' 條', ''));
  const kinds = [[c.amended, '改第', 'Art. ', '改', 'amended'], [c.added, '增第', 'new ', '增', 'new'], [c.removed, '刪第', 'removed ', '刪', 'removed']];
  const parts = kinds.filter(([ks]) => ks.length).map(([ks, zh, e, zhN, eN]) => (brief && ks.length > 2 ? W(`${zhN} ${ks.length} 條`, `${ks.length} ${eN}`) : (en ? e : zh) + keys(ks)));
  return `${W('修正', brief ? 'Rev.' : 'Amended')} ${shortDay(c.m)}${parts.length ? ` · ${parts.join(W('・', ' · '))}` : ''}`;
}
// 新 on an amendment from the last two weeks; older ones in the list go untagged.
const freshTag = c => (Date.now() - Date.parse(`${c.m.slice(0, 4)}-${c.m.slice(4, 6)}-${c.m.slice(6, 8)}`) <= 14 * 864e5 ? countTag(W('新', 'New'), 'green') : '');
const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const CHEVRON = '<svg class="lw-chev" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m1.5 1.5 5 5.5-5 5.5"/></svg>';

// ---- 首頁 ---------------------------------------------------------------------------------

const LIVE = it => !it.dropped && !it.held && it.open && it.stage >= 1 && it.stage < PASSED;

function drawHome() {
  const panel = $('panel-home');
  const starters = STARTERS.map(([zh, e]) => `<a class="lw-starter" href="#tab=ask&amp;q=${encodeURIComponent(W(zh, e))}">${esc(W(zh, e))}</a>`).join('');
  const hero = `<a class="q-hero-card lw-hero" href="#tab=ask"><span class="q-hc-eyebrow lw-hero-top">${ICON_SPARK}<span>${W('問法律', 'Ask the law')}</span></span><strong>${W('遇到法律問題？用白話問', 'A legal question? Ask in plain words')}</strong><span class="lw-hero-box"><span>${W('輸入你遇到的事', 'Type what happened')}</span><i>${ICON_SEND}</i></span></a><div class="lw-starters rail">${starters}</div>`;

  // 立法院: the latest day anything moved, and the bills that moved last.
  const items = state.items.filter(it => !it.dropped && it.u);
  const moved = [...items].sort((a, b) => (a.u < b.u ? 1 : a.u > b.u ? -1 : b.stage - a.stage)).slice(0, 10);
  const bills = state.items.length ? rail(moved.map(it => billCard(it, { topic: itemTopic(it), en }))) : `<div class="lw-rail">${'<span class="lw-bill q-skel"></span>'.repeat(3)}</div>`;
  // Laws just amended or new (not regulations), and what you opened last.
  const amended = state.changes.items.filter(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令').slice(0, 4);
  const recent = state.mine.recent.map(p => state.byCode.get(p)).filter(Boolean).slice(0, 8);
  const picks = recommend(recent);

  // One search, the ask card, then calm shelves of what's new.
  // (Wide: the ask card heads the left column, what's new the right.)
  const topics = section(W('依生活情境找', 'By life situation'), state.rows.length ? topicGrid() : '');
  panel.innerHTML =
    pageHead('') +
    `<a class="lw-find-pill" href="#tab=laws&amp;q=">${ICON_SEARCH}<span>${W('找法規、判決、法案或生活問題', 'Search laws, rulings, bills')}</span></a>` +
    cols([
      [`<div class="lw-hero-wrap">${hero}</div>`, 0],
      [section(W('繼續閱讀', 'Continue reading'), resumeRows() || covers(recent), { more: W('我的', 'Mine'), moreHref: '#tab=mine' }), 0],
      // A first visit starts from everyday life; a returning one from what they read.
      [recent.length ? '' : topics, 0],
      [`<div id="home-live"></div>`, 1],
      [section(W('立法院這週', 'In the Legislative Yuan this week'), bills, { more: W('全部', 'All'), moreHref: '#tab=bills' }), 1],
      [section(W('剛修正的法律', 'Just amended'), list(amended.map(c => lawItem(state.byCode.get(c.p), changeText(c, true), freshTag(c)))), { more: W('更多', 'More'), moreHref: '#tab=laws' }), 1],
      [section(W('為你推薦', 'For you'), covers(picks)), 1],
      // 裁判: 憲法法庭's two newest, then the top courts' newest.
      [section(W('最新裁判', 'Latest rulings'), rail([...state.consTop, ...state.latestRulings.slice(0, 6)].map(rulingCard)), { more: W('裁判', 'Rulings'), moreHref: '#tab=rulings' }), 1],
      [`<div id="home-news"></div>`, 0],
      [recent.length ? topics : '', 1]
    ]);
  // 立法院 meeting now: its rooms, each opening the live video.
  agendaData()
    .then(a => {
      const all = sittings(a.meets);
      const live = all.filter(x => ['live', 'break'].includes(liveState(x, a.live)));
      const el = $('home-live');
      if (!el) return;
      if (live.length) return void (el.outerHTML = section(W('立法院開會中', 'In session now'), `<div class="lw-meets">${live.map(x => meetRow(x, a.live)).join('')}</div>`, { more: W('議程', 'Agenda'), moreHref: '#tab=bills&f=agenda' }));
      // Today's meetings all over or called off: say so, with the next day that has any.
      const { day } = twNow();
      const today = all.filter(x => x.d === day);
      const states = today.map(x => liveState(x, a.live));
      const next = all.find(x => x.d > day && liveState(x, a.live) !== 'off');
      if (!today.length || states.some(st => !['done', 'off'].includes(st))) return;
      const off = states.every(st => st === 'off');
      const why = off ? lyDayOff(day) ? W('颱風停止上班，立法院今天停會。', 'Typhoon day off in Taipei: the Legislative Yuan isn’t sitting today.') : W('今天的會議取消了。', 'Today’s meetings are called off.') : '';
      if (!next) return void (off && (el.outerHTML = section(W('今日停會', 'No sitting today'), `<p class="lw-hint-sm lw-next-sit">${esc(why)}</p>`, { more: W('議程', 'Agenda'), moreHref: '#tab=bills&f=agenda' })));
      const nextDay = all.filter(x => x.d === next.d);
      el.outerHTML = section(off ? W('今日停會', 'No sitting today') : W('今日已散會', 'Done for today'), `${why ? `<p class="lw-hint-sm lw-next-sit">${esc(why)}</p>` : ''}<p class="lw-hint-sm lw-next-sit">${esc(W(`下次開會：${meetDay(next.d)}，${nextDay.length} 場`, `Next: ${meetDay(next.d)}, ${nextDay.length} meeting${nextDay.length === 1 ? '' : 's'}`))}</p><div class="lw-meets">${nextDay.slice(0, 3).map(x => meetRow(x, a.live)).join('')}</div>`, { more: W('議程', 'Agenda'), moreHref: '#tab=bills&f=agenda' });
    })
    .catch(() => {});
  // 政府公告: the ministries' latest notices (they open in the reader).
  newsData()
    .then(d => {
      const el = $('home-news');
      const rows = (d.news || []).slice(0, 4);
      if (el && rows.length) el.outerHTML = section(W('政府公告', 'Government notices'), `<div class="lw-list lw-news">${rows.map(([day, gov, t, url]) => `<a class="lw-row" href="${esc(url)}">${topicTile('gov', 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(t)}</span><small>${esc(`${gov} · ${shortDay(day)}`)}</small></span></a>`).join('')}</div>`);
    })
    .catch(() => {});
}
// Laws as book covers (Books' shelves): the topic's colour, its mark, the name.
const covers = rows => (rows.length ? `<div class="lw-covers">${rows.map(r => `<a class="lw-cover" href="#law=${esc(r[0])}" style="--t:${TOPICS[rowTopic(r)].color}"><span class="lw-cover-art">${svgTopic(rowTopic(r))}<b class="q-fit-wrap">${esc(en ? nameOf(r[0], r[1]) : shortName(r[1]))}</b></span><small>${esc(topicName(rowTopic(r), en))}</small></a>`).join('')}</div>` : '');
// 繼續閱讀: the last things read, any kind, each opening where you were
// (a law at its article, with how far through), newest first.
function resumeRows() {
  const log = readLog().slice(0, 4);
  return log.length
    ? `<div class="lw-list lw-resume">${log
        .map(x => {
          const row = x.kind === 'law' ? state.byCode.get(x.id) : null;
          const it = x.kind === 'bill' ? state.items.find(i => i.k === x.id) : null;
          const tile = x.kind === 'law' ? topicTile(row ? rowTopic(row) : 'gov', 'sm') : x.kind === 'cons' ? courtTile(kindOfId(x.id)) : x.kind === 'judgment' ? courtTile('tps') : topicTile(it ? itemTopic(it) : 'gov', 'sm');
          const kind = { law: row?.[2] === '命令' ? W('子法', 'Regulation') : W('法規', 'Law'), cons: W('憲法法庭', 'Constitutional Court'), judgment: W('判決', 'Judgment'), bill: W('法案', 'Bill') }[x.kind];
          const sub = [kind, x.kind === 'bill' && it ? stageShort(it, en) : x.sub].filter(Boolean).join(' · ');
          const bar = x.kind === 'law' && x.pct > 0 ? `<span class="lw-resume-bar"><i style="width:${Math.max(4, Math.round(x.pct * 100))}%"></i></span>` : '';
          const title = x.kind === 'law' ? (en ? nameOf(x.id, x.title) : x.title) : x.title;
          return `<a class="lw-row" href="${esc(x.href)}">${tile}<span class="lw-row-text"><span class="lw-row-name">${esc(title)}</span><small>${esc(sub)}</small>${bar}</span></a>`;
        })
        .join('')}</div>`
    : '';
}
const svgTopic = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOPICS[id].icon}</svg>`;
// For you: the laws people use most in the topics you read and follow, newest
// amended first, not yet opened; everyday laws when there's nothing to go on.
function recommend(recent) {
  const seen = new Set(recent.map(r => r[0]));
  const topics = new Set([...recent, ...Object.keys(state.mine.laws).map(p => state.byCode.get(p)).filter(Boolean)].map(rowTopic));
  const pool = topics.size ? state.rows.filter(r => r[2] !== '命令' && !r[5] && topics.has(rowTopic(r)) && !seen.has(r[0])).sort((a, b) => (state.rulingLaws[b[0]] || 0) - (state.rulingLaws[a[0]] || 0) || (a[4] < b[4] ? 1 : -1)) : [];
  const common = COMMON.map(n => state.rows.find(r => r[1] === n)).filter(r => r && !seen.has(r[0]));
  // Your topics' top laws woven with everyday laws from other topics, so the shelf isn't one colour.
  const mine = pool.slice(0, 4), other = common.filter(r => !topics.has(rowTopic(r)));
  const out = [];
  for (let i = 0; out.length < 8 && (i < mine.length || i < other.length); i++) out.push(...[mine[i], other[i]].filter(Boolean));
  return [...new Set([...out, ...common])].slice(0, 8);
}
let lawNews;
const newsData = () => (lawNews ||= data('ai/news.json').catch(e => ((lawNews = null), Promise.reject(e))));

function topicGrid() {
  const counts = {};
  for (const r of state.rows) if (r[2] !== '命令' && !r[5]) counts[rowTopic(r)] = (counts[rowTopic(r)] || 0) + 1;
  return `<div class="lw-topics">${Object.keys(TOPICS)
    .map(id => `<a class="lw-topic" href="#tab=laws&amp;topic=${id}" style="--t:${TOPICS[id].color}">${topicTile(id)}<span class="q-fit-wrap">${esc(topicName(id, en))}</span><small>${counts[id] ? W(`${counts[id]} 部`, `${counts[id]}`) : ''}</small></a>`)
    .join('')}</div>`;
}

// ---- 法規: search, topics, the common laws -----------------------------------------------

const COMMON = ['中華民國憲法', '民法', '中華民國刑法', '民事訴訟法', '刑事訴訟法', '行政程序法', '勞動基準法', '道路交通管理處罰條例', '個人資料保護法', '消費者保護法'];

const box = search({ placeholder: W('找法規、條文或生活問題', 'Search laws, articles or topics'), onInput: v => ((state.query = v), drawResults()), onSubmit: v => jump(v) });

// A topic chip tapped: where its row was, so the next topic opens with the row in the same place.
let lawChipsAt = null;
const lawChipTap = e => {
  const row = e.currentTarget.parentNode;
  lawChipsAt = { left: row.scrollLeft, top: row.getBoundingClientRect().top };
};
function drawLaws() {
  const panel = $('panel-laws');
  const chips = h('div', { class: 'q-chips lw-chips' }, [
    h('button', { type: 'button', class: 'q-chip', 'aria-pressed': String(!state.topic), text: W('全部', 'All'), onclick: () => go('tab=laws', { replace: true }) }),
    ...Object.keys(TOPICS).map(id => h('button', { type: 'button', class: 'q-chip lw-tchip', style: `--t:${TOPICS[id].color}`, 'aria-pressed': String(state.topic === id), html: `<i></i>${esc(topicName(id, en))}`, onclick: e => (lawChipTap(e), go(`tab=laws&topic=${id}`, { replace: true })) }))
  ]);
  // A topic or a quick question came from a tap: a way back (a Home Screen app has no back gesture).
  const back = state.topic || (state.linkedQuery && state.query) ? h('button', { class: 'lw-back lw-back-row', type: 'button', 'aria-label': W('返回', 'Back'), html: ICON.back, onclick: () => (history.length > 1 ? history.back() : go('tab=laws')) }) : null;
  panel.replaceChildren(...[back, headNode(state.topic ? topicName(state.topic, en) : W('法規', 'Laws')), box, state.topic ? chips : null, h('div', { id: 'results' })].filter(Boolean));
  wireTitles(panel);
  box.hidden = false;
  drawResults();
  const on = chips.querySelector('[aria-pressed="true"]');
  const at = lawChipsAt;
  lawChipsAt = null;
  if (at && state.topic) {
    $('results').style.minHeight = `${Math.round(innerHeight * 0.9)}px`;
    chips.scrollLeft = at.left;
    const by = chips.getBoundingClientRect().top - at.top;
    if (Math.abs(by) > 1) scrollBy({ top: by, behavior: 'instant' });
  } else if (on && state.topic) chips.scrollLeft = on.offsetLeft - 16;
}

function drawResults() {
  const out = $('results');
  if (!out) return;
  const q = state.query.trim();
  if (q) return void findAll(q, out);
  const quick = `<div class="lw-quick q-balance">${(QUICK[state.topic || ''] || []).map(w => `<button type="button" class="lw-quick-q" data-q="${esc(w)}">${ICON_SEARCH}${esc(quickName(w))}</button>`).join('')}</div>`;
  if (state.topic) {
    const laws = state.rows.filter(r => r[2] !== '命令' && !r[5] && rowTopic(r) === state.topic).sort((a, b) => (a[4] < b[4] ? 1 : -1));
    const regs = state.rows.filter(r => r[2] === '命令' && rowTopic(r) === state.topic).length;
    out.innerHTML = quick + section(W(`法律 ${laws.length}`, `Laws ${laws.length}`), list(laws.slice(0, 300).map(r => lawItem(r)))) + (regs ? `<p class="lw-none">${W(`另有 ${regs} 個子法（辦法、規則），在各法律裡的「子法」看得到`, `Plus ${regs} regulations, listed under each law’s Regulations`)}</p>` : '');
    return;
  }
  const amended = state.changes.items.filter(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令').slice(0, 8);
  out.innerHTML =
    quick +
    cols(
      [
        [section(W('依生活情境找', 'By life situation'), topicGrid()), 0, 0],
        [section(W('常用', 'Common'), list(COMMON.map(n => state.rows.find(r => r[1] === n)).filter(Boolean).map(r => lawItem(r)))), 1, 1],
        [section(W('最近修法', 'Just amended'), list(amended.map(c => lawItem(state.byCode.get(c.p), changeText(c, true), freshTag(c))))), 0, 2]
      ],
      3
    );
}

// 找法: one search, answered in the order people need it. The law it names
// or can only mean (憲法, 勞基, 憲法增) on its own card, the laws whose names
// hold it, then the articles that say it (with the words marked and the 子法
// they call for), then 子法 by name, then 行政規則 by name, then bills in 立法院, then 問法律. Everyday words also try
// the law books' words (學生會 → 學生自治組織).
let findRun = 0;
// The ministries' 行政規則 and the cities' 地方法規 by name (agency/names.json, local/names.json, read at the first search).
const ruleNames = {};
const ruleList = dir => (ruleNames[dir] ||= data(`${dir}/names.json`).catch(() => ((ruleNames[dir] = null), [])));
async function findAll(q, out) {
  const run = ++findRun;
  const terms = expand(q);
  // (釋字 748 is a ruling, not 第748條 of a law named after it.)
  const jumpTo = consJump(q) ? null : parseJump(state.rows, q);
  // By name, best first (lib/search.mjs rankLaws): the name, a short name or
  // its start, the name's start, inside it; never characters scattered
  // through a name, which are noise next to real hits.
  // (Words apart in a name count too, each in its everyday or law words: 高中服儀.)
  const nameIdeas = { ideas: concepts(q) };
  const byName = (rows, n) => {
    const hit = [];
    for (const t of terms) for (const [s, r] of rankLaws(rows, t, n, nameIdeas)) if (s < 4 && !hit.includes(r)) hit.push(r);
    return hit;
  };
  const named = byName(state.rows, 30);
  const keep = r => !state.topic || rowTopic(r) === state.topic;
  // The law the search names or can only mean (預算法, 刑法, 勞基, 憲法增): the law itself on top, the articles that cite it under it.
  const exact = jumpTo ? null : likelyLaw(state.rows, q);
  const close = named.filter(r => r !== exact && keep(r));
  // A short name's start (勞基) is in no article: the law's whole name is (勞動基準法), and in its bills.
  const widened = exact && !terms.some(t => exact[1].includes(t));
  if (widened) terms.push(exact[1]);
  const laws = close.filter(r => r[2] !== '命令').slice(0, 6);
  const regs = close.filter(r => r[2] === '命令').slice(0, 6);
  // Bills by their law's name, then by what they're for (their purpose line).
  const bills = [...state.items.filter(it => terms.some(t => it.n?.includes(t))), ...state.items.filter(it => !terms.some(t => it.n?.includes(t)) && terms.some(t => it.about?.includes(t)))].filter(it => !it.dropped).slice(0, 5);
  const jumpRow = jumpTo && lawRow([jumpTo.row[0], `${jumpTo.row[1]} ${artLabel(jumpTo.key, en)}`], { topic: rowTopic(jumpTo.row), sub: W('直接打開這一條', 'Open this article'), href: `#law=${jumpTo.row[0]}&a=${jumpTo.key}` });
  const ask = `<a class="lw-find-ask" href="#tab=ask&amp;q=${encodeURIComponent(q)}">${MENU_ICON.ask || ''}<span><b>${W(`用白話問「${esc(q)}」`, `Ask about “${esc(quickName(q))}”`)}</b><small>${W('問法律會引用條文回答', 'Answered from the articles, cited')}</small></span></a>`;
  let ruleHits = 0;
  const lawLaws = laws.length ? section(exact ? W('名稱相近的法律', 'Laws with similar names') : W('法律', 'Laws'), list(laws.map(r => lawItem(r)))) : '';
  // Names before the articles that only mention them: 子法, then 行政規則 and 地方法規 (filled as they load).
  const lawBlock =
    lawLaws +
    (regs.length ? section(W('子法（辦法、規則）', 'Regulations'), list(regs.map(r => lawItem(r, parentName(r))))) : '') +
    `<div id="find-rules"></div><div id="find-local"></div>`;
  const nameBlocks = () =>
    (bills.length ? section(W('立法院審議中', 'In the Legislative Yuan'), `<div class="lw-list">${bills.map(it => `<a class="lw-row" href="#item=${esc(it.k.replace(':', '-'))}">${topicTile(topicFor(it.p, it.n), 'sm')}<span class="lw-row-text"><span class="lw-row-name${fit(it.n)}">${esc(it.n)}</span><small>${esc([stageShort(it, en), it.about].filter(Boolean).join(' · '))}</small></span></a>`).join('')}</div>`) : '') +
    `<div id="find-rulings"></div><div id="find-people"></div>`;
  const hero = exact && `<a class="lw-find-card lw-find-hero" href="#law=${esc(exact[0])}" style="--t:${TOPICS[rowTopic(exact)]?.color || 'var(--q-indigo)'}"><span class="lw-find-law">${topicTile(rowTopic(exact))}<span class="lw-find-hero-name"><b class="q-fit-wrap">${esc(en ? nameOf(exact[0], exact[1]) : exact[1])}</b><small id="find-hero-sub">${esc(lawSub(exact))}</small></span></span><p id="find-hero-text" class="q-skel"></p><span class="lw-find-open">${W('讀全文', 'Read the full text')}<svg viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></a>`;
  // (Wide: the names on the left, the articles that say it on the right.)
  const arts = [...q].length >= 2 && !jumpTo ? section(exact ? W('其他法規提到它', 'Other laws that cite it') : W('條文怎麼說', 'What the articles say'), `<div class="lw-find-cards">${'<span class="lw-find-card q-skel"></span>'.repeat(2)}</div>`) : '';
  out.innerHTML = cols([[(jumpRow ? section(W('直接打開', 'Go to'), list([jumpRow])) : '') + (hero ? `<section class="q-section lw-sec">${hero}</section>` : '') + lawBlock, 0], [`<div id="find-arts">${arts}</div>`, arts ? 1 : 0], [nameBlocks() + ask, 0]]);
  // The named law's own words: its first article (what it's for) and how many articles it has.
  if (exact)
    lawFile(exact[0])
      .then(f => {
        const arts = (f?.a || []).filter(a => a[0] === 'A');
        const text = $('find-hero-text'), sub = $('find-hero-sub');
        if (run !== findRun || !text) return;
        text.classList.remove('q-skel');
        if (arts[0]) text.textContent = String(arts[0][2]).replace(/\s+/g, ' ');
        else text.remove();
        if (sub && arts.length) sub.textContent = [W(`${arts.length} 條`, `${arts.length} articles`), lawSub(exact)].filter(Boolean).join(' · ');
      })
      .catch(() => $('find-hero-text')?.remove());
  // 裁判 by number or words: the few best, the rest in 裁判.
  if ([...q].length >= 2 || consJump(q))
    consData()
      .then(cons => rulingSearchHtml(q, cons, { max: 3, quiet: true }))
      .then(html => {
        const el = $('find-rulings');
        if (run === findRun && el && html) el.innerHTML = `<div class="lw-find-rulings">${html}</div><a class="lw-more-link" href="#tab=rulings&amp;q=${encodeURIComponent(q)}">${W(`在裁判找「${esc(q)}」`, `Search rulings for “${esc(q)}”`)}</a>`;
      })
      .catch(() => {});
  // 行政規則 by name (a ministry's 要點 or 注意事項 has no law of its own to open), and the cities' 地方法規.
  if ([...q].length >= 2 && !state.topic)
    for (const [dir, slot, title] of [['agency', 'find-rules', W('行政規則（要點、注意事項）', 'Agency rules')], ['local', 'find-local', W('地方法規（自治條例、規則）', 'City rules')]])
      ruleList(dir).then(rows => {
        const el = $(slot);
        if (run !== findRun || !el) return;
        const hit = byName(rows, 30);
        if (!hit.length) return;
        ruleHits += hit.length;
        el.outerHTML = section(title, list(hit.slice(0, 6).map(r => agencyRow(r, '', dir))));
        $('find-arts')?.querySelector('.q-empty')?.remove();
      });
  // 立委 by name or 選區: straight to their page.
  if ([...q].length >= 2)
    peopleData()
      .then(ppl => {
        const hit = ppl.people.filter(x => !x.to && (x.n.includes(q) || x.area.includes(q))).slice(0, 4);
        const el = $('find-people');
        if (run === findRun && el && hit.length) el.outerHTML = section(W('立委', 'Legislators'), `<div class="lw-people">${hit.map(x => `<a class="lw-person" href="#who=${esc(x.id)}" style="--p:${partyColor(x.party)}">${personPhoto(x)}<span class="lw-person-text"><b class="q-fit">${esc(x.n)}</b><small>${esc(`${partyShort(x.party)} · ${shortArea(x.area)}`)}</small></span></a>`).join('')}</div>`);
      })
      .catch(() => {});
  if ([...q].length < 2 || jumpTo) return;
  // The articles: what the question is about, as ideas each found in its
  // own words (網購退貨: 通訊交易 and 解除契約, lib/find.mjs concepts), the
  // laws whose articles hold the most of them, then the best said (BM25).
  let groups = [];
  let ideas = [terms];
  let stats = {};
  try {
    const union = async ws => [...new Set((await Promise.all(ws.map(w => searchText(w, n => data(`text/${n}.json`))))).flat())];
    const whole = await union(terms);
    ideas = widened ? [terms] : concepts(q, whole.length);
    const hits = ideas.length === 1 && ideas[0].join() === terms.join() ? [whole] : await Promise.all(ideas.map(union));
    stats = { df: hits.map(h => h.length), N: state.rows.reduce((n, r) => n + (Number(r[7]) || 0), 0) };
    groups = lawGroups(hits, state.rows, { common: COMMON }).filter(g => g.row !== exact && keep(g.row));
  } catch {}
  if (run !== findRun) return;
  const box = $('find-arts');
  if (!box) return;
  if (!groups.length) {
    box.innerHTML = !exact && !laws.length && !regs.length && !bills.length && !ruleHits ? emptyNote(W('沒有法規或條文提到這個', 'Nothing found'), W('換個說法，或直接用白話問', 'Try other words, or just ask')) : '';
    return;
  }
  // (The likeliest six read, the four that say it best shown.)
  const read = groups.slice(0, 6);
  const files = await Promise.all(read.map(g => lawFile(g.row[0]).catch(() => null)));
  const ranked = orderLaws(read.map((g, i) => ({ ...g, file: files[i] })), ideas, { ...stats, common: COMMON });
  const top = ranked.slice(0, 4);
  const delegs = await Promise.all(top.map(g => (state.regLaws[g.row[0]] ? data(`deleg/${g.row[0]}.json`).catch(() => null) : null)));
  if (run !== findRun || !document.body.contains(box)) return;
  const words = [...new Set(ideas.flat())];
  const cards = [];
  top.forEach((g, i) => {
    for (const a of g.arts.slice(0, i ? 2 : 4)) {
      const subs = (delegs[i]?.to?.[a.key] || []).slice(0, 2);
      cards.push(`<a class="lw-find-card" href="#law=${esc(g.row[0])}&amp;a=${esc(a.key)}" style="--t:${TOPICS[rowTopic(g.row)]?.color || 'var(--q-indigo)'}"><span class="lw-find-law">${topicTile(rowTopic(g.row), 'sm')}<b class="q-fit-wrap">${esc(g.row[1])}</b><em>${esc(artLabel(a.key, en))}</em></span><p>${snippet(a.text, words)}</p>${subs.length ? `<span class="lw-find-subs">${subs.map(([sp, sn]) => `<span data-sub="${esc(sp)}">${W('子法', 'Rule')}：${esc(sn)}</span>`).join('')}</span>` : ''}</a>`);
    }
  });
  const shown = new Set(top.map(g => g.law));
  const rest = [...ranked, ...groups.slice(6)].filter(g => !shown.has(g.law)).slice(0, 6).map(g => lawItem(g.row, W(`${g.hits} 條提到`, `${g.hits} articles mention it`), '', `#law=${g.row[0]}&find=${encodeURIComponent(terms[0])}`));
  box.innerHTML = cards.length ? section(exact ? W('其他法規提到它', 'Other laws that cite it') : W('條文怎麼說', 'What the articles say'), `<div class="lw-find-cards">${cards.join('')}</div>`) + (rest.length ? section(W('也提到的法規', 'Also mentioned in'), list(rest)) : '') : '';
}
// A 子法's parent law, by name, for its line under the name.
const parentName = r => {
  const p = parentLaw(state.rows, r[1]);
  return p ? W(`${state.byCode.get(p)?.[1] || ''}的子法`, `Under ${state.byCode.get(p)?.[1] || ''}`) : W('子法', 'Regulation');
};

function jump(q) {
  if (consJump(q)) return go(`r=${consJump(q)}`);
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
      panel.innerHTML = emptyNote(W('這個法規打不開', 'This law can’t be opened'), W('請稍後再試。', 'Try again later.'), '');
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
    // Then the other courts' (高等法院, 地方法院…), after the top courts' on each article.
    if (state.lowLaws[p]) {
      const low = (await Promise.race([data(`rulings/low/law/${p}.json`).catch(() => ({})), new Promise(r => setTimeout(() => r({}), 2000))])) || {};
      for (const [k, l] of Object.entries(low)) state.lawRulings[k] = [...(state.lawRulings[k] || []), ...l];
    }
    // 憲法法庭's rulings on it, by article ('' = the law as a whole).
    // ('#': the ones about this law, not just citing an article of it in passing.)
    const { '#': core = [], ...cons } = (await Promise.race([consLaws().then(c => c[p] || {}).catch(() => ({})), new Promise(r => setTimeout(() => r({}), 2000))])) || {};
    state.lawCons = cons;
    state.lawCore = core;
    state.consRows = state.lawCons && Object.keys(state.lawCons).length ? await consData().catch(() => null) : null;
    // 授權: the regulations made under its articles, or (a regulation) what it rests on.
    state.deleg = { to: {}, rest: [], from: [] };
    await Promise.race([delegReady, new Promise(r => setTimeout(r, 1500))]);
    if (state.regLaws[p] || state.byCode.get(p)?.[2] === '命令') state.deleg = { ...state.deleg, ...((await Promise.race([data(`deleg/${p}.json`).catch(() => null), new Promise(r => setTimeout(() => r(null), 2000))])) || {}) };
    // Ministries' own 行政規則 under it (from their open data): linked out.
    state.agency = { to: {}, rest: [] };
    if (state.agencyLaws[p]) state.agency = { ...state.agency, ...((await Promise.race([data(`agency/${p}.json`).catch(() => null), new Promise(r => setTimeout(() => r(null), 2000))])) || {}) };
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
    h('div', { class: 'lw-title' }, [h('h2', { text: state.showEn ? name : shortName(name) })]),
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
  const kind = row[2] === '命令' ? W('命令', 'Regulation') : law.l === '憲法' || row[2] === '憲法' ? W('憲法', 'Constitution') : W('法律', 'Act');
  const facts = [W(`${nArts} 條`, `${nArts} articles`), law.m && W(`${ymd(law.m)} 修正`, `amended ${ymd(law.m)}`)].filter(Boolean).join(' · ');
  const partyText = live ? partyChips(live.by, en, 2).replace(/<b>/g, '\u00a0').replace(/<[^>]+>/g, '  ').replace(/\s{2,}/g, ' · ').replace(/^ · | · $/g, '').trim() : '';
  // What's moving on it: rows on the card, a hairline apart (a tap: over this page, the reading kept).
  const rows = [
    change && overRow('green', W('最近修法', 'Just amended'), changeText(change), () => diffSheet(law, change)),
    // Only a bill really moving (in committee or past it) gets the progress bar; most drafts sit
    // after 一讀 for years, so those are one quiet line (Jay 2026-10-31).
    live && (live.stage >= 2 ? overRow('indigo', W('立法院正在修', 'Being amended in the Legislative Yuan'), [stageShort(live, en), partyText].filter(Boolean).join(' · '), () => openItem(live.k), progress(live, en)) : overRow('idle', W(`${live.open || live.count || 1} 個修正草案待審`, `${live.open || live.count || 1} draft amendment${(live.open || live.count || 1) > 1 ? 's' : ''} waiting`), [W('已一讀，還沒排進委員會', 'Read once, not yet taken up in committee'), partyText].filter(Boolean).join(' · '), () => openItem(live.k))),
    consRow_(law),
    draftRow(law)
  ].filter(Boolean);
  // The doors: 目錄, 子法, 判決 (and a regulation's 授權依據), each with its count, along the card's foot.
  const toc = contents(law).filter(c => c.depth <= 1);
  const doors = [tocDoor(law, toc, nArts), basisDoor(law), regsDoor(law), rulingDoor(law)].filter(Boolean);
  // The card: kind and topic, the name, its facts; what's moving; the doors.
  const title = h('strong', { class: `lw-over-title lw-big-name${nameSize(name)}`, text: name });
  const over = h('section', { class: 'lw-over-card', style: `--t:${TOPICS[topic].color}` }, [
    h('div', { class: 'lw-over-top', html: `${topicTile(topic)}<span>${esc(`${kind} · ${topicName(topic, en)}`)}</span>${law.ab ? countTag(W('已廢止', 'Repealed'), 'red') : ''}` }),
    title,
    h('p', { class: 'lw-over-facts', text: facts }),
    rows.length ? h('div', { class: 'lw-over-rows' }, rows) : null,
    doors.length ? h('div', { class: `lw-doors n${doors.length}` }, doors) : null
  ].filter(Boolean));
  const fw = shown.fw ? h('p', { class: 'lw-fw', text: shown.fw }) : null;
  const body = h('div', { class: `lw-law${state.showEn ? ' en' : ''}`, html: lawHtml(shown, { names: state.names, self: selfOf(law), en: state.showEn, fresh: freshMarks(state.changes, law, en), pending: live ? Object.fromEntries(Object.entries(live.arts || {}).map(([k, n]) => [k, W(`${n} 個修正提案`, n > 1 ? `${n} proposals` : '1 proposal')])) : {}, pendingItem: live?.k.replace(':', '-'), marks: state.mine.marks.filter(m => m.p === law.p).map(m => m.k) }) });
  const find = h('div', { class: 'lw-find', hidden: true }, [search({ placeholder: W('在這部法規裡找字', 'Find in this law'), onInput: v => filterLaw(v) }), h('small', { class: 'lw-find-n' })]);
  // ⚖ 判決 N beside each article a court ruled on (purple when 憲法法庭 did).
  for (const k of new Set([...Object.keys(state.lawRulings), ...Object.keys(state.lawCons).filter(Boolean)])) {
    const n = (state.lawRulings[k]?.length || 0) + (state.lawCons[k]?.length || 0);
    body.querySelector(`#a-${CSS.escape(k)} .lw-no`)?.insertAdjacentHTML('afterend', `<button type="button" class="lw-rul${state.lawCons[k] ? ' cons' : ''}" data-art="${esc(k)}">${ICON_GAVEL}${W(`判決 ${n}`, `${n} ruling${n > 1 ? 's' : ''}`)}</button>`);
  }
  // 📄 子法 N beside each article that calls for regulations (after any 判決 badge).
  for (const k of new Set([...Object.keys(state.deleg.to), ...Object.keys(state.agency.to)])) {
    const list = [...(state.deleg.to[k] || []), ...(state.agency.to[k] || [])];
    const no = body.querySelector(`#a-${CSS.escape(k)} .lw-no`);
    (no?.nextElementSibling?.classList.contains('lw-rul') ? no.nextElementSibling : no)?.insertAdjacentHTML('afterend', `<button type="button" class="lw-rul lw-regs" data-art="${esc(k)}">${ICON_DOC}${W(`子法 ${list.length}`, `${list.length} rule${list.length > 1 ? 's' : ''}`)}</button>`);
  }
  // Beside the text on a computer: the card and the law's 目錄, kept in view
  // (a phone opens the 目錄 from its door). The text stays a reading width.
  const side = h('aside', { class: 'lw-law-side' }, [over, sideContents(law)].filter(Boolean));
  panel.replaceChildren(head, find, h('div', { class: 'lw-law-page' }, [side, h('div', { class: 'lw-law-main' }, [fw, body].filter(Boolean))]));
  box.hidden = true;
  // The bar's name only once the card's has scrolled away (as iOS's large titles).
  titleWatch?.disconnect();
  head.classList.add('quiet');
  titleWatch = new IntersectionObserver(([e]) => head.classList.toggle('quiet', e.isIntersecting), { rootMargin: `-${head.offsetHeight || 52}px 0px 0px 0px` });
  titleWatch.observe(title);
  trackReading(law, body);
}

let titleWatch = null;
// 繼續閱讀: the law noted as read, then the article at the top of the screen
// as you scroll (where 繼續閱讀 on 首頁 opens it, and how far through).
let readOff = null;
function trackReading(law, body) {
  readOff?.();
  const p = law.p;
  const keys = law.a.filter(a => a[0] === 'A').map(a => a[1]);
  const had = readLog().find(x => x.kind === 'law' && x.id === p);
  noteRead({ kind: 'law', id: p, title: law.n, href: had?.href || `#law=${p}`, sub: had?.sub || '', pct: had?.pct ?? 0 });
  let t = 0;
  const on = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (state.law?.p !== p || !location.hash.startsWith('#law=') || !body.isConnected || !body.offsetParent) return;
      const y = (document.querySelector('.lw-bar')?.offsetHeight || 0) + 24;
      const art = document.elementFromPoint(innerWidth / 2, y)?.closest('.lw-art');
      const at = art && body.getBoundingClientRect().top < y ? lawPlace(keys, art.dataset.k) : null;
      noteRead({ kind: 'law', id: p, title: law.n, href: at ? `#law=${p}&a=${at.k}` : `#law=${p}`, sub: at ? W(`讀到${artLabel(at.k)}`, `at Art. ${at.k}`) : '', pct: at ? at.pct : 0 });
    }, 400);
  };
  addEventListener('scroll', on, { passive: true });
  readOff = () => removeEventListener('scroll', on);
}
// A row on the law's card: a coloured dot, what it is, a line under it, a chevron.
const overRow = (tone, title, sub, onclick, extra = '') => h('button', { type: 'button', class: `lw-over-row ${tone}`, html: `<span class="lw-over-text"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>${ICON_CHEV}${extra}`, onclick });
const ICON_CHEV = '<svg class="lw-chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// 最高法院判決: how many cite this law, and which articles (a tap: the list, by article).
const door = (cls, icon, n, label, onclick) => h('button', { type: 'button', class: `lw-door ${cls}`, html: `<b>${esc(String(n))}</b><small>${esc(label)}</small>`, onclick });
// 目錄: the chapters (a tap: there); a law without chapters opens 找字.
function tocDoor(law, toc, nArts) {
  if (toc.length < 2) return door('slate', ICON.find, nArts, W('條・找字', 'articles · find'), () => toggleFind());
  return door('slate', MENU_ICON.steps, toc.length, W('章・目錄', 'chapters'), () => {
    const s = sheet({ title: W(`${shortName(law.n)} · 目錄`, 'Contents'), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-list in-sheet', html: toc.map(c => `<button type="button" class="lw-row" data-id="${c.id}"><span class="lw-row-text"><span class="lw-row-name">${esc(c.title.replace(/\s+/g, ' '))}</span></span></button>`).join('') }) });
    s.el.addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      s.close();
      scrollToHeading(b.dataset.id);
    });
  });
}
// 判決: every ruling on this law, 憲法法庭's first, then by article (a tap: that article's).
const lawConsIds = () => { const core = new Set(state.lawCore || []); return [...new Set(Object.values(state.lawCons).flat())].sort((a, b) => core.has(b) - core.has(a) || consOrder(b) - consOrder(a)); };
function rulingDoor(law) {
  const arts = Object.entries(state.lawRulings);
  const consIds = lawConsIds();
  if (!arts.length && !consIds.length) return null;
  const n = (state.rulingLaws[law.p] || state.lowLaws[law.p] ? (state.rulingLaws[law.p] || 0) + (state.lowLaws[law.p] || 0) : new Set(arts.flatMap(([, l]) => l.map(x => x[0]))).size) + consIds.length;
  const sorted = arts.sort((a, b) => b[1].length - a[1].length);
  return door('court', ICON_GAVEL, n, W('判決', 'rulings'), () => {
    const cons = consIds.map(id => state.consRows?.byId.get(id)).filter(Boolean);
    const core = new Set(state.lawCore || []);
    const about = cons.filter(r => core.has(r[0])), passing = cons.filter(r => !core.has(r[0]));
    const html = (about.length ? `<p class="lw-list-cap">${W(`憲法法庭 · 針對這部法 ${about.length}`, `Constitutional Court · about it ${about.length}`)}</p>${about.slice(0, 30).map(r => rulingRow(r)).join('')}` : '') + (passing.length ? `<p class="lw-list-cap">${W(`憲法法庭 · 理由中引用 ${passing.length}`, `Constitutional Court · cited in passing ${passing.length}`)}</p>${passing.slice(0, 30).map(r => rulingRow(r)).join('')}` : '') + (sorted.length ? `<p class="lw-list-cap">${state.lowLaws[law.p] ? W('各級法院，依條文', 'Courts, by article') : W('最高法院・最高行政法院，依條文', 'Top courts, by article')}</p>` : '') + sorted.map(([k, l]) => `<button type="button" class="lw-row" data-k="${esc(k)}">${courtTile(kindOfId(l[0][0]))}<span class="lw-row-text"><span class="lw-row-name">${esc(artLabel(k, en))}</span><small>${esc(l[0][2] || '')}</small></span><span class="lw-tag court">${ICON_GAVEL}${l.length}</span></button>`).join('');
    const s = sheet({ title: W(`${shortName(law.n)} · 判決`, `${nameOf(law.p, law.n)} · rulings`), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-list in-sheet', html }) });
    s.el.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      s.close();
      openRulings(b.dataset.k);
    });
  });
}
// 子法: every regulation made under this law, by the article that calls for it.
function regsDoor(law) {
  const arts = Object.entries(state.deleg.to);
  const ag = state.agency;
  const n = new Set([...arts.flatMap(([, l]) => l), ...state.deleg.rest].map(r => r[0])).size + new Set([...Object.values(ag.to).flat(), ...ag.rest].map(r => r[0])).size;
  if (!n) return null;
  return door('teal', ICON_DOC, n, W('子法', 'rules'), () => regsSheet(law));
}
// The 子法 sheet: by article, each with the words that call for the rules, then the rules.
function regsSheet(law) {
  const ag = state.agency;
  const keys = [...new Set([...Object.keys(state.deleg.to), ...Object.keys(ag.to)])].sort((a, b) => artOrder(a) - artOrder(b));
  const words = Object.fromEntries(law.a.filter(a => a[0] === 'A').map(a => [a[1], a[2]]));
  const row = (p, name) => `<button type="button" class="lw-row" data-p="${esc(p)}">${topicTile(rowTopic(state.byCode.get(p) || [p, name, '命令']), 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(nameOf(p, name))}</span></span></button>`;
  const group = (k, rows) => `<div class="lw-reg-art"><button type="button" class="lw-reg-head" data-at="${esc(k)}"><b>${esc(artLabel(k, en))}</b><span>${esc(String(words[k] || '').replace(/\s+/g, ' ').slice(0, 70))}${String(words[k] || '').length > 70 ? '…' : ''}</span></button>${rows}</div>`;
  const html =
    keys.map(k => group(k, (state.deleg.to[k] || []).map(([p, name]) => row(p, name)).join('') + (ag.to[k] || []).map(r => agencyRow(r, '')).join(''))).join('') +
    (state.deleg.rest.length || ag.rest.length ? `<div class="lw-reg-art"><p class="lw-list-cap">${W('其他', 'Others')}</p>${state.deleg.rest.map(([p, name]) => row(p, name)).join('')}${ag.rest.map(r => agencyRow(r, '')).join('')}</div>` : '');
  const s = sheet({ title: W(`${shortName(law.n)} · 子法`, 'Rules made under it'), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-list in-sheet wrap', html }) });
  s.el.addEventListener('click', e => {
    const b = e.target.closest('[data-p],[data-at]');
    if (!b) return;
    s.close();
    if (b.dataset.at) focusArticle(b.dataset.at);
    else go(`law=${b.dataset.p}`);
  });
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
  const ag = state.agency.to[k] || [];
  if (list.length === 1 && !ag.length) return go(`law=${list[0][0]}`);
  regSheet(W(`${artLabel(k)} 的子法`, `Rules under Art. ${k}`), list.map(([p, name]) => `<button type="button" class="lw-row" data-p="${esc(p)}">${topicTile(rowTopic(state.byCode.get(p) || [p, name, '命令']), 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(nameOf(p, name))}</span></span></button>`).join('') + ag.map(r => agencyRow(r, '')).join(''));
}
// A ministry's 行政規則 (not in 全國法規資料庫): opens on its site.
// (dir: whose rule it is, data/<dir>/text/ keeps its text.)
const agencyRow = ([id, name, agency, url, mine], label, dir = 'agency') => `<a class="lw-row" href="${esc(url)}" target="_blank" rel="noopener"${mine ? ` data-text="${esc(`${dir}/${textFile(id)}`)}"` : ''}>${topicTile('gov', 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(name)}</span><small>${esc([agency, label].filter(Boolean).join(' · '))}</small></span></a>`;
// A regulation's 授權依據: the law and article it is made under (a tap: there).
function basisDoor(law) {
  const from = state.deleg.from.filter(([p]) => state.byCode.has(p));
  if (!from.length) return null;
  const label = ([p, k]) => `${nameOf(p)}${k ? (en ? ` Art. ${k}` : artLabel(k)) : ''}`;
  return door('indigo wide', MENU_ICON.gov, nameOf(from[0][0]) + (from[0][1] ? (en ? ` Art. ${from[0][1]}` : artLabel(from[0][1])) : ''), W('授權依據', 'made under'), () => {
    if (from.length === 1) return go(`law=${from[0][0]}${from[0][1] ? `&a=${from[0][1]}` : ''}`);
    regSheet(W('授權依據', 'Made under'), from.map(([p, k]) => `<button type="button" class="lw-row" data-p="${esc(p)}" data-k="${esc(k)}">${topicTile(rowTopic(state.byCode.get(p)), 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(label([p, k]))}</span></span></button>`).join(''));
  });
}

function openRulings(k) {
  const law = state.law;
  if (state.lawRulings[k]?.length || state.lawCons[k]?.length) rulingsSheet(`${shortName(law.n)}${artLabel(k)}`, state.lawRulings[k] || [], state.lawCons[k] || []);
}
// 憲法法庭 on this law: only the rulings about it (its 爭點 or 解釋文 name
// it), the newest named; one that cites an article in passing (釋字764 on
// 預算法第85條) waits in 判決 (a tap: the list, those about it first).
function consRow_(law) {
  const about = (state.lawCore || []).filter(id => state.consRows?.byId.has(id)).sort((a, b) => consOrder(b) - consOrder(a));
  const top = state.consRows?.byId.get(about[0]);
  if (!top) return null;
  return overRow('cons', W(`憲法法庭解釋 ${about.length} 件`, `Constitutional Court · ${about.length}`), `${consLabel(top[0], en)} ${consName(top)}`, () => (about.length === 1 ? openCons(about[0]) : rulingsSheet(W(`${shortName(law.n)} · 憲法法庭`, 'Constitutional Court'), [], about)));
}

// A ministry's draft of this law still open for comment (預告).
function draftRow(law) {
  const draft = (state.noticesByLaw.get(law.p) || []).find(n => isOpen(n, today()));
  return draft ? overRow('orange', W(`${draft.gov}預告修法`, `Draft by ${draft.gov}`), W(`意見至 ${shortDay(draft.to)}`, `comments till ${shortDay(draft.to)}`), () => openNotice(draft.id)) : null;
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

// The 目錄 beside the text (a wide screen): chapters, a tap away, the one being read marked.
function sideContents(law) {
  const all = contents(law).filter(c => c.depth <= 1);
  if (all.length < 2) return null;
  const nav = h('nav', { class: 'lw-side-toc', 'aria-label': W('目錄', 'Contents'), html: `<h3>${W('目錄', 'Contents')}</h3>${all.map(c => `<button type="button" class="d${c.depth}" data-id="${c.id}"><span>${esc(c.title)}</span>${c.first ? `<small>${esc(artLabel(c.first, en))}</small>` : ''}</button>`).join('')}` });
  nav.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b) scrollToHeading(b.dataset.id);
  });
  // The chapter at the top of the text marked, and kept in the list's view.
  let frame = 0;
  const mark = () => {
    frame = 0;
    if (!nav.isConnected) return removeEventListener('scroll', soon);
    if (!nav.offsetParent) return;
    const y = (document.querySelector('.lw-bar')?.offsetHeight || 0) + 24;
    let on = null;
    for (const b of nav.querySelectorAll('button[data-id]')) {
      const el = document.getElementById(b.dataset.id);
      if (el && el.getBoundingClientRect().top <= y) on = b;
    }
    const was = nav.querySelector('button.on');
    if (was === on) return;
    was?.classList.remove('on');
    if (!on) return;
    on.classList.add('on');
    const side = nav.parentElement;
    const top = on.offsetTop;
    if (top < side.scrollTop || top + on.offsetHeight > side.scrollTop + side.clientHeight) side.scrollTop = top - side.clientHeight / 2;
  };
  const soon = () => (frame ||= requestAnimationFrame(mark));
  addEventListener('scroll', soon, { passive: true });
  setTimeout(soon, 300);
  return nav;
}

function lawMenu(law, row) {
  const rows = [];
  if (contents(law).length) rows.push([W('目錄', 'Contents'), () => showContents(law)]);
  if (row[6] || state.showEn) rows.push([state.showEn ? '中文條文' : 'English text', () => ((state.showEn = !state.showEn), drawLaw())]);
  if (law.h) rows.push([W('沿革', 'History'), () => historySheet(law)]);
  if (law.eff) rows.push([W('施行日期', 'In force'), () => textSheet(W('施行日期', 'In force'), law.eff, law)]);
  for (const it of state.itemsByLaw.get(law.p) || []) rows.push([`${W(`立法院第 ${it.term} 屆`, `Legislative Yuan, term ${it.term}`)} · ${stageShort(it, en)}`, () => go(`item=${it.k.replace(':', '-')}`)]);
  for (const r of relatedLaws(state.rows, row)) rows.push([r[1], () => go(`law=${r[0]}`), W('相關法規', 'Related law')]);
  const s = sheet({ title: law.n, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'q-list' }, rows.map(([label, fn, sub]) => h('button', { class: 'q-cell chevron', type: 'button', onclick: () => (s.close(), fn()) }, [h('span', { class: 'q-cell-text' }, [h('span', { text: label }), sub ? h('small', { text: sub }) : null].filter(Boolean))]))) });
}
// 沿革 as a timeline, newest first: the day, what each order did (the
// articles a tap away), the order's number quiet under it.
const ACT_TONE = { 制定: 'green', 訂定: 'green', 增訂: 'green', 修正: 'indigo', 刪除: 'red', 廢止: 'red' };
function historySheet(law) {
  const events = parseHistory(law.h).reverse();
  if (!events.length) return textSheet(W('沿革', 'History'), law.h, law);
  const has = new Set(law.a.filter(a => a[0] === 'A').map(a => a[1]));
  const art = a => {
    const k = a.split('～')[0];
    const label = a.replace('～', '–');
    return has.has(k) ? `<a class="lw-ref lw-h-art" href="#law=${esc(law.p)}&amp;a=${esc(k)}" data-law="${esc(law.p)}" data-from="${esc(k)}" data-to="${esc(k)}" data-para="0">${esc(label)}</a>` : `<span class="lw-h-art gone">${esc(label)}</span>`;
  };
  const acts = e =>
    e.acts
      .map(a => {
        const what = a.whole ? W(`${a.part || ''}全文 ${a.whole} 條`, `${a.whole} articles in full`) : '';
        const arts = a.arts.length > 12 ? `${a.arts.slice(0, 12).map(art).join('')}<button type="button" class="lw-h-more" data-more="${esc(JSON.stringify(a.arts.slice(12)))}">${W(`還有 ${a.arts.length - 12} 條`, `${a.arts.length - 12} more`)}</button>` : a.arts.map(art).join('');
        return `<div class="lw-h-act">${countTag(a.act, ACT_TONE[a.act] || '')}${what ? `<span class="lw-h-what">${esc(what)}</span>` : ''}${arts ? `<span class="lw-h-arts">${arts}</span>` : ''}</div>`;
      })
      .join('');
  const day = d => (d ? d.replace(/-/g, '/') : '');
  const html = events
    .map(
      e => `<li class="lw-h-ev"><time>${esc(day(e.date))}</time>${acts(e)}${e.notes.map(n => `<p class="lw-h-note">${esc(n)}</p>`).join('')}${e.doc ? `<small class="lw-h-doc">${esc(e.doc)}</small>` : ''}${e.more.map(m => `<div class="lw-h-sub"><time>${esc(day(m.date))}</time>${acts(m)}${m.notes.map(n => `<p class="lw-h-note">${esc(n)}</p>`).join('')}${m.doc ? `<small class="lw-h-doc">${esc(m.doc)}</small>` : ''}</div>`).join('')}</li>`
    )
    .join('');
  const s = sheet({ title: W('沿革', 'History'), subtitle: W(`${events.length} 次異動`, `${events.length} changes`), closeLabel: W('關閉', 'Close'), cls: 'lw-h-sheet', body: h('ol', { class: 'lw-h', html }) });
  s.el.addEventListener('click', e => {
    const b = e.target.closest('.lw-h-more');
    if (b) b.outerHTML = JSON.parse(b.dataset.more).map(art).join('');
  });
}
// The ministry's notes (施行日期) as numbered points, the lines it wrapped joined.
function textSheet(title, text, law) {
  sheet({ title, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-notes', html: notesHtml(law, text) }) });
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
          return `<article class="lw-diff"><header><a class="lw-ref" href="#law=${esc(law.p)}&amp;a=${esc(k)}" data-law="${esc(law.p)}" data-from="${esc(k)}" data-to="${esc(k)}" data-para="0">${esc(artLabel(k, en))}</a>${countTag(W(kind[0], kind[1]), kind[2])}</header><div class="lw-dtext">${diffBlocks(was || null, now || null)}</div></article>`;
        })
        .join('') + (d ? '' : `<p class="lw-none">${W('舊條文這次讀不到，先列出修正後的條文', 'The old text isn’t here; the articles as they are now')}</p>`)
    : `<p class="lw-none">${change.whole ? W('整部法律都是這次的條文，直接讀全文', 'The whole law is this version: read it in full') : W('這次修正沒有條文變動', 'No articles changed')}</p>`;
}

// An article's own menu (its number tapped): explain, ask, bookmark, copy, rulings.
function articleMenu(k) {
  const law = state.law;
  const marked = isMarked(state.mine, law.p, k);
  const label = `${law.n}${artLabel(k)}`;
  const rows = [
    [W('白話解釋', 'Explain in plain words'), () => explain(law, k), 'spark'],
    [W('問法律：帶著這一條問', 'Ask about this article'), () => askWith(law, [k]), 'ask'],
    [marked ? W('取消書籤', 'Remove bookmark') : W('加入書籤', 'Bookmark'), () => (toggleMark(state.mine, law.p, k), save(), document.getElementById(`a-${k}`)?.classList.toggle('marked', !marked)), 'mark'],
    [W('複製條文', 'Copy text'), () => copyArticle(k), 'copy'],
    ...(state.lawRulings[k]?.length || state.lawCons[k]?.length ? [[W(`這一條的判決（${(state.lawRulings[k]?.length || 0) + (state.lawCons[k]?.length || 0)}）`, `Rulings on it (${(state.lawRulings[k]?.length || 0) + (state.lawCons[k]?.length || 0)})`), () => openRulings(k), 'court']] : []),
  ];
  const s = sheet({ title: label, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-menu' }, rows.map(([t, fn, ic]) => h('button', { class: `lw-menu-row ${ic}`, type: 'button', onclick: () => (s.close(), fn()), html: `<i>${MENU_ICON[ic]}</i><span>${esc(t)}</span>` }))) });
}

// 白話解釋: the article explained as a teacher would (what it means in a
// line, what it says, why it's there, examples, the hard words, how it stands
// today, what to read next), then questions on it, each answered under it.
// `ks`: one article key, or a few (a linked range, up to 8: answered together).
function explain(law, ks) {
  ks = [].concat(ks).slice(0, 8);
  const one = ks.length === 1;
  const text = one ? law.a.find(a => a[0] === 'A' && a[1] === ks[0])?.[2] : '';
  // The article itself, folded to three lines (a tap: all of it).
  const quote = text ? h('button', { type: 'button', class: 'lw-x-quote', text: String(text).replace(/\s*\n\s*/g, ' '), onclick: e => e.currentTarget.classList.toggle('open') }) : null;
  const out = h('div', { class: 'lw-x', html: `<div class="lw-x-gist"><span class="lw-x-label">${ICON_SPARK}${W('白話', 'In plain words')}</span><span class="q-skel lw-x-skel"></span><span class="q-skel lw-x-skel short"></span></div><span class="q-skel lw-x-skel tall"></span><span class="q-skel lw-x-skel tall"></span>` });
  const qa = h('div', { class: 'lw-x-qa' });
  const input = h('input', { type: 'text', class: 'lw-ask-q', maxlength: String(MAX_Q), enterkeyhint: 'send', placeholder: one ? W('再問這一條…', 'Ask more about it…') : W('再問這幾條…', 'Ask more about them…') });
  const form = h('form', { class: 'lw-composer in-sheet', onsubmit: e => (e.preventDefault(), input.value.trim() && ask(input.value)) }, [input, h('button', { class: 'lw-send', type: 'submit', 'aria-label': W('問', 'Ask'), html: ICON_SEND })]);
  const sugg = h('div', { class: 'lw-starters', html: [W('適用在誰身上？', 'Who does it apply to?'), W('違反會怎樣？', 'What if it’s broken?'), W('有什麼例外？', 'Any exceptions?')].map(t => `<button type="button" class="lw-starter">${esc(t)}</button>`).join(''), onclick: e => { const b = e.target.closest('button'); if (b) ask(b.textContent); } });
  const note = h('p', { class: 'lw-ask-note', text: W('AI 依條文和公開的背景知識整理，只是一般資訊，不是法律意見。', 'AI, from the text and well-known background. General information, not legal advice.') });
  sheet({ title: `${shortName(law.n)}${one ? artLabel(ks[0], en) : `${artLabel(ks[0], en)}–${ks[ks.length - 1]}`}`, closeLabel: W('關閉', 'Close'), cls: 'lw-ask-sheet', body: [quote, out, qa, sugg, form, note].filter(Boolean) });
  const chips = pt => (one ? '' : pt.cites.map(c => citeChip(law.p, c, '')).join(''));
  const part = (title, html) => (html ? `<section class="lw-x-part"><h3>${esc(title)}</h3>${html}</section>` : '');
  (async () => {
    const r = await askLaw({ p: law.p, arts: ks, lang: en ? 'en' : 'zh' }, ai);
    if (r.error) return void (out.innerHTML = `<p class="lw-none">${esc(askError(r.error, en))}</p>`);
    if (!r.covered) return void (out.innerHTML = `<p class="lw-none">${esc(r.answer || W('這一條現在解釋不了，請稍後再試。', 'Can’t explain this one right now.'))}</p>`);
    out.innerHTML =
      `<div class="lw-x-gist"><span class="lw-x-label">${ICON_SPARK}${W('白話', 'In plain words')}</span><p>${esc(r.gist || r.answer)}</p></div>` +
      part(W('條文在說什麼', 'What it says'), r.points.length ? `<ul class="lw-x-points">${r.points.map(pt => `<li>${esc(pt.text)}${chips(pt)}</li>`).join('')}</ul>` : '') +
      part(W('為什麼有這一條', 'Why it’s there'), r.why ? `<p>${esc(r.why)}</p>` : '') +
      part(W('舉個例子', 'For example'), r.examples?.length ? `<div class="lw-x-examples">${r.examples.map(x => `<div class="lw-x-ex">${x.title ? `<b>${esc(x.title)}</b>` : ''}<p>${esc(x.text)}</p></div>`).join('')}</div>` : '') +
      part(W('現在的情形', 'Today'), r.now ? `<p>${esc(r.now)}</p>` : '') +
      part(W('看不懂的詞', 'Words to know'), r.terms?.length ? `<dl class="lw-x-terms">${r.terms.map(t => `<dt>${esc(t.term)}</dt><dd>${esc(t.means)}</dd>`).join('')}</dl>` : '') +
      part(W('相關條文', 'Read next'), r.related?.length ? `<div class="lw-x-related">${r.related.map(x => `<a class="lw-ref lw-x-rel" href="#law=${esc(x.p)}&amp;a=${esc(x.k)}" data-law="${esc(x.p)}" data-from="${esc(x.k)}" data-to="${esc(x.k)}" data-para="0"><span><b>${esc(`${x.p === law.p ? '' : en ? `${nameOf(x.p, x.n)} ` : shortName(x.n)}${artLabel(x.k, en)}`)}</b>${x.why ? `<small>${esc(x.why)}</small>` : ''}</span>${ICON_CHEV}</a>`).join('')}</div>` : '');
  })();
  // A question: answered under the explanation (the newest replaces the last).
  async function ask(q) {
    input.value = '';
    qa.innerHTML = `<div class="lw-answer"><p class="lw-asked">${esc(q)}</p><div class="lw-typing"><i></i><i></i><i></i></div></div>`;
    qa.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const r = await askLaw({ p: law.p, arts: ks, q, lang: en ? 'en' : 'zh' }, ai);
    if (r.error) return void (qa.innerHTML = `<div class="lw-answer"><p class="lw-asked">${esc(q)}</p><p class="lw-none">${esc(askError(r.error, en))}</p></div>`);
    asked();
    qa.innerHTML = `<div class="lw-answer"><p class="lw-asked">${esc(q)}</p>${r.covered ? `${r.answer ? `<p class="lw-lead">${esc(r.answer)}</p>` : ''}<ul class="lw-x-points">${r.points.map(pt => `<li>${esc(pt.text)}${chips(pt)}</li>`).join('')}</ul>` : `<p>${esc(r.answer || (one ? W('這一條沒有規定這件事。', 'This article doesn’t cover that.') : W('這幾條沒有規定這件事。', 'These articles don’t cover that.')))}</p>`}</div>`;
  }
}

// A ruling's AI (like an article's 白話解釋): what it decided, why, who it
// affects, then questions about it. Every point cites the ruling's own
// paragraphs; a tap on one shows its words under the point.
const RULING_JID = /^[A-Z]{3,5},\d{2,3},[^,\s]{1,12},\d{1,6},\d{8},\d{1,3}$/u;
const rulingAiId = id => (isCons(id) || RULING_JID.test(id) ? id : '');
function rulingAiBtn(id, title) {
  return `<button type="button" class="lw-ai-btn lw-ruling-ai" data-ruling-ai="${esc(id)}" data-title="${esc(title)}">${ICON_SPARK}<span>${W('AI 白話解釋這個判決', 'Explain this ruling in plain words')}</span></button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ruling-ai]');
  if (b) explainRuling(b.dataset.rulingAi, b.dataset.title || '');
});
function explainRuling(id, title) {
  const out = h('div', { class: 'lw-ask' });
  const input = h('input', { type: 'text', class: 'lw-ask-q', maxlength: String(MAX_Q), enterkeyhint: 'send', placeholder: W('問這個判決…', 'Ask about this ruling…') });
  const form = h('form', { class: 'lw-composer in-sheet', onsubmit: e => (e.preventDefault(), input.value.trim() && (run(input.value), (input.value = ''), input.blur())) }, [input, h('button', { class: 'lw-send', type: 'submit', 'aria-label': W('問', 'Ask'), html: ICON_SEND })]);
  const sugg = h('div', { class: 'lw-starters', html: [W('對一般人有什麼影響？', 'What does it mean for people?'), W('法院為什麼這樣判？', 'Why did the court decide so?'), W('什麼時候開始生效？', 'When does it take effect?')].map(t => `<button type="button" class="lw-starter">${esc(t)}</button>`).join(''), onclick: e => { const b = e.target.closest('button'); if (b) run(b.textContent); } });
  const note = h('p', { class: 'lw-ask-note', text: W('AI 只依這個判決的原文回答，不是法律意見。', 'AI, from this ruling’s own text only. Not legal advice.') });
  // A cited paragraph: tapped, its words open under the point (again: closed).
  out.addEventListener('click', e => {
    const c = e.target.closest('[data-pk]');
    if (!c || !c.closest('.lw-ruling-points')) return;
    e.preventDefault();
    const li = c.closest('li');
    const was = li.querySelector(`.lw-quote[data-for="${c.dataset.pk}"]`);
    li.querySelectorAll('.lw-quote').forEach(q => q.remove());
    li.querySelectorAll('[data-pk]').forEach(x => x.setAttribute('aria-expanded', 'false'));
    if (was) return;
    c.setAttribute('aria-expanded', 'true');
    li.insertAdjacentHTML('beforeend', `<blockquote class="lw-quote" data-for="${esc(c.dataset.pk)}"><small>${esc(c.dataset.part)}</small>${linkedHtml(c.dataset.text, state.names)}</blockquote>`);
  });
  sheet({ title: title || W('判決', 'Ruling'), closeLabel: W('關閉', 'Close'), cls: 'lw-ask-sheet', body: [out, sugg, form, note] });
  const chip = (k, quotes) => {
    const [part, text] = quotes[k] || ['', ''];
    // (憲判字's paragraphs carry their own 【n】: shown as the ruling numbers them.)
    const mark = /【(\d+)】\s*$/.exec(text)?.[1];
    const label = part === '理由' ? (mark ? `【${mark}】` : W(`第${k}段`, `¶${k}`)) : part;
    return `<button type="button" class="lw-cite lw-para" data-pk="${esc(k)}" data-part="${esc(part)}" data-text="${esc(text)}" aria-expanded="false"><span>${esc(label)}</span></button>`;
  };
  async function run(q = '') {
    out.innerHTML = `<div class="lw-answer">${q ? `<p class="lw-asked">${esc(q)}</p>` : ''}<div class="lw-typing"><i></i><i></i><i></i></div></div>`;
    const r = await askRuling({ id, q, lang: en ? 'en' : 'zh' }, ai);
    if (r.error) return void (out.innerHTML = `<div class="lw-answer"><p class="lw-none">${esc(askError(r.error, en))}</p></div>`);
    if (q) asked();
    const points = r.points.map(pt => `<li>${esc(pt.text)} ${pt.cites.map(c => chip(c, r.quotes)).join('')}</li>`).join('');
    const left = r.left != null ? `<p class="lw-srcs">${W(`今天還能問 ${r.left} 次`, `${r.left} left today`)}</p>` : '';
    out.innerHTML = `<div class="lw-answer">${q ? `<p class="lw-asked">${esc(q)}</p>` : ''}${
      r.covered
        ? `${r.answer ? `<p class="lw-lead">${esc(r.answer)}</p>` : ''}${r.held ? `<div class="lw-block cons lw-held"><h4>${W('判了什麼', 'What it decided')}</h4><p>${esc(r.held)}</p></div>` : ''}${points ? `${q ? '' : `<h4 class="lw-ai-h">${W('為什麼', 'Why')}</h4>`}<ul class="lw-points lw-ruling-points">${points}</ul>` : ''}${r.who.length ? `<div class="lw-block blue lw-who"><h4><i>${MENU_ICON.gov}</i>${W('影響到誰', 'Who it affects')}</h4><p>${esc(r.who.join(W('、', ', ')))}</p></div>` : ''}`
        : `<p>${esc(r.answer || W('這個判決沒有談到這件事。', 'The ruling doesn’t say.'))}</p>`
    }${left}</div>`;
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
// Several articles of one law: one chip (刑訴法 第377、382條), opening the first.
const citeChip = (p, k, n) => {
  const ks = [].concat(k);
  const label = en ? `Art. ${ks.join(', ')}` : `第${ks.join('、')}條`;
  // (The name and the article apart: a long name is cut short with …, the article never.)
  return `<a class="lw-ref lw-cite" href="#law=${esc(p)}&amp;a=${esc(ks[0])}" data-law="${esc(p)}" data-from="${esc(ks[0])}" data-to="${esc(ks[0])}" data-para="0">${n ? `<b>${esc(en ? nameOf(p, n) : shortName(n))}</b>` : ''}<span>${esc(label)}</span></a>`;
};

// The rulings on an article: 憲法法庭's first, then the top courts' (newest first), each read in the app.
function rulingsSheet(label, rulings, consIds = []) {
  const cons = consIds.map(id => state.consRows?.byId.get(id)).filter(Boolean);
  const top = rulings.filter(r => courtOf(r[0])), low = rulings.filter(r => !courtOf(r[0]));
  const rows = l => list(l.map(r => rulingRow(r, { sub: [courtLabel(r[0]), caseNo(r[0]), ymd(r[1])].filter(Boolean).join(' · ') })));
  const html = (cons.length ? `<p class="lw-list-cap">${W('憲法法庭', 'Constitutional Court')}</p>${list(cons.map(r => rulingRow(r)))}` : '') + (top.length ? `${cons.length || low.length ? `<p class="lw-list-cap">${W('最高法院・最高行政法院', 'Top courts')}</p>` : ''}${rows(top)}` : '') + (low.length ? `<p class="lw-list-cap">${W('高等法院・地方法院', 'High and district courts')}</p>${rows(low)}` : '');
  sheet({ title: label, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-rulings in-sheet', html }) });
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

// ---- 在 App 裡讀: government pages, 質詢 videos and bills open in a sheet -------------
// (Pages through the proxy's /law-page, cached at the edge; videos and bills
// straight from the 立法院 API. YouTube stays a link: Jay's pick for video.)

const pageCache = new Map();
function fetchPage(u) {
  if (!pageCache.has(u))
    pageCache.set(
      u,
      ai(pageUrl(u))
        .then(async r => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.error) throw Object.assign(new Error(j.error || `http${r.status}`), { code: j.error || r.status });
          return j;
        })
        .catch(e => (pageCache.delete(u), Promise.reject(e)))
    );
  return pageCache.get(u);
}

const fileKind = u => (u.match(/\.(pdf|docx?|odt|xlsx?|ods|pptx?|zip)(?:$|[?#])/i)?.[1] || 'file').toUpperCase();
function blocksHtml(blocks) {
  let out = '';
  let list = '';
  const flush = () => list && ((out += `<ul>${list}</ul>`), (list = ''));
  for (const b of blocks) {
    if (b.k === 'li') { list += `<li>${esc(b.t)}</li>`; continue; }
    flush();
    if (b.k === 'h') out += `<h4>${esc(b.t)}</h4>`;
    else if (b.k === 'p') out += proseHtml(b.t, state.names);
    else if (b.k === 'pre') out += `<div class="lw-page-pre">${proseHtml(b.t, state.names)}</div>`;
    else if (b.k === 'table') out += `<div class="lw-page-table"><table>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
    else if (b.k === 'img') out += `<figure>${b.href && readable(b.href) ? `<a href="${esc(b.href)}" target="_blank" rel="noopener">` : ''}<img src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy" referrerpolicy="no-referrer">${b.href && readable(b.href) ? '</a>' : ''}${b.alt ? `<figcaption>${esc(b.alt)}</figcaption>` : ''}</figure>`;
    else if (b.k === 'link') out += `<a class="lw-page-link" href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.t)}</a>`;
  }
  flush();
  return out;
}

// A page read in the app: its title, date, text, pictures and attachments.
async function openPage(u, label = '') {
  const body = h('div', { class: 'lw-page', html: `<p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel short"></p>` });
  sheet({ title: label.slice(0, 40) || W('閱讀', 'Read'), closeLabel: W('關閉', 'Close'), body });
  // A picture its site won't share (CORP): its caption stays, the picture goes.
  body.addEventListener('error', e => e.target.tagName === 'IMG' && e.target.closest('figure')?.classList.add('broken'), true);
  const fallback = `<a class="lw-out" href="${esc(u)}" target="_blank" rel="noopener" data-out>${W('到原網站看', 'Open the original site')}</a>`;
  try {
    const j = await fetchPage(u);
    if (j.type !== 'html' && !/^(pdf|file)$/.test(j.type)) throw Object.assign(new Error('bad'), { code: 'bad' });
    if (j.type !== 'html') {
      body.innerHTML = `<p class="lw-none">${W(`這是 ${fileKind(j.url || u)} 檔，App 裡還不能直接開。`, `This is a ${fileKind(j.url || u)} file the app can't open yet.`)}</p>${fallback}`;
      return;
    }
    const r = readPage(j.html, j.url || u);
    if (!hasText(r)) throw Object.assign(new Error('empty'), { code: 'empty' });
    const host = new URL(j.url || u).hostname.replace(/^www\./, '');
    body.innerHTML = `<header class="lw-page-head"><h3>${esc(r.title || label)}</h3><small>${esc([r.date && shortDay(r.date), host].filter(Boolean).join(' · '))}</small></header>${blocksHtml(r.blocks)}${r.files.length ? `<h4>${W('附件', 'Attachments')}</h4><div class="lw-list in-sheet">${r.files.map(f => `<a class="lw-row" href="${esc(f.url)}" target="_blank" rel="noopener"><span class="lw-file">${esc(fileKind(f.url))}</span><span class="lw-row-text"><span class="lw-row-name">${esc(f.name)}</span></span></a>`).join('')}</div>` : ''}<p class="lw-page-src">${W('內容取自', 'From')} ${esc(host)}</p>`;
  } catch (e) {
    const why = e.code === 'cap' ? W('今天讀太多頁了，明天再試', 'Daily reading limit reached; try tomorrow') : e.code === 'pass' || e.code === 401 ? W('請先登入 Orbit Pass', 'Sign in with Orbit Pass first') : e.code === 'empty' ? W('這一頁讀不出內容', 'This page has nothing the app can read') : W('現在讀不到這一頁，請稍後再試', 'Couldn’t load this page; try again later');
    body.innerHTML = `<p class="lw-none">${why}</p>${fallback}`;
  }
}

// A judgment: the outcome first in plain words, then who, then the reasons a point at a time.
async function openJudgment(u, label = '') {
  const body = h('div', { class: 'lw-page lw-jd', html: `<p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel short"></p>` });
  sheet({ title: W('判決', 'Ruling'), closeLabel: W('關閉', 'Close'), body, detent: 'large' });
  if (label) noteRead({ kind: 'judgment', id: u, title: label, href: u, sub: '' });
  const out = `<a class="lw-out" href="${esc(u)}" target="_blank" rel="noopener" data-out>${W('到司法院看原文', 'Open on the Judicial Yuan')}</a>`;
  let jid = '';
  try {
    jid = rulingAiId(new URL(u).searchParams.get('id') || '');
  } catch {}
  try {
    const j = await fetchPage(u);
    if (j.type !== 'html') throw new Error('bad');
    const r = readJudgment(j.html);
    if (!r.main.length) throw new Error('empty');
    const o = outcome(r.main.join(''));
    const who = partiesLine(r.parties);
    const point = x => {
      const t = x.text.replace(/^[一二三四五六七八九十百]+、/, '');
      const [first, ...rest] = t.split('\n');
      return rest.length || first.length > 90 ? `<details class="lw-jd-point"><summary><b>${esc(x.head || '·')}</b><span>${esc(first.slice(0, 90))}${first.length > 90 ? '…' : ''}</span></summary>${proseHtml([first.length > 90 ? first : '', ...rest].filter(Boolean).join('\n'), state.names)}</details>` : `<div class="lw-jd-point"><b>${esc(x.head || '·')}</b><span>${linkedHtml(first, state.names)}</span></div>`;
    };
    body.innerHTML =
      `<header class="lw-page-head"><h3>${esc(label || r.title)}</h3><small>${esc([r.title, r.no, r.date && shortDay(r.date)].filter(Boolean).join(' · '))}</small></header>` +
      (jid ? rulingAiBtn(jid, r.no || label || r.title) : '') +
      `<div class="lw-jd-hero ${o.tone}"><span>${W('結果', 'Outcome')}</span>${o.label ? `<strong>${esc(o.label)}</strong>` : ''}${proseHtml(r.main.join('\n'), state.names)}</div>` +
      (who.length ? `<p class="lw-jd-who">${who.map(esc).join('<br>')}</p>` : '') +
      (r.reasons.length ? `<h4>${W(`理由（${r.reasons.length} 點）`, `Reasons (${r.reasons.length})`)}</h4><div class="lw-jd-points">${r.reasons.map(point).join('')}</div>` : '') +
      (r.judges.length ? `<p class="lw-page-src">${esc(W(`法官 ${r.judges.join('、')}`, `Judges ${r.judges.join(', ')}`))}</p>` : '') +
      out;
  } catch {
    // Not the usual shape: the page as read, or the way out.
    try {
      const j = await fetchPage(u);
      const r = readPage(j.html, j.url || u);
      if (!hasText(r)) throw new Error('empty');
      body.innerHTML = `<header class="lw-page-head"><h3>${esc(r.title || label)}</h3></header>${blocksHtml(r.blocks)}${out}`;
    } catch {
      body.innerHTML = `<p class="lw-none">${W('現在讀不到這份判決，請稍後再試', 'Couldn’t load this ruling; try again later')}</p>${out}`;
    }
  }
}

// A rule whose whole text we kept (a ministry's or a city's, 'agency/<file>' or 'local/<file>'): read from this site.
async function openRuleText(path, label) {
  const body = h('div', { class: 'lw-page', html: `<p class="lw-page-wait q-skel"></p>` });
  sheet({ title: label.slice(0, 40), closeLabel: W('關閉', 'Close'), body });
  try {
    const [dir, file] = path.split('/');
    const r = await fetch(`./data/${dir}/text/${file}.json`).then(x => (x.ok ? x.json() : Promise.reject()));
    // Its points as points, every law it names a link, then its page (Jay 2026-10-27: it read as one plain block).
    body.innerHTML = `<header class="lw-page-head"><h3>${esc(r.n)}</h3><small>${esc([r.a, r.d && ymd(r.d)].filter(Boolean).join(' · '))}</small></header><div class="lw-rule-text">${ruleHtml(r.t, state.names)}</div>${/^https:\/\//.test(r.url || '') ? `<a class="lw-out" href="${esc(r.url)}" target="_blank" rel="noopener" data-out>${W('到原網站看', 'Open the original site')}</a>` : ''}`;
  } catch {
    body.innerHTML = `<p class="lw-none">${W('讀不到這個規定', 'Couldn’t load this rule')}</p>`;
  }
}

// A 質詢 clip played in the app (the 立法院's own stream), with what was said.
const fmtSec = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
async function openClip(id, label = '') {
  const body = h('div', { class: 'lw-clip-sheet', html: `<div class="lw-video q-skel"></div>` });
  sheet({ title: label.slice(0, 40) || W('質詢影片', 'Speech video'), closeLabel: W('關閉', 'Close'), body });
  try {
    const j = await fetch(`https://v2.ly.govapi.tw/ivod/${encodeURIComponent(id)}`).then(r => r.json());
    const d = j?.data;
    if (!d?.video_url) throw new Error('none');
    const lines = d.transcript?.whisperx || [];
    const yt = `https://www.youtube.com/@LegislativeYuan/search?query=${encodeURIComponent([d['委員名稱'], d['日期']].filter(Boolean).join(' '))}`;
    body.innerHTML = `<video class="lw-video" controls playsinline preload="metadata"></video><p class="lw-clip-meta"><b>${esc(d['委員名稱'] || '')}</b> ${esc(d['會議資料']?.['委員會代碼:str']?.[0] || d['會議資料']?.['種類'] || '')} · ${esc(shortDay(d['日期'] || ''))} · ${esc(d['影片長度'] || '')}</p><a class="lw-yt" href="${esc(yt)}" target="_blank" rel="noopener">${ICON_YT}<span>${W('在 YouTube 找同一場', 'Find it on YouTube')}</span></a>${lines.length ? `<h4>${W('逐字稿（AI 聽寫）', 'Transcript (AI)')}</h4><ol class="lw-transcript">${lines.map((l, i) => `<li data-i="${i}" data-t="${l.start}"><time>${fmtSec(l.start)}</time><span>${esc(l.text)}</span></li>`).join('')}</ol>` : ''}`;
    const v = body.querySelector('video');
    await playHls(v, d.video_url);
    const items = [...body.querySelectorAll('.lw-transcript li')];
    body.querySelector('.lw-transcript')?.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (li) (v.currentTime = +li.dataset.t), v.play().catch(() => {});
    });
    let at = -1;
    v.addEventListener('timeupdate', () => {
      let i = at;
      while (i + 1 < lines.length && lines[i + 1].start <= v.currentTime) i++;
      while (i > 0 && lines[i].start > v.currentTime) i--;
      if (i !== at) (items[at]?.classList.remove('now'), items[i]?.classList.add('now'), (at = i));
    });
  } catch {
    body.innerHTML = `<p class="lw-none">${W('現在讀不到這段影片', 'Couldn’t load this video')}</p><a class="lw-out" href="${esc(ivodUrl(id))}" target="_blank" rel="noopener" data-out>${W('到立法院 IVOD 看', 'Watch on the Legislative Yuan’s IVOD')}</a>`;
  }
}

// How a bill becomes law: the six steps in plain words, `at` (a step) marked.
function howBillsWork(at = -1) {
  const rows = STEP_HELP.map(([zh, zhText, e, enText], i) => `<li class="${i === at ? 'now' : i < at ? 'done' : ''}"><b>${esc(W(zh, e))}${i === at ? `<span class="lw-tag indigo">${W('在這一步', 'Here now')}</span>` : ''}</b><span>${esc(W(zhText, enText))}</span></li>`).join('');
  sheet({ title: W('法案怎麼變成法律', 'How a bill becomes law'), closeLabel: W('關閉', 'Close'), body: [h('ol', { class: 'lw-howto', html: rows }), h('p', { class: 'lw-hint-sm', text: W('同一部法常有很多版本（不同立委或政黨各提一個），委員會通常會把它們併在一起審。', 'One law often has many versions (each legislator or party files their own); committees usually review them together.') })] });
}

// An HLS stream in a <video>: Safari's own player, else hls.js (loaded only then).
async function playHls(v, url) {
  if (v.canPlayType('application/vnd.apple.mpegurl')) return void (v.src = url);
  await new Promise((ok, no) => { if (window.Hls) return ok(); const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'; sc.onload = ok; sc.onerror = no; document.head.append(sc); });
  const hls = new window.Hls();
  hls.loadSource(url);
  hls.attachMedia(v);
}

// A bill by its 立法院 number, read in the app: who, why, its steps and 對照表.
async function openBillById(id) {
  const body = h('div', { class: 'lw-page', html: `<p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel"></p>` });
  sheet({ title: W('法案', 'Bill'), closeLabel: W('關閉', 'Close'), body });
  try {
    const b = (await fetch(`https://v2.ly.govapi.tw/bill/${encodeURIComponent(id)}`).then(r => r.json()))?.data;
    if (!b) throw new Error('none');
    const flow = (b['議案流程'] || []).map(f => `<li class="done"><b>${esc(String(f['狀態'] || '').replace(/\s*[（(].*$/, ''))}</b><span>${esc(ymd([].concat(f['日期'] || [])[0] || ''))}</span></li>`).join('');
    const who = [...(b['提案人'] || [])];
    body.innerHTML = `<header class="lw-page-head"><h3>${esc(String(b['議案名稱'] || '').replace(/，請審議案。?$/, ''))}</h3><small>${esc([b['提案單位/提案委員'], b['提案日期'] && shortDay(b['提案日期']), b['議案狀態']].filter(Boolean).join(' · '))}</small></header>${who.length ? `<div class="lw-names">${who.map(n => `<span class="lw-name">${esc(n)}</span>`).join('')}</div>` : ''}${b['案由'] ? `<h4>${W('案由', 'Why')}</h4>${proseHtml(b['案由'], state.names)}` : ''}${b['說明'] ? `<details class="lw-fold"><summary>${W('說明', 'Explanation')}</summary>${proseHtml(b['說明'], state.names)}</details>` : ''}${flow ? `<h4>${W('審議過程', 'Steps so far')}</h4><ol class="lw-timeline">${flow}</ol>` : ''}<h4>${W('條文對照', 'What it changes')}</h4><div class="lw-diffs"></div>${b['連署人']?.length ? `<details class="lw-fold"><summary>${W(`連署 ${b['連署人'].length} 人`, `${b['連署人'].length} co-signers`)}</summary><div class="lw-names">${b['連署人'].map(n => `<span class="lw-name">${esc(n)}</span>`).join('')}</div></details>` : ''}`;
    compareBill({ id }, body.querySelector('.lw-diffs'), { first: 3 });
  } catch {
    body.innerHTML = `<p class="lw-none">${W('現在讀不到這個法案', 'Couldn’t load this bill')}</p>`;
  }
}

// A 子法 chip on a search card opens that 子法, not the article.
document.addEventListener('click', e => {
  const sub = e.target.closest('[data-sub]');
  if (sub) (e.preventDefault(), e.stopPropagation(), go(`law=${sub.dataset.sub}`));
  // A quick question runs its search.
  const q = e.target.closest('.lw-quick-q');
  if (q) go(`tab=laws&q=${encodeURIComponent(q.dataset.q)}`);
}, true);

// Every link out of the app lands here first: what the app can read, it reads.
document.addEventListener(
  'click',
  e => {
    const a = e.target.closest('a[href]');
    if (!a || a.hasAttribute('data-out') || e.defaultPrevented) return;
    const href = a.href;
    const label = a.querySelector('b, .lw-row-name, .lw-bill-name')?.textContent || a.textContent.trim();
    let m;
    // A ruling (#r=<id>): opened over the screen it was tapped on.
    if ((m = (a.getAttribute('href') || '').match(/^#r=(.+)$/))) return e.preventDefault(), openRuling(decodeURIComponent(m[1]));
    // A bill (#item=…) tapped outside 立法 (a law you're reading, 首頁): over that screen, so closing it is back where you were.
    if ((m = (a.getAttribute('href') || '').match(/^#item=([^&]+)$/)) && state.tab !== 'bills') return e.preventDefault(), openItem(decodeURIComponent(m[1]).replace('-', ':'));
    if (a.dataset.text) return e.preventDefault(), openRuleText(a.dataset.text, label);
    if ((m = href.match(/^https:\/\/ivod\.ly\.gov\.tw\/Play\/Clip\/\w+\/(\d+)/))) return e.preventDefault(), openClip(m[1], label);
    if ((m = href.match(/^https:\/\/ppg\.ly\.gov\.tw\/ppg\/bills\/(\d+)\/details/))) return e.preventDefault(), openBillById(m[1]);
    if (/^https:\/\/judgment\.judicial\.gov\.tw\/FJUD\/data\.aspx/.test(href)) return e.preventDefault(), openJudgment(href, label);
    if (/^https?:/.test(href) && !href.startsWith(location.origin) && readable(href)) return e.preventDefault(), openPage(href, label);
  },
  true
);

// ---- Links: a tap opens the article in a sheet, the reader stays put ----------------

document.addEventListener('click', e => {
  const pend = e.target.closest('.lw-pending');
  if (pend) return openItem(pend.dataset.item.replace('-', ':'));
  const sub = e.target.closest('.lw-regs');
  if (sub) return openRegs(sub.dataset.art);
  const rul = e.target.closest('.lw-rul');
  if (rul) return openRulings(rul.dataset.art);
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

// 對話紀錄: the saved chats by day (今天, 昨天, 過去 7 天, then months),
// each its title, what it came to and how many questions; a search once
// there are a few. A tap continues one; … continues, renames or deletes it
// (a delete can be undone from the toast). 刪除全部 asks in the kit's
// dialog, never the browser's.
function chatHistory() {
  const pad = n => String(n).padStart(2, '0');
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const groupName = k => {
    if (k === 'today') return W('今天', 'Today');
    if (k === 'yesterday') return W('昨天', 'Yesterday');
    if (k === 'week') return W('過去 7 天', 'Previous 7 days');
    const [y, m] = k.split('-').map(Number);
    const mine = y === new Date().getFullYear();
    return en ? `${MON_EN[m - 1]}${mine ? '' : ` ${y}`}` : `${mine ? '' : `${y} 年 `}${m} 月`;
  };
  const when = (u, k) => {
    const d = new Date(u);
    if (k === 'today' || k === 'yesterday') return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (k === 'week') return en ? d.toLocaleDateString('en', { weekday: 'short' }) : `週${'日一二三四五六'[d.getDay()]}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  let q = '';
  const row = (c, k) => {
    const n = questionsIn(c);
    const gist = chatGist(c);
    const now = c.id === chat.id && chat.turns.length > 0;
    return `<div class="lw-chat-row${now ? ' on' : ''}"><button type="button" class="lw-chat-open" data-id="${esc(c.id)}"><span class="lw-chat-t">${esc(c.t)}</span>${gist ? `<span class="lw-chat-gist">${esc(gist)}</span>` : ''}<small>${now ? `<b>${W('目前的對話', 'Open now')}</b> · ` : ''}${esc(when(c.u, k))} · ${esc(W(`${n} 個問題`, `${n} question${n > 1 ? 's' : ''}`))}</small></button><button type="button" class="lw-chat-more" data-more="${esc(c.id)}" aria-label="${W('更多', 'More')}">${ICON.more}</button></div>`;
  };
  const listHtml = () => {
    if (!chats.length) return emptyHtml({ icon: 'history', tint: '#4f46e5', title: W('還沒有對話', 'No chats yet'), body: W('問過的問題會存在這支手機上，隨時回來接著問。', 'What you ask is kept on this phone, ready to pick up again.'), action: { label: W('問一個問題', 'Ask a question'), tap: 'ask' } });
    const shown = chats.filter(c => chatMatches(c, q));
    if (!shown.length) return `<p class="lw-none lw-chat-none">${W(`沒有對話提到「${esc(q.trim())}」`, `No chat mentions “${esc(q.trim())}”`)}</p>`;
    return chatGroups(shown).map(g => `<h3 class="q-list-head lw-chat-head">${esc(groupName(g.key))}</h3><div class="lw-chat-group">${g.chats.map(c => row(c, g.key)).join('')}</div>`).join('');
  };
  const list = h('div', { class: 'lw-chat-groups', html: listHtml() });
  const foot = h('div', { class: 'lw-chat-foot' });
  const drawFoot = () => {
    foot.hidden = !chats.length;
    foot.innerHTML = `<small>${W(`${chats.length} 個對話，只存在這支手機上`, `${chats.length} chat${chats.length > 1 ? 's' : ''}, kept only on this phone`)}</small><button type="button" class="lw-chat-clear">${W('全部刪除', 'Delete all')}</button>`;
  };
  const find = search({ placeholder: W('搜尋對話', 'Search chats'), onInput: v => ((q = v), (list.innerHTML = listHtml())) });
  find.classList.add('lw-chat-find');
  const redraw = () => {
    startNew.hidden = !chats.length;
    find.hidden = chats.length < 5;
    if (find.hidden) q = '';
    list.innerHTML = listHtml();
    drawFoot();
  };
  const startNew = h('button', { type: 'button', class: 'lw-chat-new', html: `<i>${MENU_ICON.edit}</i><span>${W('新對話', 'New chat')}</span>` });
  const body = h('div', { class: 'lw-chat-list' }, [startNew, find, list, foot]);
  redraw();
  const s = sheet({ title: W('對話紀錄', 'Chats'), closeLabel: W('關閉', 'Close'), cls: 'lw-chats-sheet', body });
  const toComposer = () => {
    s.close();
    requestAnimationFrame(() => $('panel-ask')?.querySelector('.lw-ask-q')?.focus());
  };
  const drop = c => {
    const before = chats;
    chats = saveChats(dropChat(chats, c.id));
    if (c.id === chat.id) newChat();
    redraw();
    toast(W('已刪除對話', 'Chat deleted'), { ms: 5000, action: { label: W('復原', 'Undo'), onTap: () => ((chats = saveChats(before)), s.el.isConnected && redraw()) } });
  };
  body.addEventListener('click', async e => {
    if (e.target.closest('.lw-chat-new')) return void (newChat(), toComposer());
    if (e.target.closest('[data-tap="ask"]')) return void toComposer();
    const o = e.target.closest('.lw-chat-open');
    if (o) return void (s.close(), openChat(o.dataset.id));
    const m = e.target.closest('.lw-chat-more');
    if (m) {
      const c = chats.find(x => x.id === m.dataset.more);
      if (!c) return;
      const menu = sheet({ title: c.t, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-menu' }, [
        h('button', { class: 'lw-menu-row ask', type: 'button', html: `<i>${MENU_ICON.ask}</i><span>${W('繼續這個對話', 'Continue')}</span>`, onclick: () => (menu.close(), s.close(), openChat(c.id)) }),
        h('form', { class: 'lw-rename', onsubmit: e => {
          e.preventDefault();
          chats = saveChats(renameChat(chats, c.id, e.currentTarget.elements.t.value));
          redraw();
          menu.close();
        } }, [h('i', { html: MENU_ICON.edit }), h('input', { name: 't', value: c.t, maxlength: '60', enterkeyhint: 'done', 'aria-label': W('對話名稱', 'Chat name') }), h('button', { type: 'submit', text: W('改名', 'Rename') })]),
        h('button', { class: 'lw-menu-row warn', type: 'button', html: `<i>${MENU_ICON.trash}</i><span>${W('刪除', 'Delete')}</span>`, onclick: () => (menu.close(), drop(c)) })
      ]) });
      return;
    }
    if (e.target.closest('.lw-chat-clear')) {
      const n = chats.length;
      const yes = await kit.ask({ icon: 'trash', tint: 'var(--q-red)', danger: true, title: W(`刪除全部 ${n} 個對話？`, `Delete all ${n} chats?`), body: W('這支手機上的對話紀錄會全部清掉，無法復原。', 'Every chat on this phone goes, and can’t be brought back.'), ok: W('全部刪除', 'Delete all'), cancel: W('取消', 'Cancel') });
      if (!yes) return;
      chats = saveChats([]);
      newChat();
      redraw();
      toast(W('已刪除全部對話', 'All chats deleted'));
    }
  });
}

// The reader's city for 地方法規 (a city's rules bind only who lives there):
// picked here, else the county of the places the family apps share.
const myCities = () => citiesOf(readCity(), ['home', 'work', 'school'].map(placeOf));
const CITY_EN = { 臺北市: 'Taipei', 新北市: 'New Taipei', 桃園市: 'Taoyuan', 臺中市: 'Taichung', 臺南市: 'Tainan', 高雄市: 'Kaohsiung', 基隆市: 'Keelung', 新竹市: 'Hsinchu City', 嘉義市: 'Chiayi City', 新竹縣: 'Hsinchu County', 苗栗縣: 'Miaoli', 彰化縣: 'Changhua', 南投縣: 'Nantou', 雲林縣: 'Yunlin', 嘉義縣: 'Chiayi County', 屏東縣: 'Pingtung', 宜蘭縣: 'Yilan', 花蓮縣: 'Hualien', 臺東縣: 'Taitung', 澎湖縣: 'Penghu', 金門縣: 'Kinmen', 連江縣: 'Matsu' };
const cityEn = c => CITY_EN[c] || c;
function citySheet() {
  const now = myCities()[0] || '';
  const row = (c, label) => `<button type="button" class="lw-row lw-city-row${c === now ? ' on' : ''}" data-city="${esc(c)}"><span class="lw-row-text"><span class="lw-row-name">${esc(label)}</span></span>${c === now ? '<i aria-hidden="true">✓</i>' : ''}</button>`;
  const body = h('div', { html: `<p class="lw-sheet-lede">${W('問法律只查你住的縣市的地方法規（自治條例、規則）。問到別的縣市時，會查你問的那裡。', 'Ask looks only at the local rules of where you live; name another city in a question to ask about it.')}</p><div class="lw-list in-sheet">${CITIES.map(c => row(c, en ? cityEn(c) : c)).join('')}${row('', W('不查地方法規', 'No local rules'))}</div>` });
  const s = sheet({ title: W('你住的縣市', 'Where you live'), closeLabel: W('關閉', 'Close'), body });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-city]');
    if (!b) return;
    saveCity(b.dataset.city);
    s.close();
    drawChat();
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
    dockComposer(form, input);
    const tools = h('div', { class: 'lw-ask-tools' }, [
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('對話紀錄', 'Chats'), html: MENU_ICON.history, onclick: () => chatHistory() }),
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('新對話', 'New chat'), html: MENU_ICON.edit, onclick: () => newChat() })
    ]);
    panel.append(h('div', { class: 'lw-ask-head' }, [headNode(W('問法律', 'Ask the law')), tools]), h('div', { class: 'lw-chat', id: 'chat' }), form);
    wireTitles(panel);
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-ask]');
      if (b) ask(b.dataset.ask);
      if (e.target.closest('.lw-pin-x')) ((chat.pin = null), drawPin());
      if (e.target.closest('.lw-new')) newChat();
      if (e.target.closest('.lw-city')) citySheet();
      const v = e.target.closest('[data-vote-id]');
      if (v) votesData().then(d => voteSheet(d.votes.findIndex(x => x[0] === v.dataset.voteId)), () => {});
    });
  }
  drawPin();
  drawChat();
}

// While its field is typed in, the composer sits on the keys: its foot at
// the visible part's foot (visualViewport), whether iOS shrank the page or
// slid it up (offsetTop) under the keys.
function dockComposer(form, input) {
  const vv = globalThis.visualViewport;
  if (!vv) return;
  let frame = 0;
  const place = () => {
    frame = 0;
    const on = document.activeElement === input;
    const gap = Math.round(innerHeight - vv.height - vv.offsetTop);
    form.classList.toggle('lw-on-keys', on && gap > 60);
    if (on) form.style.setProperty('--lw-keys', `${Math.max(8, gap + 8)}px`);
  };
  const soon = () => (frame ||= requestAnimationFrame(place));
  vv.addEventListener('resize', soon);
  vv.addEventListener('scroll', soon);
  input.addEventListener('focus', () => (soon(), setTimeout(soon, 300)));
  input.addEventListener('blur', () => setTimeout(soon, 60));
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
    const city = myCities()[0];
    // One grouped list of questions to start from (each with its topic's tile), then the 地方法規 setting
    // as its own row with what it means under it, then the note (Jay 2026-10-27: grey slabs and a loose row read "so ugly").
    const cityName = city ? (en ? cityEn(city) : city) : readCity() === '' ? W('不查', 'None') : W('未設定', 'Not set');
    out.innerHTML = `<div class="lw-ask-empty"><span class="lw-orb">${ICON_SPARK}</span><strong>${W('說你遇到的事，問什麼都行', 'Tell what happened, or ask anything')}</strong><p>${W('會引用條文、判決和立法院的資料回答', 'Answered from the laws, rulings and the Legislative Yuan, cited')}</p></div>` +
      `<p class="lw-list-cap lw-ask-cap">${W('試試這樣問', 'Try asking')}</p><div class="lw-list lw-ask-list">${STARTERS.map(([zh, e, topic]) => `<button type="button" class="lw-row" data-ask="${esc(W(zh, e))}">${topicTile(topic, 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(W(zh, e))}</span></span>${CHEVRON}</button>`).join('')}</div>` +
      `<div class="lw-list lw-ask-list lw-city-list"><button type="button" class="lw-row lw-city">${topicTile('home', 'sm')}<span class="lw-row-text"><span class="lw-row-name">${W('地方法規', 'Local rules')}</span></span><b class="lw-row-val${city ? '' : ' off'}">${esc(cityName)}</b>${CHEVRON}</button></div>` +
      `<p class="lw-ask-foot">${W('只查你住的縣市的自治條例與規則。AI 依法規與判決回答，不是法律意見。', 'Only your own city’s local rules are searched. AI answers from the laws and rulings; not legal advice.')}</p>`;
    return;
  }
  out.innerHTML = chat.turns.map(turnHtml).join('') + (chat.busy ? '' : `<button type="button" class="lw-new">${W('開始新對話', 'New chat')}</button>`);
}

// The verdict and the answer while they're still being written (the proxy streams them).
const draftHtml = d => (d?.verdict ? `<p class="lw-verdict q-fit-wrap">${esc(d.verdict)}</p>${d.answer ? `<p class="lw-why">${esc(d.answer)}</p>` : ''}` : '');

function turnHtml(t) {
  if (t.role === 'user') return `<div class="lw-msg me"><p>${esc(t.text)}</p></div>`;
  if (t.wait) return `<div class="lw-msg ai"><div class="lw-draft">${draftHtml(t.draft)}</div><div class="lw-typing"><i></i><i></i><i></i></div><small class="lw-srcs lw-stage">${esc(stageText(t.stage, en))}</small></div>`;
  if (t.error) return `<div class="lw-msg ai"><p class="lw-none">${esc(chatError(t.error, en))}</p></div>`;
  const r = t.r;
  const name = new Map(r.sources.map(s => [`${s.p}:${s.key}`, s.n]));
  const cases = new Map((r.cases || []).map(c => [c.jid, c]));
  const rules = new Map((r.rules || []).map(x => [x.id, x]));
  const chips = cites => cites.map(c => (cases.has(c) ? caseChip(cases.get(c)) : rules.has(c) ? ruleLink(rules.get(c), 'lw-ref lw-cite', `<b>${esc(rules.get(c).agency || W('規定', 'Rule'))}</b><span>${W('規定', 'rule')}</span>`) : citeChip(...c.split(':'), name.get(c)))).join('');
  const card = (href, title, sub, extra = '') => `<a class="lw-notice" href="${esc(href)}"${extra}><b>${esc(title)}</b><small>${esc(sub)}</small></a>`;
  const block = (cls, icon, title, inner) => `<div class="lw-block ${cls}"><h4><i>${icon}</i>${esc(title)}</h4>${inner}</div>`;
  // At a glance first: the verdict, the key facts as tiles, then the why and, for progress, the steps.
  const parts = [
    r.verdict ? `<p class="lw-verdict q-fit-wrap">${esc(r.verdict)}</p>` : '',
    r.facts?.length ? `<div class="lw-facts${r.facts.length === 1 ? ' one' : ''}">${r.facts.map(f => `<div><small>${esc(f.k)}</small><b>${esc(f.v)}</b></div>`).join('')}</div>` : '',
    r.answer ? `<p class="${r.verdict ? 'lw-why' : 'lw-lead'}">${esc(r.answer)}</p>` : '',
    r.timeline?.length ? `<ol class="lw-time">${r.timeline.map(x => `<li><small>${esc(/^\d{4}-?\d\d-?\d\d/.test(x.d) ? shortDay(x.d) : x.d)}</small><b>${esc(x.t)}</b></li>`).join('')}</ol>` : '',
    r.points.length ? `<ul class="lw-points">${r.points.map(pt => `<li>${esc(pt.text)} ${chips(pt.cites)}</li>`).join('')}</ul>` : '',
    r.consequences.length ? block('red', MENU_ICON.warn, W('後果', 'What follows'), `<ul class="lw-points">${r.consequences.map(pt => `<li>${esc(pt.text)} ${chips(pt.cites)}</li>`).join('')}</ul>`) : '',
    r.agency ? block('blue', MENU_ICON.gov, W('找哪個機關', 'Who to contact'), `<p>${esc(r.agency)}</p>`) : '',
    r.next.length ? block('green', MENU_ICON.steps, W('下一步', 'Next steps'), `<ol class="lw-steps">${r.next.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`) : '',
    r.notices?.length ? block('teal', MENU_ICON.gov, W('政府公告', 'Government notices'), `<div class="lw-cards">${r.notices.map(x => `<a class="lw-notice" href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.t)}</b><small>${esc([x.agency, x.d].filter(Boolean).join(' · '))}</small></a>`).join('')}</div>`) : '',
    // (Every one a tap away, a budget first: never behind 更多 N 件, which led to the list, not to it. Jay 2026-10-27.)
    r.bills?.length ? block('indigo', MENU_ICON.steps, W('立法院進度', 'In the Legislative Yuan'), `<div class="lw-cards">${[...r.bills].sort((a, b) => b.k.startsWith('budget:') - a.k.startsWith('budget:')).map(b => `<a class="lw-notice${b.k.startsWith('budget:') ? ' lw-budget-card' : ''}" href="${b.k.startsWith('budget:') ? `#tab=bills&amp;f=budget&amp;budget=${encodeURIComponent(b.k.slice(7))}` : `#item=${esc(b.k.replace(':', '-'))}`}"><b>${esc(b.n)}</b><small>${esc(b.k.startsWith('budget:') ? [W('預算', 'Budget'), b.d].filter(Boolean).join(' · ') : [stageShort({ stage: b.stage }, en), b.d && dayOf(b.d, en)].filter(Boolean).join(' · '))}</small></a>`).join('')}</div>`) : '',
    r.cases?.length ? block('purple', MENU_ICON.court, W('類似判決', 'Similar rulings'), `<div class="lw-cards">${r.cases.map(c => ((court, no) => card(caseHref(c.jid), no || court || c.jid, [no ? court : '', c.t, c.d && shortDay(c.d)].filter(Boolean).join(' · ')))(...(c.no || '').split(' '))).join('')}</div>`) : '',
    r.rules?.length ? block('orange', MENU_ICON.gov, W('行政規則', 'Agency rules'), `<div class="lw-cards">${r.rules.map(x => ruleLink(x, 'lw-notice', `<b>${esc(x.n)}</b><small>${esc([x.agency, x.d && shortDay(x.d)].filter(Boolean).join(' · '))}</small>`)).join('')}</div>`) : '',
    r.people?.length ? block('teal', DOOR_ICON.people, W('立委', 'Legislators'), `<div class="lw-cards">${r.people.map(x => card(`#who=${x.id}`, x.n, x.party)).join('')}</div>`) : '',
    r.votes?.length ? block('green', DOOR_ICON.votes, W('院會表決', 'Floor votes'), `<div class="lw-cards">${r.votes.map(v => `<button type="button" class="lw-notice" data-vote-id="${esc(v.id)}"><b>${esc(v.t)}</b><small>${esc(shortDay(v.d))}</small></button>`).join('')}</div>`) : '',
    r.meets?.length ? block('red', DOOR_ICON.agenda, W('議程', 'Agenda'), `<div class="lw-cards">${r.meets.map(x => card(`#meet=${encodeURIComponent(x.id)}&d=${x.d}`, x.t, shortDay(x.d))).join('')}</div>`) : '',
    r.sources.length ? `<p class="lw-srcs">${W(`依據 ${r.sources.length} 條條文`, `From ${r.sources.length} articles`)}${r.left != null ? ` · ${W(`今天還能問 ${r.left} 次`, `${r.left} left today`)}` : ''}</p>` : ''
  ].join('');
  // Follow-ups: one line each, full width (never ragged pills).
  const follow = r.followups.length ? `<div class="lw-follow">${r.followups.map(f => `<button type="button" data-ask="${esc(f)}"><span>${esc(f)}</span><i aria-hidden="true">›</i></button>`).join('')}</div>` : '';
  return `<div class="lw-msg ai${r.covered ? '' : ' thin'}">${parts}</div>${follow}`;
}

// A judgment, 釋字 or 憲判字: the app's one ruling link.
const caseHref = jid => `#r=${encodeURIComponent(jid)}`;
const caseChip = c => {
  const [, y, w, n] = c.jid.split(',');
  const label = c.jid.startsWith('s') ? W(`釋字${c.jid.slice(1)}`, `J.Y. ${c.jid.slice(1)}`) : c.jid.startsWith('j') ? W(`${c.jid.slice(1).replace('-', '憲判')}`, `${c.jid.slice(1)} TCC`) : `${y}${w}${n}`;
  return `<a class="lw-ref lw-cite" href="${esc(caseHref(c.jid))}"><b>${W('判決', 'Ruling')}</b><span>${esc(label)}</span></a>`;
};
// A rule: its text kept on this site, else the ministry's page (read in the app), else just its name.
const ruleLink = (x, cls, inner) => (x.text || x.url ? `<a class="${cls}" href="${esc(x.url || '#')}"${x.text ? ` data-text="${esc(`${x.dir}/${textFile(x.id)}`)}"` : ''}>${inner}</a>` : `<span class="${cls}">${inner}</span>`);

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
  const wait = chat.turns[chat.turns.length - 1];
  // Each step as it starts, in the waiting bubble (no redraw).
  const onStage = o => {
    if (o.stage === 'draft') {
      wait.draft = o;
      const d = [...document.querySelectorAll('#chat .lw-draft')].pop();
      if (d) d.innerHTML = draftHtml(o);
    } else wait.stage = o;
    const el = [...document.querySelectorAll('#chat .lw-stage')].pop();
    if (el) el.textContent = stageText(wait.draft ? { stage: 'draft' } : o, en);
  };
  const r = await chatLaw({ q: text, history, pin, mine: mineOf(state.mine), lang: en ? 'en' : 'zh', city: myCities() }, { fetcher: ai, onStage });
  chat.turns[chat.turns.length - 1] = r.error ? { role: 'model', error: r.error } : { role: 'model', r };
  if (!r.error) asked();
  chat.busy = false;
  keepChat();
  drawChat();
}

// ---- 裁判: 憲法法庭, 大法官解釋, 最高法院, 最高行政法院 -----------------------------------
// One of the app's three sides with 法規 and 立法. Every ruling has one id
// (cons.mjs: s748, j111-10; else its 司法院 JID) and one link, #r=<id>,
// opening it over whatever screen it was tapped on.

const once = (path, then = x => x) => {
  let p;
  return () => (p ||= data(path).then(then).catch(e => ((p = null), Promise.reject(e))));
};
const consData = once('cons/index.json', j => ({ items: j.items, byId: new Map(j.items.map(r => [r[0], r])), cited: citedBy(j.items) }));
const consLaws = once('cons/laws.json');
const rulingMonths = once('rulings/months.json');
const rulingFind = once('rulings/find.json');
const monthFile = m => data(`rulings/m/${m}.json`);
const lowIndex = once('rulings/low/index.json');

// The four doors: each court (and 釋字, the old 大法官's), its colour.
const COURT_DOORS = [
  ['cons', W('憲法法庭', 'Const.'), 'cons'],
  ['interp', W('大法官', 'Interpret.'), 'interp'],
  ['TPS', W('最高法院', 'Supreme'), 'tps'],
  ['TPA', W('最高行政', 'Admin.'), 'tpa'],
  ['low', W('各級法院', 'Lower'), 'low']
];
const kindOfId = id => (id[0] === 's' && isCons(id) ? 'interp' : isCons(id) ? 'cons' : courtOf(id) === 'TPA' ? 'tpa' : courtOf(id) ? 'tps' : 'low');
// A judgment's court in words: 最高法院, 臺北地院, 臺灣高等法院…
const courtLabel = id => (courtOf(id) ? COURTS[courtOf(id)]?.[en ? 1 : 0] : lowCode(id) ? lowCourtName(lowCode(id), state.lowNames) : '');
const courtIcon = kind => (kind === 'cons' || kind === 'interp' ? MENU_ICON.court : ICON_GAVEL);
const courtTile = (kind, size = 'sm') => `<span class="lw-ctile ${kind}${size ? ` ${size}` : ''}" aria-hidden="true">${courtIcon(kind)}</span>`;
const courtName = kind => ({ cons: W('憲法法庭', 'Constitutional Court'), interp: W('大法官解釋', 'Interpretation'), tps: W('最高法院', 'Supreme Court'), tpa: W('最高行政法院', 'Supreme Administrative Court'), low: W('高等法院・地方法院', 'High and district courts') })[kind];
const rulingHref = id => (isCons(id) ? `#r=${id}` : rulingUrl(id));
// A cons row's name: its 案名, else (older 釋字 have none) its question.
const consName = r => r[2] || r[3].replace(/[？?]$/, '');
// The articles a ruling rules on, one chip per law (at most `max`, the rest counted).
// A card's header: 114憲判1, 釋字748.
const consShort = id => (id[0] === 's' ? W(`釋字${id.slice(1)}`, `No. ${id.slice(1)}`) : W(id.slice(1).replace('-', '憲判'), `J. ${id.slice(1)}`));
function citeChips(cites, max = 2, arts = 4, more = true) {
  const byLaw = new Map();
  for (const c of cites) {
    const [p, k] = c.split(':');
    if (state.byCode.has(p)) byLaw.set(p, k ? [...(byLaw.get(p) || []), k] : byLaw.get(p) || []);
  }
  const groups = [...byLaw];
  return groups.slice(0, max).map(([p, ks]) => (ks.length ? citeChip(p, ks.slice(0, arts), state.byCode.get(p)[1]) : `<a class="lw-cite" href="#law=${esc(p)}"><b>${esc(en ? nameOf(p) : shortName(state.byCode.get(p)[1]))}</b></a>`)).join('') + (more && groups.length > max ? `<span class="lw-cite more">+${groups.length - max}</span>` : '');
}
// The same as rows, one a law (a tap: its first article).
function citeRows(cites) {
  const byLaw = new Map();
  for (const c of cites) {
    const [p, k] = c.split(':');
    if (state.byCode.has(p)) byLaw.set(p, k ? [...(byLaw.get(p) || []), k] : byLaw.get(p) || []);
  }
  return list([...byLaw].map(([p, ks]) => lawItem(state.byCode.get(p), ks.length ? (en ? `Art. ${ks.slice(0, 4).join(', ')}${ks.length > 4 ? ` +${ks.length - 4}` : ''}` : `第 ${ks.slice(0, 4).join('、')} 條${ks.length > 4 ? ` 等 ${ks.length} 條` : ''}`) : W('整部法律', 'The law as a whole'), '<span></span>', `#law=${p}${ks.length ? `&a=${ks[0]}` : ''}`)));
}
// Topic: its first cited law past the Constitution's own.
const rulingTopic = cites => {
  const p = cites.map(c => c.split(':')[0]).find(x => state.byCode.has(x) && !/^A00000/.test(x));
  return p ? rowTopic(state.byCode.get(p)) : 'justice';
};

// A ruling as a card (a rail) or a row (a list), cons or court alike.
function rulingCard(r) {
  const [id, d, , , cites] = r;
  const cons = isCons(id);
  const kind = kindOfId(id);
  const label = cons ? consShort(id) : (en ? COURT_SHORT[courtOf(id)] : '') || courtLabel(id);
  const name = cons ? consName(r) : r[2] || caseNo(id);
  return `<div class="lw-bill lw-ruling ${kind}"><span class="lw-bill-top">${courtTile(kind)}<span class="lw-bill-stage court">${esc(label)}</span><span class="lw-bill-day">${esc(shortDay(d))}</span></span><a class="lw-bill-name${fit(name)}" href="${esc(rulingHref(id))}">${esc(name)}</a><span class="lw-cites">${citeChips(cites || [], 1, 3, false)}</span></div>`;
}
function rulingRow(r, { sub = '' } = {}) {
  const [id, d] = r;
  const cons = isCons(id);
  const kind = kindOfId(id);
  const name = cons ? consName(r) : r[2] || caseNo(id);
  const [zh, eng, tone] = cons ? ['', '', ''] : caseKind(id);
  const line = sub || [cons ? consLabel(id, en) : kind === 'low' ? `${courtLabel(id)} ${id.split(',').slice(1, 4).join('')}` : caseNo(id), kind === 'low' ? shortDay(d) : ymd(d)].filter(Boolean).join(' · ');
  return `<a class="lw-row lw-rrow" href="${esc(rulingHref(id))}">${courtTile(kind)}<span class="lw-row-text"><span class="lw-row-name${fit(name, 13)}">${esc(name)}</span><small>${esc(zh ? `${en ? eng : zh} · ${line}` : line)}</small></span></a>`;
}
const COURT_SHORT = { TPS: 'Supreme Court', TPA: 'Admin. Court', JCC: 'Const. Court' };

let rulingDoor_ = '';
let rulingQuery = '';
let rulingMonth = '';
let rulingKind = '';
let rulingTopic_ = '';
let rulingMore = 0;
// 各級法院: a level (high, district), a 案由 or a court picked.
let rulingLevel = '';
let rulingTitle = '';
let rulingCourt = '';
const rulingBox = search({ placeholder: W('找判決：釋字號、案號或關鍵字', 'Search rulings: number or words'), onInput: v => ((rulingQuery = v.trim()), (rulingMore = 0), drawRulingList()) });

function drawRulings() {
  const panel = $('panel-rulings');
  const p = new URLSearchParams(location.hash.slice(1));
  const f = p.get('f') || '';
  rulingDoor_ = COURT_DOORS.some(([id]) => id === f) ? f : '';
  rulingTopic_ = TOPICS[p.get('topic')] ? p.get('topic') : '';
  if (p.has('m')) rulingMonth = p.get('m');
  rulingTitle = p.get('t') || '';
  rulingCourt = p.get('c') || '';
  if (p.has('q')) ((rulingQuery = p.get('q')), (rulingBox.querySelector('input').value = rulingQuery));
  rulingMore = 0;
  if (!panel.firstChild) {
    const doors = h('div', { class: 'lw-bill-doors five', role: 'tablist' }, COURT_DOORS.map(([id, label, tone]) => h('button', { type: 'button', class: `lw-bdoor ${tone}`, role: 'tab', 'data-door': id, html: `<span class="lw-door-ic">${courtIcon(tone)}</span><small>${esc(label)}</small>`, onclick: () => go(rulingDoor_ === id ? 'tab=rulings' : `tab=rulings&f=${id}`, { replace: true }) })));
    panel.append(headNode(W('裁判', 'Rulings')), doors, rulingBox, h('div', { id: 'ruling-list' }));
    wireTitles(panel);
    panel.addEventListener('click', e => {
      const more = e.target.closest('[data-rmore]');
      if (more) return void ((rulingMore += 60), drawRulingList());
      const m = e.target.closest('[data-month]');
      if (m) return void ((rulingMonth = m.dataset.month), (rulingMore = 0), drawRulingList());
      const lv = e.target.closest('[data-level]');
      if (lv) return void ((rulingLevel = rulingLevel === lv.dataset.level ? '' : lv.dataset.level), (rulingMore = 0), drawRulingList());
      const t = e.target.closest('[data-title]');
      if (t) return void ((rulingTitle = t.dataset.title), (rulingCourt = ''), (rulingMore = 0), t.dataset.title && rulingQuery && ((rulingQuery = ''), (rulingBox.querySelector('input').value = '')), drawRulingList());
      const c = e.target.closest('[data-court]');
      if (c) return void ((rulingCourt = c.dataset.court), (rulingTitle = ''), (rulingMore = 0), drawRulingList());
      const k = e.target.closest('[data-kind]');
      if (k) return void ((rulingKind = rulingKind === k.dataset.kind ? '' : k.dataset.kind), (rulingMore = 0), drawRulingList());
    });
  }
  drawRulingList();
}

let rulingRun = 0;
async function drawRulingList() {
  const out = $('ruling-list');
  if (!out) return;
  const run = ++rulingRun;
  document.querySelectorAll('#panel-rulings [data-door]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.door === rulingDoor_)));
  if (!out.firstChild) out.innerHTML = `<div class="lw-rail">${'<span class="lw-bill q-skel"></span>'.repeat(3)}</div>`;
  let cons;
  try {
    cons = await consData();
  } catch {
    cons = { items: [], byId: new Map(), cited: {} };
  }
  if (run !== rulingRun) return;
  const door = rulingDoor_;
  if (door === 'low') {
    const html = await lowHtml();
    return void (run === rulingRun && (out.innerHTML = html));
  }
  if (rulingQuery) return void (out.innerHTML = await rulingSearchHtml(rulingQuery, cons, { door: rulingDoor_ }));
  const more = n => (n > 0 ? `<button type="button" class="q-btn block lw-more" data-rmore>${W(`再看 ${Math.min(n, 60)} 則`, `${Math.min(n, 60)} more`)}</button>` : '');
  if (door === 'cons' || door === 'interp') {
    const rows = cons.items.filter(r => (door === 'cons') === r[0].startsWith('j'));
    if (door === 'cons') {
      // By year (111年 on), newest first.
      const years = [...new Set(rows.map(r => r[0].slice(1).split('-')[0]))];
      out.innerHTML = years.map(y => section(W(`${y}年 · ${rows.filter(r => r[0].startsWith(`j${y}-`)).length} 件`, `${Number(y) + 1911} · ${rows.filter(r => r[0].startsWith(`j${y}-`)).length}`), list(rows.filter(r => r[0].startsWith(`j${y}-`)).map(r => rulingRow(r))))).join('') || emptyRulings();
    } else {
      const shown = rows.slice(0, 60 + rulingMore);
      out.innerHTML = section(W(`大法官解釋 · ${rows.length} 號`, `${rows.length} interpretations`), list(shown.map(r => rulingRow(r)))) + more(rows.length - shown.length);
    }
    return;
  }
  if (door === 'TPS' || door === 'TPA') {
    let months;
    try {
      months = (await rulingMonths()).months.filter(m => m[door === 'TPS' ? 1 : 2]);
    } catch {
      months = [];
    }
    if (!months.length) return void (out.innerHTML = emptyRulings());
    if (!months.some(m => m[0] === rulingMonth)) rulingMonth = months[0][0];
    let rows = [];
    try {
      rows = (await monthFile(rulingMonth)).filter(r => courtOf(r[0]) === door);
    } catch {}
    if (run !== rulingRun) return;
    const kinds = door === 'TPS' ? [...new Set(rows.map(r => caseKind(r[0])[0]).filter(Boolean))] : [];
    const shownRows = rows.filter(r => !rulingKind || caseKind(r[0])[0] === rulingKind);
    const shown = shownRows.slice(0, 60 + rulingMore);
    const monthChips = `<div class="q-chips lw-chips lw-months">${months.map(([m, a, b]) => `<button type="button" class="q-chip" data-month="${m}" aria-pressed="${m === rulingMonth}">${esc(W(`${Number(m.slice(0, 4)) - 1911}年${Number(m.slice(4))}月`, `${m.slice(0, 4)}-${m.slice(4)}`))}<small>${door === 'TPS' ? a : b}</small></button>`).join('')}</div>`;
    const kindChips = kinds.length > 1 ? `<div class="q-chips lw-chips">${kinds.map(k => `<button type="button" class="q-chip" data-kind="${esc(k)}" aria-pressed="${k === rulingKind}">${esc(en ? { 刑事: 'Criminal', 民事: 'Civil' }[k] || k : k)}</button>`).join('')}</div>` : '';
    out.innerHTML = monthChips + kindChips + section(W(`${courtName(door.toLowerCase())} · ${shownRows.length} 則`, `${courtName(door.toLowerCase())} · ${shownRows.length}`), list(shown.map(r => rulingRow(r)))) + more(shownRows.length - shown.length);
    out.querySelector('.lw-months [aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    return;
  }
  // A topic: 憲法法庭's on it, then the top courts' of the last two months.
  const topicChips = `<div class="q-chips lw-chips">${Object.keys(TOPICS).map(id => `<a class="q-chip lw-tchip" style="--t:${TOPICS[id].color}" href="#tab=rulings${id === rulingTopic_ ? '' : `&amp;topic=${id}`}" aria-pressed="${id === rulingTopic_}"><i></i>${esc(topicName(id, en))}</a>`).join('')}</div>`;
  if (rulingTopic_) {
    const consOn = cons.items.filter(r => rulingTopic(r[4]) === rulingTopic_);
    let court = [];
    try {
      const ms = (await rulingMonths()).months.slice(0, 2).map(m => m[0]);
      court = (await Promise.all(ms.map(m => monthFile(m).catch(() => [])))).flat().filter(r => rulingTopic(r[3]) === rulingTopic_);
    } catch {}
    if (run !== rulingRun) return;
    const shown = court.slice(0, 40 + rulingMore);
    out.innerHTML = topicChips + section(W(`憲法法庭 · ${consOn.length}`, `Constitutional Court · ${consOn.length}`), list(consOn.slice(0, 12).map(r => rulingRow(r)))) + section(W(`最高法院・最高行政法院 · 近兩個月 ${court.length} 則`, `Top courts · last two months ${court.length}`), list(shown.map(r => rulingRow(r)))) + more(court.length - shown.length);
    out.querySelector('.lw-chips [aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    return;
  }
  // 總覽: 憲法法庭's newest, the rulings 立法院 is answering, the courts' newest, the landmarks.
  const judgments = cons.items.filter(r => r[0].startsWith('j')).slice(0, 8);
  const answered = cons.items.filter(r => r[6]?.length).slice(0, 4);
  const landmarks = Object.entries(cons.cited).filter(([id]) => cons.byId.has(id)).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([id]) => cons.byId.get(id));
  const court = state.latestRulings;
  const by = c => court.filter(r => courtOf(r[0]) === c).slice(0, 4);
  const low = (await lowIndex().catch(() => null))?.latest || [];
  if (run !== rulingRun) return;
  if (!judgments.length && !court.length) return void (out.innerHTML = emptyRulings());
  // (Wide: 憲法法庭 and what came of it on the left, the courts on the right.)
  out.innerHTML = cols([
    [section(W('憲法法庭最新判決', 'Constitutional Court, latest'), rail(judgments.map(rulingCard)), { more: W('全部', 'All'), moreHref: '#tab=rulings&f=cons' }), 0],
    [section(W('判決之後，立法院在修', 'Rulings the Legislative Yuan is acting on'), answered.length ? `<div class="lw-list">${answered.map(r => answeredRow(r)).join('')}</div>` : ''), 0],
    [section(W('最高法院', 'Supreme Court'), list(by('TPS').map(r => rulingRow(r))), { more: W('更多', 'More'), moreHref: '#tab=rulings&f=TPS' }), 1],
    [section(W('最高行政法院', 'Admin. Court'), list(by('TPA').map(r => rulingRow(r))), { more: W('更多', 'More'), moreHref: '#tab=rulings&f=TPA' }), 1],
    [low.length ? section(W('高等法院・地方法院', 'High and district courts'), list(low.slice(0, 4).map(r => rulingRow(r))), { more: W('更多', 'More'), moreHref: '#tab=rulings&f=low' }) : '', 1],
    [section(W('最常被引用的解釋', 'Most cited'), list(landmarks.slice(0, 6).map(r => rulingRow(r, { sub: W(`${consLabel(r[0])} · 後來 ${cons.cited[r[0]].length} 件引用`, `${consLabel(r[0], en)} · cited ${cons.cited[r[0]].length} times`) }))), { more: W('全部', 'All'), moreHref: '#tab=rulings&f=interp' }), 0],
    [section(W('依主題', 'By topic'), topicChips.replace('q-chips lw-chips', 'q-chips lw-chips q-balance')), 1]
  ]);
}
// 各級法院: how many, by level and kind; 案由 to pick (or found by the search box),
// each court; a 案由 or a court opened: its newest judgments.
async function lowHtml() {
  let ix;
  try {
    ix = await lowIndex();
  } catch {
    return emptyRulings();
  }
  if (!ix.n) return emptyNote(W('高等法院、地方法院的判決正在讀入', 'High and district court rulings are on their way'), W('司法院的資料每天 0 點到 6 點開放，每晚讀入好幾個月，讀到的會出現在這裡。', 'The Judicial Yuan opens its data from midnight to 6 a.m.; each night adds months of rulings here.'));
  const wantKind = r => !rulingKind || caseKind(r[0])[0] === rulingKind;
  const wantLevel = r => !rulingLevel || lowLevel(lowCode(r[0])) === rulingLevel;
  const levelChips = `<div class="q-chips lw-chips">${[['high', W('高等法院', 'High courts')], ['district', W('地方法院', 'District courts')]].map(([id, label]) => `<button type="button" class="q-chip" data-level="${id}" aria-pressed="${id === rulingLevel}">${esc(label)}</button>`).join('')}${['刑事', '民事', '行政'].map(k => `<button type="button" class="q-chip" data-kind="${k}" aria-pressed="${k === rulingKind}">${esc(en ? { 刑事: 'Criminal', 民事: 'Civil', 行政: 'Admin.' }[k] : k)}</button>`).join('')}</div>`;
  const span = ix.span?.length ? W(` · ${ymd(ix.span[0])} 起`, ` · since ${ymd(ix.span[0])}`) : '';
  const head = `<p class="lw-low-head">${W(`<b>${ix.n.toLocaleString()}</b> 則判決 · ${ix.courts.length} 個法院${span}`, `<b>${ix.n.toLocaleString()}</b> judgments · ${ix.courts.length} courts${span}`)}</p>`;
  const more = n => (n > 0 ? `<button type="button" class="q-btn block lw-more" data-rmore>${W(`再看 ${Math.min(n, 60)} 則`, `${Math.min(n, 60)} more`)}</button>` : '');
  const rowsHtml = (rows, label, total = 0) => {
    const shown = rows.filter(r => wantKind(r) && wantLevel(r));
    return section(W(`${label} · ${(rulingKind || rulingLevel ? shown.length : Math.max(total, shown.length)).toLocaleString()} 則`, `${label} · ${(rulingKind || rulingLevel ? shown.length : Math.max(total, shown.length)).toLocaleString()}`), shown.length ? list(shown.slice(0, 60 + rulingMore).map(r => rulingRow(r))) : `<p class="lw-none">${W('這個篩選下沒有判決', 'None with these filters')}</p>`) + more(shown.length - 60 - rulingMore);
  };
  const back = `<div class="q-chips lw-chips"><button type="button" class="q-chip" data-title="">${W('← 全部案由與法院', '← All matters and courts')}</button></div>`;
  if (rulingTitle) {
    const t = ix.titles.find(x => x[0] === rulingTitle);
    let rows = [];
    try {
      rows = t ? (await data(`rulings/low/t/${t[2]}.json`)).map(([jid, d, cites]) => [jid, d, rulingTitle, cites]) : [];
    } catch {}
    return back + levelChips + rowsHtml(rows, W(`「${rulingTitle}」`, `“${rulingTitle}”`), t?.[1]);
  }
  if (rulingCourt) {
    const c = ix.courts.find(x => x[0] === rulingCourt);
    let rows = [];
    try {
      rows = await data(`rulings/low/c/${rulingCourt}.json`);
    } catch {}
    return back + levelChips + rowsHtml(rows, c?.[1] || rulingCourt, c?.[2]);
  }
  const titleRow = ([t, n]) => `<button type="button" class="lw-row" data-title="${esc(t)}">${courtTile('low')}<span class="lw-row-text"><span class="lw-row-name${fit(t, 13)}">${esc(t)}</span><small>${W(`${n.toLocaleString()} 則判決`, `${n.toLocaleString()} judgments`)}</small></span></button>`;
  if (rulingQuery) {
    const words = rulingQuery.split(/\s+/).filter(Boolean);
    const hits = ix.titles.filter(([t]) => words.every(w => t.includes(w))).slice(0, 40);
    return head + (hits.length ? section(W(`符合的案由 · ${hits.length}`, `Matching matters · ${hits.length}`), list(hits.map(titleRow))) : emptyNote(W('沒有這個案由', 'No matter like that'), W('試試「詐欺」、「損害賠償」、「離婚」這類案由的字', 'Try a matter, like fraud, damages or divorce'))) + `<a class="lw-out" href="https://judgment.judicial.gov.tw/FJUD/default.aspx" target="_blank" rel="noopener" data-out>${W('到司法院裁判書查詢找全文', 'Full-text search on the Judicial Yuan')}</a>`;
  }
  const courts = ix.courts.filter(c => !rulingLevel || c[3] === rulingLevel);
  const titleChips = `<div class="q-chips lw-chips lw-titles">${ix.titles.slice(0, 18).map(([t, n]) => `<button type="button" class="q-chip" data-title="${esc(t)}">${esc(t.length > 12 ? `${t.slice(0, 11)}…` : t)}<small>${n.toLocaleString()}</small></button>`).join('')}</div>`;
  const latest = ix.latest.filter(r => wantKind(r) && wantLevel(r)).slice(0, 8);
  return (
    head +
    levelChips +
    section(W('常見案由', 'Common matters'), titleChips) +
    (latest.length ? section(W('最新判決', 'Latest'), list(latest.map(r => rulingRow(r)))) : '') +
    section(W(`法院 · ${courts.length}`, `Courts · ${courts.length}`), list(courts.map(([c, name, n]) => `<button type="button" class="lw-row" data-court="${esc(c)}">${courtTile('low')}<span class="lw-row-text"><span class="lw-row-name">${esc(name)}</span><small>${W(`${n.toLocaleString()} 則判決`, `${n.toLocaleString()} judgments`)}</small></span></button>`)))
  );
}
const emptyRulings = () => emptyNote(W('裁判資料讀不到', 'Rulings couldn’t be loaded'), W('請連上網路再試一次。', 'Connect and try again.'));
// A ruling and the bill that answers it: the ruling's name, the bill's stage.
function answeredRow(r) {
  const it = state.items.find(x => x.k === r[6][0]);
  return `<a class="lw-row lw-rrow" href="#r=${esc(r[0])}">${courtTile(kindOfId(r[0]))}<span class="lw-row-text"><span class="lw-row-name${fit(consName(r), 13)}">${esc(consName(r))}</span><small>${esc(consLabel(r[0], en))}${it ? ` → ${esc(shortName(it.n))} · ${esc(stageShort(it, en))}` : ''}</small></span></a>`;
}

// Finding a ruling: its number (釋字 748, 111憲判8, 115台上4682), else its words.
const consJump = q => {
  const t = String(q).replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/\s+/g, '');
  let m = /^(?:司法院)?(?:大法官)?(?:釋字)?第?(\d{1,3})號?(?:解釋)?$/.exec(t);
  if (m && /釋|^\d{1,3}$/.test(t) && Number(m[1]) >= 1 && Number(m[1]) <= 813) return `s${Number(m[1])}`;
  m = /^(\d{3})年?憲判字?第?(\d{1,2})號?$/.exec(t);
  return m ? `j${Number(m[1])}-${Number(m[2])}` : '';
};
async function rulingSearchHtml(q, cons, { door = '', max = 30, quiet = false } = {}) {
  const jump = consJump(q);
  const jumpRow = jump && cons.byId.get(jump);
  const want = r => !door || kindOfId(r[0]) === { cons: 'cons', interp: 'interp', TPS: 'tps', TPA: 'tpa' }[door];
  const words = q.split(/\s+/).filter(Boolean);
  const hit = text => words.every(w => text.includes(w));
  const consHits = [...q].length >= 2 ? cons.items.filter(r => r !== jumpRow && want(r) && hit(`${consLabel(r[0])}${r[2]}${r[3]}`)).slice(0, max) : [];
  let court = [];
  if (!door || door === 'TPS' || door === 'TPA') {
    try {
      const all = await rulingFind();
      const c = caseQuery(q);
      court = (c ? all.filter(([jid]) => caseMatch(jid, c)) : [...q].length >= 2 ? all.filter(([, t]) => hit(t)) : []).filter(([jid]) => !door || courtOf(jid) === door).slice(0, max);
    } catch {}
  }
  const rowsOf = list_ => list(list_.map(([jid, t]) => rulingRow([jid, (/,(\d{8}),/.exec(jid)?.[1] || '').replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3'), t])));
  let lowTitles = [];
  if (!door && [...q].length >= 2 && !caseQuery(q))
    try {
      lowTitles = (await lowIndex()).titles.filter(([t]) => hit(t)).slice(0, 6);
    } catch {}
  const html = (jumpRow ? section(W('直接打開', 'Go to'), list([rulingRow(jumpRow)])) : '') + (consHits.length ? section(W('憲法法庭', 'Constitutional Court'), list(consHits.map(r => rulingRow(r)))) : '') + (court.length ? section(W('最高法院・最高行政法院', 'Top courts'), rowsOf(court)) : '') + (lowTitles.length ? section(W('高等法院・地方法院，依案由', 'High and district courts, by matter'), list(lowTitles.map(([t, n]) => `<a class="lw-row" href="#tab=rulings&amp;f=low&amp;t=${esc(encodeURIComponent(t))}">${courtTile('low')}<span class="lw-row-text"><span class="lw-row-name${fit(t, 13)}">${esc(t)}</span><small>${W(`${n.toLocaleString()} 則判決`, `${n.toLocaleString()} judgments`)}</small></span></a>`))) : '');
  if (quiet) return html;
  return html || emptyNote(W('找不到符合的裁判', 'No rulings found'), W('試試釋字號（748）、案號（115台上4682）或案由的字', 'Try an interpretation number (748), a case number or words in its matter'));
}

// A bill's rulings: those that named it (it answers them), 憲法法庭's on the
// articles it changes, and how many top-court rulings cite those articles.
async function billRulings(it) {
  const keys = Object.keys(it.arts || {});
  const [cons, laws, court] = await Promise.all([consData().catch(() => null), consLaws().catch(() => ({})), it.p && state.rulingLaws[it.p] ? data(`rulings/${it.p}.json`).catch(() => ({})) : {}]);
  const named = cons ? cons.items.filter(r => r[6]?.includes(it.k)) : [];
  const on = laws[it.p] || {};
  const onArts = [...new Set([...keys.flatMap(k => on[k] || []), ...(on[''] || [])])].map(id => cons?.byId.get(id)).filter(r => r && !named.includes(r)).sort((a, b) => consOrder(b[0]) - consOrder(a[0]));
  const courtRows = [...new Map(keys.flatMap(k => court[k] || []).map(r => [r[0], r])).values()].sort((a, b) => (a[1] < b[1] ? 1 : -1));
  if (!named.length && !onArts.length && !courtRows.length) return '';
  const rows = [...named.map(r => rulingRow(r, { sub: W(`${consLabel(r[0])} · 這個法案為它而修`, `${consLabel(r[0], en)} · this bill answers it`) })), ...onArts.slice(0, 4).map(r => rulingRow(r))];
  billRulings.court = courtRows;
  return `<h4>${W('相關判決', 'Rulings on it')}</h4>${rows.length ? list(rows) : ''}${courtRows.length ? `<button type="button" class="lw-strip slate lw-bill-court"><b>${W(`最高法院等 ${courtRows.length} 則判決`, `${courtRows.length} top-court rulings`)}</b><span>${W('引用了這個法案要改的條文', 'cite the articles it changes')}</span><em>${W('看判決', 'See')}</em></button>` : ''}`;
}
document.addEventListener('click', e => e.target.closest('.lw-bill-court') && billRulings.court?.length && rulingsSheet(W('引用要改條文的判決', 'Rulings citing these articles'), billRulings.court.slice(0, 60)));

// ---- A ruling, opened ---------------------------------------------------------------------

function openRuling(id) {
  if (isCons(id)) return openCons(id);
  const jcc = consOfJid(id);
  if (jcc) return openCons(jcc);
  return openJudgment(rulingUrl(id));
}

// 憲法法庭's ruling: what was asked, what it held, the articles and bills it
// touches, the rulings it builds on and that build on it, then its reasons.
async function openCons(id) {
  const body = h('div', { class: 'lw-page lw-jd lw-cons-page', html: `<p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel short"></p>` });
  sheet({ title: consLabel(id, en), closeLabel: W('關閉', 'Close'), body, detent: 'large' });
  let it, cons;
  try {
    [it, cons] = await Promise.all([data(`cons/${id}.json`), consData().catch(() => ({ byId: new Map(), cited: {} }))]);
  } catch {
    body.innerHTML = `<p class="lw-none">${W('現在讀不到這個裁判，請稍後再試', 'Couldn’t load this ruling; try again later')}</p><a class="lw-out" href="${esc(id[0] === 's' ? interpPage(id.slice(1)) : JUDGMENTS_PAGE)}" target="_blank" rel="noopener" data-out>${W('到憲法法庭看', 'Open on the Constitutional Court')}</a>`;
    return;
  }
  noteRead({ kind: 'cons', id, title: `${consLabel(id, en)}${it.n ? ` ${it.n}` : it.issue ? ` ${it.issue.replace(/[？?]$/, '')}` : ''}`, href: `#r=${id}`, sub: '' });
  const kind = kindOfId(id);
  const refRows = ids => list(ids.map(x => cons.byId.get(x)).filter(Boolean).map(r => rulingRow(r)));
  const cited = (cons.cited[id] || []).sort((a, b) => consOrder(b) - consOrder(a));
  // The bills it led to: named in their purpose; then bills open on the articles it ruled on.
  const named = (it.bills || []).map(k => state.items.find(x => x.k === k)).filter(Boolean);
  const onArts = state.items.filter(x => !named.includes(x) && !x.dropped && x.open && x.stage < PROMULGATED && it.cites.some(c => { const [p, k] = c.split(':'); return x.p === p && (!k || x.arts?.[k]); })).slice(0, 4);
  const billRows = items => `<div class="lw-list">${items.map(x => `<a class="lw-row" href="#item=${esc(x.k.replace(':', '-'))}">${topicTile(itemTopic(x), 'sm')}<span class="lw-row-text"><span class="lw-row-name${fit(x.n)}">${esc(x.n)}</span><small>${esc([stageShort(x, en), x.about].filter(Boolean).join(' · '))}</small></span></a>`).join('')}</div>`;
  const paras = ps => proseHtml(ps.join('\n'), state.names);
  const verdict = consVerdict(it.main.join(''));
  body.innerHTML =
    `<header class="lw-page-head"><h3 class="lw-big-name q-fit-wrap${nameSize(it.n || '')}">${esc(it.n || consLabel(id, en))}</h3><small>${esc([courtName(kind), it.label, it.d && ymd(it.d)].filter(Boolean).join(' · '))}</small></header>` +
    rulingAiBtn(id, it.label || consLabel(id, en)) +
    (it.issue ? `<div class="lw-block cons"><h4><i>${MENU_ICON.ask}</i>${id[0] === 's' ? W('爭點', 'The question') : W('案由', 'The case')}</h4><p>${plainHtml(it.issue)}</p></div>` : '') +
    `<div class="lw-jd-hero ${verdict.tone}"><span>${id[0] === 's' ? W('解釋文', 'Holding') : W('主文', 'Holding')}</span>${verdict.label ? `<strong>${esc(verdict.label)}</strong>` : ''}<div class="lw-cons-main">${paras(it.main)}</div></div>` +
    (it.by ? `<p class="lw-jd-who">${esc(W(`聲請人 ${it.by}`, `Petitioner ${it.by}`))}</p>` : '') +
    (it.cites.length ? `<h4>${W('涉及的條文', 'Articles it rules on')}</h4>${citeRows(it.cites)}` : '') +
    (named.length ? `<h4>${W('因這個判決提的修法', 'Bills it led to')}</h4>${billRows(named)}` : '') +
    (onArts.length ? `<h4>${W('立法院正在修這些條文', 'Bills on these articles')}</h4>${billRows(onArts)}` : '') +
    (it.reason.length ? `<details class="lw-fold lw-cons-reason"><summary>${W(`理由（${it.reason.length} 段）`, `Reasons (${it.reason.length} paragraphs)`)}</summary><div class="lw-fold-body">${paras(it.reason)}</div></details>` : '') +
    (it.refs.length ? `<h4>${W(`引用的解釋與判決（${it.refs.length}）`, `Builds on (${it.refs.length})`)}</h4>${refRows(it.refs.slice(0, 12))}` : '') +
    (cited.length ? `<h4>${W(`後來引用它的（${cited.length}）`, `Cited by (${cited.length})`)}</h4>${refRows(cited.slice(0, 12))}` : '') +
    (it.docs.length ? `<details class="lw-fold"><summary>${W(`意見書與原文（${it.docs.length}）`, `Opinions and files (${it.docs.length})`)}</summary><div class="lw-list in-sheet">${it.docs.map(([t, u]) => `<a class="lw-row" href="${esc(u)}" target="_blank" rel="noopener" data-out><span class="lw-file">PDF</span><span class="lw-row-text"><span class="lw-row-name lw-doc-name q-fit-wrap">${esc(t.replace(/^憲法法庭\d+年憲判字第\d+號判決/, '').replace(/^\d+/, '').replace(/_OCR$/, '') || t)}</span></span></a>`).join('')}</div></details>` : '') +
    `<a class="lw-out" href="${esc(it.url || (id[0] === 's' ? interpPage(id.slice(1)) : JUDGMENTS_PAGE))}" target="_blank" rel="noopener" data-out>${W('到憲法法庭看原文', 'Open on the Constitutional Court')}</a>`;
}
// The holding in a word: 違憲 / 合憲 / part of each, from its own words.
function consVerdict(text) {
  const t = String(text || '');
  const OK = /(尚無牴觸|並無牴觸|尚無違背|並未牴觸|不牴觸|不違背|尚屬合憲|合憲)/g;
  const ok = OK.test(t);
  const bad = /(違憲|牴觸|有違|不符|失其效力)/.test(t.replace(OK, ''));
  if (bad && ok) return { label: W('部分違憲', 'Partly unconstitutional'), tone: 'orange' };
  if (bad) return { label: W('違憲', 'Unconstitutional'), tone: 'red' };
  if (ok) return { label: W('合憲', 'Constitutional'), tone: 'green' };
  return { label: '', tone: 'cons' };
}

// ---- 立法: every law with bills this term, by stage --------------------------------------

// 立法 opens on five doors; 法案 has its stages and the funnel, the others are a page each.
const BILL_FILTERS = [
  ['moving', W('審議中', 'Moving')],
  ['talks', W('快表決了', 'Near a vote')],
  ['passed', W('已通過', 'Passed')],
  ['all', W('全部', 'All')]
];
const BILL_DOORS = [
  ['bills', W('法案', 'Bills'), 'indigo', W('搜尋法案，例如「長照」', 'Search bills')],
  ['agenda', W('議程', 'Agenda'), 'red', W('搜尋議程，例如「食安」', 'Search the agenda')],
  ['notice', W('預告', 'Drafts'), 'orange', W('搜尋預告的修法', 'Search drafts')],
  ['votes', W('表決', 'Votes'), 'green', W('搜尋表決，例如「預算」', 'Search votes')],
  ['people', W('立委', 'People'), 'teal', W('搜尋立委或選區', 'Search by name or area')],
  ['budget', W('預算', 'Budget'), 'court', W('搜尋預算', 'Search budgets')]
];
const DOOR_ICON = {
  bills: ICON_DOC,
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/></svg>',
  notice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  votes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6.5"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/></svg>',
  budget: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>'
};
const doorOf = f => (BILL_FILTERS.some(([id]) => id === f) ? 'bills' : f);
let billFilter = 'moving';
let billQuery = '';
let billStep = -1;
let billMore = {};
const billBox = search({ placeholder: W('搜尋法案，例如「長照」', 'Search bills'), onInput: v => ((billQuery = v.trim()), (billMore = {}), drawBillList()) });

function drawBills() {
  const panel = $('panel-bills');
  const f = new URLSearchParams(location.hash.slice(1)).get('f');
  if (f && (BILL_FILTERS.some(([id]) => id === f) || BILL_DOORS.some(([id]) => id === f))) ((billFilter = f === 'bills' ? 'moving' : f), (billStep = -1));
  if (!panel.firstChild) {
    const doors = h('div', { class: 'lw-bill-doors', role: 'tablist' }, BILL_DOORS.map(([id, label, tone]) => h('button', { type: 'button', class: `lw-bdoor ${tone}`, role: 'tab', 'data-door': id, html: `<span class="lw-door-ic">${DOOR_ICON[id]}</span><small>${esc(label)}</small>`, onclick: e => keepPlace(e.currentTarget, () => setBillFilter(id === 'bills' ? 'moving' : id)) })));
    const chips = h('div', { class: 'q-chips lw-chips', id: 'bill-stages', role: 'tablist' }, BILL_FILTERS.map(([id, label]) => h('button', { type: 'button', class: 'q-chip', role: 'tab', 'data-f': id, text: label, onclick: e => keepPlace(e.currentTarget, () => setBillFilter(id)) })));
    // The stage chips sit above 這週 so a tap never moves them.
    panel.append(headNode(W('立法', 'Bills')), doors, billBox, h('div', { id: 'bill-funnel' }), chips, h('div', { id: 'bill-digest' }), h('div', { id: 'bill-list' }));
    // 議程's days: a swipe across the list for the day either side.
    daySwipe($('bill-list'), dir => {
      const d = billFilter === 'agenda' && billStep < 0 && dayStep(agendaDays, agendaDay, dir);
      return Boolean(d && (pickAgendaDay(d), true));
    });
    wireTitles(panel);
    panel.addEventListener('click', e => {
      const col = e.target.closest('.lw-funnel-col');
      if (col) {
        return keepPlace($('bill-funnel'), () => {
          billStep = billStep === Number(col.dataset.step) ? -1 : Number(col.dataset.step);
          if (billStep < 0) billFilter = 'moving';
          billMore = {};
          drawBillList();
        });
      }
      const how = e.target.closest('[data-how]');
      if (how) return howBillsWork(Number(how.dataset.how));
      const more = e.target.closest('[data-more]');
      if (more) ((billMore[more.dataset.more] = (billMore[more.dataset.more] || 0) + 40), drawBillList());
    });
  }
  drawBillList();
}
// A filter tap redraws what's below it without moving it: the tapped control
// stays where the finger left it (the list below keeps at least a screen's
// height, so a short list never pulls the page up under it).
function keepPlace(el, draw) {
  const top = el.getBoundingClientRect().top;
  const list = $('bill-list');
  if (list) list.style.minHeight = `${Math.round(innerHeight * 0.9)}px`;
  draw();
  const fix = () => {
    const by = el.getBoundingClientRect().top - top;
    if (Math.abs(by) > 1) scrollBy({ top: by, behavior: 'instant' });
  };
  fix();
  requestAnimationFrame(fix);
}
function setBillFilter(id) {
  // Another door, another list: what was typed for the last one would hide this one's.
  if (doorOf(id) !== doorOf(billFilter) && billQuery) {
    billQuery = '';
    const input = billBox.querySelector('input');
    if (input) input.value = '';
  }
  billFilter = id;
  billStep = -1;
  billMore = {};
  drawBillList();
}

function drawBillList() {
  const out = $('bill-list');
  if (!out) return;
  document.querySelectorAll('.lw-chips [data-f]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.f === billFilter && billStep < 0)));
  const door = doorOf(billFilter);
  document.querySelectorAll('.lw-bill-doors [data-door]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.door === door)));
  const input = billBox.querySelector('input');
  if (input) input.placeholder = BILL_DOORS.find(([id]) => id === door)[3];
  const stages = $('bill-stages');
  if (stages) stages.hidden = door !== 'bills';
  const fn = $('bill-funnel');
  if (fn) fn.hidden = door !== 'bills';
  if (fn && door === 'bills') {
    const c = state.billCounts;
    fn.innerHTML = !state.items.length ? '' : c?.reached ? billFunnel(c, en, state.items.filter(it => it.stage >= PASSED).length) : funnel(state.items, en);
    fn.querySelectorAll('.lw-funnel-col').forEach(c => c.classList.toggle('on', Number(c.dataset.step) === billStep));
  }
  // 這週: what a follower needs first, before the whole list.
  const dg = $('bill-digest');
  if (dg) dg.innerHTML = billFilter === 'moving' && billStep < 0 && !billQuery && state.items.length ? weekDigest() : '';
  if (!state.items.length) return void (out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(4)}</div>`);
  if (billFilter === 'notice' && billStep < 0) return void (out.innerHTML = noticeList());
  if (billFilter === 'people' && billStep < 0) return void peopleList(out);
  if (billFilter === 'budget' && billStep < 0) return void budgetList(out);
  if (billFilter === 'agenda' && billStep < 0) return void agendaList(out);
  if (billFilter === 'votes' && billStep < 0) return void votesList(out);
  let items = state.items;
  if (billQuery) {
    const words = expand(billQuery);
    items = items.filter(it => words.some(w => it.n.includes(w)));
  }
  // (By bill: 提案 = items with a version not yet read; 一讀 = waiting on committee; 審查完畢 = waiting on the floor.)
  if (billStep >= 0 && state.billCounts?.reached) items = items.filter(it => !it.dropped && (billStep === 0 ? it.w > 0 : billStep === 3 ? it.stage >= PASSED : it.open && (billStep === 1 ? [1, 2].includes(stepOf(it.stage)) : stepOf(it.stage) === 3)));
  else if (billStep >= 0) items = items.filter(it => !it.dropped && stepOf(it.stage) === billStep && (it.open || it.stage >= PASSED));
  else if (billFilter === 'moving') items = items.filter(LIVE);
  else if (billFilter === 'talks') items = items.filter(it => LIVE(it) && it.stage >= 3);
  else if (billFilter === 'passed') items = items.filter(it => it.stage >= PASSED);
  if (!items.length) return void (out.innerHTML = emptyNote(W('沒有符合的法案', 'No bills match')));
  // Grouped by the step reached, furthest first; held and withdrawn last.
  const groups = new Map();
  for (const it of [...items].sort((a, b) => (a.u < b.u ? 1 : -1))) {
    const g = billStep === 0 && state.billCounts?.reached ? 'filed' : it.dropped ? 'dropped' : it.held ? 'held' : String(stepOf(it.stage));
    groups.set(g, [...(groups.get(g) || []), it]);
  }
  const order = ['filed', '5', '4', '3', '2', '1', '0', 'held', 'dropped'];
  const title = g => (g === 'filed' ? W('有新提案等一讀', 'Awaiting 1st reading') : g === 'held' ? W('暫緩', 'On hold') : g === 'dropped' ? W('已撤回', 'Withdrawn') : g === '5' ? W('已公布', 'Now law') : g === '4' ? W('已通過（三讀）', 'Passed') : g === '2' ? W('委員會審查中', 'In committee') : g === '3' ? W('在院會：協商、等表決', 'On the floor') : g === '1' ? W('一讀過了，等委員會審', 'Waiting for committee') : STEPS[g][en ? 1 : 0]);
  out.innerHTML = order
    .filter(g => groups.has(g))
    .map(g => {
      const all = groups.get(g);
      const n = 8 + (billMore[g] || 0);
      const more = all.length > n ? `<button type="button" class="lw-more" data-more="${g}">${W(`再顯示 ${Math.min(40, all.length - n)} 項（共 ${all.length}）`, `Show ${Math.min(40, all.length - n)} more (${all.length})`)}</button>` : '';
      return `<section class="q-section lw-sec"><div class="q-section-head"><h2>${esc(title(g))}</h2><span class="lw-count">${all.length}</span></div>${grid(all.slice(0, n).map(it => billCard(it, { topic: itemTopic(it), en, wide: true })))}${more}</section>`;
    })
    .join('');
}

// 這週: passed into law, your followed bills that moved, and the busiest bills, last 7 days.
function weekDigest() {
  const since = new Date(Date.now() + 8 * 3600e3 - 7 * 86400e3).toISOString().slice(0, 10);
  const passed = state.items.filter(it => !it.dropped && it.passed >= since).sort((a, b) => (a.passed < b.passed ? 1 : -1));
  const mine = state.items.filter(it => state.mine.items[it.k] && it.u > state.mine.items[it.k]);
  const moved = state.items.filter(it => LIVE(it) && it.u >= since && !passed.includes(it) && !mine.includes(it)).sort((a, b) => b.stage - a.stage || b.count - a.count);
  const card = it => billCard(it, { topic: itemTopic(it), en });
  const html =
    section(W('你追蹤的有新進度', 'Your bills moved'), rail(mine.slice(0, 10).map(card))) +
    section(W(`這週三讀通過 ${passed.length}`, `Passed this week ${passed.length}`), rail(passed.slice(0, 10).map(card))) +
    section(W('這週往前走的法案', 'Moving this week'), rail(moved.slice(0, 10).map(card)));
  return html ? `<div class="lw-digest">${html}</div>` : '';
}

// 預告: ministries' drafts open for comment on join.gov.tw (open ones first),
// the step before 行政院 sends a bill to 立法院.
function noticeList() {
  const day = today();
  let rows = state.notices;
  if (billQuery) {
    const words = expand(billQuery);
    rows = rows.filter(n => words.some(w => n.t.includes(w) || n.gov.includes(w) || n.cat?.includes(w) || n.s?.includes(w) || n.laws.some(p => nameOf(p).includes(w))));
  }
  const open = rows.filter(n => isOpen(n, day)).sort((a, b) => (a.to < b.to ? -1 : 1)), closed = rows.filter(n => !isOpen(n, day));
  const html = section(W(`開放意見中 ${open.length}`, `Open for comment ${open.length}`), grid(open.map(n => noticeCard(n, day)))) + section(W('已截止', 'Closed'), grid(closed.slice(0, 60).map(n => noticeCard(n, day))));
  return html || emptyNote(billQuery ? W('沒有符合的預告', 'No drafts match') : W('目前沒有預告中的修法', 'No drafts open for comment'));
}
const NOTICE_KIND = { amend: [W('修正草案', 'Amendment'), 'indigo'], new: [W('新訂草案', 'New rule'), 'green'], repeal: [W('廢止草案', 'Repeal'), 'red'] };
// A draft's title without 預告 and its full stop: 「產業創新條例」第四十三條 修正.
const noticeName = n => n.t.replace(/^預告(修正|訂定|制定|廢止)?/, '').replace(/[。.]+$/, '').replace(/草案$/, '').replace(/(?<=」.*)(修正|訂定|廢止)$/, '');
// A draft's law and the rest: ['產業創新條例', '第四十三條'].
const noticeParts = n => {
  const t = noticeName(n);
  const names = [...t.matchAll(/「([^」]+)」/g)].map(m => m[1]);
  if (names.length > 1) return [names.join('、'), W('部分條文', 'Amendments')];
  const m = t.match(/「([^」]+)」(.*)/);
  return m ? [m[1], m[2].replace(/^[，、\s]+/, '').replace(/^部分條文$/, W('部分條文', 'Amendments')).replace(/^修正$/, '')] : [t, ''];
};
// Days left to comment: 0 on its last day.
const daysLeft = (n, day) => Math.round((Date.parse(n.to) - Date.parse(day)) / 864e5);
function noticeCard(n, day) {
  const openNow = isOpen(n, day);
  const topic = topicOf(n.t, '');
  const left = daysLeft(n, day);
  const when = openNow ? (left === 0 ? W('今天截止', 'Closes today') : W(`還有 ${left} 天`, `${left} days left`)) : W(`${shortDay(n.to)} 截止`, `closed ${shortDay(n.to)}`);
  const [kind, tone] = NOTICE_KIND[n.kind] || NOTICE_KIND.amend;
  return `<a class="lw-bill wide notice${openNow ? '' : ' closed'}" href="#tab=bills&amp;f=notice&amp;notice=${esc(n.id)}" style="--t:${TOPICS[topic].color}"><span class="lw-bill-top">${topicTile(topic, 'sm')}<span class="lw-tag ${tone}">${esc(kind)}</span><span class="lw-bill-day${openNow && left <= 7 ? ' soon' : ''}">${esc(when)}</span></span><span class="lw-bill-name${fit(noticeParts(n)[0])}">${esc(noticeParts(n)[0])}</span>${noticeParts(n)[1] ? `<span class="lw-notice-arts">${esc(noticeParts(n)[1])}</span>` : ''}${n.s ? `<span class="lw-notice-why">${esc(n.s)}</span>` : ''}<span class="lw-bill-foot"><span class="lw-party" style="--p:#64748b">${esc(n.gov)}</span>${n.cat ? `<span class="lw-tag">${esc(n.cat)}</span>` : ''}</span></a>`;
}
// A draft, opened: how long is left to comment, who wrote it and on what
// authority, why (its 總說明), what it changes article by article (the new
// text marked against today's, with the reason), and where to comment.
async function openNotice(id) {
  const n = state.notices.find(x => x.id === id);
  if (!n) return;
  const day = today();
  const openNow = isOpen(n, day);
  const left = daysLeft(n, day);
  const topic = topicOf(n.t, '');
  const [kind, tone] = NOTICE_KIND[n.kind] || NOTICE_KIND.amend;
  const body = h('div', { class: 'lw-bud-page lw-notice-page' });
  const close = () => location.hash.includes('notice=') && history.replaceState(null, '', '#tab=bills&f=notice');
  sheet({ title: W('預告', 'Draft'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [body], onClose: close });
  const draw = (d = null) => {
    const tiles = [
      ...(openNow ? [[left === 0 ? W('今天', 'Today') : W(`${left} 天`, String(left)), left === 0 ? W('截止', 'Last day') : W('剩下', 'Days left'), left <= 7 ? 'red' : 'orange']] : []),
      [shortDay(n.to), openNow ? W('截止', 'Closes') : W('已截止', 'Closed'), 'indigo'],
      ...(d?.count ? [[String(d.count.c), W('則留言', 'Comments'), 'teal']] : [])
    ];
    const who = [n.gov || d?.gov, d?.dept].filter(Boolean).join(' · ');
    const laws = n.laws.filter(p => state.byCode.has(p)).map(p => `<a class="lw-notice" href="#law=${esc(p)}"><b>${esc(nameOf(p))}</b><small>${W('看現行條文', 'Read the law in force')}</small></a>`).join('');
    const why = d?.about || d?.note || '';
    const rows = d?.rows || [];
    const rowHtml = r => {
      const what = !r.old ? [W('新增', 'New'), 'green'] : /^[（(]?刪除[）)]?$/.test(r.now) || !r.now ? [W('刪除', 'Deleted'), 'red'] : [W('修正', 'Changed'), 'indigo'];
      return `<div class="lw-nrow"><div class="lw-nrow-head"><b>${esc(r.a)}</b><span class="lw-tag ${what[1]}">${esc(what[0])}</span></div><div class="lw-nrow-text lw-dtext">${r.old && r.now ? diffBlocks(r.old, r.now) : diffBlocks(null, r.now || r.old)}</div>${r.why ? `<details class="lw-nrow-why"><summary>${W('為什麼', 'Why')}</summary>${proseHtml(r.why, state.names)}</details>` : ''}</div>`;
    };
    const shown = 8;
    body.innerHTML =
      `<div class="lw-item-head" style="--t:${TOPICS[topic].color}">${topicTile(topic, 'lg')}<span class="lw-meta"><span class="lw-tag ${tone}">${esc(kind)}</span>${(d?.cat || n.cat) ? countTag(d?.cat || n.cat) : ''}</span></div>` +
      `<h2 class="lw-item-name lw-big-name${fit(noticeParts(n)[0])}">${esc(noticeParts(n)[0])}</h2>${noticeParts(n)[1] ? `<p class="lw-notice-arts big">${esc(noticeParts(n)[1])}</p>` : ''}` +
      `<div class="lw-stats${tiles.length === 3 ? ' three' : tiles.length === 2 ? ' two' : ''}">${tiles.map(([b, l, t]) => `<span class="lw-stat ${t}"><b>${esc(b)}</b><span>${esc(l)}</span></span>`).join('')}</div>` +
      `<div class="lw-notice-who">${who ? `<p><b>${W('提出', 'From')}</b><span>${esc(who)}</span></p>` : ''}${d?.basis ? `<p><b>${W('依據', 'Under')}</b><span>${esc(d.basis)}</span></p>` : ''}<p><b>${W('公告', 'Posted')}</b><span>${esc(ymd(n.from))}</span></p></div>` +
      (why ? `<section class="lw-person-sec"><h4>${W('為什麼要改', 'Why')}</h4>${n.s && d?.about ? `<p class="lw-notice-lead">${esc(n.s.replace(/…$/, ''))}${/…$/.test(n.s) ? '…' : '。'}</p>` : ''}<button type="button" class="lw-why-row lw-notice-about">${proseHtml(why, state.names)}</button></section>` : '') +
      (rows.length ? `<section class="lw-person-sec"><h4>${W(`改了什麼（${rows.length} 條）`, `What changes (${rows.length})`)}</h4><p class="lw-hint-sm">${W('綠色是新增的字、紅色刪掉的字，對照現行條文。', 'Green is added, red is removed, against the text in force.')}</p><div class="lw-nrows">${rows.slice(0, shown).map(rowHtml).join('')}</div>${rows.length > shown ? `<button type="button" class="lw-more" data-nmore>${W(`再顯示 ${rows.length - shown} 條`, `${rows.length - shown} more`)}</button>` : ''}</section>` : d ? `<p class="lw-hint-sm">${W('草案條文只有掃描檔，請看原始 PDF。', 'The draft’s text is only a scan: see the PDF.')}</p>` : '<span class="q-skel lw-bud-skel"></span>') +
      (laws ? `<section class="lw-person-sec"><h4>${W('相關法規', 'The law')}</h4><div class="lw-cites">${laws}</div></section>` : '') +
      `<div class="lw-notice-acts">${openNow ? `<a class="q-btn lw-notice-go" href="${esc(noticeUrl(n.id))}" target="_blank" rel="noopener">${W('到眾開講留言', 'Comment on join.gov.tw')}</a>` : `<a class="lw-out" href="${esc(noticeUrl(n.id))}" target="_blank" rel="noopener">${W('眾開講原文', 'On join.gov.tw')}</a>`}${d?.pdf ? `<a class="lw-out" href="${esc(d.pdf)}" target="_blank" rel="noopener">${W('草案 PDF', 'Draft PDF')}</a>` : ''}${openNow && d?.email ? `<a class="lw-out" href="mailto:${esc(d.email)}?subject=${encodeURIComponent(`對「${noticeName(n)}」的意見`)}">${W('寫信給承辦人', 'Email the agency')}</a>` : ''}</div>`;
    body.querySelector('[data-nmore]')?.addEventListener('click', e => (e.currentTarget.previousElementSibling.insertAdjacentHTML('beforeend', rows.slice(shown).map(rowHtml).join('')), e.currentTarget.remove()));
    body.querySelector('.lw-notice-about')?.addEventListener('click', e => e.currentTarget.classList.toggle('open'));
    body.querySelectorAll('.lw-cites a').forEach(a => a.addEventListener('click', () => body.closest('dialog')?.close()));
  };
  draw();
  if (n.d) draw(await data(`bills/notice/${encodeURIComponent(id)}.json`).catch(() => ({ rows: [] })));
  else draw({ rows: [] });
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
  noteRead({ kind: 'bill', id: k, title: W(`${it.n}修正草案`, `${it.n} amendment`), href: `#item=${k.replace(':', '-')}`, sub: '' });
  const topic = itemTopic(it);
  const steps = timeline(it, bills, en, state.noticesByLaw.get(it.p));
  const follow = h('button', { type: 'button', class: `lw-tool${state.mine.items[k] ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'items', k) && toast(W('已追蹤：有進度會標出來', 'Following: progress will show')), save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.items[k])), haptic()) });
  const tone = it.dropped ? '' : it.held ? 'orange' : it.stage >= PASSED ? 'green' : 'indigo';
  const top = h('div', { class: 'lw-item-head', style: `--t:${TOPICS[topic].color}`, html: `${topicTile(topic, 'lg')}<span class="lw-meta">${countTag(stageShort(it, en), tone)}${countTag(topicName(topic, en), 'topic')}</span>` });
  const now = whereNow(it, bills, en);
  const nowLine = [now.last && `<p><b>${W('最新', 'Latest')}</b><span>${esc(now.last)}</span></p>`, now.next && `<p><b>${W('下一步', 'Next')}</b><span>${esc(now.next)}</span></p>`, now.open > 1 && `<p><b>${W('這一輪', 'This round')}</b><span>${esc(W(`${now.open} 個版本還在審，數字是各停在哪一步`, `${now.open} versions open; the numbers say where each stands`))}</span></p>`, now.before && `<p><b>${W('上一輪', 'Last round')}</b><span>${esc(W(`${now.before} 已三讀過一次`, `passed ${now.before}`))}</span></p>`].filter(Boolean).join('');
  const prog = h('div', { class: 'lw-item-prog', html: progress(it, en, { labels: true, counts: now.open > 1 ? roundSteps(openRound(bills)) : null }) + `<div class="lw-now">${nowLine}</div>` });
  prog.querySelector('.lw-prog').insertAdjacentHTML('afterend', `<button type="button" class="lw-how" data-how="${it.dropped || it.held ? -1 : stepOf(it.stage)}">${W('每一步是什麼意思？', 'What do the steps mean?')}</button>`);
  prog.addEventListener('click', e => e.target.closest('[data-how]') && howBillsWork(Number(e.target.closest('[data-how]').dataset.how)));
  // On the agenda: the next meeting that takes it up (from 立法院's 議程).
  if (!it.dropped && it.stage < PASSED)
    agendaData().then(a => {
      const next = nextSitting(a.meets, { ids: bills.map(b => b.id), law: it.law, name: it.n });
      if (next) prog.querySelector('.lw-now').insertAdjacentHTML('afterbegin', `<p><b>${W('排議程', 'On agenda')}</b><span><a href="#meet=${esc(encodeURIComponent(next.m.id))}&amp;d=${esc(next.d)}">${esc(`${meetDay(next.d)} ${hm(next.from)} ${roomShort(next.m)}${kindLabel(next.m.kind) !== roomShort(next.m) ? ` ${kindLabel(next.m.kind)}` : ''}`)}</a></span></p>`);
    }).catch(() => {});
  const artsHtml = articleChips(it, en);
  const arts = artsHtml ? h('div', { class: 'lw-item-who', html: `<h4>${W(`要改哪幾條（${Object.keys(it.arts).length}）`, `Articles it changes (${Object.keys(it.arts).length})`)}</h4><div class="lw-parties">${artsHtml}</div>` }) : null;
  const who = it.by?.length ? h('div', { class: 'lw-item-who', html: `<h4>${W('誰提的', 'Proposed by')}</h4><div class="lw-parties">${partyChips(it.by, en, 6)}</div>` }) : null;
  const why = h('div', { class: 'lw-item-why', html: `<h4>${W('為什麼要修', 'Why, as filed')}</h4><span class="q-skel" style="height:56px"></span>` });
  const changes = h('div', { class: 'lw-item-diff', html: `<h4>${W('修什麼', 'What it changes')}</h4><div class="lw-diffs"><span class="q-skel" style="height:72px"></span></div>` });
  const line = h('details', { class: 'lw-fold' }, [h('summary', { text: W('審議過程', 'Steps so far') }), h('ol', { class: 'lw-timeline', html: steps.map(s => `<li class="${s.done ? 'done' : ''}${s.stage === it.stage ? ' now' : ''}"><b>${s.url ? `<a href="${esc(s.url)}"${s.url.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${esc(s.by ? `${s.by}${s.name}` : s.name)}</a>` : esc(s.name)}</b><span>${esc(s.date ? ymd(s.date) : '')}</span></li>`).join('') })]);
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
  const votes = h('div', { class: 'lw-item-votes' });
  votesOn(it.p, it.n).then(list => list.length && votes.replaceChildren(h('h4', { text: W(`院會表決（${list.length}）`, `Floor votes (${list.length})`) }), voteList(list)));
  const rul = h('div', { class: 'lw-item-who' });
  billRulings(it).then(html => html && (rul.innerHTML = html));
  const s = sheet({ title: W('法案', 'Bill'), lead: follow, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [h('h2', { class: `lw-item-name lw-big-name${nameSize(it.n)}`, text: it.n }), top, prog, who, arts, rul, why, changes, votes, line, vlist, openLawBtn].filter(Boolean), onClose: () => location.hash.startsWith('#item=') && history.replaceState(null, '', '#tab=bills') });
  // What it changes: the newest version with a table (a just-filed one may not have it yet).
  const order = [...new Set([bills.find(b => b.id === it.top), ...versions].filter(Boolean))];
  whyList(order, why);
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
const billRecs = new Map();
function billRec(id) {
  if (!billRecs.has(id))
    billRecs.set(
      id,
      fetch(`https://v2.ly.govapi.tw/bill/${encodeURIComponent(id)}`)
        .then(r => r.json())
        .then(j => j?.data || {})
        .catch(e => (billRecs.delete(id), Promise.reject(e)))
    );
  return billRecs.get(id);
}
const tableOf = id => billRec(id).then(d => (d['對照表'] || []).flatMap(t => t.rows || []));
// Why each sponsor wants it, from their own 案由 (newest versions, one a sponsor).
async function whyList(versions, out) {
  const seen = new Set();
  const pick = versions.filter(b => b.by && !seen.has(b.by) && seen.add(b.by)).slice(0, 4);
  const rows = (await Promise.all(pick.map(b => billRec(b.id).then(d => [b, whyOf(d['案由'])]).catch(() => [b, ''])))).filter(([, w]) => w);
  if (!rows.length) return void out.remove();
  out.innerHTML = `<h4>${W('為什麼要修', 'Why, as filed')}</h4>${rows.map(([b, w]) => `<button type="button" class="lw-why-row"><b>${esc(b.by.replace(/^本院/, ''))}</b><span>${esc(w)}</span></button>`).join('')}`;
  out.addEventListener('click', e => e.target.closest('.lw-why-row')?.classList.toggle('open'));
}
async function compareBill(b, out, { first = 60 } = {}) {
  if (!out || out.dataset.done) return;
  out.dataset.done = '1';
  try {
    const rows = await tableOf(b.id);
    const look = row => {
      const now = row['修正'] || row['增訂'] || '';
      const old = row['現行'] || '';
      const art = (now || old).match(/^\s*(第[一二三四五六七八九十百零〇\d]+條(之[一二三四五六七八九十\d]+)?)/)?.[1] || '';
      const kind = row['增訂'] || !old ? ['增訂', 'New', 'green'] : /^\s*(第\S+?條(之\S+?)?)?\s*[（(]?刪除[)）]?\s*$/.test(now) ? ['刪除', 'Removed', 'red'] : ['修正', 'Amended', 'indigo'];
      return { now, old, art, kind };
    };
    const card = (row, i) => {
      const { now, old, art, kind } = look(row);
      const text = kind[0] === '修正' ? diffBlocks(old, now) : kind[0] === '增訂' ? diffBlocks(null, now) : diffBlocks(old, null);
      return `<article class="lw-diff" data-i="${i}"><header><b>${esc(art || W('條文', 'Article'))}</b>${countTag(W(kind[0], kind[1]), kind[2])}</header><div class="lw-dtext">${text}</div>${row['說明'] ? `<details class="lw-why"><summary>${W('立法說明', 'Why')}</summary>${proseHtml(row['說明'], state.names)}</details>` : ''}</article>`;
    };
    const rest = rows.length > first ? `<button type="button" class="lw-more">${W(`看全部 ${Math.min(60, rows.length)} 條`, `All ${Math.min(60, rows.length)} articles`)}</button>` : '';
    // At a glance: how many articles it touches and how, each one a tap away.
    const looks = rows.slice(0, 60).map(look);
    const tally = [['修正', 'amended', 'indigo'], ['增訂', 'added', 'green'], ['刪除', 'removed', 'red']].map(([k, e, t]) => [looks.filter(l => l.kind[0] === k).length, k, e, t]).filter(([n]) => n);
    const allNew = tally.length === 1 && tally[0][1] === '增訂';
    const sum = rows.length > 1 && allNew ? `<div class="lw-diff-sum"><p><b class="green">${W(`新法，共 ${rows.length} 條`, `A new law, ${rows.length} articles`)}</b></p></div>` : rows.length > 1 ? `<div class="lw-diff-sum"><p>${W(`改 ${rows.length} 條：`, `${rows.length} articles: `)}${tally.map(([n, k, e, t]) => `<b class="${t}">${en ? `${n} ${e}` : `${k} ${n}`}</b>`).join(' · ')}</p><div class="lw-diff-arts">${looks.map((l, i) => (l.art ? `<button type="button" class="lw-diff-art ${l.kind[2]}" data-go="${i}">${esc(l.art.replace(/^第|條/g, ''))}</button>` : '')).join('')}</div></div>` : '';
    out.innerHTML = rows.length ? sum + rows.slice(0, first).map(card).join('') + rest : `<p class="lw-none">${W('這個版本沒有對照表', 'No comparison table for this version')}</p>`;
    const more = () => {
      const btn = out.querySelector('.lw-more');
      if (btn) btn.outerHTML = rows.slice(first, 60).map((r, i) => card(r, i + first)).join('');
    };
    out.querySelector('.lw-more')?.addEventListener('click', more);
    out.querySelector('.lw-diff-arts')?.addEventListener('click', e => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      if (Number(b.dataset.go) >= first) more();
      const el = out.querySelector(`.lw-diff[data-i="${b.dataset.go}"]`);
      if (el) (el.scrollIntoView({ behavior: 'smooth', block: 'start' }), flash(el));
    });
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
  const news = changedLaws.map(c => lawItem(state.byCode.get(c.p), changeText(c, true), countTag(W('新', 'New'), 'green')));
  // (Wide: bills on the left, laws and legislators on the right.)
  const html = cols([
    [section(W('自上次查看後的變動', 'New since you last looked'), (moved.length ? grid(moved.map(it => billCard(it, { topic: itemTopic(it), en, wide: true }))) : '') + list(news)), 0],
    [section(W('追蹤的法案', 'Bills'), grid(items.filter(it => !moved.includes(it)).map(it => billCard(it, { topic: itemTopic(it), en, wide: true })))), 0],
    [section(W('追蹤的法規', 'Laws'), list(laws.map(r => lawItem(r)))), 1],
    [section(W('書籤', 'Bookmarks'), list(marks.map(x => lawItem(x.row, artLabel(x.k, en), '', `#law=${x.p}&a=${x.k}`)))), 1],
    [section(W('最近看過', 'Recently opened'), list(m.recent.map(p => state.byCode.get(p)).filter(Boolean).slice(0, 6).map(r => lawItem(r)))), 1],
    [Object.keys(m.people || {}).length ? `<div id="mine-people"></div>` : '', 1]
  ]);
  // Only recent laws so far: say what ☆ adds, under them.
  const nothingFollowed = !items.length && !laws.length && !marks.length && !news.length && !Object.keys(m.people || {}).length;
  const hint = `<div class="lw-mine-hint"><span class="lw-orb star sm">${ICON.star}</span><div><strong>${W('追蹤法規和法案', 'Follow laws and bills')}</strong><p>${W('按 ☆，修法和審議進度會出現在這裡', 'Tap ☆: amendments and progress show here')}</p></div></div>`;
  $('panel-mine').innerHTML =
    pageHead(W('我的', 'Mine')) +
    ((html && (nothingFollowed ? html + hint : html)) ||
      `<div class="lw-empty"><span class="lw-orb star">${ICON.star}</span><strong>${W('追蹤法規和法案', 'Follow laws and bills')}</strong><p>${W('在法規或法案上按 ☆，修法和審議進度會出現在這裡，有變動時分頁上會有數字。', 'Tap ☆ on a law or a bill: amendments and progress show here, with a count on the tab when something moves.')}</p><div class="lw-empty-acts"><a class="q-btn primary" href="#tab=bills">${W('看立法動態', 'See bills')}</a><a class="q-btn" href="#tab=laws">${W('瀏覽法規', 'Browse laws')}</a></div></div>`);
  wireTitles($('panel-mine'));
  // 追蹤的立委: each one's newest bills, 質詢 and whole-bill votes, what came since last time marked.
  if (Object.keys(m.people || {}).length) drawTracked(m);
}

// The followed legislators' doings (their files and the votes), and how many
// came since each was last opened (for the 我的 badge too).
async function trackedFeeds(m) {
  const ppl = await peopleData();
  const xs = ppl.people.filter(x => m.people?.[x.id]);
  const [files, votes] = await Promise.all([Promise.all(xs.map(x => data(`ly/person/${encodeURIComponent(x.id)}.json`).catch(() => null))), votesData().catch(() => null)]);
  const feeds = xs.map((x, i) => (files[i] ? personFeed({ ...files[i], from: x.from, to: x.to }, votes) : []));
  state.peopleNew = Object.fromEntries(xs.map((x, i) => [x.id, feedNew(feeds[i], m.people[x.id])]));
  badge();
  return { xs, feeds, votes };
}

async function drawTracked(m) {
  let t;
  try {
    t = await trackedFeeds(m);
  } catch {
    return;
  }
  const { xs, feeds, votes } = t;
  const el = $('mine-people');
  if (!xs.length || !el) return;
  const cards = xs.map((x, i) => {
    const feed = feeds[i];
    const seen = m.people[x.id];
    const fresh = state.peopleNew[x.id];
    const row = e => {
      const isNew = e.d > seen;
      const when = `<small class="lw-track-d${isNew ? ' new' : ''}">${esc(shortDay(e.d))}</small>`;
      if (e.k === 'bill') return `<a class="lw-track-row" href="https://ppg.ly.gov.tw/ppg/bills/${esc(e.id)}/details"><span class="lw-track-k indigo">${W('提案', 'Bill')}</span><span class="lw-row-name">${esc(e.t)}</span>${when}</a>`;
      if (e.k === 'clip') return `<a class="lw-track-row" href="${esc(ivodUrl(e.id))}"><span class="lw-track-k orange">${W('質詢', 'Spoke')}</span><span class="lw-row-name">${esc(e.t || W('院會', 'Plenary'))}${e.sec ? ` · ${Math.max(1, Math.round(e.sec / 60))} ${W('分鐘', 'min')}` : ''}</span>${when}</a>`;
      const v = votes.votes[e.j];
      return `<button type="button" class="lw-track-row" data-vote="${e.j}"><span class="lw-track-k ${{ y: 'green', n: 'red', a: 'gray' }[e.m]}">${{ y: W('贊成', 'Yes'), n: W('反對', 'No'), a: W('棄權', 'Abstain') }[e.m]}</span><span class="lw-row-name">${esc(v[7]?.length && state.byCode.has(v[7][0]) ? (en ? nameOf(v[7][0]) : shortName(nameOf(v[7][0]))) : String(votes.agendas?.[v[3]] || '').split('─')[0].replace(/(增訂|修正|刪除|部分條文|第[一二三四五六七八九十百]).*$/, '') || v[2])}</span>${when}</button>`;
    };
    return `<div class="lw-track" style="--p:${partyColor(x.party)}"><a class="lw-track-head" href="#who=${esc(x.id)}">${personPhoto(x)}<span class="lw-person-text"><b>${esc(x.n)}</b><small>${esc(`${partyShort(x.party)} · ${shortArea(x.area)}`)}</small></span>${fresh ? countTag(W(`新 ${fresh}`, `${fresh} new`), 'green') : ''}</a>${feed.length ? `<div class="lw-track-rows">${['bill', 'vote', 'clip'].map(k => feed.find(e => e.k === k)).filter(Boolean).sort((a, b) => (a.d < b.d ? 1 : -1)).map(row).join('')}</div>` : `<p class="lw-track-none">${W('這屆還沒有提案、質詢或表決紀錄', 'No bills, speeches or votes yet this term')}</p>`}</div>`;
  });
  el.outerHTML = `<section class="q-section lw-sec" id="mine-people"><div class="q-section-head"><h2>${W('追蹤的立委', 'Legislators')}</h2></div><div class="lw-tracks">${cards.join('')}</div></section>`;
  $('mine-people').addEventListener('click', e => {
    const b = e.target.closest('[data-vote]');
    if (b) voteSheet(Number(b.dataset.vote));
  });
}

// ---- 立委 and 表決: who voted how, each legislator's record and speeches ----------------

let lyVotes, lyPeople, lyBudget;
const votesData = () => (lyVotes ||= data('ly/votes.json').catch(e => ((lyVotes = null), Promise.reject(e))));
const peopleData = () => (lyPeople ||= data('ly/people.json').catch(e => ((lyPeople = null), Promise.reject(e))));
const partyColor = who => partyOf(who).color;
const partyShort = who => partyOf(who)[en ? 'en' : 'zh'];

// The votes on a law (by its code) or a new law's name: [[position, vote]] newest first.
async function votesOn(p, name) {
  try {
    const d = await votesData();
    return d.votes.map((v, i) => [i, v]).filter(([, v]) => (p && v[7].includes(p)) || (!p && name && v[2].includes(name)));
  } catch {
    return [];
  }
}
// A vote's name in plain words: what kind of question it was and who moved it
// ("第5條・民眾黨版", "預算保留第 481 案 · 國民黨黨團"); its raw subject when unknown.
function voteName(v) {
  const w = voteWhat(v[2]);
  if (!w.short) return v[2];
  const who = w.who && w.kind !== 'amend' ? ` · ${en ? w.who.en : w.who.zh}` : '';
  return `${w.redo ? W('重新表決：', 'Again: ') : ''}${en ? w.short.en : w.short.zh}${who}`;
}
// A vote as a row: what it was, its day and a tally bar (贊成 green, 反對 red, 棄權 grey).
function voteRow([i, v], mark = '', named = false) {
  const [y, n, a] = [v[4].length, v[5].length, v[6].length];
  const all = Math.max(1, y + n + a);
  const pass = y > n;
  const badge = mark ? `<span class="lw-vote-me ${mark}">${{ y: W('贊成', 'Yes'), n: W('反對', 'No'), a: W('棄權', 'Abstain'), '-': W('未投', 'Absent') }[mark]}</span>` : '';
  const w = voteWhat(v[2]);
  return `<button type="button" class="lw-vote" data-vote="${i}"><span class="lw-vote-top">${badge}<span class="lw-vote-t">${named && v[7]?.length && state.byCode.has(v[7][0]) ? `<b class="lw-vote-law">${esc(en ? nameOf(v[7][0]) : shortName(nameOf(v[7][0])))}</b>` : ''}${esc(voteName(v))}</span></span>${w.zh ? `<span class="lw-vote-what">${esc(en ? w.en : w.zh)}</span>` : ''}<span class="lw-vote-bar"><i class="y" style="width:${(y / all) * 100}%"></i><i class="n" style="width:${(n / all) * 100}%"></i><i class="a" style="width:${(a / all) * 100}%"></i></span><small>${esc(shortDay(v[1]))} · ${pass ? W('通過', 'Passed') : W('未通過', 'Failed')} · ${W(`贊成 ${y}・反對 ${n}${a ? `・棄權 ${a}` : ''}`, `${y} yes · ${n} no${a ? ` · ${a} abstain` : ''}`)}</small></button>`;
}
function voteList(list, marks = null, first = 5, named = false) {
  const box = h('div', { class: 'lw-votes' });
  const draw = n => {
    box.innerHTML = list.slice(0, n).map(x => voteRow(x, marks?.get(x[0]), named)).join('') + (list.length > n ? `<button type="button" class="lw-more" data-more="1">${W(`再顯示 ${Math.min(20, list.length - n)} 筆（共 ${list.length}）`, `Show ${Math.min(20, list.length - n)} more (${list.length})`)}</button>` : '');
  };
  let shown = first;
  draw(shown);
  box.addEventListener('click', e => {
    if (e.target.closest('[data-more]')) return draw((shown += 20));
    const b = e.target.closest('[data-vote]');
    if (b) voteSheet(Number(b.dataset.vote));
  });
  return box;
}
// The bills a vote was on: by its laws' codes, else a tracked bill named in its subject or agenda item.
function voteItems(v, agenda = '') {
  const out = [];
  for (const p of v[7] || []) {
    const it = (state.itemsByLaw.get(p) || []).find(x => x.open || x.stage >= PASSED);
    if (it || state.byCode.has(p)) out.push({ p, it });
  }
  if (!out.length) {
    const text = `${v[2]} ${agenda}`;
    const it = state.items.filter(x => x.n?.length >= 4 && text.includes(x.n)).sort((a, b) => b.n.length - a.n.length)[0];
    if (it) out.push({ p: it.p, it });
  }
  return out;
}
// One vote, explained: what the question was in plain words, the bill it was
// on and what that bill does, the result, each party as a bar, how the
// legislators you follow voted, then every name.
async function voteSheet(i) {
  const [d, ppl] = await Promise.all([votesData(), peopleData().catch(() => ({ people: [] }))]);
  const v = d.votes[i];
  if (!v) return;
  const w = voteWhat(v[2]);
  const byName = new Map(ppl.people.map(x => [x.n, x]));
  const parties = new Map();
  const groups = [['y', v[4], W('贊成', 'Yes')], ['n', v[5], W('反對', 'No')], ['a', v[6], W('棄權', 'Abstain')]];
  for (const [k, ids] of groups) for (const j of ids) { const party = byName.get(d.names[j])?.party || ''; const c = parties.get(party) || { y: 0, n: 0, a: 0 }; c[k]++; parties.set(party, c); }
  const sized = [...parties].map(([p, c]) => [p, c, c.y + c.n + c.a]).sort((a, b) => b[2] - a[2]);
  const most = Math.max(1, ...sized.map(x => x[2]));
  const split = sized.map(([party, c, all]) => `<div class="lw-pbar"><span class="lw-party" style="--p:${partyColor(party)}">${esc(party ? partyShort(party) : W('其他', 'Other'))}</span><span class="lw-pbar-track"><span class="lw-pbar-fill" style="width:${(all / most) * 100}%">${c.y ? `<i class="y" style="flex:${c.y}"></i>` : ''}${c.n ? `<i class="n" style="flex:${c.n}"></i>` : ''}${c.a ? `<i class="a" style="flex:${c.a}"></i>` : ''}</span></span><span class="lw-pbar-n">${c.y ? `<b class="y">${c.y}</b>` : ''}${c.n ? `<b class="n">${c.n}</b>` : ''}${c.a ? `<b class="a">${c.a}</b>` : ''}</span></div>`).join('');
  // The legislators you follow: how each voted, 未投 when they didn't.
  const mark = { y: W('贊成', 'Yes'), n: W('反對', 'No'), a: W('棄權', 'Abstain'), '-': W('未投', 'Absent') };
  const sideOf = name => { const j = d.names.indexOf(name); return j < 0 ? '-' : v[4].includes(j) ? 'y' : v[5].includes(j) ? 'n' : v[6].includes(j) ? 'a' : '-'; };
  const mine = ppl.people.filter(x => state.mine.people?.[x.id] && (!x.from || x.from <= v[1]) && (!x.to || x.to >= v[1]));
  const followed = mine.length ? `<h4>${W('你追蹤的立委', 'Who you follow')}</h4><div class="lw-names">${mine.map(x => { const k = sideOf(x.n); return `<button type="button" class="lw-name lw-name-vote" data-who="${esc(x.id)}" style="--p:${partyColor(x.party)}">${esc(x.n)}<span class="lw-vote-me ${k}">${mark[k]}</span></button>`; }).join('')}</div>` : '';
  const names = groups.filter(([, ids]) => ids.length).map(([k, ids, label]) => `<h4>${esc(label)} ${ids.length}</h4><div class="lw-names">${ids.map(j => { const who = byName.get(d.names[j]); return `<button type="button" class="lw-name" data-who="${esc(who?.id || '')}" style="--p:${partyColor(who?.party || '')}">${esc(d.names[j])}</button>`; }).join('')}</div>`).join('');
  const url = gazetteUrl(v[0]);
  const agenda = String(d.agendas?.[v[3]] || '');
  // The bill it was on and what that bill does, else its agenda item in a line.
  const items = voteItems(v, agenda);
  const on = items.map(({ p, it }) => `<a class="lw-notice lw-vote-bill" href="${it ? `#item=${esc(it.k.replace(':', '-'))}` : `#law=${esc(p)}`}"><b>${esc(it?.n || nameOf(p))}</b>${it?.about ? `<span>${esc(it.about)}</span>` : ''}<small>${esc(it ? stageShort(it, en) : W('現行法規', 'Law in force'))}</small></a>`).join('');
  const bk = budgetKey(agenda || v[2]);
  const topic = !on && agenda ? agenda.replace(/─[^─]*─/g, '').replace(/（[^）]*）|\([^)]*\)/g, '').replace(/^本院[^，]*，/, '').replace(/是否有當.*$/, '').slice(0, 120) : '';
  const [y, n, a] = [v[4].length, v[5].length, v[6].length];
  const all = Math.max(1, y + n + a);
  const pass = y > n;
  const result = `<div class="lw-vote-result ${pass ? 'y' : 'n'}"><b>${pass ? W('通過', 'Passed') : W('未通過', 'Failed')}</b><span>${W(`贊成 ${y}・反對 ${n}${a ? `・棄權 ${a}` : ''}`, `${y} yes · ${n} no${a ? ` · ${a} abstain` : ''}`)}</span></div><span class="lw-vote-bar"><i class="y" style="width:${(y / all) * 100}%"></i><i class="n" style="width:${(n / all) * 100}%"></i><i class="a" style="width:${(a / all) * 100}%"></i></span>`;
  const body = h('div', { class: 'lw-vote-sheet', html: `<p class="lw-vote-subject">${esc(voteName(v))}</p>${w.zh ? `<p class="lw-vote-plain">${esc(en ? w.en : w.zh)}</p>` : ''}${result}${on ? `<h4>${W('表決的法案', 'The bill')}</h4><div class="lw-cites lw-vote-on">${on}</div>` : bk ? `<h4>${W('表決的預算', 'The budget')}</h4><div class="lw-cites lw-vote-on"><a class="lw-notice lw-vote-bill" href="#tab=bills&f=budget&budget=${esc(encodeURIComponent(bk))}"><b>${esc(topic || bk)}</b><small>${W('看這份預算：錢花在哪、刪了多少', 'See where the money goes and what was cut')}</small></a></div>` : topic ? `<h4>${W('議案', 'On the agenda')}</h4><p class="lw-vote-topic">${esc(topic)}</p>` : ''}${followed}<h4>${W('各黨怎麼投', 'By party')}</h4><div class="lw-pbars">${split}</div>${names}<p class="lw-vote-raw">${W('議事錄原文：', 'As recorded: ')}${esc(v[2])}</p>${url ? `<a class="lw-out" href="${esc(url)}" target="_blank" rel="noopener">${W('立法院公報', 'In the Gazette')}</a>` : ''}` });
  const s = sheet({ title: W(`表決 · ${shortDay(v[1])}`, `Vote · ${shortDay(v[1])}`), closeLabel: W('關閉', 'Close'), body });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-who]');
    if (b?.dataset.who) (s.close(), go(`who=${b.dataset.who}`));
    if (e.target.closest('.lw-vote-on a')) s.close();
  });
}

// 表決: every recorded floor vote this term, newest first.
async function votesList(out) {
  out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(4)}</div>`;
  let d;
  try {
    d = await votesData();
  } catch {
    return void (out.innerHTML = emptyNote(W('表決資料讀不到，請稍後再試', 'Couldn’t load the votes')));
  }
  if (billFilter !== 'votes') return;
  const words = billQuery ? expand(billQuery) : [];
  const agendas = new Map(Object.entries(d.agendas || {}));
  const list = d.votes.map((v, i) => [i, v]).filter(([, v]) => !words.length || words.some(w => v[2].includes(w) || (v[7] || []).some(p => nameOf(p).includes(w)) || String(agendas.get(v[3]) || '').includes(w)));
  if (!list.length) return void out.replaceChildren(h('div', { class: 'q-empty lw-empty-sm', html: `<strong>${W('沒有符合的表決', 'No votes match')}</strong>` }));
  const ppl = await peopleData().catch(() => ({ people: [] }));
  if (billFilter !== 'votes') return;
  const partyOfName = new Map(ppl.people.map(x => [x.n, x.party]));
  const groups = voteGroups(list);
  let shown = 20;
  const draw = () => {
    out.innerHTML = `<div class="lw-vgroups">${groups.slice(0, shown).map((g, gi) => voteGroupCard(g, gi, d, agendas, partyOfName)).join('')}</div>${groups.length > shown ? `<button type="button" class="lw-more" data-vmore>${W(`再顯示 ${Math.min(20, groups.length - shown)} 案（共 ${groups.length}）`, `Show more (${groups.length})`)}</button>` : ''}`;
  };
  draw();
  out.onclick = e => {
    if (e.target.closest('[data-vmore]')) return (shown += 20), draw();
    const g = groups[Number(e.target.closest('[data-g]')?.dataset.g)];
    if (!g) return;
    if (g.list.length === 1) return voteSheet(g.list[0][0]);
    sheet({ title: voteGroupTitle(g, agendas), closeLabel: W('關閉', 'Close'), detent: 'large', body: [h('h4', { class: 'lw-vg-h', text: W(`${shortDay(g.day)} · ${g.list.length} 次表決`, `${shortDay(g.day)} · ${g.list.length} votes`) }), voteList([g.key, ...g.list.filter(x => x !== g.key)], null, 60)] });
  };
}
// Votes on one agenda item the same day, together: the 全案 vote leads.
function voteGroups(list) {
  const by = new Map();
  for (const x of list) {
    const key = `${x[1][3]}|${x[1][1]}`;
    if (!by.has(key)) by.set(key, { day: x[1][1], list: [] });
    by.get(key).list.push(x);
  }
  return [...by.values()].map(g => ({ ...g, key: g.list.find(([, v]) => /全案/.test(v[2])) || g.list[0] }));
}
const voteGroupTitle = (g, agendas) => {
  const v = g.key[1];
  if (v[7]?.length && state.byCode.has(v[7][0])) return nameOf(v[7][0]);
  const a = String(agendas.get(v[3]) || '').replace(/─[^─]*─/g, '').replace(/（[^）]*）|\([^)]*\)/g, '').replace(/^本院[^，]*，/, '').replace(/是否有當.*$/, '');
  return (a || v[2]).slice(0, 60);
};
// Each big party's side on the leading vote: 贊成, 反對, or 分歧 when split.
function partySides(v, names, partyOfName) {
  const c = new Map();
  for (const [k, ids] of [['y', v[4]], ['n', v[5]], ['a', v[6]]]) for (const j of ids) { const p = partyOfName.get(names[j]) || ''; const x = c.get(p) || { y: 0, n: 0, a: 0 }; x[k]++; c.set(p, x); }
  return [...c].filter(([p, x]) => p && x.y + x.n + x.a >= 3).sort((a, b) => b[1].y + b[1].n - (a[1].y + a[1].n)).map(([p, x]) => {
    const all = x.y + x.n + x.a;
    const side = x.y / all >= 0.8 ? 'y' : x.n / all >= 0.8 ? 'n' : x.a / all >= 0.8 ? 'a' : 'm';
    return [p, side];
  });
}
function voteGroupCard(g, gi, d, agendas, partyOfName) {
  const v = g.key[1];
  const [y, n] = [v[4].length, v[5].length];
  const label = { y: W('贊成', 'Yes'), n: W('反對', 'No'), a: W('棄權', 'Abstain'), m: W('分歧', 'Split') };
  const sides = partySides(v, d.names, partyOfName).map(([p, s]) => `<span class="lw-vg-side ${s}" style="--p:${partyColor(p)}"><b>${esc(partyShort(p))}</b>${label[s]}</span>`).join('');
  const w = voteWhat(v[2]);
  const it = voteItems(v, String(agendas.get(v[3]) || ''))[0]?.it;
  // A day of budget items: how many held-over items were voted and how they went.
  const held = g.list.filter(([, x]) => voteWhat(x[2]).kind === 'reserve');
  const won = held.filter(([, x]) => x[4].length > x[5].length).length;
  const line = held.length > 1 ? W(`逐一表決 ${held.length} 個預算保留案（刪減、凍結或附加條件）：通過 ${won}、否決 ${held.length - won}`, `${held.length} held-over budget items (cuts, freezes, conditions) voted one by one: ${won} passed, ${held.length - won} failed`) : it?.about || (w.zh ? (en ? w.en : w.zh) : '');
  return `<button type="button" class="lw-vgroup" data-g="${gi}"><b class="lw-vg-t">${esc(voteGroupTitle(g, agendas).replace(/^中華民國(?=\d)/, ''))}</b>${line ? `<span class="lw-vg-what">${esc(line)}</span>` : ''}${sides ? `<span class="lw-vg-sides">${sides}</span>` : ''}<span class="lw-vg-foot"><span class="lw-tag ${y > n ? 'green' : 'red'}">${y > n ? W('通過', 'Passed') : W('未通過', 'Failed')}</span><small>${[shortDay(g.day), W(`贊成 ${y}・反對 ${n}`, `${y} yes · ${n} no`), g.list.length > 1 ? W(`${g.list.length} 次`, `${g.list.length} votes`) : ''].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join(' · ')}</small></span></button>`;
}

// 立委: everyone in office this term, by 縣市 (north to south, then the
// islands, 原住民 and 不分區) or by party; search by name, 選區 or party.
let peopleBy = 'area';
const COUNTIES = ['基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
const COUNTY_EN = { 基隆市: 'Keelung', 臺北市: 'Taipei', 新北市: 'New Taipei', 桃園市: 'Taoyuan', 新竹市: 'Hsinchu City', 新竹縣: 'Hsinchu County', 苗栗縣: 'Miaoli', 臺中市: 'Taichung', 彰化縣: 'Changhua', 南投縣: 'Nantou', 雲林縣: 'Yunlin', 嘉義市: 'Chiayi City', 嘉義縣: 'Chiayi County', 臺南市: 'Tainan', 高雄市: 'Kaohsiung', 屏東縣: 'Pingtung', 宜蘭縣: 'Yilan', 花蓮縣: 'Hualien', 臺東縣: 'Taitung', 澎湖縣: 'Penghu', 金門縣: 'Kinmen', 連江縣: 'Lienchiang' };
// A seat's group: [order, zh, en]; and its number inside (第3選舉區 → 3).
const seatGroup = a => {
  const c = COUNTIES.findIndex(k => String(a).startsWith(k));
  if (c >= 0) return [c, COUNTIES[c], COUNTY_EN[COUNTIES[c]]];
  if (/原住民/.test(a)) return [30, '原住民', 'Indigenous'];
  if (/不分區/.test(a)) return [40, '不分區', 'At-large'];
  return [50, W('其他', 'Other'), 'Other'];
};
const seatNo = a => Number(String(a).match(/第(\d+)選舉區/)?.[1] || (/山地/.test(a) ? 2 : /平地/.test(a) ? 1 : 0));
async function peopleList(out) {
  out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(4)}</div>`;
  let ppl;
  try {
    ppl = (await peopleData()).people;
  } catch {
    return void (out.innerHTML = emptyNote(W('立委資料讀不到，請稍後再試', 'Couldn’t load the legislators')));
  }
  const q = billQuery;
  const words = q ? expand(q).map(w => w.toLowerCase()) : [];
  const hit = x => words.some(w => x.n.includes(w) || x.area.includes(w) || x.party.includes(w) || partyOf(x.party).zh.includes(w) || partyOf(x.party).en.toLowerCase().includes(w) || seatGroup(x.area)[2].toLowerCase().includes(w));
  // A search finds those who left this term too (by name); the list shows those in office.
  const now = ppl.filter(x => !x.to && (!q || hit(x)));
  const left = q ? ppl.filter(x => x.to && x.n.includes(q)) : [];
  const followed = now.filter(x => state.mine.people?.[x.id]);
  const byArea = peopleBy === 'area';
  // By 縣市: each card says its party and 選區; by party: its 選區.
  const seat = a => (/第(\d+)選舉區/.test(a) ? W(`第${seatNo(a)}選區`, `District ${seatNo(a)}`) : /山地原住民/.test(a) ? W('山地', 'Highland') : /平地原住民/.test(a) ? W('平地', 'Lowland') : '');
  const sub = (x, full) => (full ? `${partyShort(x.party)} · ${shortArea(x.area)}` : byArea ? [partyShort(x.party), bloc(x) !== x.party ? W(`${partyShort(bloc(x))}團`, `${partyShort(bloc(x))} caucus`) : '', seat(x.area)].filter(Boolean).join(' · ') : shortArea(x.area));
  const card = (x, full) => `<a class="lw-person" href="#who=${esc(x.id)}" style="--p:${partyColor(x.party)}">${personPhoto(x)}<span class="lw-person-text"><b class="q-fit">${esc(x.n)}</b><small>${esc(sub(x, full === true))}</small></span><span class="lw-person-n">${W(`提案 ${x.counts.bills}`, `${x.counts.bills} bills`)}</span></a>`;
  const groups = new Map();
  for (const x of now) {
    const g = byArea ? seatGroup(x.area) : [0, x.party];
    const k = g[1];
    if (!groups.has(k)) groups.set(k, { g, xs: [] });
    groups.get(k).xs.push(x);
  }
  const order = byArea ? [...groups.values()].sort((a, b) => a.g[0] - b.g[0]) : [...groups.values()].sort((a, b) => b.xs.length - a.xs.length);
  // Inside a 縣市: by 選區; 不分區: by party, then the list's order.
  for (const o of order) if (byArea) o.xs.sort((a, b) => (o.g[0] === 40 ? partyRank(a.party) - partyRank(b.party) : seatNo(a.area) - seatNo(b.area)));
  const head = o => (byArea ? `<h2>${esc(W(o.g[1], o.g[2]))}</h2>` : `<h2><span class="lw-party" style="--p:${partyColor(o.g[1])}">${esc(partyShort(o.g[1]))}</span></h2>`);
  const toggle = `<div class="q-chips lw-chips lw-people-by" role="tablist">${[['area', W('依縣市', 'By place')], ['party', W('依政黨', 'By party')]].map(([id, label]) => `<button type="button" class="q-chip" role="tab" data-by="${id}" aria-selected="${id === peopleBy}" aria-pressed="${id === peopleBy}">${label}</button>`).join('')}</div>`;
  const list =
    (followed.length ? `<section class="q-section lw-sec"><div class="q-section-head"><h2>${W('追蹤的立委', 'Following')}</h2></div><div class="lw-people">${followed.map(x => card(x, true)).join('')}</div></section>` : '') +
    order.map(o => `<section class="q-section lw-sec"><div class="q-section-head">${head(o)}<span class="lw-count">${o.xs.length}</span></div><div class="lw-people">${o.xs.map(card).join('')}</div></section>`).join('') +
    (left.length ? `<section class="q-section lw-sec"><div class="q-section-head"><h2>${W('已離職', 'Left office')}</h2><span class="lw-count">${left.length}</span></div><div class="lw-people">${left.map(x => card(x, true)).join('')}</div></section>` : '');
  out.innerHTML = list ? (now.length > 1 ? toggle : '') + list : emptyNote(W('沒有符合的立委', 'No one matches'));
  out.querySelectorAll('[data-by]').forEach(b => b.addEventListener('click', () => peopleBy !== b.dataset.by && ((peopleBy = b.dataset.by), haptic(), peopleList(out))));
}
// The parties in seat order (most seats first), for 不分區.
const PARTY_RANK = ['中國國民黨', '民主進步黨', '台灣民眾黨'];
const partyRank = p => (PARTY_RANK.includes(p) ? PARTY_RANK.indexOf(p) : 9);
// The bloc a legislator votes in: the 黨團 they joined (an independent in the
// 國民黨 caucus), else their party.
const bloc = p => (p.caucus && p.caucus !== INDEPENDENT ? p.caucus : p.party);
const alignLine = al => {
  const p = esc(partyShort(al.bloc)), n = `<b>${pctText(al)}%</b>`;
  if (al.how === 'caucus') return W(`${n} 跟所屬${p}團多數一致`, `${n} with the ${p} caucus’s majority (sits in it)`);
  if (al.how === 'closest') return W(`${n} 跟${p}多數一致（最接近的政黨）`, `${n} with ${p}’s majority (the party closest to them)`);
  return W(`${n} 跟${p}多數一致`, `${n} with ${p}’s majority`);
};
const shortArea = a => String(a || '').replace('全國不分區及僑居國外國民', W('不分區', 'At-large')).replace(/選舉區$/, W('選區', ''));
// A mirrored headshot (scripts/build-photos.mjs) at the size it's drawn; an unmirrored one from ly.gov.tw.
const photoSrc = (photo, big) => (/^https?:/.test(photo) ? photo : `${photo}.${big ? 192 : 96}.webp`);
const personPhoto = (x, cls = '') => `<span class="lw-photo ${cls}" style="--p:${partyColor(x.party)}">${esc(x.n.slice(0, 1))}${x.photo ? `<img src="${esc(photoSrc(x.photo, cls === 'lg'))}" alt="" width="${cls === 'lg' ? 72 : 44}" height="${cls === 'lg' ? 72 : 44}" ${cls === 'lg' ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.remove()">` : ''}</span>`;

// A legislator's page: their numbers, then 質詢 videos, votes and bills.
async function openPerson(id) {
  let x, ppl, d;
  try {
    [x, ppl] = await Promise.all([data(`ly/person/${encodeURIComponent(id)}.json`), peopleData()]);
  } catch {
    return toast(W('這位立委的資料讀不到', 'Couldn’t load this legislator'));
  }
  const row = ppl.people.find(p => String(p.id) === String(id)) || x;
  if (state.mine.people?.[id]) (markSeen(state.mine, 'people', String(id)), state.peopleNew && (state.peopleNew[id] = 0), save());
  const follow = h('button', { type: 'button', class: `lw-tool${state.mine.people?.[id] ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => ((state.mine.people ||= {}), toggleFollow(state.mine, 'people', String(id)) && toast(W('已追蹤這位立委', 'Following')), save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.people[id])), haptic()) });
  const att = x.attend?.plenary;
  const stats = [[W('提案', 'Bills'), row.counts.bills, 'indigo'], [W('連署', 'Co-sign'), row.counts.cosign, 'teal'], [W('質詢', 'Talks'), row.counts.clips, 'orange'], [W('出席', 'Present'), att ? `${Math.round((att[0] / Math.max(1, att[1])) * 100)}%` : '–', 'green']];
  const head = h('div', { class: 'lw-person-head', html: `${personPhoto({ ...x, photo: x.photo || row.photo }, 'lg')}<div><h2>${esc(x.n)}</h2><div class="lw-meta"><span class="lw-party" style="--p:${partyColor(x.party)}">${esc(partyShort(x.party))}</span>${bloc(row) !== x.party ? `<span class="lw-party" style="--p:${partyColor(bloc(row))}">${esc(W(`${partyShort(bloc(row))}團`, `${partyShort(bloc(row))} caucus`))}</span>` : ''}<span class="lw-tag">${esc(shortArea(x.area))}</span>${x.to ? `<span class="lw-tag red">${W('已離職', 'Left office')}</span>` : ''}</div></div>` });
  const tiles = h('div', { class: 'lw-stats four', html: stats.map(([l, n, tone]) => `<span class="lw-stat ${tone}"><b>${typeof n === 'number' ? n.toLocaleString() : n}</b><span>${esc(l)}</span></span>`).join('') });
  const clips = h('div', { class: 'lw-person-sec' });
  if (x.clips?.length) {
    const roc = d => { const [y, m, dd] = d.split('-').map(Number); return `${y - 1911}年${m}月${dd}日`; };
    const yt = c => `https://www.youtube.com/@LegislativeYuan/search?query=${encodeURIComponent(`${c[1]} ${roc(c[0])}`)}`;
    const clipRow = c => `<div class="lw-clip"><a class="lw-clip-main" href="${esc(ivodUrl(c[2]))}" target="_blank" rel="noopener"><span class="lw-clip-play">${ICON_PLAY}</span><span class="lw-row-text"><span class="lw-row-name">${esc(c[1] || W('院會', 'Plenary'))}</span><small>${esc(`${shortDay(c[0])}${c[4] ? ` · ${Math.max(1, Math.round(c[4] / 60))} ${W('分鐘', 'min')}` : ''}`)}</small></span></a><a class="lw-clip-yt" href="${esc(yt(c))}" target="_blank" rel="noopener" aria-label="YouTube">${ICON_YT}</a></div>`;
    let n = 5;
    const draw = () => (clips.innerHTML = `<h4>${W(`質詢影片（${x.clips.length}）`, `Speeches (${x.clips.length})`)}</h4><div class="lw-clips">${x.clips.slice(0, n).map(clipRow).join('')}</div>${x.clips.length > n ? `<button type="button" class="lw-more">${W('再顯示 20 段', 'Show 20 more')}</button>` : ''}<p class="lw-hint-sm">${W('影片在立法院議事轉播（IVOD）；▶ YouTube 找同一場會議。', 'Videos play on the Legislative Yuan’s IVOD; the YouTube button finds the same meeting.')}</p>`);
    draw();
    clips.addEventListener('click', e => e.target.closest('.lw-more') && ((n += 20), draw()));
  }
  const votes = h('div', { class: 'lw-person-sec' });
  votesData().then(dd => {
    d = dd;
    const mine = personVotes(d, x.n, { from: x.from, to: x.to }).filter(([, m]) => m !== '-');
    if (!mine.length) return;
    const marks = new Map(mine);
    // How often they vote with their party's majority; an independent, with
    // the caucus they joined, else with the party they side with most.
    const al = alignment(d, { ...x, caucus: row.caucus || x.caucus }, mine, new Map(ppl.people.map(p => [p.n, bloc(p)])));
    const whole = mine.filter(([j]) => /全案/.test(d.votes[j][2]));
    const all = h('button', { type: 'button', class: 'lw-more', text: W(`看全部 ${mine.length} 筆表決`, `All ${mine.length} votes`), onclick: () => all.replaceWith(voteList(mine.map(([j]) => [j, d.votes[j]]), marks)) });
    votes.replaceChildren(
      h('h4', { text: W(`表決紀錄（${mine.length}）`, `Votes (${mine.length})`) }),
      ...(al && al.cast >= 10 ? [h('p', { class: 'lw-person-line', html: alignLine(al) })] : []),
      ...(whole.length ? [h('p', { class: 'lw-vg-h', text: W(`法案全案表決 ${whole.length}`, `Final votes on bills: ${whole.length}`) }), voteList(whole.map(([j]) => [j, d.votes[j]]), marks, 5, true), all] : [voteList(mine.map(([j]) => [j, d.votes[j]]), marks)])
    );
  }).catch(() => {});
  const bills = h('div', { class: 'lw-person-sec', html: x.bills?.length ? `<h4>${W(`提案（${row.counts.bills}）`, `Bills (${row.counts.bills})`)}</h4><div class="lw-list in-sheet wrap">${x.bills.slice(0, 15).map(b => `<a class="lw-row" href="https://ppg.ly.gov.tw/ppg/bills/${esc(b[0])}/details" target="_blank" rel="noopener"><span class="lw-row-text"><span class="lw-row-name">${esc(b[2])}</span><small>${esc([shortDay(b[1]), b[3]].filter(Boolean).join(' · '))}</small></span></a>`).join('')}</div>` : '' });
  sheet({ title: W('立委', 'Legislator'), lead: follow, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [head, tiles, clips, votes, bills], onClose: () => location.hash.startsWith('#who=') && history.replaceState(null, '', '#tab=bills') });
}

// 預算: the term's budgets (yearly 總預算, 追加, 特別), each by its stage, and
// for a yearly one the money (主計總處's 預算表, scripts/build-budget.mjs):
// the total and its change from last year, where it goes, what 立法院 cut.
// A card opens the budget's page (#budget=<k>): by function, by ministry →
// agency → 工作計畫, the biggest cuts, its steps and its floor votes.
const BUDGET_STEP_EN = [[/三讀/, 'Passed'], [/公布/, 'Promulgated'], [/協商/, 'In talks'], [/二讀/, '2nd reading'], [/審查完畢|審查總報告/, 'Reviewed'], [/退回程序/, 'Sent back'], [/委員會發文/, 'Committee letter'], [/交付審查|委員會/, 'In committee'], [/排入院會/, 'On the agenda'], [/復議/, 'Reconsidered'], [/預算流程/, 'Budget filed'], [/撤/, 'Withdrawn']];
// A step in words: its note in brackets dropped; in English, the usual ones translated.
const budgetStep = t => { const z = String(t || '').replace(/\s*[（(].*$/, ''); return en ? BUDGET_STEP_EN.find(([re]) => re.test(z))?.[1] || z : z; };
const budgetTone = st => (/三讀|公布/.test(st) ? 'passed' : /協商|二讀|討論/.test(st) ? 'held' : '');
// 政事別 (what the money is for): a colour and a short name each.
const FN = {
  一般政務支出: ['#64748b', '一般政務', 'Government'],
  國防支出: ['#ef4444', '國防', 'Defense'],
  教育科學文化支出: ['#8b5cf6', '教科文', 'Education'],
  經濟發展支出: ['#f59e0b', '經濟', 'Economy'],
  社會福利支出: ['#10b981', '社福', 'Welfare'],
  社區發展及環境保護支出: ['#14b8a6', '環保', 'Environment'],
  退休撫卹支出: ['#3b82f6', '退撫', 'Pensions'],
  退休撫恤支出: ['#3b82f6', '退撫', 'Pensions'],
  債務支出: ['#a16207', '債務', 'Debt'],
  補助及其他支出: ['#94a3b8', '補助', 'Grants'],
  一般補助及其他支出: ['#94a3b8', '補助', 'Grants']
};
const fnOf = n => FN[n] || ['#94a3b8', n.replace(/支出$/, ''), n];
const fnName = n => (en ? fnOf(n)[2] : fnOf(n)[1]);
const pct = (a, total) => `${total ? Math.round((a / total) * 100) : 0}%`;
const chgTag = (now, before) => (before ? `<span class="lw-bud-chg ${now >= before ? 'up' : 'down'}">${esc(change(now, before))}</span>` : '');
const fnBar = fns => { const t = fns.reduce((s, f) => s + Math.max(0, f[1]), 0); return `<span class="lw-bud-bar">${fns.filter(f => f[1] > 0).map(f => `<i style="--c:${fnOf(f[0])[0]};flex-grow:${f[1] / t}"></i>`).join('')}</span>`; };
const budgetName = x => (en ? x.title.replace(/^(\d+)年度中央政府總預算追加預算案$/, 'FY$1 supplementary budget').replace(/^(\d+)年度中央政府總預算案$/, 'FY$1 central budget').replace(/^(\d+)年度第二預備金動支數額表$/, 'FY$1 reserve fund report') : x.title.replace(/案$/, '').replace(/^(\d+年度)中央政府/, '$1 ').replace(/^中央政府(?=.*特別預算$)/, ''));

// A budget's road through 立法院: six steps, the ones passed filled in;
// `big` adds each step's day under it.
const md = d => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
// A budget's steps; one marked 審查完畢 with no report in its flow (a reserve-fund
// report deemed reviewed when its review period ran out) counts as reviewed that day.
const stepsOf = x => budgetSteps(/審查完畢/.test(x.stage) && !(x.flow || []).some(f => /總報告|審查完畢/.test(f[1])) ? [...(x.flow || []), [x.last, '審查完畢']] : x.flow, x.first);
const lapsed = x => (x.bills || []).some(b => /逾審查期限/.test(b[3] || ''));
const roadHtml = (x, big = false) => {
  const r = stepsOf(x);
  return `<span class="lw-road${big ? ' big' : ''}${r.now === 5 ? ' passed' : ''}" role="img" aria-label="${esc(BUDGET_STEPS[r.now][en ? 1 : 0])}">${BUDGET_STEPS.map(([zh, e], i) => `<span class="${i < r.now || (i === r.now && r.now === 5) ? 'done' : i === r.now ? 'now' : ''}"><i></i>${big ? `<b>${esc(en ? e : zh)}</b><small>${i <= r.now && r.days[i] ? esc(md(r.days[i])) : ''}</small>` : ''}</span>`).join('')}</span>`;
};
// Where a budget stands in a line: the step and its day, how long it took,
// and for a yearly 總預算 the legal deadline (11/30 before its year).
function roadLine(x, long = false) {
  const r = stepsOf(x);
  const now = BUDGET_STEPS[r.now][en ? 1 : 0];
  const day = r.days[r.now] || x.last;
  const parts = [`${lapsed(x) && r.now === 3 ? W('逾期視為審完', 'Deemed reviewed') : now}${day ? ` ${ymd(day)}` : ''}`];
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  if (long && lapsed(x)) parts.push(W('審查期限已過，依法視為審查完畢', 'the review period ran out'));
  if (r.now === 5 && r.days[0] && day) parts.push(W(`歷時 ${daysBetween(r.days[0], day)} 天`, `${daysBetween(r.days[0], day)} days`));
  if (long && /^\d+$/.test(x.k)) {
    const due = budgetDue(x.k);
    const late = daysBetween(due, r.now === 5 ? day : today);
    parts.push(r.now === 5 ? (late > 0 ? W(`比法定期限晚 ${late} 天`, `${late} days past the deadline`) : W('在法定期限內', 'On time')) : late > 0 ? W(`已過法定期限 ${late} 天`, `${late} days past the deadline`) : W(`法定期限 ${md(due)}，還有 ${-late} 天`, `Due ${md(due)}: ${-late} days left`));
  }
  if (long && r.back) parts.push(r.back[1] === '復議' ? W(`${md(r.back[0])} 被提復議而卡住`, `held up by a reconsider motion ${md(r.back[0])}`) : W(`${md(r.back[0])} 曾被退回程序委員會`, `sent back ${md(r.back[0])}`));
  return parts;
}
const dueSpan = t => `<span${/期限|deadline|days left/.test(t) ? ' class="due"' : ''}>${esc(t)}</span>`;
const budgetKind = k => (/預備金$/.test(k) ? 'reserve' : /追加$/.test(k) ? 'extra' : /^\d+$/.test(k) ? 'year' : 'special');
const BUDGET_KINDS = [['year', W('歷年總預算', 'Yearly budgets')], ['special', W('特別預算', 'Special budgets')], ['extra', W('追加預算', 'Supplementary budgets')], ['reserve', W('第二預備金', 'Reserve fund')]];

// 預算: the budget now in 立法院 first (its road, the deadline, its money),
// then every budget by kind, newest first.
async function budgetList(out) {
  out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(2)}</div>`;
  let b;
  try {
    b = await budgetData();
  } catch {
    return void (out.innerHTML = emptyNote(W('預算資料讀不到，請稍後再試', 'Couldn’t load the budgets')));
  }
  if (billFilter !== 'budget') return;
  const href = x => `#tab=bills&amp;f=budget&amp;budget=${encodeURIComponent(x.k)}`;
  const moneyBits = m => {
    const top = [...m.fn].sort((a, c) => c[1] - a[1]).slice(0, 3);
    const cut = m.cut > 0 ? `<span class="lw-bud-cut">${W('立法院刪減', 'Cut by the Legislative Yuan')} <b>${esc(money(m.cut, en))}</b> · ${esc(pct(m.cut, m.asked))}</span>` : `<span class="lw-bud-note">${m.passed ? W('照案通過', 'Passed as sent') : W('行政院送審版；刪減待法定預算公布', 'Cabinet’s version; cuts not out yet')}</span>`;
    const most = m.cuts?.length ? `<span class="lw-bud-steps">${W('刪最多：', 'Cut most: ')}${m.cuts.slice(0, 2).map(c => `${esc(c[0].replace(/主管$|及所屬$|所屬$/, ''))} ${esc(money(c[1], en))}`).join(W('、', ', '))}</span>` : '';
    return `<span class="lw-bud-total"><b>${esc(money(m.total, en))}</b><small>${W('歲出', 'Spending')}</small>${chgTag(m.total, m.prev)}</span>${fnBar(m.fn)}<span class="lw-bud-legend">${top.map(f => `<span><i style="--c:${fnOf(f[0])[0]}"></i>${esc(fnName(f[0]))} ${pct(f[1], m.total)}</span>`).join('')}</span>${cut}${most}`;
  };
  const card = x => {
    const head = `<span class="lw-bill-top"><span class="lw-bill-stage ${budgetTone(x.stage)}">${esc(budgetStep(x.stage))}</span><span class="lw-bill-day">${esc(shortDay(x.last))}</span></span><b class="lw-bill-name">${esc(budgetName(x))}</b>`;
    return `<a class="lw-bill lw-budget${x.money ? ' money' : ''}" href="${href(x)}">${head}${roadHtml(x)}<span class="lw-bud-steps">${esc(roadLine(x).join(' · '))}</span>${x.money ? moneyBits(x.money) : ''}</a>`;
  };
  const q = billQuery;
  const shown = b.budgets.filter(x => !q || x.title.includes(q) || x.k.includes(q) || budgetName(x).toLowerCase().includes(q.toLowerCase()) || x.money?.top.some(t => t[0].includes(q)) || x.money?.cuts?.some(t => t[0].includes(q)));
  if (!shown.length) return void (out.innerHTML = emptyNote(W('沒有符合的預算', 'No budget matches')));
  // The 總預算 in 立法院 now: the newest year's.
  const cur = !q && shown.filter(x => budgetKind(x.k) === 'year').sort((a, c) => Number(c.k) - Number(a.k))[0];
  const hero = cur
    ? `<section class="q-section lw-sec"><div class="q-section-head"><h2>${stepsOf(cur).now < 5 ? W('立法院正在審', 'In the Legislative Yuan now') : W('最新的總預算', 'Latest budget')}</h2></div><a class="lw-bill lw-budget lw-bud-hero${cur.money ? ' money' : ''}" href="${href(cur)}"><span class="lw-bill-top"><span class="lw-bill-stage ${budgetTone(cur.stage)}">${esc(budgetStep(cur.stage))}</span><span class="lw-bill-day">${esc(shortDay(cur.last))}</span></span><b class="lw-bill-name">${esc(budgetName(cur))}</b>${roadHtml(cur, true)}<span class="lw-bud-road-note">${roadLine(cur, true).map(dueSpan).join('')}</span>${cur.money ? moneyBits(cur.money) : `<span class="lw-bud-note wrap">${W('主計總處公布預算表後，這裡會有金額、各部會和刪減。', 'Amounts, ministries and cuts show once the DGBAS publishes the tables.')}</span>`}</a></section>`
    : '';
  out.innerHTML =
    hero +
    BUDGET_KINDS.map(([kind, title]) => {
      const xs = shown.filter(x => budgetKind(x.k) === kind && x !== cur).sort((a, c) => (kind === 'year' ? Number(c.k) - Number(a.k) : (c.first || '0').localeCompare(a.first || '0')));
      return xs.length ? `<section class="q-section lw-sec"><div class="q-section-head"><h2>${esc(title)}</h2><span class="lw-count">${xs.length}</span></div><div class="lw-grid">${xs.map(card).join('')}</div></section>` : '';
    }).join('');
}

const budgetData = () => (lyBudget ||= data('ly/budget.json').then(b => ({ ...b, budgets: b.budgets.map(x => ({ ...x, stage: x.stage || x.flow?.at(-1)?.[1]?.replace(/\s*\(.*$/, '') || '' })).sort((a, c) => /預備金$/.test(a.k) - /預備金$/.test(c.k) || ((a.first || '0') < (c.first || '0') ? 1 : -1)) })).catch(e => ((lyBudget = null), Promise.reject(e))));

// A budget's page.
async function openBudget(k) {
  const b = await budgetData().catch(() => null);
  const x = b?.budgets.find(y => y.k === k);
  if (!x) return;
  const m = x.money;
  const body = h('div', { class: 'lw-bud-page' });
  const close = () => location.hash.includes('budget=') && history.replaceState(null, '', '#tab=bills&f=budget');
  sheet({ title: W('預算', 'Budget'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [body], onClose: close });
  const head = `<h2 class="lw-item-name lw-big-name">${esc(budgetName(x))}</h2><div class="lw-meta"><span class="lw-bill-stage ${budgetTone(x.stage)}">${esc(budgetStep(x.stage))}</span>${x.last ? `<span class="lw-tag">${esc(ymd(x.last))}</span>` : ''}</div><div class="lw-bud-road">${roadHtml(x, true)}<span class="lw-bud-road-note">${roadLine(x, true).map(dueSpan).join('')}</span></div>`;
  const steps = x.flow?.length ? `<section class="lw-person-sec"><h4>${W('進度', 'Steps')}</h4><ol class="lw-timeline">${x.flow.map(f => `<li class="done"><b>${esc(budgetStep(f[1]))}</b><span>${esc(ymd(f[0]))}</span></li>`).join('')}</ol></section>` : '';
  const votesBox = h('section', { class: 'lw-person-sec' });
  if (x.votes?.length)
    votesData().then(d => {
      const ids = new Set(x.votes);
      const list = d.votes.map((v, i) => [i, v]).filter(([, v]) => ids.has(v[0]));
      votesBox.replaceChildren(h('h4', { text: W(`院會表決（${list.length}）`, `Floor votes (${list.length})`) }), voteList(list, null, 5));
    }).catch(() => {});
  if (!m) {
    body.innerHTML = `${head}<p class="lw-hint-sm">${/^\d+$/.test(x.k) ? W('主計總處的預算表公開後，這裡會列出金額、各部會和刪減。', 'Amounts, ministries and cuts appear here once the DGBAS publishes the budget tables.') : W('特別預算和追加預算的金額不在主計總處的開放資料裡。', 'Special and supplementary budgets aren’t in the DGBAS’s open data.')}</p>${steps}`;
    return void body.append(votesBox);
  }
  const tiles = [[W('歲出', 'Spending'), money(m.total, en), 'indigo'], [W('較上年', 'vs last year'), change(m.total, m.prev) || '–', m.total >= m.prev ? 'orange' : 'green'], [W('歲入', 'Revenue'), m.rev ? money(m.rev, en) : '–', 'teal'], m.cut > 0 ? [W('立法院刪減', 'Cut'), money(m.cut, en), 'red'] : [W('差短', 'Shortfall'), m.rev ? money(m.total - m.rev, en) : '–', 'red']];
  body.innerHTML = `${head}<div class="lw-stats four">${tiles.map(([l, n, tone]) => `<span class="lw-stat ${tone}"><b>${esc(n)}</b><span>${esc(l)}</span></span>`).join('')}</div><div class="lw-bud-more"><span class="q-skel lw-bud-skel"></span></div>${steps}`;
  body.append(votesBox);
  let y;
  try {
    y = await data(`ly/budget/${x.k}.json`);
  } catch {
    return void (body.querySelector('.lw-bud-more').innerHTML = `<p class="lw-hint-sm">${W('明細讀不到，請稍後再試', 'Couldn’t load the details')}</p>`);
  }
  const total = y.total;
  const cutTag = c => (c > 0 ? `<span class="lw-bud-chg cut">${W('刪', 'Cut')} ${esc(money(c, en))}</span>` : c < 0 ? `<span class="lw-bud-chg up">${W('增', 'Added')} ${esc(money(-c, en))}</span>` : '');
  const line = (name, amt, prev, cut, max, color) => `<span class="lw-bud-line"><span class="lw-bud-name q-fit-wrap">${esc(name)}</span><b>${esc(money(amt, en))}</b></span><span class="lw-bud-sub"><span class="lw-bud-track"><i style="width:${Math.max(1.5, (amt / max) * 100).toFixed(1)}%${color ? `;--c:${color}` : ''}"></i></span>${chgTag(amt, prev)}${cutTag(cut)}</span>`;
  const fnSec = `<section class="lw-person-sec"><h4>${W('錢花在哪', 'Where it goes')}</h4>${fnBar(y.fn)}<div class="lw-bud-rows">${[...y.fn].sort((a, c) => c[1] - a[1]).map(f => `<div class="lw-bud-row">${line(`${fnName(f[0])} · ${pct(f[1], total)}`, f[1], 0, f[2], y.fn.reduce((s, z) => Math.max(s, z[1]), 0), fnOf(f[0])[0])}</div>`).join('')}</div></section>`;
  const mins = [...y.min].sort((a, c) => c[1] - a[1]);
  const maxMin = mins[0]?.[1] || 1;
  const plans = a => { const ps = [...a[4]].sort((p, q) => q[1] - p[1]); const top = ps[0]?.[1] || 1; return ps.slice(0, 20).map(p => `<div class="lw-bud-row plan">${line(p[0], p[1], p[2], p[3], top)}</div>`).join('') + (ps.length > 20 ? `<p class="lw-hint-sm">${W(`另有 ${ps.length - 20} 項較小的計畫`, `${ps.length - 20} smaller plans not shown`)}</p>` : ''); };
  const agencies = mn => { const as = [...mn[4]].sort((a, c) => c[1] - a[1]); const top = as[0]?.[1] || 1; return as.length === 1 ? plans(as[0]) : as.map(a => `<details class="lw-bud-row"><summary>${line(a[0], a[1], a[2], a[3], top)}</summary><div class="lw-bud-kids">${plans(a)}</div></details>`).join(''); };
  const minSec = `<section class="lw-person-sec"><h4>${W(`各部會（${mins.length}）`, `By ministry (${mins.length})`)}</h4><p class="lw-hint-sm">${W('點一下看所屬機關和工作計畫', 'Tap for its agencies and programs')}</p><div class="lw-bud-rows">${mins.map(mn => `<details class="lw-bud-row"><summary>${line(mn[0], mn[1], mn[2], mn[3], maxMin)}</summary><div class="lw-bud-kids">${agencies(mn)}</div></details>`).join('')}</div></section>`;
  const cuts = y.min.flatMap(mn => (mn[4].length > 1 ? mn[4] : [mn])).filter(a => a[3] > 0).sort((a, c) => c[3] - a[3]).slice(0, 8);
  const cutSec = y.cut != null ? `<section class="lw-person-sec"><h4>${W('立法院刪減最多', 'Biggest cuts')}</h4><p class="lw-hint-sm">${W(`行政院送 ${money(y.asked, en)}，三讀 ${money(y.total, en)}，刪 ${money(y.cut, en)}（${pct(y.cut, y.asked)}）。凍結的錢仍在預算裡，要報告後才能動支，不在這裡。`, `The Cabinet asked for ${money(y.asked, en)}; ${money(y.total, en)} passed, ${money(y.cut, en)} (${pct(y.cut, y.asked)}) cut. Frozen money stays in the budget and isn’t counted here.`)}</p><div class="lw-bud-rows">${cuts.map(a => `<div class="lw-bud-row">${line(a[0], a[3], 0, 0, cuts[0][3], 'var(--q-red)')}</div>`).join('')}</div></section>` : '';
  const src = `<p class="lw-hint-sm lw-bud-src">${W('資料：行政院主計總處預算表（政府資料開放平臺', 'Source: DGBAS budget tables (data.gov.tw')} ${['b', 'c'].filter(kd => y.src?.[kd]).map(kd => `<a href="https://data.gov.tw/dataset/${esc(y.src[kd])}" target="_blank" rel="noopener">${kd === 'b' ? W('預算案', 'as sent') : W('法定預算', 'as passed')}</a>`).join('、')}）</p>`;
  body.querySelector('.lw-bud-more').outerHTML = fnSec + cutSec + minSec + src;
}

// ---- 議程: 立法院's meetings, today's live ------------------------------------------------

// The agenda: this deploy's copy (meetings from three days back), today's
// meetings read again from the 立法院 API (its 發言名單 fills in on the day),
// and what IVOD streams now (live.yml's live.json: each meeting's channel).
let lyAgenda;
const LIVE_URL = 'https://raw.githubusercontent.com/JayPengX/Orbit-Law/live/live.json';
// (The rooms carry `fresh`: read in the last half hour. live.yml stops after sitting hours.)
const liveData = () => fetch(`${LIVE_URL}?t=${Math.floor(Date.now() / 60e3)}`, { signal: AbortSignal.timeout(6000) }).then(r => (r.ok ? r.json() : null)).then(l => (l && l.at && Date.now() - Date.parse(l.at) < 12 * 3600e3 ? Object.assign(l.rooms || [], { fresh: Date.now() - Date.parse(l.at) < 30 * 60e3 }) : null)).catch(() => null);
const agendaData = () =>
  (lyAgenda ||= (async () => {
    const [a, live] = await Promise.all([data('ly/agenda.json').catch(() => ({ meets: [] })), liveData(), loadDayOff(LY_PLACE)]);
    a.live = live;
    try {
      const r = await fetch(`https://v2.ly.govapi.tw/meets?${new URLSearchParams({ 日期: twNow().day, limit: '50' })}`, { signal: AbortSignal.timeout(8000) });
      const fresh = r.ok ? ((await r.json()).meets || []).map(compactMeet) : [];
      const ids = new Set(fresh.map(m => m.id));
      a.meets = [...a.meets.filter(m => !ids.has(m.id)), ...fresh];
    } catch {}
    if (!a.meets.length) throw new Error('no agenda');
    return a;
  })().catch(e => ((lyAgenda = null), Promise.reject(e))));
const ROOM_SHORT = { 立法院會議: ['院會', 'Floor'], 黨團協商: ['黨團協商', 'Caucus talks'], 內政委員會: ['內政', 'Interior'], 外交及國防委員會: ['外交國防', 'Foreign & Defence'], 經濟委員會: ['經濟', 'Economy'], 財政委員會: ['財政', 'Finance'], 教育及文化委員會: ['教育文化', 'Education'], 交通委員會: ['交通', 'Transport'], 司法及法制委員會: ['司法法制', 'Judiciary'], 社會福利及衛生環境委員會: ['社福衛環', 'Welfare & Health'], 程序委員會: ['程序', 'Procedure'], 修憲委員會: ['修憲', 'Constitution'], 經費稽核委員會: ['經費稽核', 'Audit'], 紀律委員會: ['紀律', 'Discipline'] };
const roomShort = m => (ROOM_SHORT[m.room] || [m.room || m.kind, m.room || m.kind])[en ? 1 : 0];
const KIND = { 院會: ['院會', 'Floor', 'indigo'], 委員會: ['委員會', 'Committee', 'green'], 聯席會議: ['聯席會議', 'Joint', 'green'], 公聽會: ['公聽會', 'Hearing', 'orange'], 黨團協商: ['協商', 'Talks', 'red'], 考察: ['考察', 'Visit', ''] };
const kindLabel = k => (KIND[k] || [k, k])[en ? 1 : 0];
const kindTag = k => countTag(kindLabel(k), (KIND[k] || [])[2] || '');
const hm = t => String(t || '').replace(/^0/, '');
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const meetDay = d => {
  const { day } = twNow();
  const t = new Date(`${d}T12:00:00+08:00`);
  const rel = d === day ? W('今天', 'Today') : d === twNow(new Date(Date.now() + 864e5)).day ? W('明天', 'Tomorrow') : '';
  return rel || (en ? `${WEEKDAY_EN[t.getUTCDay()]} ${shortDay(d)}` : `${shortDay(d)}（${WEEKDAY[t.getUTCDay()]}）`);
};
// What a meeting is about, in a line: its 事由's first item, numbering and 繼續 off.
// A meeting's business in two short lines: its first item, the filler words
// (行政院函送, 擬具) out, cut at a clause so a narrow screen never clamps it.
const meetWhat = m => {
  let t = String(m.why || m.title).split(/\n|。(?=[二三四五六七八九十]+、)/)[0].replace(/^[一二三四五六七八九十]+、/, '').replace(/行政院函(送|請)?|(本院)?委員[^，、]{2,12}?等\d+人擬具|擬具|請審議案|請同意案|[。]$/g, '');
  // A briefing or a hearing: its title in 「」 says it best.
  const quoted = t.length > 26 && t.match(/[「《]([^」》]{4,})[」》]/);
  if (quoted) t = `${/^邀請/.test(t) ? W('專題報告：', 'Briefing: ') : ''}${quoted[1].replace(/[《》]/g, '')}`;
  if (t.length > 26) {
    const cut = Math.max(...['，', '、', '；', '：', '—'].map(c => t.lastIndexOf(c, 26)));
    t = cut > 8 ? t.slice(0, cut) : `${t.slice(0, 25)}…`;
  }
  return t.replace(/^(繼續)?審查(審議)?/, W('審查', 'Review: '));
};
// The bill items a meeting takes up: by 立法院 law id, or a law named in its 事由.
const meetItems = m => {
  const laws = new Set(m.bills.flatMap(b => b.laws));
  return state.items.filter(it => !it.dropped && it.term && (laws.has(it.law) || m.why.includes(`「${it.n}`))).sort((a, b) => (a.u < b.u ? 1 : -1));
};

// A sitting's state, IVOD's word first when it has one for today: live only while it streams ('sched': in its hours, not streaming;
// 'off': a typhoon day off in 臺北市, where 立法院 sits, or IVOD saying it's called off).
const LY_PLACE = { county: '臺北市' };
const lyDayOff = d => dayOffOn(d, LY_PLACE, 'work');
const liveState = (x, live) => meetState(x, live ? liveOf(live, x.m, x) : null, new Date(), Boolean(live?.fresh), lyDayOff(x.d));
// Why a sitting is off, in a tag: 颱風停會 on a day off, else IVOD's own word.
const offTag = (x, live) => {
  const t = String((live && liveOf(live, x.m, x)?.status) || '');
  return lyDayOff(x.d) && !/取消|延期|改期/.test(t) ? W('颱風停會', 'Typhoon: no sitting') : /延期|改期/.test(t) ? W('延期', 'Postponed') : W('取消', 'Called off');
};
const meetRow = (x, live = null) => {
  const st = liveState(x, live);
  const items = meetItems(x.m).length;
  return `<a class="lw-meet${st === 'live' ? ' live' : st === 'done' ? ' done' : st === 'off' ? ' off' : ''}" href="#meet=${esc(encodeURIComponent(x.m.id))}&amp;d=${esc(x.d)}"><span class="lw-meet-time"><b>${esc(hm(x.from) || '–')}</b><small>${esc(hm(x.to))}</small></span><span class="lw-meet-text"><span class="lw-meet-top"><b class="q-fit">${esc(roomShort(x.m))}</b>${roomShort(x.m) !== kindLabel(x.m.kind) && !['live', 'break', 'done', 'off'].includes(st) ? kindTag(x.m.kind) : ''}${st === 'live' ? `<span class="lw-live">${W('直播中', 'Live')}</span>` : st === 'break' ? countTag(W('休息中', 'On a break'), 'orange') : st === 'done' ? countTag(W('已散會', 'Risen'), '') : st === 'off' ? countTag(offTag(x, live), 'red') : ''}</span><span class="lw-meet-what">${esc(meetWhat(x.m))}</span>${items ? `<small>${esc(W(`${items} 個法案`, `${items} bill${items === 1 ? '' : 's'}`))}</small>` : ''}</span></a>`;
};

// 議程: a day's sittings at a time on the family's strip of days (the days
// with any, 📅 among them; a swipe across the page for the next), today's
// on now first. Searched: every day's that match, each under its day.
let agendaDay = null;
let agendaDays = [];
const agendaRec = {};
async function agendaList(out) {
  if (!out.querySelector('.lw-meets')) out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(3)}</div>`;
  let a;
  try {
    a = await agendaData();
  } catch {
    return void (out.innerHTML = emptyNote(W('議程讀不到，請稍後再試', 'Couldn’t load the agenda')));
  }
  if (billFilter !== 'agenda') return;
  const { day } = twNow();
  const words = billQuery ? expand(billQuery) : [];
  const all = sittings(a.meets).filter(x => x.d >= day && (!words.length || words.some(w => `${x.m.room}${x.m.title}${x.m.why}`.includes(w))));
  const live = all.filter(x => ['live', 'break'].includes(liveState(x, a.live)));
  const row = x => meetRow(x, a.live);
  const days = [...new Set(all.map(x => x.d))].sort();
  const none = emptyNote(W(words.length ? '議程裡沒有符合的會議' : '接下來還沒有排會議', words.length ? 'Nothing on the agenda matches' : 'No meetings scheduled yet'));
  agendaDays = words.length ? [] : days;
  if (words.length || !days.length) {
    const html = days.map(d => section(meetDay(d), `<div class="lw-meets">${all.filter(x => x.d === d).map(row).join('')}</div>`)).join('');
    return void (out.innerHTML = html || none);
  }
  if (!days.includes(agendaDay)) agendaDay = days[0];
  const rest = all.filter(x => x.d === agendaDay && !live.includes(x));
  const now = agendaDay === day && live.length;
  out.innerHTML = now ? section(W('現在開會中', 'Meeting now'), `<div class="lw-meets">${live.map(row).join('')}</div>`) + (rest.length ? section(W('稍後', 'Later'), `<div class="lw-meets">${rest.map(row).join('')}</div>`) : '') : `<div class="lw-meets">${rest.map(row).join('')}</div>`;
  out.prepend(dayBar(agendaRec, { days, current: agendaDay, today: day, follow: true, onPick: pickAgendaDay }));
}
function pickAgendaDay(d) {
  agendaDay = d;
  const out = $('bill-list');
  if (out && billFilter === 'agenda') agendaList(out);
}

// One meeting: today's live video (國會頻道), what's on it with each bill's
// progress, the 發言名單 with parties, who has spoken so far (IVOD clips).
async function openMeet(id, d = '') {
  let a;
  try {
    a = await agendaData();
  } catch {
    return toast(W('議程讀不到，請稍後再試', 'Couldn’t load the agenda'));
  }
  const m = a.meets.find(x => x.id === id);
  if (!m) return toast(W('這場會議不在議程上了', 'This meeting is no longer on the agenda'));
  const x = m.days.find(y => y.d === d) || m.days.find(y => y.d >= twNow().day) || m.days.at(-1);
  const sx = { ...x, m };
  const st = liveState(sx, a.live);
  const body = [];
  // Today's video: the channel IVOD itself streams this meeting on (never a guess by room).
  const r = a.live && st === 'live' ? liveOf(a.live, m, sx) : null;
  const IVOD_LIVE = 'https://ivod.ly.gov.tw/Live';
  // When it rose, in IVOD's word (散會(12:27)).
  const rose = st === 'done' && a.live ? (String(liveOf(a.live, m, sx)?.status || '').match(/散會\((\d{1,2}:\d{2})\)/) || [])[1] || '' : '';
  if (r?.ch && st === 'live') {
    const v = h('video', { class: 'lw-video', controls: '', playsinline: '', autoplay: '', muted: '' });
    v.muted = true;
    body.push(v, h('p', { class: 'lw-hint-sm', text: W('立法院 IVOD 直播（這場會議的頻道）。點影片開聲音。', 'Live on the Legislative Yuan’s IVOD, this meeting’s own channel. Tap for sound.') }));
    playHls(v, liveHls(r.ch)).catch(() => v.replaceWith(h('a', { class: 'q-btn block', href: IVOD_LIVE, target: '_blank', rel: 'noopener', text: W('到立法院 IVOD 看直播', 'Watch on the Legislative Yuan’s IVOD') })));
  } else if (['live', 'sched', 'break', 'later', 'done', 'off'].includes(st)) {
    const why = st === 'off' ? (lyDayOff(x.d) && offTag(sx, a.live) === W('颱風停會', 'Typhoon: no sitting') ? W('颱風停止上班，立法院這天停會，沒有直播。', 'Typhoon day off in Taipei: no sitting, so no live video.') : W(`這場會議${offTag(sx, a.live)}了，沒有直播。`, `${offTag(sx, a.live)}: no live video.`)) : st === 'sched' ? W('IVOD 現在沒有播這場', 'IVOD isn’t streaming it now') : st === 'later' ? W(`${hm(x.from)} 開始，開會後這裡就能看直播。`, `Starts ${hm(x.from)}; the live video shows here once it begins.`) : st === 'break' ? W('休息中，回來開會後這裡會接著播。', 'On a break; the video resumes here.') : st === 'done' ? W(`${rose ? `${rose} ` : ''}散會 · 影片稍後上 IVOD`, `${rose ? `Rose ${rose}` : 'Over'} · video on IVOD later`) : W('立法院還沒說這場在哪個頻道播，可先到 IVOD 看。', 'The Legislative Yuan hasn’t listed this meeting’s channel yet; try IVOD.');
    body.push(h('div', { class: 'lw-video-wait', html: `<p>${esc(why)}</p>${st === 'live' || st === 'sched' ? `<a class="q-btn block" href="${IVOD_LIVE}" target="_blank" rel="noopener">${W('到立法院 IVOD 看直播', 'Watch on the Legislative Yuan’s IVOD')}</a>` : ''}` }));
  }
  body.push(h('div', { class: 'lw-meet-head', html: `<div class="lw-meta">${kindTag(m.kind)}${st === 'live' ? `<span class="lw-live">${W('直播中', 'Live')}</span>` : ''}</div><h2>${esc(m.title)}</h2><p>${esc([meetDay(x.d), x.from && `${hm(x.from)}–${hm(x.to)}`, x.place].filter(Boolean).join(' · '))}</p>` }));
  const items = meetItems(m);
  if (items.length) body.push(h('div', { class: 'lw-person-sec', html: `<h4>${W(`議程上的法案（${items.length}）`, `Bills on it (${items.length})`)}</h4>${grid(items.slice(0, 12).map(it => billCard(it, { topic: itemTopic(it), en, wide: true, on: x.d })))}` }));
  const names = m.speakers?.[x.d] || [];
  const who = h('div', { class: 'lw-person-sec' });
  if (names.length)
    peopleData().then(ppl => {
      const by = new Map(ppl.people.map(p => [p.n, p]));
      who.innerHTML = `<h4>${W(`發言登記（${names.length}）`, `Speakers signed up (${names.length})`)}</h4><div class="lw-names">${names.map(n => { const p = by.get(n); return p ? `<a class="lw-name" href="#who=${esc(p.id)}" style="--p:${partyColor(p.party)}">${esc(n)}</a>` : `<span class="lw-name">${esc(n)}</span>`; }).join('')}</div>`;
    }).catch(() => {});
  body.push(who);
  // Who has spoken: 立法院's clips of the day for this meeting, newest first (they appear as each speech ends).
  const spoke = h('div', { class: 'lw-person-sec' });
  body.push(spoke);
  if (!['ahead', 'later', 'off'].includes(st))
    fetch(`https://v2.ly.govapi.tw/ivods?${new URLSearchParams({ 日期: x.d, 影片種類: 'Clip', limit: '300' })}`, { signal: AbortSignal.timeout(8000) })
      .then(r => (r.ok ? r.json() : { ivods: [] }))
      .then(async r => {
        const mine = (r.ivods || []).filter(v => String(v['會議名稱'] || '').includes(m.title.replace(/^立法院/, '')) || (m.room !== '立法院會議' && String(v['會議名稱'] || '').includes(m.room))).sort((p, q) => (p['開始時間'] < q['開始時間'] ? 1 : -1));
        if (!mine.length) return;
        const ppl = await peopleData().catch(() => ({ people: [] }));
        const by = new Map(ppl.people.map(p => [p.n, p]));
        spoke.innerHTML = `<h4>${W(`已發言（${mine.length}）`, `Spoken so far (${mine.length})`)}</h4><div class="lw-clips">${mine.slice(0, 40).map(v => { const p = by.get(v['委員名稱']); return `<div class="lw-clip"><a class="lw-clip-main" href="${esc(v.IVOD_URL || ivodUrl(v.IVOD_ID))}" target="_blank" rel="noopener"><span class="lw-clip-play">${ICON_PLAY}</span><span class="lw-row-text"><span class="lw-row-name">${esc(v['委員名稱'] || '')}${p ? ` <span class="lw-party" style="--p:${partyColor(p.party)}">${esc(partyShort(p.party))}</span>` : ''}</span><small>${esc([hm(String(v['開始時間'] || '').slice(11, 16)), v['影片長度'] ? `${Math.max(1, Math.round(v['影片長度'] / 60))} ${W('分鐘', 'min')}` : ''].filter(Boolean).join(' · '))}</small></span></a>${p ? `<a class="lw-clip-yt" href="#who=${esc(p.id)}" aria-label="${W('立委', 'Legislator')}">${DOOR_ICON.people}</a>` : ''}</div>`; }).join('')}</div>`;
      })
      .catch(() => {});
  if (m.why) body.push(h('details', { class: 'lw-fold' }, [h('summary', { text: W('會議事由', 'What’s on it, as listed') }), h('div', { class: 'lw-meet-why', html: proseHtml(m.why, state.names) })]));
  const links = [x.ppg && `<a class="q-btn block" href="${esc(x.ppg)}" target="_blank" rel="noopener">${W('立法院議事網', 'Legislative Yuan page')}</a>`, ...(['ahead', 'later', 'off'].includes(st) ? [] : m.videos).slice(0, 2).map((v, i) => `<a class="q-btn block" href="${esc(v)}" target="_blank" rel="noopener">${W(`會議影片 ${m.videos.length > 1 ? i + 1 : ''}（IVOD）`, `Meeting video ${m.videos.length > 1 ? i + 1 : ''} (IVOD)`)}</a>`)].filter(Boolean).join('');
  if (links) body.push(h('div', { class: 'lw-meet-links', html: links }));
  sheet({ title: roomShort(m), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body, onClose: () => location.hash.startsWith('#meet=') && history.replaceState(null, '', '#tab=bills&f=agenda') });
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
    $('panel-home').innerHTML = emptyNote(W('法規資料讀不到', 'The laws couldn’t be loaded'), W('請連上網路再打開一次。', 'Connect and open again.'), '');
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
  noticesReady = data('bills/notices.json')
    .then(n => {
      state.notices = n.notices || [];
      for (const x of state.notices) for (const p of x.laws) state.noticesByLaw.set(p, [...(state.noticesByLaw.get(p) || []), x]);
      if (state.tab === 'bills') drawBillList();
    })
    .catch(() => {});
  delegReady = Promise.all([data('deleg.json').then(r => (state.regLaws = r || {})).catch(() => {}), data('agency/counts.json').then(r => (state.agencyLaws = r || {})).catch(() => {})]);
  rulingsReady = Promise.all([
    data('rulings/laws.json').then(r => (state.rulingLaws = r)).catch(() => {}),
    data('rulings/low/laws.json').then(r => (state.lowLaws = r || {})).catch(() => {}),
    data('rulings/low/courts.json').then(r => (state.lowNames = r || {})).catch(() => {})
  ]).then(() => state.tab === 'laws' && !state.law && drawResults());
  const latestReady = Promise.all([
    data('rulings/latest.json').then(r => (state.latestRulings = r.rulings || [])).catch(() => {}),
    consData().then(c => (state.consTop = c.items.filter(r => r[0].startsWith('j')).slice(0, 2))).catch(() => {})
  ]).then(() => state.tab === 'home' && drawHome());
  // The followed legislators' news, for the badge.
  if (Object.keys(state.mine.people || {}).length && state.tab !== 'mine') trackedFeeds(state.mine).catch(() => {});
  const changesReady = data('changes.json')
    .then(c => {
      state.changes = c;
      redraw();
      badge();
    })
    .catch(() => {});
  await route();
  // The loading screen lifts on a finished screen: home's and 立法's cards
  // drawn (kept files come at once; a slow first open waits 4 s at most).
  const firstNeeds = { home: [itemsReady, changesReady, latestReady], rulings: [latestReady, itemsReady], bills: [itemsReady], mine: [itemsReady, changesReady] }[state.tab] || [];
  await Promise.race([Promise.all(firstNeeds), new Promise(r => setTimeout(r, 4000))]);
  $('loading')?.setAttribute('hidden', '');
}

// What's followed on the Pass: the kit's sync.
async function signIn() {
  pass = passSync(q, {
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
  const m = state.mine;
  await pass.first(first, { local: Boolean(Object.keys(m.laws).length || Object.keys(m.items).length || m.marks.length || m.recent.length) });
  pass.watch();
  pass.sync();
}

// An update found later (back from the background) reloads the page: the
// loading screen covers it meanwhile, so nothing is tapped on the old one.
addEventListener('beforeunload', () => $('loading')?.removeAttribute('hidden'));
if (!gated) {
  start();
  signIn();
}
keepOffline();
watchUpdates({ current: BUILD, key: 'orbitLaw', cachePrefix: 'orbit-law-' });
