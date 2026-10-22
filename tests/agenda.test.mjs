// 議程: a meeting is live only in its hours or while IVOD streams it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetState } from '../public/lib/agenda.mjs';

const s = { d: '2026-10-21', from: '09:00', to: '17:30' };
const at = hm => new Date(`2026-10-21T${hm}:00+08:00`);

test('a meeting’s state: IVOD’s word inside its hours, over after them', () => {
  const brk = { status: '11:23休息' };
  assert.equal(meetState(s, brk, at('11:40')), 'break');
  assert.equal(meetState(s, brk, at('21:50')), 'done', 'a break after its hours is over');
  assert.equal(meetState(s, brk, at('21:50'), false), 'done');
  assert.equal(meetState(s, { status: '11:23休息(10月22日繼續開會)' }, at('11:40')), 'done', 'continues another day');
  assert.equal(meetState(s, { status: '11:23休息(10月21日繼續開會)' }, at('11:40')), 'break');
  assert.equal(meetState(s, { status: '進行中' }, at('18:10')), 'live', 'an overrun while it streams');
  assert.equal(meetState(s, { status: '進行中' }, at('21:50'), false), 'done', 'old word: its hours decide');
  assert.equal(meetState(s, { status: '散會(12:16)' }, at('12:30')), 'done');
  assert.equal(meetState(s, null, at('10:00')), 'sched', 'no word from IVOD: never live on its hours alone');
  assert.equal(meetState(s, { status: '逐條討論', ch: 3 }, at('16:35'), false), 'sched', 'old word that it streamed');
  assert.equal(meetState(s, { status: '逐條討論', ch: 3 }, at('16:35')), 'live', 'streams on its channel');
  assert.equal(meetState(s, { status: '質詢(10:00截止登記)', ch: null }, at('16:35')), 'sched', 'listed, no channel');
  assert.equal(meetState(s, { status: '散會(11:56)' }, at('16:35'), false), 'done', 'old word that it rose still holds');
  assert.equal(meetState(s, null, at('08:00')), 'later');
  assert.equal(meetState(s, null, at('21:50')), 'done');
});
