// 地方議會 (public/lib/council.mjs): what each council's own words mean, kept small.
import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeOf, compactCouncilBill, newestBills, repsByPlace, compactRep, sessionOn, compactSitting, compactCouncilor, theirBills, whoOf, councilState, hccRows, hszRows, hlcRows, chaCounts, chaListRows, chaDetail, chaSessions, chaSession, transcriptBills, mccList, mccFiles, mccBills, gapOf, speechesOf } from '../public/lib/council.mjs';

test('council: an outcome in a word, whichever way a council writes it', () => {
  assert.equal(outcomeOf('照審查意見通過。'), 'yes');
  assert.equal(outcomeOf('原案通過'), 'yes');
  assert.equal(outcomeOf('不予通過'), 'no');
  assert.equal(outcomeOf('送縣府研究辦理'), 'sent');
  assert.equal(outcomeOf('存查'), 'noted');
  assert.equal(outcomeOf('保留'), 'held');
  // 高雄's 議決 often holds only its date: the 審查意見 speaks then.
  assert.equal(outcomeOf('決議日期：2026-10-01', '同意照案通過'), 'yes');
  assert.equal(outcomeOf('決議大會屆次：第4屆第5次定期大會\n決議日期：2025-05-29\n送請市政府研究辦理。', '審查日期：2025-05-21\n決議/交付日期：\n送請市政府研究辦理。'), 'sent');
  assert.equal(outcomeOf('', ''), '');
});

test('council: a bill kept small names its filer and its committee', () => {
  const b = compactCouncilBill({ 代碼: 'x1', 案號: '第12號', 類別: '交通委員會-交通', 提案人: '王小明、李大華、陳一', 案由: '<一>建請市府增設停車場', 議決: '照案通過', 會議代碼: 's9' });
  assert.deepEqual(b, { id: 'x1', t: '建請市府增設停車場', by: '王小明等3人', gov: false, cat: '交通', out: 'yes', s: 's9', no: '第12號' });
  assert.equal(whoOf('', '臺北市政府'), '臺北市政府');
  const gov = compactCouncilBill({ 代碼: 'x2', 提案單位: '臺北市政府', 案由: '檢送預算' });
  assert.equal(gov.gov, true);
});

test('council: newest bills are the latest session’s, higher 案號 first', () => {
  const sessions = [{ 代碼: 'a', 開始日期: '2026-03-01' }, { 代碼: 'b', 開始日期: '2026-09-01' }];
  const rows = [{ id: 1, s: 'a', no: '5' }, { id: 2, s: 'b', no: '2' }, { id: 3, s: 'b', no: '10' }, { id: 4, s: 'a', no: '9' }];
  assert.deepEqual(newestBills(rows, sessions, 3).map(b => b.id), [3, 2, 4]);
});

test('council: the session a day falls in, the next one, the last one', () => {
  const s = [{ 代碼: 1, 會期名稱: '第7次定期會', 開始日期: '2026-08-20', 結束日期: '2026-10-02' }, { 代碼: 2, 會期名稱: '第8次定期會', 開始日期: '2026-11-20', 結束日期: '2026-12-31' }];
  assert.equal(sessionOn(s, '2026-09-01').on.id, 1);
  const off = sessionOn(s, '2026-11-10');
  assert.equal(off.on, null);
  assert.equal(off.next.id, 2);
  assert.equal(off.last.id, 1);
  assert.equal(councilState({ on: null, next: off.next, last: off.last }, '2026-11-10').live, false);
});

test('council: no sitting on a day off; only councillors in office', () => {
  assert.equal(compactSitting({ 日期: '2026-10-10', 場次類別: '停會' }), null);
  assert.equal(compactSitting({ 日期: '2026-10-11', 議程說明: '例假日' }), null);
  assert.equal(compactSitting({ 日期: '2026-10-12', 場次類別: '大會', 議程說明: '市政總質詢' }).what, '市政總質詢');
  assert.equal(compactCouncilor({ 姓名: '甲', 現況: '已卸任' }), null);
  const p = compactCouncilor({ 姓名: '乙', 現況: '在任', 黨籍: '無', 參選政黨: '無黨籍及未經政黨推薦', 選區別: '臺北市第1選舉區', 職稱: '議員' });
  assert.equal(p.party, '無黨籍');
  assert.equal(p.area, '第1選舉區');
  assert.equal(p.title, '');
});

test('council: a councillor’s bills are only those that list them', () => {
  const rows = [{ 提案人: '王小明、李大華' }, { 提案人: '王小明華' }, { 提案人: '' }];
  assert.equal(theirBills(rows, '王小明').length, 1);
});

