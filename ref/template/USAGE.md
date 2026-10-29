# 素材包使用說明：核心（給 AI 讀）

這份寫給在這個工作區剪片的 AI Agent。照著做，就能把初剪好的口播影片（`work/rough.mp4`＋`work/rough.srt`）做成有字幕、資訊卡、子母畫面、音效的成片 `output/final.mp4`。

- **第一次用，先把這份從頭讀到尾。**
- `ref/template/USAGE-reference.md` 是參考：挑情境、講者位置與 `css`、字幕與音效、密度、第二層 custom、硬規則、換主色。照第 2 節 SOP 的「查」欄，做到那一步再讀那一節（標題是 `## R1`–`## R13`，可以直接搜尋）。
- **情境與字卡動態的清單、slots 上限、預設長度，一律跑 `node ref/template/tools/build.mjs --list` 看**。不要憑記憶，也不要從其他文件抄。`--list` 只印出、不寫檔；不能跑指令時，讀 `ref/template/scenes/*/scene.json` 與 `ref/template/fx/catalog.json`（同一份資料）。
- 本文的欄位名稱與錯誤訊息都取自 `ref/template/tools/build.mjs`。工具的輸出和本文不一致時，以工具為準（`--help`、`--list`）。

## 1. 先記住這幾條

1. 版型只從素材包挑：18 個情境模板＋40 種字卡動態。不重新設計卡片、不自己畫版面。
2. 成片一律用 `build.mjs` 產生，不要從零寫 HyperFrames 的 `index.html`。理由：底片、子母畫面、字幕、音效、淡入淡出的時間都由程式算，手寫一定會漏。
3. 你唯一要手寫的檔是 `work/hyperframes/plan.json`。例外：第二層 custom 動畫，一集最多 2 段（R7）。
4. 要改任何東西，只改 plan.json，再重跑 build。不要直接改 build 產生的檔（`index.html`、`compositions/sNN-*.html`、`captions.html`、`kit/`）。
5. 兩個地方一定要停下來等使用者確認：分鏡表（步驟 4）、Studio 預覽（步驟 10）。
6. 字級由模板固定，`css` 只能改位置。字放不下就縮文案；使用者要求「字再大一號」也做不到（4.3）。

## 2. 工作流程（SOP）

前提：`work/rough.mp4` 與 `work/rough.srt`（已校正的字幕）都已經存在。指令都在工作區根目錄（有 `AGENTS.md` 的那層）執行，除非寫了 `cd`。

| # | 做什麼 | 指令 | 查 | 停？ |
|---|---|---|---|---|
| 1 | 讀完本檔與 `ref/style.md` | — | | |
| 2 | 列出字幕每一句的句號與內容；看場地照量 `speakerBox` | 2.2 | R4 | |
| 3 | 字幕超過 18 字的先拆句 | `node ref/template/tools/build.mjs --check`（暫時的 plan.json，2.4） | | |
| 4 | 挑情境、列分鏡表，存成 `work/storyboard.md` | `node ref/template/tools/build.mjs --list` | R1、R2、R6 | **停，等確認** |
| 5 | 寫 `work/hyperframes/plan.json` | — | 第 3 節 | |
| 6 | 只檢查、不寫檔；✖ 全部修掉，⚠ 照第 4 節處理 | `node ref/template/tools/build.mjs --check` | 第 4 節 | |
| 7 | 產生整個 HyperFrames 專案 | `node ref/template/tools/build.mjs` | | |
| 8 | HyperFrames 靜態與執行期檢查 | `cd work/hyperframes && npx hyperframes check --caption-zone "x0=0;y0=0.852;x1=1;y1=1;severity=error"` | R8 | |
| 9 | 截圖自己看（check 0 issues 不代表版面對） | `cd work/hyperframes && npx hyperframes snapshot --review` | 2.5 | |
| 10 | 開 Studio，把網址給使用者 | `cd work/hyperframes && npx hyperframes preview --no-open` | 2.6 | **停，等確認** |
| 11 | 測試片段（3–5 秒）→ 完整 render | 2.7 | | |
| 12 | ffprobe 驗收，附輸出給使用者 | 2.8 | | |

