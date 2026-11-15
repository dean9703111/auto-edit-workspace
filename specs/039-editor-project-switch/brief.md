# 039 剪輯台切換影片

來源：作者 2026-11-15（同時剪六支課程宣傳片，每支各開一個剪輯台，port 4409–4414）：「像是我這種同時有剪多隻影片的情境，我覺得個別開 port 是沒有問題的，但應該要設計一個下拉選單方便我切換影片吧，但如果只有一隻的狀態下就不需要」。

## 現況（2026-11-15 盤點）

- 一個專案一個剪輯台，各佔一個 port。狀態記在各專案自己的 `work/hyperframes/.editor/server.json`（`{ pid, port, url, project, token, startedAt }`），`editor.mjs --status`、`--stop`、`ensureEditor` 都讀這一份（`runningEditor`：行程還在＋`/api/ping` 回應的是同一個專案）。
- 沒有任何地方知道「還有哪些專案開著」：要換影片只能回對話找網址，或自己改網址列的 port。
- 四頁（剪輯 `/`、剪輯清單 `/cuts`、構圖 `/framing`、分鏡表 `/storyboard`）的頁首是同一個 `.topbar`，共用的程式只有 `flow.js`（流程列）。

## 定案

| # | 題目 | 定案 | 理由 |
|---|---|---|---|
| 1 | 怎麼知道別的專案開著 | 不加新的登記檔。掃「這個專案所在的資料夾」（平常就是 `projects/`）底下每個資料夾的 `work/hyperframes/.editor/server.json` | 現有的狀態檔就夠：每個專案一份、位置固定。多一份全域登記檔就多一個會過期、要清的東西 |
| 2 | 怎樣才算開著 | 和 `--status` 同一個判斷（`runningEditor`）：狀態檔讀得到 → `pid` 的行程還在 → 那個網址的 `/api/ping` 回 `app: "auto-edit-editor"`，而且它說的專案就是這個資料夾。自己不用問（正在回應的就是它），直接列 | 三關都過才列，過期的狀態檔進不來：行程不在的（沒關好）、整個專案資料夾複製來的（行程和網址都活著，但回應的是原本那個專案）都擋掉 |
| 3 | 過期的狀態檔要不要順手刪 | 不刪（`runningEditor` 加 `{ prune: false }`，預設照舊會刪） | `--status` 一次只問自己的專案；這裡是每個開著的頁面每 10 秒問一次所有專案。對方只是一時沒回應（等 1.5 秒）就把它的狀態檔刪掉的話，它之後 `--status` 會說沒開、再開就多一個重複的剪輯台 |
| 4 | 「同一個工作區」怎麼界定 | 專案資料夾的上一層（`path.dirname(P.project)`），不是工作區根目錄的 `projects/` | 平常兩者一樣。測試的暫存專案不在工作區的 `projects/` 裡（`--template` 指回真的模板），用上一層才不會在跑測試時掃到作者正在剪的真專案 |
| 5 | API | `GET /api/editors` → `{ "editors": [{ "project": "projects/<專案>", "name": "<專案>", "url": "http://127.0.0.1:4409/", "current": true }, …] }`；照 `name` 排序（數字照大小），每個剪輯台看到的順序一樣；一定含自己（`current: true` 恰好一個） | 外面包一層物件和其他 API 一致，之後要加欄位不用改形狀。`name`＝資料夾名稱（選單顯示的字），`project`＝`--project` 的寫法，`url`＝那個剪輯台的首頁 |
| 6 | 選單放哪 | 每一頁頁首、專案名稱（`.brandmark`）右邊，存檔狀態左邊；一個 `<select>`，沒有標籤文字（`title`、`aria-label` 是「切換影片」）；樣式用 `editor.css` 原本的 `select`，寬度跟著選中的名稱（`field-sizing: content`），上限 16em，太長的用 …。由共用的 `project-switch.js` 加上去，HTML 裡不佔位 | 「現在是哪一支、換到哪一支」和專案名稱是同一件事，放在一起；只開一個時頁首和現在一模一樣 |
| 6a | 頁首放不下時 | 有選單時頁首整列可以換行（`.topbar:has(.proj-switch) { flex-wrap: wrap }`，和視窗 1100 px 以下原本的做法一樣） | 量過：剪輯首頁的頁首原本剛好排滿 1120 px，多一個選單在 1101–1420 px 寬的視窗會把右邊的「修改單」「?」擠出視窗（看不到也按不到）。改成換行後各寬度都不超出；6 個專案、12 個字的名稱在 1280 px 還是一列 |
| 7 | 什麼時候顯示 | 清單有 2 個以上、而且裡面有自己才顯示；其他情況（只有 1 個、讀不到、舊服務回 404、官網示範頁）整個元素拿掉 | 作者原話「只有一隻的狀態下就不需要」 |
| 8 | 選了去哪 | 那個剪輯台的同一個路徑＋同樣的 query，但拿掉 `seg`、`t` 和 `#…`。例：`…:4409/?view=final` → `…:4413/?view=final`；`…:4409/cuts.html` → `…:4413/cuts.html` | `view` 是「在看哪一種畫面」，換影片要留著；`seg`、`t`、`#sec-s05` 是「這支影片的哪裡」，帶過去會跳到別支影片同名的段，或跳出「找不到 x0410」 |
| 9 | 多久更新一次 | 載入時一次、視窗取得焦點時一次、頁面看得到時每 10 秒一次；清單沒變就不重畫（選單正打開時不會被收起來） | 作者多半是在對話和瀏覽器之間切來切去，回到瀏覽器那一下就要是新的；AI 在背景新開一支時，盯著頁面的人 10 秒內也看得到 |
| 10 | 這個剪輯台自己關了 | 選單留著上一次的樣子 | 頁面還開著但服務關了的時候，還能從選單切到別支 |
| 11 | 換頁前後的選單狀態 | 選了之後先把選單選回這一支再換頁 | 按上一頁回來、或有東西沒存而被瀏覽器留在這一頁時，選單寫的還是這一支 |

