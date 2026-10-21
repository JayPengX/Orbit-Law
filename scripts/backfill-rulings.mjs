// The rulings store: every court's judgments that cite a law, read from
// 司法院's open data into .rulings-store/ (kept in the workflow cache by
// rulings.yml, never carried through a deploy, so a bad deploy can't empty it).
//   m/<YYYYMM>.json  one monthly archive's rows: [jid, date, 案由, cites]
//   m/jdoc.json      the last weeks' top-court judgments from JDoc
//   done.json        { months: [...read], gone: [...taken down], courts: { code: name } }
// The top courts keep every judgment citing a law; the other courts their
// 判決 only. Both of 司法院's doors open only 00:00–06:00 Taiwan time (or --force).
//   node scripts/backfill-rulings.mjs [--minutes 50] [--store .rulings-store] [--force 1]
// Prints `more=1` on its last line while months are still to read in tonight's window.
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { createWriteStream, existsSync, readdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nameMap } from '../public/lib/refs.mjs';
import { courtOf, lowCode, isJudgment, courtFromPath, compactRuling, mergeRulings, inWindow, archiveMonths, pendingMonths, deletedIds } from '../public/lib/rulings.mjs';
import { args, prevJson } from './lib.mjs';

const store = new URL(`../${args.store || '.rulings-store'}/`, import.meta.url).pathname;
const MINUTES = Number(args.minutes ?? 50);
const force = Boolean(args.force);
const start = Date.now();
const open = () => force || inWindow();
// Time left tonight: the window closes at 06:00 Taiwan (22:00 UTC).
const windowLeft = (d = new Date()) => (force ? Infinity : (((22 * 60 - d.getUTCHours() * 60 - d.getUTCMinutes()) % 1440) + 1440) % 1440);
const minutes = () => (Date.now() - start) / 6e4;
const read = async (f, or) => (existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : or);

await mkdir(`${store}m`, { recursive: true });
const done = await read(`${store}done.json`, { months: [], gone: [], courts: {} });
done.courts ||= {};
done.gone ||= [];

// A store from nothing: the last deploy's top-court rows and their months, so nothing read is lost.
if (!(await readdir(`${store}m`)).length) {
  const prev = await prevJson('rulings/all.json');
  if (prev?.rulings?.length) {
    await writeFile(`${store}m/prev.json`, JSON.stringify(prev.rulings));
    console.log(`seeded from the last deploy: ${prev.rulings.length} rows`);
  }
}

const index = JSON.parse(await readFile(new URL('../public/data/index.json', import.meta.url), 'utf8'));
const orders = existsSync(new URL('../public/data/orders.json', import.meta.url)) ? JSON.parse(await readFile(new URL('../public/data/orders.json', import.meta.url), 'utf8')) : { laws: [] };
const names = nameMap([...index.laws, ...orders.laws]);
const { JDOC_USER: user, JDOC_PASS: password } = process.env;
const notes = [];

// JDoc: the top courts' judgments of the last week (the archives lag a month).
if (user && password && open()) {
  const API = 'https://data.judicial.gov.tw/jdg/api/';
  const post = async (path, body) => {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`JDoc ${path} ${r.status}`);
    return r.json();
  };
  try {
    const auth = await post('Auth', { user, password });
    const token = auth.Token || auth.token;
    if (!token) throw new Error(`Auth: ${JSON.stringify(auth).slice(0, 120)}`);
    const days = await post('JList', { token });
    const kept = await read(`${store}m/jdoc.json`, []);
    const have = new Set(kept.map(r => r[0]));
    const ids = [...new Set((Array.isArray(days) ? days : []).flatMap(d => d.LIST || d.list || []))].filter(j => courtOf(j) && !have.has(j)).slice(0, 2000);
    const fresh = [];
    for (const j of ids) {
      if (minutes() > 10) break;
      try {
        const r = compactRuling({ JID: j, ...(await post('JDoc', { token, j })) }, names);
        if (r[3].length) fresh.push(r);
      } catch {}
    }
    // Sixty days of these: by then the month's archive has them.
    await writeFile(`${store}m/jdoc.json`, JSON.stringify(mergeRulings(kept, fresh, new Date(), 60)));
    notes.push(`JDoc: ${ids.length} new, ${fresh.length} citing a law`);
  } catch (e) {
    notes.push(`JDoc failed (${e.message})`);
  }
}

