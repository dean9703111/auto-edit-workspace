# 002 pipeline-timing：要併進文件的原文

- **給誰**：001 skills-docs（AGENTS.md、9 支 Skill、USAGE.md、USAGE-reference.md、style.md、setup 的擁有者）。002 只擁有程式檔頭的 `--help`（§6）。
- **怎麼用**：`~~~` 框起來的是**原文**，逐字貼進「放哪裡」寫的位置；`<專案>` 保留不換。AGENTS.md 已經拆成 Skill 的段落，貼進對應的 Skill 步驟（例：「剪乾淨」→ `auto-edit-rough`）。訊息原文的單一真相是 `specs/contracts/cli-002.md`，文件引用時寫「照 build 印的 → 改」，不要另抄一份數字。
- **出處**：spec FR-001–FR-008、FR-012–FR-016、FR-019、FR-035–FR-051、FR-066。

## 1. AGENTS.md「剪乾淨」第 4–7 步（或 `auto-edit-rough` 對應步驟）

**放哪裡**：取代現行 AGENTS.md「剪乾淨（初剪）」第 4、5、6、7 點（AGENTS.md:62-68）。第 1–3 點與「剪乾淨時不要做的事」不動，只在「不要做的事」加 §1.2 那一條。

~~~markdown
4. 列剪輯清單：存成 `work/cuts.md`，照停點 ① 的格式。
   - NG 表：表頭 `| 時間碼 | 內容 | 原因 | 待確認 |`，時間碼寫原片（有接主軌就是 `work/main.mp4`）的 `起–迄`，例 `0:12.40–0:15.10`。句子之間的空白不用列，auto-editor 會處理。
   - 講稿有章節（`##` 標題）時，加一張「章節空檔」表：表頭 `| 章節 | 第一句 | 時間碼 |`，每章一列，時間碼寫那一章第一句在原片的起點。章節轉場要停 2.5 秒，這一句前面要留 3 秒停頓，工具會幫你保留。
   - 列完先跑一次 `node shared/template/tools/media.mjs ng-snap --project projects/<專案>`：它印出的 ⚠「原始停頓只有 Ns」要寫進清單最後的「需要你決定」。
   - **停下來等我確認**（有接主軌的話，主軌順序也在這一停）。
5. 我確認後（我改過 cuts.md 就先重新讀檔），再跑一次 `node shared/template/tools/media.mjs ng-snap --project projects/<專案>`，照它印的三行指令依序執行，**不要自己算 NG 的起訖、不要自己拼 auto-editor 指令**：
   - 第 1 行（`--preview`）：看會剪掉多少。正常講話的尾音被切到，就在 ng-snap 加 `--edit "audio:-26dB"`（或 `-30dB`）重跑；小聲的自言自語沒剪掉，就改 `--edit "audio:-16dB"`。改了門檻要再跑第 1 行
   - 第 2 行：輸出 `work/rough.mp4`
   - 第 3 行：存 `work/cuts.v1.json`（只寫 JSON，不轉檔；第 7 步用）
   三行都帶 `--margin 0.15sec`（作者的停頓保留 0.3 秒，auto-editor 預設 0.2 秒會留 0.4 秒）。
6. 對 `work/rough.mp4` 重新轉逐字稿，存成 `work/rough.srt`：照規則 4 用 `講稿.md` 校正錯字和專有名詞。
   校正完跑 `node shared/template/tools/media.mjs srt-split --project projects/<專案> --dry-run`，看拆句表合不合理，再去掉 `--dry-run` 執行（每則最多 18 字、斷在標點，時間依字數比例分配；它會先備份 `work/rough.srt.split-<時間戳>`）。
   確定句子不會再拆合之後，把字幕對齊實際開口的時間：先跑 `node shared/template/tools/media.mjs snap-srt --project projects/<專案> --dry-run`，看調整表合不合理，再去掉 `--dry-run` 執行。**只跑這一次**，之後我在剪輯台改的時間不要再被它覆蓋。
7. 跑 `node shared/template/tools/media.mjs cutpoints --project projects/<專案>`，它會讀 `work/cuts.v1.json` 寫 `work/cutpoints.json`，並印出每個剪接點在 `rough.mp4` 的秒數、是 NG 還是停頓。回報：原始長度、初剪長度、剪掉幾段（auto-editor 印的統計）、srt-split 拆了幾則、snap-srt 調整了幾則（起點、結尾各幾則，最大調整量），以及 cutpoints 印的那張表。
~~~

### 1.2 「剪乾淨時不要做的事」加一條

