// 行政規則 the agencies publish themselves (全國法規資料庫 has only 法律 and
// 法規命令): 金管會, 國防部, 客委會, 國發會 bulk open data (農業部's has no
// page per rule yet), linked to the laws and articles they rest on. A source
// that fails never stops the deploy: its rules from the last deploy are kept.
// Runs after build-data.mjs (needs public/data/index.json).
// Also the shared 主管法規 vendor sites (HTML only), all at once, each host one
// request a second: every category listed (the longest unlisted first, carried
// over between deploys in agency/state.json), every 行政規則 / 其他 kept, linked
// to a law or not, and each page read whole into agency/text/ (cached by date
// from the last deploy) until --minutes (default 20), the rest read next time.
//   node scripts/build-agency.mjs [--prev https://jaypengx.github.io/Orbit-Law/data/] [--minutes 20]
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { nameMap } from '../public/lib/refs.mjs';
import { textFile, parseFsc, parseMnd, parseNdc, parseHakka, parseMoa, nameLaws, linkRules, byLaw, vendorLeaves, vendorList, vendorText, vendorRule, vendorWant, staleFirst, listedRows, listedKeep } from '../public/lib/agency.mjs';
import { args, prevJson, getter, pool } from './lib.mjs';

const data = new URL('../public/data/', import.meta.url).pathname;
const out = data + 'agency/';
const UA = 'Orbit-Law build (+https://github.com/jaypengx/Orbit-Law)';

const START = Date.now();
const DEADLINE = START + (+args.minutes || 20) * 60_000;
const get = getter(UA);

const FSC = ['本會', '銀行局', '證券期貨局', '保險局', '檢查局'];
const SOURCES = [
  ...FSC.map(f => [`金管會${f}`, async () => parseFsc(await get(`https://law.fsc.gov.tw/opendata/${f}.xml`))]),
  ['農業部', async () => parseMoa(JSON.parse(await get('https://data.moa.gov.tw/Service/OpenData/FromM/RegulationsData.aspx?IsTransData=1&UnitId=021')))],
  ['國防部', async () => parseMnd(await get('https://law.mnd.gov.tw/OpenData/Direction.xml'))],
  ['客委會', async () => parseHakka(JSON.parse(await get('https://cloud.hakka.gov.tw/Pub/Opendata/DTST20240800002.json')))],
  ['國發會', async () => parseNdc(await get('https://ws.ndc.gov.tw/001/administrator/10/relfile/5781/26192/18370f9e-4372-4b12-8224-3a2f4c54921e.xml'))]
];

const prev = await prevJson('agency/all.json');

const index = JSON.parse(await readFile(data + 'index.json', 'utf8'));
const names = nameMap(index.laws);
// Regulations 全國法規資料庫 already has: not repeated here.
const known = new Set(index.laws.filter(r => r[2] === '命令').map(r => r[1]));

// ---- vendor sites
// [agency, site, id prefix]: the prefix is ASCII (a rule's id names its text file; ids repeat across sites).
const VENDORS = [
  ['農業部', 'https://law.moa.gov.tw', 'MOA'],
  ['環境部', 'https://oaout.moenv.gov.tw/law', 'MOENV'],
  ['財政部', 'https://law-out.mof.gov.tw', 'MOF'],
  ['教育部', 'https://edu.law.moe.gov.tw', 'MOE'],
  ['客委會', 'https://law.hakka.gov.tw', 'HAKKALAW'],
  ['國科會', 'https://law.nstc.gov.tw', 'NSTC']
];
// What the last deploy knew (agency/state.json): each site's categories with their rows and the time
// they were listed, so a site is listed a few categories a night, the oldest first, and kept whole in
// between; and the pages that gave no text (not asked again until their date changes).
const state = (await prevJson('agency/state.json')) || {};
const listing = state.listing || {};
const empty = state.empty || {};
const vstats = {};
const vraw = [];
const vcarried = [];
const prevRows = new Map((prev?.rules || []).map(r => [r[0], r]));
const tooLate = () => Date.now() > DEADLINE;
const LIST_UNTIL = START + (DEADLINE - START) * 0.5; // the rest of the time goes to reading pages

// One category's rows, all its pages, added to `rows` as they come (the time can run out halfway).
async function listLeaf(base, leaf, rows) {
  for (let page = 1; ; page++) {
    if (Date.now() > LIST_UNTIL) throw new Error('listing budget');
    const { total, rows: got } = vendorList(await get(`${base}/LawCategoryContentList.aspx?CategoryID=${leaf}&size=30&page=${page}`, { tries: 2, timeout: 30_000 }));
    rows.push(...got);
    if (!got.length || rows.length >= total) return;
  }
}

