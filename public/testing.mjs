// Orbit Law's own switches in the kit's 測試工具 (hidden until unlocked:
// Orbit Pass › seven taps on 除錯紀錄). Each is read where it acts as
// globalThis.ORBIT_TEST?.flags?.<name>; they change only what is shown or
// read, never what is saved or sent. The kit's clock and network switches
// work here as everywhere.
//   lyLive: a test 院會 today, IVOD saying it is 進行中 (its channel; the
//     player plays the real stream) / 休息 / 散會 / 延期 (app.mjs agendaData)
//   lyTyphoon: 臺北市 off work today, 颱風停會 (app.mjs lyDayOff)
//   aiFail: the AI routes answer cap / paused / busy (lib/ask.mjs post,
//     lib/chat.mjs chatLaw, app.mjs fetchPage), nothing sent
//   lawNew: every amendment counts as new (the 新 tag, app.mjs freshTag)
const T = (zh, en) => (/^zh/i.test(document.documentElement.lang || 'zh') ? zh : en);
const closeTester = () => document.querySelector('dialog.q-tester[open]')?.close();
(globalThis.ORBIT_TEST_TOOLS ||= []).push(
  {
    app: 'law',
    title: T('立法院直播中', 'Legislature live now'),
    sub: T('今天加一場測試院會，IVOD 說它正在播（播真的國會頻道）、休息、散會或延期', 'Adds a test sitting today; IVOD says it streams (the real channel plays), is on a break, rose or is postponed'),
    flag: 'lyLive',
    options: [
      { id: 'live', label: T('直播中', 'Live') },
      { id: 'break', label: T('休息', 'Break') },
      { id: 'done', label: T('散會', 'Rose') },
      { id: 'off', label: T('延期', 'Postponed') }
    ]
  },
  {
    app: 'law',
    title: T('IVOD 錄影', 'IVOD recording'),
    sub: T('打開立法院最新的一段質詢影片（影片播放器和逐字稿）', 'Opens the latest speech clip (the player and transcript)'),
    label: T('打開', 'Open'),
    run: async () => {
      const j = await fetch('https://v2.ly.govapi.tw/ivods?limit=5', { signal: AbortSignal.timeout(8000) })
        .then(r => r.json())
        .catch(() => null);
      const v = (j?.ivods || []).find(x => x.IVOD_ID);
      if (!v) return T('現在讀不到 IVOD', 'IVOD can’t be read now');
      closeTester();
      // (The app's own link handler opens an IVOD clip in its player.)
      const a = Object.assign(document.createElement('a'), { href: `https://ivod.ly.gov.tw/Play/Clip/1M/${v.IVOD_ID}`, textContent: v['委員名稱'] || v['會議名稱'] || 'IVOD' });
      a.hidden = true;
      document.body.append(a);
      a.click();
      a.remove();
    }
  },
  { app: 'law', title: T('颱風停會', 'Typhoon: no sitting'), sub: T('臺北市今天停止上班：立法院今天的會議都停（配「立法院直播中」看）', 'Taipei off work today: today’s sittings are off (try with “Legislature live now”)'), flag: 'lyTyphoon' },
  {
    app: 'law',
    title: T('AI 用不了', 'AI unavailable'),
    sub: T('白話解釋、問法律、讀網頁都回這個錯誤，不送出', 'Explain, Ask and page reading all answer this error, nothing sent'),
    flag: 'aiFail',
    options: [
      { id: 'cap', label: T('今天用完', 'Daily cap') },
      { id: 'paused', label: T('暫停中', 'Paused') },
      { id: 'busy', label: T('太快', 'Too fast') }
    ]
  },
  { app: 'law', title: T('剛修法', 'Just amended'), sub: T('每一筆修法都算最近兩週（「新」標籤）', 'Every amendment counts as from the last two weeks (the New tag)'), flag: 'lawNew' }
);
