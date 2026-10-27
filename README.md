<p align="center">
  <img src="public/icons/icon-192.png" width="96" height="96" alt="">
</p>

<h1 align="center">Orbit Law</h1>

<p align="center">
  <b>Laws, rulings, bills.</b><br>
  <a href="https://orbit.jaypengx.com/law/"><b>orbit.jaypengx.com/law</b></a>
</p>

<p align="center">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=000"> <img alt="PWA" src="https://img.shields.io/badge/PWA-works_offline-5A0FC8?logo=pwa&logoColor=fff"> <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff"> <img alt="GitHub" src="https://img.shields.io/badge/GitHub-Pages-24292F?logo=github&logoColor=fff"> <img alt="Tests" src="https://img.shields.io/badge/Tests-node_--test-339933?logo=nodedotjs&logoColor=fff">
</p>

Taiwan's law from three linked sides: the laws to read, the courts' rulings on them, and the bills in 立法院 that will change them. Part of **Orbit**, a family of phone apps for life in Taiwan that share one sign-in, the Orbit Pass. See them all at [orbit.jaypengx.com](https://orbit.jaypengx.com/pass/).

<p align="center">
  <img src="docs/screenshots/law-1.webp" width="30%" alt="Ask the law in plain words">
  <img src="docs/screenshots/law-2.webp" width="30%" alt="Every article, every link">
  <img src="docs/screenshots/law-3.webp" width="30%" alt="Court rulings, searchable">
</p>

<p align="center">
  <img src="docs/screenshots/law-4.webp" width="30%" alt="Bills, stage by stage">
  <img src="docs/screenshots/law-5.webp" width="30%" alt="How every party voted">
  <img src="docs/screenshots/law-6.webp" width="30%" alt="Landmark interpretations">
</p>

## Features

- **法規 Laws:** every law and regulation from 全國法規資料庫, in Chinese and English, with every reference a link (第X條之Y, ranges, 前條, 前項, another law's name; about 99% of 28k references land on a real article).
- **修法追蹤:** what each amendment added, amended and removed, article by article.
- **裁判 Rulings:** every 大法官解釋 and 憲判字, the top courts' judgments by article and month, and the other courts' judgments by law, cause and court, three years back; a judgment opens with its outcome first.
- **立法 Bills:** each bill in 立法院 stage by stage (提案 → 一讀 → 委員會 → 院會 → 三讀 → 公布), every version folded into one item, the 對照表 side by side, and a funnel of how far bills got.
- **議程 and live video:** the day's sittings, the speakers, clips of who has spoken, and IVOD's live stream of a meeting in session.
- **The three sides link:** an article shows its rulings and the bills open on it; a ruling the articles it rules on; a bill the rulings that named it.
- **Also:** ministries' 行政規則, every city's 地方法規, 政府公告 and 預告, budgets, legislators and their votes.
- **問法律:** ask a question in plain words; the answer cites the articles, judgments and rules it rests on, each opening in the app.
- **One search** across names, short names, article numbers and full text; works offline once opened.

## Tech stack

| Layer | What |
| --- | --- |
| App | Plain JavaScript (ES modules), HTML and CSS; no framework, no build step, no dependencies |
| Platform | Installable web app; the service worker keeps the data (the kept copy first, refreshed behind it) |
| Data | Built at deploy by Node scripts into static JSON (about 60 MB, never in git): 全國法規資料庫, the g0v 立法院 API, 司法院, 憲法法庭, 主計總處, ministries' and cities' rule sites, join.gov.tw (PDFs read with poppler's `pdftotext`) |
| Live | IVOD's live list read every 90 seconds in sitting hours by a GitHub Actions job |
| AI | `/law-chat` and `/law-ask` on the Orbit proxy (Cloudflare Workers) with Gemini, grounded in this site's own files |
| Shared | Look and Orbit Pass from the kit in [Orbit-Core](https://github.com/JayPengX/Orbit-Core) |
| Tests | `node --test` (logic only) |

## How it works

```
GitHub Actions, every push and daily at 03:30 Taiwan time
  npm test → build-data → notices → ly → photos → budget → agency → local
           → rulings → cons → news → stamp-version → GitHub Pages
                                                      │
phone ◄── static JSON, kept by the service worker ◄───┘
```

- **Data at deploy, never in git:** each build starts from the last deploy's copy and fetches only what changed; a source that fails keeps yesterday's.
- **Reading costs nothing:** everything is static files on Pages; only questions to the AI reach a server.
- **One id, one link:** a law `#law=<pcode>`, an article `&a=184`, a ruling `#r=s748`, a bill `#item=<term>-<law>`, the same in the data files.
- **Rulings backfill** runs nightly while 司法院's archive is open, saving its store to the Actions cache.

The builds, the link rules and the decisions in force: **[MAP.md](MAP.md)**.

## Project structure

```
public/
├── index.html, app.mjs, law.css   five tabs, the reader, the sheets
├── lib/                 26 modules
│   ├── refs.mjs         references in a law's text
│   ├── bills.mjs, cards.mjs, agenda.mjs, ly.mjs    bills, stages, sittings, legislators
│   ├── cons.mjs, rulings.mjs, judgment.mjs         the courts
│   ├── agency.mjs, local.mjs, news.mjs, notices.mjs
│   ├── search.mjs, fulltext.mjs, find.mjs, topics.mjs
│   └── ask.mjs, chat.mjs, chats.mjs                the AI questions
├── img/ly/              legislators' photos
└── sw.js                (public/data/ is built at deploy)
scripts/                 build-*.mjs, backfill-rulings.mjs, live-ly.mjs
data-src/                figures the news build keeps
tests/                   node --test
MAP.md                   how it works
```

## Getting started

The app loads the shared kit from a sibling folder, so clone this repo next to [Orbit-Core](https://github.com/JayPengX/Orbit-Core):

```bash
git clone https://github.com/JayPengX/Orbit-Core.git
git clone https://github.com/JayPengX/Orbit-Law.git
cd Orbit-Law
```

Requirements: Node.js 22 or newer. There is nothing to install: no framework, no `node_modules`.

```bash
npm test   # links ../Orbit-Core/kit as .kit, then runs node --test
```

See it on a phone-sized screen, signed in with a made-up wallet and real data (needs Playwright):

```bash
# a screenshot, saved in /tmp/orbit-preview
node ../Orbit-Core/tools/preview.mjs law --live --width 375
# serve it, then open http://localhost:8123/Orbit-Law/
node ../Orbit-Core/tools/preview.mjs law --live --serve --port 8123
```

`--dark`, `--lang en`, `--webkit` (Safari's engine) and the other flags are listed in [Orbit-Core/tools/README.md](https://github.com/JayPengX/Orbit-Core/blob/main/tools/README.md).

Real data locally (writes about 60 MB into `public/data/`, never committed):

```bash
node scripts/build-data.mjs --prev ''
```

## Deploying

Push to `main`. GitHub Actions runs the tests, builds the data, stamps every file with its content hash (so a phone downloads only what changed) and publishes `public/` to GitHub Pages; the site Worker serves it at its orbit.jaypengx.com address. There are no pull requests or release branches.

## Part of Orbit

| App | What it is |
| --- | --- |
| [Orbit Sports](https://github.com/JayPengX/Orbit-Sports) | Every game you can watch in Taiwan, live |
| [Orbit Transit](https://github.com/JayPengX/Orbit-Transit) | Bus, train, metro and YouBike, planned and navigated |
| [Orbit Weather](https://github.com/JayPengX/Orbit-Weather) | One clear forecast, to the township |
| [Orbit Words](https://github.com/JayPengX/Orbit-Words) | English vocabulary that stays |
| [Orbit Securities](https://github.com/JayPengX/Orbit-Securities) | A Taiwan broker on play money |
| [Orbit Class](https://github.com/JayPengX/Orbit-Class) | Today's classes at a glance |
| [Orbit Beats](https://github.com/JayPengX/Orbit-Beats) | Endless music and your own beats |
| [Orbit Law](https://github.com/JayPengX/Orbit-Law) | Laws, rulings and bills, linked |
| [Orbit Money](https://github.com/JayPengX/Orbit-Money) | Your own books |
| [Orbit-Core](https://github.com/JayPengX/Orbit-Core) | The kit, the Orbit Pass and the Workers behind them all |

How it was all built, in pictures and numbers: [jaypengx.com/showcase](https://jaypengx.com/showcase/).
