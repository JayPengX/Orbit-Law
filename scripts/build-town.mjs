// 鄉鎮市民代表會 from their own sites (lib/town-site.mjs TOWN_SITES; 竹北市民代表會, and 彰化's on the county's
// platform: lib/town-chcg.mjs, chcgTown): the members with
// photos, each session of the term with its days, every sitting's 會議紀錄, 施政報告, 總質詢, 決議案 (PDFs), each
// day's recording (Google Drive), the 議事日程表, and the news that sets a session's days before it meets.
// Writes public/data/council/town/<tc>.json. The sites serve only Taiwan: read through the proxy's door
// (/law-page, the build's key LAW_BUILD_KEY), gently (a page at a time, ½ s apart; what's settled is kept
// from the last deploy, so a night reads only what's new). Never fails the deploy: a site that can't be
// read keeps the last copy.
//   node scripts/build-town.mjs [--prev https://orbit.jaypengx.com/law/data/]
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { sleep, prevJson } from './lib.mjs';
import { TOWN_SITES, membersUrl, recordUrl, sessionUrl, itemUrl, listUrl, viewUrl, townMembers, townSessions, sessionItems, pageFiles, audioDays, listRows, sessionNews, paperFile, resolutions, transcript, questions, paperText, written } from '../public/lib/town-site.mjs';
import { minutesOf, digest } from '../public/lib/minutes.mjs';
import { chcgUrl, chcgLinks, chcgMenu, chcgMembers, sessionOf, paperKind, dayIn, driveId, pdfSpan, nameSpan, yearOf, tsoUrl, tsoPage, folderOf, formUrl, formList, wpUrl, wpPost, wpDay, joomlaList, joomlaArticle, penghuList, penghuPost, penghuDay, driveFolderUrl, driveEntries, ccmsPage, ccmsNews, boxList, boxFiles, westDay, linkFiles, pageMore, ytId } from '../public/lib/town-chcg.mjs';

const DOOR = 'https://orbit-workers-proxy.pengzjay.workers.dev/law-page';
const KEY = process.env.LAW_BUILD_KEY || '';
const out = new URL('../public/data/council/town/', import.meta.url).pathname;
const built = new Date().toISOString();
const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * 86_400e3).toISOString().slice(0, 10);

