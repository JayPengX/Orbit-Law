// Builds public/data/ from 全國法規資料庫's bulk files (law.moj.gov.tw, free,
// refreshed by the ministry every day): one small index of every law, one
// file per law (zh, and en where the ministry has an English text), and the
// running list of what changed (修法追蹤). Run by the deploy workflow (on
// every push and once a day), never committed: git keeps code, Pages keeps
// the data.
// Bills (立法院審議中) come from the g0v 立法院 API (v2.ly.govapi.tw, which
// mirrors 立法院's 議事 data daily): only the bills that moved since the
// last build, merged into the last deploy's copy.
//   node scripts/build-data.mjs [--zh ChLaw.zip] [--en EnLaw.zip] [--prev https://jaypengx.github.io/Orbit-Law/data/] [--bills off]
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { compactLaw, compactEn, indexRow, diffLaws, diffTexts, mergeChanges, CHANGES_DAYS } from '../public/lib/data.mjs';
import { compactBill, foldBills, mergeBills } from '../public/lib/bills.mjs';
import { buildIndex } from '../public/lib/fulltext.mjs';
import { nameMap } from '../public/lib/refs.mjs';
import { noticesUrl, compactNotice, mergeNotices, twDay } from '../public/lib/notices.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const SRC = { zh: 'https://law.moj.gov.tw/api/Ch/Law/JSON', en: 'https://law.moj.gov.tw/api/En/Law/JSON', order: 'https://law.moj.gov.tw/api/Ch/Order/JSON', enOrder: 'https://law.moj.gov.tw/api/En/Order/JSON' };
const PREV = args.prev ?? 'https://jaypengx.github.io/Orbit-Law/data/';
const out = new URL('../public/data/', import.meta.url).pathname;

async function zipJson(kind) {
  let file = args[kind];
  if (!file) {
    file = `/tmp/orbit-law-${kind}.zip`;
    // The ministry's server is slow (a minute for 6 MB some days) and, asked
    // for one file right after another, sometimes answers with a page, not
    // the zip: patient, checked, and tried again after a pause.
    for (let tries = 1; ; tries++) {
      execFileSync('curl', ['-sSfL', '--retry', '3', '--retry-all-errors', '-m', '600', '-o', file, SRC[kind]], { stdio: 'inherit' });
      const head = readFileSync(file).subarray(0, 120);
      if (head[0] === 0x50 && head[1] === 0x4b) break;
      if (tries >= 4) throw new Error(`${kind}: not a zip (${head.toString('utf8').replace(/\s+/g, ' ').slice(0, 100)})`);
      console.warn(`${kind}: not a zip yet, try ${tries}: ${head.toString('utf8').replace(/\s+/g, ' ').slice(0, 80)}`);
      await new Promise(r => setTimeout(r, 30_000 * tries));
    }
  }
  const text = execFileSync('unzip', ['-p', file, '*.json'], { maxBuffer: 1 << 30 }).toString('utf8');
  return JSON.parse(text.replace(/^﻿/, ''));
}

