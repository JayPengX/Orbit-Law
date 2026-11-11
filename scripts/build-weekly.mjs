// 你追蹤的法案週報's lines: each bill that moved this week and each law just
// amended, one plain line of what it changes, made once a night by the AI
// door (Orbit-Core /ai/build, feature law-weekly, on its day's cap) and shared
// by every phone (我的's 這一週 picks the ones you follow). What moved is code's
// (bills/items.json, changes.json, diff/); a line already made is kept.
// Writes data/ai/weekly.json: { built, lines: { <bill key> | <pcode@version>: line } }.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { prevJson } from './lib.mjs';
import { weekPicks, weekInput, lawId, WEEK_BATCH } from '../public/lib/weekly.mjs';

const data = new URL('../public/data/', import.meta.url).pathname;
const KEY = process.env.LAW_BUILD_KEY || '';
const AI_DOOR = 'https://orbit-workers-proxy.pengzjay.workers.dev/ai/build';
let budget = Number(process.env.WEEKLY_AI ?? 4);
const json = p => readFile(data + p, 'utf8').then(JSON.parse, () => null);

const items = (await json('bills/items.json'))?.items || [];
const changes = (await json('changes.json')) || { items: [] };
const picks = weekPicks(items, changes);
const ids = new Set([...picks.bills.map(it => it.k), ...picks.laws.map(lawId)]);
// What the last build made, for what's still this week's.
const prev = (await prevJson('ai/weekly.json'))?.lines || {};
const lines = Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)));
const diffs = new Map();
for (const c of picks.laws) diffs.set(c.p, await json(`diff/${c.p}.json`));
const todo = weekInput(picks, diffs).filter(x => !lines[x.id]);
console.log(`weekly: ${picks.bills.length} bills, ${picks.laws.length} laws this week; ${Object.keys(lines).length} lines kept, ${todo.length} to write`);

for (let i = 0; i < todo.length && budget > 0 && KEY; i += WEEK_BATCH, budget--) {
  const batch = todo.slice(i, i + WEEK_BATCH);
  try {
    const r = await fetch(AI_DOOR, { method: 'POST', headers: { 'X-Build-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'law-weekly', input: { items: batch } }), signal: AbortSignal.timeout(150_000) });
    const out = await r.json().catch(() => ({}));
    if (r.status === 429 || out.error === 'cap') {
      console.log('weekly: the day\'s AI cap is reached; the rest wait for tomorrow');
      break;
    }
    if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`);
    const got = out.out;
    let n = 0;
    for (const x of batch) if (typeof got?.[x.id] === 'string' && got[x.id]) ((lines[x.id] = got[x.id]), n++);
    console.log(`weekly: ${n} of ${batch.length} lines written`);
  } catch (e) {
    console.warn(`weekly: a batch failed (${e.message}); it waits for the next build`);
  }
}
if (!KEY) console.log('weekly: no LAW_BUILD_KEY, only kept lines');

await mkdir(data + 'ai', { recursive: true });
await writeFile(data + 'ai/weekly.json', JSON.stringify({ built: new Date().toISOString(), lines }));