test('council: township representatives by county, then township, then district', () => {
  const reps = [
    { 姓名: '丙', 縣市: '宜蘭縣', 議會代碼: 'ila', 鄉鎮市區: '羅東鎮', 鄉鎮市區代碼: '10002020', 選區別: '第2選舉區', 參選職位: '鄉鎮市民代表', 其他欄位: { 推薦之政黨: '中國國民黨' } },
    { 姓名: '甲', 縣市: '宜蘭縣', 議會代碼: 'ila', 鄉鎮市區: '宜蘭市', 鄉鎮市區代碼: '10002010', 選區別: '第1選舉區', 參選職位: '鄉鎮市民代表', 其他欄位: {} },
    { 姓名: '乙', 縣市: '宜蘭縣', 議會代碼: 'ila', 鄉鎮市區: '羅東鎮', 鄉鎮市區代碼: '10002020', 選區別: '第1選舉區', 參選職位: '鄉鎮市民代表', 其他欄位: {} }
  ].map(compactRep);
  const [c] = repsByPlace(reps);
  assert.equal(c.city, '宜蘭縣');
  assert.deepEqual(c.towns.map(t => t.town), ['宜蘭市', '羅東鎮']);
  assert.deepEqual(c.towns[1].reps, [['乙', '無黨籍', '第1選舉區'], ['丙', '中國國民黨', '第2選舉區']]);
});

test('council: 新竹縣議會’s own list of 議員提案 read into the API’s shape', () => {
  const html = `<ul class="schedule-detail-container__box sch-det--color flex">
    <li class="schedule-det-detail schedule-det-detail--width sch-det01">
      2026.11.10</li>
    <li class="schedule-det-detail schedule-det-detail--width sch-det02">交通類</li>
    <li class="schedule-det-detail sch-det03">建請於台鐵北湖站附近評估劃設汽機車停車位之可行性。</li>
    <li class="schedule-det-detail schedule-det-detail--width sch-det04">
      羅美文</li>
    <li class="schedule-det-detail schedule-det-detail--width sch-det05">
      何智達、陳栢誠</li>
    <li class="schedule-det-detail schedule-det-detail--width sch-det06"><a
        href="proposal-detail?article=5988" title="內容">內容</a> </li>
  </ul><ul class="schedule-detail-container__box sch-det--color flex"><li class="schedule-det-detail sch-det01">日期</li></ul>`;
  const [r, ...rest] = hccRows(html);
  assert.equal(rest.length, 0, 'the header row is no bill');
  assert.deepEqual([r['代碼'], r['日期'], r['類別'], r['提案人'], r['主提案人']], ['hsq-p5988', '2026-11-10', '交通類', '羅美文、何智達、陳栢誠', '羅美文']);
  const b = compactCouncilBill(r);
  assert.deepEqual([b.by, b.d, b.out], ['羅美文等3人', '2026-11-10', '']);
  assert.equal(theirBills([r], '陳栢誠').length, 1, 'a co-signer counts');
  assert.deepEqual(newestBills([{ id: 1, d: '2026-01-02' }, { id: 2, d: '2026-03-01' }], []).map(x => x.id), [2, 1], 'no session: the later day first');
});

test('council: a gap said plainly; speeches a meeting a row', () => {
  assert.match(gapOf('原始文件是掃描影像檔，需要文字辨識（OCR）技術才能讀取')[0], /掃描/);
  assert.match(gapOf(null)[0], /還沒公開/);
  const said = speechesOf([
    { 會議代碼: 'm1', 日期: '2026-05-04', 身分類別: '議員', 順序: 2, 發言內容: '好。' },
    { 會議代碼: 'm1', 日期: '2026-05-04', 身分類別: '議員', 順序: 1, 發言內容: '現在第1題要問交通處，大型重機停車格的議題。', 來源網址: 'https://x/a.pdf' },
    { 會議代碼: 'm1', 日期: '2026-05-04', 身分類別: '主席', 職稱: '議長', 順序: 0, 發言內容: '請議員質詢。' },
    { 會議代碼: 'm0', 日期: '2026-03-01', 身分類別: '其他', 發言內容: '出席議員名單' }
  ]);
  assert.equal(said.length, 1, 'only what councillors said');
  assert.deepEqual([said[0].d, said[0].n, said[0].url], ['2026-05-04', 2, 'https://x/a.pdf'], 'the chair’s words aren’t theirs');
  assert.match(said[0].t, /大型重機/);
});

