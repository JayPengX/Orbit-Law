// 會議紀錄變表格 (Jay 11-10, the AI plan; Law brings every source in, formatted): a 代表會's minutes, read
// from their PDF at build (scripts/build-town.mjs), into rows by code: each sitting (its day, hours, chair, who
// came, what it did) and each proposal (its number, kind, who proposed it, 案由, the result and any vote). Fifteen
// councils write them fifteen ways; what code can't split (a long transcript whose decisions are in the chair's
// words) goes to the AI door once (Orbit-Core law-ai.js `law-minutes`), with `digest`: only the lines that carry
// a proposal or a decision, never the speeches.
export const RESULTS = ['通過', '修正通過', '保留', '不通過', '撤回', '退回', '擇日再議', '未議決'];

const NUM = '[0-9０-９一二三四五六七八九十百]+';
const roc = (y, m, d) => `${+y + 1911}-${String(+m).padStart(2, '0')}-${String(+d).padStart(2, '0')}`;
const tight = s => String(s || '').replace(/\s+/g, '').replace(/[：:。，,；;]+$/, '');
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
// 十二 → 12, ３ → 3, 12 → 12.
export function numOf(s) {
  const t = String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/^\d+$/.test(t)) return +t;
  let n = 0, d = 0;
  for (const c of t) {
    if (c === '百') (n += (d || 1) * 100), (d = 0);
    else if (c === '十') (n += (d || 1) * 10), (d = 0);
    else if (c in CN) d = CN[c];
  }
  return n + d || null;
}

// A decision in the minutes' words → one of RESULTS ('' none).
export function resultOf(s) {
  const t = tight(s);
  if (!t) return '';
  if (/撤回|撤案/.test(t)) return '撤回';
  if (/退回/.test(t)) return '退回';
  if (/不予?通過|否決|不同意|不予(審議|照准)/.test(t)) return '不通過';
  if (/修正(後)?通過|修正如|酌予修正/.test(t)) return '修正通過';
  if (/保留/.test(t)) return '保留';
  if (/擇日|延期|另定期|下次會/.test(t)) return '擇日再議';
  if (/通過|照案|照辦|同意|准予|准如所請|照審查意見/.test(t)) return '通過';
  return '';
}
// The phrases a chair decides in, the last one in a proposal's part wins.
const DECIDE = /(照原案通過|照案通過|照審查意見通過|審查意見通過|修正通過|保留|不予通過|不通過|撤回|退回|擇日(?:再)?(?:議決|審議|討論|再議)|(?:這|本|此)(?:一)?(?:件|案)(?:就)?(?:讓它)?通過|准予通過|同意通過|三讀通過)/g;

// A proposal's header and fields, from the text before and after its 案由.
const LABELS = ['類\\s*別', '提\\s*案\\s*人', '提案單位', '動\\s*議\\s*人', '附\\s*議\\s*人', '連\\s*署\\s*人', '附\\s*署\\s*人', '案\\s*由', '理\\s*由', '說\\s*明', '辦\\s*法', '審查意見', '大會議決', '議\\s*決', '決\\s*議', '附\\s*件', '編\\s*號', '號\\s*別', '案\\s*號'];
const LABEL = `(?:${LABELS.join('|')})`;
// Where a 案由 ends: the next label, or a speaker's line (王秘書世集：).
const WHAT_END = new RegExp(`(?:${LABELS.filter(l => !l.startsWith('案')).join('|')})\\s*[：:]|\\n\\s*[㐀-鿿]{2,8}\\s*[：:]`);
const NO = new RegExp(`((?:鎮長|鄉長|市長|公所|代表會|代表|主席團)?(?:提案)?第\\s*${NUM}\\s*號(?:議案|提案|案)?|[甲乙丙]字第\\s*${NUM}\\s*號|臨時動議第?\\s*${NUM}\\s*(?:號|案)?)`, 'g');
const field = (s, re) => {
  const m = String(s).match(re);
  return m ? tight(m[1]) : '';
};
// Who: 鄉長蔣煙燈 → 蔣煙燈; 林庚壬鎮長 → 林庚壬; 本會全體代表 kept as said.
const ROLE = /^(?:埤頭)?(?:鄉長|鎮長|市長|主席|副主席|代表|議員)|(?:鄉長|鎮長|市長|主席|副主席|代表|議員)$/g;
export const whoOf = s =>
  String(s || '')
    .split(/[、,，及]/)
    .map(x => tight(x).replace(/^(?:彰化縣|新竹縣)?\S{0,4}(?:鄉|鎮|市)公所$/, m => m))
    .map(x => (/全體/.test(x) ? x : x.replace(ROLE, '')))
    .filter(x => x && x.length <= 12)
    .join('、');

