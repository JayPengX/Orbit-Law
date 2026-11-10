// Every kind of rule read into 條 or 點 (lib/rule-doc.mjs), from the shapes the sites hand us.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleDoc, ruleDiff, partKey } from '../public/lib/rule-doc.mjs';
import { kindOf, ruleParts, localKindOf, partLabel, isRule } from '../public/lib/kinds.mjs';

const keys = d => d.a.filter(x => x[0] === 'A').map(x => x[1]);

test('kinds: ids and their kind', () => {
  assert.equal(kindOf('N0030001'), 'law');
  assert.equal(kindOf('N0030002', '命令'), 'order');
  assert.equal(kindOf('local:TPE:FL002177'), 'local');
  assert.equal(kindOf('agency:MOE:GL002421'), 'agency');
  assert.deepEqual(ruleParts('local:TPE:FL002177'), { dir: 'local', id: 'TPE:FL002177' });
  assert.equal(ruleParts('N0030001'), null);
  assert.ok(isRule('agency:FSC:FL1') && !isRule('A0000001'));
  assert.equal(localKindOf('臺北市殯葬管理自治條例'), '自治條例');
  assert.equal(localKindOf('新竹市廢水及污水排放管理推動委員會設置及運作要點'), '行政規則');
  assert.equal(localKindOf('臺中市各區衛生所組織規程'), '自治規則');
  assert.equal(localKindOf('任何名稱', '委辦規則'), '委辦規則');
  assert.equal(partLabel('3', '點'), '第 3 點');
  assert.equal(partLabel('3-1'), '第 3-1 條');
});

test('partKey reads every way a 條 is written', () => {
  assert.equal(partKey('第 12 條'), '12');
  assert.equal(partKey('第三條之一'), '3-1');
  assert.equal(partKey('第 一 條'), '1');
  assert.equal(partKey('第二十條'), '20');
});

test('條 on lines of their own (臺北)', () => {
  const d = ruleDoc({ n: '臺北市殯葬管理自治條例', a: '臺北市', d: '2015-08-10', t: '第 1 條\n臺北市為改善殯葬文化，特制定本自治條例。\n\n第 2 條\n本自治條例之主管機關為臺北市殯葬管理處。\n\n第 3 條\n申請埋葬許可證明，應檢具下列文件：\n一、申請書。\n二、死亡證明。' }, 'local:TPE:FL002177');
  assert.equal(d.u, '條');
  assert.deepEqual(keys(d), ['1', '2', '3']);
  assert.match(d.a[2][2], /^申請埋葬許可證明，應檢具下列文件：\n一、申請書。\n二、死亡證明。$/);
  assert.equal(d.m, '20150810');
  assert.equal(d.c, '臺北市');
});

test('條 and text on one line, fixed width (臺中)', () => {
  const d = ruleDoc({ n: '臺中市各區衛生所組織規程', t: '第一條                   本規程依臺中市政府衛生局組織規程第八條規定訂定之。\n第二條    臺中市各區衛生所，隸屬於臺中市政府衛\n          生局，辦理轄區內醫療保健及公共衛生事項\n          。\n第三條之一  衛生所置主任。' }, 'local:TXG:GL000100');
  assert.deepEqual(keys(d), ['1', '2', '3-1']);
  assert.equal(d.a[1][2], '臺中市各區衛生所，隸屬於臺中市政府衛生局，辦理轄區內醫療保健及公共衛生事項。');
});

test('條 run together in one block, no space after 條 (基隆)', () => {
  const d = ruleDoc({ n: '基隆市網球場使用管理辦法', t: '第一條本辦法依地方制度法第二十七條第一項規定訂定之。第二條本球場之管理機關為基隆市立體育場。第三條本球場開放時間為星期一至星期日。' }, 'local:KEE:GL000387');
  assert.deepEqual(keys(d), ['1', '2', '3']);
  assert.match(d.a[0][2], /地方制度法第二十七條第一項/);
});

test('a reference to 第四條 at a line start is not a 條 (臺北 綠化實施規則)', () => {
  const d = ruleDoc({ n: 'x規則', t: '第 5 條\n本規則用詞如下。\n\n第 6 條\n第四條所定各類建築基地之綠化總固碳當量應大於基準值。\n\n第 7 條\n法定空地內各類植栽之種植。' }, 'local:TPE:X');
  assert.deepEqual(keys(d), ['5', '6', '7']);
});