test('council: 花蓮縣議會’s search read whole, its decision kept', () => {
  const card = (no, by, out) => `<table width="90%" border="1"><tr bgcolor="#eeeeee"><td width="80">會 別</td><td>第 20 屆 第 23 次 臨時大會</td></tr>
    <tr><td>決議日期</td><td>2026-09-04</td></tr><tr><td>類別案號</td><td>保安 案號${no}</td></tr><tr><td>議案分類</td><td>議員提案 / 一般提案</td></tr>
    <tr><td>提案人</td><td>${by}</td></tr><tr><td>連署人</td><td>韓林梅、林正福</td></tr><tr><td>案 由</td><td>針對遠山區設置地方救災設施。</td></tr>
    <tr><td>審查意見</td><td></td></tr><tr><td>大會決議</td><td>${out}</td></tr></table>`;
  const rows = hlcRows(card(3, '鍾素政', '照案通過。') + card(3, '鍾素政', '照案通過。') + card(4, '傅國淵', '保留'), 2);
  assert.equal(rows.length, 2, 'the same bill listed twice is one');
  const [a, b] = rows.map(compactCouncilBill);
  assert.deepEqual([a.by, a.cat, a.no, a.out, a.d], ['鍾素政等3人', '保安', '3', 'yes', '2026-09-04']);
  assert.equal(b.out, 'held');
  assert.equal(rows[0]['會期名稱'], '第20屆第23次臨時大會');
  assert.equal(theirBills(rows, '林正福').length, 2);
  // A session the API doesn't list yet sorts by the bill's own day.
  assert.deepEqual(newestBills([{ id: 1, s: 'old', d: '2026-03-01' }, { id: 2, s: '', d: '2026-09-04' }], [{ 代碼: 'old', 開始日期: '2026-02-20' }]).map(x => x.id), [2, 1]);
});

test('council: 彰化縣議會’s sessions, counts, lists and a bill’s page', () => {
  assert.equal(chaSession('第二十屆  第21、22、23、24次 臨時會'), '第20屆第21、22、23、24次臨時會');
  const [s] = chaSessions(`<li>
    <span data-th="會　　期：" style="width:30%;"><a href="list.aspx?Parser=99,7,167,,,,,42">第二十屆  第8次 定期會</a></span>
    <span data-th="開始日期：">2026年09月21日</span><span data-th="結束日期：">2026年11月04日</span></li>
    <li><span data-th="會　　期："><a>第二十屆 第19次 程序委員會</a></span><span data-th="開始日期：">2026年09月14日</span></li>`);
  assert.deepEqual(s, { 代碼: 'cha-20-r8', 會期名稱: '第20屆第8次定期會', 會期類別: '定期會', 開始日期: '2026-09-21', 結束日期: '2026-11-04' });
  const counts = chaCounts(`<li>
    <span data-th="會期：" class="list_date w40 left"> 第7次 定期會</span>
    <span data-th="議員提案數："><a href="List2.aspx?Parser=99,7,47,,,,,,,,,15,,129,,,,,,2">17</a></span><span data-th="議長提案數：">0</span></li>`);
  assert.deepEqual(counts, [{ name: '第7次 定期會', iid: '15', tid: '129', kind: 2, n: 17 }]);
  const [r] = chaListRows(`<strong class="fsize_20">彰化縣議會第二十屆  第7次 定期會 &nbsp; 議員提案</strong>
    <li><span data-th="案號：" class="list_date w10">第1號</span><span data-th="委員會別：" class="list_date w10"></span>
    <span data-th="案由：" class="list_date w30">建請縣府體恤本縣長者...</span><span data-th="大會決議：" class="list_date w20">送縣府研究辦理。</span>
    <span data-th="提案人：" class="list_date w10">李俊諭 </span><span data-th="詳情："><a href="Details.aspx?Parser=99,7,47,,,,3272,,,,,15,,129,,,,,,2">瀏　覽</a></span></li>`);
  assert.deepEqual([r['代碼'], r['會期名稱'], r['提案人'], compactCouncilBill(r).out], ['cha-p3272', '第20屆第7次定期會', '李俊諭', 'sent']);
  const f = chaDetail(`<li><span class="tabulation_tt w20"><label for="signatureP">連署人</label></span>
    <span class="tabulation_word w80">賴清美、藍駿宇
<br />楊子賢
<br /> </span></li><li><span class="tabulation_tt w20">類別</span><span class="tabulation_word w80">衛生</span></li>`);
  assert.deepEqual([f['連署人'], f['類別']], ['賴清美、藍駿宇、楊子賢', '衛生']);
});