// Each 案由 in the text and what's around it: { at, no, kind, by, co, what, rest } (rest: up to the next one).
function proposals(text) {
  const t = String(text);
  const marks = [...t.matchAll(/案\s*由\s*[：:]/g)].map(m => m.index);
  // Each one's header: the lines just before its 案由 (back to the last 案由, 260 characters at most), from the
  // line with its number (else the last three lines).
  const heads = marks.map((at, i) => {
    const from = Math.max(i ? marks[i - 1] : 0, at - 260);
    const head = t.slice(from, at);
    const lastNo = [...head.matchAll(NO)].pop();
    const lines = head.split('\n');
    const start = lastNo ? head.lastIndexOf('\n', lastNo.index) + 1 : Math.max(0, head.length - lines.slice(-3).join('\n').length);
    return { start: from + start, no: lastNo ? tight(lastNo[1]) : '' };
  });
  const out = [];
  marks.forEach((at, i) => {
    const head = t.slice(heads[i].start, at);
    // (Its part runs to the next one's header.)
    const body = t.slice(at, i + 1 < marks.length ? Math.max(at + 4, heads[i + 1].start) : t.length);
    // The 案由 itself: to the next label or a speaker's line.
    const start = body.search(/[：:]/) + 1;
    const stop = body.slice(start).search(WHAT_END);
    let what = tight(body.slice(start, stop < 0 ? Math.min(body.length, start + 300) : start + stop)).replace(/^(為|有關|關於)[：:，,]/, '$1');
    // (One sentence: what follows its 。 is the clerk going on, where the PDF lost the speaker's line.)
    if (what.indexOf('。') >= 8) what = what.slice(0, what.indexOf('。'));
    what = what.replace(/[：:]/g, '，').replace(/[，,。]+$/, '');
    const bare = what.replace(/[，,]?(?:敬請|惠請|提請|請)(?:貴會)?(?:惠予|予以)?(?:審議|公決|核議|同意|准予|鑒核|追認)[^。，,]*$/, '');
    if (bare.length >= 8) what = bare;
    out.push({ at, no: heads[i].no, head, body, what });
  });
  return out;
}

