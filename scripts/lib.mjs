// What the build scripts share: the `--name value` arguments, the last
// deploy's copy of a data file (to build on), a pause, a polite fetch and a pool.
export const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const PREV = args.prev ?? 'https://jaypengx.github.io/Orbit-Law/data/';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// The last deploy's data/<path> as JSON, or null (`--prev ''` builds from nothing).
export async function prevJson(path) {
  if (!PREV) return null;
  try {
    const r = await fetch(PREV + path, { signal: AbortSignal.timeout(60_000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// A page fetcher: one request at a time per host, at least a second apart, tries and a timeout each.
export function getter(ua) {
  const lastAt = {};
  return async function get(url, { tries = 3, timeout = 120_000 } = {}) {
    let err;
    const host = new URL(url).host;
    for (let i = 1; i <= tries; i++) {
      await sleep(Math.max(0, (lastAt[host] || 0) + 1000 - Date.now()));
      lastAt[host] = Date.now();
      try {
        const r = await fetch(encodeURI(url), { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(timeout) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.text()).replace(/^﻿/, '');
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