test('council: bills drawn out of the minutes, how each went from the minutes or the chair', () => {
  const row = (n, kind, t, extra = {}) => ({ 會議代碼: 'm1', 日期: '2025-12-23', 會期代碼: 'kin-8-r6', 順序: n, 身分類別: kind, 發言內容: t, ...extra });
  const bills = transcriptBills('kin', [
    row(3, '程序文字', '一、獎勵導正。審查意見:送縣府研辦。大會決議:送縣府研辦。'),
    row(2, '其他', '提案人:許玉昭連署人:許大鴻、吳佩雯案由:建請文化局精進「四季文化走讀」等推廣活動。'),
    row(4, '其他', '第7案案由：有關市府檢送原住民族行政局115年度預算附帶決議之書面資料，報請本會備查。'),
    row(5, '主席', '報告結果：知悉。繼續，來。'),
    row(6, '其他', '第7案案由：有關市府檢送原住民族行政局115年度預算附帶決議之書面資料，報請本會備查。'),
    row(7, '主席', '該案由誰說明？')
  ]);
  assert.equal(bills.length, 2, 'the same bill read twice is one; the chair’s words are no bill');
  const [a, b] = bills;
  assert.deepEqual([a['主提案人'], a['連署人'], a['議決'], compactCouncilBill(a).out], ['許玉昭', '許大鴻、吳佩雯', '送縣府研辦。', 'sent']);
  assert.deepEqual([b['案號'], b['議決'], compactCouncilBill(b).out], ['7', '知悉。', 'noted']);
  // A meeting outside every listed session keeps its day alone.
  const [c] = transcriptBills('lie', [{ ...row(1, '其他', '案由:建請爭取經費推動景觀平台。'), 會期代碼: null, 日期: '2026-06-11' }], [{ 代碼: 'lie-8-r6', 開始日期: '2025-11-27', 結束日期: '2025-11-27' }]);
  assert.deepEqual([c['會議代碼'], c['日期']], ['', '2026-06-11']);
});

test('council: 苗栗縣議會’s meeting records read into bills', () => {
  const [at] = mccList(`<td><span class="tdbb">2026-11-06</span></td><td><a href="iframcirculatedview.php?menu=1765&typeid=2626&circulated_id=1363" title="第20屆第8次定期會-第23次會議">x</a>`);
  assert.deepEqual(at, { id: 1363, d: '2026-11-06', title: '第20屆第8次定期會-第23次會議' });
  assert.equal(mccFiles('<a href="admin/upload/twgov_file_1.pdf" target="_blank">第23次會議臨時動議</a>')[0].url, 'https://www.mcc.gov.tw/admin/upload/twgov_file_1.pdf');
  const meeting = '范秘書長陽添：\n府第 1 號案\n案由：116 年度本縣總預算案歲入編列 365 億\n2\n元。\n審查會聯席會議決議：\n照原案通過。\n大會決議：修正通過。\n主席(李議長文斌)：';
  const motions = '苗栗縣議會第 20 屆第 8 次定期會臨時動議案\n動-1\n\n動議人：邱毓興\n\n附議人：陳品安、張志宇\n翁 杰\n\n案\n\n題：有關籃球場損壞一案，建請縣府協\n助修繕，請審議。\n\n決\n\n議：照原案通過。\n\n苗栗縣議會第 20 屆第 8 次定期會臨時動議案\n動 - 2\n\n動議人：張副議長淑芬\n\n附議人：邱毓興\n\n案\n\n題：建請縣府增設匹克球場。\n\n決\n\n議：照原案通過。';
  const rows = mccBills([{ name: '第23次會議', text: meeting, url: 'a.pdf' }, { name: '第23次會議臨時動議', text: motions, url: 'b.pdf' }], at);
  assert.equal(rows.length, 3);
  const [gov, m1, m2] = rows;
  assert.deepEqual([gov['案號'], gov['案由'], gov['提案單位'], compactCouncilBill(gov).out], ['府第1號', '116年度本縣總預算案歲入編列365億元。', '苗栗縣政府', 'yes']);
  assert.deepEqual([m1['案號'], m1['連署人'], m1['案由'], m1['會期名稱']], ['動-1', '陳品安、張志宇、翁杰', '有關籃球場損壞一案，建請縣府協助修繕，請審議。', '第20屆第8次定期會']);
  assert.equal(m2['主提案人'], '張淑芬', 'the post isn’t part of the name');
});
