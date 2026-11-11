// Packs public/data/ for the deploy: the Workers Free plan publishes at most
// 20,000 files a site, and the data alone was 77,000 (2026-11-11). Each
// folder of 50 files or more (law/, agency/, council/…) becomes packs of
// about 96 KB, each named by its content's hash (a deploy that didn't change
// one leaves every copy of it as it is); a file over 48 KB stays as it was.
// data/_packs.json lists them; the app's data(), the proxy and the next
// build (scripts/lib.mjs prevJson) read any path through the kit's
// packReader as if nothing were packed. The kit's data-pack.mjs.
// Run by the deploy workflow only, last before publishing.
//   node scripts/pack-data.mjs [data folder]
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const kitDir = [new URL('../.kit/', import.meta.url).pathname, new URL('../../Orbit-Core/kit/', import.meta.url).pathname].find(d => existsSync(`${d}data-pack.mjs`));
if (!kitDir) throw new Error('the kit (.kit or ../Orbit-Core/kit) is missing');
const { packData } = await import(pathToFileURL(`${kitDir}data-pack.mjs`).href);
const dir = (process.argv[2] || new URL('../public/data', import.meta.url).pathname).replace(/\/$/, '');
const hashOf = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
const { roots, before, after } = await packData(dir, { fs, hashOf });
for (const [root, r] of Object.entries(roots)) console.log(`${root}: ${r.n} packs${r.loose ? ', some files loose' : ''}`);
console.log(`data files: ${before} → ${after}`);
