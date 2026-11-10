// 立法委員 headshots, mirrored: ly.gov.tw's are 670×860 JPEGs of ~270 KB
// each, slow from abroad, so the app never hotlinks them. Each is fetched
// once, cropped square from the top (the face) and saved as two small WebPs
// (96 px for lists, 192 px for a legislator's page) named by their content,
// so the browser keeps them for good. The files and their list
// (public/img/ly/photos.json) are committed; a deploy only fetches a
// newcomer's, or one whose source changed. Then people.json's photo becomes
// the mirrored file's stem (the app adds `.96.webp` / `.192.webp`); a photo
// that couldn't be fetched keeps its ly.gov.tw address.
// Then the 縣市議員's (below). Runs after build-ly.mjs and build-council.mjs. Needs sharp (`npm i --no-save sharp`); without
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
const people = (await read(peopleFile, null)) || { people: [] };
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
if (people.people.length) await writeFile(peopleFile, JSON.stringify(people));
console.log(`photos: ${fetched} fetched, ${failed} failed, ${people.people.filter(p => p.photo.startsWith('img/')).length}/${people.people.length} mirrored`);

// 縣市議員 photos (內政部's, ws.moi.gov.tw): up to 5,000 px, and some carry
// EXIF sizes Safari scales by, so they drew stretched (新竹縣's 何建樺). Each is
// mirrored the same way into data/council/img/, not committed: the files and
// their list live in .council-photos/, kept between builds by the workflow's
// cache, so a night fetches only newcomers (at most 12 minutes of them; the
// rest keep their address until the next build). A photo of one flat colour
// (a blank crop of the 選舉公報) is dropped: the initial shows instead.
const councilDir = `${root}data/council/`;
const index = await read(`${councilDir}index.json`, null);
if (index && sharp) {
  const keep = new URL('../.council-photos/', import.meta.url).pathname;
  const out = `${councilDir}img/`;
  await mkdir(keep, { recursive: true });
  await mkdir(out, { recursive: true });
  const seen = await read(`${keep}list.json`, {});
  const stop = Date.now() + 12 * 60_000;
  const { copyFile, access } = await import('node:fs/promises');
  const has = f => access(f).then(() => true, () => false);
  let got = 0, bad = 0, used = 0, flat = 0;
  const mirror = async src => {
    const r = await fetch(src, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Orbit-Law nightly (+https://orbit.jaypengx.com/law/)' } });
    if (!r.ok) throw new Error(String(r.status));
    const raw = Buffer.from(await r.arrayBuffer());
    const { channels } = await sharp(raw).stats();
    if (channels.slice(0, 3).every(c => c.stdev < 6)) return { flat: true };
    // A 選舉公報 crop sits in white paper: the paper goes first.
    const img = /ronny-s3/.test(src) ? await sharp(raw).rotate().trim({ threshold: 20 }).toBuffer() : raw;
    const files = await Promise.all(SIZES.map(s => sharp(img).rotate().resize(s, s, { fit: 'cover', position: 'top' }).webp({ quality: 72 }).toBuffer()));
    const stem = createHash('sha1').update(files[1]).digest('hex').slice(0, 12);
    await Promise.all(files.map((f, i) => writeFile(`${keep}${stem}.${SIZES[i]}.webp`, f)));
    return { stem };
  };
  for (const { c } of index.councils) {
    const file = `${councilDir}${c}.json`;
    const one = await read(file, null);
    if (!one?.people) continue;
    const todo = one.people.filter(p => /^https?:/.test(p.photo || '') && !seen[p.photo]);
    // Four at a time, gently.
    for (let i = 0; i < todo.length && Date.now() < stop; i += 4) {
      await Promise.all(todo.slice(i, i + 4).map(async p => {
        try {
          seen[p.photo] = await mirror(p.photo);
          got++;
        } catch (e) {
          bad++;
          if (bad <= 10) console.log(`council photos: ${c} ${p.n} ${e.message}`);
        }
      }));
    }
    for (const p of one.people) {
      // A council kept from the last build (its read failed) already names its mirrored file.
      const kept = /^data\/council\/img\/(\w+)$/.exec(p.photo || '')?.[1];
      if (kept) {
        if (await has(`${keep}${kept}.96.webp`)) for (const s of SIZES) await copyFile(`${keep}${kept}.${s}.webp`, `${out}${kept}.${s}.webp`);
        else p.photo = '';
        continue;
      }
      const m = seen[p.photo];
      if (m?.flat) (p.photo = '', flat++);
      else if (m?.stem && (await has(`${keep}${m.stem}.96.webp`))) {
        for (const s of SIZES) await copyFile(`${keep}${m.stem}.${s}.webp`, `${out}${m.stem}.${s}.webp`);
        p.photo = `data/council/img/${m.stem}`;
        used++;
      }
    }
    await writeFile(file, JSON.stringify(one));
  }
  await writeFile(`${keep}list.json`, JSON.stringify(seen));
  console.log(`council photos: ${got} fetched, ${bad} failed, ${flat} blank, ${used} mirrored`);
}