理由：改分鏡表只要改一行字，改成片要等好幾分鐘 render。所以順序是「分鏡 → 檢查 → 截圖 → Studio → 短片段 → 整支」。

### 2.1 Plan 模式（只能讀檔、不能寫檔）

- 步驟 1–4 可以在 Plan 模式做；要寫檔的（2.2 截場地照、步驟 3 的暫時 plan.json、步驟 4 的存檔）都等使用者確認、離開 Plan 模式之後才做。
- 步驟 3 改成自己數字數（全形 1、半形 0.5），超過 18 字的列在分鏡表下面，寫出建議斷在哪裡。步驟 4 的分鏡表只寫在回覆裡，句號先用拆句前的。
- 確認之後的順序：拆字幕 → 照分鏡表的「字幕」欄重對句號 → 存 `work/storyboard.md` → 寫 plan.json → `--check`。

### 2.2 量 `speakerBox`

1. 場地照：`ref/` 裡的場地照（範本附的是 `ref/場地照-測試.jpg`），或 Skill 每集自動截的 `work/場地照.jpg`。都沒有就截一張：`ffmpeg -v error -ss 5 -i work/rough.mp4 -frames:v 1 work/場地照.jpg`。
2. 確認是 1920×1080：`ffprobe -v error -show_entries stream=width,height -of csv=p=0 <場地照路徑>`。不是的話，量出來的數字要等比換算。
3. 框出講者的頭頂、兩肩、手勢會到的範圍，四邊各外擴 40px，寫成 `[x1, y1, x2, y2]`（左上到右下）。

範例（`ref/場地照-測試.jpg`）：頭頂 y≈300、身體 x≈1000–1600、身體底 y≈980 → `[960, 260, 1640, 1020]`，中心 x＝1300。中心 x 在 860–1060 算置中，小於 860 在左側，大於 1060 在右側；各位置適合哪些情境見 R4。

### 2.3 分鏡表格式（`work/storyboard.md`）

| 段 id | 句號（起–迄） | 時間碼 | 字幕（起點那句） | 情境 | 畫面文字（slots） | 音效 | 理由 |
|---|---|---|---|---|---|---|---|
| s02 | #11–#13e | 0:25.83–0:33.44 | 千萬不要小看這份紀錄 | 07 key-point（warn） | lead「少了這份文件」／key「場佈多花半小時」 | alert（預設） | 「千萬不要」＋負面後果 → 警示重點 |

- 開頭寫兩行：「講者框 speakerBox＝[x1, y1, x2, y2]（看哪張場地照估的）」、「本集圖示表」（同一個物件全集用同一個圖示）。
- 「音效」欄寫要換的名稱，12 個音效見 R5.2，不寫就用情境預設。
- 時間碼抄 rough.srt 那幾句的起點與結尾；「字幕」欄抄起點那句的原文，之後當 `anchor` 用。
- 提示詞指定的欄位名稱不同時，用提示詞的名稱，但上表的資訊都要有。第二層 custom 的寫法見 R7。

### 2.4 先處理字幕長度

用暫時的 plan.json `{ "version": 1, "speakerBox": [960, 260, 1640, 1020], "scenes": [] }` 跑 `--check`，會印出所有超過 18 字的字幕：

```
⚠ 字幕 #12「提醒我桌子、椅子、電腦、提詞器、攝影機」19 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）
```

在 `work/rough.srt` 拆句：斷在標點，時間依字數比例切，後面的句號全部重新編號。理由：拆句會讓後面的句號全部 +1，plan.json 寫好之後才拆，每一段的 `#N` 都要重對。

### 2.5 snapshot 怎麼看

