// 代表會 recordings heard by speech recognition (scripts/asr.py, open source, on GitHub's runner: no AI service,
// nothing paid). Two kinds:
//   a 總質詢 day with its transcript (竹北's): the transcript's turns placed on the recording (lib/town-audio.mjs
//     alignHeard), kept as <tc>/<file>-<day>.json (+ the words heard, .words.json);
//   any other recording, every 代表會's: what was said, kept as <tc>/m-<recording>.json (+ .words.json: the words
//     heard with their pinyin, the meeting's own words' pinyin, the voice's pitch every 0.1 s). Who said it is worked
//     out at apply (lib/town-speakers.mjs), so better code needs no second hearing.
// Each recording is heard with the meeting's own words (its members from 中選會, scripts/town-roster.json, its 村里
// and 村里長, the session's papers): fed to the recognizer, and misheard ones put right by sound.
//   node scripts/town-hear.mjs hear <data dir> <store dir>   (town-hear.yml) not heard yet, transcripts first, then
//     every town's newest session first, one town after another, while TOWN_HEAR_MINUTES last. TOWN_HEAR_SHARD
//     "i/n": this runner's share (by the recording, so a share is the same every night).
//   node scripts/town-hear.mjs list <data dir>   what hear would take, in order
//   node scripts/town-hear.mjs apply <data dir> <store dir>  (data.yml, after the town build) each kept day's times
//     set on its paper as `au` ({ id, at, by: 'asr' }); each recording heard a paper of its own (k '錄音逐字',
//     papers['asr:<recording>']) and its session marked `heard`.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { alignHeard, pitchTrack, pitchOn, topicWords } from '../public/lib/town-audio.mjs';
import { heardTurns, machineAsks } from '../public/lib/town-speakers.mjs';
import { paperFile } from '../public/lib/town-site.mjs';

const [mode, dataDir, storeDir] = process.argv.slice(2);
const MODEL = process.env.TOWN_HEAR_MODEL || 'medium';
const ends = Date.now() + Number(process.env.TOWN_HEAR_MINUTES || 300) * 60_000;
const [shard, shards] = (process.env.TOWN_HEAR_SHARD || '0/1').split('/').map(Number);
// (How long hearing takes, a share of the recording's length: medium on GitHub's runner, 13.5 min for 51.)
const PACE = Number(process.env.TOWN_HEAR_PACE || 0.3);
// (A trial: only these recordings (Drive ids or addresses, comma between), each heard as a recording with no transcript.)
const ONLY = (process.env.TOWN_HEAR_ONLY || '').split(',').map(x => x.trim()).filter(Boolean);
// (The papers made from what was heard: a new number when the code that makes them changes.)
const MADE = 2;
const json = async f => JSON.parse(await readFile(f, 'utf8'));
const townDir = `${dataDir}/council/town`;
const roster = await json(new URL('./town-roster.json', import.meta.url)).catch(() => ({}));
const sha = s => createHash('sha1').update(String(s)).digest('hex');
const AUDIO = /\.(mp3|m4a|wav|aac)$/i;

// A recording's own name, short and safe in a file name: Drive's id, else the address hashed.
export const recKey = rec => (rec.drive && /^[\w-]{12,80}$/.test(rec.drive) ? rec.drive : sha(rec.src).slice(0, 20));
const recId = rec => rec.drive || rec.src;
const mine = rec => parseInt(sha(recId(rec)).slice(0, 8), 16) % shards === shard;

// Every town: its own file, its sessions with their papers (when read).
async function towns() {
  const out = [];
  for (const f of (await readdir(townDir)).filter(f => /^\d+\.json$/.test(f))) {
    const tc = f.replace('.json', '');
    const own = await json(`${townDir}/${f}`).catch(() => null);
    if (!own) continue;
    const sessions = [];
    for (const s of own.sessions || []) {
      const file = paperFile(s);
      const path = `${townDir}/${tc}/${file}.json`;
      const { papers = {} } = existsSync(path) ? await json(path).catch(() => ({})) : {};
      sessions.push({ s, file, path, papers });
    }
    out.push({ tc, own, sessions });
  }
  return out;
}

