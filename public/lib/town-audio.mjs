// A day's 總質詢 transcript set against its recording, by code (no AI, no speech recognition): the build
// finds where the recording is quiet and who is speaking by their voice's pitch (the recording decoded by ffmpeg) and lays the turns over the speech in between,
// each turn as long as its words take to say, each change of speaker at a pause. The phone then plays a turn
// from where it starts and follows the recording turn by turn.
//
//   silences(pcm)                  → [[start, end], …] the quiet stretches, in seconds
//   speech(sil, dur)               → [[start, end], …] the stretches with sound
//   voices(spans, pcm)             → the spans with each one's pitch
//   alignTurns(turns, spans)       → each turn's start, in seconds (turns: [{ n: characters, w: who }])
//   alignDay(turns, pcm)           → the same for a day's turns ({ t, w }) and its decoded recording
//   turnAt(at, t)                  → the turn playing at second t

// The quiet stretches of a recording (`pcm`: 16-bit mono samples at `sr`), at least `min` seconds each: 50 ms frames
// quieter than the room's own level, set from the recording itself (its quietest tenth and its loudest fifth: a quiet
// room and a loud one alike).
export function silences(pcm, sr = 8000, min = 0.6) {
  const W = Math.round(sr / 20);
  const db = [];
  for (let s = 0; s + W <= pcm.length; s += W) {
    let e = 0;
    for (let i = 0; i < W; i++) e += pcm[s + i] * pcm[s + i];
    db.push(10 * Math.log10(e / W / 2 ** 30 + 1e-12));
  }
  if (!db.length) return [];
  const sorted = [...db].sort((x, y) => x - y);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const loud = sorted[Math.floor(sorted.length * 0.8)];
  const cut = floor + 0.6 * (loud - floor);
  const out = [];
  let open = -1;
  for (let i = 0; i <= db.length; i++) {
    const q = i < db.length && db[i] < cut;
    if (q && open < 0) open = i;
    else if (!q && open >= 0) {
      if ((i - open) / 20 >= min) out.push([open / 20, i / 20]);
      open = -1;
    }
  }
  return out;
}

