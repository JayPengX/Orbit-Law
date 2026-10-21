// The court rulings the app reads, made from the rulings store
// (.rulings-store/, filled nightly by backfill-rulings.mjs in rulings.yml and
// restored here from the workflow cache): every judgment citing a law,
// 最高法院 and 最高行政法院 whole, the other courts' 判決 by article, 案由 and court.
// No store (the cache gone): the last deploy's top-court copy is carried over,
// and a build that would publish far fewer top-court rulings than the last
// deploy keeps the last deploy's.
// Runs after build-data.mjs (needs public/data/index.json).
//   node scripts/build-rulings.mjs [--store .rulings-store] [--prev https://jaypengx.github.io/Orbit-Law/data/]
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { courtOf, lowCode, mergeRulings, byLaw, lawCounts, latestRulings, byMonth, monthCounts, findRows, dropDeleted, lowViews, titleKey } from '../public/lib/rulings.mjs';
import { args, prevJson } from './lib.mjs';

const out = new URL('../public/data/rulings/', import.meta.url).pathname;
const store = new URL(`../${args.store || '.rulings-store'}/`, import.meta.url).pathname;
const read = async f => JSON.parse(await readFile(f, 'utf8'));

let top = [], low = [], months = [], courts = {}, from;
const files = existsSync(`${store}m`) ? (await readdir(`${store}m`)).filter(f => f.endsWith('.json')) : [];
if (files.length) {
  const done = existsSync(`${store}done.json`) ? await read(`${store}done.json`) : {};
  months = done.months || [];
  courts = done.courts || {};
  const rows = [];
  for (const f of files) for (const r of await read(`${store}m/${f}`)) rows.push(r);
  const all = dropDeleted(mergeRulings([], rows), new Set(done.gone || []));
  top = all.filter(r => courtOf(r[0]));
  low = all.filter(r => !courtOf(r[0]) && lowCode(r[0]));
  from = `store (${files.length} files)`;
} else {
  const prev = (await prevJson('rulings/all.json')) || {};
  top = prev.rulings || [];
  months = prev.months || [];
  from = 'last deploy (no store)';
}
// Never fewer than the last deploy by much: a lost store or a bad read keeps the site's copy.
const before = await prevJson('rulings/months.json');
const hadTop = (before?.months || []).reduce((n, m) => n + m[1] + m[2], 0);
const nowTop = monthCounts(byMonth(top)).reduce((n, m) => n + m[1] + m[2], 0);
if (hadTop > 1000 && nowTop < hadTop * 0.8) {
  const prev = (await prevJson('rulings/all.json')) || {};
  console.warn(`rulings: ${nowTop} top-court rulings from ${from}, the last deploy had ${hadTop}: its copy kept`);
  if (prev.rulings?.length) ((top = prev.rulings), (months = prev.months || months));
}

await mkdir(out, { recursive: true });
await writeFile(out + 'all.json', JSON.stringify({ built: new Date().toISOString(), months, rulings: top }));
const laws = byLaw(top);
for (const [p, arts] of Object.entries(laws)) await writeFile(`${out}${p}.json`, JSON.stringify(arts));
await writeFile(out + 'laws.json', JSON.stringify(lawCounts(top)));
await writeFile(out + 'latest.json', JSON.stringify({ rulings: latestRulings(top.filter(r => courtOf(r[0]) !== 'JCC')) }));
const perMonth = byMonth(top);
await mkdir(out + 'm', { recursive: true });
for (const [m, list] of Object.entries(perMonth)) await writeFile(`${out}m/${m}.json`, JSON.stringify(list));
await writeFile(out + 'months.json', JSON.stringify({ months: monthCounts(perMonth), read: months }));
await writeFile(out + 'find.json', JSON.stringify(findRows(top)));

// The other courts: low/index.json (courts, 案由, counts per law, newest),
// low/law/<pcode>.json, low/t/<key>.json (one 案由), low/c/<code>.json (one court).
const v = lowViews(low, { names: courts });
const lo = `${out}low/`;
for (const d of ['law', 't', 'c']) await mkdir(lo + d, { recursive: true });
const span = low.length ? [low.at(-1)[1], low[0][1]] : [];
await writeFile(lo + 'index.json', JSON.stringify({ built: new Date().toISOString(), n: low.length, span, months: months.length, courts: v.courts, titles: v.titles, latest: v.latest }));
await writeFile(lo + 'laws.json', JSON.stringify(v.laws));
await writeFile(lo + 'courts.json', JSON.stringify(Object.fromEntries(v.courts.map(([c, n]) => [c, n]))));
for (const [p, arts] of Object.entries(v.byLaw)) await writeFile(`${lo}law/${p}.json`, JSON.stringify(arts));
for (const [t, rows] of Object.entries(v.byTitle)) await writeFile(`${lo}t/${titleKey(t)}.json`, JSON.stringify(rows));
for (const [c, rows] of Object.entries(v.byCourt)) await writeFile(`${lo}c/${c}.json`, JSON.stringify(rows));
console.log(`rulings from ${from}: ${top.length} top-court under ${Object.keys(laws).length} laws; ${low.length} other courts' judgments (${v.courts.length} courts, ${v.titles.length} 案由, under ${Object.keys(v.laws).length} laws); ${months.length} months read`);
