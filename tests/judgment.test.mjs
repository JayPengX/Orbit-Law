import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readJudgment, outcome, partiesLine, plainMarks } from '../public/lib/judgment.mjs';

const page = `<div class="htmlcontent"><div class="he-h1">最高法院刑事判決</div><div>115年度台上字第1號</div><div>上&nbsp; 訴&nbsp; 人&nbsp; 王小明</div><div>選任辯護人&nbsp; 李律師</div><div>上&nbsp; 訴&nbsp; 人&nbsp; 陳大華</div><div class="he-h3">主&nbsp; 文</div><div>原判決撤銷，發回臺灣高等法院。</div><div class="he-h3">理&nbsp; 由</div><div>一、本件原判決認定事實。</div><div>又證據未調查。</div><div>二、據上論結，應發回。</div><div>中　　華　　民　　國　　115 　年　　9 　　月　　30　　日</div><div>刑事第一庭審判長法　官&nbsp; 甲乙丙</div></div><div id="JudrelaLaw"></div>`;

test('judgment: outcome, who and the reasons by point', () => {
  const r = readJudgment(page);
  assert.equal(r.no, '115年度台上字第1號');
  assert.equal(r.kind, '判決');
  assert.deepEqual(r.main, ['原判決撤銷，發回臺灣高等法院。']);
  assert.equal(r.reasons.length, 2);
  assert.match(r.reasons[0].text, /又證據未調查/);
  assert.equal(r.date, '2026-09-30');
  assert.deepEqual(r.judges, ['甲乙丙']);
  assert.equal(outcome(r.main.join('')).label, '發回重審');
  assert.equal(outcome('上訴駁回。').label, '駁回');
  assert.equal(outcome('被告無罪。').label, '無罪');
  assert.deepEqual(partiesLine(r.parties), ['上訴人 王小明、陳大華']);
});

test('judgment: an old fixed-width page joins its lines back', () => {
  const pre = `<div class="text-pre text-pre-in">最高法院民事判決　　　　114年度台上字第2號
上　訴　人　張三
主　　文
上訴駁回。
理　　由
一、按上訴第三審法院，非以原判決違背法令為理由，不得
為之。
中　　華　　民　　國　　114　　年　　1 　　月　　2　　日</div>`;
  const r = readJudgment(pre);
  assert.deepEqual(r.main, ['上訴駁回。']);
  assert.equal(r.reasons.length, 1);
  assert.match(r.reasons[0].text, /不得為之/);
});

// The 最高法院's usual shape (Jay 2026-11-06): a point that opens with a lead
// (三、上訴人之上訴意旨略以： / 四、惟：) and its ㈠ ㈡ sub-points after it. The
// lead and its sub-points are one point, the court's ㈠ read as （一） so the
// app hangs them under it; never a point of a few words on its own.
const top = `<div class="htmlcontent"><div>最高法院刑事判決</div><div>115年度台上字第2613號</div><div>上 訴 人 黃信穎</div><div>主 文</div><div>上訴駁回。</div><div>理 由</div><div>一、按刑事訴訟法第377條規定，上訴於第三審法院，非以判決違背法令為理由，不得為之。</div><div>二、本件第一審判決認定上訴人犯行。</div><div>三、上訴人之上訴意旨略以：</div><div>㈠本件因A女始終拒絕出面，以致未能成立和解。</div><div>㈡原判決單以伊未實際賠償為由，認不宜宣告緩刑。</div><div>四、惟：</div><div>㈠刑之量定，乃法律賦予法院自由裁量之事項，並無上訴意旨㈠所稱之違法。</div><div>㈡緩刑為法院刑罰權之運用。</div><div>五、上訴人之上訴意旨，顯與法律規定不相適合，應予駁回。</div><div>據上論結，應依刑事訴訟法第395條前段，判決如主文。</div><div>中　　華　　民　　國　　115 　年　　10 　　月　　8　　日</div><div>刑事第五庭審判長法　官 林立華</div></div><div id="JudrelaLaw"></div>`;

test('judgment: a lead and its ㈠ ㈡ sub-points are one point', () => {
  const r = readJudgment(top);
  assert.deepEqual(r.reasons.map(x => x.head), ['一', '二', '三', '四', '五']);
  const [lead, ...subs] = r.reasons[2].text.split('\n');
  assert.equal(lead, '三、上訴人之上訴意旨略以：');
  assert.deepEqual(subs.map(s => s.slice(0, 3)), ['（一）', '（二）']);
  assert.match(r.reasons[3].text, /^四、惟：\n（一）刑之量定[^\n]*上訴意旨（一）所稱/);
  assert.ok(r.reasons.every(x => x.text.replace(/^[一二三四五六七八九十]+、/, '').length > 3 || /\n/.test(x.text)), 'no point is a few words alone');
  assert.equal(plainMarks('⒈甲⒉乙㈩'), '1.甲2.乙（十）');
});

test('judgment: on an old fixed-width page a ㈠ line starts its own paragraph', () => {
  const pre = `<div class="text-pre">最高法院刑事判決　　　　114年度台上字第3號
上　訴　人　李四
主　　文
上訴駁回。
理　　由
一、上訴意旨略以：
㈠原判決認事用法有誤，
應予撤銷。
㈡量刑過重。
中　　華　　民　　國　　114　　年　　1 　　月　　2　　日</div>`;
  const r = readJudgment(pre);
  assert.equal(r.reasons.length, 1);
  assert.deepEqual(r.reasons[0].text.split('\n'), ['一、上訴意旨略以：', '（一）原判決認事用法有誤，應予撤銷。', '（二）量刑過重。']);
});

// The sheet shows each point whole (never cut with … and no way on): a long
// one folds under the kit's quiet bar, 看全文 / 收起, fitted to the width.
test('judgment sheet: points are never cut short; a long one opens with 看全文', () => {
  const src = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('async function openJudgment('), src.indexOf('\n}\n', src.indexOf('async function openJudgment(')));
  const point = fn.slice(fn.indexOf('const point = '), fn.indexOf('\n', fn.indexOf('const point = ')));
  assert.doesNotMatch(point, /slice\(|…/);
  assert.match(point, /proseHtml\(x\.text/);
  assert.match(point, /jdMore\(/);
  assert.match(fn, /fitJdPoints\(body\)/);
  assert.match(src, /moreHtml\(\{ more: W\('看全文'/);
});
