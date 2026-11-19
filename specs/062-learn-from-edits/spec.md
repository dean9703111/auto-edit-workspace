# 062 整理這集的調整給 AI（learn）

作者原話：「專案的修改單是會持續累積的嗎？如果是的話，我希望在影片輸出後，會有一個按鈕，複製下來貼給 AI 後，就能讓 AI 根據這次的調整了解我的優化細節，讓這個工具更符合我的使用習慣與風格」

## 做了什麼

1. `versions.mjs learn --project projects/<專案>`：把這一集所有調整整理成 `work/feedback/learn.md`。
   - 回饋輪（`work/feedback/r*.md`）：使用者原話（口頭的和修改單的描述、勾的標籤）照類別歸在一起、標次數，每則接上那一段的改法；修改單勾的標籤計次。
   - 建議改規則：各輪寫的同一句合併、標次數與輪次（句尾的「（文件）」「（程式檢查）」「（改預設）」不算進規則本身）；已在 `shared/偏好.md`「照做」的標「已是規則（第 N 條）」、在「不採用」的標「使用者說過不要」。
   - 剪輯台手改：plan.json 的 `edit`（剪掉幾處幾秒、淡入淡出、音量、剪接點轉場、自己加的音效）、每段的音效與音量（`.editor/memory.json` 記的原本音效）、錄影速度、整支設定（重點字幕、配樂…）。
   - 字幕手改：`work/rough.srt` 和第一次對好的字幕比（改字、分割、合併、刪掉、新增、重新斷句、只調時間），列常改的字（例 `「、」→「或」`）與例子。
   - 改版紀錄（`work/versions/`）：換模板、改成內容設計動畫、退回（finish 寫的「（v2 → v1）」或原話的「用 v1」）、改版提案。
   - 印一行計數；沒有任何紀錄時印 ⚠、不給下一步。
2. `versions.mjs learn --page`：讀 AI 寫的 `work/feedback/learn-rules.json`（每條 `id`、`text`、`where`＝偏好／改預設／程式檢查、`evidence`、`now`、`change`、`cost`），驗欄位（✖ 有 →），用固定模板 `shared/template/site/choices.html` 寫成 `work/feedback/learn-choices.html`：照落點分組，每條有現行、建議、代價、證據，選「照做／不要／再想想」，補充欄，按「複製答案」複製：
   ```
   學習清單的答案（projects/example/work/feedback/learn-rules.json）
   照做：L1、L2
   不要：L3
   再想想：L4
   補充：L1 改成最多 5 個字
   ```
3. 剪輯台：輸出過完成影片之後（`output/final.mp4` 在），預覽上方那一行和輸出完成的對話框都有「整理這集的調整給 AI」按鈕；按了 `POST /api/learn` 寫 learn.md，剪貼簿放一行指令（剪貼簿不行時提示跟 AI 說「照這集的調整紀錄學我的習慣」）：
   ```
   照這集的調整紀錄學我的習慣（projects/example/work/feedback/learn.md）：照 auto-edit-review 的 references/learn-habits.md 做，整理成候選規則、做成選擇頁給我勾，我勾了才寫進 shared/偏好.md。第一步跑 node shared/template/tools/versions.mjs learn --project "projects/example"
   ```
4. `deliver.mjs` 輸出完成的回報段多一行「想讓之後的影片更像你，把這行貼給 AI：<同一行>」。
5. 文件：`auto-edit-review` 流程 G、`references/learn-habits.md`（產生 → 寫候選規則 → 選擇頁 → 照答案：偏好用 `status.mjs --prefs-add`／`--prefs-skip`，改預設、程式檢查只寫 `work/feedback/learn-tools.md` 給工具作者，不動 `shared/`）、AGENTS.md 路由、EDITOR.md、PROMPTS.md 5b、CONTENTS.md。

## 決定

- 指令放在 `versions.mjs`（回饋輪、版本都在這支），子指令 `learn`；選擇頁 `learn --page`，模板固定，AI 只寫 JSON。
- 字幕比對的基準：`media.mjs srt-align` 寫完 `rough.srt` 時另存一份 `work/.cache/rough-first.srt`；舊專案沒有就用最早的 `rough.srt.bak-*`，都沒有就寫「比不出來」。
- 只標「已是規則」不刪：AI 照 learn-habits.md 不列已是規則的那幾條。
- 規則的落點三種，只有「偏好」會寫進 `shared/偏好.md`；其他兩種是給作者的工具回饋，AI 不改工具。
- 剪輯台的按鈕只在輸出過之後出現（還沒輸出時 `/api/learn` 照樣能用，但按鈕不顯示）。

