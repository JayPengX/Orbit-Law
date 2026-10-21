// 憲法法庭: every 大法官解釋 (釋字第1–813號) and 憲法法庭判決 (111年憲判字第1號
// on), read from the court's own pages (cons.judicial.gov.tw) by the nightly
// build (scripts/build-cons.mjs) and shown in 裁判. One id each, used by
// every screen and file: s748 (釋字第748號), j111-10 (111年憲判字第10號).
// A ruling's link is #r=<id>; the other courts' judgments use their 司法院
// JID there (#r=TPSM,115,台上,1,20261008,1).
import { cnNumber } from './refs.mjs';

export const CONS = 'https://cons.judicial.gov.tw/';
// The 憲判字 list page (every judgment, newest first, each with its page id).
export const JUDGMENTS_PAGE = `${CONS}judcurrentNew1.aspx?fid=38`;
export const interpPage = n => `${CONS}docredirect.aspx?type=1&no=${n}`;
export const LAST_INTERP = 813;

export const isCons = id => /^(s\d+|j\d+-\d+)$/.test(String(id || ''));
export function consLabel(id, en = false) {
  const s = /^s(\d+)$/.exec(id);
  if (s) return en ? `Interpretation No. ${s[1]}` : `釋字第${s[1]}號`;
  const j = /^j(\d+)-(\d+)$/.exec(id);
  if (j) return en ? `Judgment ${j[1]}-${j[2]}` : `${j[1]}年憲判字第${j[2]}號`;
  return '';
}
// Newest first: 憲判 by year and number, then 釋字 by number.
export const consOrder = id => {
  const j = /^j(\d+)-(\d+)$/.exec(id);
  if (j) return 1e6 + Number(j[1]) * 1000 + Number(j[2]);
  return Number(String(id).slice(1)) || 0;
};
// JDoc's own id for a 憲法法庭 judgment (JCCC,115,憲判,4,20260508) → j115-4.
export function consOfJid(jid) {
  const [head, y, w, n] = String(jid || '').split(',');
  return head?.startsWith('JCC') && w === '憲判' && y && n ? `j${Number(y)}-${Number(n)}` : '';
}

