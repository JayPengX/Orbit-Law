# Orbit Law: councils and 代表會

Every 縣市議會's and 鄉鎮市民代表會's source, file and quirk: read this before touching a council
or a town; [MAP.md](MAP.md) has the app's rules and the rest of the map. A new town or a
changed source updates this file in the same push. 雲林's sites refuse readers outside Taiwan.

## The councils

**地方議會** (立法's 議會 door; `lib/council.mjs`, `scripts/build-council.mjs`):
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

## Video

(`lib/council-video.mjs`; `video` in `council/<code>.json`): each night the
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

## Playing

(`lib/player.mjs` `keepPlaying`, through app.mjs `playHls`: every council, 立法院 IVOD clip and
live channel): Safari's own HLS (Chrome's too where it has it), else hls.js (patient fragment retries, 60 s
buffer); a watchdog brings back a picture that stopped while playing (a nudge, then the stream loaded again
where it was, backing off, waiting out offline; 6 tries, then 「再試一次」), passes a frame the phone can't
decode (`SKIP_BAD`: 11 of 新竹縣's 24 newest recordings carry one in their first 10 s), and warms a
recording's next 40 s at the CDN when its pieces are short (HiNet's 2 s ones, made on first ask) with
one-byte asks. Jay 2026-11-11: 新竹縣's videos got stuck.
代表會 have no bills or sittings in any open data, so most show their members only.

## 代表會 on YouTube

(`lib/town-video.mjs` `TOWN_YOUTUBE`, found by YouTube's channel search and checked by eye,
`scripts/find-town-youtube.mjs`): each night the build reads each channel as a council's (`ytChannel`: 6 pages
a list the first time, then one, and the feed) into `council/town-video/<tc>.json`, merged over the last; the
town's sheet shows 影音 (`townVideos`), each recording played in the app (`openCouncilVideo` with the town as context).

## Bills read from their PDFs

(`scripts/build-council-text.mjs`, `billPdfParts` in
`lib/council.mjs`): 新竹縣's and 新竹市's proposals are PDFs; each build reads the newest
not yet read (pdftotext -layout; hcc.gov.tw a request every 2 s) into 案號, 說明, 辦法,
議決 and the sitting that decided it (its outcome and its day, `decidedDays`, then set on the council's lists and session files: 新竹縣's list dates a bill the day it was posted), kept in `council/text/<code>/<n>.json` (64 files by
`textBucket(id)`); a bill's sheet shows them as the API's bills are, the PDF a link below.

## A 代表會's own site

