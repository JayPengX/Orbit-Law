import test from 'node:test';
import assert from 'node:assert/strict';
import { readPlaylist, warmList, warmable, backoff, keepPlaying, STUCK_MS, FIRST_MS, MAX_TRIES } from '../public/lib/player.mjs';

const BASE = 'https://hcc-ott2b.cdn.hinet.net/vod_hcc/_definst_/smil:hcc/ch01_20261106162902/consult-hls-cl-pc.smil/playlist.m3u8';

test('a master playlist: its variants, made whole', () => {
  const pl = readPlaylist('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2998526,RESOLUTION=1280x720\nchunklist_b2998526.m3u8\n', BASE);
  assert.deepEqual(pl.variants, [{ bw: 2998526, url: BASE.replace('playlist.m3u8', 'chunklist_b2998526.m3u8') }]);
});

test('a media playlist: each piece, where it starts, whether it ends', () => {
  const pl = readPlaylist('#EXTM3U\n#EXT-X-TARGETDURATION:3\n#EXTINF:2.002,\nmedia_0.ts\n#EXTINF:2.003,\nmedia_1.ts\n#EXTINF:1.5,\nmedia_2.ts\n#EXT-X-ENDLIST\n', BASE);
  assert.equal(pl.target, 3);
  assert.equal(pl.ended, true);
  assert.equal(pl.pieces.length, 3);
  assert.equal(pl.pieces[2].at, 4.005);
  assert.match(pl.pieces[0].url, /consult-hls-cl-pc\.smil\/media_0\.ts$/);
  assert.equal(warmable(pl), true);
  // 高雄's 13-second pieces, or a live channel: nothing to warm.
  assert.equal(warmable({ ...pl, target: 18 }), false);
  assert.equal(warmable({ ...pl, ended: false }), false);
});

test('warming: the next pieces from where it plays, each once', () => {
  const pieces = Array.from({ length: 100 }, (_, i) => ({ url: `p${i}`, at: i * 2, dur: 2 }));
  const done = new Set(['p51']);
  const got = warmList(pieces, 101, done, 10);
  assert.deepEqual(got, ['p50', 'p52', 'p53', 'p54', 'p55']);
  assert.deepEqual(warmList(pieces, 500, done, 10), []);
});

test('backoff: 1 s, 2 s, 4 s … never past 15 s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(backoff), [1000, 2000, 4000, 8000, 15000, 15000]);
});

// Time passing a second at a time (a timer set inside another runs on time).
const run = (t, ms) => {
  for (let left = ms; left > 0; left -= 1000) t.mock.timers.tick(Math.min(1000, left));
};

// A <video> of Safari's kind (its own HLS), whose picture can be held still.
function fakeVideo() {
  const on = {};
  const v = {
    isConnected: true,
    paused: false,
    ended: false,
    currentTime: 0,
    loads: 0,
    canPlayType: () => 'maybe',
    addEventListener: (k, f) => (on[k] ||= []).push(f),
    getAttribute: () => v._src ?? null,
    play: () => Promise.resolve(),
    fire: k => (on[k] || []).forEach(f => f())
  };
  Object.defineProperty(v, 'src', { get: () => v._src, set: x => ((v._src = x), v.loads++) });
  return v;
}

test('a stuck recording (Jay 2026-11-11, 新竹縣議會): nudged, then loaded again where it was, then given up', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('offline in tests'));
  try {
    const v = fakeVideo();
    const states = [];
    await keepPlaying(v, BASE, { onState: s => states.push(s) });
    assert.equal(v.loads, 1);
    // It plays for a while…
    v.fire('playing');
    for (let i = 1; i <= 30; i++) (v.currentTime = i), run(t, 1000);
    // …then the picture holds still: a nudge a hair forward, no new load.
    run(t, STUCK_MS + 1000);
    assert.ok(v.currentTime > 30 && v.currentTime < 31, 'nudged forward');
    assert.equal(v.loads, 1);
    // Still stuck: the stream loaded again, from where it was.
    const at = v.currentTime;
    run(t, STUCK_MS + 1000);
    run(t, 1000);
    assert.equal(v.loads, 2);
    assert.deepEqual(states, ['retry']);
    v.currentTime = 0;
    v.fire('loadedmetadata');
    assert.equal(v.currentTime, at, 'back where it was');
    // Moving again: said so.
    v.fire('playing');
    v.currentTime = at + 1;
    run(t, 1000);
    assert.deepEqual(states, ['retry', 'ok']);
    // Never moving again: tried MAX_TRIES times in all, then given up.
    for (let i = 0; i < 400 && !states.includes('failed'); i++) run(t, 1000);
    assert.equal(states.at(-1), 'failed');
    assert.ok(v.loads <= MAX_TRIES + 1, `loaded ${v.loads} times`);
    // Given up: nothing more happens.
    const n = v.loads;
    run(t, 60_000);
    assert.equal(v.loads, n);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('paused by the reader, or not started yet: left alone', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('offline in tests'));
  try {
    const v = fakeVideo();
    v.paused = true;
    await keepPlaying(v, BASE);
    run(t, 120_000);
    assert.equal(v.loads, 1);
    // Playing but its first picture slow to come: given FIRST_MS before a second load.
    v.paused = false;
    run(t, FIRST_MS - 2000);
    assert.equal(v.loads, 1);
    run(t, 5000);
    assert.equal(v.loads, 2);
    // Closed (the sheet gone): stops.
    v.isConnected = false;
    run(t, 120_000);
    assert.equal(v.loads, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a broken source (error): loaded again after a wait', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const v = fakeVideo();
  await keepPlaying(v, 'https://example.com/a.mp4');
  v.fire('error');
  run(t, 999);
  assert.equal(v.loads, 1);
  run(t, 10);
  assert.equal(v.loads, 2);
});

test('paused by a failed load while being brought back: still brought back (not taken as the reader pausing)', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const v = fakeVideo();
  const states = [];
  await keepPlaying(v, 'https://example.com/a.mp4', { onState: s => states.push(s) });
  v.fire('error');
  run(t, 2000);
  assert.equal(v.loads, 2);
  // The new load failed too and left it paused.
  v.paused = true;
  run(t, FIRST_MS + 5000);
  assert.ok(v.loads >= 3, `loaded ${v.loads} times`);
  assert.equal(states[0], 'retry');
});
