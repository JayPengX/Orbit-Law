// A recording or a live channel kept playing in a <video> (or an <audio>): the phone's own HLS where it has it
// (Safari), else hls.js; an MP4 or MP3 as it is.
//
// Why (2026-11-11, Jay: 新竹縣議會's videos often got stuck): HiNet's OTT (新竹縣, 苗栗) cuts its recordings into
// 2-second pieces, each made by its server the first time anyone asks (x-cache MISS: ~0.4 s more before the first
// byte), one 3 Mbps size only. A player fetching them one after the other barely keeps ahead of the picture, and
// a slow piece left it waiting for good: nothing ever asked again. So:
//  - a watchdog: playing but not moving for STUCK_MS, it nudges, then loads the stream again where it was
//    (backing off, waiting for the network to come back), and gives up only after MAX_TRIES (`onState('failed')`);
//  - hls.js asks a slow or failed piece again and comes back from a fatal error by itself;
//  - warming: the pieces of the next WARM_AHEAD seconds are asked ahead, one byte each, so the CDN has them made
//    when the player asks (short pieces only, recordings only; nothing is downloaded twice).
// Straight from the council's own CDN; never through Orbit's servers.

export const HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
export const STUCK_MS = 8_000;
// Before the first picture: loaded again only after this long with nothing at all coming. A long recording's first
// answer can take that long (Jay 11-15: "it successfully load the player but just can't start playing but shorter
// video load instantly"): 新竹縣's HiNet and 臺北市's own server (both Wowza) cut a recording into HLS the first
// time it's asked for, longer for a longer one; loaded again at 20 s, it started over every time and never played.
export const FIRST_MS = 90_000;
export const MAX_TRIES = 6;
// An iPhone's own player asked to play a recording and still without a picture this long after (Jay 11-17: 新竹縣's
// 40-minute recordings stuck at 0:00, shorter ones and Chromium fine): hls.js takes over, through the
// ManagedMediaSource iOS 17.1+ gives it, as Chromium plays them. Apple's player waits until it reckons the
// download keeps ahead of the whole recording, and HiNet makes each 2-second piece only when it's first asked
// for, so for a long recording it may wait for good; hls.js starts on the first pieces.
export const NATIVE_FIRST_MS = 10_000;
export const WARM_AHEAD = 40;
export const WARM_AT_ONCE = 3;
// Pieces this short are the ones a player can fall behind on.
export const SHORT_PIECES = 4;
// A picture that can't be decoded (新竹縣's recordings carry a broken frame now and then, ~3 s in on 2026-10-19's:
// Chrome stops dead on it): loaded again this many seconds past it.
export const SKIP_BAD = 2.5;

// The wait before load number n (1, 2, …) again: 1 s, 2 s, 4 s … at most 15 s.
export const backoff = n => Math.min(15_000, 1000 * 2 ** Math.max(0, n - 1));

const isFile = url => /\.(mp4|m4v|mov|webm|mp3|m4a|aac|wav|ogg)(\?|#|$)/i.test(url) && !/\.m3u8/i.test(url);

// An HLS playlist read: a master's variants (by bandwidth, as listed) or a media playlist's pieces.
export function readPlaylist(text, base) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim());
  const abs = u => {
    try {
      return new URL(u, base).href;
    } catch {
      return u;
    }
  };
  if (lines.some(l => l.startsWith('#EXT-X-STREAM-INF'))) {
    const variants = [];
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
      const bw = +(lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || 0;
      const uri = lines.slice(i + 1).find(l => l && !l.startsWith('#'));
      if (uri) variants.push({ bw, url: abs(uri) });
    }
    return { variants };
  }
  const target = +(lines.find(l => l.startsWith('#EXT-X-TARGETDURATION:')) || '').split(':')[1] || 0;
  const pieces = [];
  let at = 0;
  let dur = 0;
  for (const l of lines) {
    if (l.startsWith('#EXTINF:')) dur = parseFloat(l.slice(8)) || 0;
    else if (l && !l.startsWith('#')) {
      pieces.push({ url: abs(l), at, dur });
      at += dur;
      dur = 0;
    }
  }
  return { target, ended: lines.includes('#EXT-X-ENDLIST'), pieces };
}

// The pieces to warm from `t`: those starting before t + ahead and ending after t, not warmed yet.
export function warmList(pieces, t, done, ahead = WARM_AHEAD) {
  return pieces.filter(p => p.at + p.dur > t && p.at < t + ahead && !done.has(p.url)).map(p => p.url);
}

// Whether a stream is worth warming: a recording (ENDLIST) in short pieces.
export const warmable = pl => !!(pl?.ended && pl.pieces?.length && pl.target && pl.target <= SHORT_PIECES);