~~~markdown
- 秒數都由工具算：NG 起訖對齊停頓、章節前保留的停頓用 `ng-snap`；字幕拆句的時間用 `srt-split`；剪接點用 `cutpoints`。不要自己累加幀數、不要自己按字數比例算時間。
~~~

## 2. AGENTS.md「剪好看」與其他段落

### 2.1 「剪好看」第 4 點後面加一段（情境動畫綁句）

**放哪裡**：AGENTS.md「剪好看」第 4 點「情境動畫優先」那一段的最後（或 `auto-edit-motion` 的寫法步驟）。

~~~markdown
   情境動畫的時間軸用 `P.at('#N')` 綁字幕句（`P.at('#21@剪輯清單', 0.2)`＝那個詞開口後 0.2 秒），結尾寫 `P.end()`；不要用 `--check` 的起點自己算秒數，也不用把段長手填回 `data-duration`（build 會自動帶入；做法見 `shared/template/USAGE-reference.md` R7.3）。
~~~

### 2.2 「剪好看」第 7 點的抽查前加一句（連續覆蓋）

~~~markdown
   `build.mjs --check` 報告的「沒有畫面的區間」要是「無」；有的話補卡片或把前一段延到下一段（style.md「連續覆蓋」），刻意留給講者的在回報裡說明。
~~~

### 2.3 「子代理分工」表，情境動畫那一列的「交回」欄

**放哪裡**：取代現行「檔案路徑、長度 D、對到的句號、R7.6 檢查的結果」。

~~~markdown
檔案路徑、用到的 `P.at('#N…')` 清單、R7.6 檢查的結果
~~~

### 2.4 新增一節「接手（換 session、說「繼續」時）」

**放哪裡**：AGENTS.md「專案」那一節之後（或 `auto-edit` 入口 Skill 的第一步）。

~~~markdown
## 接手

我說「繼續」「接著做」，或你不確定做到哪一步時，先跑 `node shared/template/tools/status.mjs --project projects/<專案>`，照它印的「目前在」「下一步」「待回覆停點」接著做；有待回覆的停點就重貼那個停點，等我回覆。修改要開回饋檔時，用它印的「下一輪回饋編號」。
~~~

### 2.5 「換風格」第 2 點的生圖前加一句

~~~markdown
   生圖前先跑 `node shared/template/tools/caps.mjs`，照它印的「可用的生圖路線」選；它只檢查、不安裝也不登入，沒有可用的路線就請我上傳圖片。
~~~

### 2.6 「環境準備」加一點

~~~markdown
- 工作區根目錄的 `package.json` 釘了 HyperFrames 的版本：第一次使用、或 build 印「⚠ HyperFrames … 不同」時，在工作區根目錄跑 `npm install`（安裝前照規則 3 先問我）。
~~~

## 3. `shared/style.md`

### 3.1 「節奏」第一條後面加兩條

**放哪裡**：style.md「節奏」的「連續覆蓋」那一條之後（style.md:45 之後）。

~~~markdown
- build 預設照「連續覆蓋」檢查（plan.json 的 `rhythm` 不寫＝`"continuous"`）：`--check` 會列出「沒有畫面的區間」（超過 1 秒），兩段之間只空 1 秒以內會提醒「講者會閃一下」，要改成 0 秒相接；只有這一集要留露臉空檔時才寫 `"rhythm": "spaced"`
- 章節轉場：該章第一句前面保留 3 秒停頓（剪乾淨的 `ng-snap` 會保留），章節幕 2.5 秒放在停頓裡，不壓人聲；章節期間不放字幕；前一段的畫面停在完成態，墊在章節底下淡入
~~~

### 3.2 「字幕」第 28 行後面加一條

~~~markdown
- 拆句用 `node shared/template/tools/media.mjs srt-split`（剪乾淨第 6 步）；plan.json 寫好之後要拆，到剪輯台分割（剪輯台會一起重對句號）
~~~

### 3.3 「和其他文件衝突時」第一條改成

**放哪裡**：取代 style.md:116。

~~~markdown
- 密度、開場張數、露臉間隔、字卡動態數量和 `shared/template/USAGE-reference.md` R6、R1 的規則衝突時，以本檔為準；build 預設（`rhythm: "continuous"`）已經照本檔，不會再印「開場前 30 秒」「只露臉」這兩條 ⚠
~~~

## 4. `shared/template/USAGE.md`

### 4.1 「2.4 先處理字幕長度」整節改成

~~~markdown
### 2.4 先處理字幕長度

剪乾淨第 6 步已經用 `node shared/template/tools/media.mjs srt-split --project projects/<專案>` 拆過。寫 plan.json 之前再確認一次：用暫時的 plan.json `{ "version": 1, "speakerBox": [960, 260, 1640, 1020], "scenes": [] }` 跑 `--check`，還有超過 18 字的字幕會印出來：

