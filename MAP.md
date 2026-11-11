# Orbit Law: the map

Taiwan's law on three sides that link to each other: the laws to read
(法規), with every reference a link; the courts' rulings on them (裁判:
憲法法庭's every 釋字 and 憲判字, the top courts' judgments); and the bills in
立法院 that will change them (立法), stage by stage. Behind the Orbit Pass
like every Orbit app; the data is public, built onto this site once a day,
and works offline once opened. Tabs: 首頁 (one field, search or ask) · 法規 · 裁判 ·
立法 · 我的, and 問法律 on its own round button beside them.

Live: https://orbit.jaypengx.com/law/

## Rules

Jay's rules for Law, dated (MM-DD, 2026), newest wins. The family's rules are in
`../Orbit-Core/docs/RULEBOOK.md`.

- 10-19 No Cloudflare cost; data built apart from deploys, never committed.
- 10-21 Three equal, linked sides: law, rulings (all 憲法法庭/大法官 included), legislation; one id scheme, one search.
- 10-21 The AI answers anything in the app and makes the judgement call with citations; does the work itself (no generic 下一步 or 找哪個機關); verdict first, few facts, no wall of text; recent items first (newest budgets unless a year is asked).
- 10-21 Coverage: all 法規命令, ministry 行政規則, local 自治條例 and 規則 (Taiwan-only county sites through the Taiwan relay).
- 10-22 直播中 only when IVOD says so (fresh); never live from the schedule; never live on a day off.
- 10-27 問法律 shows only what it used: similar rulings and rules only when the answer cites them (a rule asked by name always); a city's 地方法規 only for the reader's own city (picked in 問法律, else their family places' county) or one the question names; few articles per question; the status says what it is really checking; every 立法院 card a tap away (a budget first, never behind 更多 N 件); citation chips one line.
- 10-30 問法律 has a place of its own ("dedicated place for Law AI"): the round action button beside the tab bar, lit while open; and it must be fast: the verdict and answer stream as written, nothing waits on what can run beside the plan.
- 10-31 Rulings get an AI of their own, like an article's 白話解釋 ("We need AI tool for rulings as well"): what it decided, why, who it affects, and questions about it, from the ruling's own paragraphs only, each point citing them; not legal advice. A ruling reads like the rest of the app: no justified, letter-spaced text, inside its card's padding.
- 11-03 首頁 says what the app does at a glance (one field: search or ask).
- 11-05 A tab you come back to stays as you left it; 立法's pages tapped elsewhere open as a sheet over that screen; the 我的 badge counts only what you follow, never laws only looked at.
- Rulings backfill runs 00:00–06:00 TW nightly; only `rulings.yml` writes that cache.
- 11-10 Law brings every source in (Jay: "our goal is to have as least plain text and at least need open external source as possible, if we can format it and show it properly in app we do that"): whatever a source holds (a PDF, a council's page, a 議事錄, a recording) is read at build or on the phone and shown formatted in the app (its parts, names, decisions, days), the original only as a fallback link; a raw text dump or a bare link out is the last resort, and a source that can't be brought in is named to Jay.
- 11-10 議會 is 立法 too: all 22 councils and every 代表會, as useful as 立法院's pages (videos, formatting, filtering, results, schedules).
- 11-10 Council and 代表會 pages are for looking anything up, like 立法院's, not only what's recent (Jay: "right now it's focused heavily on 最近 unlike legislative yuan that I can basically look up anytime and anything"): every session of the term, every sitting, member, bill and recording, searchable; a long recording gets a short summary of its sitting.
- 11-10 A recording plays straight from its source and starts within the tap (Jay: the 新竹縣議會 video and 竹北's 錄音 "slow when it can be serve fast").
- 11-10 命令, 行政規則 and 地方法規 are laws too: each opens in the one reader with everything a law has; a swipe from the left edge goes back.
- 11-11 問法律 runs on Claude Sonnet (GPT's Sol behind it) and answers about anything in Law, from the smallest regulation to a 代表會; it says what a delegated rule sets (起徵點), never 「由財政部定之」.
- 11-11 A council bill's card carries its decision date.

## How it works

- **Data built apart from deploys, never in git.** `data.yml` builds `public/data/` at 11:00,
  17:00 and 21:00 Taiwan time, on a push that changes a builder, and at 03:30 with the crawls'
  longer budgets; after `rulings.yml` reads more it builds without crawling (`crawl=0`: a part
  whose step fails, or isn't crawled, keeps its last copy). It keeps the built data in the
  Actions cache (`law-data-<run>`, three newest) and starts `pages.yml`, which deploys on every
  push and after each data build in a few minutes (`npm test`, the newest kept data,
  `stamp-version.mjs`, `pack-data.mjs`, published) and never crawls. Each build reads its last
  copy from the kept data first (`PREV_DIR`), the live site only for what's missing
  (`scripts/lib.mjs`). The builders, in order: `build-data.mjs` (全國法規資料庫's bulk files →
  `index.json`, `law/<pcode>.json`, `en/<pcode>.json`, `changes.json` 修法追蹤 kept 120 days; the
  ministry's last good zips in `.moj-cache/`), `build-notices.mjs` (預告 and their 公報 PDFs,
  `pdftotext -bbox`), `build-ly.mjs`, `build-council.mjs`, `build-council-text.mjs`,
  `build-town.mjs`, `build-photos.mjs` (立委 headshots committed under `public/img/ly/`;
  councillors' cached), `build-budget.mjs` (主計總處's 預算表), `build-agency.mjs`,
  `build-local.mjs`, `build-rulings.mjs`, `build-cons.mjs`, `build-news.mjs`, then
  `build-status.mjs` (`data/status.json`, each part's time and count, read by the admin panel's
  外部來源; any source step may fail without stopping the deploy).
- **Packed for the free plan:** Workers Free publishes 20,000 files a site and the data is
  about 77,000, so `pack-data.mjs` packs each folder of 50 files or more into ~96 KB packs
  (`<root>/_p/<b>-<hash>.json`, listed in `data/_packs.json`; a file over 48 KB stays alone; the
  kit's `data-pack.mjs`). Every reader goes through the kit's `packReader`: the app's `data()`,
  the proxy's `readData`/`readGround`, the next build's `prevJson`. Never fetch
  `law/data/<folder>/<file>` directly. The deploy stops before publishing past 20,000 files.
- **Bills** come from the g0v 立法院 API (v2.ly.govapi.tw, a daily mirror
  of 立法院's 議事 data). Only bills whose 最新進度日期 moved since the last
  build are fetched, merged into the last deploy's `bills/all.json`.
  `bills/items.json` has one item per law per term (every version folded
  in), and `bills/item/<term>-<law>.json` that item's versions. A version's
  對照表 is fetched from the API only when opened in the app.
- **地方議會 and 代表會** (立法's 議會 door; `lib/council.mjs`, `council-video.mjs`,
  `town-site.mjs`, `town-chcg.mjs`, `town-video.mjs`, `player.mjs`, `minutes.mjs`;
  `scripts/build-council.mjs`, `build-council-text.mjs`, `build-town.mjs`): the 22 councils from
  歐噴's 地方議會開放 API (all.cc.govapi.tw), filled from each council's own site where the API
  is thin; their video from HiNet, their own IVODs or YouTube, played in the app; 代表會 from
  their 公所's sites (twgov, CCMS, Drive folders, WordPress, Joomla and more), their papers read
  into rows and text, their recordings played in the app. Every council's and town's source,
  file and quirk: [COUNCILS.md](COUNCILS.md) (read it before touching a council or a town).
- **Reading costs nothing:** static files on Cloudflare, kept by the service
  worker (data: the kept copy first, refreshed behind it; a pack for good,
  its address is its content; `_packs.json` from the network first).

## The app, part by part

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
  asks `data.yml` for a build (which deploys) and starts itself again while months remain) reads
  司法院's monthly archives and JDoc into `.rulings-store/` (cache only, never
  carried through a deploy). `scripts/build-rulings.mjs` (in `data.yml`) makes what the
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
  councils' and 代表會's bills, councillors' 質詢 (the transcripts) and minutes
  rows for the places it names (Orbit-Core `law-local.js`; drawn as `r.local`
  blocks, each bill, councillor or 代表會 opening in the app). Claude
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
  before the night's build, the row's own words), 新 if new since you last looked;
  its head carries Orbit AI's mark (the kit's `sectionHtml` `{ ai: true }`) when a line shows.
- **Made ahead** (`ai/`, Orbit-Core's `tools/credit/`, once with the API credit): every
  釋字 and 憲判字 explained (`ai/ruling/<bucket>-<lang>.json`) and the everyday laws'
  articles (`ai/explain/<p>-<bucket>.json`), each keyed to the text it was made from;
  the deploy copies them to `data/ai/`, and `/law-ask` answers from them free while that
  text is unchanged (a question or a new version still asks).
  Also made then: `ai/phrases.json` (people's words → the articles that answer them:
  找法's 可能是這幾條, `find.mjs phraseHits`, served as `data/ai/phrases.json`) and
  `ai/agency.json` (each 行政規則's one plain line, on its card with Orbit AI's mark, and its
  everyday words, searched after its name: `build-agency.mjs` puts them in its text file's `s`
  and `names.json`'s sixth field). `ai/gold.json`: test questions checked against the articles.
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
  unlisted categories and reads the pages not read yet. Kept from them: 行政規則
  and 其他 named as a rule, short-titled ones named by what they set (函釋 titles,
  never a sentence or a letter's number: `titledRule`), and a ministry's own 命令
  the national database lacks (財政部's 小規模營業人營業稅起徵點, the figure
  營業稅法 第26條 leaves to it). A 令's 「一、依據…第N條規定辦理」 is its basis
  (`deleg.mjs`), so it shows under that article and 問法律 lifts it.
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
| `public/lib/budget.mjs`, `history.mjs`, `reading.mjs` | A 總預算's money and cuts; 沿革 read as a timeline; 繼續閱讀 |
| `public/lib/kinds.mjs`, `rule-doc.mjs` | Every kind of text (`KINDS`); a kept rule read into 條 or 點 |
| `public/lib/player.mjs` | Every video and recording played (Safari's HLS or hls.js, the watchdog) |
| `COUNCILS.md` | Every council's and 代表會's source, file and quirk |
| `scripts/build-*.mjs`, `lib.mjs`, `pack-data.mjs` | The data builds and what they share; the data packed for the deploy |
| `data-src/facts.json` | Figures the news build keeps |
| `data-src/unsigned.json` | Laws 行政院 refused to countersign, each with its source |

## Run and test

- `npm test` (logic only), `node scripts/build-data.mjs --prev ''` for
  real data locally (about 60 MB in `public/data/`; the other builds
  follow it).
- `npm start`, or `node ../Orbit-Core/tools/preview.mjs law --width 375`.
