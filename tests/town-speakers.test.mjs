// A 代表會 recording made into text by speech recognition, its speakers read from the meeting's fixed forms and
// names snapped to the members' list (lib/town-speakers.mjs; scripts/town-hear.mjs makes the paper).
import test from 'node:test';
import assert from 'node:assert/strict';
import { soundOf, charsOf, fixTerms, memberOf, heardTurns, machineAsks } from '../public/lib/town-speakers.mjs';
import { machinePaper, vocabOf, recKey } from '../scripts/town-hear.mjs';

const members = [
  { n: '何宜芯', py: ['he', 'yi', 'xin'] },
  { n: '張美珠', py: ['zhang', 'mei', 'zhu'] },
  { n: '彭竣志', py: ['peng', 'jun', 'zhi'] },
  { n: '曾玉菱', py: ['zeng', 'yu', 'ling'] }
];

test('sounds a Taiwanese ear hears alike are one sound', () => {
  assert.equal(soundOf('zhang'), soundOf('zang'));
  assert.equal(soundOf('shi'), soundOf('si'));
  assert.equal(soundOf('ling'), soundOf('lin'));
  assert.equal(soundOf('nan'), soundOf('lan'));
  assert.notEqual(soundOf('jun'), soundOf('qun'));
});

test('a name heard with its title snaps to one member: whole, given name, surname, or by sound; else none', () => {
  assert.equal(memberOf('張美珠', members), '張美珠');
  assert.equal(memberOf('我們張美珠', members), '張美珠');
  assert.equal(memberOf('宜芯', members), '何宜芯');
  assert.equal(memberOf('彭', members), '彭竣志');
  // (詹美珠: 詹 zhan is not 張 zhang… but 美珠 is only hers, by sound: 美洲.)
  assert.equal(memberOf('美洲', members, ['mei', 'zhou']), '');
  assert.equal(memberOf('一心', members, ['yi', 'xin']), '何宜芯');
  assert.equal(memberOf('玉林', members, ['yu', 'lin']), '曾玉菱');
  assert.equal(memberOf('軍事', members, ['jun', 'shi']), '');
  assert.equal(memberOf('王小明', members), '');
});

test('a misheard proper name of the meeting is written right where its sound matches', () => {
  const words = [[0, 1, '請問東坪里', ['qing', 'wen', 'dong', 'ping', 'li']], [1, 2, '的路燈', ['de', 'lu', 'deng']]];
  const out = fixTerms(charsOf(words), { 東平里: ['dong', 'ping', 'li'], 仁義市場: ['ren', 'yi', 'shi', 'chang'] });
  assert.equal(out.map(x => x.c).join(''), '請問東平里的路燈');
  assert.equal(charsOf(words)[3].t, 0.6);
});

// What a day sounds like: the chair calls, the member opens, the office answers, the chair calls the next.
const said = [
  [0, '主席、市長、各位代表大家好，今天開會。'],
  [6, '來，我們請張美珠代表。'],
  [9, '謝謝主席，主席、市長、各位代表同仁、後方來賓大家好，我想問市場的事。'],
  [20, '請市場管理所邵所長。'],
  [23, '感謝張代表的關心，市場年底完工，以上報告。'],
  [33, '好，謝謝所長。'],
  [36, '謝謝主席，那工期多久？'],
  [42, '來，再請張美珠代表。'],
  [45, '謝謝主席，還有攤位的事。'],
  [52, '來，請宜芯代表。'],
  [55, '謝謝主席，主席、市長、各位代表同仁大家好，我要問公園。']
];
const words = said.map(([t, x]) => [t, t + x.length * 0.2, x]);