// The monthly archives, newest first, while time and the window last.
let more = false, failed = false;
if (open()) {
  const OPEN = 'https://opendata.judicial.gov.tw/';
  const work = join(tmpdir(), `rulings-${process.pid}`);
  try {
    const list = await (await fetch(`${OPEN}data/api/rest/categories/051/resources`, { signal: AbortSignal.timeout(60_000) })).json();
    let auth = {};
    if (user && password) {
      const t = await fetch(`${OPEN}api/MemberTokens`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberAccount: user, pwd: password }), signal: AbortSignal.timeout(60_000) })
        .then(r => r.json())
        .catch(e => ({ message: e.message }));
      if (t.token) auth = { Authorization: `Bearer ${t.token}` };
      else notes.push(`member token: ${JSON.stringify(t).slice(0, 160)}`);
    }
    const todo = pendingMonths(archiveMonths(list), done.months);
    for (const m of todo) {
      // A month takes about ten minutes: none started that can't finish.
      if (minutes() > MINUTES || windowLeft() < 15 || !open()) {
        more = open() && windowLeft() >= 15;
        break;
      }
      const t0 = Date.now();
      await rm(work, { recursive: true, force: true });
      await mkdir(join(work, 'x'), { recursive: true });
      const rar = join(work, 'month.rar');
      const r = await fetch(`${OPEN}api/FilesetLists/${m.id}/file`, { headers: auth, signal: AbortSignal.timeout(40 * 6e4) });
      if (!r.ok) {
        notes.push(`${m.month} download ${r.status}: ${(await r.text()).slice(0, 160)}`);
        failed = true;
        break;
      }
      await pipeline(Readable.fromWeb(r.body), createWriteStream(rar));
      const files = extractAll(rar, join(work, 'x'));
      await rm(rar, { force: true });
      const rows = [];
      let top = 0, low = 0, skipped = 0;
      for (const f of files) {
        try {
          const doc = JSON.parse((await readFile(join(work, 'x', f), 'utf8')).replace(/^﻿/, ''));
          const isTop = Boolean(courtOf(doc.JID));
          const code = lowCode(doc.JID);
          if (!isTop && !(code && isJudgment(doc))) {
            skipped++;
            continue;
          }
          if (code && !done.courts[code]) done.courts[code] = courtFromPath(f) || '';
          const c = compactRuling(doc, names);
          if (!c[3].length) continue;
          rows.push(c);
          isTop ? top++ : low++;
        } catch {}
      }
      await writeFile(`${store}m/${m.month}.json`, JSON.stringify(rows));
      done.months = [...new Set([...done.months, m.month])];
      await writeFile(`${store}done.json`, JSON.stringify(done));
      notes.push(`${m.month}: ${files.length} files, ${top} top-court + ${low} other courts' judgments citing a law (${skipped} 裁定 and others left out) in ${Math.round((Date.now() - t0) / 1000)}s`);
      console.log(notes.at(-1));
      await rm(join(work, 'x'), { recursive: true, force: true });
    }
    if (!more && !failed && pendingMonths(archiveMonths(list), done.months).length && open() && windowLeft() >= 15) more = true;
    // Rulings 司法院 has since taken down.
    const del = list.find(d => /Delete-Infor/i.test(d.title || ''))?.filesets?.[0]?.fileSetId;
    if (del) {
      const r = await fetch(`${OPEN}api/FilesetLists/${del}/file`, { headers: auth, signal: AbortSignal.timeout(120_000) }).catch(() => null);
      if (r?.ok) done.gone = [...deletedIds(await r.text())];
    }
  } catch (e) {
    notes.push(`archives failed (${e.message})`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
} else notes.push('outside 司法院 hours (00:00–06:00 Taiwan)');

await writeFile(`${store}done.json`, JSON.stringify(done));
console.log(`rulings store: ${notes.join('; ')}; ${done.months.length} months in`);
console.log(`more=${more ? 1 : 0}`);

// Every .json in a month's archive (unrar, else bsdtar or 7z), as paths under dir.
function extractAll(rar, dir) {
  const has = cmd => { try { execFileSync('sh', ['-c', `command -v ${cmd}`]); return true; } catch { return false; } };
  const opts = { maxBuffer: 1 << 30, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] };
  if (has('unrar')) execFileSync('unrar', ['x', '-o+', '-inul', rar, `${dir}/`], opts);
  else if (has('bsdtar')) execFileSync('bsdtar', ['-xf', rar, '-C', dir], opts);
  else execFileSync('7z', ['x', '-y', `-o${dir}`, rar], opts);
  return readdirSync(dir, { recursive: true }).map(String).filter(f => /\.json$/i.test(f));
}
