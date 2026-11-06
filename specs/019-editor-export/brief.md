# 019 剪輯台直接輸出完成影片

來源：作者 2026-11-06 說「輸出完整影片這類，都可以在剪輯台操作」「AI 是負責處理貼上要處理的提示詞就好」，並選擇「按鈕直接在剪輯台輸出」（不是複製指令貼給 AI）。

## 定案

| 題目 | 定案 | 理由 |
|---|---|---|
| 入口 | 剪輯頁上方「輸出完成影片」按鈕；沒存的先存 | 使用者看完完成影片預覽，同一頁就能輸出 |
| 流程 | 重新產生 → 4 秒測試片段（ffprobe 要有 video、audio）→ `--fps 30 --quality looks` 輸出整支 → `qc.mjs final` | 和 `auto-edit-deliver` 同樣的順序與判準 |
| 不做 | `qc.mjs observe` | 觀影總表是給 AI 判讀的；按鈕流程改給使用者看 `qc-sheet.jpg` 和 ✖／⚠ 清單。要 AI 看，照舊說「可以了，輸出完成影片」 |
| 舊檔保護 | 整支先輸出到 `work/final-rendering.mp4`，成功才換成 `output/final.mp4` | 失敗或取消不會弄壞上一支完成影片 |
| 同時操作 | 輸出中擋 `/api/save`、`/api/build`、`/api/framing/save`（409）；重新產生中、修改單有段落「生成中」時不能開始輸出 | render 中換掉 index.html 會輸出到半新半舊的內容 |
| 取消 | 視窗有「取消輸出」；停止子處理程序、刪暫存檔，舊的 final.mp4 不動 | 整支要好幾分鐘 |
| 關閉 | 輸出視窗關掉照樣繼續，按鈕顯示進度，點它再打開；關閉剪輯服務會取消輸出 | render 是剪輯服務的子處理程序，不留無人管的背景工作 |
| 驗收沒過 | `qc.mjs final` 有 ✖：列出 ✖、不寫「通過」；檔案留在 `output/final.mp4` | 和 Skill「0 個 ✖」一致，使用者可以把訊息貼給 AI |
| 停點紀錄 | 0 個 ✖ 時在 `work/製作進度.md` 的「停點紀錄」加一列 `④ 完成影片預覽｜通過`；沒有這張表就不寫 | `status.mjs`、`auto-edit-deliver` 才知道不用再做一次 |
| AI 的輸出指令 | 「可以了，輸出完成影片」保留 | 停點 ④ 的固定回覆不變；沒有開剪輯台、要 AI 判讀總表時用 |

## 做了什麼

| 檔案 | 內容 |
|---|---|
| `shared/template/tools/editor/server/export.mjs`（新） | 輸出流程、狀態、取消、寫停點紀錄 |
| `shared/template/tools/editor.mjs` | `POST /api/export`、`POST /api/export/cancel`、`GET /api/export`、`/output/final.mp4`、`/output/qc-sheet.jpg`；輸出中擋存檔與重新產生 |
| `shared/template/tools/editor/index.html`、`app.js`、`editor.css` | 按鈕與進度視窗 |
| `AGENTS.md`、`auto-edit-deliver/SKILL.md`、`EDITOR.md`、`PROMPTS.md`、`README.md` | 兩種輸出方式；AI 看到已輸出就不重做 |
| `dev/tests/editor-export.test.mjs`（新） | 流程順序、舊檔保護、沒聲音、驗收 ✖、取消、同時操作、停點紀錄、檔案路由 |

修正（2026-11-06）：`qc.mjs final --json` 的 `errors`、`warnings` 是數字，文字在 `checks`；輸出流程改從 `checks` 取，測試的模擬資料改成實際格式。
