// 立法院 data: vote days, votes made small, laws in a vote, budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetSteps } from '../public/lib/budget.mjs';
import { voteDate, nameIndex, compactVote, byNewest, lawsIn, personVotes, voteCounts, gazetteUrl, billRow, clipRow, budgetKey, budgetRole, budgetGroups, clipTurns, speakerName, gazetteTurns, alignTurns } from '../public/lib/ly.mjs';
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

test('a vote in plain words: its kind, its mover and the article', async () => {
  const { voteWhat } = await import('../public/lib/ly.mjs');
  const a = voteWhat('國民黨黨團提案第四條 台灣民眾黨黨團再修正動議第五條');
  assert.equal(a.kind, 'amend');
  assert.equal(a.who.zh, '民眾黨黨團');
  assert.equal(a.art.zh, '第5條');
  assert.equal(a.short.zh, '第5條・民眾黨版');
  const r = voteWhat('內政委員會 保留481 中國國民黨黨團提案');
  assert.equal(r.kind, 'reserve');
  assert.match(r.zh, /內政委員會.*第 481 案.*國民黨黨團/);
  assert.equal(voteWhat('討論事項第1案保留第161案 國民黨黨團提案').short.zh, '預算保留第 161 案');
  assert.equal(voteWhat('住宅法部分條文修正草案 全案表決').kind, 'whole');
  assert.equal(voteWhat('報告事項第十案 民進黨黨團提議退回').kind, 'back');
  assert.equal(voteWhat('報告事項第三案 國民黨黨團提議逕付二讀').kind, 'fast');
  const again = voteWhat('重付表決 原住民保留地禁伐補償條例 第六條 審查會與委員陳瑩等提案條文');
  assert.ok(again.redo && again.kind === 'amend' && again.who.zh === '陳瑩等委員');
  assert.equal(voteWhat('主席宣告').zh, '');
});

test('alignment: a member with their party, an independent with the caucus they joined, else the party closest', async () => {
  const { alignment, pctText } = await import('../public/lib/ly.mjs');
  // names: 0 藍1, 1 藍2, 2 藍3, 3 綠1, 4 綠2, 5 綠3, 6 獨 (無黨籍)
  const names = ['藍1', '藍2', '藍3', '綠1', '綠2', '綠3', '獨'];
  const party = new Map([['藍1', '中國國民黨'], ['藍2', '中國國民黨'], ['藍3', '中國國民黨'], ['綠1', '民主進步黨'], ['綠2', '民主進步黨'], ['綠3', '民主進步黨'], ['獨', '無黨籍']]);
  const votes = [
    ['a', '2026-01-01', '', '', [0, 1, 2, 6], [3, 4, 5], [], []],
    ['b', '2026-01-02', '', '', [3, 4, 5], [0, 1, 2, 6], [], []],
    ['c', '2026-01-03', '', '', [0, 1, 2, 3, 4, 5], [6], [], []]
  ];
  const data = { names, votes };
  const mine = [[0, 'y'], [1, 'n'], [2, 'n']];
  const caucus = alignment(data, { n: '獨', party: '無黨籍', caucus: '中國國民黨' }, mine, new Map([...party, ['獨', '中國國民黨']]));
  assert.deepEqual([caucus.how, caucus.bloc, caucus.cast, pctText(caucus)], ['caucus', '中國國民黨', 3, '66.6']);
  const closest = alignment(data, { n: '獨', party: '無黨籍' }, mine, party);
  assert.deepEqual([closest.how, closest.bloc], ['closest', '中國國民黨']);
  const member = alignment(data, { n: '綠1', party: '民主進步黨' }, [[0, 'n'], [1, 'y'], [2, 'y']], party);
  assert.deepEqual([member.how, pctText(member)], ['party', '100']);
});