- 圖在 `work/hyperframes/.hyperframes/artifacts/snapshots/<一串 id>/`，指令結尾會印出完整路徑。
- 先看 `review-beats.jpg`：每段至少兩格（檔名 `beat-NN-at-秒數.png`）。段起點後 0.3 秒那格**還在進場動畫中**（字被遮罩切一半、面板還在滑入，都是正常的）；**判斷版面看段中間那格**。再看 `review-seam-NN.jpg`（每個接縫前後 5 格）；`review-phone.jpg` 是手機寬度。
- 逐張確認：卡片沒擋到講者的臉；文字沒被切掉、沒超出卡片、沒斷在詞中間；字幕在底部、只有一行、中文是黑體；子母畫面裡的講者沒被切到頭；側邊欄期間講者完整在右半邊。
- `--check` 的「大約會蓋到講者框 N%」：snapshot 看到擋臉，就用 `css` 移位（R4）或換情境。只壓到身體、臉沒擋到，就保留，交 Studio 時點名請使用者確認（靜態照片看不出手勢會比到哪）。
- 示範影片本身燒了「原始時間 00:xx」黑框和「測試用場地示意圖」黃字，不是版面問題。
- 要看特定時間：`npx hyperframes snapshot --at 38.5,45.2 --no-end -o ../../output/snaps`（另外產生 `contact-sheet.jpg`）。

### 2.6 Studio 預覽與修改

1. `cd work/hyperframes && npx hyperframes preview --no-open`。在非互動的 shell 裡它會自己轉到背景，印出網址就結束，不用加 `&` 或 nohup。網址像 `http://localhost:3002/#project/hyperframes`（印成 `127.0.0.1` 也可以）。查狀態 `npx hyperframes preview --status`，關掉 `--stop`。
2. 給網址時一起說三件事：要使用者確認的卡（例：碰撞 ⚠ 那張）；請他順便看字幕有沒有對到講話（snapshot 檢查不到）；選卡的方法是暫停在卡出現的畫面，點卡片上的字，出現綠色框線就是選到了。
3. 使用者說「這張卡」「我選的」時，讀他在 Studio 選到的元素：
   ```bash
   cd work/hyperframes && npx hyperframes preview --context --json --context-fields selection
   ```
   - 看 `selection.compositionPath`：`compositions/s04-quote.html` → plan.json 的 `s04`。點卡片上的字會選到文字區塊（`selector` 像 `.sc-t54`，沒有元素 id），靠檔名找段就夠了。
   - 回傳 `"code": "no-selection"`：Studio 開著，但沒選到東西。請使用者暫停在那張卡、點卡片上的字再說一次，或告訴你大約第幾秒。
   - 使用者說「第 X 秒那張卡」：看 `--check` 報告的「起–迄」欄，X 落在哪一段就是哪一段（例：75 秒 → `s04｜15 金句字卡｜1:13.26–1:18.40`）。
4. 把要求寫進 plan.json 那一段：文字改 `slots`，時間改 `from`／`to`／`at`，位置改 `css`（R4）。重跑 `--check` 與 build。Studio 會自動重新整理；畫面沒變就手動重新整理。
5. 改完 3 秒後 grep 一次剛改的文字，確認產生檔裡是新內容（舊版 CLI 的 preview 曾把舊版本寫回檔案）。
6. build 前不用先關 preview：Studio 會在每個元素加 `data-hf-id`，build 算雜湊時會排除，不算手改。
7. 產生檔被手改過（使用者可能在 Studio 拖過東西）時，build 會印出下面其中一則。先看改了什麼，把要保留的搬進 plan.json，再 `node ref/template/tools/build.mjs --force`。
   - `⚠ 這些檔被手改過，沒有覆寫：… → 把改動搬進 plan.json 後加 --force`
   - `work/hyperframes/index.html 被手改過（可能是 Studio 存檔）：…再加 --force 重跑`（build 整個停下來）

### 2.7 render

測試片段：提示詞有指定位置就照提示詞（例：「第一張資訊卡出現的地方」）；沒指定就挑第一段有子母畫面或側邊欄的。起點用 `--check` 報告裡那段的起點秒數。

```bash
node ref/template/tools/build.mjs --test 41,4
cd work/hyperframes && npx hyperframes render -c compositions/test-clip.html --quality draft -o ../../output/test-clip.mp4
```

- `--test 起點,秒數` 另外產生 `compositions/test-clip.html`，build 結尾會印出可以直接複製的 render 指令。`render` 沒有時間範圍參數，短片段只能這樣做。
- 只收「起點落在範圍內」的段。起點更早的段會被略過，build 會印 `⚠ s04 在 49.5s 就開始了，測試片段不含這段（要看完整段，把起點改成 49.5）`。

