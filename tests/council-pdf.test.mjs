// A council bill's PDF, read into its parts (public/lib/council.mjs billPdfParts): 新竹縣's and 新竹市's forms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { billPdfParts, textBucket, TEXT_BUCKETS } from '../public/lib/council.mjs';

// 新竹縣議會: rows named a character a line, centred, the 決議's sitting in 【】.
const HSQ = `             新竹縣議會議員提案

中華民國 115 年 10 月 29 日   編   號 教育類乙 316 號


提案人：蔡蕥鍹                連署人：陳栢誠、吳菊花、甄克堅

案 建請縣府強化學校營養午餐資訊公開，建立即時查詢及食材
  追溯機制，
由
  提升校園午餐資訊透明度。
  一、 學生每天在校用餐，營養午餐與學生健康及成長密切相
     關。
  二、 目前學校已有相關午餐資訊公開措施，建請縣府進一步
說    整合。
  三、 建請研議利用既有午餐平台，
明
     提升學校午餐資訊透明。

辦
    如案由及說明。
法

決 照案通過。

議 【本案于第 20 屆第 8 次定期會第 23 次會議議決(115 年 11 月 6 日)】
`;

// 新竹市議會: rows named a line each, set double-spaced, the sitting under the table.
const HSZ = `    新竹市議會第 11 屆第 8 次定期會議員提案表

類   別    民政   財政   建設   教育   案號 民政類乙 111955 號

                             孫鍚洲、宋品瑩、陳慶齡
提案人       李國璋       連署人
                             吳旭豐


         建請市府評估於慈祥路靠近公道五路二段周邊適當位

案    由 置增設監視器，以提升居

         民夜間通行安全。



         據民眾反映，慈祥路靠近公道五路二段周邊，該路段為

說    明 附近居民日常通行之處，

         不僅影響環境整潔，也恐造成行人受傷。



辦    法



大會決議 送請市府依規辦理。


備註：提案人須有 4 人以上連署。        本 案 於 115 年 10 月 6 日 上 午
                         第 11 屆第 8 次定期會第 19 次會議決議
`;

test('council PDF: 新竹縣’s form, its rows told apart though their names sit mid-row', () => {
  assert.deepEqual(billPdfParts(HSQ), {
    案號: '教育類乙316號',
    日期: '2026-10-29',
    案由: '建請縣府強化學校營養午餐資訊公開，建立即時查詢及食材追溯機制，提升校園午餐資訊透明度。',
    說明: '一、學生每天在校用餐，營養午餐與學生健康及成長密切相關。\n二、目前學校已有相關午餐資訊公開措施，建請縣府進一步整合。\n三、建請研議利用既有午餐平台，提升學校午餐資訊透明。',
    辦法: '如案由及說明。',
    議決: '照案通過。',
    議決會議: '第20屆第8次定期會第23次會議',
    議決日期: '2026-11-06'
  });
});

test('council PDF: 新竹市’s form, double-spaced, its sitting under the table', () => {
  assert.deepEqual(billPdfParts(HSZ), {
    案號: '民政類乙111955號',
    案由: '建請市府評估於慈祥路靠近公道五路二段周邊適當位置增設監視器，以提升居民夜間通行安全。',
    說明: '據民眾反映，慈祥路靠近公道五路二段周邊，該路段為附近居民日常通行之處，不僅影響環境整潔，也恐造成行人受傷。',
    議決: '送請市府依規辦理。',
    議決會議: '第11屆第8次定期會第19次會議',
    議決日期: '2026-10-06'
  });
});

test('council PDF: a bill’s text is kept in one of a fixed set of files, the same one every time', () => {
  assert.equal(textBucket('hsq-p6034'), textBucket('hsq-p6034'));
  const all = new Set(Array.from({ length: 500 }, (_, i) => textBucket(`hsq-p${i}`)));
  assert.ok([...all].every(n => n >= 0 && n < TEXT_BUCKETS) && all.size > TEXT_BUCKETS / 2);
});

test('council text: a bill’s list day is the day it was decided (新竹縣 posts days later)', async () => {
  const { decidedDays } = await import('../public/lib/council.mjs');
  // (The bill Jay found: listed 11/10, its 議決 line 第20屆第8次定期會第23次會議 · 11/6.)
  const known = id => ({ 'hsq-p5973': { 議決: '照案通過。', 議決會議: '第20屆第8次定期會第23次會議', 議決日期: '2026-11-06' } })[id];
  const rows = [{ id: 'hsq-p5973', d: '2026-11-10' }, { id: 'hsq-p1', d: '2026-11-10' }];
  assert.equal(decidedDays(rows, known), 1);
  assert.deepEqual(rows.map(r => r.d), ['2026-11-06', '2026-11-10']);
  const list = [{ 代碼: 'hsq-p5973', 日期: '2026-11-10' }];
  decidedDays(list, known, '日期', '代碼');
  assert.equal(list[0]['日期'], '2026-11-06');
});

test('新竹縣\'s 決議 set without a gap is still the decision; one read by the older reader is taken back out', async () => {
  const { billPdfParts, fixDecision } = await import('../public/lib/council.mjs');
  const text = `                新竹縣議會提案\n中華民國 115 年 10 月 11 日   編 號   長照類乙 34 號\n          連署人：甲、乙\n提案人：丙\n\n 案   建請縣府調高老人年金領取資格。\n 由\n\n 說   一. 今年物價漲幅已達標。\n 明\n\n 辦法   如案由及說明。\n\n\n      照案通過。\n 決議\n       【本案于第 20 屆第 8 次定期會第 23 次會議議決(115 年 11 月 6 日)】\n`;
  const p = billPdfParts(text);
  assert.equal(p['議決'], '照案通過。');
  assert.equal(p['辦法'], '如案由及說明。');
  assert.equal(p['議決日期'], '2026-11-06');
  const old = fixDecision({ 辦法: '如案由及說明。\n照案通過。決議\n【本案于第20屆第8次定期會第23次會議議決(115年11月6日)】' });
  assert.deepEqual([old['辦法'], old['議決'], old['議決會議'], old['議決日期']], ['如案由及說明。', '照案通過。', '第20屆第8次定期會第23次會議', '2026-11-06']);
  assert.equal(fixDecision({ 說明: '一、本案敬請大會決議' })['議決'], undefined, 'asking for a decision is not one');
});
