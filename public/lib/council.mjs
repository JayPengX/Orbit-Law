// 地方議會: the 22 縣市議會 and the 鄉鎮市民代表, from the 地方議會開放 API
// (all.cc.govapi.tw). One place for the build (scripts/build-council.mjs:
// the rows kept small) and the app (a council's page, a bill read live,
// a search, a councillor's bills).

export const CC_API = 'https://all.cc.govapi.tw/api/';

// 臺北市議會 → 臺北市.
export const cityOf = name => String(name || '').replace(/議會$/, '');

const clip = (s, n) => (s = String(s || '').replace(/\s+/g, ' ').trim()).length > n ? `${s.slice(0, n - 1)}…` : s;

// The session a day falls in (or the last one before it, or the next one after it).
export function sessionOn(sessions = [], day) {
  const rows = sessions.map(s => ({ id: s['代碼'] ?? s.id, n: s['會期名稱'] ?? s.n, kind: s['會期類別'] ?? s.kind, from: s['開始日期'] ?? s.from, to: s['結束日期'] ?? s.to ?? '' })).filter(s => s.from);
  const on = rows.find(s => s.from <= day && (!s.to || s.to >= day));
  const next = rows.filter(s => s.from > day).sort((a, b) => (a.from < b.from ? -1 : 1))[0] || null;
  const last = rows.filter(s => s.from <= day).sort((a, b) => (a.from < b.from ? 1 : -1))[0] || null;
  return { on: on || null, next, last };
}

// A council in one line for the index: who, which term, its session now.
export function compactCouncil(o, { day, sessions = [], bills = 0 } = {}) {
  const s = sessionOn(sessions.length ? sessions : o['會期'] ? [o['會期']] : [], day);
  return {
    c: o['代碼'],
    n: o['議會名稱'],
    city: cityOf(o['議會名稱']),
    big: o['議會類別'] === '直轄市議會',
    term: o['屆次'],
    from: o['就職日'] || '',
    head: o['議長姓名'] || '',
    deputy: o['副議長姓名'] || '',
    seats: o['議員人數'] || 0,
    on: s.on,
    next: s.next,
    last: s.last,
    bills
  };
}

// A sitting: its day and time, kind (大會, 委員會, 分組審查…) and what's on.
// A day the council doesn't sit (例假日, 停會) is left out.
export function compactSitting(s) {
  if (s['場次類別'] === '停會' || /^停會|例假日/.test(String(s['議程說明'] || ''))) return null;
  return {
    d: s['日期'],
    t: s['時段'] || '',
    from: s['開始時間'] || '',
    to: s['結束時間'] || '',
    kind: s['場次類別'] || '',
    room: s['委員會名稱'] || '',
    what: clip(s['議程說明'], 400),
    s: s['會期代碼'] || ''
  };
}

// A party as people say it: 無, 無黨籍及未經政黨推薦 → 無黨籍.
export const partyName = p => (!p || /^無($|黨籍)/.test(p) ? '無黨籍' : String(p));

// A councillor in office: name, party, district, title, photo.
export function compactCouncilor(p) {
  if (p['現況'] && p['現況'] !== '在任') return null;
  return {
    n: p['姓名'],
    party: partyName(p['黨籍'] && p['黨籍'] !== '無' ? p['黨籍'] : p['參選政黨']),
    area: String(p['選區別'] || '').replace(/^.+?(第\d+選舉區)$/, '$1'),
    title: /議長/.test(p['職稱'] || '') ? p['職稱'] : '',
    photo: p['照片'] || '',
    id: p['人物代碼'] || ''
  };
}

