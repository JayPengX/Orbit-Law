// The app's visual pieces as HTML strings: topic tiles, bill cards with a
// six-step progress bar and party chips, law cards, the stage funnel and a
// before/after highlight of an amended article. Strings, so tests read them
// and a list of 200 cards draws in one go.
import { esc } from './view.mjs';
import { TOPICS, partyOf } from './topics.mjs';
import { PASSED, PROMULGATED, STAGES, STAGES_EN, openRound, billStage } from './bills.mjs';

const svg = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// A topic's coloured tile with its icon (size: 'sm' 32, '' 40, 'lg' 52).
export function topicTile(id, size = '') {
  const t = TOPICS[id] || TOPICS.gov;
  return `<span class="lw-tile${size ? ` ${size}` : ''}" style="--t:${t.color}">${svg(t.icon)}</span>`;
}
export const topicName = (id, en = false) => (TOPICS[id] || TOPICS.gov)[en ? 'en' : 'zh'];

// The six steps a reader follows: 提案, 一讀, 委員會, 院會 (審查完畢, 黨團
// 協商 and 二讀: the floor's part before the vote), 三讀, 公布. 協商 is not a
// step of its own: it happens at the floor, between 審查完畢 and 二讀.
export const STEPS = [
  ['提案', 'Filed'],
  ['一讀', '1st'],
  ['委員會', 'Committee'],
  ['院會', 'Floor'],
  ['三讀', 'Passed'],
  ['公布', 'Law']
];
// The 8-stage scale (bills.mjs) → the step reached (0–5).
export const stepOf = stage => [0, 1, 2, 3, 3, 3, 4, 5][Math.max(0, Math.min(7, stage))];

// The bar: six segments, filled to the step reached; its state's colour
// (moving indigo, held orange, passed green, withdrawn grey). `counts`: how
// many open versions stand at each step, shown under its name (an item with
// many versions: the bar is the furthest one, the numbers say where the rest are).
export const toneOf = item => (item.dropped ? 'dropped' : item.held ? 'held' : item.stage >= PASSED ? 'passed' : 'moving');
export function progress(item, en = false, { labels = false, counts = null } = {}) {
  const step = stepOf(item.stage);
  const tone = toneOf(item);
  const segs = STEPS.map((s, i) => `<i class="${i <= step ? 'on' : ''}${i === step ? ' now' : ''}"></i>`).join('');
  const names = labels ? `<span class="lw-prog-names">${STEPS.map((s, i) => `<span class="${i <= step ? 'on' : ''}">${esc(s[en ? 1 : 0])}</span>`).join('')}</span>` : '';
  const nums = counts ? `<span class="lw-prog-counts">${STEPS.map((s, i) => `<span>${counts[i] ? `<b>${counts[i]}</b>` : ''}</span>`).join('')}</span>` : '';
  return `<span class="lw-prog ${tone}" role="img" aria-label="${esc(STEPS[step][en ? 1 : 0])}"><span class="lw-prog-bar">${segs}</span>${names}${nums}</span>`;
}
// How many of a round's versions stand at each step (each by the furthest it reached).
export const roundSteps = round => round.reduce((c, b) => (c[stepOf(billStage(b).stage)]++, c), STEPS.map(() => 0));

// A stage in words, short: 協商中, 委員會, 已三讀, 已公布, 暫緩, 已撤回.
export function stageShort(item, en = false) {
  if (item.dropped) return en ? 'Withdrawn' : '已撤回';
  if (item.held) return en ? 'On hold' : '暫緩';
  const s = item.stage;
  if (s >= PROMULGATED) return en ? 'Now law' : '已公布';
  if (s >= PASSED) return en ? 'Passed' : '已三讀';
  return [['提案', 'Filed'], ['一讀', '1st reading'], ['委員會', 'Committee'], ['審查完畢', 'Reviewed'], ['協商中', 'Talks'], ['二讀', '2nd reading']][Math.max(0, s)][en ? 1 : 0];
}

// Who proposed it, as coloured chips: [[who, versions]] → 民進黨 3.
export function partyChips(by = [], en = false, max = 3) {
  return by
    .slice(0, max)
    .map(([who, n]) => {
      const p = partyOf(who);
      return `<span class="lw-party" style="--p:${p.color}">${esc(p[en ? 'en' : 'zh'])}${n > 1 || (n && !p.zh.endsWith('院')) ? `<b>${n}</b>` : ''}</span>`;
    })
    .join('');
}