test('a 要點 is points, run together or a line each; a 一、 inside a 點 stays in it', () => {
  const d = ruleDoc({ n: '基隆市政府家庭暴力暨性侵害防治委員會設置要點', t: '一、基隆市政府為發展防治服務網絡，特設本會，並訂定本要點。二、本會職掌如下：（一）協助研擬業務法令。（二）協調有關機關。三、本會置委員十七至二十一人。' }, 'local:KEE:GL000472');
  assert.equal(d.u, '點');
  assert.deepEqual(keys(d), ['1', '2', '3']);
  assert.match(d.a[1][2], /（一）協助研擬業務法令。\n（二）協調有關機關。/);
  const k = ruleDoc({ n: '高雄市稅捐稽徵處主動辦理各類災害減免作業要點', t: '一、為加強便民服務，特訂定本要點。\n二、本要點所稱災害，定義如下：\n指震災、風災。\n三、災害減免稅目、範圍及申請期限\n(一)房屋稅\n1.房屋受重大災害者，免徵。\n(二)地價稅\n1.土地流失者，全免。\n四、納稅義務人因災害遲誤繳納期間者，得延長。' }, 'local:KHH:GL001943');
  assert.deepEqual(keys(k), ['1', '2', '3', '4']);
  assert.equal(k.a.filter(x => x[0] === 'C').length, 0);
});

test('a 要點 citing 第X條 of a law is still points (嘉義縣)', () => {
  const d = ruleDoc({ n: '退還地政規費簡化作業要點', t: '一、為簡化作業流程，訂定本要點。\n\n二、本要點所稱地政規費，係指土地法第四十四條之一\n 、第六十五條規定之費用。\n\n三、申請退還，除依規費法第十八條、地籍測量實施規則第二百一十四條、\n 第二百六十六條規定辦理外，並按本要點辦理。' }, 'local:CYQ:X');
  assert.equal(d.u, '點');
  assert.deepEqual(keys(d), ['1', '2', '3']);
});

test('the site\'s own name on the first line is dropped; 第X章 is a heading', () => {
  const d = ruleDoc({ n: '連江縣馬祖油品供應有限公司組織自治條例', t: '連江縣馬祖油品供應有限公司組織自治條例\n第一章 總則\n第一條 本自治條例係依規定制定之。\n第二條 本公司置董事一人。' }, 'local:LNN:X');
  assert.deepEqual(d.a.map(x => x[0]), ['C', 'A', 'A']);
  assert.equal(d.a[0][2], '第一章 總則');
});

test('a 一、 further in is a 款 of an unnumbered article: the text stays whole (宜蘭)', () => {
  const d = ruleDoc({ n: '宜蘭縣鄉鎮市衛生所組織規程', t: '本規程依衛生局組織規程第十一條規定訂定之。\n衛生所掌理下列事項：\n一、婦幼衛生。\n二、門診醫療。\n衛生所置主任一人。' }, 'local:ILA:X');
  assert.equal(d.u, '');
  assert.equal(d.a.length, 1);
  assert.equal(d.a[0][0], 'T');
});

test('a text that is only its attachment says so', () => {
  assert.equal(ruleDoc({ n: 'x要點', t: '詳如附件全文。' }, 'agency:X:1').only, true);
  assert.equal(ruleDoc({ n: 'x要點', t: '(因排版無法完整呈現內容，請詳閱全文檔案)' }, 'agency:X:1').only, true);
  assert.equal(ruleDoc({ n: 'x要點', t: '一、本要點規定附件之格式。二、其餘依規定辦理。' }, 'agency:X:1').only, false);
});

test('ruleDiff: what a new version added, amended and removed', () => {
  const a = ruleDoc({ n: 'x', t: '一、甲。\n二、乙。\n三、丙。' }, 'local:X:1');
  const b = ruleDoc({ n: 'x', t: '一、甲。\n二、乙改。\n三、丙。\n四、丁。' }, 'local:X:1');
  const d = ruleDiff(a, b);
  assert.deepEqual(d.amended, ['2']);
  assert.deepEqual(d.added, ['4']);
  assert.deepEqual(d.arts['2'], ['乙。', '乙改。']);
  const c = ruleDoc({ n: 'x', t: '一、甲。\n二、乙。' }, 'local:X:1');
  assert.deepEqual(ruleDiff(a, c).removed, ['3']);
  assert.deepEqual(ruleDiff(c, a).added, ['3']);
});

test('a followed rule keeps its name on the Pass, only while something points at it', async () => {
  const { encodeMine, decodeMine, keptRules } = await import('../public/lib/store.mjs');
  const m = { laws: { 'local:TPE:1': '2026-11-10' }, items: {}, marks: [], recent: [], rules: { 'local:TPE:1': ['臺北市x自治條例', '臺北市', '自治條例'], 'local:TPE:2': ['y', '臺北市', '行政規則'] } };
  assert.deepEqual(Object.keys(keptRules(m)), ['local:TPE:1']);
  assert.deepEqual(decodeMine(encodeMine(m)).rules, { 'local:TPE:1': ['臺北市x自治條例', '臺北市', '自治條例'] });
});