test('a budget whose report the floor sent to party talks stands at 黨團協商 (113年度追加預算, 立法院 as of 2026-11)', () => {
  const rows = [
    { 議案編號: '301110043590000', 議案名稱: '「113年度中央政府總預算追加預算案」案。', '提案單位/提案委員': '行政院', 議案狀態: '審查完畢', 提案日期: '2024-05-10', 最新進度日期: '2024-12-02', 議案流程: [{ 狀態: '排入院會 (定期舉行會議)', 日期: ['2024-05-10'] }, { 狀態: '交付審查', 日期: ['2024-05-10'] }, { 狀態: '黨團協商', 日期: ['2024-10-17'] }, { 狀態: '委員會審查', 日期: ['2024-11-27'] }, { 狀態: '委員會發文', 日期: ['2024-12-02'] }] },
    { 議案編號: '303110081830000', 議案名稱: '報告審查行政院函請審議「113年度中央政府總預算追加預算案」案。', '提案單位/提案委員': '本院財政委員會', 議案狀態: '排入院會(討論事項)', 提案日期: '2024-12-03', 最新進度日期: '2025-01-21', 議案流程: [{ 狀態: '委員會發文', 日期: ['2024-12-03'] }, { 狀態: '交付協商', 日期: ['2024-12-03'] }, { 狀態: '排入院會(討論事項)', 日期: ['2025-01-17', '2025-01-21'] }, { 狀態: '黨團協商', 日期: ['2025-01-06'] }, { 狀態: '黨團協商', 日期: ['2025-01-16'] }] }
  ];
  const [g] = budgetGroups(rows);
  assert.equal(g.k, '113追加');
  assert.equal(g.stage, '黨團協商', 'not 審查總報告: the floor sent it to talks and never voted');
  assert.equal(g.last, '2025-01-21');
  const r = budgetSteps(g.flow, g.first);
  assert.equal(r.now, 4, 'the road reaches 協商');
  assert.equal(r.days[4], '2025-01-06');
  assert.ok(!g.flow.some(f => /三讀/.test(f[1])));
  // Once passed, later talks (on something else) don't join its steps.
  rows[1]['議案狀態'] = '三讀';
  const [p] = budgetGroups(rows);
  assert.equal(p.stage, '三讀');
  assert.ok(!p.flow.some(f => f[0] === '2025-01-16'));
});

test('ly: votes by name from a sitting’s 議事錄, before the 公報', async () => {
  const { recordVotes, recordPdf } = await import('../public/lib/ly.mjs');
  const text = `本次會議各項記名表決結果名單：
     (1)「討論事項第一案第一百八十五條之三照台灣民眾黨黨團及國民黨
      黨團共同所提再修正動議條文予以通過」部分：
      出席人數：4      贊成人數：3       反對人數：1      棄權人數：0
      贊成者：3 人
          傅崐萁         黃   仁    鄭天財 Sra Kacaw
                            41
           立法院第 11 屆第 6 會期第 5 次會議議事錄
 反對者：1 ⼈
    莊瑞雄
 棄權者：0 人
`;
  const [v] = recordVotes(text, ['傅崐萁', '黃仁', '鄭天財Sra Kacaw', '莊瑞雄']);
  assert.equal(v.k, 1);
  assert.match(v.title, /^討論事項第一案/);
  assert.deepEqual(v.count, [4, 3, 1, 0]);
  assert.deepEqual(v.yes, ['傅崐萁', '黃仁', '鄭天財Sra Kacaw']);
  assert.deepEqual(v.no, ['莊瑞雄']);
  assert.equal(recordPdf(11, 6, 5), 'https://ppg.ly.gov.tw/ppg/SittingYuanInfo/download/agendarec1/02/pdf/11/06/05LCEWC03_110605.pdf');
});

test('a vote read from the 議事錄 says what it was on: its 討論事項\'s laws, by number', async () => {
  const { recordItems, recordItemOf, cnNumber } = await import('../public/lib/ly.mjs');
  const text = `報告事項\n討論事項\n  一、(一)本院委員甲等17人擬具「國民年金法第十五條條文修正草案」、\n委員乙等18人擬具「國民年金法部分條文修正草\n                64\n        立法院第 11 屆第 6 會期第 6 次會議議事錄\n案」,請審議案。\n  決議:協商後再行處理。\n二、本院委員丙等20人擬具「失智症基本法草案」,請審議案。\n  決議:照案通過。\n臨時提案\n一、報告事項等\n本次會議各項記名表決結果名單`;
  const items = recordItems(text);
  assert.equal(items.get(1), '國民年金法');
  assert.equal(items.get(2), '失智症基本法草案', 'a new law whole; the later 一、 (協商) is not item 1 again');
  assert.equal(items.size, 2);
  assert.equal(recordItemOf('討論事項第二案全案付表決予以通過'), 2);
  assert.equal(recordItemOf('民進黨黨團針對議事日程草案之提議不予通過'), 0);
  assert.deepEqual([cnNumber('四'), cnNumber('十'), cnNumber('十二'), cnNumber('二十三'), cnNumber('x')], [4, 10, 12, 23, 0]);
});