// 2026-10-20 → 10/20 this year, 2025/10/20 before.
export function shortDay(d, now = new Date()) {
  if (!d) return '';
  const s = String(d).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  return s.slice(0, 4) === String(now.getFullYear()) ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : s.slice(0, 10).replaceAll('-', '/');
}

// The day it last moved; a day still ahead is the meeting it is set for (排入院會 dates the agenda).
const dayOf = (d, en, now = new Date()) => (String(d).slice(0, 10) > new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10) ? (en ? `set ${shortDay(d, now)}` : `${shortDay(d, now)} 排定`) : shortDay(d, now));
// Where an item stands, in words, from its versions' own steps: the latest
// step (a day ahead is the meeting it's set for), the step it waits for,
// how many versions are still open, and an earlier round's 三讀.
export function whereNow(it, bills = [], en = false, now = new Date()) {
  const round = openRound(bills);
  let last = null;
  for (const b of round.length ? round : bills) for (const [d, , raw] of [...(b.flow || []), [b.u, 0, b.st]]) if (d && raw && (!last || d > last.d)) last = { d, raw };
  const s = it.stage;
  const next = it.dropped || it.held || s >= PROMULGATED || s < 0 ? '' : (en ? STAGES_EN : STAGES)[s === 3 || s === 4 ? 5 : s + 1];
  return {
    last: last ? `${/^排入/.test(last.raw) ? shortDay(last.d, now) : dayOf(last.d, en, now)} ${last.raw.replace(/\s+/g, '')}` : '',
    next,
    open: round.length,
    before: s < PASSED && it.passed ? shortDay(it.passed, now) : ''
  };
}

// The articles the open versions change, in the law's order, each with how
// many versions touch it: 第 17 條 3. Links into the law when it has one.
export function articleChips(it, en = false, max = 12) {
  const num = k => k.split('-').map(Number);
  const keys = Object.keys(it.arts || {}).sort((a, b) => num(a)[0] - num(b)[0] || (num(a)[1] || 0) - (num(b)[1] || 0));
  const chip = k => {
    const label = esc(en ? `Art. ${k}` : `第 ${k} 條`) + (it.arts[k] > 1 ? `<b>${it.arts[k]}</b>` : '');
    return it.p ? `<a class="lw-art-chip" href="#law=${esc(it.p)}&amp;a=${esc(k)}">${label}</a>` : `<span class="lw-art-chip">${label}</span>`;
  };
  return keys.slice(0, max).map(chip).join('') + (keys.length > max ? `<span class="lw-art-chip more">${esc(en ? `+${keys.length - max}` : `等 ${keys.length} 條`)}</span>` : '');
}

// A bill item as a card: topic tile, the law, the bar, its stage and day,
// who proposed it, how many versions and articles. `topic`: its topic id.
export function billCard(it, { topic = 'gov', en = false, now, wide = false } = {}) {
  const arts = Object.keys(it.arts || {}).length;
  const meta = [it.count > 1 ? (en ? `${it.count} versions` : `${it.count} 版`) : '', arts ? (en ? `${arts} articles` : `${arts} 條`) : ''].filter(Boolean);
  return `<a class="lw-bill${wide ? ' wide' : ''}" href="#item=${esc(it.k.replace(':', '-'))}" style="--t:${(TOPICS[topic] || TOPICS.gov).color}">
<span class="lw-bill-top">${topicTile(topic, 'sm')}<span class="lw-bill-stage ${toneOf(it)}">${esc(stageShort(it, en))}</span><span class="lw-bill-day">${esc([dayOf(it.u, en, now), ...meta].join(' · '))}</span></span>
<span class="lw-bill-name">${esc(it.n)}</span>
${progress(it, en)}
<span class="lw-bill-foot">${partyChips(it.by, en, 3)}</span>
</a>`;
}

