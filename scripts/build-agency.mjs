// 行政規則 the agencies publish themselves (全國法規資料庫 has only 法律 and
// 法規命令): 金管會, 國防部, 客委會, 國發會 bulk open data (農業部's has no
// page per rule yet), linked to the laws and articles they rest on. A source
// that fails never stops the deploy: its rules from the last deploy are kept.
// Runs after build-data.mjs (needs public/data/index.json).
//   node scripts/build-agency.mjs [--prev https://jaypengx.github.io/Orbit-Law/data/]
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { nameMap } from '../public/lib/refs.mjs';
import { parseFsc, parseMnd, parseNdc, parseHakka, parseMoa, linkRules, byLaw } from '../public/lib/agency.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const PREV = args.prev ?? 'https://jaypengx.github.io/Orbit-Law/data/';
const data = new URL('../public/data/', import.meta.url).pathname;
const out = data + 'agency/';
const UA = 'Orbit-Law build (+https://github.com/jaypengx/Orbit-Law)';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
// One request at a time, about a second apart, three tries, 2 minutes each.
async function get(url) {
  let err;
  for (let i = 1; i <= 3; i++) {
    await sleep(Math.max(0, last + 1000 - Date.now()));
    last = Date.now();
    try {
      const r = await fetch(encodeURI(url), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.text()).replace(/^﻿/, '');
    } catch (e) {
      err = e;
      await sleep(3000 * i);
    }
  }
  throw err;
}

const FSC = ['本會', '銀行局', '證券期貨局', '保險局', '檢查局'];
const SOURCES = [
  ...FSC.map(f => [`金管會${f}`, async () => parseFsc(await get(`https://law.fsc.gov.tw/opendata/${f}.xml`))]),
  ['農業部', async () => parseMoa(JSON.parse(await get('https://data.moa.gov.tw/Service/OpenData/FromM/RegulationsData.aspx?IsTransData=1&UnitId=021')))],
  ['國防部', async () => parseMnd(await get('https://law.mnd.gov.tw/OpenData/Direction.xml'))],
  ['客委會', async () => parseHakka(JSON.parse(await get('https://cloud.hakka.gov.tw/Pub/Opendata/DTST20240800002.json')))],
  ['國發會', async () => parseNdc(await get('https://ws.ndc.gov.tw/001/administrator/10/relfile/5781/26192/18370f9e-4372-4b12-8224-3a2f4c54921e.xml'))]
];

let prev = null;
try {
  const r = PREV && (await fetch(PREV + 'agency/all.json', { signal: AbortSignal.timeout(60_000) }));
  if (r?.ok) prev = await r.json();
} catch {}

const index = JSON.parse(await readFile(data + 'index.json', 'utf8'));
const names = nameMap(index.laws);
// Regulations 全國法規資料庫 already has: not repeated here.
const known = new Set(index.laws.filter(r => r[2] === '命令').map(r => r[1]));

const sources = {};
const raw = [];
const carried = [];
// The agency's label of a source's rules in the last deploy (a rule's agency is its source's).
const labelOf = name => (name.startsWith('金管會') ? '金管會' : name);
for (const [name, load] of SOURCES) {
  try {
    const rules = await load();
    sources[name] = rules.length;
    if (rules.stats) console.log(`${name}: ${rules.stats.seen} in force, ${rules.stats.noId} without an id dropped`);
    raw.push(...rules);
  } catch (e) {
    console.warn(`${name}: ${e.message}`);
    sources[name] = `error: ${e.message}`;
    // Carry this source's old rules over (金管會's five files share one agency name: by id prefix).
    const old = (prev?.rules || []).filter(r => (name.startsWith('金管會') ? false : r[2] === labelOf(name)));
    carried.push(...old);
    if (old.length) sources[name] += ` (${old.length} carried over)`;
  }
}
// 金管會: if any of its five files failed, keep all its old rules not rebuilt this time.
if (Object.entries(sources).some(([k, v]) => k.startsWith('金管會') && typeof v === 'string')) {
  const have = new Set(raw.map(r => r.id));
  const old = (prev?.rules || []).filter(r => r[0].startsWith('FSC:') && !have.has(r[0]));
  carried.push(...old);
  sources['金管會(carried)'] = old.length;
}

const fresh = linkRules(raw, index.laws, names, known);
const keep = new Set(fresh.map(r => r[0]));
const rules = [...fresh, ...carried.filter(r => !keep.has(r[0]))];
const { files, counts } = byLaw(rules);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(out + 'all.json', JSON.stringify({ built: new Date().toISOString(), sources, rules }));
for (const [p, f] of Object.entries(files)) await writeFile(`${out}${p}.json`, JSON.stringify(f));
await writeFile(out + 'counts.json', JSON.stringify(counts));

// Report: how many rules link by article or by name; how many delegating
// articles with no regulation linked now gain a rule.
const byArt = rules.filter(r => r[5].length).length;
console.log('sources:', JSON.stringify(sources));
console.log(`rules kept ${rules.length} (raw ${raw.length}): by article ${byArt}, by name only ${rules.length - byArt}; ${Object.keys(counts).length} laws`);
const DELEGATES = /(辦法|規則|標準|細則|準則|規程|要點|規定)[^。]{0,20}由[^。]{0,30}定之/;
let open = 0, gained = 0;
for (const row of index.laws) {
  const p = row[0];
  let law, deleg = {};
  try { law = JSON.parse(await readFile(`${data}law/${p}.json`, 'utf8')); } catch { continue; }
  try { deleg = JSON.parse(await readFile(`${data}deleg/${p}.json`, 'utf8')).to || {}; } catch {}
  for (const a of law.a || []) {
    if (a[0] !== 'A' || !DELEGATES.test(a[2]) || deleg[a[1]]?.length) continue;
    open++;
    if (files[p]?.to[a[1]]?.length) gained++;
  }
}
console.log(`delegating articles with no regulation linked: ${open}; now with an agency rule: ${gained}`);
