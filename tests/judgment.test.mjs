import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJudgment, outcome, partiesLine } from '../public/lib/judgment.mjs';

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
