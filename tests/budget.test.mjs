// 預算: 主計總處's 預算表 read (two layouts), a year's books, what was cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xmlRows, codeKind, bookOf, yearOf, moneyOf, money, change } from '../public/lib/budget.mjs';

const row = (code, name, amt, prev) => `<報表資料列><款></款><名稱及編號>${code}${name}</名稱及編號><本年度預算數>${amt}</本年度預算數><上年度預算數>${prev}</上年度預算數><說明><![CDATA[1.說明]]></說明></報表資料列>`;
const spend = (a, d) => xmlRows(`<x>${row('0002000000', '總統府主管', 1000 + a + d, 900)}${row('0002010000', '總統府', 1000 + a + d, 900)}${row('3102010000', '國務支出', 1000 + a + d, 900)}${row('3102010100', '一般行政', 600 + a, 500)}${row('3102010200', '國務機要', 400 + d, 400)}${row('3102010201', '節', 1, 1)}${row('0009000000', '國防部主管', 5000, 4000)}${row('0009010000', '國防部', 5000, 4000)}</x>`);
const fn = xmlRows('<x><報表資料列><名稱>合    計</名稱><合計_金額>9000</合計_金額></報表資料列><報表資料列><名稱>(1.一般政務支出)</名稱><合計_金額>1000</合計_金額></報表資料列><報表資料列><款>1</款><名稱>國務支出</名稱><合計_金額>1000</合計_金額></報表資料列><報表資料列><名稱>(2.國防支出)</名稱><合計_金額>5000</合計_金額></報表資料列></x>');

test('budget books: rows by code, a year with its cuts', () => {
  assert.deepEqual(['0002000000', '0002010000', '3102010000', '3102010100', '3102010201'].map(codeKind), ['min', 'agency', '', 'plan', '']);
  // The older layout: amounts in 元, the code apart.
  const old = xmlRows('<tables><BAME5480_row><budgetno_conver>0002000000</budgetno_conver><displayname>總統府主管</displayname><tyear_amt>15356702000</tyear_amt><lyear_amt>14801874000</lyear_amt></BAME5480_row></tables>');
  assert.deepEqual(bookOf({ spend: old }).min[0].slice(0, 4), ['0002000000', '總統府主管', 15356702, 14801874]);
  const b = bookOf({ spend: spend(0, 0), fn }), c = bookOf({ spend: spend(-100, -50), fn });
  assert.equal(b.min.length, 2);
  assert.deepEqual(b.min[0][4][0][4].map(p => p[1]), ['一般行政', '國務機要'], 'plans under their agency, 節 left out');
  assert.equal(b.fn.length, 2);
  const y = yearOf(115, b, c);
  assert.equal(y.passed, true);
  assert.equal(y.cut, 0, 'the 總表 totals are equal here');
  assert.deepEqual(y.min[0].slice(0, 4), ['總統府主管', 850, 900, 150]);
  assert.deepEqual(y.min[0][4][0][4].map(p => p[3]), [100, 50]);
  const m = moneyOf(y);
  assert.deepEqual(m.cuts, [['總統府主管', 150]]);
  assert.deepEqual(m.top[0], ['國防部主管', 5000, 4000]);
  assert.equal(yearOf(116, b, null).cut, null, 'no 法定預算 yet: no cut');
});

test('budget amounts in words', () => {
  assert.equal(money(3034974371), '3.03 兆');
  assert.equal(money(207502346), '2,075 億');
  assert.equal(money(2950000), '29.5 億');
  assert.equal(money(45000), '4,500 萬');
  assert.equal(money(3034974371, true), 'NT$3.03T');
  assert.equal(money(207502346, true), 'NT$208B');
  assert.equal(change(110, 100), '+10.0%');
  assert.equal(change(90, 100), '−10.0%');
});

test('a budget’s six steps: talks count only after the report; sent back is noted', async () => {
  const { budgetSteps, budgetDue, daysBetween } = await import('../public/lib/budget.mjs');
  const s = budgetSteps([['2024-09-20', '排入院會 (退回程序委員會重新提出)'], ['2024-09-20', '退回程序委員會'], ['2024-10-17', '黨團協商'], ['2024-11-01', '排入院會'], ['2024-11-01', '交付審查'], ['2025-01-06', '審查總報告'], ['2025-01-15', '黨團協商'], ['2025-01-21', '三讀']], '2024-09-20');
  assert.equal(s.now, 5);
  assert.deepEqual(s.days, ['2024-09-20', '2024-09-20', '2024-11-01', '2025-01-06', '2025-01-15', '2025-01-21']);
  assert.deepEqual(s.back, ['2024-09-20', '退回']);
  assert.equal(budgetSteps([['2026-10-02', '排入院會']]).now, 1);
  assert.equal(budgetDue(116), '2026-11-30');
  assert.equal(daysBetween('2026-10-21', '2026-11-30'), 40);
});
