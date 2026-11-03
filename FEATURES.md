# Features kept

Every feature a person uses in this app, with the code that makes it.
`tests/features.test.mjs` fails if any mark below disappears, so a refactor cannot
drop a feature silently (2026-11-03, after the lost-features audit).
To remove a feature on purpose, delete its line here in the same commit and say why.
- 問法律: the AI, its verdict streamed as written, 新對話 — `public/app.mjs`: `draftHtml`, `新對話`
- 對話紀錄 (kept chats) — `public/lib/chats.mjs`: `對話紀錄`
- A ruling's own AI, 白話解釋 of articles, bills and diffs — `public/app.mjs`, `public/lib/ask.mjs`: `askRuling`, `rulingAiBtn`, `白話解釋`, `askBill`, `askDiff`
- One search across laws, rules, rulings, bills and legislators — `public/app.mjs`: `findAll`
- 繼續閱讀 on 首頁 — `public/app.mjs`: `resumeRows`, `繼續閱讀`
- A law's 沿革 — `public/app.mjs`: `沿革`
- Structured text in rulings and bills — `public/lib/view.mjs`: `proseHtml`
- 立委 by county or party, independents' alignment — `public/app.mjs`: `peopleBy`, `alignment`
- 議程 and 直播中 from IVOD — `public/app.mjs`, `public/lib/agenda.mjs`: `law-live`, `直播中`, `meetState`
- 地方法規 for the reader's city — `public/lib/chat.mjs`: `地方法規`
