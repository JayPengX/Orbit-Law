// 找法: one search for everything. People type what they live through
// (學生會, 押金, 加班費), not a law's name, so a search also tries the words
// laws use for it, and the answer leads with the articles that say it.
import { esc } from './view.mjs';
import { SHORT_NAMES } from './refs.mjs';

// Everyday words → the words in the law books (each group searched together).
const SAME = [
  ['學生會', '學生自治組織', '學生自治'],
  ['租屋', '租賃', '承租'],
  ['長照', '長期照顧'],
  ['押金', '押租金'],
  ['房東', '出租人'],
  ['房客', '承租人'],
  ['加班', '延長工作時間'],
  ['加班費', '延長工作時間之工資'],
  ['老闆', '雇主'],
  ['員工', '勞工'],
  ['最低工資', '基本工資'],
  ['產假', '分娩'],
  ['育嬰假', '育嬰留職停薪'],
  ['勞保', '勞工保險'],
  ['健保', '全民健康保險'],
  ['食安', '食品安全'],
  ['車禍', '交通事故'],
  ['酒駕', '酒精濃度'],
  ['網購', '通訊交易'],
  ['退貨', '解除契約'],
  ['霸凌', '霸凌'],
  ['離職', '終止契約'],
  ['資遣', '資遣費'],
  ['罰單', '罰鍰'],
  ['肇事逃逸', '逃逸'],
  ['詐騙', '詐欺'],
  ['遺產', '繼承'],
  ['小孩', '子女'],
  ['監護權', '親權'],
  ['個資', '個人資料'],
  ['特休', '特別休假'],
  ['工時', '工作時間'],
  ['職災', '職業災害'],
  ['薪水', '工資'],
  ['薪資', '工資'],
  ['開除', '終止勞動契約', '解僱'],
  ['正當防衛', '現在不法之侵害'],
  ['緊急避難', '緊急危難'],
  ['借錢', '消費借貸', '借貸'],
  ['結婚年齡', '不得結婚'],
  ['偷拍', '竊錄', '攝錄'],
  ['超速', '最高時速'],
  ['告訴期間', '告訴乃論'],
  ['消滅時效', '不行使而消滅'],
  ['妨害名譽', '公然侮辱', '誹謗'],
  ['誹謗', '散布於眾'],
  ['傷害', '傷害人之身體'],
  ['詐騙', '詐術'],
  ['遺產', '遺產繼承人'],
  ['監護權', '權利義務之行使或負擔'],
  ['肇事', '交通事故'],
  ['闖紅燈', '紅燈'],
  ['安全帽', '安全帽'],
  ['違停', '停車'],
  ['醉', '酒精濃度'],
  ['房租', '租金'],
  ['打人', '傷害人之身體'],
  ['偷東西', '竊取'],
  ['小偷', '竊取'],
  ['欠錢', '債務'],
  ['被騙', '詐術'],
  ['分手', '離婚'],
  ['小孩', '未成年子女'],
  ['監視器', '攝錄'],
  ['工作', '勞工'],
  ['上班', '工作時間'],
  ['裁員', '資遣'],
  ['罰錢', '罰鍰']
];
// Words that ask, not say (怎麼辦, 可以嗎): left out of what's searched.
const FILLER = /怎麼辦|怎麼|可以嗎|可以|是否|多少|幾天|幾歲|如何|什麼|嗎|呢|吧|的|了|被|我|要|會|不|沒有|有/g;

// The query, then the law books' words for it (none twice).
// Also: 台 and 臺 both ways (臺北 is 台北), and a law's short name for its
// full one (勞基法 → 勞動基準法).
export function expand(q) {
  const t = String(q || '').trim();
  const out = [t];
  const add = x => x && !out.includes(x) && out.push(x);
  for (const g of SAME) if (g.some(w => t.includes(w))) for (const w of g) add(t.replace(g.find(v => t.includes(v)), w));
  for (const [short, full] of Object.entries(SHORT_NAMES)) if (short !== full && t.includes(short)) add(t.replace(short, full));
  for (const x of [...out]) (add(x.replaceAll('台', '臺')), add(x.replaceAll('臺', '台')));
  if (/^ncc$/i.test(t)) add('國家通訊傳播委員會');
  return out.filter(Boolean).slice(0, 6);
}

const count = (text, w) => (w ? String(text).split(w).length - 1 : 0);