// What the council decided, in a word: each council writes it its own way
// (照審查意見通過。/ 原案通過 / 送縣府研究辦理 / 存查 / 決議日期：…).
export function outcomeOf(decided, review) {
  const words = [decided, review].map(x => String(x || '').replace(/\s+/g, '')).map(x => (/^(決議大會屆次|決議日期|審查日期)/.test(x) ? '' : x));
  const s = words[0] || words[1];
  if (!s) return '';
  if (/不予|不通過|否決|未通過|不同意/.test(s)) return 'no';
  if (/保留|撤回|退回|另案|暫緩|緩議/.test(s)) return 'held';
  if (/研議|研究|研辦|採納|參考|函轉|轉請|送[^。]*府/.test(s)) return 'sent';
  if (/存查|備查|查照|洽悉|知悉/.test(s)) return 'noted';
  if (/通過|同意|追認|准予|照案|照原|如擬|墊付/.test(s)) return 'yes';
  if (/交付|審查|討論|大會/.test(s)) return 'review';
  return '';
}
export const OUTCOME = {
  yes: ['通過', 'Passed', 'green'],
  no: ['不通過', 'Rejected', 'red'],
  held: ['保留', 'Held', 'orange'],
  sent: ['送政府研辦', 'Sent to the government', 'indigo'],
  noted: ['備查', 'Noted', ''],
  review: ['審查中', 'In review', 'orange']
};

// Who filed it, short: the first name 等 N 人, or the government office.
export function whoOf(by, office) {
  const names = String(by || '').split(/[,、，\s]+/).filter(Boolean);
  if (names.length) return names.length > 1 ? `${names[0]}等${names.length}人` : names[0];
  return String(office || '').trim();
}

// A bill kept small: { id, t: 案由, by, cat: 類別, out, s: 會期代碼, no: 案號 }.
export function compactCouncilBill(b) {
  return {
    id: b['代碼'],
    t: clip(String(b['案由'] || '').replace(/^<[一二三四五六七八九十]+>/, ''), 120),
    by: whoOf(b['提案人'], b['提案單位']),
    gov: !b['提案人'] && Boolean(b['提案單位']),
    cat: String(b['類別'] || '').replace(/^.+委員會-/, ''),
    out: outcomeOf(b['議決'], b['審查意見']),
    s: b['會議代碼'] || '',
    no: String(b['案號'] || ''),
    ...(b['日期'] ? { d: String(b['日期']) } : {})
  };
}

// The newest `n` bills: the latest session first (by its start), then the
// later day, the higher 案號, else the order the council listed them.
export function newestBills(rows, sessions = [], n = 240) {
  const from = new Map(sessions.map(s => [s['代碼'] ?? s.id, s['開始日期'] ?? s.from ?? '']));
  const num = b => Number((String(b.no).match(/\d+/g) || []).pop() || 0);
  return rows
    .map((b, i) => [b, i])
    .sort(([a, i], [b, j]) => ((from.get(b.s) || '') < (from.get(a.s) || '') ? -1 : (from.get(b.s) || '') > (from.get(a.s) || '') ? 1 : (b.d || '') < (a.d || '') ? -1 : (b.d || '') > (a.d || '') ? 1 : num(b) - num(a) || j - i))
    .slice(0, n)
    .map(([b]) => b);
}

// A representative in office (鄉鎮市民代表, 山地原住民區民代表).
export function compactRep(c) {
  return {
    n: c['姓名'],
    city: String(c['縣市'] || ''),
    cc: c['議會代碼'] || '',
    town: c['鄉鎮市區'] || '',
    tc: String(c['鄉鎮市區代碼'] || ''),
    area: String(c['選區別'] || '').replace(/^.+?(第\d+選舉區)$/, '$1'),
    party: partyName(c['其他欄位']?.['推薦之政黨']),
    hill: c['參選職位'] === '山地原住民區民代表'
  };
}
// By county, then township (in 內政部's code order): [{ city, cc, towns: [{ town, tc, hill, reps: [[name, party, area]] }] }].
export function repsByPlace(reps) {
  const cities = new Map();
  for (const r of [...reps].sort((a, b) => (a.tc < b.tc ? -1 : a.tc > b.tc ? 1 : a.area < b.area ? -1 : 1))) {
    if (!cities.has(r.city)) cities.set(r.city, { city: r.city, cc: r.cc, towns: new Map() });
    const towns = cities.get(r.city).towns;
    if (!towns.has(r.town)) towns.set(r.town, { town: r.town, tc: r.tc, hill: r.hill, reps: [] });
    towns.get(r.town).reps.push([r.n, r.party, r.area]);
  }
  return [...cities.values()].map(c => ({ ...c, towns: [...c.towns.values()] }));
}

