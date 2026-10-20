// 政府公告 for the AI: ministries' RSS feeds (notices, decisions, news),
// merged into the last deploy's copy (a feed keeps only its newest items),
// three years kept, each text cut short; and the hand-kept key figures
// (data-src/facts.json). Never stops the deploy: a feed that fails is skipped.
//   node scripts/build-news.mjs [--prev https://jaypengx.github.io/Orbit-Law/data/]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { parseFeed, mergeNews } from '../public/lib/news.mjs';
import { prevJson } from './lib.mjs';

const out = new URL('../public/data/ai/', import.meta.url).pathname;

// [agency, feed]: notices and decisions first; news where figures get announced.
const FEEDS = [
  ['勞動部', 'https://www.mol.gov.tw/1607/1632/2665/RssList'],
  ['勞動部', 'https://www.mol.gov.tw/1607/1632/1633/RssList'],
  ['行政院', 'https://www.ey.gov.tw/RSS_Content.aspx?ModuleType=6'],
  ['行政院', 'https://www.ey.gov.tw/RSS_Content.aspx?ModuleType=3'],
  ['行政院', 'https://www.ey.gov.tw/RSS_Content.aspx?ModuleType=4'],
  ['行政院', 'https://www.ey.gov.tw/RSS_Content.aspx?ModuleType=2'],
  ['衛生福利部', 'https://www.mohw.gov.tw/rss-16-1.html'],
  ['金融監督管理委員會', 'https://www.fsc.gov.tw/RSS/Messages?serno=201202290009&language=chinese']
];

const prev = (await prevJson('ai/news.json'))?.news || [];
const fresh = [];
const notes = [];
for (const [agency, url] of FEEDS) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0 (Orbit-Law nightly)' } });
    if (!r.ok) throw new Error(String(r.status));
    const items = parseFeed(await r.text(), agency);
    fresh.push(...items);
    notes.push(`${agency} ${items.length}`);
  } catch (e) {
    notes.push(`${agency} failed (${e.message})`);
  }
}
const news = mergeNews(prev, fresh);
const facts = JSON.parse(await readFile(new URL('../data-src/facts.json', import.meta.url), 'utf8')).facts;
// A 勞動部 title that reads like a new figure: flagged in the log for a look at facts.json.
for (const r of fresh) if (/最低工資|基本工資/.test(r[2]) && /調|公告|核定/.test(r[2])) console.log(`check facts.json: ${r[0]} ${r[2]} ${r[3]}`);
await mkdir(out, { recursive: true });
await writeFile(out + 'news.json', JSON.stringify({ built: new Date().toISOString(), news }));
await writeFile(out + 'facts.json', JSON.stringify({ built: new Date().toISOString(), facts }));
console.log(`news: ${notes.join(', ')}; ${news.length} kept (${prev.length} carried over); ${facts.length} facts`);
