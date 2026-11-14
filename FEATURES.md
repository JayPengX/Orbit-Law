# Features kept

Every feature a person uses in this app, with the code that makes it.
`tests/features.test.mjs` fails if any mark below disappears, so a refactor cannot
drop a feature silently (2026-11-03, after the lost-features audit).
To remove a feature on purpose, delete its line here in the same commit and say why.
- 問法律: the AI, its verdict streamed as written, 新對話 — `public/app.mjs`: `draftHtml`, `新對話`
- 問 Orbit's question (`#ask=`, the Pass sheet's box) asked on 問法律 — `public/app.mjs`: `takeAsk?.()`
- 對話紀錄 (kept chats) — `public/lib/chats.mjs`: `對話紀錄`
- A ruling's own AI, 白話解釋 of articles, bills and diffs — `public/app.mjs`, `public/lib/ask.mjs`: `askRuling`, `rulingAiBtn`, `白話解釋`, `askBill`, `askDiff`
- One search across laws, rules, rulings, bills and legislators — `public/app.mjs`: `findAll`
- 繼續閱讀 on 首頁 — `public/app.mjs`: `resumeRows`, `繼續閱讀`
- 為你推薦 on 首頁, learning from what's opened and passed over — `public/app.mjs`, `public/lib/foryou.mjs`: `function recommend`, `forYou`
- A law's 沿革 — `public/app.mjs`: `沿革`
- Structured text in rulings and bills — `public/lib/view.mjs`: `proseHtml`
- 立委 by county or party, independents' alignment — `public/app.mjs`: `peopleBy`, `alignment`
- 議程 and 直播中 from IVOD — `public/app.mjs`, `public/lib/agenda.mjs`: `law-live`, `直播中`, `meetState`
- 地方法規 for the reader's city — `public/lib/chat.mjs`: `地方法規`
- 看法案: a bill's 新聞, Orbit News' stories about changing it, each opening in News — `public/app.mjs`: `billNews`, `news/laws.json`
- 代表會 day by day: each recorded day a row (what the sitting did), opening its recording with what was said or reported — `public/app.mjs`: `townDay`, `dayWhat`
- 總質詢 with its recording: tap a turn to play from it, the transcript follows (laid over the recording by code at build) — `public/app.mjs`, `public/lib/town-audio.mjs`, `scripts/build-town.mjs`: `alignDay`, `turnAt`, `alignRecording`
- 總質詢 lined up with its recording by speech recognition, nightly and free (faster-whisper on the runner) — `scripts/town-hear.mjs`, `scripts/asr.py`, `.github/workflows/town-hear.yml`, `public/lib/town-audio.mjs`: `alignHeard`
- Every 代表會's recordings made into text, who spoke read from the meeting's order, names only from the members' list (中選會), misheard names put right by sound — `scripts/town-hear.mjs`, `public/lib/town-speakers.mjs`, `scripts/town-roster.mjs`, `scripts/town-roster.json`, `public/app.mjs`: `vocabOf`, `machinePaper`, `heardTurns`, `fixTerms`, `memberOf`, `ELC_R2`, `heardOf`, `錄音逐字稿`
- 總質詢 by member and topic, long turns folded, 重點摘要 per member — `public/app.mjs`, `public/lib/town-audio.mjs`: `askBlocks`, `data-askw`
- 施政報告 and 各課室工作報告 as an office a card, 重點摘要 on a tap — `public/app.mjs`, `public/lib/town-paper.mjs`, `public/lib/ask.mjs`: `paperParts`, `wireParts`, `askPaper`
- A 代表's sheet: their 總質詢 across sessions, their page with pictures whole — `public/app.mjs`, `public/lib/reader.mjs`: `townMember`, `data-small`
