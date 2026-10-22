// 地方法規: the cities' 自治條例, 自治規則, 委辦規則 and 行政規則 from their own 法規查詢系統
// (臺北市, 新北市, and the 主管法規 platform every other city and county runs), each rule's whole
// text kept, linked to the laws it names or rests on. All sites run at once, each host one
// request a second: every list is read a part at a time (the longest unread first, carried over
// between deploys in local/state.json), then the pages not read yet, until --minutes (default
// 20); the rest is read next time. A site that fails keeps its rules from the last deploy.
// Runs after build-data.mjs (needs public/data/index.json).
//   node scripts/build-local.mjs [--prev https://jaypengx.github.io/Orbit-Law/data/] [--minutes 20]
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { nameMap } from '../public/lib/refs.mjs';
import { rule, textFile, linkRules, vendorLeaves, vendorList, staleFirst, listedRows } from '../public/lib/agency.mjs';
import { NTPC_KINDS, localKeep, localWant, needsRead, platformText, tpeList, tpeText, ntpcList, ntpcText, ntpcCode } from '../public/lib/local.mjs';
import { args, prevJson, getter, pool } from './lib.mjs';

const data = new URL('../public/data/', import.meta.url).pathname;
const out = data + 'local/';
const UA = 'Orbit-Law build (+https://github.com/jaypengx/Orbit-Law)';

const START = Date.now();
const DEADLINE = START + (+args.minutes || 20) * 60_000;
const LIST_UNTIL = START + (DEADLINE - START) * 0.5; // the rest of the time goes to reading pages
const LIST_EVERY = 6 * 3600_000; // a part listed more recently than this is not listed again
const TODAY = new Date(START + 8 * 3600_000).toISOString().slice(0, 10); // Taiwan's day
const get = getter(UA);
const tooLate = () => Date.now() > DEADLINE;

// ---- The sites. code: the ASCII prefix of a rule's id (ids repeat across sites; a text file's name keeps only ASCII).
//  keys(): the parts the list comes in (a category, a page); list(key, rows): that part's rows pushed
//  one page at a time ({ id, name, date, type }); read(id): { text, date } of a rule; url(id): its page.
// A site that serves only Taiwan is read through the proxy's /law-page with the build's key
// (LAW_BUILD_KEY; without it, tried directly), fetched there from Taiwan.
const TWCA_SSL = await readFile(new URL('certs/twca-secure-ssl.pem', import.meta.url), 'utf8');
const DOOR = 'https://orbit-workers-proxy.pengzjay.workers.dev/law-page';
const KEY = process.env.LAW_BUILD_KEY || '';
const door = url => [`${DOOR}?v=1&u=${encodeURIComponent(url)}`, { 'X-Build-Key': KEY }];
// base: the site's root, or a few to try (the first whose 法規 list reads is kept).
const platform = (code, city, base, { twOnly = false, ca = null } = {}) => {
  const via = twOnly && KEY ? door : null;
  const get1 = (url, o) => get(url, { ...o, via, ca });
  if (!Array.isArray(base)) return platformSite(code, city, base, get1);
  let site = platformSite(code, city, base[0], get1);
  return {
    ...site,
    keys: async () => {
      let err;
      for (const b of base) {
        const s = platformSite(code, city, b, get1);
        try {
          const keys = await s.keys();
          site = s;
          return keys;
        } catch (e) {
          err = e;
        }
      }
      throw err;
    },
    list: (...a) => site.list(...a),
    read: id => site.read(id),
    url: id => site.url(id)
  };
};
const platformSite = (code, city, base, get) => ({
  code, city,
  keys: async () => {
    const leaves = vendorLeaves(await get(`${base}/LawQuery.aspx`, { tries: 2, timeout: 30_000 }));
    if (!leaves.length) throw new Error('no categories');
    return leaves;
  },
  list: async (leaf, rows) => {
    for (let page = 1; ; page++) {
      if (Date.now() > LIST_UNTIL) throw new Error('listing budget');
      const { total, rows: got } = vendorList(await get(`${base}/LawCategoryContentList.aspx?CategoryID=${leaf}&size=30&page=${page}`, { tries: 2, timeout: 30_000 }));
      rows.push(...got);
      if (!got.length || rows.length >= total) return;
    }
  },
  read: async id => ({ text: platformText(await get(`${base}/LawContent.aspx?id=${id}`, { tries: 2, timeout: 30_000 })), date: '' }),
  url: id => `${base}/LawContent.aspx?id=${id}`
});