const NUM = '[0-9０-９零〇一二三四五六七八九十百千]+';
const FULL = s => String(s).replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
const REF = new RegExp(`(?:司法院)?(?:大法官)?(?:會議)?釋字第\\s*(${NUM})\\s*號(?:解釋)?|(?:憲法法庭)?(${NUM})\\s*年\\s*憲判字\\s*第\\s*(${NUM})\\s*號(?:判決)?`, 'g');
// The 憲法法庭 rulings a text names, as runs: [string | { t, id }].
export function consLinks(text) {
  const s = String(text || '');
  const out = [];
  let last = 0;
  REF.lastIndex = 0;
  for (let m; (m = REF.exec(s)); ) {
    const id = m[1] ? `s${cnNumber(FULL(m[1]))}` : `j${cnNumber(FULL(m[2]))}-${cnNumber(FULL(m[3]))}`;
    if (/NaN|s0$|-0$/.test(id)) continue;
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push({ t: m[0], id });
    last = REF.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
// The ids alone, once each, in order.
export const consRefs = text => [...new Set(consLinks(text).filter(x => typeof x === 'object').map(x => x.id))];

// 中華民國 106年05月24日, 115年10月08日, 36.01.01 → YYYY-MM-DD ('' if none).
export function rocDate(s) {
  const m = /(\d{2,3})\s*[年.]\s*(\d{1,2})\s*[月.]\s*(\d{1,2})/.exec(FULL(s || ''));
  return m ? `${Number(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

// ---- A page of 憲法法庭's site, read into its parts ---------------------------------------

const unesc = s => String(s).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
const strip = s => unesc(String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();

// Each row of the page's table (判決字號, 主文, 理由, 相關法令…): its text, its
// numbered paragraphs (<label>1</label><pre>…</pre>) and its links.
// → { [title]: { text, paras: [..], links: [[text, href]] } }
export function readConsPage(html) {
  const s = String(html || '');
  const from = s.indexOf('class="lawList"');
  const body = from >= 0 ? s.slice(from) : s;
  const out = {};
  const ROW = /<li class="title"[^>]*>([\s\S]*?)<\/li>\s*<li[^>]*class="text"[^>]*>([\s\S]*?)<\/li>\s*<\/ul>/g;
  for (let m; (m = ROW.exec(body)); ) {
    const title = strip(m[1]).replace(/\s+/g, '');
    if (!title || out[title]?.text) continue;
    const inner = m[2];
    const paras = [...inner.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map(x => strip(x[1]).replace(/^[　 ]+/, '')).filter(Boolean);
    const links = [...inner.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .map(x => [strip(x[2]).replace(/\s+/g, ' '), unesc(x[1])])
      .filter(([t, u]) => t && !/^javascript:/i.test(u));
    // Lines without a link (newer pages list 相關法令 as plain lines).
    for (const x of inner.replace(/<a\b[\s\S]*?<\/a>/g, '').replace(/<p style='display:none;'>[\s\S]*?<\/p>/g, '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      const t = strip(x[1]).replace(/\s+/g, ' ');
      if (t && !links.some(l => l[0] === t)) links.push([t, '']);
    }
    out[title] = { text: paras.length ? paras.join('\n') : strip(inner.replace(/<p style='display:none;'>[\s\S]*?<\/p>/g, '')), paras, links };
  }
  return out;
}
// The 憲判字 list: [{ id: 'j115-7', page: 352187 }], newest first.
export function judgmentList(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/docdata\.aspx\?fid=38&(?:amp;)?id=(\d+)[^>]*>([\s\S]*?)<\/a>/g)) {
    const no = /(\d+)年憲判字第(\d+)號/.exec(strip(m[2]).replace(/\s+/g, ''));
    if (!no) continue;
    const id = `j${Number(no[1])}-${Number(no[2])}`;
    if (!out.some(x => x.id === id)) out.push({ id, page: Number(m[1]) });
  }
  return out;
}

// ---- 相關法令: the articles a ruling rules on ---------------------------------------------

// The date a law was last enacted or rewritten whole, from its 沿革
// (…修正公布全文 449 條) as YYYYMMDD: article numbers cited before it are
// another text's, so they don't land on today's articles.
export function lastRewrite(history) {
  let best = '';
  for (const entry of String(history || '').split(/\n(?=\s*\d+\.)/)) {
    const e = entry.replace(/\s+/g, '');
    if (!/公布全文|全文修正/.test(e)) continue;
    const m = /中華民國([零〇一二三四五六七八九十百]+)年([一二三四五六七八九十]+)月([一二三四五六七八九十]+)日/.exec(e);
    if (!m) continue;
    const d = `${cnNumber(m[1]) + 1911}${String(cnNumber(m[2])).padStart(2, '0')}${String(cnNumber(m[3])).padStart(2, '0')}`;
    if (d > best) best = d;
  }
  return best;
}

// The article keys in a link's no= (7,22,23 · 39.1 · 6-8), or in its text
// (第7、22、23條 · 第39條之1).
function artKeys(no, text) {
  const keys = [];
  const add = k => k && !keys.includes(k) && keys.push(k);
  if (no)
    for (const part of String(no).split(',')) {
      const r = /^(\d+)-(\d+)$/.exec(part);
      if (r && Number(r[2]) > Number(r[1]) && Number(r[2]) - Number(r[1]) <= 30) for (let i = Number(r[1]); i <= Number(r[2]); i++) add(String(i));
      else if (/^\d+(\.\d+)?$/.test(part)) add(part.replace('.', '-'));
    }
  if (!keys.length) {
    const m = /第([^條]+)條(?:之(\d+))?/.exec(FULL(text));
    if (m) for (const n of m[1].split(/[、,，及]/)) if (/^\d+$/.test(n.trim())) add(m[2] && !m[1].includes('、') ? `${n.trim()}-${m[2]}` : n.trim());
  }
  return keys;
}

// One 相關法令 link → { p, keys, since } (a law and its articles), { id } (a
// 憲法法庭 ruling) or null. names: Map name → pcode (refs.mjs nameMap).
export function readLawLink([text, href], names) {
  const t = FULL(text).trim();
  const ref = consRefs(t)[0] || (/docredirect\.aspx\?type=1&no=(\d+)/.exec(href) ? `s${/no=(\d+)/.exec(href)[1]}` : '');
  if (ref) return { id: ref };
  const u = String(href);
  const since = rocDate((/\((\d{2,3}\.\d{2}\.\d{2})\)/.exec(t) || [])[1]).replace(/-/g, '');
  let p = /law\.moj\.gov\.tw[^"]*pcode=([A-Z]\d{7})/i.exec(u)?.[1] || '';
  const name = t.replace(/\(.*?\)$/, '').split('第')[0].trim();
  if (!p && name) p = names.get(name) || names.get(name.replace(/^中華民國/, '')) || names.get(`中華民國${name}`) || '';
  if (!p) return null;
  const no = /[?&](?:no|norge)=([\d.,-]+)/.exec(u)?.[1] || '';
  return { p, keys: artKeys(no, t), since };
}

// A ruling's cites (['A0000001:7', 'B0000001'] — an article, or the law
// alone when its numbers are another text's) and the rulings it names.
// rewriteOf: pcode → YYYYMMDD (lastRewrite), or '' when unknown.
export function citesOf(links, names, rewriteOf = () => '') {
  const cites = [], refs = [];
  for (const l of links || []) {
    const x = readLawLink(l, names);
    if (!x) continue;
    if (x.id) {
      if (!refs.includes(x.id)) refs.push(x.id);
      continue;
    }
    const old = x.since && rewriteOf(x.p) && x.since < rewriteOf(x.p);
    const add = c => !cites.includes(c) && cites.push(c);
    if (old || !x.keys.length) add(x.p);
    else for (const k of x.keys) add(`${x.p}:${k}`);
  }
  return { cites, refs };
}

// ---- A ruling, made from its page ---------------------------------------------------------

const field = (page, ...titles) => {
  for (const t of titles) if (page[t]?.text) return page[t];
  return null;
};
// → { id, label, n, d, by, issue, main, reason, cites, refs, docs, url }.
export function consItem(id, page, { names = new Map(), rewriteOf, url = '' } = {}) {
  const head = field(page, '判決字號', '解釋字號')?.text || '';
  const n = (/【(.+?)】/.exec(head) || [])[1] || '';
  const d = rocDate(field(page, '判決日期', '解釋公布院令', '解釋日期')?.text || '');
  const issue = (field(page, '案由', '解釋爭點')?.text || '').replace(/\s*\n\s*/g, '');
  const main = field(page, '主文', '解釋文');
  const reason = field(page, '理由', '理由書');
  const laws = field(page, '相關法令');
  const { cites, refs } = citesOf(laws?.links, names, rewriteOf);
  // The rulings its text names count too (理由 often cites 釋字 not listed).
  for (const r of consRefs(`${main?.text || ''}\n${reason?.text || ''}`)) if (r !== id && !refs.includes(r)) refs.push(r);
  const docs = [];
  for (const t of ['判決全文', '判決摘要', '解釋摘要', '大法官就主文所採立場表', '意見書'])
    for (const [title, href] of page[t]?.links || []) if (/download/.test(href)) docs.push([title, new URL(href, CONS).href]);
  return {
    id,
    label: consLabel(id),
    n,
    d,
    by: (field(page, '聲請人')?.text || '').replace(/\s*\n\s*/g, '、'),
    issue,
    main: main?.paras.length ? main.paras : main ? [main.text] : [],
    reason: reason?.paras.length ? reason.paras : reason ? [reason.text] : [],
    cites,
    refs: refs.filter(r => r !== id),
    docs,
    url
  };
}
// The index row: [id, date, name, issue (a line), cites, refs, bills].
export const consRow = (it, bills = []) => [it.id, it.d, it.n, it.issue.length > 90 ? `${it.issue.slice(0, 89)}…` : it.issue, it.cites, it.refs, bills];

// { pcode: { article: [ids] } } (article '' = the law as a whole), newest first.
export function consByLaw(rows) {
  const out = {};
  for (const [id, , , , cites] of [...rows].sort((a, b) => consOrder(b[0]) - consOrder(a[0])))
    for (const c of cites) {
      const [p, k = ''] = c.split(':');
      const list = ((out[p] ||= {})[k] ||= []);
      if (!list.includes(id)) list.push(id);
    }
  return out;
}

// The bills whose purpose names a ruling: { id: ['11:02513', …] }.
// bills: bills/all.json's list ({ term, laws, a }).
export function billsNaming(bills) {
  const out = {};
  for (const b of bills || [])
    for (const id of consRefs(`${b.t || ''} ${b.a || ''}`))
      for (const law of b.laws || []) {
        const k = `${b.term}:${law}`;
        if (!(out[id] ||= []).includes(k)) out[id].push(k);
      }
  return out;
}

// Cited by: how many later rulings name each one (a 釋字 others build on is a landmark).
export function citedBy(rows) {
  const out = {};
  for (const [id, , , , , refs] of rows) for (const r of refs) (out[r] ||= []).push(id);
  return out;
}
