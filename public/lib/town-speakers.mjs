// A 代表會 recording with no transcript, heard by speech recognition (scripts/asr.py), made into turns by code: who
// speaks is read only from the meeting's fixed forms, and a name counts only when it is one of the 代表會's own
// members (scripts/town-roster.json, from 中選會), else the turn says only the role, or nothing. Never a guess.
//   fixTerms(chars, vocab) → chars with misheard proper names (members, 村里, 村里長, the session's own words) put
//     right where their sound matches (pinyin from asr.py; zh/z, ch/c, sh/s, n/l, -ng/-n heard alike)
//   heardTurns(words, { members, chair, pitchOf, vocab }) → [{ w, r, at, t }] (w: a member's name or '', r: 主席 | 代表 |
//     a title | 公所 | ''). pitchOf(a, b): the voice's median pitch over that stretch (lib/town-audio.mjs voices), so a
//     member and an official going back and forth with no word between them are told apart; a voice like neither: ''.
// chars: [{ c, t, py? }] (each character heard, its time, its pinyin); words: [[start, end, text, py?]].

// Syllables as a Taiwanese ear hears them alike.
export const soundOf = py =>
  String(py || '')
    .toLowerCase()
    .replace(/[^a-zü]/g, '')
    .replace(/^zh/, 'z')
    .replace(/^ch/, 'c')
    .replace(/^sh/, 's')
    .replace(/^n(?=[aeiouü])/, 'l')
    .replace(/ng$/, 'n');

export function charsOf(words) {
  const out = [];
  for (const [s, e, w, py] of words || []) {
    const cs = [...String(w || '')];
    const ps = Array.isArray(py) ? py : [];
    cs.forEach((c, j) => out.push({ c, t: +(s + ((e - s) * j) / Math.max(1, cs.length)).toFixed(2), py: ps[j] || '' }));
  }
  return out;
}

// A run of characters that sounds like a word of the meeting's own (3 characters or more), written as that word.
// vocab: { term: [pinyin of each character] }.
export function fixTerms(chars, vocab = {}) {
  const terms = Object.entries(vocab)
    .filter(([t, py]) => [...t].length >= 3 && py?.length === [...t].length)
    .map(([t, py]) => ({ t: [...t], s: py.map(soundOf) }))
    .sort((a, b) => b.t.length - a.t.length);
  const byFirst = new Map();
  for (const x of terms) (byFirst.get(x.s[0]) || byFirst.set(x.s[0], []).get(x.s[0])).push(x);
  const out = chars.map(x => ({ ...x }));
  for (let i = 0; i < out.length; i++) {
    for (const x of byFirst.get(soundOf(out[i].py)) || []) {
      const L = x.t.length;
      if (i + L > out.length) continue;
      let same = true;
      let differ = false;
      for (let k = 0; k < L && same; k++) {
        if (soundOf(out[i + k].py) !== x.s[k] && out[i + k].c !== x.t[k]) same = false;
        if (out[i + k].c !== x.t[k]) differ = true;
      }
      if (!same) continue;
      if (differ) for (let k = 0; k < L; k++) out[i + k].c = x.t[k];
      i += L - 1;
      break;
    }
  }
  return out;
}

const OFFICIAL = '課長|所長|主任秘書|主任|主秘|秘書|市長|鎮長|鄉長|隊長|館長|主計|技士|校長|局長|委員';
// The chair's call of the next speaker: 「來，我們請張美珠代表」「再請邵所長來答覆」「請民政課長說明」.
const CALL = new RegExp(`(?:好|來|那|OK)?[，, ]*(?:謝謝[^，,。！？]{0,8}?[，, ]*)?(?:來[，, ]*)?(?:我們)?(?:再)?請(?:我們)?(?:的)?([^，,。！？請\s]{0,8}?)(代表|副主席|${OFFICIAL})`, 'g');
// (A member asking for an answer is not the chair calling: 「可以再請所長說明嗎」.)
const ASKING = /(?:可以|能否|能不能|想|要|是否|希望|麻煩|有沒有)[^，,。]{0,2}$/;
// (「請市長管理所我們邵所長」: the office misheard as a title; the last title of the call is the one.)
const LATER_TITLE = new RegExp(`^[^，,。！？\\s請]{0,8}?(代表|${OFFICIAL})`);
// A member taking the floor: 「謝謝主席」「主席、市長、…」; an official answering: 「感謝張代表的關心」「感謝林主席」.
const MEMBER_OPEN = /^(?:好[，, ]*)?(?:(?:謝謝|感謝)(?:大會)?[^，,。]{0,3}主席|主席[、，, ])/;
const OFFICIAL_OPEN = /^(?:好[，, ]*)?(?:(?:謝謝|感謝)[^，,。]{0,6}(?:主席|代表)|大會主席)/;
const REPORT_END = /以上(?:報告|說明)/;
// An answer begun without a call heard: 「那感謝張代表的關心」; a call to answer whose title was misheard: 「請所總回答」.
const ANSWER_OPEN = /^(?:好[，, ]*)?(?:那)?(?:感謝|謝謝)[^，,。]{0,4}代表(?:的)?(?:關心|指教|質詢|提問|意見)/;
const ASK_ANSWER = /^(?:好|來|那)?[，, ]*(?:我們)?(?:再)?請[^，,。！？\s]{1,6}?(?:來)?(?:回答|答覆|回覆|說明)/;
// The chair between speakers: 「好，謝謝我們所長」「來，」「謝謝啦，你先請坐」, short.
const CHAIR_LINE = /^(?:好[，, ]*謝謝|謝謝啦|來[，, ]|好[，, ]*來|好[，, ]*我們)/;