## 改了哪些檔

- 新增：`shared/template/tools/lib/learn.mjs`、`shared/template/site/choices.html`、`.agents/skills/auto-edit-review/references/learn-habits.md`、`dev/tests/learn.test.mjs`、`dev/tests/editor-learn-ui.test.mjs`
- 修改：`shared/template/tools/versions.mjs`（learn 子指令、--help）、`editor.mjs`（`POST /api/learn`）、`editor/app.js`（按鈕、`copyText` 共用、`learnCopy`）、`editor/index.html`（`#exportLearn`）、`deliver.mjs`（回報段那一行）、`lib/rough/align.mjs`（另存 rough-first.srt）、`.agents/skills/auto-edit-review/SKILL.md`、`AGENTS.md`、`shared/template/EDITOR.md`、`PROMPTS.md`、`CONTENTS.md`、`package.json`（test:fast 加 learn.test.mjs）

## 端對端（worktree 的 projects/example）

1. `versions.mjs begin --seg x0105 --said "x0105 的說明字太多，以後清單的說明都短一點"` → 改 plan → `finish`（真的 build、audit）→ r1。
2. 手機確認頁填 s0103（動作慢一點）、x0106（文字少一點＋「標題太長，以後標題都在 8 個字內」）→ 複製的整份存成 editor-requests.md → `begin --requests` → 改 x0106 標題 → `finish` → r2。
3. 模擬剪輯台手改（剪掉 2 處、淡入、人聲 +2 dB、音效 −3 dB、過黑 1 個、加 2 顆 ding、x0102 音效換 click、重點字幕 2 則）與字幕改 4 處。
4. `versions.mjs learn --project projects/example`：
   ```
   ✓ projects/example/work/feedback/learn.md：回饋 2 輪、原話 3 則、建議改規則 2 條（已是規則 0）、剪輯台手改 8 項、字幕手改 4 處、換模板 0 次、重新設計 0 段、退回 0 次
   ```
   learn.md 節錄：
   ```
   ### 字、文案（2 次）

   - r1 x0105：「x0105 的說明字太多，以後清單的說明都短一點」 → slots.items[0].note 「再下載到電腦」 → 「再下載」；x-route-x0105.html 改了
   - r2 x0106：「標題太長，以後標題都在 8 個字內」（要改：文字少一點） → slots.title 「需要多機拍攝」 → 「多機拍攝」；x-branch-x0106.html 改了
   ...
   - 清單每一項的說明只留關鍵詞，最多 4 個字（文件）（2 次：r1、r2）
   - 動畫的標題最多 8 個字（程式檢查）（1 次：r2）
   ...
   - 和 work/.cache/rough-first.srt 比：改字 4 則、分割 0、合併 0、刪掉 0、新增 0；只調時間（差超過 0.2 秒）0 則
   - 常改的字：加「，」、「、」→「或」、刪「邊」、刪「想」
   ```
5. 寫 learn-rules.json（4 條：偏好 2、改預設 1、程式檢查 1）→ `learn --page` → `✓ 選擇頁：projects/example/work/feedback/learn-choices.html（4 條：偏好 2、改預設 1、程式檢查 1）`。
6. 剪輯台按「整理這集的調整給 AI」：toast「整理好了（回饋 2 輪、剪輯台手改 8 項、字幕 4 處），存在 projects/example/work/feedback/learn.md；指令已複製 → 貼給 AI」，剪貼簿是上面那一行。

截圖（本資料夾）：

- `shot-editor-learn.png`：剪輯台（1600×900），預覽上方的按鈕與按下去之後的提示
- `shot-choices-390-top.png`、`shot-choices-390-bottom.png`：選擇頁（390×844），選好四條、寫補充、按「複製答案」之後

## 測試

（見文末「測試輸出」）

## 沒做的

