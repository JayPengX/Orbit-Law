# Orbit Law

Taiwan's laws to read, with every reference a link, and the bills in 立法院
that will change them, stage by stage. Behind the Quadra Pass like every
Orbit app; the data is public, built onto this site once a day, and works
offline once opened. Tabs: 首頁 · 法規 · 問法律 · 立法 · 追蹤.

Live: https://jaypengx.github.io/Orbit-Law/

## How it works

- **Data at deploy, never in git.** `pages.yml` runs on every push and daily
  at 03:30 Taiwan time: `npm test`, then `build-data.mjs`, `build-ly.mjs`,
  `build-agency.mjs`, `build-rulings.mjs` and `build-news.mjs` in that order
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

- **Links** (`lib/refs.mjs`, one rule for every screen): 第X條(之Y), ranges
  (至), lists (、), 前條/前N條, 前項/第N項, and another law's name before 第X條
  (index names plus `SHORT_NAMES`). A name we don't know right before 第X條
  links nothing (a repealed 組織條例 is not this law). About 99% of the 28k
  references in force land on a real article.
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
- **議程** (`lib/agenda.mjs`): 立法院's meetings from the API's `/meets`
  (`ly/agenda.json`, three days back on; today's read again in the app, its
  發言名單 filling in on the day). The live video is IVOD's own stream for
  that meeting: `scripts/live-ly.mjs`, run by `live.yml` every 90 seconds in
  sitting hours, reads IVOD's live list and each live meeting's channel and
  writes `live.json` to the `live` branch (read from raw.githubusercontent);
  the app plays `ly-live<ch>`'s HLS. Nothing is matched by room name: a
  meeting IVOD doesn't list as streaming shows its state, not a video.
  (國會頻道's YouTube room streams were tried first and showed other
  meetings; IVOD's own pages can't be framed.) A meeting shows its bills' cards, the
  speakers signed up, and the clips of who has spoken (the API's `/ivods`,
  each appearing as a speech ends). A bill's sheet shows the next meeting
  that takes it up (by 議案編號, law id, or its name in the 事由).
- **Rulings** (`lib/rulings.mjs`, `scripts/build-rulings.mjs`): the three top
  courts' judgments of the last 3 years, kept by the articles they cite
  (`data/rulings/<pcode>.json`, no text kept). New ones from 司法院's JDoc
  API, the past from its monthly archives (open 00:00–06:00 Taiwan time,
  read a few months a night). A judgment opens through the proxy's
  `/law-page` and is read by `lib/judgment.mjs`: the outcome first.
- **授權** (`lib/deleg.mjs`): a regulation sits under the article its first
  articles say it is made under (訂定/訂之/授權); a law cited by a former name
  (its 沿革's 原名稱) lists the regulation without an article.
- **Following 立委** (`lib/ly.mjs` personFeed): 我的 shows each one's newest
  bill, 質詢 and whole-bill vote; what came since they were last opened counts
  on the tab.
- **問法律** (`lib/chat.mjs`, `chats.mjs`, `find.mjs`): the proxy's live
  `/law-chat` finds the articles for a question across every law and
  regulation and answers from them only, each point citing one; chats are
  kept on the phone. 白話解釋 (`lib/ask.mjs`) is the proxy's live `/law-ask`
  on a law's latest amendment or a bill's 對照表. Both only on a tap, both
  through the Pass (`passFetch`), both reading this site's own files.
- **行政規則 and 政府公告** (`lib/agency.mjs`, `news.mjs`, `notices.mjs`,
  `data-src/facts.json`): ministries' rules and RSS notices, and 預告 on
  join.gov.tw, kept beside the laws they rest on; the news and `facts.json`
  feed the AI's exact figures (最低工資).
- **Finding** (`lib/search.mjs`, `fulltext.mjs`, `topics.mjs`): names, short
  names and article jumps; 全文檢索 by bigram buckets built at deploy; every
  law sorted into a topic.

## Files

| File | What |
| --- | --- |
| `public/app.mjs`, `index.html`, `law.css` | The page: five tabs, the reader, the sheets |
| `public/lib/refs.mjs` | References in a law's text, Chinese numerals, 項 |
| `public/lib/bills.mjs`, `cards.mjs` | Stages, folding versions into items; cards, funnel, progress bar |
| `public/lib/agenda.mjs`, `ly.mjs` | 議程 and live by Taiwan time; votes, legislators, budget |
| `public/lib/data.mjs`, `deleg.mjs` | The law files' shape, 修法追蹤 diffs; 授權 |
| `public/lib/rulings.mjs`, `judgment.mjs`, `reader.mjs` | Rulings by article; a judgment read into parts; a government page read in the app |
| `public/lib/agency.mjs`, `news.mjs`, `notices.mjs` | 行政規則, 政府公告, 預告 |
| `public/lib/search.mjs`, `fulltext.mjs`, `find.mjs`, `topics.mjs` | Finding a law or article, full text, topics |
| `public/lib/ask.mjs`, `chat.mjs`, `chats.mjs` | The proxy's `/law-ask` and `/law-chat`; saved chats |
| `public/lib/view.mjs`, `stack.mjs`, `store.mjs` | Articles and timeline as HTML; the sheet trail; follows, bookmarks, recent (this device) |
| `scripts/build-*.mjs`, `lib.mjs` | The five data builds and what they share |
| `scripts/live-ly.mjs` | IVOD's live list, run by `live.yml` |
| `data-src/facts.json` | Figures the news build keeps |

## Run and test

- `npm test` (logic only), `node scripts/build-data.mjs --prev ''` for
  real data locally (about 60 MB in `public/data/`; the other builds
  follow it).
- `npm start`, or `node ../Shared-Proxy/tools/preview.mjs law --width 375`.
