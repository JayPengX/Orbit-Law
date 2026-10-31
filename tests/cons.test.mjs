import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aboutLaws, lawStem, readConsPage, consItem, judgmentList, lastRewrite, citesOf, consByLaw, billsNaming, citedBy, consOfJid, consLabel, rocDate, consRow } from '../public/lib/cons.mjs';
import { caseQuery, caseMatch, byMonth, monthCounts } from '../public/lib/rulings.mjs';

const names = new Map([['中華民國憲法', 'A0000001'], ['民法', 'B0000001'], ['公司法', 'J0080001'], ['入出國及移民法', 'D0080132']]);
const row = (title, inner) => `<ul class="flex"><li class="title" data-bind="t">${title}</li><li class="text" title="${title}">${inner}</li></ul>`;
const page =
  '<div class="lawList">' +
  row('解釋字號', '釋字第748號【同性二人婚姻自由案】') +
  row('解釋公布院令', '中華民國 106年05月24日 院台大二字第1060014008號') +
  row('解釋爭點', '民法親屬編婚姻章，是否違反憲法第22條？') +
  row('解釋文', '<ul class="paragraphs"><li><label>1</label><pre title="解釋文">　　民法第4編親屬第2章婚姻規定，與憲法第22條有違。</pre></li></ul>') +
  row('理由書', '<ul class="paragraphs"><li><label>1</label><pre>　　依釋字第242號解釋。</pre></li><li><label>2</label><pre>　　憲法法庭111年憲判字第8號判決亦同。</pre></li></ul>') +
  row('相關法令', `<div class="lawLinkList"><a href="https://legal.judicial.gov.tw/FLAW/qrynoresult.aspx?lsid=FL000001&amp;no=7,22,23&amp;ldate=19470101"><p>中華民國憲法第7、22、23條(36.01.01)</p></a><p style='display:none;'>中華民國憲法第7、22、23條(36.01.01)</p><a href="https://legal.judicial.gov.tw/FLAW/qrynoresult.aspx?lsid=FL001&amp;no=246"><p>公司法第246條第2項(35.04.12)</p></a><a href="/docredirect.aspx?type=1&amp;no=362"><p>司法院釋字第362號解釋</p></a><p style="margin:7px">入出國及移民法第56條第4項本文</p><p>民法第972條</p></div>`) +
  row('意見書', '<div class="lawFileList"><a href="/download/download.aspx?id=1"><strong>黃大法官虹霞提出之部分不同意見書</strong></a></div>') +
  '</div>';

test('cons: a 釋字 page read whole, its articles and the rulings it names', () => {
  const it = consItem('s748', readConsPage(page), { names, rewriteOf: p => (p === 'J0080001' ? '19660719' : '') });
  assert.equal(it.n, '同性二人婚姻自由案');
  assert.equal(it.d, '2017-05-24');
  assert.equal(it.label, '釋字第748號');
  assert.deepEqual(it.main, ['民法第4編親屬第2章婚姻規定，與憲法第22條有違。']);
  assert.equal(it.reason.length, 2);
  // 公司法 as of 1946 is another text (rewritten 1966): the law, not article 246.
  assert.deepEqual(it.cites, ['A0000001:7', 'A0000001:22', 'A0000001:23', 'J0080001', 'D0080132:56', 'B0000001:972']);
  assert.deepEqual(it.refs, ['s362', 's242', 'j111-8']);
  assert.deepEqual(it.docs, [['黃大法官虹霞提出之部分不同意見書', 'https://cons.judicial.gov.tw/download/download.aspx?id=1']]);
  assert.deepEqual(consRow(it).slice(0, 3), ['s748', '2017-05-24', '同性二人婚姻自由案']);
});

test('cons: ids, labels, dates, the 憲判 list', () => {
  assert.equal(consLabel('j111-10'), '111年憲判字第10號');
  assert.equal(consLabel('s1'), '釋字第1號');
  assert.equal(consOfJid('JCCC,115,憲判,4,20260508'), 'j115-4');
  assert.equal(consOfJid('TPSM,115,台上,1,20260101,1'), '');
  assert.equal(rocDate('115年10月08日'), '2026-10-08');
  const list = `<a href="/docdata.aspx?fid=38&id=352187" title="115年憲判字第7號"><p>115年憲判字</p><p>第7號</p></a><a href="/docdata.aspx?fid=38&id=352187"><p>115年憲判字</p><p>第7號</p></a><a href="/docdata.aspx?fid=38&id=1"><p>114年憲判字</p><p>第1號</p></a>`;
  assert.deepEqual(judgmentList(list), [{ id: 'j115-7', page: 352187 }, { id: 'j114-1', page: 1 }]);
});

