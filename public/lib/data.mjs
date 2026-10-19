// The law data's shape, one place for the build (scripts/build-data.mjs) and
// the app: 全國法規資料庫's records made small, an article's key, what an
// amendment changed.
//
// A law file: { p: pcode, n: 名稱, e: English name, l: 位階, c: 類別,
// m: 異動日期 YYYYMMDD, eff: 生效內容, ab: 廢止註記, h: 沿革, fw: 前言,
// a: [[kind, key, text]] } where kind 'C' is a 編/章/節 heading (key '')
// and 'A' an article, its key '231-1' for 第 231-1 條.
// An index row: [p, n, l, c, m, abandoned 0|1, hasEnglish 0|1, articles].

export const CHANGES_DAYS = 120;

const clean = s => String(s || '').replace(/\r\n?/g, '\n').replace(/[ \t　]+\n/g, '\n').replace(/\s+$/, '');

// '第 231-1 條' → '231-1'; 'Article 231-1' → '231-1'.
export function artKey(no) {
  const m = String(no || '').match(/(\d+(?:-\d+)?)/);
  return m ? m[1] : '';
}
export const pcodeOf = url => (String(url || '').match(/pcode=([A-Z0-9]+)/i) || [])[1]?.toUpperCase() || '';

export function compactLaw(l) {
  const p = pcodeOf(l.LawURL);
  if (!p || !l.LawName) return null;
  return {
    p,
    n: l.LawName.trim(),
    e: (l.EngLawName || '').trim(),
    l: l.LawLevel || '',
    c: l.LawCategory || '',
    m: l.LawModifiedDate || '',
    eff: clean(l.LawEffectiveNote),
    ab: (l.LawAbandonNote || '').trim(),
    h: clean(l.LawHistories),
    fw: clean(l.LawForeword),
    a: (l.LawArticles || []).map(a => (a.ArticleType === 'C' ? ['C', '', a.ArticleContent.trim()] : ['A', artKey(a.ArticleNo), clean(a.ArticleContent)]))
  };
}

export function compactEn(l) {
  const p = pcodeOf(l.EngLawURL);
  if (!p) return null;
  return {
    p,
    n: (l.EngLawName || '').trim(),
    fw: clean(l.EngLawForeword),
    h: clean(l.EngLawHistories),
    a: (l.EngLawArticles || []).map(a => (a.EngArticleType === 'C' ? ['C', '', a.EngArticleContent.trim()] : ['A', artKey(a.EngArticleNo), clean(a.EngArticleContent)]))
  };
}

// [6]: the English name when MOJ has a translation, else 0.
export const indexRow = (law, enName) => [law.p, law.n, law.l, law.c, law.m, law.ab ? 1 : 0, enName || 0, law.a.filter(a => a[0] === 'A').length];

// What an amendment did, article by article: { p, n, m, was (the old
// 異動日期, '' when the law is new), added, amended, removed } (article keys).
// An article "deleted" by amendment stays in the law as （刪除）, so it reads
// as amended to （刪除）, which is what the law says.
export function diffLaws(oldLaw, law) {
  const before = new Map((oldLaw?.a || []).filter(a => a[0] === 'A').map(a => [a[1], a[2]]));
  const after = new Map(law.a.filter(a => a[0] === 'A').map(a => [a[1], a[2]]));
  const added = [], amended = [], removed = [];
  for (const [k, t] of after) {
    if (!before.has(k)) added.push(k);
    else if (before.get(k) !== t) amended.push(k);
  }
  for (const k of before.keys()) if (!after.has(k)) removed.push(k);
  return { p: law.p, n: law.n, m: law.m, was: oldLaw?.m || '', added: oldLaw ? added : [], amended, removed, seen: '' };
}

// The texts behind a diff, for 修正 explained (AI) and side by side:
// { p, m, was, arts: { key: [old or null, new or null] } }.
export function diffTexts(oldLaw, law, d = diffLaws(oldLaw, law)) {
  const text = (l, k) => l?.a.find(a => a[0] === 'A' && a[1] === k)?.[2] ?? null;
  const arts = {};
  for (const k of [...d.added, ...d.amended, ...d.removed]) arts[k] = [text(oldLaw, k), text(law, k)];
  return { p: law.p, m: law.m, was: d.was, arts };
}

// The latest amendment as its own 沿革 tells it, for a version no earlier
// deploy saw (MOJ refreshes its files about monthly): the last entry's
// 修正/增訂/刪除第…條 read into article keys (ranges 14～16 spread over the
// law's own articles), or `whole` for 制定/全文 with its article count.
// null when the entry names no articles (名稱 only, 施行 dates).
export function historyChange(law) {
  const entries = String(law.h || '').split(/\n\s*(?=\d+\.\s*中華民國)/);
  const last = (entries[entries.length - 1] || '').replace(/\s+/g, '').replace(/^\d+\./, '');
  const base = { p: law.p, n: law.n, m: law.m, was: '', added: [], amended: [], removed: [], seen: ymdDash(law.m) };
  const whole = last.match(/(制定|訂定)(?:公布|發布)全文(\d+)條|修正(?:公布|發布)(?:名稱及)?全文(\d+)條/);
  if (whole) return { ...base, whole: whole[1] ? 'new' : 'all', count: Number(whole[2] || whole[3]) };
  const keys = law.a.filter(a => a[0] === 'A').map(a => a[1]);
  const spread = list =>
    list.split('、').flatMap(x => {
      const [a, b] = x.split('～');
      if (!b) return [a];
      const i = keys.indexOf(a), j = keys.indexOf(b);
      return i >= 0 && j > i ? keys.slice(i, j + 1) : [a, b];
    });
  const kinds = { 修正: 'amended', 增訂: 'added', 刪除: 'removed' };
  for (const [, verb, list] of last.matchAll(/(修正|增訂|刪除)(?:公布|發布)?第([\d\-、～]+)條(?!第)/g)) base[kinds[verb]].push(...spread(list));
  return base.added.length + base.amended.length + base.removed.length ? base : null;
}
const ymdDash = m => (/^\d{8}$/.test(m) ? `${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6, 8)}` : '');

// The running 修法追蹤 list: new findings first (stamped with the build
// day), one entry per law and 異動日期, older than `days` dropped. `told`:
// versions read from their 沿革 (historyChange), kept when nothing better
// (a real diff) has them. Newest amendment first.
export function mergeChanges(prev, found, now = new Date(), days = CHANGES_DAYS, told = []) {
  const day = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10);
  const items = [...found.map(f => ({ ...f, seen: day })), ...(prev?.items || []), ...told];
  const keep = new Map();
  for (const it of items) {
    const id = `${it.p}@${it.m}`;
    if (!keep.has(id) && it.seen >= cutoff) keep.set(id, it);
  }
  return { items: [...keep.values()].sort((a, b) => (b.m > a.m) - (b.m < a.m)) };
}
