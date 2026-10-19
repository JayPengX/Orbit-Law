// 白話解釋: the proxy's /law-ask (Shared-Proxy) reads the articles itself
// from this site and answers only from them, every point citing an article
// it was given. Asked only on a tap; the same question on the same law
// version is answered from its cache, free. Behind the Pass: each call
// carries this app's session (passFetch), counted per Pass a day.
//   mode 'bill': what a bill's 對照表 changes; mode 'diff': what the latest
//   amendment changed (data/diff/<p>.json).

export const ASK_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/law-ask';
export const MAX_Q = 300;

// A Worker call signed with the Orbit Law session (qt), sent as text/plain
// (no preflight); a 401 is asked once more with a new token. `s`: quadraSession.
export function passFetch(s, fetcher = globalThis.fetch) {
  const token = renew => (s?.ensureToken ? s.ensureToken({ renew }).catch(() => s.token || '') : Promise.resolve(''));
  return async (url, init = {}) => {
    const send = t => fetcher(`${url}${url.includes('?') ? '&' : '?'}v=1${t ? `&qt=${encodeURIComponent(t)}` : ''}`, { ...init, headers: { 'Content-Type': 'text/plain' } });
    const r = await send(await token(false));
    return r.status === 401 && s ? send(await token(true)) : r;
  };
}

async function post(body, fetcher) {
  let r;
  try {
    r = await fetcher(ASK_URL, { method: 'POST', body: JSON.stringify(body) });
  } catch {
    return { error: 'offline' };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: typeof j.error === 'string' ? j.error : `http${r.status}`, left: j.left };
  if (typeof j.covered !== 'boolean') return { error: 'bad' };
  return j;
}
const cited = (pts, ok) => (Array.isArray(pts) ? pts : []).map(pt => ({ text: String(pt?.text || ''), cites: (pt?.cites || []).map(String).filter(ok) })).filter(pt => pt.text && pt.cites.length);

export async function askLaw({ p, arts, q = '', lang = 'zh' }, fetcher = globalThis.fetch) {
  const j = await post({ p, arts: arts.slice(0, 8), q: String(q).trim().slice(0, MAX_Q), lang }, fetcher);
  if (j.error) return j;
  // Only points citing an article that was asked about (the proxy checks too).
  const asked = new Set(arts);
  const points = cited(j.points, c => asked.has(c));
  return { answer: String(j.answer || ''), points, covered: Boolean(j.covered) && points.length > 0, cached: Boolean(j.cached), left: j.left };
}

// A bill's 對照表 in plain words: what it changes (by article) and who it affects.
export async function askBill({ bill, lang = 'zh' }, fetcher = globalThis.fetch) {
  const j = await post({ mode: 'bill', bill: String(bill), lang }, fetcher);
  if (j.error) return j;
  const changes = (Array.isArray(j.changes) ? j.changes : []).slice(0, 8).map(c => ({ text: String(c?.text || ''), article: c?.article ? String(c.article) : '' })).filter(c => c.text);
  return { answer: String(j.answer || ''), changes, who: (Array.isArray(j.who) ? j.who : []).slice(0, 4).map(String).filter(Boolean), covered: Boolean(j.covered) && (changes.length > 0 || Boolean(j.answer)), left: j.left };
}

// The latest amendment of these articles, old text to new, in plain words.
export async function askDiff({ p, arts, lang = 'zh' }, fetcher = globalThis.fetch) {
  const j = await post({ mode: 'diff', p, arts: arts.slice(0, 8), lang }, fetcher);
  if (j.error) return j;
  const asked = new Set(arts);
  const points = cited(j.points, c => asked.has(c));
  return { answer: String(j.answer || ''), points, covered: Boolean(j.covered) && (points.length > 0 || Boolean(j.answer)), left: j.left };
}

// Each failure in plain words.
export function askError(code, en = false) {
  const t = {
    cap: ['今天的解釋次數用完了，明天再來', 'You’ve used today’s explanations; try tomorrow'],
    busy: ['問得太快了，稍等一下再試', 'Too many at once; try again in a moment'],
    offline: ['沒有網路連線', 'No connection'],
    pass: ['請先登入 Quadra Pass', 'Sign in to Quadra Pass first'],
    bill: ['這個版本沒有對照表可以解釋', 'This version has no table to explain'],
    diff: ['這次修法的舊條文讀不到', 'The old text isn’t available'],
    origin: ['這個網址不能使用解釋', 'Not available here']
  }[code] || ['解釋暫時無法使用，請稍後再試', 'Explanations aren’t available right now'];
  return en ? t[1] : t[0];
}

// One-line summaries for bill cards (/law-gist, shared and kept by the proxy):
// items [{ k, bill: 議案編號 }] ≤ 10 → [{ k, line, who, covered }] or { error }.
export const GIST_URL = ASK_URL.replace('/law-ask', '/law-gist');
export async function gistBills(items, lang = 'zh', fetcher = globalThis.fetch) {
  let r;
  try {
    r = await fetcher(GIST_URL, { method: 'POST', body: JSON.stringify({ kind: 'bill', items: items.slice(0, 10), lang }) });
  } catch {
    return { error: 'offline' };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: typeof j.error === 'string' ? j.error : `http${r.status}` };
  return (Array.isArray(j.gists) ? j.gists : []).map(g => ({ k: String(g?.k || ''), line: String(g?.line || ''), who: (Array.isArray(g?.who) ? g.who : []).map(String).slice(0, 3), covered: g?.covered === true && Boolean(g?.line) })).filter(g => g.k);
}
