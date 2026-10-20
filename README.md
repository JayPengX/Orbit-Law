# Orbit Law

Taiwan's laws to read, with every reference a link, and the bills in 立法院
that will change them, stage by stage. No Pass: the data is public, built
onto this site once a day, and works offline once opened.

Live: https://jaypengx.github.io/Orbit-Law/

## How it works

- **Data at deploy, never in git.** `scripts/build-data.mjs` runs in the
  Pages workflow on every push and daily at 03:30 Taiwan time. It reads
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
- Gemini (白話解釋) waits for the proxy's `/law-ask`, which reads the
  articles itself from this site and cites only those.

## Files

| File | What |
| --- | --- |
| `public/app.mjs`, `index.html`, `law.css` | The page: tabs 法規 / 立法 / 追蹤, the reader, the sheets |
| `public/lib/refs.mjs` | References in a law's text, Chinese numerals, 項 |
| `public/lib/bills.mjs` | Stages, a bill made small, folding versions into items |
| `public/lib/agenda.mjs` | 議程: meetings made small, live by Taiwan time, 國會頻道 streams |
| `public/lib/data.mjs` | The law files' shape, 修法追蹤 diffs |
| `public/lib/search.mjs` | Finding a law, jumping to an article, dates |
| `public/lib/view.mjs` | Articles, contents, stage bar and timeline as HTML |
| `public/lib/store.mjs` | Follows, bookmarks, recent (this device) |
| `scripts/build-data.mjs` | The data build |

## Run and test

- `npm test` (logic only), `node scripts/build-data.mjs --prev ''` for
  real data locally (about 60 MB in `public/data/`).
- `npm start`, or `node ../Shared-Proxy/tools/preview.mjs law --width 375`.
