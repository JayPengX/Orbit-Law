// 拍合約幫你看: what code does around the two AI steps (the proxy's
// law-contract-read and law-contract, Orbit-Core law-ai.js).
//   splitClauses(text)   pasted text into clauses by their numbers (第三條, 三、, 3.), no AI
//   sidesOf(read)        whose side the reader may be on, from the paper's own parties
//   LEVELS, levelCounts  the flags' three kinds and how many of each
//   cleanCheck(out)      the check's answer made safe to draw

export const LEVELS = {
  void: { zh: '違法或無效', en: 'Against the law', tone: 'red' },
  unfair: { zh: '對你不公平', en: 'Unfair to you', tone: 'orange' },
  check: { zh: '要注意', en: 'Watch out', tone: 'blue' }
};
export const KIND_NAMES = { rent: ['租屋契約', 'Lease'], work: ['工作契約', 'Job contract'], pledge: ['切結書、同意書', 'Pledge or consent'], other: ['契約', 'Contract'] };
export const CONTRACT_MAX = { chars: 14_000, files: 8, bytes: 5_600_000, pdf: 5_500_000 };

const CN = '一二三四五六七八九十百零〇';
// A clause's own number at the start of a line: 第三條, 第3條, 三、, 3. 3、 (3) （三）.
const HEAD = new RegExp(`^\\s*(第\\s*[${CN}\\d]+\\s*條|[${CN}]{1,4}\\s*[、.．]|\\d{1,3}\\s*[、.．)）](?!\\d)|[（(]\\s*[${CN}\\d]{1,3}\\s*[)）])`);

// Pasted text into clauses: a new one at each line that starts with a number of
// the same kind as the first (so a clause's own 1. 2. stay inside it). The
// words before the first numbered line are their own clause (the opening).
export function splitClauses(text) {
  const lines = String(text || '').replace(/\r/g, '').replace(/　/g, ' ').split('\n').map(l => l.trimEnd());
  const kindOf = h => (/^第/.test(h) ? 'art' : /^[（(]/.test(h) ? 'paren' : /^\d/.test(h) ? 'arabic' : 'cn');
  let top = null;
  const out = [];
  let cur = null;
  for (const l of lines) {
    if (!l.trim()) continue;
    const m = l.match(HEAD);
    const k = m ? kindOf(m[1].trim()) : null;
    if (m && !top) top = k;
    if (m && k === top) {
      cur = { n: m[1].replace(/\s+/g, '').replace(/[、.．)）]$/, ''), text: l.trim() };
      out.push(cur);
    } else if (cur) cur.text += `\n${l.trim()}`;
    else out.push((cur = { n: '', text: l.trim() }));
  }
  // (No numbers at all: each paragraph a clause.)
  if (!top) return String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(t => ({ n: '', text: t.trim().slice(0, 1200) })).filter(c => c.text.replace(/\s/g, '').length >= 2);
  return out.map(c => ({ n: c.n, text: c.text.slice(0, 1200) })).filter(c => c.text.replace(/\s/g, '').length >= 2);
}

// Pasted words' kind (as the proxy's law-ai.js contractKind reads them): their sides and articles follow.
export function contractKind(t) {
  const s = String(t || '');
  if (/切結|保證書|同意書|承諾書/.test(s)) return 'pledge';
  if (/出租人|承租人|租金|房東|房客|租賃/.test(s)) return 'rent';
  if (/雇主|勞工|工資|時薪|薪資|勞動|僱傭|打工|受僱/.test(s)) return 'work';
  return 'other';
}

// The sides to pick from: the paper's own parties ('承租人（房客）'), else its kind's two.
const DEFAULT_SIDES = { rent: [['承租人', '房客'], ['出租人', '房東']], work: [['勞工', '員工'], ['雇主', '老闆']], pledge: [['立書人', '寫切結書的人'], ['收受人', '收到的一方']], other: [['甲方', ''], ['乙方', '']] };
export function sidesOf({ kind = 'other', parties = [] } = {}) {
  const own = (Array.isArray(parties) ? parties : []).filter(p => p?.role).slice(0, 4).map(p => ({ side: String(p.role).replace(/\s+/g, ''), who: String(p.who || '') }));
  const list = own.length >= 2 ? own : (DEFAULT_SIDES[kind] || DEFAULT_SIDES.other).map(([side, who]) => ({ side, who }));
  return list.map(x => ({ ...x, label: x.who && !x.side.includes(x.who) ? `${x.side}（${x.who}）` : x.side }));
}

// The clauses as the proxy will number them (law-ai.js law-contract input): each trimmed,
// one too short or past the whole's size left out, so a flag's number is the reader's clause.
export function prepClauses(clauses) {
  const out = [];
  let chars = 0;
  for (const c of (Array.isArray(clauses) ? clauses : []).slice(0, 80)) {
    const text = String(c?.text ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, 1200);
    if (text.length < 2 || chars + text.length > CONTRACT_MAX.chars) continue;
    chars += text.length;
    out.push({ n: String(c?.n || '').trim().slice(0, 16), text });
  }
  return out;
}

export const levelCounts = flags => Object.fromEntries(Object.keys(LEVELS).map(k => [k, (flags || []).filter(f => f.level === k).length]));

const str = v => (typeof v === 'string' ? v.trim() : '');
const CITE = /^[A-Z]\d{7}:\d{1,4}(-\d{1,3})?$/;
// The check's answer made safe to draw: flags on clauses that were sent, cites in the right shape.
export function cleanCheck(out, clauses) {
  const n = Array.isArray(clauses) ? clauses.length : 0;
  const cites = x => (Array.isArray(x) ? x.map(String).filter(c => CITE.test(c)).slice(0, 4) : []);
  const flags = (Array.isArray(out?.flags) ? out.flags : [])
    .filter(f => Number.isInteger(f?.clause) && f.clause >= 1 && f.clause <= n && LEVELS[f.level] && str(f.what))
    .map(f => ({ clause: f.clause, level: f.level, what: str(f.what), why: str(f.why), ask: str(f.ask), cites: cites(f.cites) }));
  const missing = (Array.isArray(out?.missing) ? out.missing : []).filter(m => str(m?.what)).map(m => ({ what: str(m.what), cites: cites(m.cites) }));
  const laws = {};
  for (const [k, v] of Object.entries(out?.laws || {})) if (CITE.test(k) && Array.isArray(v)) laws[k] = [str(v[0]), str(v[1])];
  return { summary: str(out?.summary), flags, missing, laws, checked: Number(out?.checked) || 0 };
}

// A file's bytes as base64, for the proxy (a PDF as it is; a photo goes through the kit's aiPicture).
export async function fileBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
