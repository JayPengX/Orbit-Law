// 授權: the regulations a law's articles call for (「…辦法，由主管機關定之」)
// and, back, the article each regulation says it rests on (its first
// articles: 「本辦法依○○法第七條規定訂定之」). Built once at deploy
// (scripts/build-data.mjs → data/deleg/<p>.json); the reader shows both ways.
import { cnNumber, parentLaw } from './refs.mjs';

const N = '[零〇一二三四五六七八九十百千0-9]+';
// 依(據/照)「○○法」(（以下簡稱本法）)第N條…: the law's name, then the rest of the clause.
const BASIS = new RegExp(`依(?:據|照)?「?([^，。；「」（）、\\n]{2,40}?)」?(?:（[^）]*）)?(第${N}條[^。；\\n]*?)(?:規定|訂定|之授權|授權|。|；|$)`, 'g');
const ART = new RegExp(`第(${N})條(?:之(${N}))?`, 'g');
const ALIAS = /([^，。；「」（）、\n]{2,40}?)（以下簡稱(本法|本條例|本通則)）/g;

const keyOf = (a, b) => {
  const n = cnNumber(a);
  if (!(n > 0)) return '';
  const m = b ? cnNumber(b) : 0;
  return m > 0 ? `${n}-${m}` : String(n);
};

// The articles a regulation rests on, from its text: ['B0000001:7', …], once each.
export function basisOf(text, names) {
  const t = String(text || '');
  const alias = {};
  for (const [, n, a] of t.matchAll(ALIAS)) alias[a] = n;
  const out = new Set();
  // Only a sentence that says it is made under the law (訂定/授權), not one that only mentions it.
  const said = t.split(/[。\n]/).filter(x => /訂定|授權|制定/.test(x)).join('。');
  for (const [, raw, arts] of said.matchAll(BASIS)) {
    const name = (alias[raw] || raw).replace(/^中華民國(?=.*(法|條例|通則)$)/, '');
    const p = names.get(name) || names.get(alias[raw] || raw);
    if (!p) continue;
    for (const [, a, b] of arts.matchAll(ART)) {
      const k = keyOf(a, b);
      if (k) out.add(`${p}:${k}`);
    }
  }
  return [...out];
}

// Per law and regulation: { p: { to: { key: [[order p, name]] }, rest: [[p, name]], from: [[law p, key]] } }.
// to: an article's regulations; rest: its regulations naming no article
// (a 施行細則 known by its name); from: a regulation's basis.
export function delegations(orders, names, rows) {
  const out = {};
  const at = p => (out[p] ||= { to: {}, rest: [], from: [] });
  for (const o of orders) {
    const head = o.a.filter(a => a[0] === 'A').slice(0, 3).map(a => a[2]).join('\n');
    const basis = basisOf(head, names);
    if (basis.length)
      for (const c of basis) {
        const i = c.indexOf(':');
        const p = c.slice(0, i), k = c.slice(i + 1);
        (at(p).to[k] ||= []).push([o.p, o.n]);
        at(o.p).from.push([p, k]);
      }
    else {
      const p = parentLaw(rows, o.n);
      if (!p) continue;
      at(p).rest.push([o.p, o.n]);
      at(o.p).from.push([p, '']);
    }
  }
  return out;
}

// How many regulations rest on a law (its own and its articles'), each once.
export const regCount = d => new Set([...Object.values(d?.to || {}).flat(), ...(d?.rest || [])].map(r => r[0])).size;