完整 render（`--quality draft` 只用來測試，交付一律 `looks`）：

```bash
cd work/hyperframes && npx hyperframes render --fps 30 --quality looks --output ../../output/final.mp4
```

時間大約和影片一樣長（M1 Max 實測：82 秒的影片 75 秒、107 秒的影片 62 秒），較慢的電腦更久。指令有逾時限制、或預估超過 2 分鐘時，改用背景執行並看 log：

Mac（zsh／bash）：
```bash
cd work/hyperframes
nohup npx hyperframes render --fps 30 --quality looks --output ../../output/final.mp4 > ../../output/render.log 2>&1 &
tail -n 3 ../../output/render.log
```

Windows（PowerShell）：
```powershell
cd work\hyperframes
Start-Process -FilePath "npx.cmd" -ArgumentList "hyperframes","render","--fps","30","--quality","looks","--output","../../output/final.mp4" -RedirectStandardOutput "../../output/render.log" -RedirectStandardError "../../output/render.err.log" -WindowStyle Hidden
Get-Content ..\..\output\render.log -Tail 3
```

每隔一段時間看一次 log；出現 `Render complete` 才算完成。log 停在同一行很久就回報使用者。

### 2.8 驗收（附輸出給使用者）

```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate -show_entries format=duration -of compact output/final.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 work/hyperframes/assets/rough.mp4
ffmpeg -v error -y -ss 30 -i output/final.mp4 -frames:v 1 output/check-30s.jpg
```

四項都要過：1920×1080、`r_frame_rate=30/1`、有一條 `codec_type=audio`、長度和 `assets/rough.mp4` 相差 ≤ 0.1 秒。再挑一張有卡片的時間截圖自己看。

## 3. plan.json

### 3.1 最小範例

示範影片實測：`--check` 0 個 ✖、2 個 ⚠（開場 30 秒 2 張、金句碰撞；處理見 4.2、2.5）。

```json
{ "version": 1, "speakerBox": [960, 260, 1640, 1020], "sideShift": 0, "pipCrop": "auto",
  "scenes": [
    { "id": "s01", "scene": "chapter-tag", "from": "#8", "to": "#10e", "anchor": "場地設定的文件", "slots": { "num": "01", "name": "場地設定" } },
    { "id": "s02", "scene": "key-point", "tone": "warn", "from": "#11", "to": "#13e", "anchor": "千萬不要小看", "slots": { "lead": "少了這份文件", "key": "場佈多花半小時" } },
    { "id": "s03", "scene": "side-panel", "from": "#17", "to": "#22e", "anchor": "接著用 Whisper",
      "slots": { "eyebrow": "字幕流程", "title": "**Whisper** 轉字幕//再請 AI 校對",
        "items": [ "轉成 **SRT** 字幕檔", { "text": "AI 檢查錯字", "at": "#19" }, { "text": "專有名詞留英文", "at": "#21" } ] } },
    { "id": "s04", "scene": "quote", "from": "#32", "to": "#33e", "anchor": "踩過的坑",
      "slots": { "text": "把踩過的坑//寫成下一次的文件", "by": "鼎淵" },
      "css": "#gCard { left: 120px; right: auto; margin: 0; }", "note": "Studio：擋到手勢，移到左半邊" } ] }
```

**JSON 不能有註解，最後一項後面不能有逗號。**欄位只能用下面兩張表與 R2 列的，多寫會報錯。

### 3.2 第一層欄位

| 欄位 | 必填 | 值 | 說明 |
|---|---|---|---|
| `version` | ✓ | `1` | 固定 |
| `speakerBox` | 強烈建議 | `[x1, y1, x2, y2]` | 講者框（2.2）。沒寫會提醒，也無法檢查碰撞 |
| `sideShift` | | `0`–`960`，預設 `480` | 03 側邊欄時講者往右推多少 px（R4） |
| `pipCrop` | | `"auto"` 或 `[x, y, w, h]` | 子母畫面裁切哪一塊（R4） |
| `avoid` | | 情境 key 陣列 | 使用者說「不要用 XX」時寫進來，用了會報錯 |
| `scenes` | ✓ | 陣列 | 每一段一個物件，依時間順序寫 |

