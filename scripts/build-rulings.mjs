// The nightly rulings build: 司法院 JDoc open data (data.judicial.gov.tw/jdg,
// an account of the owner's: secrets JDOC_USER and JDOC_PASS) → the
// 最高法院, 最高行政法院 and 憲法法庭 judgments of the last week, kept by the
// articles they cite, merged into the last deploy's copy. JDoc answers only
// 00:00–06:00 Taiwan time (the daily deploy runs at 03:30): outside it, or
// without the secrets, the last copy is carried over untouched.
// Runs after build-data.mjs (needs public/data/index.json).
//   node scripts/build-rulings.mjs [--prev https://jaypengx.github.io/Orbit-Law/data/]
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createWriteStream, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nameMap } from '../public/lib/refs.mjs';
import { courtOf, compactRuling, mergeRulings, byLaw, inWindow, lawCounts, latestRulings, archiveMonths, pendingMonths, topCourtFile } from '../public/lib/rulings.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const PREV = args.prev ?? 'https://jaypengx.github.io/Orbit-Law/data/';
const API = 'https://data.judicial.gov.tw/jdg/api/';
const MAX_DOCS = 2000;
const out = new URL('../public/data/rulings/', import.meta.url).pathname;

async function prevJson(path) {
  if (!PREV) return null;
  try {
    const r = await fetch(PREV + path);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
async function post(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`JDoc ${path} ${r.status}`);
  return r.json();
}

const prev = (await prevJson('rulings/all.json')) || { rulings: [], seen: '' };
let rulings = prev.rulings || [];
let note = 'carried over';
const { JDOC_USER: user, JDOC_PASS: password } = process.env;
if (!user || !password) note = 'no JDoc account yet (secrets JDOC_USER, JDOC_PASS): carried over';
else if (!inWindow()) {
  // Outside its hours: only a sign-in check, logged (the account works, or why not).
  let auth;
  try {
    auth = await post('Auth', { user, password });
  } catch (e) {
    auth = { error: e.message };
  }
  note = `outside JDoc hours (00:00–06:00 Taiwan): carried over; sign-in check: ${auth.Token || auth.token ? 'token received' : JSON.stringify(auth).slice(0, 160)}`;
}
else
  try {
    const index = JSON.parse(await readFile(new URL('../public/data/index.json', import.meta.url), 'utf8'));
    const names = nameMap(index.laws);
    const auth = await post('Auth', { user, password });
    const token = auth.Token || auth.token;
    if (!token) throw new Error(`JDoc Auth: ${JSON.stringify(auth).slice(0, 120)}`);
    // The judgments changed in the last 7 days: [{ DATE, LIST: [jid] }].
    const days = await post('JList', { token });
    const have = new Set(rulings.map(r => r[0]));
    const all = [...new Set((Array.isArray(days) ? days : []).flatMap(d => d.LIST || d.list || []))];
    // What JList gave, in brief: its shape and a few ids (the courts' prefixes it uses).
    console.log(`JList: ${Array.isArray(days) ? `${days.length} days, keys ${Object.keys(days[0] || {}).join('/')}` : `not a list: ${JSON.stringify(days).slice(0, 200)}`}; ${all.length} ids, e.g. ${all.slice(0, 3).join(' | ')}; prefixes ${[...new Set(all.map(j => String(j).split(',')[0].slice(0, 3)))].slice(0, 30).join(' ')}`);
    const ids = all.filter(j => courtOf(j) && !have.has(j)).slice(0, MAX_DOCS);
    const fresh = [];
    for (const j of ids) {
      try {
        const doc = await post('JDoc', { token, j });
        const r = compactRuling({ JID: j, ...doc }, names);
        if (r[3].length) fresh.push(r);
      } catch (e) {
        console.warn(`JDoc ${j}: ${e.message}`);
      }
    }
    rulings = mergeRulings(rulings, fresh);
    note = `${ids.length} new judgments read, ${fresh.length} citing a law`;
  } catch (e) {
    // A JDoc failure never stops the deploy: last night's copy stays.
    note = `JDoc failed (${e.message}): carried over`;
  }

// The backfill: 司法院's monthly bulk archives (one RAR of every court a
// month, opendata.judicial.gov.tw), newest month first, as many as fit in
// BACKFILL_MINUTES. Its downloads open only 00:00–06:00 Taiwan time too, so
// the nightly runs in that window each read a few months until three years
// are in. Months done are kept in all.json, so no month is read twice.
const OPEN = 'https://opendata.judicial.gov.tw/';
const BACKFILL_MINUTES = Number(args.minutes ?? 40);
let months = prev.months || [];
let backfill = 'not tonight';
if (inWindow() || args.force) {
  const start = Date.now();
  const work = join(tmpdir(), `rulings-${process.pid}`);
  try {
    const index = JSON.parse(await readFile(new URL('../public/data/index.json', import.meta.url), 'utf8'));
    const names = nameMap(index.laws);
    const list = await (await fetch(`${OPEN}data/api/rest/categories/051/resources`, { signal: AbortSignal.timeout(60_000) })).json();
    const todo = pendingMonths(archiveMonths(list), months);
    const read = [];
    for (const m of todo) {
      if ((Date.now() - start) / 6e4 > BACKFILL_MINUTES || !(inWindow() || args.force)) break;
      await rm(work, { recursive: true, force: true });
      await mkdir(join(work, 'x'), { recursive: true });
      const rar = join(work, 'month.rar');
      const r = await fetch(`${OPEN}api/FilesetLists/${m.id}/file`, { signal: AbortSignal.timeout(BACKFILL_MINUTES * 6e4) });
      if (!r.ok) {
        backfill = `${m.month} download ${r.status}: ${(await r.text()).slice(0, 160)}`;
        break;
      }
      await pipeline(Readable.fromWeb(r.body), createWriteStream(rar));
      const files = extractTop(rar, join(work, 'x'));
      const fresh = [];
      for (const f of files) {
        try {
          const doc = JSON.parse((await readFile(f, 'utf8')).replace(/^\uFEFF/, ''));
          if (!courtOf(doc.JID)) continue;
          const c = compactRuling(doc, names);
          if (c[3].length) fresh.push(c);
        } catch {}
      }
      rulings = mergeRulings(rulings, fresh);
      months = [...months, m.month];
      read.push(`${m.month}: ${files.length} files, ${fresh.length} citing a law`);
      console.log(`backfill ${read.at(-1)} (${Math.round((Date.now() - start) / 1000)}s)`);
    }
    if (read.length) backfill = `${read.join('; ')}${todo.length > read.length ? `; ${todo.length - read.length} months to go` : '; all months in'}`;
    else if (!todo.length) backfill = 'all months in';
  } catch (e) {
    backfill = `failed (${e.message})`;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// The top courts' files out of a month's archive (unrar, else bsdtar or 7z):
// only those, as the whole month is every court's.
function extractTop(rar, dir) {
  const has = cmd => { try { execFileSync('sh', ['-c', `command -v ${cmd}`]); return true; } catch { return false; } };
  const opts = { maxBuffer: 1 << 30, encoding: 'utf8' };
  let names;
  if (has('unrar')) names = execFileSync('unrar', ['lb', rar], opts).split('\n');
  else if (has('bsdtar')) names = execFileSync('bsdtar', ['-tf', rar], opts).split('\n');
  else names = execFileSync('7z', ['l', '-ba', '-slt', rar], opts).split('\n').filter(l => l.startsWith('Path = ')).map(l => l.slice(7));
  const want = names.map(n => n.trim()).filter(topCourtFile);
  if (!want.length) {
    console.log(`backfill: no top-court files; first entries: ${names.slice(0, 5).join(' | ')}`);
    return [];
  }
  const listFile = join(dir, '..', 'want.txt');
  writeFileSync(listFile, want.join('\n'));
  if (has('unrar')) execFileSync('unrar', ['x', '-o+', '-inul', rar, `@${listFile}`, `${dir}/`], opts);
  else if (has('bsdtar')) execFileSync('bsdtar', ['-xf', rar, '-C', dir, '-T', listFile], opts);
  else execFileSync('7z', ['x', '-y', `-o${dir}`, rar, `@${listFile}`], opts);
  return want.map(n => join(dir, n));
}

await mkdir(out, { recursive: true });
await writeFile(out + 'all.json', JSON.stringify({ built: new Date().toISOString(), months, rulings }));
const laws = byLaw(rulings);
for (const [p, arts] of Object.entries(laws)) await writeFile(`${out}${p}.json`, JSON.stringify(arts));
// Per law, how many judgments cite it; and the newest few for 首頁.
await writeFile(out + 'laws.json', JSON.stringify(lawCounts(rulings)));
await writeFile(out + 'latest.json', JSON.stringify({ rulings: latestRulings(rulings) }));
console.log(`rulings: ${note}; backfill: ${backfill}; ${rulings.length} kept, under ${Object.keys(laws).length} laws`);
