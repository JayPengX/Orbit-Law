// 問法律's saved chats, kept on the phone (localStorage): a list newest
// first, each { id, t: title, u: last used (ms), turns, pin }. A turn is
// { role: 'user', text } or { role: 'model', r } (the answer as chat.mjs
// gives it); waits and errors are never kept.
const KEY = 'law.chats';
export const MAX_CHATS = 60;
const MAX_BYTES = 1_500_000;

export function loadChats(store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store?.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(c => c && c.id && Array.isArray(c.turns)) : [];
  } catch {
    return [];
  }
}

// Written newest first; the oldest dropped past MAX_CHATS or the size cap.
export function saveChats(list, store = globalThis.localStorage) {
  let keep = [...list].sort((a, b) => b.u - a.u).slice(0, MAX_CHATS);
  let s = JSON.stringify(keep);
  while (s.length > MAX_BYTES && keep.length > 1) s = JSON.stringify((keep = keep.slice(0, -1)));
  try {
    store?.setItem(KEY, s);
  } catch {}
  return keep;
}

// The first question, cut to a title.
export const titleOf = turns => {
  const q = String(turns.find(t => t.role === 'user')?.text || '').replace(/\s+/g, ' ').trim();
  return q.length > 40 ? `${q.slice(0, 39)}…` : q;
};

// This chat in the list (added, or put back with its new turns); a chat with
// no answered turn isn't kept. A renamed title stays.
export function putChat(list, { id, turns, pin, t }, now = Date.now()) {
  const kept = turns.filter(x => (x.role === 'user' && x.text) || (x.role === 'model' && x.r));
  // A question left without its answer (it failed) is dropped with it.
  while (kept.length && kept[kept.length - 1].role === 'user') kept.pop();
  const rest = list.filter(c => c.id !== id);
  if (!kept.length) return rest;
  const old = list.find(c => c.id === id);
  return [{ id, t: old?.named ? old.t : t || titleOf(kept), named: old?.named || undefined, u: now, turns: kept, pin: pin || null }, ...rest];
}
export const renameChat = (list, id, t) => list.map(c => (c.id === id && t.trim() ? { ...c, t: t.trim().slice(0, 60), named: true } : c));
export const dropChat = (list, id) => list.filter(c => c.id !== id);
export const newChatId = (now = Date.now()) => `c${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
