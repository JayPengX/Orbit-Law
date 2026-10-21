// The money in each 中央政府總預算 the term's budget list names: 主計總處's
// 預算表 (data.gov.tw finds them, ws.dgbas.gov.tw serves the zips), the
// 預算案 and, once passed, the 法定預算. Writes public/data/ly/budget/<year>.json
// (by function, by ministry, agency and 工作計畫, with what 立法院 cut) and
// adds each year's few numbers to ly/budget.json (`money`). A book already
// read (same file) is taken from the last deploy; one that can't be fetched
// today too. Never fails the deploy.
// Runs after build-ly.mjs. ws.dgbas.gov.tw leaves out its certificate's
// issuer: run with NODE_EXTRA_CA_CERTS=scripts/twca-ssl.pem (pages.yml does).
//   node scripts/build-budget.mjs [--prev https://jaypengx.github.io/Orbit-Law/data/]
import { mkdir, readFile, writeFile, readdir, rm, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { xmlRows, bookOf, yearOf, moneyOf } from '../public/lib/budget.mjs';
import { prevJson, sleep } from './lib.mjs';

const out = new URL('../public/data/ly/', import.meta.url).pathname;
const listFile = `${out}budget.json`;
const list = JSON.parse(await readFile(listFile, 'utf8').catch(() => 'null'));
if (!list) {
  console.log('budget books: no ly/budget.json, nothing to do');
  process.exit(0);
}
await mkdir(`${out}budget`, { recursive: true });

async function json(url, init) {
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      return await r.json();
    } catch (e) {
      if (tries >= 2) throw e;
      await sleep(4000 * (tries + 1));
    }
  }
}

// data.gov.tw's search: "<year>年度中央政府總預算(案)－預算表" → { year: { b: nid, c: nid } }.
async function findBooks() {
  const found = {};
  for (let page = 1; page <= 3; page++) {
    const body = { bool: [{ fulltext: { value: '中央政府總預算 預算表' } }], filter: [], page_num: page, page_limit: 50, tids: [], sort: '_score_desc' };
    const r = await json('https://data.gov.tw/api/front/dataset/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const hits = r.payload?.search_result || [];
    for (const h of hits) {
      const m = String(h.title || '').match(/^(\d{3})年度中央政府總預算(案)?\s*[－─\-_]\s*預算表$/);
      if (m) (found[m[1]] ||= {})[m[2] ? 'b' : 'c'] = String(h.nid);
    }
    if (hits.length < 50) break;
  }
  return found;
}

// One book: the dataset's zip, unzipped; its three tables found by their
// 報表名稱 (or, in the older layout, the file's name).
async function readBook(nid) {
  const meta = await json(`https://data.gov.tw/api/v2/rest/dataset/${nid}`);
  const url = (meta.result?.distribution || []).map(d => d.resourceDownloadUrl).find(u => /\.zip$/i.test(u || ''));
  if (!url) throw new Error(`dataset ${nid}: no zip`);
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  const dir = await mkdtemp(join(tmpdir(), 'book-'));
  try {
    await writeFile(join(dir, 'book.zip'), Buffer.from(await r.arrayBuffer()));
    execFileSync('unzip', ['-o', '-q', 'book.zip', '-d', 'x'], { cwd: dir });
    const tables = {};
    // (Names as bytes: some books' are in Big5.)
    for (const raw of await readdir(join(dir, 'x'), { encoding: 'buffer' })) {
      const f = raw.toString('utf8');
      if (!/\.xml$/i.test(f)) continue;
      const text = await readFile(Buffer.concat([Buffer.from(join(dir, 'x') + '/'), raw]), 'utf8');
      const title = text.match(/<報表名稱>([^<]+)</)?.[1] || f.replace(/#U([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
      if (/比較|分析/.test(title)) continue;
      if (/歲出機關別預算表/.test(title)) tables.spend = xmlRows(text);
      else if (/歲出政事別預算總表/.test(title)) tables.fn = xmlRows(text);
      else if (/歲入來源別預算總表/.test(title)) tables.rev = xmlRows(text);
    }
    if (!tables.spend?.length) throw new Error(`${url}: no 歲出機關別預算表`);
    return { url, book: bookOf(tables) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

let found = {};
try {
  found = await findBooks();
} catch (e) {
  console.log(`budget books: search failed (${e.message}), the last deploy's kept`);
}
const years = list.budgets.map(x => x.k).filter(k => /^\d{3}$/.test(k));
const notes = [];
for (const y of years) {
  const books = {};
  for (const kind of ['b', 'c']) {
    const nid = found[y]?.[kind];
    const old = await prevJson(`ly/budget/${y}${kind}.json`);
    let got = old && (!nid || old.nid === nid) ? old : null;
    if (nid && !got) {
      try {
        got = { nid, ...(await readBook(nid)) };
        notes.push(`${y}${kind} read`);
      } catch (e) {
        notes.push(`${y}${kind}: ${e.message}`);
        got = old;
      }
    }
    if (got) {
      books[kind] = got;
      await writeFile(`${out}budget/${y}${kind}.json`, JSON.stringify(got));
    }
  }
  if (!books.b && !books.c) continue;
  const year = { ...yearOf(Number(y), books.b?.book, books.c?.book), src: { b: books.b?.nid || '', c: books.c?.nid || '' } };
  await writeFile(`${out}budget/${y}.json`, JSON.stringify(year));
  list.budgets.find(x => x.k === y).money = moneyOf(year);
}
await writeFile(listFile, JSON.stringify(list));
console.log(`budget books: ${years.filter(y => list.budgets.find(x => x.k === y).money).join(', ') || 'none'} with amounts${notes.length ? ` (${notes.join('; ')})` : ''}`);
