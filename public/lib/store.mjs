// What this device keeps: the laws and bills it follows (with the day it
// last looked at each), its bookmarks and its recent laws. Versioned keys;
// a read that fails is empty, a write that fails is dropped (private mode).

const KEY = 'orbit-law.mine.v1';
const empty = () => ({ laws: {}, items: {}, marks: [], recent: [], seenChanges: '' });

export function loadMine(store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store?.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return { ...empty(), ...v };
  } catch {}
  return empty();
}
export function saveMine(mine, store = globalThis.localStorage, now = Date.now()) {
  mine.t = now;
  try {
    store?.setItem(KEY, JSON.stringify(mine));
  } catch {}
}

const today = (now = new Date()) => new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10);

// Follow or unfollow (a law by pcode, a bill item by its key); following
// starts "seen" today, so only what moves after shows as new.
export function toggleFollow(mine, kind, id, now) {
  const set = mine[kind];
  if (set[id]) delete set[id];
  else set[id] = today(now);
  return Boolean(set[id]);
}
export function markSeen(mine, kind, id, now) {
  if (mine[kind][id]) mine[kind][id] = today(now);
}

export function addRecent(mine, p, max = 12) {
  mine.recent = [p, ...mine.recent.filter(x => x !== p)].slice(0, max);
}

export function toggleMark(mine, p, k) {
  const i = mine.marks.findIndex(m => m.p === p && m.k === k);
  if (i >= 0) mine.marks.splice(i, 1);
  else mine.marks.unshift({ p, k });
  return i < 0;
}
export const isMarked = (mine, p, k) => mine.marks.some(m => m.p === p && m.k === k);

// The followed laws amended since this device last looked at them (from
// changes.json: its `seen` is the build day that found the change).
export function lawsChanged(mine, changes) {
  return (changes?.items || []).filter(c => mine.laws[c.p] && c.seen > mine.laws[c.p]);
}
export { today };

// What the 追蹤 tab's badge counts: followed laws amended and followed bills
// moved since this device last looked at each.
export function newCount(mine, items, changes) {
  return lawsChanged(mine, changes).length + (items || []).filter(it => mine.items[it.k] && it.u > mine.items[it.k]).length;
}

// On the Quadra Pass (its orbit-law payload): what's followed, the
// bookmarks and the recent laws, so another phone signed in has them too.
// The newer copy (by `t`, the last save) decides what's in or out; the
// days last looked at are the later of the two for what both follow.
export const encodeMine = m => JSON.stringify({ v: 1, t: m.t || 0, laws: m.laws, items: m.items, marks: m.marks, recent: m.recent });
export function decodeMine(payload) {
  try {
    const v = JSON.parse(payload);
    if (v?.v !== 1 || typeof v.laws !== 'object' || typeof v.items !== 'object' || !Array.isArray(v.marks) || !Array.isArray(v.recent)) return null;
    return { t: Number(v.t) || 0, laws: v.laws || {}, items: v.items || {}, marks: v.marks.filter(x => x && typeof x.p === 'string' && typeof x.k === 'string'), recent: v.recent.filter(x => typeof x === 'string') };
  } catch {
    return null;
  }
}
export function mergeMine(ours, theirs) {
  const [base, other] = (theirs.t || 0) > (ours.t || 0) ? [theirs, ours] : [ours, theirs];
  const later = (a, b) => Object.fromEntries(Object.entries(a).map(([k, d]) => [k, b[k] && b[k] > d ? b[k] : d]));
  return {
    ...ours,
    t: Math.max(ours.t || 0, theirs.t || 0),
    laws: later(base.laws, other.laws),
    items: later(base.items, other.items),
    marks: base.marks,
    recent: [...new Set([...base.recent, ...other.recent])].slice(0, 12)
  };
}
