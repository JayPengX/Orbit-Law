// A 代表會's long papers read in the app (施政報告, 各課室工作報告, 致詞): in parts, each part's lines as items, so a
// paper is a list of what's in it, each part folded until opened, never a wall of text. By code: a part is one office's
// 工作報告 (「…公所民政課工作報告…」 starts it), else the whole paper is one part. Each part keeps where it lies in the
// text (`from`, `to`), the range the proxy's 重點摘要 reads (Orbit-Core law-town.js, mode 'paper').
//   paperParts(text) → [{ unit, from, to }]
//   partItems(text, part) → [{ k: 'h' | 'p', t, n? (a paragraph's number, 二、) }]

const UNIT = /(?:公所|代表會)([㐀-鿿]{1,8}?(?:課|室|館|所|隊|園|中心|股))工作報告/;

export function paperParts(text) {
  const t = String(text || '');
  const heads = [];
  let at = 0;
  for (const line of t.split('\n')) {
    const m = line.match(UNIT);
    if (m && line.length <= 80) heads.push({ unit: m[1], at });
    at += line.length + 1;
  }
  if (heads.length < 2) return t.trim() ? [{ unit: '', from: 0, to: t.length }] : [];
  const out = [];
  // (What comes before the first office: a part of its own when it's more than a heading.)
  if (t.slice(0, heads[0].at).replace(/各課室工作報告|\s/g, '').length > 40) out.push({ unit: '', from: 0, to: heads[0].at });
  heads.forEach((x, i) => out.push({ unit: x.unit, from: x.at, to: i + 1 < heads.length ? heads[i + 1].at : t.length }));
  return out;
}

// A part's lines as items: a numbered line (一、 (一) 1.) a head with what follows it on the line, the table's column
// line (工作項目計畫要點辦理情形備註) and the part's own heading left out, the rest paragraphs.
const ECHO = /([㐀-鿿][㐀-鿿、]{2,11})\1/g;
const NUMBERED = /^\s*([壹貳參肆伍陸柒捌玖拾]+、|[一二三四五六七八九十]+、|[（(][一二三四五六七八九十]+[)）])\s*/;
export function partItems(text, part) {
  const out = [];
  for (const raw of String(text || '').slice(part.from, part.to).split('\n')) {
    // (A table's two columns read as one line repeat a cell: 「財務管理財務管理業務」, 「辦理里、鄰長辦理里、鄰長(含眷屬)」.)
    const line = raw.replace(/\s{2,}/g, ' ').trim().replace(ECHO, '$1');
    if (!line || /^工作項目|^計畫要點|辦理情形備註$/.test(line) || (part.unit && UNIT.test(line) && line.length <= 80)) continue;
    const m = line.match(NUMBERED);
    if (!m || !/^[壹貳參肆伍陸柒捌玖拾一二三四五六七八九十]/.test(m[1])) {
      out.push({ k: 'p', t: line });
      continue;
    }
    // (The table's columns run together on a line: 「一、財務管理財務管理業務1.編製各項財務報表。」: the head up to the
    // first sub-number or space, the rest a paragraph.)
    const cut = line.slice(m[0].length).search(/\s|\d+[.、]|[（(][一二三四五六七八九十\d]+[)）]/);
    const head = cut > 0 && cut <= 24 ? line.slice(0, m[0].length + cut) : line.length <= 30 ? line : '';
    // (No clean head on a long line: a paragraph with its number marked.)
    if (!head) out.push({ k: 'p', t: line.slice(m[0].length).trim(), n: m[1] });
    else {
      out.push({ k: 'h', t: head.trim() });
      const rest = line.slice(head.length).trim();
      if (rest) out.push({ k: 'p', t: rest });
    }
  }
  return out;
}
