// 立法委員 headshots, mirrored: ly.gov.tw's are 670×860 JPEGs of ~270 KB
// each, slow from abroad, so the app never hotlinks them. Each is fetched
// once, cropped square from the top (the face) and saved as two small WebPs
// (96 px for lists, 192 px for a legislator's page) named by their content,
// so the browser keeps them for good. The files and their list
// (public/img/ly/photos.json) are committed; a deploy only fetches a
// newcomer's, or one whose source changed. Then people.json's photo becomes
// the mirrored file's stem (the app adds `.96.webp` / `.192.webp`); a photo
// that couldn't be fetched keeps its ly.gov.tw address.
// Runs after build-ly.mjs. Needs sharp (`npm i --no-save sharp`); without
// it, only the committed photos are used.
//   node scripts/build-photos.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../public/', import.meta.url).pathname;
const dir = `${root}img/ly/`;
const listFile = `${dir}photos.json`;
const peopleFile = `${root}data/ly/people.json`;
const SIZES = [96, 192];

const read = async (f, fallback) => JSON.parse(await readFile(f, 'utf8').catch(() => 'null')) ?? fallback;
const list = await read(listFile, {});
const people = await read(peopleFile, null);
if (!people) {
  console.log('photos: no people.json, nothing to do');
  process.exit(0);
}
const sharp = await import('sharp').then(m => m.default).catch(() => null);
await mkdir(dir, { recursive: true });

let fetched = 0, failed = 0;
for (const p of people.people) {
  const src = p.photo;
  if (!/^https?:/.test(src || '')) continue;
  if (list[p.id]?.src !== src && sharp) {
    try {
      const r = await fetch(src, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(String(r.status));
      const raw = Buffer.from(await r.arrayBuffer());
      const files = await Promise.all(SIZES.map(s => sharp(raw).resize(s, s, { fit: 'cover', position: 'top' }).webp({ quality: 72 }).toBuffer()));
      const stem = `${p.id}.${createHash('sha1').update(files[1]).digest('hex').slice(0, 8)}`;
      await Promise.all(files.map((f, i) => writeFile(`${dir}${stem}.${SIZES[i]}.webp`, f)));
      list[p.id] = { src, stem };
      fetched++;
    } catch (e) {
      failed++;
      console.log(`photos: ${p.n} ${e.message}`);
    }
  }
  if (list[p.id]?.src === src) p.photo = `img/ly/${list[p.id].stem}`;
}
await writeFile(listFile, JSON.stringify(list, null, 1) + '\n');
await writeFile(peopleFile, JSON.stringify(people));
console.log(`photos: ${fetched} fetched, ${failed} failed, ${people.people.filter(p => p.photo.startsWith('img/')).length}/${people.people.length} mirrored`);
