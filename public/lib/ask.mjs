// 白話解釋: the proxy's /law-ask (Shared-Proxy) reads the articles itself
// from this site and answers only from them, every point citing an article
// it was given. Asked only on a tap; the same question on the same law
// version is answered from its cache, free.

export const ASK_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/law-ask';
export const MAX_Q = 300;

export async function askLaw({ p, arts, q = '', lang = 'zh' }, fetcher = globalThis.fetch) {
  let r;
  try {
    r = await fetcher(ASK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p, arts: arts.slice(0, 8), q: String(q).trim().slice(0, MAX_Q), lang }) });
  } catch {
    return { error: 'offline' };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.error || `http${r.status}`, left: j.left };
  if (typeof j.covered !== 'boolean') return { error: 'bad' };
  // Only points citing an article that was asked about (the proxy checks too).
  const asked = new Set(arts);
  const points = (j.points || []).map(pt => ({ text: String(pt.text || ''), cites: (pt.cites || []).map(String).filter(c => asked.has(c)) })).filter(pt => pt.text && pt.cites.length);
  return { answer: String(j.answer || ''), points, covered: Boolean(j.covered) && points.length > 0, cached: Boolean(j.cached), left: j.left };
}

// Each failure in plain words.
export function askError(code, en = false) {
  const t = {
    cap: ['今天的解釋次數用完了，明天再來', 'You’ve used today’s explanations; try tomorrow'],
    busy: ['問得太快了，稍等一下再試', 'Too many at once; try again in a moment'],
    offline: ['沒有網路連線', 'No connection'],
    origin: ['這個網址不能使用解釋', 'Not available here']
  }[code] || ['解釋暫時無法使用，請稍後再試', 'Explanations aren’t available right now'];
  return en ? t[1] : t[0];
}
