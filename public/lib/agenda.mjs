// 立法院's agenda (議事日程): its meetings from the g0v 立法院 API (/meets),
// kept small, in Taiwan time; which IVOD channel streams each one now; and
// which meeting a bill is next on. One place for the build and the app.

// A meeting's room: 立法院會議 for the floor,
// 黨團協商 for caucus talks, else the convening committee.
export function roomOf(m) {
  const kind = m['會議種類'] || '';
  const unit = String((m['會議資料'] || [])[0]?.['會議單位'] || '');
  if (kind === '院會' || unit === '全院委員會') return '立法院會議';
  if (kind === '黨團協商') return '黨團協商';
  if (/委員會$/.test(unit)) return unit;
  return [].concat(m['委員會代號:str'] || [])[0] || '';
}

const clean = s => String(s || '').replace(/\r/g, '').trim();
// 「一、本院委員…擬具「甲法…草案」，請審議案。」 → 甲法…草案
const billTitle = t => clean(t).replace(/^[一二三四五六七八九十百]+、/, '').replace(/^.*?擬具「(.+?)」.*$/, '$1');

// A meeting, kept small: { id, kind, title, room, days: [{ d, from, to, place, ppg }],
// why: 事由, bills: [{ id, t, laws, cat }], speakers: { day: [names] }, videos: [IVOD url] }.
export function compactMeet(m) {
  const days = [];
  for (const d of m['會議資料'] || []) {
    if (!d['日期'] || days.some(x => x.d === d['日期'])) continue;
    days.push({ d: d['日期'], from: String(d['開始時間'] || '').slice(11, 16), to: String(d['結束時間'] || '').slice(11, 16), place: clean(d['會議地點']), ppg: d.ppg_url || '' });
  }
  if (!days.length) for (const d of [].concat(m['日期'] || [])) days.push({ d, from: '', to: '', place: '', ppg: '' });
  days.sort((a, b) => (a.d + a.from < b.d + b.from ? -1 : 1));
  const web = m['議事網資料'] || [];
  const bills = [];
  for (const w of web)
    for (const b of w['關係文書']?.['議案'] || []) {
      const laws = [].concat(b['法律編號'] || []);
      if (!b['議案編號'] && !laws.length) continue;
      if (bills.some(x => x.id && x.id === b['議案編號'])) continue;
      bills.push({ id: b['議案編號'] || '', t: billTitle(b['標題']), laws, cat: b['類別'] || '' });
    }
  const speakers = {};
  for (const s of m['發言紀錄'] || []) {
    const d = s.smeetingDate || '';
    for (const n of s.legislatorNameList || []) if (n && !(speakers[d] ||= []).includes(n)) speakers[d].push(n);
  }
  const why = clean((m['會議資料'] || [])[0]?.['會議事由'] || web[0]?.['內容'] || '');
  return {
    id: m['會議代碼'],
    kind: m['會議種類'] || '',
    title: clean(m['會議標題'] || m.name),
    room: roomOf(m),
    days,
    why: why.length > 900 ? `${why.slice(0, 900)}…` : why,
    bills,
    speakers,
    videos: web.flatMap(w => (w['連結'] || []).filter(l => l['類型'] === 'video').map(l => l['連結']))
  };
}

// Now in Taiwan: { day: 'YYYY-MM-DD', time: 'HH:MM' }.
export function twNow(now = new Date()) {
  const s = new Date(now.getTime() + 8 * 3600e3).toISOString();
  return { day: s.slice(0, 10), time: s.slice(11, 16) };
}

// Every meeting day on its own, in order: [{ m, d, from, to, place, ppg }].
export const sittings = meets => meets.flatMap(m => m.days.map(x => ({ ...x, m }))).sort((a, b) => (a.d + a.from < b.d + b.from ? -1 : a.d + a.from > b.d + b.from ? 1 : 0));

// A sitting's state at `now`: 'live' (inside its scheduled hours), 'later'
// (today, not begun), 'done' (today, over), 'past' or 'ahead'.
export function sittingState(s, now = new Date()) {
  const { day, time } = twNow(now);
  if (s.d < day) return 'past';
  if (s.d > day) return 'ahead';
  if (s.from && time < s.from) return 'later';
  if (s.to && time > s.to) return 'done';
  return 'live';
}

// The next sitting (today or later) whose agenda carries one of `ids` (議案編號),
// `law` (立法院 law id) or names `name` in its 事由 (「name…草案」).
export function nextSitting(meets, { ids = [], law = '', name = '' } = {}, now = new Date()) {
  const { day } = twNow(now);
  const want = new Set(ids.map(String));
  const on = m => m.bills.some(b => (b.id && want.has(String(b.id))) || (law && b.laws.includes(law))) || (name && m.why.includes(`「${name}`));
  return sittings(meets.filter(on)).find(s => s.d >= day && sittingState(s, now) !== 'done') || null;
}

// IVOD's live list (ivod.ly.gov.tw/Live/FetchCommInfo, HTML): one row per
// meeting today, under its unit's heading: [{ unit, time, place, status, title, single }].
// `single` is the meeting's player page (/Live/Single/...), there only while it streams.
export function ivodLive(html) {
  const out = [];
  for (const block of String(html).split('<div class="live-list">').slice(1)) {
    const unit = (block.match(/<h2>[^]*?<\/i>\s*([^<]+?)\s*<\/h2>/) || [])[1] || '';
    for (const li of block.split('<li>').slice(1)) {
      const pick = re => ((li.match(re) || [])[1] || '').trim();
      out.push({
        unit,
        time: pick(/class="time">([^<]+)</),
        place: pick(/class="place">([^<]+)</),
        status: pick(/class="status"[^>]*>([^<]+)</),
        title: pick(/class="metdec"\s+title="([^"]+)"/),
        single: pick(/href="(\/Live\/Single\/[^"]+)"/)
      });
    }
  }
  return out;
}

// A live HLS stream of 立法院's own (IVOD's channels on HiNet; open to any page).
export const liveHls = ch => `https://lylive-ott2b2.cdn.hinet.net/live/pool/ly-live${ch}/live-hls-cl-tv/index.m3u8`;

// Today's meeting in IVOD's live list: same unit (院會 for the floor) and start time.
export function liveOf(rooms, m, s) {
  const unit = m.room === '立法院會議' ? '院會' : m.room;
  const at = `${s.d} ${s.from}`;
  return (rooms || []).find(r => r.time === at && (r.unit === unit || r.unit.includes(unit) || unit.includes(r.unit) || r.title.startsWith(m.title))) || null;
}
