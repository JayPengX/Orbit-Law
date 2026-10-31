// 繼續閱讀: what you were reading last, of any kind (a law at the article you
// had reached, a 憲法法庭 ruling, a court judgment, a bill), newest first.
// Kept on this phone only (localStorage), at most MAX.
// An entry: { kind: 'law' | 'cons' | 'judgment' | 'bill', id, title, sub, href, pct (0–1 or null), t }.

const KEY = 'law.reading';
export const MAX = 8;

export function readLog(store = globalThis.localStorage) {
  try {
    const l = JSON.parse(store?.getItem(KEY) || '[]');
    return Array.isArray(l) ? l.filter(x => x && x.kind && x.id && x.href) : [];
  } catch {
    return [];
  }
}

// Note `entry` as the newest (the same thing read again moves up, keeping
// what it had unless told anew).
export function noteRead(entry, store = globalThis.localStorage, now = Date.now()) {
  const log = readLog(store);
  const had = log.find(x => x.kind === entry.kind && x.id === entry.id);
  const next = [{ ...had, ...entry, t: now }, ...log.filter(x => x !== had)].slice(0, MAX);
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}

// Where you are in a law: the article and how far through it that is.
export function lawPlace(keys, k) {
  const i = keys.indexOf(k);
  return i < 0 ? null : { k, pct: keys.length > 1 ? i / (keys.length - 1) : 1 };
}
