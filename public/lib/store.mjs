// What this device keeps: the laws and bills it follows (with the day it
// last looked at each), its bookmarks and its recent laws. Versioned keys;
// a read that fails is empty, a write that fails is dropped (private mode).

const KEY = 'orbit-law.mine.v1';
// cc: the councillors and 代表 followed, as `<council or town code>:<name>` (a council's people have no lasting id).
// rules: a rule's name, whose it is and its kind, by its id (local:… / agency:…), for the rules
// followed, bookmarked or read (they have no index loaded at start, as the laws do).
const empty = () => ({ laws: {}, items: {}, people: {}, cc: {}, rules: {}, marks: [], recent: [], seenChanges: '' });

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

// A followed bill moved since the day last looked. 立法院's 最新進度日期 can
// be a day still to come (a committee's meeting set for next week): that's
// no move yet, so it counts once the day comes, not every day before.
export const billMoved = (it, seen, now) => Boolean(seen) && it.u > seen && it.u <= today(now);

// What's new among what this device follows, one key per thing (a law, a
// bill, a legislator), each with the day of its newest change, so a later
// change is a new key: [ 'l:<pcode>:<day>', 'b:<item>:<day>', 'p:<id>:<day>' ].
// peopleLast: each followed legislator's (and councillor's, `cc:<key>`) newest doing since last opened.
export function newsKeys(mine, items, changes, peopleLast = {}, now) {
  return [
    ...lawsChanged(mine, changes).map(c => `l:${c.p}:${c.seen}`),
    ...(items || []).filter(it => billMoved(it, mine.items[it.k], now)).map(it => `b:${it.k}:${it.u}`),
    // (A councillor's as `cc:<council>:<name>`.)
    ...Object.entries(peopleLast).filter(([id, d]) => d && (id.startsWith('cc:') ? mine.cc?.[id.slice(3)] : mine.people?.[id])).map(([id, d]) => `p:${id}:${d}`)
  ];
}

// The 我的 tab's count: what's new since the tab was last open (`told`, the
// keys it showed then). Opening the tab clears it; the 新 marks inside stay
// until each one is opened.
export const newCount = (keys, told = []) => keys.filter(k => !told.includes(k)).length;

// The keys the 我的 tab last showed: this device's alone (not on the Pass).
const TOLD = 'orbit-law.told.v1';
export function loadTold(store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store?.getItem(TOLD) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function saveTold(keys, store = globalThis.localStorage) {
  try {
    store?.setItem(TOLD, JSON.stringify(keys));
  } catch {}
}

// On the Orbit Pass (its orbit-law payload): what's followed, the
// bookmarks and the recent laws, so another phone signed in has them too.
// The newer copy (by `t`, the last save) decides what's in or out; the
// days last looked at are the later of the two for what both follow.
export const encodeMine = m => JSON.stringify({ v: 1, t: m.t || 0, laws: m.laws, items: m.items, people: m.people || {}, cc: m.cc || {}, rules: keptRules(m), marks: m.marks, recent: m.recent });
// Only the rules something still points at (followed, bookmarked, read lately).
export function keptRules(m) {
  const want = new Set([...Object.keys(m.laws || {}), ...(m.marks || []).map(x => x.p), ...(m.recent || [])]);
  return Object.fromEntries(Object.entries(m.rules || {}).filter(([p, r]) => want.has(p) && Array.isArray(r)));
}
export function decodeMine(payload) {
  try {
    const v = JSON.parse(payload);
    if (v?.v !== 1 || typeof v.laws !== 'object' || typeof v.items !== 'object' || !Array.isArray(v.marks) || !Array.isArray(v.recent)) return null;
    return { t: Number(v.t) || 0, laws: v.laws || {}, items: v.items || {}, people: v.people && typeof v.people === 'object' ? v.people : {}, cc: v.cc && typeof v.cc === 'object' ? v.cc : {}, rules: v.rules && typeof v.rules === 'object' ? v.rules : {}, marks: v.marks.filter(x => x && typeof x.p === 'string' && typeof x.k === 'string'), recent: v.recent.filter(x => typeof x === 'string') };
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
    people: later(base.people || {}, other.people || {}),
    cc: later(base.cc || {}, other.cc || {}),
    rules: { ...(other.rules || {}), ...(base.rules || {}) },
    marks: base.marks,
    recent: [...new Set([...base.recent, ...other.recent])].slice(0, 12)
  };
}