```
⚠ 字幕 #12「提醒我桌子、椅子、電腦、提詞器、攝影機」19 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）
```

plan.json 還沒寫：跑 `srt-split`（先 `--dry-run`）。plan.json 已經用到句號：`srt-split` 會拒絕，改到剪輯台分割（剪輯台會一起重對 `#N`）。不要手改 rough.srt 拆句：後面的句號全部 +1，每一段的 `#N` 都要重對。
~~~

### 4.2 「3.2 第一層欄位」表，`avoid` 那一列之後插入三列

~~~markdown
| `rhythm` | | `"continuous"`（預設）或 `"spaced"` | 卡片節奏。`continuous`＝連續覆蓋（style.md）：報「沒有畫面的區間」與「講者會閃一下」；只有使用者說要留露臉空檔時才寫 `"spaced"` |
| `outro` | | 物件 | 結尾配樂：`{ "from": "#N" }`（從第 N 句起播到片尾，淡入淡出自動；`music`、`volume`、`fadeOut` 選填）。使用者要片尾配樂時才寫 |
| `look` | | `false` 或 `{ "color", "slim" }` | 講者調光與瘦臉，剪輯台寫；AI 只在使用者明說時改（`contracts/look.md`） |
~~~

### 4.3 「4.1 讀懂 `--check` 的輸出」加一段

**放哪裡**：4.1 報告範例的「影片長度」那一行之後。

~~~markdown
報告最上面一行是 HyperFrames 版本（`HyperFrames 0.8.221（package.json 釘 0.8.221）`；有 ⚠ 就在工作區根目錄跑 `npm install`）。「影片長度」後面固定兩行：

```
節奏：continuous（連續覆蓋：每段口播都要有畫面；要留露臉空檔就在 plan.json 寫 "rhythm": "spaced"）
沒有畫面的區間（> 1.0s）：0:41.20–0:47.90（6.70s）；共 6.70s，佔口播 3.7%
```

「沒有畫面的區間」要是「無」才算連續覆蓋；有的話補一段，或把前一段的 `to` 改成下一段的 `from`（0 秒相接）。
~~~

### 4.4 「4.2 常見訊息」表加四列

~~~markdown
| `和前一段 s04 之間只空 0.40s，講者會閃一下 → s04 改 "to": "#21"…` | ⚠ | 照 `→` 改成 0 秒相接 |
| `#11 前的空檔只有 0.50s（< 2s），章節 2.5s 會壓到 #11 的人聲 → 回剪乾淨保留 3 秒停頓…` | ⚠ | 跟使用者說明；要修就回剪乾淨：cuts.md 加章節空檔表、跑 `ng-snap`、重剪 |
| `compositions/x-….html 的 P.at('#99')：字幕沒有第 99 句…` | ✖ | 情境動畫綁的句號不存在或詞找不到：照字幕原文改 `P.at` |
| `src「compositions/x-process.html」已經給 x01 用了 → 複製成另一個檔名…` | ✖ | 同一支情境動畫不能登記兩段 |
~~~

## 5. `shared/template/USAGE-reference.md`

### 5.1 R2.6 `--check --json` 的格式：開頭第一段後面加

~~~markdown
完整欄位表在 `specs/contracts/check-json.md`（`schema: 2`）。除了下表，還有：`planHash`（plan.json 內容的雜湊，qc 用來判斷改過還沒 build）、`rhythm`、`versions`、`uncovered`（沒有畫面的區間）、`voiceUncovered`（只有聲音、沒被蓋住的區間）、`chapters`（每個章節的位置與空檔）、`sfxCount`、`sfxBudget`、`outro`；每段多 `key`、`family`、`layout`（`overlay`／`side`／`pip`／`full`）、`layoutZh`（疊加／半畫面／子母畫面／全幕）、`opaque`，以及 `out`（**成片秒數**的起迄、條列每條進場時間、子母畫面片段、擦入擦出、情境動畫的綁句）。
~~~

### 5.2 R4.5 `pipCrop` 最後加一句

~~~markdown
從講者滿版切到子母畫面時，小窗會從這個裁切框的位置縮到右下角（0.7 秒），所以裁切框要框住臉；`pipCrop` 不寫（`"auto"`）時用 speakerBox 算。
~~~

### 5.3 R6 表：「開場」「露臉」兩列的「build 會檢查？」欄改成，並在表尾加兩列

