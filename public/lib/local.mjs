// 地方法規: the cities' 自治條例, 自治規則, 委辦規則 and 行政規則, read from their own
// 法規查詢系統 (臺北市, 新北市, and the 主管法規 platform 高雄市, 臺中市, 新竹市, 金門縣).
// Pure functions; scripts/build-local.mjs does the I/O.
import { vendorText } from './agency.mjs';

// The kinds kept, the ones a person reads first earliest.
export const LOCAL_KINDS = ['自治條例', '自治規則', '委辦規則', '行政規則'];
const DEAD_NAME = /^(?:廢止|廢|停止|停)/;

export const decode = s =>
  String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&nbsp;| /g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// 民國 115 年 07 月 22 日 → 2026-07-22 ('' when not a date).
export function rocLong(s) {
  const m = decode(s).match(/(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  return m ? `${+m[1] + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

// [id, name, date, type] of the listed rows worth carrying (a kind above, not a repealed one).
export const localKeep = rows => rows.filter(r => LOCAL_KINDS.includes(r.type) && r.name && !DEAD_NAME.test(r.name)).map(r => [r.id, r.name, r.date, r.type]);

// The rules to read, from listed rows (id → { id, name, date, type }): one per name (the newest),
// 自治條例 first, then 自治規則, 委辦規則, 行政規則; the same kind by name.
export function localWant(items) {
  const byName = new Map();
  for (const r of items.values()) {
    if (!LOCAL_KINDS.includes(r.type) || !r.name || DEAD_NAME.test(r.name)) continue;
    const old = byName.get(r.name);
    if (!old || old.date < r.date) byName.set(r.name, r);
  }
  const rank = r => LOCAL_KINDS.indexOf(r.type);
  return [...byName.values()].sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// A page's text is read again when it was never read, when the list's date moved, or (a list
// with no dates) when it was read over 30 days ago. read: what the last deploy kept, { stamp }
// (the list's date, or the day it was read when the list gives none), or undefined.
export function needsRead(row, read, today) {
  if (!read) return true;
  if (row.date) return read.stamp !== row.date;
  return Date.parse(today) - Date.parse(read.stamp) > 30 * 864e5;
}

// Text read off a page: the lines trimmed at the end, a double-spaced text (a blank line after every
// line, the platform's habit) closed up, long gaps made one blank line.
export function tidyText(t) {
  let s = String(t || '').replace(/\r/g, '').replace(/[ \t　]+\n/g, '\n').replace(/^\s+|\s+$/g, '');
  const lines = s.split('\n').filter(x => x.trim()).length;
  const singles = (s.match(/[^\n]\n\n(?=[^\n])/g) || []).length;
  if (lines > 3 && singles > lines * 0.6) s = s.replace(/([^\n])\n\n(?=[^\n])/g, '$1\n');
  return s.replace(/\n{3,}/g, '\n\n');
}

// ---- 臺北市 (laws.gov.taipei): the whole city is category 001, 20 rules a page.

// A LawCategoryResult page → { pages, rows: [{ id, name, date: '', type }] }.
export function tpeList(html) {
  const t = String(html);
  const pages = +((t.match(/page="(\d+)"[^>]*title="前往最終頁"/) || [])[1] || 1);
  const rows = [];
  for (const m of t.matchAll(/<td headers="cate-col-2">([^<]*)<\/td>[\s\S]*?href="\/Law\/LawSearch\/LawInformation\/([A-Za-z0-9]+)[^"]*">([^<]*)<\/a>/g)) rows.push({ id: m[2], name: decode(m[3]).trim(), date: '', type: decode(m[1]).trim() });
  return { pages, rows };
}

// A LawArticleContent page → { name, date, text }: each article under its number (a 要點 has none).
export function tpeText(html) {
  const t = String(html);
  const name = decode((t.match(/class="law-link"[^>]*>([^<]*)<\/a>/) || [])[1]).trim();
  // The first field that is a date (the page's 修正日期 comes before its 沿革); the page writes its words as &#x…; entities.
  const date = [...t.matchAll(/<dfn[^>]*>([^<]*)<\/dfn>/g)].map(m => rocLong(m[1])).find(Boolean) || '';
  const parts = [];
  for (const m of t.matchAll(/<div class="row">\s*(?:<div class="col-no">([^<]*)<\/div>)?\s*<div class="col-data">\s*<div class="law-articlepre">([\s\S]*?)<\/div>/g)) {
    const no = decode(m[1]).replace(/\s+/g, ' ').trim();
    parts.push((no ? `${no}\n` : '') + decode(m[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim());
  }
  return { name, date, text: tidyText(parts.join('\n\n')) };
}

// ---- 新北市 (web.law.ntpc.gov.tw): Query5.aspx?name=A..D lists a kind whole, lncode → fcode by dropping the first character.

export const NTPC_KINDS = { A: '自治條例', B: '自治規則', C: '委辦規則', D: '行政規則' };

// A Query5.aspx page → [{ id (lncode), name, date: '', type }].
export function ntpcList(html, type) {
  return [...String(html).matchAll(/href="\/Scripts\/FLAWDAT01\.aspx\?lncode=([A-Za-z0-9]+)">([^<]*)<\/a>/g)].map(m => ({ id: m[1], name: decode(m[2]).trim(), date: '', type }));
}

export const ntpcCode = id => String(id).slice(1);

// A FLAWDAT0202.aspx page → { name, date, text }.
export function ntpcText(html) {
  const t = String(html);
  const name = decode((t.match(/id="cph_content_lawheader_hlkLNNAME"[^>]*>([^<]*)<\/a>/) || [])[1]).trim();
  const date = rocLong((t.match(/hlkLNNAME"[^>]*>[^<]*<\/a>\s*\(([^)]*)\)/) || [])[1]);
  const parts = [];
  for (const m of t.matchAll(/<td class="col-th">\s*<a [^>]*>([^<]*)<\/a>[\s\S]*?<pre>([\s\S]*?)<\/pre>/g)) {
    const no = decode(m[1]).replace(/\s+/g, ' ').trim();
    parts.push((/^第.*條/.test(no) ? `${no}\n` : '') + decode(m[2].replace(/<[^>]+>/g, '')).trim());
  }
  return { name, date, text: tidyText(parts.join('\n\n')) };
}

// ---- The 主管法規 platform (高雄市, 臺中市, 新竹市, 金門縣): agency.mjs's vendorLeaves and vendorList read it too.

// A LawContent.aspx page → its text. Most sites give the text in one block (agency.mjs's vendorText);
// 臺中市's newer pages give a table, a row to an article or a chapter's name.
export function platformText(html) {
  const one = vendorText(html);
  if (one.trim()) return tidyText(one);
  const parts = [];
  for (const m of String(html).matchAll(/<td colspan="2" class="th law-char"[^>]*>([\s\S]*?)<\/td>|<div class="ClearCss">([\s\S]*?)<\/div>\s*<\/td>/g))
    parts.push(decode((m[1] ?? m[2]).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim());
  return tidyText(parts.join('\n\n'));
}