// What a question is about, as separate ideas, each with the law books'
// words for it: 網購退貨 is 網購 (通訊交易) and 退貨 (解除契約), found in
// one article though never side by side. [[word, its law words…], …]; a
// question with no everyday word in it, or one the laws say as it is
// (`whole`: how many articles hold it whole; 遺產稅), is one idea (expand's words).
export function concepts(q, whole = 0) {
  const t = String(q || '').trim();
  if (whole >= 3) return [expand(t)];
  const groups = SAME.flatMap(g => g.map(w => [w, g])).sort((a, b) => b[0].length - a[0].length);
  let rest = t;
  const out = [];
  for (const [w, g] of groups)
    if (rest.includes(w)) {
      rest = rest.replace(w, ' ');
      const ws = [w, ...g.filter(x => x !== w)];
      const same = out.find(c => c.includes(w));
      if (!same) out.push(ws);
    }
  if (!out.length) return [expand(t)];
  for (const left of rest.replace(FILLER, ' ').split(/\s+/)) if ([...left].length >= 2) out.push(expand(left));
  return out;
}

// How well an article says the ideas (BM25: each idea's count, eased off
// and weighed against the article's length, rarer ideas counting more);
// an article in a chapter named for an idea (第九章 緩刑) counts more.
// `df`: how many articles hold each idea; `N`: articles in all.
const K1 = 1.2;
const AVG_LEN = 120;
export function articleScore(text, chapter, ideas, { df = [], N = 100_000 } = {}) {
  const len = [...String(text)].length;
  let score = 0;
  let has = 0;
  ideas.forEach((ws, i) => {
    const tf = Math.max(0, ...ws.map((w, j) => count(text, w) * (j ? 0.9 : 1)));
    const idf = Math.log(1 + N / Math.max(1, df[i] || 1));
    if (tf) has++;
    score += (idf * (tf * (K1 + 1))) / (tf + K1 * (0.25 + (0.75 * len) / AVG_LEN));
    if (chapter && ws.some(w => chapter.includes(w))) score += idf;
  });
  return { score, has };
}

// A law's hit articles, best first: those with more of the ideas, then the
// best said. law: { a: [[kind, key, text]] }; idx: the hit articles' places
// (articles only); `ideas`: concepts() (or plain words, one idea each).
export function rankArticles(law, idx, ideas, stats = {}) {
  const list = ideas.map(x => [].concat(x));
  const arts = [];
  let chapter = '';
  for (const a of law?.a || []) {
    if (a[0] === 'C') chapter = String(a[2] || a[1] || '');
    else if (a[0] === 'A') arts.push([a[1], a[2], chapter]);
  }
  return idx
    .map(i => arts[i])
    .filter(Boolean)
    .map(([key, text, ch]) => ({ key, text, ...articleScore(text, ch, list, stats) }))
    .filter(a => a.score > 0)
    .sort((a, b) => b.has - a.has || b.score - a.score);
}

// The part of an article around the first word found, the words marked.
export function snippet(text, terms, max = 80) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const hit = terms.map(w => [w, t.indexOf(w)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0];
  const at = hit ? hit[1] : 0;
  const start = Math.max(0, Math.min(at - 20, t.length - max));
  let s = t.slice(start, start + max);
  const pre = start > 0 ? '…' : '';
  const post = start + max < t.length ? '…' : '';
  let html = esc(s);
  for (const w of [...terms].sort((a, b) => b.length - a.length)) if (w) html = html.split(esc(w)).join(`<mark>${esc(w)}</mark>`);
  return pre + html.replace(/<mark>([^<]*)<mark>([^<]*)<\/mark>([^<]*)<\/mark>/g, '<mark>$1$2$3</mark>') + post;
}

