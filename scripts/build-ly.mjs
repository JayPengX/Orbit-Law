// The 立法院 build: 記名表決 (who voted how), a page per legislator (bills
// proposed, co-signs, speech clips, attendance) and the 中央政府總預算案's
// progress, from the g0v 立法院 API (v2.ly.govapi.tw), for the current term.
// Writes public/data/ly/. About 30 requests, one at a time, a few minutes at
// most. Never fails the deploy: whatever can't be fetched today is carried
// over from the last deploy's copy.
// Runs after build-data.mjs (reads public/data/index.json for law names, if there).
//   node scripts/build-ly.mjs [--prev https://jaypengx.github.io/Orbit-Law/data/] [--term 11]
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { nameMap } from '../public/lib/refs.mjs';
import { hash } from '../public/lib/bills.mjs';
import { compactMeet, twNow } from '../public/lib/agenda.mjs';
import { voteDate, nameKey, nameIndex, compactVote, byNewest, lawsIn, voteCounts, billRow, clipRow, newestFirst, budgetGroups } from '../public/lib/ly.mjs';
import { args, sleep, prevJson } from './lib.mjs';

const API = 'https://v2.ly.govapi.tw/';
const out = new URL('../public/data/ly/', import.meta.url).pathname;
const WINDOW = 10000; // the API's page*limit ceiling (past it: 413)
const started = Date.now();
const notes = [];


// One page, politely: a pause before each, three tries with a growing wait.
async function get(path, query = {}, fields = []) {
  const q = new URLSearchParams(query);
  for (const f of fields) q.append('output_fields', f);
  for (let tries = 0; ; tries++) {
    await sleep(300);
    try {
      const r = await fetch(`${API}${path}?${q}`, { signal: AbortSignal.timeout(90_000) });
      if (r.status === 413) throw Object.assign(new Error(`${path} 413 (page past ${WINDOW})`), { final: true });
      if (!r.ok) throw new Error(`${path} ${r.status}`);
      return await r.json();
    } catch (e) {
      if (e.final || tries >= 2) throw e;
      await sleep(5000 * (tries + 1));
    }
  }
}

// Every row of a query. Past the API's window, one 會期 at a time (when the
// endpoint filters by it).
async function all(path, key, query, fields, { limit = 1000, bySession = false } = {}) {
  const first = await get(path, { ...query, limit: String(limit), page: '1' }, fields);
  if ((first.total || 0) > WINDOW && bySession && !query['會期']) {
    const rows = [];
    for (let s = 1; s <= 12; s++) rows.push(...(await all(path, key, { ...query, 會期: String(s) }, fields, { limit })));
    return rows;
  }
  const rows = [...(first[key] || [])];
  const pages = Math.min(first.total_page || 1, Math.floor(WINDOW / limit));
  for (let page = 2; page <= pages; page++) rows.push(...((await get(path, { ...query, limit: String(limit), page: String(page) }, fields))[key] || []));
  if ((first.total || 0) > rows.length) notes.push(`${path} ${JSON.stringify(query)}: ${rows.length} of ${first.total}`);
  return rows;
}

