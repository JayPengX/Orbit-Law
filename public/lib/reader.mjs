// 在 App 裡讀: a government page (a ruling, a ministry's notice or rule, a
// 預告) read inside the app instead of sending the reader to its site. The
// proxy's /law-page fetches the page (only .gov.tw hosts, cached at the
// edge, free) and hands back its HTML; this finds the part worth reading and
// turns it into plain blocks the app draws in its own style.
//   readPage(html, url) → { title, date, blocks: [{ k: 'h'|'p'|'li'|'table'|'pre', t | rows }], files: [{ name, url }] }

import * as kit from '#kit/orbit.mjs';

// (api.<domain> on the family's own domain: the kit's API, kit/domain.mjs.)
export const PAGE_URL = `${kit.API || 'https://orbit-workers-proxy.pengzjay.workers.dev'}/law-page`;
export const pageUrl = u => `${PAGE_URL}?u=${encodeURIComponent(u)}`;

// Pages the proxy will fetch (the app keeps a plain link for anything else).
export const readable = u => {
  try {
    const x = new URL(String(u).replace(/&amp;/g, '&'));
    return /^https?:$/.test(x.protocol) && (x.hostname === 'gov.tw' || x.hostname.endsWith('.gov.tw') || x.hostname === 'www.edu.tw');
  } catch {
    return false;
  }
};

const ENT = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', ensp: ' ', emsp: ' ', middot: '·', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–' };
export const unescape = s =>
  String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENT[e.toLowerCase()] ?? m;
  });
const text = s => unescape(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/[ \t\u3000\u00a0]+/g, ' ').trim();
const absolute = (href, base) => {
  try {
    return new URL(unescape(href), base).href;
  } catch {
    return '';
  }
};

// The page without what's never content.
function clean(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|iframe|select|button)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(header|nav|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<input\b[^>]*>/gi, '');
}

// The element starting at `i` (its open tag), to its matching close tag.
function element(html, i) {
  const name = html.slice(i + 1).match(/^[a-z0-9]+/i)?.[0].toLowerCase();
  if (!name) return '';
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'gi');
  re.lastIndex = i;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (!depth) return html.slice(i, re.lastIndex);
  }
  return html.slice(i);
}