// The sittings' days, where the text says them: [{ at, d }].
function sittingDays(text, year = 0) {
  const out = [];
  for (const m of String(text).matchAll(/(?:^|\n)\s*(?:[一二三四五六七八九十]+、)?(?:時\s*間|開會時間|開會日期|日\s*期|報到日期)\s*[：:]\s*(?:中華)?(?:民國)?\s*(1\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) out.push({ at: m.index, d: roc(m[1], m[2], m[3]) });
  for (const m of String(text).matchAll(/(?:^|\n)\s*(\d{1,2})月(\d{1,2})日\s*[（(]星期.[)）]\s*[：:]/g)) {
    const y = year || +(out[0]?.d.slice(0, 4) || 0) - 1911;
    if (y > 0) out.push({ at: m.index, d: roc(y, m[1], m[2]) });
  }
  return out.sort((a, b) => a.at - b.at);
}

// The proposals, read: [{ no, kind, by, co, what, result, note, vote, d }].
export function proposalRows(text) {
  const t = String(text || '');
  const days = sittingDays(t);
  const rows = [];
  for (const p of proposals(t)) {
    const all = p.head + p.body;
    const kind0 = field(all, /類\s*別\s*[：:]\s*([^\s，,。：:]{1,10}?)(?=提\s*案|案\s*由|動\s*議|\s|，|,|。|：|$)/).replace(/(類|課|室|所)$/, '');
    const kind = /提案|單位|案由|編號/.test(kind0) ? '' : kind0;
    const by = whoOf(field(all, /(?:提\s*案\s*人|動\s*議\s*人)\s*[：:]\s*([^\n。]{1,40}?)(?=\s*(?:連\s*署|附\s*議|附\s*署|案\s*由|類\s*別|\n|，|。|$))/) || field(all, /提案單位\s*[：:]\s*([^\n。]{1,30}?)(?=\s*(?:連\s*署|提\s*案\s*人|案\s*由|\n|$))/));
    const co = whoOf(field(all, /(?:連\s*署\s*人|附\s*議\s*人|附\s*署\s*人)\s*[：:]\s*([^\n。]{1,80}?)(?=\s*(?:案\s*由|類\s*別|\n|$))/));
    // The result: a 議決 line first (大會議決 over 審查意見), else the chair's last word on it.
    const body = p.body;
    let said = field(body, /大會議決\s*[：:]\s*([^\n。]{1,40})/) || field(body, /(?:^|\n)\s*(?:議\s*決|決\s*議)\s*[：:]\s*([^\n。]{1,40})/);
    let result = resultOf(said);
    if (result === '通過' && /照審查意見/.test(said)) {
      const review = field(body, /審查意見\s*[：:]\s*([^\n。]{1,40})/);
      if (resultOf(review) === '修正通過') (result = '修正通過'), (said = review);
    }
    if (!result) {
      const words = [...body.matchAll(DECIDE)].pop();
      result = words ? resultOf(words[1]) || '通過' : '';
      said = words ? words[1] : '';
    }
    const v = body.match(/贊成\s*(\d+)\s*(?:票|人|位)?[^。\n]{0,12}?反對\s*(\d+)\s*(?:票|人|位)?/);
    const at = p.at + (body.search(DECIDE) >= 0 ? body.search(DECIDE) : 0);
    const d = [...days].reverse().find(x => x.at < at)?.d || '';
    const note = result === '修正通過' ? field(said, /修正(?:後)?通過[，,：:]?(.{0,30})/) : '';
    if (!p.what || p.what.length < 4) continue;
    rows.push({ no: p.no.replace(/\s/g, ''), kind, by, co, what: p.what.length > 120 ? `${p.what.slice(0, 118)}…` : p.what, result: result || '未議決', note, vote: v ? `贊成 ${v[1]}、反對 ${v[2]}` : '', d });
  }
  // The same proposal twice (read out in the transcript, then in the 議決 appendix): one row, the one that says the result.
  const out = [];
  for (const r of rows) {
    const key = r.what.slice(0, 16);
    const i = out.findIndex(x => x.what.slice(0, 16) === key);
    if (i < 0) out.push(r);
    else if (out[i].result === '未議決' || (r.vote && !out[i].vote)) out[i] = { ...out[i], ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) };
  }
  return out;
}

// Short minutes, a sitting at a time (竹北's: 第一次會議, 時間, 地點, 出席, 主席, 報告事項, 討論事項, 散會):
// [{ n, d, from, to, chair, att, done: [{ what, result }] }]. [] when the text isn't shaped so.
export function sittingRows(text) {
  const t = String(text || '');
  const parts = t.split(/\n(?=(?:延長會)?第[一二三四五六七八九十]+次會議\s*\n|會次[一二三四五六七八九十\d]+[：:]|◎?\s*第\s*\d+\s*次會議[：:])/);
  const out = [];
  for (const part of parts) {
    const n = (part.match(/^((?:延長會)?第[一二三四五六七八九十]+次會議|會次[一二三四五六七八九十\d]+|◎?\s*第\s*\d+\s*次會議)/) || [])[1];
    const when = part.match(/時\s*間\s*[：:]\s*(?:中華)?(?:民國)?\s*(1\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(上午|下午)?\s*(\d{1,2})?\s*(?:時|:|：)?\s*(\d{1,2})?/);
    if (!n || !when) continue;
    const clock = (ap, h, m) => (h ? `${String(+h + (ap === '下午' && +h < 12 ? 12 : 0)).padStart(2, '0')}:${String(+m || 0).padStart(2, '0')}` : '');
    const end = part.match(/散\s*會\s*[：:]\s*(上午|下午)?\s*(\d{1,2})\s*時\s*(\d{1,2})?/);
    const att = (part.match(/(?:^|\n)\s*出\s*席(?:代表)?\s*[：:]\s*([^\n]+(?:\n(?![㐀-鿿]{2,4}\s*[：:])[^\n]+)*)/) || [])[1] || '';
    const counted = att.match(/共\s*(\d+)\s*人/);
    const names = att.split(/[、,，\s]+|[（(][一二三四五六七八九十]+[)）]/).filter(x => /^[㐀-鿿]{2,4}$/.test(x.replace(/^(主席|副主席|代表)/, '')));
    // What it did: the lines under 預備會議, 報告事項, 討論事項 (each item its own), with a result where one is said.
    const done = [];
    const body = part.slice(part.search(/(?:報告事項|討論事項|預備會議|議事紀要|議程)\s*[：:]/) >= 0 ? part.search(/(?:報告事項|討論事項|預備會議|議事紀要|議程)\s*[：:]/) : part.length);
    const SPEAKER = /^[㐀-鿿]{1,3}(?:主席|副主席|秘書|代表|課長|鄉長|鎮長|市長|主任|隊長|所長|園長|司儀|組員)[㐀-鿿]{0,3}\s*[：:]/;
    for (const raw of body.split('\n')) {
      // (A transcript's speeches and proposals are the other table's: the sitting keeps its short items only.)
      if (/案\s*由|號\s*別|編\s*號/.test(raw) || done.length >= 8) break;
      if (SPEAKER.test(raw.trim()) || raw.trim().length > 80) continue;
      let l = raw.trim().replace(/^(?:報告事項|討論事項|預備會議|議事紀要|議程)\s*[：:]\s*/, '').replace(/^(?:[一二三四五六七八九十]+、|\d+[.、]|○\d)\s*/, '');
      if (!l || /^(散\s*會|主\s*席|紀\s*錄|出\s*席|列\s*席|地\s*點|時\s*間|開幕式|行禮如儀|市公所各單位工作報告[：:]?$)/.test(l) || /法定開會人數|宣[告布]開議|^秘書報告/.test(l)) continue;
      l = l.replace(/[（(](?:另錄|略)[)）]/g, '').replace(/[：:]$/, '');
      if (l.length < 3) continue;
      const res = (l.match(/[（(【]([^（()）【】]*?(?:通過|續審|保留|擇日|撤回|不通過)[^（()）【】]*)[)）】]/) || [])[1] || '';
      done.push({ what: l.replace(/[（(【][^（()）【】]*(?:通過|續審|保留|擇日|撤回)[^（()）【】]*[)）】]/g, '').replace(/[。.]$/, ''), ...(res ? { result: res.replace(/^大會議決[:：]?/, '') } : {}) });
    }
    out.push({ n: n.replace(/^◎\s*/, '').replace(/\s/g, ''), d: roc(when[1], when[2], when[3]), from: clock(when[4], when[5], when[6]), to: end ? clock(end[1], end[2], end[3]) : '', chair: whoOf(field(part, /主\s*席\s*[：:]\s*([^\n]{1,12})/).replace(/^.主席(.+)$/, (m, a) => m[0] + a)), att: counted ? +counted[1] : names.length || 0, done });
  }
  return out;
}

// The rows of one paper of minutes: { sits, items } (either may be empty), and whether code read it well
// enough (`good`), else the AI door gets its `digest`.
export function minutesOf(text) {
  const sits = sittingRows(text);
  const items = proposalRows(text);
  const decided = items.filter(r => r.result !== '未議決').length;
  // (Proposals mentioned with no 案由 at all: 乙字第1至第7號案 in a short minute, decided in its 決議案 paper.)
  const asks = (String(text).match(/案\s*由/g) || []).length;
  const good = (items.length > 0 && decided / items.length >= 0.7) || (!asks && sits.length > 0) || (!asks && String(text).length < 1500);
  return { sits, items, good };
}

// What the AI reads of a long transcript: the lines that carry a proposal (its number, fields and 案由) or a
// decision (議決, a vote, the chair's 通過), and the sitting headers with their days; never the speeches.
const KEEP = new RegExp(`${LABEL}\\s*[：:]|提案|臨時動議|第\\s*${NUM}\\s*號|表決|贊成|反對|通過|保留|撤回|退回|擇日|會議紀錄|會議記錄|議事錄|(?:時\\s*間|開會日期|日\\s*期)\\s*[：:]|月\\d{1,2}日\\s*[（(]星期`);
export function digest(text, max = 38_000) {
  const lines = String(text || '').split('\n');
  const out = [];
  let follow = 0;
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (KEEP.test(t)) {
      out.push(t.length > 400 ? `${t.slice(0, 398)}…` : t);
      // (A 案由 or 說明 runs on: its next lines too, until the next label.)
      follow = /案\s*由\s*[：:]/.test(t) ? 3 : 0;
    } else if (follow > 0 && !/^[㐀-鿿]{2,8}\s*[：:]/.test(t)) {
      out.push(t);
      follow--;
    } else follow = 0;
  }
  let s = out.join('\n');
  if (s.length > max) s = s.slice(0, max);
  return s;
}
