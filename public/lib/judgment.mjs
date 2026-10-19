// 判決書: a 司法院 judgment page read into its parts, so it opens on the
// outcome (主文) in plain words, then who, then the reasons one point at a
// time, not as one wall of text. Two page shapes: newer ones are one <div>
// per paragraph inside .htmlcontent; older ones are a fixed-width .text-pre.

const unescape = s =>
  String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
const squash = s => s.replace(/[\s　]+/g, '');
const tidy = s => s.replace(/[ \t ]+/g, ' ').replace(/　+/g, '　').trim();

// A paragraph that starts a point of its own: 一、 （一） (1) 1. or a 2-space indent.
const POINT = /^[　 ]*([一二三四五六七八九十百]+、|[（(][一二三四五六七八九十\d]+[)）]|\d+[.、])/;
const HEAD = { main: /^主文$/, reasons: /^(理由|事實及理由|事實|事實及理由要領|理由要領)$/ };

// The page's paragraphs, in order.
export function linesOf(html) {
  const s = String(html || '');
  const at = s.indexOf('class="htmlcontent"');
  if (at >= 0) {
    const part = s.slice(at, s.indexOf('id="JudrelaLaw"', at) > 0 ? s.indexOf('id="JudrelaLaw"', at) : undefined);
    return [...part.matchAll(/<div[^>]*>((?:(?!<div)[\s\S])*?)<\/div>/g)].map(m => tidy(unescape(m[1]))).filter(Boolean);
  }
  const pre = s.match(/class="text-pre[^"]*">([\s\S]*?)<\/div>/);
  if (!pre) return [];
  // Fixed-width lines: joined back into paragraphs.
  const out = [];
  for (const raw of unescape(pre[1].replace(/<!--[\s\S]*?-->/g, '')).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const t = tidy(line);
    const head = Object.values(HEAD).some(r => r.test(squash(t)));
    const starts = !out.length || head || POINT.test(line) || /^[　]{2}/.test(line) || /^中\s*華\s*民\s*國/.test(t) || Object.values(HEAD).some(r => r.test(squash(out[out.length - 1])));
    if (starts) out.push(t);
    else out[out.length - 1] += t;
  }
  return out;
}

// The outcome in a few plain words (and a tone for its colour).
export function outcome(main) {
  const m = String(main);
  if (/發回/.test(m)) return { label: '發回重審', tone: 'orange' };
  if (/原判決.*撤銷|撤銷原判決|原裁定.*撤銷/.test(m)) return { label: '原判決撤銷', tone: 'orange' };
  if (/無罪/.test(m)) return { label: '無罪', tone: 'green' };
  if (/處有期徒刑|處拘役|處罰金|處無期徒刑|處死刑/.test(m)) return { label: '有罪', tone: 'red' };
  if (/上訴駁回|抗告駁回|聲請駁回|訴駁回|再審之聲請駁回|駁回/.test(m)) return { label: '駁回', tone: 'gray' };
  if (/返還/.test(m)) return { label: '要返還', tone: 'indigo' };
  if (/應給付|應賠償/.test(m)) return { label: '要給付', tone: 'indigo' };
  if (/不受理/.test(m)) return { label: '不受理', tone: 'gray' };
  return { label: '', tone: 'gray' };
}

// { title, no, kind, parties, main, reasons: [{ head, text }], date, judges }
export function readJudgment(html) {
  const lines = linesOf(html);
  const flat = lines.map(squash);
  const iMain = flat.findIndex(l => HEAD.main.test(l));
  const iWhy = flat.findIndex((l, i) => i > iMain && HEAD.reasons.test(l));
  const iDate = flat.findIndex((l, i) => i > Math.max(iMain, iWhy) && /^中華民國\d+年\d+月\d+日$/.test(l));
  const title = squash(lines[0] || '');
  const no = lines.find(l => /\d+年度.+字第\d+號/.test(l))?.match(/\d+年度.+?字第\d+號/)?.[0] || '';
  const kind = /裁定/.test(title) ? '裁定' : /判決/.test(title) ? '判決' : '';
  const start = lines.findIndex(l => l.includes(no)) + 1 || 1;
  const parties = iMain > 0 ? lines.slice(start, iMain) : [];
  const end = iDate > 0 ? iDate : lines.length;
  const main = iMain >= 0 ? lines.slice(iMain + 1, iWhy > 0 ? iWhy : end) : [];
  // The reasons, one point at a time (a point carries the paragraphs under it).
  const reasons = [];
  for (const l of iWhy > 0 ? lines.slice(iWhy + 1, end) : []) {
    if (/^[一二三四五六七八九十百]+、/.test(l) || !reasons.length) reasons.push({ head: l.match(/^([一二三四五六七八九十百]+)、/)?.[1] || '', text: l });
    else reasons[reasons.length - 1].text += '\n' + l;
  }
  const dateLine = iDate > 0 ? flat[iDate].match(/^中華民國(\d+)年(\d+)月(\d+)日$/) : null;
  const date = dateLine ? `${Number(dateLine[1]) + 1911}-${dateLine[2].padStart(2, '0')}-${dateLine[3].padStart(2, '0')}` : '';
  const judges = iDate > 0 ? lines.slice(iDate + 1).filter(l => /法\s*官|審判長/.test(l)).map(l => l.replace(/.*法\s*官\s*/, '').replace(/\s+/g, '')).filter(Boolean) : [];
  return { title, no, kind, parties, main, reasons, date, judges };
}

// Who is in it, briefly: the first names by role (上訴人 吳國鴻 等 52 人).
export function partiesLine(parties, max = 2) {
  const roles = new Map();
  let role = '';
  for (const p of parties) {
    const m = p.match(/^([上被原再抗聲相][\s　]*[訴告請][\s　]*人|被[\s　]*告|原[\s　]*告|聲[\s　]*請[\s　]*人|抗[\s　]*告[\s　]*人|上[\s　]*訴[\s　]*人|被[\s　]*上[\s　]*訴[\s　]*人)[\s　]*(.*)$/);
    if (m) role = squash(m[1]);
    if (!role || /律師|代理人|代表人|辯護人|共同|上列|如下/.test(squash(p))) continue;
    const name = squash(m ? m[2] : p).replace(/（.*?）|\(.*?\)/g, '');
    if (name && name.length <= 30) roles.set(role, [...(roles.get(role) || []), name]);
  }
  return [...roles].map(([r, ns]) => `${r} ${ns.slice(0, max).join('、')}${ns.length > max ? ` 等 ${ns.length} 人` : ''}`);
}