// A law as a row: tile, name, one line under it; `extra` on the right.
export function lawRow(row, { topic = 'gov', sub = '', extra = '', href } = {}) {
  return `<a class="lw-row" href="${esc(href || `#law=${row[0]}`)}">${topicTile(topic, 'sm')}<span class="lw-row-text"><span class="lw-row-name">${esc(row[1])}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${extra}<svg class="lw-chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`;
}

// How many bills stand at each step: a small bar chart of the term.
export function funnel(items, en = false) {
  const counts = STEPS.map(() => 0);
  for (const it of items) if (!it.dropped && (it.open || it.stage >= PASSED)) counts[stepOf(it.stage)]++;
  const max = Math.max(1, ...counts);
  return `<div class="lw-funnel">${STEPS.map((s, i) => `<button type="button" class="lw-funnel-col" data-step="${i}"><b>${counts[i]}</b><i style="--h:${Math.max(6, Math.round((counts[i] / max) * 100))}%"></i><span>${esc(s[en ? 1 : 0])}</span></button>`).join('')}</div>`;
}

// The funnel by bill (every version on its own, from items.json's bills):
// how many got at least this far (提案 all, 一讀, 審查完畢, 三讀), and under
// it how many are still waiting there for the next step (versions a 三讀 of
// their law already took over don't wait). `laws`: how many laws passed.
export const BILL_COLS = [['提案', 'Filed'], ['一讀', '1st reading'], ['審查完畢', 'Reviewed'], ['三讀', 'Passed']];
export function billFunnel(c, en = false, laws = 0) {
  const max = Math.max(1, ...c.reached);
  const sub = i => (i < 3 ? (c.waiting[i] ? `${esc(en ? ['wait 1st', 'wait review', 'wait floor'][i] : ['等一讀', '等審查', '等院會'][i])}<br>${c.waiting[i].toLocaleString()}` : '') : laws ? (en ? `${laws} laws` : `${laws} 部法`) : '');
  const cols = BILL_COLS.map((s, i) => `<button type="button" class="lw-funnel-col" data-step="${i}"><b>${c.reached[i].toLocaleString()}</b><i style="--h:${Math.max(4, Math.round((c.reached[i] / max) * 100))}%"></i><span>${esc(s[en ? 1 : 0])}</span><small>${sub(i)}</small></button>`).join('');
  return `<p class="lw-funnel-cap">${esc(en ? `${c.total.toLocaleString()} bills this term: how far they got` : `這屆 ${c.total.toLocaleString()} 件法案走到哪`)}</p><div class="lw-funnel bills">${cols}</div>`;
}

// Before and after, the changed words marked: [{ t, op: '=' | '-' | '+' }].
// Character diff (LCS), long texts cut to their changed middle first.
export function diffWords(a = '', b = '') {
  a = String(a || '');
  b = String(b || '');
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const x = a.slice(pre, a.length - suf), y = b.slice(pre, b.length - suf);
  const out = [];
  if (pre) out.push({ t: a.slice(0, pre), op: '=' });
  if (x.length * y.length > 250_000) {
    if (x) out.push({ t: x, op: '-' });
    if (y) out.push({ t: y, op: '+' });
  } else {
    const m = x.length, n = y.length;
    const L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const push = (t, op) => (out.length && out[out.length - 1].op === op ? (out[out.length - 1].t += t) : out.push({ t, op }));
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (x[i] === y[j]) push(x[i++], (j++, '='));
      else if (L[i + 1][j] >= L[i][j + 1]) push(x[i++], '-');
      else push(y[j++], '+');
    }
    while (i < m) push(x[i++], '-');
    while (j < n) push(y[j++], '+');
  }
  if (suf) out.length && out[out.length - 1].op === '=' ? (out[out.length - 1].t += a.slice(a.length - suf)) : out.push({ t: a.slice(a.length - suf), op: '=' });
  return out;
}

// The diff as HTML: unchanged runs longer than `keep` shortened to their ends.
export function diffHtml(a, b, { keep = 60 } = {}) {
  return diffWords(a, b)
    .map(({ t, op }) => {
      if (op === '-') return `<del>${esc(t)}</del>`;
      if (op === '+') return `<ins>${esc(t)}</ins>`;
      return t.length > keep * 2 ? `${esc(t.slice(0, keep))}<span class="lw-gap">…</span>${esc(t.slice(-keep))}` : esc(t);
    })
    .join('');
}
