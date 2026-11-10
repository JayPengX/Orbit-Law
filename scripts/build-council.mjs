// 地方議會: the 22 縣市議會 (their sessions and sittings, the bills of the
// current term, the councillors) and every 鄉鎮市民代表 and 山地原住民區民代表
// in office, from 歐噴有限公司's 地方議會開放 API (all.cc.govapi.tw, the people
// behind v2.ly.govapi.tw: each council's own site and 內政部's and 中選會's
// lists, refreshed daily). Writes public/data/council/:
//   index.json     every council in one line: its session now, next sitting, counts
//   <code>.json    one council: sittings, sessions, councillors, the newest bills
//   reps.json      鄉鎮市民代表 by county and township (中選會's 2022 winners)
//   <code>-bills.json  a council's 議員提案 this term read from its own site where
//                  the API has none or few (OWN: 新竹縣, 新竹市, 花蓮縣; 彰化縣's newest sessions): for a search,
//                  a councillor, a bill's page
// A bill's whole text, a search and a councillor's bills are read from the
// API by the app when asked (lib/council.mjs). Never fails the deploy: a
// council that can't be read today keeps the last deploy's copy.
//   node scripts/build-council.mjs [--prev https://orbit.jaypengx.com/law/data/] [--only hua,hsz]
import { mkdir, writeFile } from 'node:fs/promises';
import { args, sleep, prevJson } from './lib.mjs';
import { compactCouncil, compactSitting, compactCouncilor, compactCouncilBill, newestBills, compactRep, repsByPlace, hccRows, HCC, hszRows, HSINCHU_CITY, hlcRows, HUALIEN, chaCounts, chaListRows, chaDetail, chaSessions, chaSession, CHANGHUA, gapOf } from '../public/lib/council.mjs';

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

// Councils whose own site lists more of this term's bills than the API holds:
// the address of its list's page n, and how a page reads (lib/council.mjs).
const OWN = {
  hsq: { site: '新竹縣議會網站', page: () => n => `${HCC}porposal?program=197&page=${n}`, rows: () => hccRows },
  hsz: { site: '新竹市議會網站', page: term => n => `${HSINCHU_CITY}TC/proposal.aspx?pn=${n}&mid=42&cc=${term}&r=5`, rows: term => html => hszRows(html, term) },
  // 花蓮's search gives a whole term of each kind in one answer, decisions and all.
  hua: { site: '花蓮縣議會網站', out: true, whole: hualien },
  // 彰化's sessions the API hasn't read yet, added to the API's (`add`).
  cha: { site: '彰化縣議會網站', out: true, add: true, whole: changhua }
};