### 3.3 每一段的常用欄位

| 欄位 | 說明 |
|---|---|
| `id` | 英文開頭的英數字或底線，**不能有 `-`**（`s01`、`x01`），全檔唯一 |
| `scene` | 情境 key（`--list` 的 key 欄），例：`key-point` |
| `from` | 起點（3.4）。01 章節轉場不寫 from，改寫 `"at": "#N"` |
| `to`／`duration` | 結尾／秒數。都沒寫就用情境的預設長度；不能短於「最短」 |
| `anchor` | 起點那句的一小段原文，句號位移時會提醒（每段都建議寫） |
| `slots` | 卡片文字，欄位與上限看 `--list` |
| `tone` | `"warn"`（警示紅）或 `"good"`（解方綠），`--list` 寫了 tone 的情境才能用 |
| `sfx` | 12 個名稱之一（見 R5.2 或 `--list`）或 `null`；不寫＝用情境預設（R5） |
| `sfxExtra` | `false`＝關掉這段跟著條列／步驟的附加音效；不寫＝開 |
| `css` | 只改位置的 CSS，id 寫模板原名（R4） |

`note` 是給人看的備註，build 不讀。其他欄位（`beats`、`chtag`、`pip`、字卡動態的 `fx`／`vars`／`bg`、custom 的 `src`／`layout`）見 R2、R3、R7。

### 3.4 時間語法與綁句

| 寫法 | 意思 | 能用在 |
|---|---|---|
| `"#N"` | 第 N 句字幕的起點 | from、to、at、beats |
| `"#Ne"` | 第 N 句字幕的結尾 | 同上 |
| `"#N+0.3"`、`"#Ne-0.2"` | 起點／結尾再加減秒數 | 同上 |
| `12.5` | 影片的絕對秒數 | 只能用在 from、to |
| `"+1.2"` | **本段起點**之後 1.2 秒 | 只能用在 at、beats |

- 句號＝`work/rough.srt` 的編號。build 產生檔案時就換成秒數，所以字幕改了只要重跑 build。
- 段的起點＝講到這張卡的那一句（`"from": "#N"`）。卡早到會劇透，晚到觀眾已經聽過了。
- 段的結尾通常是這段最後一句的結尾（`"#Me"`）。下一段要接著出現時，兩段之間留 ≥ 3 秒露臉。
- 清單項目：口播逐項講到時，每項用 `at` 綁講到它的那一句；一句帶過全部項目時不寫 `at`（模板會在 0.35–0.6 秒內依序進場）。有標題的情境（03、09 等）第一項不寫 `at`。
- 中文逐字稿只有整句的時間，不要猜某個詞在第幾秒；要晚一點就綁下一句，或用 `#N+0.5`。
- `anchor` 不符時 `--check` 會提醒並列出最可能的句號：`⚠ [s02 concept] anchor「場地設定的文件」不在 #8「…」裡 → 最可能是 #11「…」，句號可能位移了`。

### 3.5 卡片文字

- `**詞**` 套主色（一張卡 1–2 個）；`//` 是手動斷行，斷在語意處。兩個都只在 `--list` 標 `rich` 的欄位有效。字數算法：全形 1、半形 0.5，`**` 與 `//` 不算。
- 清單項目寫字串（`"初剪：移除多餘"`）或物件（`{ "text": "**Whisper** 轉字幕", "at": "#19" }`）。有圖示、表格的寫法見 R2。
- **字數有兩道限制**：`--list` 的上限（版面放得下的極限，超過 build 會 ✖）；`style.md` 的「字卡文字 8–14 字」（**build 不檢查，要自己數**）。主句（正文、key、金句）以 8–14 字為準。
- 動畫不重述口播，只留看一眼就懂的重點；完整句子交給字幕。同一張卡文字元素 ≤ 6 個（不含圖示）。標籤、條列詞 ≤ 6 字，能用一個名詞就不用片語（「回覆客戶信件」→「回信」）。
- 忠於口播：數字、專有名詞照講稿，不自編案例、數字、職稱。技術名詞保留英文，中英文之間加半形空格（`**Whisper** 轉字幕`）。
- 金句盡量用原句的詞；原句太長就取後半的翻轉句（例：「靠的不是哪一個工具，而是把每一次踩過的坑都寫成下一次可以直接用的文件」→「把踩過的坑//寫成下一次的文件」）。
- 14 講者介紹：`name`、`titles` 照 `ref/style.md` 的「講者」一節寫，不要用模板預設值。那一節空白就不放 14；字幕自我介紹的名字和 style.md 不同時，先問使用者。

