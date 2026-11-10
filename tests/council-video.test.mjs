// A council's video (public/lib/council-video.mjs): each council's way of naming a recording, read the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, partOf, cleanTitle, compactHinet, ytVideos, videosOf, sittingsFromVideo, kccHls, kccName, compactKcc, kmcVids, kmcWho } from '../public/lib/council-video.mjs';

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

test('council video: 高雄\u2019s recordings, its HLS from the file name; a stub under a minute left out', () => {
  assert.equal(kccHls('202610KCC0408R1151014090027VIDEOmp4'), 'https://streamkcc.akamaized.net/vod-http/_definst_/202610/0408R1151014090027.mp4/playlist.m3u8');
  assert.equal(kccHls('202611KCC179367762341555VIDEOmp4'), 'https://streamkcc.akamaized.net/vod-http/_definst_/202611/179367762341555_720.mp4/playlist.m3u8');
  assert.equal(kccHls('nonsense'), '');
  assert.equal(kccName('康裕成議長'), '康裕成');
  assert.equal(kccName('曾俊傑副議長'), '曾俊傑');
  const v = compactKcc({ videoId: '19550', title: '115-10-22 11:13:48 第4屆第8次定期會 二、三讀會', source: '202610KCC0408R1151022111348VIDEOmp4', length: 1334000, publish_time: '2026-11-01 10:00:00', videoLength: '00:22:14' });
  assert.deepEqual([v.id, v.d, v.t, v.n, v.len], ['k19550', '2026-10-22', '上午', '第8次定期會 · 二、三讀會', '22:14']);
  assert.equal(compactKcc({ videoId: '1', title: '115-10-22 16:24:56 第4屆第8次定期會 二、三讀會', source: '202610KCC0408R1151022162456VIDEOmp4', length: 17000 }), null);
});
test('council video: a YouTube channel list read page by page, its sittings dated by their titles, merged over the term', async () => {
  const { ytLockups, ytItems, mergeVids } = await import('../public/lib/council-video.mjs');
  const lock = (id, t, len) => ({ lockupViewModel: { contentId: id, contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: len } }] } }] } }, metadata: { lockupMetadataViewModel: { title: { content: t } } } } });
  const page = { contents: [{ richItemRenderer: { content: lock('a1', '臺中市議會第4屆第8次定期會(市政總質詢) 115年09月29日', '4:27:37') } }, { richItemRenderer: { content: lock('a2', '議長盃路跑活動花絮', '1:00') } }, { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'T1' } } } }] };
  const { items, cont } = ytLockups(page);
  assert.equal(cont, 'T1');
  const v = ytItems(items, '臺中市議會');
  assert.deepEqual(v.map(x => [x.id, x.d, x.n, x.len]), [['ya1', '2026-09-29', '第8次定期會(市政總質詢)', '4:27:37']]);
  assert.equal(dayOf('花蓮縣議會第20屆第8次定期大會 2026年11月9日下午議程'), '2026-11-09');
  assert.equal(dayOf('2026.10.1 桃園市議會第3屆第8次定期會'), '2026-10-01');
  const live = { id: 'yL', d: '2026-09-29', live: 1 };
  const kept = mergeVids([...v, live, { id: 'yL2', d: '2026-09-30', live: 1 }], [{ id: 'yOld', d: '2022-12-01' }, { id: 'yB', d: '2026-01-02' }], '2022-12-25');
  assert.deepEqual(kept.map(x => x.id), ['yL2', 'ya1', 'yB']);
});

test('基隆: its chamber recordings and its 總質詢 by councillor, from the site\'s lists', () => {
  const room = `<a href="https://streamak0104vod.akamaized.net/1151014R3_20_W1304.mp4" target="new" data-width="1080" title="【三讀會：第二、三讀會】【臨時動議】【閉會】(另開新視窗)"> 	
<div class="s22"><table><tr><td><div class="s20"><div class="text1">2026-10-14 13:04<br/>第20屆第8次定期會<br/>【三讀會：第二、三讀會】【臨時動...</div></div></td></tr></table></div></a>`;
  const ask = `<a href="https://streamak0104vod.akamaized.net/1151005Q_20_W0950_何淑萍.mp4"  target="new" data-width="1080" title="民進黨團聯合_陳宜議員,張之豪議員(因本市北寧路發生重大坍方事件)(另開新視窗)"> 	
<div class="s19"><div class="s20"><div class="text1">2026-10-05 09:50<br/> 第20屆第8次定期會<br/>市長施政總質詢<br/>何淑萍議員...</div></div></div></a>`;
  const [r] = kmcVids(room + room);
  assert.deepEqual(r, { id: 'm1151014R3_20_W1304', d: '2026-10-14', t: '下午', n: '第8次定期會 · 三讀會：第二、三讀會 · 臨時動議 · 閉會', hls: 'https://streamak0104vod.akamaized.net/1151014R3_20_W1304.mp4' });
  const [q] = kmcVids(ask);
  assert.equal(q.t, '上午');
  assert.deepEqual(q.who, ['陳宜', '張之豪']);
  assert.deepEqual(kmcWho('林旻勳議員暨跨黨派政團聯合_張耿輝議員,呂美玲'), ['林旻勳', '張耿輝', '呂美玲']);
  assert.deepEqual(kmcWho('楊秀玉副議長'), ['楊秀玉']);
});

