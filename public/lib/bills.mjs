import { cnNumber, abbr } from './refs.mjs';
import { partyOf } from './topics.mjs';

// 立法院's bills made one timeline: the dozens of raw statuses (排入院會
// (交司法及法制委員會), 逕付二讀(交付協商), 審查完畢(三讀)…) folded into one
// stage scale, and every version of a bill on one law in one term (行政院版,
// 委員版, 黨團版) folded into one tracked item. One place for the build and
// the app.

export const STAGES = ['提案', '一讀', '委員會審查', '審查完畢', '黨團協商', '二讀', '三讀', '總統公布'];
export const STAGES_EN = ['Proposed', 'First reading', 'In committee', 'Committee done', 'Caucus talks', 'Second reading', 'Passed', 'Promulgated'];
export const PASSED = 6;
export const PROMULGATED = 7;

// A raw status → { stage, held, dropped, committee }.
export function stageOf(status) {
  const s = String(status || '').replace(/\s+/g, '');
  const committee = (s.match(/交(.+?委員會)/) || [])[1] || '';
  if (/撤案|撤回/.test(s)) return { stage: -1, dropped: true };
  if (/不予審議|原決議不予維持/.test(s)) return { stage: -1, dropped: true };
  if (/三讀/.test(s)) return { stage: PASSED };
  if (/二讀/.test(s) && !/逕付二讀/.test(s)) return { stage: 5 };
  if (/協商/.test(s)) return { stage: 4 };
  if (/討論事項/.test(s)) return { stage: 4 };
  if (/審查完畢|逕付二讀/.test(s)) return { stage: 3 };
  if (/委員會/.test(s) && !/程序委員會/.test(s) && !/^排入院會/.test(s)) return { stage: 2 };
  if (/退回程序委員會|程序緩列/.test(s)) return { stage: 1, held: true };
  // Filed and waiting for the floor's first reading (排入院會 / 排入程序): 提案.
  if (/^排入院會$|^排入程序/.test(s)) return { stage: 0 };
  if (/排入院會|交付審查|改交|重付審查|交付查照/.test(s)) return { stage: 1, committee };
  return { stage: 0 };
}

// A bill from the API, kept small: { id, t: 名稱, by: 提案單位/委員, src: 政府|委員|…,
// d: 提案日期, u: 最新進度日期, st: 議案狀態, laws: [立法院 law id], names: [law name],
// flow: [[date, stage, raw status]], rel: [related bill ids] }.
export function compactBill(b) {
  const flow = (b['議案流程'] || []).map(f => {
    const date = [].concat(f['日期'] || [])[0] || '';
    return [date, stageOf(f['狀態']).stage, f['狀態'] || ''];
  });
  return {
    id: b['議案編號'],
    t: String(b['議案名稱'] || '').replace(/^「(.+)」，請審議案。$/, '$1').replace(/，請審議案。$/, ''),
    by: b['提案單位/提案委員'] || '',
    src: String(b['提案來源'] || '').replace(/提案$/, ''),
    term: b['屆'] || 0,
    d: b['提案日期'] || '',
    u: b['最新進度日期'] || '',
    st: b['議案狀態'] || '',
    laws: b['法律編號'] || [],
    names: b['法律編號:str'] || [],
    flow,
    rel: (b['關連議案'] || []).map(r => r['議案編號']).filter(Boolean),
    a: aboutOf(b['案由'])
  };
}

// A bill's place now: its furthest stage, unless its last word holds or drops it.
export function billStage(bill) {
  const now = stageOf(bill.st);
  const reached = Math.max(0, ...bill.flow.map(f => f[1]));
  if (now.dropped) return { stage: reached, dropped: true };
  return { stage: Math.max(reached, now.stage), held: Boolean(now.held) && now.stage >= reached };
}

// (A 三讀 the flow leaves out, its status saying so: the day of its last move.)
const passedOn = bill => bill.flow.filter(f => f[1] === PASSED).map(f => f[0]).sort().pop() || (stageOf(bill.st).stage === PASSED ? bill.u || '' : '');

