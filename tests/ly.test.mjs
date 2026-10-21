// 立法院 data: vote days, votes made small, laws in a vote, budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { voteDate, nameIndex, compactVote, byNewest, lawsIn, personVotes, voteCounts, gazetteUrl, billRow, clipRow, budgetKey, budgetRole, budgetGroups } from '../public/lib/ly.mjs';
import { nameMap } from '../public/lib/refs.mjs';

test('a vote day from loose 表決時間 text and the meeting days', () => {
  assert.equal(voteDate('中華民國113年11月8日 上午10時', ['2024-11-05', '2024-11-08']), '2024-11-08', 'ROC year');
  assert.equal(voteDate('中華民國年3月20日 上午11時52分30秒', ['2026-03-17', '2026-03-20']), '2026-03-20', 'no year: the meeting day');
  assert.equal(voteDate('2025年1月21日 下午', []), '2025-01-21', 'western year, no meeting');
  assert.equal(voteDate('中華民國２０２５年１月２１日', ['2025-01-21']), '2025-01-21', 'full-width digits');
  assert.equal(voteDate('中華民國年12月30日', [], '2025-01-10'), '2024-12-30', 'no year, the 公報 a week later: last year');
  assert.equal(voteDate('', ['2025-05-02', '2025-05-01']), '2025-05-01', 'no text: the first meeting day');
  assert.equal(voteDate('不明', [], '2025-06-01'), '2025-06-01', 'nothing else: the 公報 day');
  assert.equal(voteDate('中華民國年2月30日', []), '', 'no impossible days');
});

test('votes made small: names once, positions in the lists', () => {
  const rows = [{ 表決代碼: '1151901_00002_717', 表決議題: '討論事項第二案　　台灣民眾黨黨團提議逕付二讀', agenda_id: '1151901_00004', 贊成: ['甲', '鄭天財 Sra Kacaw'], 反對: ['乙', '丙'], 棄權: [] }, { 表決代碼: 'x', 投票委員: '[]' }];
  const { names, idx } = nameIndex(['甲', '乙', '鄭天財Sra Kacaw'], rows);
  assert.deepEqual(names, ['甲', '乙', '鄭天財Sra Kacaw', '丙'], 'roster first, then the rest');
  const v = compactVote(rows[0], idx, '2026-03-20', ['X1']);
  assert.deepEqual(v, ['1151901_00002_717', '2026-03-20', '討論事項第二案 台灣民眾黨黨團提議逕付二讀', '1151901_00004', [0, 2], [1, 3], [], ['X1']]);
  assert.deepEqual(compactVote(rows[1], idx).slice(4, 7), [[], [], []], 'missing lists are empty');
  const votes = [v, ['1151901_00002_100', '2026-03-20', '', '', [1], [0], [], []], ['1150101_00001_1', '2026-01-02', '', '', [], [], [0], []]].sort(byNewest);
  assert.deepEqual(votes.map(x => x[0]), ['1151901_00002_717', '1151901_00002_100', '1150101_00001_1']);
  assert.deepEqual(personVotes({ names, votes }, '甲'), [[0, 'y'], [1, 'n'], [2, 'a']]);
  assert.deepEqual(personVotes({ names, votes }, '丙', { from: '2026-02-01' }), [[0, 'n'], [1, '-']], 'not counted before taking office');
  assert.equal(voteCounts(votes).get(0), 3);
  assert.equal(gazetteUrl('1151901_00002_717'), 'https://ppg.ly.gov.tw/ppg/publications/official-gazettes/115/19/01/details');
});

test('the laws a vote names, longest first', () => {
  const names = nameMap([['B0000001', '民法', '法律', '', '', 0, 1, 1], ['A0030320', '國民法官法', '法律', '', '', 0, 1, 1], ['A0000002', '中華民國憲法增修條文', '憲法', '', '', 0, 1, 1], ['A0000001', '中華民國憲法', '憲法', '', '', 0, 1, 1]]);
  assert.deepEqual(lawsIn('國民法官法第五條 民進黨黨團再修正動議', names), ['A0030320'], 'not 民法 inside 國民法官法');
  assert.deepEqual(lawsIn('依「中華民國憲法增修條文」第四條及民法', names), ['A0000002', 'B0000001']);
  assert.deepEqual(lawsIn('討論事項第二案 台灣民眾黨黨團提議逕付二讀', names), []);
});

