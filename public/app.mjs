// Orbit Law: Taiwan's laws to read, with every reference a link, the bills
// in 立法院 that will change them, and 問法律, questions answered from the
// articles themselves. Behind Quadra Pass like every Quadra/Orbit app (on a
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

import { quadraSession, installGate, topActions, tabBar, watchUpdates, keepOffline, haptic, updateChecked } from '#kit/quadra.mjs';
import { h, sheet, search, toast, wireNavTitles } from '#kit/ui.mjs';
import { passSync } from '#kit/pass-sync.mjs';
import { W, en } from '#kit/lang.mjs';
import { nameMap, parentLaw, abbr, SHORT_NAMES as SHORT } from './lib/refs.mjs';
import { searchLaws, parseJump, ymd, relatedLaws } from './lib/search.mjs';
import { expand, rankArticles, snippet, QUICK } from './lib/find.mjs';
import { lawHtml, articleHtml, articlesBetween, contents, timeline, esc, artLabel, freshMarks, plainHtml } from './lib/view.mjs';
import { PASSED, PROMULGATED, whyOf, openRound } from './lib/bills.mjs';
import { compactMeet, sittings, sittingState, nextSitting, twNow, liveOf, liveHls } from './lib/agenda.mjs';
import { loadMine, saveMine, toggleFollow, markSeen, addRecent, toggleMark, isMarked, lawsChanged, newCount, today, encodeMine, decodeMine, mergeMine } from './lib/store.mjs';
import { askLaw, askBill, askDiff, askError, passFetch, MAX_Q } from './lib/ask.mjs';
import { searchText, groupHits } from './lib/fulltext.mjs';
import { COURTS, courtOf, rulingUrl, caseKind, caseNo, caseQuery, caseMatch } from './lib/rulings.mjs';
import { isCons, consLabel, consOrder, consOfJid, citedBy, interpPage, JUDGMENTS_PAGE } from './lib/cons.mjs';
import { noticeUrl, isOpen } from './lib/notices.mjs';
import { linkTrail } from './lib/stack.mjs';
import { TOPICS, topicOf, partyOf } from './lib/topics.mjs';
import { personVotes, gazetteUrl, ivodUrl, personFeed, feedNew } from './lib/ly.mjs';
import { money, change } from './lib/budget.mjs';
import { topicTile, topicName, progress, stageShort, partyChips, shortDay, billCard, lawRow, fit, funnel, billFunnel, diffHtml, stepOf, STEPS, whereNow, articleChips, roundSteps, STEP_HELP } from './lib/cards.mjs';
import { readable, pageUrl, readPage, hasText } from './lib/reader.mjs';
import { textFile } from './lib/agency.mjs';
import { readJudgment, outcome, partiesLine } from './lib/judgment.mjs';
import { chatLaw, chatError, STARTERS, MAX_CHAT_Q, mineOf } from './lib/chat.mjs';
import { loadChats, saveChats, putChat, renameChat, dropChat, newChatId } from './lib/chats.mjs';

const $ = id => document.getElementById(id);
const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
document.documentElement.lang = en ? 'en' : 'zh-Hant';

// ---- Quadra Pass: the Home Screen gate, the sign-in, the account button -----------------

const q = quadraSession('law', { lang: en ? 'en' : 'zh' });
// boot.js's first look at version.json, waited for under the loading screen:
// a newer deploy is loaded before anything shows (boot.js reloads only while
// the app hasn't said it started), never shown and then swapped.
const booted = updateChecked().then(ok => {
  if (ok) window.__fxStarted = true;
  return ok;
});
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

const state = { consTop: [], lawCons: {}, rulingLaws: {}, lawRulings: {}, regLaws: {}, agencyLaws: {}, agency: { to: {}, rest: [] }, deleg: { to: {}, rest: [], from: [] }, latestRulings: [], tab: 'home', rows: [], byCode: new Map(), names: new Map(), items: [], itemsByLaw: new Map(), notices: [], noticesByLaw: new Map(), changes: { items: [] }, mine: loadMine(), law: null, showEn: false, query: '', topic: '' };
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

