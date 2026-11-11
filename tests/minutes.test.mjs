// 會議紀錄變表格 (lib/minutes.mjs): a 代表會's minutes, read by code into sittings and proposals, from four
// councils' real minutes (tests/fixtures/minutes/); what code can't split goes to the AI door with a digest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { minutesOf, proposalRows, sittingRows, resultOf, whoOf, digest, numOf, RESULTS } from '../public/lib/minutes.mjs';

const fx = n => readFileSync(new URL(`./fixtures/minutes/${n}.txt`, import.meta.url), 'utf8');

test('a short sitting (竹北): its day, hours, chair, who came and what it did, each with its result', () => {
  const [s] = sittingRows(fx('zhubei-sitting'));
  assert.equal(s.n, '延長會第四次會議');
  assert.equal(s.d, '2026-10-08');
  assert.deepEqual([s.from, s.to, s.chair], ['10:00', '11:30', '林啟賢']);
  assert.ok(s.att >= 15);
  const budget = s.done.find(x => /總預算案/.test(x.what));
  assert.match(budget.result, /三讀通過/);
  assert.ok(s.done.some(x => /乙字第1至第7號案/.test(x.what) && x.result === '照案通過'));
  assert.equal(minutesOf(fx('zhubei-sitting')).good, true, 'code reads it all: no AI');
});

test('proposals read out in a transcript (和美): number, kind, who, 案由 without its 請審議, and the chair’s 照案通過', () => {
  const rows = proposalRows(fx('hemei-proposals'));
  assert.ok(rows.length >= 3);
  assert.deepEqual(rows[0], { no: '鎮長提案第1號', kind: '民政', by: '林庚壬', co: '', what: '為本鎮柑井里行政區域鄰調整案', result: '通過', note: '', vote: '', d: '2025-08-19' });
  assert.ok(rows.every(r => RESULTS.includes(r.result)));
  assert.ok(!rows.some(r => /請審議/.test(r.what)));
});

test('a 議決書 (社頭): 提案人 and 連署人 apart, 大會議決 over the chair’s words', () => {
  const [r] = proposalRows(fx('shetou-resolution'));
  assert.equal(r.no, '代表提案第1號');
  assert.equal(r.kind, '建設觀光');
  assert.equal(r.by, '蕭存修');
  assert.equal(r.co, '邱團財、劉明進');
  assert.equal(r.result, '通過');
});

test('a header on one line with its 案由 (大城), read twice in the minutes: one row', () => {
  const rows = proposalRows(fx('dacheng-inline'));
  const first = rows.filter(r => /垃圾車汰換計畫/.test(r.what));
  assert.equal(first.length, 1, 'the second reading is the same proposal');
  assert.equal(first[0].by, '陳玉照');
  assert.equal(first[0].kind, '民政');
  assert.equal(first[0].result, '通過');
  assert.match(first[0].what, /224萬2,000元$/);
});

test('results, people and numbers in the minutes’ words', () => {
  assert.equal(resultOf('照原案通過'), '通過');
  assert.equal(resultOf('照審查意見通過'), '通過');
  assert.equal(resultOf('修正通過'), '修正通過');
  assert.equal(resultOf('此案不通過'), '不通過');
  assert.equal(resultOf('擇日議決'), '擇日再議');
  assert.equal(resultOf('撤回'), '撤回');
  assert.equal(resultOf('請坐'), '');
  assert.equal(whoOf('鄉長蔣煙燈'), '蔣煙燈');
  assert.equal(whoOf('林庚壬鎮長'), '林庚壬');
  assert.equal(whoOf('本會全體代表'), '本會全體代表');
  assert.equal(numOf('十二'), 12);
  assert.equal(numOf('３'), 3);
});

test('a transcript code can’t settle goes to the AI as its proposal and decision lines only, never the speeches', () => {
  const t = ['伸港鄉公所第1號提案', '類別：環保', '提案人：鄉長黄永欽', '案由：補助本所購置垃圾車2輛', '紀清潔隊長美月：', '主席、副主席，本案是彰化縣環保局核定補助5部天然災害清運車輛，請各位代表多多支持。', '柯主席嘉換：', '代表同仁對公所第1號提案是否有意見？如無意見，本案照原案通過。'].join('\n');
  const d = digest(t);
  assert.match(d, /案由：補助本所購置垃圾車2輛/);
  assert.match(d, /照原案通過/);
  assert.doesNotMatch(d, /多多支持/);
});
