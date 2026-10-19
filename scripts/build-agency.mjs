// 行政規則 the agencies publish themselves (全國法規資料庫 has only 法律 and
// 法規命令): 金管會, 國防部, 客委會, 國發會 bulk open data (農業部's has no
// page per rule yet), linked to the laws and articles they rest on. A source
// that fails never stops the deploy: its rules from the last deploy are kept.
// Runs after build-data.mjs (needs public/data/index.json).
// Also the shared 主管法規 vendor sites (HTML only): 行政規則 listed per category,
// each page read once for its first 400 characters, cached by (id, date) from the
// last deploy, stopping at --minutes (default 20) and carrying the rest over.
//   node scripts/build-agency.mjs [--prev https://jaypengx.github.io/Orbit-Law/data/] [--minutes 20]
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { nameMap } from '../public/lib/refs.mjs';
import { parseFsc, parseMnd, parseNdc, parseHakka, parseMoa, nameLaws, linkRules, byLaw, isRuleName, vendorLeaves, vendorList, vendorText, vendorRule } from '../public/lib/agency.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const PREV = args.prev ?? 'https://jaypengx.github.io/Orbit-Law/data/';
const data = new URL('../public/data/', import.meta.url).pathname;
const out = data + 'agency/';
const UA = 'Orbit-Law build (+https://github.com/jaypengx/Orbit-Law)';

const START = Date.now();
const DEADLINE = START + (+args.minutes || 20) * 60_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastAt = {};
// One request at a time, at least a second apart per host, tries, a timeout each.
async function get(url, { tries = 3, timeout = 120_000 } = {}) {
  let err;
  const host = new URL(url).host;
  for (let i = 1; i <= tries; i++) {
    await sleep(Math.max(0, (lastAt[host] || 0) + 1000 - Date.now()));
    lastAt[host] = Date.now();
    try {
      const r = await fetch(encodeURI(url), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
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

// ---- vendor sites
const VENDORS = [
  ['農業部', 'https://law.moa.gov.tw'],
  ['環境部', 'https://oaout.moenv.gov.tw/law'],
  ['財政部', 'https://law-out.mof.gov.tw'],
  ['教育部', 'https://edu.law.moe.gov.tw'],
  ['客委會', 'https://law.hakka.gov.tw']
];
const checked = { ...(prev?.checked || {}) }; // vendor id → date, read in full at some deploy
const vstats = {};
const queues = [];
const vraw = [];
const vcarried = [];
const prevRows = new Map((prev?.rules || []).map(r => [r[0], r]));
const tooLate = () => Date.now() > DEADLINE;

async function vendor(agency, base) {
  const st = (vstats[agency] = { listed: 0, rules: 0, fetched: 0, cached: 0, deferred: 0 });
  const items = new Map();
  try {
    const leaves = vendorLeaves(await get(`${base}/LawQuery.aspx`, { tries: 2, timeout: 30_000 }));
    if (!leaves.length) throw new Error('no categories');
    for (const leaf of leaves) {
      for (let page = 1, got = 0; ; page++) {
        if (Date.now() > START + (DEADLINE - START) * 0.6) throw new Error('listing budget');
        const { total, rows } = vendorList(await get(`${base}/LawCategoryContentList.aspx?CategoryID=${leaf}&size=30&page=${page}`, { tries: 2, timeout: 30_000 }));
        for (const r of rows) items.set(r.id, r);
        got += rows.length;
        if (!rows.length || got >= total) break;
      }
    }
  } catch (e) {
    st.error = e.message;
    console.warn(`${agency}: ${e.message}`);
    if (!items.size) {
      // Nothing listed: keep its old rules as they were.
      vcarried.push(...(prev?.rules || []).filter(r => r[2] === agency && r[0].startsWith(agency + ':')));
      for (const id of Object.keys(checked)) if (id.startsWith(agency + ':')) st.cached++;
      return;
    }
  }
  st.listed = items.size;
  const want = [...items.values()].filter(r => r.type === '行政規則' && isRuleName(r.name) && !known.has(r.name));
  st.rules = want.length;
  const todo = [];
  for (const r of want) {
    const key = `${agency}:${r.id}`;
    if (checked[key] === r.date) {
      st.cached++;
      if (prevRows.has(key)) vcarried.push(prevRows.get(key));
    } else todo.push(r);
  }
  // Names that already speak of a law need no page to be kept: read the others first.
  const linked = r => nameLaws(index.laws, r.name).length > 0;
  todo.sort((a, b) => linked(a) - linked(b));
  queues.push({ agency, base, st, todo });
}
console.log(`vendor sites (budget ${Math.round((DEADLINE - START) / 60000)} min)`);
for (const [agency, base] of VENDORS) {
  try { await vendor(agency, base); } catch (e) { console.warn(`${agency}: ${e.message}`); }
}
// Pages are read round-robin across hosts until the budget is spent; the rest stay name-only.
for (let more = true; more;) {
  more = false;
  for (const { agency, base, st, todo } of queues) {
    const r = todo.shift();
    if (!r) continue;
    more = true;
    let text = '';
    if (tooLate()) st.deferred++;
    else {
      try {
        text = vendorText(await get(`${base}/LawContent.aspx?id=${r.id}`, { tries: 2, timeout: 30_000 }));
        checked[`${agency}:${r.id}`] = r.date;
        st.fetched++;
      } catch { st.deferred++; }
    }
    vraw.push(vendorRule(agency, base, r.id, r.name, r.date, text));
  }
}
for (const a of Object.keys(vstats)) console.log(a, JSON.stringify(vstats[a]));

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

const fresh = linkRules([...raw, ...vraw], index.laws, names, known);
const keep = new Set(fresh.map(r => r[0]));
const keepName = new Set(fresh.map(r => `${r[2]}|${r[1]}`));
// Carried rules: not rebuilt this time (same id, or same agency and name).
const rules = [...fresh, ...[...carried, ...vcarried].filter(r => !keep.has(r[0]) && !keepName.has(`${r[2]}|${r[1]}`))];
for (const r of rules) { keep.add(r[0]); keepName.add(`${r[2]}|${r[1]}`); }
const { files, counts } = byLaw(rules);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(out + 'all.json', JSON.stringify({ built: new Date().toISOString(), sources, vendor: vstats, checked, rules }));
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

console.log(`done in ${Math.round((Date.now() - START) / 1000)} s`);
