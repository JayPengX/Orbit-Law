// A council's video: its live channels and its recordings, from where each
// council keeps them. By law (地方立法機關組織準則 §25) every council streams its
// 大會 live and posts the recordings within 15 days.
//   HiNet's OTT (ottlive.hinet.net/backend, open JSON; HLS that plays in Safari): 新竹縣, 苗栗, 雲林 (live)
//   高雄's own IVOD (ivod.kcc.gov.tw/cms/public/api: the chamber's recordings and each councillor's 質詢, HLS on Akamai)
//   YouTube (each channel's free RSS feed, the newest 15): 臺南, 金門, 連江, 澎湖, 雲林 (南投's feed is its news)
// The build reads them (scripts/build-council.mjs); the app draws them (app.mjs, the council page).

export const HINET = { hsq: 'hcc', mia: 'mcc', yun: 'ylcc' };
export const HINET_API = 'https://ottlive.hinet.net/backend';
export const HINET_SITE = company => `https://ottlive.hinet.net/webapp/${company}/vod`;
// Each council's own YouTube channels of its sittings (the chamber's; 彰化's committees on a second), found by
// name on YouTube and checked by their uploads (2026-11-10). 臺北, 基隆: none on YouTube.
export const YOUTUBE = {
  nwt: ['UCQQkVSFtshjaiNfka2iNomQ'],
  txg: ['UCuid2UrRsZMXd-xIeeI8yFA'],
  tnn: ['UCdA-WnlDKDfJol0SJhsf63g'],
  tao: ['UCPiXFDOZkDuwZ6K96nbC78g'],
  ila: ['UCKfnvVz8FEART5zwDLwm_zg'],
  hsz: ['UCnit-yB80zHt800dSTr42Vw'],
  cha: ['UCNWh1ZPg_dkTiDSitjVLrrQ', 'UCoGdv7MEscA-AnliPIc_mGw'],
  nan: ['UCSylXMliCfhIWaO-zgCCaWA'],
  yun: ['UCKRtSYQyMpnuXd_Sg6qMR6A'],
  cyq: ['UCAG1JNCI1Ply3wG0dIkMShg'],
  cyi: ['UC3TajrZx0yDuZDrEc7HerLQ'],
  pif: ['UC-j_LTfJ6Kr-5gS3kZgmZ6g'],
  ttt: ['UC9wSWy75F34BodMExSBE3Rw'],
  hua: ['UCUXQVsKr0OGPkBPYnJfBMoQ'],
  pen: ['UCRMf06ok5zVx53oBonoqCFw'],
  kin: ['UCssU97D8roqOPbnU4I-OsOw'],
  lie: ['UCLFeXjIoUzY-FiVlWvL6b8Q']
};
export const ytFeed = id => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
export const ytSite = id => `https://www.youtube.com/channel/${id}/videos`;

const pad = n => String(n).padStart(2, '0');
const ok = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100;
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// The day a recording is of, from its title (councils write it every way), else the day it was posted (`at`, ISO).
export function dayOf(title, at = '') {
  const s = String(title || '');
  const atDay = String(at).slice(0, 10);
  let m;
  // Written out: 115年09月29日, 2026年11月9日
  if ((m = s.match(/(?<!\d)(1\d{2}|20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/))) {
    const y = +m[1] < 1000 ? +m[1] + 1911 : +m[1];
    if (ok(y, +m[2], +m[3])) return iso(y, +m[2], +m[3]);
  }
  // 西元 with separators: 2026.10.1, 2026-10-01
  if ((m = s.match(/(?<!\d)(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)/)) && ok(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  // 民國 with separators: (115.11.2), 115-10-28, 115/10/28
  if ((m = s.match(/(?<!\d)(1\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)/)) && ok(+m[1] + 1911, +m[2], +m[3])) return iso(+m[1] + 1911, +m[2], +m[3]);
  // 西元 run together: 20261105121348, 20261110
  if ((m = s.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})/)) && ok(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  // 民國 run together: 1151110
  if ((m = s.match(/(?<!\d)(1\d{2})(\d{2})(\d{2})(?!\d)/)) && ok(+m[1] + 1911, +m[2], +m[3])) return iso(+m[1] + 1911, +m[2], +m[3]);
  // Month and day alone: 11/6 (the year of posting, the one before if that lands after it)
  if ((m = s.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/)) && atDay) {
    let y = +atDay.slice(0, 4);
    if (ok(y, +m[1], +m[2])) {
      if (iso(y, +m[1], +m[2]) > atDay) y--;
      return iso(y, +m[1], +m[2]);
    }
  }
  return atDay;
}

// 上午 or 下午, as a sitting says it.
// A bare stamp (苗栗縣議會20261105121348) by its hour.
export function partOf(title) {
  const s = String(title || '');
  if (/上午|\bAM\b|\dAM/i.test(s)) return '上午';
  if (/下午|\bPM\b|\dPM/i.test(s)) return '下午';
  const m = s.match(/(?<!\d)20\d{6}(\d{2})\d{4}(?!\d)/);
  return m ? (+m[1] < 12 ? '上午' : '下午') : '';
}

// A title without the council's name, its term, its date and its part of the day: what the sitting was.
export function cleanTitle(title, council = '') {
  let s = String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/(?<=[㐀-鿿]) (?=[\d㐀-鿿])|(?<=\d) (?=[㐀-鿿])/g, '')
    .replace(/\s*、\s*/g, '、')
    .replace(/(?<=\d) (?=\d)/g, '');
  if (council) s = s.split(council).join('');
  s = s
    .replace(/^[\s\-–—|｜:：]+/, '')
    .replace(/第[\d一二三四五六七八九十]+屆(?=第)/, '')
    .replace(/[([（]?(1\d{2}|20\d{2})\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日[)\]）]?/g, ' ')
    .replace(/[([（]?20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}[)\]）]?/g, ' ')
    .replace(/[([（]?1\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}[)\]）]?/g, ' ')
    .replace(/(?<!\d)20\d{6,12}(?!\d)/g, ' ')
    .replace(/\[?(?<!\d)1\d{6}(?!\d)(AM|PM)?\]?/gi, ' ')
    .replace(/(?<![\d/])\d{1,2}\/\d{1,2}(?![\d/])/g, ' ')
    .replace(/(上午|下午)/g, ' ')
    .replace(/[(（]\s*[)）]/g, '')
    .replace(/議事日程表/g, ' ')
    .replace(/『[^』]*』/g, ' ')
    .replace(/\s*-\s*$/, '')
    .replace(/-(\d)$/, '（$1）')
    .replace(/\s*-\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
  // A word said twice at the end (縣政總質詢縣政總質詢).
  s = s.replace(/(\S{3,8})\1$/, '$1');
  return s.replace(/^[-–—·]\s*|\s*[-–—·]$/g, '').trim();
}

