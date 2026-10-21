// 立法院 beyond the bills: who voted how (記名表決), each legislator's record
// (proposed bills, co-signs, votes, speech clips, attendance) and where the
// central government budget (中央政府總預算案) stands. Data from the g0v
// 立法院 API (v2.ly.govapi.tw). One place for the build (scripts/build-ly.mjs)
// and the app.

const FULL = /[０-９]/g;
const half = s => String(s || '').replace(FULL, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
const pad = n => String(n).padStart(2, '0');
const okDay = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return y > 1990 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

// A vote's day, YYYY-MM-DD. 表決時間 is loose text (中華民國113年11月8日,
// 中華民國年3月20日 with no year, 2025年1月21日, 中華民国2025年…): its month
// and day pick one of the meeting's days (`days`, from the 議程 and the
// meeting), else its own year if it has one, else the meeting's first day,
// else `fallback` (the 公報's publishing day).
export function voteDate(text, days = [], fallback = '') {
  const s = half(text).replace(/\s+/g, '');
  const m = s.match(/(\d{0,4})年(\d{1,2})月(\d{1,2})日/);
  const known = [...new Set(days.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (m) {
    let y = m[1] ? Number(m[1]) : 0;
    if (y && y < 1000) y += 1911;
    const md = `${pad(m[2])}-${pad(m[3])}`;
    const same = known.filter(d => d.slice(5) === md);
    if (same.length) return same.find(d => Number(d.slice(0, 4)) === y) || same[0];
    if (y && okDay(y, Number(m[2]), Number(m[3]))) return `${y}-${md}`;
    // No year: the meeting's (or the 公報's) year, a year back if that lands after it.
    const ref = known[0] || fallback;
    if (ref) {
      let ry = Number(ref.slice(0, 4));
      if (`${ry}-${md}` > (known[known.length - 1] || ref)) ry--;
      if (okDay(ry, Number(m[2]), Number(m[3]))) return `${ry}-${md}`;
    }
  }
  return known[0] || fallback || '';
}

// A name as a key: no spaces (鄭天財Sra Kacaw and 鄭天財SraKacaw are one).
export const nameKey = n => String(n || '').replace(/\s+/g, '');

// The names index votes point into: the roster first (in its order), then
// anyone a vote names who isn't on it. → { names, idx: key → position }.
export function nameIndex(roster, rows = []) {
  const names = [];
  const idx = new Map();
  const add = n => {
    const k = nameKey(n);
    if (k && !idx.has(k)) idx.set(k, names.push(String(n).trim()) - 1);
  };
  roster.forEach(add);
  for (const r of rows) for (const f of ['贊成', '反對', '棄權']) [].concat(r[f] || []).forEach(add);
  return { names, idx };
}

// One 記名表決 made small: [id, date, title, agenda_id, yes[], no[], abstain[], pcodes[]]
// (yes/no/abstain: positions in the names index).
export function compactVote(row, idx, date = '', pcodes = []) {
  const who = f => [].concat(Array.isArray(row[f]) ? row[f] : []).map(n => idx.get(nameKey(n))).filter(i => i >= 0);
  const title = String(row['表決議題'] || '').replace(/\s+/g, ' ').trim();
  return [row['表決代碼'] || '', date, title, row.agenda_id || '', who('贊成'), who('反對'), who('棄權'), pcodes];
}

// Newest first: by day, then by 表決代碼 (公報, then line), both descending.
export const byNewest = (a, b) => (a[1] !== b[1] ? (a[1] < b[1] ? 1 : -1) : a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0);

// The 公報 page a vote (or an agenda) is in: 1151901_00002_717 → 115卷19期1冊.
export function gazetteUrl(id) {
  const m = String(id || '').match(/^(\d{3})(\d{2,3})(\d{2})_/);
  return m ? `https://ppg.ly.gov.tw/ppg/publications/official-gazettes/${m[1]}/${m[2]}/${m[3]}/details` : '';
}

// The laws a text names, as pcodes, each once: at every place, the longest
// name `names` (law name → pcode, refs.mjs nameMap) knows, then past it.
export function lawsIn(text, names = new Map(), maxName = 40) {
  const s = String(text || '');
  const out = [];
  for (let i = 0; i < s.length; ) {
    let hit = '';
    for (let k = Math.min(maxName, s.length - i); k >= 2 && !hit; k--) if (names.has(s.slice(i, i + k))) hit = s.slice(i, i + k);
    if (hit) {
      const p = names.get(hit);
      if (p && !out.includes(p)) out.push(p);
      i += hit.length;
    } else i++;
  }
  return out;
}

// One legislator's votes, from votes.json (kept there once, not per person):
// [[vote position, 'y'|'n'|'a'|'-']] newest first; '-' = in office that day
// but not voting. `from`/`to`: their days in office (YYYY-MM-DD, '' = open).
export function personVotes(data, name, { from = '', to = '' } = {}) {
  const i = data.names.findIndex(n => nameKey(n) === nameKey(name));
  const out = [];
  data.votes.forEach((v, j) => {
    const how = i < 0 ? '' : v[4].includes(i) ? 'y' : v[5].includes(i) ? 'n' : v[6].includes(i) ? 'a' : '';
    if (how) out.push([j, how]);
    else if ((!from || v[1] >= from) && (!to || v[1] <= to)) out.push([j, '-']);
  });
  return out;
}

// Each name's count of votes cast: Map position → n.
export function voteCounts(votes) {
  const n = new Map();
  for (const v of votes) for (const i of [...v[4], ...v[5], ...v[6]]) n.set(i, (n.get(i) || 0) + 1);
  return n;
}

// A bill on a legislator's page: [id, 提案日期, title, 議案狀態].
export function billRow(b) {
  const t = String(b['議案名稱'] || '').replace(/^「(.+)」，請審議案。$/, '$1').replace(/，請審議案。$/, '').replace(/^「(.+)」案。$/, '$1');
  return [b['議案編號'] || '', b['提案日期'] || '', t, b['議案狀態'] || ''];
}

// A speech clip (IVOD 影片種類 Clip): [date, where (委員會 or 院會), IVOD_ID,
// start HH:MM:SS, seconds]. The page: ivodUrl(id).
export function clipRow(c) {
  const m = c['會議資料'] || {};
  const where = [].concat(m['委員會代碼:str'] || []).join('、') || m['種類'] || '';
  const start = String(c['開始時間'] || '').match(/T(\d{2}:\d{2}:\d{2})/);
  return [c['日期'] || '', where, c.IVOD_ID || 0, start ? start[1] : '', c['影片長度'] || 0];
}
export const ivodUrl = id => `https://ivod.ly.gov.tw/Play/Clip/1M/${id}`;

const byDate = i => (a, b) => (a[i] < b[i] ? 1 : a[i] > b[i] ? -1 : 0);
export const newestFirst = (rows, i = 1) => [...rows].sort(byDate(i));

// ---- Budget ----

// Which budget a bill belongs to: '115' (115年度 總預算, its 追加預算 too, with
// a suffix) or a 特別預算's name; '' for none.
export function budgetKey(title) {
  const t = String(title || '').replace(/\s+/g, '');
  const special = t.match(/「?(中央政府[^「」]*?特別預算)(?:案)?/);
  const year = t.match(/(\d{2,3})年度?中央政府總預算(追加預算)?/);
  // A 總預算 that carries a 特別預算 in the same bill (114年度 總預算 及 前瞻第5期) goes with the 總預算.
  if (year) return year[2] ? `${year[1]}追加` : year[1];
  return special ? special[1] : '';
}

// A budget bill's role: main (行政院's bill, one per committee), report
// (審查報告 / 審查總報告), errata (勘誤表), reserve (第二預備金), other.
export function budgetRole(b) {
  const t = String(b['議案名稱'] || '');
  if (/勘誤/.test(t)) return 'errata';
  if (/第二預備金/.test(t)) return 'reserve';
  if (/審查(總)?報告|報告審查/.test(t)) return 'report';
  if (/^「.*(總預算|特別預算).*」/.test(t) && /行政院/.test(b['提案單位/提案委員'] || '')) return 'main';
  return 'other';
}

// The committee a main bill went to (its first step: 排入院會 (交經濟委員會)).
const committeeOf = b => {
  for (const f of b['議案流程'] || []) {
    const m = String(f['狀態'] || '').match(/交(.+?委員會)/);
    if (m) return m[1];
  }
  return '';
};

// Where one budget stands, in words: 三讀 when its 審查總報告 passed, else how
// many committee bills finished, else the floor's last step.
export function budgetStage(bills) {
  const reports = bills.filter(b => b.role === 'report');
  const mains = bills.filter(b => b.role === 'main');
  const passed = [...reports, ...mains].filter(b => /三讀/.test(b.st));
  if (passed.length) return { stage: '三讀', done: passed.map(b => b.u).sort().pop() };
  if (reports.length) return { stage: '審查總報告' };
  const done = mains.filter(b => /審查完畢/.test(b.st)).length;
  if (done) return { stage: '委員會審查', done: `${done}/${mains.length}` };
  if (mains.some(b => /交付審查/.test(b.st))) return { stage: '交付審查' };
  return { stage: mains.length ? '排入院會' : '' };
}

// The term's budget bills by budget, newest first: [{ k, title, stage,
// first, last, flow: [[date, status]] (the master bill's), bills: [[id, role,
// committee, status, 提案日期, 最新進度日期, title]], votes: [vote ids] }].
// `votes`: [[vote id, its words (議題 and 案由)]].
export function budgetGroups(rows, votes = []) {
  const groups = new Map();
  for (const r of rows) {
    let k = budgetKey(r['議案名稱']);
    if (!k) continue;
    // 第二預備金動支數額表: a report on last years' spending, a list of its own
    // (it would drive the year's stage and dates otherwise).
    if (budgetRole(r) === 'reserve') k += '預備金';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ r, role: budgetRole(r), st: r['議案狀態'] || '', u: r['最新進度日期'] || r['提案日期'] || '' });
  }
  return [...groups].map(([k, list]) => {
    const reserve = k.match(/^(\d+)預備金$/);
    const longest = xs => [...xs].sort((a, b) => (b.r['議案流程'] || []).length - (a.r['議案流程'] || []).length)[0];
    const mains = list.filter(b => b.role === 'main');
    // The master: the one marked 中央政府總預算流程, else the main with the
    // longest flow, else (a budget sent in an earlier term) its 審查報告's.
    const master = mains.find(b => b.st === '中央政府總預算流程') || longest(mains) || longest(list.filter(b => b.role === 'report')) || list[0];
    // Its steps: the master's (less the bare 中央政府總預算流程 marker), then
    // the 審查總報告's filing and the day it first passed 三讀.
    const flow = (master.r['議案流程'] || []).map(f => [[].concat(f['日期'] || [])[0] || '', String(f['狀態'] || '')]).filter(f => f[1] !== '中央政府總預算流程');
    const reports = list.filter(b => b.role === 'report');
    const filed = reports.map(b => b.r['提案日期']).filter(Boolean).sort()[0];
    if (filed && !reserve) flow.push([filed, '審查總報告']);
    const passed = list.filter(b => (b.role === 'report' || b.role === 'main') && /三讀/.test(b.st)).map(b => b.u).filter(Boolean).sort()[0];
    if (passed && !flow.some(f => /三讀/.test(f[1]))) flow.push([passed, '三讀']);
    flow.sort((a, b) => (a[0] && b[0] && a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : 0));
    // Its dates: the budget's own bills' (a 勘誤表's letters don't move it).
    const own = list.filter(b => b.role !== 'errata');
    const days = (own.length ? own : list).flatMap(b => [b.r['提案日期'], b.u]).filter(Boolean).sort();
    const year = k.match(/^(\d+)(追加)?$/);
    const title = reserve ? `${reserve[1]}年度第二預備金動支數額表` : year ? `${year[1]}年度中央政府總預算${year[2] ? '追加預算' : ''}案` : `${k}案`;
    const words = year ? [`${year[1]}年度`, year[2] ? '追加預算' : '總預算'] : [k.replace(/^中央政府/, '').replace(/特別預算$/, '')];
    return {
      k,
      title,
      ...(reserve ? { stage: (list[0].st || '').replace(/\(.*$/, '') } : budgetStage(list)),
      first: days[0] || '',
      last: days[days.length - 1] || '',
      flow,
      bills: newestFirst(list.map(b => [b.r['議案編號'], b.role, b.role === 'main' ? committeeOf(b.r) : '', b.st, b.r['提案日期'] || '', b.u, billRow(b.r)[2]]), 5),
      votes: reserve ? [] : votes.filter(([, t]) => /預算/.test(t) && words.every(w => t.includes(w)) && (!year || Boolean(year[2]) === /追加/.test(t))).map(v => v[0])
    };
  }).sort((a, b) => (a.last < b.last ? 1 : -1));
}

// A followed legislator's doings, newest first, for 我的: the bills they
// proposed, their 質詢 (one per meeting a day, its minutes added up) and
// how they voted on whole bills (全案). → [{ k: 'bill'|'clip'|'vote', d, … }]
export function personFeed(x, votes = null) {
  const out = [];
  for (const b of x.bills || []) out.push({ k: 'bill', d: b[1], id: b[0], t: b[2], s: b[3] || '' });
  const clips = new Map();
  for (const c of x.clips || []) {
    const key = `${c[0]}|${c[1]}`;
    const was = clips.get(key);
    if (was) was.sec += c[4] || 0;
    else clips.set(key, { k: 'clip', d: c[0], t: c[1] || '', id: c[2], sec: c[4] || 0 });
  }
  out.push(...clips.values());
  if (votes) for (const [j, m] of personVotes(votes, x.n, x)) if (m !== '-' && /全案/.test(votes.votes[j][2])) out.push({ k: 'vote', d: votes.votes[j][1], j, m });
  return out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
}
// How many of them came after the day this device last looked.
export const feedNew = (feed, seen) => (seen ? feed.filter(e => e.d > seen).length : 0);
