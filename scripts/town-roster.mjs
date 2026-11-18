// Every 代表會's members as elected (中選會's 選舉資料庫, the newest 鄉鎮市民代表選舉 held: plains and mountain seats), and
// its 村里 with their 村里長 (the same year's 村里長選舉):
// { <tc>: { m: [{ n, party, area }], li: [{ n: 東平里, head: 王大明 }] }, _starts, _ends }, its term 12-25 to 12-25.
// What a recording's names are snapped to (a name heard counts only as one of these; lib/town-speakers.mjs).
//   node scripts/town-roster.mjs   writes scripts/town-roster.json (by hand, any time)
// Nobody has to: past the term of the one in git, town-hear.mjs makes the next itself once 中選會 has it (`rosterNow`).
import { writeFile } from 'node:fs/promises';
import { TOWN_SITES } from '../public/lib/town-site.mjs';

const DB = 'https://db.cec.gov.tw/static/elections';
const fetchJson = async u => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(u, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.ok) return r.json().catch(() => null);
    if (r?.status === 404) return null;
    await new Promise(ok => setTimeout(ok, 2000));
  }
  return null;
};
// The term an election's people sit: the 12-25 after the vote, four years.
export const termOf = voted => ({ _starts: `${voted.slice(0, 4)}-12-25`, _ends: `${+voted.slice(0, 4) + 4}-12-25` });

// The roster of the newest election held by `today` (Taiwan's date), or null (中選會 can't be read, or hasn't it all).
export async function makeRoster({ today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10), get = fetchJson, sites = TOWN_SITES } = {}) {
  const list = await get(`${DB}/list/ELC_R2.json`);
  // (111 on 2022-11-26, 115 on 2026-11-28, …)
  const held = (list || []).flatMap(a => a.theme_items || []).filter(t => t.vote_date && t.vote_date <= today);
  if (!held.length) return null;
  const session = Math.max(...held.map(t => t.session));
  const themes = held.filter(t => t.session === session);
  const voted = themes[0].vote_date;
  const counties = [...new Set(Object.keys(sites).map(tc => `${tc.slice(0, 2)}_${tc.slice(2, 5)}`))];
  const out = {};
  for (const t of themes) {
    for (const c of counties) {
      const d = await get(`${DB}/data/tickets/ELC/R2/${t.legislator_type_id}/${t.theme_id}/A/${c}_00_000_0000.json`);
      for (const rows of Object.values(d || {})) {
        for (const x of rows || []) {
          if (x.is_victor !== '*') continue;
          const tc = `${x.prv_code}${x.city_code}${x.dept_code}`;
          if (!sites[tc]) continue;
          const m = (out[tc] ||= { m: [], li: [] }).m;
          m.some(m => m.n === x.cand_name) || m.push({ n: x.cand_name, party: x.party_name, area: String(x.area_name || '').replace(/^.+?(第\d+選舉區)$/, '$1') });
        }
      }
    }
  }
  // 村里 and their heads (named in meetings all the time): the 村里長 election's results, a county a file.
  const v0 = ((await get(`${DB}/list/ELC_V0.json`)) || []).flatMap(a => a.theme_items || []).find(t => t.session === session);
  for (const c of v0 ? counties : []) {
    const d = await get(`${DB}/data/tickets/ELC/V0/${v0.legislator_type_id}/${v0.theme_id}/L/${c}_00_000_0000.json`);
    for (const rows of Object.values(d || {})) {
      for (const x of rows || []) {
        const tc = `${x.prv_code}${x.city_code}${x.dept_code}`;
        if (!out[tc] || x.is_victor !== '*') continue;
        out[tc].li.some(l => l.n === x.area_name) || out[tc].li.push({ n: x.area_name, head: x.cand_name });
      }
    }
  }
  // (Results still coming in, or a file 中選會 has moved: not a roster, the sites' own members answer.)
  if (Object.keys(out).length < Object.keys(sites).length * 0.8) return null;
  return { ...out, ...termOf(voted), _session: session };
}

if (process.argv[1]?.endsWith('town-roster.mjs')) {
  const out = await makeRoster();
  if (!out) throw new Error('town-roster: 中選會 has no full results to read');
  await writeFile(new URL('../scripts/town-roster.json', import.meta.url), JSON.stringify(out));
  const towns = Object.entries(out).filter(([k]) => !k.startsWith('_')).map(([, x]) => x);
  const n = towns.reduce((a, x) => a + x.m.length, 0);
  const li = towns.reduce((a, x) => a + x.li.length, 0);
  console.log(`town-roster (${out._session}, from ${out._starts}): ${towns.length} of ${Object.keys(TOWN_SITES).length} 代表會, ${n} members, ${li} 村里`);
}
