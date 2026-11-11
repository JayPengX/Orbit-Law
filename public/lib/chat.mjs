// 問法律: the proxy's /law-chat finds what a question needs across this
// site's data (every law and regulation, 行政規則, judgments and 釋字, bills,
// legislators, votes, meetings, 政府公告, and what the reader follows) and
// answers from that only, applied to the reader's facts, each point citing
// an article ('p:key'), a judgment (its id) or a rule (its id). The app keeps
// the conversation (its last 8 questions and answers) and shows what the answer cites as chips
// that open it in the app.
import { ASK_URL } from './ask.mjs';

export const CHAT_URL = ASK_URL.replace(/law-ask$/, 'law-chat');
export const MAX_CHAT_Q = 500;
export const MAX_TURNS = 16;

const CITE = /^[A-Z]\d{7}:\d{1,4}(-\d{1,3})?$/;
// A 司法院 judgment id (TPSV,114,台上,2031,20260514,1), a 釋字 or 憲判字 (s748, j111-10), a rule's id (教育部:FL001).
export const JID = /^([A-Z]{3,5},\d{2,3},[^,\s]{1,12},\d{1,6},\d{8},\d{1,3}|s\d{1,4}|j\d{3}-\d{1,3})$/u;
const RULE = /^[\p{L}\p{N}_-]{2,12}:[\p{L}\p{N}_.-]{1,40}$/u;
const list = (x, n) => (Array.isArray(x) ? x.slice(0, n) : []);
const str = x => (typeof x === 'string' ? x.trim() : '');