test('who speaks, from the meeting’s forms: the one called speaks next, the chair between, the office answering', () => {
  const turns = heardTurns(words, { members, chair: '林啟賢' });
  const who = turns.map(t => `${t.w}/${t.r}`);
  assert.deepEqual(who, ['/', '林啟賢/主席', '張美珠/代表', '林啟賢/主席', '/所長', '林啟賢/主席', '張美珠/代表', '林啟賢/主席', '張美珠/代表', '林啟賢/主席', '何宜芯/代表']);
  assert.equal(turns[2].at, 9);
  // (Each member a block: called back for another round, still theirs; a new member, a new block.)
  assert.deepEqual(machineAsks(turns).map(a => [a.w, a.from, a.to]), [['張美珠', 2, 9], ['何宜芯', 10, 10]]);
});

test('a voice unlike the speaker’s and like no one known is left unnamed, never guessed', () => {
  const lines = [
    [0, '來，我們請張美珠代表。'],
    [3, '謝謝主席，主席、市長、各位代表同仁大家好，我想問市場的事情好不好。'],
    [20, '我再問一次市場的事情到底什麼時候會好。'],
    [30, '這個部分我們會再研究看看，會盡快處理。']
  ];
  const w = lines.map(([t, x]) => [t, t + x.length * 0.3, x]);
  // (The chair a man, the member a woman, then a man's voice no one has been heard in.)
  const pitchOf = a => (a < 3 ? 120 : a < 29 ? 230 : 105);
  const turns = heardTurns(w, { members, chair: '林啟賢', pitchOf });
  assert.deepEqual(turns.map(t => `${t.w}/${t.r}`), ['林啟賢/主席', '張美珠/代表', '/']);
});

test('a recording heard made into a paper: turns, blocks, each turn’s time; the meeting’s words for the recognizer', () => {
  const p = machinePaper({ id: 'abc', built: 'x', model: 'medium', d: '2026-10-28', part: '' }, { words, vocab: {}, f0: [] }, { members: members.map(({ n }) => ({ n })), chair: '' });
  assert.equal(p.k, '錄音逐字');
  assert.equal(p.machine, 1);
  assert.equal(p.au.id, 'abc');
  assert.equal(p.au.at.length, p.turns.length);
  assert.deepEqual(p.asks.map(a => a.w), ['張美珠', '何宜芯']);
  assert.match(p.asks[0].gist, /市場/);
  const v = vocabOf('10004010', { n: '竹北市民代表會', term: 10, people: [] }, { n: '第8次定期會', items: [{ n: '仁義市場整建' }] }, {});
  assert.match(v.prompt, /^竹北市民代表會第10屆第8次定期會/);
  assert.match(v.prompt, /市長/);
  assert.match(v.prompt, /何宜芯、[^。]*。$/);
  assert.ok(v.terms.includes('東平里') && v.terms.includes('何宜芯'));
  assert.equal(recKey({ drive: '1KMmP8scLCErpjxOg93hB40lexfhIGdFX' }), '1KMmP8scLCErpjxOg93hB40lexfhIGdFX');
  assert.match(recKey({ src: 'https://webws.miaoli.gov.tw/a b.mp3' }), /^[0-9a-f]{20}$/);
});

test('a turn the recognizer was mostly unsure of is marked unclear', () => {
  const sure = words.map(w => [...w, null, 0.9]);
  const unsure = words.map((w, i) => (i === 2 ? [w[0], w[1], w[2], null, 0.2] : [...w, null, 0.9]));
  // (Each piece one word here: the turn needs 5 words to judge; split the member's turn into its characters.)
  const split = unsure.flatMap(w => (w[4] < 0.5 ? [...w[2]].map((c, j) => [w[0] + j * 0.2, w[0] + j * 0.2 + 0.2, c, null, 0.2]) : [w]));
  const k = { id: 'abc', built: 'x' };
  const m = members.map(({ n }) => ({ n }));
  assert.equal(machinePaper(k, { words: sure, vocab: {}, f0: [] }, { members: m }).turns.some(t => t.unclear), false);
  const p = machinePaper(k, { words: split, vocab: {}, f0: [] }, { members: m });
  assert.deepEqual(p.turns.filter(t => t.unclear).map(t => t.w), ['張美珠']);
});

