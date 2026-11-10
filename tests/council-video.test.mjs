// A council's video (public/lib/council-video.mjs): each council's way of naming a recording, read the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, partOf, cleanTitle, compactHinet, ytVideos, videosOf, sittingsFromVideo } from '../public/lib/council-video.mjs';

test('council video: the day of a recording, however its title writes it', () => {
  assert.equal(dayOf('新竹縣議會第20屆第8次定期會11/6下午', '2026-11-06 16:30:56'), '2026-11-06');
  assert.equal(dayOf('苗栗縣議會第 20 屆第 8 次定期會議事日程表(115.10.29)鄭碧玉 縣政總質詢', '2026-10-29 12:02'), '2026-10-29');
  assert.equal(dayOf('1151110金門縣議會第八屆第8次定期會-3', '2026-11-10T09:00'), '2026-11-10');
  assert.equal(dayOf('20261013(上午)聯席審查-116年度臺南市總預算', '2026-10-14'), '2026-10-13');
  assert.equal(dayOf('[1151012PM]審查議案', '2026-10-12'), '2026-10-12');
  // Posted in January, held in December: last year.
  assert.equal(dayOf('第19屆第13次臨時會12/28下午', '2027-01-03 09:00'), '2026-12-28');
  // Nothing in the title: the day it was posted.
  assert.equal(dayOf('程序委員會', '2026-09-30 10:00'), '2026-09-30');
});

test('council video: 上午 or 下午, and a bare stamp by its hour', () => {
  assert.equal(partOf('第8次定期會11/6下午'), '下午');
  assert.equal(partOf('[1151012AM]審查議案'), '上午');
  assert.equal(partOf('苗栗縣議會20261105081348'), '上午');
  assert.equal(partOf('第8次定期會'), '');
});

test('council video: a title says what the sitting was, without the council, term, date or part', () => {
  assert.equal(cleanTitle('新竹縣議會第20屆第8次定期會11/6下午', '新竹縣議會'), '第8次定期會');
  assert.equal(cleanTitle('苗栗縣議會第 20 屆第 8 次定期會議事日程表(115.10.28)鄭聚然 、黃芳椿 縣政總質詢 縣政總質詢', '苗栗縣議會'), '第8次定期會 鄭聚然、黃芳椿縣政總質詢');
  assert.equal(cleanTitle('20261013(上午)聯席審查-116年度臺南市總預算暨附屬單位預算案', '臺南市議會'), '聯席審查 · 116年度臺南市總預算暨附屬單位預算案');
  assert.equal(cleanTitle('1151110金門縣議會第八屆第8次定期會-3', '金門縣議會'), '第8次定期會（3）');
  assert.equal(cleanTitle('苗栗縣議會20261105121348', '苗栗縣議會'), '');
});

const hinet = (title, extra = {}) => ({ id: 4345, title, description: '審議縣府及議員提案', createTime: '2026-11-06 16:30:56', vodDisplayStatus: 'Show', terms: [{ name: '定期會', taxonomy: 'TAG' }], streamingJob: { endpoint_set: ['https://hcc-ott2b.cdn.hinet.net/vod_hcc/x/playlist.m3u8'], thumbnail_endpoint: 'https://image-ott2b.cdn.hinet.net/t.jpg' }, ...extra });

test('council video: a HiNet recording, compact; a bare stamp or a hidden one left out', () => {
  assert.deepEqual(compactHinet(hinet('新竹縣議會第20屆第8次定期會11/6下午'), '新竹縣議會'), { id: 'h4345', d: '2026-11-06', t: '下午', n: '第8次定期會', what: '審議縣府及議員提案', tags: ['定期會'], hls: 'https://hcc-ott2b.cdn.hinet.net/vod_hcc/x/playlist.m3u8', img: 'https://image-ott2b.cdn.hinet.net/t.jpg' });
  assert.equal(compactHinet(hinet('苗栗縣議會20261105121348', { description: '苗栗縣議會20261105121348' }), '苗栗縣議會'), null);
  assert.equal(compactHinet(hinet('第8次定期會', { vodDisplayStatus: 'Hide' })), null);
  assert.equal(compactHinet({ title: 'x', streamingJob: {} }), null);
});

test('council video: a YouTube feed, meetings only, newest first, its day in Taiwan', () => {
  const entry = (id, title, at) => `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><published>${at}</published></entry>`;
  const xml = `<feed><title>澎湖縣議會</title>${entry('a1', '[1151012AM]審查議案', '2026-10-12T01:00:00+00:00')}${entry('a2', '1151109 民議新聞 縣議員發送小物', '2026-11-09T02:00:00+00:00')}${entry('a3', '[1151013AM]審查議案、閉幕 &amp; 臨時動議', '2026-10-13T01:00:00+00:00')}</feed>`;
  const v = ytVideos(xml, '澎湖縣議會');
  assert.deepEqual(v.map(x => [x.yt, x.d, x.t, x.n]), [['a3', '2026-10-13', '上午', '審查議案、閉幕 & 臨時動議'], ['a1', '2026-10-12', '上午', '審查議案']]);
});

test('council video: a sitting finds its recording; days past the council’s list become sittings', () => {
  const vids = [{ id: 'h3', d: '2026-11-06', t: '下午', n: '第8次定期會', what: '審議縣府及議員提案' }, { id: 'h2', d: '2026-11-05', t: '', n: '第8次定期會' }, { id: 'h1', d: '2026-10-30', t: '下午', n: '第8次定期會' }];
  assert.deepEqual(videosOf(vids, { d: '2026-10-30', t: '下午' }).map(v => v.id), ['h1']);
  assert.deepEqual(videosOf(vids, { d: '2026-10-30', t: '上午' }), []);
  assert.deepEqual(videosOf(vids, { d: '2026-11-05', t: '上午' }).map(v => v.id), ['h2']);
  const add = sittingsFromVideo([{ d: '2026-10-30', t: '下午' }], vids, '2026-11-10');
  assert.deepEqual(add.map(x => [x.d, x.t, x.what]), [['2026-11-06', '下午', '審議縣府及議員提案'], ['2026-11-05', '', '第8次定期會']]);
  // Never a day after today.
  assert.deepEqual(sittingsFromVideo([], vids, '2026-11-01').map(x => x.d), ['2026-10-30']);
});