const TPE = 'https://laws.gov.taipei/Law';
const NTPC = 'https://web.law.ntpc.gov.tw';
const SITES = [
  {
    // The whole city is category 001: 20 rules a page.
    code: 'TPE', city: '臺北市',
    keys: async () => Array.from({ length: tpeList(await get(`${TPE}/LawCategory/LawCategoryResult?categoryid=001`, { tries: 2, timeout: 60_000 })).pages }, (_, i) => String(i + 1)),
    list: async (page, rows) => rows.push(...tpeList(await get(`${TPE}/LawCategory/LawCategoryResult?categoryid=001&page=${page}`, { tries: 2, timeout: 60_000 })).rows),
    read: async id => tpeText(await get(`${TPE}/LawSearch/LawArticleContent/${id}`, { tries: 2, timeout: 60_000 })),
    url: id => `${TPE}/LawSearch/LawArticleContent/${id}`
  },
  {
    // A kind (Query5.aspx?name=A..D) is one page; an id is the page's lncode.
    code: 'NTPC', city: '新北市',
    keys: async () => Object.keys(NTPC_KINDS),
    list: async (k, rows) => rows.push(...ntpcList(await get(`${NTPC}/Scripts/Query5.aspx?name=${k}`, { tries: 2, timeout: 90_000 }), NTPC_KINDS[k])),
    read: async id => ntpcText(await get(`${NTPC}/Scripts/FLAWDAT0202.aspx?fcode=${ntpcCode(id)}`, { tries: 2, timeout: 60_000 })),
    url: id => `${NTPC}/Scripts/FLAWDAT0202.aspx?fcode=${ntpcCode(id)}`
  },
  platform('KHH', '高雄市', 'https://outlaw.kcg.gov.tw'),
  platform('TXG', '臺中市', 'https://law.taichung.gov.tw'),
  platform('HSZ', '新竹市', 'https://law.hccg.gov.tw'),
  platform('KNH', '金門縣', 'https://law.kinmen.gov.tw'),
  platform('MIA', '苗栗縣', 'https://law.miaoli.gov.tw/glrsnewsout'),
  platform('CHA', '彰化縣', 'https://lawsearch.chcg.gov.tw/GLRSNEWSOUT'),
  // These serve only Taiwan (from the cloud box and GitHub's runners: refused): read through the proxy's door.
  // Every site's address as 全國法規資料庫's 相關網站 lists it (law.moj.gov.tw/RelatedWebsite.aspx).
  platform('TYC', '桃園市', 'https://law.tycg.gov.tw', { twOnly: true }),
  platform('TNN', '臺南市', 'https://law01.tainan.gov.tw/glrsnewsout', { twOnly: true }),
  platform('ILA', '宜蘭縣', 'https://glrslaw.e-land.gov.tw', { twOnly: true }),
  platform('YUN', '雲林縣', 'https://law.yunlin.gov.tw', { twOnly: true }),
  platform('PIF', '屏東縣', 'https://ptlaw.pthg.gov.tw', { twOnly: true }),
  platform('TTT', '臺東縣', 'https://law.taitung.gov.tw', { twOnly: true }),
  platform('HUA', '花蓮縣', 'https://glrs.hl.gov.tw/glrsout', { twOnly: true }),
  platform('LNN', '連江縣', 'https://law.matsu.gov.tw'),
  // 基隆市's server leaves out its certificate's intermediate (TWCA Secure SSL, public, under a root Node
  // trusts): read directly, that intermediate trusted for this site alone.
  platform('KEE', '基隆市', 'https://exlaw.klcg.gov.tw', { ca: TWCA_SSL }),
  platform('HSQ', '新竹縣', 'https://hclaw.hsinchu.gov.tw/law', { twOnly: true }),
  platform('NAN', '南投縣', 'https://glrs.nantou.gov.tw/glrsout', { twOnly: true }),
  platform('CYI', '嘉義市', 'https://law.chiayi.gov.tw'),
  platform('CYQ', '嘉義縣', 'https://law.cyhg.gov.tw', { twOnly: true }),
  platform('PEN', '澎湖縣', 'https://law.penghu.gov.tw/glrsnewsout', { twOnly: true })
];

const prev = await prevJson('local/all.json');
const index = JSON.parse(await readFile(data + 'index.json', 'utf8'));
const names = nameMap(index.laws);
// What the last deploy knew (local/state.json): each site's parts with their rows and the time they were
// listed, and each rule's stamp when its page was last read (the list's date, or the day it was read).
const state = (await prevJson('local/state.json')) || {};
const listing = state.listing || {};
const read = state.read || {};
const stats = {};
const raw = [];
const OLD = id => prevJson(`local/text/${textFile(id)}.json`);
// The rules the last deploy kept a text of (names.json's flag): a read stamp lost from state.json
// is taken back from it, so a kept text is never read again for nothing.
const hadText = new Set(((await prevJson('local/names.json')) || []).filter(r => r?.[4]).map(r => r[0]));

