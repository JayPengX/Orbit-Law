// 為你推薦 (首頁): the laws worth reading next for this reader, ranked by the
// family's one engine (the kit's orbit.mjs rank, with feedback.mjs's lift):
//   - what a law is used for: how often rulings cite it (a law people
//     need, not a dead letter), and the everyday ten for a start;
//   - the reader's subjects: the topics of what they read lately and keep
//     (☆), the latest counting most;
//   - what they open and pass over among these picks, and open anywhere in
//     the app (feedback.mjs `lift`, by the law and its topic): a law passed
//     over day after day makes way for the next, a topic opened often rises.
// Never one read lately; a topic's third pick only when it's far ahead.
// Rows are index.json's: [code, name, kind, MOJ category, date, abolished, …].
import { rank } from '#kit/orbit.mjs';

export const COMMON = ['中華民國憲法', '民法', '中華民國刑法', '民事訴訟法', '刑事訴訟法', '行政程序法', '勞動基準法', '道路交通管理處罰條例', '個人資料保護法', '消費者保護法'];

export const lawItem = (row, topicOf) => ({ id: `law:${row[0]}`, keys: [`topic:${topicOf(row)}`] });

// → the rows to show, best first.
export function forYou({ rows = [], recent = [], starred = [], rulings = {}, topicOf, lift = null, n = 8, now = Date.now() }) {
  const seen = new Set(recent.map(r => r[0]));
  // The reader's subjects: the latest read counts most, a kept law more.
  const aff = {};
  const add = (row, w) => {
    const k = `topic:${topicOf(row)}`;
    aff[k] = (aff[k] || 0) + w;
  };
  recent.forEach((r, i) => add(r, 1 / (1 + 0.35 * i)));
  starred.forEach(r => add(r, 1.5));
  const most = Math.log1p(Math.max(1, ...Object.values(rulings)));
  const items = rows
    .filter(r => r[2] !== '命令' && !r[5] && !seen.has(r[0]))
    .map(r => ({
      ...lawItem(r, topicOf),
      row: r,
      quality: 0.15 + (0.6 * Math.log1p(rulings[r[0]] || 0)) / most + (COMMON.includes(r[1]) ? 0.25 : 0),
      group: topicOf(r)
    }));
  return rank(items, { aff, lift, n, diversity: 0.5, explore: 0.04, now }).map(x => x.row);
}
