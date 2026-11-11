# Orbit Law: the map

Taiwan's law on three sides that link to each other: the laws to read
(法規), with every reference a link; the courts' rulings on them (裁判:
憲法法庭's every 釋字 and 憲判字, the top courts' judgments); and the bills in
立法院 that will change them (立法), stage by stage. Behind the Orbit Pass
like every Orbit app; the data is public, built onto this site once a day,
and works offline once opened. Tabs: 首頁 (one field, search or ask) · 法規 · 裁判 ·
立法 · 我的, and 問法律 on its own round button beside them.

Live: https://orbit.jaypengx.com/law/

## How it works

- **Data at deploy, never in git.** `pages.yml` runs on every push and daily
  at 03:30 Taiwan time: `npm test`, then `build-data.mjs`, `build-notices.mjs`
  (each 預告's join.gov.tw record and its 總說明 and 條文對照表 read from the
  公報 PDF with poppler's `pdftotext -bbox`: `bills/notice/<id>.json`), `build-ly.mjs`,
  `build-council.mjs` (地方議會, below), `build-council-text.mjs` (council bills' PDFs read into their parts, below), `build-town.mjs` (代表會 from their own sites, below), `build-photos.mjs` (立委 headshots mirrored as 96/192 px WebPs, committed
  under `public/img/ly/`; only a newcomer's is fetched; then the 縣市議員's, below), `build-budget.mjs` (each 總預算's
  money from 主計總處's 預算表 on data.gov.tw: `ly/budget/<year>.json`, cuts
  as 預算案 − 法定預算), `build-agency.mjs`, `build-local.mjs`, `build-rulings.mjs`, `build-cons.mjs` and `build-news.mjs` in that order
  (each builds on the last deploy's copy, `scripts/lib.mjs`), then
  `build-status.mjs` (`data/status.json`: when each part was built and its
  count, 0 when missing; Orbit-Core's admin panel reads it for 外部來源, as
  every source step may fail without stopping the deploy), then
  `stamp-version.mjs`. `build-data.mjs` reads
  全國法規資料庫's bulk files (law.moj.gov.tw `api/Ch/Law/JSON`,
  `api/En/Law/JSON`) and writes `public/data/`: `index.json` (every law),
  `law/<pcode>.json`, `en/<pcode>.json`, `changes.json` (修法追蹤: each
  amendment's added, amended and removed articles, diffed against the
  last deploy's copy, or read from the law's own 沿革 when no deploy saw
  the old text; kept 120 days). The ministry's last good zips are kept
  in the workflow cache (`.moj-cache/`) and stand in on a day it fails.
- **Bills** come from the g0v 立法院 API (v2.ly.govapi.tw, a daily mirror
  of 立法院's 議事 data). Only bills whose 最新進度日期 moved since the last
  build are fetched, merged into the last deploy's `bills/all.json`.
  `bills/items.json` has one item per law per term (every version folded
  in), and `bills/item/<term>-<law>.json` that item's versions. A version's
  對照表 is fetched from the API only when opened in the app.
- **地方議會** (立法's 議會 door; `lib/council.mjs`, `scripts/build-council.mjs`):
  歐噴's 地方議會開放 API (all.cc.govapi.tw, each council's own site and
  內政部's and 中選會's lists, refreshed daily; CORS open). The deploy writes
  `council/index.json` (the 22 縣市議會 in a line each: session now, counts),
  `council/<code>.json` (a council's sittings, sessions, councillors in office
  with how many bills carry their name's Chinese part (`zhName`: 宋雨蓁 Nikar．Falong
  → 宋雨蓁), the newest 240 bills of the term, each session's bill count),
  `council/<code>/s/<session>.json` (every bill of a session, `sessionBillsFile`: the 本屆會期
  list opens any session whole, `councilSession`, its sittings read live from the API,
  `ccSittings`, its recordings, its bills by outcome and committee) and
  `council/reps.json` (鄉鎮市民代表 and 山地原住民區民代表: 中選會's 2022 winners
  by county and township). A council that fails keeps the last deploy's copy.
  The API pages only its first 10,000 rows, so `all()` reads the rest sorted
  the other way. A bill's text, a search and a councillor's bills are read
  live from the API when asked. Where the API holds none or few of the term's
  bills, the build reads the council's own site (`OWN` in the builder) into
  `council/<code>-bills.json`, which the council's search, a councillor's bills
  and a bill's page read: 新竹縣 (`hccRows`, www.hcc.gov.tw) and 新竹市
  (`hszRows`, www.hsinchu-cc.gov.tw) page by page, gently (2 s a page, 150 a
  night, on from `next`; no outcomes there); 花蓮縣 (`hlcRows`,
  www.hlcc.gov.tw's search: a whole term of each kind in one POST, with its
  大會決議, `own.out`); 彰化縣 (`cha*` in lib/council.mjs, www.chcc.gov.tw:
  its 議事日程's sessions with their days, each session's counts, the lists of
  sessions the API lacks, then 80 bill pages a night for the whole text), which
  joins the API's bills (`own.add`: search and a councillor's bills still ask
  the API, plus the file) and replaces the API's rows it repeats.
  金門縣 (its whole term), 新北, 連江 and 屏東 (their sessions since the API's
  newest bills) get bills drawn out of the minutes the API holds
  (`transcriptBills`: the 其他 and 程序文字 rows carry 案號, 提案人, 案由,
  審查意見 and 大會決議; else the chair's next words, 報告結果：知悉), each
  linked to its meeting's file.
  苗栗縣 (the API has none: its site is www.mcc.gov.tw, not mlcc): its
  會議記錄 pages' PDFs hold text, read with poppler's pdftotext (`mcc*`:
  府/議 第 N 號案 with 大會決議, 臨時動議 動-N with 動議人, 附議人, 決議),
  40 records a night, each once (`done`), newest first.
  嘉義市 (`cyi*`, www.cycc.gov.tw): each session picked in its 議決案檢索
  (an ASP.NET postback) lists its bills' pages; those the API lacks are read,
  100 a night, and sessions the API doesn't list take their days from the
  議事日程表 (`own.add`). Councils are built four at a time.
  Sessions the API doesn't list yet sort by the bill's day.
  高雄's 議決 carries date lines (決議日期：…), which `outcomeOf` drops. A council
  with none at all says why (`gap`, from the API's
  `completenesses`) and lists its newest 議事錄 files. A councillor's sheet
  shows their recent speeches (`meet_transcripts`, read live; `speechesOf`).
  A row from a council's own 歷屆議員 page that isn't among 中選會's winners is
  dropped if it has an end date, else kept only if a bill names them (新竹縣
  listed 連郁婷, who lost in 2022); 第01選舉區 reads 第1. Where fewer than half
  the councillors are named on any bill (宜蘭's open data holds only the 縣府's),
  the list shows no 提案 counts. Their photos (內政部's, up to 5,000 px; some carry
  EXIF sizes Safari stretched) are mirrored by `build-photos.mjs` as 96/192 px
  WebPs into `council/img/` (not committed; kept between builds in
  `.council-photos/` by the workflow's cache, 12 minutes of newcomers a night;
  a blank one is dropped for the initial).
  **Video** (`lib/council-video.mjs`; `video` in `council/<code>.json`): each night the
  build reads a council's live channels and 60 newest recordings where it keeps them
  openly: HiNet's OTT (ottlive.hinet.net/backend: 新竹縣 `hcc`, 苗栗 `mcc`, 雲林's live
  `ylcc`; HLS that Safari plays, hls.js elsewhere), 高雄's own IVOD (its API; HLS on
  Akamai from each file's name, `kccHls`; each councillor's 質詢 in
  `council/khh-clips.json`, shown on their sheet), 基隆's own site (vod.kmc.gov.tw: each list one
  POST with its form's token, `kmcVids`; MP4 files on Akamai, played as they are; each councillor's
  市長施政總質詢 in `council/kee-clips.json`, a caucus's turn under each of its names, `kmcWho`), 臺北's own
  site (tccvideo.tcc.gov.tw, Taiwan only: its JSON through Law's door, `file=1`; each session's lists, then
  each recording not kept yet, 120 a night, `compactTcc`; a 質詢 day's groups and where each starts,
  `tccSegs`, so each councillor's turn plays from its start, `tccPeople` → `council/tpe-clips.json`;
  sessions over and read whole in `council/tpe-tcc.json`) or the council's YouTube channels
  (`YOUTUBE`: all but 臺北, 基隆, 高雄, 新竹縣, 苗栗; their /videos and /streams lists read page by
  page as YouTube's web client asks, `ytInitial`, `ytLockups`, `ytItems`, back to the term's start the
  first time, then until a page holds nothing new; plus the RSS feed). Every build's read is merged
  over the last (`mergeVids`) into `council/<code>-video.json`, the term's every recording;
  `council/<code>.json` keeps the 60 newest and `video.all`. 議會影音 (`councilVideos`) browses the
  whole term by session, by kind (大會, 質詢, 委員會: `vidKind`) and by words; a session's sheet shows
  its own. A sitting with a recording that day and part opens it; 議會影音
  lists the newest; 直播中 shows when the phone finds a live channel's playlist (asked
  at most once a minute). Recorded days past the API's newest sitting (it lags weeks)
  become sittings (`sittingsFromVideo`). Bare stamps (苗栗's test takes) are dropped.
  代表會 have no bills or sittings in any open data, so most show their members only.
  **代表會 on YouTube** (`lib/town-video.mjs` `TOWN_YOUTUBE`, found by YouTube's channel search and checked by eye,
  `scripts/find-town-youtube.mjs`): each night the build reads each channel as a council's (`ytChannel`: 6 pages
  a list the first time, then one, and the feed) into `council/town-video/<tc>.json`, merged over the last; the
  town's sheet shows 影音 (`townVideos`), each recording played in the app (`openCouncilVideo` with the town as context).
  **Bills read from their PDFs** (`scripts/build-council-text.mjs`, `billPdfParts` in
  `lib/council.mjs`): 新竹縣's and 新竹市's proposals are PDFs; each build reads the newest
  not yet read (pdftotext -layout; hcc.gov.tw a request every 2 s) into 案號, 說明, 辦法,
  議決 and the sitting that decided it (its outcome and its day, `decidedDays`, then set on the council's lists and session files: 新竹縣's list dates a bill the day it was posted), kept in `council/text/<code>/<n>.json` (64 files by
  `textBucket(id)`); a bill's sheet shows them as the API's bills are, the PDF a link below.
  **A 代表會's own site** (`lib/town-site.mjs` `TOWN_SITES`, `scripts/build-town.mjs` →
  `council/town/<tc>.json`; first 竹北市民代表會, whose site moved into 竹北市公所's at
  www.zhubei.gov.tw/jbc/): its 公所's "twgov" CMS, Big5, Taiwan-only, read through the
  proxy's door with the build's key, a page every ½ s, what's settled kept from the last
  deploy. Members with photos; each session of the term (議事錄) with every sitting's
  會議紀錄, 施政報告, 總質詢 by day, 決議案, 附錄 (PDFs), each day's recording (Google
  Drive, streamed by the phone, Drive's player if that fails), its 議事日程表; the news sets
  a session's days before it meets (`sessionNews`), so 下次開會 and 開會中 show. Its sheet is
  `townSheet`. The papers are read into the app (`townPapers`: each PDF's bytes through the
  door's `file=1`, poppler's pdftotext, 70 a build, kept once read) into
  `council/town/<tc>/<paperFile>.json`: 決議案 a row each (`resolutions`, drawn by
  `councilBillHtml` as a council's bill), 總質詢 as who said what (`transcript`) and each
  member's questions (`questions`, `townTranscript`; 重點摘要 on a tap: the proxy's `/law-ask`
  mode `town`, `askTown`, each point citing turns, a tap scrolling to the turn), 書面質詢 (a day's
  paper that's forms: `written`, who asked which office what, and the 公所's reply from its 函), 會議紀錄, 致詞 and 施政報告 as text
  (`paperText`, `paperHtml`); 附錄 and the 議事日程表 stay PDFs. **會議紀錄變表格**
  (`lib/minutes.mjs` `minutesOf`): a 會議紀錄 is read by code into rows, each sitting (day,
  hours, chair, who came) and each proposal (number, kind, proposer, 案由, result, vote);
  what code can't split (`messy`, or a scan) goes once to the AI door (Orbit-Core
  `/ai/build`, `law-minutes`, `TOWN_AI` a night) with `digest` (only the lines carrying a
  proposal or a decision), its rows checked against the paper.
  **彰化's 代表會 on the county's platform** (`lib/town-chcg.mjs`, `chcgTown`; TOWN_SITES entries with `chcg`):
  和美 (act 23: 議事日程, Drive recordings by day, 議事錄 lists), 福興 (act 24: a menu page a session with its
  日程表, 提案表 and 議事錄, another with its MP3s by day and part), 伸港 (act 41: 議事錄 lists). Every link
  names its session (`sessionOf`), so sessions are gathered from the links; a session's days from its
  日程表 or its 議事錄's 時間 line (`pdfSpan`, read once). Members with photos from the district pages
  (`chcgMembers`); none listed (伸港), the sheet shows the elected members. Same JSON and sheet as 竹北's
  (提案 a paper kind; a recording `src` an MP3 or `drive`). 溪湖 is on the platform too (act 174). Twelve more
  publish on their 公所's site (`www.chcg.gov.tw/TSO/<dir>/07other/main.aspx`, `tso` + `pages`: 芬園, 員林, 溪湖's
  neighbours 田中, 大村, 埔心, 社頭, 二水, 北斗, 二林, 埤頭, 大城, 竹塘): `tsoPage` reads a page's files
  (getFile.aspx), the pages under it and its list's other pages; the build follows them two deep, a link that
  doesn't name its session taking its page's, a page's kind (議事日程表(第三屆)) its links'. A recording named
  with its day and what the sitting did (綜合質詢114.5.9) shows both; one kept as a Drive folder (`folders`)
  opens in Drive. Scanned papers have no text, so those sessions have no days. Also on the platform: 線西 (452:
  papers on Drive, read from Drive itself), 秀水 (410: 決議案; Word agendas, so days from its 議事錄), 永靖 (407: days
  in each paper's name, `nameSpan`), 田尾 (409: a session's recording on HiNet's 影音, a `folders` link). 鹿港
  publishes on its 公所's own site, the "Parser" CMS (`cms` + `forms`, `formList`: ten a page, df_ufiles/ PDFs;
  recordings a gofile.me share a session). A 議事錄's days: every sitting's 時間 line, else the 日程表 it opens
  with. 花壇 (members only), 芳苑 (one Drive folder), 彰化市, 埔鹽, 溪州: nothing found to read.
  **Beyond 彰化**: 南投's 名間 posts on its own WordPress site (`wp`: the REST API's posts naming a session,
  `wpPost`; 議事錄 on Drive, 議程表 as pictures; MP3s named by month and day take the post's year, `wpDay`).
  臺東's 東河 on its 公所's Joomla site (`joomla`: category lists `?start=`, an article a paper or a session's Drive
  recordings, `joomlaList`, `joomlaArticle`; up to 80 articles a build). 宜蘭's 頭城 on its 公所's e-land CCMS
  page (`ccms`, `ccmsPage`: file blocks by title, Download.ashx's base64 path read as the file's own address;
  MP3s by day under a bold line naming the session). A recording or paper dated inside another session's days
  goes to that one (頭城 names one session's line twice), and a session's days are its agenda's, else the days
  most of its papers' names give. 宜蘭's 壯圍 on its own "boxlists" site (`box`: a list a kind, `boxList`; a line
  the file or a page of files, `boxFiles`, the 議事錄 with its sittings' recordings named by the Western day,
  `westDay`; a 預定 agenda only when there's no other). A deadline in an agenda's notes (9 月 8 日前) isn't a day.
  礁溪 on its 公所's CCMS pages too (blocks inside a 相關檔案 block, each by its own title; 臨時會 minutes a post
  each, `ccmsNews`; a session's recording on Drive). An agenda in .odt or .docx is read from inside the zip
  (`unzip`), not only PDFs.
  The picked council is this device's
  (`orbit-law.council.v1`), first your 我的 city's.
  **議程** (`councilAgenda`): a council's days on the family's day strip, the whole term (the phone reads the
  API's every sitting itself, `ccTermSittings`, one read) and the days only its recordings know (`councilDays`:
  彰化's API stops in March); a day shows its sittings, each with its recording, and the day's other recordings.
  A sitting typed a year off its session (花蓮's API: 2027 for 2026) is set back into it
  (`saneSittings`, at build and on the phone's live read).
  **追蹤的議員** (☆ on a councillor's sheet; `mine.cc`, `<council>:<name>`, synced with the rest of 我的):
  `councilorFeed` reads their bills and speeches live (the API) and their 質詢 recordings, newest first;
  `trackedCC` counts what's new since each was last opened (the 我的 badge), `drawTrackedCC` their cards.
  **各議會的議程** (`allCouncilAgenda`): every council's sittings on one day strip, by council (the reader's
  first), each with its recording; one file, `council/agenda.json` (`agendaOf`, at build: three weeks back to two
  months ahead from each council's newest sittings and recordings).
- **Reading costs nothing:** static files on Cloudflare, kept by the service
  worker (data: the kept copy first, refreshed behind it).

## Decisions in force

- **The look** (Orbit-Core `docs/DESIGN.md` §11): Orbit's own, always on
  (`index.html` says `data-look="native"`, `look.css` after `law.css`):
  graphite cards, colour only on what it names (a topic's mark), the app's
  colour only for 問法律, the one main action. 首頁 (`drawHome`) says what the
  app is for at a glance (Jay 2026-11-03: the home must say what the app
  does): one lead card (`findCard`, kept across redraws so typing is never
  lost) with its line (有法律問題？用白話問, answers cite the articles), one
  large field, its two ways (Enter or 搜尋法規 finds laws, 問法律 asks, each
  with what was typed) and always three questions to tap (`asksHtml`: what
  you searched or asked last, this device's `law.finds.v1` and saved chats,
  the everyday `STARTERS` filling the rest; three across when wide). Then
  最新動態 (`pulseHtml`): 立法院 today (its row drawn at once, its words
  filled when the agenda is read: live rooms, today's sittings, 散會 or 停會
  and the next day), the newest amendment, the newest ruling; 繼續閱讀 as
  three rows (`resumeRows`: the kind's mark, the title, where you were and
  how far); the life situations as a compact list (`topicList`); then
  what's new. Section heads' ways on are grey words. `tests/look.test.mjs` holds it.

- **Every screen** (kit DESIGN §10): a phone upright is one column; with room
  for two (a phone on its side, a tablet, a computer) the page grows to 1180
  and each tab lays its sections side by side (`cols()` in `app.mjs`, the
  phone's order kept within each column), long lists run in two or three
  columns, cards in a grid. 問法律 and a law's text keep a reading width; on a
  computer a law's card and its 目錄 stand beside the text.

- **Budgets** (`budgetGroups` in `lib/ly.mjs`, the road in `lib/budget.mjs`): a
  budget's steps are its master bill's, its 審查總報告's filing, and while it
  hasn't passed, the 黨團協商 held on that report (113年度追加預算 has sat in
  協商 since 2025/01, never voted: it stands at 黨團協商, not 審查總報告). A
  第二預備金動支數額表 has four steps, ending at 審完 (reviewed, or deemed
  reviewed when the period runs out: 審查完畢(逾審查期限)), so it reads done.
  A card carries one date, in full, on the line under its road; one not done
  that sat still over half a year says how many months.
- **Links** (`lib/refs.mjs`, one rule for every screen): 第X條(之Y), ranges
  (至), lists (、), 前條/前N條, 前項/第N項, and another law's name before 第X條
  (index names plus `SHORT_NAMES`). A name we don't know right before 第X條
  links nothing (a repealed 組織條例 is not this law). About 99% of the 28k
  references in force land on a real article.
- **Names** (`abbr` in `lib/refs.mjs`): a law's 簡稱 (only ones in real use,
  勞基法, 道交條例) where it shares a line: chips, title bars, vote labels. Rows
  and cards show the whole name across their full width, two lines at most;
  counts sit on the line under it.
- **Stages** (`lib/bills.mjs`): 提案 → 一讀 → 委員會審查 → 審查完畢 → 黨團協商
  → 二讀 → 三讀 → 總統公布. 總統公布 is when the MOJ copy's 異動日期 is on or
  after the 三讀. A passed law 行政院 refused to countersign (不副署, 憲法 37) is
  never promulgated: `data-src/unsigned.json` lists the known ones with a news
  source, and each build adds new ones read in 行政院's own news and 院會 RSS
  (`unsignedIn`, only a name that is a passed, unpromulgated item); the item
  carries `ns: {d, src}`, its card reads 行政院不副署 and 已通過 groups them
  apart. A 報告 counts as a bill only when it quotes a law's 草案
  (`isLawBill`: a committee's report on a budget or a rule is no bill). Held: 退回程序委員會/程序緩列. Dropped: 撤案/撤回/不予審議.
  After a 三讀, versions still moving are the item's open round; versions
  that went quiet before it don't count as open, nor do the versions it took
  in (`passedRound`: tied to a passed one by 關連議案 and filed before the vote;
  立法院 leaves them at 排入院會 dated by a later sitting). 這週三讀通過 shows
  the passed round (`passedView`, the item's `pr`), not a newer one still open,
  and opens that round's sheet (`#item=…&round=passed`, `passedRoundOf`: its
  versions, proposers and articles, 最新 its 三讀, 新一輪 a link to the open one;
  the open sheet's 上一輪 links back). The bar shows six steps
  (`lib/cards.mjs`): 提案 · 一讀 · 委員會 · 院會 · 三讀 · 公布. 院會 takes in
  審查完畢, 黨團協商 and 二讀 (協商 happens at the floor, not between 一讀 and
  二讀). With several open versions, each step shows how many stand there ("5 版本"); a
  version only set for its 一讀 reads 排入院會，等一讀 (the bar's 院會 is later).
  The 立法 funnel counts versions by how far they got (`billCounts`), with how
  many still wait under each; a reviewed version a 三讀 of its law took over
  doesn't wait.
- **Plain words** (`lib/cards.mjs`): stages read as what's happening
  (等委員會審, 政黨協商中, 已通過), and 法案怎麼變成法律 (`STEP_HELP`) opens from
  the funnel and a bill's bar. A card's line under the name is the newest
  version's purpose (`aboutOf`, the 案由's 為… clause), also searched.
- **議程** (`lib/agenda.mjs`): a day's sittings at a time on the family's strip of days (the kit's dayBar, swiped too; a search lists every day's). 立法院's meetings from the API's `/meets`
  (`ly/agenda.json`, three days back on; `ly/agenda-past.json` the 90 days before, read once 議程 opens, so the day bar goes back; today's read again in the app, its
  發言名單 filling in on the day). The live video is IVOD's own stream for
  that meeting: the proxy's `/law-live` (Orbit-Core `law-live.js`, on
  demand, kept 60 s at the edge; no cron, nothing stored) reads IVOD's live
  list and each live meeting's channel; the app plays `ly-live<ch>`'s HLS. Nothing is matched by room name: a
  meeting IVOD doesn't list as streaming shows its state, not a video, and
  is never 直播中 on its scheduled hours alone (`meetState`'s `sched`).
  (國會頻道's YouTube room streams were tried first and showed other
  meetings; IVOD's own pages can't be framed.) A meeting shows its bills' cards, the
  speakers signed up, and the clips of who has spoken (the API's `/ivods`,
  each appearing as a speech ends). A bill's sheet shows the next meeting
  that takes it up (by 議案編號, law id, or its name in the 事由).
  看法案 (the family's links, Jay 11-10; `billNews`): it lists Orbit News'
  Taiwan stories whose headlines speak of changing it (Orbit-Core's
  `builders/news-laws.js`, `/data/news/laws.json` `bills`), each opening
  the story in News (`#s=<id>`); Orbit News' story sheet links back here.
- **One id, one link** for everything on the three sides: a law `#law=<pcode>`,
  an article `&a=<key>` (`184`, `39-1`), a ruling `#r=<id>` (`s748` 釋字第748號,
  `j111-10` 111年憲判字第10號, else the 司法院 JID), a bill `#item=<term>-<law>`.
  Data files use the same: cites are `pcode:key` (`pcode` alone: the law as a whole).
  立法's own pages (`#item=`, `#who=`, `#budget=`, `#notice=`, `#meet=`) tapped
  outside 立法 (我的, 首頁, a law) open as a sheet over that screen (`overHere`),
  a bill and a 立委 alike (Jay 2026-11-05); from 立法 itself, or a shared link,
  they open over 立法.
- **A tab you come back to stays as you left it** (Jay 2026-11-05: tabs jumped
  up and flashed). The kit's tabBar shows a tab drawn before at once and the
  app draws it again once the pill lands; every tab's draw goes through
  `paint(el, html)`, which leaves the nodes alone when the words are the same,
  and a part filled later (我的's 立委, 首頁's 政府公告) keeps its last drawing in
  its place (`laterHtml`/`fillLater`), so the page never goes short and Safari
  never drops the reader up. 法規 tapped again with a law open keeps the place
  being read (only a newly opened law starts at its top). `tests/tab-return.test.mjs`.
- **裁判, 憲法法庭** (`lib/cons.mjs`, `scripts/build-cons.mjs`): every 大法官解釋
  (1–813) and 憲判字 read from the court's own pages (open all day): question,
  holding, reasons, opinions, and its 相關法令 as article cites. Numbers cited
  as of a version older than the law's last whole rewrite (its 沿革) cite the
  law only. Each kept in the workflow cache (`.cons-cache/`), this year's read
  again. `data/cons/index.json` (every one's row: id, date, name, question,
  cites, the rulings it names, the bills whose purpose names it), `<id>.json`,
  `laws.json` (by law and article). The holding's word (違憲/合憲/部分違憲) is
  read from its own text.
- **裁判, the courts** (`lib/rulings.mjs`): every court's judgments citing a law,
  3 years back. `scripts/backfill-rulings.mjs` (workflow `rulings.yml`, nightly
  00:05–06:00 Taiwan time, when 司法院 opens; it saves the store to the cache,
  asks `pages.yml` for a deploy to Cloudflare and starts itself again while months remain) reads
  司法院's monthly archives and JDoc into `.rulings-store/` (cache only, never
  carried through a deploy). `scripts/build-rulings.mjs` (in `pages.yml`) makes what the
  app reads: 最高法院 and 最高行政法院 whole, by article (`rulings/<pcode>.json`),
  month (`rulings/m/`, `months.json`) and number (`find.json`); the other courts'
  判決 (高等法院 and branches, 高等行政法院, 智財商業法院, 地方法院 and 簡易庭) by
  article (`rulings/low/law/<pcode>.json`), 案由 (`low/t/<key>.json`), court
  (`low/c/<code>.json`), with `low/index.json` (courts, 案由, newest). No text
  is kept; a judgment opens through the proxy's `/law-page` and is read by
  `lib/judgment.mjs`: the outcome first, then each 理由 point whole (a court's ㈠ ⒈ read as （一） 1. and hung under it); past six lines a point shows four and the kit's 看全文 bar (`fitJdPoints`).
- **The sides link** (app.mjs): an article shows its rulings (purple when
  憲法法庭's) and the bills open on it; a law its 憲法法庭 strip; a ruling the
  articles it rules on, the bills that name it and the bills open on those
  articles; a bill the rulings that named it, 憲法法庭's on what it changes and
  how many top-court rulings cite those articles. 釋字/憲判 in any text open in
  the app. The 法規 search finds rulings too.
- **授權** (`lib/deleg.mjs`): a regulation sits under the article its first
  articles say it is made under (訂定/訂之/授權); a law cited by a former name
  (its 沿革's 原名稱) lists the regulation without an article.
- **Following 立委** (`lib/ly.mjs` personFeed): 我的 shows each one's newest
  bill, 質詢 and whole-bill vote; what came since they were last opened is
  marked 新.
- **The 我的 badge** (`lib/store.mjs` newsKeys, Jay 2026-11-05): one for each
  followed law amended, followed bill moved and followed 立委 with news, that
  came since the tab was last open (`orbit-law.told.v1`, this device); opening
  the tab clears it. A bill's 最新進度日期 still to come (a meeting set for
  next week) is no move until that day. Never the laws only looked at.
- **Votes a week after the sitting** (Jay 2026-11-10): the 公報 prints 記名表決
  two to three weeks late, but each 院會's 議事錄 PDF on ppg.ly.gov.tw
  (`recordPdf`) lists 本次會議各項記名表決結果名單 about a week after. `build-ly.mjs`
  reads it with pdftotext for each sitting since the newest 公報 vote that the 公報
  hasn't printed (`recordVotes`, names against the roster, NFKC; counts checked),
  ids `rec-<term>-<session>-<n>-<k>`, `recs` → the PDF; the sheet says so and
  links it. The 公報's own replace them once printed.
- **立委 by side** (Jay 2026-10-31): an independent's votes are set against the
  caucus they sit in (陳超明, 高金素梅 in the 國民黨團), else the party they side
  with most, never 無黨籍; the list is by 縣市 (north to south, 原住民, 不分區)
  with 依政黨 beside it; the build keeps each one's 黨團.
- **A law's page** (Jay 2026-10-31): one card (name, facts, what's moving, its
  doors along the foot); 憲法法庭 only the rulings about the law; drafts at
  一讀 a quiet line; bills open over the law; 沿革 a timeline. 繼續閱讀 resumes
  any law, ruling or bill where you were.
- **AI for a ruling** (Jay 2026-10-31): AI 白話解釋這個判決 on every 憲判字,
  釋字 and top-court judgment (the proxy's `/law-ask` mode `ruling`): what it
  decided, why (each reason citing the ruling's own numbered paragraphs, tapped
  open to its words), who it affects, then questions about it.
- **問法律** (`lib/chat.mjs`, `chats.mjs`, `find.mjs`): the proxy's live
  `/law-chat` (Orbit-Core `law-chat.js`, `law-ground.js`, `law-more.js`)
  finds what a question needs in this site's data: articles of every law
  and regulation, similar judgments and 釋字 (their 主文 and reasons read),
  行政規則, bills, budgets, legislators, votes, meetings, 政府公告, and the
  reader's own follows (sent only with a question about them), and the
  councils' and 代表會's bills and minutes rows for the places it names
  (Orbit-Core `law-local.js`; drawn as `r.local` blocks, each bill, councillor
  or 代表會 opening in the app). Claude
  Sonnet (GPT's Sol when it fails) then applies it to the reader's facts (who is likely right, penalties,
  remedies, next steps), each point citing an article, a judgment or a
  rule; each opens in the app. A follow-up sends the last 8 questions and
  answers back (`historyOf`; each answer as `answerText`: verdict, answer,
  facts, points). Under an answer only the judgments and
  rules it cites; a city's 地方法規 only for the reader's city (問法律's
  地方法規 row, else the county of the family's shared places) or one the
  question names. 司法院's judgment pages serve only Taiwan: the proxy reads
  them through its Taiwan relay. Rulings and rules read with every law they
  name a link (`view.mjs` linkedHtml, ruleHtml: a rule's 一、（一） as
  points). The verdict and the answer show as the model writes them (the
  proxy streams them as `draft` lines), the points and links when it's done.
  Chats are kept on the phone; 對話紀錄 lists them by day (今天, 昨天, 過去 7
  天, months) in grouped cards, with a search past 5 chats, and 全部刪除 asks
  in the kit's dialog (never the browser's). Its start (`chat.mjs`
  `askIdeas`): 從這裡問起, questions each saying why they're there (the law
  you read last at its article, a bill you follow, your legislators' votes,
  the bill that moved last, then `EVERYDAY` cases, a different few each day;
  never home's `STARTERS`), four on a phone and six in columns on a wide page;
  接著問, the last three chats. On a wide page it takes the page's width as
  every tab does, an answer's text (`.lw-msg-main`) beside its cards
  (`.lw-msg-side`) once the chat is 760 wide (`tests/ask-page.test.mjs`). 白話解釋 (`lib/ask.mjs`) is the proxy's live `/law-ask`
  on a law's latest amendment or a bill's 對照表. Both only on a tap, both
  through the Pass (`passFetch`), both reading this site's own files.
- **拍合約幫你看** (`lib/contract.mjs`, `contractSheet`; `#tab=ask&contract=1`, home's
  third way and 問法律's start): photos (`aiPicture`) or one PDF are read by the
  proxy's `law-contract-read` into clauses, or pasted text is split by code
  (`splitClauses`, `contractKind`); you pick your side (`sidesOf`, the paper's own
  parties) and, for work, whether you're 18; `law-contract` (Sonnet, Sol behind it)
  checks each clause against articles code picked for its kind and words; flags come
  back 違法或無效 / 對你不公平 / 要注意 (`LEVELS`), each on its clause, citing
  articles that open in the app, with what to ask for, then what the contract leaves
  out. Only on a tap; nothing of the contract is kept.
- **這一週** (你追蹤的法案週報, `lib/weekly.mjs`, `scripts/build-weekly.mjs`): each night
  the bills that moved and the laws amended in the last 7 days (staff tables left out)
  get one plain line each from the AI door (`law-weekly`, Haiku; a law by its changed
  words, `artBits`), kept until the week passes, in `data/ai/weekly.json`; 我的's
  這一週 (`weekOf`) lists what you follow among them with its line (in English, or
  before the night's build, the row's own words), 新 if new since you last looked.
- **行政規則 and 政府公告** (`lib/agency.mjs`, `news.mjs`, `notices.mjs`,
  `data-src/facts.json`): ministries' rules and RSS notices, and 預告 on
  join.gov.tw, kept beside the laws they rest on; the news and `facts.json`
  feed the AI's exact figures (最低工資). 首頁's 政府公告 reads only `news-top.json` (the
  newest 8, built with the rest by `scripts/build-news.mjs`), not the whole
  270 KB of news, so Law opens lighter. Every rule the agencies list is
  kept (`agency/all.json`, `names.json` for the 法規 search), linked to a
  law or not, its whole text in `agency/text/`. The rule sites (主管法規
  platform: 農業部, 環境部, 財政部, 教育部, 客委會, 國科會) are listed and read
  all at once, each host a request a second; `agency/state.json` carries
  each category's rows between deploys, so every night lists the longest
  unlisted categories and reads the pages not read yet.
- **地方法規** (`lib/local.mjs`, `build-local.mjs`): the cities' 自治條例,
  自治規則, 委辦規則 and 行政規則 from their own 法規查詢系統 (臺北市
  laws.gov.taipei, 新北市 web.law.ntpc.gov.tw, and the 主管法規 platform of
  every other city and county: `platform(code, city, base)` in
  `build-local.mjs`), built like the ministries' rules: every
  rule kept, `local/all.json` (`[id, name, city, date, url, laws]`, id =
  city code + `:` + the site's id), `local/names.json` for the 法規 search's
  地方法規 section, whole text in `local/text/`, `local/state.json` carrying
  each list part and each page's read stamp between deploys (自治條例 read
  first, then 自治規則, 委辦規則, 行政規則). The AI Worker reads
  `all.json` and `text/` by that shape. A site that fails keeps the last
  copy; `local/all.json`'s `sources` says each one's count and error (the
  cloud box reached 臺北, 新北, 高雄, 臺中, 新竹市, 金門, 苗栗, 彰化, 連江,
  嘉義市; the rest are tried from the deploy's runner).
- **Every kind of text, one home** (Jay 2026-11-10: 命令 and 地方法規 weren't treated as laws;
  `lib/kinds.mjs`, `lib/rule-doc.mjs`): one table (`KINDS`) names each kind (憲法, 法律, 命令,
  行政規則, 地方法規 with its four: 自治條例, 自治規則, 委辦規則, 行政規則), its data, its id and its
  part (條 or 點); a new kind is one entry and its builder. A rule kept from a ministry's or a
  city's site has a Law id (`agency:<id>`, `local:<id>`, `#law=local:TPE:FL002177`) and opens in
  the one reader as a law does: `ruleDoc` reads its text into 條 (on lines of their own, run
  together, fixed width) or a 要點's 點, 第X章 as headings, the site's repeated name dropped, the
  rest one formatted block ('T'; a text only pointing at its attachment says so). So a rule has
  its 目錄, numbers, links, 找字, ☆ (`mine.rules` keeps its name for 我的 and the Pass), 繼續閱讀,
  bookmarks, 修了什麼 (its text file's `x`: each re-read version diffed part by part at build,
  `ruleChange`; `<dir>/changes.json` 修法追蹤 120 days), 依據 (the build's `B`, else read off its
  first lines on the phone, `deleg.mjs basisOf`), 同法規定 (the other rules on that law), and
  its source a tap below. A law lists the cities' rules resting on it in its 子法 sheet
  (`local/law/<pcode>.json`, `local/laws.json`), the reader's cities first. AI 白話解釋 stays
  MOJ's (the proxy reads `law/<pcode>.json`).
  **法規種類** (法規's first section, `#tab=laws&kind=law|order|agency|local&g=…&sub=…`,
  `drawKind`): each kind browsed whole, newest first, filtered by name as typed, 最近修正 on top:
  法律 and 命令 by topic; 行政規則 by ministry (`agency/agencies.json`, `agency/g/<code>.json`);
  地方法規 by city, the reader's first (`local/cities.json`, `local/c/<code>.json`), and its
  four kinds. Every search row of a rule kept here opens the reader, not the site.
- **Swipe back** (Jay 2026-11-10): a swipe in from the left edge goes back wherever the page has
  a way back (a law, a kind, a topic): the kit's `edgeBack`; sheets swipe down (the kit's).
- **Plain text read as its structure** (`view.mjs` textBlocks/proseHtml; Jay
  2026-10-31): every text the sources hand us as a blob (rules, a ruling's
  主文 and 理由, a judgment's points, a bill's 案由/說明/立法說明, a draft's
  總說明, a meeting's 事由, a government page's text) is drawn by one function:
  壹、 and short 一、 lines are headings, 一、（一）1.（1） points hung by depth,
  points run together on one line split where the numbers follow on (never
  inside 「」), wrapped lines joined, 【N】 a quiet number. Diffs
  (`cards.mjs` diffBlocks: 修了什麼, 對照表, 預告) read as the article: a line a 項,
  款 and 目 hung, each 款's number kept. An article's 目 hangs under its 款;
  施行日期's wrapped lines are joined, its article numbers links.
- **Finding** (`lib/search.mjs`, `fulltext.mjs`, `topics.mjs`): names, short
  names and article jumps; 全文檢索 by bigram buckets built at deploy; every
  law sorted into a topic.
- **Search order** (`rankLaws`, `likelyLaw`; Jay 2026-10-31): a law's name
  comes before articles that mention it. The name, a short name or the start
  of one (勞基 → 勞動基準法, 憲法增 → 中華民國憲法增修條文), the name's start
  (中華民國 left off), inside it, then its characters near the start (性平);
  ties go 憲法 · 法律 · 命令, then laws with a short name. The law a search can
  only mean is the card on top, the laws whose names hold it under it (名稱相近的法律),
  then 子法, 行政規則 and 地方法規 by name, then 其他法規提到它. Everyday words apart in
  a name count (`ideas`: 高中服儀 → 高級中等學校訂定學生服裝儀容規定之原則). `ALIASES` adds everyday names to `SHORT_NAMES` for search
  only. `tests/search.test.mjs`: 38 queries on the real index's names
  (`tests/fixtures/law-names.json`).
- **為你推薦** (`lib/foryou.mjs`; Jay 2026-11-03: the family's picks were weak):
  the laws people use (how often rulings cite one, the everyday ten) in the
  subjects you read lately and keep (☆), ranked by the kit's `rank` with the
  family's one engine (`feedback.mjs` `lifter`): the first three covers
  shown, a law opened from them or anywhere (`trackReading`) and a ☆
  (`lawActed`), learnt by law and subject and kept on the Pass (`fb:law`):
  a subject passed over makes way, one opened rises. Never one read lately; a
  subject's third pick only when far ahead. Replayed (Orbit-Core
  `tools/picks-backtest.mjs law`): opened 12–18% → 35–38%.

## Files

| File | What |
| --- | --- |
| `public/app.mjs`, `index.html`, `law.css`, `look.css` | The page: five tabs, the reader, 裁判, the sheets; Orbit's own look |
| `public/lib/refs.mjs` | References in a law's text, Chinese numerals, 項 |
| `public/lib/bills.mjs`, `cards.mjs` | Stages, folding versions into items; cards, funnel, progress bar |
| `public/lib/council.mjs` | 地方議會: councils, sittings, bills' outcomes, councillors, 代表 |
| `public/lib/council-video.mjs`, `town-site.mjs`, `town-chcg.mjs`, `town-video.mjs` | Councils' live and recorded video; a 代表會's own site (竹北), 彰化's on the county's platform and its 公所's sites (TSO, Parser CMS); 代表會's YouTube channels |
| `public/lib/agenda.mjs`, `ly.mjs` | 議程 and live by Taiwan time; votes, legislators, budget |
| `public/lib/data.mjs`, `deleg.mjs` | The law files' shape, 修法追蹤 diffs; 授權 |
| `public/lib/cons.mjs` | 憲法法庭: ids, its pages read, cites, by law, the bills naming one |
| `public/lib/rulings.mjs`, `judgment.mjs`, `reader.mjs` | Top-court rulings by article and month; a judgment read into parts; a government page read in the app |
| `public/lib/agency.mjs`, `local.mjs`, `news.mjs`, `notices.mjs` | 行政規則, 地方法規, 政府公告, 預告 |
| `public/lib/search.mjs`, `fulltext.mjs`, `find.mjs`, `topics.mjs` | Finding a law or article, full text, topics |
| `public/lib/foryou.mjs` | 首頁's 為你推薦 (the kit's engine) |
| `public/lib/ask.mjs`, `chat.mjs`, `chats.mjs` | The proxy's `/law-ask` and `/law-chat`; saved chats |
| `public/lib/contract.mjs`, `minutes.mjs`, `weekly.mjs` | 拍合約幫你看; 會議紀錄變表格; 這一週 (法案週報) |
| `public/lib/view.mjs`, `stack.mjs`, `store.mjs` | Articles and timeline as HTML; the sheet trail; follows, bookmarks, recent (this device) |
| `scripts/build-*.mjs`, `lib.mjs` | The data builds and what they share |
| `data-src/facts.json` | Figures the news build keeps |
| `data-src/unsigned.json` | Laws 行政院 refused to countersign, each with its source |

## Run and test

- `npm test` (logic only), `node scripts/build-data.mjs --prev ''` for
  real data locally (about 60 MB in `public/data/`; the other builds
  follow it).
- `npm start`, or `node ../Orbit-Core/tools/preview.mjs law --width 375`.
