// When each part of tonight's data was built, in one small file the admin
// panel reads (Orbit-Core's 健康 › 外部來源: kit/sources.mjs `fresh.law`).
// Every source step of the deploy may fail without stopping it
// (continue-on-error), so a source that broke shows only as its part's
// `built` growing old, or its file missing (built 0).
//   node scripts/build-status.mjs   →  public/data/status.json
import { readFile, writeFile } from 'node:fs/promises';

// part → [file under data/, what to count in it]
export const PARTS = {
  laws: ['index.json', j => j.laws?.length],
  bills: ['bills/all.json', j => j.bills?.length],
  notices: ['bills/notices.json', j => j.notices?.length],
  ly: ['ly/people.json', j => j.people?.length],
  agenda: ['ly/agenda.json', j => j.meets?.length],
  councils: ['council/index.json', j => j.councils?.length],
  agency: ['agency/all.json', j => j.rules?.length],
  local: ['local/all.json', j => j.rules?.length],
  rulings: ['rulings/all.json', j => j.rulings?.length],
  cons: ['cons/index.json', j => j.items?.length],
  gov: ['ai/news.json', j => j.news?.length]
};

// { built, parts: { part: { built (ms, 0 when missing), n } } } from a data folder.
export async function statusOf(dir, now = Date.now()) {
  const parts = {};
  for (const [part, [file, count]] of Object.entries(PARTS)) {
    try {
      const j = JSON.parse(await readFile(new URL(file, dir), 'utf8'));
      parts[part] = { built: Date.parse(j.built) || 0, n: Number(count(j)) || 0 };
    } catch {
      parts[part] = { built: 0, n: 0 };
    }
  }
  return { built: now, parts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('../public/data/', import.meta.url);
  const s = await statusOf(dir);
  await writeFile(new URL('status.json', dir), JSON.stringify(s));
  for (const [p, v] of Object.entries(s.parts)) console.log(p.padEnd(9), v.built ? new Date(v.built).toISOString() : 'missing', v.n);
}