## 4. 常見錯誤與狀況

### 4.1 讀懂 `--check` 的輸出

輸出有三部分：✖ 錯誤（一定要修，有 ✖ 時 build 不產生任何檔）、⚠ 提醒（建議修，可以說明理由後保留）、每段一列的報告。每則訊息 `→` 後面就是修改建議。

真實範例（字幕還沒拆句、講者在右側）：

```json
{"version":1,"speakerBox":[960,260,1640,1000],"sideShift":480,"pipCrop":"auto",
 "scenes":[
  {"id":"s01","scene":"chapter","at":"#11","slots":{"num":"01","title":"場地設定","sub":"一份文件記位置"}},
  {"id":"s02","scene":"concept","from":"#11","to":"#14e","anchor":"場地設定的文件","slots":{"tag":"概念","icon":"clipboard-list","text":"**場地設定**：一份文件記位置"}},
  {"id":"s03","scene":"summary","from":"#14","to":"#16e","slots":{"text":"少了這份文件//場佈要多花**半小時**"}},
  {"id":"s04","scene":"side-panel","from":"#17","to":"#20e","slots":{"eyebrow":"剪輯流程","title":"拍完之後//先做**兩件事**","items":["初剪：移除多餘",{"text":"**Whisper** 轉字幕","at":"#19"},{"text":"輸出 **SRT** 檔","at":"#20"}]}},
  {"id":"s05","type":"fx","fx":29,"from":"#21","to":"#22e","bg":"none","vars":{"number":"3","label":"道檢查"}}]}
```

```
⚠ [s02 concept] 開場前 30 秒已經有 2 張（建議最多一張）
⚠ [s03 summary] 「總結字卡」大約會蓋到講者框 29% → 用 snapshot 確認，擋到臉或手勢就換情境（例：12 關鍵詞條列、04 全畫面）
⚠ [s04 side-panel] 講者右移 480 後右緣到 2120，超出畫面 → plan.json 設 "sideShift": 0（講者本來就在面板外），或改用 04a 全畫面清單
⚠ [s05 fx 29] 和前一段 s04 之間只露臉 0.4s（< 3s）→ 合併成一張或拉開
⚠ 字幕 #12「提醒我桌子、椅子、電腦、提詞器、攝影機」19 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）
⚠ 字幕 #23「比如 MiniMax Code、HyperFrames、Agent Skills 這些英文名詞」29 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）

id｜情境｜起–迄｜長度｜音效時間｜警告
s01｜01 章節轉場｜0:25.77–0:28.27｜2.5s｜whoosh 0:25.27｜—（放在 #11 前的空檔（2.5s））
s02｜06 一般字卡｜0:28.27–0:38.01｜9.74s｜pop 0:28.40｜⚠ 1（換卡到 s03）
s03｜11 總結字卡｜0:37.61–0:45.50｜7.89s｜pop 0:37.74｜⚠ 1
s04｜03 半版側邊欄｜0:49.50–0:58.10｜8.6s｜swipe 0:49.48 ＋tick×3｜⚠ 1
s05｜fx 29 數字計數｜0:58.50–1:03.53｜5.03s｜ding 1:00.33｜⚠ 1
影片長度 1:47.57（107.567s）

通過：5 段，6 個提醒（⚠）。
```

「音效時間」欄會顯示 `pop 0:12.55 ＋tick×3`：前面是主音效與起點，`＋` 後面是這段附加音效（跟著條列、步驟）的顆數；被拿掉的主音效寫成 `（pop 已拿掉）`，沒有音效是 `—`。