// One of HiNet's recordings, compact: its day and part, what it was, the HLS address and its picture.
export function compactHinet(x, council = '') {
  const hls = x?.streamingJob?.endpoint_set?.[0];
  if (!hls || x.vodDisplayStatus === 'Hide') return null;
  const title = String(x.title || '');
  const d = dayOf(title, x.createTime) || dayOf(x.description, x.createTime);
  const what = String(x.description || '').trim();
  const n = cleanTitle(title, council);
  // A bare stamp (苗栗縣議會20261105121348) is the channel's test or a stray take: nothing to say what it is.
  if (!n) return null;
  return {
    id: `h${x.id}`,
    d,
    t: partOf(title),
    n,
    ...(what && what !== title && !/^\S*議會\d{8,}$/.test(what) && cleanTitle(what, council) !== n ? { what: cleanTitle(what, council) } : {}),
    tags: (x.terms || []).filter(t => t.taxonomy === 'TAG').map(t => t.name),
    hls,
    ...(x.streamingJob.thumbnail_endpoint ? { img: x.streamingJob.thumbnail_endpoint } : {})
  };
}

// A meeting's recording, not the council's news clips or campaign events.
export const isSitting = title => /(定期會|臨時會|大會|委員會|審查|審議|提案|質詢|議程|議事|會議|開議|開幕|閉幕|延會)/.test(title) && !/(新聞|專訪|宣導|競選|活動花絮)/.test(title);