// A short, file-safe id for a law 立法院 hasn't numbered (FNV-1a, hex).
export function hash(s) {
  let x = 0x811c9dc5;
  for (const ch of String(s)) x = Math.imul(x ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return x.toString(16).padStart(8, '0');
}

// The law a bill's title names (「民法部分條文修正草案」 → 民法): the longest
// known name it starts with, else the shortest 法/條例/通則 it starts with.
export function lawOfTitle(title, known = new Map()) {
  // A committee's report (報告併案審查委員…擬具「民法部分條文修正草案」…) names its law inside its first quote.
  const inner = /^報告/.test(String(title || '')) && (String(title).match(/「([^」]+?(?:法|條例|通則)[^」]*?草案)」/) || [])[1];
  const t = String(inner || title || '').replace(/^[「『]/, '');
  let best = '';
  for (let k = Math.min(40, t.length); k >= 2 && !best; k--) if (known.has(t.slice(0, k))) best = t.slice(0, k);
  return best || (t.match(/^(.+?(?:法|條例|通則))(?:部分|第|增訂|修正|草案|施行)/) || [])[1] || '';
}

// Is it a bill at all? The API files every committee report as 法律案, the
// ones on a foundation's budget (報告審查客家委員會函送…預算書案) and on a
// ministry's rules (報告審查教育部函為修正「…辦法」案) too: those change no law.
export function isLawBill(b) {
  const t = String(b?.t || '');
  // (A motion to reconsider (復議) a decision on a bill is no version of it: it was counted as one, 11-24.)
  if (/提出復議/.test(t)) return false;
  if (!/^報告/.test(t) || (b.laws || []).length) return true;
  return /「[^」]*?(?:法|條例|通則)[^」]*?草案」/.test(t);
}

// A 三讀 heard in the news before 立法院's own record has it (Jay 11-24: the
// 全民共享經濟成果及穩定民生特別條例 passed on 11-20, and four days on its
// record still said 排入院會, so Orbit Law said 政黨協商中: 立法院 writes a 三讀
// into a bill's record once the 議事錄 is read, a week or more later). Google
// News asked for the law's whole name with 三讀 (it matches the name in the
// story); a headline counts when it names the law and says passed (三讀通過, 三讀過關, 立院三讀)
// and nothing still to come (拚, 可望, 恐, 能否…); three outlets at least, on or
// after the bill reached the floor (`since`). → { d (Taiwan day, the first
// report), src (its link) } or null.
const PASS_SAID = /三讀(?:通過|過關|定案|(?=\s|$|！|，))|(?:立院|立法院|院會)三讀/;
const NOT_YET = /拚|可望|望|恐|難|能否|是否|闖關|三讀前|將|擬|預計|待|未|沒|擋|卡關|延|緩|破局|會不會|嗎/;
export function heardPassed(xml, since = '', name = '') {
  const seen = new Map();
  // (The headline names the law: its name, its 簡稱, or 特別條例 for one; 預算法 was
  // "heard" from stories on the 普發 特別條例 that named it in their text, 11-24.)
  const key = lawKey(name);
  const names = [key, lawKey(abbr(name)), /特別條例$/.test(key) ? '特別條例' : ''].filter(Boolean);
  const names2 = names.map(n => n.replace(/臺/g, '台'));
  for (const item of String(xml || '').split('<item>').slice(1)) {
    const title = ((item.match(/<title>(?:<!\[CDATA\[)?([^<\]]*)/) || [])[1] || '').replace(/\s+-\s+[^-]+$/, '');
    const who = ((item.match(/<source[^>]*>([^<]*)/) || [])[1] || '').trim();
    const at = new Date((item.match(/<pubDate>([^<]+)/) || [])[1] || '');
    const link = ((item.match(/<link>(?:<!\[CDATA\[)?([^<\]]+)/) || [])[1] || '').trim();
    if (!who || isNaN(at) || !PASS_SAID.test(title) || NOT_YET.test(title)) continue;
    if (name && ![...names, ...names2].some(n => title.includes(n))) continue;
    const d = new Date(at.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
    if (since && d < since) continue;
    if (!seen.has(who) || seen.get(who).d > d) seen.set(who, { d, src: link });
  }
  if (seen.size < 3) return null;
  return [...seen.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))[0];
}
// 立法院's own list of the laws it sent the president to promulgate (ppg's
// 最近通過/三讀, /ppg/api/v1/latest-pass-third-reading: 「修正X部分條文，咨請公布。」,
// 「制定X，咨請公布。」 and the day sent). Official, and days ahead of a bill's own
// record. → [{ n, sent, src }] (budgets left out).
export function sentIn(items = []) {
  const out = [];
  for (const x of items) {
    const t = String(x?.title || '');
    const m = t.match(/^(?:修正|制定|增訂|廢止)(.+?(?:法|條例|通則))(?:部分條文|第.+?條|條文|全文|，)/);
    const day = String(x?.content3 || x?.content || '').match(/(\d{2,3})年(\d{1,2})月(\d{1,2})日/);
    if (!m || !day || !/咨請公布/.test(t)) continue;
    const sent = `${Number(day[1]) + 1911}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}`;
    out.push({ n: m[1].replace(/^中華民國(?!\d)/, ''), sent, src: `https://ppg.ly.gov.tw/ppg/bills/latest-pass-third-readings/${x.id}/process` });
  }
  return out;
}
// The bills as they'd read with those 三讀 (`heard`: law key → { d, src }): each
// version of the law on the floor then (審查完畢, 逕付二讀, 協商, 二讀) and not
// passed gets the 三讀 that day, its status 三讀 till 立法院's record says it.
// A copy: what's saved of 立法院's own data stays as it gave it.
export function withHeard(bills, heard = new Map()) {
  if (!heard.size) return bills;
  const by = new Map([...heard].map(([n, x]) => [lawKey(n), x]));
  return bills.map(b => {
    const h = (b.names || []).map(n => by.get(lawKey(n))).find(Boolean);
    if (!h || passedOn(b) || billStage(b).dropped || billStage(b).stage < 3) return b;
    // (Sent to the president (咨請公布, `sent`): passed at the last sitting it was on before that day.)
    const d = h.d || b.flow.map(f => f[0]).filter(x => x <= h.sent).sort().pop() || '';
    if (!d || (h.sent && d < daysBefore(h.sent, 21)) || b.flow.some(f => f[0] > d)) return b;
    return { ...b, st: '三讀', u: d, flow: [...b.flow, [d, PASSED, '三讀']], heard: h.src };
  });
}
// The floor's bills not yet passed that moved since `recent`, by law (for the
// news to be asked about): law name → the day from which a 三讀 in the news
// counts: its first version on the floor, after any 三讀 of the law already
// recorded (that one's news is old news), and never before `recent`.
export function onFloor(bills, recent = '') {
  const out = new Map();
  const passedBy = new Map();
  for (const b of bills) for (const n of b.names || []) if (passedOn(b) > (passedBy.get(n) || '')) passedBy.set(n, passedOn(b));
  for (const b of bills) {
    if (!isLawBill(b) || passedOn(b) || billStage(b).dropped || billStage(b).stage < 3) continue;
    if (!b.flow.some(f => f[0] >= recent)) continue;
    const at = b.flow.filter(f => f[1] >= 3).map(f => f[0]).sort()[0] || b.u;
    for (const n of b.names || []) {
      if (!n) continue;
      const from = [at, recent, passedBy.has(n) ? nextDay(passedBy.get(n)) : ''].sort().pop();
      if (!(out.get(n) <= from)) out.set(n, from);
    }
  }
  return out;
}
const daysBefore = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
// The sent list (sentIn) less the laws whose 三讀 立法院's record has already, in the 30 days before
// each was sent (that one was it): law name → { sent, src }, the newest a law.
export function sentNews(sent, bills) {
  const passed = new Map();
  for (const b of bills) for (const n of b.names || []) if (passedOn(b)) passed.set(lawKey(n), [...(passed.get(lawKey(n)) || []), passedOn(b)]);
  const out = new Map();
  for (const x of sent) {
    const k = lawKey(x.n);
    if ((passed.get(k) || []).some(d => d <= x.sent && d >= daysBefore(x.sent, 30))) continue;
    if (!(out.get(k)?.sent > x.sent)) out.set(k, { sent: x.sent, src: x.src });
  }
  return out;
}
const nextDay = d => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

// 行政院 refusing to countersign (不副署) a law 立法院 passed: the president
// then never promulgates it, and it stays passed but not law. The refusals
// (`data-src/unsigned.json`, and 行政院's own news read at deploy): a law's
// name in 《》 or 「」 next to 不副署 / 不予副署 (never 副署長).
const lawKey = s => String(s || '').replace(/台/g, '臺').replace(/^中華民國(?!\d)/, '').replace(/\s+/g, '');
export function unsignedIn(text) {
  const out = new Set();
  const s = String(text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  for (const m of s.matchAll(/[^。！？；]*不(?:予|與)?副署(?!長)[^。！？；]*/g)) for (const n of m[0].matchAll(/[《「]([^》」]{2,40}?(?:法|條例|通則))(?:第[^》」]*)?(?:修正案|部分條文)?[》」]/g)) out.add(lawKey(n[1]));
  return [...out];
}
// The refusals as one map: law key → { d, src } (the newest refusal of each).
export function unsignedMap(list = []) {
  const m = new Map();
  for (const x of list) if (x?.n && x.d && !(m.get(lawKey(x.n))?.d > x.d)) m.set(lawKey(x.n), { d: x.d, src: x.src || '' });
  return m;
}

// One tracked item per law per term (all its versions), the furthest stage
// any live version reached; `pcodes` (law name → MOJ pcode) links it to
// the reader, and `modified` (pcode → 異動日期 YYYYMMDD) turns a 三讀 into
// 總統公布 once the MOJ copy is newer than the vote.
// Who proposed a bill, as a chip: 行政院 (and other 院), a 黨團 by its party,
// or a legislator's party (`parties`: name → 黨籍, from the 立法院 API).
export function sponsorOf(by, parties = new Map()) {
  const s = String(by || '');
  const yuan = s.match(/^(行政院|司法院|考試院|監察院)/);
  if (yuan) return yuan[1];
  const caucus = s.match(/本院(.+?)黨團/);
  if (caucus) return caucus[1];
  const who = s.match(/本院委員(.+?)(?:等\d+人|$)/);
  return (who && parties.get(who[1].trim())) || '';
}

// The round the last 三讀 (on `passed`) took in: the versions passed that day
// and the ones tied to them that it took in. One list for the card and its sheet.
export function passedRoundOf(bills, passed = bills.map(passedOn).sort().pop() || '') {
  if (!passed) return [];
  const on = new Set(bills.filter(b => passedOn(b) === passed).map(b => b.id));
  return passedRound(bills).filter(b => on.has(b.id) || (b.rel || []).some(id => on.has(id)) || bills.some(o => on.has(o.id) && (o.rel || []).includes(b.id)));
}

// That round as the card shows it: how many versions, the newest one's
// purpose, who filed them, the articles it changed, its newest version.
function passedSummary(bills, passed, parties) {
  const round = passedRoundOf(bills, passed);
  const newest = [...round].sort((a, b) => (a.d < b.d ? 1 : -1));
  const by = [...round.reduce((m, b) => (s => (s ? m.set(s, (m.get(s) || 0) + 1) : m))(partyOf(sponsorOf(b.by, parties)).zh), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { n: round.length, about: newest.find(b => b.a && !/審查報告$/.test(b.a))?.a || '', by, arts: articlesTouched(round), top: newest[0]?.id || '' };
}

export function foldBills(bills, { pcodes = new Map(), modified = new Map(), parties = new Map(), unsigned = new Map() } = {}) {
  const items = new Map();
  const ids = new Map(bills.flatMap(b => b.laws.map((id, i) => [b.names[i], id])));
  for (const b of bills) {
    if (!isLawBill(b)) continue;
    const named = b.laws.length ? b.laws.map((id, i) => [id, b.names[i] || '']) : [];
    if (!named.length) {
      const name = lawOfTitle(b.t, pcodes);
      named.push([ids.get(name) || (name ? `n${hash(name)}` : `b${b.id}`), name || b.t]);
    }
    for (const [law, name] of named) {
      const k = `${b.term}:${law}`;
      if (!items.has(k)) items.set(k, { k, law, n: name, p: pcodes.get(name) || '', term: b.term, bills: [] });
      items.get(k).bills.push(b);
    }
  }
  return [...items.values()].map(it => {
    const live = it.bills.filter(b => !billStage(b).dropped);
    const passed = it.bills.map(passedOn).sort().pop() || '';
    // This term's open round: live versions not passed and still moving after
    // the last 三讀 (the ones that went quiet before it were folded into it or left behind).
    const open = openRound(it.bills, passed);
    const ymd = passed.replaceAll('-', '');
    // 行政院 refused to countersign it after this 三讀: an MOJ change before that day is
    // something else (財政收支劃分法: passed 11/21, its record touched 12/3, refused 12/15).
    const refused = passed ? unsigned.get(lawKey(it.n)) : null;
    const held = refused && refused.d >= passed ? refused : null;
    const changed = (it.p && modified.get(it.p)) || '';
    const promulgated = Boolean(passed && it.p && changed >= ymd && !(held && changed < held.d.replaceAll('-', '')));
    const ns = held && !promulgated ? held : null;
    let stage = open.length ? Math.max(...open.map(b => billStage(b).stage)) : passed ? (promulgated ? PROMULGATED : PASSED) : Math.max(-1, ...live.map(b => billStage(b).stage));
    const u = it.bills.map(b => b.u).sort().pop() || '';
    return {
      k: it.k,
      law: it.law,
      n: it.n,
      p: it.p,
      term: it.term,
      stage,
      held: open.length > 0 && open.every(b => billStage(b).held),
      dropped: live.length === 0,
      passed,
      pub: promulgated ? modified.get(it.p) : '',
      ...(ns ? { ns } : {}),
      open: open.length,
      arts: articlesTouched(open),
      count: it.bills.length,
      gov: it.bills.some(b => b.src === '政府'),
      u,
      // The proposers of the round (or every version), most versions first: [[who, n]] ≤ 3,
      // each party once whatever its spelling (中國國民黨 and 國民黨 are one).
      by: [...(open.length ? open : it.bills).reduce((m, b) => (s => (s ? m.set(s, (m.get(s) || 0) + 1) : m))(partyOf(sponsorOf(b.by, parties)).zh), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 3),
      // What it's for, in a line: the newest version's own words that say so.
      about: [...(open.length ? open : it.bills)].sort((a, b) => (a.d < b.d ? 1 : -1)).find(b => b.a)?.a || '',
      // The newest version (its 對照表 summarised on the card).
      top: [...(open.length ? open : it.bills)].sort((a, b) => (a.d < b.d ? 1 : -1))[0]?.id || '',
      // The last 三讀's own round (for 這週三讀通過): its versions, its purpose, who filed them.
      ...(passed ? { pr: passedSummary(it.bills, passed, parties) } : {}),
      ids: it.bills.map(b => b.id)
    };
  });
}

// The articles a bill's title names (「甲法第二條、第九條及第二十五條之一條文修正草案」
// → 2, 9, 25-1); a 部分條文 title names none.
export function articlesOfTitle(title) {
  const out = [];
  for (const m of String(title).matchAll(/第\s*([零〇一二三四五六七八九十百千\d]+)\s*條(?:之([一二三四五六七八九十\d]+))?/g)) {
    const n = cnNumber(m[1]);
    const k = m[2] ? `${n}-${cnNumber(m[2])}` : String(n);
    if (n > 0 && !out.includes(k)) out.push(k);
  }
  return out;
}
// How many open versions name each article: { '22': 3, '25-1': 1 }.
export function articlesTouched(bills) {
  const out = {};
  for (const b of bills) for (const k of articlesOfTitle(b.t)) out[k] = (out[k] || 0) + 1;
  return out;
}

// The versions a 三讀 took in: the passed ones, and every version tied to one
// (its 關連議案, either way) filed before that vote. 立法院 leaves those at
// 審查完畢 or 排入院會(討論事項), dated by a later sitting (刑法 185-3's
// 逕付二讀 versions sat at 2026-11-03 after their 10-30 三讀).
export function passedRound(bills) {
  const on = new Map(bills.map(b => [b.id, passedOn(b)]));
  const tiedTo = b => [...(b.rel || []).map(id => on.get(id) || ''), ...bills.filter(o => on.get(o.id) && (o.rel || []).includes(b.id)).map(o => on.get(o.id))].filter(d => d && d >= b.d).sort().pop() || '';
  return bills.filter(b => on.get(b.id) || tiedTo(b));
}

// The versions still in play: live, not passed, not taken in by a 三讀, and
// moving after the last 三讀.
export function openRound(bills, passed = bills.map(passedOn).sort().pop() || '') {
  const taken = new Set(passedRound(bills).map(b => b.id));
  return bills.filter(b => !billStage(b).dropped && !taken.has(b.id) && (!passed || b.u > passed));
}

// Bills worth refetching: everything whose 最新進度日期 is on or after the
// last build day less a margin (the API's dates are meeting days, set ahead).
export function mergeBills(prev, fresh) {
  const byId = new Map((prev || []).map(b => [b.id, b]));
  for (const b of fresh) byId.set(b.id, b);
  return [...byId.values()];
}

// Every bill of the term (each version on its own): how many got at least
// to 提案 (all), 一讀, 審查完畢 (or 逕付二讀) and 三讀 (`reached`), and how many
// still wait for the next step after the first three (`waiting`). A reviewed
// version whose law passed on or after its own last move went into that 三讀
// (立法院 leaves its status at 審查完畢): it no longer waits.
export function billCounts(all) {
  const bills = all.filter(isLawBill);
  const passedBy = new Map();
  for (const b of bills) for (const law of b.laws) passedBy.set(law, [passedBy.get(law) || '', passedOn(b)].sort().pop());
  const reached = [0, 0, 0, 0];
  const waiting = [0, 0, 0];
  let dropped = 0;
  for (const b of bills) {
    const { stage, dropped: gone } = billStage(b);
    reached[0]++;
    if (stage >= 1) reached[1]++;
    if (stage >= 3) reached[2]++;
    if (stage >= PASSED) reached[3]++;
    if (gone) dropped++;
    if (gone || stage >= PASSED || (stage >= 3 && b.laws.some(law => passedBy.get(law) && passedBy.get(law) >= b.u))) continue;
    waiting[stage < 1 ? 0 : stage < 3 ? 1 : 2]++;
  }
  return { total: bills.length, reached, waiting, dropped };
}

// A version's 案由 as its reason in plain words: who filed it, the 爰擬具
// 「…草案」 and the 是否有當？敬請公決 taken off, what's left kept as written.
export function whyOf(text) {
  let s = String(text || '').replace(/\s+/g, '');
  s = s.replace(/^(本院|行政院|司法院|考試院|監察院)[^，,]*?(黨團|等\d+人|委員[^，,]*)?[，,]/, '');
  s = s.replace(/[，,]?爰(擬具|提出|擬)[^」]*」(條文)?(修正)?(草案)?[，,]?/, '，');
  s = s.replace(/[，,。]?(是否有當|請審議|敬請公決|請公決)[^]*$/, '');
  s = s.replace(/^(有鑑於|鑑於|為)/, m => (m === '為' ? '為了' : '因為')).replace(/[，,]+$/, '').replace(/[，,]{2,}/g, '，');
  return s ? `${s}。` : '';
}

// A version's purpose in a line, for a card: its 案由's 為… clause (what the
// sponsor wants), else its first words; nothing for a procedural motion.
export function aboutOf(text, max = 48) {
  const s = whyOf(text).replace(/。$/, '').replace(/[；;]\s*[，,]/g, '，').replace(/。，/g, '，');
  if (!s || /復議|^(行政院|司法院|考試院|監察院)函/.test(s)) return '';
  const parts = s.split(/(?<=[，；。])/);
  let i = -1;
  parts.forEach((p, k) => {
    if (k && /^(為了?|以利|俾)(?!何)/.test(p)) i = k;
  });
  let out = i > 0 ? `為了${parts.slice(i).join('').replace(/^(為了?|以利|俾)/, '')}` : s.replace(/^(因為|經?查|按)/, '');
  out = out.replace(/^為了(利|使|期)/, '為了').replace(/[，；。]$/, '');
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
