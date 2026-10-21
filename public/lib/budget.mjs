// The money in a 中央政府總預算: 主計總處's 預算表 (open data on data.gov.tw,
// files on ws.dgbas.gov.tw), one book a year for the 預算案 (as 行政院 sent it,
// "b") and one for the 法定預算 (as 立法院 passed it, "c"). What 立法院 cut is
// the difference. One place for the build (scripts/build-budget.mjs) and the app.
// Amounts are in 千元 (NT$1,000), as the books give them.

// An XML table's rows, each a { tag: text } (the books came in three
// layouts over the years: <報表資料列>, <BAME…_row> and <Row>).
export function xmlRows(text) {
  const rows = [];
  for (const [, , body] of String(text).matchAll(/<(報表資料列|BAME\w*_row|Row)>([\s\S]*?)<\/\1>/g)) {
    const r = {};
    for (const [, k, v] of body.matchAll(/<([^\s/>]+)>(?:<!\[CDATA\[)?([^<]*?)(?:\]\]>)?<\/\1>/g)) r[k] = v.trim();
    rows.push(r);
  }
  return rows;
}

const num = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
const clean = s => String(s || '').replace(/\s+/g, '');

// 歲出機關別預算表 → its rows as { code, name, amt, prev } (千元). The newer
// layout writes the 10-digit code in front of the name; the older one has
// budgetno_conver and amounts in 元.
export function spendRows(rows) {
  return rows
    .map(r => {
      if ('tyear_amt' in r) return { code: r.budgetno_conver || '', name: clean(r.displayname || r.mh_budgetname), amt: Math.round(num(r.tyear_amt) / 1000), prev: Math.round(num(r.lyear_amt) / 1000) };
      const m = String(r['名稱及編號'] || r['科目名稱'] || '').match(/^(\d{10})?\s*(.*)$/);
      return { code: m[1] || '', name: clean(m[2]), amt: num(r['本年度預算數']), prev: num(r['上年度預算數']) };
    })
    .filter(r => /^\d{10}$/.test(r.code));
}

// The code's place: 00MM000000 a 主管 (ministry), 00MMAA0000 an agency,
// FFMMAADD00 (DD not 00) a 工作計畫 (目) of agency MMAA. The rest (科目, 節) left out.
export function codeKind(code) {
  if (code.startsWith('00')) return code.slice(4) === '000000' ? 'min' : code.slice(6) === '0000' ? 'agency' : '';
  return code.slice(6, 8) !== '00' && code.slice(8) === '00' ? 'plan' : '';
}

// A 總表's top lines (歲出政事別: 一般政務, 國防, 教育科學文化…; 歲入來源別:
// 稅課收入…): the "(1.名稱)" rows → { total, parts: [[name, amt]] }.
export function summaryRows(rows) {
  let total = 0;
  const parts = [];
  for (const r of rows) {
    const name = clean(r['名稱'] || r['科目名稱']);
    const amt = num(r['合計_金額'] ?? r['合計']);
    if (/^合計$/.test(name)) total = amt;
    const m = name.match(/^\((\d+)\.(.+)\)$/);
    if (m) parts.push([m[2], amt]);
  }
  return { total: total || parts.reduce((s, p) => s + p[1], 0), parts };
}

// One book made small: { total, prev, rev, fn: [[name, amt]], min: [[code,
// name, amt, prev, agencies: [[code, name, amt, prev, plans: [[code, name, amt, prev]]]]]] }.
export function bookOf({ spend, fn, rev }) {
  const rows = spendRows(spend);
  const mins = new Map(), agencies = new Map();
  for (const r of rows) {
    const kind = codeKind(r.code);
    if (kind === 'min') mins.set(r.code.slice(2, 4), [r.code, r.name, r.amt, r.prev, []]);
  }
  for (const r of rows) {
    if (codeKind(r.code) !== 'agency') continue;
    const a = [r.code, r.name, r.amt, r.prev, []];
    agencies.set(r.code.slice(2, 6), a);
    mins.get(r.code.slice(2, 4))?.[4].push(a);
  }
  for (const r of rows) if (codeKind(r.code) === 'plan' && (r.amt || r.prev)) agencies.get(r.code.slice(2, 6))?.[4].push([r.code, r.name, r.amt, r.prev]);
  const min = [...mins.values()].filter(m => m[2] || m[3]);
  const f = summaryRows(fn || []), v = summaryRows(rev || []);
  return {
    total: f.total || min.reduce((s, m) => s + m[2], 0),
    prev: min.reduce((s, m) => s + m[3], 0),
    rev: v.total,
    fn: f.parts,
    min
  };
}