~~~markdown
| 開場 | 前 30 秒最多一張；02 章節角標也算一張 | 開場是講者建立信任的時間 | ⚠（只在 `"rhythm": "spaced"`；預設照 style.md 不限） |
| 露臉 | 兩段動畫之間講者露臉 ≥ 3 秒（章節轉場後接的那段不算） | 觀眾要看到人 | ⚠（只在 `"rhythm": "spaced"`；預設照 style.md 連續覆蓋） |
| 連續覆蓋 | 預設（`rhythm` 不寫）：每段口播都有畫面 | style.md「節奏」 | 報告「沒有畫面的區間」（> 1 秒）＋⚠ |
| 不閃 | 兩段之間空 0.05–1 秒時講者會閃一下，要 0 秒相接 | 同上 | ⚠ |
~~~

### 5.4 R7.2 第 4 點改成

~~~markdown
4. 子合成的長度由 plan.json 決定：build 會把段長帶進子合成（`P.dur()`），檔內不用填 `data-duration` 與 `const D`，結尾寫 `P.end()`。plan.json 的 `to` 往後延，重跑 build 就好，不用改 custom 檔。
~~~

### 5.5 R7.3 骨架的規則：「時間軸的時間是…相減」與「結尾一定要 `P.end(D)`…」兩條改成

~~~markdown
- 時間軸的時間是「本段起點之後的秒數」，用 `P.at('#N')` 取得：`P.at('#18')`＝第 18 句開口那一刻、`P.at('#18e')`＝第 18 句講完、`P.at('#18@逐字稿')`＝「逐字稿」這個詞開口、第二個參數是再加減幾秒（`P.at('#18', -0.9)`）。ref 要寫成字串字面值，build 才算得到詞的位置；寫錯句號或找不到詞，`--check` 會 ✖ 並附那一句的字幕原文。
- 結尾一定要 `P.end()`（不帶參數＝撐到 plan.json 算出的段長）。
~~~

骨架範例裡的 `const D = …` 與 `const T1 = …` 那兩行，請 003 改範例檔時一起換成 `P.at`／`P.dur()` 的寫法（003 的範例是單一真相，R7.3 的骨架照它貼）。

### 5.6 R7.6 第 1 點改成

~~~markdown
1. `node shared/template/tools/build.mjs --project projects/<專案> --check`：骨架、id、`P.at` 綁的句號都要過（段長由 build 帶入，不用填回）。
~~~

### 5.7 R13 表 HyperFrames 那一列改成

~~~markdown
| HyperFrames CLI | 0.8.221，釘在工作區根目錄的 `package.json`（`npm install` 安裝；build 與 `caps.mjs` 會印實際版本，不同時 ⚠）。從 `projects/<專案>/work/hyperframes` 執行 `npx hyperframes` 也是用根目錄這一版。指令和本文不一致時，以 `npx hyperframes <指令> --help` 為準 |
~~~

### 5.8 R13「環境的坑」auto-editor 那一條改成

~~~markdown
- **auto-editor**：Skill 文件和安裝的版本參數名稱可能不同，以 `auto-editor --help` 為準（實測 29.3.1 要用 `--cut-out`、`--add-in`、`--no-open`；每一段寫一次旗標，同一個旗標後面接兩段會失敗）。剪乾淨的指令由 `media.mjs ng-snap` 印出，不要自己拼。
~~~

## 6. 程式檔頭（`--help` 原文，002 自己寫進檔案）

### 6.1 `tools/media.mjs` 檔頭：main 那一段（round 2 改）、snap-srt 那一段之後（ng-snap、verify-rough、cutpoints、srt-split）

~~~text
 *   node shared/template/tools/media.mjs main --project projects/<專案> [--order 檔名1,檔名2,…]
 *       把 素材/真人錄影/ 與 素材/聲音/ 的檔照檔名排序（或 --order 的順序）接成 work/main.mp4：
 *       聲音檔配純黑畫面；解析度／fps 跟第一支真人錄影（沒有就 1920×1080 30fps）；聲音統一 48k AAC。
 *       同時寫 work/main.json：{ "clips": [{ "file", "kind": "camera"|"voice", "start", "end" }] }
 *       只有一支真人錄影時也轉一次（固定 fps、yuv420p）：auto-editor 直接剪手機原檔（VFR、yuvj420p），--cut-out 之後的畫面可能全黑。
 *       fps：原片在 29–31 之間、VFR 或沒有 fps 時用 30，其他照原片（例 25、60）。
~~~

