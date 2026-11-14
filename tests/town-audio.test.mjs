// A day's 總質詢 laid over its recording by code (lib/town-audio.mjs): pauses and voices, no AI; and a day's turns
// in blocks by who asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { silences, speech, alignDay, alignTurns, turnAt, askBlocks, clock } from '../public/lib/town-audio.mjs';

const SR = 8000;
// A made-up recording: each turn a voice (a pitch) for its length, a pause between; a room's hum under it all.
function recording(parts) {
  const total = parts.reduce((n, p) => n + p.s + p.gap, 0);
  const x = new Int16Array(Math.ceil(total * SR));
  let at = 0;
  const starts = [];
  for (const p of parts) {
    starts.push(at);
    const a = Math.round(at * SR);
    const n = Math.round(p.s * SR);
    for (let i = 0; i < n; i++) {
      // Speech: the voice's pitch, its loudness rising and falling with syllables.
      const env = 0.6 + 0.4 * Math.sin((2 * Math.PI * 4 * i) / SR);
      x[a + i] = Math.round(9000 * env * Math.sin((2 * Math.PI * p.f * i) / SR));
    }
    at += p.s + p.gap;
  }
  for (let i = 0; i < x.length; i++) x[i] += Math.round(60 * Math.sin(i * 0.37));
  return { pcm: x, starts };
}

test('silences: the quiet stretches, from the recording’s own levels', () => {
  const { pcm } = recording([{ s: 3, f: 120, gap: 2 }, { s: 3, f: 220, gap: 0 }]);
  const sil = silences(pcm, SR);
  assert.equal(sil.length, 1);
  assert.ok(Math.abs(sil[0][0] - 3) < 0.1 && Math.abs(sil[0][1] - 5) < 0.1, JSON.stringify(sil));
  assert.deepEqual(speech(sil, 8).map(([a, b]) => [Math.round(a), Math.round(b)]), [[0, 3], [5, 8]]);
});

test('alignDay: each turn starts where its speaker does, a wait (〜) inside a turn kept', () => {
  // The chair (a man) and members (women) taking turns, ~5 characters a second, the chair's call split by a wait.
  const turns = [
    { w: '林啟賢', t: '各位代表大家好，今天進行市政總質詢，本席宣布開議。', f: 120 },
    { w: '林啟賢', t: '各位代表有沒有要詢問的？〜來，我們請何宜芯代表。', f: 120 },
    { w: '何宜芯', t: '主席、市長，仁義市場整建期間的圍籬，門是關起來的還是開放的？請所長說明，謝謝。', f: 220 },
    { w: '林啟賢', t: '來，請邵所長答覆。', f: 120 },
    { w: '邵慧芬', t: '感謝代表關心，管制時間是早上八點到晚上八點，自治會的會長都有鑰匙，攤商可以進出卸貨。', f: 250 },
    { w: '林啟賢', t: '好，謝謝所長。', f: 120 }
  ];
  const parts = [];
  for (const t of turns)
    t.t.split('〜').forEach((x, j, all) => parts.push({ s: x.length / 5, f: t.f, gap: j < all.length - 1 ? 40 : 1.5 }));
  const { pcm, starts } = recording(parts);
  const at = alignDay(turns, pcm, SR);
  // Each turn's first part: where the recording has it.
  const first = [];
  let k = 0;
  for (const t of turns) first.push(starts[k]), (k += t.t.split('〜').length);
  assert.equal(at.length, turns.length);
  at.forEach((t, i) => assert.ok(Math.abs(t - first[i]) < 1.5, `turn ${i}: ${t} vs ${first[i]}`));
  assert.equal(turnAt(at, first[2] + 3), 2);
  assert.equal(turnAt(at, 0), 0);
});

test('alignTurns: speech before the meeting is left out, not stretched into the first turn', () => {
  // 20 s of chatter, a long pause, then the meeting's three turns (0.2 s a character).
  const spans = [[0, 20], [60, 210], [211, 511], [512, 662]];
  const at = alignTurns([{ n: 750 }, { n: 1500 }, { n: 750 }], spans);
  assert.deepEqual(at.map(Math.round), [60, 211, 512]);
});

test('askBlocks: every turn in one block, the opening its own, the chair’s call with the block before', () => {
  const p = { turns: Array.from({ length: 10 }, (_, i) => ({ w: `w${i}`, t: 'x' })), asks: [{ w: 'a', from: 2, to: 4 }, { w: 'b', from: 6, to: 8 }] };
  assert.deepEqual(askBlocks(p).map(b => [b.n, b.from, b.to]), [[-1, 0, 1], [0, 2, 5], [1, 6, 9]]);
  assert.equal(clock(3725), '1:02:05');
  assert.equal(clock(65.9), '1:05');
});

test('topicWords: the places and things a member named, not the words around them', async () => {
  const { topicWords } = await import('../public/lib/town-audio.mjs');
  assert.deepEqual(topicWords(['最近這個竹仁市場以及竹北市場以及仁義市場，他們都有辦一個活動']), ['竹仁市場', '竹北市場', '仁義市場']);
  assert.deepEqual(topicWords(['我想要問免費市民公車的部分，能夠換成電動公車嗎？']), ['免費市民公車', '換成電動公車']);
  assert.deepEqual(topicWords(['謝謝主席，大家好。']), []);
});

test('alignHeard: each turn where its own words were heard, words missed or misheard between', async () => {
  const { alignHeard } = await import('../public/lib/town-audio.mjs');
  const turns = ['主席宣布開會，請張代表發言。', '謝謝主席，我想請問仁義市場的問題，攤商什麼時候回來？', '好，所長回答：市場已經整修完成，下個月開放。', '謝謝所長。'];
  const words = [];
  let t = 30;
  turns.forEach((s, i) => {
    // (Heard with a slip: one character wrong in the second turn, the last turn not heard at all.)
    if (i === 3) return;
    for (const c of s.replace(/[，。：？]/g, '')) words.push([t, t + 0.2, i === 1 && c === '仁' ? '人' : c]), (t += 0.25);
    t += 4;
  });
  const got = alignHeard(turns, words);
  assert.equal(got.at.length, 4);
  assert.equal(got.at[0], 30);
  assert.ok(Math.abs(got.at[1] - (30 + 12 * 0.25 + 4)) < 0.6, String(got.at[1]));
  assert.ok(Math.abs(got.at[2] - (37 + 24 * 0.25 + 4)) < 0.6, String(got.at[2]));
  assert.ok(got.at[3] >= got.at[2]);
  assert.equal(alignHeard(turns, []), null);
});
