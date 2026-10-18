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
  last deploy's copy, kept 120 days).
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
  that went quiet before it don't count as open.
- **Rulings:** each article links to 司法院's own search (no copy kept).
- Gemini (白話解釋) waits for the proxy's `/law-ask`, which reads the
  articles itself from this site and cites only those.

## Files

| File | What |
| --- | --- |
| `public/app.mjs`, `index.html`, `law.css` | The page: tabs 法規 / 立法 / 追蹤, the reader, the sheets |
| `public/lib/refs.mjs` | References in a law's text, Chinese numerals, 項 |
| `public/lib/bills.mjs` | Stages, a bill made small, folding versions into items |
| `public/lib/data.mjs` | The law files' shape, 修法追蹤 diffs |
| `public/lib/search.mjs` | Finding a law, jumping to an article, dates |
| `public/lib/view.mjs` | Articles, contents, stage bar and timeline as HTML |
| `public/lib/store.mjs` | Follows, bookmarks, recent (this device) |
| `scripts/build-data.mjs` | The data build |

## Run and test

- `npm test` (logic only), `node scripts/build-data.mjs --prev ''` for
  real data locally (about 60 MB in `public/data/`).
- `npm start`, or `node ../Shared-Proxy/tools/preview.mjs law --width 375`.