~~~text
 *   node shared/template/tools/media.mjs ng-snap --project projects/<專案> [--edit "audio:-20dB"] [--margin 0.15sec] [--src <原片>] [--v1 <檔>]
 *       讀 work/cuts.md 的 NG 表（表頭有「時間碼」「原因」）與章節空檔表（表頭有「章節」「第一句」），
 *       用 auto-editor 判斷原片的停頓（結果快取在 work/.cache/），把每段 NG 的起訖對齊到前後的停頓（±1 秒內），
 *       每章第一句前保留 3 秒停頓（--add-in），印出三行可以直接複製的 auto-editor 指令：--preview、輸出 work/rough.mp4、--export v1 -o work/cuts.v1.json。
 *       「待確認」欄有寫字的列不剪。原始停頓不到 3 秒的章節會 ⚠。除了下面說的自動轉 main.mp4，不寫 work/.cache/ 以外的檔。
 *       --src 不寫：用 work/main.mp4；還沒有、且只有一支真人錄影時，先自動跑 main 轉出 work/main.mp4（會寫 work/main.mp4、work/main.json）；
 *       --v1：用現成的 auto-editor --export v1 結果（不跑 auto-editor）。
 *       章節開口：先找包含表上時間的停頓；沒有就往後 6 秒內找第一個停頓的終點（再沒有才看表上時間前 0.6 秒內）。
 *   node shared/template/tools/media.mjs verify-rough --project projects/<專案>
 *       檢查初剪有沒有壞：blackdetect work/rough.mp4，每段黑畫面用 work/cuts.v1.json 換回原片同一秒、量原片亮度；
 *       原片不黑 → ✖ 並印重做的指令（結束碼 1）；原片也黑（或專案有只有聲音的素材）→ ✓ 列出區間。不寫檔。
 *   node shared/template/tools/media.mjs cutpoints --project projects/<專案> [--dry-run]
 *       讀 work/cuts.v1.json（auto-editor --export v1）與 work/rough.mp4 的 fps，算出每個剪接點在 rough.mp4 的秒數，
 *       和 work/cuts.md 的 NG 重疊的標 ng、其他標 pause，寫 work/cutpoints.json（舊檔內容不同時先備份成 .bak-<時間戳>）。
 *   node shared/template/tools/media.mjs srt-split --project projects/<專案> [--max 18] [--dry-run]
 *       work/rough.srt 超過 18 字（全形 1、半形 0.5）的字幕拆成兩則以上：先斷在標點，再斷在空白，都沒有才斷在中間（會 ⚠）；
 *       時間依字數比例分配、首尾相接，句號重新連號。寫回前先備份 work/rough.srt.split-<時間戳>（.bak-<時間戳> 留給 snap-srt，status 靠它判斷 snap-srt 跑過沒有）。
 *       work/hyperframes/plan.json 已經用到句號（#N）時拒絕（改到剪輯台分割，剪輯台會一起重對 #N）。
~~~

### 6.2 `tools/status.mjs` 檔頭（round 2：多了 cmd 那一行）

~~~text
#!/usr/bin/env node
/**
 * 專案進度：做到哪一步、下一步做什麼、哪個停點在等回覆（只讀檔，不寫任何檔、不跑 ffmpeg）
 *
 *   node shared/template/tools/status.mjs --project projects/<專案> [--json]
 *
 * 印出：
 *   目前在：<階段>            例：剪好看／停點 ③ 分鏡表（待回覆）
 *   下一步：<一句話>
 *   <指令>                   （只有講者調光瘦臉還沒好時：look.mjs 的 lookNextStep 給的指令，單獨一行、整行可以複製執行）
 *   下一個停點：<① 剪輯清單｜② 構圖倍率｜③ 分鏡表｜④ Studio 預覽｜無>
 *   待回覆停點：<停點名稱，用「、」接｜無>
 *   下一輪回饋編號：r<N>      （work/回饋/ 裡 r*.md 的最大編號 ＋ 1）
 *   依據：<判斷用到的檔案與停點紀錄>
 *
 * 判斷依據：work/ 裡各階段產物在不在、修改時間先後（例：storyboard.md 比 plan.json 新＝還在分鏡表），
 * 以及 work/製作進度.md 的「## 停點紀錄」表（同一個停點以最後一列為準，狀態「待回覆」＝卡在這裡）。
 * --json：只印一個 JSON（project、stage、at、next、cmd、nextStop、waiting、feedback、evidence；cmd 平常是 null）。
 * --project：同 build.mjs。
 */
~~~

### 6.3 `tools/caps.mjs` 檔頭（新檔）