// The meeting's own words: its members (中選會's list, else the site's), its 村里 and their heads, the things its
// papers name; and a line for the recognizer that ends with the members (the line's end is what it keeps).
export function vocabOf(tc, own, s, papers = {}) {
  const r = roster[tc] || {};
  const members = (r.m?.length ? r.m.map(m => m.n) : (own.people || []).map(p => p.n)).filter(Boolean);
  const li = (r.li || []).map(x => x.n);
  const heads = (r.li || []).map(x => x.head).filter(Boolean);
  const texts = [...(s.items || []).map(i => i.n), ...(s.agenda || []).map(a => a.n), ...Object.values(papers).flatMap(p => [p.text || '', ...(p.turns || []).map(t => t.t), ...(p.items || []).map(x => x.what)])];
  const topics = topicWords(texts, 40).filter(w => !/^[0-9A-Za-z]/.test(w));
  const head = /鄉民/.test(own.n) ? '鄉長' : /鎮民/.test(own.n) ? '鎮長' : '市長';
  const prompt = `${own.n}第${own.term || ''}屆${s.n}的會議錄音。村里：${li.slice(0, 8).join('、')}。${topics.slice(0, 8).join('、')}。主席、副主席、${head}、秘書、課長，代表：${members.join('、')}。`;
  const terms = [...new Set([...members, ...li, ...heads, ...topics])].filter(t => t.length >= 2 && t.length <= 12);
  return { prompt, terms };
}

// What's to hear: each 總質詢 transcript's one recording; then each other recording (not a video), newest session
// first, one town after another.
function work(all) {
  const talk = [];
  const queues = [];
  for (const { tc, own, sessions } of all) {
    const q = [];
    for (const { s, file, path, papers } of [...sessions].sort((a, b) => String(b.s.from || '').localeCompare(String(a.s.from || '')) || b.s.term - a.s.term || b.s.no - a.s.no)) {
      const recs = (s.days || []).filter(d => d.drive || AUDIO.test(d.src || ''));
      const told = new Set();
      for (const p of Object.values(papers)) {
        if (p.k !== '總質詢' || !p.turns?.length || !p.d) continue;
        told.add(p.d);
        const day = recs.filter(d => d.d === p.d);
        if (day.length === 1) talk.push({ tc, own, s, file, path, papers, d: p.d, rec: day[0], turns: p.turns });
      }
      for (const rec of recs) if (!told.has(rec.d)) q.push({ tc, own, s, file, path, papers, rec, machine: true });
    }
    if (q.length) queues.push(q);
  }
  const rest = [];
  for (let i = 0; queues.some(q => i < q.length); i++) for (const q of queues) if (i < q.length) rest.push(q[i]);
  if (ONLY.length) {
    const all = [...talk.map(({ turns, d, ...x }) => ({ ...x, machine: true })), ...rest];
    return all.filter((x, i) => ONLY.includes(recId(x.rec)) && all.findIndex(y => recId(y.rec) === recId(x.rec)) === i);
  }
  return [...talk.sort((a, b) => b.d.localeCompare(a.d)), ...rest].filter(x => mine(x.rec));
}

const keyOf = x => (x.machine ? `${storeDir}/${x.tc}/m-${recKey(x.rec)}` : `${storeDir}/${x.tc}/${x.file}-${x.d}`);

