# 072 剪輯台：字幕改字直接套、點字幕不跳、已改完的修改單清空、修改單存在專案裡

## 作者原話（minimax-ep1 r7 之後）

- 「調整字幕應該要直接變更吧？不需要按更新預覽」
- 「另外點擊字幕想要修改時，畫面會有往上跳的問題，我希望就是直接改，這個 UI 需要修正」
- 「另外完成的修改單，該段落的字應該要清空，而不是下次點到時還在」
- 「另外修改單只有草稿的，應該有紀錄吧？為何重新進入後就沒有顯示了？」

## 定案

- **字幕只改字＝直接套進完成影片預覽**：
  - 指紋（`liveFingerprint`）的字幕檔只算每一則的時間（`srtTiming`），不算字。
  - 頁面在播放器裡把那一則的字直接換掉（`preview.js applyText`）。只標幾個字的重點（`em.cw`）照原本的字再包一次；改回原本的字就還原成 build 做的那一份。
  - 「更新預覽」不發光。
  - 分割、合併、刪句、改時間會動到段落位置，照樣要更新預覽。
- **點字幕不跳**：
  - 原因：點一句會整份重畫清單，Chrome 的捲動錨點會自己多捲 100–170 px，點的那一句就跳到清單最上面。
  - 修法：`.side-list` 加 `overflow-anchor: none`；字幕清單和時間軸的改字框 `focus({ preventScroll: true })`。
  - 點一句會跳到那一句開始後 0.05 秒（不超過中點）。停在起點的話，播放器會對齊到前一格，預覽顯示的是上一句。
- **已改完的修改單清空**：
  - 修改單上那一段的標籤、描述、重新設計勾選清空，「已改完」的狀態和「看結果」照留。
  - 要再改從空白寫，變成一筆新的待改。

- **修改單存在專案裡**：
  - 原因：072 之前修改單只存在打開剪輯台的那個瀏覽器（localStorage，跟著網址走）。換瀏覽器或嵌入的預覽視窗、剪輯台重開換了埠號（從 4400 找第一個空的）、舊分頁把整份寫回去，都會看不到剛寫的草稿。
    - 作者這次的草稿查過：還在作者的 Chrome 裡（7 段），16:34 之後那個 Chrome 沒有重新讀過它，所以是在別的地方重新打開的。
  - 修法：存進 `work/feedback/editor-requests-list.json`（`{ rev, list }`），所有分頁、瀏覽器讀同一份。
    - 存檔只送改了的段，每段帶著這個分頁上次看到的那一份（base）。專案裡那段被別的分頁改過就不套，舊分頁蓋不掉新寫的草稿。
    - 輪詢看到 `requestsList` 換了就重讀。
  - 搬家：第一次打開時，這個瀏覽器存過、專案裡還沒有的段搬進專案；存到了才清掉瀏覽器那一份。
  - minimax-ep1：作者 Chrome 裡那 12 段（7 段草稿）已經寫進專案。

## 改了哪些檔

- `shared/template/tools/editor/live-sound.mjs`：`srtTiming`、`liveFingerprint`
- `shared/template/tools/editor/app.js`：
  - `textOnlyOp`、`restSnap`、`app.textLive`
  - `cueSeekT`、`preventScroll`
  - `rqSync` 清空已改完、已改完的提示字
- `shared/template/tools/editor/preview.js`：`applyText`
- `shared/template/tools/editor/server/requests.mjs`：`requestsList`、`doRequestsList`；`editor.mjs`：`GET/POST /api/requests/list`、`/api/version` 的 `requestsList`
- `shared/template/tools/editor/app.js`（修改單）：`rqLoad`（讀專案、搬家）、`rqStore`／`rqFlush`／`rqOps`／`rqMerge`、`rqRefresh`（輪詢）
- `shared/template/tools/editor/editor.css`：`.side-list` 的 `overflow-anchor: none`
- 測試：
  - `dev/tests/editor-live-sound.test.mjs`：只改字指紋一樣；改時間、少一句不一樣；服務端 `liveOnly`
  - `dev/tests/editor-requests-ui.test.mjs`：已改完清空、新的一筆不帶舊標籤、存在專案的檔、另一個沒存過東西的瀏覽器看得到同一份且寫的草稿原分頁收得到
  - `dev/tests/requests-list.test.mjs`（新）：照 base 套、別的分頁改過的段不套、格式不對 400
