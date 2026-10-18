// The reader's hyperlinks: an article's text cut into plain runs and
// references (第一百八十四條, 前條, 民法第七十一條, 第二項…), each reference
// resolved to a law and article keys. One rule for every screen that links.
//
// A reference: { t: its text, law: pcode or '' (this law), from: key,
// to: key (a range's end, else = from), para: 項 number or 0 }.
// An in-article reference (前項, 第二項 alone) has from '' and only para.

const DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNIT = { 十: 10, 百: 100, 千: 1000 };

// 一百八十四 → 184, 十一 → 11, 一千零五 → 1005; Arabic digits as they are.
export function cnNumber(s) {
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0, digit = 0, seen = false;
  for (const ch of s) {
    if (ch in DIGIT) {
      digit = DIGIT[ch];
      seen = true;
    } else if (ch in UNIT) {
      total += (seen ? digit : 1) * UNIT[ch];
      digit = 0;
      seen = false;
    } else return NaN;
  }
  return total + digit;
}

const N = '[零〇一二三四五六七八九十百千兩0-9]+';
// 第X條(之Y)?(至第X條(之Y)?)?(第N項)?  |  前條 | 前N條 | 前項 | 第N項
const RE = new RegExp(`(本法|本條例|本通則|同法|同條例)?第(${N})條(?:之(${N}))?(?:至第(${N})條(?:之(${N}))?)?(?:第(${N})項)?|前(${N})?條|前項|(?:本條)?第(${N})項`, 'g');
const key = (a, b) => {
  const n = cnNumber(a);
  if (!(n > 0)) return '';
  if (!b) return String(n);
  const m = cnNumber(b);
  return m > 0 ? `${n}-${m}` : String(n);
};
// The characters a law's name ends with: a name we don't know right before
// 第X條 (a repealed 組織條例) means another law, never this one.
const LAW_END = /(法|律|條例|通則|規程|規則|細則|辦法|綱要|標準|準則|憲章|條文)$/;
const SENTENCE_END = /[。；\n]/;
const SELF = new Set(['本法', '本條例', '本通則']);

// names: Map name → pcode (nameMap); keys: this law's article keys in order
// (for 前條); at: the article being read; para: its 項 being read (前項).
export function linkText(text, { names = new Map(), maxName = 40, keys = [], at = '', para = 0 } = {}) {
  const out = [];
  let last = 0;
  // The law a bare 第X條 belongs to: this one (''), until the sentence names
  // another (its pcode) or one we don't know (null: no links till 。).
  let ctx = '', ctxEnd = 0;
  RE.lastIndex = 0;
  for (let m; (m = RE.exec(text)); ) {
    let start = m.index;
    if (SENTENCE_END.test(text.slice(ctxEnd, start))) ctx = '';
    ctxEnd = RE.lastIndex;
    let ref = null;
    if (m[2]) {
      let law;
      if (SELF.has(m[1])) law = '';
      else if (m[1]) law = ctx;
      else {
        law = undefined;
        // The longest known name ending right here.
        for (let k = Math.min(maxName, start); k >= 2 && law === undefined; k--) {
          const p = names.get(text.slice(start - k, start));
          if (p && start - k >= last) (law = p), (start -= k);
        }
        if (law === undefined) law = LAW_END.test(text.slice(Math.max(0, start - 4), start)) ? null : ctx;
      }
      ctx = law;
      const from = law === null ? '' : key(m[2], m[3]);
      if (from) ref = { t: text.slice(start, RE.lastIndex), law, from, to: m[4] ? key(m[4], m[5]) || from : from, para: m[6] ? cnNumber(m[6]) : 0 };
    } else if (m[0].endsWith('條')) {
      const n = m[7] ? cnNumber(m[7]) : 1;
      const i = keys.indexOf(at);
      if (i > 0 && n > 0) ref = { t: m[0], law: '', from: keys[Math.max(0, i - n)], to: keys[i - 1], para: 0 };
    } else if (m[0] === '前項') {
      if (para > 1) ref = { t: m[0], law: '', from: '', to: '', para: para - 1 };
    } else {
      const n = cnNumber(m[8]);
      if (n > 0) ref = { t: m[0], law: '', from: '', to: '', para: n };
    }
    if (!ref) continue;
    if (start > last) out.push(text.slice(last, start));
    out.push(ref);
    last = RE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// An article's 項: its lines, less the 款 (一、) and 目 (（一）) inside them.
export function paragraphs(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    if (out.length && /^\s*([一二三四五六七八九十]+、|（[一二三四五六七八九十]+）|\([一二三四五六七八九十]+\))/.test(line)) out[out.length - 1].push(line);
    else out.push([line]);
  }
  return out;
}

// Short names people and laws use (the MOJ name is the official one).
export const SHORT_NAMES = {
  刑法: '中華民國刑法',
  憲法: '中華民國憲法',
  憲法增修條文: '中華民國憲法增修條文',
  民訴: '民事訴訟法',
  民訴法: '民事訴訟法',
  刑訴: '刑事訴訟法',
  刑訴法: '刑事訴訟法',
  行訴法: '行政訴訟法',
  行程法: '行政程序法',
  勞基法: '勞動基準法',
  個資法: '個人資料保護法',
  公司法: '公司法',
  證交法: '證券交易法',
  道交條例: '道路交通管理處罰條例',
  國賠法: '國家賠償法',
  消保法: '消費者保護法',
  著作權法: '著作權法',
  強執法: '強制執行法',
  家事法: '家事事件法',
  所得稅法: '所得稅法',
  兒少法: '兒童及少年福利與權益保障法',
  性平法: '性別平等工作法',
  社維法: '社會秩序維護法',
  毒品條例: '毒品危害防制條例',
  槍砲條例: '槍砲彈藥刀械管制條例',
  洗錢法: '洗錢防制法',
  政府採購法: '政府採購法',
  採購法: '政府採購法',
  大法官法: '憲法訴訟法',
  憲訴法: '憲法訴訟法'
};

// name → pcode for linkText, from the index (and the short names that land
// on a law in it).
export function nameMap(rows) {
  const names = new Map();
  for (const r of rows) if (!r[5] || !names.has(r[1])) names.set(r[1], r[0]);
  for (const [short, full] of Object.entries(SHORT_NAMES)) if (names.has(full) && !names.has(short)) names.set(short, names.get(full));
  return names;
}