時間是音效檔開始播的時間（畫面事件 − 峰值 ＋ 1 幀），whoosh／success／riser 會比畫面早，正常。

報告的「（…）」是 build 自動做的處理，不是錯誤：`換卡到 s03`＝兩張下方字卡相接時同時換場；`放在 #11 前的空檔`＝章節轉場的位置；`停在完成態，被 X 蓋過`、`接縫不淡到 X`＝不透明幕相接時的處理（R4）。

這份範例的改法：

| 提醒 | 改法 |
|---|---|
| 開場前 30 秒 2 張 | 拿掉 s01（短片不分章），或讓 s02 晚一點進 |
| s03 蓋到講者框 29% | 照 2.5：擋到臉就 `css` 移到左邊或換 06／07；臉沒擋到就保留，交 Studio 時點名 |
| s04 右移後超出畫面 | `"sideShift": 0`。講者框左緣 x1＝960，本來就在面板（x 0–960）外 |
| s05 露臉 < 3 秒 | 前一段 `to` 提早（例：s04 改 `#19e`）、後一段 `from` 延後，或刪掉其中一段 |
| 字幕超過 18 字 | 在 rough.srt 拆句（2.4），改完重新對 plan.json 的句號 |

### 4.2 常見訊息

| 訊息（節錄） | 類型 | 怎麼改 |
|---|---|---|
| `「…」N 字，上限 M → 縮成 M 字以內（全形 1、半形 0.5；不縮字級）` | ✖ | 縮文案。不要改字級、不要用 `css` 縮字 |
| `第 N 行「…」…每行上限 M → 縮文案或用 // 換斷行位置` | ✖ | 調 `//` 位置或縮字 |
| `段長 Ns，「…」至少 Ms → to 往後延到至少 …` | ✖ | 找第一個「結尾」晚於那個秒數的句子，`to` 寫 `#Ne`（`#N` 是起點，常常不夠晚）；或換情境 |
| `…晚於 D−0.4−0.6 = Xs（…完成態至少要停 0.6s）` | ✖ | `to` 往後延，或把最後一項的 `at` 提早 |
| `找不到圖示「…」（…相近：a、b、c）` | ✖ | 用括號裡的相近名稱 |
| `沒有「…」這個欄位（type=scene 可用：…）` | ✖ | 欄位拼錯；照可用清單改 |
| `chtag：前面沒有章節轉場（chapter）` | ✖ | `chtag` 要前面有 01。短片沒有 01，角標改成單獨一段 02 |
| `開場前 30 秒已經有 N 張（建議最多一張）` | ⚠ | 02 章節角標也算一張。短片在前 30 秒只放角標或只放一張卡；保留就在回報裡說明理由 |
| `最後一個內容在第 Xs，到退場只停 Ys，建議 ≥ 1.5s` | ⚠ | `to` 往後延一句 |
| `slots.items[0].at：…比 beats.head…還早` | ⚠ | 第一項不寫 `at` |
| `音效 pop（…s）和 s02 的音效只差 2.1s（< 3s），已拿掉` | ⚠ | 只是告知；想保留後一個，就在前一段寫 `"sfx": null` |
| `和 X 時間重疊 Ns → 一段只放一個情境` | ⚠ | 錯開時間 |

其他訊息照 `→` 改；其餘訊息、密度規則與 build 檢查哪些，見 R6。

### 4.3 使用者常見的要求

| 使用者說 | 怎麼做 |
|---|---|
| 「字再大一號」 | 做不到：字級由模板固定，`css` 不能改字級。想更醒目，可以縮短卡片文字，或換成全畫面情境（04 家族，整個畫面只有這張卡；字級差不多，不會變大） |
| 「這張卡晚一句再出來」 | 改那段的 `from`（例：`#11` → `#12`），重跑 `--check` 與 build |
| 「第 X 秒那張卡」 | 2.6 第 3 點 |
| 「字幕早了／晚了」 | 逐字稿的時間碼會漂 1 秒左右，snapshot 看不出來。改 `work/rough.srt` 那一則的起訖時間（句號不變，不要重新轉錄），重跑 build；綁在這句的卡會跟著移 |
| 「換主色」「加背景圖」 | R9 |