// The sittings to show: today's and those ahead first, then the latest ones past.
export function sittingsAround(sittings = [], day, past = 6) {
  const ahead = sittings.filter(s => s.d >= day).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.from < b.from ? -1 : 1));
  const gone = sittings.filter(s => s.d < day).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.from < b.from ? 1 : -1));
  return { ahead, gone: gone.slice(0, past) };
}

// A council's state in words: 開會中 (第14屆第8次定期會, to 10/2), 休會中, the next session.
export function councilState(c, day) {
  if (c.on && c.on.from <= day && (!c.on.to || c.on.to >= day)) return { live: true, s: c.on };
  return { live: false, s: c.next || c.last };
}

// The address of a search, a councillor's bills, or one bill, on the API.
export const ccSearch = (code, term, q, limit = 40) => `${CC_API}bills?${new URLSearchParams({ 議會代碼: code, 屆: String(term), q, limit: String(limit) })}`;
export const ccBill = id => `${CC_API}bills/${encodeURIComponent(id)}`;
// A councillor's bills: the full-text search finds the name anywhere; only
// those that list them among the proposers count.
export const theirBills = (rows, name) => rows.filter(b => String(b['提案人'] || '').split(/[,、，\s]+/).includes(name));

// 新竹縣議會 publishes no bills to the API, but lists every 議員提案 on its
// own site (www.hcc.gov.tw/porposal, six a page): read into the API's shape,
// the 連署人 among the 提案人 as other councils list them.
export const HCC = 'https://www.hcc.gov.tw/';
export function hccRows(html) {
  const text = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const rows = [];
  for (const [, ul] of String(html).matchAll(/<ul class="schedule-detail-container__box[^"]*"[^>]*>([\s\S]*?)<\/ul>/g)) {
    const cell = n => text((ul.match(new RegExp(`sch-det0${n}">([\\s\\S]*?)</li>`)) || [])[1]);
    const id = (ul.match(/proposal-detail\?article=(\d+)/) || [])[1];
    const day = cell(1).replace(/^(\d{4})\.(\d{2})\.(\d{2})$/, '$1-$2-$3');
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const by = cell(4), co = cell(5);
    rows.push({ 代碼: `hsq-p${id}`, 日期: day, 類別: cell(2), 案由: cell(3), 提案人: [by, co].filter(Boolean).join('、'), 主提案人: by, 連署人: co, 來源網址: `${HCC}proposal-detail?article=${id}` });
  }
  return rows;
}

// Why a council has no bills to show, in plain words (the API's own note, else a plain one).
export function gapOf(note = '') {
  if (/掃描|OCR|影像/.test(note)) return ['議會只公開掃描的圖檔，沒有文字可以讀，所以這裡沒有提案。', 'The council publishes its records only as scanned images, so there is no text to read.'];
  return ['議會還沒公開本屆提案的資料，所以這裡沒有提案。', 'The council hasn’t published this term’s bills as data.'];
}

// A councillor's recent speeches (質詢, 發言), read from the API's transcripts:
// one row a meeting, newest first, its longest turn as the gist.
export const ccSpeech = (code, name, limit = 120) => `${CC_API}meet_transcripts?${new URLSearchParams({ 議會代碼: code, 姓名: name, sort: '日期>', limit: String(limit) })}`;
export function speechesOf(rows = [], n = 6) {
  const meets = new Map();
  for (const r of rows) {
    // Their own turns, not the chair's (the 議長 presiding is 主席).
    if (!r['發言內容'] || (r['身分類別'] ? r['身分類別'] !== '議員' : !/議員/.test(r['職稱'] || ''))) continue;
    const k = r['會議代碼'] || r['日期'];
    if (!meets.has(k)) meets.set(k, { d: r['日期'] || '', url: '', turns: [] });
    const m = meets.get(k);
    m.url ||= r['來源網址'] || '';
    m.turns.push(r);
  }
  return [...meets.values()]
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
    .slice(0, n)
    .map(m => {
      const turns = m.turns.sort((a, b) => (a['順序'] ?? 0) - (b['順序'] ?? 0));
      const gist = turns.map(t => String(t['發言內容'])).sort((a, b) => b.length - a.length)[0];
      return { d: m.d, url: m.url, n: turns.length, t: clip(gist, 160) };
    });
}
