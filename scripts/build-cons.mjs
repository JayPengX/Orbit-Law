// 憲法法庭's rulings: every 大法官解釋 (釋字第1–813號) and 憲法法庭判決
// (111年憲判字 on), read from the court's own pages (cons.judicial.gov.tw,
// open all day, no account), with the articles each rules on and the bills
// that name it. A ruling's file is kept from the last deploy (or the
// workflow cache) and read again only while it's this year's; a 釋字 never
// changes once out. Runs after build-data.mjs (index, orders, laws, bills).
//   node scripts/build-cons.mjs [--minutes 20] [--prev https://jaypengx.github.io/Orbit-Law/data/]
// Writes data/cons/: index.json (every ruling's row), <id>.json (its text),
// laws.json (by law and article).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { nameMap } from '../public/lib/refs.mjs';
import { CONS, JUDGMENTS_PAGE, LAST_INTERP, interpPage, readConsPage, judgmentList, consItem, consRow, consByLaw, billsNaming, lastRewrite, consOrder } from '../public/lib/cons.mjs';
import { args, prevJson, sleep } from './lib.mjs';

const data = new URL('../public/data/', import.meta.url).pathname;
const out = `${data}cons/`;
const cacheDir = new URL('../.cons-cache/', import.meta.url).pathname;
const MINUTES = Number(args.minutes ?? 20);
const start = Date.now();
const read = async f => JSON.parse(await readFile(f, 'utf8'));

const index = await read(`${data}index.json`);
const orders = existsSync(`${data}orders.json`) ? await read(`${data}orders.json`) : { laws: [] };
const rows = [...index.laws, ...orders.laws];
const names = nameMap(rows);
const known = new Set(rows.map(r => r[0]));
// Each law's last whole rewrite (its 沿革), read only for the laws a ruling cites.
const rewrites = new Map();
const rewriteOf = p => {
  if (!rewrites.has(p)) {
    let d = '';
    try {
      d = lastRewrite(JSON.parse(readFileSync(`${data}law/${p}.json`, 'utf8')).h);
    } catch {}
    rewrites.set(p, d);
  }
  return rewrites.get(p);
};

async function page(u) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Orbit Law; +https://jaypengx.github.io/Orbit-Law/)' }, signal: AbortSignal.timeout(25_000) });
      if (r.ok) return { html: await r.text(), url: r.url };
      if (r.status === 404) return null;
    } catch {}
    await sleep(2000 * (i + 1));
  }
  throw new Error(`${u}: no answer`);
}

// What's kept: the cache's copy, else the last deploy's.
async function kept(id) {
  const f = `${cacheDir}${id}.json`;
  if (existsSync(f)) return read(f);
  return prevJson(`cons/${id}.json`);
}

// Every ruling's page: 憲判 from the list page, 釋字 by number.
// (The list unread: the 憲判 the last deploy had, each from its kept copy.)
const listed = await page(JUDGMENTS_PAGE).then(p => judgmentList(p?.html)).catch(() => []);
const list = listed.length ? listed.map(x => ({ id: x.id, url: `${CONS}docdata.aspx?fid=38&id=${x.page}` })) : ((await prevJson('cons/index.json'))?.items || []).filter(r => r[0][0] === 'j').map(r => ({ id: r[0], url: '' }));
for (let n = LAST_INTERP; n >= 1; n--) list.push({ id: `s${n}`, url: interpPage(n) });
const thisYear = new Date().getFullYear() - 1911;
const stale = id => id.startsWith(`j${thisYear}-`) || id.startsWith(`j${thisYear - 1}-`);

await mkdir(out, { recursive: true });
await mkdir(cacheDir, { recursive: true });
const items = [];
let fetched = 0, carried = 0, missing = 0;
// Eight at a time (the site answers each in about 3 s).
const queue = [...list];
async function worker() {
  for (let x; (x = queue.shift()); ) {
    let it = await kept(x.id);
    const late = (Date.now() - start) / 6e4 > MINUTES;
    if (x.url && (!it || (stale(x.id) && !late))) {
      if (late && !it) {
        missing++;
        continue;
      }
      try {
        const p = await page(x.url);
        if (p) {
          const fresh = consItem(x.id, readConsPage(p.html), { names, rewriteOf, url: p.url.replace(/&rn=-?\d+$/, '') });
          if (fresh.main.length || fresh.reason.length) ((it = fresh), fetched++);
        }
      } catch (e) {
        console.warn(`${x.id}: ${e.message}`);
      }
    } else carried++;
    if (!it) {
      missing++;
      continue;
    }
    // Cites re-read against today's laws (a law repealed or renamed drops out).
    it.cites = it.cites.filter(c => known.has(c.split(':')[0]));
    items.push(it);
    await writeFile(`${cacheDir}${x.id}.json`, JSON.stringify(it));
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

// The bills that name a ruling (by their purpose line).
let naming = {};
try {
  naming = billsNaming((await read(`${data}bills/all.json`)).bills);
} catch {}
items.sort((a, b) => consOrder(b.id) - consOrder(a.id));
for (const it of items) {
  it.bills = naming[it.id] || [];
  await writeFile(`${out}${it.id}.json`, JSON.stringify(it));
}
const index_ = items.map(it => consRow(it, it.bills));
await writeFile(`${out}index.json`, JSON.stringify({ built: new Date().toISOString(), items: index_ }));
await writeFile(`${out}laws.json`, JSON.stringify(consByLaw(index_)));
console.log(`cons: ${items.length} rulings (${items.filter(i => i.id[0] === 'j').length} 憲判, ${items.filter(i => i.id[0] === 's').length} 釋字); ${fetched} read, ${carried} kept, ${missing} missing; ${index_.reduce((n, r) => n + r[4].length, 0)} cites, ${Object.keys(naming).length} named by bills; ${Math.round((Date.now() - start) / 1000)}s`);