test('a web address in a source\'s text is a short tappable link by its site', async () => {
  const { plainHtml } = await import('../public/lib/view.mjs');
  assert.equal(plainHtml('風險。（https://www.mohw.gov.tw/cp-1.html?a=1&b=2）又'), '風險。<a class="lw-url" href="https://www.mohw.gov.tw/cp-1.html?a=1&amp;b=2" target="_blank" rel="noopener" data-out>mohw.gov.tw</a>又');
  assert.equal(plainHtml('見 http://x.gov.tw 與'), '見 <a class="lw-url" href="http://x.gov.tw" target="_blank" rel="noopener" data-out>x.gov.tw</a> 與');
  assert.equal(plainHtml('沒有網址'), '沒有網址');
});

test('a 質詢 clip’s transcript as turns, each its speaker’s (Jay 2026-11-17: line by line was "tedious")', () => {
  const lines = [
    { start: 0, end: 4, text: '請卓院長' },
    { start: 4, end: 6, text: '院長好' },
    { start: 6, end: 9, text: '新竹縣有兩件都市計畫' },
    { start: 9, end: 10, text: '委員好' },
    { start: 10, end: 14, text: '我們一定研究' },
    { start: 14, end: 15, text: '嗯' },
    { start: 15, end: 18, text: '謝謝院長' }
  ];
  const segs = [
    { speaker: 'S2', speaker_name: '徐委員欣瑩', start: 0, end: 8.8 },
    { speaker: 'S6', speaker_name: '卓院長榮泰', start: 9.1, end: 13.9 },
    { speaker: 'S2', speaker_name: '徐委員欣瑩', start: 15, end: 18 }
  ];
  const t = clipTurns(lines, segs);
  assert.deepEqual(t.map(x => [x.who, x.start, x.lines.map(l => l.i)]), [
    ['徐委員欣瑩', 0, [0, 1, 2]],
    // (嗯: nobody's, so the turn before's.)
    ['卓院長榮泰', 9, [3, 4, 5]],
    ['徐委員欣瑩', 15, [6]]
  ]);
  // No speakers known: a turn at every pause, unnamed.
  const plain = clipTurns([{ start: 0, end: 3, text: 'a' }, { start: 3, end: 5, text: 'b' }, { start: 9, end: 10, text: 'c' }]);
  assert.deepEqual(plain.map(x => [x.who, x.lines.length]), [['', 2], ['', 1]]);
  assert.deepEqual(clipTurns([], []), []);
});

test('a speaker’s name as the gazette writes it, read into name and title', () => {
  assert.deepEqual(speakerName('徐委員欣瑩'), { n: '徐欣瑩', role: '委員' });
  assert.deepEqual(speakerName('卓院長榮泰'), { n: '卓榮泰', role: '院長' });
  assert.deepEqual(speakerName('李主任委員應元'), { n: '李應元', role: '主任委員' });
  assert.deepEqual(speakerName('歐陽委員龍'), { n: '歐陽龍', role: '委員' });
  assert.deepEqual(speakerName('王美花'), { n: '王美花', role: '' });
  assert.deepEqual(speakerName(''), { n: '', role: '' });
});

