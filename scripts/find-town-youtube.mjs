// By hand: each 代表會's YouTube channel, found by YouTube's own channel search (its name, then its county's and
// its name), kept only when the channel's title names that town and 代表會 and no other county. Prints the
// lines for lib/town-video.mjs TOWN_YOUTUBE (checked by eye before they go in).
//   node scripts/find-town-youtube.mjs [public/data/council/reps.json] [state.json (what's found so far, to pick up after a stop)]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sleep } from './lib.mjs';

const reps = JSON.parse(readFileSync(process.argv[2] || new URL('../public/data/council/reps.json', import.meta.url), 'utf8'));
const CITIES = ['基隆', '臺北', '新北', '桃園', '新竹', '苗栗', '臺中', '彰化', '南投', '雲林', '嘉義', '臺南', '高雄', '屏東', '宜蘭', '花蓮', '臺東', '澎湖', '金門', '連江'];
const tw = s => String(s || '').replace(/台/g, '臺');
async function channels(q) {
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAg%253D%253D`, { headers: { 'Accept-Language': 'zh-TW', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
  const html = await r.text();
  // (A short page is YouTube slowing us down: wait, then ask again. A full one with no channels found none.)
  if (!r.ok || html.length < 100_000) throw new Error(`slowed (${r.status}, ${html.length})`);
  return [...html.matchAll(/"channelId":"(UC[\w-]{22})","title":\{"simpleText":"([^"]+)"/g)].map(m => ({ id: m[1], title: tw(m[2]) }));
}
const state = process.argv[3] || '';
const done = state && existsSync(state) ? JSON.parse(readFileSync(state, 'utf8')) : {};
const found = Object.fromEntries(Object.entries(done).filter(([, c]) => c));
const todo = reps.places.flatMap(p => p.towns.map(t => ({ p, t }))).filter(({ t }) => !(t.tc in done));
await Promise.all(Array.from({ length: 2 }, async () => {
  while (todo.length) {
    const { p, t } = todo.shift();
    const city = tw(p.city).replace(/[縣市]$/, '');
    const town = tw(t.town);
    const short = town.length > 2 ? town.replace(/[鄉鎮市區]$/, '') : town;
    // (彰化市 by its whole name: 彰化 alone is the county's, in every 彰化縣 town's channel.)
    const fits = c => c.title.includes(short === city ? town : short) && /代表會/.test(c.title) && !CITIES.some(x => x !== city && c.title.includes(x) && !short.includes(x));
    let hit = null;
    let failed = false;
    for (const q of [`${town}民代表會`, `${p.city}${town}代表會`]) {
      let got = [];
      for (let tries = 0; tries < 4; tries++) {
        try {
          got = await channels(q);
          break;
        } catch (e) {
          console.error(`  ${q}: ${e.message}`);
          await sleep(15_000 * (tries + 1));
          if (tries === 3) failed = true;
        }
      }
      hit = got.find(fits);
      await sleep(1500);
      if (hit) break;
    }
    if (hit) found[t.tc] = { ...hit, name: `${town}民代表會` };
    if (state && !failed) writeFileSync(state, JSON.stringify(Object.assign(done, { [t.tc]: found[t.tc] || null })));
    console.error(`${p.city}${town}: ${hit ? `${hit.id} ${hit.title}` : '—'}`);
  }
}));
for (const [tc, c] of Object.entries(found).sort()) console.log(`  '${tc}': ['${c.id}', '${c.name}'], // ${c.title}`);
console.error(`${Object.keys(found).length} channels`);