test('cons: a law rewritten whole, from its 沿革', () => {
  const h = '1.中華民國十八年十二月二十六日國民政府制定公布全文 233  條\n2.中華民國五十五年七月十九日總統令修正公布全文 449  條\n3.中華民國五十七年三月二十五日總統令修正公布第 108、218 條條文';
  assert.equal(lastRewrite(h), '19660719');
  assert.equal(lastRewrite(''), '');
  assert.deepEqual(citesOf([['民法第39條之1', 'x?no=39.1'], ['民法第6條至第8條', 'x?no=6-8']], names).cites, ['B0000001:39-1', 'B0000001:6', 'B0000001:7', 'B0000001:8']);
});

test('cons: by law and article, the bills that name a ruling, cited by', () => {
  const rows = [['s1', '1949-01-06', '', 'q', ['B0000001:1', 'A0000001'], [], []], ['j111-1', '2022-02-25', 'x', 'q', ['B0000001:1'], ['s1'], []]];
  assert.deepEqual(consByLaw(rows), { B0000001: { 1: ['j111-1', 's1'] }, A0000001: { '': ['s1'] } });
  assert.deepEqual(citedBy(rows), { s1: ['j111-1'] });
  assert.deepEqual(billsNaming([{ term: 11, laws: ['01126'], a: '為因應憲法法庭111年憲判字第8號判決' }, { term: 11, laws: ['00001'], t: '某法', a: '依司法院釋字第七四八號解釋' }]), { 'j111-8': ['11:01126'], s748: ['11:00001'] });
});

test('cons: a ruling is about a law its 爭點 or 解釋文 names, not one its 理由 cites in passing', () => {
  const name = p => ({ T0020001: '預算法', J0120044: '公營事業移轉民營條例', A0000001: '中華民國憲法' })[p];
  const s764 = { n: '公營事業移轉民營留用人員年資結算案', issue: '公營事業移轉民營條例第8條第3項前段規定…是否侵害其服公職權？', main: ['…與憲法第18條保障人民服公職之權利意旨尚無違背。'], cites: ['A0000001:18', 'J0120044:8', 'T0020001:85'] };
  assert.deepEqual(aboutLaws(s764, name), ['A0000001', 'J0120044']);
  assert.deepEqual(aboutLaws({ n: '', issue: '政院停建核四廠應向立院報告？', main: ['…預算案經立法院通過…'], cites: ['T0020001:6'] }, name), ['T0020001']);
  assert.equal(lawStem('預算法'), '預算');
  const rows = [['s764', '2018-05-04', '', 'q', ['T0020001:85', 'J0120044:8'], [], [], ['J0120044']]];
  assert.deepEqual(consByLaw(rows), { T0020001: { 85: ['s764'] }, J0120044: { 8: ['s764'], '#': ['s764'] } });
});

test('rulings: a case number typed, the months to browse', () => {
  const c = caseQuery('115台上4682');
  assert.deepEqual(c, { y: '115', w: '台上', n: '4682' });
  assert.ok(caseMatch('TPSM,115,台上,4682,20261008,1', c));
  assert.ok(caseMatch('TPSM,115,台上,4682,20261008,1', caseQuery('115年度臺上字第4682號')));
  assert.equal(caseQuery('111憲判8'), null);
  const m = byMonth([['TPSM,115,台上,1,20261008,1', '2026-10-08', 'a', []], ['TPAA,115,上,2,20260902,1', '2026-09-02', 'b', []], ['JCCC,115,憲判,4,20260508', '2026-05-08', 'c', []]]);
  assert.deepEqual(Object.keys(m).sort(), ['202609', '202610']);
  assert.deepEqual(monthCounts(m), [['202610', 1, 0], ['202609', 0, 1]]);
});
