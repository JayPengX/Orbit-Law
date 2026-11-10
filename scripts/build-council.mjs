// 地方議會: the 22 縣市議會 (their sessions and sittings, the bills of the
// current term, the councillors) and every 鄉鎮市民代表 and 山地原住民區民代表
// in office, from 歐噴有限公司's 地方議會開放 API (all.cc.govapi.tw, the people
// behind v2.ly.govapi.tw: each council's own site and 內政部's and 中選會's
// lists, refreshed daily). Writes public/data/council/:
//   index.json     every council in one line: its session now, next sitting, counts
//   <code>.json    one council: sittings, sessions, councillors, the newest bills
//   reps.json      鄉鎮市民代表 by county and township (中選會's 2022 winners)
// A bill's whole text, a search and a councillor's bills are read from the
// API by the app when asked (lib/council.mjs). Never fails the deploy: a
// council that can't be read today keeps the last deploy's copy.
//   node scripts/build-council.mjs [--prev https://orbit.jaypengx.com/law/data/]
import { mkdir, writeFile } from 'node:fs/promises';
import { args, sleep, prevJson } from './lib.mjs';
import { compactCouncil, compactSitting, compactCouncilor, compactCouncilBill, newestBills, compactRep, repsByPlace } from '../public/lib/council.mjs';

const API = 'https://all.cc.govapi.tw/api/';
const out = new URL('../public/data/council/', import.meta.url).pathname;
const started = Date.now();
const notes = [];

async function get(path, query = {}, fields = []) {
  const q = new URLSearchParams(query);
  for (const f of fields) q.append('output_fields', f);
  for (let tries = 0; ; tries++) {
    await sleep(200);
    try {
      const r = await fetch(`${API}${path}?${q}`, { signal: AbortSignal.timeout(90_000), headers: { 'User-Agent': 'Orbit-Law nightly (+https://orbit.jaypengx.com/law/)' } });
      if (!r.ok) throw new Error(`${path} ${r.status}`);
      return await r.json();
    } catch (e) {
      if (tries >= 2) throw e;
      await sleep(4000 * (tries + 1));
    }
  }
}
// Every row of a query. The API pages only its first 10,000 (page × limit):
// past that, the rest is read from the other end (sorted the other way by `id`).
async function all(path, key, query, fields, limit = 2000, id = '代碼') {
  const rows = [];
  let total = 0;
  for (let page = 1; page * limit <= 10000; page++) {
    const r = await get(path, { ...query, sort: `${id}<`, limit: String(limit), page: String(page) }, fields);
    total = r.total || 0;
    rows.push(...(r[key] || []));
    if (page >= (r.total_page || 0) || !(r[key] || []).length) return rows;
  }
  const rest = total - rows.length;
  for (let page = 1; (page - 1) * limit < rest; page++) {
    const r = await get(path, { ...query, sort: `${id}>`, limit: String(limit), page: String(page) }, fields);
    rows.push(...(r[key] || []).slice(0, rest - (page - 1) * limit));
  }
  return rows;
}

await mkdir(out, { recursive: true });
const write = (path, data) => writeFile(out + path, JSON.stringify(data));
const built = new Date().toISOString();
const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

let overviews = [];
try {
  overviews = (await get('overviews', { limit: '100' })).overviews.filter(o => o['現存']);
} catch (e) {
  notes.push(`overviews failed: ${e.message}`);
}
const prevIndex = await prevJson('council/index.json');
const index = [];
for (const o of overviews) {
  const code = o['代碼'];
  try {
    const term = o['屆次'];
    const [sessions, sittings, councilors, bills] = [
      await all('sessions', 'sessions', { 議會代碼: code, 屆: String(term) }, ['代碼', '會期名稱', '會期類別', '開始日期', '結束日期'], 200),
      (await get('sittings', { 議會代碼: code, sort: '日期>', limit: '80' })).sittings || [],
      await all('councilors', 'councilors', { 議會代碼: code, 屆次: String(term) }, ['姓名', '黨籍', '參選政黨', '選區別', '職稱', '照片', '現況', '人物代碼', '屆次'], 200, '姓名'),
      await all('bills', 'bills', { 議會代碼: code, 屆: String(term) }, ['代碼', '案號', '類別', '提案人', '提案單位', '案由', '議決', '審查意見', '會議代碼'])
    ];
    const c = compactCouncil(o, { day, sessions, bills: bills.length });
    const people = councilors.filter(p => (p['屆次'] ?? term) === term).map(compactCouncilor).filter(Boolean);
    // How many bills each councillor's name is on this term (first or co-filer).
    for (const p of people) p.bills = bills.filter(b => String(b['提案人'] || '').includes(p.n)).length;
    const rows = bills.map(compactCouncilBill);
    await write(`${code}.json`, {
      ...c,
      built,
      sittings: sittings.map(compactSitting).filter(Boolean),
      sessions: sessions.map(s => ({ id: s['代碼'], n: s['會期名稱'], kind: s['會期類別'], from: s['開始日期'], to: s['結束日期'] || '' })).sort((a, b) => (a.from < b.from ? 1 : -1)),
      people,
      bills: newestBills(rows, sessions, 240)
    });
    index.push({ ...c, people: people.length });
  } catch (e) {
    notes.push(`${code} failed: ${e.message}`);
    const old = await prevJson(`council/${code}.json`);
    if (old) {
      await write(`${code}.json`, old);
      const row = prevIndex?.councils?.find(x => x.c === code);
      if (row) index.push(row);
    }
  }
}
if (index.length) await write('index.json', { built, day, councils: index });
else if (prevIndex) await write('index.json', prevIndex);

// 鄉鎮市民代表 and 山地原住民區民代表 in office: 中選會's 2022 winners.
try {
  const reps = [];
  for (const role of ['鄉鎮市民代表', '山地原住民區民代表']) reps.push(...(await all('candidates', 'candidates', { 年份: '111', 參選職位: role, 當選: 'true' }, ['姓名', '縣市', '議會代碼', '鄉鎮市區', '鄉鎮市區代碼', '選區別', '參選職位', '其他欄位'], 2000)));
  if (reps.length < 1000) throw new Error(`only ${reps.length}`);
  await write('reps.json', { built, year: 2022, places: repsByPlace(reps.map(compactRep)) });
  notes.push(`${reps.length} representatives`);
} catch (e) {
  notes.push(`reps failed: ${e.message}`);
  const old = await prevJson('council/reps.json');
  if (old) await write('reps.json', old);
}

console.log(`council: ${index.length} councils, ${Math.round((Date.now() - started) / 1000)}s`);
for (const n of notes) console.log(`council note: ${n}`);
