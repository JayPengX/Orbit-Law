// 鄉鎮市民代表會 from their own sites (lib/town-site.mjs TOWN_SITES; first 竹北市民代表會): the members with
// photos, each session of the term with its days, every sitting's 會議紀錄, 施政報告, 總質詢, 決議案 (PDFs), each
// day's recording (Google Drive), the 議事日程表, and the news that sets a session's days before it meets.
// Writes public/data/council/town/<tc>.json. The sites serve only Taiwan: read through the proxy's door
// (/law-page, the build's key LAW_BUILD_KEY), gently (a page at a time, ½ s apart; what's settled is kept
// from the last deploy, so a night reads only what's new). Never fails the deploy: a site that can't be
// read keeps the last copy.
//   node scripts/build-town.mjs [--prev https://orbit.jaypengx.com/law/data/]
import { mkdir, writeFile } from 'node:fs/promises';
import { sleep, prevJson } from './lib.mjs';
import { TOWN_SITES, membersUrl, recordUrl, sessionUrl, itemUrl, listUrl, viewUrl, townMembers, townSessions, sessionItems, pageFiles, audioDays, listRows, sessionNews } from '../public/lib/town-site.mjs';

const DOOR = 'https://orbit-workers-proxy.pengzjay.workers.dev/law-page';
const KEY = process.env.LAW_BUILD_KEY || '';
const out = new URL('../public/data/council/town/', import.meta.url).pathname;
const built = new Date().toISOString();
const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * 86_400e3).toISOString().slice(0, 10);

