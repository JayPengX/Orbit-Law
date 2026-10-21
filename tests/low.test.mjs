import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lowCode, lowLevel, lowCourtName, courtFromPath, isJudgment, lowViews, titleKey } from '../public/lib/rulings.mjs';

test('other courts: codes, levels, names, 判決 only', () => {
  assert.equal(lowCode('TPDM,115,訴,9,20261002,1'), 'TPD');
  assert.equal(lowCode('TPSM,115,台上,1,20261001,1'), '');
  assert.equal(lowLevel('TCH'), 'high');
  assert.equal(lowLevel('TPB'), 'high');
  assert.equal(lowLevel('KSD'), 'district');
  assert.equal(lowCourtName('TPE'), '臺北地院簡易庭');
  assert.equal(lowCourtName('XYZ', { XYZ: '某法院' }), '某法院');
  assert.equal(courtFromPath('202609/臺灣高等法院臺中分院/民事/a.json'), '臺中高分院');
  assert.ok(isJudgment({ JFULL: '臺灣臺北地方法院刑事判決\r\n115年度訴字第9號' }));
  assert.ok(!isJudgment({ JFULL: '臺灣臺北地方法院刑事裁定\r\n115年度聲字第9號' }));
});

test('other courts: by article, 案由 and court, newest first and capped', () => {
  const rows = [
    ['TPDM,115,訴,9,20261002,1', '2026-10-02', '詐欺', ['C0000001:339', 'C0000001:55']],
    ['TPSM,115,台上,1,20261001,1', '2026-10-01', '詐欺', ['C0000001:339']],
    ['TCHV,115,上,5,20260915,1', '2026-09-15', '損害賠償', ['B0000001:184']]
  ];
  const v = lowViews(rows);
  assert.deepEqual(v.laws, { C0000001: 1, B0000001: 1 });
  assert.deepEqual(v.byLaw.C0000001['339'], [['TPDM,115,訴,9,20261002,1', '2026-10-02', '詐欺']]);
  assert.deepEqual(v.titles.map(t => t.slice(0, 2)), [['詐欺', 1], ['損害賠償', 1]]);
  assert.equal(v.titles[0][2], titleKey('詐欺'));
  assert.deepEqual(v.courts.map(c => [c[0], c[3]]), [['TPD', 'district'], ['TCH', 'high']]);
  assert.equal(v.latest.length, 2);
});
