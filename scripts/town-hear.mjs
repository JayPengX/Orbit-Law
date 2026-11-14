// A 代表會's 總質詢 transcript lined up with its day's recording by speech recognition (scripts/asr.py, open
// source, on GitHub's runner: no AI service, nothing paid). Two halves:
//   node scripts/town-hear.mjs hear <data dir> <store dir>   (town-hear.yml) each day with a transcript and one
//     recording, not heard yet, newest first, while TOWN_HEAR_MINUTES last: heard, its turns placed
//     (lib/town-audio.mjs alignHeard), kept in the store as <tc>/<file>-<day>.json (+ the words heard, .words.json).
//   node scripts/town-hear.mjs apply <data dir> <store dir>  (data.yml, after the town build) each kept day's times
//     set on its paper as `au` ({ id, at, by: 'asr' }), over the code's guess (build-town alignRecording).
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { alignHeard } from '../public/lib/town-audio.mjs';
import { paperFile } from '../public/lib/town-site.mjs';

const [mode, dataDir, storeDir] = process.argv.slice(2);
const MODEL = process.env.TOWN_HEAR_MODEL || 'medium';
const ends = Date.now() + Number(process.env.TOWN_HEAR_MINUTES || 300) * 60_000;
const json = async f => JSON.parse(await readFile(f, 'utf8'));
const townDir = `${dataDir}/council/town`;

// Each 總質詢 with its turns and its day's one recording, newest first.
async function days() {
  const out = [];
  for (const f of (await readdir(townDir)).filter(f => /^\d+\.json$/.test(f))) {
    const tc = f.replace('.json', '');
    const own = await json(`${townDir}/${f}`).catch(() => null);
    for (const s of own?.sessions || []) {
      const file = paperFile(s);
      const path = `${townDir}/${tc}/${file}.json`;
      if (!existsSync(path)) continue;
      const { papers = {} } = await json(path).catch(() => ({}));
      for (const p of Object.values(papers)) {
        if (p.k !== '總質詢' || !p.turns?.length || !p.d) continue;
        const recs = (s.days || []).filter(d => d.d === p.d && (d.drive || /\.(mp3|m4a|wav|aac)$/i.test(d.src || '')));
        if (recs.length === 1) out.push({ tc, file, d: p.d, rec: recs[0], turns: p.turns, path });
      }
    }
  }
  return out.sort((a, b) => b.d.localeCompare(a.d));
}

const keyOf = x => `${storeDir}/${x.tc}/${x.file}-${x.d}`;

async function hear() {
  let n = 0;
  for (const x of await days()) {
    const id = x.rec.drive || x.rec.src;
    const kept = await json(`${keyOf(x)}.json`).catch(() => null);
    if (kept && kept.id === id && kept.n === x.turns.length && kept.model === MODEL) continue;
    if (Date.now() > ends) break;
    const url = x.rec.drive ? `https://drive.usercontent.google.com/download?id=${encodeURIComponent(x.rec.drive)}&export=download&confirm=t` : x.rec.src;
    const t0 = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!r.ok || !/audio|octet/.test(r.headers.get('content-type') || '')) throw new Error(`recording ${r.status} ${r.headers.get('content-type')}`);
      await writeFile('.hear.audio', Buffer.from(await r.arrayBuffer()));
      const run = spawnSync('python', ['scripts/asr.py', '.hear.audio', '.hear.json', MODEL], { stdio: ['ignore', 'inherit', 'inherit'], timeout: Math.max(60_000, ends - Date.now()) });
      if (run.status !== 0) throw new Error(`asr exit ${run.status}`);
      const heard = await json('.hear.json');
      const got = alignHeard(x.turns.map(t => t.t), heard.words);
      if (!got) throw new Error('nothing matched');
      const near = [...got.near].sort((a, b) => a - b);
      await mkdir(`${storeDir}/${x.tc}`, { recursive: true });
      await writeFile(`${keyOf(x)}.words.json`, JSON.stringify(heard.words));
      await writeFile(`${keyOf(x)}.json`, JSON.stringify({ tc: x.tc, file: x.file, d: x.d, id, n: x.turns.length, at: got.at, near: near[near.length >> 1], close: got.near.filter(c => c <= 12).length, model: MODEL, dur: heard.dur, run_s: heard.run_s, built: new Date().toISOString() }));
      n++;
      console.log(`heard ${x.tc} ${x.file} ${x.d}: ${got.near.filter(c => c <= 12).length}/${x.turns.length} turns on a heard word, ${Math.round(heard.dur / 60)} min in ${Math.round((Date.now() - t0) / 60000)} min`);
    } catch (e) {
      console.log(`hear ${x.tc} ${x.file} ${x.d}: ${e.message}`);
    } finally {
      await rm('.hear.audio', { force: true });
    }
  }
  console.log(`town-hear: ${n} days heard`);
}

async function apply() {
  if (!existsSync(storeDir)) return console.log('town-hear: nothing kept yet');
  let n = 0;
  for (const tc of await readdir(storeDir)) {
    for (const f of (await readdir(`${storeDir}/${tc}`)).filter(f => /^[^.]+\.json$/.test(f) && !f.endsWith('.words.json'))) {
      const k = await json(`${storeDir}/${tc}/${f}`).catch(() => null);
      const path = `${townDir}/${tc}/${k?.file}.json`;
      if (!k || !existsSync(path)) continue;
      const doc = await json(path);
      const p = Object.values(doc.papers || {}).find(p => p.k === '總質詢' && p.d === k.d);
      if (!p || p.turns?.length !== k.n || p.au?.by === 'asr') continue;
      p.au = { id: k.id, at: k.at, by: 'asr' };
      delete p.auTry;
      await writeFile(path, JSON.stringify(doc));
      n++;
    }
  }
  console.log(`town-hear: ${n} days' times set from what was heard`);
}

if (mode === 'hear') await hear();
else if (mode === 'apply') await apply();
else console.log('town-hear.mjs hear|apply <data dir> <store dir>');
