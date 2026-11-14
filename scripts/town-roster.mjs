// Every 代表會's members as elected (中選會's 選舉資料庫, 111年鄉鎮市民代表選舉: plains and mountain seats), and its
// 村里 with their 村里長 (111年村里長選舉), into scripts/town-roster.json:
// { <tc>: { m: [{ n, party, area }], li: [{ n: 東平里, head: 王大明 }] } }. What a recording's names are snapped to (a name heard
// counts only as one of these; lib/town-speakers.mjs). Run by hand after an election: node scripts/town-roster.mjs
import { writeFile } from 'node:fs/promises';
import { TOWN_SITES } from '../public/lib/town-site.mjs';

const DB = 'https://db.cec.gov.tw/static/elections';
const get = async u => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(u).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 404) return null;
    await new Promise(ok => setTimeout(ok, 2000));
  }
  return null;
};
const list = await get(`${DB}/list/ELC_R2.json`);
const themes = list.flatMap(a => a.theme_items).filter(t => t.session === 111 && t.vote_date === '2022-11-26');
const counties = [...new Set(Object.keys(TOWN_SITES).map(tc => `${tc.slice(0, 2)}_${tc.slice(2, 5)}`))];
const out = {};
for (const t of themes) {
  for (const c of counties) {
    const d = await get(`${DB}/data/tickets/ELC/R2/${t.legislator_type_id}/${t.theme_id}/A/${c}_00_000_0000.json`);
    for (const rows of Object.values(d || {})) {
      for (const x of rows) {
        if (x.is_victor !== '*') continue;
        const tc = `${x.prv_code}${x.city_code}${x.dept_code}`;
        if (!TOWN_SITES[tc]) continue;
        const m = (out[tc] ||= { m: [], li: [] }).m;
        m.some(m => m.n === x.cand_name) || m.push({ n: x.cand_name, party: x.party_name, area: x.area_name.replace(/^.+?(第\d+選舉區)$/, '$1') });
      }
    }
  }
}
// 村里 and their heads (named in meetings all the time): the 村里長 election's results, a county a file.
const v0 = (await get(`${DB}/list/ELC_V0.json`)).flatMap(a => a.theme_items).find(t => t.session === 111);
for (const c of counties) {
  const d = await get(`${DB}/data/tickets/ELC/V0/${v0.legislator_type_id}/${v0.theme_id}/L/${c}_00_000_0000.json`);
  for (const rows of Object.values(d || {})) {
    for (const x of rows) {
      const tc = `${x.prv_code}${x.city_code}${x.dept_code}`;
      if (!out[tc] || x.is_victor !== '*') continue;
      out[tc].li.some(l => l.n === x.area_name) || out[tc].li.push({ n: x.area_name, head: x.cand_name });
    }
  }
}
await writeFile(new URL('../scripts/town-roster.json', import.meta.url), JSON.stringify(out));
const n = Object.values(out).reduce((a, x) => a + x.m.length, 0);
const li = Object.values(out).reduce((a, x) => a + x.li.length, 0);
console.log(`town-roster: ${Object.keys(out).length} of ${Object.keys(TOWN_SITES).length} 代表會, ${n} members, ${li} 村里`);