~~~text
#!/usr/bin/env node
/**
 * 能力檢查：這台電腦能用哪些生圖與影片工具（只檢查，不安裝、不登入、不下載）
 *
 *   node shared/template/tools/caps.mjs [--json]
 *
 * 印一張表（能力｜結果｜依據），結果只有：可用、未登入、沒有安裝或壞掉、版本不符、工具判斷不了。
 *   模型內建生圖     工具判斷不了（看這次 session 的工具清單）
 *   codex            codex --version、codex login status
 *   mmx              mmx --version、mmx auth status（不印 API key 與餘額）
 *   HTML 截圖        npx --no -- hyperframes browser path（HyperFrames 的 Chrome）
 *   ffmpeg／ffprobe  -version
 *   HyperFrames      node_modules/hyperframes 的版本和 package.json 釘的版本比
 * 最後一行印可用的生圖路線（codex → mmx → HTML，只列可用的）。
 * 每個指令最多等 15 秒。結束碼：Chrome、ffmpeg／ffprobe、HyperFrames 都可用＝0，否則 1（codex、mmx 不影響）。
 * --json：只印一個 JSON（node、root、caps[]、imageRoutes）。
 */
~~~

### 6.4 `tools/build.mjs` 檔頭，「也會讀：」那一段後面加

~~~text
 * 報告第一行印 HyperFrames 版本（和工作區根目錄 package.json 釘的版本不同時 ⚠）。
 * plan 有情境動畫（type: "custom"）時，index.html 的 <head> 會多一段 window.__cues（字幕時間與每段起點、段長），
 * 情境動畫用 P.at('#N') 綁句、P.end() 撐到段長，不用手算秒數（寫法見 shared/template/USAGE-reference.md R7.3）。
 * --check 的節奏照 plan.json 的 rhythm（不寫＝continuous，列出沒有畫面的區間）。
~~~

## 7. `setup/`（環境手冊）

**放哪裡**：setup 手冊（Mac 與 Windows）裝完 Node.js 之後、檢測 HyperFrames 之前，加一步。

~~~markdown
### 安裝工作區的 HyperFrames（釘版本）

在工作區根目錄執行：

```
npm install
```

用途：照 `package.json` 安裝固定版本的 HyperFrames（0.8.221）到 `node_modules/`。裝完跑 `node shared/template/tools/caps.mjs`，HyperFrames 那一列要是「可用」。
~~~

## 8. round 2（F1、F2、F4、A 系列）要併進文件的原文

訊息原文的單一真相：`specs/contracts/cli-002.md`（§1.5、§1.8、§2.0、§2.5、§5.1）與 `specs/contracts/check-json.md`（§2.4–§2.7）。下面是要貼進文件的說明。

### 8.1 `auto-edit-rough` 第 1 步（AGENTS.md「剪乾淨」第 1 點）改成

~~~markdown
1. 主軌：一律先跑 `node shared/template/tools/media.mjs main --project projects/<專案>`，之後轉逐字稿以外的步驟都對 `work/main.mp4` 做。只有一支真人錄影也要跑（它會轉成固定 fps：auto-editor 直接剪手機原檔，`--cut-out` 之後的畫面會全黑）。有多支或有聲音檔，照檔名排序列出順序併進停點 ①，確認後加 `--order "檔名1,檔名2"` 再跑一次。忘了跑也沒關係：ng-snap 發現沒有 `work/main.mp4` 會自己先轉。
~~~

### 8.2 `auto-edit-rough` 第 5 步（AGENTS.md「剪乾淨」第 5 點）最後加

~~~markdown
   三行跑完先跑 `node shared/template/tools/media.mjs verify-rough --project projects/<專案>`：印 ✖「初剪壞了」就照它印的 1–4 行重做（剪輯清單不用改），✓ 才往下。回報附上它印的那一行（✓ 或黑畫面表）。
~~~

### 8.3 `auto-edit-storyboard`／`auto-edit-review`：`--check` 的三個新 ✖

~~~markdown
- `✖ work/rough.mp4 在 … 是全黑，但素材沒有純聲音檔 → 初剪壞了`：不要改 plan.json 繞過，照訊息跑 `verify-rough`，照它印的重做初剪；rough.mp4 長度變了就重轉字幕（verify-rough 最後一行會說）。
- `✖ 文字對時：s07 的 key「…」在 0:28.84 出現，「到電腦」0:34.84（#20）才講到 → beats.keyAt 寫 "#20@到電腦"`：照 → 後面那一句改 plan.json（改 `beats.<名>`、`slots.<清單>[i].at` 或 `from`），一則一則改完再跑 `--check`。差 0.6–1.5 秒是 ⚠，也照改。卡片的主文字、清單每一項、字卡動態的字，出現時間＝講到那個詞的時間（`#N@詞`），差 ≤ 0.5 秒。
- 07 重點字卡的 `key` 有自己的時間點 `beats.keyAt`：`lead`（前句）在段起點先出，`key` 等講到那個詞才揭開（`"beats": { "keyAt": "#20@放到電腦" }`，或寫在 slots：`"key": { "text": "放到電腦才看得出", "at": "#20@放到電腦" }`）。
- `⚠ #N@詞 有 N 個用字數比例估（…）`：照 → 後面重轉 `work/transcript.json`（剪乾淨第 6 步的轉錄指令去掉 `--to srt -o …`），或照它說的換詞。
- `⚠ plan.json 寫了 "check": { "textSync": false }…`：正式 plan.json 不要寫 `check`（那是給工具做示意圖用的），刪掉後照 `--check` 的「文字對時」改時間。
~~~

