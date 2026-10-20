// What the build scripts share: the `--name value` arguments, the last
// deploy's copy of a data file (to build on), and a pause.
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