// The stretches between the silences, the shortest blips (a cough, a click under 0.3 s) left out.
export function speech(sil, dur) {
  const out = [];
  let at = 0;
  for (const [a, b] of sil) {
    if (a - at >= 0.3) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (dur - at >= 0.3) out.push([at, dur]);
  return out;
}

// Each stretch's voice: the median pitch (Hz) of its voiced moments, 0 where there are too few. `pcm` is the
// recording as 16-bit mono samples at `sr` (8000 is plenty); pitch is found by autocorrelation, 70 to 400 Hz, in
// 50 ms frames. A man chairing between two women's turns is the clearest mark a change of turn leaves.
export function voices(spans, pcm, sr = 8000) {
  const W = Math.round(sr / 20);
  const lo = Math.floor(sr / 400);
  const hi = Math.ceil(sr / 70);
  const f0 = at => {
    const s = Math.round(at * sr);
    if (s + W + hi >= pcm.length) return 0;
    let r0 = 0;
    for (let i = 0; i < W; i++) r0 += pcm[s + i] * pcm[s + i];
    if (r0 < W * 300 * 300) return 0;
    let best = 0;
    let lag = 0;
    for (let l = lo; l <= hi; l++) {
      let r = 0;
      for (let i = 0; i < W; i++) r += pcm[s + i] * pcm[s + i + l];
      if (r > best) (best = r), (lag = l);
    }
    return best / r0 > 0.5 ? sr / lag : 0;
  };
  return spans.map(([a, b]) => {
    const fs = [];
    for (let t = a; t < b; t += 0.1) {
      const f = f0(t);
      if (f) fs.push(f);
    }
    fs.sort((x, y) => x - y);
    return [a, b, fs.length >= 6 ? Math.round(fs[fs.length >> 1]) : 0];
  });
}

// Each turn's start on the recording (turns: [{ n: its characters, w: who said it }], spans: [[start, end, pitch?]]).
// The turns follow each other over the stretches of speech: a change of turn goes in a pause (between two stretches),
// and each turn takes about as much speaking time as its characters at the day's own pace (the day's characters over
// its speaking time). Dynamic programming over (turn, pause): the cost of a turn is how far its speaking time is from
// its share, less a little for ending in a longer pause (where a speaker hands over). Then, where the stretches carry
// their pitch, once more with each speaker's own voice (their pitch over the stretches the first pass gave them): a
// stretch in someone else's voice costs. The recording's first and last stretches may be before and after the
// meeting (a mic check, the room emptying): the transcript is laid from the stretch that fits best.
export function alignTurns(turns, spans) {
  const T = turns.length;
  const G = spans.length;
  if (!T || !G) return [];
  const lens = turns.map(t => Math.max(1, t.n || 0));
  // Speech before each stretch, and each pause's length (pause k is before stretch k; k = 0 the recording's start).
  const pre = [0];
  for (const [a, b] of spans) pre.push(pre.at(-1) + (b - a));
  const gap = spans.map(([a], k) => (k ? a - spans[k - 1][1] : 99));
  const rate = pre[G] / lens.reduce((n, l) => n + l, 0);
  const want = lens.map(l => l * rate);
  const lead = Math.max(1, Math.floor(G / 5));
  const INF = 1e18;
  const bonus = k => (k >= G ? 0 : Math.log1p(Math.min(gap[k], 20)) * 2);
  // (Speech left before the first turn or after the last costs a point a second: more than a long pause is worth.)
  const outside = s => s * 0.3;
  const pass = off => {
    // off(i): prefix sums over stretches of how far each is from turn i's speaker's voice (null: no voice known).
    let prev = new Float64Array(G + 1).fill(INF);
    const from = [];
    // (The meeting starting after a long pause is likely, as a turn ending in one is.)
    for (let k = 0; k <= lead && k < G; k++) prev[k] = outside(pre[k]) - (k ? bonus(k) : 0);
    for (let i = 0; i < T; i++) {
      const next = new Float64Array(G + 1).fill(INF);
      const back = new Int32Array(G + 1).fill(-1);
      const v = off(i);
      const most = want[i] * 4 + 60;
      for (let a = 0; a <= G; a++) {
        if (prev[a] >= INF) continue;
        for (let b = a; b <= G && pre[b] - pre[a] <= most; b++) {
          const d = pre[b] - pre[a];
          const c = prev[a] + (d - want[i]) ** 2 / (want[i] + 8) - (b > a ? bonus(b) : 0) + (v ? (v[b] - v[a]) * 2 : 0);
          if (c < next[b]) (next[b] = c), (back[b] = a);
        }
      }
      from.push(back);
      prev = next;
    }
    let end = -1;
    let best = INF;
    for (let k = Math.max(0, G - lead); k <= G; k++) {
      const c = prev[k] + outside(pre[G] - pre[k]);
      if (c < best) (best = c), (end = k);
    }
    if (end < 0) return null;
    const starts = new Array(T + 1);
    starts[T] = end;
    for (let i = T - 1, k = end; i >= 0; i--) k = starts[i] = from[i][k];
    return starts;
  };
  let starts = pass(() => null);
  if (!starts) return [];
  // Each speaker's voice: the median pitch over their stretches, longer stretches counting more.
  if (spans.some(s => s[2])) {
    const by = new Map();
    for (let i = 0; i < T; i++)
      for (let k = starts[i]; k < starts[i + 1]; k++) if (spans[k][2]) by.set(turns[i].w, [...(by.get(turns[i].w) || []), [spans[k][2], spans[k][1] - spans[k][0]]]);
    const voice = new Map();
    for (const [w, xs] of by) {
      xs.sort((x, y) => x[0] - y[0]);
      const half = xs.reduce((n, x) => n + x[1], 0) / 2;
      let n = 0;
      voice.set(w, xs.find(x => (n += x[1]) >= half)[0]);
    }
    const sums = new Map();
    const off = i => {
      const f = voice.get(turns[i].w);
      if (!f) return null;
      if (!sums.has(f)) {
        const v = new Float64Array(G + 1);
        for (let k = 0; k < G; k++) v[k + 1] = v[k] + (spans[k][2] ? Math.min(Math.abs(Math.log(spans[k][2] / f)), 0.7) * (spans[k][1] - spans[k][0]) : 0);
        sums.set(f, v);
      }
      return sums.get(f);
    };
    starts = pass(off) || starts;
  }
  // A turn's start: its first stretch's start, a breath (0.4 s) before it. Turns with no stretch of their own (said in
  // the same breath as the next) start there too, one after the other at the day's pace.
  const out = new Array(T);
  for (let i = 0; i < T; i++) {
    const a = starts[i];
    const at = a < G ? Math.max(0, spans[a][0] - 0.4) : spans[G - 1][1];
    out[i] = i && starts[i - 1] === a ? out[i - 1] + lens[i - 1] * rate : at;
  }
  return out.map(round);
}
const round = x => Math.round(x * 10) / 10;

// A day of 總質詢 on its recording (`pcm`: 16-bit mono at `sr`): each turn's start in seconds. A turn the transcript
// marks with a wait (〜: 「有沒有要詢問的？〜來，請何宜芯代表。」) is laid as its parts, the turn starting at its first.
export function alignDay(turns, pcm, sr = 8000) {
  const dur = pcm.length / sr;
  const spans = voices(speech(silences(pcm, sr), dur), pcm, sr);
  const parts = [];
  const first = [];
  for (const t of turns) {
    first.push(parts.length);
    for (const x of String(t.t || '').split(/〜+/)) if (x.trim() || x === t.t) parts.push({ n: x.trim().length, w: t.w });
  }
  const at = alignTurns(parts, spans);
  return at.length ? first.map(i => at[i]) : [];
}

// The turn playing at second t (the last that started by then).
export function turnAt(at, t) {
  let lo = 0;
  let hi = at.length - 1;
  if (hi < 0 || t < at[0]) return -1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (at[m] <= t) lo = m;
    else hi = m - 1;
  }
  return lo;
}