// A name said with a title, snapped to the members: the whole name, or a surname or given name only one member has.
export function memberOf(said, members, sounds = []) {
  const x = String(said || '').replace(/^(?:我們|的|那個|這個)+/, '');
  if (!x) return '';
  const names = members.map(m => m.n);
  if (names.includes(x)) return x;
  const s = sounds.map(soundOf);
  const like = (n, part) => {
    const want = [...n].slice(part === 'given' ? 1 : 0, part === 'sur' ? 1 : undefined);
    if (want.length !== [...x].length) return false;
    return want.every((c, k) => c === [...x][k] || (s[k] && memberSounds.get(n)?.[(part === 'given' ? 1 : 0) + k] === s[k]));
  };
  const memberSounds = new Map(members.map(m => [m.n, (m.py || []).map(soundOf)]));
  for (const part of [[...x].length === 1 ? 'sur' : [...x].length === 2 ? 'given' : 'full']) {
    const hit = names.filter(n => like(n, part));
    if (hit.length === 1) return hit[0];
  }
  return '';
}

export function heardTurns(words, { members = [], chair = '', pitchOf = null, vocab = null } = {}) {
  const chars = vocab ? fixTerms(charsOf(words), vocab) : charsOf(words);
  // Pieces: a pause of 0.8 s, and before each call, splits what was heard.
  const pieces = [];
  let cur = null;
  chars.forEach((x, i) => {
    if (!cur || x.t - chars[i - 1].t > 0.8 + 0.25) {
      cur = { at: x.t, cs: [] };
      pieces.push(cur);
    }
    cur.cs.push(x);
  });
  const split = [];
  for (const p of pieces) {
    const text = p.cs.map(x => x.c).join('');
    const cuts = new Set([0]);
    // (A cut after a call or 以上報告 takes the punctuation after it along.)
    const past = e => {
      while (e < text.length && /[，,。！？、；\s]/.test(text[e])) e++;
      return e;
    };
    for (const m of text.matchAll(CALL)) {
      if (ASKING.test(text.slice(Math.max(0, m.index - 6), m.index))) continue;
      const more = m[2] !== '代表' ? LATER_TITLE.exec(text.slice(m.index + m[0].length)) : null;
      cuts.add(m.index);
      cuts.add(past(m.index + m[0].length + (more ? more[0].length : 0)));
    }
    for (const m of text.matchAll(/(?:謝謝|感謝)(?:大會)?[^，,。]{0,3}主席|以上(?:報告|說明)/g)) {
      cuts.add(m.index);
      if (/^以上/.test(m[0])) cuts.add(past(m.index + m[0].length));
    }
    const at = [...cuts].filter(k => k < p.cs.length).sort((a, b) => a - b);
    at.forEach((k, j) => {
      const cs = p.cs.slice(k, at[j + 1] ?? p.cs.length);
      if (cs.length) split.push({ at: cs[0].t, end: cs[cs.length - 1].t + 0.3, cs, text: cs.map(x => x.c).join('') });
    });
  }
  // Who speaks: the chair calls (that piece the chair's), the one called opens; an answer ends with 以上報告.
  const turns = [];
  let called = null;
  let who = { w: '', r: '' };
  // (Who holds the floor: the member called last; after an answer or the chair's word, the floor's again.)
  let floor = null;
  let answering = null;
  // (Each voice's pitch, by who was heard: a stretch whose voice is far from the speaker's, and like the other side's
  // in the exchange or the chair's, is theirs; like no one's, unlabeled.)
  const voice = new Map();
  // (A voice per person: a member by name, the chair, else each call its own (two unnamed 課長 are two voices).)
  let calls = 0;
  const keyOf = w => (w.w ? `${w.w}|${w.r}` : w.r === '主席' ? 'chair' : `#${w.id ?? ''}`);
  const pitchFor = w => {
    const v = voice.get(keyOf(w)) || [];
    return v.length >= 2 ? [...v].sort((a, b) => a - b)[v.length >> 1] : 0;
  };
  const near = (f, p, d) => f && p && Math.abs(Math.log(f / p)) < d;
  const heard = (w, x, f) => f && x.end - x.at >= 2 && (voice.get(keyOf(w)) || voice.set(keyOf(w), []).get(keyOf(w))).push(f);
  const say = (w, r, x) => {
    const last = turns[turns.length - 1];
    if (last && last.w === w && last.r === r) last.t += x.text;
    else turns.push({ w, r, at: x.at, t: x.text });
  };
  for (const x of split) {
    const f = pitchOf ? pitchOf(x.at, x.end) : 0;
    CALL.lastIndex = 0;
    const call = CALL.exec(x.text);
    const asking = call && ASKING.test((split[split.indexOf(x) - 1]?.text || '').slice(-6));
    if (call && call.index === 0 && !asking) {
      const more = call[2] !== '代表' ? LATER_TITLE.exec(x.text.slice(call[0].length)) : null;
      const title = more ? more[1] : call[2];
      const said = (more ? more[0].slice(0, -title.length).replace(/^.*?我們/, '') : call[1]).replace(/[來的]$/, '');
      const at = x.text.indexOf(said, call.index);
      const sounds = at >= 0 ? x.cs.slice(at, at + [...said].length).map(c => c.py) : [];
      called = title === '代表' || title === '副主席' ? { w: memberOf(said, members, sounds), r: title, id: ++calls } : { id: ++calls, w: '', r: /課|所|館|隊/.test(said) && said.length <= 5 ? `${said.replace(/^.*?(?=[^\s]{1,4}[課所館隊]$)/, '')}${title}` : title };
      who = { w: chair, r: '主席' };
      say(chair, '主席', x);
      continue;
    }
    if (ASK_ANSWER.test(x.text) && !asking) {
      called = { w: '', r: '公所', id: ++calls };
      say(chair, '主席', x);
      continue;
    }
    if (!called && ANSWER_OPEN.test(x.text)) {
      who = answering = { w: '', r: '公所', id: ++calls };
      say(who.w, who.r, x);
      heard(who, x, f);
      continue;
    }
    // (The one called speaks next; the chair's short word between speakers is the chair's.)
    if (called) {
      who = called;
      if (called.r === '代表' || called.r === '副主席') floor = called;
      else answering = called;
      called = null;
    } else if (CHAIR_LINE.test(x.text) && x.text.length <= 30 && !MEMBER_OPEN.test(x.text) && !OFFICIAL_OPEN.test(x.text)) {
      say(chair, '主席', x);
      heard({ w: chair, r: '主席' }, x, f);
      if (who.r && who.r !== '代表' && who.r !== '副主席') who = floor || { w: '', r: '' };
      continue;
    }
    const mine = pitchFor(who);
    if (f && mine && !near(f, mine, 0.22)) {
      const member = who.r === '代表' || who.r === '副主席';
      // (The other side of the exchange when its voice is known and this is it; the chair only when the other side's
      // voice is known and this isn't it; else no one.)
      const other = member ? answering : floor;
      const po = other ? pitchFor(other) : 0;
      who = near(f, po, 0.15) ? other : po && !near(f, po, 0.22) && near(f, pitchFor({ w: chair, r: '主席' }), 0.12) ? { w: chair, r: '主席' } : { w: '', r: '' };
    }
    say(who.w, who.r, x);
    if (who.r) heard(who, x, f);
    if (REPORT_END.test(x.text) && who.r && who.r !== '代表' && who.r !== '副主席' && who.r !== '主席') who = floor || { w: '', r: '' };
  }
  return turns.map(t => ({ ...t, at: +t.at.toFixed(1) }));
}

// A day's members each a block, as a transcript's 總質詢 are (lib/town-audio.mjs askBlocks): a member's block begins
// when they first take the floor (their greeting: 「主席、市長、…各位代表同仁、後方來賓」) or when the chair calls a
// different member by name; the chair calling the same member back for another round, or a word between, doesn't
// end it. → [{ w, from, to }]
const CALLS_MEMBER = /請[^，,。！？請\s]{0,8}?(?:代表|副主席)/;
const GREETING = /各位代表|代表同仁|代表會同仁|來賓|大家好|大家早|各位先進/;
export function machineAsks(turns) {
  const out = [];
  turns.forEach((x, i) => {
    if (x.r !== '代表' && x.r !== '副主席') return;
    const last = out[out.length - 1];
    const prev = turns[i - 1];
    const called = prev?.r === '主席' && CALLS_MEMBER.test(prev.t);
    const greets = GREETING.test(x.t.slice(0, 60));
    if (!last || (called && greets) || (x.w && last.w && x.w !== last.w)) out.push({ w: x.w, from: i, to: i });
    else if (!last.w && x.w) last.w = x.w;
  });
  out.forEach((a, k) => (a.to = (out[k + 1]?.from ?? turns.length) - 1));
  return out;
}