各情境「哪個欄位 → 改哪個時間點」的表：`check-json.md` §2.6（建議整張貼進 USAGE-reference R2 或 SITUATIONS.md §3）。

### 8.4 章節角標（SITUATIONS.md 02、USAGE.md 3.2 第一層欄位、R2 `chtag`）

~~~markdown
- ⚠ 原文：`<it.where> 02 章節角標整段（<m:ss.ss>–<m:ss.ss>）被 <coverId> 蓋住，畫面看不到，只當章節起點用 → 要看到角標就把它的 from 移到疊加段，或刪掉這段只留 chapterBadge`。其他單一不透明段覆蓋 02 整段時警告（起迄容許 0.05 s 誤差）。
- 章節角標會自動常駐右上角：章節開始（01 章節轉場結束；沒有 01 時是 02 章節角標段開始）一直到下一章或片尾配樂，子母畫面、全幕的時候自動淡出。02 段照樣寫（它決定章節從哪裡開始、號碼和章名），長度 3.5 秒以上就好；`chtag: true` 不用再寫（寫了會 ⚠）。
- 不要常駐角標：plan.json 第一層寫 `"chapterBadge": false`（回到舊的行為：02 段只顯示那幾秒、`chtag` 附件照舊）。
~~~

### 8.5 status 與 look（`auto-edit-longform` 接手）

~~~markdown
- `status.mjs` 在構圖預覽或 build 之前、講者調光瘦臉還沒好時，「下一步」會是 look 的說明，下一行單獨一行是要執行的指令（整行複製執行，不要自己加參數）。
~~~

### 8.6 其他（P2）

- `--check` 的「build 會停下來：瘦臉底片不是最新的…」維持 ⚠（C-14 決定不改 ✖，理由見 check-json.md §2.7）；文件寫「看到這則先照它的 → 跑 look.mjs，再 build」。
- 連續 5 段同一類版面（例：5 張下方字卡）會 ⚠：style.md「情境動畫優先」可以引用這條。
- ng-snap 表格：NG 終點往後延到停頓末端時，內容欄會多一句「終點落在後一次開口（m:ss.ss）之前的停頓末端，後一次完整保留」→ auto-edit-rough 第 4 步可以寫「看到這句就是安全的，不用標待確認」。
- `srt-split` 的備份改叫 `work/rough.srt.split-<時間戳>`（`.bak-<時間戳>` 只剩 snap-srt 在用）：AGENTS.md 規則 7、auto-edit-rough 提到備份檔名的地方一起改。

## 9. F8 字幕（斷句照完整語句、樣式照剪映）要併進文件的原文

### 9.1 AGENTS.md「剪乾淨」第 6 步、`auto-edit-rough` 第 6 步改成

~~~markdown
6. 字幕：`npx hyperframes transcribe projects/<專案>/work/rough.mp4 -d projects/<專案>/work --model small --language zh --json --to srt -o projects/<專案>/work/rough.srt`（同時寫 `work/transcript.json` 詞級時間與 `work/rough.srt`）→ `node shared/template/tools/media.mjs srt-align --project projects/<專案> --dry-run`，看斷句表合理再去掉 `--dry-run`（有講稿：字幕＝講稿每一行，時間自動對到講話；沒講稿：照「，。！？；」切成完整子句）→ 照規則 4 只改錯字（講稿本身的錯字、沒講稿時 whisper 的錯字）。**有 `work/transcript.json` 就不跑 snap-srt**（srt-align 的時間已經是詞級）；沒有才照 srt-align 最後一行跑 `snap-srt`（只跑一次）。srt-align 印的 ⚠（對不上、沒標點的長行、不到 0.6 秒）寫進回報。
~~~

「剪乾淨時不要做的事」加一條：

~~~markdown
- 字幕斷句交給 srt-align：不要自己按字數切、不要再跑 srt-split（舊流程）、不要把「，。」加回字幕。
~~~

「剪乾淨的數字」表的「字幕」列改成：