const TABS = ['home', 'laws', 'rulings', 'bills', 'mine', 'ask'];
const tabs = tabBar({
  tabs: [
    { id: 'home', label: W('首頁', 'Home'), icon: 'home' },
    { id: 'laws', label: W('法規', 'Laws'), icon: 'book' },
    { id: 'rulings', label: W('裁判', 'Rulings'), icon: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7 3 12a2.5 2.5 0 0 0 4 0zM19 7l-2 5a2.5 2.5 0 0 0 4 0z"/>' },
    { id: 'bills', label: W('立法', 'Bills'), icon: 'live' },
    { id: 'mine', label: W('我的', 'Mine'), icon: 'star' }
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
  // 問法律 opens from 首頁 (its card and the searches), so 首頁 stays lit.
  tabs.select(id === 'ask' ? 'home' : id);
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
  document.querySelector('dialog[open]')?.close();
  const tab = p.get('tab');
  if (p.get('law')) {
    showTab('laws');
    await openLaw(p.get('law'), p.get('a'), p.get('find'));
  } else if (tab === 'bills' || p.get('item') || p.get('who') || p.get('meet')) {
    showTab('bills');
    drawBills();
    await itemsReady;
    if (p.get('item')) openItem(p.get('item').replace('-', ':'));
    if (p.get('who')) openPerson(p.get('who'));
    if (p.get('budget')) openBudget(p.get('budget'));
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
  const [, , level, , m, gone] = row;
  // The tile shows the topic, so a law's MOJ category is left out.
  const what = level === '命令' ? W('命令', 'Regulation') : '';
  return [what, m && `${W('修正', 'Rev.')} ${shortDay(m)}`, gone && W('已廢止', 'Repealed')].filter(Boolean).join(' · ');
}
// A law's row; the judgments citing it as a tag when nothing else is on the right.
// In English the row is named in English (where the MOJ has it).
const lawItem = (row, sub, extra = '', href) => lawRow(en ? [row[0], nameOf(row[0], row[1])] : row, { topic: rowTopic(row), sub: sub ?? lawSub(row), extra: extra || (state.rulingLaws[row[0]] ? `<span class="lw-tag court">${ICON_GAVEL}${state.rulingLaws[row[0]]}</span>` : ''), href });
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
const ICON_SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 3.8 2.2 6.4 6.6 7.4-4.4 1-6.1 3.6-6.6 7.4-.5-3.8-2.2-6.4-6.6-7.4 4.4-1 6.1-3.6 6.6-7.4zM19 15c.3 1.9 1.1 3 3 3.5-1.9.5-2.7 1.6-3 3.5-.3-1.9-1.1-3-3-3.5 1.9-.5 2.7-1.6 3-3.5z"/></svg>';

// ---- 首頁 ---------------------------------------------------------------------------------

const LIVE = it => !it.dropped && !it.held && it.open && it.stage >= 1 && it.stage < PASSED;

function drawHome() {
  const panel = $('panel-home');
  const starters = STARTERS.map(([zh, e]) => `<a class="lw-starter" href="#tab=ask&amp;q=${encodeURIComponent(W(zh, e))}">${esc(W(zh, e))}</a>`).join('');
  const hero = `<a class="lw-hero" href="#tab=ask"><span class="lw-hero-top">${ICON_SPARK}<span>${W('問法律', 'Ask the law')}</span></span><strong>${W('遇到法律問題？用白話問', 'A legal question? Ask in plain words')}</strong><span class="lw-hero-box"><span>${W('輸入你遇到的事', 'Type what happened')}</span><i>${ICON_SEND}</i></span></a><div class="lw-starters rail">${starters}</div>`;

  // 立法院: the latest day anything moved, and the bills that moved last.
  const items = state.items.filter(it => !it.dropped && it.u);
  const moved = [...items].sort((a, b) => (a.u < b.u ? 1 : a.u > b.u ? -1 : b.stage - a.stage)).slice(0, 10);
  const bills = state.items.length ? rail(moved.map(it => billCard(it, { topic: itemTopic(it), en }))) : `<div class="lw-rail">${'<span class="lw-bill q-skel"></span>'.repeat(3)}</div>`;
  // Laws just amended or new (not regulations), and what you opened last.
  const amended = state.changes.items.filter(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令').slice(0, 4);
  const recent = state.mine.recent.map(p => state.byCode.get(p)).filter(Boolean).slice(0, 8);
  const picks = recommend(recent);

  // One search, the ask card, then calm shelves of what's new.
  panel.innerHTML =
    pageHead('') +
    `<a class="lw-find-pill" href="#tab=laws&amp;q=">${ICON_SEARCH}<span>${W('找法規、判決、法案或生活問題', 'Search laws, rulings, bills')}</span></a>` +
    hero +
    section(W('繼續閱讀', 'Continue reading'), covers(recent), { more: W('我的', 'Mine'), moreHref: '#tab=mine' }) +
    // A first visit starts from everyday life; a returning one from what they read.
    (recent.length ? '' : section(W('依生活情境找', 'By life situation'), state.rows.length ? topicGrid() : '')) +
    `<div id="home-live"></div>` +
    section(W('立法院這週', 'In 立法院 this week'), bills, { more: W('全部', 'All'), moreHref: '#tab=bills' }) +
    section(W('剛修正的法律', 'Just amended'), list(amended.map(c => lawItem(state.byCode.get(c.p), changeText(c, true), freshTag(c)))), { more: W('更多', 'More'), moreHref: '#tab=laws' }) +
    section(W('為你推薦', 'For you'), covers(picks)) +
    // 裁判: 憲法法庭's two newest, then the top courts' newest.
    section(W('最新裁判', 'Latest rulings'), rail([...state.consTop, ...state.latestRulings.slice(0, 6)].map(rulingCard)), { more: W('裁判', 'Rulings'), moreHref: '#tab=rulings' }) +
    `<div id="home-news"></div>` +
    (recent.length ? section(W('依生活情境找', 'By life situation'), state.rows.length ? topicGrid() : '') : '');
  // 立法院 meeting now: its rooms, each opening the live video.
  agendaData()
    .then(a => {
      const live = sittings(a.meets).filter(x => ['live', 'break'].includes(liveState(x, a.live)));
      const el = $('home-live');
      if (el && live.length) el.outerHTML = section(W('立法院開會中', 'In session now'), `<div class="lw-meets">${live.map(x => meetRow(x, a.live)).join('')}</div>`, { more: W('議程', 'Agenda'), moreHref: '#tab=bills&f=agenda' });
    })
    .catch(() => {});
  // 政府公告: the ministries' latest notices (they open in the reader).
  newsData()
    .then(d => {
      const el = $('home-news');
      const rows = (d.news || []).slice(0, 4);
      if (el && rows.length) el.outerHTML = section(W('政府公告', 'Government notices'), `<div class="lw-list">${rows.map(([day, gov, t, url]) => `<a class="lw-row" href="${esc(url)}">${topicTile('gov', 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(t)}</span><small>${esc(`${gov} · ${shortDay(day)}`)}</small></span></a>`).join('')}</div>`);
    })
    .catch(() => {});
}
// Laws as book covers (Books' shelves): the topic's colour, its mark, the name.
const covers = rows => (rows.length ? `<div class="lw-covers">${rows.map(r => `<a class="lw-cover" href="#law=${esc(r[0])}" style="--t:${TOPICS[rowTopic(r)].color}"><span class="lw-cover-art">${svgTopic(rowTopic(r))}<b class="q-fit-wrap">${esc(en ? nameOf(r[0], r[1]) : shortName(r[1]))}</b></span><small>${esc(topicName(rowTopic(r), en))}</small></a>`).join('')}</div>` : '');
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

function drawLaws() {
  const panel = $('panel-laws');
  const chips = h('div', { class: 'q-chips lw-chips' }, [
    h('button', { type: 'button', class: 'q-chip', 'aria-pressed': String(!state.topic), text: W('全部', 'All'), onclick: () => go('tab=laws', { replace: true }) }),
    ...Object.keys(TOPICS).map(id => h('button', { type: 'button', class: 'q-chip lw-tchip', style: `--t:${TOPICS[id].color}`, 'aria-pressed': String(state.topic === id), html: `<i></i>${esc(topicName(id, en))}`, onclick: () => go(`tab=laws&topic=${id}`, { replace: true }) }))
  ]);
  // A topic or a quick question came from a tap: a way back (a Home Screen app has no back gesture).
  const back = state.topic || (state.linkedQuery && state.query) ? h('button', { class: 'lw-back lw-back-row', type: 'button', 'aria-label': W('返回', 'Back'), html: ICON.back, onclick: () => (history.length > 1 ? history.back() : go('tab=laws')) }) : null;
  panel.replaceChildren(...[back, headNode(state.topic ? topicName(state.topic, en) : W('法規', 'Laws')), box, state.topic ? chips : null, h('div', { id: 'results' })].filter(Boolean));
  wireTitles(panel);
  box.hidden = false;
  drawResults();
  const on = chips.querySelector('[aria-pressed="true"]');
  if (on && state.topic) chips.scrollLeft = on.offsetLeft - 16;
}

function drawResults() {
  const out = $('results');
  if (!out) return;
  const q = state.query.trim();
  if (q) return void findAll(q, out);
  const quick = `<div class="lw-quick q-balance">${(QUICK[state.topic || ''] || []).map(w => `<button type="button" class="lw-quick-q" data-q="${esc(w)}">${ICON_SEARCH}${esc(w)}</button>`).join('')}</div>`;
  if (state.topic) {
    const laws = state.rows.filter(r => r[2] !== '命令' && !r[5] && rowTopic(r) === state.topic).sort((a, b) => (a[4] < b[4] ? 1 : -1));
    const regs = state.rows.filter(r => r[2] === '命令' && rowTopic(r) === state.topic).length;
    out.innerHTML = quick + section(W(`法律 ${laws.length}`, `Laws ${laws.length}`), list(laws.slice(0, 300).map(r => lawItem(r)))) + (regs ? `<p class="lw-none">${W(`另有 ${regs} 個子法（辦法、規則），在各法律裡的「子法」看得到`, `Plus ${regs} regulations, listed under each law’s 子法`)}</p>` : '');
    return;
  }
  const amended = state.changes.items.filter(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令').slice(0, 8);
  out.innerHTML =
    quick +
    section(W('依生活情境找', 'By life situation'), topicGrid()) +
    section(W('常用', 'Common'), list(COMMON.map(n => state.rows.find(r => r[1] === n)).filter(Boolean).map(r => lawItem(r)))) +
    section(W('最近修法', 'Just amended'), list(amended.map(c => lawItem(state.byCode.get(c.p), changeText(c, true), freshTag(c)))));
}

// 找法: one search, answered in the order people need it. The articles that
// say it (with the words marked and the 子法 they call for), then laws and
// 子法 by name, then bills in 立法院, then 問法律. Everyday words also try
// the law books' words (學生會 → 學生自治組織).
let findRun = 0;
async function findAll(q, out) {
  const run = ++findRun;
  const terms = expand(q);
  // (釋字 748 is a ruling, not 第748條 of a law named after it.)
  const jumpTo = consJump(q) ? null : parseJump(state.rows, q);
  const named = [];
  for (const t of terms) for (const r of searchLaws(state.rows, t, 30)) if (!named.includes(r)) named.push(r);
  const keep = r => !state.topic || rowTopic(r) === state.topic;
  // By name: whole-word matches only (a scattered-letter match is noise next to real hits).
  const close = named.filter(r => keep(r) && terms.some(t => r[1].includes(t) || r[1] === SHORT[t]));
  const laws = close.filter(r => r[2] !== '命令').slice(0, 6);
  const regs = close.filter(r => r[2] === '命令').slice(0, 6);
  // Bills by their law's name, then by what they're for (their purpose line).
  const bills = [...state.items.filter(it => terms.some(t => it.n?.includes(t))), ...state.items.filter(it => !terms.some(t => it.n?.includes(t)) && terms.some(t => it.about?.includes(t)))].filter(it => !it.dropped).slice(0, 5);
  const jumpRow = jumpTo && lawRow([jumpTo.row[0], `${jumpTo.row[1]} ${artLabel(jumpTo.key, en)}`], { topic: rowTopic(jumpTo.row), sub: W('直接打開這一條', 'Open this article'), href: `#law=${jumpTo.row[0]}&a=${jumpTo.key}` });
  const ask = `<a class="lw-find-ask" href="#tab=ask&amp;q=${encodeURIComponent(q)}">${MENU_ICON.ask || ''}<span><b>${W(`用白話問「${esc(q)}」`, `Ask about “${esc(q)}”`)}</b><small>${W('問法律會引用條文回答', 'Answered from the articles, cited')}</small></span></a>`;
  const nameBlocks = () =>
    (laws.length ? section(W('法律', 'Laws'), list(laws.map(r => lawItem(r)))) : '') +
    (regs.length ? section(W('子法（辦法、規則）', 'Regulations'), list(regs.map(r => lawItem(r, parentName(r))))) : '') +
    (bills.length ? section(W('立法院審議中', 'In 立法院'), `<div class="lw-list">${bills.map(it => `<a class="lw-row" href="#item=${esc(it.k.replace(':', '-'))}">${topicTile(topicFor(it.p, it.n), 'sm')}<span class="lw-row-text"><span class="lw-row-name${fit(it.n)}">${esc(it.n)}</span><small>${esc([stageShort(it, en), it.about].filter(Boolean).join(' · '))}</small></span></a>`).join('')}</div>`) : '') +
    `<div id="find-rulings"></div><div id="find-people"></div>`;
  out.innerHTML = (jumpRow ? section(W('直接打開', 'Go to'), list([jumpRow])) : '') + `<div id="find-arts">${[...q].length >= 2 && !jumpTo ? section(W('條文怎麼說', 'What the articles say'), `<div class="lw-find-cards">${'<span class="lw-find-card q-skel"></span>'.repeat(2)}</div>`) : ''}</div>` + nameBlocks() + ask;
  // 裁判 by number or words: the few best, the rest in 裁判.
  if ([...q].length >= 2 || consJump(q))
    consData()
      .then(cons => rulingSearchHtml(q, cons, { max: 3, quiet: true }))
      .then(html => {
        const el = $('find-rulings');
        if (run === findRun && el && html) el.innerHTML = `<div class="lw-find-rulings">${html}</div><a class="lw-more-link" href="#tab=rulings&amp;q=${encodeURIComponent(q)}">${W(`在裁判找「${esc(q)}」`, `Search rulings for “${esc(q)}”`)}</a>`;
      })
      .catch(() => {});
  // 立委 by name or 選區: straight to their page.
  if ([...q].length >= 2)
    peopleData()
      .then(ppl => {
        const hit = ppl.people.filter(x => !x.to && (x.n.includes(q) || x.area.includes(q))).slice(0, 4);
        const el = $('find-people');
        if (run === findRun && el && hit.length) el.outerHTML = section(W('立委', 'Legislators'), `<div class="lw-people">${hit.map(x => `<a class="lw-person" href="#who=${esc(x.id)}" style="--p:${partyColor(x.party)}">${personPhoto(x)}<span class="lw-person-text"><b>${esc(x.n)}</b><small>${esc(`${partyShort(x.party)} · ${shortArea(x.area)}`)}</small></span></a>`).join('')}</div>`);
      })
      .catch(() => {});
  if ([...q].length < 2 || jumpTo) return;
  // The articles: each term's hits, best laws first, then each one's best articles.
  let groups = [];
  try {
    const seen = new Map();
    for (const t of terms) for (const g of groupHits(await searchText(t, n => data(`text/${n}.json`)), 30)) seen.set(g.law, [...new Set([...(seen.get(g.law) || []), ...g.arts])]);
    groups = [...seen].map(([law, arts]) => ({ law, arts, row: state.rows[law] })).filter(g => g.row && keep(g.row));
    // Laws before 子法, everyday laws first, then most hits.
    const common = r => !COMMON.includes(r[1]);
    groups.sort((a, b) => (a.row[2] === '命令') - (b.row[2] === '命令') || common(a.row) - common(b.row) || b.arts.length - a.arts.length);
  } catch {}
  if (run !== findRun) return;
  const box = $('find-arts');
  if (!box) return;
  if (!groups.length) {
    box.innerHTML = !laws.length && !regs.length && !bills.length ? `<div class="q-empty lw-empty-sm"><strong>${W('沒有法規或條文提到這個', 'Nothing found')}</strong><p>${W('換個說法，或直接用白話問', 'Try other words, or just ask')}</p></div>` : '';
    return;
  }
  const top = groups.slice(0, 4);
  const files = await Promise.all(top.map(g => lawFile(g.row[0]).catch(() => null)));
  const delegs = await Promise.all(top.map(g => (state.regLaws[g.row[0]] ? data(`deleg/${g.row[0]}.json`).catch(() => null) : null)));
  if (run !== findRun || !document.body.contains(box)) return;
  const cards = [];
  top.forEach((g, i) => {
    for (const a of rankArticles(files[i], g.arts, terms).slice(0, i ? 2 : 4)) {
      const subs = (delegs[i]?.to?.[a.key] || []).slice(0, 2);
      cards.push(`<a class="lw-find-card" href="#law=${esc(g.row[0])}&amp;a=${esc(a.key)}" style="--t:${TOPICS[rowTopic(g.row)]?.color || 'var(--q-indigo)'}"><span class="lw-find-law">${topicTile(rowTopic(g.row), 'sm')}<b class="q-fit-wrap">${esc(g.row[1])}</b><em>${esc(artLabel(a.key, en))}</em></span><p>${snippet(a.text, terms)}</p>${subs.length ? `<span class="lw-find-subs">${subs.map(([sp, sn]) => `<span data-sub="${esc(sp)}">${W('子法', 'Rule')}：${esc(sn)}</span>`).join('')}</span>` : ''}</a>`);
    }
  });
  const rest = groups.slice(4, 10).map(g => lawItem(g.row, W(`${g.arts.length} 條提到`, `${g.arts.length} articles mention it`), '', `#law=${g.row[0]}&find=${encodeURIComponent(terms[0])}`));
  box.innerHTML = cards.length ? section(W('條文怎麼說', 'What the articles say'), `<div class="lw-find-cards">${cards.join('')}</div>`) + (rest.length ? section(W('也提到的法規', 'Also mentioned in'), list(rest)) : '') : '';
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
    // 憲法法庭's rulings on it, by article ('' = the law as a whole).
    state.lawCons = (await Promise.race([consLaws().then(c => c[p] || {}).catch(() => ({})), new Promise(r => setTimeout(() => r({}), 2000))])) || {};
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
  const chips = [
    [row[2] === '命令' ? W('命令', 'Regulation') : law.l === '憲法' || row[2] === '憲法' ? W('憲法', 'Constitution') : W('法律', 'Act'), ''],
    [topicName(topic, en), 'topic'],
    [W(`${nArts} 條`, `${nArts} articles`), ''],
    law.m && [`${W('修正', 'Rev.')} ${ymd(law.m)}`, ''],
    law.ab && [W('已廢止', 'Repealed'), 'red']
  ].filter(Boolean);
  const partyText = live ? partyChips(live.by, en, 2).replace(/<b>/g, '\u00a0').replace(/<[^>]+>/g, '  ').replace(/\s{2,}/g, ' · ').replace(/^ · | · $/g, '').trim() : '';
  const over = h('div', { class: 'lw-over-card', style: `--t:${TOPICS[topic].color}` }, [
    // The name across the whole card; the tile and facts under it.
    h('strong', { class: `lw-over-title lw-big-name${nameSize(name)}`, text: name }),
    h('div', { class: 'lw-over-top', html: `${topicTile(topic, 'lg')}<span class="lw-meta">${chips.map(([t, c]) => `<span class="lw-tag ${c}">${esc(t)}</span>`).join('')}</span>` }),
    change ? h('button', { type: 'button', class: 'lw-strip green', html: `<b>${W('最近修法', 'Just amended')}</b><span>${esc(changeText(change))}</span><em>${W('看修了什麼', 'What changed')}</em>`, onclick: () => diffSheet(law, change) }) : null,
    live ? h('button', { type: 'button', class: 'lw-strip indigo', html: `<b>${W('立法院審議中', 'In 立法院')}</b><span>${esc([stageShort(live, en), partyText].filter(Boolean).join(' · '))}</span><em>${W('看進度', 'Progress')}</em>${progress(live, en)}`, onclick: () => go(`item=${live.k.replace(':', '-')}`) }) : null,
    consStrip(law),
    draftStrip(law)
  ].filter(Boolean));
  // The doors: 目錄, 子法, 判決 (and a regulation's 授權依據), each with its count.
  const toc = contents(law).filter(c => c.depth <= 1);
  const doors = h('div', { class: 'lw-doors' }, [tocDoor(law, toc, nArts), basisDoor(law), regsDoor(law), rulingDoor(law)].filter(Boolean));
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
  panel.replaceChildren(head, find, over, doors, ...[fw, body].filter(Boolean));
  box.hidden = true;
}

// 最高法院判決: how many cite this law, and which articles (a tap: the list, by article).
const door = (cls, icon, n, label, onclick) => h('button', { type: 'button', class: `lw-door ${cls}`, html: `<span class="lw-door-ic">${icon}</span><b>${esc(String(n))}</b><small>${esc(label)}</small>`, onclick });
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
const lawConsIds = () => [...new Set(Object.values(state.lawCons).flat())].sort((a, b) => consOrder(b) - consOrder(a));
function rulingDoor(law) {
  const arts = Object.entries(state.lawRulings);
  const consIds = lawConsIds();
  if (!arts.length && !consIds.length) return null;
  const n = (state.rulingLaws[law.p] || new Set(arts.flatMap(([, l]) => l.map(x => x[0]))).size) + consIds.length;
  const sorted = arts.sort((a, b) => b[1].length - a[1].length);
  return door('court', ICON_GAVEL, n, W('則判決', 'rulings'), () => {
    const cons = consIds.map(id => state.consRows?.byId.get(id)).filter(Boolean);
    const html = (cons.length ? `<p class="lw-list-cap">${W(`憲法法庭 ${cons.length}`, `Constitutional Court ${cons.length}`)}</p>${cons.slice(0, 30).map(r => rulingRow(r)).join('')}` : '') + (sorted.length ? `<p class="lw-list-cap">${W('最高法院・最高行政法院，依條文', 'Top courts, by article')}</p>` : '') + sorted.map(([k, l]) => `<button type="button" class="lw-row" data-k="${esc(k)}">${courtTile(kindOfId(l[0][0]))}<span class="lw-row-text"><span class="lw-row-name">${esc(artLabel(k, en))}</span><small>${esc(l[0][2] || '')}</small></span><span class="lw-tag court">${ICON_GAVEL}${l.length}</span></button>`).join('');
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
  return door('teal', ICON_DOC, n, W('個子法', 'rules'), () => regsSheet(law));
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
const agencyRow = ([id, name, agency, url, mine], label) => `<a class="lw-row" href="${esc(url)}" target="_blank" rel="noopener"${mine ? ` data-text="${esc(textFile(id))}"` : ''}>${topicTile('gov', 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(name)}</span><small>${esc([agency, label].filter(Boolean).join(' · '))}</small></span></a>`;
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
// 憲法法庭 on this law: how many, the newest (a tap: the list).
function consStrip(law) {
  const ids = lawConsIds();
  const top = state.consRows?.byId.get(ids[0]);
  if (!top) return null;
  return h('button', { type: 'button', class: 'lw-strip cons', html: `<b>${W(`憲法法庭 ${ids.length} 件`, `Constitutional Court · ${ids.length}`)}</b><span>${esc(`${consLabel(top[0], en)} ${consName(top)}`)}</span><em>${W('看裁判', 'Rulings')}</em>`, onclick: () => (ids.length === 1 ? openCons(ids[0]) : rulingsSheet(W(`${shortName(law.n)} · 憲法法庭`, 'Constitutional Court'), [], ids)) });
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
// Several articles of one law: one chip (刑訴法 第377、382條), opening the first.
const citeChip = (p, k, n) => {
  const ks = [].concat(k);
  const label = en ? `Art. ${ks.join(', ')}` : `第${ks.join('、')}條`;
  return `<a class="lw-ref lw-cite" href="#law=${esc(p)}&amp;a=${esc(ks[0])}" data-law="${esc(p)}" data-from="${esc(ks[0])}" data-to="${esc(ks[0])}" data-para="0">${n ? `<b>${esc(en ? nameOf(p, n) : shortName(n))}</b> ` : ''}${esc(label)}</a>`;
};

// The rulings on an article: 憲法法庭's first, then the top courts' (newest first), each read in the app.
function rulingsSheet(label, rulings, consIds = []) {
  const cons = consIds.map(id => state.consRows?.byId.get(id)).filter(Boolean);
  const html = (cons.length ? `<p class="lw-list-cap">${W('憲法法庭', 'Constitutional Court')}</p>${list(cons.map(r => rulingRow(r)))}` : '') + (rulings.length ? `${cons.length ? `<p class="lw-list-cap">${W('最高法院・最高行政法院', 'Top courts')}</p>` : ''}${list(rulings.map(r => rulingRow(r, { sub: [COURTS[courtOf(r[0])]?.[en ? 1 : 0], caseNo(r[0]), ymd(r[1])].filter(Boolean).join(' · ') })))}` : '');
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
    else if (b.k === 'p') out += `<p>${esc(b.t)}</p>`;
    else if (b.k === 'pre') out += `<p class="lw-page-pre">${esc(b.t)}</p>`;
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
    const why = e.code === 'cap' ? W('今天讀太多頁了，明天再試', 'Daily reading limit reached; try tomorrow') : e.code === 'pass' || e.code === 401 ? W('請先登入 Quadra Pass', 'Sign in with Quadra Pass first') : e.code === 'empty' ? W('這一頁讀不出內容', 'This page has nothing the app can read') : W('現在讀不到這一頁，請稍後再試', 'Couldn’t load this page; try again later');
    body.innerHTML = `<p class="lw-none">${why}</p>${fallback}`;
  }
}

// A judgment: the outcome first in plain words, then who, then the reasons a point at a time.
async function openJudgment(u, label = '') {
  const body = h('div', { class: 'lw-page lw-jd', html: `<p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel short"></p>` });
  sheet({ title: W('判決', 'Ruling'), closeLabel: W('關閉', 'Close'), body, detent: 'large' });
  const out = `<a class="lw-out" href="${esc(u)}" target="_blank" rel="noopener" data-out>${W('到司法院看原文', 'Open on 司法院')}</a>`;
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
      return rest.length || first.length > 90 ? `<details class="lw-jd-point"><summary><b>${esc(x.head || '·')}</b><span>${esc(first.slice(0, 90))}${first.length > 90 ? '…' : ''}</span></summary>${[first.length > 90 ? first : '', ...rest].filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}</details>` : `<div class="lw-jd-point"><b>${esc(x.head || '·')}</b><span>${esc(first)}</span></div>`;
    };
    body.innerHTML =
      `<header class="lw-page-head"><h3>${esc(label || r.title)}</h3><small>${esc([r.title, r.no, r.date && shortDay(r.date)].filter(Boolean).join(' · '))}</small></header>` +
      `<div class="lw-jd-hero ${o.tone}"><span>${W('結果', 'Outcome')}</span>${o.label ? `<strong>${esc(o.label)}</strong>` : ''}<p>${esc(r.main.join(' '))}</p></div>` +
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

// A 授權 rule whose whole text came with the ministry's open data: read from this site.
async function openRuleText(file, label) {
  const body = h('div', { class: 'lw-page', html: `<p class="lw-page-wait q-skel"></p>` });
  sheet({ title: label.slice(0, 40), closeLabel: W('關閉', 'Close'), body });
  try {
    const r = await fetch(`./data/agency/text/${file}.json`).then(x => (x.ok ? x.json() : Promise.reject()));
    body.innerHTML = `<header class="lw-page-head"><h3>${esc(r.n)}</h3><small>${esc([r.a, r.d && ymd(r.d)].filter(Boolean).join(' · '))}</small></header><p class="lw-page-pre">${esc(r.t.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n'))}</p>`;
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
    body.innerHTML = `<p class="lw-none">${W('現在讀不到這段影片', 'Couldn’t load this video')}</p><a class="lw-out" href="${esc(ivodUrl(id))}" target="_blank" rel="noopener" data-out>${W('到立法院 IVOD 看', 'Watch on 立法院 IVOD')}</a>`;
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
    body.innerHTML = `<header class="lw-page-head"><h3>${esc(String(b['議案名稱'] || '').replace(/，請審議案。?$/, ''))}</h3><small>${esc([b['提案單位/提案委員'], b['提案日期'] && shortDay(b['提案日期']), b['議案狀態']].filter(Boolean).join(' · '))}</small></header>${who.length ? `<div class="lw-names">${who.map(n => `<span class="lw-name">${esc(n)}</span>`).join('')}</div>` : ''}${b['案由'] ? `<h4>${W('案由', 'Why')}</h4><p>${esc(b['案由'])}</p>` : ''}${b['說明'] ? `<details class="lw-fold"><summary>${W('說明', 'Explanation')}</summary><p>${esc(b['說明'])}</p></details>` : ''}${flow ? `<h4>${W('審議過程', 'Steps so far')}</h4><ol class="lw-timeline">${flow}</ol>` : ''}<h4>${W('條文對照', 'What it changes')}</h4><div class="lw-diffs"></div>${b['連署人']?.length ? `<details class="lw-fold"><summary>${W(`連署 ${b['連署人'].length} 人`, `${b['連署人'].length} co-signers`)}</summary><div class="lw-names">${b['連署人'].map(n => `<span class="lw-name">${esc(n)}</span>`).join('')}</div></details>` : ''}`;
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
  if (pend) return go(`item=${pend.dataset.item}`);
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
    wireTitles(panel);
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-ask]');
      if (b) ask(b.dataset.ask);
      if (e.target.closest('.lw-pin-x')) ((chat.pin = null), drawPin());
      if (e.target.closest('.lw-new')) newChat();
      const v = e.target.closest('[data-vote-id]');
      if (v) votesData().then(d => voteSheet(d.votes.findIndex(x => x[0] === v.dataset.voteId)), () => {});
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
    out.innerHTML = `<div class="lw-ask-empty"><span class="lw-orb">${ICON_SPARK}</span><strong>${W('說你遇到的事，問什麼都行', 'Tell what happened, or ask anything')}</strong><div class="lw-starters col">${STARTERS.map(([zh, e]) => `<button type="button" class="lw-starter" data-ask="${esc(W(zh, e))}">${esc(W(zh, e))}</button>`).join('')}</div><p class="lw-ask-note">${W('AI 依法規與判決回答，不是法律意見。', 'AI, from the laws and rulings found. Not legal advice.')}</p></div>`;
    return;
  }
  out.innerHTML = chat.turns.map(turnHtml).join('') + (chat.busy ? '' : `<button type="button" class="lw-new">${W('開始新對話', 'New chat')}</button>`);
}

function turnHtml(t) {
  if (t.role === 'user') return `<div class="lw-msg me"><p>${esc(t.text)}</p></div>`;
  if (t.wait) return `<div class="lw-msg ai"><div class="lw-typing"><i></i><i></i><i></i></div><small class="lw-srcs">${W('找條文與判決中…', 'Finding the laws and rulings…')}</small></div>`;
  if (t.error) return `<div class="lw-msg ai"><p class="lw-none">${esc(chatError(t.error, en))}</p></div>`;
  const r = t.r;
  const name = new Map(r.sources.map(s => [`${s.p}:${s.key}`, s.n]));
  const cases = new Map((r.cases || []).map(c => [c.jid, c]));
  const rules = new Map((r.rules || []).map(x => [x.id, x]));
  const chips = cites => cites.map(c => (cases.has(c) ? caseChip(cases.get(c)) : rules.has(c) ? ruleLink(rules.get(c), 'lw-ref lw-cite', `<b>${esc(rules.get(c).agency || W('規定', 'Rule'))}</b> ${W('規定', 'rule')}`) : citeChip(...c.split(':'), name.get(c)))).join('');
  const card = (href, title, sub, extra = '') => `<a class="lw-notice" href="${esc(href)}"${extra}><b>${esc(title)}</b><small>${esc(sub)}</small></a>`;
  const block = (cls, icon, title, inner) => `<div class="lw-block ${cls}"><h4><i>${icon}</i>${esc(title)}</h4>${inner}</div>`;
  const parts = [
    r.answer ? `<p class="lw-lead">${esc(r.answer)}</p>` : '',
    r.points.length ? `<ul class="lw-points">${r.points.map(pt => `<li>${esc(pt.text)} ${chips(pt.cites)}</li>`).join('')}</ul>` : '',
    r.consequences.length ? block('red', MENU_ICON.warn, W('後果', 'What follows'), `<ul class="lw-points">${r.consequences.map(pt => `<li>${esc(pt.text)} ${chips(pt.cites)}</li>`).join('')}</ul>`) : '',
    r.agency ? block('blue', MENU_ICON.gov, W('找哪個機關', 'Who to contact'), `<p>${esc(r.agency)}</p>`) : '',
    r.next.length ? block('green', MENU_ICON.steps, W('下一步', 'Next steps'), `<ol class="lw-steps">${r.next.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`) : '',
    r.notices?.length ? block('teal', MENU_ICON.gov, W('政府公告', 'Government notices'), `<div class="lw-cards">${r.notices.map(x => `<a class="lw-notice" href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.t)}</b><small>${esc([x.agency, x.d].filter(Boolean).join(' · '))}</small></a>`).join('')}</div>`) : '',
    r.bills?.length ? block('indigo', MENU_ICON.steps, W('立法院進度', 'In 立法院'), `<div class="lw-cards">${r.bills.map(b => `<a class="lw-notice" href="${b.k.startsWith('budget:') ? `#tab=bills&amp;f=budget&amp;budget=${encodeURIComponent(b.k.slice(7))}` : `#item=${esc(b.k.replace(':', '-'))}`}"><b>${esc(b.n)}</b><small>${esc(b.k.startsWith('budget:') ? W('預算審議', 'Budget') : stageShort({ stage: b.stage }, en))}</small></a>`).join('')}</div>`) : '',
    r.cases?.length ? block('purple', MENU_ICON.court, W('類似判決', 'Similar rulings'), `<div class="lw-cards">${r.cases.map(c => ((court, no) => card(caseHref(c.jid), no || court || c.jid, [no ? court : '', c.t, c.d && shortDay(c.d)].filter(Boolean).join(' · ')))(...(c.no || '').split(' '))).join('')}</div>`) : '',
    r.rules?.length ? block('orange', MENU_ICON.gov, W('行政規則', 'Agency rules'), `<div class="lw-cards">${r.rules.map(x => ruleLink(x, 'lw-notice', `<b>${esc(x.n)}</b><small>${esc([x.agency, x.d && shortDay(x.d)].filter(Boolean).join(' · '))}</small>`)).join('')}</div>`) : '',
    r.people?.length ? block('teal', DOOR_ICON.people, W('立委', 'Legislators'), `<div class="lw-cards">${r.people.map(x => card(`#who=${x.id}`, x.n, x.party)).join('')}</div>`) : '',
    r.votes?.length ? block('green', DOOR_ICON.votes, W('院會表決', 'Floor votes'), `<div class="lw-cards">${r.votes.map(v => `<button type="button" class="lw-notice" data-vote-id="${esc(v.id)}"><b>${esc(v.t)}</b><small>${esc(shortDay(v.d))}</small></button>`).join('')}</div>`) : '',
    r.meets?.length ? block('red', DOOR_ICON.agenda, W('議程', 'Agenda'), `<div class="lw-cards">${r.meets.map(x => card(`#meet=${encodeURIComponent(x.id)}&d=${x.d}`, x.t, shortDay(x.d))).join('')}</div>`) : '',
    r.sources.length ? `<p class="lw-srcs">${W(`依據 ${r.sources.length} 條條文`, `From ${r.sources.length} articles`)}${r.left != null ? ` · ${W(`今天還能問 ${r.left} 次`, `${r.left} left today`)}` : ''}</p>` : ''
  ].join('');
  const follow = r.followups.length ? `<div class="lw-starters">${r.followups.map(f => `<button type="button" class="lw-starter" data-ask="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : '';
  return `<div class="lw-msg ai${r.covered ? '' : ' thin'}">${parts}</div>${follow}`;
}

// A judgment, 釋字 or 憲判字: the app's one ruling link.
const caseHref = jid => `#r=${encodeURIComponent(jid)}`;
const caseChip = c => {
  const [, y, w, n] = c.jid.split(',');
  const label = c.jid.startsWith('s') ? W(`釋字${c.jid.slice(1)}`, `J.Y. ${c.jid.slice(1)}`) : c.jid.startsWith('j') ? W(`${c.jid.slice(1).replace('-', '憲判')}`, `${c.jid.slice(1)} TCC`) : `${y}${w}${n}`;
  return `<a class="lw-ref lw-cite" href="${esc(caseHref(c.jid))}"><b>${W('判決', 'Ruling')}</b> ${esc(label)}</a>`;
};
// A rule: its text kept on this site, else the ministry's page (read in the app), else just its name.
const ruleLink = (x, cls, inner) => (x.text || x.url ? `<a class="${cls}" href="${esc(x.url || '#')}"${x.text ? ` data-text="${esc(textFile(x.id))}"` : ''}>${inner}</a>` : `<span class="${cls}">${inner}</span>`);

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
  const r = await chatLaw({ q: text, history, pin, mine: mineOf(state.mine), lang: en ? 'en' : 'zh' }, { fetcher: ai });
  chat.turns[chat.turns.length - 1] = r.error ? { role: 'model', error: r.error } : { role: 'model', r };
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

// The four doors: each court (and 釋字, the old 大法官's), its colour.
const COURT_DOORS = [
  ['cons', W('憲法法庭', 'Const.'), 'cons'],
  ['interp', W('大法官解釋', 'Interpret.'), 'interp'],
  ['TPS', W('最高法院', 'Supreme'), 'tps'],
  ['TPA', W('最高行政', 'Admin.'), 'tpa']
];
const kindOfId = id => (id[0] === 's' && isCons(id) ? 'interp' : isCons(id) ? 'cons' : courtOf(id) === 'TPA' ? 'tpa' : 'tps');
const courtIcon = kind => (kind === 'cons' || kind === 'interp' ? MENU_ICON.court : ICON_GAVEL);
const courtTile = (kind, size = 'sm') => `<span class="lw-ctile ${kind}${size ? ` ${size}` : ''}" aria-hidden="true">${courtIcon(kind)}</span>`;
const courtName = kind => ({ cons: W('憲法法庭', 'Constitutional Court'), interp: W('大法官解釋', 'Interpretation'), tps: W('最高法院', 'Supreme Court'), tpa: W('最高行政法院', 'Supreme Administrative Court') })[kind];
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
  const label = cons ? consShort(id) : (en ? COURT_SHORT[courtOf(id)] : COURTS[courtOf(id)]?.[0]) || '';
  const name = cons ? consName(r) : r[2] || caseNo(id);
  return `<div class="lw-bill lw-ruling ${kind}"><span class="lw-bill-top">${courtTile(kind)}<span class="lw-bill-stage court">${esc(label)}</span><span class="lw-bill-day">${esc(shortDay(d))}</span></span><a class="lw-bill-name${fit(name)}" href="${esc(rulingHref(id))}">${esc(name)}</a><span class="lw-cites">${citeChips(cites || [], 1, 3, false)}</span></div>`;
}
function rulingRow(r, { sub = '' } = {}) {
  const [id, d] = r;
  const cons = isCons(id);
  const kind = kindOfId(id);
  const name = cons ? consName(r) : r[2] || caseNo(id);
  const [zh, eng, tone] = cons ? ['', '', ''] : caseKind(id);
  const line = sub || [cons ? consLabel(id, en) : caseNo(id), ymd(d)].filter(Boolean).join(' · ');
  return `<a class="lw-row lw-rrow" href="${esc(rulingHref(id))}">${courtTile(kind)}<span class="lw-row-text"><span class="lw-row-name${fit(name, 13)}">${esc(name)}</span><small>${zh ? countTag(en ? eng : zh, tone) : ''}${esc(line)}</small></span></a>`;
}
const COURT_SHORT = { TPS: 'Supreme Court', TPA: 'Admin. Court', JCC: 'Const. Court' };

let rulingDoor_ = '';
let rulingQuery = '';
let rulingMonth = '';
let rulingKind = '';
let rulingTopic_ = '';
let rulingMore = 0;
const rulingBox = search({ placeholder: W('找判決：釋字號、案號或關鍵字', 'Search rulings: number or words'), onInput: v => ((rulingQuery = v.trim()), (rulingMore = 0), drawRulingList()) });

function drawRulings() {
  const panel = $('panel-rulings');
  const p = new URLSearchParams(location.hash.slice(1));
  const f = p.get('f') || '';
  rulingDoor_ = COURT_DOORS.some(([id]) => id === f) ? f : '';
  rulingTopic_ = TOPICS[p.get('topic')] ? p.get('topic') : '';
  if (p.has('m')) rulingMonth = p.get('m');
  if (p.has('q')) ((rulingQuery = p.get('q')), (rulingBox.querySelector('input').value = rulingQuery));
  rulingMore = 0;
  if (!panel.firstChild) {
    const doors = h('div', { class: 'lw-bill-doors four', role: 'tablist' }, COURT_DOORS.map(([id, label, tone]) => h('button', { type: 'button', class: `lw-bdoor ${tone}`, role: 'tab', 'data-door': id, html: `<span class="lw-door-ic">${courtIcon(tone)}</span><small>${esc(label)}</small>`, onclick: () => go(rulingDoor_ === id ? 'tab=rulings' : `tab=rulings&f=${id}`, { replace: true }) })));
    panel.append(headNode(W('裁判', 'Rulings')), doors, rulingBox, h('div', { id: 'ruling-list' }));
    wireTitles(panel);
    panel.addEventListener('click', e => {
      const more = e.target.closest('[data-rmore]');
      if (more) return void ((rulingMore += 60), drawRulingList());
      const m = e.target.closest('[data-month]');
      if (m) return void ((rulingMonth = m.dataset.month), (rulingMore = 0), drawRulingList());
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
  if (rulingQuery) return void (out.innerHTML = await rulingSearchHtml(rulingQuery, cons, { door: rulingDoor_ }));
  const door = rulingDoor_;
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
  if (!judgments.length && !court.length) return void (out.innerHTML = emptyRulings());
  out.innerHTML =
    section(W('憲法法庭最新判決', 'Constitutional Court, latest'), rail(judgments.map(rulingCard)), { more: W('全部', 'All'), moreHref: '#tab=rulings&f=cons' }) +
    section(W('判決之後，立法院在修', 'Rulings 立法院 is acting on'), answered.length ? `<div class="lw-list">${answered.map(r => answeredRow(r)).join('')}</div>` : '') +
    section(W('最高法院', 'Supreme Court'), list(by('TPS').map(r => rulingRow(r))), { more: W('更多', 'More'), moreHref: '#tab=rulings&f=TPS' }) +
    section(W('最高行政法院', 'Admin. Court'), list(by('TPA').map(r => rulingRow(r))), { more: W('更多', 'More'), moreHref: '#tab=rulings&f=TPA' }) +
    section(W('最常被引用的解釋', 'Most cited'), list(landmarks.slice(0, 6).map(r => rulingRow(r, { sub: W(`${consLabel(r[0])} · 後來 ${cons.cited[r[0]].length} 件引用`, `${consLabel(r[0], en)} · cited ${cons.cited[r[0]].length} times`) }))), { more: W('全部', 'All'), moreHref: '#tab=rulings&f=interp' }) +
    section(W('依主題', 'By topic'), topicChips);
}
const emptyRulings = () => `<div class="q-empty lw-empty-sm"><strong>${W('裁判資料讀不到', 'Rulings couldn’t be loaded')}</strong><p>${W('請連上網路再試一次。', 'Connect and try again.')}</p></div>`;
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
  const html = (jumpRow ? section(W('直接打開', 'Go to'), list([rulingRow(jumpRow)])) : '') + (consHits.length ? section(W('憲法法庭', 'Constitutional Court'), list(consHits.map(r => rulingRow(r)))) : '') + (court.length ? section(W('最高法院・最高行政法院', 'Top courts'), rowsOf(court)) : '');
  if (quiet) return html;
  return html || `<div class="q-empty lw-empty-sm"><strong>${W('找不到符合的裁判', 'No rulings found')}</strong><p>${W('試試釋字號（748）、案號（115台上4682）或案由的字', 'Try a number (748), a case number (115台上4682) or words in its matter')}</p></div>`;
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
    body.innerHTML = `<p class="lw-none">${W('現在讀不到這個裁判，請稍後再試', 'Couldn’t load this ruling; try again later')}</p><a class="lw-out" href="${esc(id[0] === 's' ? interpPage(id.slice(1)) : JUDGMENTS_PAGE)}" target="_blank" rel="noopener" data-out>${W('到憲法法庭看', 'Open on 憲法法庭')}</a>`;
    return;
  }
  const kind = kindOfId(id);
  const refRows = ids => list(ids.map(x => cons.byId.get(x)).filter(Boolean).map(r => rulingRow(r)));
  const cited = (cons.cited[id] || []).sort((a, b) => consOrder(b) - consOrder(a));
  // The bills it led to: named in their purpose; then bills open on the articles it ruled on.
  const named = (it.bills || []).map(k => state.items.find(x => x.k === k)).filter(Boolean);
  const onArts = state.items.filter(x => !named.includes(x) && !x.dropped && x.open && x.stage < PROMULGATED && it.cites.some(c => { const [p, k] = c.split(':'); return x.p === p && (!k || x.arts?.[k]); })).slice(0, 4);
  const billRows = items => `<div class="lw-list">${items.map(x => `<a class="lw-row" href="#item=${esc(x.k.replace(':', '-'))}">${topicTile(itemTopic(x), 'sm')}<span class="lw-row-text"><span class="lw-row-name${fit(x.n)}">${esc(x.n)}</span><small>${esc([stageShort(x, en), x.about].filter(Boolean).join(' · '))}</small></span></a>`).join('')}</div>`;
  const paras = ps => ps.map(p => `<p>${plainHtml(p)}</p>`).join('');
  const verdict = consVerdict(it.main.join(''));
  body.innerHTML =
    `<header class="lw-page-head"><h3 class="lw-big-name q-fit-wrap${nameSize(it.n || '')}">${esc(it.n || consLabel(id, en))}</h3><small>${esc([courtName(kind), it.label, it.d && ymd(it.d)].filter(Boolean).join(' · '))}</small></header>` +
    (it.issue ? `<div class="lw-block cons"><h4><i>${MENU_ICON.ask}</i>${id[0] === 's' ? W('爭點', 'The question') : W('案由', 'The case')}</h4><p>${plainHtml(it.issue)}</p></div>` : '') +
    `<div class="lw-jd-hero ${verdict.tone}"><span>${id[0] === 's' ? W('解釋文', 'Holding') : W('主文', 'Holding')}</span>${verdict.label ? `<strong>${esc(verdict.label)}</strong>` : ''}<div class="lw-cons-main">${paras(it.main)}</div></div>` +
    (it.by ? `<p class="lw-jd-who">${esc(W(`聲請人 ${it.by}`, `Petitioner ${it.by}`))}</p>` : '') +
    (it.cites.length ? `<h4>${W('涉及的條文', 'Articles it rules on')}</h4>${citeRows(it.cites)}` : '') +
    (named.length ? `<h4>${W('因這個判決提的修法', 'Bills it led to')}</h4>${billRows(named)}` : '') +
    (onArts.length ? `<h4>${W('立法院正在修這些條文', 'Bills on these articles')}</h4>${billRows(onArts)}` : '') +
    (it.reason.length ? `<details class="lw-fold lw-cons-reason"><summary>${W(`理由（${it.reason.length} 段）`, `Reasons (${it.reason.length} paragraphs)`)}</summary>${paras(it.reason)}</details>` : '') +
    (it.refs.length ? `<h4>${W(`引用的解釋與判決（${it.refs.length}）`, `Builds on (${it.refs.length})`)}</h4>${refRows(it.refs.slice(0, 12))}` : '') +
    (cited.length ? `<h4>${W(`後來引用它的（${cited.length}）`, `Cited by (${cited.length})`)}</h4>${refRows(cited.slice(0, 12))}` : '') +
    (it.docs.length ? `<details class="lw-fold"><summary>${W(`意見書與原文（${it.docs.length}）`, `Opinions and files (${it.docs.length})`)}</summary><div class="lw-list in-sheet">${it.docs.map(([t, u]) => `<a class="lw-row" href="${esc(u)}" target="_blank" rel="noopener" data-out><span class="lw-file">PDF</span><span class="lw-row-text"><span class="lw-row-name lw-doc-name q-fit-wrap">${esc(t.replace(/^憲法法庭\d+年憲判字第\d+號判決/, '').replace(/^\d+/, '').replace(/_OCR$/, '') || t)}</span></span></a>`).join('')}</div></details>` : '') +
    `<a class="lw-out" href="${esc(it.url || (id[0] === 's' ? interpPage(id.slice(1)) : JUDGMENTS_PAGE))}" target="_blank" rel="noopener" data-out>${W('到憲法法庭看原文', 'Open on 憲法法庭')}</a>`;
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
    const doors = h('div', { class: 'lw-bill-doors', role: 'tablist' }, BILL_DOORS.map(([id, label, tone]) => h('button', { type: 'button', class: `lw-bdoor ${tone}`, role: 'tab', 'data-door': id, html: `<span class="lw-door-ic">${DOOR_ICON[id]}</span><small>${esc(label)}</small>`, onclick: () => setBillFilter(id === 'bills' ? 'moving' : id) })));
    const chips = h('div', { class: 'q-chips lw-chips', id: 'bill-stages', role: 'tablist' }, BILL_FILTERS.map(([id, label]) => h('button', { type: 'button', class: 'q-chip', role: 'tab', 'data-f': id, text: label, onclick: () => setBillFilter(id) })));
    panel.append(headNode(W('立法', 'Bills')), doors, billBox, h('div', { id: 'bill-digest' }), h('div', { id: 'bill-funnel' }), chips, h('div', { id: 'bill-list' }));
    wireTitles(panel);
    panel.addEventListener('click', e => {
      const col = e.target.closest('.lw-funnel-col');
      if (col) {
        billStep = billStep === Number(col.dataset.step) ? -1 : Number(col.dataset.step);
        if (billStep < 0) billFilter = 'moving';
        billMore = {};
        return drawBillList();
      }
      const how = e.target.closest('[data-how]');
      if (how) return howBillsWork(Number(how.dataset.how));
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
  if (!items.length) return void (out.innerHTML = `<div class="q-empty lw-empty-sm"><strong>${W('沒有符合的法案', 'No bills match')}</strong></div>`);
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
  if (billQuery) rows = rows.filter(n => n.t.includes(billQuery) || n.gov.includes(billQuery));
  const open = rows.filter(n => isOpen(n, day)), closed = rows.filter(n => !isOpen(n, day));
  const html = section(W('開放意見中', 'Open for comment'), grid(open.map(n => noticeCard(n, day)))) + section(W('已截止', 'Closed'), grid(closed.slice(0, 60).map(n => noticeCard(n, day))));
  return html || `<div class="q-empty lw-empty-sm"><strong>${W('目前沒有預告中的修法', 'No drafts open for comment')}</strong></div>`;
}
function noticeCard(n, day) {
  const openNow = isOpen(n, day);
  const topic = topicOf(n.t, '');
  const when = openNow ? W(`意見至 ${shortDay(n.to)}`, `till ${shortDay(n.to)}`) : W(`${shortDay(n.to)} 截止`, `closed ${shortDay(n.to)}`);
  return `<a class="lw-bill wide notice${openNow ? '' : ' closed'}" href="${esc(noticeUrl(n.id))}" target="_blank" rel="noopener" style="--t:${TOPICS[topic].color}"><span class="lw-bill-top">${topicTile(topic, 'sm')}<span class="lw-bill-stage">${openNow ? W('開放意見', 'Open') : W('已截止', 'Closed')}</span><span class="lw-bill-day">${esc(when)}</span></span><span class="lw-bill-name">${esc(n.t.replace(/[。.]+$/, ''))}</span><span class="lw-bill-foot"><span class="lw-party" style="--p:#64748b">${esc(n.gov)}</span></span></a>`;
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
      const text = kind[0] === '修正' ? diffHtml(old, now) : kind[0] === '增訂' ? `<ins>${esc(now)}</ins>` : `<del>${esc(old)}</del>`;
      return `<article class="lw-diff" data-i="${i}"><header><b>${esc(art || W('條文', 'Article'))}</b>${countTag(W(kind[0], kind[1]), kind[2])}</header><p>${text}</p>${row['說明'] ? `<details class="lw-why"><summary>${W('立法說明', 'Why')}</summary><p>${esc(row['說明'])}</p></details>` : ''}</article>`;
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
  const html =
    section(W('自上次查看後的變動', 'New since you last looked'), (moved.length ? grid(moved.map(it => billCard(it, { topic: itemTopic(it), en, wide: true }))) : '') + list(news)) +
    section(W('追蹤的法案', 'Bills'), grid(items.filter(it => !moved.includes(it)).map(it => billCard(it, { topic: itemTopic(it), en, wide: true })))) +
    section(W('追蹤的法規', 'Laws'), list(laws.map(r => lawItem(r)))) +
    section(W('書籤', 'Bookmarks'), list(marks.map(x => lawItem(x.row, artLabel(x.k, en), '', `#law=${x.p}&a=${x.k}`)))) +
    section(W('最近看過', 'Recently opened'), list(m.recent.map(p => state.byCode.get(p)).filter(Boolean).slice(0, 6).map(r => lawItem(r)))) +
    (Object.keys(m.people || {}).length ? `<div id="mine-people"></div>` : '');
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
// A vote as a row: its subject, day and a tally bar (贊成 green, 反對 red, 棄權 grey).
function voteRow([i, v], mark = '', named = false) {
  const [y, n, a] = [v[4].length, v[5].length, v[6].length];
  const all = Math.max(1, y + n + a);
  const pass = y > n;
  const badge = mark ? `<span class="lw-vote-me ${mark}">${{ y: W('贊成', 'Yes'), n: W('反對', 'No'), a: W('棄權', 'Abstain'), '-': W('未投', 'Absent') }[mark]}</span>` : '';
  return `<button type="button" class="lw-vote" data-vote="${i}"><span class="lw-vote-top">${badge}<span class="lw-vote-t">${named && v[7]?.length && state.byCode.has(v[7][0]) ? `<b class="lw-vote-law">${esc(en ? nameOf(v[7][0]) : shortName(nameOf(v[7][0])))}</b>` : ''}${esc(v[2])}</span></span><span class="lw-vote-bar"><i class="y" style="width:${(y / all) * 100}%"></i><i class="n" style="width:${(n / all) * 100}%"></i><i class="a" style="width:${(a / all) * 100}%"></i></span><small>${esc(shortDay(v[1]))} · ${pass ? W('通過', 'Passed') : W('未通過', 'Failed')} · ${W(`贊成 ${y}・反對 ${n}${a ? `・棄權 ${a}` : ''}`, `${y} yes · ${n} no${a ? ` · ${a} abstain` : ''}`)}</small></button>`;
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
// One vote: the result, each party's split, and every name by how they voted.
async function voteSheet(i) {
  const [d, ppl] = await Promise.all([votesData(), peopleData().catch(() => ({ people: [] }))]);
  const v = d.votes[i];
  if (!v) return;
  const byName = new Map(ppl.people.map(x => [x.n, x]));
  const parties = new Map();
  const groups = [['y', v[4], W('贊成', 'Yes')], ['n', v[5], W('反對', 'No')], ['a', v[6], W('棄權', 'Abstain')]];
  for (const [k, ids] of groups) for (const j of ids) { const party = byName.get(d.names[j])?.party || ''; const c = parties.get(party) || { y: 0, n: 0, a: 0 }; c[k]++; parties.set(party, c); }
  const split = [...parties].sort((a, b) => b[1].y + b[1].n + b[1].a - (a[1].y + a[1].n + a[1].a)).map(([party, c]) => `<div class="lw-split"><span class="lw-party" style="--p:${partyColor(party)}">${esc(party ? partyShort(party) : W('其他', 'Other'))}</span><span class="lw-split-n"><b class="y">${c.y}</b><b class="n">${c.n}</b>${c.a ? `<b class="a">${c.a}</b>` : ''}</span></div>`).join('');
  const names = groups.filter(([, ids]) => ids.length).map(([k, ids, label]) => `<h4>${esc(label)} ${ids.length}</h4><div class="lw-names">${ids.map(j => { const who = byName.get(d.names[j]); return `<button type="button" class="lw-name" data-who="${esc(who?.id || '')}" style="--p:${partyColor(who?.party || '')}">${esc(d.names[j])}</button>`; }).join('')}</div>`).join('');
  const url = gazetteUrl(v[0]);
  // The laws it was on: their bill in 立法院 when tracked, else the law itself.
  const on = (v[7] || []).map(p => { const it = (state.itemsByLaw.get(p) || []).find(x => x.open || x.stage >= PASSED); const r = state.byCode.get(p); return r ? `<a class="lw-notice" href="${it ? `#item=${esc(it.k.replace(':', '-'))}` : `#law=${esc(p)}`}"><b>${esc(nameOf(p))}</b><small>${esc(it ? stageShort(it, en) : W('現行法規', 'Law in force'))}</small></a>` : ''; }).join('');
  const body = h('div', { class: 'lw-vote-sheet', html: `<p class="lw-vote-subject">${esc(v[2])}</p>${on ? `<div class="lw-cites lw-vote-on">${on}</div>` : ''}${voteRow([i, v]).replace('<button type="button" class="lw-vote"', '<div class="lw-vote static"').replace(/<\/button>$/, '</div>')}<h4>${W('各黨', 'By party')}</h4><div class="lw-splits">${split}</div>${names}${url ? `<a class="lw-out" href="${esc(url)}" target="_blank" rel="noopener">${W('立法院公報', 'In the 公報')}</a>` : ''}` });
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
    return void (out.innerHTML = `<div class="q-empty lw-empty-sm"><strong>${W('表決資料讀不到，請稍後再試', 'Couldn’t load the votes')}</strong></div>`);
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
  const what = /全案/.test(v[2]) ? W('全案 ', 'Whole bill ') : '';
  return `<button type="button" class="lw-vgroup" data-g="${gi}"><b class="lw-vg-t">${esc(voteGroupTitle(g, agendas).replace(/^中華民國(?=\d)/, ''))}</b>${sides ? `<span class="lw-vg-sides">${sides}</span>` : ''}<span class="lw-vg-foot"><span class="lw-tag ${y > n ? 'green' : 'red'}">${y > n ? W('通過', 'Passed') : W('未通過', 'Failed')}</span><small>${[shortDay(g.day), `${what}${W(`贊成 ${y}・反對 ${n}`, `${y} yes · ${n} no`)}`, g.list.length > 1 ? W(`${g.list.length} 次`, `${g.list.length} votes`) : ''].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join(' · ')}</small></span></button>`;
}

// 立委: everyone in office this term, by party; search by name or 選區.
async function peopleList(out) {
  out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(4)}</div>`;
  let ppl;
  try {
    ppl = (await peopleData()).people;
  } catch {
    return void (out.innerHTML = `<div class="q-empty lw-empty-sm"><strong>${W('立委資料讀不到，請稍後再試', 'Couldn’t load the legislators')}</strong></div>`);
  }
  const q = billQuery;
  const ql = q.toLowerCase();
  const now = ppl.filter(x => !x.to && (!q || x.n.includes(q) || x.area.includes(q) || x.party.includes(q) || partyOf(x.party).zh.includes(q) || partyOf(x.party).en.toLowerCase().includes(ql)));
  const followed = now.filter(x => state.mine.people?.[x.id]);
  const byParty = new Map();
  for (const x of now) byParty.set(x.party, [...(byParty.get(x.party) || []), x]);
  const card = x => `<a class="lw-person" href="#who=${esc(x.id)}" style="--p:${partyColor(x.party)}">${personPhoto(x)}<span class="lw-person-text"><b>${esc(x.n)}</b><small>${esc(shortArea(x.area))}</small></span><span class="lw-person-n">${W(`提案 ${x.counts.bills}`, `${x.counts.bills} bills`)}</span></a>`;
  out.innerHTML =
    (followed.length ? `<section class="q-section lw-sec"><div class="q-section-head"><h2>${W('追蹤的立委', 'Following')}</h2></div><div class="lw-people">${followed.map(card).join('')}</div></section>` : '') +
    [...byParty].sort((a, b) => b[1].length - a[1].length).map(([party, xs]) => `<section class="q-section lw-sec"><div class="q-section-head"><h2><span class="lw-party" style="--p:${partyColor(party)}">${esc(partyShort(party))}</span></h2><span class="lw-count">${xs.length}</span></div><div class="lw-people">${xs.map(card).join('')}</div></section>`).join('') ||
    `<div class="q-empty lw-empty-sm"><strong>${W('沒有符合的立委', 'No one matches')}</strong></div>`;
}
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
  const head = h('div', { class: 'lw-person-head', html: `${personPhoto({ ...x, photo: x.photo || row.photo }, 'lg')}<div><h2>${esc(x.n)}</h2><div class="lw-meta"><span class="lw-party" style="--p:${partyColor(x.party)}">${esc(partyShort(x.party))}</span><span class="lw-tag">${esc(shortArea(x.area))}</span>${x.to ? `<span class="lw-tag red">${W('已離職', 'Left office')}</span>` : ''}</div></div>` });
  const tiles = h('div', { class: 'lw-stats four', html: stats.map(([l, n, tone]) => `<span class="lw-stat ${tone}"><b>${typeof n === 'number' ? n.toLocaleString() : n}</b><span>${esc(l)}</span></span>`).join('') });
  const clips = h('div', { class: 'lw-person-sec' });
  if (x.clips?.length) {
    const roc = d => { const [y, m, dd] = d.split('-').map(Number); return `${y - 1911}年${m}月${dd}日`; };
    const yt = c => `https://www.youtube.com/@LegislativeYuan/search?query=${encodeURIComponent(`${c[1]} ${roc(c[0])}`)}`;
    const clipRow = c => `<div class="lw-clip"><a class="lw-clip-main" href="${esc(ivodUrl(c[2]))}" target="_blank" rel="noopener"><span class="lw-clip-play">${ICON_PLAY}</span><span class="lw-row-text"><span class="lw-row-name">${esc(c[1] || W('院會', 'Plenary'))}</span><small>${esc(`${shortDay(c[0])}${c[4] ? ` · ${Math.max(1, Math.round(c[4] / 60))} ${W('分鐘', 'min')}` : ''}`)}</small></span></a><a class="lw-clip-yt" href="${esc(yt(c))}" target="_blank" rel="noopener" aria-label="YouTube">${ICON_YT}</a></div>`;
    let n = 5;
    const draw = () => (clips.innerHTML = `<h4>${W(`質詢影片（${x.clips.length}）`, `Speeches (${x.clips.length})`)}</h4><div class="lw-clips">${x.clips.slice(0, n).map(clipRow).join('')}</div>${x.clips.length > n ? `<button type="button" class="lw-more">${W('再顯示 20 段', 'Show 20 more')}</button>` : ''}<p class="lw-hint-sm">${W('影片在立法院議事轉播（IVOD）；▶ YouTube 找同一場會議。', 'Videos play on 立法院 IVOD; the YouTube button finds the same meeting.')}</p>`);
    draw();
    clips.addEventListener('click', e => e.target.closest('.lw-more') && ((n += 20), draw()));
  }
  const votes = h('div', { class: 'lw-person-sec' });
  votesData().then(dd => {
    d = dd;
    const mine = personVotes(d, x.n, { from: x.from, to: x.to }).filter(([, m]) => m !== '-');
    if (!mine.length) return;
    const marks = new Map(mine);
    // How often they vote with their own party's majority (y/n votes only).
    const partyOfName = new Map(ppl.people.map(p => [p.n, p.party]));
    let same = 0, cast = 0;
    for (const [j, m] of mine) {
      if (m !== 'y' && m !== 'n') continue;
      const v = d.votes[j];
      const side = k => v[k].filter(i => partyOfName.get(d.names[i]) === x.party).length;
      const [py, pn] = [side(4), side(5)];
      if (py === pn) continue;
      cast++;
      if ((py > pn ? 'y' : 'n') === m) same++;
    }
    const pct = same === cast ? '100' : String(Math.floor((same / Math.max(1, cast)) * 1000) / 10);
    const whole = mine.filter(([j]) => /全案/.test(d.votes[j][2]));
    const all = h('button', { type: 'button', class: 'lw-more', text: W(`看全部 ${mine.length} 筆表決`, `All ${mine.length} votes`), onclick: () => all.replaceWith(voteList(mine.map(([j]) => [j, d.votes[j]]), marks)) });
    votes.replaceChildren(
      h('h4', { text: W(`表決紀錄（${mine.length}）`, `Votes (${mine.length})`) }),
      ...(cast >= 10 ? [h('p', { class: 'lw-person-line', html: W(`<b>${pct}%</b> 跟${esc(partyShort(x.party))}多數一致`, `<b>${pct}%</b> with ${esc(partyShort(x.party))}’s majority`) })] : []),
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
const budgetName = x => (en ? x.title.replace(/^(\d+)年度中央政府總預算追加預算案$/, 'FY$1 supplementary budget').replace(/^(\d+)年度中央政府總預算案$/, 'FY$1 central budget').replace(/^(\d+)年度第二預備金動支數額表$/, 'FY$1 reserve fund report') : x.title.replace(/案$/, '').replace(/^(\d+年度)中央政府/, '$1 '));

async function budgetList(out) {
  out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(2)}</div>`;
  let b;
  try {
    b = await budgetData();
  } catch {
    return void (out.innerHTML = `<div class="q-empty lw-empty-sm"><strong>${W('預算資料讀不到，請稍後再試', 'Couldn’t load the budgets')}</strong></div>`);
  }
  const card = x => {
    const m = x.money;
    const head = `<span class="lw-bill-top"><span class="lw-bill-stage ${budgetTone(x.stage)}">${esc(budgetStep(x.stage))}</span><span class="lw-bill-day">${esc(shortDay(x.last))}</span></span><b class="lw-bill-name">${esc(budgetName(x))}</b>`;
    if (!m) {
      const last = x.flow?.at(-1);
      return `<a class="lw-bill lw-budget" href="#tab=bills&amp;f=budget&amp;budget=${encodeURIComponent(x.k)}">${head}<span class="lw-bud-steps">${last ? [budgetStep(last[1]) !== budgetStep(x.stage) && budgetStep(last[1]), last[0] && W(`最新進度 ${ymd(last[0])}`, `Latest ${ymd(last[0])}`)].filter(Boolean).map(esc).join(' · ') : ''}</span><span class="lw-bill-foot"><span class="lw-bud-note">${x.votes?.length ? W(`院會表決 ${x.votes.length} 次`, `${x.votes.length} floor votes`) : W(`${x.bills?.length || 0} 件議案`, `${x.bills?.length || 0} bill${x.bills?.length === 1 ? '' : 's'}`)}</span></span></a>`;
    }
    const top = [...m.fn].sort((a, c) => c[1] - a[1]).slice(0, 3);
    const cut = m.cut > 0 ? `<span class="lw-bud-cut">${W('立法院刪減', 'Cut by 立法院')} <b>${esc(money(m.cut, en))}</b> · ${esc(pct(m.cut, m.asked))}</span>` : `<span class="lw-bud-note">${m.passed ? W('照案通過', 'Passed as sent') : /三讀/.test(x.stage) ? W('刪減數待主計總處公布法定預算', 'Cuts once the passed budget is published') : W('行政院送審的預算案', 'As the Cabinet sent it')}</span>`;
    return `<a class="lw-bill lw-budget money" href="#tab=bills&amp;f=budget&amp;budget=${encodeURIComponent(x.k)}">${head}<span class="lw-bud-total"><b>${esc(money(m.total, en))}</b><small>${W('歲出', 'Spending')}</small>${chgTag(m.total, m.prev)}</span>${fnBar(m.fn)}<span class="lw-bud-legend">${top.map(f => `<span><i style="--c:${fnOf(f[0])[0]}"></i>${esc(fnName(f[0]))} ${pct(f[1], m.total)}</span>`).join('')}</span>${cut}</a>`;
  };
  const q = billQuery;
  const shown = b.budgets.filter(x => !q || x.title.includes(q) || x.k.includes(q) || x.money?.top.some(t => t[0].includes(q)));
  out.innerHTML = shown.length ? `<div class="lw-grid">${shown.map(card).join('')}</div>` : `<div class="q-empty lw-empty-sm"><strong>${W('沒有符合的預算', 'No budget matches')}</strong></div>`;
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
  const head = `<h2 class="lw-item-name lw-big-name">${esc(budgetName(x))}</h2><div class="lw-meta"><span class="lw-bill-stage ${budgetTone(x.stage)}">${esc(budgetStep(x.stage))}</span>${x.last ? `<span class="lw-tag">${esc(ymd(x.last))}</span>` : ''}</div>`;
  const steps = x.flow?.length ? `<section class="lw-person-sec"><h4>${W('進度', 'Steps')}</h4><ol class="lw-timeline">${x.flow.map(f => `<li class="done"><b>${esc(budgetStep(f[1]))}</b><span>${esc(ymd(f[0]))}</span></li>`).join('')}</ol></section>` : '';
  const votesBox = h('section', { class: 'lw-person-sec' });
  if (x.votes?.length)
    votesData().then(d => {
      const ids = new Set(x.votes);
      const list = d.votes.map((v, i) => [i, v]).filter(([, v]) => ids.has(v[0]));
      votesBox.replaceChildren(h('h4', { text: W(`院會表決（${list.length}）`, `Floor votes (${list.length})`) }), voteList(list, null, 5));
    }).catch(() => {});
  if (!m) {
    body.innerHTML = `${head}<p class="lw-hint-sm">${/^\d+$/.test(x.k) ? W('主計總處的預算表公開後，這裡會列出金額、各部會和刪減。', 'Amounts, ministries and cuts appear here once 主計總處 publishes the budget tables.') : W('特別預算和追加預算的金額不在主計總處的開放資料裡。', 'Special and supplementary budgets aren’t in 主計總處’s open data.')}</p>${steps}`;
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
  const src = `<p class="lw-hint-sm lw-bud-src">${W('資料：行政院主計總處預算表（政府資料開放平臺', 'Source: 主計總處 budget tables (data.gov.tw')} ${['b', 'c'].filter(kd => y.src?.[kd]).map(kd => `<a href="https://data.gov.tw/dataset/${esc(y.src[kd])}" target="_blank" rel="noopener">${kd === 'b' ? W('預算案', 'as sent') : W('法定預算', 'as passed')}</a>`).join('、')}）</p>`;
  body.querySelector('.lw-bud-more').outerHTML = fnSec + cutSec + minSec + src;
}

// ---- 議程: 立法院's meetings, today's live ------------------------------------------------

// The agenda: this deploy's copy (meetings from three days back), today's
// meetings read again from the 立法院 API (its 發言名單 fills in on the day),
// and what IVOD streams now (live.yml's live.json: each meeting's channel).
let lyAgenda;
const LIVE_URL = 'https://raw.githubusercontent.com/JayPengX/Orbit-Law/live/live.json';
const liveData = () => fetch(`${LIVE_URL}?t=${Math.floor(Date.now() / 60e3)}`, { signal: AbortSignal.timeout(6000) }).then(r => (r.ok ? r.json() : null)).then(l => (l && l.at && Date.now() - Date.parse(l.at) < 12 * 3600e3 ? l.rooms || [] : null)).catch(() => null);
const agendaData = () =>
  (lyAgenda ||= (async () => {
    const [a, live] = await Promise.all([data('ly/agenda.json').catch(() => ({ meets: [] })), liveData()]);
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
const meetWhat = m => String(m.why || m.title).split(/\n|。(?=[二三四五六七八九十]+、)/)[0].replace(/^[一二三四五六七八九十]+、/, '').replace(/^(繼續)?審查/, W('審查', 'Review: ')).slice(0, 90);
// The bill items a meeting takes up: by 立法院 law id, or a law named in its 事由.
const meetItems = m => {
  const laws = new Set(m.bills.flatMap(b => b.laws));
  return state.items.filter(it => !it.dropped && it.term && (laws.has(it.law) || m.why.includes(`「${it.n}`))).sort((a, b) => (a.u < b.u ? 1 : -1));
};

// A sitting's state, IVOD's word first when it has one for today: live only while it streams.
const liveState = (x, live) => {
  const st = sittingState(x);
  const r = live && (st === 'live' || st === 'later' || st === 'done') ? liveOf(live, x.m, x) : null;
  if (!r) return st;
  return /進行中/.test(r.status) ? 'live' : /結束|散會/.test(r.status) ? 'done' : /休息/.test(r.status) ? 'break' : st === 'live' ? 'later' : st;
};
const meetRow = (x, live = null) => {
  const st = liveState(x, live);
  const items = meetItems(x.m).length;
  return `<a class="lw-meet${st === 'live' ? ' live' : st === 'done' ? ' done' : ''}" href="#meet=${esc(encodeURIComponent(x.m.id))}&amp;d=${esc(x.d)}"><span class="lw-meet-time"><b>${esc(hm(x.from) || '–')}</b><small>${esc(hm(x.to))}</small></span><span class="lw-meet-text"><span class="lw-meet-top"><b class="q-fit">${esc(roomShort(x.m))}</b>${roomShort(x.m) !== kindLabel(x.m.kind) && st !== 'live' && st !== 'break' ? kindTag(x.m.kind) : ''}${st === 'live' ? `<span class="lw-live">${W('直播中', 'Live')}</span>` : st === 'break' ? countTag(W('休息中', 'On a break'), 'orange') : ''}</span><span class="lw-meet-what">${esc(meetWhat(x.m))}</span>${items ? `<small>${esc(W(`${items} 個法案`, `${items} bill${items === 1 ? '' : 's'}`))}</small>` : ''}</span></a>`;
};

async function agendaList(out) {
  out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(3)}</div>`;
  let a;
  try {
    a = await agendaData();
  } catch {
    return void (out.innerHTML = `<div class="q-empty lw-empty-sm"><strong>${W('議程讀不到，請稍後再試', 'Couldn’t load the agenda')}</strong></div>`);
  }
  if (billFilter !== 'agenda') return;
  const { day } = twNow();
  const words = billQuery ? expand(billQuery) : [];
  const all = sittings(a.meets).filter(x => x.d >= day && (!words.length || words.some(w => `${x.m.room}${x.m.title}${x.m.why}`.includes(w))));
  const live = all.filter(x => ['live', 'break'].includes(liveState(x, a.live)));
  const row = x => meetRow(x, a.live);
  const days = [...new Set(all.map(x => x.d))];
  const html =
    (live.length && !words.length ? section(W('現在開會中', 'Meeting now'), `<div class="lw-meets">${live.map(row).join('')}</div>`) : '') +
    days.map(d => section(meetDay(d), `<div class="lw-meets">${all.filter(x => x.d === d && !(live.includes(x) && !words.length)).map(row).join('')}</div>`)).join('');
  out.innerHTML = html.replace(/<section[^>]*>(?:(?!<\/section>).)*<div class="lw-meets"><\/div><\/section>/gs, '') || `<div class="q-empty lw-empty-sm"><strong>${W(words.length ? '議程裡沒有符合的會議' : '接下來還沒有排會議', words.length ? 'Nothing on the agenda matches' : 'No meetings scheduled yet')}</strong></div>`;
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
  const r = a.live && ['live', 'break', 'later', 'done'].includes(st) ? liveOf(a.live, m, sx) : null;
  const IVOD_LIVE = 'https://ivod.ly.gov.tw/Live';
  if (r?.ch && st === 'live') {
    const v = h('video', { class: 'lw-video', controls: '', playsinline: '', autoplay: '', muted: '' });
    v.muted = true;
    body.push(v, h('p', { class: 'lw-hint-sm', text: W('立法院 IVOD 直播（這場會議的頻道）。點影片開聲音。', '立法院 IVOD live, this meeting’s own channel. Tap for sound.') }));
    playHls(v, liveHls(r.ch)).catch(() => v.replaceWith(h('a', { class: 'q-btn block', href: IVOD_LIVE, target: '_blank', rel: 'noopener', text: W('到立法院 IVOD 看直播', 'Watch on 立法院 IVOD') })));
  } else if (['live', 'break', 'later', 'done'].includes(st)) {
    const why = st === 'later' ? W(`${hm(x.from)} 開始，開會後這裡就能看直播。`, `Starts ${hm(x.from)}; the live video shows here once it begins.`) : st === 'break' ? W('休息中，回來開會後這裡會接著播。', 'On a break; the video resumes here.') : st === 'done' ? W('今天的會開完了，影片整理好後會在 IVOD。', 'Over for today; the video goes up on IVOD.') : W('立法院還沒說這場在哪個頻道播，可先到 IVOD 看。', '立法院 hasn’t listed this meeting’s channel yet; try IVOD.');
    body.push(h('div', { class: 'lw-video-wait', html: `<p>${esc(why)}</p>${st === 'live' ? `<a class="q-btn block" href="${IVOD_LIVE}" target="_blank" rel="noopener">${W('到立法院 IVOD 看直播', 'Watch on 立法院 IVOD')}</a>` : ''}` }));
  }
  body.push(h('div', { class: 'lw-meet-head', html: `<div class="lw-meta">${kindTag(m.kind)}${st === 'live' ? `<span class="lw-live">${W('直播中', 'Live')}</span>` : ''}</div><h2>${esc(m.title)}</h2><p>${esc([meetDay(x.d), x.from && `${hm(x.from)}–${hm(x.to)}`, x.place].filter(Boolean).join(' · '))}</p>` }));
  const items = meetItems(m);
  if (items.length) body.push(h('div', { class: 'lw-person-sec', html: `<h4>${W(`議程上的法案（${items.length}）`, `Bills on it (${items.length})`)}</h4>${grid(items.slice(0, 12).map(it => billCard(it, { topic: itemTopic(it), en, wide: true })))}` }));
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
  if (st !== 'ahead' && st !== 'later')
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
  if (m.why) body.push(h('details', { class: 'lw-fold' }, [h('summary', { text: W('會議事由', 'What’s on it, as listed') }), h('p', { class: 'lw-meet-why', text: m.why })]));
  const links = [x.ppg && `<a class="q-btn block" href="${esc(x.ppg)}" target="_blank" rel="noopener">${W('立法院議事網', '立法院 page')}</a>`, ...(st === 'ahead' || st === 'later' ? [] : m.videos).slice(0, 2).map((v, i) => `<a class="q-btn block" href="${esc(v)}" target="_blank" rel="noopener">${W(`會議影片 ${m.videos.length > 1 ? i + 1 : ''}（IVOD）`, `Meeting video ${m.videos.length > 1 ? i + 1 : ''} (IVOD)`)}</a>`)].filter(Boolean).join('');
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
  delegReady = Promise.all([data('deleg.json').then(r => (state.regLaws = r || {})).catch(() => {}), data('agency/counts.json').then(r => (state.agencyLaws = r || {})).catch(() => {})]);
  rulingsReady = data('rulings/laws.json')
    .then(r => {
      state.rulingLaws = r;
      if (state.tab === 'laws' && !state.law) drawResults();
    })
    .catch(() => {});
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
if (!gated)
  booted.then(ok => {
    if (!ok) return;
    start();
    signIn();
    keepOffline();
  });
watchUpdates({ current: BUILD, key: 'orbitLaw', cachePrefix: 'orbit-law-' });
