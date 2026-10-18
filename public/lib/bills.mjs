import { cnNumber } from './refs.mjs';

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
    rel: (b['關連議案'] || []).map(r => r['議案編號']).filter(Boolean)
  };
}

// A bill's place now: its furthest stage, unless its last word holds or drops it.
export function billStage(bill) {
  const now = stageOf(bill.st);
  const reached = Math.max(0, ...bill.flow.map(f => f[1]));
  if (now.dropped) return { stage: reached, dropped: true };
  return { stage: Math.max(reached, now.stage), held: Boolean(now.held) && now.stage >= reached };
}

const passedOn = bill => bill.flow.filter(f => f[1] === PASSED).map(f => f[0]).sort().pop() || '';

// A short, file-safe id for a law 立法院 hasn't numbered (FNV-1a, hex).
export function hash(s) {
  let x = 0x811c9dc5;
  for (const ch of String(s)) x = Math.imul(x ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return x.toString(16).padStart(8, '0');
}

// The law a bill's title names (「民法部分條文修正草案」 → 民法): the longest
// known name it starts with, else the shortest 法/條例/通則 it starts with.
export function lawOfTitle(title, known = new Map()) {
  const t = String(title || '').replace(/^[「『]/, '');
  let best = '';
  for (let k = Math.min(40, t.length); k >= 2 && !best; k--) if (known.has(t.slice(0, k))) best = t.slice(0, k);
  return best || (t.match(/^(.+?(?:法|條例|通則))(?:部分|第|增訂|修正|草案|施行)/) || [])[1] || '';
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

export function foldBills(bills, { pcodes = new Map(), modified = new Map(), parties = new Map() } = {}) {
  const items = new Map();
  const ids = new Map(bills.flatMap(b => b.laws.map((id, i) => [b.names[i], id])));
  for (const b of bills) {
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
    const promulgated = Boolean(passed && it.p && (modified.get(it.p) || '') >= ymd);
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
      open: open.length,
      arts: articlesTouched(open),
      count: it.bills.length,
      gov: it.bills.some(b => b.src === '政府'),
      u,
      // The proposers of the round (or every version), most versions first: [[who, n]] ≤ 3.
      by: [...(open.length ? open : it.bills).reduce((m, b) => (s => (s ? m.set(s, (m.get(s) || 0) + 1) : m))(sponsorOf(b.by, parties)), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 3),
      // The newest version (its 對照表 summarised on the card).
      top: [...(open.length ? open : it.bills)].sort((a, b) => (a.d < b.d ? 1 : -1))[0]?.id || '',
      ids: it.bills.map(b => b.id)
    };
  });
}

// The articles a bill's title names (「甲法第二條、第九條及第二十五條之一條文修正草案」
// → 2, 9, 25-1); a 部分條文 title names none.
export function articlesOfTitle(title) {
  const out = [];
  for (const m of String(title).matchAll(/第([零〇一二三四五六七八九十百千]+)條(?:之([一二三四五六七八九十]+))?/g)) {
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

// The versions still in play: live, not passed, and moving after the last 三讀.
export function openRound(bills, passed = bills.map(passedOn).sort().pop() || '') {
  return bills.filter(b => !billStage(b).dropped && !passedOn(b) && (!passed || b.u > passed));
}

// "What changed since you last looked": the items whose 最新進度日期 is
// past the day this device last saw them (a followed item never seen counts).
export function changedSince(items, seen = {}) {
  return items.filter(it => it.u && it.u > (seen[it.k] || ''));
}

// Bills worth refetching: everything whose 最新進度日期 is on or after the
// last build day less a margin (the API's dates are meeting days, set ahead).
export function mergeBills(prev, fresh) {
  const byId = new Map((prev || []).map(b => [b.id, b]));
  for (const b of fresh) byId.set(b.id, b);
  return [...byId.values()];
}

// Every bill of the term (each version on its own), by the step its own
// status reached: { total, steps: [提案, 一讀, 委員會, 二讀, 三讀, 公布], dropped }.
// (立法 tab's funnel: the items fold versions together; these don't.)
const STEP_OF = [0, 1, 2, 2, 2, 3, 4, 5];
export function billCounts(bills) {
  const steps = [0, 0, 0, 0, 0, 0];
  let dropped = 0;
  for (const b of bills) {
    const { stage, dropped: gone } = stageOf(b.st);
    if (gone) dropped++;
    else steps[STEP_OF[Math.max(0, Math.min(7, stage))]]++;
  }
  return { total: bills.length, steps, dropped };
}
