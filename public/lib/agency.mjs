// 行政規則 from the agencies' own open data (金管會, 國防部, 客委會, 國發會,
// 農業部): the 要點 / 作業規定 / 注意事項 that 全國法規資料庫 lacks, linked to
// the laws they rest on. Pure functions; scripts/build-agency.mjs does the I/O.
import { basisOf } from './deleg.mjs';

// A rule's name ends like one: 要點, 作業規定, 注意事項… (not a 函釋 or 令).
const RULE_END = /(要點|作業規定|注意事項|處理原則|準則|規範|須知|基準|辦法|規則|細則|規定|原則|標準|程序|指引|守則|規程|範本|流程|計畫|方案|綱要|措施|事項)$/;
const DEAD_NAME = /^(?:廢止|廢|停止|停)/;
const DEAD_STATE = /廢止|停止適用/;

export const isRuleName = n => RULE_END.test(n || '') && !DEAD_NAME.test(n);

const unent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// The text of <tag>…</tag> in a block (CDATA unwrapped, entities decoded, trimmed).
export function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  const c = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (c ? c[1] : unent(m[1])).trim();
}

// 20180810 / 20180810000000 / 2018-08-10 / 2018.08.10 → 2018-08-10, '' when not a date.
export function isoDate(s) {
  const m = String(s || '').match(/^(\d{4})\D?(\d{2})\D?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
const head = s => String(s || '').replace(/[\r\n]+\s*/g, '').slice(0, 400);

// Raw rule: { id, name, agency, date, url, text } (text: its start, for the basis).
const rule = (id, name, agency, date, url, text = '') => ({ id, name: flat(name), agency, date, url, text: head(text) });

// 金管會 <Law> blocks: 行政規則 / 其他 still in force whose attachments carry the LawContent id.
export function parseFsc(xml, agency = '金管會') {
  const out = [];
  let stats = { seen: 0, noId: 0 };
  for (const b of xml.split('<Law>').slice(1)) {
    const kind = tag(b, '法規類別');
    if (kind !== '行政規則' && kind !== '其他') continue;
    const name = tag(b, '法規名稱');
    if (DEAD_STATE.test(tag(b, '異動性質')) || !isRuleName(name)) continue;
    stats.seen++;
    const id = (b.match(/Download\.ashx\?type=LAW&(?:amp;)?id=([A-Z]{2}\d+)/) || [])[1];
    if (!id) {
      stats.noId++;
      continue;
    }
    out.push(rule(`FSC:${id}`, name, agency, isoDate(tag(b, '修正日期') || tag(b, '公發布日')), `https://law.fsc.gov.tw/LawContent.aspx?id=${id}`, tag(b, '法規內容')));
  }
  out.stats = stats;
  return out;
}

// 國防部 Direction.xml: <LawModel> with its own <Url>.
export function parseMnd(xml) {
  const out = [];
  for (const b of xml.split('<LawModel>').slice(1)) {
    const name = tag(b, 'LawName');
    const url = tag(b, 'Url');
    if (tag(b, 'Level') !== '行政規則' || !isRuleName(name) || !/^https?:\/\//.test(url)) continue;
    const no = (url.match(/no=(\d+)/) || [])[1] || url;
    out.push(rule(`MND:${no}`, name, '國防部', isoDate(tag(b, 'ModifiedDate')), url, tag(b, 'Articles')));
  }
  return out;
}

// 國發會 XML: <法規> with 行政規則 level, its URL, not marked abolished.
export function parseNdc(xml) {
  const out = [];
  for (const b of xml.split('<法規>').slice(1)) {
    const name = tag(b, '法規名稱');
    const url = tag(b, '法規網址');
    if (!tag(b, '法規位階').includes('行政規則') || tag(b, '廢止註記') || !isRuleName(name) || !/^https?:\/\//.test(url)) continue;
    out.push(rule(`NDC:${(url.match(/id=(\w+)/) || [])[1] || url}`, name, '國發會', isoDate(tag(b, '法規異動日期')), url, tag(b, '沿革內容')));
  }
  return out;
}

// 客委會 JSON rows: 行政規則 with a URL (no text: linked by name only).
export function parseHakka(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const name = String(r.act_title || '').replace(/\(民國[^)]*\)$/, '');
    if (r.category !== '行政規則' || !isRuleName(name) || !/^https?:\/\//.test(r.URL || '')) continue;
    out.push(rule(`HAKKA:${(r.URL.match(/serno=(\d+)/) || [])[1] || r.URL}`, name, '客委會', isoDate(r.Date), r.URL));
  }
  return out;
}

// 農業部 JSON: full text and dates, but no id, type or URL. A rule is kept
// only when `urlOf(name)` knows its page (none yet: the export names no id).
export function parseMoa(rows, urlOf = () => '') {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const name = flat(r['法規中文名稱']);
    const url = urlOf(name);
    if (!url || !isRuleName(name)) continue;
    out.push(rule(`MOA:${name}`, name, r['發布單位'] || '農業部', isoDate(r['公(發)布日期']), url, String(r['中文內容'] || '').replace(/\r/g, '\n')));
  }
  return out;
}

// The laws (not 命令) a rule's name speaks of: its name starts with the law's
// name, or holds a long one (≥5 characters), or 「<name>第」: longest first.
export function nameLaws(laws, name) {
  const hit = [];
  for (const r of laws) {
    if (r[2] === '命令' || r[5]) continue;
    const n = r[1];
    if (n.length >= name.length) continue;
    if (name.startsWith(n) || (n.length >= 5 && name.includes(n)) || name.includes(`${n}第`)) hit.push(r);
  }
  hit.sort((a, b) => b[1].length - a[1].length);
  return hit.map(r => r[0]);
}

// The laws a rule says it rests on without an article (「依軍人保險條例規定」,
// 「依據國防法第廿二條」 with an article basisOf could not read): law-level only.
const CITED = /依(?:據|照)?[：:]?「?([^，。；：:「」（）、\n]{2,40}?)」?(?:（[^）]*）)?(?=第|之規定|規定|訂定|授權|，|。|$)/g;
export function citedLaws(text, names) {
  const out = new Set();
  const t = String(text || '').slice(0, 300).replace(/中華民國/g, '');
  for (const [, raw] of t.matchAll(CITED)) {
    const p = names.get(raw.replace(/^依(?:據|照)?/, ''));
    if (p) out.add(p);
  }
  return [...out];
}

// Link raw rules → [id, name, agency, date, url, basis, laws], only those with
// a law. `known`: names of regulations Orbit already has (skipped); one rule
// per (agency, name), newest first.
export function linkRules(raw, laws, names, known = new Set()) {
  const seen = new Map();
  for (const r of raw) {
    if (known.has(r.name)) continue;
    const k = `${r.agency}|${r.name}`;
    if (!seen.has(k) || seen.get(k).date < r.date) seen.set(k, r);
  }
  const out = [];
  for (const r of seen.values()) {
    const basis = basisOf(r.text, names);
    const basisLaws = [...new Set(basis.map(b => b.slice(0, b.indexOf(':'))))];
    // The laws its basis names, and the one law its name speaks of (the longest).
    const lawsOf = [...new Set([...basisLaws, ...citedLaws(r.text, names), ...nameLaws(laws, r.name).slice(0, 1)])];
    if (!lawsOf.length) continue;
    out.push([r.id, r.name, r.agency, r.date, r.url, basis, lawsOf]);
  }
  return out.sort((a, b) => (a[3] < b[3] ? 1 : a[3] > b[3] ? -1 : a[0] < b[0] ? -1 : 1));
}

// Per-law files and counts: to: { key: [[id, name, agency, url]] }, rest: by name only.
export function byLaw(rules) {
  const files = {};
  for (const [id, name, agency, , url, basis, laws] of rules) {
    const item = [id, name, agency, url];
    const hit = new Set();
    for (const b of basis) {
      const i = b.indexOf(':');
      const p = b.slice(0, i), k = b.slice(i + 1);
      const f = (files[p] ||= { to: {}, rest: [] });
      (f.to[k] ||= []).push(item);
      hit.add(p);
    }
    for (const p of laws) if (!hit.has(p)) (files[p] ||= { to: {}, rest: [] }).rest.push(item);
  }
  const counts = {};
  for (const [p, f] of Object.entries(files)) counts[p] = new Set([...Object.values(f.to).flat(), ...f.rest].map(x => x[0])).size;
  return { files, counts };
}

// Articles that call for a rule (「…辦法，由主管機關定之」), by key.
const DELEGATES = /(辦法|規則|標準|細則|準則|規程|要點|規定)[^。]{0,20}由[^。]{0,30}定之/;
export const delegates = text => DELEGATES.test(text || '');
