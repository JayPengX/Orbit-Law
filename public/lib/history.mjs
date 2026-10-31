// 沿革, read: 全國法規資料庫's history text (numbered entries, its lines
// broken mid-number at a fixed width) as events: when, by what order, what
// it did to which articles. The sheet draws them as a timeline, newest first.
//   → [{ n, date: 'YYYY-MM-DD' | '', doc, acts: [{ act, whole, arts }], notes, more: [events of the same entry, as these] }]

const DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNIT = { 十: 10, 百: 100, 千: 1000 };
export function cnNumber(s) {
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0, digit = 0;
  for (const ch of s) {
    if (ch in DIGIT) digit = DIGIT[ch];
    else if (ch in UNIT) ((total += (digit || 1) * UNIT[ch]), (digit = 0));
    else return NaN;
  }
  return total + digit;
}
const N = '[零〇一二兩三四五六七八九十百千\\d]+';
const DATE = new RegExp(`^中華民國(${N})年(${N})月(${N})日`);
const ACT = /(制定|訂定|增訂|刪除|修正|廢止)/;
const pad = n => String(n).padStart(2, '0');

function dateOf(t) {
  const m = DATE.exec(t);
  if (!m) return ['', t];
  const [y, mo, d] = [m[1], m[2], m[3]].map(cnNumber);
  return [y && mo && d ? `${y + 1911}-${pad(mo)}-${pad(d)}` : '', t.slice(m[0].length)];
}

// One clause's act and its articles (第 5、7、32～36、8-1 條, 第 8 條之 1).
function actOf(c) {
  const act = (ACT.exec(c) || [])[1];
  if (!act) return null;
  const whole = (/全文(\d+)條/.exec(c) || [])[1];
  const arts = [];
  for (const m of c.matchAll(/第([\d\-、～~至]+)條(?:之(\d+))?/g)) {
    if (m[2]) arts.push(`${m[1]}-${m[2]}`);
    else for (const a of m[1].split('、')) if (a) arts.push(a.replace(/[~至]/g, '～'));
  }
  const part = whole ? (/([^；，公布]{1,4}編)全文/.exec(c) || [])[1] || '' : '';
  return { act, whole: whole ? Number(whole) : 0, part, arts };
}

function event(t) {
  const [date, rest] = dateOf(t);
  // The order: up to 號令 (or 號函, 號公告); an old one names only who made it.
  let doc = '', r = rest;
  const m = /^(.*?字第[\d\-]+號)(令|函|公告)?/.exec(rest);
  if (m) ((doc = m[1] + (m[2] || '')), (r = rest.slice(m[0].length)));
  else {
    const by = /^(.*?)(?=令?(制定|訂定|修正|增訂|刪除|廢止|公布|發布|定))/.exec(rest);
    if (by) ((doc = by[1]), (r = rest.slice(by[1].length)));
  }
  const acts = [], notes = [];
  for (const c of r.replace(/^令/, '').split(/[；;]|，?並(?=自|於|刪除|增訂|修正|定)/).map(x => x.trim()).filter(Boolean)) {
    const a = actOf(c);
    if (a) acts.push(a);
    else notes.push(c.replace(/^並/, '').replace(/。$/, ''));
  }
  return { date, doc, acts, notes };
}

export function parseHistory(h) {
  const text = String(h || '').replace(/\r/g, '');
  const parts = text.split(/(?:^|\n)\s*(\d+)\.\s*/).slice(1);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    // (The lines joined: a break can fall inside a number or a word.)
    const t = parts[i + 1].replace(/\s+/g, '');
    const [first, ...more] = t.split(new RegExp(`(?<!自|於|起)(?=中華民國${N}年${N}月${N}日[^；]{0,40}?(?:號|公布|發布))`)).filter(Boolean);
    const e = event(first);
    out.push({ n: Number(parts[i]), ...e, more: more.map(event) });
  }
  return out;
}