test('rows for a legislator page', () => {
  assert.deepEqual(billRow({ 議案編號: '1', 議案名稱: '「民法部分條文修正草案」，請審議案。', 提案日期: '2026-01-02', 議案狀態: '交付審查' }), ['1', '2026-01-02', '民法部分條文修正草案', '交付審查']);
  assert.deepEqual(clipRow({ IVOD_ID: 171381, 日期: '2026-10-15', 開始時間: '2026-10-15T12:05:44+08:00', 影片長度: 556, 會議資料: { 種類: '委員會', '委員會代碼:str': ['外交及國防委員會'] } }), ['2026-10-15', '外交及國防委員會', 171381, '12:05:44', 556]);
  assert.deepEqual(clipRow({ IVOD_ID: 1, 會議資料: { 種類: '院會' } }), ['', '院會', 1, '', 0]);
});

test('budget bills grouped by budget, with a stage', () => {
  const main = (id, st, committee, flow = []) => ({ 議案編號: id, 議案名稱: '「115年度中央政府總預算案（含附屬單位預算及綜計表－營業及非營業部分）」案。', 提案單位: '', '提案單位/提案委員': '行政院', 議案狀態: st, 提案日期: '2025-09-30', 最新進度日期: '2026-07-01', 議案流程: [{ 狀態: `排入院會 (交${committee})`, 日期: ['2025-09-30'] }, ...flow] });
  assert.equal(budgetKey('「114年度中央政府總預算案（含附屬單位預算及綜計表－營業及非營業部分）」及「中央政府前瞻基礎建設計畫第5期特別預算案」案。'), '114');
  assert.equal(budgetKey('「114年度中央政府總預算追加預算案」案。'), '114追加');
  assert.equal(budgetKey('「中央政府花蓮馬太鞍溪堰塞湖災後重建特別預算案」案。'), '中央政府花蓮馬太鞍溪堰塞湖災後重建特別預算');
  assert.equal(budgetKey('函送「中央政府總員額運用狀況專案報告」，請查照案。'), '');
  assert.equal(budgetRole({ 議案名稱: '函送「中華民國115年度中央政府總預算案內政部暨所屬單位預算勘誤表」，請查照案。' }), 'errata');
  const rows = [
    main('A', '中央政府總預算流程', '經濟委員會', [{ 狀態: '中央政府總預算流程', 日期: ['2026-04-17'] }]),
    main('B', '審查完畢', '財政委員會'),
    main('C', '交付審查', '內政委員會'),
    { 議案編號: 'R', 議案名稱: '報告彙總完成中華民國115年度中央政府總預算案審查總報告案。', '提案單位/提案委員': '本院財政委員會', 議案狀態: '排入院會(討論事項)', 提案日期: '2026-07-01', 最新進度日期: '2026-07-14', 議案流程: [] }
  ];
  const votes = [['v1', '115年度中央政府總預算案 民進黨黨團提議'], ['v2', '115年度中央政府總預算追加預算案'], ['v3', '公路法']];
  let [g] = budgetGroups(rows, votes);
  assert.equal(g.k, '115');
  assert.equal(g.title, '115年度中央政府總預算案');
  assert.equal(g.stage, '審查總報告');
  assert.deepEqual(g.flow, [['2025-09-30', '排入院會 (交經濟委員會)'], ['2026-07-01', '審查總報告']], 'the master bill’s flow, then the report’s');
  assert.deepEqual(g.votes, ['v1'], 'not the 追加預算 vote');
  assert.equal(g.bills.find(b => b[0] === 'B')[2], '財政委員會');
  [g] = budgetGroups(rows.slice(0, 3));
  assert.deepEqual([g.stage, g.done], ['委員會審查', '1/3']);
  rows[3]['議案狀態'] = '三讀';
  [g] = budgetGroups(rows);
  assert.deepEqual([g.stage, g.done], ['三讀', '2026-07-14']);
  assert.deepEqual(g.flow.at(-1), ['2026-07-14', '三讀']);
  // 第二預備金 is a list of its own: it never moves the year's dates.
  rows.push({ 議案編號: 'P', 議案名稱: '115年度中央政府總預算第二預備金動支數額表', '提案單位/提案委員': '行政院', 議案狀態: '交付審查', 提案日期: '2027-04-01', 最新進度日期: '2027-05-01', 議案流程: [] });
  const gs = budgetGroups(rows);
  assert.deepEqual(gs.map(x => x.k).sort(), ['115', '115預備金']);
  assert.equal(gs.find(x => x.k === '115').last, '2026-07-14');
  assert.equal(gs.find(x => x.k === '115預備金').title, '115年度第二預備金動支數額表');
});
