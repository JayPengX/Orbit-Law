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
import * as kitUI from '#kit/ui.mjs';
import { orbitSession, installGate, topActions, tabBar, watchUpdates, keepOffline, haptic } from '#kit/orbit.mjs';
import { h, sheet, search, toast, wireNavTitles, dayBar, dayStep, daySwipe, emptyHtml, sectionHtml } from '#kit/ui.mjs';
import { passSync } from '#kit/pass-sync.mjs';
import { dayOffOn, loadDayOff, placeOf } from '#kit/dayoff.mjs';
import { W, en } from '#kit/lang.mjs';
import { siteReader } from '#kit/data-pack.mjs';
import { nameMap, parentLaw, abbr } from './lib/refs.mjs';
import { searchLaws, rankLaws, parseJump, likelyLaw, ymd, relatedLaws } from './lib/search.mjs';
import { expand, concepts, lawGroups, orderLaws, snippet, QUICK, QUICK_EN, phraseHits } from './lib/find.mjs';
// A quick search's name in the reader's language.
const quickName = w => (en && QUICK_EN[w]) || w;
import { lawHtml, articleHtml, articlesBetween, contents, timeline, esc, artLabel, rangeLabel, freshMarks, plainHtml, linkedHtml, ruleHtml, proseHtml, notesHtml } from './lib/view.mjs';
import { PASSED, PROMULGATED, whyOf, openRound, passedRoundOf, articlesTouched } from './lib/bills.mjs';
import { compactMeet, sittings, meetState, nextSitting, twNow, liveOf, liveHls } from './lib/agenda.mjs';
import { keptRules, loadMine, saveMine, toggleFollow, markSeen, addRecent, toggleMark, isMarked, lawsChanged, newCount, newsKeys, billMoved, loadTold, saveTold, today, encodeMine, decodeMine, mergeMine } from './lib/store.mjs';
import { askLaw, askBill, askDiff, askRuling, askTown, askError, passFetch, MAX_Q } from './lib/ask.mjs';
import { searchText } from './lib/fulltext.mjs';
import { COURTS, courtOf, rulingUrl, caseKind, caseNo, caseQuery, caseMatch, lowCode, lowCourtName, lowLevel } from './lib/rulings.mjs';
import { isCons, consLabel, consOrder, consOfJid, citedBy, interpPage, JUDGMENTS_PAGE } from './lib/cons.mjs';
import { noticeUrl, isOpen } from './lib/notices.mjs';
import { linkTrail } from './lib/stack.mjs';
import { TOPICS, topicOf, partyOf } from './lib/topics.mjs';
import { personVotes, alignment, pctText, INDEPENDENT, gazetteUrl, ivodUrl, personFeed, feedNew, voteWhat, budgetKey } from './lib/ly.mjs';
import { money, change, budgetSteps, budgetDue, daysBetween, roadSteps, stuckMonths } from './lib/budget.mjs';
import { topicTile, topicName, progress, stageShort, partyChips, shortDay, dayOf, billCard, lawRow, fit, funnel, billFunnel, diffBlocks, stepOf, STEPS, whereNow, articleChips, roundSteps, STEP_HELP, passedView, itemHref, spreadCols } from './lib/cards.mjs';
import { readable, pageUrl, readPage, hasText, namesIn } from './lib/reader.mjs';
import { KINDS, LOCAL_SUBKINDS, kindOf, isRule, ruleParts, ruleFile, partLabel, localKindOf, ruleP } from './lib/kinds.mjs';
import { ruleDoc } from './lib/rule-doc.mjs';
import { weekOf } from './lib/weekly.mjs';
import { basisOf as basisIn } from './lib/deleg.mjs';
import { readJudgment, outcome, partiesLine } from './lib/judgment.mjs';
import { compactCouncilBill, newestBills, outcomeOf, OUTCOME, councilState, ccSearch, ccBill, theirBills, ccSpeech, speechesOf, zhName, textBucket, sessionBillsFile, ccSittings, compactSitting, saneSittings, ccTermSittings, councilDays } from './lib/council.mjs';
// Councils whose bills' PDFs the build reads into their parts (scripts/build-council-text.mjs).
const PDF_TEXT = new Set(['hsq', 'hsz']);
import { videosOf, ytSite } from './lib/council-video.mjs';
import './testing.mjs';
import { keepPlaying } from './lib/player.mjs';
import { TOWN_SITES, sessionState, drivePlayer, drivePage, driveFile, paperFile } from './lib/town-site.mjs';
import { TOWN_YOUTUBE } from './lib/town-video.mjs';
import { splitClauses, contractKind, sidesOf, prepClauses, cleanCheck, levelCounts, fileBase64, LEVELS, KIND_NAMES, CONTRACT_MAX } from './lib/contract.mjs';
import { chatLaw, chatError, stageText, STARTERS, askIdeas, MAX_CHAT_Q, mineOf, CITIES, readCity, saveCity, citiesOf, answerText as chatAnswerText, answerCites } from './lib/chat.mjs';
import { readLog, noteRead, lawPlace } from './lib/reading.mjs';
import { forYou, lawItem as pickItem, COMMON } from './lib/foryou.mjs';
import { parseHistory } from './lib/history.mjs';
import { loadChats, saveChats, putChat, renameChat, dropChat, newChatId, chatGroups, chatGist, chatMatches, questionsIn } from './lib/chats.mjs';

const $ = id => document.getElementById(id);
// A part drawn again only when what it shows has changed. A tab you come
// back to is shown at once as you left it (the kit's tabBar), and the app
// draws it again once the pill lands: rebuilt whole, its pictures were
// decoded again (a flash on an iPhone) and a part filled later (我的's 立委,
// 首頁's 政府公告) was gone for a moment, so the page was short and your place
// fell back up (Jay 2026-11-05). Now the same words leave the same nodes.
// Only while they are still the nodes it drew: a part written over in between (a skeleton, another door's
// list) is drawn again, or 議會 came back from 立委 as skeletons for good (Jay 2026-11-11).
const drawn = new WeakMap();
function paint(el, html) {
  const was = el && drawn.get(el);
  if (!el || (was?.html === html && el.firstChild && el.firstChild === was.node)) return false;
  el.innerHTML = html;
  drawn.set(el, { html, node: el.firstChild });
  return true;
}
// A part filled after its tab is drawn (an id'd placeholder): its last drawing
// stands in its place on the next one, and is put in only when it changed.
const later = {};
const laterHtml = id => later[id] || `<div id="${id}"></div>`;
function fillLater(id, html) {
  const el = $(id);
  const own = html.replace(/^<(\w+)/, `<$1 id="${id}" data-filled="1"`);
  if (!el || (later[id] === own && el.dataset.filled === '1')) return;
  later[id] = own;
  el.outerHTML = own;
}
// Chinese with no English (a case number, a bill's name), marked as such in English.
const zhIn = t => (en && /[\u4e00-\u9fff]/.test(t) ? `<span lang="zh-Hant">${esc(t)}</span>` : esc(t));

// ---- Every screen (the kit's DESIGN §10): one column on a phone; on a
// wider page a tab's sections side by side, each laid out as on a phone.
// cols() takes the sections in the phone's order, each with the column it
// sits in when there are two (and three, where the tab lays out three).
let screen = kit.screenFit?.() || { wide: false, w3: false };
const nCols = (most = 2) => Math.min(most, screen.w3 ? 3 : screen.wide ? 2 : 1);
function cols(parts, most = 2) {
  const shown = parts.filter(p => p[0]);
  // (No more columns than sections: one alone, as 我的 with only 最近看過, spans the page, no empty column beside it.)
  const n = Math.min(nCols(most), shown.length);
  if (n <= 1) return shown.map(p => p[0]).join('');
  const out = spreadCols(shown, n);
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
  if (state.tab === 'bills' && billFilter === 'council') drawBillList();
});
const BUILD = document.querySelector('meta[name="build-version"]')?.content || 'dev';
document.documentElement.lang = en ? 'en' : 'zh-Hant';

// ---- Orbit Pass: the Home Screen gate, the sign-in, the account button -----------------

const q = orbitSession('law', { lang: en ? 'en' : 'zh' });
// 為你推薦 learns from what's opened and passed over (the kit's feedback.mjs, the
// family's one engine, kept on the Pass; loaded on the side: an older kit ranks without it).
let feedback = null;
import('#kit/feedback.mjs')
  .then(m => {
    feedback = m;
    feedback.keep?.(q, 'law');
  })
  .catch(() => {});
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