// The answer made safe to draw: points and consequences keep only cites in
// the right shape, and only those among the answer's own sources.
export function cleanChat(j) {
  const sources = list(j?.sources, 20).filter(s => s && CITE.test(`${s.p}:${s.key}`)).map(s => ({ p: s.p, n: str(s.n), key: String(s.key) }));
  const cases = list(j?.cases, 6).filter(x => x && JID.test(String(x.jid || ''))).map(x => ({ jid: String(x.jid), d: str(x.d || ''), t: str(x.t || ''), no: str(x.no || '') }));
  const rules = list(j?.rules, 6).filter(x => x && RULE.test(String(x.id || '')) && str(x.n)).map(x => ({ id: String(x.id), n: str(x.n), agency: str(x.agency || ''), d: str(x.d || ''), url: /^https:\/\//.test(x.url) ? x.url : '', text: x.text === true, dir: x.dir === 'local' ? 'local' : 'agency' }));
  // The councils and 代表會 it drew on: a council's bills (cc:<id>) and a 代表會's rows (tw:<tc>:<n>).
  const local = localOf(j?.local);
  const known = new Set([...sources.map(s => `${s.p}:${s.key}`), ...cases.map(x => x.jid), ...rules.map(x => x.id), ...(local?.councils.flatMap(c => [...c.bills.map(b => `cc:${b.id}`), ...c.talks.map(x => `cq:${x.id}`)]) || []), ...(local?.towns.flatMap(t => t.rows.map(r => r.id)) || [])]);
  // Grounded in what isn't an article (notices, bills, legislators…): points without cites stand too.
  const grounded = ['notices', 'bills', 'people', 'votes', 'meets', 'cases', 'rules'].some(k => Array.isArray(j?.[k]) && j[k].length > 0) || Boolean(local);
  const cited = arr => list(arr, 8).map(pt => ({ text: str(pt?.text), cites: list(pt?.cites, 6).map(String).filter(c => known.has(c)) })).filter(pt => pt.text && (pt.cites.length || grounded));
  const points = cited(j?.points);
  return {
    covered: j?.covered === true && (points.length > 0 || (grounded && Boolean(str(j?.answer || j?.verdict)))),
    // The answer at a glance: a short verdict, key facts as tiles, a timeline for progress.
    verdict: str(j?.verdict || '').slice(0, 60),
    facts: list(j?.facts, 4).map(f => ({ k: str(f?.k).slice(0, 16), v: str(f?.v).slice(0, 20) })).filter(f => f.k && f.v),
    timeline: list(j?.timeline, 6).map(x => ({ d: str(x?.d).slice(0, 20), t: str(x?.t).slice(0, 30) })).filter(x => x.t),
    answer: str(j?.answer),
    points,
    consequences: cited(j?.consequences),
    agency: str(j?.agency || ''),
    next: list(j?.next, 4).map(str).filter(Boolean),
    followups: list(j?.followups, 3).map(str).filter(Boolean),
    sources,
    // 政府公告 and 立法院 bills the answer drew on (links out, or a bill sheet).
    notices: list(j?.notices, 6).filter(x => x && /^https:\/\//.test(x.url) && str(x.t)).map(x => ({ t: str(x.t), url: x.url, d: str(x.d || ''), agency: str(x.agency || '') })),
    bills: list(j?.bills, 6).filter(x => x && /^(\d+:\w+|budget:[\p{L}\p{N}]{1,60})$/u.test(String(x.k || ''))).map(x => ({ k: String(x.k), n: str(x.n), stage: Number(x.stage) || 0, ...(str(x.d || '') ? { d: str(x.d).slice(0, 20) } : {}) })),
    // Judgments and 釋字, 行政規則, legislators, votes and meetings it drew on (each opens in the app).
    cases,
    rules,
    people: list(j?.people, 3).filter(x => x && /^\d{1,6}$/.test(String(x.id)) && str(x.n)).map(x => ({ id: String(x.id), n: str(x.n), party: str(x.party || '') })),
    votes: list(j?.votes, 6).filter(x => x && typeof x.id === 'string' && x.id.length <= 40 && str(x.t)).map(x => ({ id: x.id, d: str(x.d || ''), t: str(x.t) })),
    meets: list(j?.meets, 3).filter(x => x && typeof x.id === 'string' && x.id.length <= 80 && str(x.t)).map(x => ({ id: x.id, t: str(x.t), d: str(x.d || '') })),
    ...(local ? { local } : {}),
    left: Number.isFinite(j?.left) ? j.left : null
  };
}

// A council's or 代表會's part of an answer, checked: { councils: [{ c, n, people, bills }], towns: [{ tc, n, rows }] }; null when none.
const CC = /^[a-z]{3}$/, TC = /^\d{8}$/;
function localOf(l) {
  if (!l || typeof l !== 'object') return null;
  const councils = list(l.councils, 2)
    .filter(c => c && CC.test(String(c.c)) && str(c.n))
    .map(c => ({ c: c.c, n: str(c.n), people: list(c.people, 3).filter(p => p && str(p.n)).map(p => ({ id: String(p.id || ''), n: str(p.n) })), bills: list(c.bills, 6).filter(b => b && typeof b.id === 'string' && b.id.length <= 60 && str(b.t)).map(b => ({ id: b.id, t: str(b.t), by: str(b.by || ''), res: str(b.res || ''), d: str(b.d || '') })), talks: list(c.talks, 4).filter(x => x && typeof x.id === 'string' && x.id.length <= 60 && str(x.who) && str(x.t)).map(x => ({ id: x.id, who: str(x.who), d: str(x.d || ''), t: str(x.t) })) }));
  const towns = list(l.towns, 2)
    .filter(t => t && TC.test(String(t.tc)) && str(t.n))
    .map(t => ({ tc: t.tc, n: str(t.n), rows: list(t.rows, 8).filter(r => r && /^tw:\d{8}:\d{1,2}$/.test(String(r.id)) && str(r.t)).map(r => ({ id: r.id, k: str(r.k || ''), s: str(r.s || ''), t: str(r.t), by: str(r.by || ''), r: str(r.r || '') })) }));
  return councils.length || towns.length ? { councils, towns } : null;
}

// An answer as a follow-up sends it back: its verdict, its answer, its facts
// and its points (the reasoning a next question builds on: 「那機車呢？」 needs
// the penalty the last answer gave), at most 700 characters; the cites apart.
export function answerText(r) {
  const lines = [str(r?.verdict), str(r?.answer)];
  const facts = list(r?.facts, 4).map(f => (str(f?.k) && str(f?.v) ? `${str(f.k)}：${str(f.v)}` : '')).filter(Boolean);
  if (facts.length) lines.push(facts.join('；'));
  for (const p of [...list(r?.points, 5), ...list(r?.consequences, 3)]) lines.push(`・${str(p?.text)}`);
  return lines.filter(x => x && x !== '・').join('\n').slice(0, 700);
}
export const answerCites = r => [...list(r?.points, 6), ...list(r?.consequences, 6)].flatMap(p => list(p?.cites, 12));

// The turns sent back with a follow-up: the last MAX_TURNS, text cut short.
export const historyOf = turns => turns.slice(-MAX_TURNS).map(t => ({ role: t.role, text: String(t.text).slice(0, 1500), ...(t.cites?.length ? { cites: [...new Set(t.cites.filter(c => CITE.test(c)))].slice(0, 12) } : {}) }));

// What the reader follows and marked (store.mjs's mine), as the proxy reads it:
// used only when a question asks about their own (我追蹤的…).
export const mineOf = m => ({
  laws: Object.keys(m?.laws || {}).slice(0, 8),
  items: Object.keys(m?.items || {}).slice(0, 8),
  people: Object.keys(m?.people || {}).slice(0, 8),
  marks: (m?.marks || []).map(x => `${x.p}:${x.k}`).filter(c => CITE.test(c)).slice(0, 8)
});

// Streamed: the proxy sends a line as each step starts ({ stage: 'find' |
// 'found' | 'write' }), heard by onStage, then the answer's line with its
// status. A plain JSON answer (an error, an older proxy) reads the same.
export async function chatLaw({ q, history = [], pin = [], mine = null, lang = 'zh', city = [] }, { fetcher = globalThis.fetch, headers = {}, onStage = () => {} } = {}) {
  let r;
  try {
    r = await fetcher(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain', ...headers }, body: JSON.stringify({ q: String(q).trim().slice(0, MAX_CHAT_Q), history: historyOf(history), pin: pin.slice(0, 2), ...(mine ? { mine } : {}), ...(city.length ? { city: city.slice(0, 3) } : {}), lang, stream: true }) });
  } catch {
    // (No connection only when the phone says so: a slow or failed answer from the server isn't the person's internet.)
    return { error: globalThis.navigator?.onLine === false ? 'offline' : 'failed' };
  }
  let j = {};
  let status = r.status;
  if (/ndjson/.test(r.headers?.get?.('content-type') || '') && r.body?.getReader) {
    const last = await readLines(r.body, o => (typeof o.stage === 'string' ? onStage(o) : null)).catch(() => null);
    if (!last) return { error: 'offline' };
    ({ status = 502, ...j } = last);
  } else j = await r.json().catch(() => ({}));
  // A route not there yet: the proxy's own 404 ({ error: { code } }, or none).
  if (status === 404 && typeof j.error !== 'string') return { error: 'soon' };
  if (status < 200 || status > 299) return { error: typeof j.error === 'string' ? j.error : `http${status}`, left: j.left };
  if (typeof j.covered !== 'boolean') return { error: 'bad' };
  return cleanChat(j);
}

// NDJSON lines, each to `each`; the last line that isn't a stage is the answer.
async function readLines(body, each) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let last = null;
  const take = l => {
    if (!l.trim()) return;
    const o = JSON.parse(l);
    if (typeof o.stage === 'string') each(o);
    else last = o;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    lines.forEach(take);
  }
  take(buf + dec.decode());
  return last;
}

// What the waiting bubble says at each step: what it is really looking at
// (Jay 2026-10-27: it said 找條文 all along while it read a legislator's
// record or a budget). found.look: what comes after the articles; write:
// what the answer rests on.
const LOOK = {
  budget: ['預算進度', 'the budget'],
  bills: ['立法院進度', 'the bills'],
  news: ['政府公告', 'government notices'],
  people: ['立委的提案與表決', 'the legislator’s record'],
  ly: ['立法院的資料', 'the Legislative Yuan’s records'],
  cases: ['判決與規定', 'rulings and rules']
};
const joinZh = l => (l.length > 1 ? `${l.slice(0, -1).join('、')}和${l.at(-1)}` : l[0] || '');
const joinEn = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l[0] || '');
export function stageText(o, en = false) {
  if (o?.stage === 'found') {
    const look = (Array.isArray(o.look) ? o.look : ['cases']).filter(k => LOOK[k]).map(k => LOOK[k][en ? 1 : 0]);
    if (en) return `${o.arts ? `${o.arts} articles found; ` : ''}checking ${joinEn(look) || 'more'}…`;
    return `${o.arts ? `找到 ${o.arts} 條條文，` : ''}查${joinZh(look) || '相關資料'}…`;
  }
  if (o?.stage === 'draft') return en ? 'Adding the reasons and sources…' : '整理理由與依據…';
  if (o?.stage === 'write') {
    const people = Array.isArray(o.people) ? o.people.slice(0, 2) : [];
    const what = [
      o.budgets ? [`預算`, 'the budget'] : null,
      people.length ? [`${people.join('、')}的紀錄`, `${people.join(' and ')}’s record`] : null,
      o.bills ? [`${o.bills} 件法案`, `${o.bills} bills`] : null,
      o.arts ? [`${o.arts} 條條文`, `${o.arts} articles`] : null,
      o.cases ? [`${o.cases} 件判決`, `${o.cases} rulings`] : null,
      o.rules ? [`${o.rules} 個規定`, `${o.rules} rules`] : null
    ].filter(Boolean).slice(0, 3);
    if (!what.length) return en ? 'Writing the answer…' : '撰寫回答中…';
    return en ? `Writing from ${joinEn(what.map(x => x[1]))}…` : `依${joinZh(what.map(x => x[0]))}撰寫回答…`;
  }
  return en ? 'Working out where to look…' : '理解問題，找相關資料…';
}

// The reader's city (their 地方法規 only, since a city's rules bind only who
// lives there): the one they picked in 問法律 (localStorage 'law.city'; ''
// = none), else the counties of their places the family apps share (home,
// work, school: the kit's dayoff.mjs).
export const CITIES = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
const CITY_KEY = 'law.city';
export function readCity(store = globalThis.localStorage) {
  try {
    const v = store?.getItem(CITY_KEY);
    return v == null ? null : CITIES.includes(v) ? v : '';
  } catch {
    return null;
  }
}
export function saveCity(city, store = globalThis.localStorage) {
  try {
    store?.setItem(CITY_KEY, CITIES.includes(city) ? city : '');
  } catch {}
}
// The cities sent with a question: the picked one, else the places' counties (at most 3).
export function citiesOf(picked, places = []) {
  if (picked != null) return picked ? [picked] : [];
  const tai = s => String(s || '').replace(/台/g, '臺');
  return [...new Set(places.map(p => tai(p?.county)).filter(c => CITIES.includes(c)))].slice(0, 3);
}

export function chatError(code, en = false) {
  const t = {
    soon: ['問法律即將開放，先用條文旁的「白話解釋」', 'Ask is coming soon; meanwhile use Explain on any article'],
    pass: ['請先登入 Orbit Pass', 'Sign in to Orbit Pass first'],
    cap: ['今天的提問次數用完了，明天再來', 'You’ve used today’s questions; try tomorrow'],
    busy: ['問得太快了，稍等一下再試', 'Too many at once; try again in a moment'],
    offline: ['沒有網路連線', 'No connection']
  }[code] || ['暫時無法回答，請稍後再試', 'Can’t answer right now; try again later'];
  return en ? t[1] : t[0];
}

// Questions to start from (home and the ask screen).
// (A situation to judge, a rule, a ruling, the 立法院: what it can answer; each with its topic's tile.)
export const STARTERS = [
  ['房東扣光押金合理嗎？', 'Can my landlord keep my deposit?', 'home'],
  ['幫領包裹變詐騙會判刑嗎？', 'I picked up scam parcels. Am I guilty?', 'justice'],
  ['天天加班沒加班費怎麼辦？', 'Daily overtime, no overtime pay', 'labor'],
  ['高中學生會能自己管經費嗎？', 'Can a student council run its own budget?', 'edu'],
  ['勞基法修法進度到哪了？', 'Where is the Labor Act amendment?', 'labor'],
  ['我追蹤的立委投了什麼票？', 'How did my legislators vote?', 'gov']
];

// 問法律's start: four questions worth asking now, each with why it's here
// (Jay 2026-11-06: 試試這樣問, the same six fixed questions home already
// shows, read "shit"). What you were reading, a bill you follow, your
// legislators' votes, the bill that moved most lately, then everyday
// situations. Each { q, why, topic, mark } (mark: 'law', 'bill', 'gov', 'try').
export function askIdeas({ reading = [], items = [], followed = {}, people = false, lawTopic = () => 'gov', itemTopic = () => 'gov', en = false, n = 4, now = Date.now() } = {}) {
  const W = (zh, e) => (en ? e : zh);
  const out = [];
  const add = (q, why, topic, mark) => q && out.length < n && !out.some(x => x.q === q) && out.push({ q, why, topic, mark });
  const law = reading.find(x => x.kind === 'law' && x.title);
  if (law) {
    const k = /[#&]a=([^&]+)/.exec(law.href || '')?.[1];
    add(k ? W(`${law.title}第 ${k} 條在說什麼？`, `What does Article ${k} of ${law.title} say?`) : W(`${law.title}的重點是什麼？`, `What are the main points of ${law.title}?`), W('剛看過', 'Read lately'), lawTopic(law.id), 'law');
  }
  const newest = (a, b) => ((b.u || '') > (a.u || '') ? 1 : (b.u || '') < (a.u || '') ? -1 : 0);
  const live = items.filter(it => it && it.n && !it.dropped);
  const mine = live.filter(it => followed[it.k]).sort(newest)[0];
  if (mine) add(W(`${mine.n}要改什麼？`, `What does the ${mine.n} amendment change?`), W('你追蹤的法案', 'A bill you follow'), itemTopic(mine), 'bill');
  if (people) add(W('我追蹤的立委投了什麼票？', 'How did my legislators vote?'), W('你追蹤的立委', 'Legislators you follow'), 'gov', 'gov');
  const moved = live.filter(it => it.u && it !== mine).sort(newest)[0];
  if (moved) add(W(`${moved.n}要改什麼？`, `What does the ${moved.n} amendment change?`), W('立法院最新進度', 'Just moved in the Legislative Yuan'), itemTopic(moved), 'bill');
  // (Home already shows STARTERS: here other everyday cases, a different few each day.)
  const day = Math.floor((now + 8 * 3600e3) / 864e5);
  for (let i = 0; i < EVERYDAY.length && out.length < n; i++) {
    const [zh, e, topic] = EVERYDAY[(day + i) % EVERYDAY.length];
    add(W(zh, e), W('常見情況', 'A common case'), topic, 'try');
  }
  return out;
}
// Everyday cases for 問法律's start: a situation a person meets, said as they'd say it.
export const EVERYDAY = [
  ['網購退貨，七天內一定能退嗎？', 'Can I always return an online order within 7 days?', 'econ'],
  ['被資遣可以拿到哪些補償？', 'What am I owed if I’m laid off?', 'labor'],
  ['騎車被開罰單，可以申訴嗎？', 'Can I appeal a traffic ticket?', 'traffic'],
  ['打工時薪最低要給多少？', 'What’s the minimum hourly wage?', 'labor'],
  ['被偷拍或照片被亂傳怎麼辦？', 'Someone shared my photos without asking', 'justice'],
  ['租屋押金最多可以收幾個月？', 'How much deposit can a landlord ask?', 'home'],
  ['在網路上罵人會被告嗎？', 'Can I be sued for insulting someone online?', 'justice'],
  ['學校可以檢查學生的手機嗎？', 'Can a school search a student’s phone?', 'edu']
];
