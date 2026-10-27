<p align="center">
  <img src="public/icons/icon-192.png" width="96" height="96" alt="">
</p>

<h1 align="center">Orbit Law</h1>

<p align="center">
  <b>Laws, rulings, bills.</b><br>
  <a href="https://jaypengx.com/law/"><b>jaypengx.com/law</b></a>
</p>

<p align="center">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=000"> <img alt="PWA" src="https://img.shields.io/badge/PWA-works_offline-5A0FC8?logo=pwa&logoColor=fff"> <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff"> <img alt="GitHub" src="https://img.shields.io/badge/GitHub-Pages-24292F?logo=github&logoColor=fff"> <img alt="Tests" src="https://img.shields.io/badge/Tests-node_--test-339933?logo=nodedotjs&logoColor=fff">
</p>

Taiwan's law from three linked sides: the laws to read, the courts' rulings on them, and the bills in 立法院 that will change them. Part of **Orbit**, a family of phone apps for life in Taiwan that share one sign-in, the Orbit Pass. See them all at [jaypengx.com](https://jaypengx.com/).

## What it does

- **法規:** every law, with every reference a link, and what each amendment changed.
- **裁判:** the Constitutional Court's rulings and the top courts' judgments.
- **立法:** each bill stage by stage, its versions side by side, and the legislators behind it.
- **One search** across all three, and plain-language questions answered from the law.
- **Works offline** once opened.

## Stack

- Plain JavaScript (ES modules), HTML and CSS: no framework, no build step, no runtime dependencies.
- An installable phone web app (Add to Home Screen), cached by a service worker.
- The look, sign-in (the Orbit Pass) and notices come from the shared kit in [Shared-Proxy](https://github.com/JayPengX/Shared-Proxy).
- Public data (全國法規資料庫, 立法院, the courts) is rebuilt onto the site once a day by GitHub Actions.
- Questions go through the Orbit proxy (`api.jaypengx.com`) to Gemini.
- Hosted on GitHub Pages and served at jaypengx.com by a Cloudflare Worker; every push to `main` tests and deploys.

## For developers

```bash
npm test
```

How it works, file by file, and the decisions still in force: **[MAP.md](MAP.md)**.
