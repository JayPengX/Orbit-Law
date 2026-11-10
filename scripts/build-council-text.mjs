// Council bills whose text lives only in a PDF, read into their parts (lib/council.mjs billPdfParts): 新竹縣議會's
// proposals (each one's page names its PDF) and 新竹市議會's (the list links the PDF). Writes
// public/data/council/text/<code>/<n>.json (TEXT_BUCKETS of them, by textBucket(id)): { id: { 案號, 說明, 辦法,
// 議決, 議決會議, 議決日期, pdf } }. What the last deploy read is kept; a build reads the newest it hasn't, the
// sites side by side, each gently (hcc.gov.tw a request every 2 s, never faster), within --minutes. Needs pdftotext.
//   node scripts/build-council-text.mjs [--minutes 12] [--prev https://orbit.jaypengx.com/law/data/]
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { args, sleep, prevJson } from './lib.mjs';
import { billPdfParts, textBucket, TEXT_BUCKETS, HCC } from '../public/lib/council.mjs';

const out = new URL('../public/data/council/', import.meta.url).pathname;
const UA = { 'User-Agent': 'Orbit-Law nightly (+https://orbit.jaypengx.com/law/)' };
const until = Date.now() + Number(args.minutes || 12) * 60_000;
const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const RETRY_DAYS = 7;

const SITES = {
  // 新竹縣: the proposal's page names its PDF (upload/web_program_proposal/…).
  hsq: { gap: 2000, pdf: async row => {
    const r = await fetch(row['來源網址'], { headers: UA, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`page ${r.status}`);
    const path = ((await r.text()).match(/upload\/web_program_proposal\/[^"']+?\.pdf/i) || [])[0];
    await sleep(2000);
    return path ? new URL(encodeURI(decodeURI(path)), HCC).href : '';
  } },
  // 新竹市: the list links the PDF itself.
  hsz: { gap: 1000, pdf: async row => (/\.pdf$/i.test(row['來源網址']) ? row['來源網址'] : '') }
};

async function pdfText(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`pdf ${r.status}`);
  const f = `${tmpdir()}/council-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`;
  await writeFile(f, Buffer.from(await r.arrayBuffer()));
  try {
    return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8', maxBuffer: 8 << 20, timeout: 30_000 });
  } finally {
    await unlink(f).catch(() => {});
  }
}

await Promise.all(Object.keys(SITES).map(async code => {
  const started = Date.now();
  const stop = until;
  const list = (await readFile(`${out}${code}-bills.json`, 'utf8').then(JSON.parse, () => null)) || (await prevJson(`council/${code}-bills.json`));
  if (!list?.rows?.length) {
    console.log(`council text ${code}: no bills list`);
    return;
  }
  const buckets = await Promise.all(Array.from({ length: TEXT_BUCKETS }, (_, n) => prevJson(`council/text/${code}/${n}.json`).then(b => b || {})));
  const known = id => buckets[textBucket(id)][id];
  // The newest first; one whose PDF wasn't there is asked again after a week.
  const todo = list.rows.filter(r => {
    const k = known(r['代碼']);
    return !k || (!k.pdf && k.t && k.t < new Date(Date.parse(day) - RETRY_DAYS * 86_400e3).toISOString().slice(0, 10));
  });
  let got = 0, none = 0, bad = 0;
  for (const row of todo) {
    if (Date.now() > stop) break;
    const id = row['代碼'];
    try {
      const pdf = await SITES[code].pdf(row);
      if (!pdf) {
        buckets[textBucket(id)][id] = { pdf: '', t: day };
        none++;
        continue;
      }
      const parts = billPdfParts(await pdfText(pdf));
      delete parts['日期'];
      buckets[textBucket(id)][id] = { ...parts, pdf };
      got++;
    } catch (e) {
      bad++;
      if (bad <= 5) console.log(`council text ${code} ${id}: ${e.message}`);
    }
    await sleep(SITES[code].gap);
  }
  await mkdir(`${out}text/${code}`, { recursive: true });
  await Promise.all(buckets.map((b, n) => writeFile(`${out}text/${code}/${n}.json`, JSON.stringify(b))));
  const have = buckets.reduce((s, b) => s + Object.values(b).filter(x => x.pdf).length, 0);
  console.log(`council text ${code}: ${got} read, ${none} without a PDF, ${bad} failed; ${have} of ${list.rows.length} bills have their text, ${Math.round((Date.now() - started) / 1000)}s`);
}));
