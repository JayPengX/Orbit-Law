// Court rulings under each article: 最高法院, 最高行政法院 and 憲法法庭
// judgments from 司法院's JDoc open data, kept by the articles they cite.
// One place for the nightly build (scripts/build-rulings.mjs) and the app.
import { linkText } from './refs.mjs';

// A judgment id's court (its first part, less the kind letter): TPS 最高法院,
// TPA 最高行政法院, JCC 憲法法庭. Only these are kept.
export const COURTS = { TPS: ['最高法院', 'Supreme Court'], TPA: ['最高行政法院', 'Supreme Administrative Court'], JCC: ['憲法法庭', 'Constitutional Court'] };
export const courtOf = jid => {
  const c = String(jid || '').split(',')[0].slice(0, 3);
  return COURTS[c] ? c : '';
};
// A judgment id's kind (its fourth letter) with a colour, and its 案號 read out:
// TPSM,115,台上,3024 → 刑事 · 115年度台上字第3024號.
const KINDS = { M: ['刑事', 'Criminal', 'red'], V: ['民事', 'Civil', 'indigo'], A: ['行政', 'Administrative', 'teal'] };
export const caseKind = jid => {
  const head = String(jid || '').split(',')[0];
  return head.startsWith('JCC') ? ['憲法', 'Constitutional', 'purple'] : KINDS[head[3]] || ['', '', 'gray'];
};
export const caseNo = jid => {
  const [, y, w, n] = String(jid || '').split(',');
  return y && w && n ? `${y}年度${w}字第${n}號` : '';
};
export const KEEP_PER_ARTICLE = 30;
export const KEEP_DAYS = 3 * 365;

const FULL = /[０-９]/g;
// Every article a judgment cites by law name: ['B0000001:184', …], once each.
// (A bare 第X條 in a judgment has no law of its own: skipped.)
export function citesOf(text, names) {
  const out = new Set();
  const plain = String(text || '').replace(FULL, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  for (const line of plain.split(/\n/)) for (const s of linkText(line, { names })) if (typeof s === 'object' && s.law && s.from) out.add(`${s.law}:${s.from}`);
  return [...out];
}

// A JDoc answer made small: [jid, date YYYY-MM-DD, title, cites].
export function compactRuling(doc, names) {
  const jid = doc.JID || doc.jid || '';
  const d = String(doc.JDATE || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
  // (The full text: JFULLX.JFULLCONTENT in JDoc's answers, JFULL in its bulk files.)
  return [jid, d, String(doc.JTITLE || '').trim(), citesOf(doc.JFULLX?.JFULLCONTENT ?? doc.JFULL, names)];
}

// The kept list: newest first, one per id, older than `days` dropped.
export function mergeRulings(prev, fresh, now = new Date(), days = KEEP_DAYS) {
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10);
  const by = new Map();
  for (const r of [...fresh, ...(prev || [])]) if (r[0] && !by.has(r[0]) && r[1] >= cutoff) by.set(r[0], r);
  return [...by.values()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
}

// Per law: { pcode: { key: [[jid, date, title], …newest first, capped] } }.
export function byLaw(rulings, cap = KEEP_PER_ARTICLE) {
  const out = {};
  for (const [jid, d, t, cites] of rulings)
    for (const c of cites) {
      const i = c.indexOf(':');
      const p = c.slice(0, i), k = c.slice(i + 1);
      const law = (out[p] ||= {});
      const list = (law[k] ||= []);
      if (list.length < cap) list.push([jid, d, t]);
    }
  return out;
}

// How many judgments cite each law (laws.json: a count on its rows).
export function lawCounts(rulings) {
  const out = {};
  for (const [, , , cites] of rulings) for (const p of new Set(cites.map(c => c.slice(0, c.indexOf(':'))))) out[p] = (out[p] || 0) + 1;
  return out;
}
// The newest few, with the first articles each cites (首頁's 最新判決).
export const latestRulings = (rulings, n = 10) => rulings.slice(0, n).map(([jid, d, t, cites]) => [jid, d, t, cites.slice(0, 4)]);

// For browsing in 裁判: each month's judgments ({ YYYYMM: [ruling, …] },
// newest first), and per month how many each court gave ([[YYYYMM, TPS, TPA]]).
// 憲法法庭's come from its own site (cons.mjs), so they're left out here.
export function byMonth(rulings) {
  const out = {};
  for (const r of rulings) if (courtOf(r[0]) && courtOf(r[0]) !== 'JCC' && r[1]) (out[r[1].slice(0, 7).replace('-', '')] ||= []).push(r);
  return out;
}
export const monthCounts = months => Object.keys(months).sort().reverse().map(m => [m, months[m].filter(r => courtOf(r[0]) === 'TPS').length, months[m].filter(r => courtOf(r[0]) === 'TPA').length]);
// For finding one by its number or matter: [jid, title] for every one kept.
export const findRows = rulings => rulings.filter(r => courtOf(r[0]) && courtOf(r[0]) !== 'JCC').map(([jid, , t]) => [jid, t]);
// A case number typed (115台上4682, 115年度台上字第4682號, 114 判 76) → its parts.
export function caseQuery(q) {
  const m = /^(\d{2,3})\s*年?度?\s*([\u4e00-\u9fff]{1,6}?)\s*字?\s*第?\s*(\d{1,6})\s*號?$/.exec(String(q || '').replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).trim());
  return m && !/憲判/.test(m[2]) ? { y: String(Number(m[1])), w: m[2], n: String(Number(m[3])) } : null;
}
export const caseMatch = (jid, c) => {
  const [, y, w, n] = String(jid).split(',');
  return y === c.y && n === c.n && (w === c.w || w.replace(/^台/, '臺') === c.w || w.replace(/^臺/, '台') === c.w);
};

export const rulingUrl = jid => `https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=${encodeURIComponent(jid)}`;

// JDoc answers only 00:00–06:00 Taiwan time.
export const inWindow = (now = new Date()) => (now.getUTCHours() + 8) % 24 < 6;

// 司法院's monthly bulk archives (opendata.judicial.gov.tw, category 051):
// one RAR of every court's judgments a month. From its resource list, the
// months as [{ month: 'YYYYMM', id: fileSetId }], newest first.
export function archiveMonths(resources) {
  const out = [];
  for (const d of resources || []) {
    const m = /^(\d{6})裁判書/.exec(d.title || '');
    const f = (d.filesets || []).find(x => /rar/i.test(x.resourceFormat || ''));
    if (m && f) out.push({ month: m[1], id: f.fileSetId });
  }
  return out.sort((a, b) => (a.month < b.month ? 1 : -1));
}
// The months still to read: not done yet, and inside the kept span.
export function pendingMonths(months, done = [], now = new Date(), days = KEEP_DAYS) {
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 7).replace('-', '');
  const have = new Set(done);
  return months.filter(m => !have.has(m.month) && m.month >= cutoff);
}
// An archive entry worth reading: a top court's judgment file.
export const topCourtFile = path => /\.json$/i.test(path) && /最高法院|最高行政法院|憲法法庭/.test(path);