test('臺北: a recording read from its own site, its day and hours, its 720p HLS, the agenda without the opening rites', async () => {
  const { compactTcc, tccTime, tccId } = await import('../public/lib/council-video.mjs');
  assert.deepEqual(tccTime('2026/10/27 14:50~17:14'), { d: '2026-10-27', t: '下午', from: '14:50', to: '17:14' });
  assert.equal(tccId('https://tccvideo.tcc.gov.tw/Front/VideoContent/Index?id=63599011-8821-464f-8572-6ea7b99456ce'), '63599011-8821-464f-8572-6ea7b99456ce');
  const v = compactTcc('63599011-8821-464f-8572-6ea7b99456ce', {
    Title: '第14屆第13次臨時大會第05次會議',
    MeetTime: '2026/10/27 14:50~17:14',
    Content: '第5次會議<br/>1.主席宣告開會<br/>2.報告今日議程<br/>6.一讀會：宣讀議員提案<br/>8.三讀會：<br/>（1）審議115年度追加預算案',
    ProxyUrls: [{ src: 'https://w/480.m3u8', label: '480p' }, { src: 'https://w/720.m3u8', label: '720p' }]
  });
  assert.equal(v.n, '第13次臨時大會 · 第5次會議');
  assert.equal(v.hls, 'https://w/720.m3u8');
  assert.equal(v.what, '一讀會：宣讀議員提案；三讀會：（1）審議115年度追加預算案');
  assert.equal(compactTcc('x', { MeetTime: '2026/10/27 14:50', ProxyUrls: [] }), null, 'no stream, no row');
});

test('臺北: a 質詢 day’s groups read out, each councillor’s turn where their group starts', async () => {
  const { compactTcc, tccSegs, tccPeople, tccRows, tccQuery } = await import('../public/lib/council-video.mjs');
  const r = {
    Title: '第14屆第08次定期大會民政部門質詢',
    MeetTime: '2026/08/28 13:08~16:50',
    Content: '第14質詢組：闕枚莎,陳炳甫<br/>計2位時間36分鐘 <br/>第15質詢組：顏若芳<br/>計1位時間18分鐘 <br/>',
    ProxyUrls: [{ src: 'https://w/720.m3u8', label: '720p' }]
  };
  const segs = tccSegs([{ Name: '第14組：闕枚莎,陳炳甫', VideoTime: 1304.9 }, { Name: '第15組：顏若芳', VideoTime: 5849.07 }]);
  assert.deepEqual(segs, [{ at: 1305, who: ['闕枚莎', '陳炳甫'] }, { at: 5849, who: ['顏若芳'] }]);
  const v = compactTcc('367a01bd-6e7c-4c2e-b212-c0d63384e0e8', r, segs);
  assert.equal(v.n, '第8次定期大會 · 民政部門質詢');
  assert.equal(v.what, '第14組：闕枚莎、陳炳甫；第15組：顏若芳');
  const p = tccPeople([v]);
  assert.deepEqual(p['陳炳甫'], [{ id: 't367a01bd-0', d: '2026-08-28', t: '下午', n: v.n, hls: 'https://w/720.m3u8', at: 1305, what: '同組：闕枚莎' }]);
  assert.deepEqual(p['顏若芳'][0].at, 5849);
  // (No segments: the groups from the agenda, the recording from its start.)
  const q = tccPeople([compactTcc('367a01bd-x', r)]);
  assert.equal(q['顏若芳'][0].at, undefined);
  assert.deepEqual(tccRows([{ Name: 'x', Date: '2026/08/28', Url: 'https://tccvideo.tcc.gov.tw/Front/VideoContent/Index?id=367a01bd-6e7c-4c2e-b212-c0d63384e0e8' }, { Name: 'y', Date: null, Url: '' }]), [{ tid: '367a01bd-6e7c-4c2e-b212-c0d63384e0e8', d: '2026-08-28', n: 'x' }]);
  assert.equal(tccQuery('https://tccvideo.tcc.gov.tw/Front/HistoryVideo/Index?mj=14&mp=08&mtypeCategoryId=Regular&quesCategoryId=AL').quesCategoryId, 'AL');
});

test('代表會 on YouTube: every channel an id once, its titles without the county or the town', async () => {
  const { TOWN_YOUTUBE, townTitle } = await import('../public/lib/town-video.mjs');
  const ids = Object.values(TOWN_YOUTUBE).map(([ch]) => ch);
  assert.ok(ids.length >= 40);
  assert.equal(new Set(ids).size, ids.length, 'one channel, one town');
  for (const [tc, [ch, name]] of Object.entries(TOWN_YOUTUBE)) {
    assert.match(tc, /^\d{8}$/);
    assert.match(ch, /^UC[\w-]{22}$/);
    assert.match(name, /民代表會$/);
  }
  assert.equal(townTitle('宜蘭縣第19次臨時會', '五結鄉民代表會'), '第19次臨時會');
  assert.equal(townTitle('台東市民代表會第8次定期會', '臺東市民代表會'), '第8次定期會');
  assert.equal(townTitle('臺中市第17次臨時會議', '和平區民代表會'), '第17次臨時會議');
  assert.equal(townTitle('臺東縣', 'x'), '臺東縣', 'nothing left: as it was');
});