- 剪輯台改字卡上的字（slots）和 AI 在回饋輪改的混在 plan.json 裡，learn 只從回饋輪的「改了哪幾段」看得到 AI 改的；剪輯台直接改字卡的字沒有另外比對（沒有「改之前」的基準）。
- 已經做完的舊專案沒有 `work/.cache/rough-first.srt`，字幕比對只能用最早的 `rough.srt.bak-*`（沒有就不比）。
- 「改預設」「程式檢查」類只記在 `work/feedback/learn-tools.md` 給作者，沒有自動開成工具修改。
- 選擇頁的答案靠使用者複製貼回；頁面沒有直接寫回檔案（要發布到平台才有網址，本機 file:// 頁面不能寫檔）。

## 環境備註（合併時不用帶）

- worktree 根目錄的 `node_modules` 是指到主工作區 `node_modules` 的軟連結（`versions.mjs finish` 要 HyperFrames 的 runtime），未追蹤。
- worktree 的 `projects/example/work`、`output/` 是從主工作區複製來做端對端的（不進版控），裡面有這次跑出來的 r1、r2、learn.md、learn-rules.json、site/。

## 測試輸出

`npm run test:fast -- --test-timeout=300000`（含新的 `dev/tests/learn.test.mjs`）：

```
ℹ tests 347
ℹ suites 0
ℹ pass 347
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4208.874458
```

新測試（`node --test --test-timeout=300000 dev/tests/review-site.test.mjs dev/tests/learn.test.mjs dev/tests/editor-learn-ui.test.mjs dev/tests/versions.test.mjs`）：

```
ℹ tests 22
ℹ pass 22
ℹ fail 0
ℹ skipped 0
```

相關整合測試（review-site、editor-learn-ui、editor-requests-ui、versions、feedback-round、deliver、032-w2b、032-w2a、032-p2b、editor、editor-export、editor-segments-ui、editor-layout-ui、media、rough-flow、032-c7、032-p2c、status 一起跑）：

```
ℹ tests 291
ℹ pass 285
ℹ fail 5
ℹ cancelled 0
ℹ skipped 1
✖ editor.mjs --json 只印一行 JSON（ensureEditor 的結果）；editorUrlsSync 拿到同一組網址；開不起來回 null (3742.549833ms)
✖ C6 ensureEditor：沒開就在背景開、回傳各頁網址（不印東西）；開著就沿用；CLI 印的字不變 (1225.177458ms)
✖ --prerender：同內容在跑或做好了不重開；內容改了取消舊的重開；final.mp4 是最新的不做；正式輸出中不做 (10.637667ms)
✖ 實跑：--prerender 立刻返回 → 做完後 deliver.mjs 直接接手不重 render；--cancel 取消時 Chrome 一個不留 (96.955666ms)
﹣ speechWhisper：現成的停頓結果（--v1）只留保留段轉、時間換回 main.mp4，whisper 用環境裡的版本 (0.189791ms) # 只在 AUTO_EDIT_REAL_WHISPER=1 時跑（要 whisper 與 say）
✖ CLI：--help、指令名稱、--seg 必填、list --json (264.323708ms)
```

- `CLI：--help、指令名稱…`（versions.test.mjs）：versions.mjs 多了 learn、site 兩個指令，錯誤訊息的指令清單變長；測試的期望已更新，重跑過。
- 兩則 ensureEditor（032-p2b、032-w2a）：不在主工作區的複本裡跑就會失敗（伺服器記的專案路徑是 `/private/var/…`、測試給的是 `/var/…`，比對不上就另開一個）。用 `git archive HEAD`（71d68a2，沒有這次的改動）解到 scratchpad 跑同兩支，也是這兩則失敗；主工作區跑會過。和這次的改動無關。
- 兩則 --prerender（deliver.test.mjs）：`略過預先 render：磁碟只剩 12 GB（至少要 20 GB）`，本機磁碟空間不夠。

修正後重跑 versions、032-p2b、032-w2a：

```
✖ editor.mjs --json 只印一行 JSON（ensureEditor 的結果）；editorUrlsSync 拿到同一組網址；開不起來回 null (1700.764625ms)
✖ C6 ensureEditor：沒開就在背景開、回傳各頁網址（不印東西）；開著就沿用；CLI 印的字不變 (1504.180708ms)
ℹ tests 25
ℹ pass 23
ℹ fail 2
ℹ skipped 0
```