~~~markdown
| 字幕 | 一則 = 講稿一行（完整語句）；最多 18 字，超過在「、，」處拆；同一口氣的短行併；不顯示「，。；：」，保留「、！？」 |
| 字幕合併（srt-align 自己判斷，看斷句表用） | 兩行併成一則要四條都符合：① 同一口氣（兩行之間停頓 ≤ 0.12 秒；有一邊 ≤ 4 字時停頓 < 1 秒也算）② 上一行不是「。！？」結尾 ③ 下一行不以連接詞開頭：而／但／所以／因為／另外／如果／或者／然後／接著／最後／為了／現在／不過／可是／因此／於是／首先／其次／再來／那麼／當／雖然／只是／其實 ④ 合併後 ≤ 18 字 |
~~~

### 9.2 AGENTS.md 規則 4 後面加

~~~markdown
字幕斷句以完整語句為主（講稿一行一則），不顯示「，」「。」「；」「：」，保留「、」「！」「？」。
~~~

### 9.3 `shared/style.md`「字幕」節的數字（照作者剪映 esim_ep2／PPA試看 量的）

~~~markdown
- 字型 Noto Sans TC（思源黑體）Regular 400、76 px（畫面高 7%）、白字、無字距、無描邊無陰影。
- 底板：黑 70%、直角、寬度貼合文字；左右內距 37、上下 24／23，底板高 118；底板下緣離畫面底 6 px（y 956–1074），仍在底部 160 px 字幕區內。
- 一則最多 18 字（估寬上限 1840 px），平均約 12 字、2.3 秒，最短 0.6 秒；字幕首尾相接，空檔 < 1 秒不留白。
- 標點：不顯示「，。；：」，保留「、！？」。
~~~

### 9.4 USAGE 對應表（剪乾淨第 6 步那一列）

~~~markdown
| 字幕斷句與時間 | `media.mjs srt-align --project … [--dry-run]` | 有講稿＝講稿每一行；時間用 transcript.json 對齊；plan.json 已經用到 #N 時加 `--remap-plan` |
~~~

### 9.5 status 的新判斷（`auto-edit-longform` 接手）

- S4「對 rough.mp4 轉逐字稿（--json --to srt …），再跑 media.mjs srt-align --dry-run」；S5「跑 media.mjs srt-align --dry-run 看斷句表…」（沒有 `rough.srt.align-*`）；S6 只在**沒有 transcript.json** 時要 snap-srt。
- 備份檔名：`rough.srt.align-<時間戳>`（srt-align）、`rough.srt.bak-<時間戳>`（snap-srt）、`rough.srt.split-<時間戳>`（srt-split，舊流程）：AGENTS.md 規則 7 一起列。

### 9.6 009 直式

spec 決定表「字幕 60 px、每則 12 字」改成「7% 畫面寬＝76 px、每則 ≤ 12 字」（和橫式同一個字級來源；直式 1080 寬放 12 字＝912＋74）。

## 10. 第二段（theme、轉場語彙、P.sfx）要併進文件的原文

### 10.1 USAGE.md 的 plan.json 第一層欄位表加一列

~~~markdown
| `theme` | `"light"`（預設，不寫）／`"dark"` | 主題：暗色時 build 換 `bg-*-dark.jpg`、所有合成 `<html data-theme="dark">`。剪輯台可以切；AI 只在使用者明說「暗色」時寫 |
~~~

### 10.2 USAGE.md:390 錯誤訊息表那一列改成（kit 的 P.OUT 現在是 0.3，訊息照常數印）

~~~markdown
| `…晚於 D−0.3−0.6 = Xs（…完成態至少要停 0.6s）` | ✖ | `to` 往後延，或把最後一項的 `at` 提早 |
~~~

### 10.3 `auto-edit-motion`／USAGE R7 情境動畫的音效拍點

~~~markdown
- 動畫裡要配音效的拍點寫 `const T = P.sfx('tick', '#38@兩支')`（回傳秒數，同時當這一拍的動畫時間；`P.sfx('ding', '#41', 0.2)` 晚 0.2 秒）。音效名、ref 都寫字串字面值，off 寫數字；build 會排成 `<audio>`，算進 `--check` 的音效次數與密度。不要在 plan.json 另外寫這些音效。
~~~

### 10.4 `auto-edit-review` 定稿回報加一行

~~~markdown
- 貼 build 報告最後一行「轉場：色帶擦開 N（…）；換卡不換景 N（…）；色帶收回 N（…）；疊加卡＋講者慢推 N（…）｜主題：亮色」。轉場是 build 內建的（design-system.md §5），plan.json 不用寫。
~~~
