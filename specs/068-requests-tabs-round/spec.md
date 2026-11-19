# 068 修改單：三個分頁、已改完＝最近一輪、用上一版

## 作者原話

- 「我在想修改單點擊時，是否下面分成三個 Tab 比較清楚，現在要往下滑不好操作」
- 「我希望這三個可以平均完整貼合上方，而不是懸浮，這樣操作起來比較舒服」
- 「另外我覺得「已改完」是呈現這次總共修改的紀錄，而非全部，否則會有重複段落」
- 「另外「已改完」如果不想採納，希望用上一個版本也是有彈性的」

## 定案

- 三個分頁「待改／生成中／已改完」放在修改單最上面：三格等寬、貼齊上緣，不在捲動區裡（不會懸浮在清單上）。分頁上有段數；記住上次看的分頁（localStorage `editor-requests-tab`）。
- 「這段想改」那一區只在待改分頁。從寫入口（「✎ 寫進修改單」「✎ 這段想改」、右鍵、只有講者的空白處）打開修改單會切回待改；上方「修改單」按鈕只是開關，留在上次看的分頁。（我替作者定的：其他兩個分頁打開就看得到清單，不用先捲過編輯區）
- 「已改完」＝最近一輪回饋 `work/feedback/r<N>.md`「改了哪幾段」的每一列（照修改單改的、AI 全片優化的都算），不是剪輯台歷來標過已改完的段。比這一輪舊的已改完項目從修改單拿掉（紀錄在 r<N>.md），時間軸的 ✓ 也跟著只剩這一輪。
  - 最近一輪：編號最大、不是剪輯台退回開的（`work/feedback/editor-reverts.json`）、不是還沒收尾的、有改段紀錄。
- 每一列（改過的段，「（vA → vB）」）可以「↩ 用上一版」：按兩次確認，伺服器在背景跑 `versions.mjs use --seg <段> --ver vA --said "剪輯台：<段> 不採納 r<N> 的修改，用上一版 vA"`（沒有開著的回饋輪時它自己 begin → use → finish）。換回去之後那一列標「已退回 vA」，可以「↪ 改回 r<N> 的版本」（vB）。
  - 這一輪之後又改過的段（剪輯台或 AI）：先 `versions.mjs save` 存一版再換，換回時用它。
  - 檢查沒過（✖）：換回原本那一版、`finish --no-change` 收掉那一輪，列出 ✖ 原文，請作者把那段寫進修改單讓 AI 一起調整前後段。
  - 不能換：新的段、拿掉的段、全片（情緒點）那列、plan.json 已經沒有的段；AI 正在改（有開著的回饋輪）；另一段正在換。
- 每段現在用哪一版：`versions.mjs list --json`（比對雜湊、會跑 build --check，這集 59 段約 6–8 秒），伺服器用子處理程序算，照 plan.json、r<N>.md、editor-reverts.json 的時間記住，第二次 0.01 秒；換版本跑的時候不重算。

## 改了哪些檔

- `shared/template/tools/editor/server/rounds.mjs`（新）：`parseChanged`、`latestRound`、`roundInfo`、`startUse`
- `shared/template/tools/editor.mjs`：`GET /api/round`、`POST /api/round/use`
- `shared/template/tools/editor/index.html`、`app.js`、`editor.css`：分頁列 `#rqTabs`、`rqRoundHtml`、`loadRound`、`rqUse`、舊輪已改完拿掉
- `shared/template/EDITOR.md` 修改單第 3、5–7 點
- 測試：`dev/tests/editor-round.test.mjs`（新）、`dev/tests/editor-requests-ui.test.mjs`