// A year's books as the app reads them: the 法定預算's amounts when there is
// one (the 預算案's otherwise), and with both, each line's cut (案 − 法定;
// negative: added). → { y, passed, total, asked, prev, rev, cut, fn: [[name, amt, cut]],
// min: [[name, amt, prev, cut, agencies: [[name, amt, prev, cut, plans: [[name, amt, prev, cut]]]]]] }
export function yearOf(y, b, c) {
  const main = c || b;
  const asked = new Map();
  if (b && c) for (const m of b.min) for (const x of [m, ...m[4], ...m[4].flatMap(a => a[4])]) asked.set(x[0], x[2]);
  const cut = x => (b && c && asked.has(x[0]) ? asked.get(x[0]) - x[2] : null);
  const fnAsked = new Map((b && c ? b.fn : []).map(([n, a]) => [n, a]));
  return {
    y,
    passed: Boolean(c),
    total: main.total,
    asked: b ? b.total : null,
    prev: main.prev,
    rev: main.rev,
    cut: b && c ? b.total - c.total : null,
    fn: main.fn.map(([n, a]) => [n, a, fnAsked.has(n) ? fnAsked.get(n) - a : null]),
    min: main.min.map(m => [m[1], m[2], m[3], cut(m), m[4].map(a => [a[1], a[2], a[3], cut(a), a[4].map(p => [p[1], p[2], p[3], cut(p)])])])
  };
}

// The card's few numbers: total, last year's, revenue, the cut, the
// functions, the five biggest ministries and the five biggest cuts.
export function moneyOf(year) {
  const byAmt = [...year.min].sort((a, b) => b[1] - a[1]);
  const cuts = year.min.flatMap(m => (m[4].length > 1 ? m[4] : [m]).map(a => [a === m ? m[0] : a[0], a[3]])).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  return {
    y: year.y,
    passed: year.passed,
    total: year.total,
    asked: year.asked,
    prev: year.prev,
    rev: year.rev,
    cut: year.cut,
    fn: year.fn.map(f => [f[0], f[1]]),
    top: byAmt.slice(0, 5).map(m => [m[0], m[1], m[2]]),
    cuts: cuts.slice(0, 5)
  };
}

// 千元 in words: 3.03 兆, 1,234 億, 56.7 億, 4,500 萬 (en: NT$3.03T, NT$123.4B, NT$45M).
export function money(k, en = false) {
  const v = Math.abs(k), sign = k < 0 ? '−' : '';
  const n = (x, d) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  if (en) {
    if (v >= 1e9) return `${sign}NT$${n(v / 1e9, 2)}T`;
    if (v >= 1e6) return `${sign}NT$${n(v / 1e6, v >= 1e8 ? 0 : 1)}B`;
    if (v >= 1e3) return `${sign}NT$${n(v / 1e3, v >= 1e5 ? 0 : 1)}M`;
    return `${sign}NT$${n(v, 0)}K`;
  }
  if (v >= 1e9) return `${sign}${n(v / 1e9, 2)} 兆`;
  if (v >= 1e5) return `${sign}${n(v / 1e5, v >= 1e7 ? 0 : 1)} 億`;
  if (v >= 10) return `${sign}${n(v / 10, 0)} 萬`;
  return `${sign}${n(v * 1000, 0)} 元`;
}

// The change from last year, as a share: +6.4%.
export const change = (now, before) => (before ? `${now >= before ? '+' : '−'}${Math.abs(((now - before) / before) * 100).toFixed(1)}%` : '');
