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
export function foldBills(bills, { pcodes = new Map(), modified = new Map() } = {}) {
  const items = new Map();
  const ids = new Map(bills.flatMap(b => b.laws.map((id, i) => [b.names[i], id])));
  for (const b of bills) {
    const named = b.laws.length ? b.laws.map((id, i) => [id, b.names[i] || '']) : [];
    if (!named.length) {
      const name = lawOfTitle(b.t, pcodes);
      named.push([ids.get(name) || `n${name || b.id}`, name || b.t]);
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
    let stage = Math.max(-1, ...live.map(b => billStage(b).stage));
    const ymd = passed.replaceAll('-', '');
    const promulgated = Boolean(passed && it.p && (modified.get(it.p) || '') >= ymd);
    if (promulgated) stage = Math.max(stage, PROMULGATED);
    const open = live.filter(b => !passedOn(b)).length;
    const u = it.bills.map(b => b.u).sort().pop() || '';
    return {
      k: it.k,
      law: it.law,
      n: it.n,
      p: it.p,
      term: it.term,
      stage,
      held: live.length > 0 && live.every(b => billStage(b).held),
      dropped: live.length === 0,
      passed,
      pub: promulgated ? modified.get(it.p) : '',
      open,
      count: it.bills.length,
      gov: it.bills.some(b => b.src === '政府'),
      u,
      ids: it.bills.map(b => b.id)
    };
  });
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