async function hear() {
  let n = 0;
  for (const x of work(await towns())) {
    const id = recId(x.rec);
    const kept = await json(`${keyOf(x)}.json`).catch(() => null);
    if (kept && kept.id === id && kept.model === MODEL && (x.machine || kept.n === x.turns.length)) continue;
    if (Date.now() > ends - 120_000) break;
    const name = `${x.tc} ${x.s.n} ${x.d || x.rec.d || x.rec.n || ''}`;
    const url = x.rec.drive ? `https://drive.usercontent.google.com/download?id=${encodeURIComponent(x.rec.drive)}&export=download&confirm=t` : x.rec.src;
    const t0 = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(600_000) });
      if (!r.ok || !/audio|octet|video/.test(r.headers.get('content-type') || '')) throw new Error(`recording ${r.status} ${r.headers.get('content-type')}`);
      await writeFile('.hear.audio', Buffer.from(await r.arrayBuffer()));
      // (Decoded once, 8 kHz: its length, and the voice's pitch.)
      const dec = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', '.hear.audio', '-ac', '1', '-ar', '8000', '-f', 's16le', '.hear.pcm'], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', timeout: 600_000 });
      if (dec.status !== 0) throw new Error(`ffmpeg ${(dec.stderr || '').slice(0, 200)}`);
      const raw = await readFile('.hear.pcm');
      const pcm = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.length & ~1)));
      const dur = pcm.length / 8000;
      if (dur < 30) throw new Error(`only ${Math.round(dur)} s`);
      if (Date.now() + (dur * PACE + 90) * 1000 > ends) {
        console.log(`hear ${name}: ${Math.round(dur / 60)} min, no time left tonight`);
        continue;
      }
      const f0 = x.machine ? pitchTrack(pcm) : null;
      await writeFile('.hear.vocab.json', JSON.stringify(vocabOf(x.tc, x.own, x.s, x.papers)));
      const run = spawnSync('python', ['scripts/asr.py', '.hear.audio', '.hear.json', MODEL, '.hear.vocab.json'], { stdio: ['ignore', 'inherit', 'inherit'], timeout: Math.max(60_000, ends - Date.now()) });
      if (run.status !== 0) throw new Error(`asr exit ${run.status}`);
      const heard = await json('.hear.json');
      if (!heard.words?.length) throw new Error('nothing heard');
      await mkdir(`${storeDir}/${x.tc}`, { recursive: true });
      const meta = { tc: x.tc, file: x.file, id, model: MODEL, dur: heard.dur, run_s: heard.run_s, built: new Date().toISOString() };
      if (x.machine) {
        await writeFile(`${keyOf(x)}.words.json`, JSON.stringify({ words: heard.words, vocab: heard.vocab_py, f0 }));
        await writeFile(`${keyOf(x)}.json`, JSON.stringify({ ...meta, kind: 'machine', key: recKey(x.rec), d: x.rec.d || '', part: x.rec.n || '' }));
        console.log(`heard ${name}: ${heard.words.length} words, ${Math.round(heard.dur / 60)} min in ${Math.round((Date.now() - t0) / 60000)} min`);
      } else {
        const got = alignHeard(x.turns.map(t => t.t), heard.words);
        if (!got) throw new Error('nothing matched');
        const near = [...got.near].sort((a, b) => a - b);
        await writeFile(`${keyOf(x)}.words.json`, JSON.stringify(heard.words));
        await writeFile(`${keyOf(x)}.json`, JSON.stringify({ ...meta, d: x.d, n: x.turns.length, at: got.at, near: near[near.length >> 1], close: got.near.filter(c => c <= 12).length }));
        console.log(`heard ${name}: ${got.near.filter(c => c <= 12).length}/${x.turns.length} turns on a heard word, ${Math.round(heard.dur / 60)} min in ${Math.round((Date.now() - t0) / 60000)} min`);
      }
      n++;
    } catch (e) {
      console.log(`hear ${name}: ${e.message}`);
    } finally {
      for (const f of ['.hear.audio', '.hear.pcm', '.hear.json', '.hear.vocab.json']) await rm(f, { force: true });
    }
  }
  console.log(`town-hear: ${n} recordings heard`);
}

