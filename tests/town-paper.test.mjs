// A 代表會's long papers in parts (lib/town-paper.mjs): each office's 工作報告 a part, its numbered lines heads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paperParts, partItems } from '../public/lib/town-paper.mjs';

const report = `各課室工作報告自民國115年05月起新竹縣竹北市公所民政課工作報告至民國115年09月止
工作項目計畫要點辦理情形備註
一、自治業務    (一) 辦理里、鄰長辦理里、鄰長(含眷屬)共290位加健保全民健保手續及繳費。
二、調解業務受理民眾聲請調解調解委員會共受理222件，其中調解成事件立151件。
自民國115年05月起新竹縣竹北市公所財政課工作報告至民國115年09月止
一、財務管理財務管理業務1.編製各項財務報表。
2.財政績效考核。
自民國115年05月起新竹縣竹北市公所市場管理所工作報告至民國115年09月止
一、市場管理 仁義市場整建。`;

test('paperParts: an office a part, in order, covering the paper', () => {
  const parts = paperParts(report);
  assert.deepEqual(parts.map(p => p.unit), ['民政課', '財政課', '市場管理所']);
  assert.equal(parts[0].from, 0);
  assert.equal(parts.at(-1).to, report.length);
  assert.deepEqual(paperParts('市長施政報告：今年是建設大爆發的一年。').map(p => p.unit), ['']);
});

test('partItems: heads cut where the table’s columns run together; headings and column lines left out', () => {
  const [mz, cz] = paperParts(report);
  assert.deepEqual(partItems(report, mz), [
    { k: 'h', t: '一、自治業務' },
    { k: 'p', t: '(一) 辦理里、鄰長辦理里、鄰長(含眷屬)共290位加健保全民健保手續及繳費。' },
    { k: 'p', t: '調解業務受理民眾聲請調解調解委員會共受理222件，其中調解成事件立151件。', n: '二、' }
  ]);
  assert.deepEqual(partItems(report, cz).slice(0, 2), [{ k: 'h', t: '一、財務管理財務管理業務' }, { k: 'p', t: '1.編製各項財務報表。' }]);
});
