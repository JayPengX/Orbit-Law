import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory } from '../public/lib/history.mjs';

const H = `1.中華民國七十四年二月二十七日內政部（75）台內勞字第 298124 號令
  訂定發布全文 51 條；並自發布日施行
2.中華民國八十六年六月十二日內政部（86）台勞動一字第 024354 號令
  修正發布第 5、6、8、20、23、37  條條文；增訂第 4-1、20-1、50-1
  、50-2  條條文；並刪除第 28 條條文
3.中華民國九十一年一月十六日行政院勞工委員會（91）勞動一字第 091
  0001337 號令修正發布第 3、4、20-1、31 條條文
4.中華民國十八年五月二十三日國民政府制定公布總則編全文 152  條；
  並自中華民國十八年十月十日施行
5.中華民國一百零三年一月十五日總統華總一義字第 10300004871  號令
  修正公布第 32～36 條條文
  中華民國一百零三年二月十四日行政院院臺規字第 1030124618 號公告
  第 2  條所列屬「行政院勞工委員會」之權責事項改由「勞動部」管轄`;

test('沿革: each entry its date, order, acts and articles, lines joined even mid-number', () => {
  const [a, b, c, d, e] = parseHistory(H);
  assert.deepEqual(a, { n: 1, date: '1985-02-27', doc: '內政部（75）台內勞字第298124號令', acts: [{ act: '訂定', whole: 51, part: '', arts: [] }], notes: ['自發布日施行'], more: [] });
  assert.equal(b.date, '1997-06-12');
  assert.deepEqual(b.acts.map(x => [x.act, x.arts]), [['修正', ['5', '6', '8', '20', '23', '37']], ['增訂', ['4-1', '20-1', '50-1', '50-2']], ['刪除', ['28']]]);
  assert.equal(c.doc, '行政院勞工委員會（91）勞動一字第0910001337號令');
  assert.deepEqual(c.acts[0].arts, ['3', '4', '20-1', '31']);
  assert.deepEqual([d.doc, d.acts[0].part, d.acts[0].whole, d.notes[0]], ['國民政府', '總則編', 152, '自中華民國十八年十月十日施行']);
  assert.equal(e.date, '2014-01-15');
  assert.deepEqual(e.acts[0].arts, ['32～36']);
  assert.equal(e.more[0].date, '2014-02-14');
  assert.match(e.more[0].doc, /1030124618號公告/);
});
