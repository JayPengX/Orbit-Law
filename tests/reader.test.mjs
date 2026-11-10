import test from 'node:test';
import assert from 'node:assert/strict';
import { readable, readPage, unwrap, hasText, fieldRows, namesIn } from '../public/lib/reader.mjs';

test('readable: government sites only', () => {
  assert.equal(readable('https://www.mol.gov.tw/1607/x'), true);
  assert.equal(readable('http://www.ocac.gov.tw/a?b=1&amp;c=2'), true);
  assert.equal(readable('https://www.edu.tw/News_Content.aspx'), true);
  assert.equal(readable('https://evilgov.tw/'), false);
  assert.equal(readable('https://www.youtube.com/'), false);
  assert.equal(readable('javascript:alert(1)'), false);
});

test('readPage: the article, not the menu', () => {
  const html = `<html><head><title>某部全球資訊網</title></head><body>
    <div class="menu"><ul><li><a href="/a">本部簡介</a></li><li><a href="/b">組織職掌</a></li><li><a href="/c">新聞</a></li></ul></div>
    <div class="cp"><h2>最低工資調整公告</h2><p>發布日期：115-10-16</p>
    <p>自116年1月1日起，每月最低工資調整為新臺幣30,900元，每小時最低工資調整為新臺幣205元。</p>
    <p>附件：<a href="/files/notice.pdf">公告全文</a></p>
    <a href="https://x.gov.tw/news/1"><img src="/media/pic.jpg" alt="最低工資連11年調漲"></a></div>
    <footer><p>版權所有</p></footer></body></html>`;
  const r = readPage(html, 'https://www.mol.gov.tw/news/1/');
  assert.equal(r.title, '最低工資調整公告');
  assert.equal(r.date, '2026-10-16');
  assert.ok(r.blocks.some(b => b.k === 'p' && b.t.includes('30,900')));
  assert.ok(!r.blocks.some(b => b.t === '本部簡介'));
  assert.deepEqual(r.files, [{ name: '公告全文', url: 'https://www.mol.gov.tw/files/notice.pdf' }]);
  const pic = r.blocks.find(b => b.k === 'img');
  assert.equal(pic.src, 'https://www.mol.gov.tw/media/pic.jpg');
  assert.equal(pic.href, 'https://x.gov.tw/news/1');
  assert.ok(hasText(r));
});

test('readPage: a ruling keeps its lines', () => {
  const html = `<div class="htmlcontent"><div>最高法院刑事判決</div><div>115年度台上字第3024號</div><div>上&nbsp;&nbsp;訴&nbsp;&nbsp;人&nbsp;&nbsp;吳某</div><div>主文</div><div>上訴駁回。</div></div>`;
  const r = readPage(html, 'https://judgment.judicial.gov.tw/FJUD/data.aspx');
  assert.equal(r.title, '最高法院刑事判決 115年度台上字第3024號');
  assert.equal(r.blocks[0].k, 'pre');
  assert.match(r.blocks[0].t, /主文\n上訴駁回。/);
});

test('readPage: tables stay tables, a rule named by its info table', () => {
  const html = `<title>法規內容</title><div class="law-reg-content"><table><tr><td>法規名稱：</td><td>某某作業要點</td></tr><tr><td>修正日期：</td><td>民國 114 年 12 月 29 日</td></tr></table><div>一、本要點依某法第三條規定訂定之。</div></div>`;
  const r = readPage(html, 'https://law.moa.gov.tw/LawContent.aspx?id=1');
  assert.equal(r.title, '某某作業要點');
  assert.equal(r.blocks[0].k, 'table');
});

test('unwrap: fixed-width lines join, new items do not', () => {
  assert.equal(unwrap('一、為維護金融機構財務健全，上市上櫃之金融機構依據證券交易法第二\n十八條之二規定辦理。\n二、下一點。\n三、再一點。'), '一、為維護金融機構財務健全，上市上櫃之金融機構依據證券交易法第二十八條之二規定辦理。\n二、下一點。\n三、再一點。');
});

test('reader: a form’s label and value lines are one card of fields', () => {
  const p = t => ({ k: 'p', t });
  const rows = fieldRows([p('案 別：'), p('一般議案'), p('提 案 人：'), p('蔡志環'), p('連署人：邱坤楠、上官秋燕'), p('案 由：'), p('建請縣府協調交通部公路局。')]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].rows.map(r => r[0]), ['案別', '提案人', '連署人', '案由']);
  // A lone "說明：" line stays as it is.
  assert.deepEqual(fieldRows([p('說明：'), p('一、本案…')]).map(b => b.k), ['p', 'p']);
  assert.deepEqual(namesIn('連署人', '邱坤楠、上官秋燕'), ['邱坤楠', '上官秋燕']);
  assert.equal(namesIn('案由', '建請縣府協調交通部公路局'), null);
});

test('reader: a site-named page takes its first heading as title and a lone date line as its date', () => {
  const html = '<html><head><title>新竹縣議會全球資訊中文網</title></head><body><main><p>2026-11-10</p><h3>行政類乙29號</h3><p>案 別：</p><p>一般議案</p><p>類 別：</p><p>行政類</p><p>案 由：</p><p>針對紀錄片於本縣播映遭到跨境恐嚇，建請縣府採取積極保護措施。</p></main></body></html>';
  const r = readPage(html, 'https://www.hcc.gov.tw/proposal-detail?article=5999');
  assert.equal(r.title, '行政類乙29號');
  assert.equal(r.date, '2026-11-10');
  assert.equal(r.blocks[0].k, 'dl');
});
