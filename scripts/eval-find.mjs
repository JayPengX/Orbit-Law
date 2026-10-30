// How well 找法's 條文怎麼說 finds the article a lawyer would point to, for
// everyday questions (needs public/data: node scripts/build-data.mjs).
//   node scripts/eval-find.mjs [-v]
// → found (among the cards), first (the first card), MRR. 2026-10-30: 24/45, 11, 0.358 before ideas and BM25; 38/45, 22, 0.604 after.
import fs from 'node:fs';
import { expand, concepts, lawGroups, orderLaws } from '../public/lib/find.mjs';
import { searchText } from '../public/lib/fulltext.mjs';

const D = new URL('../public/data/', import.meta.url).pathname;
const read = f => JSON.parse(fs.readFileSync(D + f));
const rows = [...read('index.json').laws, ...read('orders.json').laws];
const COMMON = ['中華民國憲法', '民法', '中華民國刑法', '民事訴訟法', '刑事訴訟法', '行政程序法', '勞動基準法', '道路交通管理處罰條例', '個人資料保護法', '消費者保護法'];
const N = rows.reduce((n, r) => n + (Number(r[7]) || 0), 0);
const bucket = n => read(`text/${n}.json`);
const GOLD = [
  ['加班費', '勞動基準法', ['24']], ['資遣費', '勞動基準法', ['17']], ['特休', '勞動基準法', ['38']], ['產假', '勞動基準法', ['50']],
  ['押金', ['土地法', '租賃住宅市場發展及管理條例'], ['99', '7']], ['酒駕', ['中華民國刑法', '道路交通管理處罰條例'], ['185-3', '35']],
  ['肇事逃逸', ['中華民國刑法', '道路交通管理處罰條例'], ['185-4', '62']], ['網購退貨', '消費者保護法', ['19']], ['詐騙', '中華民國刑法', ['339']],
  ['遺產', '民法', ['1138', '1147', '1148']], ['離婚', '民法', ['1049', '1052']], ['監護權', '民法', ['1055']], ['育嬰假', '性別平等工作法', ['16']],
  ['誹謗', '中華民國刑法', ['310']], ['公然侮辱', '中華民國刑法', ['309']], ['竊盜', '中華民國刑法', ['320']], ['傷害', '中華民國刑法', ['277']],
  ['定型化契約', '消費者保護法', ['11', '11-1', '12']], ['闖紅燈', '道路交通管理處罰條例', ['53']], ['安全帽', '道路交通管理處罰條例', ['31']],
  ['開除', '勞動基準法', ['11', '12']], ['預告期間', '勞動基準法', ['16']], ['工時', '勞動基準法', ['30']], ['例假', '勞動基準法', ['36']],
  ['職災', '勞動基準法', ['59']], ['拋棄繼承', '民法', ['1174']], ['遺囑', '民法', ['1186', '1187', '1189', '1190']], ['贍養費', '民法', ['1057']],
  ['正當防衛', '中華民國刑法', ['23']], ['緊急避難', '中華民國刑法', ['24']], ['自首', '中華民國刑法', ['62']], ['緩刑', '中華民國刑法', ['74']],
  ['告訴期間', '刑事訴訟法', ['237']], ['消滅時效', '民法', ['125']], ['借錢', '民法', ['474', '478']], ['加班', '勞動基準法', ['32', '24']],
  ['老闆不發薪水', '勞動基準法', ['22', '23']], ['房東', ['民法', '租賃住宅市場發展及管理條例'], ['423', '429', '430']], ['結婚年齡', '民法', ['980']],
  ['扶養義務', '民法', ['1114', '1115']], ['違規停車', '道路交通管理處罰條例', ['56']], ['超速', '道路交通管理處罰條例', ['40', '43']],
  ['偷拍', '中華民國刑法', ['315-1', '319-1']], ['妨害名譽', '中華民國刑法', ['309', '310']], ['車禍', ['道路交通管理處罰條例', '中華民國刑法'], ['62', '284']]
];
// The app's findAll, its article cards: [[law name, article key]].
async function cards(q) {
  const terms = expand(q);
  const union = async ws => [...new Set((await Promise.all(ws.map(w => searchText(w, bucket)))).flat())];
  const whole = await union(terms);
  const ideas = concepts(q, whole.length);
  const hits = ideas.length === 1 && ideas[0].join() === terms.join() ? [whole] : await Promise.all(ideas.map(union));
  const read6 = lawGroups(hits, rows, { common: COMMON }).slice(0, 6).map(g => ({ ...g, file: read(`law/${g.row[0]}.json`) }));
  const out = [];
  orderLaws(read6, ideas, { df: hits.map(h => h.length), N, common: COMMON }).slice(0, 4).forEach((g, i) => g.arts.slice(0, i ? 2 : 4).forEach(a => out.push([g.row[1], a.key])));
  return out;
}
let [found, first, rr] = [0, 0, 0];
for (const [q, names, keys] of GOLD) {
  const c = await cards(q);
  const at = c.findIndex(([n, k]) => [].concat(names).includes(n) && keys.includes(k));
  if (at >= 0) (found++, (rr += 1 / (at + 1)), at === 0 && first++);
  else if (process.argv.includes('-v')) console.log(`${q}: ${c.slice(0, 3).map(x => x.join(' ')).join(' / ')}`);
}
console.log(`found ${found}/${GOLD.length}, first ${first}, MRR ${(rr / GOLD.length).toFixed(3)}`);