let reads = 0;
// The build's time (the deploy's step allows 20 minutes): past it, no more PDFs are read and the towns not yet
// built keep their last copies. Towns take turns going first, a day each, so none waits behind the others.
const ENDS = Date.now() + Number(process.env.TOWN_MINUTES || 14) * 60e3;
const late = () => Date.now() > ENDS;
// A page through the door. Lists carry the day (the door keeps a page a day: a list read today is today's).
async function page(url, fresh = false) {
  const u = fresh ? `${url}${url.includes('?') ? '&' : '?'}ob=${day.replace(/-/g, '')}` : url;
  for (let tries = 0; ; tries++) {
    await sleep(process.env.FAST ? 0 : 500);
    reads++;
    try {
      const r = await fetch(`${DOOR}?v=1&u=${encodeURIComponent(u)}`, { headers: { 'X-Build-Key': KEY }, signal: AbortSignal.timeout(60_000) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.html) throw new Error(`${r.status} ${b.error || ''}`.trim());
      return b.html;
    } catch (e) {
      if (tries >= 1) throw new Error(`${url}: ${e.message}`);
      await sleep(3000);
    }
  }
}

// A PDF's text: its bytes through the door (file=1, never kept at the edge), then poppler's pdftotext.
let tmp;
async function pdfBytes(url) {
  await sleep(process.env.FAST ? 0 : 500);
  reads++;
  // (A PDF on Google Drive, 線西's: from Drive itself; the rest through the door.)
  const drive = driveId(url);
  const r = drive
    ? await fetch(`https://drive.usercontent.google.com/download?id=${drive}&export=download`, { signal: AbortSignal.timeout(90_000) })
    : await fetch(`${DOOR}?v=1&file=1&u=${encodeURIComponent(url)}`, { headers: { 'X-Build-Key': KEY }, signal: AbortSignal.timeout(90_000) });
  // The PDF itself (passed straight through), or a JSON answer saying why not.
  // (An .odt, .ods, .docx or .doc comes through as it came; 澎湖's named in the address's query, file=….ods&flag=doc.)
  const zip = /\.(odt|ods|docx?)(?=$|&)/i.test(url);
  const pdf = /pdf/i.test(r.headers.get('Content-Type') || '') || (drive && r.ok) || (zip && r.ok && !/json/i.test(r.headers.get('Content-Type') || ''));
  const b = pdf ? null : await r.json().catch(() => ({}));
  if (!r.ok || (!pdf && !b.b64)) throw new Error(`${r.status} ${b?.error || (b?.size ? `${b.size} bytes` : '')}`.trim());
  return pdf ? Buffer.from(await r.arrayBuffer()) : Buffer.from(b.b64, 'base64');
}
async function pdfText(url) {
  const bytes = await pdfBytes(url);
  // (An old Word file, 員山's and 秀水's: its text is kept as UTF-16, Chinese and all; the runs of it that read as text,
  // a line kept when it holds what a council's papers are written with, not the file's other bytes read as Chinese.)
  if (/\.doc(?=$|&)/i.test(url))
    return bytes
      .toString('utf16le')
      .replace(/[^\u0020-\u007e\u3000-\u303f\u4e00-\u9fff\uff00-\uffef\r\n]+/g, '\n')
      .split(/[\r\n]+/)
      .filter(l => (l.match(/[\d會議代表第屆次臨時定期年月日鄉鎮市民公所提案討論報告主席間地點出列紀記錄由說明辦法決通過一二三四五六七八九十、，。：（）]/g) || []).length >= 2)
      .join('\n');
  tmp ||= await mkdtemp(`${tmpdir()}/town-`);
  const file = `${tmp}/p.pdf`;
  await writeFile(file, bytes);
  const zip = /\.(odt|ods|docx)(?=$|&)/i.exec(url);
  // (An OpenDocument or Word file, 礁溪's agendas: its text from inside the zip, a paragraph or a table cell a line.)
  if (zip) {
    const xml = execFileSync('unzip', ['-p', file, zip[1].toLowerCase() !== 'docx' ? 'content.xml' : 'word/document.xml'], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    return xml.replace(/<\/(text:p|text:h|w:p|table:table-cell|w:tc)>/g, '\n').replace(/<(text:s|text:tab|w:tab)\b[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
}

// 會議紀錄變表格 (lib/minutes.mjs): a paper of minutes code couldn't split into rows, or a scan with no text,
// read once by the AI door (Orbit-Core /ai/build, feature law-minutes; its day's cap there), a few a night.
const AI_DOOR = 'https://orbit-workers-proxy.pengzjay.workers.dev/ai/build';
let aiBudget = Number(process.env.TOWN_AI ?? 30);
async function minutesByAi(town, session, p, url) {
  if (!KEY || aiBudget <= 0 || late()) return undefined;
  aiBudget--;
  try {
    const input = { town, session };
    if (p.text) input.text = digest(p.text);
    else {
      const bytes = await pdfBytes(url);
      if (bytes.length > 6_500_000) return null;
      input.pdf = { mime_type: 'application/pdf', data: bytes.toString('base64') };
    }
    const r = await fetch(AI_DOOR, { method: 'POST', headers: { 'X-Build-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'law-minutes', input }), signal: AbortSignal.timeout(150_000) });
    const b = await r.json().catch(() => ({}));
    if (r.status === 429) aiBudget = 0;
    if (!r.ok || !Array.isArray(b.out?.items)) throw new Error(`${r.status} ${b.error || ''} ${b.why || ''}`.trim());
    return b.out.items;
  } catch (e) {
    console.log(`town ${town} ${session} minutes AI: ${e.message}`);
    return null;
  }
}

// What a paper says, by its kind: 決議案 → its resolutions; 總質詢 → the day's turns and questions; 會議紀錄,
// 致詞, 施政報告 → text. 附錄 (tables of attendance) and the 議事日程表 stay PDFs.
const READ = new Set(['決議案', '總質詢', '會議紀錄', '致詞', '施政報告']);
function readPaper(k, text) {
  if (k === '決議案') return { res: resolutions(text) };
  if (k === '總質詢') {
    const t = transcript(text);
    // (Some days' papers are 書面質詢: forms with the 公所's written reply.)
    if (!t.turns.length) return { wq: written(text) };
    return { ...t, asks: questions(t.turns).map(({ w, from, to, gist }) => ({ w, from, to, gist })) };
  }
  if (k === '會議紀錄') {
    const t = paperText(text);
    const { sits, items, good } = minutesOf(t);
    return { text: t, sits, items, ...(good ? {} : { messy: true }) };
  }
  return { text: paperText(text) };
}

// Each session's papers read from their PDFs: council/town/<tc>/<paperFile>.json, { papers: { url: … } }. Read
// once (a posted paper doesn't change); one with no text (a scan) or that couldn't be read, again when there's room. Every
// file is written again each build (the deploy holds only what the build wrote).
async function townPapers(tc, sessions) {
  let budget = Number(process.env.TOWN_PDFS || 70);
  const dir = `${out}${tc}/`;
  await mkdir(dir, { recursive: true });
  // Every session's kept papers, then what's left to read: the unread first (newest session first), then any that
  // failed before (a scan with no text, a file the door couldn't pass) as the budget allows.
  const files = [];
  const jobs = [];
  for (const s of sessions) {
    if (!s.no || !s.items?.length) continue;
    const name = paperFile(s);
    const old = (await prevJson(`council/town/${tc}/${name}.json`))?.papers || {};
    const papers = {};
    files.push({ s, name, papers });
    for (const i of s.items) {
      if (!READ.has(i.k)) continue;
      for (const f of i.files || []) {
        const was = old[f.url];
        if (was) papers[f.url] = was;
        // (Minutes read before they were split into rows: split now, from the text kept.)
        if (was?.k === '會議紀錄' && was.text && !was.items) {
          const { sits, items, good } = minutesOf(was.text);
          Object.assign(was, { sits, items }, good ? {} : { messy: true });
        }
        // (A 總質詢 paper read before 書面質詢 were: read again.)
        const stale = was?.k === '總質詢' && !was.turns?.length && !was.wq;
        if (!was || (was.none && !was.ai) || stale) jobs.push({ s, i, f, papers, again: !!was && !stale });
      }
    }
  }
  jobs.sort((a, b) => a.again - b.again);
  for (const { s, i, f, papers } of jobs) {
    if (!KEY || budget <= 0 || late()) break;
    budget--;
    try {
      const text = await pdfText(f.url);
      papers[f.url] = text.replace(/\s/g, '').length > 40 ? { k: i.k, ...readPaper(i.k, text) } : { k: i.k, none: day };
    } catch (e) {
      console.log(`town ${tc} ${s.n} ${i.n}: ${e.message}`);
      papers[f.url] = { k: i.k, none: day };
    }
  }
  // Minutes code couldn't split, and scans: the AI door, newest session first, each once (a failure again after a week).
  for (const { s, papers } of files) {
    for (const [url, p] of Object.entries(papers)) {
      if (p.k !== '會議紀錄' || p.ai || !(p.messy || p.none) || (p.aiTry && p.aiTry > addDays(day, -7))) continue;
      const items = await minutesByAi(TOWN_SITES[tc]?.n || '', s.n, p, url);
      if (items) {
        Object.assign(p, { items, ai: day });
        delete p.messy;
        delete p.aiTry;
      } else if (items === null) p.aiTry = day;
    }
  }
  for (const { s, name, papers } of files) {
    // What the session's row says of them.
    const all = Object.values(papers);
    s.res = all.reduce((n, p) => n + (p.res?.length || 0), 0) || undefined;
    s.asks = all.reduce((n, p) => n + (p.asks?.length || 0), 0) || undefined;
    s.wq = all.reduce((n, p) => n + (p.wq?.length || 0), 0) || undefined;
    s.props = all.reduce((n, p) => n + (p.items?.length || 0), 0) || undefined;
    s.read = all.filter(p => !p.none).length || undefined;
    if (all.length) await writeFile(`${dir}${name}.json`, JSON.stringify({ built, tc, n: s.n, papers }));
  }
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = undefined;
}

async function town(tc, site) {
  const old = await prevJson(`council/town/${tc}.json`);
  if (!KEY) return old;
  const notes = [];
  // The members, a district a page.
  let people = [];
  try {
    for (const typeid of Object.keys(site.areas)) people.push(...townMembers(await page(membersUrl(site, typeid), true), site, typeid));
    if (people.length < 5) throw new Error(`only ${people.length} members`);
  } catch (e) {
    notes.push(`members: ${e.message}`);
    people = old?.people || [];
  }
  // The news: a session's days, set before it meets.
  let news = old?.news || [];
  const set = [];
  try {
    news = listRows(await page(listUrl(site, site.news), true)).slice(0, 20).map(x => ({ t: x.t, url: viewUrl(site, site.news, x.id) }));
  } catch (e) {
    notes.push(`news: ${e.message}`);
  }
  for (const x of news) {
    const s = sessionNews(x.t);
    if (s && s.term === site.term) set.push(s);
  }
  // The 議事日程表: a PDF a session (and one for its 延長會).
  const oldAgenda = new Map((old?.sessions || []).flatMap(s => s.agenda || []).map(a => [a.id, a]));
  const agenda = [];
  try {
    for (const r of listRows(await page(listUrl(site, site.agenda), true))) {
      const m = r.t.match(/第(\d+)屆第(\d+)次(定期會|臨時會)(延長會)?/);
      if (!m || +m[1] !== site.term) continue;
      let a = oldAgenda.get(r.id);
      if (!a?.url) {
        const { files } = pageFiles(await page(viewUrl(site, site.agenda, r.id)), site.base);
        if (!files.length) continue;
        a = { id: r.id, n: r.t.replace(/^第\d+屆/, ''), url: files[0].url };
      }
      agenda.push({ ...a, s: `第${m[2]}次${m[3]}`, ext: !!m[4] });
    }
  } catch (e) {
    notes.push(`agenda: ${e.message}`);
  }
  // The 議事錄: each session's page, then each of its parts' (kept once read: a part's files don't change).
  const before = new Map((old?.sessions || []).filter(s => s.key).map(s => [s.key, s]));
  let sessions = [];
  let budget = 180;
  try {
    const listed = townSessions(await page(recordUrl(site), true)).filter(s => s.term === site.term);
    for (const s of listed) {
      const was = before.get(s.key);
      const lastDay = was?.days?.at(-1)?.d || was?.to || '';
      // A session long over whose every part is read: as it was.
      const settled = was && was.items?.length && was.items.every(i => i.files?.length) && lastDay && lastDay < addDays(day, -60);
      if (settled || budget <= 0) {
        if (was) sessions.push(was);
        continue;
      }
      let items;
      try {
        budget--;
        items = sessionItems(await page(sessionUrl(site, s.key), true));
      } catch (e) {
        notes.push(`${s.n}: ${e.message}`);
        if (was) sessions.push(was);
        continue;
      }
      const had = new Map((was?.items || []).map(i => [i.id, i]));
      let days = was?.days || [];
      for (const i of items) {
        const h = had.get(i.id);
        if (i.k === '錄音') {
          if (budget-- <= 0) continue;
          try {
            const got = audioDays(await page(itemUrl(site, i.id)));
            if (got.length >= days.length) days = got;
          } catch (e) {
            notes.push(`${s.n} 錄音: ${e.message}`);
          }
          continue;
        }
        if (h?.files?.length) i.files = h.files;
        else if (budget-- > 0) {
          try {
            i.files = pageFiles(await page(itemUrl(site, i.id)), site.base).files.map(({ url, size }) => ({ url, ...(size ? { size } : {}) }));
          } catch (e) {
            notes.push(`${s.n} ${i.n}: ${e.message}`);
            i.files = [];
          }
        } else i.files = h?.files || [];
      }
      sessions.push({ ...s, items: items.filter(i => i.k !== '錄音'), days });
    }
  } catch (e) {
    notes.push(`record: ${e.message}`);
    sessions = old?.sessions || [];
  }
  // Each session's days: the news's, else its recordings'; its 議事日程表; and a session the news has set
  // that the 議事錄 doesn't list yet (it's ahead, or under way).
  for (const s of sessions) {
    const main = set.find(x => x.n === s.n && !x.ext);
    const ext = set.find(x => x.n === s.n && x.ext);
    const days = (s.days || []).map(d => d.d);
    s.from = main?.from || s.from || days[0] || '';
    const own = (s.days || []).filter(d => !d.ext).map(d => d.d);
    const more = (s.days || []).filter(d => d.ext).map(d => d.d);
    s.to = main?.to || own.at(-1) || s.to || days.at(-1) || '';
    if (ext) s.ext = { from: ext.from, to: ext.to };
    else if (more.length) s.ext = { from: more[0], to: more.at(-1) };
    const a = agenda.filter(x => x.s === s.n).map(({ id, n, url }) => ({ id, n, url }));
    if (a.length) s.agenda = a;
  }
  for (const x of set) {
    if (x.ext || sessions.some(s => s.n === x.n)) continue;
    const a = agenda.filter(y => y.s === x.n).map(({ id, n, url }) => ({ id, n, url }));
    const ext = set.find(y => y.n === x.n && y.ext);
    sessions.push({ n: x.n, term: x.term, kind: x.n.slice(-3), from: x.from, to: x.to, ...(ext ? { ext: { from: ext.from, to: ext.to } } : {}), items: [], days: [], ...(a.length ? { agenda: a } : {}), set: true });
  }
  sessions.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
  for (const n of notes.slice(0, 12)) console.log(`town ${tc}: ${n}`);
  if (!people.length && !sessions.length) return old;
  return { built, tc, n: site.n, site: site.home, term: site.term, ends: site.ends, people, sessions, news: news.slice(0, 12) };
}

// 彰化's 代表會 on the county's platform (lib/town-chcg.mjs): every paper's link names its session, so the
// sessions are gathered from the links: 議事日程表 → agenda, recordings → days (和美's a Drive file a day, 福興's
// MP3 parts), the rest → items by kind. A session's days: its 議事日程表's, else its 議事錄's 時間 line, else
// its recordings'. A session page (福興) long over is kept as it was.
async function chcgTown(tc, site) {
  const old = await prevJson(`council/town/${tc}.json`);
  if (!KEY) return old;
  const c = site.chcg;
  const areas = c.areas || {};
  const notes = [];
  let people = [];
  try {
    for (const [id, area] of Object.entries(areas)) people.push(...chcgMembers(await page(chcgUrl(site, id), true), area));
    if (Object.keys(areas).length && people.length < 5) throw new Error(`only ${people.length} members`);
  } catch (e) {
    notes.push(`members: ${e.message}`);
    people = old?.people || [];
  }
  const before = new Map((old?.sessions || []).map(s => [s.key, s]));
  const by = new Map();
  const at = name => {
    const x = sessionOf(name, site.term);
    if (!x || x.term !== site.term) return null;
    if (!by.has(x.key)) {
      const { ext, ...s } = x;
      by.set(x.key, { ...s, items: [], days: [], agenda: [], folders: [] });
    }
    return { s: by.get(x.key), ext: x.ext };
  };
  const put = (s, ext, k, n, url, pic) => {
    if (folderOf(url)) return s.folders.some(f => f.url === url) || s.folders.push({ url });
    // (Its days in its name, 議事日程表(112.5.15-5.26): read from there, no PDF.)
    const sp = k !== '錄音' && nameSpan(n);
    if (sp) (s.spans ||= []).push({ ...sp, agenda: k === '議事日程表', ext: k === '議事日程表' && /延長|延會/.test(n) });
    if (k === '錄音') {
      const d = dayIn(n);
      const drive = driveId(url);
      // (Its name past the session and the day: what the sitting did, 綜合質詢.)
      const what = n.replace(/^.*?(定期會|臨時會)(延長會)?/, '').replace(/(?<!\d)1\d{2}(\d{4}|\.\d{1,2}\.\d{1,2})(?![\d.])|(?<!\d)1\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/, '').replace(/(錄音|影音)檔?/g, '').replace(/^[-_\s]+|[-_\s]+$/g, '').trim();
      const yt = ytId(url);
      // (A sitting's video on YouTube, 羅東's: played in the app, its day and what it was.)
      if (yt) return s.days.some(x => x.yt === yt) || s.days.push({ ...(d ? { d } : {}), yt, ...(what && !/^\d+$/.test(what) ? { what } : {}), ext });
      if (drive && d) s.days.push({ d, drive, ext, ...(what && !/^\d+$/.test(what) ? { what } : {}) });
      // (Or its own MP4, 澎湖's, a day in parts, 1151006-2: its part, and its picture.)
      else if (!drive && /\.(mp3|m4a|wav|mp4)$/i.test(url)) {
        const part = d && (n.match(/-(\d{1,2})$/) || [])[1];
        s.days.some(x => x.src === url) || s.days.push({ ...(d ? { d, ...(part ? { n: part } : {}) } : { n: n.replace(/^錄音(分割)?檔\s*/, '').replace(/_\d{4}$/, '') }), src: url, ...(pic ? { pic } : {}) });
      }
      else if (drive) s.days.push({ n: n.replace(/^.*?(定期會|臨時會)(延長會)?/, '').replace(/^錄音(檔)?\s*/, '') || n, drive, ext });
      // (A session's recording on a video site, 田尾's on HiNet: opened there.)
      else s.folders.some(f => f.url === url) || s.folders.push({ url });
      return;
    }
    if (k === '議事日程表') return s.agenda.some(a => a.url === url) || s.agenda.push({ n: ext || /延長|延會/.test(n) ? '延長會議事日程表' : '議事日程表', url });
    if (s.items.some(i => i.files[0].url === url)) return;
    // (Its name past the session: 會期-議事錄(115.9.29-10.1) → 議事錄; 定期大會議事錄 → 議事錄.)
    // (Minutes of several sessions in one, 第7次定期會暨第16.17.18次臨時會: 議事錄.)
    const nm = n.replace(/^.*?(定期|臨時)大?會(延長會|延會)?/, '').replace(/^暨[第\d.、，,次及]*(臨時?會?|定期會?)/, '').replace(/_\d{4}$/, '').replace(/[(（][\d.\-~～－及、\s]+[)）]/g, '').replace(/^[-_\s]+/, '').trim();
    // (議事錄 and 會議紀錄 are both a session's minutes; a site with both keeps their names apart.)
    const named = k !== '會議紀錄' ? nm : /^(議事錄)?$/.test(nm) ? '議事錄' : /^(會議)?[紀記]錄$/.test(nm) ? '會議紀錄' : nm;
    s.items.push({ k, n: named || n, files: [{ url }], ...(sp ? { on: sp.from } : {}) });
  };
  try {
    // Lists: each link a paper of the list's kind (or, a list of papers, its own name's).
    for (const [id, kind] of Object.entries(c.lists || {})) {
      for (const l of chcgLinks(await page(chcgUrl(site, id), true))) {
        const x = at(l.n);
        if (x) put(x.s, x.ext, kind === '錄音' ? kind : paperKind(l.n) === '議事日程表' ? '議事日程表' : kind, l.n, l.url);
      }
    }
    // A 公所 site's lists ("Parser" CMS, 鹿港's): ten a page, newest first, read until a page holds none of this term.
    for (const [parser, kind] of Object.entries(c.forms || {}))
      for (let pg = 0, pages = 1; pg < Math.min(pages, 8); pg++) {
        const r = formList(await page(formUrl(c.cms, parser, pg), true), c.cms);
        pages = r.pages;
        let mine = 0;
        for (const l of r.links) {
          const x = at(l.n);
          if (x && ++mine) put(x.s, x.ext, kind === '錄音' ? kind : paperKind(l.n) === '議事日程表' ? '議事日程表' : kind, l.n, l.url);
        }
        if (!mine) break;
      }
    // A 代表會 on WordPress (名間's): its posts naming a session, each a paper of the title's kind or recordings.
    if (c.wp)
      for (let pg = 1, pages = 1; pg <= Math.min(pages, 4); pg++) {
        const r = await fetch(wpUrl(c.wp, '屆第', pg), { signal: AbortSignal.timeout(60_000) });
        const posts = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(posts)) throw new Error(`${c.wp}: ${r.status}`);
        pages = +r.headers.get('X-WP-TotalPages') || 1;
        for (const w of posts.map(wpPost)) {
          const x = /^[［[【]/.test(w.title) ? null : at(w.title);
          if (!x) continue;
          const k = /錄音|音檔/.test(w.title) ? '錄音' : paperKind(w.title);
          for (const l of w.links) {
            const audio = /\.(mp3|m4a)$/i.test(l.url);
            // (A recording named by its month and day: that day, 1151019 as the sites write it.)
            const d = audio && wpDay(l.n, w.date);
            put(x.s, x.ext, audio || k === '錄音' ? '錄音' : k, d ? `${+d.slice(0, 4) - 1911}${d.slice(5, 7)}${d.slice(8)}` : audio ? l.n : w.title, l.url);
          }
        }
      }
    // A 公所 site on Joomla (東河's): its lists' articles named by session, ten a page, each read for its files.
    if (c.joomla) {
      let arts = 0;
      for (const path of c.joomla.lists)
        for (let start = 0; start < 100; start += 10) {
          const list = joomlaList(await page(`${c.joomla.base}${path}?start=${start}`, true), c.joomla.base, path);
          let mine = 0;
          for (const a of list) {
            const x = at(a.n);
            if (!x || arts >= 80 || late()) continue;
            mine++;
            arts++;
            const k = /錄音|音檔/.test(a.n) ? '錄音' : paperKind(a.n);
            for (const l of joomlaArticle(await page(a.url), c.joomla.base)) put(x.s, x.ext, k, k === '錄音' ? l.n : a.n, l.url);
          }
          if (!mine) break;
        }
    }
    // e-land's CCMS (宜蘭's 頭城): a page with every session's papers, and its recordings under a line naming the
    // session.
    // (A list of posts, 礁溪's 臨時會 minutes, News.aspx: each post of this term read as a page.)
    // (A page of one kind's recordings, 員山's: files named by term, session and day, 2205-0512 → 第22屆第5次定期會
    // 5月12日, or part, 2209-1.)
    const ccms = (url, p, x0, kind) => {
      for (const f of p.files) {
        const audio = /\.(mp3|m4a|wav)$/i.test(f.url);
        const m = kind && f.n.match(/^(\d{2})(\d{2})-(\d+)/);
        const n = m ? `第${m[1]}屆第${+m[2]}次${kind} ${m[3].length === 4 ? `${+m[3].slice(0, 2)}月${+m[3].slice(2)}日` : `錄音檔${m[3]}`}` : f.n;
        const x = at(n) || x0;
        if (x) put(x.s, x.ext, audio ? '錄音' : paperKind(n) === '其他' && x0 ? paperKind(x0.n) : paperKind(n), audio ? n.replace(/^\S*?(定期|臨時)會\s*/, '') : n, f.url);
      }
      for (const a of p.audio) {
        const x = at(a.head) || x0;
        if (x) put(x.s, x.ext, '錄音', a.n, a.url);
      }
    };
    for (const it of c.ccms || []) {
      const { url, kind } = typeof it === 'string' ? { url: it } : it;
      if (!/News4?\.aspx/.test(url)) ccms(url, ccmsPage(await page(url, true), url), null, kind);
      // (Twenty a page, 蘇澳's: the next page while one holds this term's.)
      else
        for (let pg = 1, posts = 0, seen = new Set(); pg <= 4; pg++) {
          let mine = 0;
          // (A list on one page, 屏東's: its next page the same posts, read no further.)
          // (A later page that can't be read ends the list; a post that can't, only itself.)
          const html = pg > 1 ? await page(`${url}&page=${pg}&PageSize=20`, true).catch(() => '') : await page(url, true);
          const list = ccmsNews(html, url).filter(p => !seen.has(p.url) && seen.add(p.url));
          for (const post of list) {
            const x = at(post.n);
            if (!x || (!post.file && posts++ >= 50) || late()) continue;
            mine++;
            let p = { files: [post], audio: [] };
            if (!post.file)
              try {
                p = ccmsPage(await page(post.url, true), post.url);
              } catch (e) {
                notes.push(e.message);
                continue;
              }
            ccms(post.url, p, { ...x, n: post.n });
          }
          if (!mine) break;
        }
    }
    // A 代表會's own plain pages (羅東's): each file linked, named by its session.
    // (Its video pages too, a page a few months: 羅東's recorder22_*.html, by `more`'s pattern.)
    const plain = [...(c.files || [])];
    for (let i = 0; i < plain.length && i < 12; i++) {
      let html;
      try {
        html = await page(plain[i], true);
      } catch (e) {
        notes.push(e.message);
        continue;
      }
      if (c.more) for (const u of pageMore(html, plain[i], c.more)) plain.includes(u) || plain.push(u);
      for (const f of linkFiles(html, plain[i])) {
        const x = at(f.n);
        if (x) put(x.s, x.ext, /\.(mp3|m4a|wav)$/i.test(f.url) || ytId(f.url) || /錄音|音檔/.test(f.n) ? '錄音' : paperKind(f.n), f.n, f.url);
      }
    }
    // A 代表會's own "boxlists" site (壯圍's): each list a kind, ten a line, read until a page holds none of this
    // term; a line is the file, or a page of files (the 議事錄 and its sittings' recordings). (A 預定 agenda only when
    // its session has no other.)
    // A 代表會's papers in Google Drive folders (里港's): a folder a kind, a folder a session in it (or the session in
    // each file's name), read from Drive itself (folders and files open to all); a folder of another term's never
    // opened. A recording named by its day, 20201028.mp3.
    if (c.drive)
      for (const [id, kind] of Object.entries(c.drive)) {
        const walk = async (folder, x0, depth) => {
          if (late()) return;
          await sleep(process.env.FAST ? 0 : 500);
          const r = await fetch(driveFolderUrl(folder), { signal: AbortSignal.timeout(60_000) });
          if (!r.ok) throw new Error(`Drive ${folder}: ${r.status}`);
          for (const e of driveEntries(await r.text())) {
            const s = sessionOf(e.n, site.term);
            const t = +(e.n.match(/第(\d+)屆/) || [])[1];
            if ((s && s.term !== site.term) || (t && t !== site.term)) continue;
            const x = (s && at(e.n)) || x0;
            if (e.folder) {
              // (A session's folder long over, its kind kept from before: not opened again.)
              const was = x && x !== x0 && before.get(x.s.key);
              if (was?.to && was.to < addDays(day, -60)) {
                const same = (list, y, key) => list.some(z => key(z) === key(y));
                if (kind === '錄音' && was.days?.length) {
                  for (const d of was.days) same(x.s.days, d, z => z.drive || z.src || z.yt) || x.s.days.push(d);
                  continue;
                }
                const mine = (was.items || []).filter(i => (kind === '會議紀錄') === (i.k === '會議紀錄'));
                if (kind === '議事日程表' ? was.agenda?.length : mine.length) {
                  if (kind === '議事日程表') for (const a of was.agenda) same(x.s.agenda, a, z => z.url) || x.s.agenda.push(a);
                  for (const i of mine) same(x.s.items, i, z => z.files[0].url) || x.s.items.push(i);
                  continue;
                }
              }
              if (depth < 3) await walk(e.folder, x, depth + 1);
              continue;
            }
            if (!x) continue;
            const audio = kind === '錄音' || /\.(mp3|m4a|wav)$/i.test(e.url);
            const k = audio ? '錄音' : paperKind(e.n) === '其他' ? kind : paperKind(e.n);
            put(x.s, x.ext, k, audio ? westDay(e.n) || e.n : e.n, e.url);
          }
        };
        await walk(id, null, 0);
      }
    // 澎湖's (event.penghu.gov.tw/R…/): each list a kind, fifteen posts a page, each post a session's files or its
    // sittings' videos (MP4s, named by day: 10.06-1 in the post's year).
    if (c.penghu)
      for (const [id, kind] of Object.entries(c.penghu.lists)) {
        let posts = 0;
        for (let pg = 1, pages = 1; pg <= Math.min(pages, 6); pg++) {
          const r = penghuList(await page(`${c.penghu.base}home.jsp?id=${id}${pg > 1 ? `&pagenum=${pg}&intpage=1` : ''}`, true), c.penghu.base);
          pages = r.pages;
          let mine = 0;
          for (const l of r.links) {
            const x = at(l.n);
            if (!x || posts++ >= 40 || late()) continue;
            mine++;
            // (A post of videos grows as the sittings go up: read again each day.)
            const p = penghuPost(await page(l.url, kind === '錄音'), c.penghu.base);
            // (A list of recordings keeps only its sound and video files: 馬公's posts hold .txt notes of links, its
            // videos on its YouTube channel, town-video.mjs.)
            for (const f of p.files.filter(f => kind !== '錄音' || /\.(mp3|m4a|mp4)(?=$|&)/i.test(f.url))) put(x.s, x.ext, kind === '錄音' ? '錄音' : kind === '議事日程表' || paperKind(f.n) === '議事日程表' ? '議事日程表' : kind, kind === '議事日程表' ? `${l.n}${/延長|延會/.test(f.n) ? '延長會' : ''}議事日程表` : f.n, f.url);
            for (const v of p.videos) put(x.s, x.ext, '錄音', penghuDay(v.n, l.on), v.url, v.pic);
          }
          if (!mine) break;
        }
      }
    if (c.box) {
      const got = [];
      let reads = 0;
      for (const [menu, kind] of Object.entries(c.box.menus))
        for (let pg = 1, pages = 1; pg <= Math.min(pages, 6); pg++) {
          const r = boxList(await page(`${c.box.base}boxlists?menu_id=${menu}${pg > 1 ? `&page=${pg}` : ''}`, true), c.box.base);
          pages = r.pages;
          let mine = 0;
          for (const l of r.links) {
            const x = at(l.n);
            if (!x) continue;
            mine++;
            if (!l.files) got.push({ x, n: l.n, url: l.url, kind });
            else if (reads++ < 60 && !late())
              // (A recording named by the time it began, 11_14_18: its place among them.)
              boxFiles(await page(l.url, true), c.box.base).forEach((f, i) => {
                const audio = /\.(mp3|m4a|wav)$/i.test(f.url);
                got.push({ x: at(f.n) || x, n: audio ? westDay(f.n) || (dayIn(f.n) ? f.n : `錄音檔${i + 1}`) : f.n, url: f.url, kind: audio ? '錄音' : kind });
              });
          }
          if (!mine) break;
        }
      for (const g of got) {
        const k = g.kind === '錄音' ? '錄音' : paperKind(g.n) === '議事日程表' ? '議事日程表' : g.kind;
        if (k === '議事日程表' && /預定/.test(g.n) && got.some(o => o.x.s === g.x.s && o !== g && paperKind(o.n) === '議事日程表' && !/預定/.test(o.n))) continue;
        put(g.x.s, g.x.ext, k, g.n, g.url);
      }
    }
    // Menus: a page a session.
    if (c.menus) {
      const menu = chcgMenu(await page(chcgUrl(site, Object.keys(areas)[0] || Object.keys(c.lists || {})[0] || ''), true));
      for (const [group, kind] of Object.entries(c.menus))
        for (const it of menu[group] || []) {
          const x = at(it.n);
          if (!x) continue;
          const was = before.get(x.s.key);
          const settled = was && was.from && was.to < addDays(day, -60) && (kind === '錄音' ? was.days?.length : was.items?.length);
          let links;
          if (settled && kind === '錄音') {
            x.s.days.push(...was.days.filter(d => d.src));
            continue;
          }
          if (settled) links = [...(was.agenda || []).map(a => ({ n: a.n, url: a.url, k: '議事日程表' })), ...was.items.map(i => ({ n: i.n, url: i.files[0].url, k: i.k }))];
          else
            try {
              links = chcgLinks(await page(chcgUrl(site, it.id), true));
            } catch (e) {
              notes.push(`${it.n}: ${e.message}`);
              links = [];
            }
          for (const l of links) put(x.s, x.ext, kind === '錄音' ? '錄音' : l.k || paperKind(l.n), l.n, l.url);
        }
    }
    // A 公所's site: its pages, two deep (and a list's other pages); a link that doesn't name its session takes its
    // page's. Pages of other terms aren't followed.
    if (c.tso) {
      const seen = new Set();
      const queue = (c.pages || []).map(id => ({ id, depth: 0 }));
      let reads = 0;
      while (queue.length && reads < 80) {
        const { id, depth, pg } = queue.shift();
        const key = `${id}:${pg || 1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const url = tsoUrl(c.tso, id) + (pg ? `&txtQKeyword=&page=${pg}` : '');
        let p;
        try {
          reads++;
          p = tsoPage(await page(url, true), url);
        } catch (e) {
          notes.push(`${id}: ${e.message}`);
          continue;
        }
        if (!pg) for (const n of p.more.slice(0, 9)) queue.push({ id, depth, pg: n });
        const audio = /錄音|音檔/.test(p.title);
        for (const l of p.links) {
          const x = sessionOf(l.n, site.term) ? at(l.n) : at(`${p.title} ${l.n}`);
          // (A link named only by its session, on a page of one kind: 議事日程表(第三屆) lists 第三屆第18次臨時會.)
          const k = paperKind(l.n);
          if (x) put(x.s, x.ext, audio || /錄音|音檔/.test(l.n) ? '錄音' : k === '其他' ? paperKind(p.title) : k, l.n, l.url);
        }
        if (depth < 2)
          for (const k of p.kids) {
            const t = (k.n.match(/第(\d+)屆/) || [])[1];
            if (t && +t !== site.term) continue;
            if (/屆|定期會|臨時會|議事|錄音|音檔|日程|會議/.test(k.n)) queue.push({ id: k.id, depth: depth + 1 });
          }
      }
    }
  } catch (e) {
    notes.push(`pages: ${e.message}`);
    if (!by.size) return old;
  }
  // Each session's days, read once from its 議事日程表 or 議事錄.
  let pdfs = 40;
  for (const s of by.values()) {
    const was = before.get(s.key);
    // (Its agenda's days, else the days most of its papers name: 頭城 names three sessions' minutes as one's.)
    const most = (s.spans || []).filter(x => !x.ext).sort((a, b) => s.spans.filter(x => x.from === b.from).length - s.spans.filter(x => x.from === a.from).length)[0];
    const named = s.spans?.find(x => x.agenda && !x.ext) || most;
    const more = s.spans?.find(x => x.ext);
    delete s.spans;
    if (named) {
      Object.assign(s, { from: named.from, to: named.to });
      if (more && more.from > named.to) s.ext = { from: more.from, to: more.to };
    } else if (was?.from && !was.md) Object.assign(s, { from: was.from, to: was.to });
    // (Months and days read before weekdays were kept, mdv 1: read again once.)
    else if (was?.md && was.mdv === 2) Object.assign(s, { md: was.md, mdv: 2 });
    else {
      // (Its agenda, else its minutes: PDFs, and Word and OpenDocument files too, 秀水's and 員山's.)
      const pdf = u => !/\.(xlsx?|webp|jpe?g|png)$/i.test(u);
      const fs = [s.agenda.find(a => !/延長/.test(a.n) && pdf(a.url))?.url, s.items.find(i => i.k === '會議紀錄' && pdf(i.files[0].url))?.files[0].url].filter(Boolean);
      for (const f of fs) {
        if (pdfs-- <= 0 || late()) break;
        try {
          const span = pdfSpan(await pdfText(f));
          if (span) {
            Object.assign(s, span, span.md ? { mdv: 2 } : {});
            break;
          }
        } catch (e) {
          notes.push(`${s.n} days: ${e.message}`);
        }
      }
    }
  }
  // (Again, as those placed place their neighbours.)
  for (let i = 0; i < 3; i++) for (const s of by.values()) if (s.md && !s.from) Object.assign(s, yearOf(s, [...by.values()]) || {});
  // (A recording or a paper dated outside its session's days and inside another's: that one's. 頭城's lines name
  // one session twice, the second really the next.)
  const all = [...by.values()];
  const holds = (s, d) => s.from && d >= s.from && d <= (s.ext?.to || s.to);
  for (const s of all) {
    if (!s.from) continue;
    // (Papers too, by the days their names give.)
    s.items = s.items.filter(i => {
      if (!i.on || holds(s, i.on)) return true;
      const to = all.find(o => o !== s && holds(o, i.on));
      to?.items.push(i);
      return !to;
    });
    s.days = s.days.filter(d => {
      if (!d.d || !(d.src || d.yt) || holds(s, d.d)) return true;
      const to = all.find(o => o !== s && holds(o, d.d));
      to?.days.push(d);
      return !to;
    });
  }
  for (const s of by.values()) {
    // (A part named by its month and day, 12月21日錄音檔1: in the session's year.)
    for (const d of s.days) {
      const m = !d.d && s.from && String(d.n).match(/(\d{1,2})月(\d{1,2})日/);
      if (m) d.d = `${+s.from.slice(0, 4) + (+m[1] < +s.from.slice(5, 7) - 6 ? 1 : 0)}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }
    s.days.sort((a, b) => ((a.d || '') < (b.d || '') ? -1 : (a.d || '') > (b.d || '') ? 1 : 0));
    // (A day in parts: each its number.)
    for (const d of s.days) if (d.d && d.src) d.n = String(s.days.filter(x => x.d === d.d && x.src).indexOf(d) + 1);
    for (const d of s.days) if (d.d && d.n === '1' && !s.days.some(x => x !== d && x.d === d.d)) delete d.n;
    const ds = s.days.map(d => d.d).filter(Boolean);
    if (!s.from && ds.length) Object.assign(s, { from: ds[0], to: ds.at(-1) });
    // (Recorded past its last day: its 延長會 when it has that agenda, else the session ran that long.)
    // (Not one a month past it: a recording put under the wrong session, 羅東's 第16-19次's.)
    if (s.to && ds.at(-1) > s.to && ds.at(-1) <= addDays(s.to, 31)) {
      if (s.agenda.some(a => /延長/.test(a.n))) s.ext = { from: ds.find(d => d > s.to), to: ds.at(-1) };
      else s.to = ds.at(-1);
    }
    for (const i of s.items) delete i.on;
    if (!s.agenda.length) delete s.agenda;
    if (!s.folders.length) delete s.folders;
  }
  const sessions = [...by.values()].sort((a, b) => ((a.from || '') < (b.from || '') ? 1 : (a.from || '') > (b.from || '') ? -1 : b.no - a.no));
  for (const n of notes.slice(0, 12)) console.log(`town ${tc}: ${n}`);
  if (!sessions.length && !people.length) return old;
  return { built, tc, n: site.n, site: site.home, term: site.term, ends: site.ends, people, sessions, news: [] };
}

await mkdir(out, { recursive: true });
const towns = Object.entries(TOWN_SITES);
const first = Math.floor(Date.now() / 86_400e3) % towns.length;
for (const [tc, site] of [...towns.slice(first), ...towns.slice(0, first)]) {
  const started = Date.now();
  try {
    if (late()) throw new Error('out of time: kept as it was');
    const t = await (site.chcg ? chcgTown : town)(tc, site);
    if (!t) {
      console.log(`town ${tc}: nothing (no key, no last copy)`);
      continue;
    }
    try {
      await townPapers(tc, t.sessions);
    } catch (e) {
      console.log(`town ${tc} papers: ${e.message}`);
    }
    await writeFile(`${out}${tc}.json`, JSON.stringify(t));
    console.log(`town ${tc} ${site.n}: ${t.people.length} members, ${t.sessions.length} sessions, ${t.sessions.reduce((n, s) => n + (s.days?.length || 0), 0)} recorded days, ${t.sessions.reduce((n, s) => n + (s.read || 0), 0)} papers read (${t.sessions.reduce((n, s) => n + (s.res || 0), 0)} resolutions, ${t.sessions.reduce((n, s) => n + (s.asks || 0), 0)} questions), ${reads} pages, ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (e) {
    console.log(`town ${tc}: ${e.message}`);
    const old = await prevJson(`council/town/${tc}.json`);
    if (old) {
      await writeFile(`${out}${tc}.json`, JSON.stringify(old));
      await townPapers(tc, old.sessions).catch(() => {});
    }
  }
}