test('the 立法院公報’s own record of a clip’s 質詢: the legislator’s section starting near the clip, as turns (Jay 2026-11-17)', () => {
  // As the API parses a gazette (10/20, 院會): sections, each block opening with its speaker.
  const parsed = {
    persons: ['主席', '黃委員建賓', '卓院長榮泰', '龔部長明鑫', '林委員俊憲', '伍麗華Saidhai Tahovecahe委員'],
    blocks: [
      ['段落：質詢：伍麗華Saidhai Tahovecahe委員：9:2'],
      ['伍麗華Saidhai Tahovecahe委員：（9時2分）謝謝主席。'],
      ['段落：質詢：黃委員建賓：9:18'],
      ['黃委員建賓：（9時18分）謝謝主席。主席，有請行政院長。'],
      ['主席：請卓院長備詢。'],
      ['卓院長榮泰：黃委員好。'],
      ['黃委員建賓：院長早安。', '首先來談談能源的部分。'],
      ['龔部長明鑫：報告委員，讓我……'],
      ['段落：質詢：林委員俊憲：9:49'],
      ['林委員俊憲：（9時49分）謝謝主席。']
    ]
  };
  const t = gazetteTurns(parsed, '黃建賓', '09:17:58');
  assert.deepEqual(t, [
    { who: '黃委員建賓', said: ['謝謝主席。主席，有請行政院長。'] },
    { who: '主席', said: ['請卓院長備詢。'] },
    { who: '卓院長榮泰', said: ['黃委員好。'] },
    { who: '黃委員建賓', said: ['院長早安。', '首先來談談能源的部分。'] },
    { who: '龔部長明鑫', said: ['報告委員，讓我……'] }
  ]);
  // Never another sitting's turn of theirs, nor anyone else's: nothing.
  assert.equal(gazetteTurns(parsed, '黃建賓', '11:30:00'), null);
  assert.equal(gazetteTurns(parsed, '徐欣瑩', '09:17:58'), null);
  assert.equal(gazetteTurns(null, '黃建賓', '09:17:58'), null);
  // An indigenous name, the title after it.
  assert.equal(gazetteTurns(parsed, '伍麗華Saidhai Tahovecahe', '09:02:10').length, 1);
  assert.deepEqual(speakerName('伍麗華Saidhai Tahovecahe委員'), { n: '伍麗華Saidhai Tahovecahe', role: '委員' });
  assert.deepEqual(speakerName('蘇人事長俊榮'), { n: '蘇俊榮', role: '人事長' });
});

test('the gazette’s turns take the AI’s times: each where the AI heard its opening, the short ones between (Jay 2026-11-17)', () => {
  // As on 10/20: the AI mishears some words, the gazette is tidied; the opening still shares most of its pairs.
  const lines = [
    { start: 25, end: 30, text: '好 謝謝主席 主席有請行政院長' },
    { start: 36, end: 38, text: '請選擇' },
    { start: 44, end: 50, text: '院長早安 院長本席今天站在質詢台' },
    { start: 50, end: 60, text: '要從我們國家的能源安全戰略產業布局' },
    { start: 221.84, end: 226.84, text: '那產生的這些問題我們有沒有什麼退場機制' },
    { start: 226.84, end: 228.84, text: '我先跟委員謝謝委員' },
    { start: 228.84, end: 231.84, text: '剛剛委員用了3分鐘的時間' },
    { start: 241.84, end: 243.84, text: '我們都不知道' },
    { start: 243.84, end: 245.84, text: '所以也是經過嚴謹的分析' }
  ];
  const turns = [
    { who: '黃委員建賓', said: ['謝謝主席。主席，有請行政院長。'] },
    { who: '主席', said: ['請卓院長備詢。'] },
    { who: '黃委員建賓', said: ['院長早安。院長，本席今天站在質詢台，要從我們國家的能源安全、戰略產業布局'] },
    { who: '卓院長榮泰', said: ['我先跟委員說明。謝謝委員，剛剛委員用了3分鐘的時間'] },
    { who: '黃委員建賓', said: ['所以……'] },
    { who: '卓院長榮泰', said: ['我們當然知道，所以也是經過很嚴謹的分析。'] }
  ];
  const at = alignTurns(turns, lines);
  assert.equal(at[0], 25);
  assert.equal(at[2], 44);
  // Not the line before (its words fill the stretch), the one the answer starts in.
  assert.equal(at[3], 226.84);
  assert.equal(at[5], 241.84);
  // Too short to tell: between their neighbours, never before the one before.
  assert.ok(at[1] >= 25 && at[1] <= 44, `主席 at ${at[1]}`);
  assert.ok(at[4] >= 226.84 && at[4] <= 241.84, `所以 at ${at[4]}`);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] >= at[i - 1]);
  // No AI lines: no times.
  assert.equal(alignTurns(turns, []), null);
});