(`lib/town-site.mjs` `TOWN_SITES`, `scripts/build-town.mjs` →
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

## 彰化's 代表會 on the county's platform

(`lib/town-chcg.mjs`, `chcgTown`; TOWN_SITES entries with `chcg`):
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

## Beyond 彰化

南投's 名間 posts on its own WordPress site (`wp`: the REST API's posts naming a session,
`wpPost`; 議事錄 on Drive, 議程表 as pictures; MP3s named by month and day take the post's year, `wpDay`).
臺東's 東河 on its 公所's Joomla site (`joomla`: category lists `?start=`, an article a paper or a session's Drive
recordings, `joomlaList`, `joomlaArticle`; up to 80 articles a build); 太麻里 on the same (a list page ending
.html, articles in `item_fulltext`, each link named by the line above it; 錄音檔及議事錄 articles a kind a link). 宜蘭's 頭城 on its 公所's e-land CCMS
page (`ccms`, `ccmsPage`: file blocks by title, Download.ashx's base64 path read as the file's own address;
MP3s by day under a bold line naming the session). A recording or paper dated inside another session's days
goes to that one (頭城 names one session's line twice), and a session's days are its agenda's, else the days
most of its papers' names give. 宜蘭's 壯圍 on its own "boxlists" site (`box`: a list a kind, `boxList`; a line
the file or a page of files, `boxFiles`, the 議事錄 with its sittings' recordings named by the Western day,
`westDay`; a 預定 agenda only when there's no other). A deadline in an agenda's notes (9 月 8 日前) isn't a day.
礁溪 on its 公所's CCMS pages too (blocks inside a 相關檔案 block, each by its own title; 臨時會 minutes a post
each, `ccmsNews`; a session's recording on Drive). An agenda in .odt or .docx is read from inside the zip
(`unzip`), and an old .doc for the runs of its UTF-16 text that read as a council's (秀水's agendas, 員山's
minutes). 員山: its 議事錄 page and its recordings a page a kind (`{ url, kind }`: 2205-0512 → 第22屆第5次
定期會, 5月12日). 羅東: its own plain site (`files`: record.html, every file linked, `linkFiles`; days in a
name without dots, 1150413-0415, `nameSpan`; its recorder.html's YouTube sittings under their session's heading, `ytId`, its older
pages followed by `more`, `pageMore`: a day `{ d, yt, what }` played in the app's 代表會影音 sheet, a thumbnail a row). 蘇澳: its 議事錄 posts (News.aspx, twenty a page, `&page=`). 三星 (one Drive
folder), 南澳 (proposal tracking only), 大同, 冬山: nothing to read; 宜蘭市, 五結: not reachable.
花蓮's 秀林 and 壽豐, 苗栗's 苑裡: the same CCMS on their 公所's sites (`ccms`). 秀林's 質詢錄音檔 posts link each
sitting's video on YouTube by its day (115年10月13日, `dayIn`), its post's session; 苑裡's lists are the files
themselves (`ccmsNews` `file: true`, nothing more to fetch). An agenda with no year (苑裡's 09 月 09 日 三) is
placed by its rows' weekdays (`pdfSpan` keeps them, 埔心's 月/日 tables too, `yearOf` picks a year they fit; months
and days kept from before, `mdv` under 2, are read again once). 壽豐's agendas are scans
(undated); 頭份 posts only the last term's recordings (Drive folders).
澎湖's six (馬公, 湖西, 白沙, 西嶼, 望安, 七美): each a site on the county's platform (`penghu`: event.penghu.gov.tw/R…/), lists by id (開會日程表, 議事錄, 開會影音檔; `penghuList`, fifteen a page, `&pagenum=`), each post's
files by label, the PDF of its formats, and its sittings' own MP4s (`penghuPost`; named 10.06-1, `penghuDay`): a
day `{ d, n, src, pic }` the app plays as a video (`townVideo`, `.lw-video-file`). Files named in the query
(file=….ods&flag=doc) are read as their kind; .ods like .odt.
屏東's (`pthg` in town-site.mjs; 潮州, 東港, 恆春, 萬丹, 長治, 九如, 鹽埔, 萬巒, 竹田, 新埤, 高樹, 枋寮, 南州, 崁頂, 琉球, 車城, 三地門, 霧臺, 泰武, 來義, 春日,
牡丹; 內埔 on its own www.neipu.gov.tw): each on its 公所's site on the county's platform (www.pthg.gov.tw/<town>/, CCMS): lists of posts (News.aspx, News9.aspx,
`ccmsNews` by the line's text), or of the files themselves (News4.aspx, through HitCount.ashx, named 22-8定期會…:
`pthgName` writes the session out, the file's ending kept on the address as `#.pdf`/`#.mp3` for what reads by it);
a post's 相關檔案/相關連結 lines (`news_box03_data` in `ccmsPage`), a recording named by its day, 20260909錄音檔
(`westDay`), on Drive. A post that can't be read is noted and passed; a list's later page that can't, ends it.
高樹's lists are a page a session (`tree`: `ccmsTree`, each page read for its session, its sittings' videos on
YouTube by day, 115.10.28); a session long over keeps its kind from before (`kept`), its page not read again.
里港, 新園, 林邊 (and 恆春's recordings and minutes) keep theirs in Google Drive folders (`drive`: a folder id a
kind): read from Drive itself as it shows a folder embedded (`driveEntries`, embeddedfolderview), a folder a
session (or the session in each file's name), another term's never opened, a session long over kept from before;
a file's ending kept on its address (`#.doc`) for the text reader; recordings named by day (20201028.mp3).
臺東's 關山, 鹿野 and 南投's 中寮 the same: 22-10臨時會 names read as 屏東's (`pthgName`, 22-6. in a 定期會
folder too), a 議決案 folder's files 決議案, beside a 第22屆 folder those naming no term skipped, a paper kept in
two folders once, a year more than two before the newest in its folder left out (the term before's).
嘉義縣's 梅山: one Drive folder, a folder a session with every kind (a recording by its name, 錄音檔; desktop.ini
left out); 大埔, 布袋 (定期會-第22屆第01次 folders), 民雄 (22屆1次臨時會 names) and 六腳 the same. 竹崎, 阿里山,
新港, 義竹, 鹿草 on their 公所's CCMS (`ccms`, through the door); 朴子市 (term 9) its tabbed cp page. 南投's 草屯 on its 公所's own CMS (`files` with
`more`: its lists' posts, `reads` 20 pages; `linkFiles` takes single-quoted links and names a recording under its
session's heading, 錄音檔1). 臺東's 池上 on the 代表會's own site (`csc`: /calendar, /notes, /sound ?period=22,
`cscList` rows by session, `cscPost` its Drive file, `cscDay` a sitting's 10/12 in the session's year).
花蓮市 on the city's Nuxt site (`hlc`: /citizen/news, only its newest posts drawn on the page, `hlcList`,
`hlcFiles`; a post a paper or a session's recording).
新竹縣's (`hcg`: 竹東, 關西, 芎林, 寶山, 五峰) on their 公所's sites on the county's platform (<town>.hsinchu.gov.tw,
CCMS News.aspx lists, read like 屏東's); 北埔's on its 公所's twgov CMS (竹北's kind): `circ`, lists of rows a paper
each (`listRows`, iframcirculatedview's files by `pageFiles`). 苗栗's 卓蘭, 大湖, 銅鑼, 南庄, 頭屋, 西湖, 三灣, 泰安,
竹南, 三義 and 花蓮's 鳳林, 萬榮 on their 公所's CCMS as 苑裡's (泰安's sittings: YouTube under 相關連結, `ccmsPage`;
竹南's minutes in a video list, News_Video.aspx, read as News.aspx; 公館's cp pages, its recordings in tabs a
session a tab, `tab-cp`/`tab-cp-target`, and 第21-6臨時會 names); 南投's 鹿谷 on its 公所's Laravel
CMS (`lara`: `laraList` rows, `laraFiles` file-download links). 金門's sites (*.kinmen.gov.tw) the door can't reach:
read from the build itself (`DIRECT`, two seconds apart, a firewall's refusal read again), their certificate's
missing issuer given by data.yml (`NODE_EXTRA_CA_CERTS=scripts/twca-ssl.pem`). A town never built yet goes first (竹東 before those), with 3 minutes of its own (`TOWN_FIRST_MINUTES`; its other papers on later builds), then the one built longest ago.
The picked council is this device's
(`orbit-law.council.v1`), first your 我的 city's.

## 議程

(`councilAgenda`): a council's days on the family's day strip, the whole term (the phone reads the
API's every sitting itself, `ccTermSittings`, one read) and the days only its recordings know (`councilDays`:
彰化's API stops in March); a day shows its sittings, each with its recording, and the day's other recordings.
A sitting typed a year off its session (花蓮's API: 2027 for 2026) is set back into it
(`saneSittings`, at build and on the phone's live read).

## 追蹤的議員

(☆ on a councillor's sheet; `mine.cc`, `<council>:<name>`, synced with the rest of 我的):
`councilorFeed` reads their bills and speeches live (the API) and their 質詢 recordings, newest first;
`trackedCC` counts what's new since each was last opened (the 我的 badge), `drawTrackedCC` their cards.

## 各議會的議程

(`allCouncilAgenda`): every council's sittings on one day strip, by council (the reader's
first), each with its recording; one file, `council/agenda.json` (`agendaOf`, at build: three weeks back to two
months ahead from each council's newest sittings and recordings).
