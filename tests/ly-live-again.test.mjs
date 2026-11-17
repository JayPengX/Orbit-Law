// What IVOD streams was read once a visit: Law opened at 08:30, a committee
// streaming at 10:05 still showed 「今天 8 場會議 · 9:00 開始」 on 首頁 and
// 「IVOD 現在沒有播這場」 with no video on its page (proven 11-18 with IVOD's
// answer changed from 尚未開始 to 進行中 between the two).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
const agenda = src.slice(src.indexOf('const agendaData = '), src.indexOf('const ROOM_SHORT'));

test('the live rooms are read again once a minute has gone, apart from the day’s agenda', () => {
  assert.match(src, /const LIVE_MS = 60_000;/);
  assert.match(src, /const liveRooms = \(\) => \(lyLive && Date\.now\(\) - lyLive\.at < LIVE_MS \? lyLive : \(lyLive = \{ at: Date\.now\(\), p: liveData\(\) \}\)\)\.p;/);
  // (Never kept inside the agenda read once a visit.)
  assert.doesNotMatch(agenda, /a\.live = /);
  assert.match(agenda, /Promise\.all\(\[meets, liveRooms\(\)\]\)/);
  // A new day reads its meetings again.
  assert.match(agenda, /if \(lyAgendaDay !== day\) \(lyAgenda = null\), \(lyAgendaDay = day\);/);
});

test('back on the screen, 首頁’s 立法院 line and 議程 are drawn again', () => {
  const on = src.slice(src.indexOf('// Back on the screen: 首頁'), src.indexOf('// Back on the screen: 首頁') + 500);
  assert.match(on, /state\.tab === 'home' && \$\('home-ly'\)\) fillLy\(\)/);
  assert.match(on, /billFilter === 'agenda' && billStep < 0 && \$\('bill-list'\)\) agendaList\(\$\('bill-list'\)\)/);
});