// How much reading an element holds: its words, less the words in links.
function weight(h) {
  const alts = [...h.matchAll(/<img\b[^>]*\balt\s*=\s*["']([^"']{8,})/gi)].reduce((n, m) => n + m[1].length, 0);
  const all = text(h).length + alts;
  const linked = [...h.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].reduce((n, m) => n + text(m[1]).length, 0);
  return { all, own: all - linked, ratio: all ? linked / all : 1 };
}

// Where a CMS keeps the article: class or id names that say so.
const CANDIDATE = /<(div|section|article|main|td)\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*(?:\bcp\b|content|article|detail|editor|essay|news|text|main|body|data_midlle|word|lawarticle|law-reg|LawContent)[^"']*["'][^>]*>/gi;

// The part of a page worth reading.
export function mainPart(html) {
  const h = clean(html);
  const jud = h.search(/<div\b[^>]*class\s*=\s*["']htmlcontent["']/i);
  if (jud >= 0) return element(h, jud);
  const pre = h.search(/<div\b[^>]*class\s*=\s*["'][^"']*text-pre\b/i);
  if (pre >= 0) return element(h, pre);
  const found = [];
  for (const m of [...h.matchAll(CANDIDATE), ...h.matchAll(/<(article|main)\b[^>]*>/gi)]) {
    const el = element(h, m.index);
    const w = weight(el);
    // Menus are lists of short items: each one costs.
    const items = (el.match(/<li\b[^>]*>\s*<a\b/gi) || []).length;
    const own = w.own * (1 - w.ratio) - 25 * items;
    if (w.own >= 40 && w.ratio < 0.5 && own > 0) found.push({ el, at: m.index, own });
  }
  if (!found.length) {
    // A page that is little more than its attachments: its biggest named part.
    let best = null;
    for (const m of h.matchAll(CANDIDATE)) {
      const el = element(h, m.index);
      const w = weight(el);
      if (w.own >= 10 && (!best || w.own > best.own)) best = { el, own: w.own };
    }
    if (best) return best.el;
    const body = h.search(/<(main|body)\b/i);
    return body >= 0 ? element(h, body) : h;
  }
  // The biggest; then inside it, the smallest that still holds most of it.
  const top = found.reduce((a, b) => (b.own > a.own ? b : a));
  const inside = found.filter(f => f.at >= top.at && f.at < top.at + top.el.length && f.own >= top.own * 0.7);
  return inside.reduce((a, b) => (b.el.length < a.el.length ? b : a)).el;
}

// HTML → blocks, in order: headings, paragraphs, list items, tables,
// pictures (with the page they link to) and links that stand on their own.
export function blocksOf(part, base = '') {
  const out = [];
  const objs = [];
  const token = o => `\u0000${objs.push(o) - 1}\u0000`;
  const flat = s => text(String(s).replace(/\r/g, '').replace(/<br\s*\/?>/gi, '\u0002').replace(/\n/g, '\u0002')).replace(/ ?\u0002 ?/g, '\n');
  let h = String(part || '');
  // Tables, kept as rows (a layout table of one column reads as text).
  h = h.replace(/<table\b[\s\S]*?<\/table\s*>/gi, t => {
    const rows = [...t.matchAll(/<tr\b[\s\S]*?<\/tr\s*>/gi)].map(r => [...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(c => flat(c[1]))).filter(r => r.some(Boolean));
    if (rows.length && rows.some(r => r.filter(Boolean).length > 1) && rows.length <= 200) return `\u0001${token({ k: 'table', rows })}\u0001`;
    return t.replace(/<\/?(table|tbody|thead|tr)\b[^>]*>/gi, '\n').replace(/<\/?t[dh]\b[^>]*>/gi, '\n');
  });
  // Pictures, and the page a picture links to.
  const img = (tag, href) => {
    const src = absolute(tag.match(/\bsrc\s*=\s*["']([^"']+)/i)?.[1] || '', base);
    if (!/^https?:/.test(src) || /icon|logo|blank|spacer|share|facebook|twitter|plurk|line\.png|fb\.png|print|btn|button|arrow|small\.png|medium\.png|big\.png|\.gif(\?|$)/i.test(src)) return '';
    return `\u0001${token({ k: 'img', src, alt: text(tag.match(/\balt\s*=\s*["']([^"']*)/i)?.[1] || ''), href })}\u0001`;
  };
  h = h.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>\s*(<img\b[^>]*>)\s*<\/a\s*>/gi, (m, href, tag) => img(tag, absolute(href, base)));
  h = h.replace(/<img\b[^>]*>/gi, tag => img(tag, ''));
  // Links: their words stay in the text; one that is a whole line becomes a link block.
  h = h.replace(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (m, href, inner) => {
    const url = absolute(href, base);
    const t = text(inner);
    return /^https?:/.test(url) && t ? token({ k: 'link', t, url }) : inner;
  });
  const segs = h
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (m, n, t) => `\u0001\u0003h${t}\u0001`)
    .replace(/<li\b[^>]*>/gi, '\u0001\u0003l')
    .replace(/<\/?(p|div|section|article|ul|ol|li|dl|dt|dd|blockquote|pre|tr|main|form|center)\b[^>]*>/gi, '\u0001')
    .split('\u0001');
  for (const seg of segs) {
    const kind = seg.startsWith('\u0003h') ? 'h' : seg.startsWith('\u0003l') ? 'li' : 'p';
    const body = kind === 'p' ? seg : seg.slice(2);
    const only = body.trim().match(/^\u0000(\d+)\u0000$/);
    if (only) {
      const o = objs[+only[1]];
      out.push(o.k === 'link' && kind === 'h' ? { k: 'h', t: o.t } : o);
      continue;
    }
    // Pictures and tables inside a line split it; links read as their words.
    let line = '';
    const flush = () => {
      const t = flat(line).replace(/[ \t\u3000]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (t) out.push({ k: kind, t });
      line = '';
    };
    for (const part of body.split(/(\u0000\d+\u0000)/)) {
      const m = part.match(/^\u0000(\d+)\u0000$/);
      if (!m) line += part;
      else if (objs[+m[1]].k === 'link') line += objs[+m[1]].t.replace(/</g, '&lt;');
      else flush(), out.push(objs[+m[1]]);
    }
    flush();
  }
  // Repeated breadcrumbs, share bars, button rows and runs of short links (a menu): dropped.
  const seen = new Map();
  for (const b of out) if (b.t) seen.set(b.t, (seen.get(b.t) || 0) + 1);
  const menu = (b, i) => b.k === 'link' && b.t.length <= 10 && [out[i - 1], out[i + 1]].some(x => x?.k === 'link' && x.t.length <= 10);
  return out.filter((b, i) => !(b.t && seen.get(b.t) > 2 && b.t.length < 12) && !menu(b, i) && !(b.t && /^(:::|.{0,8}(按鈕|功能)區)$/.test(b.t)));
}

// A ruling's text: the court's own line breaks kept, its padding spaces not.
function rulingBlocks(part) {
  const lines = unescape(
    part
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map(l => l.replace(/[ \u00a0]+$/g, '').replace(/^[ \u00a0]+/, m => (m.length > 1 ? '　' : '')));
  const t = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return t ? [{ k: 'pre', t }] : [];
}

const DATE = /(?:發布|發佈|公告|公布|更新|上版|刊登|新聞)?日期\s*[:：]?\s*(\d{2,4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/;
function dateOf(h) {
  const m = text(h).match(DATE);
  if (!m) return '';
  const y = +m[1] < 1000 ? +m[1] + 1911 : +m[1];
  return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

const SITE_TAIL = /\s*[-|｜－–—_:：]\s*[^-|｜－–—_:：]{2,30}$/;
function titleOf(html, part) {
  const h1 = part.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]\s*>/i)?.[1];
  if (h1 && text(h1).length >= 4) return text(h1);
  const og = html.match(/<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)/i)?.[1];
  if (og) return text(og).replace(SITE_TAIL, '');
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return t ? text(t).replace(SITE_TAIL, '') : '';
}

// Attachments: links to documents, by name.
const FILE = /\.(pdf|docx?|odt|xlsx?|ods|pptx?|odp|zip)(?:$|[?#])/i;
function filesOf(part, base) {
  const out = [];
  const seen = new Set();
  for (const m of part.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const url = absolute(m[1], base);
    const name = text(m[2]) || m[0].match(/title\s*=\s*["']([^"']+)/i)?.[1] || '';
    if (!url || seen.has(url) || !/^https?:/.test(url)) continue;
    if (FILE.test(url) || /download|filedownload|DownloadFile|GetFile|附件/i.test(url + name)) {
      seen.add(url);
      out.push({ name: name || url.split('/').pop(), url });
    }
  }
  return out.slice(0, 30);
}

// Lines a site broke at a fixed width, joined back: a line that runs on
// (no closing punctuation) joins the next unless that one starts a new item.
const ENDS = /[。：；！？」』）)、，.:;!?]$/;
const STARTS = /^(?:[（(]?[一二三四五六七八九十百0-9０-９]+[、.．)）]|第\S{1,8}[條章節款項]|[•●○◎※■□▲＊*-]|附件|附表)/;
export function unwrap(t) {
  const lines = String(t).split(/\n+/);
  if (lines.length < 3) return t;
  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev != null && prev.length >= 15 && !ENDS.test(prev) && !STARTS.test(l.trim())) out[out.length - 1] = prev + l.trim();
    else out.push(l);
  }
  return out.join('\n');
}

const END = /^(相關(內容|新聞|連結|資訊|文章|法規)|延伸閱讀|回上一頁|回上頁|上一則|下一則|上一篇|下一篇|友善列印|分享至?|列印)\s*[:：]?$/;
const GENERIC = /全球資訊網|^首頁|歡迎(蒞臨|光臨)|入口網|^法規內容$|查詢結果|資料庫$|共用系統/;
export function readPage(html, url = '') {
  const page = String(html || '');
  const part = mainPart(page);
  const judgment = /class\s*=\s*["'](htmlcontent|[^"']*text-pre\b)/i.test(part.slice(0, 200));
  const blocks = judgment ? rulingBlocks(part) : blocksOf(part, url);
  let title = titleOf(page, part);
  if (judgment) title = blocks[0]?.t.split('\n').filter(Boolean).slice(0, 2).join(' ') || title;
  // Past "相關內容", "上一則" and the like is the site, not the page.
  const end = blocks.findIndex((b, i) => i > 0 && b.t && END.test(b.t));
  if (end > 0) blocks.length = end;
  // A site's name is no title: the page's first short line is.
  if (!title || GENERIC.test(title)) {
    const named = blocks[0]?.rows?.find(r => /名稱|標題|主旨/.test(r[0] || ''))?.[1];
    const first = named || (blocks[0] && (blocks[0].t || blocks[0].rows?.[0]?.join(' ').trim()));
    if (named && first.length >= 4) title = first;
    else if (first && first.length >= 6 && first.length <= 80) (title = first), blocks.shift();
  }
  // A title with the site's section in front (「新聞稿-…」) is the page's first line without it.
  for (let i = 0; i < 2 && i < blocks.length; i++) {
    const t = blocks[i].t;
    if (t && t.length >= 6 && t !== title && title.endsWith(t)) {
      title = t;
      break;
    }
  }
  // A line that only repeats the title isn't drawn twice.
  const body = blocks.filter((b, i) => !(i < 2 && b.t === title));
  let files = judgment ? [] : filesOf(part, url);
  // Attachments kept beside the article, in their own list.
  if (!judgment && !files.length)
    for (const m of clean(page).matchAll(/<(div|ul|section)\b[^>]*class\s*=\s*["'][^"']*(file|download|attach)[^"']*["'][^>]*>/gi)) files.push(...filesOf(element(clean(page), m.index), url));
  files = files.filter((f, i) => files.findIndex(g => g.url === f.url) === i).slice(0, 30);
  return { title, date: dateOf(page), blocks: body.map(b => (b.t ? { ...b, t: unwrap(b.t) } : b)), files };
}

// A page worth showing: some words beyond its title.
export const hasText = r => r.blocks.reduce((n, b) => n + (b.rows ? b.rows.flat().join('').length : b.k === 'img' ? 30 : (b.t || '').length), 0) >= 30;
