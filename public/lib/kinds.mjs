// Every kind of legal text Law holds, in one table: what it is called, where
// its data lives, how its id reads, what its parts are (條 or 點), and how a
// reader browses it. Every screen asks this table, so a new kind (a council's
// 議決案, a 函釋) plugs in with one entry and its builder, never a screen of
// its own. Pure: the builders and the app both read it.
//
// Ids. A law or a 命令 is MOJ's pcode (N0030001). A rule we read from an
// agency's or a city's own site is `<dir>:<site id>` (agency:MOE:GL002421,
// local:TPE:FL002177); its text is data/<dir>/text/<textFile(site id)>.json.

export const KINDS = {
  // 中央: 全國法規資料庫 (law.moj.gov.tw).
  constitution: { zh: '憲法', en: 'Constitution', group: 'central', unit: '條', source: 'moj' },
  law: { zh: '法律', en: 'Acts', one: '法律', oneEn: 'Act', group: 'central', unit: '條', source: 'moj', hint: '立法院通過、總統公布', hintEn: 'Passed by the Legislative Yuan' },
  order: { zh: '命令', en: 'Regulations', one: '命令', oneEn: 'Regulation', group: 'central', unit: '條', source: 'moj', hint: '施行細則、辦法、規則、標準', hintEn: 'Enforcement rules, regulations, standards' },
  // 中央: the ministries' own 行政規則 (their open data and 主管法規 sites).
  agency: { zh: '行政規則', en: 'Agency rules', one: '行政規則', oneEn: 'Agency rule', group: 'central', unit: '點', source: 'agency', dir: 'agency', hint: '要點、注意事項、作業規定', hintEn: 'Guidelines and directions' },
  // 地方: the cities' and counties' own 法規查詢系統.
  local: { zh: '地方法規', en: 'Local rules', one: '地方法規', oneEn: 'Local rule', group: 'local', unit: '條', source: 'local', dir: 'local', hint: '自治條例、自治規則、委辦規則', hintEn: 'City and county ordinances and rules' }
};
// The order a reader meets them in (法規's 種類 row, a search's sections).
export const KIND_ORDER = ['law', 'order', 'agency', 'local'];

// A city's rules come in four kinds (地方制度法 §25–29): 自治條例 (passed by
// its council), 自治規則 (made by the government alone), 委辦規則 (for the
// central government), and its own 行政規則.
export const LOCAL_SUBKINDS = [
  { id: '自治條例', en: 'Ordinances', hint: '議會通過', hintEn: 'Passed by the council' },
  { id: '自治規則', en: 'Self-gov. rules', hint: '縣市政府訂定', hintEn: 'Made by the government' },
  { id: '委辦規則', en: 'Delegated rules', hint: '辦中央委辦的事', hintEn: 'For central-government work' },
  { id: '行政規則', en: 'Admin. rules', hint: '機關內部的要點', hintEn: 'Internal guidelines' }
];

// The 22 縣市 north to south, the islands last: the city chips' order.
export const CITY_ORDER = ['臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];

// A rule's kind from its name, when its site didn't say (the last deploy's
// rows, a rule carried over): 自治條例 by its name's end; a 組織規程 or a
// 辦法/規則/標準 is 自治規則; a 要點, 須知, 注意事項… a 行政規則.
export function localKindOf(name, said = '') {
  if (LOCAL_SUBKINDS.some(k => k.id === said)) return said;
  const n = String(name || '');
  if (/自治條例$/.test(n)) return '自治條例';
  if (/(要點|須知|注意事項|作業規定|作業程序|作業原則|處理原則|實施計畫|計畫|原則|規範|指引|措施|方案)$/.test(n)) return '行政規則';
  return '自治規則';
}

// The kind's key of an id and (for MOJ's) its index row's level.
export function kindOf(p, level = '') {
  const s = String(p || '');
  if (s.startsWith('local:')) return 'local';
  if (s.startsWith('agency:')) return 'agency';
  if (level === '憲法') return 'constitution';
  if (level === '命令') return 'order';
  return 'law';
}
export const isRule = p => /^(local|agency):/.test(String(p || ''));

// A rule's id in Law (the reader's, a link's, 我的's) from its dir and its site id, and back.
export const ruleP = (dir, id) => `${dir}:${id}`;
export function ruleParts(p) {
  const m = String(p || '').match(/^(local|agency):(.+)$/);
  return m ? { dir: m[1], id: m[2] } : null;
}
// A rule's text file name (data/<dir>/text/<this>.json): the builders' textFile.
export const ruleFile = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_');

// The word for one part: 第 3 條, or a 要點's 第 3 點.
export function partLabel(k, unit = '條', en = false) {
  if (en) return unit === '點' ? `Point ${k}` : `Article ${k}`;
  return `第 ${k} ${unit === '點' ? '點' : '條'}`;
}

// A kind's name for one text, from its id and what its row says (a city's sub-kind).
export function kindLabel(p, { level = '', sub = '', en = false } = {}) {
  const k = kindOf(p, level);
  if (k === 'local' && sub) return en ? `${LOCAL_SUBKINDS.find(x => x.id === sub)?.en || 'Local rule'}` : sub;
  const K = KINDS[k];
  return en ? K.oneEn || K.en : K.one || K.zh;
}