// Most files are in packs (scripts/pack-data.mjs, the Free plan's 20,000 files a site): the kit's
// siteReader reads any path as its own file, a pack read once for the hundreds of files in it.
const readData = siteReader('./data/');
const cache = new Map();
async function data(path) {
  if (cache.has(path)) return cache.get(path);
  const p = readData(path).then(j => {
    if (j == null) throw new Error(`${path}: 404`);
    return j;
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}
// A law or a 命令 (MOJ's), or a rule read off a ministry's or a city's site, read into the same shape (lib/rule-doc.mjs).
const lawFile = p => (isRule(p) ? ruleFileDoc(p) : data(`law/${p}.json`));
async function ruleFileDoc(p) {
  const { dir, id } = ruleParts(p);
  const f = await data(`${dir}/text/${ruleFile(id)}.json`);
  const doc = ruleDoc(f, p, { sub: f.k || (dir === 'local' ? localKindOf(f.n) : '行政規則') });
  // What it is made under: the build's (B), else read off its first lines here (a text from before the build kept it).
  doc.basis = f.B || (state.names.size ? basisIn(f.t, state.names) : []);
  if (!doc.laws.length) doc.laws = [...new Set(doc.basis.map(b => b.slice(0, b.indexOf(':'))))];
  noteRule(p, doc.n, doc.c, doc.l, doc.m, doc.a.filter(a => a[0] === 'A').length);
  return doc;
}
// A rule's row where the laws' rows are (state.byCode), and on 我的's list of rules it knows by name.
function noteRule(p, n, c, k, m = '', count = 0) {
  state.byCode.set(p, [p, n, k, c, m, 0, 0, count]);
  state.mine.rules ||= {};
  state.mine.rules[p] = [n, c, k];
}
// A part's word in the law open (第 3 條, a 要點's 第 3 點).
const artOf = (k, law = state.law) => partLabel(k, law?.u || '條', en);
// A text's kind in words: 法律, 命令, 行政規則, or a city's 自治條例/自治規則/委辦規則/行政規則.
function kindName(row) {
  const k = kindOf(row[0], row[2]);
  if (k === 'local') return en ? LOCAL_SUBKINDS.find(x => x.id === row[2])?.en || 'Local rule' : row[2] || '地方法規';
  const K = KINDS[k];
  return en ? K.oneEn || K.en : K.one || K.zh;
}
const enFile = p => data(`en/${p}.json`);

const state = { consTop: [], lawCons: {}, rulingLaws: {}, lowLaws: {}, lowNames: {}, lawRulings: {}, regLaws: {}, agencyLaws: {}, agency: { to: {}, rest: [] }, deleg: { to: {}, rest: [], from: [] }, latestRulings: [], tab: 'home', rows: [], byCode: new Map(), names: new Map(), items: [], itemsByLaw: new Map(), notices: [], noticesByLaw: new Map(), changes: { items: [] }, mine: loadMine(), law: null, showEn: false, query: '', topic: '' };
// What's followed: this phone's copy, then the Pass's (merged, written back).
let pass = null;
const save = () => {
  state.mine.rules = keptRules(state.mine);
  saveMine(state.mine);
  badge();
  if (pass) (pass.changed(), pass.sync());
};
// The 我的 tab's count: followed laws amended, followed bills moved and
// followed legislators with news, one each, that came since the tab was last
// open (never the laws only looked at). While the tab is open it's told.
let told = loadTold();
const badge = () => {
  const keys = newsKeys(state.mine, state.items, state.changes, { ...state.peopleLast, ...Object.fromEntries(Object.entries(state.ccLast || {}).map(([k, d]) => [`cc:${k}`, d])) });
  if (state.tab === 'mine' && document.visibilityState !== 'hidden' && keys.some(k => !told.includes(k))) saveTold((told = [...new Set([...told.filter(k => keys.includes(k)), ...keys])]));
  tabs.badge('mine', newCount(keys, told));
};
document.addEventListener('visibilitychange', () => badge());
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
// A law's short name in a sheet's title (English: its English name), and the same before an article ("Civil Code Article 184").
const lawShort = law => (en ? nameOf(law.p, law.n) : shortName(law.n));
const lawAt = law => (en ? `${nameOf(law.p, law.n)} ` : shortName(law.n));

// ---- Tabs ------------------------------------------------------------------------------

// Orbit AI's mark (the kit's icons.ai; an older kit: the spark).
const ICON_SPARK = kitUI.icons?.ai || '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 3.8 2.2 6.4 6.6 7.4-4.4 1-6.1 3.6-6.6 7.4-.5-3.8-2.2-6.4-6.6-7.4 4.4-1 6.1-3.6 6.6-7.4zM19 15c.3 1.9 1.1 3 3 3.5-1.9.5-2.7 1.6-3 3.5-.3-1.9-1.1-3-3-3.5 1.9-.5 2.7-1.6 3-3.5z"/></svg>';
// 拍合約幫你看's: a page with lines, a camera.
const ICON_CONTRACT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
const ICON_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
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
  if (replace) history.replaceState(history.state, '', url);
  else history.pushState({ lwIn: true }, '', url);
  route();
}
addEventListener('popstate', route);
// The page Law opened on (a deep link from another app, a share, Safari's history) is marked,
// so ← there goes to 法規 rather than back out of the app to whatever came before it.
if (!history.state?.lwIn) history.replaceState({ ...(history.state || {}), lwStart: true }, '', location.href);
const goBack = () => (history.state?.lwStart ? go('tab=laws') : history.back());
// A swipe in from the left edge goes back wherever the page has a way back (a law, a kind, a
// topic, a bill's page): the kit's edgeBack, read with a fallback for an older kit on the phone.
const backOf = () => document.getElementById(`panel-${state.tab}`)?.querySelector('.lw-back:not([hidden])');
kitUI.edgeBack?.({ target: () => (backOf()?.offsetParent ? document.getElementById(`panel-${state.tab}`) : null), back: () => backOf()?.click() });

async function route() {
  // 問 Orbit's question (the Pass sheet, kit ask-orbit.mjs: #ask=<words>): asked on 問法律, as #tab=ask&q= is.
  if (/(?:^#|&)ask=/.test(location.hash)) {
    const asked = await import('#kit/ask-orbit.mjs').then(m => m.takeAsk?.() || '').catch(() => '');
    history.replaceState(history.state, '', asked ? `#tab=ask&q=${encodeURIComponent(asked)}` : '#tab=ask');
  }
  const p = new URLSearchParams(location.hash.slice(1));
  document.documentElement.toggleAttribute('data-lw-law', p.has('law'));
  document.querySelector('dialog[open]')?.close();
  const tab = p.get('tab');
  if (p.get('law')) {
    showTab('laws');
    await openLaw(p.get('law'), p.get('a'), p.get('find'));
  } else if (tab === 'bills' || p.get('item') || p.get('who') || p.get('meet') || p.get('notice') || p.get('budget')) {
    showTab('bills');
    drawBills();
    await itemsReady;
    if (p.get('item')) openItem(p.get('item').replace('-', ':'), { round: p.get('round') });
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
      history.replaceState(history.state, '', '#tab=ask');
      ask(p.get('q'));
    }
    // 拍合約幫你看 over 問法律 (#tab=ask&contract=1).
    if (p.get('contract')) contractSheet();
  } else if (tab === 'laws') {
    state.law = null;
    state.topic = TOPICS[p.get('topic')] ? p.get('topic') : '';
    // 種類: one kind of text browsed whole (#tab=laws&kind=local&g=<city>&sub=自治條例).
    state.kind = KINDS[p.get('kind')] && p.get('kind') !== 'constitution' ? p.get('kind') : '';
    state.group = p.get('g') || '';
    state.sub = p.get('sub') || '';
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

const section = (title, body, { more = '', moreHref = '', cls = '', ai = false } = {}) => (body ? sectionHtml(title, body, { more, moreHref, ai, cls: `lw-sec${cls ? ` ${cls}` : ''}` }) : '');
// An empty note with no picture (it sits in a list or a search's results); cls '': the full-size one.
const emptyNote = (title, body = '', cls = 'lw-empty-sm') => emptyHtml({ icon: '', title, body, cls });
const list = rows => (rows.length ? `<div class="lw-list">${rows.join('')}</div>` : '');
const rail = cards => (cards.length ? `<div class="lw-rail">${cards.join('')}</div>` : '');
const grid = cards => (cards.length ? `<div class="lw-grid">${cards.join('')}</div>` : '');

function lawSub(row) {
  const [, , level, , m, gone] = row;
  // The tile shows the topic, so a law's MOJ category is left out.
  const what = isRule(row[0]) ? [kindName(row), row[3]].filter(Boolean).join(' · ') : level === '命令' ? W('命令', 'Regulation') : '';
  return [what, m && `${W('修正', 'Rev.')} ${shortDay(m)}`, gone && W('已廢止', 'Repealed')].filter(Boolean).join(' · ');
}
// A law's row; the judgments citing it as a tag when nothing else is on the right.
// In English the row is named in English (where the MOJ has it).
const lawItem = (row, sub, extra = '', href) => lawRow(en ? [row[0], nameOf(row[0], row[1])] : row, { topic: rowTopic(row), sub: sub ?? lawSub(row), extra: extra || (state.rulingLaws[row[0]] || state.lowLaws[row[0]] ? `<span class="lw-tag court">${ICON_GAVEL}${((state.rulingLaws[row[0]] || 0) + (state.lowLaws[row[0]] || 0)).toLocaleString('en-US')}</span>` : ''), href });
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
  const kinds = [[c.amended, '改第 ', 'Art. ', '改', 'amended'], [c.added, '增第 ', 'new ', '增', 'new'], [c.removed, '刪第 ', 'removed ', '刪', 'removed']];
  const parts = kinds.filter(([ks]) => ks.length).map(([ks, zh, e, zhN, eN]) => (brief && ks.length > 2 ? W(`${zhN} ${ks.length} 條`, `${ks.length} ${eN}`) : (en ? e : zh) + keys(ks)));
  return `${W('修正', brief ? 'Rev.' : 'Amended')} ${shortDay(c.m)}${parts.length ? ` · ${parts.join(W('・', ' · '))}` : ''}`;
}
// 新 on an amendment from the last two weeks; older ones in the list go untagged.
const freshTag = c => (globalThis.ORBIT_TEST?.flags?.lawNew || Date.now() - Date.parse(`${c.m.slice(0, 4)}-${c.m.slice(4, 6)}-${c.m.slice(6, 8)}`) <= 14 * 864e5 ? countTag(W('新', 'New'), 'green') : '');
const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const CHEVRON = '<svg class="lw-chev" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m1.5 1.5 5 5.5-5 5.5"/></svg>';

// ---- 首頁 ---------------------------------------------------------------------------------

const LIVE = it => !it.dropped && !it.held && it.open && it.stage >= 1 && it.stage < PASSED;

// 立法院 today, into 最新動態's first row (its place held from the first
// drawing: only its words change), and the ministries' notices into #home-news.
let lyLine = null;
function lyText(a) {
  const all = sittings(a.meets);
  const live = all.filter(x => ['live', 'break'].includes(liveState(x, a.live)));
  if (live.length) return { live: true, t: W(`開會中 · ${live.length} 場直播`, `In session · ${live.length} live`), s: live.map(x => roomShort(x.m)).join(W('、', ', ')) };
  const { day } = twNow();
  const today = all.filter(x => x.d === day);
  const states = today.map(x => liveState(x, a.live));
  const next = all.find(x => x.d > day && liveState(x, a.live) !== 'off');
  const nextLine = next ? W(`下次開會：${meetDay(next.d)}，${all.filter(x => x.d === next.d).length} 場`, `Next: ${meetDay(next.d)}, ${all.filter(x => x.d === next.d).length} meetings`) : W('看議程', 'See the agenda');
  const ahead = today.filter((x, i) => !['done', 'off'].includes(states[i]));
  if (ahead.length) return { t: W(`今天 ${today.length} 場會議`, `${today.length} meetings today`), s: W(`${hm(ahead[0].from) || ''} 開始 · ${roomShort(ahead[0].m)}`, `From ${hm(ahead[0].from) || ''} · ${roomShort(ahead[0].m)}`) };
  if (today.length && states.every(st => st === 'off')) return { t: lyDayOff(day) ? W('颱風停會', 'Typhoon: no sitting') : W('今日停會', 'No sitting today'), s: nextLine };
  if (today.length) return { t: W('今日已散會', 'Done for today'), s: nextLine };
  return { t: W('今天沒有開會', 'No sitting today'), s: nextLine };
}
const lyRowInner = () => `${topicTile('gov', 'sm')}<span class="lw-row-text"><span class="lw-row-name${lyLine?.live ? ' nv-live' : ''}" id="home-ly-t">${esc(lyLine ? lyLine.t : W('立法院', 'Legislative Yuan'))}</span><small id="home-ly-s"${lyLine ? '' : ' class="q-skel"'}>${esc(lyLine ? `${W('立法院', 'Legislature')} · ${lyLine.s}` : '\u00a0')}</small></span>${CHEVRON}`;
function fillHome() {
  agendaData()
    .then(a => {
      lyLine = lyText(a);
      const row = $('home-ly');
      paint(row, lyRowInner());
    })
    .catch(() => {
      lyLine ||= { t: W('立法院議程', 'Legislature agenda'), s: W('看開會和直播', 'Sittings and live video') };
      const row = $('home-ly');
      paint(row, lyRowInner());
    });
  // 政府公告: the ministries' latest notices (they open in the reader).
  newsData()
    .then(d => {
      const el = $('home-news');
      const rows = (d.news || []).slice(0, 4);
      if (el && rows.length) fillLater('home-news', section(W('政府公告', 'Government notices'), `<div class="lw-list lw-news">${rows.map(([day, gov, t, url]) => `<a class="lw-row" href="${esc(url)}">${topicTile('gov', 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(t)}</span><small>${esc(`${gov} · ${shortDay(day)}`)}</small></span></a>`).join('')}</div>`));
    })
    .catch(() => {});
}
// Laws as book covers (Books' shelves): the topic's colour, its mark, the name.
const covers = rows => (rows.length ? `<div class="lw-covers">${rows.map(r => `<a class="lw-cover" href="#law=${esc(r[0])}" style="--t:${TOPICS[rowTopic(r)].color}"><span class="lw-cover-art">${svgTopic(rowTopic(r))}<b class="q-fit-wrap">${esc(en ? nameOf(r[0], r[1]) : shortName(r[1]))}</b><small>${esc(topicName(rowTopic(r), en))}</small></span></a>`).join('')}</div>` : '');
// 繼續閱讀: the last things read, any kind, each opening where you were
// (a law at its article, with how far through), newest first: a short list.
function resumeRows() {
  const log = readLog().slice(0, 3);
  return log.length
    ? `<div class="lw-list nv-resume">${log
        .map(x => {
          const row = x.kind === 'law' ? state.byCode.get(x.id) : null;
          const it = x.kind === 'bill' ? state.items.find(i => i.k === x.id) : null;
          const topic = x.kind === 'law' ? (row ? rowTopic(row) : 'gov') : x.kind === 'bill' ? (it ? itemTopic(it) : 'gov') : '';
          const court = x.kind === 'cons' ? kindOfId(x.id) : x.kind === 'judgment' ? 'tps' : '';
          const tile = topic ? topicTile(topic, 'sm') : courtTile(court);
          const kind = { law: row?.[2] === '命令' ? W('子法', 'Regulation') : W('法規', 'Law'), cons: W('憲法法庭', 'Constitutional Court'), judgment: W('判決', 'Judgment'), bill: W('法案', 'Bill') }[x.kind];
          const sub = x.kind === 'bill' && it ? stageShort(it, en) : x.sub || '';
          const pct = x.kind === 'law' && x.pct > 0 ? W(`讀了 ${Math.round(x.pct * 100)}%`, `${Math.round(x.pct * 100)}% read`) : '';
          const title = x.kind === 'law' ? (en ? nameOf(x.id, x.title) : x.title) : x.title;
          return `<a class="lw-row" href="${esc(x.href)}">${tile}<span class="lw-row-text"><span class="lw-row-name nv-two">${esc(title)}</span><small class="nv-one">${esc([kind, sub, pct].filter(Boolean).join(' · '))}</small></span>${CHEVRON}</a>`;
        })
        .join('')}</div>`
    : '';
}
const svgTopic = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOPICS[id].icon}</svg>`;
// For you (lib/foryou.mjs): the laws people use most, in the subjects you
// read and keep (☆), ranked by the family's one engine (the kit's
// feedback.mjs, kept on the Pass): a subject passed over day after day makes
// way, one opened rises; never one read lately.
function recommend(recent) {
  const starred = Object.keys(state.mine.laws).map(p => state.byCode.get(p)).filter(Boolean);
  return forYou({ rows: state.rows, recent, starred, rulings: state.rulingLaws, topicOf: rowTopic, lift: feedback?.lifter?.('law') || null, n: 8 });
}
let lawNews;
// (Home's few: news-top.json, not the AI's whole news.json.)
const newsData = () => (lawNews ||= data('ai/news-top.json').catch(() => data('ai/news.json')).catch(e => ((lawNews = null), Promise.reject(e))));

function topicGrid() {
  const counts = {};
  for (const r of state.rows) if (r[2] !== '命令' && !r[5]) counts[rowTopic(r)] = (counts[rowTopic(r)] || 0) + 1;
  return `<div class="lw-topics">${Object.keys(TOPICS)
    .map(id => `<a class="lw-topic" href="#tab=laws&amp;topic=${id}" style="--t:${TOPICS[id].color}">${topicTile(id)}<span class="q-fit-wrap">${esc(topicName(id, en))}</span><small>${counts[id] ? W(`${counts[id]} 部`, `${counts[id]}`) : ''}</small></a>`)
    .join('')}</div>`;
}

// 首頁's lead and lists (Orbit's own look, docs/DESIGN.md §11; look.css).
// Search leads: one large field for both ways in (Enter or 搜尋 finds laws,
// 問法律 asks in plain words), what you searched and read last under it; then
// what 立法院 streams now (if anything) and the life situations as a compact
// list; then the shelves of what's new as before. Colour only names a topic.
const FINDS_KEY = 'law.finds.v1';
const readFinds = () => { try { const v = JSON.parse(localStorage.getItem(FINDS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
function noteFind(q, kind) {
  const list = [{ q, k: kind, u: Date.now() }, ...readFinds().filter(x => x.q !== q)].slice(0, 8);
  try { localStorage.setItem(FINDS_KEY, JSON.stringify(list)); } catch {}
}
const findGo = (q, kind) => {
  q = String(q || '').trim();
  if (!q) return;
  noteFind(q, kind);
  go(kind === 'a' ? `tab=ask&q=${encodeURIComponent(q)}` : `tab=laws&q=${encodeURIComponent(q)}`);
};
// The lead card says what the app is (Jay 2026-11-03: "you go in the home
// you immediately know what this do"): a law question asked in plain words,
// answered with the articles. Its field is made once and kept: a redraw (data
// landing) never takes what's being typed. Under the two ways in, three
// questions to tap: what you searched or asked last, else everyday ones.
let nvFind = null;
let nvAsks = null;
function findCard() {
  if (nvFind) return nvFind;
  const input = h('input', { class: 'nv-find-input', type: 'search', enterkeyhint: 'search', autocomplete: 'off', placeholder: W('例：房東扣押金合理嗎？', 'e.g. Can my landlord keep my deposit?'), 'aria-label': W('搜尋或問法律', 'Search or ask') });
  const form = h('form', { class: 'nv-find-field', role: 'search', onsubmit: e => (e.preventDefault(), findGo(input.value, 's')) }, [h('i', { class: 'nv-find-icon', html: ICON_SEARCH }), input]);
  const ways = h('div', { class: 'nv-find-ways' }, [
    h('button', { class: 'nv-way q-press', type: 'button', onclick: () => (input.value.trim() ? findGo(input.value, 's') : go('tab=laws')) }, [h('i', { html: ICON_SEARCH }), W('搜尋法規', 'Search laws')]),
    h('button', { class: 'nv-way is-ask q-press', type: 'button', onclick: () => (input.value.trim() ? findGo(input.value, 'a') : go('tab=ask')) }, [h('i', { html: ICON_SPARK }), W('問法律', 'Ask the law')]),
    h('button', { class: 'nv-way is-contract q-press', type: 'button', onclick: () => go('tab=ask&contract=1') }, [h('i', { html: ICON_SPARK }), W('拍合約幫你看', 'Check a contract')])
  ]);
  const head = h('div', { class: 'nv-find-head' }, [h('b', { class: 'nv-find-title', text: W('有法律問題？用白話問', 'A legal question? Just ask') }), h('small', { class: 'nv-find-sub', text: W('答案都附上條文，也能直接查法規、判決', 'Answers cite the law. Or look it up yourself.') })]);
  nvAsks = h('div', { class: 'nv-asks' });
  return (nvFind = h('section', { class: 'q-card nv-find' }, [head, form, ways, nvAsks]));
}
// Three questions under the field: what you searched or asked last (a tap:
// again), the everyday questions filling the rest. Always three: a row each
// on a phone, three across on a wide screen.
function asksHtml() {
  const finds = readFinds().slice(0, 3);
  const chats = loadChats().slice(0, 3).map(c => ({ q: c.t, k: 'a', u: c.u }));
  const mine = [...finds, ...chats.filter(c => !finds.some(f => f.q === c.q))].sort((a, b) => b.u - a.u).slice(0, 3);
  const starters = STARTERS.filter(([zh, e]) => !mine.some(x => x.q === W(zh, e))).slice(0, 3 - mine.length);
  const row = (href, q, mark, sub) => `<a class="nv-ask" href="${href}">${mark}<span class="nv-ask-text"><b>${esc(q)}</b><small>${esc(sub)}</small></span>${CHEVRON}</a>`;
  return [
    ...mine.map(x => row(`#${x.k === 'a' ? 'tab=ask&amp;q=' : 'tab=laws&amp;q='}${encodeURIComponent(x.q)}`, x.q, `<i class="nv-ask-mark">${ICON_CLOCK}</i>`, x.k === 'a' ? W('最近問過', 'Asked lately') : W('最近找過', 'Searched lately'))),
    ...starters.map(([zh, e, topic]) => row(`#tab=ask&amp;q=${encodeURIComponent(W(zh, e))}`, W(zh, e), topicTile(topic, 'sm'), `${topicName(topic, en)} · ${W('試試這樣問', 'Try asking')}`))
  ].join('');
}
// 依生活情境找, compact: a row a topic, its colour a mark, how many laws.
function topicList() {
  const counts = {};
  for (const r of state.rows) if (r[2] !== '命令' && !r[5]) counts[rowTopic(r)] = (counts[rowTopic(r)] || 0) + 1;
  return `<div class="nv-topics">${Object.keys(TOPICS).map(id => `<a class="nv-topic" href="#tab=laws&amp;topic=${id}" style="--t:${TOPICS[id].color}"><i></i><span>${esc(topicName(id, en))}</span><small>${counts[id] || ''}</small></a>`).join('')}</div>`;
}
// 最新動態: the law moving now, one row a side: 立法院 today (filled once its
// agenda is read, its place held), the newest amendment, the newest ruling.
function pulseHtml() {
  const amend = state.changes.items.find(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令');
  const newest = [...state.consTop, ...state.latestRulings].sort((x, y) => (x[1] < y[1] ? 1 : -1))[0];
  const law = amend && state.byCode.get(amend.p);
  const rows = [
    `<a class="lw-row" id="home-ly" href="#tab=bills&amp;f=agenda">${lyRowInner()}</a>`,
    law ? `<a class="lw-row" href="#law=${esc(amend.p)}">${topicTile(rowTopic(law), 'sm')}<span class="lw-row-text"><span class="lw-row-name nv-two">${esc(en ? nameOf(law[0], law[1]) : law[1])}</span><small class="nv-one">${esc(`${W('剛修正', 'Amended')} · ${changeText(amend, true).replace(/^\S+ /, '')}`)}</small></span>${CHEVRON}</a>` : '',
    newest
      ? `<a class="lw-row" href="${esc(rulingHref(newest[0]))}">${courtTile(kindOfId(newest[0]))}<span class="lw-row-text"><span class="lw-row-name nv-two">${esc(isCons(newest[0]) ? consName(newest) : newest[2] || caseNo(newest[0]))}</span><small class="nv-one">${esc(`${W('最新判決', 'Latest ruling')} · ${isCons(newest[0]) ? consShort(newest[0]) : courtLabel(newest[0])} · ${shortDay(newest[1])}`)}</small></span>${CHEVRON}</a>`
      : ''
  ];
  return `<div class="lw-list nv-pulse">${rows.join('')}</div>`;
}
function drawHome() {
  const panel = $('panel-home');
  // (No index on a first open offline: this, and nothing a later read draws over it; it used to be redrawn as the
  // normal 首頁 the moment the bills arrived, whose searches then found nothing.)
  if (state.noIndex) return void paint(panel, emptyNote(W('法規資料讀不到', 'The laws couldn’t be loaded'), W('請連上網路再打開一次。', 'Connect and open again.'), ''));
  const card = findCard();
  let rest = panel.querySelector(':scope > .nv-rest');
  if (!rest || card.parentNode !== panel) panel.replaceChildren(card, (rest = h('div', { class: 'nv-rest' })));
  paint(nvAsks, asksHtml());
  const items = state.items.filter(it => !it.dropped && it.u);
  const moved = [...items].sort((a, b) => (a.u < b.u ? 1 : a.u > b.u ? -1 : b.stage - a.stage)).slice(0, 10);
  const bills = state.items.length ? rail(moved.map(it => billCard(it, { topic: itemTopic(it), en }))) : `<div class="lw-rail">${'<span class="lw-bill q-skel"></span>'.repeat(3)}</div>`;
  const amended = state.changes.items.filter(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令').slice(1, 5);
  const recent = state.mine.recent.map(p => state.byCode.get(p)).filter(Boolean).slice(0, 8);
  const picks = recommend(recent);
  // (The first three are what's in view: what the engine learns a pass-over from.)
  feedback?.shown('law', picks.slice(0, 3).map(r => pickItem(r, rowTopic)));
  paint(rest, cols([
    [section(W('最新動態', 'What’s moving'), pulseHtml()), 0],
    [section(W('繼續閱讀', 'Continue reading'), resumeRows() || (recent.length ? list(recent.slice(0, 3).map(r => lawItem(r))) : ''), { more: W('我的', 'Mine'), moreHref: '#tab=mine' }), 0],
    [section(W('依生活情境找', 'By life situation'), state.rows.length ? topicList() : ''), 0],
    [section(W('立法院這週', 'Legislature this week'), bills, { more: W('全部', 'All'), moreHref: '#tab=bills' }), 1],
    [section(W('剛修正的法律', 'Just amended'), list(amended.map(c => lawItem(state.byCode.get(c.p), changeText(c, true), freshTag(c)))), { more: W('更多', 'More'), moreHref: '#tab=laws' }), 1],
    [section(W('為你推薦', 'For you'), covers(picks)), 1],
    [section(W('最新裁判', 'Latest rulings'), rail([...state.consTop, ...state.latestRulings.slice(0, 6)].map(rulingCard)), { more: W('裁判', 'Rulings'), moreHref: '#tab=rulings' }), 1],
    [laterHtml('home-news'), 0]
  ]));
  fillHome();
}

// ---- 法規: search, topics, the common laws -----------------------------------------------


const box = search({ placeholder: W('找法規、條文或生活問題', 'Search laws, articles or topics'), onInput: v => ((state.query = v), drawResults()), onSubmit: v => jump(v) });

// A topic chip tapped: where its row was, so the next topic opens with the row in the same place.
let lawChipsAt = null;
const lawChipTap = e => {
  const row = e.currentTarget.parentNode;
  lawChipsAt = { left: row.scrollLeft, top: row.getBoundingClientRect().top };
};
// (Kept, as the search box is: the tab drawn again leaves the same list.)
const resultsBox = h('div', { id: 'results' });
function drawLaws() {
  const panel = $('panel-laws');
  resultsBox.style.minHeight = '';
  if (state.kind) return void drawKind(panel);
  const chips = h('div', { class: 'q-chips lw-chips' }, [
    h('button', { type: 'button', class: 'q-chip', 'aria-pressed': String(!state.topic), text: W('全部', 'All'), onclick: () => go('tab=laws', { replace: true }) }),
    ...Object.keys(TOPICS).map(id => h('button', { type: 'button', class: 'q-chip lw-tchip', style: `--t:${TOPICS[id].color}`, 'aria-pressed': String(state.topic === id), html: `<i></i>${esc(topicName(id, en))}`, onclick: e => (lawChipTap(e), go(`tab=laws&topic=${id}`, { replace: true })) }))
  ]);
  // A topic or a quick question came from a tap: a way back (a Home Screen app has no back gesture).
  const back = state.topic || (state.linkedQuery && state.query) ? h('button', { class: 'lw-back lw-back-row', type: 'button', 'aria-label': W('返回', 'Back'), html: ICON.back, onclick: goBack }) : null;
  panel.replaceChildren(...[back, headNode(state.topic ? topicName(state.topic, en) : W('法規', 'Laws')), box, state.topic ? chips : null, resultsBox].filter(Boolean));
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

// ---- 種類: every kind of text browsed whole, each the same way ----------------------------
// (lib/kinds.mjs KINDS) 法律 and 命令 by topic, 行政規則 by ministry, 地方法規 by city and its
// four kinds; newest first, filtered by name as you type; what changed lately on top. Each
// opens in the one reader.
const KIND_ICON = () => ({
  law: svg('<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7 3 12a2.5 2.5 0 0 0 4 0zM19 7l-2 5a2.5 2.5 0 0 0 4 0z"/>'),
  order: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  agency: svg('<path d="M4 20h16M5 17h14M6 17V10M10 17V10M14 17V10M18 17V10M3.5 10h17L12 4z"/>'),
  local: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>')
});
const KIND_COLOR = { law: 'var(--q-indigo)', order: 'var(--q-teal)', agency: 'var(--q-orange)', local: 'var(--q-green)' };
let citiesIdx = null, agenciesIdx = null;
const citiesData = () => (citiesIdx ||= data('local/cities.json').catch(e => ((citiesIdx = null), Promise.reject(e))));
const agenciesData = () => (agenciesIdx ||= data('agency/agencies.json').catch(e => ((agenciesIdx = null), Promise.reject(e))));
const kindCount = { agency: 0, local: 0 };
function kindTiles() {
  const n = { law: state.rows.filter(r => r[2] !== '命令' && !r[5]).length, order: state.rows.filter(r => r[2] === '命令').length, ...kindCount };
  if (!kindCount.local) citiesData().then(c => ((kindCount.local = Object.values(c.cities).reduce((t, x) => t + x.n, 0)), state.tab === 'laws' && !state.law && !state.kind && !state.query && drawResults())).catch(() => {});
  if (!kindCount.agency) agenciesData().then(a => ((kindCount.agency = a.agencies.reduce((t, x) => t + x.n, 0)), state.tab === 'laws' && !state.law && !state.kind && !state.query && drawResults())).catch(() => {});
  return `<div class="lw-topics lw-kinds">${['law', 'order', 'agency', 'local']
    .map(k => `<a class="lw-topic lw-kind" href="#tab=laws&amp;kind=${k}" style="--t:${KIND_COLOR[k]}"><span class="lw-tile" style="--t:${KIND_COLOR[k]}">${KIND_ICON()[k]}</span><span class="q-fit-wrap">${esc(en ? KINDS[k].en : KINDS[k].zh)}</span><small>${n[k] ? W(`${n[k].toLocaleString()} 部`, n[k].toLocaleString()) : '\u00a0'}</small></a>`)
    .join('')}</div>`;
}

let kindQ = '', kindMore = 0;
const kindFilter = search({ placeholder: '', onInput: v => ((kindQ = v.trim()), (kindMore = 0), drawKindList()) });
// The rows of the kind, group and sub-kind picked: [{ p, n, sub, d, href, out }], newest first.
let kindRows = [], kindRun = 0;
async function drawKind(panel) {
  const k = state.kind;
  const run = ++kindRun;
  const K = KINDS[k];
  const back = h('button', { class: 'lw-back lw-back-row', type: 'button', 'aria-label': W('返回', 'Back'), html: ICON.back, onclick: goBack });
  const lede = h('p', { class: 'lw-kind-lede', text: W(K.hint || '', K.hintEn || '') });
  const groups = h('div', { class: 'q-chips lw-chips lw-kind-groups' });
  const subs = h('div', { class: 'q-chips q-texttabs lw-kind-subs' });
  const fresh = h('div', { class: 'lw-kind-fresh' });
  const list = h('div', { class: 'lw-kind-list', html: '<span class="q-skel" style="display:block;height:240px"></span>' });
  kindFilter.querySelector('input').placeholder = W(`在${K.zh}裡找名稱`, `Find in ${K.en.toLowerCase()} by name`);
  panel.replaceChildren(back, headNode(en ? K.en : K.zh), lede, kindFilter, groups, subs, fresh, list);
  kindFilter.querySelector('input').value = kindQ;
  const chip = (id, label, n, on, color) => `<button type="button" class="q-chip${color ? ' lw-tchip' : ''}" data-g="${esc(id)}" aria-pressed="${on}"${color ? ` style="--t:${color}"` : ''}>${color ? '<i></i>' : ''}${esc(label)}${n ? ` <small>${n.toLocaleString()}</small>` : ''}</button>`;
  const pick = (attr, v) => go(`tab=laws&kind=${k}${attr === 'g' ? (v ? `&g=${encodeURIComponent(v)}` : '') : state.group ? `&g=${encodeURIComponent(state.group)}` : ''}${attr === 'sub' ? (v ? `&sub=${encodeURIComponent(v)}` : '') : attr === 'g' ? '' : state.sub ? `&sub=${encodeURIComponent(state.sub)}` : ''}`, { replace: true });
  groups.onclick = e => { const b = e.target.closest('[data-g]'); if (b) (lawChipTap({ currentTarget: b }), (kindMore = 0), pick('g', b.dataset.g === state.group ? '' : b.dataset.g)); };
  subs.onclick = e => { const b = e.target.closest('[data-sub]'); if (b) ((kindMore = 0), pick('sub', b.dataset.sub)); };
  let changes = [];
  try {
    if (k === 'law' || k === 'order') {
      const all = state.rows.filter(r => (k === 'order' ? r[2] === '命令' : r[2] !== '命令' && !r[5]));
      const counts = {};
      for (const r of all) counts[rowTopic(r)] = (counts[rowTopic(r)] || 0) + 1;
      const g = TOPICS[state.group] ? state.group : '';
      groups.innerHTML = chip('', W('全部', 'All'), all.length, !g) + Object.keys(TOPICS).filter(id => counts[id]).map(id => chip(id, topicName(id, en), counts[id], g === id, TOPICS[id].color)).join('');
      kindRows = all.filter(r => !g || rowTopic(r) === g).sort((a, b) => (a[4] < b[4] ? 1 : -1)).map(r => ({ p: r[0], n: r[1], sub: k === 'order' ? parentName(r) : '', d: r[4], topic: rowTopic(r) }));
      changes = state.changes.items.filter(c => { const r = state.byCode.get(c.p); return r && (k === 'order' ? r[2] === '命令' : r[2] !== '命令') && (!g || rowTopic(r) === g); }).slice(0, 5).map(c => lawItem(state.byCode.get(c.p), changeText(c, true), freshTag(c)));
    } else if (k === 'agency') {
      const idx = await agenciesData();
      if (run !== kindRun) return;
      const g = idx.agencies.find(a => a.code === state.group) || idx.agencies[0];
      groups.innerHTML = idx.agencies.map(a => chip(a.code, a.name, a.n, a === g)).join('');
      const rows = await data(`agency/g/${g.code}.json`);
      kindRows = rows.map(([id, n, d, has, url]) => ({ p: ruleP('agency', id), n, sub: g.name, d: d.replace(/-/g, ''), url: has ? '' : url })).sort((a, b) => (a.d < b.d ? 1 : -1));
      const ch = await data('agency/changes.json').catch(() => ({ items: [] }));
      changes = ch.items.filter(c => c.c === g.name).slice(0, 5).map(c => ruleChangeRow(c));
    } else if (k === 'local') {
      const idx = await citiesData();
      if (run !== kindRun) return;
      const codes = Object.keys(idx.cities).sort((a, b) => CITIES.indexOf(idx.cities[a].city) - CITIES.indexOf(idx.cities[b].city));
      const mine = myCities();
      const g = idx.cities[state.group] ? state.group : codes.find(c => mine.includes(idx.cities[c].city)) || codes[0];
      const c = idx.cities[g];
      // (The reader's own city first in the row.)
      const order = [...codes.filter(x => mine.includes(idx.cities[x].city)), ...codes.filter(x => !mine.includes(idx.cities[x].city))];
      groups.innerHTML = order.map(x => chip(x, en ? cityEn(idx.cities[x].city) : idx.cities[x].city, idx.cities[x].n, x === g)).join('');
      const sub = LOCAL_SUBKINDS.some(x => x.id === state.sub) ? state.sub : '';
      subs.innerHTML = [['', W('全部', 'All'), c.n], ...LOCAL_SUBKINDS.filter(x => c.kinds[x.id]).map(x => [x.id, en ? x.en : x.id, c.kinds[x.id]])].map(([id, label, n]) => `<button type="button" class="q-chip" data-sub="${esc(id)}" aria-pressed="${id === sub}">${esc(label)} <small>${n.toLocaleString()}</small></button>`).join('');
      const hint = LOCAL_SUBKINDS.find(x => x.id === sub);
      lede.textContent = hint ? W(`${sub}：${hint.hint}`, `${hint.en}: ${hint.hintEn}`) : W(`${c.city}的自治條例（議會通過）、自治規則、委辦規則和行政規則`, `${cityEn(c.city)}’s ordinances (passed by its council) and rules`);
      const rows = await data(`local/c/${g}.json`);
      kindRows = rows.filter(r => !sub || r[2] === sub).map(([id, n, kk, d, has, url]) => ({ p: ruleP('local', `${g}:${id}`), n, sub: kk, d: String(d || '').replace(/-/g, ''), url: has ? '' : url })).sort((a, b) => (a.d < b.d ? 1 : -1));
      const ch = await data('local/changes.json').catch(() => ({ items: [] }));
      changes = ch.items.filter(x => x.p.startsWith(`local:${g}:`) && (!sub || x.k === sub)).slice(0, 5).map(x => ruleChangeRow(x));
    }
  } catch {
    if (run === kindRun) list.innerHTML = emptyNote(W('現在讀不到這類法規', 'Couldn’t load these'), W('請稍後再試。', 'Try again later.'), '');
    return;
  }
  if (run !== kindRun) return;
  subs.hidden = !subs.innerHTML;
  fresh.innerHTML = changes.length ? section(W('最近修正', 'Just amended'), list_(changes)) : '';
  groups.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  drawKindList();
}
const list_ = rows => list(rows);
// A rule's change in 修法追蹤 (local/changes.json, agency/changes.json) as a row.
const ruleChangeRow = c => lawRow([c.p, c.n], { topic: topicFor(c.p, c.n), sub: `${c.k || ''}${c.k ? ' · ' : ''}${changeText(c, true)}`, extra: freshTag(c) });
function drawKindList() {
  const box = document.querySelector('.lw-kind-list');
  if (!box) return;
  const q = kindQ;
  const hit = q ? kindRows.filter(r => r.n.includes(q)) : kindRows;
  const shown = hit.slice(0, 120 + kindMore);
  const row = r => (r.url ? `<a class="lw-row" href="${esc(r.url)}" target="_blank" rel="noopener">${topicTile(topicFor('', r.n), 'sm')}<span class="lw-row-text"><span class="lw-row-name${fit(r.n)}">${esc(r.n)}</span><span class="lw-row-meta"><small>${esc([r.sub, r.d && shortDay(r.d), W('原網站', 'its site')].filter(Boolean).join(' · '))}</small></span></span></a>` : lawRow([r.p, r.n], { topic: r.topic || topicFor(r.p, r.n), sub: [r.sub, r.d && shortDay(r.d)].filter(Boolean).join(' · ') }));
  const title = q ? W(`「${q}」${hit.length.toLocaleString()} 部`, `“${q}” · ${hit.length.toLocaleString()}`) : W(`全部 ${hit.length.toLocaleString()} 部，新的在前`, `All ${hit.length.toLocaleString()}, newest first`);
  box.innerHTML = hit.length ? section(title, `<div class="lw-list lw-kind-rows">${shown.map(row).join('')}</div>`) + (hit.length > shown.length ? `<button type="button" class="q-more lw-kind-more"><span>${W(`再看 ${Math.min(120, hit.length - shown.length)} 部`, `${Math.min(120, hit.length - shown.length)} more`)}</span></button>` : '') : emptyNote(W('沒有名稱裡有這些字的', 'No names with these words'), W('換個字，或到上面的搜尋找全文', 'Try other words, or search the full text'));
  box.querySelector('.lw-kind-more')?.addEventListener('click', () => ((kindMore += 120), drawKindList()));
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
    paint(out, quick + section(W(`法律 ${laws.length}`, `Laws ${laws.length}`), list(laws.slice(0, 300).map(r => lawItem(r)))) + (regs ? `<a class="q-more q-more-go lw-more-link" href="#tab=laws&amp;kind=order&amp;g=${esc(state.topic)}"><span>${W(`這類的命令 ${regs} 個（辦法、規則、細則）`, `${regs} regulations on this`)}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : ''));
    return;
  }
  const amended = state.changes.items.filter(c => state.byCode.get(c.p) && state.byCode.get(c.p)[2] !== '命令').slice(0, 8);
  paint(
    out,
    quick +
    cols(
      [
        [section(W('法規種類', 'Kinds'), kindTiles()), 0, 0],
        [section(W('依生活情境找', 'By life situation'), topicGrid()), 0, 0],
        [section(W('常用', 'Common'), list(COMMON.map(n => state.rows.find(r => r[1] === n)).filter(Boolean).map(r => lawItem(r)))), 1, 1],
        [section(W('最近修法', 'Just amended'), list(amended.map(c => lawItem(state.byCode.get(c.p), changeText(c, true), freshTag(c))))), 0, 2]
      ],
      3
    )
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
// Everyday words → the articles that answer them (data/ai/phrases.json, made once ahead: 押金不退 → 民法 the lease's articles).
let phraseList;
const phrases = () => (phraseList ||= data('ai/phrases.json').catch(() => ((phraseList = null), [])));
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
  paint(out, cols([[(jumpRow ? section(W('直接打開', 'Go to'), list([jumpRow])) : '') + (hero ? `<section class="q-section lw-sec">${hero}</section>` : '') + '<div id="find-said"></div>' + lawBlock, 0], [`<div id="find-arts">${arts}</div>`, arts ? 1 : 0], [nameBlocks() + ask, 0]]));
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
        if (run === findRun && el && html) el.innerHTML = `<div class="lw-find-rulings">${html}</div><a class="q-more q-more-go lw-more-link" href="#tab=rulings&amp;q=${encodeURIComponent(q)}"><span>${W(`在裁判找「${esc(q)}」`, `Search rulings for “${esc(q)}”`)}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`;
      })
      .catch(() => {});
  // 行政規則 by name (a ministry's 要點 or 注意事項 has no law of its own to open), and the cities' 地方法規.
  if ([...q].length >= 2 && !state.topic)
    for (const [dir, slot, title] of [['agency', 'find-rules', W('行政規則（要點、注意事項）', 'Agency rules')], ['local', 'find-local', W('地方法規（自治條例、規則）', 'City rules')]])
      ruleList(dir).then(rows => {
        const el = $(slot);
        if (run !== findRun || !el) return;
        const hit = byName(rows, 30);
        // (A 行政規則 also by its everyday words, made ahead: 點召 finds 召集請假.)
        for (const r of rows) if (hit.length < 6 && r[5]?.some(w => terms.some(t => t.length >= 2 && w.includes(t))) && !hit.includes(r)) hit.push(r);
        if (!hit.length) return;
        ruleHits += hit.length;
        el.outerHTML = section(title, list(hit.slice(0, 6).map(r => agencyRow(r, '', dir))));
        $('find-arts')?.querySelector('.q-empty')?.remove();
      });
  // The articles that answer the words people use (made ahead), straight to the article.
  if (!jumpTo && !state.topic)
    phrases().then(groups => {
      const el = $('find-said');
      const hit = run === findRun && el ? phraseHits(groups || [], q).filter(x => state.byCode.has(x.p)) : [];
      if (!hit.length) return;
      el.outerHTML = section(W('可能是這幾條', 'Likely these articles'), list(hit.map(x => { const r = state.byCode.get(x.p); return lawRow([x.p, `${nameOf(x.p, r[1])} ${artLabel(x.k, en)}`], { topic: rowTopic(r), sub: W('直接打開這一條', 'Open this article'), href: `#law=${x.p}&a=${x.k}` }); })));
    });
  // 立委 by name or 選區: straight to their page.
  if ([...q].length >= 2)
    peopleData()
      .then(ppl => {
        const hit = ppl.people.filter(x => !x.to && (x.n.includes(q) || x.area.includes(q))).slice(0, 4);
        const el = $('find-people');
        if (run === findRun && el && hit.length) el.outerHTML = section(W('立委', 'Legislators'), `<div class="lw-people q-rows-full q-rows-keep">${hit.map(x => `<a class="lw-person" href="#who=${esc(x.id)}" style="--p:${partyColor(x.party)}">${personPhoto(x)}<span class="lw-person-text"><b class="q-fit">${esc(x.n)}</b><small>${esc(`${partyShort(x.party)} · ${shortArea(x.area)}`)}</small></span></a>`).join('')}</div>`);
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
      cards.push(`<a class="lw-find-card" href="#law=${esc(g.row[0])}&amp;a=${esc(a.key)}" style="--t:${TOPICS[rowTopic(g.row)]?.color || 'var(--q-indigo)'}"><span class="lw-find-law">${topicTile(rowTopic(g.row), 'sm')}<b class="q-fit-wrap">${esc(nameOf(g.row[0], g.row[1]))}</b><em>${esc(artLabel(a.key, en))}</em></span><p>${snippet(a.text, words)}</p>${subs.length ? `<span class="lw-find-subs">${subs.map(([sp, sn]) => `<span data-sub="${esc(sp)}">${W('子法：', 'Rule: ')}${zhIn(sn)}</span>`).join('')}</span>` : ''}</a>`);
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

let lawRun = 0;
async function openLaw(p, at, find = '') {
  const panel = $('panel-laws');
  // (The law already open, as 法規's tab tapped again from another tab: where you were reading.)
  const fresh = state.law?.p !== p || !panel.querySelector('.lw-law');
  if (fresh) {
    // Everything the page marks on its articles is asked for at once, each waited for briefly
    // (one after another they could hold a tap for over ten seconds on a slow phone: Jay 2026-11-11).
    const run = ++lawRun;
    const wait = (pr, ms, none) => Promise.race([Promise.resolve(pr).catch(() => none), new Promise(r => setTimeout(() => r(none), ms))]);
    const lawP = lawFile(p);
    lawP.catch(() => {});
    // The bills on this law mark its articles (kept by the phone after the first time).
    const itemsP = wait(itemsReady, 1500);
    // A regulation's row (its name's links, its family) comes with the regulations' index.
    const rowP = lawP.then(() => !state.byCode.has(p) && wait(ordersReady, 3000), () => {});
    // The top courts' judgments citing its articles, then the other courts' (高等法院, 地方法院…) after them on each article.
    const rulingsP = wait(rulingsReady, 1500).then(async () => {
      const [top, low] = await Promise.all([state.rulingLaws[p] ? wait(data(`rulings/${p}.json`), 2000, {}) : {}, state.lowLaws[p] ? wait(data(`rulings/low/law/${p}.json`), 2000, {}) : {}]);
      const out = { ...(top || {}) };
      for (const [k, l] of Object.entries(low || {})) out[k] = [...(out[k] || []), ...l];
      return out;
    });
    // 憲法法庭's rulings on it, by article ('' = the law as a whole).
    // ('#': the ones about this law, not just citing an article of it in passing.)
    const consP = wait(consLaws().then(c => c[p] || {}), 2000, {}).then(async c => {
      const { '#': core = [], ...cons } = c || {};
      return { cons, core, rows: Object.keys(cons).length ? await consData().catch(() => null) : null };
    });
    // 授權: the regulations made under its articles, or (a regulation) what it rests on;
    // and the ministries' own 行政規則 under it (from their open data): linked out.
    const delegWait = wait(delegReady, 1500);
    const delegP = Promise.all([delegWait, rowP]).then(async () => ({ to: {}, rest: [], from: [], ...((state.regLaws[p] || state.byCode.get(p)?.[2] === '命令' ? await wait(data(`deleg/${p}.json`), 2000, null) : null) || {}) }));
    const agencyP = delegWait.then(async () => ({ to: {}, rest: [], ...((state.agencyLaws[p] ? await wait(data(`agency/${p}.json`), 2000, null) : null) || {}) }));
    // The cities' 地方法規 resting on it (local/law/<pcode>.json): [id, name, city, kind].
    const localP = isRule(p) ? [] : wait(localLaws(), 1500, {}).then(counts => (counts?.[p] ? wait(data(`local/law/${p}.json`), 2000, []) : []));
    let law;
    try {
      law = await lawP;
    } catch {
      if (run === lawRun) panel.innerHTML = emptyNote(W('這個法規打不開', 'This law can’t be opened'), W('請稍後再試。', 'Try again later.'), '');
      return;
    }
    const [, lawRulings, cons, deleg, agency, localUnder] = await Promise.all([itemsP, rulingsP, consP, delegP, agencyP, localP]);
    // Another law tapped while this one loaded: that one draws.
    if (run !== lawRun) return;
    state.lawRulings = lawRulings || {};
    state.lawCons = cons.cons;
    state.lawCore = cons.core;
    state.consRows = cons.rows;
    state.deleg = deleg;
    state.agency = agency;
    state.localUnder = localUnder || [];
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
  else if (fresh) scrollTo({ top: 0 });
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
    h('button', { class: 'lw-back', type: 'button', 'aria-label': W('返回', 'Back'), html: ICON.back, onclick: goBack }),
    h('div', { class: 'lw-title' }, [h('h2', { text: state.showEn ? name : shortName(name) })]),
    h('div', { class: 'lw-tools' }, [
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('找條文', 'Find'), html: ICON.find, onclick: () => toggleFind() }),
      h('button', { type: 'button', class: `lw-tool${followed ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'laws', law.p) ? (toast(W('已追蹤：修法時會標出來', 'Following: amendments will show')), lawActed(law.p)) : null, save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.laws[law.p])), haptic()) }),
      h('button', { type: 'button', class: 'lw-tool', 'aria-label': W('更多', 'More'), html: ICON.more, onclick: () => lawMenu(law, row) })
    ])
  ]);

  // The overview: what this is at a glance, then what's moving on it.
  const topic = rowTopic(row);
  const nArts = law.a.filter(a => a[0] === 'A').length;
  const rule = isRule(law.p);
  // A rule's newest version as an amendment (its text file's x), as a law's is in 修法追蹤.
  const change = rule ? (law.x && law.x.m === law.m ? { p: law.p, m: law.x.m, added: law.x.added, amended: law.x.amended, removed: law.x.removed } : null) : state.changes.items.find(c => c.p === law.p && c.m === law.m);
  const kind = law.l === '憲法' ? W('憲法', 'Constitution') : kindName(row);
  const nN = nArts.toLocaleString('en-US');
  const unitN = law.u === '點' ? W(`${nN} 點`, `${nN} points`) : W(`${nN} 條`, `${nN} articles`);
  const facts = [nArts ? unitN : '', law.m && W(`${ymd(law.m)} ${rule ? '發布' : '修正'}`, `${rule ? 'issued' : 'amended'} ${ymd(law.m)}`)].filter(Boolean).join(' · ');
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
  const doors = (rule ? [nArts ? tocDoor(law, toc, nArts) : null, ruleBasisDoor(law), ruleKinDoor(law)] : [tocDoor(law, toc, nArts), basisDoor(law), regsDoor(law), rulingDoor(law)]).filter(Boolean);
  // The card: kind and topic, the name, its facts; what's moving; the doors.
  const title = h('strong', { class: `lw-over-title lw-big-name${nameSize(name)}`, text: name });
  const over = h('section', { class: 'lw-over-card', style: `--t:${TOPICS[topic].color}` }, [
    h('div', { class: 'lw-over-top', html: `${topicTile(topic)}<span>${esc(`${kind} · ${rule ? (en ? cityEn(law.c) || law.c : law.c) : topicName(topic, en)}`)}</span>${law.ab ? countTag(W('已廢止', 'Repealed'), 'red') : ''}` }),
    title,
    h('p', { class: 'lw-over-facts', text: facts }),
    // (A 行政規則's one plain line, made once ahead by Orbit AI: Chinese only.)
    rule && law.s && !en ? h('p', { class: 'lw-over-ai', html: `${ICON_SPARK}<span>${esc(law.s)}</span>` }) : null,
    rows.length ? h('div', { class: 'lw-over-rows' }, rows) : null,
    doors.length ? h('div', { class: `lw-doors n${doors.length}` }, doors) : null
  ].filter(Boolean));
  const fw = shown.fw ? h('p', { class: 'lw-fw', text: shown.fw }) : null;
  // A rule the site gives only as an attachment (詳如附件): said, and its page a tap away.
  const only = rule && law.only ? h('div', { class: 'lw-only', html: `<p>${W('這個規定的全文在附件裡，原網站才看得到。', 'This rule’s text is in an attachment on its own site.')}</p>${/^https:\/\//.test(law.url) ? `<a class="q-more q-more-go lw-out" href="${esc(law.url)}" target="_blank" rel="noopener" data-out><span>${W('到原網站看附件', 'Open the attachment on its site')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : ''}` }) : null;
  const body = h('div', { class: `lw-law${state.showEn ? ' en' : ''}`, html: lawHtml(shown, { names: state.names, self: selfOf(law), en: state.showEn, fresh: rule ? freshMarks({ items: change ? [change] : [] }, law, en) : freshMarks(state.changes, law, en), pending: live ? Object.fromEntries(Object.entries(live.arts || {}).map(([k, n]) => [k, W(`${n} 個修正提案`, n > 1 ? `${n} proposals` : '1 proposal')])) : {}, pendingItem: live?.k.replace(':', '-'), marks: state.mine.marks.filter(m => m.p === law.p).map(m => m.k) }) });
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
  panel.replaceChildren(head, find, h('div', { class: 'lw-law-page' }, [side, h('div', { class: 'lw-law-main' }, [fw, only, body, rule ? ruleFoot(law) : null].filter(Boolean))]));
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
// A law kept (☆): its subject, for the picks.
const lawActed = p => state.byCode.get(p) && feedback?.did?.('law', pickItem(state.byCode.get(p), rowTopic).keys, 1.5);
function trackReading(law, body) {
  readOff?.();
  const p = law.p;
  // Opened (from 為你推薦 while it was in view, or anywhere): what the picks learn from.
  if (state.byCode.get(p)) feedback?.picked('law', pickItem(state.byCode.get(p), rowTopic), Date.now(), { from: 'elsewhere' });
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
      noteRead({ kind: 'law', id: p, title: law.n, href: at ? `#law=${p}&a=${at.k}` : `#law=${p}`, sub: at ? W(`讀到${artOf(at.k, law)}`, `at ${artOf(at.k, law)}`) : '', pct: at ? at.pct : 0 });
    }, 400);
  };
  addEventListener('scroll', on, { passive: true });
  readOff = () => removeEventListener('scroll', on);
}
// A row on the law's card: a coloured dot, what it is, a line under it, a chevron.
const overRow = (tone, title, sub, onclick, extra = '') => h('button', { type: 'button', class: `lw-over-row ${tone}`, html: `<span class="lw-over-text"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>${ICON_CHEV}${extra}`, onclick });
const ICON_CHEV = '<svg class="lw-chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// 最高法院判決: how many cite this law, and which articles (a tap: the list, by article).
const door = (cls, icon, n, label, onclick) => h('button', { type: 'button', class: `lw-door ${cls}`, html: `<b>${esc(typeof n === 'number' ? n.toLocaleString('en-US') : String(n))}</b><small>${esc(label)}</small>`, onclick });
// 目錄: the chapters (a tap: there); a law without chapters opens 找字.
function tocDoor(law, toc, nArts) {
  if (toc.length < 2) return door('slate', ICON.find, nArts, law.u === '點' ? W('點・找字', 'points · find') : W('條・找字', 'articles · find'), () => toggleFind());
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
  const n = new Set([...arts.flatMap(([, l]) => l), ...state.deleg.rest].map(r => r[0])).size + new Set([...Object.values(ag.to).flat(), ...ag.rest].map(r => r[0])).size + (state.localUnder?.length || 0);
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
    (state.deleg.rest.length || ag.rest.length ? `<div class="lw-reg-art"><p class="lw-list-cap">${W('其他', 'Others')}</p>${state.deleg.rest.map(([p, name]) => row(p, name)).join('')}${ag.rest.map(r => agencyRow(r, '')).join('')}</div>` : '') +
    localUnderHtml(state.localUnder || []);
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
// (Its text kept here: opened in the reader, as a law is; else on its own site.)
const agencyRow = ([id, name, agency, url, mine], label, dir = 'agency') =>
  mine
    ? lawRow([ruleP(dir, id), name], { topic: topicFor(ruleP(dir, id), name), sub: [dir === 'local' ? localKindOf(name) : '', agency, label].filter(Boolean).join(' · ') })
    : `<a class="lw-row" href="${esc(url)}" target="_blank" rel="noopener">${topicTile(topicFor('', name), 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(name)}</span><small>${esc([dir === 'local' ? localKindOf(name) : '', agency, label, W('原網站', 'its site')].filter(Boolean).join(' · '))}</small></span></a>`;

// ---- Rules (行政規則, 地方法規) in the reader: what they rest on, their kin, their source ----
let localCounts = null, localCountMap = {};
// How many 地方法規 rest on each law (local/laws.json), read once.
const localLaws = () => (localCounts ||= data('local/laws.json').then(c => (localCountMap = c || {})).catch(() => ((localCounts = null), {})));
// The cities' rules under a law, the reader's cities first, by city: [id, name, city, kind].
function localUnderHtml(list) {
  if (!list.length) return '';
  const mine = myCities();
  const byCity = new Map();
  for (const r of [...list].sort((a, b) => (mine.includes(b[2]) ? 1 : 0) - (mine.includes(a[2]) ? 1 : 0) || CITIES.indexOf(a[2]) - CITIES.indexOf(b[2]))) byCity.set(r[2], [...(byCity.get(r[2]) || []), r]);
  return `<div class="lw-reg-art"><p class="lw-list-cap">${W(`地方法規 ${list.length}`, `Local rules ${list.length}`)}</p>${[...byCity]
    .map(([city, rows]) => `<p class="lw-list-sub">${esc(en ? cityEn(city) : city)}</p>${rows.slice(0, 40).map(([id, name, , k]) => lawRow([id, name], { topic: topicFor(id, name), sub: k || localKindOf(name) })).join('')}`)
    .join('')}</div>`;
}
// A rule's 依據: the law (and article) its first lines say it is made under, else the laws it names.
function ruleBasisDoor(law) {
  const cites = (law.basis || []).map(b => b.split(':')).filter(([p]) => state.byCode.has(p));
  const laws = cites.length ? cites : (law.laws || []).filter(p => state.byCode.has(p)).map(p => [p, '']);
  if (!laws.length) return null;
  const label = ([p, k]) => `${nameOf(p)}${k ? (en ? ` Art. ${k}` : artLabel(k)) : ''}`;
  return door('indigo wide', MENU_ICON.gov, label(laws[0]), cites.length ? W('依據', 'made under') : W('相關法律', 'laws it names'), () => {
    if (laws.length === 1) return go(`law=${laws[0][0]}${laws[0][1] ? `&a=${laws[0][1]}` : ''}`);
    regSheet(cites.length ? W('依據', 'Made under') : W('相關法律', 'Laws it names'), laws.map(([p, k]) => `<button type="button" class="lw-row" data-p="${esc(p)}" data-k="${esc(k)}">${topicTile(rowTopic(state.byCode.get(p)), 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(label([p, k]))}</span></span></button>`).join(''));
  });
}
// 同一部法的其他規定: the rules (行政規則 and every city's) resting on the same law as this one.
function ruleKinDoor(law) {
  const p = (law.basis || [])[0]?.split(':')[0] || (law.laws || [])[0];
  const n = (state.agencyLaws[p] || 0) + (localCountMap[p] || 0) - 1;
  if (!p || !state.byCode.has(p) || n < 1) return null;
  return door('teal', ICON_DOC, n, W('同法規定', 'same law'), async () => {
    const [ag, loc] = await Promise.all([state.agencyLaws[p] ? data(`agency/${p}.json`).catch(() => null) : null, localLaws().then(c => (c?.[p] ? data(`local/law/${p}.json`).catch(() => []) : []))]);
    const agRows = ag ? [...new Map([...Object.values(ag.to).flat(), ...ag.rest].map(r => [r[0], r])).values()].filter(r => ruleP('agency', r[0]) !== law.p) : [];
    const locRows = (loc || []).filter(r => r[0] !== law.p);
    const html = (agRows.length ? `<div class="lw-reg-art"><p class="lw-list-cap">${W(`行政規則 ${agRows.length}`, `Agency rules ${agRows.length}`)}</p>${agRows.slice(0, 60).map(r => agencyRow(r, '')).join('')}</div>` : '') + localUnderHtml(locRows);
    sheet({ title: W(`${shortName(nameOf(p))}的其他規定`, `Other rules under ${nameOf(p)}`), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-list in-sheet wrap', html: html || `<p class="lw-none">${W('沒有其他規定', 'No other rules')}</p>` }) });
  });
}
// Under a rule's text: where it is from (its own site, a tap away).
const ruleFoot = law => h('div', { class: 'lw-rule-foot', html: `<p class="lw-page-src">${esc(W(`資料來源：${law.c}${law.dir === 'local' ? '法規查詢系統' : '主管法規'}，每天更新`, `Source: ${law.c}’s own rules site, updated daily`))}</p>${/^https:\/\//.test(law.url || '') ? `<a class="q-more q-more-go lw-out" href="${esc(law.url)}" target="_blank" rel="noopener" data-out><span>${W('到原網站看', 'Open the original site')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : ''}` });
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
  if (state.lawRulings[k]?.length || state.lawCons[k]?.length) rulingsSheet(`${lawAt(law)}${artOf(k)}`, state.lawRulings[k] || [], state.lawCons[k] || []);
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
  if (!el) return toast(W(`這部法規沒有${artOf(k)}`, `No ${artOf(k)} in this law`));
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
  for (const r of relatedLaws(state.rows, row)) rows.push([nameOf(r[0], r[1]), () => go(`law=${r[0]}`), W('相關法規', 'Related law')]);
  const s = sheet({ title: nameOf(law.p, law.n), closeLabel: W('關閉', 'Close'), body: h('div', { class: 'q-list' }, rows.map(([label, fn, sub]) => h('button', { class: 'q-cell chevron', type: 'button', onclick: () => (s.close(), fn()) }, [h('span', { class: 'q-cell-text' }, [h('span', { text: label }), sub ? h('small', { text: sub }) : null].filter(Boolean))]))) });
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
  sheet({ title: `${lawShort(law)} · ${W('修了什麼', 'What changed')}`, closeLabel: W('關閉', 'Close'), cls: 'lw-diff-sheet', body: [h('p', { class: 'lw-sub', text: changeText(change) }), out] });
  let d;
  try {
    // (A rule's old and new parts ride in its own text file, x.)
    d = isRule(law.p) ? (law.x?.arts ? { arts: law.x.arts } : null) : await data(`diff/${law.p}.json`);
  } catch {
    d = null;
  }
  const keys = d?.arts ? Object.keys(d.arts) : [...change.added, ...change.amended, ...change.removed];
  if (d?.arts && keys.length && !isRule(law.p))
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
          // No old text: the kind is the change's own word for it, and an amended article reads plain (not all green as if new).
          const kind = d?.arts
            ? !was ? ['新增', 'New', 'green'] : !now || /^[（(]刪除[）)]$/.test(now.trim()) ? ['刪除', 'Removed', 'red'] : ['修正', 'Amended', 'indigo']
            : change.removed.includes(k) ? ['刪除', 'Removed', 'red'] : change.added.includes(k) ? ['新增', 'New', 'green'] : ['修正', 'Amended', 'indigo'];
          const text = d?.arts || kind[2] === 'green' ? diffBlocks(was || null, now || null) : diffBlocks(now, now, { keep: Infinity });
          return `<article class="lw-diff"><header><a class="lw-ref" href="#law=${esc(law.p)}&amp;a=${esc(k)}" data-law="${esc(law.p)}" data-from="${esc(k)}" data-to="${esc(k)}" data-para="0">${esc(k ? artOf(k, law) : W('全文', 'Whole text'))}</a>${countTag(W(kind[0], kind[1]), kind[2])}</header><div class="lw-dtext">${text}</div></article>`;
        })
        .join('') + (d ? '' : `<p class="lw-none">${W('舊條文這次讀不到，先列出修正後的條文', 'The old text isn’t here; the articles as they are now')}</p>`)
    : `<p class="lw-none">${change.whole ? W('整部法律都是這次的條文，直接讀全文', 'The whole law is this version: read it in full') : W('這次修正沒有條文變動', 'No articles changed')}</p>`;
}

// An article's own menu (its number tapped): explain, ask, bookmark, copy, rulings.
function articleMenu(k) {
  const law = state.law;
  const marked = isMarked(state.mine, law.p, k);
  const label = `${en ? lawAt(law) : law.n}${artOf(k, law)}`;
  const rows = [
    ...(isRule(law.p) ? [] : [[W('白話解釋', 'Explain in plain words'), () => explain(law, k), 'spark'], [W('問法律：帶著這一條問', 'Ask about this article'), () => askWith(law, [k]), 'ask']]),
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
  sheet({ title: `${lawAt(law)}${one ? artLabel(ks[0], en) : rangeLabel(ks[0], ks[ks.length - 1], en)}`, closeLabel: W('關閉', 'Close'), cls: 'lw-ask-sheet', body: [quote, out, qa, sugg, form, note].filter(Boolean) });
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
function aiBox(label, run, note = W('AI 依條文回答，不是法律意見', 'AI, from the text only. Not legal advice')) {
  const el = h('div', { class: 'lw-ai' });
  const btn = h('button', { type: 'button', class: 'lw-ai-btn', html: `${ICON_SPARK}<span>${esc(label)}</span>` });
  btn.addEventListener('click', async () => {
    el.innerHTML = `<div class="lw-msg ai"><div class="lw-typing"><i></i><i></i><i></i></div></div>`;
    const r = await run();
    el.innerHTML = r.error ? `<div class="lw-msg ai thin"><p class="lw-none">${esc(askError(r.error, en))}</p></div>` : `<div class="lw-msg ai${r.covered ? '' : ' thin'}">${r.html}<p class="lw-srcs">${esc(note)}${r.left != null ? ` · ${W(`今天還能問 ${r.left} 次`, `${r.left} left today`)}` : ''}</p></div>`;
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
  const rows = l => list(l.map(r => rulingRow(r, { subHtml: [courtLabel(r[0]) && esc(courtLabel(r[0])), zhIn(caseNo(r[0])), esc(shortDay(r[1]))].filter(Boolean).join(' · ') })));
  const html = (cons.length ? `<p class="lw-list-cap">${W('憲法法庭', 'Constitutional Court')}</p>${list(cons.map(r => rulingRow(r)))}` : '') + (top.length ? `${cons.length || low.length ? `<p class="lw-list-cap">${W('最高法院・最高行政法院', 'Top courts')}</p>` : ''}${rows(top)}` : '') + (low.length ? `<p class="lw-list-cap">${W('高等法院・地方法院', 'High and district courts')}</p>${rows(low)}` : '');
  sheet({ title: label, closeLabel: W('關閉', 'Close'), body: h('div', { class: 'lw-rulings in-sheet', html }) });
}

async function copyArticle(k) {
  const a = state.law.a.find(x => x[0] === 'A' && x[1] === k);
  try {
    await navigator.clipboard.writeText(`${state.law.n}${artOf(k)}\n${a[2]}`);
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
  // (測試工具 aiFail: the route's error, nothing sent; testing.mjs.)
  const fail = globalThis.ORBIT_TEST?.flags?.aiFail;
  if (fail) return Promise.reject(Object.assign(new Error(fail), { code: fail }));
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

// A form's fields as one card: a label beside each value, people's names as chips, a long value under its label.
const fieldsHtml = rows =>
  `<dl class="lw-page-dl">${rows
    .filter(([, v]) => String(v || '').trim())
    .map(([l, v]) => {
      const names = namesIn(l, v);
      return `<div class="${!names && String(v).length > 24 ? 'long' : ''}"><dt>${esc(l)}</dt><dd>${names ? `<span class="lw-names">${names.map(n => `<span>${esc(n)}</span>`).join('')}</span>` : esc(v)}</dd></div>`;
    })
    .join('')}</dl>`;
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
    else if (b.k === 'dl') out += fieldsHtml(b.rows);
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
  // Full height from the start: sized to its three loading lines it opened as a sliver, then
  // jumped when the page came (Jay 2026-11-11: 'loads super small').
  sheet({ title: label.slice(0, 40) || W('閱讀', 'Read'), closeLabel: W('關閉', 'Close'), body, detent: 'large' });
  // A picture its site won't share (CORP): its caption stays, the picture goes.
  body.addEventListener('error', e => e.target.tagName === 'IMG' && e.target.closest('figure')?.classList.add('broken'), true);
  const fallback = `<a class="q-more q-more-go lw-out" href="${esc(u)}" target="_blank" rel="noopener" data-out><span>${W('到原網站看', 'Open the original site')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`;
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

// A judgment's point: its first lines, then a quiet bar that opens the rest (the kit's
// moreHtml), shown only when there is more than those lines. A tap on a closed point
// opens it too; 收起 closes it.
const jdMore = open =>
  kitUI.moreHtml?.({ more: W('看全文', 'Read all'), less: W('收起', 'Less'), open, cls: 'lw-jd-more', attr: 'hidden' }) ??
  `<button type="button" class="q-more lw-jd-more" aria-expanded="${open}" hidden><span>${open ? W('收起', 'Less') : W('看全文', 'Read all')}</span></button>`;
function fitJdPoints(root) {
  const fit = () => {
    // All unfolded, all measured, then all set: one layout, not one a point (a long ruling's
    // dozens of points each laid the whole sheet out again: Jay 2026-11-11, laggy).
    const points = [...root.querySelectorAll('.lw-jd-point:not(.open)')];
    for (const p of points) p.classList.remove('clip');
    // Folded only past six lines: one or two more lines are just shown.
    const more = points.map(p => {
      const t = p.querySelector('.lw-jd-text');
      return t.scrollHeight > parseFloat(getComputedStyle(t).lineHeight) * 6 + 4;
    });
    points.forEach((p, i) => {
      p.classList.toggle('clip', more[i]);
      p.querySelector('.lw-jd-more').hidden = !more[i];
    });
  };
  requestAnimationFrame(fit);
  if (root.dataset.jdFit) return;
  root.dataset.jdFit = '1';
  // A new width (turned, a window resized) fits them again.
  let w = root.clientWidth;
  new ResizeObserver(() => root.clientWidth !== w && ((w = root.clientWidth), fit())).observe(root);
  root.addEventListener('click', e => {
    const p = e.target.closest('.lw-jd-point');
    if (!p || (!p.classList.contains('clip') && !p.classList.contains('open'))) return;
    const bar = e.target.closest('.lw-jd-more');
    if (!bar && (p.classList.contains('open') || e.target.closest('a') || String(getSelection?.() || ''))) return;
    const open = !p.classList.contains('open');
    p.classList.toggle('open', open);
    p.classList.toggle('clip', !open);
    const b = p.querySelector('.lw-jd-more');
    b.setAttribute('aria-expanded', String(open));
    b.querySelector('span').textContent = open ? W('收起', 'Less') : W('看全文', 'Read all');
    // (收起 stays under the finger, the point's first lines just above it: the kit's hold-place.mjs.)
  });
}

// A judgment: the outcome first in plain words, then who, then the reasons a point at a time.
async function openJudgment(u, label = '') {
  const body = h('div', { class: 'lw-page lw-jd', html: `<p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel short"></p>` });
  sheet({ title: W('判決', 'Ruling'), closeLabel: W('關閉', 'Close'), body, detent: 'large' });
  if (label) noteRead({ kind: 'judgment', id: u, title: label, href: u, sub: '' });
  const out = `<a class="q-more q-more-go lw-out" href="${esc(u)}" target="_blank" rel="noopener" data-out><span>${W('到司法院看原文', 'Open on the Judicial Yuan')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`;
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
    // Each point whole, its sub-points hung under it; a long one shows its first lines and a
    // 看全文 bar (Jay 2026-11-06: a point cut with … and nothing said it opened).
    const point = x => `<div class="lw-jd-point clip"><b>${esc(x.head || '·')}</b><div class="lw-jd-text">${proseHtml(x.text.replace(/^[一二三四五六七八九十百]+、/, ''), state.names)}</div>${jdMore(false)}</div>`;
    body.innerHTML =
      `<header class="lw-page-head"><h3>${esc(label || r.title)}</h3><small>${esc([r.title, r.no, r.date && shortDay(r.date)].filter(Boolean).join(' · '))}</small></header>` +
      (jid ? rulingAiBtn(jid, r.no || label || r.title) : '') +
      `<div class="lw-jd-hero ${o.tone}"><span>${W('結果', 'Outcome')}</span>${o.label ? `<strong>${esc(o.label)}</strong>` : ''}${proseHtml(r.main.join('\n'), state.names)}</div>` +
      (who.length ? `<p class="lw-jd-who">${who.map(esc).join('<br>')}</p>` : '') +
      (r.reasons.length ? `<h4>${W(`理由（${r.reasons.length} 點）`, `Reasons (${r.reasons.length})`)}</h4><div class="lw-jd-points">${r.reasons.map(point).join('')}</div>` : '') +
      (r.judges.length ? `<p class="lw-page-src">${esc(W(`法官 ${r.judges.join('、')}`, `Judges ${r.judges.join(', ')}`))}</p>` : '') +
      out;
    fitJdPoints(body);
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
  sheet({ title: label.slice(0, 40), closeLabel: W('關閉', 'Close'), body, detent: 'large' });
  try {
    const [dir, file] = path.split('/');
    const r = await data(`${dir}/text/${file}.json`);
    // Its points as points, every law it names a link, then its page (Jay 2026-10-27: it read as one plain block).
    body.innerHTML = `<header class="lw-page-head"><h3>${esc(r.n)}</h3><small>${esc([r.a, r.d && ymd(r.d)].filter(Boolean).join(' · '))}</small></header><div class="lw-rule-text">${ruleHtml(r.t, state.names)}</div>${/^https:\/\//.test(r.url || '') ? `<a class="q-more q-more-go lw-out" href="${esc(r.url)}" target="_blank" rel="noopener" data-out><span>${W('到原網站看', 'Open the original site')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : ''}`;
  } catch {
    body.innerHTML = `<p class="lw-none">${W('讀不到這個規定', 'Couldn’t load this rule')}</p>`;
  }
}

// A 質詢 clip played in the app (the 立法院's own stream), with what was said.
const fmtSec = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// A recording's length as its site gives it (00:21:00, 01:40:54) in words: 21 分鐘, 1 小時 41 分.
const clipLen = t => {
  const m = String(t || '').trim().match(/^(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return String(t || '');
  const n = Math.max(1, Math.round(+(m[1] || 0) * 60 + +m[2] + +m[3] / 60));
  return n < 60 ? W(`${n} 分鐘`, `${n} min`) : W(`${Math.floor(n / 60)} 小時${n % 60 ? ` ${n % 60} 分` : ''}`, `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`);
};
async function openClip(id, label = '') {
  const body = h('div', { class: 'lw-clip-sheet', html: `<div class="lw-video q-skel"></div>` });
  sheet({ title: label.slice(0, 40) || W('質詢影片', 'Speech video'), closeLabel: W('關閉', 'Close'), body });
  try {
    const j = await fetch(`https://v2.ly.govapi.tw/ivod/${encodeURIComponent(id)}`).then(r => r.json());
    const d = j?.data;
    if (!d?.video_url) throw new Error('none');
    const lines = d.transcript?.whisperx || [];
    const yt = `https://www.youtube.com/@LegislativeYuan/search?query=${encodeURIComponent([d['委員名稱'], d['日期']].filter(Boolean).join(' '))}`;
    body.innerHTML = `<video class="lw-video" controls playsinline preload="metadata"></video><p class="lw-clip-meta"><b>${esc(d['委員名稱'] || '')}</b> ${esc([d['會議資料']?.['委員會代碼:str']?.[0] || d['會議資料']?.['種類'] || '', shortDay(d['日期'] || ''), clipLen(d['影片長度'])].filter(Boolean).join(' · '))}</p><a class="lw-yt" href="${esc(yt)}" target="_blank" rel="noopener">${ICON_YT}<span>${W('在 YouTube 找同一場', 'Find it on YouTube')}</span></a>${lines.length ? `<h4>${W('逐字稿（AI 聽寫）', 'Transcript (AI)')}</h4><ol class="lw-transcript">${lines.map((l, i) => `<li data-i="${i}" data-t="${l.start}"><time>${fmtSec(l.start)}</time><span>${esc(l.text)}</span></li>`).join('')}</ol>` : ''}`;
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
    body.innerHTML = `<p class="lw-none">${W('現在讀不到這段影片', 'Couldn’t load this video')}</p><a class="q-more q-more-go lw-out" href="${esc(ivodUrl(id))}" target="_blank" rel="noopener" data-out><span>${W('到立法院 IVOD 看', 'Watch on the Legislative Yuan’s IVOD')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`;
  }
}

// How a bill becomes law: the six steps in plain words, `at` (a step) marked.
function howBillsWork(at = -1) {
  const rows = STEP_HELP.map(([zh, zhText, e, enText], i) => `<li class="${i === at ? 'now' : i < at ? 'done' : ''}"><b>${esc(W(zh, e))}${i === at ? `<span class="lw-tag indigo">${W('在這一步', 'Here now')}</span>` : ''}</b><span>${esc(W(zhText, enText))}</span></li>`).join('');
  sheet({ title: W('法案怎麼變成法律', 'How a bill becomes law'), closeLabel: W('關閉', 'Close'), body: [h('ol', { class: 'lw-howto', html: rows }), h('p', { class: 'lw-hint-sm', text: W('同一部法常有很多版本（不同立委或政黨各提一個），委員會通常會把它們併在一起審。', 'One law often has many versions (each legislator or party files their own); committees usually review them together.') })] });
}

// A stream or file in a <video>, kept playing (lib/player.mjs: Safari's own HLS, else hls.js; a stall brought
// back where it was), a line under it while it's being brought back, and a way to try again once it gave up.
// opts: live (a channel), at (seconds to start from).
function playHls(el, url, opts = {}) {
  const note = h('p', { class: 'lw-video-note', role: 'status' });
  note.hidden = true;
  el.after(note);
  const onState = s => {
    if (s === 'retry') return void ((note.textContent = W('連線不穩，正在接回…', 'Connection unsteady: reconnecting…')), (note.hidden = false));
    if (s === 'ok') return void (note.hidden = true);
    if (s !== 'failed' || !el.isConnected) return;
    const at = opts.live ? 0 : el.currentTime || opts.at || 0;
    const box = h('div', { class: 'lw-video-wait', html: `<p>${W('影片一直接不上，可能是網路或對方的伺服器不穩。', 'The video won’t come through: the network or its server is unsteady.')}</p>` });
    box.append(
      h('button', {
        type: 'button',
        class: 'q-btn block',
        text: W('再試一次', 'Try again'),
        onclick: () => {
          const again = el.cloneNode();
          box.replaceWith(again);
          playHls(again, url, { ...opts, at }).then(() => again.play?.()?.catch(() => {})).catch(() => {});
        }
      })
    );
    note.remove();
    el.replaceWith(box);
  };
  return keepPlaying(el, url, { ...opts, onState }).catch(e => (note.remove(), Promise.reject(e)));
}

// A bill by its 立法院 number, read in the app: who, why, its steps and 對照表.
async function openBillById(id) {
  const body = h('div', { class: 'lw-page', html: `<p class="lw-page-wait q-skel"></p><p class="lw-page-wait q-skel"></p>` });
  sheet({ title: W('法案', 'Bill'), closeLabel: W('關閉', 'Close'), body, detent: 'large' });
  try {
    const b = (await fetch(`https://v2.ly.govapi.tw/bill/${encodeURIComponent(id)}`).then(r => r.json()))?.data;
    if (!b) throw new Error('none');
    const flow = (b['議案流程'] || []).map(f => `<li class="done"><b>${esc(String(f['狀態'] || '').replace(/\s*[（(].*$/, ''))}</b><span>${esc(shortDay(ymd([].concat(f['日期'] || [])[0] || '')))}</span></li>`).join('');
    const who = [...(b['提案人'] || [])];
    body.innerHTML = `<header class="lw-page-head"><h3>${esc(String(b['議案名稱'] || '').replace(/，請審議案。?$/, ''))}</h3><small>${esc([b['提案單位/提案委員'], b['提案日期'] && shortDay(b['提案日期']), b['議案狀態']].filter(Boolean).join(' · '))}</small></header>${who.length ? `<div class="lw-names">${who.map(n => `<span class="lw-name">${esc(n)}</span>`).join('')}</div>` : ''}${b['案由'] ? `<h4>${W('案由', 'Why')}</h4>${proseHtml(b['案由'], state.names)}` : ''}${b['說明'] ? `<details class="lw-fold"><summary>${W('說明', 'Explanation')}</summary>${proseHtml(b['說明'], state.names)}</details>` : ''}${flow ? `<h4>${W('審議過程', 'Steps so far')}</h4><ol class="lw-timeline">${flow}</ol>` : ''}<h4>${W('條文對照', 'What it changes')}</h4><div class="lw-diffs"></div>${b['連署人']?.length ? `<details class="lw-fold"><summary>${W(`連署 ${b['連署人'].length} 人`, `${b['連署人'].length} co-signers`)}</summary><div class="lw-names">${b['連署人'].map(n => `<span class="lw-name">${esc(n)}</span>`).join('')}</div></details>` : ''}`;
    compareBill({ id }, body.querySelector('.lw-diffs'), { first: 3 });
  } catch {
    body.innerHTML = `<p class="lw-none">${W('現在讀不到這個法案', 'Couldn’t load this bill')}</p>`;
  }
}

// One of 立法's pages, opened as a sheet over the screen it was tapped on.
function overHere(kind, id, d = '', round = '') {
  if (kind === 'item') return itemsReady.then(() => openItem(id.replace('-', ':'), { round }));
  if (kind === 'who') return openPerson(id);
  if (kind === 'notice') return noticesReady.then(() => openNotice(id));
  itemsReady.then(() => (kind === 'budget' ? openBudget(id) : openMeet(id, d)));
}
// A sheet over 我的 closed: what it marked seen (a bill, a 立委) no longer
// counts as new there. (Drawn again in place: only what changed.)
document.addEventListener('close', e => e.target.matches?.('dialog') && state.tab === 'mine' && !document.querySelector('dialog[open]') && drawMine(), true);

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
    // 立法's own pages (a bill #item=, a 立委 #who=, a budget, a 預告, a meeting)
    // tapped outside 立法 (我的, a law you're reading, 首頁): over that screen,
    // so closing it is back where you were. A bill and a 立委 in 我的 open the
    // same way (Jay 2026-11-05: a 立委 went to 立法, a bill didn't).
    if (state.tab !== 'bills' && (m = (a.getAttribute('href') || '').match(/^#(item|who|budget|notice|meet)=([^&]+)(?:&d=([^&]*))?(?:&round=(passed))?$/))) return e.preventDefault(), overHere(m[1], decodeURIComponent(m[2]), m[3] || '', m[4] || '');
    // (A budget card's link names its tab too: #tab=bills&f=budget&budget=<k>.)
    if (state.tab !== 'bills' && (m = (a.getAttribute('href') || '').match(/^#tab=bills&f=budget&budget=([^&]+)$/))) return e.preventDefault(), overHere('budget', decodeURIComponent(m[1]));
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
  const title = `${law.n === state.law?.n ? '' : lawAt(law)}${from === to ? artLabel(from, en) : rangeLabel(from, to, en)}`;
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
  // (Once the sheet has gone: a dialog closing hands focus back to what opened it, the 對話紀錄 button.)
  const toComposer = () => {
    s.el.addEventListener('close', () => $('panel-ask')?.querySelector('.lw-ask-q')?.focus(), { once: true });
    s.close();
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
      const again = e.target.closest('[data-chat]');
      if (again) openChat(again.dataset.chat);
      if (e.target.closest('.lw-pin-x')) ((chat.pin = null), drawPin());
      if (e.target.closest('.lw-new')) newChat();
      if (e.target.closest('.lw-city')) citySheet();
      const v = e.target.closest('[data-vote-id]');
      if (v) votesData().then(d => voteSheet(d.votes.findIndex(x => x[0] === v.dataset.voteId)), () => {});
      // An answer's council bill, councillor, council or 代表會: opened as the 議會 page opens them.
      const cb = e.target.closest('.lw-msg [data-cbill]');
      if (cb) openCouncilBill(cb.dataset.cbill);
      const cp = e.target.closest('.lw-msg [data-ccp]');
      if (cp) openCouncilor(cp.dataset.ccp, cp.dataset.cccode);
      const tw = e.target.closest('.lw-msg [data-town]');
      if (tw) openTown(tw.dataset.town);
      const co = e.target.closest('.lw-msg [data-ccopen]');
      if (co) (kit.writeStore?.(COUNCIL_KEY, co.dataset.ccopen), go('tab=bills&f=council'));
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
    out.innerHTML = `<div class="lw-ask-empty"><span class="lw-orb">${ICON_SPARK}</span><strong>${W('說你遇到的事，問什麼都行', 'Tell what happened, or ask anything')}</strong><p>${W('會引用條文、判決、立法院和議會的資料回答', 'Answered from the laws, rulings, the legislature and councils, cited')}</p></div>` +
      `<div class="lw-list lw-ask-list lw-contract-entry"><a class="lw-row" href="#tab=ask&amp;contract=1"><span class="lw-orb sm">${ICON_SPARK}</span><span class="lw-row-text"><span class="lw-row-name">${W('拍合約幫你看', 'Check a contract')}</span><small>${W('租約、打工契約、切結書：逐條對照法律', 'A lease, a job, a pledge: each clause against the law')}</small></span>${CHEVRON}</a></div>` +
      `<p class="lw-list-cap lw-ask-cap">${W('從這裡問起', 'Start here')}</p><div class="lw-list lw-ask-list lw-ideas">${ideasHtml()}</div>` +
      againHtml() +
      `<div class="lw-list lw-ask-list lw-city-list"><button type="button" class="lw-row lw-city">${topicTile('home', 'sm')}<span class="lw-row-text"><span class="lw-row-name">${W('地方法規', 'Local rules')}</span></span><b class="lw-row-val${city ? '' : ' off'}">${esc(cityName)}</b>${CHEVRON}</button></div>` +
      `<p class="lw-ask-foot">${W('AI 依法規與判決回答，不是法律意見。', 'AI answers from the laws and rulings; not legal advice.')}</p>`;
    return;
  }
  out.innerHTML = chat.turns.map(turnHtml).join('') + (chat.busy ? '' : `<button type="button" class="lw-new">${W('開始新對話', 'New chat')}</button>`);
}

// ---- 拍合約幫你看 -------------------------------------------------------------------------
// A contract's photos, a PDF or its pasted words read into clauses (AI, a tap;
// pasted words: code), the reader's side picked from the paper's own parties
// (code), then each clause read against the law (AI, a tap): what breaks it,
// what's unfair, what to watch, each with the articles it rests on, opened in
// the app. Nothing is kept: the pictures go to the proxy for this read only.
let contractOpen = false;
async function contractSheet() {
  if (contractOpen) return;
  contractOpen = true;
  const body = h('div', { class: 'lw-contract' });
  sheet({ title: W('拍合約幫你看', 'Check a contract'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [body], onClose: () => ((contractOpen = false), location.hash.includes('contract=') && history.replaceState(history.state, '', '#tab=ask')) });
  const ai = await import('#kit/ai.mjs').catch(() => null);
  const lang = en ? 'en' : 'zh';
  const note = text => h('p', { class: 'lw-hint-sm', text });
  const fail = (text, again = start) => body.replaceChildren(h('div', { class: 'lw-contract-fail' }, [h('p', { text }), h('button', { type: 'button', class: 'q-btn', text: W('再試一次', 'Try again'), onclick: again })]));
  if (!ai?.aiCall) return fail(W('這個功能需要更新 App，關掉重開一次。', 'Close and reopen the app to update it.'), () => location.reload());
  // While it's made: the kit's answer shape (aiAnswerWait), else the thinking line over cards the size of what comes.
  const thinking = (text, rows = 3) =>
    ai.aiAnswerWait?.({ text, rows }) ||
    h('div', { class: 'lw-contract-wait', role: 'status' }, [ai.aiThinking ? ai.aiThinking(text) : h('p', { class: 'lw-hint-sm', text }), ...Array.from({ length: rows }, (_, i) => h('span', { class: 'q-skel lw-contract-skel', style: `--w:${[100, 86, 94][i % 3]}%` }))]);

  function start() {
    const shoot = h('button', { type: 'button', class: 'q-btn primary lw-contract-pick', html: `${ICON_CAMERA}<span>${W('拍照', 'Take photos')}</span>`, onclick: () => pick(true) });
    const choose = h('button', { type: 'button', class: 'q-btn lw-contract-pick', html: `${ICON_CONTRACT}<span>${W('選照片或 PDF', 'Photos or a PDF')}</span>`, onclick: () => pick(false) });
    const bar = ai.aiBar
      ? ai.aiBar({ placeholder: W('或貼上合約全文', 'Or paste the contract'), label: W('合約全文', 'The contract'), max: CONTRACT_MAX.chars, onSend: t => pasted(t) })
      : h('textarea', { class: 'lw-contract-paste' });
    body.replaceChildren(
      h('p', { class: 'lw-contract-lead', text: W('租約、打工契約、切結書、同意書：每一條對照法律，標出違法、對你不公平和要注意的地方，附上條文。', 'A lease, a job contract, a pledge: each clause read against Taiwan’s law, marking what breaks it, what’s unfair to you and what to watch, with the articles.') }),
      h('div', { class: 'lw-contract-picks' }, [shoot, choose]),
      bar,
      note(W('一頁一張，最多 8 頁；照片只用來讀這份合約，不會保存，姓名、地址和證號會略去。AI 依條文檢查，不是法律意見。', 'One photo a page, up to 8. Photos are read for this check only and never kept; names, addresses and ID numbers are left out. AI checks against the articles; not legal advice.'))
    );
  }

  async function pick(camera) {
    const got = await ai.pickPicture?.({ camera, multiple: !camera, accept: camera ? 'image/*' : 'image/*,application/pdf' });
    const files = (Array.isArray(got) ? got : got ? [got] : []).slice(0, CONTRACT_MAX.files);
    if (!files.length) return;
    body.replaceChildren(thinking(W('讀合約中…', 'Reading the contract…'), 4));
    const pdf = files.find(f => f.type === 'application/pdf');
    let sent = [];
    if (pdf) {
      if (pdf.size > (CONTRACT_MAX.pdf * 3) / 4) return fail(W('PDF 太大了（最多約 4 MB），改拍照試試。', 'That PDF is too big (about 4 MB at most); try photos.'));
      sent = [{ mime_type: 'application/pdf', data: await fileBase64(pdf) }];
    } else {
      for (const f of files) {
        const pic = await ai.aiPicture(f, { side: 2000, quality: 0.8 });
        if (pic) sent.push(pic);
      }
      // (Over the size the proxy takes: smaller, once.)
      if (sent.reduce((n, x) => n + x.data.length, 0) > CONTRACT_MAX.bytes) sent = (await Promise.all(files.map(f => ai.aiPicture(f, { side: 1400, quality: 0.7 })))).filter(Boolean);
    }
    if (!sent.length) return fail(W('這張照片打不開，換一張試試。', 'That picture couldn’t be opened. Try another.'));
    const r = await ai.aiCall('law-contract-read', { files: sent, lang }, { timeout: 75_000 });
    if (r?.error || !r?.out) return fail(ai.aiSays(r?.error, r?.left));
    if (r.out.kind === 'none' || !r.out.clauses?.length) return fail(W('看不出這是一份合約。換一張清楚、整頁的照片再試。', 'That doesn’t read as a contract. Try a clear photo of the whole page.'));
    sides(r.out, true);
  }

  function pasted(t) {
    const clauses = splitClauses(t);
    if (!clauses.length || t.replace(/\s/g, '').length < 20) return toast(W('貼上整份合約再檢查', 'Paste the whole contract'));
    sides({ kind: contractKind(t), title: '', parties: [], clauses }, false);
  }

  // Whose side: the paper's own parties as chips; then, for a job or a pledge, whether they're 18.
  async function sides(read, byAi) {
    const clauses = prepClauses(read.clauses);
    const kind = read.kind || '';
    const fold = h('details', { class: 'lw-contract-read' }, [
      h('summary', { text: W(`讀到 ${clauses.length} 條${read.title ? `：${read.title}` : ''}`, `${clauses.length} clauses read${read.title ? `: ${read.title}` : ''}`) }),
      h('ol', {}, clauses.map(c => h('li', { text: c.text })))
    ]);
    body.replaceChildren(fold, ...(byAi && ai.aiNote ? [ai.aiNote(W('AI 讀出的原文，點開可以對照', 'Read by AI: open it to compare'))] : []));
    const list = sidesOf({ kind: kind || 'other', parties: read.parties });
    const who = ai.askBox({ q: W('你是哪一方？', 'Which side are you?'), options: list.map(x => x.label) });
    body.append(who.box);
    const a = await who.answer;
    const side = list.find(x => x.label === a.a) || { side: a.a, who: '' };
    let minor = false;
    if (kind !== 'rent') {
      const age = ai.askBox({ q: W('你滿 18 歲了嗎？', 'Are you 18 or older?'), options: [W('滿 18 歲', '18 or older'), W('未滿 18 歲', 'Under 18')] });
      body.append(age.box);
      minor = (await age.answer).a === W('未滿 18 歲', 'Under 18');
    }
    check({ kind, title: read.title || '', clauses, side: side.side, who: side.who, minor });
  }

  async function check(input) {
    const wait = thinking(W('逐條對照法律…（約 20 秒）', 'Reading each clause against the law… (about 20 s)'));
    body.append(wait);
    wait.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    const r = await ai.aiCall('law-contract', { ...input, lang }, { timeout: 110_000 });
    wait.remove();
    if (r?.error || !r?.out) return body.append(h('div', { class: 'lw-contract-fail' }, [h('p', { text: ai.aiSays(r?.error, r?.left) }), h('button', { type: 'button', class: 'q-btn', text: W('再試一次', 'Try again'), onclick: e => (e.currentTarget.parentNode.remove(), check(input)) })]));
    result(cleanCheck(r.out, input.clauses), input);
  }

  function result(c, input) {
    const counts = levelCounts(c.flags);
    const chips = cites => cites.map(k => citeChip(...k.split(':'), c.laws[k]?.[0] || nameOf(k.split(':')[0]))).join('');
    const label = i => {
      const n = input.clauses[i - 1]?.n || '';
      return n ? (/^第/.test(n) ? n : W(`第${n}條`, `Clause ${n}`)) : W(`第 ${i} 段`, `Part ${i}`);
    };
    const flag = f => `<div class="lw-block ${LEVELS[f.level].tone} lw-flag"><h4><span class="lw-tag ${LEVELS[f.level].tone === 'blue' ? 'indigo' : LEVELS[f.level].tone}">${esc(label(f.clause))}</span>${esc(f.what)}</h4>${f.why ? `<p>${esc(f.why)}</p>` : ''}${f.ask ? `<p class="lw-flag-ask"><b>${W('可以要求', 'Ask for')}</b>${esc(f.ask)}</p>` : ''}<details class="lw-flag-text"><summary>${W('原文', 'The clause')}</summary><p>${esc(input.clauses[f.clause - 1]?.text || '')}</p></details><div class="lw-cites">${chips(f.cites)}</div></div>`;
    const kindName = KIND_NAMES[c.kind || input.kind]?.[en ? 1 : 0] || '';
    const html =
      aiLine(c.summary || (c.flags.length ? W(`有 ${c.flags.length} 條要注意`, `${c.flags.length} clauses to look at`) : W('沒有找到違法的條款', 'Nothing against these articles'))) +
      `<div class="lw-facts">${Object.entries(LEVELS).map(([k, l]) => `<div class="lw-fact-${l.tone}"><small>${esc(en ? l.en : l.zh)}</small><b>${counts[k]}</b></div>`).join('')}</div>` +
      Object.keys(LEVELS)
        .filter(k => counts[k])
        .map(k => `<h3 class="lw-contract-h">${esc(en ? LEVELS[k].en : LEVELS[k].zh)} ${counts[k]}</h3>${c.flags.filter(f => f.level === k).map(flag).join('')}`)
        .join('') +
      (c.missing.length ? `<h3 class="lw-contract-h">${W('合約沒寫到', 'Not in the contract')}</h3><div class="lw-block lw-flag"><ul class="lw-points">${c.missing.map(m => `<li>${esc(m.what)} ${chips(m.cites)}</li>`).join('')}</ul></div>` : '') +
      `<p class="lw-hint-sm">${esc([kindName, input.side && W(`你是${input.side}`, `you: ${input.side}`), c.checked && W(`對照 ${c.checked} 條條文`, `${c.checked} articles read`)].filter(Boolean).join(' · '))}</p>` +
      `<p class="lw-hint-sm">${W('AI 依條文檢查，不是法律意見；重要的合約可以先問法律扶助基金會（412-8518）。', 'AI checks against the articles; not legal advice. For an important contract, ask Legal Aid (412-8518).')}</p>`;
    const out = h('div', { class: 'lw-contract-out', html });
    out.append(h('button', { type: 'button', class: 'q-btn lw-contract-again', text: W('再看一份', 'Check another'), onclick: start }));
    body.append(out);
    out.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    haptic?.();
  }

  start();
}

// 問法律's start: four questions worth asking now, each saying why it's here (lib/chat.mjs askIdeas:
// what you read last, a bill you follow, your legislators, the bill that just moved, everyday cases).
function ideasHtml() {
  const lawTopic = p => (state.byCode.get(p) ? rowTopic(state.byCode.get(p)) : 'gov');
  // (Six: a phone shows four, a wide page all six in columns; law.css.)
  const ideas = askIdeas({ reading: readLog(), items: state.items, followed: state.mine.items, people: Object.keys(state.mine.people || {}).length > 0, lawTopic, itemTopic, en, n: 6 });
  return ideas.map(x => `<button type="button" class="lw-row" data-ask="${esc(x.q)}">${topicTile(x.topic, 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(x.q)}</span><small>${esc(x.why)}</small></span>${CHEVRON}</button>`).join('');
}

// 接著問: the last chats (at most three), a tap picks one up where it was left.
function againHtml() {
  const last = chats.slice(0, 3);
  if (!last.length) return '';
  const tile = `<span class="lw-tile sm" style="--t:#4f46e5">${ICON_CLOCK}</span>`;
  return `<p class="lw-list-cap lw-ask-cap">${W('接著問', 'Pick up again')}</p><div class="lw-list lw-ask-list lw-again">${last.map(c => `<button type="button" class="lw-row" data-chat="${esc(c.id)}">${tile}<span class="lw-row-text"><span class="lw-row-name">${esc(c.t)}</span>${chatGist(c) ? `<small>${esc(chatGist(c))}</small>` : ''}</span>${CHEVRON}</button>`).join('')}</div>`;
}

// The verdict and the answer while they're still being written (the proxy streams them).
// An AI-written line under Orbit AI's mark (Jay 11-11: every AI answer carries the mark).
const aiLine = (t, cls = 'lw-verdict q-fit-wrap') => `<div class="lw-ai-head"><span class="q-ai-mark" aria-hidden="true">${ICON_SPARK}</span><p class="${cls}">${esc(t)}</p></div>`;
const draftHtml = d => (d?.verdict ? `${aiLine(d.verdict)}${d.answer ? `<p class="lw-why">${esc(d.answer)}</p>` : ''}` : '');

function turnHtml(t) {
  // (A chat saved by an older app may lack a part: each list there, empty.)
  if (t.r) t = { ...t, r: { points: [], consequences: [], next: [], followups: [], sources: [], ...t.r } };
  if (t.role === 'user') return `<div class="lw-msg me"><p>${esc(t.text)}</p></div>`;
  if (t.wait) return `<div class="lw-msg ai"><div class="lw-draft">${draftHtml(t.draft)}</div><div class="lw-typing"><i></i><i></i><i></i></div><small class="lw-srcs lw-stage">${esc(stageText(t.stage, en))}</small></div>`;
  if (t.error) return `<div class="lw-msg ai"><p class="lw-none">${esc(chatError(t.error, en))}</p></div>`;
  const r = t.r;
  const name = new Map(r.sources.map(s => [`${s.p}:${s.key}`, s.n]));
  const cases = new Map((r.cases || []).map(c => [c.jid, c]));
  const rules = new Map((r.rules || []).map(x => [x.id, x]));
  // A council's bill or a 代表會's row cited: a chip naming whose (彰化縣議會 提案, 溪湖鎮代表會 第6次定期會).
  const locals = new Map([...(r.local?.councils || []).flatMap(c => [...c.bills.map(b => [`cc:${b.id}`, `<button type="button" class="lw-ref lw-cite" data-cbill="${esc(b.id)}"><b>${esc(c.n.replace(/議會$/, ''))}</b><span>${W('提案', 'bill')}</span></button>`]), ...c.talks.map(x => [`cq:${x.id}`, `<button type="button" class="lw-ref lw-cite" data-ccp="${esc(x.who)}" data-cccode="${esc(c.c)}"><b>${esc(x.who)}</b><span>${W('質詢', 'spoke')}</span></button>`])]), ...(r.local?.towns || []).flatMap(t => t.rows.map(x => [x.id, `<button type="button" class="lw-ref lw-cite" data-town="${esc(t.tc)}"><b>${esc(t.n.replace(/民代表會$/, '代表會'))}</b><span>${esc(x.k)}</span></button>`]))]);
  const chips = cites => cites.map(c => (locals.has(c) ? locals.get(c) : cases.has(c) ? caseChip(cases.get(c)) : rules.has(c) ? ruleLink(rules.get(c), 'lw-ref lw-cite', `<b>${esc(rules.get(c).agency || W('規定', 'Rule'))}</b><span>${W('規定', 'rule')}</span>`) : citeChip(...c.split(':'), name.get(c)))).join('');
  const card = (href, title, sub, extra = '') => `<a class="lw-notice" href="${esc(href)}"${extra}><b>${esc(title)}</b><small>${esc(sub)}</small></a>`;
  const block = (cls, icon, title, inner) => `<div class="lw-block ${cls}"><h4><i>${icon}</i>${esc(title)}</h4>${inner}</div>`;
  // At a glance first: the verdict, the key facts as tiles, then the why and, for progress, the steps.
  // The text in one part and the cards in another: one under the other on a phone, side by side on a
  // wide page (law.css, Jay 2026-11-06: 問法律 a narrow column on an iPad, empty space beside it).
  const main = [
    r.verdict ? aiLine(r.verdict) : '',
    r.facts?.length ? `<div class="lw-facts${r.facts.length === 1 ? ' one' : ''}">${r.facts.map(f => `<div><small>${esc(f.k)}</small><b>${esc(f.v)}</b></div>`).join('')}</div>` : '',
    r.answer ? `<p class="${r.verdict ? 'lw-why' : 'lw-lead'}">${esc(r.answer)}</p>` : '',
    r.timeline?.length ? `<ol class="lw-time">${r.timeline.map(x => `<li><small>${esc(/^\d{4}-?\d\d-?\d\d/.test(x.d) ? shortDay(x.d) : x.d)}</small><b>${esc(x.t)}</b></li>`).join('')}</ol>` : '',
    r.points.length ? `<ul class="lw-points">${r.points.map(pt => `<li>${esc(pt.text)} ${chips(pt.cites)}</li>`).join('')}</ul>` : ''
  ].join('');
  const side = [
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
    // 議會、代表會: the bills and rows it drew on, each opening in the app; the place itself a tap away.
    ...(r.local?.councils || []).map(c => block('purple', DOOR_ICON.council, c.n, `<div class="lw-cards">${c.bills.map(b => `<button type="button" class="lw-notice" data-cbill="${esc(b.id)}"><b>${esc(b.t)}</b><small>${esc([b.by, b.res, b.d && shortDay(b.d)].filter(Boolean).join(' · '))}</small></button>`).join('')}${c.talks.map(x => `<button type="button" class="lw-notice" data-ccp="${esc(x.who)}" data-cccode="${esc(c.c)}"><b>${esc(x.t)}</b><small>${esc([x.who, W('議員質詢', 'in the council'), x.d && shortDay(x.d.replace(/-/g, ''))].filter(Boolean).join(' · '))}</small></button>`).join('')}${c.people.map(p => `<button type="button" class="lw-notice" data-ccp="${esc(p.n)}" data-cccode="${esc(c.c)}"><b>${esc(p.n)}</b><small>${W('議員', 'Councillor')}</small></button>`).join('')}<button type="button" class="lw-notice" data-ccopen="${esc(c.c)}"><b>${esc(W(`看${c.n}`, `Open ${c.n}`))}</b><small>${W('會期、議員、全部提案', 'Sessions, members, every bill')}</small></button></div>`)),
    ...(r.local?.towns || []).map(t => block('purple', DOOR_ICON.council, t.n, `<div class="lw-cards">${t.rows.map(x => `<button type="button" class="lw-notice" data-town="${esc(t.tc)}"><b>${esc(x.t)}</b><small>${esc([x.s, x.k, x.by, x.r].filter(Boolean).join(' · '))}</small></button>`).join('')}<button type="button" class="lw-notice" data-town="${esc(t.tc)}"><b>${esc(W(`看${t.n}`, `Open ${t.n}`))}</b><small>${W('會期、代表、議事錄', 'Sessions, members, minutes')}</small></button></div>`)),
    r.meets?.length ? block('red', DOOR_ICON.agenda, W('議程', 'Agenda'), `<div class="lw-cards">${r.meets.map(x => card(`#meet=${encodeURIComponent(x.id)}&d=${x.d}`, x.t, shortDay(x.d))).join('')}</div>`) : ''
  ].join('');
  const srcs = r.sources.length ? `<p class="lw-srcs">${W(`依據 ${r.sources.length} 條條文`, `From ${r.sources.length} articles`)}${r.left != null ? ` · ${W(`今天還能問 ${r.left} 次`, `${r.left} left today`)}` : ''}</p>` : '';
  const parts = `<div class="lw-msg-main">${main}</div>${side ? `<div class="lw-msg-side">${side}</div>` : ''}${srcs}`;
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
// (Its text kept here: in the reader, as a law; else its page.)
const ruleLink = (x, cls, inner) => (x.text && x.dir ? `<a class="${cls}" href="#law=${esc(ruleP(x.dir, x.id))}">${inner}</a>` : x.url ? `<a class="${cls}" href="${esc(x.url)}">${inner}</a>` : `<span class="${cls}">${inner}</span>`);

async function ask(text) {
  if (chat.busy) return;
  if (state.tab !== 'ask') {
    showTab('ask');
    drawAsk();
  }
  chat.busy = true;
  const history = chat.turns.filter(t => t.role === 'user' || t.r).map(t => (t.role === 'user' ? { role: 'user', text: t.text } : { role: 'model', text: chatAnswerText(t.r), cites: answerCites(t.r) }));
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
function rulingRow(r, { sub = '', subHtml = '' } = {}) {
  const [id, d] = r;
  const cons = isCons(id);
  const kind = kindOfId(id);
  const name = cons ? consName(r) : r[2] || caseNo(id);
  const [zh, eng, tone] = cons ? ['', '', ''] : caseKind(id);
  // (A court's case number has no English: marked as Chinese inside an English line.)
  const no = cons ? esc(consLabel(id, en)) : zhIn(kind === 'low' ? `${courtLabel(id)} ${id.split(',').slice(1, 4).join('')}` : caseNo(id));
  const line = subHtml || (sub ? esc(sub) : [no, esc(shortDay(d))].filter(Boolean).join(' · '));
  return `<a class="lw-row lw-rrow" href="${esc(rulingHref(id))}">${courtTile(kind)}<span class="lw-row-text"><span class="lw-row-name${fit(name, 13)}">${esc(name)}</span><small>${zh ? `${esc(en ? eng : zh)} · ${line}` : line}</small></span></a>`;
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
    return void (run === rulingRun && paint(out, html));
  }
  if (rulingQuery) return void paint(out, await rulingSearchHtml(rulingQuery, cons, { door: rulingDoor_ }));
  const more = n => (n > 0 ? `<button type="button" class="q-btn block lw-more" data-rmore>${W(`再看 ${Math.min(n, 60)} 則`, `${Math.min(n, 60)} more`)}</button>` : '');
  if (door === 'cons' || door === 'interp') {
    const rows = cons.items.filter(r => (door === 'cons') === r[0].startsWith('j'));
    if (door === 'cons') {
      // By year (111年 on), newest first.
      const years = [...new Set(rows.map(r => r[0].slice(1).split('-')[0]))];
      paint(out, years.map(y => section(W(`${y}年 · ${rows.filter(r => r[0].startsWith(`j${y}-`)).length} 件`, `${Number(y) + 1911} · ${rows.filter(r => r[0].startsWith(`j${y}-`)).length}`), list(rows.filter(r => r[0].startsWith(`j${y}-`)).map(r => rulingRow(r))))).join('') || emptyRulings());
    } else {
      const shown = rows.slice(0, 60 + rulingMore);
      paint(out, section(W(`大法官解釋 · ${rows.length} 號`, `${rows.length} interpretations`), list(shown.map(r => rulingRow(r)))) + more(rows.length - shown.length));
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
    if (!months.length) return void paint(out, emptyRulings());
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
    paint(out, monthChips + kindChips + section(W(`${courtName(door.toLowerCase())} · ${shownRows.length} 則`, `${courtName(door.toLowerCase())} · ${shownRows.length}`), list(shown.map(r => rulingRow(r)))) + more(shownRows.length - shown.length));
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
    paint(out, topicChips + section(W(`憲法法庭 · ${consOn.length}`, `Constitutional Court · ${consOn.length}`), list(consOn.slice(0, 12).map(r => rulingRow(r)))) + section(W(`最高法院・最高行政法院 · 近兩個月 ${court.length} 則`, `Top courts · last two months ${court.length}`), list(shown.map(r => rulingRow(r)))) + more(court.length - shown.length));
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
  if (!judgments.length && !court.length) return void paint(out, emptyRulings());
  // (Wide: 憲法法庭 and what came of it on the left, the courts on the right.)
  paint(out, cols([
    [section(W('憲法法庭最新判決', 'Constitutional Court, latest'), rail(judgments.map(rulingCard)), { more: W('全部', 'All'), moreHref: '#tab=rulings&f=cons' }), 0],
    [section(W('判決之後，立法院在修', 'Rulings now in bills'), answered.length ? `<div class="lw-list">${answered.map(r => answeredRow(r)).join('')}</div>` : ''), 0],
    [section(W('最高法院', 'Supreme Court'), list(by('TPS').map(r => rulingRow(r))), { more: W('更多', 'More'), moreHref: '#tab=rulings&f=TPS' }), 1],
    [section(W('最高行政法院', 'Admin. Court'), list(by('TPA').map(r => rulingRow(r))), { more: W('更多', 'More'), moreHref: '#tab=rulings&f=TPA' }), 1],
    [low.length ? section(W('高等法院・地方法院', 'High and district courts'), list(low.slice(0, 4).map(r => rulingRow(r))), { more: W('更多', 'More'), moreHref: '#tab=rulings&f=low' }) : '', 1],
    [section(W('最常被引用的解釋', 'Most cited'), list(landmarks.slice(0, 6).map(r => rulingRow(r, { sub: W(`${consLabel(r[0])} · 後來 ${cons.cited[r[0]].length} 件引用`, `${consLabel(r[0], en)} · cited ${cons.cited[r[0]].length} times`) }))), { more: W('全部', 'All'), moreHref: '#tab=rulings&f=interp' }), 0],
    [section(W('依主題', 'By topic'), topicChips.replace('q-chips lw-chips', 'q-chips lw-chips q-balance')), 1]
  ]));
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
    return head + (hits.length ? section(W(`符合的案由 · ${hits.length}`, `Matching matters · ${hits.length}`), list(hits.map(titleRow))) : emptyNote(W('沒有這個案由', 'No matter like that'), W('試試「詐欺」、「損害賠償」、「離婚」這類案由的字', 'Try a matter, like fraud, damages or divorce'))) + `<a class="q-more q-more-go lw-out" href="https://judgment.judicial.gov.tw/FJUD/default.aspx" target="_blank" rel="noopener" data-out><span>${W('到司法院裁判書查詢找全文', 'Full-text search on the Judicial Yuan')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`;
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
  return `<a class="lw-row lw-rrow" href="#r=${esc(r[0])}">${courtTile(kindOfId(r[0]))}<span class="lw-row-text"><span class="lw-row-name${fit(consName(r), 13)}">${esc(consName(r))}</span><small>${esc(consLabel(r[0], en))}${it ? ` → ${en && it.p && state.byCode.get(it.p)?.[6] ? esc(nameOf(it.p)) : zhIn(shortName(it.n))} · ${esc(stageShort(it, en))}` : ''}</small></span></a>`;
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
    body.innerHTML = `<p class="lw-none">${W('現在讀不到這個裁判，請稍後再試', 'Couldn’t load this ruling; try again later')}</p><a class="q-more q-more-go lw-out" href="${esc(id[0] === 's' ? interpPage(id.slice(1)) : JUDGMENTS_PAGE)}" target="_blank" rel="noopener" data-out><span>${W('到憲法法庭看', 'Open on the Constitutional Court')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`;
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
    `<header class="lw-page-head"><h3 class="lw-big-name q-fit-wrap${nameSize(it.n || '')}">${esc(it.n || consLabel(id, en))}</h3><small>${esc([courtName(kind), it.label, it.d && shortDay(it.d)].filter(Boolean).join(' · '))}</small></header>` +
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
    `<a class="q-more q-more-go lw-out" href="${esc(it.url || (id[0] === 's' ? interpPage(id.slice(1)) : JUDGMENTS_PAGE))}" target="_blank" rel="noopener" data-out><span>${W('到憲法法庭看原文', 'Open on the Constitutional Court')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`;
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
  ['budget', W('預算', 'Budget'), 'court', W('搜尋預算', 'Search budgets')],
  ['council', W('議會', 'Local'), 'purple', W('搜尋議會提案，例如「停車」', 'Search council bills')]
];
const DOOR_ICON = {
  bills: ICON_DOC,
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/></svg>',
  notice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  votes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6.5"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/></svg>',
  budget: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>',
  // A council hall: a roof, columns, a step.
  council: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9 12 4l8.5 5M5.5 9.5v8M9.8 9.5v8M14.2 9.5v8M18.5 9.5v8M3.5 20h17"/></svg>'
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
    // 議程's days: a swipe across the list for the day either side; on any other door the list never follows a
    // finger that leads nowhere (議會's own 議程 swipes its days: councilAgenda).
    const agendaNext = dir => billFilter === 'agenda' && billStep < 0 && dayStep(agendaDays, agendaDay, dir);
    daySwipe($('bill-list'), dir => {
      const d = agendaNext(dir);
      return Boolean(d && (pickAgendaDay(d), true));
    }, { can: dir => Boolean(agendaNext(dir)) });
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
      // 議會: change council, more bills, a bill, a councillor, a township.
      if (e.target.closest('[data-pickcc]')) return councilPicker();
      if (e.target.closest('[data-ccmore]')) return ((councilMore += 20), drawBillList());
      const vid = e.target.closest('[data-ccvid]');
      if (vid) return openCouncilVideo(vid.dataset.ccvid);
      const lv = e.target.closest('[data-cclive]');
      if (lv) return openCouncilVideo('', Number(lv.dataset.cclive));
      if (e.target.closest('[data-ccvids]')) return councilVideos();
      if (e.target.closest('[data-ccall]')) return allCouncilAgenda();
      const sall = e.target.closest('[data-ccsessall]');
      if (sall && shownCouncil) {
        const list = sall.parentElement.querySelector('[data-ccsesslist]');
        const day = twNow().day;
        if (list) list.innerHTML = (shownCouncil.sessions || []).filter(x => x.from && x.from <= day).map(x => `<button type="button" class="lw-row" data-ccsess="${esc(x.id)}"><span class="lw-row-text"><span class="lw-row-name">${esc(x.n.replace(/^第\d+屆/, ''))}</span><small>${esc([spanOf(x.from, x.to), x.bills ? W(`提案 ${x.bills.toLocaleString()} 件`, `${x.bills} bills`) : ''].filter(Boolean).join(' · '))}</small></span>${CHEVRON}</button>`).join('');
        return sall.remove();
      }
      const sess = e.target.closest('[data-ccsess]');
      if (sess && shownCouncil) return councilSession(shownCouncil, shownCouncil.sessions.find(x => x.id === sess.dataset.ccsess));
      const cb = e.target.closest('[data-cbill]');
      if (cb) return openCouncilBill(cb.dataset.cbill);
      const cp = e.target.closest('[data-ccp]');
      if (cp) return openCouncilor(cp.dataset.ccp);
      const town = e.target.closest('[data-town]');
      if (town) return openTown(town.dataset.town);
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
    paint(fn, !state.items.length ? '' : c?.reached ? billFunnel(c, en, state.items.filter(it => it.stage >= PASSED).length) : funnel(state.items, en));
    fn.querySelectorAll('.lw-funnel-col').forEach(c => c.classList.toggle('on', Number(c.dataset.step) === billStep));
  }
  // 這週: what a follower needs first, before the whole list.
  const dg = $('bill-digest');
  if (dg) paint(dg, billFilter === 'moving' && billStep < 0 && !billQuery && state.items.length ? weekDigest() : '');
  if (!state.items.length) return void (out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(4)}</div>`);
  if (billFilter === 'notice' && billStep < 0) return void paint(out, noticeList());
  if (billFilter === 'people' && billStep < 0) return void peopleList(out);
  if (billFilter === 'budget' && billStep < 0) return void budgetList(out);
  if (billFilter === 'agenda' && billStep < 0) return void agendaList(out);
  if (billFilter === 'votes' && billStep < 0) return void votesList(out);
  if (billFilter === 'council' && billStep < 0) return void councilList(out);
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
  if (!items.length) return void paint(out, emptyNote(W('沒有符合的法案', 'No bills match')));
  // Grouped by the step reached, furthest first; held and withdrawn last.
  const groups = new Map();
  for (const it of [...items].sort((a, b) => (a.u < b.u ? 1 : -1))) {
    const g = billStep === 0 && state.billCounts?.reached ? 'filed' : it.dropped ? 'dropped' : it.held ? 'held' : it.ns && it.stage === PASSED ? 'unsigned' : String(stepOf(it.stage));
    groups.set(g, [...(groups.get(g) || []), it]);
  }
  const order = ['filed', '4', 'unsigned', '5', '3', '2', '1', '0', 'held', 'dropped'];
  const title = g => (g === 'filed' ? W('有新提案等一讀', 'Awaiting 1st reading') : g === 'held' ? W('暫緩', 'On hold') : g === 'dropped' ? W('已撤回', 'Withdrawn') : g === '5' ? W('已公布', 'Now law') : g === '4' ? W('三讀通過，等總統公布', 'Passed, awaiting promulgation') : g === 'unsigned' ? W('行政院不副署，沒有公布', 'Not countersigned, not law') : g === '2' ? W('委員會審查中', 'In committee') : g === '3' ? W('在院會：協商、等表決', 'On the floor') : g === '1' ? W('一讀過了，等委員會審', 'Waiting for committee') : STEPS[g][en ? 1 : 0]);
  paint(
    out,
    order
    .filter(g => groups.has(g))
    .map(g => {
      const all = groups.get(g);
      const n = 8 + (billMore[g] || 0);
      const more = all.length > n ? `<button type="button" class="lw-more" data-more="${g}">${W(`再顯示 ${Math.min(40, all.length - n)} 項（共 ${all.length}）`, `Show ${Math.min(40, all.length - n)} more (${all.length})`)}</button>` : '';
      return `<section class="q-section lw-sec"><div class="q-section-head"><h2>${esc(title(g))}</h2><span class="lw-count">${all.length}</span></div>${grid(all.slice(0, n).map(it => billCard(it, { topic: itemTopic(it), en, wide: true })))}${more}</section>`;
    })
    .join('')
  );
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
    section(W(`這週三讀通過 ${passed.length}`, `Passed this week ${passed.length}`), rail(passed.slice(0, 10).map(it => card(passedView(it))))) +
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
  const close = () => location.hash.includes('notice=') && history.replaceState(history.state, '', '#tab=bills&f=notice');
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
      `<div class="lw-notice-who">${who ? `<p><b>${W('提出', 'From')}</b><span>${esc(who)}</span></p>` : ''}${d?.basis ? `<p><b>${W('依據', 'Under')}</b><span>${esc(d.basis)}</span></p>` : ''}<p><b>${W('公告', 'Posted')}</b><span>${esc(shortDay(ymd(n.from)))}</span></p></div>` +
      (why ? `<section class="lw-person-sec"><h4>${W('為什麼要改', 'Why')}</h4>${n.s && d?.about ? `<p class="lw-notice-lead">${esc(n.s.replace(/…$/, ''))}${/…$/.test(n.s) ? '…' : '。'}</p>` : ''}<button type="button" class="lw-why-row lw-notice-about">${proseHtml(why, state.names)}</button></section>` : '') +
      (rows.length ? `<section class="lw-person-sec"><h4>${W(`改了什麼（${rows.length} 條）`, `What changes (${rows.length})`)}</h4><p class="lw-hint-sm">${W('綠色是新增的字、紅色刪掉的字，對照現行條文。', 'Green is added, red is removed, against the text in force.')}</p><div class="lw-nrows">${rows.slice(0, shown).map(rowHtml).join('')}</div>${rows.length > shown ? `<button type="button" class="lw-more" data-nmore>${W(`再顯示 ${rows.length - shown} 條`, `${rows.length - shown} more`)}</button>` : ''}</section>` : d ? `<p class="lw-hint-sm">${W('草案條文只有掃描檔，請看原始 PDF。', 'The draft’s text is only a scan: see the PDF.')}</p>` : '<span class="q-skel lw-bud-skel"></span>') +
      (laws ? `<section class="lw-person-sec"><h4>${W('相關法規', 'The law')}</h4><div class="lw-cites">${laws}</div></section>` : '') +
      `<div class="lw-notice-acts">${openNow ? `<a class="q-btn lw-notice-go" href="${esc(noticeUrl(n.id))}" target="_blank" rel="noopener">${W('到眾開講留言', 'Comment on join.gov.tw')}</a>` : `<a class="q-more q-more-go lw-out" href="${esc(noticeUrl(n.id))}" target="_blank" rel="noopener"><span>${W('眾開講原文', 'On join.gov.tw')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`}${d?.pdf ? `<a class="q-more q-more-go lw-out" href="${esc(d.pdf)}" target="_blank" rel="noopener"><span>${W('草案 PDF', 'Draft PDF')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : ''}${openNow && d?.email ? `<a class="q-more q-more-go lw-out" href="mailto:${esc(d.email)}?subject=${encodeURIComponent(`對「${noticeName(n)}」的意見`)}"><span>${W('寫信給承辦人', 'Email the agency')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : ''}</div>`;
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
// `round: 'passed'` (a 這週三讀通過 card): the round its last 三讀 passed, as the
// card showed it (stage, who, versions, articles), with a way on to the newer one.
// 看法案 (the plan's family links, Jay 11-10): the news about a bill, Orbit
// News' Taiwan stories whose headlines speak of changing it (Orbit-Core's
// builders/news-laws.js, /data/news/laws.json), newest first, each opening
// its story in News. Nothing when there's none, or the file can't be read.
function billNews(k, box) {
  if (!kit.packJson) return;
  kit
    .packJson('news/laws.json', { ttl: 600_000, timeout: 15_000 })
    .then(raw => {
      const rows = (raw?.bills?.[k] || []).filter(r => Array.isArray(r) && /^\w+$/.test(String(r[0])) && typeof r[1] === 'string' && r[1]);
      if (!rows.length) return;
      const day = at => (Number.isFinite(at) ? `${new Date(at).getMonth() + 1}/${new Date(at).getDate()}` : '');
      box.replaceChildren(
        h('h4', { text: W(`新聞（${rows.length}）`, `In the news (${rows.length})`) }),
        h('div', { class: 'q-list' }, rows.map(([id, title, at]) => kitUI.cell({ title, sub: day(at), chevron: true, onClick: () => q.go('news', `s=${id}`) })))
      );
    })
    .catch(() => {});
}

async function openItem(k, { round } = {}) {
  const item = state.items.find(x => x.k === k);
  if (!item) return;
  const it = round === 'passed' && item.passed ? passedView(item) : item;
  // The sheet opens at once on what the list already knows (its name, topic,
  // stage, who filed it); the versions are read behind it (it used to wait
  // for them with nothing on screen: about a second on a phone).
  const topic = itemTopic(it);
  const follow = h('button', { type: 'button', class: `lw-tool${state.mine.items[k] ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => (toggleFollow(state.mine, 'items', k) && toast(W('已追蹤：有進度會標出來', 'Following: progress will show')), save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.items[k])), haptic()) });
  const tone = it.dropped ? '' : it.held || (it.ns && it.stage === PASSED) ? 'orange' : it.stage >= PASSED ? 'green' : 'indigo';
  const top = h('div', { class: 'lw-item-head', style: `--t:${TOPICS[topic].color}`, html: `${topicTile(topic, 'lg')}<span class="lw-meta">${countTag(stageShort(it, en), tone)}${countTag(topicName(topic, en), 'topic')}</span>` });
  const artsBox = x => (html => (html ? h('div', { class: 'lw-item-who', html: `<h4>${it.round === 'passed' ? W(`改了哪幾條（${Object.keys(x.arts).length}）`, `Articles it changed (${Object.keys(x.arts).length})`) : W(`要改哪幾條（${Object.keys(x.arts).length}）`, `Articles it changes (${Object.keys(x.arts).length})`)}</h4><div class="lw-parties">${html}</div>` }) : null))(articleChips(x, en));
  let arts = artsBox(it);
  const who = it.by?.length ? h('div', { class: 'lw-item-who', html: `<h4>${W('誰提的', 'Proposed by')}</h4><div class="lw-parties">${partyChips(it.by, en, 6)}</div>` }) : null;
  const why = h('div', { class: 'lw-item-why', html: `<h4>${W('為什麼要修', 'Why, as filed')}</h4><span class="q-skel" style="height:56px"></span>` });
  const changes = h('div', { class: 'lw-item-diff', html: `<h4>${W('修什麼', 'What it changes')}</h4><div class="lw-diffs"><span class="q-skel" style="height:72px"></span></div>` });
  const openLawBtn = it.p ? h('button', { class: 'q-btn block', type: 'button', text: W('打開現行法規', 'Open the law in force'), onclick: () => (s.close(), go(`law=${it.p}`)) }) : null;
  const votes = h('div', { class: 'lw-item-votes' });
  votesOn(it.p, it.n).then(list => list.length && votes.replaceChildren(h('h4', { text: W(`院會表決（${list.length}）`, `Floor votes (${list.length})`) }), voteList(list)));
  const rul = h('div', { class: 'lw-item-who' });
  billRulings(it).then(html => html && (rul.innerHTML = html));
  const news = h('div', { class: 'lw-item-who lw-item-news' });
  billNews(k, news);
  const progWait = h('div', { class: 'lw-item-prog', html: progress(it, en, { labels: true }) + '<div class="lw-now"><span class="q-skel" style="display:block;height:120px"></span></div>' });
  const s = sheet({ title: W('法案', 'Bill'), lead: follow, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [h('h2', { class: `lw-item-name lw-big-name${nameSize(it.n)}`, text: it.n }), top, progWait, who, arts, rul, news, why, changes, votes, openLawBtn].filter(Boolean), onClose: () => location.hash.startsWith('#item=') && history.replaceState(history.state, '', '#tab=bills') });
  let bills;
  try {
    bills = await data(`bills/item/${encodeURIComponent(k.replace(':', '-'))}.json`);
  } catch {
    s.close();
    return toast(W('這個法案打不開，請稍後再試', 'This bill can’t be opened right now'));
  }
  // The passed round: only its own versions (the card's count), its articles.
  if (it.round === 'passed') {
    bills = passedRoundOf(bills, it.passed);
    if (!Object.keys(it.arts).length) {
      const fresh = artsBox({ ...it, arts: articlesTouched(bills) });
      if (fresh) arts ? arts.replaceWith(fresh) : (who || progWait).after(fresh);
      arts = fresh;
    }
  }
  markSeen(state.mine, 'items', k);
  save();
  noteRead({ kind: 'bill', id: k, title: W(`${it.n}修正草案`, `${it.n} amendment`), href: itemHref(it).replace('&amp;', '&'), sub: '' });
  const steps = timeline(it, bills, en, state.noticesByLaw.get(it.p));
  const now = whereNow(it, bills, en);
  // 行政院 refused to countersign it: the president hasn't promulgated it, so it isn't law (with the report that says so).
  const nsLine = it.ns && it.stage < PROMULGATED ? `<p><b>${W('沒有公布', 'Not law')}</b><span>${esc(W(`行政院 ${shortDay(it.ns.d)} 宣布不副署，總統沒有公布，這次修法還沒生效。`, `The Executive Yuan refused to countersign it on ${shortDay(it.ns.d)}, so the President hasn’t promulgated it and it isn’t in force.`))}${it.ns.src ? ` <a href="${esc(it.ns.src)}" target="_blank" rel="noopener">${W('報導', 'Report')}</a>` : ''}</span></p>` : '';
  const nowLine = [now.last && `<p><b>${W('最新', 'Latest')}</b><span>${esc(now.last)}</span></p>`, nsLine, now.next && `<p><b>${W('下一步', 'Next')}</b><span>${esc(now.next)}</span></p>`, now.open > 1 && `<p><b>${W('這一輪', 'This round')}</b><span>${esc(W(`${now.open} 個版本還在審`, `${now.open} versions open; the numbers say how many stand at each step`))}</span></p>`, now.before && `<p><b>${W('上一輪', 'Last round')}</b><span><a href="${itemHref({ k, round: 'passed' })}">${esc(W(`${now.before} 已三讀通過`, `passed ${now.before}`))}</a></span></p>`, now.later && `<p><b>${W('新一輪', 'New round')}</b><span><a href="${itemHref({ k })}">${esc(W(`${now.later} 個新版本・${stageShort({ stage: it.laterStage }, en)}`, `${now.later} new versions · ${stageShort({ stage: it.laterStage }, en)}`))}</a></span></p>`].filter(Boolean).join('');
  const prog = h('div', { class: 'lw-item-prog', html: progress(it, en, { labels: true, counts: now.open > 1 ? roundSteps(openRound(bills)) : null }) + `<div class="lw-now">${nowLine}</div>` });
  prog.querySelector('.lw-prog').insertAdjacentHTML('afterend', `<button type="button" class="lw-how" data-how="${it.dropped || it.held ? -1 : stepOf(it.stage)}">${W('每一步是什麼意思？', 'What do the steps mean?')}</button>`);
  prog.addEventListener('click', e => e.target.closest('[data-how]') && howBillsWork(Number(e.target.closest('[data-how]').dataset.how)));
  // On the agenda: the next meeting that takes it up (from 立法院's 議程).
  if (!it.dropped && it.stage < PASSED)
    agendaData().then(a => {
      const next = nextSitting(a.meets, { ids: bills.map(b => b.id), law: it.law, name: it.n });
      if (next) prog.querySelector('.lw-now').insertAdjacentHTML('afterbegin', `<p><b>${W('排議程', 'On agenda')}</b><span><a href="#meet=${esc(encodeURIComponent(next.m.id))}&amp;d=${esc(next.d)}">${esc(`${meetDay(next.d)} ${hm(next.from)} ${roomShort(next.m)}${kindLabel(next.m.kind) !== roomShort(next.m) ? ` ${kindLabel(next.m.kind)}` : ''}`)}</a></span></p>`);
    }).catch(() => {});
  const line = h('details', { class: 'lw-fold' }, [h('summary', { text: W('審議過程', 'Steps so far') }), h('ol', { class: 'lw-timeline', html: steps.map(s => `<li class="${s.done ? 'done' : ''}${s.stage === it.stage ? ' now' : ''}"><b>${s.url ? `<a href="${esc(s.url)}"${s.url.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${esc(s.by ? `${s.by}${s.name}` : s.name)}</a>` : esc(s.name)}</b><span>${esc(s.date ? shortDay(ymd(s.date)) : '')}</span></li>`).join('') })]);
  const versions = [...bills].sort((a, b) => (a.u < b.u ? 1 : -1));
  const vlist = h('details', { class: 'lw-fold' }, [
    h('summary', { text: W(`${bills.length} 個版本`, `${bills.length} versions`) }),
    h(
      'div',
      { class: 'lw-versions' },
      versions.map(b =>
        h('details', { class: 'lw-version', ontoggle: e => e.currentTarget.open && compareBill(b, e.currentTarget.querySelector('.lw-compare')) }, [
          h('summary', {}, [h('span', { text: b.t }), h('small', { text: [b.by, b.st, b.u && shortDay(ymd(b.u))].filter(Boolean).join(' · ') })]),
          h('div', { class: 'lw-compare lw-diffs', text: W('讀取對照表…', 'Loading…') })
        ])
      )
    )
  ]);
  progWait.replaceWith(prog);
  votes.after(line, vlist);
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
  const moved = items.filter(it => billMoved(it, m.items[it.k]));
  const laws = Object.keys(m.laws).map(p => state.byCode.get(p)).filter(Boolean);
  const marks = m.marks.map(x => ({ ...x, row: state.byCode.get(x.p) })).filter(x => x.row);
  // 這一週 (你追蹤的法案週報): what you follow that moved in the last 7 days, each in one plain line
  // (the night's, data/ai/weekly.json; in English, or before it's made, the row's own words). 新 if since you last looked.
  const week = weekOf(m, state.items, state.changes, state.weekly).filter(x => x.kind === 'bill' || state.byCode.has(x.c.p));
  const inWeek = new Set(week.map(x => (x.kind === 'bill' ? x.it.k : x.c.p)));
  const newTag = countTag(W('新', 'New'), 'green');
  const weekRows = week.map(x => {
    const line = en ? '' : x.line;
    if (x.kind === 'law') return lawItem(state.byCode.get(x.c.p), line || changeText(x.c, true), (changedLaws.includes(x.c) ? newTag : countTag(W('修法', 'Amended'))));
    const it = x.it;
    return lawRow([it.p || '', it.n], { topic: itemTopic(it), sub: line || `${stageShort(it, en)} · ${shortDay(it.u.replace(/-/g, ''))}`, extra: (billMoved(it, m.items[it.k]) ? newTag : line ? countTag(stageShort(it, en)) : ''), href: itemHref(it).replace(/&amp;/g, '&') });
  });
  const news = changedLaws.filter(c => state.byCode.has(c.p) && !inWeek.has(c.p)).map(c => lawItem(state.byCode.get(c.p), changeText(c, true), newTag));
  const movedOld = moved.filter(it => !inWeek.has(it.k));
  // (Wide: bills on the left, laws and legislators on the right.)
  const html = cols([
    // (On a wide page beside the bills, at the top of the laws' side.)
    [section(W('這一週', 'This week'), weekRows.length ? `<div class="lw-list lw-week">${weekRows.join('')}</div>` : '', { ai: !en && week.some(x => x.line) }), 1],
    [section(W('自上次查看後的變動', 'New since you last looked'), (movedOld.length ? grid(movedOld.map(it => billCard(it, { topic: itemTopic(it), en, wide: true }))) : '') + list(news)), 0],
    [section(W('追蹤的法案', 'Bills'), grid(items.filter(it => !moved.includes(it)).map(it => billCard(it, { topic: itemTopic(it), en, wide: true })))), 0],
    [section(W('追蹤的法規', 'Laws'), list(laws.map(r => lawItem(r)))), 1],
    [section(W('書籤', 'Bookmarks'), list(marks.map(x => lawItem(x.row, artLabel(x.k, en), '', `#law=${x.p}&a=${x.k}`)))), 1],
    [section(W('最近看過', 'Recently opened'), list(m.recent.map(p => state.byCode.get(p)).filter(Boolean).slice(0, 6).map(r => lawItem(r)))), 1],
    [Object.keys(m.people || {}).length ? laterHtml('mine-people') : '', 1],
    [Object.keys(m.cc || {}).length ? laterHtml('mine-cc') : '', 1]
  ]);
  // Only recent laws so far: say what ☆ adds, under them.
  const nothingFollowed = !items.length && !laws.length && !marks.length && !news.length && !Object.keys(m.people || {}).length && !Object.keys(m.cc || {}).length;
  const hint = `<div class="lw-mine-hint"><span class="lw-orb star sm">${ICON.star}</span><div><strong>${W('追蹤法規和法案', 'Follow laws and bills')}</strong><p>${W('按 ☆，修法和審議進度會出現在這裡', 'Tap ☆: amendments and progress show here')}</p></div></div>`;
  paint(
    $('panel-mine'),
    pageHead(W('我的', 'Mine')) +
    ((html && (nothingFollowed ? html + hint : html)) ||
      emptyHtml({ icon: 'star', title: W('追蹤法規和法案', 'Follow laws and bills'), body: W('按 ☆，修法和進度會出現在這裡', 'Tap ☆ to see changes and progress here'), action: `<div class="lw-empty-acts"><a class="q-btn primary" href="#tab=bills">${W('看立法動態', 'See bills')}</a><a class="q-btn" href="#tab=laws">${W('瀏覽法規', 'Browse laws')}</a></div>`, cls: 'lw-mine-empty' }))
  );
  wireTitles($('panel-mine'));
  badge();
  // 追蹤的立委: each one's newest bills, 質詢 and whole-bill votes, what came since last time marked.
  if (Object.keys(m.people || {}).length) drawTracked(m);
  if (Object.keys(m.cc || {}).length) drawTrackedCC(m);
}

// The followed councillors' doings, read live (the API: their bills and what they said; their council's 質詢
// recordings where it files them by name), newest first; how many since each was last opened.
const ccFeeds = new Map();
async function councilorFeed(code, name) {
  const k = `${code}:${name}`;
  if (ccFeeds.has(k) && Date.now() - ccFeeds.get(k).at < 10 * 60_000) return ccFeeds.get(k).p;
  const p = (async () => {
    const c = await data(`council/${code}.json`);
    const x = c.people.find(p => p.n === name);
    if (!x) return null;
    const zh = zhName(name) || name;
    const from = id => (c.sessions || []).find(s => s.id === id)?.from || '';
    const [bills, said, clips] = await Promise.all([
      c.gap ? [] : (c.own && !c.own.add ? ownBills(c).then(all => ({ bills: all.filter(b => String(b['提案人']).split('、').includes(zh)) })) : ccJson(ccSearch(c.c, c.term, zh, 40))).then(r => newestBills(theirBills(r.bills || [], zh).map(compactCouncilBill), c.sessions, 40)).catch(() => []),
      ccJson(ccSpeech(c.c, zh)).then(r => speechesOf(r.meet_transcripts || [], 3)).catch(() => []),
      c.video?.clips ? data(c.video.clips).then(r => r.people?.[zh] || []).catch(() => []) : []
    ]);
    const feed = [
      ...bills.map(b => ({ k: 'bill', d: b.d || from(b.s), t: b.t, id: b.id, out: b.out })),
      ...said.map(m => ({ k: 'talk', d: m.d, t: m.t, url: m.url })),
      // (A recording's name without theirs: 第8次定期會 · 市長施政總質詢.)
      ...clips.slice(0, 3).map(v => ({ k: 'clip', d: v.d, t: v.n.split(' · ').filter(w => !w.includes(zh)).join(' · ') || v.n, v }))
      // (A bill the council's data gives no day or session, 基隆's, still shown, never as new.)
    ].filter(e => e.d || e.k === 'bill').sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    return { c, x, feed };
  })();
  ccFeeds.set(k, { at: Date.now(), p });
  p.catch(() => ccFeeds.delete(k));
  return p;
}
async function trackedCC(m) {
  const keys = Object.keys(m.cc || {});
  const got = (await Promise.all(keys.map(k => councilorFeed(k.slice(0, 3), k.slice(4)).catch(() => null)))).map((r, i) => r && { ...r, key: keys[i] }).filter(Boolean);
  state.ccNew = Object.fromEntries(got.map(r => [r.key, r.feed.filter(e => e.d && e.d > m.cc[r.key]).length]));
  state.ccLast = Object.fromEntries(got.map(r => [r.key, state.ccNew[r.key] ? r.feed[0].d : '']));
  badge();
  return got;
}
async function drawTrackedCC(m) {
  const got = await trackedCC(m).catch(() => []);
  if (!got.length || !$('mine-cc')) return;
  const cards = got.map(({ c, x, feed, key }) => {
    const seen = m.cc[key];
    const fresh = state.ccNew[key];
    const row = e => {
      const when = e.d ? `<small class="lw-track-d${e.d > seen ? ' new' : ''}">${esc(shortDay(e.d))}</small>` : '<span></span>';
      if (e.k === 'bill') return `<button type="button" class="lw-track-row" data-cbill="${esc(e.id)}"><span class="lw-track-k indigo">${W('提案', 'Bill')}</span><span class="lw-row-name">${esc(e.t)}</span>${when}</button>`;
      if (e.k === 'clip') return `<button type="button" class="lw-track-row" data-mccvid="${esc(key)}|${esc(e.v.id)}"><span class="lw-track-k orange">${W('質詢', 'Spoke')}</span><span class="lw-row-name">${esc(e.t)}</span>${when}</button>`;
      return `<${e.url ? `a href="${esc(e.url)}" target="_blank" rel="noopener"` : 'div'} class="lw-track-row"><span class="lw-track-k orange">${W('發言', 'Spoke')}</span><span class="lw-row-name">${esc(e.t)}</span>${when}</${e.url ? 'a' : 'div'}>`;
    };
    const top = ['bill', 'clip', 'talk'].map(k => feed.find(e => e.k === k)).filter(Boolean).sort((a, b) => (a.d < b.d ? 1 : -1));
    return `<div class="lw-track" style="--p:${partyColor(x.party)}"><button type="button" class="lw-track-head" data-mcc="${esc(key)}">${personPhoto(x)}<span class="lw-person-text"><b>${esc(x.n)}</b><small>${esc(`${c.n} · ${partyShort(x.party)} · ${x.area.replace(/^第(\d+)選舉區$/, (_, d) => W(`第${+d}區`, `D${+d}`))}`)}</small></span>${fresh ? countTag(W(`新 ${fresh}`, `${fresh} new`), 'green') : ''}</button>${top.length ? `<div class="lw-track-rows">${top.map(row).join('')}</div>` : `<p class="lw-track-none">${W('這屆還沒有提案或發言紀錄', 'No bills or speeches yet this term')}</p>`}</div>`;
  });
  fillLater('mine-cc', `<section class="q-section lw-sec"><div class="q-section-head"><h2>${W('追蹤的議員', 'Councillors')}</h2></div><div class="lw-tracks">${cards.join('')}</div></section>`);
}

// The followed legislators' doings (their files and the votes), and how many
// came since each was last opened (for the 我的 badge too).
async function trackedFeeds(m) {
  const ppl = await peopleData();
  const xs = ppl.people.filter(x => m.people?.[x.id]);
  const [files, votes] = await Promise.all([Promise.all(xs.map(x => data(`ly/person/${encodeURIComponent(x.id)}.json`).catch(() => null))), votesData().catch(() => null)]);
  const feeds = xs.map((x, i) => (files[i] ? personFeed({ ...files[i], from: x.from, to: x.to }, votes) : []));
  state.peopleNew = Object.fromEntries(xs.map((x, i) => [x.id, feedNew(feeds[i], m.people[x.id])]));
  state.peopleLast = Object.fromEntries(xs.map((x, i) => [x.id, state.peopleNew[x.id] ? feeds[i][0].d : '']));
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
  fillLater('mine-people', `<section class="q-section lw-sec"><div class="q-section-head"><h2>${W('追蹤的立委', 'Legislators')}</h2></div><div class="lw-tracks">${cards.join('')}</div></section>`);
}
$('panel-mine').addEventListener('click', async e => {
  const b = e.target.closest('#mine-people [data-vote]');
  if (b) voteSheet(Number(b.dataset.vote));
  // A followed councillor: their sheet, a bill, a recording.
  const p = e.target.closest('#mine-cc [data-mcc]');
  if (p) return openCouncilor(p.dataset.mcc.slice(4), p.dataset.mcc.slice(0, 3)).then(() => drawMine());
  const cb = e.target.closest('#mine-cc [data-cbill]');
  if (cb) return openCouncilBill(cb.dataset.cbill);
  const v = e.target.closest('#mine-cc [data-mccvid]');
  if (v) {
    const [key, id] = v.dataset.mccvid.split('|');
    const r = await councilorFeed(key.slice(0, 3), key.slice(4)).catch(() => null);
    const clip = r?.feed.find(x => x.v?.id === id)?.v;
    if (clip) ((shownCouncil = r.c), openCouncilVideo(id, -1, clip));
  }
});

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
  // A vote read from the sitting's 議事錄 (the 公報 hasn't printed it yet): its PDF, said so.
  const rec = d.recs?.[String(v[0]).replace(/-\d+$/, '')] || '';
  const url = rec || gazetteUrl(v[0]);
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
  const body = h('div', { class: 'lw-vote-sheet', html: `<p class="lw-vote-subject">${esc(voteName(v))}</p>${w.zh ? `<p class="lw-vote-plain">${esc(en ? w.en : w.zh)}</p>` : ''}${result}${on ? `<h4>${W('表決的法案', 'The bill')}</h4><div class="lw-cites lw-vote-on">${on}</div>` : bk ? `<h4>${W('表決的預算', 'The budget')}</h4><div class="lw-cites lw-vote-on"><a class="lw-notice lw-vote-bill" href="#tab=bills&f=budget&budget=${esc(encodeURIComponent(bk))}"><b>${esc(topic || bk)}</b><small>${W('看這份預算：錢花在哪、刪了多少', 'See where the money goes and what was cut')}</small></a></div>` : topic ? `<h4>${W('議案', 'On the agenda')}</h4><p class="lw-vote-topic">${esc(topic)}</p>` : ''}${followed}<h4>${W('各黨怎麼投', 'By party')}</h4><div class="lw-pbars">${split}</div>${names}<p class="lw-vote-raw">${W('議事錄原文：', 'As recorded: ')}${esc(v[2])}</p>${rec ? `<p class="lw-hint-sm">${W('這次表決讀自院會的議事錄；公報刊出後會換成公報的紀錄。', 'Read from the sitting’s minutes; the Gazette’s record replaces it once printed.')}</p>` : ''}${url ? `<a class="q-more q-more-go lw-out" href="${esc(url)}" target="_blank" rel="noopener"><span>${rec ? W('院會議事錄', 'The sitting’s minutes') : W('立法院公報', 'In the Gazette')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : ''}` });
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
  const last = d.votes.reduce((m, v) => (v[1] > m ? v[1] : m), '');
  let shown = 20;
  const draw = () => {
    out.innerHTML = `${words.length ? '' : `<p class="lw-hint-sm lead">${esc(Object.keys(d.recs || {}).length ? W(`記名表決約晚一週，目前到 ${shortDay(last)}`, `Roll-call votes run about a week behind; newest ${shortDay(last)}`) : W(`記名表決約晚一到三週，目前到 ${shortDay(last)}`, `Roll-call votes run one to three weeks behind; newest ${shortDay(last)}`))}</p>`}<div class="lw-vgroups">${groups.slice(0, shown).map((g, gi) => voteGroupCard(g, gi, d, agendas, partyOfName)).join('')}</div>${groups.length > shown ? `<button type="button" class="lw-more" data-vmore>${W(`再顯示 ${Math.min(20, groups.length - shown)} 案（共 ${groups.length}）`, `Show more (${groups.length})`)}</button>` : ''}`;
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
  const card = (x, full) => `<a class="lw-person" href="#who=${esc(x.id)}" style="--p:${partyColor(x.party)}">${personPhoto(x)}<span class="lw-person-text"><b class="q-fit">${esc(x.n)}</b><small>${esc(sub(x, full === true))}</small></span><span class="lw-person-n">${W(`提案 ${Number(x.counts.bills).toLocaleString("en-US")}`, `${Number(x.counts.bills).toLocaleString("en-US")} bills`)}</span></a>`;
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
    (followed.length ? `<section class="q-section lw-sec"><div class="q-section-head"><h2>${W('追蹤的立委', 'Following')}</h2></div><div class="lw-people q-rows-full q-rows-keep">${followed.map(x => card(x, true)).join('')}</div></section>` : '') +
    order.map(o => `<section class="q-section lw-sec"><div class="q-section-head">${head(o)}<span class="lw-count">${o.xs.length}</span></div><div class="lw-people q-rows-full q-rows-keep">${o.xs.map(card).join('')}</div></section>`).join('') +
    (left.length ? `<section class="q-section lw-sec"><div class="q-section-head"><h2>${W('已離職', 'Left office')}</h2><span class="lw-count">${left.length}</span></div><div class="lw-people q-rows-full q-rows-keep">${left.map(x => card(x, true)).join('')}</div></section>` : '');
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
  if (state.mine.people?.[id]) (markSeen(state.mine, 'people', String(id)), state.peopleNew && (state.peopleNew[id] = 0), state.peopleLast && (state.peopleLast[id] = ''), save());
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
    const draw = () => (clips.innerHTML = `<h4>${W(`質詢影片（${x.clips.length.toLocaleString('en-US')}）`, `Speeches (${x.clips.length.toLocaleString('en-US')})`)}</h4><div class="lw-clips">${x.clips.slice(0, n).map(clipRow).join('')}</div>${x.clips.length > n ? `<button type="button" class="lw-more">${W('再顯示 20 段', 'Show 20 more')}</button>` : ''}<p class="lw-hint-sm">${W('影片在立法院議事轉播（IVOD）；▶ YouTube 找同一場會議。', 'Videos play on the Legislative Yuan’s IVOD; the YouTube button finds the same meeting.')}</p>`);
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
      h('h4', { text: W(`表決紀錄（${mine.length.toLocaleString('en-US')}）`, `Votes (${mine.length.toLocaleString('en-US')})`) }),
      ...(al && al.cast >= 10 ? [h('p', { class: 'lw-person-line', html: alignLine(al) })] : []),
      ...(whole.length ? [h('p', { class: 'lw-vg-h', text: W(`法案全案表決 ${whole.length}`, `Final votes on bills: ${whole.length}`) }), voteList(whole.map(([j]) => [j, d.votes[j]]), marks, 5, true), all] : [voteList(mine.map(([j]) => [j, d.votes[j]]), marks)])
    );
  }).catch(() => {});
  const bills = h('div', { class: 'lw-person-sec', html: x.bills?.length ? `<h4>${W(`提案（${Number(row.counts.bills).toLocaleString('en-US')}）`, `Bills (${Number(row.counts.bills).toLocaleString('en-US')})`)}</h4><div class="lw-list in-sheet wrap">${x.bills.slice(0, 15).map(b => `<a class="lw-row" href="https://ppg.ly.gov.tw/ppg/bills/${esc(b[0])}/details" target="_blank" rel="noopener"><span class="lw-row-text"><span class="lw-row-name">${esc(b[2])}</span><small>${esc([shortDay(b[1]), b[3]].filter(Boolean).join(' · '))}</small></span></a>`).join('')}</div>` : '' });
  sheet({ title: W('立委', 'Legislator'), lead: follow, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [head, tiles, clips, votes, bills], onClose: () => location.hash.startsWith('#who=') && history.replaceState(history.state, '', '#tab=bills') });
}

// 預算: the term's budgets (yearly 總預算, 追加, 特別), each by its stage, and
// for a yearly one the money (主計總處's 預算表, scripts/build-budget.mjs):
// the total and its change from last year, where it goes, what 立法院 cut.
// A card opens the budget's page (#budget=<k>): by function, by ministry →
// agency → 工作計畫, the biggest cuts, its steps and its floor votes.
const BUDGET_STEP_EN = [[/三讀/, 'Passed'], [/公布/, 'Promulgated'], [/協商/, 'In talks'], [/二讀/, '2nd reading'], [/審查完畢|審查總報告/, 'Reviewed'], [/退回程序/, 'Sent back'], [/委員會發文/, 'Committee letter'], [/交付審查|委員會/, 'In committee'], [/排入院會/, 'On the agenda'], [/復議/, 'Reconsidered'], [/預算流程/, 'Budget filed'], [/撤/, 'Withdrawn']];
// A step in words: its note in brackets dropped; in English, the usual ones translated.
const budgetStep = t => { const z = String(t || '').replace(/\s*[（(].*$/, ''); return en ? BUDGET_STEP_EN.find(([re]) => re.test(z))?.[1] || z : z; };
// A 第二預備金 report is done once reviewed (or deemed reviewed): it has no 三讀.
const budgetTone = (st, k = '') => (/三讀|公布/.test(st) || (/預備金$/.test(k) && /審查完畢/.test(st)) ? 'passed' : /協商|二讀|討論/.test(st) ? 'held' : '');
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
const roadOf = x => roadSteps(x.k);
const roadDone = (x, r) => r.now === roadOf(x).length - 1;
const roadHtml = (x, big = false) => {
  const r = stepsOf(x);
  const steps = roadOf(x);
  const end = roadDone(x, r);
  return `<span class="lw-road${big ? ' big' : ''}${steps.length === 4 ? ' four' : ''}${end ? ' passed' : ''}" role="img" aria-label="${esc(steps[r.now][en ? 1 : 0])}">${steps.map(([zh, e], i) => `<span class="${i < r.now || (i === r.now && end) ? 'done' : i === r.now ? 'now' : ''}"><i></i>${big ? `<b>${esc(en ? e : zh)}</b><small>${i <= r.now && r.days[i] ? esc(md(r.days[i])) : ''}</small>` : ''}</span>`).join('')}</span>`;
};
// Months since a budget last moved, when it's stuck (not done, quiet over half a year).
const quietMonths = (x, r, today) => (roadDone(x, r) ? 0 : stuckMonths(x.last, today));
// Where a budget stands in a line: the step and its day, how long it took,
// and for a yearly 總預算 the legal deadline (11/30 before its year).
function roadLine(x, long = false) {
  const r = stepsOf(x);
  const now = roadOf(x)[r.now][en ? 1 : 0];
  const day = r.days[r.now] || x.last;
  const parts = [`${lapsed(x) && r.now === 3 ? W('逾期視為審完', 'Deemed reviewed') : now}${day ? ` ${shortDay(day)}` : ''}`];
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  if (long && lapsed(x)) parts.push(W('審查期限已過，依法視為審查完畢', 'the review period ran out'));
  const quiet = quietMonths(x, r, today);
  if (quiet) parts.push(long ? W(`${shortDay(x.last)} 後就沒有進度`, `no progress since ${shortDay(x.last)}`) : W(`${quiet} 個月沒進度`, `stuck ${quiet} months`));
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
    const head = `<span class="lw-bill-top"><span class="lw-bill-stage ${budgetTone(x.stage, x.k)}">${esc(budgetStep(x.stage))}</span></span><b class="lw-bill-name">${esc(budgetName(x))}</b>`;
    return `<a class="lw-bill lw-budget${x.money ? ' money' : ''}" href="${href(x)}">${head}${roadHtml(x)}<span class="lw-bud-steps">${esc(roadLine(x).join(' · '))}</span>${x.money ? moneyBits(x.money) : ''}</a>`;
  };
  const q = billQuery;
  const shown = b.budgets.filter(x => !q || x.title.includes(q) || x.k.includes(q) || budgetName(x).toLowerCase().includes(q.toLowerCase()) || x.money?.top.some(t => t[0].includes(q)) || x.money?.cuts?.some(t => t[0].includes(q)));
  if (!shown.length) return void (out.innerHTML = emptyNote(W('沒有符合的預算', 'No budget matches')));
  // The 總預算 in 立法院 now: the newest year's.
  const cur = !q && shown.filter(x => budgetKind(x.k) === 'year').sort((a, c) => Number(c.k) - Number(a.k))[0];
  const hero = cur
    ? `<section class="q-section lw-sec"><div class="q-section-head"><h2>${stepsOf(cur).now < 5 ? W('立法院正在審', 'In the Legislative Yuan now') : W('最新的總預算', 'Latest budget')}</h2></div><a class="lw-bill lw-budget lw-bud-hero${cur.money ? ' money' : ''}" href="${href(cur)}"><span class="lw-bill-top"><span class="lw-bill-stage ${budgetTone(cur.stage, cur.k)}">${esc(budgetStep(cur.stage))}</span></span><b class="lw-bill-name">${esc(budgetName(cur))}</b>${roadHtml(cur, true)}<span class="lw-bud-road-note">${roadLine(cur, true).map(dueSpan).join('')}</span>${cur.money ? moneyBits(cur.money) : `<span class="lw-bud-note wrap">${W('主計總處公布預算表後，這裡會有金額、各部會和刪減。', 'Amounts, ministries and cuts show once the DGBAS publishes the tables.')}</span>`}</a></section>`
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
  const close = () => location.hash.includes('budget=') && history.replaceState(history.state, '', '#tab=bills&f=budget');
  sheet({ title: W('預算', 'Budget'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [body], onClose: close });
  const head = `<h2 class="lw-item-name lw-big-name">${esc(budgetName(x))}</h2><div class="lw-meta"><span class="lw-bill-stage ${budgetTone(x.stage, x.k)}">${esc(budgetStep(x.stage))}</span>${(sd => (sd ? `<span class="lw-tag">${esc(shortDay(sd))}</span>` : ''))((r => r.days[r.now])(stepsOf(x)) || x.done || x.last)}</div><div class="lw-bud-road">${roadHtml(x, true)}<span class="lw-bud-road-note">${roadLine(x, true).map(dueSpan).join('')}</span></div>`;
  const steps = x.flow?.length ? `<section class="lw-person-sec"><h4>${W('進度', 'Steps')}</h4><ol class="lw-timeline">${x.flow.map(f => `<li class="done"><b>${esc(budgetStep(f[1]))}</b><span>${esc(shortDay(f[0]))}</span></li>`).join('')}</ol></section>` : '';
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
// and what IVOD streams now (the proxy's /law-live: each meeting's channel, read at most a minute ago).
let lyAgenda;
const LIVE_URL = `${kit.API || 'https://orbit-workers-proxy.pengzjay.workers.dev'}/law-live`;
// (The rooms carry `fresh`: read in the last half hour; the proxy answers its last good read when IVOD fails.)
const liveData = () => fetch(LIVE_URL, { signal: AbortSignal.timeout(6000) }).then(r => (r.ok ? r.json() : null)).then(l => (l && l.at && Date.now() - Date.parse(l.at) < 12 * 3600e3 ? Object.assign(l.rooms || [], { fresh: Date.now() - Date.parse(l.at) < 30 * 60e3 }) : null)).catch(() => null);
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
    // 測試工具 (testing.mjs): a test 院會 all day today, with IVOD's word on it (lyLive).
    const t = globalThis.ORBIT_TEST?.flags;
    if (t?.lyLive || t?.lyTyphoon) {
      const { day } = twNow();
      const title = W('（測試）立法院院會', '(Test) Floor sitting');
      a.meets = [...a.meets, { id: 'test-live', kind: '院會', title, room: '立法院會議', days: [{ d: day, from: '00:00', to: '23:59', place: '議場', ppg: '' }], why: title, bills: [], speakers: {}, videos: [] }];
      const status = { live: '進行中', break: '休息', done: '散會(12:30)', off: '延期' }[t.lyLive];
      if (status) a.live = Object.assign([...(a.live || []), { unit: '院會', time: `${day} 00:00`, place: '議場', title, status, ch: t.lyLive === 'live' ? (a.live || []).find(r => r.ch)?.ch || 1 : 0 }], { fresh: true });
    }
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
const lyDayOff = d => (globalThis.ORBIT_TEST?.flags?.lyTyphoon && d === twNow().day ? { from: '' } : dayOffOn(d, LY_PLACE, 'work'));
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
// The 90 days before (agenda-past.json), read once someone opens 議程: the day bar then goes back.
let lyAgendaPast = null;
const agendaPastData = () => (lyAgendaPast ||= data('ly/agenda-past.json').catch(() => ({ meets: [] })));
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
  // The past joins once read (the first draw doesn't wait for it).
  const past = await Promise.race([agendaPastData(), new Promise(r => setTimeout(r, 0))]);
  if (!past) agendaPastData().then(() => billFilter === 'agenda' && document.contains(out) && agendaList(out));
  const ids = new Set(a.meets.map(m => m.id));
  const meets = [...(past?.meets || []).filter(m => !ids.has(m.id)), ...a.meets];
  const all = sittings(meets).filter(x => (past || x.d >= day) && (!words.length || words.some(w => `${x.m.room}${x.m.title}${x.m.why}`.includes(w))));
  const live = all.filter(x => ['live', 'break'].includes(liveState(x, a.live)));
  const row = x => meetRow(x, a.live);
  const days = [...new Set(all.map(x => x.d))].sort();
  const none = emptyNote(W(words.length ? '議程裡沒有符合的會議' : '接下來還沒有排會議', words.length ? 'Nothing on the agenda matches' : 'No meetings scheduled yet'));
  agendaDays = words.length ? [] : days;
  if (words.length || !days.length) {
    // A search: what's coming first, then the past, newest first.
    const html = [...days.filter(d => d >= day), ...days.filter(d => d < day).reverse()].map(d => section(meetDay(d), `<div class="lw-meets">${all.filter(x => x.d === d).map(row).join('')}</div>`)).join('');
    return void (out.innerHTML = html || none);
  }
  // First today, else the next day with meetings, else the last one before.
  if (!days.includes(agendaDay)) agendaDay = days.find(d => d >= day) || days.at(-1);
  const rest = all.filter(x => x.d === agendaDay && !live.includes(x));
  const now = agendaDay === day && live.length;
  // (While some meet, the day's others: those still to come 稍後, those already over 稍早, never over ones under 稍後.)
  const later = rest.filter(x => !['done', 'past', 'off'].includes(liveState(x, a.live)));
  const earlier = rest.filter(x => !later.includes(x));
  const meetsOf = (title, xs) => (xs.length ? section(title, `<div class="lw-meets">${xs.map(row).join('')}</div>`) : '');
  out.innerHTML = now ? meetsOf(W('現在開會中', 'Meeting now'), live) + meetsOf(W('稍後', 'Later'), later) + meetsOf(W('稍早', 'Earlier'), earlier) : `<div class="lw-meets">${rest.map(row).join('')}</div>`;
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
    playHls(v, liveHls(r.ch), { live: true }).catch(() => v.replaceWith(h('a', { class: 'q-btn block', href: IVOD_LIVE, target: '_blank', rel: 'noopener', text: W('到立法院 IVOD 看直播', 'Watch on the Legislative Yuan’s IVOD') })));
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
  sheet({ title: roomShort(m), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body, onClose: () => location.hash.startsWith('#meet=') && history.replaceState(history.state, '', '#tab=bills&f=agenda') });
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

// ---- 地方議會: the 立法 tab's 議會 door -------------------------------------
// The 22 縣市議會 (lib/council.mjs, scripts/build-council.mjs): the one picked
// (else the reader's city's), its session and sittings, its newest bills
// (a search reads the council's whole term live from the API), its
// councillors; for a county, its 鄉鎮市民代表 township by township.
let councilIdx = null, councilReps = null, councilMore = 0, councilFound = null, councilAsk = 0;
const councilsData = () => (councilIdx ||= data('council/index.json').catch(e => ((councilIdx = null), Promise.reject(e))));
const repsData = () => (councilReps ||= data('council/reps.json').catch(e => ((councilReps = null), Promise.reject(e))));
const COUNCIL_KEY = 'orbit-law.council.v1';
// A council whose bills come from its own site (新竹縣, 新竹市, 花蓮縣): the whole term in one file, read when asked.
const ownBills = c => data(c.own.file).then(r => r.rows || []);
const ownFind = (rows, words) => rows.filter(b => words.some(w => String(b['案由']).includes(w) || String(b['提案人']).includes(w)));
// The council shown: the one picked on this phone, else the reader's city's, else 臺北市's.
function councilOf(list) {
  const picked = kit.readStore?.(COUNCIL_KEY);
  const city = myCities()[0];
  return list.find(c => c.c === picked) || list.find(c => c.city === city) || list.find(c => c.c === 'tpe') || list[0];
}
const ccJson = url => fetch(url, { signal: AbortSignal.timeout(10_000) }).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
const outcomeTag = k => (OUTCOME[k] ? countTag(OUTCOME[k][en ? 1 : 0], OUTCOME[k][2]) : '');
const sessionShort = (c, id) => (c.sessions || []).find(s => s.id === id)?.n.replace(/^第\d+屆/, '') || '';
const cbillRow = (c, b) => `<button type="button" class="lw-row lw-cbill" data-cbill="${esc(b.id || b['代碼'])}"><span class="lw-row-text"><span class="lw-row-name">${esc(b.t)}</span><small>${esc([b.by, b.cat, sessionShort(c, b.s) || (b.d ? shortDay(b.d) : '')].filter(Boolean).join(' · '))}</small></span>${outcomeTag(b.out)}</button>`;
// A council's state in a line: 開會中 (to its last day), else the next session or the last one.
function councilLine(c, day) {
  const st = councilState(c, day);
  // The sittings know a session the council hasn't listed yet (金門縣's 定期會).
  const sat = (c.sittings || []).filter(x => x.d >= day).sort((a, b) => (a.d < b.d ? -1 : 1))[0];
  if (!st.live && sat?.d === day) return W(`開會中 · 今天${sat.kind || '開會'}`, 'In session today');
  if (!st.live && sat && !(st.s && st.s.from > day && st.s.from <= sat.d)) return W(`休會中 · ${shortDay(sat.d)} 開${sat.kind || '會'}`, `In recess · sits ${shortDay(sat.d)}`);
  if (!st.s) return '';
  const span = s => `${shortDay(s.from)}${s.to ? `–${shortDay(s.to)}` : ''}`;
  if (st.live) return W(`開會中 · ${st.s.n.replace(/^第\d+屆/, '')}（${span(st.s)}）`, `In session · ${span(st.s)}`);
  if (st.s.from > day) return W(`休會中 · ${shortDay(st.s.from)} 開${st.s.kind || '會'}`, `In recess · sits ${shortDay(st.s.from)}`);
  return W(`休會中 · 上次${st.s.n.replace(/^第\d+屆/, '')}（${span(st.s)}）`, `In recess · last session ${span(st.s)}`);
}
// A sitting with its recording opens it (the first of the day's part).
const sittingRow = (x, vid) => {
  const tag = vid ? 'button type="button"' : 'div';
  return `<${tag} class="lw-meet${x.done ? ' done' : ''}${vid ? ' has-vid' : ''}"${vid ? ` data-ccvid="${esc(vid.id)}"` : ''}><span class="lw-meet-time"><b>${esc(shortDay(x.d))}</b><small>${esc(x.from || x.t || '')}</small></span><span class="lw-meet-text"><span class="lw-meet-top"><b class="q-fit">${esc(x.room || x.kind || W('會議', 'Sitting'))}</b>${x.room && x.kind ? countTag(x.kind) : ''}${vid ? `<span class="lw-vid-tag">${PLAY}${W('影片', 'Video')}</span>` : ''}</span>${x.what && x.what !== x.kind ? `<span class="lw-meet-what">${esc(x.what)}</span>` : ''}</span></${vid ? 'button' : 'div'}>`;
};
const PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor"/></svg>';
// A council's recordings: a row each, its picture, what it was and when.
const vidRow = v => `<button type="button" class="lw-row lw-vid" data-ccvid="${esc(v.id)}">${v.img ? `<img class="lw-vid-img" src="${esc(v.img)}" alt="" loading="lazy" decoding="async">` : `<span class="lw-vid-img">${PLAY}</span>`}<span class="lw-row-text"><span class="lw-row-name">${esc(v.n || W('議場錄影', 'Chamber recording'))}</span><small>${esc([shortDay(v.d), v.t, clipLen(v.len), v.what && v.what !== v.n ? v.what : ''].filter(Boolean).join(' · '))}</small></span></button>`;
// Which of a council's live channels stream now: each asked once a minute at most (HiNet answers 404 when off air).
const liveSeen = new Map();
function liveNow(url) {
  const old = liveSeen.get(url);
  if (old && Date.now() - old.at < 60_000) return old.p;
  const p = fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6_000) }).then(r => (r.ok ? r.text().then(t => t.includes('#EXTM3U')) : false)).catch(() => false);
  liveSeen.set(url, { at: Date.now(), p });
  return p;
}
async function councilLive(c, out) {
  const box = out.querySelector('[data-cclive-box]');
  if (!box || !c.video?.live?.length) return;
  const on = (await Promise.all(c.video.live.map(async ch => ((await liveNow(ch.url)) ? ch : null)))).filter(Boolean);
  if (!on.length || !box.isConnected) return;
  box.innerHTML = on.map((ch, i) => `<button type="button" class="lw-row lw-cc-live" data-cclive="${c.video.live.indexOf(ch)}"><span class="lw-live">${W('直播中', 'Live')}</span><span class="lw-row-text"><span class="lw-row-name">${esc(ch.n || c.n)}</span><small>${W('點這裡看議場直播', 'Watch the chamber live')}</small></span>${CHEVRON}</button>`).join('');
  box.hidden = false;
}
// One recording or a live channel, played here: HiNet's HLS in the phone's own player, YouTube's in its frame.
// The council on screen, kept so a tap opens its video at once: with nothing awaited between the tap and
// play(), the phone starts it then (a tap's permission to play ends at the first wait).
let shownCouncil = null;
// (ctx: a 代表會's, {n, video: {site}}, for its own recordings.)
async function openCouncilVideo(id, live = -1, given = null, ctx = null) {
  const c = ctx || (shownCouncil?.video ? shownCouncil : await data(`council/${councilOf((await councilsData()).councils).c}.json`).catch(() => null));
  const ch = live >= 0 ? c?.video?.live?.[live] : null;
  const v = ch ? null : given || c?.video?.vids?.find(x => x.id === id) || termVids.get(c?.c)?.find(x => x.id === id);
  if (!ch && !v) return;
  const body = h('div', { class: 'lw-clip-sheet' });
  const site = c.video.site;
  const meta = ch ? `<div class="lw-meta"><span class="lw-live">${W('直播中', 'Live')}</span></div><h2 class="lw-item-name">${esc(ch.n || c.n)}</h2>` : `<h2 class="lw-item-name">${esc(v.n || W('議場錄影', 'Chamber recording'))}</h2><p class="lw-clip-meta">${esc([c.n, shortDay(v.d), v.t].filter(Boolean).join(' · '))}</p>${v.what && v.what !== v.n ? `<p class="lw-meet-why">${esc(v.what)}</p>` : ''}`;
  if (v?.yt) body.innerHTML = `<div class="lw-video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.yt)}?playsinline=1&rel=0" title="${esc(v.n)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>${meta}`;
  else body.innerHTML = `<video class="lw-video" controls playsinline autoplay preload="auto"${v?.img ? ` poster="${esc(v.img)}"` : ''}></video>${meta}`;
  if (site) body.append(h('a', { class: 'q-more q-more-go lw-out', href: site, target: '_blank', rel: 'noopener', 'data-out': '', html: `<span>${ctx?.town ? W('代表會的 YouTube 頻道', 'The council’s YouTube channel') : W('議會的影音網站', 'The council’s video site')}</span><span class="q-more-chev" aria-hidden="true">›</span>` }));
  sheet({ title: ch ? W('議場直播', 'Live') : ctx?.town ? W('代表會影音', 'Township council video') : W('議會影音', 'Council video'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [body] });
  const el = body.querySelector('video');
  // Straight from the council's own CDN (never through Orbit's servers); started at once.
  if (el) {
    // (A councillor's turn in a whole day's recording: from where their group starts.)
    playHls(el, ch ? ch.url : v.hls, { live: !!ch, at: v?.at || 0 }).then(() => el.paused && el.play?.()?.catch(() => {})).catch(() => el.replaceWith(h('p', { class: 'lw-none', text: W('現在讀不到這段影片', 'Couldn’t load this video') })));
    // Safari's own HLS took the address at once: play inside the tap.
    if (el.src) el.play?.()?.catch(() => {});
  }
}
// A council's every recording of the term (council/<code>-video.json), once read.
const termVids = new Map();
async function councilTermVids(c) {
  if (termVids.has(c.c)) return termVids.get(c.c);
  const all = c.video?.all ? (await data(c.video.all).catch(() => null))?.vids : null;
  const vids = all?.length ? all : c.video?.vids || [];
  termVids.set(c.c, vids);
  return vids;
}
// What a recording was, for the filter: the chamber's 質詢, its committees and reviews, or the rest of its sittings.
const vidKind = v => (/質詢/.test(v.n) ? 'ask' : /委員會|審查|小組/.test(v.n) ? 'room' : 'floor');
// All of a council's recordings of the term, by session, filtered by kind and searched by words.
async function councilVideos() {
  const c = await data(`council/${councilOf((await councilsData()).councils).c}.json`).catch(() => null);
  if (!c?.video?.vids?.length) return;
  shownCouncil = c;
  const vids = await councilTermVids(c);
  const sessions = (c.sessions || []).slice().sort((a, b) => (a.from < b.from ? 1 : -1));
  const sessionOf = v => sessions.find(x => v.d >= x.from && v.d <= (x.to || '9999')) || null;
  const kinds = [['', W('全部', 'All')], ['floor', W('大會', 'Floor')], ['ask', W('質詢', 'Questions')], ['room', W('委員會', 'Committees')]].filter(([k]) => !k || vids.some(v => vidKind(v) === k));
  let pick = '';
  let words = '';
  let shown = 40;
  const input = search({ placeholder: W('找影音：質詢、預算、議員…', 'Find: a topic, a councillor…'), onInput: v => ((words = v), (shown = 40), draw()) });
  const chips = h('div', { class: 'q-chips lw-chips', html: kinds.length > 2 ? kinds.map(([k, n]) => `<button type="button" class="q-chip" data-vk="${k}" aria-pressed="${k === pick}">${esc(n)}</button>`).join('') : '' });
  const list = h('div');
  const draw = () => {
    const q = words.trim();
    const got = vids.filter(v => (!pick || vidKind(v) === pick) && (!q || `${v.n} ${v.what || ''}`.includes(q)));
    let html = '';
    let at = null;
    for (const v of got.slice(0, shown)) {
      const x = sessionOf(v);
      const key = x?.id || v.d.slice(0, 7);
      if (key !== at) {
        if (at !== null) html += '</div>';
        html += `<h4 class="lw-vid-group">${esc(x ? x.n.replace(/^第\d+屆/, '') : v.d.slice(0, 7).replace('-', ' / '))}</h4><div class="lw-list in-sheet wrap">`;
        at = key;
      }
      // (Its session said once, in the heading: 第8次定期會(第14次會議) reads 第14次會議.)
      const short = x ? x.n.replace(/^第\d+屆/, '') : '';
      const n = short && v.n.startsWith(short) ? v.n.slice(short.length).replace(/^[\s·(（]+/, '').replace(/^([^()（）]*)[)）]$/, '$1').trim() : '';
      html += vidRow(n ? { ...v, n } : v);
    }
    if (at !== null) html += '</div>';
    list.innerHTML = got.length ? `${html}${got.length > shown ? `<button type="button" class="lw-more" data-vmore>${W(`再看 ${Math.min(40, got.length - shown)} 段（共 ${got.length}）`, `${Math.min(40, got.length - shown)} more (${got.length} in all)`)}</button>` : ''}` : `<p class="lw-none">${W('沒有符合的影音', 'Nothing matches')}</p>`;
  };
  draw();
  const foot = c.video.site ? h('a', { class: 'q-more q-more-go lw-out', href: c.video.site, target: '_blank', rel: 'noopener', 'data-out': '', html: `<span>${W('議會的影音網站', 'The council’s video site')}</span><span class="q-more-chev" aria-hidden="true">›</span>` }) : null;
  const head = h('p', { class: 'lw-person-line', text: W(`本屆 ${vids.length.toLocaleString()} 段錄影`, `${vids.length.toLocaleString()} recordings this term`) });
  const body = h('div', {}, [head, input, chips, list, foot].filter(Boolean));
  const s = sheet({ title: W(`${c.n}影音`, 'Council video'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [body] });
  body.addEventListener('click', e => {
    const k = e.target.closest('[data-vk]');
    if (k) {
      pick = k.dataset.vk;
      shown = 40;
      chips.querySelectorAll('[data-vk]').forEach(b => b.setAttribute('aria-pressed', String(b === k)));
      return draw();
    }
    if (e.target.closest('[data-vmore]')) return ((shown += 40), draw());
    const b = e.target.closest('[data-ccvid]');
    if (b) openCouncilVideo(b.dataset.ccvid);
  });
  return s;
}

async function councilList(out) {
  if (!out.querySelector('.lw-council')) out.innerHTML = `<div class="lw-grid">${'<span class="lw-bill q-skel"></span>'.repeat(3)}</div>`;
  let idx, c;
  try {
    idx = await councilsData();
    c = shownCouncil = await data(`council/${councilOf(idx.councils).c}.json`);
  } catch {
    return void (out.innerHTML = emptyNote(W('議會資料讀不到，請稍後再試', 'Couldn’t load the councils')));
  }
  if (billFilter !== 'council') return;
  const day = twNow().day;
  const q = billQuery.trim();
  const pick = `<button type="button" class="lw-row lw-council-pick" data-pickcc><span class="lw-row-text"><span class="lw-row-name">${esc(c.n)}</span><small>${esc(councilLine(c, day))}</small></span><b class="lw-row-val">${W('換議會', 'Change')}</b>${CHEVRON}</button>`;
  const facts = `<div class="lw-stats four lw-council-facts">${[[W('議員', 'Members'), c.people.length, 'indigo'], [W('本屆提案', 'Bills'), c.gap ? '–' : idx.councils.find(x => x.c === c.c)?.bills ?? 0, 'teal'], [W('議長', 'Speaker'), c.head || '–', 'orange'], [W('副議長', 'Deputy'), c.deputy || '–', 'green']].map(([l, n, tone]) => `<span class="lw-stat ${tone}"><b class="q-fit">${typeof n === 'number' ? n.toLocaleString() : esc(n)}</b><span>${esc(l)}</span></span>`).join('')}</div>`;
  // A search: the council's whole term, read live; what's kept here answers at once meanwhile.
  if (q) {
    const words = expand(q);
    const here = c.bills.filter(b => words.some(w => b.t.includes(w) || b.by.includes(w)));
    const live = councilFound?.q === q && councilFound.c === c.c ? councilFound.rows : null;
    const rows = live || here;
    out.innerHTML = `<div class="lw-council">${pick}${section(live ? W(`本屆提案 ${councilFound.total.toLocaleString()} 件符合`, `${councilFound.total} bills this term`) : W('符合的提案', 'Bills that match'), rows.length ? `<div class="lw-list wrap">${rows.map(b => cbillRow(c, b)).join('')}</div>` : live ? emptyNote(W('沒有符合的提案', 'No bills match')) : '<span class="q-skel" style="display:block;height:120px"></span>')}</div>`;
    if (!live) {
      const ask = ++councilAsk;
      (c.own && !c.own.add ? ownBills(c).then(all => ({ bills: ownFind(all, words).slice(0, 60), total: ownFind(all, words).length })) : ccJson(ccSearch(c.c, c.term, q, 40)))
        .then(r => ask === councilAsk && ((councilFound = { q, c: c.c, total: r.total || 0, rows: (r.bills || []).map(compactCouncilBill) }), billFilter === 'council' && councilList(out)))
        .catch(() => ask === councilAsk && ((councilFound = { q, c: c.c, total: here.length, rows: here }), billFilter === 'council' && councilList(out)));
    }
    return;
  }
  const vids = c.video?.vids || [];
  const video = vids.length ? section(W('議會影音', 'Council video'), `<div class="lw-list wrap">${vids.slice(0, 4).map(vidRow).join('')}</div>${vids.length > 4 ? `<button type="button" class="lw-more" data-ccvids>${W(`看更多影音（${vids.length}）`, `More video (${vids.length})`)}</button>` : ''}`) : '';
  // The term's every session, each opened whole (its sittings, recordings and every bill), not only the newest.
  const ss = (c.sessions || []).filter(x => x.from && x.from <= day);
  const sessRow = x => `<button type="button" class="lw-row" data-ccsess="${esc(x.id)}"><span class="lw-row-text"><span class="lw-row-name">${esc(x.n.replace(/^第\d+屆/, ''))}</span><small>${esc([spanOf(x.from, x.to), x.bills ? W(`提案 ${x.bills.toLocaleString()} 件`, `${x.bills} bills`) : ''].filter(Boolean).join(' · '))}</small></span>${CHEVRON}</button>`;
  const sessions = ss.length ? section(W(`本屆會期 ${ss.length}`, `Sessions this term ${ss.length}`), `<div class="lw-list" data-ccsesslist>${ss.slice(0, 5).map(sessRow).join('')}</div>${ss.length > 5 ? `<button type="button" class="lw-more" data-ccsessall>${W(`再顯示 ${ss.length - 5} 個會期`, `Show ${ss.length - 5} more`)}</button>` : ''}`) : '';
  const liveBox = c.video?.live?.length ? '<div class="lw-list lw-cc-livebox" data-cclive-box hidden></div>' : '';
  const shown = c.bills.filter(b => b.t.length >= 8 && (b.t.match(/「/g) || []).length === (b.t.match(/」/g) || []).length);
  const n = 8 + councilMore;
  const bills = c.gap
    ? section(W('提案', 'Bills'), `<p class="lw-council-gap">${esc(W(...c.gap))}</p>`) + (c.records?.length ? section(W('議事錄', 'Minutes'), `<div class="lw-list">${c.records.map(r => `<a class="lw-row" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="lw-row-text"><span class="lw-row-name">${esc(r.what || W('會議紀錄', 'Minutes'))}</span><small>${esc(shortDay(r.d))}</small></span>${CHEVRON}</a>`).join('')}</div>`) : '')
    : section(W('最新提案', 'Newest bills'), `<div class="lw-list wrap">${shown.slice(0, n).map(b => cbillRow(c, b)).join('')}</div>${shown.length > n ? `<button type="button" class="lw-more" data-ccmore>${W('再顯示 20 件', 'Show 20 more')}</button>` : ''}`) + (c.own && !c.own.add ? `<p class="lw-hint-sm">${esc(c.own.out ? W(`開放資料的提案不完整，這裡讀自${c.own.site}。`, 'Read from the council’s own site, which holds more than the open data.') : W(`議會沒有把提案放上開放資料，這裡讀自${c.own.site}，沒有議決結果。`, 'Read from the council’s own site (no open data), without the outcomes.'))}</p>` : '');
  // Each one's bill count only where the bills name the councillors (宜蘭's open data holds only the 縣府's).
  const counted = !c.gap && c.people.filter(p => p.bills).length * 2 >= c.people.length;
  const person = x => `<button type="button" class="lw-person" data-ccp="${esc(x.n)}" style="--p:${partyColor(x.party)}">${personPhoto(x)}<span class="lw-person-text"><b class="q-fit">${esc(zhName(x.n) || x.n)}</b><small>${esc([partyShort(x.party), x.title || x.area.replace(/^第(\d+)選舉區$/, (_, d) => W(`第${+d}區`, `D${+d}`))].filter(Boolean).join(' · '))}</small></span>${counted ? `<span class="lw-person-n">${W(`提案 ${x.bills}`, `${x.bills} bills`)}</span>` : ''}</button>`;
  const byArea = new Map();
  for (const x of [...c.people].sort((a, b) => (Number(a.area.match(/\d+/)?.[0]) || 99) - (Number(b.area.match(/\d+/)?.[0]) || 99))) byArea.set(x.area, [...(byArea.get(x.area) || []), x]);
  const people = section(W(`議員 ${c.people.length}`, `Members ${c.people.length}`), `<div class="lw-people q-rows-full q-rows-keep">${[...byArea.values()].flat().map(person).join('')}</div>`);
  // A county's 鄉鎮市民代表會 (and a city's 山地原住民區民代表會), from the reps list.
  let towns = '';
  try {
    const r = (await repsData()).places.find(p => p.city === c.city || p.cc === c.c);
    if (r?.towns.length) towns = section(W(`${r.towns.some(t => !t.hill) ? '鄉鎮市民代表會' : '原住民區民代表會'} ${r.towns.length}`, `Township councils ${r.towns.length}`), `<div class="lw-list">${r.towns.map(t => `<button type="button" class="lw-row" data-town="${esc(t.tc)}"><span class="lw-row-text"><span class="lw-row-name">${esc(`${t.town}民代表會`)}</span><small>${esc(W(`${t.reps.length} 位代表${TOWN_SITES[t.tc] ? ' · 議事錄、錄音' : ''}${TOWN_YOUTUBE[t.tc] ? ' · 影音' : ''}`, `${t.reps.length} members${TOWN_SITES[t.tc] ? ' · minutes, audio' : ''}${TOWN_YOUTUBE[t.tc] ? ' · video' : ''}`))}</small></span>${CHEVRON}</button>`).join('')}</div><p class="lw-hint-sm">${W('代表會沒有公開提案資料；這裡是現任代表（2022 年選出）。', 'Township councils publish no bills as data; these are the members elected in 2022.')}</p>`);
  } catch {}
  if (billFilter !== 'council' || billQuery.trim()) return;
  const agenda = section(W('議程', 'Agenda'), `<div data-ccagenda><span class="q-skel" style="display:block;height:120px"></span></div><button type="button" class="q-more q-more-go" data-ccall><span>${W('各議會的議程', 'Every council’s agenda')}</span><span class="q-more-chev" aria-hidden="true">›</span></button>`);
  const html = `<div class="lw-council">${pick}${liveBox}${facts}${cols([[agenda + video + sessions + bills, 0], [people + towns, 1]])}</div>`;
  paint(out, html);
  councilAgenda(c, out);
  councilLive(c, out);
}

// A council's 議程 as 立法's: its days on the family's day strip (the term's, read live from the API, with the
// days only its recordings know), a day's sittings each with its recording, and the day's other recordings.
const councilAgendaRec = {};
let councilAgendaDay = null;
const termSits = new Map();
async function councilAgenda(c, out) {
  const box = out.querySelector('[data-ccagenda]');
  if (!box) return;
  const day = twNow().day;
  const draw = (sits, vids) => {
    const all = councilDays(sits, vids);
    const days = [...new Set(all.map(x => x.d))];
    box.next = () => null;
    if (!days.length) return void (box.innerHTML = `<p class="lw-none">${W('這個議會還沒有公布議程', 'No agenda published yet')}</p>`);
    if (councilAgendaRec.c !== c.c || !days.includes(councilAgendaDay)) councilAgendaDay = days.find(d => d >= day) || days.at(-1);
    councilAgendaRec.c = c.c;
    const list = h('div', { class: 'lw-meets' });
    const show = d => {
      councilAgendaDay = d;
      const here = all.filter(x => x.d === d);
      const vs = vids.filter(v => v.d === d);
      const used = new Set();
      const rows = here.map(x => {
        const v = videosOf(vs, x).find(y => !used.has(y.id));
        if (v) used.add(v.id);
        return sittingRow({ ...x, done: x.d < day }, x.d <= day ? v : null);
      });
      const extra = vs.filter(v => !used.has(v.id));
      list.innerHTML = rows.join('') + (extra.length ? `<div class="lw-list in-sheet wrap lw-day-vids">${extra.map(vidRow).join('')}</div>` : '');
    };
    const bar = d => dayBar(councilAgendaRec, { flat: true, days, current: d, today: day, follow: true, onPick: d2 => (show(d2), bar(d2)) });
    // (A fresh draw, or the term's days come in: the chosen day back to the strip's middle.)
    kitUI.dayRecenter?.(councilAgendaRec);
    box.replaceChildren(bar(councilAgendaDay), list);
    show(councilAgendaDay);
    // A swipe across the day's sittings: the day either side, as 立法's 議程 (Jay 2026-11-11).
    box.next = dir => dayStep(days, councilAgendaDay, dir);
    box.step = dir => {
      const d = box.next(dir);
      return Boolean(d && (show(d), bar(d), true));
    };
    if (!box.swipes) ((box.swipes = true), daySwipe(box, dir => box.step(dir), { can: dir => Boolean(box.next?.(dir)), page: false }));
  };
  const vids = c.video?.vids?.length ? termVids.get(c.c) || c.video.vids : [];
  draw(c.sittings || [], vids);
  // The term's: every sitting (the phone's own read of the API), every recording.
  const [sits, all] = await Promise.all([
    termSits.has(c.c) ? termSits.get(c.c) : ccJson(ccTermSittings(c.c, c.term)).then(r => saneSittings((r.sittings || []).map(compactSitting).filter(Boolean), c.sessions)).catch(() => null),
    c.video?.vids?.length ? councilTermVids(c) : []
  ]);
  if (sits?.length) termSits.set(c.c, sits);
  if (!box.isConnected || shownCouncil?.c !== c.c) return;
  const merged = sits?.length ? [...sits, ...(c.sittings || []).filter(x => x.video)] : c.sittings || [];
  draw(merged, all);
}

// Every council's 議程 on one day (council/agenda.json: one read), by council, each sitting with its recording; a
// council's name opens it.
const allAgendaRec = {};
let allAgendaDay = null;
async function allCouncilAgenda() {
  const box = h('div', { html: '<span class="q-skel" style="display:block;height:200px"></span>' });
  const s = sheet({ title: W('各議會的議程', 'Every council’s agenda'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [box] });
  let idx, ag;
  try {
    [idx, ag] = await Promise.all([councilsData(), data('council/agenda.json')]);
  } catch {
    return void (box.innerHTML = emptyNote(W('議程讀不到，請稍後再試', 'Couldn’t load the agenda')));
  }
  const day = twNow().day;
  const rows = ag.rows || [];
  const name = new Map(idx.councils.map(c => [c.c, c.n]));
  const order = new Map(idx.councils.map((c, i) => [c.c, i]));
  const mine = councilOf(idx.councils).c;
  const days = [...new Set([...rows.map(x => x.d), day])].sort();
  if (!days.includes(allAgendaDay)) allAgendaDay = days.find(d => d >= day && rows.some(x => x.d === d)) || day;
  const list = h('div');
  const show = d => {
    allAgendaDay = d;
    const here = rows.filter(x => x.d === d);
    // The reader's council first, then the family's order (直轄市 first).
    const by = [...new Set(here.map(x => x.c))].sort((a, b) => (a === mine ? -1 : b === mine ? 1 : (order.get(a) ?? 99) - (order.get(b) ?? 99)));
    list.innerHTML = by.length
      ? `<p class="lw-hint-sm">${esc(W(`${by.length} 個議會開會`, `${by.length} councils sit`))}</p>${by.map(c => `<button type="button" class="lw-vid-group lw-cc-name" data-ccopen="${esc(c)}">${esc(name.get(c) || c)}${CHEVRON}</button><div class="lw-meets">${here.filter(x => x.c === c).map(x => sittingRow({ ...x, done: x.d < day }, x.v)).join('')}</div>`).join('')}`
      : `<p class="lw-none">${W('這天沒有議會開會', 'No council sits this day')}</p>`;
  };
  const bar = d => dayBar(allAgendaRec, { flat: true, days, current: d, today: day, follow: true, onPick: d2 => (show(d2), bar(d2)) });
  kitUI.dayRecenter?.(allAgendaRec);
  box.replaceChildren(bar(allAgendaDay), list);
  show(allAgendaDay);
  list.addEventListener('click', async e => {
    const open = e.target.closest('[data-ccopen]');
    if (open) {
      kit.writeStore?.(COUNCIL_KEY, open.dataset.ccopen);
      (councilMore = 0), (councilFound = null), haptic(), s.close();
      return drawBillList();
    }
    const b = e.target.closest('[data-ccvid]');
    const x = b && rows.find(y => y.v?.id === b.dataset.ccvid);
    if (!x) return;
    shownCouncil = await data(`council/${x.c}.json`).catch(() => shownCouncil);
    openCouncilVideo(x.v.id, -1, x.v);
  });
  return s;
}

// One session of a council, whole: its sittings (read live from the API, each with its recording where there is
// one), and every bill it took, by outcome and committee.
async function councilSession(c, x) {
  if (!x) return;
  shownCouncil = c;
  const vids = c.video?.vids?.length ? await councilTermVids(c) : [];
  const to = x.to || twNow().day;
  const mine = vids.filter(v => v.d >= x.from && v.d <= to);
  const sitBox = h('div', { html: section(W('開會', 'Sittings'), '<span class="q-skel" style="display:block;height:96px"></span>') });
  const billBox = h('div', { html: x.bills ? section(W(`提案 ${x.bills.toLocaleString()}`, `Bills ${x.bills}`), '<span class="q-skel" style="display:block;height:160px"></span>') : '' });
  const head = h('div', { html: `<h2 class="lw-item-name">${esc(x.n)}</h2><p class="lw-person-line">${esc([c.n, `${shortDay(x.from)}${x.to ? `–${shortDay(x.to)}` : ''}`].join(' · '))}</p>${mine.length ? section(W(`影音 ${mine.length}`, `Video ${mine.length}`), `<div class="lw-list in-sheet wrap">${mine.slice(0, 6).map(vidRow).join('')}</div>${mine.length > 6 ? `<button type="button" class="lw-more" data-ccvids>${W(`看全部影音（${mine.length}）`, `All video (${mine.length})`)}</button>` : ''}`) : ''}` });
  const s = sheet({ title: x.n.replace(/^第\d+屆/, ''), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [head, sitBox, billBox] });
  ccJson(ccSittings(c.c, x.id))
    .then(r => {
      const sits = saneSittings((r.sittings || []).map(compactSitting).filter(Boolean), c.sessions);
      const row = y => sittingRow({ ...y, done: y.d < twNow().day }, videosOf(vids, y)[0]);
      sitBox.innerHTML = sits.length ? section(W(`開會 ${sits.length}`, `Sittings ${sits.length}`), `<div class="lw-meets">${sits.slice(0, 6).map(row).join('')}</div>${sits.length > 6 ? `<button type="button" class="lw-more" data-ccsitall>${W(`再顯示 ${sits.length - 6} 場`, `Show ${sits.length - 6} more`)}</button>` : ''}`) : '';
      sitBox.onclick = e => {
        const all = e.target.closest('[data-ccsitall]');
        if (all) ((sitBox.querySelector('.lw-meets').innerHTML = sits.map(row).join('')), all.remove());
      };
    })
    .catch(() => (sitBox.innerHTML = ''));
  let rows = [];
  let pick = '';
  let n = 30;
  const draw = () => {
    const outs = [...new Set(rows.map(b => b.out).filter(Boolean))];
    const cats = [...rows.reduce((m, b) => (b.cat ? m.set(b.cat, (m.get(b.cat) || 0) + 1) : m), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
    const keys = [...outs.map(k => `o:${k}`), ...cats.map(k => `c:${k}`)];
    const shown = rows.filter(b => !pick || (pick.startsWith('o:') ? b.out === pick.slice(2) : b.cat === pick.slice(2)));
    const chip = (k, label) => `<button type="button" class="q-chip" data-ccpick="${esc(k)}" aria-pressed="${k === pick}">${esc(label)}</button>`;
    const chips = keys.length > 1 ? `<div class="q-chips lw-chips">${chip('', W('全部', 'All'))}${outs.map(k => chip(`o:${k}`, OUTCOME[k] ? OUTCOME[k][en ? 1 : 0] : k)).join('')}${cats.map(k => chip(`c:${k}`, k)).join('')}</div>` : '';
    billBox.innerHTML = section(W(`提案 ${rows.length.toLocaleString()}`, `Bills ${rows.length}`), `${chips}<div class="lw-list in-sheet wrap">${shown.slice(0, n).map(b => cbillRow(c, { ...b, s: '' })).join('')}</div>${shown.length > n ? `<button type="button" class="lw-more" data-ccmorein>${W(`再顯示 ${Math.min(30, shown.length - n)} 件（共 ${shown.length}）`, `Show more (${shown.length})`)}</button>` : ''}`);
  };
  if (x.bills)
    data(sessionBillsFile(c.c, x.id))
      // As the newest list: a bill whose words the source cut off (too short, a quote left open) left out.
      .then(r => ((rows = (r.rows || []).filter(b => b.t.length >= 8 && (b.t.match(/「/g) || []).length === (b.t.match(/」/g) || []).length)), draw()))
      .catch(() => (billBox.innerHTML = section(W('提案', 'Bills'), emptyNote(W('提案讀不到，請稍後再試', 'Couldn’t load the bills')))));
  billBox.addEventListener('click', e => {
    const p = e.target.closest('[data-ccpick]');
    if (p) return ((pick = p.dataset.ccpick), (n = 30), draw());
    if (e.target.closest('[data-ccmorein]')) return ((n += 30), draw());
    const b = e.target.closest('[data-cbill]');
    if (b) openCouncilBill(b.dataset.cbill);
  });
  head.addEventListener('click', e => {
    const all = e.target.closest('[data-ccvids]');
    if (all) return ((all.previousElementSibling.innerHTML = mine.map(vidRow).join('')), all.remove());
    const v = e.target.closest('[data-ccvid]');
    if (v) openCouncilVideo(v.dataset.ccvid);
  });
  sitBox.addEventListener('click', e => {
    const v = e.target.closest('[data-ccvid]');
    if (v) openCouncilVideo(v.dataset.ccvid);
  });
  return s;
}

// The 22 councils to pick from: 直轄市 first, each with its session now.
async function councilPicker() {
  const idx = await councilsData().catch(() => null);
  if (!idx) return;
  const day = twNow().day;
  const cur = councilOf(idx.councils);
  const row = c => `<button type="button" class="lw-row${c.c === cur.c ? ' on' : ''}" data-cc="${esc(c.c)}"><span class="lw-row-text"><span class="lw-row-name">${esc(c.n)}</span><small>${esc(councilLine(c, day))}</small></span>${c.c === cur.c ? `<b class="lw-row-val">${W('現在', 'Shown')}</b>` : CHEVRON}</button>`;
  const body = h('div', { html: [[W('直轄市議會', 'Special municipalities'), idx.councils.filter(c => c.big)], [W('縣市議會', 'Counties and cities'), idx.councils.filter(c => !c.big)]].map(([t, xs]) => section(t, `<div class="lw-list in-sheet">${xs.map(row).join('')}</div>`)).join('') });
  const s = sheet({ title: W('選議會', 'Pick a council'), closeLabel: W('關閉', 'Close'), body: [body] });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-cc]');
    if (!b) return;
    kit.writeStore?.(COUNCIL_KEY, b.dataset.cc);
    (councilMore = 0), (councilFound = null), haptic(), s.close();
    drawBillList();
  });
}

// One bill, read whole from the API: what's asked, why, how, the review and the decision, the council's own page.
async function openCouncilBill(id) {
  const box = h('div', { class: 'lw-cbill-body', html: '<span class="q-skel" style="display:block;height:160px"></span>' });
  // Large: over a councillor's sheet it covers it whole, not half (Jay 11-10).
  sheet({ title: W('議會提案', 'Council bill'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [box] });
  let b;
  try {
    // One read from the council's own site (新竹縣, 新竹市, 花蓮縣): what's asked, who, and its page there.
    const own = id.match(/^([a-z]{3})-p/);
    if (own) {
      const c = await data(`council/${own[1]}.json`);
      b = (await ownBills(c)).find(x => x['代碼'] === id);
      if (!b) throw new Error('gone');
      // Its PDF read at build into its parts (新竹縣, 新竹市): shown as the API's bills are, the PDF a link below.
      const t = PDF_TEXT.has(own[1]) ? (await data(`council/text/${own[1]}/${textBucket(id)}.json`).catch(() => null))?.[id] : null;
      if (t?.pdf) b = { ...b, ...t, 案號: t['案號'] || b['案號'] };
      // 新竹's sites list the bill only; 花蓮's carries its decision, drawn as the API's are.
      if (!b['議決'] && !c.own?.out) {
        return void (box.innerHTML = `<h2 class="lw-item-name">${esc(b['案由'])}</h2>${fieldsHtml([[W('類別', 'Type'), b['類別']], [W('日期', 'Date'), shortDay(b['日期'])], [W('提案人', 'Filed by'), b['主提案人'] ?? b['提案人']], [W('連署人', 'Co-signers'), b['連署人']]])}<p class="lw-hint-sm">${esc(PDF_TEXT.has(own[1]) ? W('這件的說明和議決還沒讀進來（每天讀一批議會的附件），先看原始資料。', 'Its reasons and outcome aren’t read in yet; see the original for now.') : W(`${c.own?.site || '議會網站'}只列提案，沒有議決結果；說明和辦法在議會的附件裡。`, 'The council’s site lists the bill only; its reasons and outcome are in its attachment.'))}</p><a class="q-btn block" href="${esc(b['來源網址'])}" target="_blank" rel="noopener">${W('看議會的原始資料', 'The council’s own record')}</a>`);
      }
      b = { ...b, 提案人: b['主提案人'] ?? b['提案人'] ?? '' };
    } else b = (await ccJson(ccBill(id)))?.data;
    // (An id the API no longer has answers with no data: said so, not an empty sheet.)
    if (!b) throw new Error('gone');
  } catch {
    return void (box.innerHTML = emptyNote(W('這件提案讀不到，請稍後再試', 'Couldn’t load this bill')));
  }
  box.innerHTML = councilBillHtml(b);
}
// A bill, as its parts: what it asks, its outcome, who, why, how, and what was decided (a council's, or a 代表會's
// 決議案 read from its PDF); the PDF or the council's page below.
function councilBillHtml(b) {
  // A part said only by pointing at the others (辦法: 如案由及說明) adds nothing.
  const part = (title, text, after = '') => (String(text || '').trim() && !/^(案由|議決|說明|辦法|審查意見|如(案由|說明|案由及說明|案由、說明)。?)$/.test(String(text).trim()) ? `<div class="lw-item-why"><h4>${esc(title)}</h4>${proseHtml(String(text))}${after}</div>` : '');
  const decided = b['議決會議'] || b['議決日期'] ? `<p class="lw-clip-meta">${esc([b['議決會議'], b['議決日期'] && shortDay(b['議決日期'])].filter(Boolean).join(' · '))}</p>` : '';
  const out = outcomeOf(b['議決'], b['審查意見']);
  const fields = fieldsHtml([[W('案號', 'No.'), b['案號']], [W('類別', 'Type'), b['類別']], [W('會期', 'Session'), b['會期名稱']], [W('提案人', 'Filed by'), b['提案人']], [W('連署人', 'Co-signers'), b['連署人']], [W('附署人', 'Co-signers'), b['附署人']], [W('提案單位', 'From'), b['提案人'] ? '' : b['提案單位']]]);
  return `<h2 class="lw-item-name">${esc(b['案由'] || '')}</h2>${out ? `<div class="lw-meta">${outcomeTag(out)}</div>` : ''}${fields}${part(W('說明', 'Why'), b['說明'])}${part(W('辦法', 'What it asks'), b['辦法'])}${part(W('審查意見', 'Committee view'), b['審查意見'])}${part(W('議決', 'Decision'), b['議決'], decided)}${b.pdf ? `<a class="q-more q-more-go lw-out" href="${esc(b.pdf)}" target="_blank" rel="noopener" data-out><span>${W(b.pdfName || '原始提案 PDF', 'The original PDF')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : b['來源網址'] ? `<a class="q-btn block" href="${esc(b['來源網址'])}" target="_blank" rel="noopener">${W('看議會的原始資料', 'The council’s own record')}</a>` : ''}`;
}

// A councillor: their party and district, and the bills they filed this term (read live).
// (code: their council, from 我的; else the council shown.)
async function openCouncilor(name, code = '') {
  const c = await data(`council/${code || councilOf((await councilsData()).councils).c}.json`).catch(() => null);
  const x = c?.people.find(p => p.n === name);
  if (!x) return;
  const zh = zhName(name) || name;
  // Followed (☆, into 我的) as their council and name: what they file and say, new since last opened.
  const key = `${c.c}:${x.n}`;
  if (state.mine.cc?.[key]) (markSeen(state.mine, 'cc', key), save(), state.ccNew && (state.ccNew[key] = 0), state.ccLast && (state.ccLast[key] = ''), badge());
  const follow = h('button', { type: 'button', class: `lw-tool${state.mine.cc?.[key] ? ' on' : ''}`, 'aria-label': W('追蹤', 'Follow'), html: ICON.star, onclick: e => ((state.mine.cc ||= {}), toggleFollow(state.mine, 'cc', key) && toast(W('已追蹤，動態會出現在「我的」', 'Following: their news shows in Mine')), save(), e.currentTarget.classList.toggle('on', Boolean(state.mine.cc[key])), haptic()) });
  const counted = c.people.filter(p => p.bills).length * 2 >= c.people.length;
  const billsHead = () => `<h4>${counted ? W(`本屆提案（${x.bills}）`, `Bills this term (${x.bills})`) : W('本屆提案', 'Bills this term')}</h4>`;
  const skel = '<span class="q-skel" style="display:block;height:120px"></span>';
  const list = h('div', { class: 'lw-person-sec', html: c.gap ? '' : `${billsHead()}${skel}` });
  const talk = h('div', { class: 'lw-person-sec', html: `<h4>${W('最近質詢和發言', 'Recent speeches')}</h4>${skel}` });
  const head = h('div', { class: 'lw-person-head', html: `${personPhoto(x, 'lg')}<div><h2>${esc(x.n)}</h2><div class="lw-meta"><span class="lw-party" style="--p:${partyColor(x.party)}">${esc(partyShort(x.party))}</span><span class="lw-tag">${esc(`${c.city}${x.area}`)}</span>${x.title ? countTag(x.title, 'indigo') : ''}</div></div>` });
  // Their 質詢 on video, where the council files recordings by councillor (高雄).
  const clipBox = h('div', { class: 'lw-person-sec', html: c.video?.clips ? `<h4>${W('質詢影片', 'Questions on video')}</h4>${skel}` : '' });
  const s = sheet({ title: W('議員', 'Councillor'), lead: follow, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [head, clipBox, list, talk] });
  list.addEventListener('click', e => e.target.closest('[data-cbill]') && openCouncilBill(e.target.closest('[data-cbill]').dataset.cbill));
  if (c.video?.clips) {
    let clips = [];
    data(c.video.clips)
      .then(r => {
        clips = r.people?.[zh] || [];
        clipBox.innerHTML = clips.length ? `<h4>${W('質詢影片', 'Questions on video')}</h4><div class="lw-list in-sheet wrap">${clips.slice(0, 4).map(v => vidRow({ ...v, n: v.n.split(' · ').filter(w => !w.includes(zh)).join(' · ') || v.n })).join('')}</div>` : '';
      })
      .catch(() => (clipBox.innerHTML = ''));
    clipBox.addEventListener('click', e => {
      const b = e.target.closest('[data-ccvid]');
      const v = b && clips.find(x => x.id === b.dataset.ccvid);
      if (v) openCouncilVideo(v.id, -1, v);
    });
  }
  // What they said in the chamber: the API's transcripts of the 議事錄, a meeting a row.
  ccJson(ccSpeech(c.c, zh))
    .then(r => {
      const said = speechesOf(r.meet_transcripts || [], 6);
      talk.innerHTML = said.length
        ? `<h4>${W('最近質詢和發言', 'Recent speeches')}</h4><div class="lw-list in-sheet wrap">${said.map(m => `<${m.url ? `a href="${esc(m.url)}" target="_blank" rel="noopener"` : 'div'} class="lw-row lw-cbill"><span class="lw-row-text"><span class="lw-row-name">${esc(m.t)}</span><small>${esc(W(`${shortDay(m.d)} · ${m.n} 段發言`, `${shortDay(m.d)} · ${m.n} turns`))}</small></span></${m.url ? 'a' : 'div'}>`).join('')}</div>`
        : '';
    })
    .catch(() => (talk.innerHTML = ''));
  if (c.gap) return s;
  try {
    const mine = () => ownBills(c).then(all => all.filter(b => String(b['提案人']).split('、').includes(zh)));
    // 彰化's newest sessions are only in its own file (`add`): with the API's.
    const r = c.own && !c.own.add ? { bills: await mine() } : await ccJson(ccSearch(c.c, c.term, zh, 100));
    if (c.own?.add) r.bills = [...(r.bills || []), ...(await mine().catch(() => []))];
    const rows = newestBills(theirBills(r.bills || [], zh).map(compactCouncilBill), c.sessions, 100);
    list.innerHTML = `${billsHead()}${rows.length ? `<div class="lw-list in-sheet wrap">${rows.slice(0, 30).map(b => cbillRow(c, b)).join('')}</div>` : emptyNote(counted ? W('還沒有提案', 'No bills yet') : W('這個議會的開放資料沒有議員提案', 'This council’s open data lists no councillors’ bills'))}`;
  } catch {
    list.innerHTML = emptyNote(W('提案讀不到，請稍後再試', 'Couldn’t load the bills'));
  }
  return s;
}

// A township's 代表會: its members by district; where its own site is read (lib/town-site.mjs), its sessions,
// each with its days' recordings and its papers (會議紀錄, 施政報告, 總質詢, 決議案), its members' photos and its news.
async function openTown(tc) {
  const r = await repsData().catch(() => null);
  const t = r?.places.flatMap(p => p.towns.map(x => ({ ...x, city: p.city }))).find(x => x.tc === tc);
  if (!t) return;
  const [own, video] = await Promise.all([TOWN_SITES[tc] ? data(`council/town/${tc}.json`).catch(() => null) : null, TOWN_YOUTUBE[tc] ? data(`council/town-video/${tc}.json`).catch(() => null) : null]);
  const vids = video?.vids || [];
  if (own?.sessions?.length || own?.people?.length) return townSheet(t, own, vids);
  const areas = new Map();
  for (const [n, party, area] of t.reps) areas.set(area, [...(areas.get(area) || []), [n, party]]);
  const html = `<h2 class="lw-item-name">${esc(`${t.city}${t.town}民代表會`)}</h2><p class="lw-person-line">${esc(W(`${t.reps.length} 位代表，2022 年選出，任期到 2026 年 12 月。`, `${t.reps.length} members, elected in 2022, serving to December 2026.`))}</p>${[...areas].map(([area, xs]) => `<div class="lw-item-who"><h4>${esc(area.replace(/^.+?(第\d+選舉區)$/, '$1').replace(/選舉區$/, W('選區', ' district')))}</h4><div class="lw-parties">${xs.map(([n, party]) => `<span class="lw-party" style="--p:${partyColor(party)}">${esc(n)}<small>${esc(partyShort(party))}</small></span>`).join('')}</div></div>`).join('')}<p class="lw-hint-sm">${W('代表會的提案和議事錄沒有開放資料，請看鄉鎮市公所或代表會網站。', 'Township councils publish no bills or minutes as open data.')}</p>`;
  const body = h('div', { html });
  const s = sheet({ title: W('代表會', 'Township council'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [body] });
  townVideos(body, t, vids, body.querySelector('.lw-person-line'));
  return s;
}

// A 代表會's recordings on its YouTube channel (lib/town-video.mjs): the newest four under its first line, all of
// them a tap away; each plays in the app.
function townVideos(body, t, vids, after) {
  if (!vids.length || !after) return;
  const ctx = { town: true, n: `${t.town}民代表會`, video: { site: ytSite(TOWN_YOUTUBE[t.tc][0]) } };
  const box = h('div', { html: section(W('影音', 'Video'), `<div class="lw-list in-sheet wrap" data-tvlist>${vids.slice(0, 4).map(vidRow).join('')}</div>${vids.length > 4 ? `<button type="button" class="lw-more" data-tvall>${W(`看全部影音（${vids.length}）`, `All video (${vids.length})`)}</button>` : ''}`) });
  after.after(box);
  box.addEventListener('click', e => {
    if (e.target.closest('[data-tvall]')) {
      box.querySelector('[data-tvlist]').innerHTML = vids.map(vidRow).join('');
      return e.target.closest('[data-tvall]').remove();
    }
    const b = e.target.closest('[data-ccvid]');
    const v = b && vids.find(x => x.id === b.dataset.ccvid);
    if (v) openCouncilVideo(v.id, -1, v, ctx);
  });
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const mdOf = d => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
const spanOf = (a, b) => (a && b && a !== b ? `${mdOf(a)}–${mdOf(b)}` : mdOf(a || b));
const dayLabel = d => `${mdOf(d)}${en ? '' : `（${WEEK[new Date(`${d}T00:00:00Z`).getUTCDay()]}）`}`;
const PAPERS = [
  ['議事日程表', 'Agenda'],
  ['施政報告', 'Mayor’s report'],
  ['總質詢', 'Questions to the mayor'],
  ['提案', 'Proposals'],
  ['決議案', 'Resolutions'],
  ['會議紀錄', 'Minutes'],
  ['致詞', 'Speeches'],
  ['附錄', 'Appendix'],
  ['其他', 'Other']
];
const PDF_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const paperRow = (n, url, small = '') => `<a class="lw-row lw-paper" href="${esc(url)}" target="_blank" rel="noopener" data-out><span class="lw-paper-ic">${PDF_ICON}</span><span class="lw-row-text"><span class="lw-row-name">${esc(n)}</span>${small ? `<small>${esc(small)}</small>` : ''}</span>${CHEVRON}</a>`;
// A sitting read from its minutes: what it did (and its result), its day, hours and who came; a tap opens them.
const sitRow = ({ x, url, name }) => {
  const did = x.done.map(d => d.what.replace(/^審議(市長|鄉長|鎮長|代表)提案[：:]/, '')).filter(Boolean);
  const res = x.done.map(d => d.result).filter(Boolean).pop() || '';
  const tag = /續審|第[一二]讀會/.test(res) && !/通過/.test(res) ? '' : outcomeTag(outcomeOf(res, ''));
  const small = [x.d && dayLabel(x.d), x.n, x.from && `${x.from}${x.to ? `–${x.to}` : ''}`, x.att ? W(`${x.att} 人出席`, `${x.att} present`) : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="lw-row lw-cbill" data-towntext="${esc(url)}" data-name="${esc(name)}"><span class="lw-row-text"><span class="lw-row-name">${esc(did.slice(0, 2).join('；') + (did.length > 2 ? W(` 等 ${did.length} 項`, ` and ${did.length - 2} more`) : ''))}</span><small>${esc(small)}</small></span>${tag || CHEVRON}</button>`;
};
// What a session holds, in a line.
const sessionLine = s => {
  const q = s.items?.filter(i => i.k === '總質詢').length || 0;
  return [spanOf(s.from, s.ext?.to || s.to), s.res ? W(`決議 ${s.res} 案`, `${s.res} resolutions`) : s.props ? W(`提案 ${s.props} 案`, `${s.props} proposals`) : '', s.asks ? W(`質詢 ${s.asks} 次`, `${s.asks} questions`) : '', s.wq ? W(`書面質詢 ${s.wq} 件`, `${s.wq} written questions`) : !s.asks && q ? W(`總質詢 ${q} 天`, `${q} days of questions`) : '', !s.days?.length && s.folders?.length ? W('有錄音', 'Audio') : s.days?.length ? (s.days[0].d ? (s.days.some(townVideo) ? W(`${new Set(s.days.map(d => d.d)).size} 天影音`, `${new Set(s.days.map(d => d.d)).size} days of video`) : W(`${new Set(s.days.map(d => d.d)).size} 天錄音`, `${new Set(s.days.map(d => d.d)).size} days recorded`)) : W(`錄音 ${s.days.length} 段`, `${s.days.length} audio parts`)) : '', !s.items?.length && s.agenda?.length ? W('有議事日程表', 'Agenda out') : ''].filter(Boolean).join(' · ');
};

async function townSheet(t, own, vids = []) {
  const day = twNow().day;
  const party = new Map(t.reps.map(([n, p]) => [n, p]));
  const sessions = own.sessions || [];
  const now = sessions.find(s => sessionState(s, day) === 'on') || [...sessions].reverse().find(s => sessionState(s, day) === 'ahead');
  const name = `${t.city}${t.town}民代表會`;
  // (A site without its members' page: the elected members, by district.)
  const people = (own.people?.length ? own.people : t.reps.map(([n, , area]) => ({ n, title: '代表', area: area.replace(/^.*?第0?(\d+)選舉區$/, (_, d) => `第${'一二三四五六七八九'[d - 1] || d}選區`) }))).map(p => ({ ...p, party: party.get(p.n) || '', photo: p.img }));
  const lead = ['主席', '副主席'];
  people.sort((a, b) => (lead.indexOf(a.title) + 1 || 9) - (lead.indexOf(b.title) + 1 || 9));
  const ends = own.ends ? W(`任期到 ${+own.ends.slice(0, 4)} 年 ${+own.ends.slice(5, 7)} 月 ${+own.ends.slice(8, 10)} 日`, `serving to ${own.ends}`) : '';
  const sessionRow = (s, i) => `<button type="button" class="lw-row" data-townsess="${i}"><span class="lw-row-text"><span class="lw-row-name">${esc(W(`第${own.term}屆${s.n}`, `Term ${own.term} ${s.n}`))}</span><small>${esc(sessionLine(s))}</small></span>${CHEVRON}</button>`;
  const shown = 6;
  const nowCard = now
    ? `<button type="button" class="lw-row lw-town-now" data-townsess="${sessions.indexOf(now)}"><span class="lw-row-text"><span class="lw-row-name">${sessionState(now, day) === 'on' ? `<span class="lw-live">${W('開會中', 'In session')}</span>` : `<span class="lw-town-soon">${W('下次開會', 'Next')}</span>`} ${esc(now.n)}</span><small>${esc([spanOf(now.from, now.to), now.ext ? W(`延長會 ${spanOf(now.ext.from, now.ext.to)}`, `extended ${spanOf(now.ext.from, now.ext.to)}`) : '', now.agenda?.length ? W('有議事日程表', 'Agenda out') : ''].filter(Boolean).join(' · '))}</small></span>${CHEVRON}</button>`
    : '';
  const person = x => `<button type="button" class="lw-person" data-townp="${esc(x.url || '')}" style="--p:${partyColor(x.party)}">${personPhoto(x)}<span class="lw-person-text"><b class="q-fit">${esc(x.n)}</b><small>${esc([partyShort(x.party), x.title !== '代表' ? x.title : x.area.replace(/選區$/, W('區', ' district'))].filter(Boolean).join(' · '))}</small></span></button>`;
  const news = (own.news || []).slice(0, 6);
  const html = `<h2 class="lw-item-name">${esc(name)}</h2><p class="lw-person-line">${esc([W(`${people.length || t.reps.length} 位代表`, `${people.length || t.reps.length} members`), W(`第${own.term}屆`, `term ${own.term}`), ends].filter(Boolean).join(W('，', ', ')))}</p>${nowCard ? `<div class="lw-list in-sheet">${nowCard}</div>` : ''}${
    sessions.length
      ? section(W('會期', 'Sessions'), `<div class="lw-list in-sheet" data-townlist>${sessions.slice(0, shown).map(sessionRow).join('')}</div>${sessions.length > shown ? `<button type="button" class="lw-more" data-townall>${W(`再顯示 ${sessions.length - shown} 個會期`, `Show ${sessions.length - shown} more`)}</button>` : ''}`)
      : ''
  }${people.length ? section(W(`代表 ${people.length}`, `Members ${people.length}`), `<div class="lw-people q-rows-full q-rows-keep">${people.map(person).join('')}</div>`) : ''}${
    news.length ? section(W('代表會消息', 'News'), `<div class="lw-list in-sheet wrap">${news.map(x => `<button type="button" class="lw-row" data-townp="${esc(x.url)}"><span class="lw-row-text"><span class="lw-row-name">${esc(x.t)}</span></span>${CHEVRON}</button>`).join('')}</div>`) : ''
  }<a class="q-more q-more-go lw-out" href="${esc(own.site)}" target="_blank" rel="noopener" data-out><span>${W('代表會網站', 'The council’s site')}</span><span class="q-more-chev" aria-hidden="true">›</span></a><p class="lw-hint-sm">${/zhubei\.gov\.tw/.test(own.site) ? W('議事錄、日程表和錄音都讀自代表會網站；文件是 PDF，網站只在台灣打得開。', 'Read from the council’s own site; its papers are PDFs, and the site opens only in Taiwan.') : /ctrl\.chcg\.gov\.tw/.test(own.site) ? W('議事錄、日程表和錄音都讀自代表會在彰化縣政府的網站；文件是 PDF。', 'Read from the council’s pages on the county’s site; its papers are PDFs.') : W('議事錄、日程表和錄音都讀自鄉鎮市公所網站的代表會專區；文件是 PDF。', 'Read from the council’s pages on its town office’s site; its papers are PDFs.')}</p>`;
  const body = h('div', { html });
  const s = sheet({ title: W('代表會', 'Township council'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [body] });
  // (Its own site's sessions first: their days, papers and recordings; the YouTube channel's after.)
  townVideos(body, t, vids, body.querySelector('[data-townlist]')?.closest('.lw-sec') || body.querySelector('.lw-town-now')?.closest('.lw-list') || body.querySelector('.lw-person-line'));
  body.addEventListener('click', e => {
    const all = e.target.closest('[data-townall]');
    if (all) {
      body.querySelector('[data-townlist]').innerHTML = sessions.map(sessionRow).join('');
      return all.remove();
    }
    const b = e.target.closest('[data-townsess]');
    if (b) return townSession(own, sessions[+b.dataset.townsess], party);
    const p = e.target.closest('[data-townp]');
    if (p?.dataset.townp) openPage(p.dataset.townp);
  });
  return s;
}

// One session: its days (each with its recording), then its papers by kind. Papers read from their PDFs at
// build (lib/town-site.mjs) come in as the app's own: 決議案 a row each, 總質詢 by who asked what, the rest as text.
function townSession(own, s, party = new Map()) {
  if (!s) return;
  const items = s.items || [];
  const term = W(`第${own.term}屆${s.n}`, `Term ${own.term} ${s.n}`);
  let papers = {};
  const read = (f, k) => papers[f.url]?.k === k && !papers[f.url].none && papers[f.url];
  const drawPapers = () =>
    PAPERS.map(([k, en1]) => {
      let head = W(k, en1);
      if (k === '議事日程表') {
        const rows = (s.agenda || []).map(a => paperRow(/延長會/.test(a.n) ? W('延長會議事日程表', 'Agenda (extension)') : W('議事日程表', 'Agenda'), a.url));
        return rows.length ? `<h4>${head}</h4><div class="lw-list in-sheet">${rows.join('')}</div>` : '';
      }
      const mine = items.filter(i => i.k === k && i.files?.length);
      const files = mine.flatMap(i => i.files.map((f, j) => ({ i, f, j })));
      if (!files.length) return '';
      if (k === '決議案') {
        const res = files.flatMap(({ f }) => (read(f, k)?.res || []).map((r, n) => ({ r, url: f.url, n })));
        if (res.length)
          return `<h4>${W(`決議案 ${res.length}`, `Resolutions ${res.length}`)}</h4><div class="lw-list in-sheet wrap">${res.map(({ r, url, n }) => `<button type="button" class="lw-row lw-cbill" data-townres="${esc(url)}|${n}"><span class="lw-row-text"><span class="lw-row-name">${esc(r['案由'])}</span><small>${esc([r['提案人'], r['類別'], r['案號']].filter(Boolean).join(' · '))}</small></span>${outcomeTag(outcomeOf(r['議決'], ''))}</button>`).join('')}</div>`;
      }
      if (k === '總質詢') {
        const days = files.map(({ i, f }) => ({ i, f, p: read(f, k) }));
        if (days.some(x => x.p?.asks?.length || x.p?.wq?.length))
          return days
            .map(({ i, f, p }) =>
              p?.wq?.length
                ? `<h4>${esc(W(`書面質詢 ${p.wq.length}`, `Written questions ${p.wq.length}`))}</h4><div class="lw-list in-sheet wrap">${p.wq.map((q, n) => `<button type="button" class="lw-row" data-townwq="${esc(f.url)}|${n}"><span class="lw-row-text"><span class="lw-row-name">${esc(wqGist(q.ask))}</span><small>${esc([q.w, q.to, q.reply ? W('已答覆', 'Answered') : W('未答覆', 'No reply yet')].filter(Boolean).join(' · '))}</small></span>${CHEVRON}</button>`).join('')}</div>`
                : p?.asks?.length
                ? `<h4>${esc([i.n.replace(/^總質詢\s*/, W('總質詢 ', 'Questions, ')), p.d ? dayLabel(p.d) : ''].filter(Boolean).join(' · '))}</h4><div class="lw-list in-sheet wrap">${p.asks.map((q, n) => `<button type="button" class="lw-row" data-townask="${esc(f.url)}|${n}"><span class="lw-row-text"><span class="lw-row-name">${esc(q.gist || q.w)}</span><small>${esc([q.w, partyShort(party.get(q.w) || '')].filter(Boolean).join(' · '))}</small></span>${CHEVRON}</button>`).join('')}<button type="button" class="lw-row" data-townask="${esc(f.url)}|all"><span class="lw-row-text"><span class="lw-row-name">${W('整天的逐字稿', 'The whole day’s transcript')}</span><small>${esc(W(`${p.turns.length} 段發言`, `${p.turns.length} turns`))}</small></span>${CHEVRON}</button></div>`
                : `<h4>${esc(i.n)}</h4><div class="lw-list in-sheet">${paperRow(i.n, f.url, f.size || '')}</div>`
            )
            .join('');
      }
      // 會議紀錄變表格: each sitting a row (what it did, its result), each proposal a row (lib/minutes.mjs, read
      // at build; the AI only for minutes code couldn't split), then the minutes themselves.
      let lead = '';
      if (k === '會議紀錄') {
        const ps = files.map(({ i, f, j }) => ({ i, f, j, p: read(f, k) }));
        const sits = ps.flatMap(({ i, f, j, p }) => (p?.sits || []).filter(x => x.done?.length).map(x => ({ x, url: f.url, name: i.files.length > 1 ? `${i.n}（${j + 1}）` : i.n }))).sort((a, b) => (a.x.d < b.x.d ? -1 : a.x.d > b.x.d ? 1 : 0));
        const props = ps.flatMap(({ f, p }) => (p?.items || []).map((r, n) => ({ r, url: f.url, n, ai: !!p.ai })));
        if (sits.length > 1 || (sits.length && !props.length))
          lead += `<h4>${W(`每次會議 ${sits.length}`, `Sittings ${sits.length}`)}</h4><div class="lw-list in-sheet wrap">${sits.map(sitRow).join('')}</div>`;
        if (props.length)
          lead += `<h4>${W(`提案 ${props.length}`, `Proposals ${props.length}`)}</h4><div class="lw-list in-sheet wrap">${props.map(({ r, url, n }) => `<button type="button" class="lw-row lw-cbill" data-townprop="${esc(url)}|${n}"><span class="lw-row-text"><span class="lw-row-name">${esc(r.what)}</span><small>${esc([r.by, r.kind, r.no, r.d && shortDay(r.d)].filter(Boolean).join(' · '))}</small></span>${outcomeTag(outcomeOf(r.result, ''))}</button>`).join('')}</div>${props.some(x => x.ai) ? `<p class="lw-hint-sm lw-ai-note"><span class="q-ai-mark" aria-hidden="true">${ICON_SPARK}</span>${W('部分提案由 AI 從議事錄整理，以原始 PDF 為準。', 'Some proposals were sorted from the minutes by AI; the PDF is the record.')}</p>` : ''}`;
        if (lead) head = W('會議紀錄全文', 'The minutes in full');
      }
      const rows = files.map(({ i, f, j }) => {
        const n = i.files.length > 1 ? `${i.n}（${j + 1}）` : i.n === k ? head : i.n;
        const p = read(f, k);
        if (!p?.text) return paperRow(n, f.url, f.size || '');
        const first = p.text.split('\n').find(x => /^時\s*間[：:]/.test(x))?.replace(/^時\s*間[：:]\s*/, '') || '';
        return `<button type="button" class="lw-row" data-towntext="${esc(f.url)}" data-name="${esc(n)}"><span class="lw-row-text"><span class="lw-row-name">${esc(n)}</span><small>${esc(first || W(`${p.text.length.toLocaleString()} 字`, `${p.text.length.toLocaleString()} characters`))}</small></span>${CHEVRON}</button>`;
      });
      return `${lead}<h4>${head}</h4><div class="lw-list in-sheet">${rows.join('')}</div>`;
    }).join('');
  // (A sitting's video on YouTube, 羅東's, or the site's own MP4, 澎湖's: its picture, played in the app.)
  const days = (s.days || []).map((d, i) => `<button type="button" class="lw-row lw-vid" data-townday="${i}">${d.yt || d.pic ? `<img class="lw-vid-img" src="${esc(d.pic || `https://i.ytimg.com/vi/${d.yt}/mqdefault.jpg`)}" alt="" loading="lazy" decoding="async">` : `<span class="lw-vid-img lw-aud">${PLAY}</span>`}<span class="lw-row-text"><span class="lw-row-name">${esc([d.d && dayLabel(d.d), partOf(d)].filter(Boolean).join(' · '))}</span><small>${esc([d.ext && W('延長會', 'Extension'), d.what || (townVideo(d) ? W('會議影音', 'Sitting video') : W('會議錄音', 'Sitting audio'))].filter(Boolean).join(' · '))}</small></span></button>`).join('');
  const seen = s.days?.some(townVideo);
  // (Recordings a site keeps as a Drive folder: the folder, opened in Drive.)
  const folders = (s.folders || []).map(f => `<a class="lw-row lw-vid" href="${esc(f.url)}" target="_blank" rel="noopener" data-out><span class="lw-vid-img lw-aud">${PLAY}</span><span class="lw-row-text"><span class="lw-row-name">${W('這個會期的錄音', 'This session’s audio')}</span><small>${/hinet\.net/.test(f.url) ? W('中華電信 HiNet 影音', 'On HiNet video') : /drive\.google/.test(f.url) ? W('Google 雲端硬碟資料夾', 'A Google Drive folder') : W('代表會的雲端分享', 'The council’s shared folder')}</small></span>${CHEVRON}</a>`).join('');
  const waiting = !items.length && !s.days?.length && !folders;
  const first = drawPapers();
  const box = h('div', { html: first ? section(W('議事錄', 'Papers'), first) : '' });
  const html = `<h2 class="lw-item-name">${esc(term)}</h2><p class="lw-person-line">${esc([spanOf(s.from, s.to), s.ext ? W(`延長會 ${spanOf(s.ext.from, s.ext.to)}`, `extended ${spanOf(s.ext.from, s.ext.to)}`) : ''].filter(Boolean).join(W('，', ', ')))}</p>${days || folders ? section(seen ? W('影音', 'Video') : W('錄音', 'Audio'), `<div class="lw-list in-sheet">${days}${folders}</div>`) : ''}${waiting ? `<p class="lw-none">${W('代表會還沒放上這個會期的議事錄。', 'The council hasn’t posted this session’s papers yet.')}</p>` : ''}`;
  const body = h('div', { html });
  body.append(box);
  sheet({ title: s.n, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [body] });
  // The papers read in: drawn in place once here (the PDFs' rows until then).
  if (s.read && own.tc)
    data(`council/town/${own.tc}/${paperFile(s)}.json`)
      .then(r => {
        papers = r.papers || {};
        const html = drawPapers();
        if (html) box.innerHTML = section(W('議事錄', 'Papers'), html);
      })
      .catch(() => {});
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-townday]');
    const d = b && s.days[+b.dataset.townday];
    if (d?.yt) return openCouncilVideo(d.yt, -1, { id: d.yt, yt: d.yt, n: [s.n, d.what].filter(Boolean).join(' '), d: d.d }, { town: true, n: own.n, video: {} });
    if (b) return townAudio(own, s, d);
    const r = e.target.closest('[data-townres]');
    if (r) {
      const [url, n] = r.dataset.townres.split('|');
      const x = papers[url]?.res?.[+n];
      if (!x) return;
      const body = h('div', { class: 'lw-cbill-body', html: councilBillHtml({ ...x, 會期名稱: `${term}${x.ext ? W('延長會', ' (extension)') : ''}`, 議決日期: x.d, pdf: url, pdfName: '決議案 PDF' }) });
      return sheet({ title: W('決議案', 'Resolution'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [body] });
    }
    const pr = e.target.closest('[data-townprop]');
    if (pr) {
      const [url, n] = pr.dataset.townprop.split('|');
      const p = papers[url];
      const x = p?.items?.[+n];
      if (!x) return;
      const decided = [x.result, x.note].filter(Boolean).join('：') + (x.vote ? W(`（${x.vote}）`, ` (${x.vote})`) : '');
      const body = h('div', { class: 'lw-cbill-body', html: councilBillHtml({ 案由: x.what, 案號: x.no, 類別: x.kind, 提案人: x.by, 連署人: x.co, 會期名稱: term, 議決: decided, 議決日期: x.d, pdf: url, pdfName: W('議事錄 PDF', 'The minutes (PDF)') }) + (p.ai ? `<p class="lw-hint-sm lw-ai-note"><span class="q-ai-mark" aria-hidden="true">${ICON_SPARK}</span>${W('這一案由 AI 從議事錄整理，以原始 PDF 為準。', 'Sorted from the minutes by AI; the PDF is the record.')}</p>` : '') });
      return sheet({ title: W('提案', 'Proposal'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [body] });
    }
    const q = e.target.closest('[data-townask]');
    if (q) {
      const [url, n] = q.dataset.townask.split('|');
      const p = papers[url];
      if (p) townTranscript(own, s, p, n === 'all' ? null : +n, url, party);
      return;
    }
    const wq = e.target.closest('[data-townwq]');
    if (wq) {
      const [url, n] = wq.dataset.townwq.split('|');
      const q = papers[url]?.wq?.[+n];
      if (!q) return;
      const block = (title, text) => (text ? `<div class="lw-block"><h4>${esc(title)}</h4>${paperHtml(text)}</div>` : '');
      const body = h('div', {
        class: 'lw-cbill-body',
        html: `<h2 class="lw-item-name">${esc(wqGist(q.ask))}</h2><p class="lw-clip-meta">${esc([q.w && W(`${q.w}代表`, q.w), q.to && W(`問${q.to}`, `to ${q.to}`), q.d && dayLabel(q.d), q.no && W(`書面第${q.no}號`, `No. ${q.no}`)].filter(Boolean).join(' · '))}</p><div class="lw-wq">${block(W('質詢', 'The question'), q.ask)}${q.reply ? block(W(`公所答覆${q.rd ? ` · ${dayLabel(q.rd)}` : ''}`, `The office’s reply${q.rd ? ` · ${dayLabel(q.rd)}` : ''}`), q.reply) : `<p class="lw-none">${W('公所還沒答覆。', 'No reply from the office yet.')}</p>`}${block(W('說明', 'Why it was asked'), q.why)}</div><a class="q-more q-more-go lw-out" href="${esc(url)}" target="_blank" rel="noopener" data-out><span>${W('原始 PDF', 'The original PDF')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>`
      });
      return sheet({ title: W('書面質詢', 'Written question'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [body] });
    }
    const t = e.target.closest('[data-towntext]');
    if (t) {
      const p = papers[t.dataset.towntext];
      if (!p?.text) return;
      const body = h('div', { class: 'lw-cbill-body', html: `<h2 class="lw-item-name">${esc(`${s.n} ${t.dataset.name}`)}</h2><p class="lw-clip-meta">${esc(`${own.n} · ${term}`)}</p>${paperHtml(p.text)}<a class="q-more q-more-go lw-out" href="${esc(t.dataset.towntext)}" target="_blank" rel="noopener" data-out><span>${W('原始 PDF', 'The original PDF')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` });
      sheet({ title: t.dataset.name, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [body] });
    }
  });
}

// A 書面質詢's line: its ask's first sentence, without 有關 and the polite asks around it.
const wqGist = t => {
  const one = String(t || '').split(/[。\n]/)[0].replace(/^(有關|關於)?(貴所|公所)?(擬)?/, '').replace(/[，,]?(請|惠請)(公所|貴所)?.*$/, '');
  return one.length > 60 ? `${one.slice(0, 58)}…` : one || W('書面質詢', 'Written question');
};

// A paper's text (會議紀錄, 致詞, 施政報告): its labelled lines (時間：…) as rows, its numbered heads as heads.
const paperHtml = text =>
  `<div class="lw-paper-text">${String(text)
    .split('\n')
    .map(p => {
      const f = p.match(/^([㐀-鿿]{1,6})[：:]\s*(.*)$/);
      if (f) return `<p class="lw-pt-f"><b>${esc(f[1])}</b><span>${esc(f[2])}</span></p>`;
      if (p.length < 24 && !/[。，]/.test(p) && /^([壹貳參肆伍陸柒捌玖拾]+、|第.+[次條章]|[一二三四五六七八九十]+、)/.test(p)) return `<h5>${esc(p)}</h5>`;
      return `<p>${esc(p)}</p>`;
    })
    .join('')}</div>`;

// A day of 總質詢 as it was said: one member's questions and the answers to them, or the whole day.
// One member's: a 重點摘要 on a tap (/law-ask 'town'), each point citing the turns it rests on (a tap: that turn).
function townTranscript(own, s, p, n, url, party) {
  const ask = n == null ? null : p.asks?.[n];
  if (n != null && !ask) return;
  const turns = ask ? p.turns.slice(ask.from, ask.to + 1) : p.turns;
  const asks = new Set(['代表', '副主席']);
  const turn = (x, i) => `<div class="lw-turn${asks.has(x.r) ? ' lw-turn-ask' : x.r === '主席' ? ' lw-turn-chair' : ''}" data-k="${i + 1}"${asks.has(x.r) ? ` style="--p:${partyColor(party.get(x.w) || '')}"` : ''}><b>${esc(x.w)}<small>${esc(x.r)}</small></b>${proseHtml(x.t)}</div>`;
  const title = ask ? W(`${ask.w}的質詢`, `${ask.w}’s questions`) : W('總質詢逐字稿', 'Transcript');
  const body = h('div', { class: 'lw-cbill-body', html: `<h2 class="lw-item-name">${esc(ask ? ask.gist || ask.w : `${s.n} ${p.nth || ''}`)}</h2><p class="lw-clip-meta">${esc([own.n, s.n, p.nth, p.d && dayLabel(p.d)].filter(Boolean).join(' · '))}</p><div class="lw-turns">${turns.map(turn).join('')}</div><a class="q-more q-more-go lw-out" href="${esc(url)}" target="_blank" rel="noopener" data-out><span>${W('原始逐字稿 PDF', 'The original PDF')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` });
  if (ask && own.tc)
    body.querySelector('.lw-clip-meta').after(
      aiBox(
        W('重點摘要', 'Sum it up'),
        async () => {
          const r = await askTown({ tc: own.tc, file: paperFile(s), url, n, lang: en ? 'en' : 'zh' }, ai);
          if (r.error) return r;
          const chip = k => {
            const [w, role] = r.quotes[k] || ['', ''];
            return `<button type="button" class="lw-cite lw-turn-cite" data-tk="${esc(k)}"><span>${esc(w || role || k)}</span></button>`;
          };
          const points = r.points.map(pt => `<li>${esc(pt.text)} ${pt.cites.map(chip).join('')}</li>`).join('');
          return { ...r, html: r.covered ? `${r.answer ? `<p class="lw-lead">${esc(r.answer)}</p>` : ''}${points ? `<ul class="lw-points">${points}</ul>` : ''}${r.promised ? `<div class="lw-block blue"><h4><i>${MENU_ICON.gov}</i>${W('公所答應的事', 'What the office promised')}</h4><p>${esc(r.promised)}</p></div>` : ''}` : `<p>${esc(r.answer || W('這段質詢讀不出重點。', 'Nothing clear to sum up.'))}</p>` };
        },
        W('AI 只依這段逐字稿整理', 'AI, from this transcript only')
      )
    );
  // A cited turn: the transcript scrolls to it, marked a moment.
  body.addEventListener('click', e => {
    const c = e.target.closest('[data-tk]');
    const t = c && body.querySelector(`.lw-turn[data-k="${c.dataset.tk}"]`);
    if (!t) return;
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    t.classList.remove('lw-flash');
    void t.offsetWidth;
    t.classList.add('lw-flash');
  });
  sheet({ title, closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', detent: 'large', body: [body] });
}

// A recording's part: 第 2 段, or the name the site gave it.
const partOf = d => (!d.n ? '' : /^\d+$/.test(d.n) ? W(`第 ${d.n} 段`, `part ${d.n}`) : d.n);

// A day's recording a video: on YouTube, or the site's own MP4 (澎湖's).
const townVideo = d => !!(d.yt || /\.mp4$/i.test(d.src || ''));

// A sitting's recording: a Google Drive file (its own player when Drive won't hand it over), or the site's own MP3
// (or MP4, played as a video).
function townAudio(own, s, d) {
  if (!d) return;
  const vid = townVideo(d);
  const body = h('div', { class: 'lw-clip-sheet', html: `${vid ? `<video class="lw-video-file" controls autoplay playsinline preload="metadata" src="${esc(d.src)}"${d.pic ? ` poster="${esc(d.pic)}"` : ''}></video>` : `<audio class="lw-audio" controls autoplay preload="auto" src="${esc(d.src || driveFile(d.drive))}"></audio>`}<h2 class="lw-item-name">${esc(s.n)}${d.ext ? W('延長會', ' (extension)') : ''}</h2><p class="lw-clip-meta">${esc([own.n, d.d && dayLabel(d.d), partOf(d), d.what].filter(Boolean).join(' · '))}</p>${d.drive ? `<a class="q-more q-more-go lw-out" href="${esc(drivePage(d.drive))}" target="_blank" rel="noopener" data-out><span>${W('在 Google 雲端硬碟開啟', 'Open in Google Drive')}</span><span class="q-more-chev" aria-hidden="true">›</span></a>` : ''}` });
  sheet({ title: vid ? W('會議影音', 'Sitting video') : W('會議錄音', 'Sitting audio'), closeLabel: W('關閉', 'Close'), cls: 'lw-item-sheet', body: [body] });
  // The file itself, streamed by the phone (Drive answers ranges, open to any page); started within the tap.
  // A file Drive won't hand over directly (past its scan size, it answers a page) falls back to Drive's own player.
  const a = body.querySelector('audio, video');
  const viaDrive = () => a.isConnected && a.replaceWith(h('div', { class: 'lw-video lw-drive', html: `<iframe src="${esc(drivePlayer(d.drive))}" title="${esc(`${s.n} ${d.d}`)}" allow="autoplay; encrypted-media"></iframe>` }));
  if (d.drive) a.addEventListener('error', viaDrive, { once: true });
  a.play?.()?.catch(() => {});
}

async function start() {
  try {
    const index = await data('index.json');
    state.rows = index.laws;
    state.byCode = new Map(index.laws.map(r => [r[0], r]));
    state.names = nameMap(index.laws);
    // The rules this device follows, bookmarked or read (行政規則, 地方法規): their rows by name, for 我的 and 繼續閱讀.
    for (const [p, r] of Object.entries(state.mine.rules || {})) if (isRule(p) && Array.isArray(r)) state.byCode.set(p, [p, r[0], r[2], r[1], '', 0, 0, 0]);
  } catch {
    state.noIndex = true;
    drawHome();
  }
  const redraw = () => {
    if (state.tab === 'home') drawHome();
    if (state.tab === 'laws' && !state.law) drawResults();
    if (state.tab === 'mine') drawMine();
    if (state.tab === 'ask' && !chat.turns.length) drawChat();
  };
  // 命令 (regulations): their own index, after the laws' (appended, so the
  // laws keep their places for 全文檢索); names, search and links take them in.
  ordersReady = data('orders.json')
    .then(o => {
      state.rows = [...state.rows, ...o.laws];
      for (const r of o.laws) state.byCode.set(r[0], r);
      state.names = nameMap(state.rows);
      if (state.tab === 'laws' && !state.law) state.kind === 'order' ? drawLaws() : drawResults();
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
  ]).then(() => (state.tab === 'laws' && !state.law ? drawResults() : state.tab === 'mine' && drawMine()));
  const latestReady = Promise.all([
    data('rulings/latest.json').then(r => (state.latestRulings = r.rulings || [])).catch(() => {}),
    consData().then(c => (state.consTop = c.items.filter(r => r[0].startsWith('j')).slice(0, 2))).catch(() => {})
  ]).then(() => state.tab === 'home' && drawHome());
  // The followed legislators' news, for the badge.
  if (Object.keys(state.mine.people || {}).length && state.tab !== 'mine') trackedFeeds(state.mine).catch(() => {});
  if (Object.keys(state.mine.cc || {}).length && state.tab !== 'mine') trackedCC(state.mine).catch(() => {});
  // 這一週's lines on 我的 (made each night, shared).
  data('ai/weekly.json')
    .then(w => ((state.weekly = w), state.tab === 'mine' && drawMine()))
    .catch(() => {});
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