// 彰化縣議會: its 議事日程's sessions (with days), each session's count of bills
// by kind, and the lists of those the API lacks, ten a page, 2 s apart; a
// list whose count didn't change isn't read again. Then each bill's own page
// (its whole 案由, 類別, 連署人, 審查意見), 80 a night.
async function changhua(term, { have, old }) {
  const read = async path => {
    await sleep(2000);
    const r = await fetch(new URL(path, CHANGHUA), { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Orbit-Law nightly (+https://orbit.jaypengx.com/law/)' } });
    if (!r.ok) throw new Error(`cha ${r.status} at ${path}`);
    return r.text();
  };
  const sessions = chaSessions(await read('../schedule/index.aspx?Parser=99,7,167'));
  const counts = [], seen = new Set();
  for (let p = 0; p < 6; p++) {
    const got = chaCounts(await read(`index.aspx?Parser=99,7,47,,,,,,,,${p}`)).filter(x => !seen.has(`${x.tid}-${x.kind}`));
    if (!got.length) break;
    for (const x of got) seen.add(`${x.tid}-${x.kind}`), counts.push(x);
  }
  const before = new Map((old?.rows || []).map(r => [r['代碼'], r]));
  const rows = [], kept = {};
  for (const x of counts) {
    const key = `${x.tid}-${x.kind}`;
    if (have.has(chaSession(`第${term}屆${x.name}`))) continue;
    kept[key] = x.n;
    if (old?.counts?.[key] === x.n) {
      rows.push(...old.rows.filter(r => r.k === key));
      continue;
    }
    for (let p = 0; p * 10 < x.n; p++)
      for (const r of chaListRows(await read(`List2.aspx?Parser=99,7,47,,,,,,,,${p},${x.iid},,${x.tid},,,,,,${x.kind}`))) {
        const gov = x.kind === 3;
        rows.push({ ...r, ...(gov ? { 提案人: '', 提案單位: '彰化縣政府' } : {}), ...(before.get(r['代碼'])?.full ? before.get(r['代碼']) : {}), k: key });
      }
  }
  let budget = 80;
  for (const r of rows) {
    if (r.full || budget-- <= 0) continue;
    try {
      const f = chaDetail(await read(r['來源網址']));
      if (!f['案由']) continue;
      const by = r['提案人'] ? f['提案人'] || r['提案人'] : '';
      Object.assign(r, { 案由: f['案由'], 類別: f['類別'] || r['類別'], 審查意見: f['審查意見'] || '', ...(by ? { 主提案人: by, 連署人: f['連署人'] || '', 提案人: [by, f['連署人']].filter(Boolean).join('、') } : {}), full: 1 });
    } catch {
      break;
    }
  }
  return { rows, sessions, keep: { counts: kept } };
}

// 花蓮縣議會: 縣府提案 (1), 議員提案 (2), 本會提案 (4) (臨時動議, 3, holds none), this term's each in one POST, 5 s apart.
async function hualien(term) {
  const rows = [];
  for (const kind of [1, 2, 4]) {
    await sleep(5000);
    const r = await fetch(`${HUALIEN}proposal_data_search${kind}.php`, { method: 'POST', body: new URLSearchParams({ proposal_section: String(term), keyword: '', search: 'y' }), signal: AbortSignal.timeout(120_000), headers: { 'User-Agent': 'Orbit-Law nightly (+https://orbit.jaypengx.com/law/)' } });
    if (!r.ok) throw new Error(`hua ${r.status} for kind ${kind}`);
    rows.push(...hlcRows(await r.text(), kind));
  }
  return rows.sort((a, b) => (a['日期'] < b['日期'] ? 1 : a['日期'] > b['日期'] ? -1 : 0));
}

// A council's 議員提案 from its own pages (newest first), gently: a page every
// 2 s, at most 150 a night. New pages from the top until one holds nothing
// new; then, until the term is whole, on from where the last night stopped
// (`next`). A refusal ends the night with what was read.
async function ownBills(code, term, since) {
  const url = OWN[code].page(term), parse = OWN[code].rows(term);
  const old = await prevJson(`council/${code}-bills.json`);
  const known = new Set((old?.rows || []).map(r => r['代碼']));
  const fresh = [];
  let budget = 150;
  const page = async n => {
    budget--;
    await sleep(2000);
    const r = await fetch(url(n), { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Orbit-Law nightly (+https://orbit.jaypengx.com/law/)' } });
    if (!r.ok) throw new Error(`${code} ${r.status} at page ${n}`);
    return parse(await r.text()).filter(r => r['日期'] >= since);
  };
  let next = old ? old.next || 0 : 1;
  let stop = '';
  try {
    if (old) {
      for (let n = 1; budget > 0; n++) {
        const got = await page(n);
        if (!got.length || got.every(r => known.has(r['代碼']))) break;
        for (const r of got) if (!known.has(r['代碼'])) known.add(r['代碼']), fresh.push(r);
      }
      // The older pages moved down by what's new.
      if (next) next = Math.max(1, next - Math.ceil(fresh.length / 6));
    }
    while (next && budget > 0) {
      const got = await page(next);
      if (!got.length) {
        next = 0;
        break;
      }
      for (const r of got) if (!known.has(r['代碼'])) known.add(r['代碼']), fresh.push(r);
      next++;
    }
  } catch (e) {
    stop = e.message;
  }
  const rows = [...fresh, ...(old?.rows || [])].filter(r => r['日期'] >= since).sort((a, b) => (a['日期'] < b['日期'] ? 1 : a['日期'] > b['日期'] ? -1 : 0));
  return { rows, next, stop };
}

// Each council's gaps, by the API's own count of what it holds this term.
let gaps = new Map();
try {
  gaps = new Map((await get('completenesses', { limit: '100' })).completenesses.map(c => [c['代碼'], { bill: c.terms?.[0]?.bill_status === 'missing' ? c.types?.bill?.upstream_note || '' : null }]));
} catch (e) {
  notes.push(`completenesses failed: ${e.message}`);
}

await mkdir(out, { recursive: true });
const write = (path, data) => writeFile(out + path, JSON.stringify(data));
const built = new Date().toISOString();
const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

let overviews = [];
try {
  overviews = (await get('overviews', { limit: '100' })).overviews.filter(o => o['現存'] && (!args.only || args.only.split(',').includes(o['代碼'])));
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
    // Its own site's 提案 where the API holds none or few (新竹縣, 新竹市, 花蓮縣).
    let own = null;
    if (OWN[code]) {
      try {
        let got;
        if (OWN[code].whole) {
          const named = new Map(sessions.map(x => [x['代碼'], x['會期名稱']]));
          const r = await OWN[code].whole(term, { have: new Set(bills.map(b => named.get(b['會議代碼'])).filter(Boolean)), old: await prevJson(`council/${code}-bills.json`) });
          got = Array.isArray(r) ? { rows: r, next: 0, stop: '' } : { next: 0, stop: '', ...r };
        } else got = await ownBills(code, term, o['就職日'] || '2022-12-25');
        // Sessions the council's site lists and the API doesn't yet.
        for (const x of got.sessions || []) if (!sessions.some(y => y['代碼'] === x['代碼'] || y['會期名稱'] === x['會期名稱'])) sessions.push(x);
        if (!got.rows.length && !OWN[code].add) throw new Error(got.stop || 'none');
        await write(`${code}-bills.json`, { built, next: got.next, rows: got.rows, ...(got.keep || {}) });
        own = got.rows;
        notes.push(`${code}: ${got.rows.length} bills from its site${got.next ? `, page ${got.next} next` : ''}${got.stop ? ` (${got.stop})` : ''}`);
      } catch (e) {
        notes.push(`${code} own bills failed: ${e.message}`);
        const old = await prevJson(`council/${code}-bills.json`);
        if (old) (await write(`${code}-bills.json`, old), (own = old.rows));
      }
      // Its own rows stand in for the API's when they hold more (or join them, `add`); each finds its session by name.
      const byName = new Map(sessions.map(x => [x['會期名稱'], x['代碼']]));
      const placed = (own || []).map(r => ({ ...r, 會議代碼: byName.get(r['會期名稱']) || byName.get(String(r['會期名稱'] || '').replace(/大會$/, '會')) || '' }));
      if (OWN[code].add && placed.length) {
        // The API holds some of them without their session (彰化's 7th 定期會): those go, ours stay.
        const same = b => `${String(b['案號'] || '').replace(/\D/g, '')}|${String(b['案由'] || '').replace(/\s+/g, '').slice(0, 16)}`;
        const ours = new Set(placed.map(same));
        bills.splice(0, bills.length, ...bills.filter(b => !ours.has(same(b))), ...placed);
      }
      else if (placed.length > bills.length) bills.splice(0, bills.length, ...placed);
      else own = null;
    }
    // A council with no bills: why, and its newest 議事錄 (the API's meetings, each with its file).
    let records = [];
    if (!bills.length) {
      try {
        const seen = new Set();
        records = ((await get('meets', { 議會代碼: code, sort: '日期>', limit: '60' })).meets || []).filter(m => m['來源網址'] && !seen.has(m['來源網址']) && seen.add(m['來源網址'])).slice(0, 6).map(m => ({ d: m['日期'], what: m['委員會或主旨'] || String(m['來源檔案'] || '').replace(/^.*\//, '').replace(/\.pdf$/i, ''), url: m['來源網址'] }));
      } catch {}
    }
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
      bills: newestBills(rows, sessions, 240),
      ...(own ? { own: { file: `council/${code}-bills.json`, site: OWN[code].site, ...(OWN[code].out ? { out: true } : {}), ...(OWN[code].add ? { add: true } : {}) } } : {}),
      ...(!rows.length ? { gap: gapOf(gaps.get(code)?.bill || ''), records } : {})
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
if (args.only) {} else if (index.length) await write('index.json', { built, day, councils: index });
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