// Each site runs on its own, all at once (each host still one request a second).
async function vendor(agency, base, code) {
  const st = (vstats[agency] = { leaves: 0, listedNow: 0, listed: 0, rules: 0, fetched: 0, cached: 0, deferred: 0 });
  const mine = (listing[agency] ||= {});
  let leaves = Object.keys(mine); // the last deploy's categories, if the site's own list can't be read
  try {
    const now = vendorLeaves(await get(`${base}/LawQuery.aspx`, { tries: 2, timeout: 30_000 }));
    if (!now.length) throw new Error('no categories');
    leaves = now;
    for (const k of Object.keys(mine)) if (!now.includes(k)) delete mine[k];
  } catch (e) {
    st.error = e.message;
    console.warn(`${agency}: ${e.message}`);
  }
  st.leaves = leaves.length;
  for (const leaf of staleFirst(leaves, mine)) {
    const rows = [];
    try {
      await listLeaf(base, leaf, rows);
      mine[leaf] = { at: Date.now(), rows: listedKeep(rows) };
      st.listedNow++;
    } catch (e) {
      // What was read of it goes over the last copy; its time stays, so it is the first to be listed next time.
      const have = new Map((mine[leaf]?.rows || []).map(r => [r[0], r]));
      for (const r of listedKeep(rows)) have.set(r[0], r);
      mine[leaf] = { at: mine[leaf]?.at || 0, rows: [...have.values()] };
      st.error = e.message;
      console.warn(`${agency}: ${e.message}`);
      break;
    }
  }
  const items = listedRows(leaves, mine);
  st.listed = items.size;
  if (!items.size) {
    // Nothing listed yet: keep its old rules as they were.
    vcarried.push(...(prev?.rules || []).filter(r => r[2] === agency && r[0].startsWith(code + ':')));
    return;
  }
  const want = vendorWant(items, known);
  st.rules = want.length;
  // The last deploy's text of a rule is kept while its date is the same; the others are read.
  const todo = [];
  await pool(want, 8, async r => {
    const key = `${code}:${r.id}`;
    const old = empty[key] === r.date ? { t: '' } : await prevJson(`agency/text/${textFile(key)}.json`);
    if (old && (!old.t || old.d === r.date)) (st.cached++, vraw.push(vendorRule(code, agency, base, r.id, r.name, r.date, old.t)));
    else todo.push(r);
  });
  // Names that already speak of a law need no page to be kept: read the others first.
  const linked = r => nameLaws(index.laws, r.name).length > 0;
  todo.sort((a, b) => linked(a) - linked(b) || (a.id < b.id ? -1 : 1));
  for (let bad = 0; todo.length; ) {
    const r = todo.shift();
    let text = '';
    if (tooLate() || bad >= 5) st.deferred++;
    else {
      try {
        text = vendorText(await get(`${base}/LawContent.aspx?id=${r.id}`, { tries: 2, timeout: 30_000 }));
        bad = 0;
        if (text.replace(/\s/g, '')) st.fetched++;
        else empty[`${code}:${r.id}`] = r.date;
      } catch {
        bad++;
        st.deferred++;
      }
    }
    vraw.push(vendorRule(code, agency, base, r.id, r.name, r.date, text));
  }
}
console.log(`vendor sites (budget ${Math.round((DEADLINE - START) / 60000)} min)`);
await Promise.all(VENDORS.map(async ([agency, base, code]) => { try { await vendor(agency, base, code); } catch (e) { console.warn(`${agency}: ${e.message}`); } }));
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

// A page not read this time keeps the laws and articles its last deploy's row had.
const unread = new Set(vraw.filter(r => !r.full).map(r => r.id));
const fresh = linkRules([...raw, ...vraw], index.laws, names, known).map(r => {
  const old = unread.has(r[0]) && prevRows.get(r[0]);
  return old ? [...r.slice(0, 5), [...new Set([...r[5], ...old[5]])], [...new Set([...r[6], ...old[6]])]] : r;
});
const keep = new Set(fresh.map(r => r[0]));
const keepName = new Set(fresh.map(r => `${r[2]}|${r[1]}`));
// Carried rules: not rebuilt this time (same id, or same agency and name).
const rules = [...fresh, ...[...carried, ...vcarried].filter(r => !keep.has(r[0]) && !keepName.has(`${r[2]}|${r[1]}`))];
for (const r of rules) { keep.add(r[0]); keepName.add(`${r[2]}|${r[1]}`); }
// Rules whose source gives their whole text: kept, so the app reads them itself.
// (國防部's and 金管會's open data carry it, the rule sites' pages are read whole; 國發會's is its history.)
const full = new Map([...raw.filter(r => /^(MND|FSC):/.test(r.id) && r.full.replace(/\s/g, '').length >= 80), ...vraw.filter(r => r.full.trim())].filter(r => keep.has(r.id)).map(r => [r.id, r]));
const { files, counts } = byLaw(rules, new Set(full.keys()));

await rm(out, { recursive: true, force: true });
await mkdir(out + 'text', { recursive: true });
for (const [id, r] of full) await writeFile(`${out}text/${textFile(id)}.json`, JSON.stringify({ n: r.name, a: r.agency, d: r.date, url: r.url, t: r.full }));
console.log(`texts kept: ${full.size}`);
await writeFile(out + 'all.json', JSON.stringify({ built: new Date().toISOString(), sources, vendor: vstats, rules }));
// The next build's memory of the rule sites, and the app's search list: [id, name, agency, url, 1 when its text is here].
await writeFile(out + 'state.json', JSON.stringify({ listing, empty }));
await writeFile(out + 'names.json', JSON.stringify(rules.map(r => (full.has(r[0]) ? [r[0], r[1], r[2], r[4], 1] : [r[0], r[1], r[2], r[4]]))));
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