// A recording heard, made into a paper: its turns (who, by the meeting's forms and the members' list), each member's
// questions a block, each turn's time.
// members: [{ n }].
export function machinePaper(k, heard, { members = [], chair = '' } = {}) {
  const py = heard.vocab || {};
  const f0 = heard.f0 || [];
  const turns = heardTurns(heard.words, { members: members.map(m => ({ n: m.n, py: py[m.n] || [] })), chair, vocab: py, pitchOf: f0.length ? (a, b) => pitchOn(f0, a, b) : null }).filter(t => t.t.trim());
  const asks = machineAsks(turns).map(a => ({ ...a, gist: topicWords(turns.slice(a.from, a.to + 1).filter(t => t.r === '代表' || t.r === '副主席').map(t => t.t)).join('、') }));
  // (A turn the recognizer was unsure of, most of its words below even odds: 台語 heard as 國語, a far mic. Marked,
  // so the phone says its words may be wrong.)
  const at = turns.map(t => t.at);
  const sure = (a, b) => {
    const ps = heard.words.filter(w => w[0] >= a && w[0] < b && typeof w[4] === 'number').map(w => w[4]);
    return ps.length >= 5 ? ps.filter(p => p < 0.5).length / ps.length : 0;
  };
  return { k: '錄音逐字', d: k.d || '', part: k.part || '', machine: 1, made: MADE, built: k.built, model: k.model, turns: turns.map(({ w, r, t }, i) => ({ w, r, t, ...(sure(at[i], at[i + 1] ?? Infinity) > 0.5 ? { unclear: 1 } : {}) })), asks, au: { id: k.id, at, by: 'asr' } };
}

async function apply() {
  if (!existsSync(storeDir)) return console.log('town-hear: nothing kept yet');
  let n = 0;
  let m = 0;
  for (const tc of await readdir(storeDir)) {
    const ownPath = `${townDir}/${tc}.json`;
    const own = existsSync(ownPath) ? await json(ownPath).catch(() => null) : null;
    let ownChanged = false;
    const docs = new Map();
    const docOf = async (file, s) => {
      if (!docs.has(file)) {
        const path = `${townDir}/${tc}/${file}.json`;
        docs.set(file, { path, doc: existsSync(path) ? await json(path).catch(() => null) : null, changed: false, s });
      }
      const x = docs.get(file);
      if (!x.doc && s) (x.doc = { built: new Date().toISOString(), tc, n: s.n, papers: {} }), (x.changed = true);
      return x;
    };
    for (const f of (await readdir(`${storeDir}/${tc}`)).filter(f => /^[^.]+\.json$/.test(f))) {
      const k = await json(`${storeDir}/${tc}/${f}`).catch(() => null);
      if (!k) continue;
      if (k.kind === 'machine') {
        const s = own?.sessions?.find(s => paperFile(s) === k.file && (s.days || []).some(d => recId(d) === k.id));
        if (!s) continue;
        const x = await docOf(k.file, s);
        const key = `asr:${k.key}`;
        const had = x.doc.papers[key];
        if (!(had && had.made === MADE && had.built === k.built)) {
          const heard = await json(`${storeDir}/${tc}/${f.replace(/\.json$/, '.words.json')}`).catch(() => null);
          if (!heard) continue;
          const r = roster[tc]?.m?.length ? roster[tc].m : (own.people || []).map(p => ({ n: p.n, area: p.area || '' }));
          x.doc.papers[key] = machinePaper(k, heard, { members: r, chair: (own.people || []).find(p => p.title === '主席')?.n || '' });
          x.changed = true;
          m++;
        }
        if (!s.heard) (s.heard = 1), (ownChanged = true);
        continue;
      }
      const x = await docOf(k.file);
      const p = Object.values(x.doc?.papers || {}).find(p => p.k === '總質詢' && p.d === k.d);
      if (!p || p.turns?.length !== k.n || p.au?.by === 'asr') continue;
      p.au = { id: k.id, at: k.at, by: 'asr' };
      delete p.auTry;
      x.changed = true;
      n++;
    }
    for (const x of docs.values()) if (x.changed && x.doc) await mkdir(`${townDir}/${tc}`, { recursive: true }), await writeFile(x.path, JSON.stringify(x.doc));
    if (ownChanged) await writeFile(ownPath, JSON.stringify(own));
  }
  console.log(`town-hear: ${n} days' times set from what was heard, ${m} recordings written out`);
}

const main = process.argv[1]?.endsWith('town-hear.mjs');
if (!main);
else if (mode === 'hear') await hear();
else if (mode === 'apply') await apply();
else if (mode === 'list') for (const x of work(await towns())) console.log(x.machine ? 'machine' : 'transcript', x.tc, x.s.n, x.d || x.rec.d || x.rec.n || '', recId(x.rec));
else if (mode) console.log('town-hear.mjs hear|apply <data dir> <store dir>');
