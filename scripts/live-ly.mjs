// 立法院 live, now: which IVOD channel carries each meeting that's on. IVOD's
// own pages say so only while a meeting streams, and can't be read from a
// browser (no CORS, a TLS setup Node refuses by default), so this runs in a
// workflow (live.yml) every couple of minutes in sitting hours and writes
// live.json: { at, rooms: [{ unit, time, place, status, title, ch }], places }.
// `places` keeps every room → channel seen, for a later day.
//   node scripts/live-ly.mjs <out.json>
import https from 'node:https';
import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { ivodLive } from '../public/lib/agenda.mjs';

const out = process.argv[2] || 'live.json';
const agent = new https.Agent({ secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT, keepAlive: true });
let cookie = '';
function get(path, { method = 'GET', body = '', headers = {} } = {}) {
  return new Promise((ok, no) => {
    const req = https.request({ host: 'ivod.ly.gov.tw', path, method, agent, timeout: 30_000, headers: { 'user-agent': 'Mozilla/5.0 (Orbit Law)', cookie, ...headers } }, res => {
      const set = res.headers['set-cookie'] || [];
      if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
      let s = '';
      res.setEncoding('utf8');
      res.on('data', d => (s += d));
      res.on('end', () => (res.statusCode < 400 ? ok(s) : no(new Error(`${path} ${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(new Error(`${path} timeout`)));
    req.on('error', no);
    req.end(body);
  });
}

const page = await get('/Live');
const token = (page.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
if (!token) throw new Error('no csrf token');
const list = await get('/Live/FetchCommInfo', { method: 'POST', body: 'type=all', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrf-token': token, 'x-requested-with': 'XMLHttpRequest' } });
const rooms = [];
for (const r of ivodLive(list)) {
  let ch = null;
  if (r.single) ch = Number(((await get(r.single)).match(/embedd\.php\?id=(\d+)/) || [])[1]) || null;
  const { single, ...row } = r;
  rooms.push({ ...row, title: row.title.slice(0, 160), ch });
}
let places = {};
try {
  places = JSON.parse(await readFile(out, 'utf8')).places || {};
} catch {}
for (const r of rooms) if (r.ch && r.place) places[r.place] = r.ch;
await writeFile(out, JSON.stringify({ at: new Date().toISOString(), rooms, places }));
console.log(rooms.map(r => `${r.unit} ${r.time} ${r.status} ch${r.ch ?? '-'}`).join('\n') || 'no meetings today');
