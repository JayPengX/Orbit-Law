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
