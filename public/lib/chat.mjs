// 問法律: the proxy's /law-chat finds the articles for a question across
// every law and regulation, and answers from them only, each point citing
// one ('p:key'). The app keeps the conversation (a few turns) and shows
// what the answer cites as chips that open the article.
import { ASK_URL } from './ask.mjs';

export const CHAT_URL = ASK_URL.replace(/law-ask$/, 'law-chat');
export const MAX_CHAT_Q = 500;
export const MAX_TURNS = 6;

const CITE = /^[A-Z]\d{7}:\d{1,4}(-\d{1,3})?$/;
const list = (x, n) => (Array.isArray(x) ? x.slice(0, n) : []);
const str = x => (typeof x === 'string' ? x.trim() : '');

// The answer made safe to draw: points and consequences keep only cites in
// the right shape, and only those among the answer's own sources.
export function cleanChat(j) {
  const sources = list(j?.sources, 20).filter(s => s && CITE.test(`${s.p}:${s.key}`)).map(s => ({ p: s.p, n: str(s.n), key: String(s.key) }));
  const known = new Set(sources.map(s => `${s.p}:${s.key}`));
  const cited = arr => list(arr, 8).map(pt => ({ text: str(pt?.text), cites: list(pt?.cites, 6).map(String).filter(c => CITE.test(c) && known.has(c)) })).filter(pt => pt.text && pt.cites.length);
  const points = cited(j?.points);
  return {
    covered: j?.covered === true && points.length > 0,
    answer: str(j?.answer),
    points,
    consequences: cited(j?.consequences),
    agency: str(j?.agency || ''),
    next: list(j?.next, 4).map(str).filter(Boolean),
    followups: list(j?.followups, 3).map(str).filter(Boolean),
    sources,
    // 政府公告 and 立法院 bills the answer drew on (links out, or a bill sheet).
    notices: list(j?.notices, 6).filter(x => x && /^https:\/\//.test(x.url) && str(x.t)).map(x => ({ t: str(x.t), url: x.url, d: str(x.d || ''), agency: str(x.agency || '') })),
    bills: list(j?.bills, 6).filter(x => x && /^\d+:\w+$/.test(String(x.k || ''))).map(x => ({ k: String(x.k), n: str(x.n), stage: Number(x.stage) || 0 })),
    left: Number.isFinite(j?.left) ? j.left : null
  };
}

// The turns sent back with a follow-up: the last MAX_TURNS, text cut short.
export const historyOf = turns => turns.slice(-MAX_TURNS).map(t => ({ role: t.role, text: String(t.text).slice(0, 1500), ...(t.cites?.length ? { cites: t.cites.slice(0, 12) } : {}) }));

export async function chatLaw({ q, history = [], pin = [], lang = 'zh' }, { fetcher = globalThis.fetch, headers = {} } = {}) {
  let r;
  try {
    r = await fetcher(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain', ...headers }, body: JSON.stringify({ q: String(q).trim().slice(0, MAX_CHAT_Q), history: historyOf(history), pin: pin.slice(0, 2), lang }) });
  } catch {
    return { error: 'offline' };
  }
  const j = await r.json().catch(() => ({}));
  // A route not there yet: the proxy's own 404 ({ error: { code } }, or none).
  if (r.status === 404 && typeof j.error !== 'string') return { error: 'soon' };
  if (!r.ok) return { error: typeof j.error === 'string' ? j.error : `http${r.status}`, left: j.left };
  if (typeof j.covered !== 'boolean') return { error: 'bad' };
  return cleanChat(j);
}

export function chatError(code, en = false) {
  const t = {
    soon: ['問法律即將開放，先用條文旁的「白話解釋」', 'Ask is coming soon; meanwhile use Explain on any article'],
    pass: ['請先登入 Quadra Pass', 'Sign in to Quadra Pass first'],
    cap: ['今天的提問次數用完了，明天再來', 'You’ve used today’s questions; try tomorrow'],
    busy: ['問得太快了，稍等一下再試', 'Too many at once; try again in a moment'],
    offline: ['沒有網路連線', 'No connection']
  }[code] || ['暫時無法回答，請稍後再試', 'Can’t answer right now; try again later'];
  return en ? t[1] : t[0];
}

// Questions to start from (home and the ask screen).
export const STARTERS = [
  ['房東不退押金怎麼辦？', 'My landlord won’t return my deposit'],
  ['加班費怎麼算？', 'How is overtime pay calculated?'],
  ['騎車闖紅燈罰多少？', 'Fine for running a red light on a scooter?'],
  ['網購七天內可以退貨嗎？', 'Can I return an online purchase within 7 days?'],
  ['被公司資遣有什麼補償？', 'What am I owed if I’m laid off?'],
  ['個資外洩可以求償嗎？', 'Can I claim damages for a data leak?']
];