// 司法院's Delete-Infor list (rulings taken down, e.g. sealed later): every
// JID in it, however the CSV lays its columns out.
const JID = /[A-Z]{2,6},\d{2,3},[^,\r\n"]{1,12},\d{1,7},\d{8},\d{1,3}/g;
export const deletedIds = csv => new Set(String(csv || '').match(JID) || []);
export const dropDeleted = (rulings, gone) => (gone.size ? rulings.filter(r => !gone.has(r[0])) : rulings);

// ---- The other courts: 高等法院 (and its branches), 高等行政法院, 智慧財產及商業法院,
// 地方法院 and their 簡易庭, 少年及家事法院. Their 判決 only (裁定 are mostly
// procedure), out of the same monthly archives; kept by article, by 案由 and
// by court so a phone loads only the slice it asks for.
export const LOW_COURTS = {
  TPH: '臺灣高等法院', TCH: '臺中高分院', TNH: '臺南高分院', KSH: '高雄高分院', HLH: '花蓮高分院', KMH: '金門高分院',
  TPB: '臺北高等行政', TCB: '臺中高等行政', KSB: '高雄高等行政', IPC: '智財商業法院',
  TPD: '臺北地院', SLD: '士林地院', PCD: '新北地院', ILD: '宜蘭地院', KLD: '基隆地院', TYD: '桃園地院', SCD: '新竹地院', MLD: '苗栗地院',
  TCD: '臺中地院', CHD: '彰化地院', NTD: '南投地院', ULD: '雲林地院', CYD: '嘉義地院', TND: '臺南地院', KSD: '高雄地院', CTD: '橋頭地院',
  HLD: '花蓮地院', TTD: '臺東地院', PTD: '屏東地院', PHD: '澎湖地院', KMD: '金門地院', LCD: '連江地院', KSY: '高雄少家法院',
  TPP: '懲戒法院', TPJ: '懲戒法院職務法庭', TPT: '臺北高行地方庭', TCT: '臺中高行地方庭', KST: '高雄高行地方庭',
  // 簡易庭 by their own place (FJUD's headings, 2026-10).
  STE: '新店簡易庭', NHE: '內湖簡易庭', SJE: '三重簡易庭', CLE: '中壢簡易庭', CPE: '竹北簡易庭', SDE: '沙鹿簡易庭', FYE: '豐原簡易庭',
  OLE: '員林簡易庭', PDE: '北斗簡易庭', TLE: '斗六簡易庭', PKE: '北港簡易庭', HUE: '虎尾簡易庭', SYE: '柳營簡易庭', SSE: '新市簡易庭',
  FSE: '鳳山簡易庭', GSE: '岡山簡易庭', CSE: '旗山簡易庭', CDE: '橋頭簡易庭', CCE: '潮州簡易庭', MKE: '馬公簡易庭', LTE: '羅東簡易庭'
};
export const lowCode = jid => {
  const c = String(jid || '').split(',')[0].slice(0, 3);
  return /^[A-Z]{3}$/.test(c) && !COURTS[c] ? c : '';
};
// A court's level: 高等 (and 高等行政, 智財), else 地方 (簡易庭 and 少家 with it).
export const lowLevel = code => (/^[A-Z]{2}[HB]$/.test(code) || ['IPC', 'TPP', 'TPJ'].includes(code) ? 'high' : 'district');
// A 簡易庭's name read off its court's (TPE → 臺北地院's, by the first two letters).
export function lowCourtName(code, names = {}) {
  if (names[code]) return names[code];
  if (LOW_COURTS[code]) return LOW_COURTS[code];
  const parent = Object.keys(LOW_COURTS).find(c => c.slice(0, 2) === code.slice(0, 2) && c[2] === 'D');
  return parent ? `${LOW_COURTS[parent]}簡易庭` : code;
}
// A court's own name from an archive path (…/臺灣臺北地方法院/…), short.
export const courtFromPath = path => {
  const seg = String(path || '').split(/[\\/]/).find(s => /(法院|簡易庭|分院)$/.test(s));
  return seg ? seg.replace(/^臺灣/, '').replace(/地方法院$/, '地院').replace(/高等法院(.+)分院$/, '$1高分院') : '';
};
// A 判決 (not a 裁定, 判決 is in its heading line).
export const isJudgment = doc => {
  const head = String(doc?.JFULL ?? doc?.JFULLX?.JFULLCONTENT ?? '').replace(/\s+/g, '').slice(0, 60);
  return /判決/.test(head) && !/裁定/.test(head);
};
// A short stable key for a 案由 (its file name).
export function titleKey(t) {
  let h = 0x811c9dc5;
  for (const ch of String(t)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(36);
}
export const LOW_PER_ARTICLE = 20;
export const LOW_PER_TITLE = 200;
export const LOW_PER_COURT = 150;
// Everything the app reads for these courts, from their kept rows (newest first):
// per law a count and per article its newest; 案由 with counts and each one's
// newest; each court's newest and count; the newest of all.
export function lowViews(rows, { names = {} } = {}) {
  const laws = {}, byLaw = {}, titles = new Map(), byTitle = {}, courts = {}, byCourt = {};
  for (const [jid, d, t, cites] of rows) {
    const code = lowCode(jid);
    if (!code) continue;
    const seen = new Set();
    for (const c of cites) {
      const i = c.indexOf(':');
      const p = i < 0 ? c : c.slice(0, i), k = i < 0 ? '' : c.slice(i + 1);
      if (!seen.has(p)) ((laws[p] = (laws[p] || 0) + 1), seen.add(p));
      const list = ((byLaw[p] ||= {})[k] ||= []);
      if (list.length < LOW_PER_ARTICLE) list.push([jid, d, t]);
    }
    const title = String(t || '').trim() || '其他';
    titles.set(title, (titles.get(title) || 0) + 1);
    const tl = (byTitle[title] ||= []);
    if (tl.length < LOW_PER_TITLE) tl.push([jid, d, cites.slice(0, 4)]);
    courts[code] = (courts[code] || 0) + 1;
    const cl = (byCourt[code] ||= []);
    if (cl.length < LOW_PER_COURT) cl.push([jid, d, t, cites.slice(0, 4)]);
  }
  const courtRows = Object.entries(courts).map(([c, n]) => [c, lowCourtName(c, names), n, lowLevel(c)]).sort((a, b) => b[2] - a[2]);
  const titleRows = [...titles].sort((a, b) => b[1] - a[1]).map(([t, n]) => [t, n, titleKey(t)]);
  const latest = rows.filter(r => lowCode(r[0])).slice(0, 40).map(([jid, d, t, cites]) => [jid, d, t, cites.slice(0, 4)]);
  return { laws, byLaw, titles: titleRows, byTitle, courts: courtRows, byCourt, latest };
}