let reads = 0;
// A page through the door. Lists carry the day (the door keeps a page a day: a list read today is today's).
async function page(url, fresh = false) {
  const u = fresh ? `${url}&ob=${day.replace(/-/g, '')}` : url;
  for (let tries = 0; ; tries++) {
    await sleep(process.env.FAST ? 0 : 500);
    reads++;
    try {
      const r = await fetch(`${DOOR}?v=1&u=${encodeURIComponent(u)}`, { headers: { 'X-Build-Key': KEY }, signal: AbortSignal.timeout(60_000) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.html) throw new Error(`${r.status} ${b.error || ''}`.trim());
      return b.html;
    } catch (e) {
      if (tries >= 1) throw new Error(`${url}: ${e.message}`);
      await sleep(3000);
    }
  }
}

async function town(tc, site) {
  const old = await prevJson(`council/town/${tc}.json`);
  if (!KEY) return old;
  const notes = [];
  // The members, a district a page.
  let people = [];
  try {
    for (const typeid of Object.keys(site.areas)) people.push(...townMembers(await page(membersUrl(site, typeid), true), site, typeid));
    if (people.length < 5) throw new Error(`only ${people.length} members`);
  } catch (e) {
    notes.push(`members: ${e.message}`);
    people = old?.people || [];
  }
  // The news: a session's days, set before it meets.
  let news = old?.news || [];
  const set = [];
  try {
    news = listRows(await page(listUrl(site, site.news), true)).slice(0, 20).map(x => ({ t: x.t, url: viewUrl(site, site.news, x.id) }));
  } catch (e) {
    notes.push(`news: ${e.message}`);
  }
  for (const x of news) {
    const s = sessionNews(x.t);
    if (s && s.term === site.term) set.push(s);
  }
  // The 議事日程表: a PDF a session (and one for its 延長會).
  const oldAgenda = new Map((old?.sessions || []).flatMap(s => s.agenda || []).map(a => [a.id, a]));
  const agenda = [];
  try {
    for (const r of listRows(await page(listUrl(site, site.agenda), true))) {
      const m = r.t.match(/第(\d+)屆第(\d+)次(定期會|臨時會)(延長會)?/);
      if (!m || +m[1] !== site.term) continue;
      let a = oldAgenda.get(r.id);
      if (!a?.url) {
        const { files } = pageFiles(await page(viewUrl(site, site.agenda, r.id)), site.base);
        if (!files.length) continue;
        a = { id: r.id, n: r.t.replace(/^第\d+屆/, ''), url: files[0].url };
      }
      agenda.push({ ...a, s: `第${m[2]}次${m[3]}`, ext: !!m[4] });
    }
  } catch (e) {
    notes.push(`agenda: ${e.message}`);
  }
  // The 議事錄: each session's page, then each of its parts' (kept once read: a part's files don't change).
  const before = new Map((old?.sessions || []).filter(s => s.key).map(s => [s.key, s]));
  let sessions = [];
  let budget = 180;
  try {
    const listed = townSessions(await page(recordUrl(site), true)).filter(s => s.term === site.term);
    for (const s of listed) {
      const was = before.get(s.key);
      const lastDay = was?.days?.at(-1)?.d || was?.to || '';
      // A session long over whose every part is read: as it was.
      const settled = was && was.items?.length && was.items.every(i => i.files?.length) && lastDay && lastDay < addDays(day, -60);
      if (settled || budget <= 0) {
        if (was) sessions.push(was);
        continue;
      }
      let items;
      try {
        budget--;
        items = sessionItems(await page(sessionUrl(site, s.key), true));
      } catch (e) {
        notes.push(`${s.n}: ${e.message}`);
        if (was) sessions.push(was);
        continue;
      }
      const had = new Map((was?.items || []).map(i => [i.id, i]));
      let days = was?.days || [];
      for (const i of items) {
        const h = had.get(i.id);
        if (i.k === '錄音') {
          if (budget-- <= 0) continue;
          try {
            const got = audioDays(await page(itemUrl(site, i.id)));
            if (got.length >= days.length) days = got;
          } catch (e) {
            notes.push(`${s.n} 錄音: ${e.message}`);
          }
          continue;
        }
        if (h?.files?.length) i.files = h.files;
        else if (budget-- > 0) {
          try {
            i.files = pageFiles(await page(itemUrl(site, i.id)), site.base).files.map(({ url, size }) => ({ url, ...(size ? { size } : {}) }));
          } catch (e) {
            notes.push(`${s.n} ${i.n}: ${e.message}`);
            i.files = [];
          }
        } else i.files = h?.files || [];
      }
      sessions.push({ ...s, items: items.filter(i => i.k !== '錄音'), days });
    }
  } catch (e) {
    notes.push(`record: ${e.message}`);
    sessions = old?.sessions || [];
  }
  // Each session's days: the news's, else its recordings'; its 議事日程表; and a session the news has set
  // that the 議事錄 doesn't list yet (it's ahead, or under way).
  for (const s of sessions) {
    const main = set.find(x => x.n === s.n && !x.ext);
    const ext = set.find(x => x.n === s.n && x.ext);
    const days = (s.days || []).map(d => d.d);
    s.from = main?.from || s.from || days[0] || '';
    const own = (s.days || []).filter(d => !d.ext).map(d => d.d);
    const more = (s.days || []).filter(d => d.ext).map(d => d.d);
    s.to = main?.to || own.at(-1) || s.to || days.at(-1) || '';
    if (ext) s.ext = { from: ext.from, to: ext.to };
    else if (more.length) s.ext = { from: more[0], to: more.at(-1) };
    const a = agenda.filter(x => x.s === s.n).map(({ id, n, url }) => ({ id, n, url }));
    if (a.length) s.agenda = a;
  }
  for (const x of set) {
    if (x.ext || sessions.some(s => s.n === x.n)) continue;
    const a = agenda.filter(y => y.s === x.n).map(({ id, n, url }) => ({ id, n, url }));
    const ext = set.find(y => y.n === x.n && y.ext);
    sessions.push({ n: x.n, term: x.term, kind: x.n.slice(-3), from: x.from, to: x.to, ...(ext ? { ext: { from: ext.from, to: ext.to } } : {}), items: [], days: [], ...(a.length ? { agenda: a } : {}), set: true });
  }
  sessions.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
  for (const n of notes.slice(0, 12)) console.log(`town ${tc}: ${n}`);
  if (!people.length && !sessions.length) return old;
  return { built, tc, n: site.n, site: site.home, term: site.term, ends: site.ends, people, sessions, news: news.slice(0, 12) };
}

await mkdir(out, { recursive: true });
for (const [tc, site] of Object.entries(TOWN_SITES)) {
  const started = Date.now();
  try {
    const t = await town(tc, site);
    if (!t) {
      console.log(`town ${tc}: nothing (no key, no last copy)`);
      continue;
    }
    await writeFile(`${out}${tc}.json`, JSON.stringify(t));
    console.log(`town ${tc} ${site.n}: ${t.people.length} members, ${t.sessions.length} sessions, ${t.sessions.reduce((n, s) => n + (s.days?.length || 0), 0)} recorded days, ${reads} pages, ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (e) {
    console.log(`town ${tc}: ${e.message}`);
    const old = await prevJson(`council/town/${tc}.json`);
    if (old) await writeFile(`${out}${tc}.json`, JSON.stringify(old));
  }
}