// What people usually come to a topic to find: each one runs a search.
export const QUICK = {
  '': ['學生會', '押金', '加班費', '車禍', '網購退貨', '遺產'],
  labor: ['加班費', '資遣費', '特休', '產假', '最低工資', '勞保'],
  health: ['健保', '病歷', '醫療糾紛', '藥品', '傳染病'],
  welfare: ['長照', '身心障礙', '低收入戶', '兒童', '家暴'],
  edu: ['學生會', '霸凌', '學費', '教師', '學生申訴'],
  econ: ['網購退貨', '公司', '商標', '消費者', '定型化契約'],
  money: ['所得稅', '房屋稅', '遺產稅', '信用卡', '保險'],
  traffic: ['酒駕', '罰單', '車禍', '肇事逃逸', '駕照'],
  env: ['噪音', '空氣污染', '垃圾', '再生能源'],
  farm: ['農地', '食品', '動物保護'],
  justice: ['詐騙', '遺產', '離婚', '監護權', '個資'],
  home: ['租屋', '押金', '房東', '戶籍', '都市更新'],
  defense: ['兵役', '替代役', '後備軍人'],
  tech: ['個資', '網路', '電信'],
  gov: ['公務員', '選舉', '公投', '請願']
};
// The quick searches' names in English (the search itself stays in Chinese: the laws are).
export const QUICK_EN = {
  學生會: 'Student council', 押金: 'Deposits', 加班費: 'Overtime pay', 車禍: 'Car accidents', 網購退貨: 'Online returns', 遺產: 'Inheritance',
  資遣費: 'Severance pay', 特休: 'Annual leave', 產假: 'Maternity leave', 最低工資: 'Minimum wage', 勞保: 'Labour insurance',
  健保: 'Health insurance', 病歷: 'Medical records', 醫療糾紛: 'Medical disputes', 藥品: 'Medicines', 傳染病: 'Infectious diseases',
  長照: 'Long-term care', 身心障礙: 'Disability', 低收入戶: 'Low-income households', 兒童: 'Children', 家暴: 'Domestic violence',
  霸凌: 'Bullying', 學費: 'Tuition', 教師: 'Teachers', 學生申訴: 'Student appeals',
  公司: 'Companies', 商標: 'Trademarks', 消費者: 'Consumers', 定型化契約: 'Standard contracts',
  所得稅: 'Income tax', 房屋稅: 'House tax', 遺產稅: 'Estate tax', 信用卡: 'Credit cards', 保險: 'Insurance',
  酒駕: 'Drunk driving', 罰單: 'Traffic tickets', 肇事逃逸: 'Hit and run', 駕照: 'Driving licences',
  噪音: 'Noise', 空氣污染: 'Air pollution', 垃圾: 'Waste', 再生能源: 'Renewable energy',
  農地: 'Farmland', 食品: 'Food', 動物保護: 'Animal welfare',
  詐騙: 'Fraud', 離婚: 'Divorce', 監護權: 'Custody', 個資: 'Personal data',
  租屋: 'Renting', 房東: 'Landlords', 戶籍: 'Household registration', 都市更新: 'Urban renewal',
  兵役: 'Military service', 替代役: 'Alternative service', 後備軍人: 'Reservists',
  網路: 'Internet', 電信: 'Telecoms',
  公務員: 'Civil servants', 選舉: 'Elections', 公投: 'Referendums', 請願: 'Petitions'
};

// The articles found for each idea (search ids: law place × PER_LAW +
// article), by law: [{ law, row, arts: [{ i, has }], has, hits }], the laws
// with an article holding the most ideas first, then laws before their
// 子法, everyday laws, most hits. `rows`: the index's rows in order.
export function lawGroups(hits, rows, { common = [], per = 2048 } = {}) {
  const by = new Map();
  hits.forEach(ids => {
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      by.set(id, (by.get(id) || 0) + 1);
    }
  });
  const laws = new Map();
  for (const [id, has] of by) {
    const li = Math.floor(id / per);
    if (!rows[li]) continue;
    if (!laws.has(li)) laws.set(li, { law: li, row: rows[li], arts: [], has: 0, hits: 0 });
    const g = laws.get(li);
    g.arts.push({ i: id % per, has });
    g.has = Math.max(g.has, has);
    g.hits++;
  }
  const everyday = r => (common.includes(r[1]) ? 0 : 1);
  return [...laws.values()].sort((a, b) => b.has - a.has || (a.row[2] === '命令') - (b.row[2] === '命令') || everyday(a.row) - everyday(b.row) || b.hits - a.hits);
}

// The candidate laws, their files read, in the order to show: the one whose
// best article says it best first (an everyday law, and a law over a 子法, a
// little ahead), each with its articles ranked: [{ ...group, arts: [article] }].
export const W = { has: 3, common: 1.5, order: 0.7, hits: 0.3 };
export function orderLaws(groups, ideas, { df, N, common = [] } = {}) {
  return groups
    .map(g => {
      const arts = rankArticles(g.file, g.arts.map(a => a.i), ideas, { df, N });
      const best = arts[0];
      const times = (common.includes(g.row[1]) ? W.common : 1) * (g.row[2] === '命令' ? W.order : 1);
      return { ...g, arts, rank: best ? (best.has * W.has + best.score) * times + W.hits * Math.log(1 + g.hits) : -1 };
    })
    .filter(g => g.arts.length)
    .sort((a, b) => b.rank - a.rank);
}