async function site(s) {
  const st = (stats[s.city] = { parts: 0, listedNow: 0, listed: 0, rules: 0, fetched: 0, cached: 0, deferred: 0 });
  const mine = (listing[s.code] ||= {});
  let keys = Object.keys(mine); // the last deploy's parts, if the site's own list can't be read
  try {
    keys = await s.keys();
    for (const k of Object.keys(mine)) if (!keys.includes(k)) delete mine[k];
  } catch (e) {
    st.error = e.message;
    console.warn(`${s.city}: ${e.message}`);
  }
  st.parts = keys.length;
  for (const k of staleFirst(keys, mine)) {
    if (Date.now() - (mine[k]?.at || 0) < LIST_EVERY) continue; // listed a few hours ago: the time goes to reading
    const rows = [];
    try {
      await s.list(k, rows);
      mine[k] = { at: Date.now(), rows: localKeep(rows) };
      st.listedNow++;
    } catch (e) {
      // What was read of it goes over the last copy; its time stays, so it is the first to be listed next time.
      const have = new Map((mine[k]?.rows || []).map(r => [r[0], r]));
      for (const r of localKeep(rows)) have.set(r[0], r);
      mine[k] = { at: mine[k]?.at || 0, rows: [...have.values()] };
      st.error = e.message;
      console.warn(`${s.city}: ${e.message}`);
      break;
    }
  }
  const items = listedRows(keys, mine);
  // A list not read in full this time: the last deploy's rules of the city it misses stay.
  if (st.error)
    for (const r of prev?.rules || [])
      if (r[0].startsWith(s.code + ':') && !items.has(r[0].slice(s.code.length + 1))) items.set(r[0].slice(s.code.length + 1), { id: r[0].slice(s.code.length + 1), name: r[1], date: r[3], type: /自治條例$/.test(r[1]) ? '自治條例' : '自治規則' });
  st.listed = items.size;
  if (!items.size) {
    // Nothing listed: keep its old rules, with their old text.
    await pool((prev?.rules || []).filter(r => r[0].startsWith(s.code + ':')), 8, async r => raw.push(rule(r[0], r[1], r[2], r[3], r[4], (await OLD(r[0]))?.t || '')));
    return;
  }
  const want = localWant(items);
  st.rules = want.length;
  // The last deploy's text of a rule is kept while its stamp holds; the others are read.
  const todo = [];
  await pool(want, 8, async r => {
    const id = `${s.code}:${r.id}`;
    if (read[id] === undefined && hadText.has(id)) read[id] = r.date || TODAY;
    const old = read[id] === undefined ? null : await OLD(id);
    const row = (text, date) => rule(id, r.name, s.city, date || r.date, s.url(r.id), text);
    if (read[id] !== undefined && !needsRead(r, { stamp: read[id] }, TODAY)) (st.cached++, raw.push(row(old?.t || '', old?.d)));
    else todo.push({ r, id, old, row });
  });
  // Never read first, then the oldest; each in the order of the kinds.
  const order = new Map(want.map((r, i) => [r.id, i]));
  todo.sort((a, b) => (a.id in read) - (b.id in read) || order.get(a.r.id) - order.get(b.r.id));
  for (let bad = 0; todo.length; ) {
    const { r, id, old, row } = todo.shift();
    if (tooLate() || bad >= 5) {
      st.deferred++;
      raw.push(row(old?.t || '', old?.d));
      continue;
    }
    try {
      const got = await s.read(r.id);
      bad = 0;
      read[id] = r.date || TODAY;
      st.fetched++;
      raw.push(row(got.text, got.date || r.date));
    } catch {
      bad++;
      st.deferred++;
      raw.push(row(old?.t || '', old?.d));
    }
  }
}
console.log(`local sites (budget ${Math.round((DEADLINE - START) / 60000)} min)`);
await Promise.all(SITES.map(async s => { try { await site(s); } catch (e) { console.warn(`${s.city}: ${e.message}`); } }));
for (const c of Object.keys(stats)) console.log(c, JSON.stringify(stats[c]));

// [id, name, city, date, url, laws]: a rule's laws are those its text names or rests on, and the one its name speaks of.
const rules = linkRules(raw, index.laws, names).map(r => [r[0], r[1], r[2], r[3], r[4], r[6]]);
const full = new Map(raw.filter(r => r.full.trim()).map(r => [r.id, r]));
const kept = new Set(rules.map(r => r[0]));
for (const id of Object.keys(read)) if (!kept.has(id)) delete read[id];

await rm(out, { recursive: true, force: true });
await mkdir(out + 'text', { recursive: true });
let size = 0;
for (const r of rules) {
  const f = full.get(r[0]);
  if (!f) continue;
  const body = JSON.stringify({ n: f.name, a: f.agency, d: f.date, url: f.url, t: f.full });
  size += body.length;
  await writeFile(`${out}text/${textFile(r[0])}.json`, body);
}
const withText = new Set(rules.filter(r => full.has(r[0])).map(r => r[0]));
console.log(`texts kept: ${withText.size}, ${(size / 1e6).toFixed(1)} MB`);
await writeFile(out + 'all.json', JSON.stringify({ built: new Date().toISOString(), sources: stats, rules }));
await writeFile(out + 'state.json', JSON.stringify({ listing, read }));
await writeFile(out + 'names.json', JSON.stringify(rules.map(r => (withText.has(r[0]) ? [r[0], r[1], r[2], r[4], 1] : [r[0], r[1], r[2], r[4]]))));
const byCity = {};
for (const r of rules) byCity[r[2]] = (byCity[r[2]] || 0) + 1;
console.log(`rules ${rules.length} (${JSON.stringify(byCity)}), linked to a law: ${rules.filter(r => r[5].length).length}`);
console.log(`done in ${Math.round((Date.now() - START) / 1000)} s`);