async function prevJson(path) {
  if (!PREV) return null;
  try {
    const r = await fetch(PREV + path);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const zh = await zipJson('zh');
const en = await zipJson('en');
if (!(zh.Laws?.length > 1000)) throw new Error(`ChLaw: only ${zh.Laws?.length} laws`);
// 命令 (regulations: 施行細則, 辦法, 規則…), in force only: their own index,
// which the app loads after the laws'. A failed download leaves them out today.
let order = null;
const enOrders = new Map();
if (args.orders !== 'off')
  try {
    order = await zipJson('order');
    if (!(order.Laws?.length > 5000)) throw new Error(`ChOrder: only ${order.Laws?.length}`);
    // Their English (MOJ's translations of about 2,000): nice to have, never fatal.
    try {
      for (const l of (await zipJson('enOrder')).Laws || []) {
        const c = compactEn(l);
        if (c) enOrders.set(c.p, c);
      }
    } catch (e) {
      console.warn(`regulations in English skipped: ${e.message}`);
    }
  } catch (e) {
    console.warn(`regulations skipped: ${e.message}`);
    order = null;
  }

await rm(out, { recursive: true, force: true });
await mkdir(out + 'law', { recursive: true });
await mkdir(out + 'en', { recursive: true });
await mkdir(out + 'bills/item', { recursive: true });
await mkdir(out + 'text', { recursive: true });

const enByCode = new Map();
for (const l of en.Laws || []) {
  const c = compactEn(l);
  if (c) enByCode.set(c.p, c);
}

const laws = zh.Laws.map(compactLaw).filter(Boolean);
for (const law of laws) {
  await writeFile(`${out}law/${law.p}.json`, JSON.stringify(law));
  const e = enByCode.get(law.p);
  if (e) await writeFile(`${out}en/${law.p}.json`, JSON.stringify(e));
}
// 全文檢索: the bigram buckets, in the index's order.
for (const [b, pairs] of buildIndex(laws)) await writeFile(`${out}text/${b}.json`, JSON.stringify(pairs));
const index = { d: zh.UpdateDate || '', built: new Date().toISOString(), laws: laws.map(l => indexRow(l, enByCode.get(l.p)?.n)) };
await writeFile(out + 'index.json', JSON.stringify(index));
const orders = (order?.Laws || []).map(compactLaw).filter(l => l && !l.ab);
for (const o of orders) {
  await writeFile(`${out}law/${o.p}.json`, JSON.stringify(o));
  const e = enOrders.get(o.p);
  if (e) await writeFile(`${out}en/${o.p}.json`, JSON.stringify(e));
}
if (orders.length) await writeFile(out + 'orders.json', JSON.stringify({ d: order.UpdateDate || '', built: index.built, laws: orders.map(o => indexRow(o, enOrders.get(o.p)?.n)) }));

// 修法追蹤: the laws whose 異動日期 moved since the last deploy, article by
// article (the old copy read back from the live site, only for those laws).
const prevIndex = await prevJson('index.json');
const prevChanges = (await prevJson('changes.json')) || { items: [] };
const prevOrders = orders.length ? await prevJson('orders.json') : null;
let found = [];
// data/diff/<p>.json: the latest amendment's old and new texts, per law in 修法追蹤.
const diffs = new Map();
if (prevIndex?.laws) {
  const before = new Map(prevIndex.laws.map(r => [r[0], r]));
  // Regulations count once a previous copy of theirs is out there (not on their first day).
  if (prevOrders?.laws) for (const r of prevOrders.laws) before.set(r[0], r);
  for (const law of prevOrders?.laws ? [...laws, ...orders] : laws) {
    const old = before.get(law.p);
    if (old && old[4] === law.m) continue;
    const oldLaw = old ? await prevJson(`law/${law.p}.json`) : null;
    const d = diffLaws(oldLaw, law);
    found.push(d);
    if (oldLaw) diffs.set(law.p, diffTexts(oldLaw, law, d));
  }
}
const changes = mergeChanges(prevChanges, found, new Date(), CHANGES_DAYS);
await writeFile(out + 'changes.json', JSON.stringify(changes));
await mkdir(out + 'diff', { recursive: true });
for (const it of changes.items) {
  if (!diffs.has(it.p) && it.was) {
    // Found on an earlier day: last deploy's copy, if it is this version's.
    const d = await prevJson(`diff/${it.p}.json`);
    if (d?.m === it.m) diffs.set(it.p, d);
  }
}
for (const [p, d] of diffs) await writeFile(`${out}diff/${p}.json`, JSON.stringify(d));

// ---- Bills ----
const LY = 'https://v2.ly.govapi.tw/bills';
const FIELDS = ['議案編號', '議案名稱', '提案單位/提案委員', '提案來源', '屆', '提案日期', '最新進度日期', '議案狀態', '法律編號', '議案流程', '關連議案'];
async function lyPage(query, page) {
  const q = new URLSearchParams({ 議案類別: '法律案', limit: '500', page: String(page), ...query });
  for (const f of FIELDS) q.append('output_fields', f);
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(`${LY}?${q}`, { signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`立法院 API ${r.status}`);
      return await r.json();
    } catch (e) {
      if (tries >= 2) throw e;
      await new Promise(r => setTimeout(r, 5000 * (tries + 1)));
    }
  }
}
let billNote = 'bills off';
if (args.bills !== 'off') {
  const prevAll = await prevJson('bills/all.json');
  // The current term: the newest bill's.
  const term = String((await lyPage({}, 1)).bills?.[0]?.['屆'] || '');
  if (!term) throw new Error('立法院 API: no term');
  const fresh = [];
  // Sorted by 最新進度日期, newest first: stop a week before the last build.
  const since = prevAll?.term === term && prevAll.built ? new Date(new Date(prevAll.built).getTime() - 7 * 864e5).toISOString().slice(0, 10) : '';
  for (let page = 1; ; page++) {
    const r = await lyPage({ 屆: term }, page);
    const bills = (r.bills || []).map(compactBill);
    fresh.push(...bills);
    if (!bills.length || page >= (r.total_page || 0) || (since && bills[bills.length - 1].u < since)) break;
  }
  const all = since ? mergeBills(prevAll.bills, fresh) : fresh;
  await writeFile(out + 'bills/all.json', JSON.stringify({ term, built: new Date().toISOString(), bills: all }));
  const pcodes = new Map(laws.map(l => [l.n, l.p]));
  const modified = new Map(laws.map(l => [l.p, l.m]));
  const items = foldBills(all, { pcodes, modified }).sort((a, b) => (a.u < b.u ? 1 : a.u > b.u ? -1 : 0));
  const byId = new Map(all.map(b => [b.id, b]));
  for (const it of items) await writeFile(`${out}bills/item/${encodeURIComponent(it.k.replace(':', '-'))}.json`, JSON.stringify(it.ids.map(id => byId.get(id))));
  await writeFile(out + 'bills/items.json', JSON.stringify({ term, built: new Date().toISOString(), items: items.map(({ ids, ...it }) => it) }));
  billNote = `${all.length} bills in term ${term} (${fresh.length} fetched${since ? ` since ${since}` : ', full'}), ${items.length} tracked items`;
}
console.log(billNote);

// ---- 預告: ministries' draft amendments open for comment (join.gov.tw) ----
let noticeNote = 'notices off';
if (args.notices !== 'off') {
  const prevN = await prevJson('bills/notices.json');
  let fresh = [];
  // Whether the closed ones back to the term's start are all in (once done, daily runs read only the newest).
  let history = Boolean(prevN?.history);
  const join = async (type, page) => {
    const r = await fetch(noticesUrl(type, page), { headers: { 'User-Agent': 'Mozilla/5.0 (Orbit Law; +https://jaypengx.github.io/Orbit-Law/)' }, signal: AbortSignal.timeout(90_000) });
    if (!r.ok) throw new Error(`join.gov.tw ${r.status}`);
    return r.json();
  };
  try {
    const names = nameMap(index.laws);
    const keep = list => list.map(x => compactNotice(x, names)).filter(Boolean);
    fresh = keep((await join('nonfinish', 1)).result || []);
    // Closed ones, newest first, back to a week before the last build (the
    // first time: back to the start of the current 立法院 term, 2024-02).
    const since = history && prevN.built ? twDay(new Date(prevN.built).getTime() - 7 * 864e5) : '2024-02-01';
    let pages = 0;
    for (let page = 1; page <= 20; page++, pages++) {
      const list = (await join('history', page)).result || [];
      fresh.push(...keep(list));
      if (list.length < 200 || twDay(list[list.length - 1].publishDate) < since) {
        history = true;
        break;
      }
    }
    noticeNote = `${fresh.length} 預告 naming a law (open, and closed since ${since}: ${pages + 1} pages)`;
  } catch (e) {
    // join.gov.tw down: last build's list stays.
    noticeNote = `join.gov.tw failed (${e.message}): carried over`;
  }
  const notices = mergeNotices(prevN?.notices, fresh);
  await mkdir(out + 'bills', { recursive: true });
  await writeFile(out + 'bills/notices.json', JSON.stringify({ built: new Date().toISOString(), history, notices }));
  noticeNote += `; ${notices.length} kept`;
}
console.log(noticeNote);
console.log(`${laws.length} laws (${enByCode.size} in English), ${orders.length} regulations, ${found.length} changed since the last build, ${changes.items.length} in 修法追蹤`);