// A day of 總質詢 in blocks, each a member's questions on one topic with the answers (the paper's asks: { w, from, to,
// gist }), every turn in one block: the opening before the first is its own block, and turns between two asks (the
// chair calling the next) go with the one before.
export function askBlocks(p) {
  const turns = p?.turns || [];
  const asks = (p?.asks || []).map((a, n) => ({ ...a, n })).filter(a => a.from >= 0 && a.to >= a.from && a.to < turns.length).sort((a, b) => a.from - b.from);
  const out = [];
  if (!turns.length) return out;
  if (!asks.length) return [{ n: -1, from: 0, to: turns.length - 1 }];
  if (asks[0].from > 0) out.push({ n: -1, from: 0, to: asks[0].from - 1 });
  asks.forEach((a, i) => out.push({ ...a, to: i + 1 < asks.length ? Math.max(a.to, asks[i + 1].from - 1) : turns.length - 1 }));
  return out;
}

// The words to show for a turn's time on its recording: 1:02:05, 12:34.
export const clock = s => {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const x = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
};

// What a member's questions are about, by code: the places and things named in what they asked (仁義市場, 水圳公園,
// 停車場車位顯示器, 116年度總預算), the first few, from the member's own turns. → ['仁義市場', '圍籬'] (none: []).
const THING = /(?:(?![的了是在有跟和也就要我你他們這那個說到想問請唷喔啊吼嗎呢把被讓給為對從及與或還很都已會可能一些如果但其實剛像近期現目前之後前面邊每條直下筆哎寫放化求欸議當])[㐀-鿿A-Za-z0-9]){0,4}(?:市場|公園|國小|國中|高中|幼兒園|托嬰中心|圖書館|活動中心|集會所|停車場|車位|顯示器|人行道|道路|路燈|號誌|標線|排水溝?|水圳|橋|街|路口|公廁|球場|運動中心|清潔隊|垃圾車?|資源回收|攤位|攤商|圍籬|預算|決算|工程|計畫|補助|活動|音樂節|故事節|祭|系統|網站|網路|長照|衛生所|托育|獎學金|里長|鄰長|宮廟|廟|墓|納骨塔|防災|淹水|路平|交通|公車|校園|宿舍|改版|整建|整修|修繕|招標|標案|採購|租金|轉讓金)/g;
const FILL = /^(這個|那個|一個|我們|你們|他們|就是|然後|其實|目前|現在|最近|今年|剛剛|剛好|有關|關於|針對|因為|所以|還有|以及|包含|包括|另外|那|這|的|在|也|有|跟|和|與|對|到|從|及|是|做|辦|說|要|會|再|請|讓|把|給|為|於|一下|一些|比較|已經|可以)+/;
export function topicWords(turns, max = 3) {
  const seen = new Set();
  const out = [];
  for (const t of turns) {
    for (const m of String(t || '').matchAll(THING)) {
      const w = m[0].replace(FILL, '').replace(/^的/, '');
      if (w.length < 2 || w.length > 10 || [...seen].some(x => x.includes(w) || w.includes(x))) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= max) return out;
    }
  }
  return out;
}