let hlsJs = null;
const loadHlsJs = () =>
  (hlsJs ||= window.Hls
    ? Promise.resolve()
    : new Promise((ok, no) => {
        const sc = document.createElement('script');
        sc.src = HLS_JS;
        sc.onload = ok;
        sc.onerror = () => ((hlsJs = null), sc.remove(), no(new Error('hls.js')));
        document.head.append(sc);
      }));

// hls.js asked to be patient with a slow piece and to ask a failed one again (its defaults give up sooner).
const HLS_CONFIG = {
  maxBufferLength: 60,
  // (A long recording's playlist is made when first asked for: waited on, FIRST_MS.)
  manifestLoadPolicy: { default: { maxTimeToFirstByteMs: 90_000, maxLoadTimeMs: 120_000, timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 }, errorRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } },
  playlistLoadPolicy: { default: { maxTimeToFirstByteMs: 90_000, maxLoadTimeMs: 120_000, timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 }, errorRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } },
  fragLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs: 40_000,
      timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 }
    }
  }
};

// Plays `url` in `v` and keeps it playing until `v` leaves the page (or stop()).
// opts: live (a channel: loaded again at its live edge, never warmed), at (seconds to start from),
// onState(s): 'retry' while it's being brought back, 'ok' once it moves again, 'failed' when it gave up.
// Resolves once the source is set (Safari's at once, so play() can follow within the tap); rejects only if
// nothing on this phone can play it.
export async function keepPlaying(v, url, { live = false, at = 0, onState = () => {}, log = () => {} } = {}) {
  const t0 = Date.now();
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return '';
    }
  })();
  let native = isFile(url) || !!v.canPlayType?.('application/vnd.apple.mpegurl');
  // (Apple's player can hand a recording to hls.js: a stream, not a file or a channel, on a phone with ManagedMediaSource.)
  let canSwap = !isFile(url) && !live && native && typeof globalThis.ManagedMediaSource === 'function';
  let askedAt = v.paused === false ? t0 : 0;
  let hls = null;
  let stopped = false;
  let tries = 0;
  let lastT = -1;
  let movedAt = Date.now();
  let started = false;
  let startT = 0;
  let shown10 = false;
  let stalls = 0;
  let resumeAt = at > 0 ? at : 0;
  let waitTimer = 0;
  let state = 'ok';
  const say = s => s !== state && ((state = s), log(s, { host, ms: Date.now() - t0, t: Math.round(v.currentTime || 0) }), onState(s));

  const attach = async () => {
    if (native) {
      v.src = url;
      return;
    }
    await loadHlsJs();
    if (!window.Hls?.isSupported?.()) throw new Error('no hls');
    hls?.destroy();
    hls = new window.Hls({ ...HLS_CONFIG, ...(resumeAt > 0 ? { startPosition: resumeAt } : {}) });
    hls.on(window.Hls.Events.ERROR, (_, d) => {
      if (!d?.fatal || stopped) return;
      // A dead network: hls.js asks again on its own after startLoad; a broken picture: recoverMediaError;
      // anything else: the stream loaded anew, where it was.
      if (d.type === window.Hls.ErrorTypes.NETWORK_ERROR) setTimeout(() => !stopped && hls?.startLoad(), backoff(++tries));
      // (A picture the phone can't decode is the element's error: passed over there.)
      else if (d.type === window.Hls.ErrorTypes.MEDIA_ERROR) v.error?.code !== 3 && hls.recoverMediaError();
      else reload();
    });
    hls.loadSource(url);
    hls.attachMedia(v);
  };

  // Loaded again where it was (a recording) or at the live edge, then played.
  const reload = (skip = 0) => {
    if (stopped || waitTimer) return;
    if (++tries > MAX_TRIES) return say('failed'), stop();
    say('retry');
    if (!live && v.currentTime > 1) resumeAt = v.currentTime;
    if (!live && skip) resumeAt += skip;
    const go = () => {
      waitTimer = 0;
      if (stopped) return;
      // Offline: wait for the network to come back (the try is not counted twice).
      if (navigator.onLine === false) return void (waitTimer = setTimeout(go, 2000));
      movedAt = Date.now();
      attach()
        .then(() => v.play?.()?.catch(() => {}))
        .catch(() => reload());
    };
    waitTimer = setTimeout(go, backoff(tries));
  };

  // Native: the place to start from, once the stream says how long it is.
  v.addEventListener('loadedmetadata', () => {
    if (native && !live && resumeAt > 0 && Math.abs(v.currentTime - resumeAt) > 2) v.currentTime = resumeAt;
  });
  v.addEventListener('error', () => !stopped && v.getAttribute('src') !== null && reload(v.error?.code === 3 ? SKIP_BAD : 0));
  v.addEventListener('playing', () => started || ((started = true), (startT = v.currentTime || 0), log('first', { host, ms: Date.now() - t0 })));
  // (A stall after the first picture, in 除錯紀錄 too: where and how long in.)
  for (const ev of ['stalled', 'waiting']) v.addEventListener(ev, () => started && stalls++ < 5 && log(ev, { host, ms: Date.now() - t0, t: Math.round(v.currentTime || 0) }));
  // (Before the first picture, anything coming is life: the wait counted from there.)
  for (const ev of ['progress', 'loadedmetadata', 'loadeddata', 'canplay']) v.addEventListener(ev, () => started || (movedAt = Date.now()));
  v.addEventListener('emptied', () => (started = false));
  v.addEventListener('play', () => started || askedAt || (askedAt = Date.now()));
  // Apple's player still without a picture: hls.js from here (once; it can't, Apple's again).
  const swap = () => {
    canSwap = false;
    native = false;
    log('mse', { host, ms: Date.now() - t0 });
    v.removeAttribute?.('src');
    v.load?.();
    // (ManagedMediaSource opens only with AirPlay off for the element.)
    v.disableRemotePlayback = true;
    movedAt = Date.now();
    attach()
      .then(() => v.play?.()?.catch(() => {}))
      .catch(() => {
        native = true;
        v.src = url;
        v.play?.()?.catch(() => {});
      });
  };

  // The watchdog: playing (not paused by the reader), yet the picture hasn't moved.
  let nudged = false;
  let moving = 0;
  const tick = setInterval(() => {
    if (stopped) return;
    if (!v.isConnected) return stop();
    const t = v.currentTime;
    const now = Date.now();
    // Paused by the reader: left alone. (Paused while being brought back, or by an error: still stuck.)
    if (v.ended || (v.paused && state !== 'retry' && !v.error)) return void ((lastT = t), (movedAt = now), (moving = 0));
    if (t !== lastT) {
      lastT = t;
      movedAt = now;
      nudged = false;
      if (state === 'retry' && started) say('ok');
      // (In 除錯紀錄: it really moved, ten seconds in.)
      if (started && !shown10 && t - startT >= 10) (shown10 = true), log('moving', { host, ms: Date.now() - t0, t: Math.round(t) });
      // Twenty seconds moving: a fresh start for the tries.
      if (++moving >= 20) tries = 0;
      return warm(t);
    }
    moving = 0;
    if (canSwap && !started && !v.paused && askedAt && now - askedAt >= NATIVE_FIRST_MS) return swap();
    if (now - movedAt < (started ? STUCK_MS : FIRST_MS)) return warm(t);
    movedAt = now;
    // First a nudge (a recording: a hair forward; hls.js: its own way back); still stuck: loaded again.
    if (!nudged && started && !live) {
      nudged = true;
      if (hls) hls.recoverMediaError(), hls.startLoad(Math.max(0, t));
      else v.currentTime = t + 0.1;
      // (The nudge's own step forward isn't the picture moving.)
      lastT = v.currentTime;
      return;
    }
    reload();
  }, 1000);

  // Warming the next pieces at the CDN (recordings in short pieces; the playlist read once).
  const warmed = new Set();
  let pieces = null;
  let busy = 0;
  if (!live && !isFile(url)) {
    (async () => {
      try {
        let pl = readPlaylist(await fetch(url, { cache: 'no-store' }).then(r => r.text()), url);
        // One size only: its pieces are the ones played (more than one: the player picks, nothing warmed).
        if (pl.variants) pl = pl.variants.length === 1 ? readPlaylist(await fetch(pl.variants[0].url).then(r => r.text()), pl.variants[0].url) : null;
        if (warmable(pl)) (pieces = pl.pieces), warm(Math.max(v.currentTime || 0, resumeAt));
      } catch {}
    })();
  }
  function warm(t) {
    // (Only once it plays: before, the player's own first pieces come first.)
    if (!pieces || !started || stopped || navigator.onLine === false) return;
    for (const u of warmList(pieces, t, warmed)) {
      if (busy >= WARM_AT_ONCE) break;
      warmed.add(u);
      busy++;
      fetch(u, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' })
        // (Its one byte read, not the body cancelled: Safari's cancel threw "The operation was aborted" unhandled, 11-15.)
        .then(r => r.arrayBuffer())
        .catch(() => warmed.delete(u))
        .finally(() => busy--);
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(tick);
    clearTimeout(waitTimer);
    hls?.destroy();
    hls = null;
  }

  await attach();
  return { stop };
}
