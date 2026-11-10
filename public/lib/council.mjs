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
  // 高雄's carry their dates on lines of their own (決議日期：…, 審查日期：…): the rest is the decision.
  const words = [decided, review].map(x => String(x || '').split(/\n/).filter(l => !/^\s*(決議大會屆次|決議日期|審查日期|決議\/交付日期)\s*[：:]/.test(l)).join('').replace(/\s+/g, ''));
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
  // A session the API doesn't list yet (a council's own site is ahead) starts on the bill's own day.
  const start = b => from.get(b.s) || b.d || '';
  return rows
    .map((b, i) => [b, i])
    .sort(([a, i], [b, j]) => (start(b) < start(a) ? -1 : start(b) > start(a) ? 1 : (b.d || '') < (a.d || '') ? -1 : (b.d || '') > (a.d || '') ? 1 : num(b) - num(a) || j - i))
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

// 新竹市議會's own list (www.hsinchu-cc.gov.tw/TC/proposal.aspx, ten a page):
// the API holds only one session of this term. Its 案號 is the id, its
// session's name finds the session, its day is in 民國 years.
export const HSINCHU_CITY = 'https://www.hsinchu-cc.gov.tw/';
export function hszRows(html, term = 11) {
  const text = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const rows = [];
  for (const [, ul] of String(html).matchAll(/<ul[^>]*class="proposal-information-content__box01[^"]*"[^>]*>([\s\S]*?)<\/ul>/g)) {
    const cell = n => text((ul.match(new RegExp(`proposal-li0${n}[^"]*">([\\s\\S]*?)</li>`)) || [])[1]);
    const no = cell(3);
    const [, y, m, d] = cell(4).match(/^(\d{2,3})-(\d{1,2})-(\d{1,2})$/) || [];
    if (!no || !y) continue;
    const pdf = (ul.match(/href="([^"]+\.pdf)"/i) || [])[1];
    const by = cell(6), co = cell(7);
    rows.push({ 代碼: `hsz-p${no}`, 案號: no, 日期: `${Number(y) + 1911}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, 類別: (no.match(/^(.+?類)/) || [])[1] || '', 案由: cell(5), 提案人: [by, co].filter(Boolean).join('、'), 主提案人: by, 連署人: co, 會期名稱: `第${term}屆${cell(2)}`, 來源網址: pdf ? new URL(pdf, HSINCHU_CITY).href : `${HSINCHU_CITY}TC/proposal.aspx?mid=42` });
  }
  return rows;
}

// 花蓮縣議會's search (proposal_data_search1|2|4.php, one POST a kind for a
// whole term): each bill a table of label and value, its 大會決議 too.
export const HUALIEN = 'https://www.hlcc.gov.tw/';
const tag = s => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const hashOf = s => {
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
};
export function hlcRows(html, kind = 2) {
  const rows = [], seen = new Set();
  for (const [, table] of String(html).matchAll(/<table width="90%"[^>]*>([\s\S]*?)<\/table>/g)) {
    const f = {};
    for (const [, k, v] of table.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)) f[tag(k).replace(/\s+/g, '')] = tag(v);
    const what = f['案由'], when = f['決議日期'] || '';
    if (!what || !/^\d{4}-\d{2}-\d{2}$/.test(when)) continue;
    const [, cat = '', no = ''] = (f['類別案號'] || '').match(/^(.*?)\s*(?:[(（][^)）]*[)）])?\s*案號\s*(\S*)$/) || [];
    const by = f['提案人'] || '', co = f['連署人'] || '';
    const session = (f['會別'] || '').replace(/\s+/g, '');
    const id = `hua-p${hashOf([session, f['類別案號'], f['議案分類'], what.slice(0, 60)].join('|'))}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pdf = (table.match(/href="([^"]+\.pdf)"/i) || [])[1];
    rows.push({
      代碼: id,
      案號: no,
      日期: when,
      類別: (cat.match(/財政|保安|農業|教育|建設|民政|交通|社會|衛生|環保|觀光/) || [cat.trim()])[0],
      案由: what,
      ...(by ? { 提案人: [by, co].filter(Boolean).join('、'), 主提案人: by, 連署人: co } : { 提案單位: f['提案單位'] || '' }),
      審查意見: f['審查意見'] || '',
      議決: f['大會決議'] || '',
      會期名稱: session,
      來源網址: pdf ? new URL(pdf, HUALIEN).href : `${HUALIEN}proposal_data_search${kind}.php`
    });
  }
  return rows;
}

// 彰化縣議會 (www.chcc.gov.tw/council): its term's sessions with a count and a list
// for each kind (2 議員, 3 縣府, 4 臨時動議, 5 議長), lists ten a page with the
// 案由 cut short, and each bill's page whole.
export const CHANGHUA = 'https://www.chcc.gov.tw/council/';
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const cnNum = t => (/^\d+$/.test(t) ? Number(t) : t.split('十').length === 2 ? (CN[t.split('十')[0]] || 1) * 10 + (CN[t.split('十')[1]] || 0) : CN[t] || 0);
// 第二十屆 第7次 定期會 → 第20屆第7次定期會, the API's way.
export const chaSession = t => String(t || '').replace(/\s+/g, '').replace(/第([一二三四五六七八九十\d]+)屆/, (_, n) => `第${cnNum(n)}屆`);
export function chaCounts(html) {
  const out = [];
  for (const [, li] of String(html).matchAll(/<li>\s*<span data-th="會期：[^>]*>([\s\S]*?)<\/li>/g)) {
    const name = tag(li.split('</span>')[0]);
    for (const [, iid, tid, kind, n] of li.matchAll(/List2\.aspx\?Parser=99,7,47,+(\d+),,(\d+),,,,,,(\d)">(\d+)</g)) out.push({ name, iid, tid, kind: Number(kind), n: Number(n) });
  }
  return out;
}
export function chaListRows(html) {
  const head = tag((String(html).match(/彰化縣議會(第[^<]*?)\s*&nbsp;/) || [])[1] || '');
  const rows = [];
  for (const [, li] of String(html).matchAll(/<li>\s*(<span data-th="案號：[\s\S]*?)<\/li>/g)) {
    const cell = k => tag((li.match(new RegExp(`data-th="${k}："[^>]*>([\\s\\S]*?)</span>`)) || [])[1]);
    const id = (li.match(/Details\.aspx\?Parser=99,7,47,,,,(\d+)/) || [])[1];
    if (!id) continue;
    rows.push({ 代碼: `cha-p${id}`, 案號: cell('案號'), 類別: cell('委員會別'), 案由: cell('案由'), 議決: cell('大會決議'), 提案人: cell('提案人'), 會期名稱: chaSession(head), 來源網址: `${CHANGHUA}Details.aspx?Parser=99,7,47,,,,${id}` });
  }
  return rows;
}
export function chaDetail(html) {
  const f = {};
  for (const [, k, v] of String(html).matchAll(/<span class="tabulation_tt[^"]*">([\s\S]*?)<\/span>\s*<span class="tabulation_word[^"]*">([\s\S]*?)<\/span>/g)) f[tag(k).replace(/\s+/g, '')] = tag(v);
  if (f['連署人']) f['連署人'] = f['連署人'].split(/[\n、,，\s]+/).filter(Boolean).join('、');
  return f;
}
// Its 議事日程's sessions (not 程序委員會), with their days, in the API's shape.
export function chaSessions(html) {
  const out = [];
  for (const [, li] of String(html).matchAll(/<li>\s*(<span data-th="會　　期：[\s\S]*?)<\/li>/g)) {
    const name = chaSession(tag((li.match(/data-th="會　　期："[^>]*>([\s\S]*?)<\/span>/) || [])[1]));
    const day = k => ((li.match(new RegExp(`data-th="${k}："[^>]*>\\s*(\\d{4})年(\\d{2})月(\\d{2})日`)) || []).slice(1).join('-'));
    const kind = (name.match(/(定期會|臨時會)$/) || [])[1];
    if (!kind || !day('開始日期')) continue;
    const no = (name.match(/第(\d+)[次、]/) || [])[1];
    out.push({ 代碼: `cha-${(name.match(/第(\d+)屆/) || [])[1]}-${kind === '定期會' ? 'r' : 'e'}${no}`, 會期名稱: name, 會期類別: kind, 開始日期: day('開始日期'), 結束日期: day('結束日期') });
  }
  return out;
}

// Bills read back out of a council's 議事錄 as the API holds it (its
// transcripts: the 程序文字 and 其他 rows carry each bill's 案號, 提案人, 案由,
// 審查意見 and 大會決議; where the minutes don't, the chair's next words say how
// it went, 報告結果：知悉). For councils whose bills the API hasn't drawn out
// (金門's whole term) or not lately (新北, 連江, 屏東). `sessions` places a
// meeting without its session code by its day.
const LABEL = '(?:提案人|連署人|提案單位|提案機關|案由|說明|辦法|理由|審查意見|大會決議|決議)[:：]';
export function transcriptBills(code, rows, sessions = []) {
  const byMeet = new Map();
  for (const r of rows) (byMeet.get(r['會議代碼']) || byMeet.set(r['會議代碼'], []).get(r['會議代碼'])).push(r);
  const inSession = d => sessions.find(x => (x['開始日期'] ?? x.from) <= d && d <= ((x['結束日期'] ?? x.to) || d))?.['代碼'] ?? sessions.find(x => (x['開始日期'] ?? x.from) <= d && d <= ((x['結束日期'] ?? x.to) || d))?.id;
  const out = new Map();
  for (const [meet, rs] of byMeet) {
    rs.sort((a, b) => (a['順序'] ?? 0) - (b['順序'] ?? 0));
    // One text a meeting; the chair's lines marked so they're never read as the minutes'.
    const text = rs.map(r => (r['身分類別'] === '主席' ? `〔主席〕${String(r['發言內容'] || '').replace(/\n/g, ' ')}` : String(r['發言內容'] || ''))).join('\n');
    const at = [...text.matchAll(/案由[:：]/g)].map(x => x.index).filter(i => !/〔主席〕[^\n]*$/.test(text.slice(Math.max(0, i - 200), i)));
    const starts = at.map(i => {
      const back = text.slice(Math.max(0, i - 160), i);
      const h = back.search(/(?:第\s*\d+\s*案|提案人[:：]|提案單位[:：])(?![\s\S]*(?:第\s*\d+\s*案|提案人[:：]|提案單位[:：]))/);
      return h >= 0 && !/[。\n]/.test(back.slice(h)) ? i - back.length + h : i;
    });
    const first = rs[0];
    // A meeting outside every listed session (the API's list lags) keeps its day alone.
    const session = first['會期代碼'] || inSession(first['日期']) || '';
    starts.forEach((st, k) => {
      const chunk = text.slice(st, starts[k + 1] ?? text.length);
      const minutes = chunk.split('\n').filter(l => !l.startsWith('〔主席〕')).join('\n');
      const f = l => (minutes.match(new RegExp(`${l}[:：]\\s*([\\s\\S]*?)(?=${LABEL}|\\n|$)`)) || [])[1]?.trim() || '';
      const what = f('案由').replace(/\.{3,}|…+$/, '').trim();
      if (what.length < 6) return;
      const said = (minutes.match(/(?:大會決議|決議)[:：]\s*([^。\n]*。?)/) || [])[1] || '';
      // The chair's first words after it, if they decide it.
      const chair = chunk.split('\n').slice(1, 4).find(l => l.startsWith('〔主席〕') && /報告結果|決議|通過|知悉|保留|擱置|研辦|研議|不予/.test(l)) || '';
      const decided = said || chair.replace(/^〔主席〕/, '').replace(/^.*?(?:報告結果|決議)[:：]/, '').replace(/(繼續|來|好)[，。、]?.*$/, '').trim();
      const by = f('提案人'), co = f('連署人'), unit = f('提案單位') || f('提案機關');
      const no = (chunk.match(/^第\s*(\d+)\s*案/) || [])[1] || '';
      const key = `${session}|${no}|${what.slice(0, 18)}`;
      const row = {
        代碼: `${code}-p${hashOf(key)}`,
        案號: no,
        日期: first['日期'] || '',
        案由: what.slice(0, 400),
        ...(by ? { 提案人: [by, co].filter(Boolean).join('、'), 主提案人: by, 連署人: co } : unit ? { 提案單位: unit } : {}),
        審查意見: (minutes.match(/審查意見[:：]\s*([^。\n]*。?)/) || [])[1] || '',
        議決: decided,
        會議代碼: session,
        會議: meet
      };
      const had = out.get(key);
      // The same bill read twice (a 讀會 and its minutes): the fuller one stays.
      if (!had || (row['議決'] && !had['議決']) || (row['案由'].length > had['案由'].length && !(had['議決'] && !row['議決']))) out.set(key, { ...had, ...row, 議決: row['議決'] || had?.['議決'] || '' });
    });
  }
  return [...out.values()];
}

// 苗栗縣議會 (www.mcc.gov.tw, not the mlcc.gov.tw that doesn't exist): each
// meeting's record (會議記錄) is a page of PDFs with text: the meeting itself
// (府/議 第 N 號案, 案由, 大會決議) and its 臨時動議 (動-N, 動議人, 附議人,
// 案題, 決議). Read with pdftotext at the build.
export const MIAOLI = 'https://www.mcc.gov.tw/';
export function mccList(html) {
  return [...String(html).matchAll(/<span class="tdbb">(\d{4}-\d{2}-\d{2})<\/span>[\s\S]*?circulated_id=(\d+)" title="([^"]+)"/g)].map(([, d, id, title]) => ({ id: Number(id), d, title: title.trim() }));
}
export function mccFiles(html) {
  return [...String(html).matchAll(/href="(admin\/upload\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)].map(([, u, t]) => ({ url: MIAOLI + u, name: tag(t) }));
}
const flat = s => String(s || '').replace(/\s+/g, '');
// 張副議長淑芬 → 張淑芬: a councillor's own name, without the post.
const bare = x => x.replace(/\s+/g, '').replace(/^(.)(?:副議長|議長|議員)(.+)$/, '$1$2');
const names = s => String(s || '').split(/[、,，\n]+/).map(bare).filter(Boolean);
// The text of one record's files → its bills. `at`: { id, d, title } from the list.
export function mccBills(files, at) {
  const session = (at.title.match(/^(第\d+屆第[\d、]+次(?:定期會|臨時會))/) || [])[1] || '';
  const rows = [];
  for (const { name, text, url } of files) {
    const body = String(text || '').replace(/\n\s*\d{1,3}\s*\n/g, '\n');
    if (/臨時動議/.test(name)) {
      for (const [, n, chunk] of body.matchAll(/動\s*-\s*(\d+)\s*\n([\s\S]*?)(?=\n\s*(?:苗栗縣議會第[^\n]*臨時動議案\s*\n)?動\s*-\s*\d+\s*\n|$)/g)) {
        const f = flat(chunk);
        const by = names((f.match(/動議人[:：](.*?)附議人/) || [])[1]).join('、');
        const co = names((chunk.match(/附議人[:：]([\s\S]*?)\n\s*案\s*\n?\s*題/) || [])[1]);
        const what = (f.match(/案題[:：](.*?)(?:理由[:：]|辦法[:：]|決議[:：]|$)/) || [])[1] || '';
        if (!what) continue;
        rows.push({ 代碼: `mia-p${at.id}-m${n}`, 案號: `動-${n}`, 日期: at.d, 類別: '臨時動議', 案由: what.slice(0, 400), ...(by ? { 提案人: [by, ...co].join('、'), 主提案人: by, 連署人: co.join('、') } : {}), 議決: (f.match(/決議[:：](.*?。)/) || [])[1] || '', 會期名稱: session, 來源網址: url });
      }
    } else if (!/追認/.test(name)) {
      for (const [, who, n, chunk] of body.matchAll(/(府|議)第\s*(\d+)\s*號案\s*\n\s*案由[:：]([\s\S]*?)(?=(?:府|議)第\s*\d+\s*號案\s*\n\s*案由[:：]|$)/g)) {
        const f = flat(chunk);
        const what = (f.match(/^(.*?)(?:審查會|說明[:：]|辦法[:：]|理由[:：]|大會決議|主席[(（]|$)/) || [])[1] || '';
        if (!what) continue;
        rows.push({ 代碼: `mia-p${at.id}-${who === '府' ? 'g' : 'c'}${n}`, 案號: `${who}第${n}號`, 日期: at.d, 案由: what.slice(0, 400), ...(who === '府' ? { 提案單位: '苗栗縣政府' } : {}), 審查意見: (f.match(/審查會(?:聯席會議)?決議[:：](.*?。)/) || [])[1] || '', 議決: (f.match(/大會決議[:：](.*?。)/) || [])[1] || '', 會期名稱: session, 來源網址: url });
      }
    }
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