// A step that may fail: logged, null back (an empty list counts as failed).
async function step(name, fn) {
  try {
    const r = await fn();
    if (Array.isArray(r) && !r.length) throw new Error('nothing back');
    return r;
  } catch (e) {
    notes.push(`${name} failed: ${e.message}`);
    console.warn(`ly ${name}: ${e.message}`);
    return null;
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out + 'person', { recursive: true });
const write = (path, data) => writeFile(out + path, JSON.stringify(data));
const built = new Date().toISOString();

// The term: given, else the newest bill's.
const term = args.term || String((await step('term', () => get('bills', { limit: '1' }, ['屆'])))?.bills?.[0]?.['屆'] || '');

// Law names (for votes → laws), from build-data's index if it ran.
let names = new Map();
try {
  names = nameMap(JSON.parse(await readFile(new URL('../public/data/index.json', import.meta.url), 'utf8')).laws);
} catch {
  notes.push('no index.json: votes not matched to laws');
}

let roster = null, votes = null, meets = null, agendas = null, gazettes = null, bills = null, clips = null, budget = null;
if (term) {
  const T = { 屆: term };
  roster = await step('legislators', () => all('legislators', 'legislators', T, ['委員姓名', '黨籍', '黨團', '選區名稱', '照片位址', '歷屆立法委員編號', '到職日', '是否離職', '離職日期'], { limit: 300 }));
  votes = await step('votes', () => all('votes', 'votes', T, ['表決代碼', '會議代碼', '公報文件代碼', '表決時間', '表決議題', '贊成', '反對', '棄權', 'agenda_id']));
  meets = await step('meets', () => all('meets', 'meets', T, ['會議代碼', '會議種類', '日期', '會議資料.出席委員'], { bySession: true }));
  agendas = await step('agendas', () => all('gazette_agendas', 'gazetteagendas', T, ['公報議程編號', '會議日期', '案由'], { limit: 2000 }));
  gazettes = await step('gazettes', () => all('gazettes', 'gazettes', {}, ['公報編號', '發布日期'], { limit: 5000 }));
  bills = await step('bills', () => all('bills', 'bills', { ...T, 提案來源: '委員提案' }, ['議案編號', '議案名稱', '提案人', '連署人', '提案日期', '議案狀態'], { limit: 2500, bySession: true }));
  clips = await step('clips', async () => {
    const rows = [];
    // One 會期 at a time (a term has 20k+ clips); stop after two empty ones.
    for (let s = 1, empty = 0; s <= 12 && empty < 2; s++) {
      const r = await all('ivods', 'ivods', { ...T, 會期: String(s), 影片種類: 'Clip' }, ['IVOD_ID', '日期', '委員名稱', '會議資料', '開始時間', '影片長度'], { limit: 2500 });
      rows.push(...r);
      empty = r.length ? 0 : empty + 1;
    }
    return rows;
  });
  budget = await step('budget', () => all('bills', 'bills', { ...T, 議案類別: '中央政府總預算案' }, ['議案編號', '議案名稱', '提案單位/提案委員', '議案狀態', '提案日期', '最新進度日期', '議案流程'], { limit: 500 }));
} else notes.push('no term: everything carried over');

// ---- Votes ----
const voteData = votes ? await step('votes build', () => {
  const meetDays = new Map((meets || []).map(m => [m['會議代碼'], [].concat(m['日期'] || [])]));
  const agendaOf = new Map((agendas || []).map(a => [a['公報議程編號'], a]));
  const pubDay = new Map((gazettes || []).map(g => [g['公報編號'], g['發布日期'] || '']));
  const { names: who, idx } = nameIndex((roster || []).map(r => r['委員姓名']), votes);
  const used = {};
  const rows = votes.filter(v => v['表決代碼']).map(v => {
    const a = agendaOf.get(v.agenda_id);
    const days = [...[].concat(a?.['會議日期'] || []), ...(meetDays.get(v['會議代碼']) || [])];
    const date = voteDate(v['表決時間'], days, pubDay.get(String(v['公報文件代碼'] || '').slice(0, 7)) || '');
    const subject = String(a?.['案由'] || '').replace(/\s+/g, '');
    if (a) used[v.agenda_id] = subject.slice(0, 120);
    return compactVote(v, idx, date, lawsIn(`${v['表決議題'] || ''} ${subject}`, names));
  }).sort(byNewest);
  return { term, built, names: who, votes: rows, agendas: used };
}) : null;

// ---- People ----
const people = roster ? await step('people build', async () => {
  const count = (list, f) => {
    const n = new Map();
    for (const b of list || []) for (const x of [].concat(b[f] || [])) n.set(nameKey(x), (n.get(nameKey(x)) || 0) + 1);
    return n;
  };
  const proposed = new Map();
  for (const b of bills || []) for (const x of [].concat(b['提案人'] || [])) proposed.set(nameKey(x), [...(proposed.get(nameKey(x)) || []), b]);
  const cosigns = count(bills, '連署人');
  const clipsOf = new Map();
  for (const c of clips || []) for (const x of [].concat(c['委員名稱'] || [])) clipsOf.set(nameKey(x), [...(clipsOf.get(nameKey(x)) || []), c]);
  // Attendance: meetings whose 出席委員 names them; 院會 apart (of those that list anyone).
  const attended = new Map(), plenary = new Map();
  let plenaryTotal = 0;
  for (const m of meets || []) {
    const present = new Set((m['會議資料'] || []).flatMap(d => [].concat(d['出席委員'] || [])).map(nameKey));
    const floor = m['會議種類'] === '院會';
    if (floor && present.size) plenaryTotal++;
    for (const k of present) {
      attended.set(k, (attended.get(k) || 0) + 1);
      if (floor) plenary.set(k, (plenary.get(k) || 0) + 1);
    }
  }
  const voted = voteData ? voteCounts(voteData.votes) : new Map();
  const day = s => String(s || '').replaceAll('/', '-');
  const people = [];
  for (const r of roster) {
    const n = String(r['委員姓名'] || '').trim();
    const k = nameKey(n);
    // The file's name: 立法院's own number, else (a newcomer without one yet) a hash of the name.
    const id = r['歷屆立法委員編號'] || `n${hash(k)}`;
    const mine = newestFirst((proposed.get(k) || []).map(billRow));
    const myClips = newestFirst((clipsOf.get(k) || []).map(clipRow), 0);
    const party = r['黨籍'] || '';
    // The 黨團 they sit in, when not their party's (an independent in the 國民黨 caucus).
    const caucus = r['黨團'] && r['黨團'] !== party ? { caucus: r['黨團'] } : {};
    const base = { n, id, party, ...caucus, area: r['選區名稱'] || '', from: day(r['到職日']), to: r['是否離職'] === '是' ? day(r['離職日期']) : '' };
    const person = { ...base, term, built, bills: mine.slice(0, 200), cosign: cosigns.get(k) || 0, clips: myClips.slice(0, 200), attend: meets ? { meets: attended.get(k) || 0, plenary: [plenary.get(k) || 0, plenaryTotal] } : null };
    // A part that failed today: the last deploy's.
    if (!bills || !clips || !meets) {
      const old = await prevJson(`ly/person/${id}.json`);
      if (old) {
        if (!bills) Object.assign(person, { bills: old.bills, cosign: old.cosign });
        if (!clips) person.clips = old.clips;
        if (!meets) person.attend = old.attend;
      }
    }
    await write(`person/${id}.json`, person);
    const vi = voteData?.names.findIndex(x => nameKey(x) === k) ?? -1;
    people.push({ ...base, photo: r['照片位址'] || '', counts: { bills: bills ? mine.length : person.bills?.length || 0, cosign: person.cosign, votes: voted.get(vi) || 0, clips: clips ? myClips.length : person.clips?.length || 0, meets: person.attend?.meets || 0 } });
  }
  return people;
}) : null;

// ---- Budget ----
const budgetData = budget ? await step('budget build', () => {
  const words = voteData ? voteData.votes.map(v => [v[0], `${v[2]} ${voteData.agendas[v[3]] || ''}`]) : [];
  return { term, built, budgets: budgetGroups(budget, words) };
}) : null;

// ---- Agenda: the meetings from three days back on (what's live: live-ly.mjs) ----
const agenda = await step('agenda', async () => {
  const since = twNow(new Date(Date.now() - 3 * 864e5)).day;
  const rows = [];
  for (let page = 1; page <= 4; page++) {
    const r = await get('meets', { limit: '100', page: String(page) });
    rows.push(...(r.meets || []));
    if (!(r.meets || []).length || (r.meets || []).every(m => [].concat(m['日期'] || []).every(d => d < since))) break;
  }
  return rows.map(compactMeet).filter(m => m.days.some(d => d.d >= since));
});
// ---- Write, or carry over ----
async function carry(path) {
  const old = await prevJson('ly/' + path);
  if (old) await write(path, old);
  else notes.push(`${path}: nothing to carry over`);
  return old;
}
if (voteData) await write('votes.json', voteData);
else await carry('votes.json');
if (budgetData) await write('budget.json', budgetData);
else await carry('budget.json');
if (agenda) await write('agenda.json', { built, meets: agenda });
else await carry('agenda.json');
if (people) await write('people.json', { term, built, people });
else {
  const old = await carry('people.json');
  for (const p of old?.people || []) await carry(`person/${p.id}.json`);
}

const secs = Math.round((Date.now() - started) / 1000);
console.log(`ly: term ${term || '?'}, ${people?.length ?? 'carried'} legislators, ${voteData?.votes.length ?? 'carried'} votes, ${budgetData?.budgets.length ?? 'carried'} budgets, ${agenda?.length ?? 'carried'} meetings, ${bills?.length ?? '-'} bills, ${clips?.length ?? '-'} clips, ${secs}s`);
for (const n of notes) console.log(`ly note: ${n}`);
