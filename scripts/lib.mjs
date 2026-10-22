// What the build scripts share: the `--name value` arguments, the last
// deploy's copy of a data file (to build on), a pause, a polite fetch and a pool.
import { readFile } from 'node:fs/promises';
import { get as httpsGet } from 'node:https';
import { rootCertificates } from 'node:tls';
export const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const PREV = args.prev ?? 'https://jaypengx.github.io/Orbit-Law/data/';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// The last deploy's data/<path> as JSON, or null (`--prev ''` builds from nothing; `--prev dir/`
// reads an unpacked deploy). PREV_DIR (the workflow's cached copy of the last build's agency/ and
// local/) is read first: Pages answers thousands of quick reads with 429, which once lost most texts.
// A copy the site has but that can't be read is tried a few times (longer after a 429), then said.
const PREV_DIR = process.env.PREV_DIR || '';
const fromDir = (dir, path) => readFile(dir + path, 'utf8').then(JSON.parse, () => null);
export async function prevJson(path) {
  if (!PREV) return null;
  if (!/^https?:/.test(PREV)) return fromDir(PREV, path);
  if (PREV_DIR) {
    const got = await fromDir(PREV_DIR, path);
    if (got) return got;
  }
  for (let i = 1; ; i++) {
    let wait = 2000 * i;
    try {
      const r = await fetch(PREV + path, { signal: AbortSignal.timeout(60_000) });
      if (r.status === 404) return null;
      if (r.status === 429) wait = 15_000 * i;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= 4) {
        console.warn(`last deploy's ${path}: ${e.cause?.code || e.message}`);
        return null;
      }
      await sleep(wait);
    }
  }
}

// A GET with Node's roots plus `ca` trusted (fetch can't take them): → { ok, status, text(), json() }.
function fetchCa(url, { headers, signal, ca }) {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, { headers, signal, ca: [...rootCertificates, ca] }, res => {
      const parts = [];
      res.on('data', c => parts.push(c));
      res.on('end', () => {
        const body = Buffer.concat(parts).toString('utf8');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => body, json: async () => JSON.parse(body) });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

// A page fetcher: one request at a time per host, at least a second apart, tries and a timeout each.
export function getter(ua) {
  const lastAt = {};
  // via(url) → [the url fetched, its headers] (a door the page is read through); the pause stays the site's own.
  // ca: a site's certificate chain, completed (a server that leaves out its intermediate), for that site only.
  return async function get(url, { tries = 3, timeout = 120_000, via = null, ca = null } = {}) {
    let err;
    const host = new URL(url).host;
    const [to, extra] = via ? via(url) : [url, {}];
    for (let i = 1; i <= tries; i++) {
      await sleep(Math.max(0, (lastAt[host] || 0) + 1000 - Date.now()));
      lastAt[host] = Date.now();
      try {
        const r = await (ca ? fetchCa : fetch)(via ? to : encodeURI(to), { headers: { 'User-Agent': ua, ...extra }, signal: AbortSignal.timeout(timeout), ca });
        if (!r.ok) throw new Error(`HTTP ${r.status}${via ? ` (site ${(await r.json().catch(() => ({}))).status ?? '?'})` : ''}`);
        return (via ? (await r.json()).html || '' : await r.text()).replace(/^﻿/, '');
      } catch (e) {
        err = e;
        await sleep(3000 * i);
      }
    }
    throw err;
  };
}

// fn over items, n at a time.
export async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
