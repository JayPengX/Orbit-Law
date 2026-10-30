// 問法律: the proxy's /law-chat finds what a question needs across this
// site's data (every law and regulation, 行政規則, judgments and 釋字, bills,
// legislators, votes, meetings, 政府公告, and what the reader follows) and
// answers from that only, applied to the reader's facts, each point citing
// an article ('p:key'), a judgment (its id) or a rule (its id). The app keeps
// the conversation (a few turns) and shows what the answer cites as chips
// that open it in the app.
import { ASK_URL } from './ask.mjs';

export const CHAT_URL = ASK_URL.replace(/law-ask$/, 'law-chat');
export const MAX_CHAT_Q = 500;
export const MAX_TURNS = 6;

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
  const known = new Set([...sources.map(s => `${s.p}:${s.key}`), ...cases.map(x => x.jid), ...rules.map(x => x.id)]);
  // Grounded in what isn't an article (notices, bills, legislators…): points without cites stand too.
  const grounded = ['notices', 'bills', 'people', 'votes', 'meets', 'cases', 'rules'].some(k => Array.isArray(j?.[k]) && j[k].length > 0);
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
    left: Number.isFinite(j?.left) ? j.left : null
  };
}

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
  ['幫朋友領包裹變詐騙，會判刑嗎？', 'I picked up scam parcels. Am I guilty?', 'justice'],
  ['天天加班沒加班費怎麼辦？', 'Daily overtime, no overtime pay', 'labor'],
  ['高中學生會能自己管經費嗎？', 'Can a student council run its own budget?', 'edu'],
  ['勞基法修法進度到哪了？', 'Where is the Labor Act amendment?', 'labor'],
  ['我追蹤的立委投了什麼票？', 'How did my legislators vote?', 'gov']
];
