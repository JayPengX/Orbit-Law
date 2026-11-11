// 拍合約幫你看: what code does around the AI (lib/contract.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitClauses, contractKind, sidesOf, prepClauses, cleanCheck, levelCounts } from '../public/lib/contract.mjs';

test('pasted words into clauses by their own numbers; a clause\'s 1. 2. stay inside it', () => {
  const c = splitClauses('房屋租賃契約書\n第一條 租金每月9,500元。\n第二條 押金：\n1. 兩個月租金\n2. 退租時返還\n第三條 修繕由出租人負擔。');
  assert.deepEqual(c.map(x => x.n), ['', '第一條', '第二條', '第三條']);
  assert.match(c[2].text, /1\. 兩個月租金\n2\. 退租時返還/);
  assert.deepEqual(splitClauses('一、時薪180元。\n二、遲到扣300元。').map(x => x.n), ['一', '二']);
  assert.deepEqual(splitClauses('1. 時薪180元\n2. 遲到扣300元').map(x => x.n), ['1', '2']);
  assert.deepEqual(splitClauses('本人自願參加活動。\n\n一切責任自負。').map(x => x.text), ['本人自願參加活動。', '一切責任自負。'], 'no numbers: each paragraph');
});

test('a contract\'s kind and the sides to pick from: its own parties, else its kind\'s', () => {
  assert.equal(contractKind('乙方擔任兼職人員，時薪180元'), 'work');
  assert.equal(contractKind('承租人應於每月5日前支付租金'), 'rent');
  assert.equal(contractKind('立切結書人'), 'pledge');
  assert.deepEqual(sidesOf({ kind: 'rent', parties: [{ role: '出租人（甲方）', who: '房東' }, { role: '承租人（乙方）', who: '房客' }] }).map(x => x.label), ['出租人（甲方）（房東）', '承租人（乙方）（房客）']);
  assert.deepEqual(sidesOf({ kind: 'work', parties: [] }).map(x => x.label), ['勞工（員工）', '雇主（老闆）']);
  assert.deepEqual(sidesOf({ kind: 'rent', parties: [{ role: '房東', who: '房東' }, { role: '房客', who: '房客' }] }).map(x => x.label), ['房東', '房客'], 'never 房東（房東）');
});

test('the clauses numbered as the proxy will: a short one and past the size left out', () => {
  const c = prepClauses([{ n: '一', text: '  時薪  180元 ' }, { n: '', text: 'x' }, { n: '二', text: '條'.repeat(1300) }, ...Array.from({ length: 20 }, (_, i) => ({ n: String(i), text: '字'.repeat(1000) }))]);
  assert.deepEqual(c[0], { n: '一', text: '時薪 180元' });
  assert.equal(c[1].text.length, 1200);
  assert.ok(c.reduce((n, x) => n + x.text.length, 0) <= 14_000);
});

test('the check made safe: flags on clauses sent, known levels, cites in shape', () => {
  const c = cleanCheck({ summary: ' 有 2 條要改 ', flags: [{ clause: 1, level: 'void', what: '時薪180元', why: 'w', ask: '', cites: ['N0030028:5', 'bad'] }, { clause: 9, level: 'void', what: 'x', cites: [] }, { clause: 2, level: 'meh', what: 'y' }, { clause: 2, level: 'check', what: '注意', cites: [] }], missing: [{ what: '押金何時還', cites: ['D0060125:7'] }, { what: '' }], laws: { 'N0030028:5': ['最低工資法', '第5條'], bad: [1] }, checked: 20 }, [{}, {}]);
  assert.equal(c.summary, '有 2 條要改');
  assert.deepEqual(c.flags.map(f => [f.clause, f.level, f.cites]), [[1, 'void', ['N0030028:5']], [2, 'check', []]]);
  assert.deepEqual(levelCounts(c.flags), { void: 1, unfair: 0, check: 1 });
  assert.deepEqual(c.missing.map(m => m.what), ['押金何時還']);
  assert.deepEqual(Object.keys(c.laws), ['N0030028:5']);
});
