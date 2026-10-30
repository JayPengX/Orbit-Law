// 全文檢索 across every law, static: each article's two-character pairs
// (bigrams) are posted into one of BUCKETS small files at build time; a
// search fetches only the buckets of its own pairs (a 4-character search:
// 3 files) and keeps the articles that have them all. Built once a day with
// the rest of the data; a phone keeps the buckets it used.
//
// An article id: law's place in index.json × 2048 + the article's place in
// its law (0-based, articles only).

export const BUCKETS = 2048;
export const PER_LAW = 2048;

const WORD = /[㐀-鿿豈-﫿A-Za-z0-9]/;

export function bigrams(text) {
  const out = new Set();
  const chars = [...String(text)];
  for (let i = 0; i + 1 < chars.length; i++) if (WORD.test(chars[i]) && WORD.test(chars[i + 1])) out.add(chars[i] + chars[i + 1]);
  return out;
}

export function bucketOf(pair) {
  let x = 0;
  for (const ch of pair) x = (x * 31 + ch.codePointAt(0)) >>> 0;
  return x % BUCKETS;
}

// laws: the index's order, each { a: [[kind, key, text]] }. → Map bucket →
// { pair: [first id, then each id's gap from the one before] } (gaps keep
// the files small).
export function buildIndex(laws) {
  const buckets = new Map();
  laws.forEach((law, li) => {
    let ai = 0;
    for (const [kind, , text] of law.a) {
      if (kind !== 'A') continue;
      const id = li * PER_LAW + ai++;
      for (const pair of bigrams(text)) {
        const b = bucketOf(pair);
        if (!buckets.has(b)) buckets.set(b, {});
        (buckets.get(b)[pair] ||= []).push(id);
      }
    }
  });
  for (const pairs of buckets.values()) for (const [p, ids] of Object.entries(pairs)) pairs[p] = ids.map((id, i) => (i ? id - ids[i - 1] : id));
  return buckets;
}
const undelta = gaps => {
  let x = 0;
  return gaps.map(g => (x += g));
};

// The ids of articles holding every pair of the query (best effort for a
// phrase: the pairs, not their order). `bucket(n)` fetches one bucket file.
export async function searchText(query, bucket) {
  const pairs = [...bigrams(query)];
  if (!pairs.length) return [];
  const lists = await Promise.all(pairs.map(async p => undelta((await bucket(bucketOf(p)))?.[p] || [])));
  lists.sort((a, b) => a.length - b.length);
  let hits = lists[0];
  for (const l of lists.slice(1)) {
    const set = new Set(l);
    hits = hits.filter(id => set.has(id));
    if (!hits.length) break;
  }
  return hits;
}