## 做了什麼

- `shared/template/tools/editor.mjs`：`listEditors(ctx)`、`GET /api/editors`；`runningEditor(stateFile, project, { prune })` 多一個選項（預設不變）；`--help` 多一行說明。
- `shared/template/tools/editor/project-switch.mjs`（新，純函式，瀏覽器和測試共用）：`switchOptions(editors)`（回空陣列＝不顯示）、`switchUrl(href, target)`。
- `shared/template/tools/editor/project-switch.js`（新）：抓清單、畫 `<select id="projSwitch" class="proj-switch">`、換頁。四個頁面的 HTML 各多一行 `<script type="module" src="/editor/project-switch.js">`。
- `shared/template/tools/editor/editor.css`：`.proj-switch`、有選單時頁首可換行，共兩行。
- 官網示範頁（`dev/tools/build-site.mjs`）：多複製這兩支程式（頁面的 HTML 會載入它）；示範頁的 `/api/editors` 回 404，所以不顯示。
- 文件：`shared/template/EDITOR.md`（給 AI：第 2 節多一條；給使用者：多一節「同時剪好幾支影片」）。
- 測試：`dev/tests/editor-project-switch.test.mjs`（加進 `test:fast`）：兩個暫存專案的剪輯台兩邊都列出兩個、`current` 正確；複製來的、行程不在的狀態檔不列也不刪；關掉一個只剩一個；四頁都載入、HTML 不佔位；`switchOptions`、`switchUrl`。`site-demo.test.mjs` 的檔案清單多這兩支。

## 驗證

- `npm run test:fast`（278 過）、`npm run test:docs`（37 過）、`editor.test.mjs`＋`editor-service-version.test.mjs`（28 過，沒有略過）。
- 整批 `dev/tests/editor*.test.mjs` 一起跑時有兩個測試不穩：`editor-framing` 的「構圖下方直接預覽動畫」、`editor-segments-ui` 的「字幕分頁」。改動前的版本一樣（匯出一份 HEAD 跑兩次，兩次都紅），單獨跑那兩個檔都過；和這次的改動無關，沒有動。
- 把 `listEditors` 的專案比對拿掉再跑，新測試會紅（複製來的狀態檔被列進來），確認測試有在擋。
- 用 HyperFrames 的 Chrome 實際走一遍（兩到三個暫存專案，腳本沒進 repo）：只開一個時四頁都沒有選單；開第二個後選單出現、這一支是選中的；選另一支到對方的 `/?view=final`、`/cuts`、`/framing`、`/storyboard`（`#sec-s05` 沒帶過去）；頁面開著時新開第三個，取得焦點就多一項；不給焦點等輪詢，10 秒後少一項；剩一個選單消失；按上一頁回來選單還是這一支；這個剪輯台關了之後還能從選單切到另一支。頁首寬度另外量過（6 個專案、有「下一步」那一格的剪輯首頁，1680／1440／1340／1280／1200／1120／1101／1100／1000／860 px）：有選單時都不超出視窗，1280 px 以上一列、以下兩列（860 px 三列）。

## 沒做的事

- 專案名稱會出現兩次（標題下面那一行、選單裡）。沒有把標題下面那一行藏起來：構圖頁那一行還寫著版式和尺寸，藏了會少資訊。
- 選單只列「開著剪輯台」的專案，不列沒開的專案，也不會幫忙開別支的剪輯台。
- 不同資料夾的專案（別的工作區、git worktree 各自的 `projects/`）互相看不到。
- 比對專案用的是路徑字面（和 `--status` 一樣）：別支的剪輯台是從捷徑（symlink）路徑開的、和這邊算出來的寫法不同時對不起來，不會列。
- 對方的剪輯台一時沒回應（超過 1.5 秒）那一輪不會列，下一輪（10 秒內）回來；只有兩支時選單會跟著消失一下。
- 選了之後沒有先確認對方還開著：對方剛好在這 10 秒內關掉的話，會到一個打不開的頁面（按上一頁回來即可）。
- 沒有為選單寫瀏覽器自動測試（`editor-*-ui.test.mjs` 那一類）；頁面上的行為只有上面那次手動走過。
- 只開一個時，剪輯首頁的頁首在 1101–1119 px 寬、「下一步」那一格有字時原本就會超出視窗一點（量到最多 19 px）。沒有動（只開一個時的行為要和原本一樣）。
- 打開一個還沒有 `plan.json` 也沒有影片的專案的剪輯首頁時，`app.js` 的 `renderCheck` 會丟一個錯（`d` 是 null 還讀 `d.items`）。這次走實機時看到的，和切換影片無關，沒有改。
