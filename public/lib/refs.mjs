// The reader's hyperlinks: an article's text cut into plain runs and
// references (第一百八十四條, 前條, 民法第七十一條, 第二項…), each reference
// resolved to a law and article keys. One rule for every screen that links.
//
// A reference: { t: its text, law: pcode or '' (this law), from: key,
// to: key (a range's end, else = from), para: 項 number or 0 }.
// An in-article reference (前項, 第二項 alone) has from '' and only para.

const DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNIT = { 十: 10, 百: 100, 千: 1000 };

// 一百八十四 → 184, 十一 → 11, 一千零五 → 1005, 七四八 → 748; Arabic digits as they are.
export function cnNumber(s) {
  if (/^\d+$/.test(s)) return Number(s);
  // 七四八 (digit by digit, as 釋字 numbers are often written) → 748.
  if (/^[零〇一二三四五六七八九]{2,}$/.test(s)) return Number([...s].map(ch => DIGIT[ch]).join(''));
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
const RE = new RegExp(`(本法|本條例|本通則|本細則|本辦法|本規則|本準則|本標準|同法|同條例)?第(${N})條(?:之(${N}))?(?:至第(${N})條(?:之(${N}))?)?(?:第(${N})項)?|前(${N})?條|前項|(?:本條)?第(${N})項`, 'g');
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
// 本法 is the law being read; in a regulation (施行細則, 辦法…) it is the
// law the regulation carries out (`self`), and 本細則/本辦法 is the regulation.
const SELF = new Set(['本法', '本條例', '本通則']);
const SELF_DOC = new Set(['本細則', '本辦法', '本規則', '本準則', '本標準']);

// names: Map name → pcode (nameMap); keys: this law's article keys in order
// (for 前條); at: the article being read; para: its 項 being read (前項);
// self: in a regulation, its law's pcode (本法).
export function linkText(text, { names = new Map(), maxName = 40, keys = [], at = '', para = 0, self = '' } = {}) {
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
      if (SELF.has(m[1])) law = self;
      else if (SELF_DOC.has(m[1])) law = '';
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

// 簡稱 to show where a name sits beside other things (a chip, a title bar):
// the ones courts, ministries and the news use, never made up. Full → short;
// a law's own regulations follow it (勞動基準法施行細則 → 勞基法施行細則).
const ABBR = [
  ['中華民國憲法增修條文', '憲法增修條文'], ['中華民國憲法', '憲法'], ['中華民國刑法', '刑法'],
  ['民事訴訟法', '民訴法'], ['刑事訴訟法', '刑訴法'], ['行政訴訟法', '行訴法'], ['行政程序法', '行程法'],
  ['憲法訴訟法', '憲訴法'], ['勞動基準法', '勞基法'], ['勞工保險條例', '勞保條例'], ['勞工退休金條例', '勞退條例'],
  ['就業服務法', '就服法'], ['職業安全衛生法', '職安法'], ['性別平等工作法', '性工法'],
  ['性騷擾防治法', '性騷法'], ['家庭暴力防治法', '家暴法'], ['跟蹤騷擾防制法', '跟騷法'], ['性侵害犯罪防治法', '性侵法'],
  ['個人資料保護法', '個資法'], ['證券交易法', '證交法'], ['道路交通管理處罰條例', '道交條例'], ['道路交通安全規則', '道安規則'],
  ['國家賠償法', '國賠法'], ['消費者保護法', '消保法'], ['消費者債務清理條例', '消債條例'], ['強制執行法', '強執法'],
  ['家事事件法', '家事法'], ['少年事件處理法', '少事法'], ['兒童及少年福利與權益保障法', '兒少法'],
  ['兒童及少年性剝削防制條例', '兒少性剝削條例'], ['社會秩序維護法', '社維法'], ['毒品危害防制條例', '毒品條例'],
  ['槍砲彈藥刀械管制條例', '槍砲條例'], ['洗錢防制法', '洗防法'], ['組織犯罪防制條例', '組犯條例'], ['貪污治罪條例', '貪污條例'],
  ['陸海空軍刑法', '軍刑法'], ['全民健康保險法', '健保法'], ['長期照顧服務法', '長照法'], ['食品安全衛生管理法', '食安法'],
  ['公平交易法', '公平法'], ['金融消費者保護法', '金保法'], ['加值型及非加值型營業稅法', '營業稅法'], ['遺產及贈與稅法', '遺贈稅法'],
  ['公職人員選舉罷免法', '選罷法'], ['總統副總統選舉罷免法', '總統選罷法'], ['公民投票法', '公投法'], ['集會遊行法', '集遊法'],
  ['地方制度法', '地制法'], ['原住民族基本法', '原基法'], ['政府資訊公開法', '政資法'], ['立法院職權行使法', '立院職權法'],
  ['臺灣地區與大陸地區人民關係條例', '兩岸條例'], ['入出國及移民法', '移民法'], ['國家安全法', '國安法'],
  ['環境影響評估法', '環評法'], ['空氣污染防制法', '空污法'], ['水污染防治法', '水污法'], ['廢棄物清理法', '廢清法'],
  ['公寓大廈管理條例', '公寓大廈條例'], ['租賃住宅市場發展及管理條例', '租賃條例'],
  ['都市危險及老舊建築物加速重建條例', '危老條例'], ['都市更新條例', '都更條例']
];
for (const [full, short] of ABBR) if (!SHORT_NAMES[short]) SHORT_NAMES[short] = full;
// The name as people say it: 簡稱 where there is one, else the name without 中華民國.
export function abbr(name) {
  const n = String(name || '');
  for (const [full, short] of ABBR) if (n.startsWith(full)) return short + n.slice(full.length);
  return n.replace(/^中華民國/, '');
}

// name → pcode for linkText, from the index (and the short names that land
// on a law in it).
// The law a regulation carries out: the longest law (法律) name its own name
// starts with (勞動基準法施行細則 → 勞動基準法). '' for none.
export function parentLaw(rows, name) {
  let best = null;
  for (const r of rows) if (r[2] !== '命令' && !r[5] && r[1].length < name.length && name.startsWith(r[1]) && (!best || r[1].length > best[1].length)) best = r;
  return best ? best[0] : '';
}

export function nameMap(rows) {
  const names = new Map();
  for (const r of rows) if (!r[5] || !names.has(r[1])) names.set(r[1], r[0]);
  // 總統副總統選舉罷免法（新 84.08.09 制定）, 最低工資法（112.12.27制定）: cited by the bare name.
  for (const r of rows) {
    const base = !r[5] && r[1].match(/^(.+?)（[^）]*制定）$/)?.[1];
    if (base && !names.has(base)) names.set(base, r[0]);
  }
  for (const [short, full] of Object.entries(SHORT_NAMES)) if (names.has(full) && !names.has(short)) names.set(short, names.get(full));
  return names;
}
