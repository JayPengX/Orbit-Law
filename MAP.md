# Orbit Law: the map

Taiwan's law on three sides that link to each other: the laws to read
(法規), with every reference a link; the courts' rulings on them (裁判:
憲法法庭's every 釋字 and 憲判字, the top courts' judgments); and the bills in
立法院 that will change them (立法), stage by stage. Behind the Orbit Pass
like every Orbit app; the data is public, built onto this site once a day,
and works offline once opened. Tabs: 首頁 (one search) · 法規 · 裁判 ·
立法 · 我的, and 問法律 on its own round button beside them.

Live: https://orbit.jaypengx.com/law/

## How it works

- **Data at deploy, never in git.** `pages.yml` runs on every push and daily
  at 03:30 Taiwan time: `npm test`, then `build-data.mjs`, `build-notices.mjs`
  (each 預告's join.gov.tw record and its 總說明 and 條文對照表 read from the
  公報 PDF with poppler's `pdftotext -bbox`: `bills/notice/<id>.json`), `build-ly.mjs`,
  `build-photos.mjs` (立委 headshots mirrored as 96/192 px WebPs, committed
  under `public/img/ly/`; only a newcomer's is fetched), `build-budget.mjs` (each 總預算's
  money from 主計總處's 預算表 on data.gov.tw: `ly/budget/<year>.json`, cuts
  as 預算案 − 法定預算), `build-agency.mjs`, `build-local.mjs`, `build-rulings.mjs`, `build-cons.mjs` and `build-news.mjs` in that order
  (each builds on the last deploy's copy, `scripts/lib.mjs`), then
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
- **Reading costs nothing:** static files on Pages, kept by the service
  worker (data: the kept copy first, refreshed behind it).

## Decisions in force

- **Every screen** (kit DESIGN §10): a phone upright is one column; with room
  for two (a phone on its side, a tablet, a computer) the page grows to 1180
  and each tab lays its sections side by side (`cols()` in `app.mjs`, the
  phone's order kept within each column), long lists run in two or three
  columns, cards in a grid. 問法律 and a law's text keep a reading width; on a
  computer a law's card and its 目錄 stand beside the text.

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
  after the 三讀. Held: 退回程序委員會/程序緩列. Dropped: 撤案/撤回/不予審議.
  After a 三讀, versions still moving are the item's open round; versions
  that went quiet before it don't count as open. The bar shows six steps
  (`lib/cards.mjs`): 提案 · 一讀 · 委員會 · 院會 · 三讀 · 公布. 院會 takes in
  審查完畢, 黨團協商 and 二讀 (協商 happens at the floor, not between 一讀 and
  二讀). With several open versions, each step shows how many stand there.
  The 立法 funnel counts versions by how far they got (`billCounts`), with how
  many still wait under each; a reviewed version a 三讀 of its law took over
  doesn't wait.
- **Plain words** (`lib/cards.mjs`): stages read as what's happening
  (等委員會審, 政黨協商中, 已通過), and 法案怎麼變成法律 (`STEP_HELP`) opens from
  the funnel and a bill's bar. A card's line under the name is the newest
  version's purpose (`aboutOf`, the 案由's 為… clause), also searched.
- **議程** (`lib/agenda.mjs`): a day's sittings at a time on the family's strip of days (the kit's dayBar, swiped too; a search lists every day's). 立法院's meetings from the API's `/meets`
  (`ly/agenda.json`, three days back on; today's read again in the app, its
  發言名單 filling in on the day). The live video is IVOD's own stream for
  that meeting: `scripts/live-ly.mjs`, run by `live.yml` every 90 seconds in
  sitting hours (each run starts the next, since GitHub's schedule alone
  is late or skipped; `live.json` rewritten at least every 10 minutes), reads IVOD's live list and each live meeting's channel and
  writes `live.json` to the `live` branch (read from raw.githubusercontent);
  the app plays `ly-live<ch>`'s HLS. Nothing is matched by room name: a
  meeting IVOD doesn't list as streaming shows its state, not a video, and
  is never 直播中 on its scheduled hours alone (`meetState`'s `sched`).
  (國會頻道's YouTube room streams were tried first and showed other
  meetings; IVOD's own pages can't be framed.) A meeting shows its bills' cards, the
  speakers signed up, and the clips of who has spoken (the API's `/ivods`,
  each appearing as a speech ends). A bill's sheet shows the next meeting
  that takes it up (by 議案編號, law id, or its name in the 事由).
- **One id, one link** for everything on the three sides: a law `#law=<pcode>`,
  an article `&a=<key>` (`184`, `39-1`), a ruling `#r=<id>` (`s748` 釋字第748號,
  `j111-10` 111年憲判字第10號, else the 司法院 JID), a bill `#item=<term>-<law>`.
  Data files use the same: cites are `pcode:key` (`pcode` alone: the law as a whole).
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
  asks Pages for a deploy and starts itself again while months remain) reads
  司法院's monthly archives and JDoc into `.rulings-store/` (cache only, never
  carried through a deploy). `scripts/build-rulings.mjs` (Pages) makes what the
  app reads: 最高法院 and 最高行政法院 whole, by article (`rulings/<pcode>.json`),
  month (`rulings/m/`, `months.json`) and number (`find.json`); the other courts'
  判決 (高等法院 and branches, 高等行政法院, 智財商業法院, 地方法院 and 簡易庭) by
  article (`rulings/low/law/<pcode>.json`), 案由 (`low/t/<key>.json`), court
  (`low/c/<code>.json`), with `low/index.json` (courts, 案由, newest). No text
  is kept; a judgment opens through the proxy's `/law-page` and is read by
  `lib/judgment.mjs`: the outcome first.
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
  bill, 質詢 and whole-bill vote; what came since they were last opened counts
  on the tab.
- **問法律** (`lib/chat.mjs`, `chats.mjs`, `find.mjs`): the proxy's live
  `/law-chat` (Orbit-Core `law-chat.js`, `law-ground.js`, `law-more.js`)
  finds what a question needs in this site's data: articles of every law
  and regulation, similar judgments and 釋字 (their 主文 and reasons read),
  行政規則, bills, budgets, legislators, votes, meetings, 政府公告, and the
  reader's own follows (sent only with a question about them). Flash then
  applies it to the reader's facts (who is likely right, penalties,
  remedies, next steps), each point citing an article, a judgment or a
  rule; each opens in the app. Under an answer only the judgments and
  rules it cites; a city's 地方法規 only for the reader's city (問法律's
  地方法規 row, else the county of the family's shared places) or one the
  question names. 司法院's judgment pages serve only Taiwan: the proxy reads
  them through its Taiwan relay. Rulings and rules read with every law they
  name a link (`view.mjs` linkedHtml, ruleHtml: a rule's 一、（一） as
  points). The verdict and the answer show as Gemini writes them (the
  proxy streams them as `draft` lines), the points and links when it's done.
  Chats are kept on the phone. 白話解釋 (`lib/ask.mjs`) is the proxy's live `/law-ask`
  on a law's latest amendment or a bill's 對照表. Both only on a tap, both
  through the Pass (`passFetch`), both reading this site's own files.
- **行政規則 and 政府公告** (`lib/agency.mjs`, `news.mjs`, `notices.mjs`,
  `data-src/facts.json`): ministries' rules and RSS notices, and 預告 on
  join.gov.tw, kept beside the laws they rest on; the news and `facts.json`
  feed the AI's exact figures (最低工資). Every rule the agencies list is
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

## Files

| File | What |
| --- | --- |
| `public/app.mjs`, `index.html`, `law.css` | The page: five tabs, the reader, 裁判, the sheets |
| `public/lib/refs.mjs` | References in a law's text, Chinese numerals, 項 |
| `public/lib/bills.mjs`, `cards.mjs` | Stages, folding versions into items; cards, funnel, progress bar |
| `public/lib/agenda.mjs`, `ly.mjs` | 議程 and live by Taiwan time; votes, legislators, budget |
| `public/lib/data.mjs`, `deleg.mjs` | The law files' shape, 修法追蹤 diffs; 授權 |
| `public/lib/cons.mjs` | 憲法法庭: ids, its pages read, cites, by law, the bills naming one |
| `public/lib/rulings.mjs`, `judgment.mjs`, `reader.mjs` | Top-court rulings by article and month; a judgment read into parts; a government page read in the app |
| `public/lib/agency.mjs`, `local.mjs`, `news.mjs`, `notices.mjs` | 行政規則, 地方法規, 政府公告, 預告 |
| `public/lib/search.mjs`, `fulltext.mjs`, `find.mjs`, `topics.mjs` | Finding a law or article, full text, topics |
| `public/lib/ask.mjs`, `chat.mjs`, `chats.mjs` | The proxy's `/law-ask` and `/law-chat`; saved chats |
| `public/lib/view.mjs`, `stack.mjs`, `store.mjs` | Articles and timeline as HTML; the sheet trail; follows, bookmarks, recent (this device) |
| `scripts/build-*.mjs`, `lib.mjs` | The data builds and what they share |
| `scripts/live-ly.mjs` | IVOD's live list, run by `live.yml` |
| `data-src/facts.json` | Figures the news build keeps |

## Run and test

- `npm test` (logic only), `node scripts/build-data.mjs --prev ''` for
  real data locally (about 60 MB in `public/data/`; the other builds
  follow it).
- `npm start`, or `node ../Orbit-Core/tools/preview.mjs law --width 375`.