const unxml = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// A channel's RSS feed: its meeting recordings, newest first.
export function ytVideos(xml, council = '') {
  const out = [];
  for (const [, e] of String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = (e.match(/<yt:videoId>([^<]+)/) || [])[1];
    const title = unxml((e.match(/<title>([^<]*)/) || [])[1]);
    const at = (e.match(/<published>([^<]+)/) || [])[1] || '';
    if (!id || !isSitting(title)) continue;
    // Posted in UTC: its day in Taiwan.
    const twAt = at ? new Date(Date.parse(at) + 8 * 3600e3).toISOString() : '';
    out.push({ id: `y${id}`, d: dayOf(title, twAt), t: partOf(title), n: cleanTitle(title, council) || title, yt: id, img: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
  }
  return out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
}

// A channel's page (/videos, /streams) as YouTube draws it: its initial data and the client version to ask for more.
export function ytInitial(html) {
  const m = String(html || '').match(/var ytInitialData = (\{.*?\});<\/script>/s);
  const ver = (String(html || '').match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)/) || [])[1] || '';
  try {
    return m ? { data: JSON.parse(m[1]), ver } : null;
  } catch {
    return null;
  }
}
// The videos in a page of a channel's list (its first, or one asked for with `cont`), and the token for the next.
export function ytLockups(data) {
  const items = [];
  let cont = '';
  const badge = x => {
    if (!x || typeof x !== 'object') return '';
    if (x.thumbnailBadgeViewModel?.text) return x.thumbnailBadgeViewModel.text;
    for (const k in x) {
      const t = badge(x[k]);
      if (t) return t;
    }
    return '';
  };
  const walk = o => {
    if (!o || typeof o !== 'object') return;
    if (o.lockupViewModel) {
      const v = o.lockupViewModel;
      const t = v.metadata?.lockupMetadataViewModel?.title?.content;
      if (v.contentId && t) items.push({ id: v.contentId, title: t, len: badge(v.contentImage) });
      return;
    }
    if (o.continuationItemRenderer && !cont) cont = (JSON.stringify(o.continuationItemRenderer).match(/"token":"([^"]+)"/) || [])[1] || '';
    for (const k in o) walk(o[k]);
  };
  walk(data);
  return { items, cont };
}
// Those that are sittings, as recordings (the day from the title: a channel's list says only "3 days ago").
export function ytItems(items, council = '') {
  return items
    .filter(x => isSitting(x.title))
    .map(x => ({ id: `y${x.id}`, d: dayOf(x.title), t: partOf(x.title), n: cleanTitle(x.title, council) || x.title, yt: x.id, img: `https://i.ytimg.com/vi/${x.id}/mqdefault.jpg`, ...(/^\d{1,2}(:\d\d){1,2}$/.test(x.len) ? { len: x.len } : {}), ...(/直播/.test(x.title) ? { live: 1 } : {}) }))
    .filter(v => v.d);
}
// The term's recordings, newest first: this read over the last, one an id; a day's 直播 copy dropped where the day has
// its own recording.
export function mergeVids(fresh, old, from = '') {
  const by = new Map();
  for (const v of [...(old || []), ...(fresh || [])]) if (v?.id && (!from || v.d >= from)) by.set(v.id, v);
  const all = [...by.values()];
  const kept = new Set(all.filter(v => !v.live).map(v => v.d));
  return all.filter(v => !v.live || !kept.has(v.d)).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.id < b.id ? -1 : 1));
}

// The recordings of one sitting (its day, and its part when both say one).
export const videosOf = (vids, x) => (vids || []).filter(v => v.d === x.d && (!v.t || !x.t || v.t === x.t));

// Sittings the recordings know and the council's list doesn't yet (it lags weeks): after its newest day, a row
// a day and part, from the recordings that say what they were (a bare stamp says nothing).
export function sittingsFromVideo(sittings, vids, day) {
  const newest = (sittings || []).reduce((m, x) => (x.d > m ? x.d : m), '');
  const seen = new Set();
  const add = [];
  for (const v of vids || []) {
    if (!v.n || v.d <= newest || v.d > day) continue;
    if (seen.has(`${v.d}|${v.t}`) || (!v.t && [...seen].some(k => k.startsWith(`${v.d}|`)))) continue;
    seen.add(`${v.d}|${v.t}`);
    add.push({ d: v.d, t: v.t, from: '', to: '', kind: /委員會/.test(v.n) ? '委員會' : '大會', room: '', what: v.what || v.n, s: '', video: true });
  }
  return add;
}

// 高雄市議會's IVOD: its API, and a recording's HLS from its file name (202610KCC0408R1151014090027VIDEOmp4).
export const KCC_API = 'https://ivod.kcc.gov.tw/cms/public/api';
export const KCC_SITE = 'https://ivod.kcc.gov.tw/';
export const kccHls = source => {
  const m = String(source || '').match(/^(\d{6})KCC(\w+?)VIDEOmp4$/);
  // The chamber's own takes (0408R…) as they are; an uploaded file in its 720p cut (…_720).
  return m ? `https://streamkcc.akamaized.net/vod-http/_definst_/${m[1]}/${m[2]}${/^\d{4}R/.test(m[2]) ? '' : '_720'}.mp4/playlist.m3u8` : '';
};
// A 高雄 councillor's name without the title it's listed with (康裕成議長 → 康裕成).
export const kccName = title => String(title || '').replace(/(副議長|議長|議員)$/, '');
// One of 高雄's recordings, compact; a stub under a minute (a vote's few seconds) left out.
export function compactKcc(x) {
  const hls = kccHls(x?.source);
  if (!hls || Number(x.length) < 60_000) return null;
  const title = String(x.title || '');
  const time = (title.match(/\b(\d{1,2}):\d{2}/) || [])[1];
  const n = cleanTitle(title.replace(/^1\d{2}-\d{2}-\d{2}\s+[\d:]+\s*/, '').replace(/第\d+屆(?=第)/, '').replace(/(定期大?會|臨時會)\s+(?=\S)/, '$1 - '));
  return {
    id: `k${x.videoId}`,
    d: dayOf(title, x.publish_time),
    t: time ? (+time < 12 ? '上午' : '下午') : '',
    n: n || String(x.ownerName || ''),
    hls,
    ...(x.videoPicture ? { img: x.videoPicture } : {}),
    ...(x.videoLength ? { len: String(x.videoLength).replace(/^00:/, '') } : {})
  };
}
