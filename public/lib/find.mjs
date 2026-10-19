// 找法: one search for everything. People type what they live through
// (學生會, 押金, 加班費), not a law's name, so a search also tries the words
// laws use for it, and the answer leads with the articles that say it.
import { esc } from './view.mjs';

// Everyday words → the words in the law books (each group searched together).
const SAME = [
  ['學生會', '學生自治組織', '學生自治'],
  ['租屋', '租賃', '承租'],
  ['押金', '押租金', '擔保金'],
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
  ['個資', '個人資料']
];

// The query, then the law books' words for it (none twice).
export function expand(q) {
  const t = String(q || '').trim();
  const out = [t];
  for (const g of SAME) if (g.some(w => t.includes(w))) for (const w of g) for (const x of [t.replace(g.find(v => t.includes(v)), w)]) if (!out.includes(x)) out.push(x);
  return out.filter(Boolean).slice(0, 4);
}

const count = (text, w) => (w ? String(text).split(w).length - 1 : 0);

// A law's hit articles, best first: how often they say the words.
// law: { a: [[kind, key, text]] }; idx: the hit articles' places (articles only).
export function rankArticles(law, idx, terms) {
  const arts = (law?.a || []).filter(a => a[0] === 'A');
  return idx
    .map(i => arts[i])
    .filter(Boolean)
    .map(([, key, text]) => ({ key, text, score: terms.reduce((s, w, j) => s + count(text, w) * (j ? 0.8 : 1), 0) }))
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score);
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
