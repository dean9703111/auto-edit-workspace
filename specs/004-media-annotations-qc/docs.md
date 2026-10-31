# 004 media-annotations-qc：要併進文件的原文（交 001 整合）

- 每一節標明「整段取代」或「插入」；001 併進去時只改格式，不改數字與指令。
- 數字的單一真相：規則數字寫在 `shared/style.md`（本檔第 1 節），程式常數在 `tools/lib/media.mjs`（plan.md P1.1）。第 9 節列出兩邊要一致的數字，給 001 的 `dev/tests/docs.test.mjs` 比對。
- 指令與印出的原文以 `specs/contracts/cli-004.md` 為準；欄位與訊息以 `specs/contracts/media.md` 為準。
- 縮寫：U＝`shared/template/USAGE.md`，R＝`shared/template/USAGE-reference.md`。

## 1. `shared/style.md`「## 螢幕錄影與圖片」（整段取代）

```markdown
## 螢幕錄影與圖片

插入的做法（plan.json 的 media 段、怎麼配對、座標怎麼讀）在 `shared/template/USAGE.md` 第 5 節；這裡是節奏與標註的規則。

- 只有聲音的旁白一定要配畫面（螢幕錄影或圖片），不留黑畫面
- 一段口播配一段錄影：從講到那個操作的那一則字幕開始，講完就回到講者；錄影要和口播講的是同一個操作，對不上就調起點、變速或拆段，不要讓觀眾看著別的畫面聽說明
- 錄影太慢可以加速（最多 4 倍）；等待、載入的空檔剪掉或加速，不要讓畫面停著
- 錄影預設靜音，只聽口播；錄影本身的聲音是重點時才保留
- 講者縮到右下角子母畫面；只有聲音的段落沒有講者，不放子母畫面
- 錄影段落不放下方資訊卡；要強調畫面上的東西，用紅框、說明卡、聚光燈、箭頭、運鏡、放大鏡；字卡密度往稀的那端下
- 說明卡（callout）屬於標註，不是資訊卡：它是紅框旁邊用引線接出去的一張小卡，只在錄影段用，所以不違反「錄影段落不放下方資訊卡」。一張卡只寫一個名詞或一個動作，最多 12 字（全形 1、半形 0.5），可以配一個圖示；細節交給口播
- 說明卡至少完整停 1.2 秒（一般進場 until − at ≥ 2.35 秒）；短句用 quick 一起淡入，至少完整停 0.8 秒（until − at ≥ 1.35 秒）；卡片放框的哪一邊由 build 自動挑，放不下會告訴你換哪邊
- 紅框：實線 4px、警示紅、硬邊無光暈，上下左右內距相等；同一時間最多 2 個（說明卡的框也算）；位置相近、連續講同一塊時一開始就畫一個大框，不要一句一框反覆閃；停不到 0.5 秒的不畫；最後一個框講完再多停 1 秒
- 錄影在捲動、要框的東西跟著移動時，讓同一個紅框跟著移（path），不要拿掉再畫一個新框；換目標 0.4 秒、跟捲動用錄影捲動的秒數
- 聚光燈（spot）：其他地方壓暗 35%，只留要看的那一塊；一次一個、至少 2 秒，不和放大鏡同時
- STEP 膠囊（steps）：多步驟的操作才用，掛在左上角；每一步最多 12 字，相鄰兩步至少隔 1.65 秒；號碼全片接著數，同一個步驟在下一段繼續講時寫一樣的字，號碼沿用、膠囊不重播
- 箭頭（arrows）：給小按鈕、小圖示這種紅框框不清楚的地方；箭尖離目標 6–12 px（build 用 9 px），不壓到字、卡片、膠囊與紅框線；找不到不擋字的位置就不放（build 會自動拿掉並提醒）；一次一支、至少 2.2 秒；放大鏡期間不放
- 說明卡、聚光燈、箭頭出現的期間畫面不能動：運鏡要在標註之前結束，或等標註退場後再動；有這三種標註的圖片不做慢推
- 運鏡：推近到口播在講的那一塊，講完拉回全景；一次 0.6–1 秒；推近不超過 4 倍（再大會糊，改用放大鏡）
- 放大鏡：給小字、數字、小按鈕；只框要看清的那一小塊，等比放大；至少停 1.2 秒；一次一個，不和運鏡同時
- 圖片沒有標註時預設整段緩慢推近（1.00→1.05），讓畫面不要死板
```

出處：說明卡與 STEP 的版面、時序（`TR/rec`、`rec-overlay.css`）；箭頭 6–12 px、不擋字、找不到位置就不放、放大鏡期間刪（`JY/WF:L59-64`）；紅框跟捲動（`ES/seg31:L86`、`:108-109`）；完整停 1.2 秒、quick 0.8 秒（`specs/README.md` 主代理裁決）；其餘數字見 `specs/contracts/media.md` §2。

## 2. U §5.3「寫法」

### 2.1 範例 JSON（整段取代）

```json
{ "id": "m01", "type": "media", "src": "素材/螢幕錄影/操作示範.mp4", "from": "#20", "to": "#26e", "anchor": "打開設定頁",
  "in": 12.5, "sfx": "whoosh",
  "steps":    [ { "at": "#20", "text": "打開設定" }, { "at": "#23", "text": "建立金鑰" } ],
  "moves":    [ { "at": "#20+0.5", "to": [0, 120, 640, 400] }, { "at": "#22", "to": "full", "dur": 0.6 } ],
  "callouts": [ { "at": "#21", "until": "#21e", "box": [24, 300, 220, 64], "text": "設定", "icon": "settings" } ],
  "marks":    [ { "at": "#23", "until": "#24e", "box": [441, 310, 249, 428],
                  "path": [ { "at": "#24", "box": [498, 759, 450, 52], "dur": 0.6 } ] } ],
  "arrows":   [ { "at": "#25", "to": [1712, 64] } ],
  "lens":     [ { "at": "#26", "until": "#26e", "box": [1500, 40, 300, 90], "zoom": 2 } ] },
{ "id": "m02", "type": "media", "src": "素材/圖片/架構圖.png", "from": "#27", "to": "#29e", "anchor": "整體架構",
  "spot": [ { "at": "#28", "until": "#29", "box": [820, 260, 600, 420] } ] }
```

（標註出現期間不能運鏡：範例的推近在 `#21` 前結束、拉回全景在說明卡退場後的 `#22`。說明卡停得夠不夠久、有沒有和運鏡重疊，寫完跑 `--check` 看。）

### 2.2 欄位表（取代 `moves`／`marks`／`lens` 那一列、`kenburns` 那一列）

```markdown
| `moves`／`marks`／`lens` | — | 運鏡、紅框（含跟捲動 `path`）、放大鏡（5.5） |
| `callouts`／`spot`／`steps`／`arrows` | — | 說明卡、聚光燈、STEP 膠囊、箭頭（5.5） |
| `kenburns` | 圖片 `true` | 圖片沒寫 `moves`、也沒有 `callouts`／`spot`／`arrows` 時整段慢推 1.00→1.05；`false` 關掉 |
```

### 2.3 表下第一條（整條取代）

```markdown
- `moves`／`marks`／`lens`／`callouts`／`spot`／`steps`／`arrows` 與 `path` 的 `at`／`until` 用 `"#N"`、`"#Ne"`、`"#N+0.5"`、`"+3"`（本段起點後 3 秒），要落在這段裡面。
```

## 3. U §5.4「座標怎麼讀」（插入：最後一條之後）

```markdown
- `callouts`／`spot`／`marks.path` 的 `box` 和紅框一樣貼齊元素的邊；箭頭的 `to` 寫 `[x, y]` 一個點：要指的那個元素**最靠近箭尾那一側的邊**（例：箭頭從右上來，就寫元素右上角附近的點），build 會讓箭尖停在離它 9px 的地方。
```

## 4. U §5.5「運鏡、紅框、放大鏡」

### 4.1 標題（取代）

`### 5.5 運鏡、紅框、標註、放大鏡`

### 4.2 表格（取代「紅框 `marks`」那一列，並在「放大鏡 `lens`」之前插入 4 列）

```markdown
| 紅框 `marks` | `{ "at": "#21", "until": "#22e", "box": [x, y, w, h] }`；`until` 不寫＝到段尾。錄影捲動時加 `"path": [{ "at": "#22", "box": [x, y, w, h], "dur": 0.6 }]` | 實線 4px 警示紅、描線 0.4 秒進場、0.3 秒淡出；跟著運鏡一起動。同時最多 2 個，說明卡的框也算（✖）；停不到 0.5 秒的拿掉（⚠）；最後一個框自動多停 1 秒；被子母畫面擋住、壓到字幕區會 ⚠。`path` 每一步把同一個框移到新位置：要等框描完（`at` 後 0.4 秒）才能動、淡出前要到位（✖）；`dur` 0.2–2，預設 0.4 |
| 說明卡 `callouts` | `{ "at": "#21", "until": "#22e", "box": [x, y, w, h], "text": "打開 API 設定", "icon": "settings" }`；選填 `"side"`、`"quick": true` | 紅框＋引線＋說明卡。`text` 最多 12 字（✖）；`icon` 從 `kit/icons.json` 挑；`side` 不寫＝依序試右、左、下、上，自動挑放得下的那邊；寫了但放不下 ✖，訊息會告訴你改哪一邊。完整可讀一般至少 1.2 秒（`until − at ≥ 2.35` 秒）、`quick` 至少 0.8 秒（≥ 1.35 秒）（✖）。期間不能有運鏡（✖） |
| 聚光燈 `spot` | `{ "at": "#21", "until": "#22e", "box": [x, y, w, h] }`；`until` 不寫＝到段尾 | 其他地方壓暗 35%，只留框的地方（外擴 8px、圓角）；淡入淡出各 0.4 秒。至少 2 秒、一次一個、不和放大鏡同時（✖）；期間不能有運鏡（✖） |
| STEP 膠囊 `steps` | `[{ "at": "#20", "text": "新增專案" }, { "at": "#23", "text": "連接 Gmail" }]` | 左上角「STEP N＋這一步在做什麼」。`text` 最多 12 字；依時間排、相鄰兩步至少 1.65 秒、最後一步離段尾至少 1.65 秒（✖）。號碼 build 自己算：全片接著數，和前面同字的沿用號碼；下一段接著同一步時第一步寫同樣的字、`at` 寫 `"+0"`，膠囊不會重播。壓到其他標註會 ⚠ |
| 箭頭 `arrows` | `{ "at": "#24", "to": [x, y] }`；選填 `"until"`（預設 `at` 後 3 秒）、`"from": "ne"`（箭尾方向） | 指小按鈕、小圖示。箭尖離 `to` 9px，箭身 120px（放不下用 96px）；`from` 不寫＝依序試 ne、nw、se、sw、e、w、n、s，挑第一個不壓到字、卡片、膠囊、紅框線、子母畫面的方向；寫了但放不下 ✖ 並建議方向；全部放不下就拿掉（⚠）。至少 2.2 秒、一次一支（✖）；放大鏡期間自動拿掉（⚠）；期間不能有運鏡（✖） |
```

### 4.3 表下的條列（在「推近與放大鏡二選一」之後插入）

```markdown
- 標註和運鏡錯開：說明卡、聚光燈、箭頭出現時畫面必須是停的。要推近再標註，就先 `moves` 推過去（`dur` 結束），再讓標註的 `at` 晚於它。
- 選哪一種標註：講「這一塊」用紅框；講「這是什麼／按這個」用說明卡；要觀眾只看一塊、其他都不重要用聚光燈；目標小到紅框框不清楚用箭頭；字太小看不清用放大鏡；一步一步的操作加 STEP 膠囊。
- 說明卡和紅框不要框同一個東西：說明卡本身就有紅框。
- 箭頭指的東西已經有紅框時，`to` 改指紅框外面一點（箭頭不能穿過紅框線）。
```

## 5. U §5.6「檢查」（整段取代）

```markdown
### 5.6 檢查

- `--check` 報告那一列：`素材 12.5s 起、原聲 -6dB`、`運鏡 2、紅框 1（跟捲動 1 次）、標註 1、STEP 2（第 1–2 步）、箭頭 1、放大鏡 1`、`只有聲音的區間不放子母畫面`。箭頭被拿掉時寫 `箭頭 0（拿掉 1）`，對照 ⚠ 改 `to` 或 `from`。
- 截圖：`node shared/template/tools/qc.mjs storyboard --project projects/<專案>` 會在紅框、每一步 `path`、說明卡、聚光燈、每一步 STEP、箭頭、放大鏡到位的那一刻各截一張（`work/storyboard-preview/m01-1.png` …），確認框住的是口播講的東西、卡片和箭頭沒壓到字、鏡片沒壓到子母畫面。
- 測試片段挑一段 media：確認錄影有在動（不是停格）、子母畫面在只有聲音的區間沒出現；跑 `qc.mjs observe --file <測試片段> --offset <起點>` 看接縫條帶有沒有閃。
```

## 6. R2.5「media 段的全部欄位」

### 6.1 表格（取代 `kenburns`、`marks` 兩列；在 `lens` 之後插入 4 列）

```markdown
| `kenburns` | 選填 | `true`、`false` | 圖片 `true`、錄影 `false`；有 `callouts`／`spot`／`arrows` 時 `false` | 沒寫 `moves` 時整段慢推 1.00→1.05；有標註時寫 `true` 會 ⚠ 並忽略 |
| `marks` | 選填 | `[{ "at", "until", "box": [x,y,w,h], "path": [{ "at", "box", "dur" }] }]` | | 紅框；`until` 不寫＝到段尾；同時 ≤ 2（callouts 的框也算）；`path` 讓框跟著錄影捲動，`dur` 0.2–2，預設 0.4 |
| `callouts` | 選填 | `[{ "at", "until", "box": [x,y,w,h], "text", "icon", "side", "quick" }]` | | 說明卡；`text` 1–12 字；`icon` 圖示名或 `"none"`；`side` `"right"`／`"left"`／`"top"`／`"bottom"`，不寫＝自動；`quick` 預設 `false`；完整可讀 ≥ 1.2 秒（quick ≥ 0.8 秒）；期間不能有運鏡 |
| `spot` | 選填 | `[{ "at", "until", "box": [x,y,w,h] }]` | | 聚光燈；壓暗 35%；≥ 2 秒；一次一個；不和放大鏡同時；期間不能有運鏡 |
| `steps` | 選填 | `[{ "at", "text" }]` | | STEP 膠囊；`text` 1–12 字；相鄰兩步 ≥ 1.65 秒；號碼自動 |
| `arrows` | 選填 | `[{ "at", "until", "to": [x,y], "from" }]` | `until`＝`at`＋3 秒 | 箭頭；`from` `"n" "ne" "e" "se" "s" "sw" "w" "nw"`，不寫＝自動；≥ 2.2 秒；一次一支；放不下自動拿掉（⚠）；期間不能有運鏡 |
```

### 6.2 表下的條列（取代前兩條）

```markdown
- 座標（`box`、`moves.to`、`arrows.to`、`path[].box`）一律是**素材原尺寸的像素**，用 `media.mjs frame --grid` 讀（核心 5.4）。超出素材範圍 ✖。說明卡、聚光燈、箭頭由 build 換成畫面座標、畫在運鏡層外面（字不會被放大變糊），所以它們出現的期間不能運鏡；紅框（含 `path`）畫在運鏡層裡，跟著運鏡動。
- `moves`／`marks`／`lens`／`callouts`／`spot`／`steps`／`arrows`／`path` 的 `at`／`until`：`"#N"`、`"#Ne"`、`"#N±秒"`、`"+秒"`（本段起點後），不能寫絕對秒數，要落在這段裡。
- 訊息代號（`--check` 的 ✖／⚠ 原文與改法）：`specs/contracts/media.md` §3；作者維護時查，AI 照訊息裡的「→」改就好。
```

## 7. AGENTS.md

### 7.1「構圖＋套卡預覽」第 2 條（整條取代）

```markdown
- 看圖給建議：倍率表最後一欄「建議」打 ✔ 的那個是工具算的（不切到手勢、每個像素放大不超過 3.5 倍的倍率裡最大的），先照它建議；四周有多餘外框（黑邊、櫃子、大片空牆）讓構圖鬆散就建議放大；會切到手勢、卡片壓到臉就往小選。把兩張圖、指令印的倍率表和你的建議給我，**停下來等我選倍率**。
```

### 7.2「剪好看」第 6 步最後一條「每段附實際畫面截圖」（整條取代）

```markdown
   - 每段附實際畫面截圖：照草稿寫 `work/hyperframes/plan.json` → `--check`（✖ 先修掉）→ build → `node shared/template/tools/qc.mjs storyboard --project projects/<專案>`。它自己算每段的完成態（段尾前 0.6 秒；條列逐條換的每次一張（一起出現的併一張）；錄影段的紅框、說明卡、STEP、箭頭、放大鏡每個到位時一張），一次截完存成 `work/storyboard-preview/s01.png`（一段多張是 `s04-1.png`、`s04-2.png`），最後印出 `![s01](storyboard-preview/s01.png)` 這種行：照順序貼進每一段，下面寫「截圖觀察」（有沒有擋臉、壓手勢、文字問題）。指令印 ✖ 就照「→」做完再重跑。拿不定版面的段落，先把第一個方案的圖改名成 `s05-A.png`，改 plan.json、build、再跑一次 storyboard 得到 `s05.png`，兩張並排請我選。這一版 plan.json 只是預覽用，確認後照最後的 MD 重寫。
```

### 7.3「剪好看」第 8 步（整步取代）

```markdown
8. 我說可以之後，先輸出 3–5 秒的測試片段（挑第一張資訊卡出現的地方）到 `成片/測試片段/`，用 ffprobe 確認有音軌，再跑 `node shared/template/tools/qc.mjs observe --project projects/<專案> --file projects/<專案>/成片/測試片段/<檔名> --offset <起點>`，看 `work/觀影/sheet-01.jpg` 確認版面、`seam-01.jpg` 確認接縫沒有閃；沒問題再輸出 `成片/final.mp4`，然後：
   1. 跑 `node shared/template/tools/qc.mjs observe --project projects/<專案>`，逐張看 `work/觀影/sheet-NN.jpg`（每 0.5 秒一格，格下有時間、段落編號、字幕）與 `seam-NN.jpg`（每個接縫前 0.5 秒到後 0.2 秒）。「靜止」⚠ 逐條說明是不是刻意留白；看到問題照「[P0] 0:41.2（s05） 問題｜證據（sheet-02.jpg 第 3 列第 5 格）｜修法」記下來，修好再 render。
   2. 跑 `node shared/template/tools/qc.mjs final --project projects/<專案>` 驗收（格式、長度、響度、畫面凍結、黑畫面、長時間沒聲音，做法照 `shared/template/USAGE.md` 2.8）：有 ✖ 先修好再交；⚠ 逐項說明是不是刻意的。
   把兩個指令的輸出、`成片/驗收截圖/qc-sheet.jpg` 和 `work/觀影/index.md` 一起給我。
```

### 7.4「子代理分工」表「抽查截圖」那一列（整列取代）

```markdown
| 抽查截圖（「剪好看」第 7 步）、觀影總表（第 8 步） | 分鏡表 8 段以上 | `verifier`，每個看一段範圍（例：s01–s06，或 `sheet-01.jpg`–`sheet-05.jpg`） | 不寫檔 | 每段 PASS／FAIL、問題、截圖或總表檔名＋第幾列第幾格 |
```

### 7.5「換風格」第 2 步（整步取代）

```markdown
2. 背景圖：每種版面一張——`shared/template/bg-fs.jpg`（1920×1080，全畫面與插入素材）、`bg-side.jpg`（960×1080，側邊欄面板）、`bg-ch.jpg`（1920×1080，章節轉場）。照這個順序挑做法：
   1. 我有上傳圖片：縮放／裁切成對應尺寸存檔。
   2. 沒有圖片、可以用 Codex：依主色生成（`codex exec` 的生圖功能，提示詞從 stdin 給，做法與每張要留空的區域見 `shared/template/USAGE-reference.md` R9.2）。
   3. 沒有 Codex（或我要程式碼畫的簡潔底紋）：寫三個 HTML 放暫存資料夾，各跑一次 `node shared/template/tools/brand.mjs bg --html <暫存>/bg-fs.html --kind fs --out <暫存>`（`side`、`ch` 同理；做法見 R9.3）。它會截成 jpg、疊上留空區框、檢查留空區有沒有裝飾，三張到齊產生 `<暫存>/preview.jpg`。
   不管哪一種，都先給我看三張並排的預覽圖（HTML 路線就是 `preview.jpg`），**停下來等我同意**才放進 `shared/template/`（指令印的 `cp`／`Copy-Item` 那幾行）。
```

## 8. R9.2、R9.3

### 8.1 R9.2「留空的地方」那一條（整條取代）

```markdown
- 留空的地方：全畫面主卡 x 120–1380、y 150–862，子母畫面 x 1424–1888、y 581–951，字幕帶 y ≥ 920；側邊欄文字區 x 0–816、y 86–864（左 85%、y 8–80%）；章節幕章名卡 x 160–1760、y 260–870。裝飾放在這些區域以外。`brand.mjs bg` 用同一組數字疊框、檢查。
```

（`ch` 的數字是建議初值：`scenes/01-chapter/template.html` 檔頭寫章名卡整組置中、有圖示時 course 版 y 290–790、yt 版 y 340–840，上下各留 30 px。）

### 8.2 新增 R9.3（插在 R9.2 之後）

```markdown
### R9.3 用 HTML 畫背景圖（沒有生圖工具時）

1. 在暫存資料夾寫 `bg-fs.html`、`bg-side.html`、`bg-ch.html`。版面用絕對定位畫在 `html, body` 上，主色用 `var(--brand)`（`--brand-ink`、`--brand-text` 也能用），字型用 `var(--font-cjk)`；`brand.mjs bg` 截圖前會自動接上 `kit/brand.css`、`kit/fonts.css`（其他主題變數不會接，要用的顏色直接寫色碼）。不要另外連 CDN 或網路圖片（會 ⚠）。
2. 每張跑一次：

       node shared/template/tools/brand.mjs bg --html <暫存>/bg-fs.html --kind fs --out <暫存>

   產生 `bg-fs.jpg`（成品）、`zones-fs.jpg`（疊上留空區框：紅＝主卡或文字區、藍＝子母畫面、黃＝字幕帶）、`raw-fs.png`（原始截圖）。
3. 看指令印的那一行：`✔ 留空區乾淨` 就好；`⚠ 紅框（全畫面主卡）裡有 2.3% 的像素是裝飾` 就把裝飾移到框外，重跑。
4. 三張都做完會多一張 `preview.jpg`（上排原圖、下排疊框版，1600×720）。把它給使用者看，**停下來等同意**；同意後照指令最後印的 `cp`（Mac）或 `Copy-Item`（Windows）那幾行複製進 `shared/template/`，再重跑 build。
5. `--out` 不能是 `shared/template/` 裡面（✖）：背景圖一定要經過使用者同意才放進模板。
```

## 9. REVIEW.md（001 新檔）§3「觀影 pass」要用的原文（插入）

```markdown
### 觀影 pass（交付前整片看一遍）

1. `node shared/template/tools/qc.mjs observe --project projects/<專案>`（只重看一段：加 `--from 60 --to 120`，單位是成片秒數）。
2. 依序看 `work/觀影/sheet-NN.jpg`：每張 6×8 格＝24 秒、每格 0.5 秒；格下是 `時間｜段落編號｜字幕`。找：字幕和畫面對不上、卡片壓臉、文字被切、版面突然空掉、錄影停格。
3. 看 `work/觀影/seam-NN.jpg`：每個段落接縫從前 0.5 秒到後 0.2 秒、每 0.1 秒一格。找：閃一格黑、卡片殘影、跳格。
4. `index.md` 的「靜止區間」是連續 8 秒以上幾乎沒變的地方：對照口播決定要不要補畫面（換段、加標註或情境動畫），刻意留白就寫理由。
5. 每個問題一行：`[P0／P1／P2] m:ss.s（段落編號） 問題｜證據（sheet-02.jpg 第 3 列第 5 格）｜修法`。
```

## 10. U §2 SOP 表（取代第 4、11、12 列）

```markdown
| 4 | 挑情境、配螢幕錄影與圖片，列分鏡表，存成 `work/storyboard.md`；草稿 plan.json build 後截每段完成態貼進去 | `node shared/template/tools/build.mjs --list`；`node shared/template/tools/qc.mjs storyboard --project projects/<專案>` | R1、R2、R6、第 5 節 | **停，等確認** |
| 11 | 測試片段（3–5 秒）→ 看觀影總表 → 完整 render | 2.7；`node shared/template/tools/qc.mjs observe --project projects/<專案> --file <測試片段> --offset <起點>` | | |
| 12 | 觀影總表整片看一遍、驗收，附輸出給使用者 | `node shared/template/tools/qc.mjs observe --project projects/<專案>`；2.8 | REVIEW.md | |
```

U §2.3（分鏡表格式）表下插入一條：

```markdown
- 截圖：草稿 plan.json build 後跑 `node shared/template/tools/qc.mjs storyboard --project projects/<專案>`，把它最後印的 `![s01](storyboard-preview/s01.png)` 那幾行照順序貼進每一段。不要自己算秒數跑 `snapshot --at`。
```

## 11. 兩邊要一致的數字（給 `docs.test.mjs`）

| 數字 | style.md（本檔第 1 節） | 程式常數（`tools/lib/media.mjs`） |
|---|---|---|
| 說明卡字數上限 12 | 「最多 12 字」 | `CALLOUT.maxLen` |
| 完整可讀 1.2 秒、quick 0.8 秒 | 「至少完整停 1.2 秒」「至少完整停 0.8 秒」 | `READ`、`READ_QUICK` |
| 說明卡最短 2.35／1.35 秒 | 「until − at ≥ 2.35 秒」「until − at ≥ 1.35 秒」 | `CALLOUT.ready + READ + CALLOUT.out`、`CALLOUT.quick + READ_QUICK + CALLOUT.out` |
| 紅框同時 2 個 | 「同一時間最多 2 個」 | `MARK.max`（現行） |
| 換目標 0.4 秒 | 「換目標 0.4 秒」 | `PATH.dur` |
| 聚光燈壓暗 35%、至少 2 秒 | 「壓暗 35%」「至少 2 秒」 | `SPOT.alpha`、`2 × SPOT.fade + READ` |
| STEP 字數 12、相鄰 1.65 秒 | 「最多 12 字」「至少隔 1.65 秒」 | `STEP.maxLen`、`0.45 + READ` |
| 箭尖 9 px、最短 2.2 秒、一次一支 | 「build 用 9 px」「至少 2.2 秒」「一次一支」 | `ARROW.gap`、`2 × ARROW.fade + READ`、`ARROW.max` |

## 12. 第 2 輪：分鏡截圖清單怎麼看、小窗檢查（交 001；插入 `auto-edit-storyboard` 步驟 3 與 REVIEW.md 觀影 pass）

### 12.1 storyboard 截圖清單（插入 `auto-edit-storyboard` 步驟 3「`qc.mjs storyboard` 自己算…」之後）

```markdown
- 截圖檔名：一段一張是 `s20.png`；一段多張是 `s20-1.png`、`s20-2.png`…（條列分組、錄影標註各一張）。**只貼這一次印出來的那幾行**：同一段張數變了（例：上一版 s20 是三條的清單 `s20-1.png`～`s20-3.png`，這一版改成情境動畫只截 `s20.png`），工具會清掉同一段的舊檔並印「清掉同一段的舊截圖（這次張數變了）：…」；plan.json 已經沒有的段，舊圖留著並印 ⚠，不用就刪。自己改名的方案圖（`s05-A.png`）不會被動到。
- 每張後面的「為什麼」：`完成態（段尾前 0.6 秒）`／`完成態（退場前 0.1 秒）`／`完成態（動畫停住的最後一刻）`＝這段內容全部出現、還沒退場的那一刻（工具讀動畫時間軸算，03 側邊欄、數字滾動卡會自動往前）；`第 1 條`、`第 2–3 條`＝條列的那一組進場完成之後（進場動畫重疊的幾條算同一組，所以三條可能只有一張）；`…到位`＝錄影標註；`段很短，截中點`；`…（整段都在動，沒有停住的畫面）`＝循環動畫，截圖觀察寫「循環動畫」即可。
- 截圖停在動畫中途（字半透明、卡片在飛）→ 重跑一次 storyboard；還是一樣就在「需要你決定的事」列出段號和秒數，不要自己改秒數跑 `snapshot --at`。
```

### 12.2 子母畫面段沒有講者小窗（插入 `auto-edit-storyboard`「常見錯誤」、`auto-edit-deliver` 驗收表、REVIEW.md 觀影 pass 第 4 條之後）

```markdown
- `qc.mjs storyboard` 或 `qc.mjs final` 印 `✖ s21 是全畫面清單卻沒有講者小窗：work/rough.mp4 在 1:56.14–2:33.51 是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough --project projects/<專案> 照它印的做`：不是版面的問題，不要改 plan.json；照 → 重做初剪，再 build、再截圖。專案有 `素材/聲音/` 的旁白時不會報（全黑本來就是旁白區間）。
- `qc.mjs observe` 的 `work/觀影/index.md`「總表」多一欄「小窗（子母畫面段）」：那張總表裡每個該有小窗的段寫 `有`／`無`／`部分（m:ss.s 起沒有）`（照 `--check --json` 判，不用看圖）。看到 `無`、`部分` 就跑 `qc.mjs final` 看原因。
- 測試片段（`--offset` > 0）的總表：起點在片段之前的段不標 id，並印 `⚠ <id> 在 m:ss.s 就開始了，測試片段不含這段`。要看那段，把 `build --test` 的起點改成它印的秒數。
```

### 12.3 framing「建議」都被排除時（插在第 7.1 節那一條之後）

```markdown
- 每個倍率都會切到手勢或放大超過 3.5 倍時，「建議」是表上倍率最小的那一列（有黑邊時表上最小的是 1.13x 這類，不是 1.00x；1.00x 會露出黑邊）。
```

## 13. 動態 v2 階段 B（交 001；契約 cli-004 §9）

### 13.1 分鏡截圖與拍點表（插在 §12.1 之後；REVIEW.md 觀影 pass 加一條）

> 用了動態 v2 原語的段，`qc.mjs storyboard` 每個拍點各截一張：抽屜抽出後 0.3 秒、焦點抬起（那一站放大發光）後；最後一拍之後畫面沒再變，就不另截完成態（「為什麼」寫「（完成態）」）。漂浮、背景慢拉這類微動不算動畫。`qc.mjs observe` 另出 `work/觀影/beat-NN.jpg`：同一套時刻、從成片抽格，對照分鏡截圖看 render 出來的拍點對不對。

### 13.2 qc final 的字幕與主題（插在 `auto-edit-deliver` 驗收表）

> `qc final` 會量字幕樣式（底板 y 956–1074、字高 71，照剪映）與字幕文字（「，」「。」、< 0.6 秒）；都是 ⚠。樣式 ⚠ 多半是成片在 captions.css 改版前 render 的：重新 build、render；還是 ⚠ 就回報維護者，不要改 `shared/`。`qc-sheet.jpg` 最上面標 `theme: light`／`theme: dark`。

### 13.3 換主色（插在 `auto-edit-style` 步驟 1 的回報）

> `brand.mjs` 多印一行暗色主題跟著換的顏色；印「⚠ 暗色主題標題列的白字對比只有…」時，把這行原文貼給使用者，建議換深一點的主色或這支用亮色主題。暗色底圖是 `shared/template/bg-{fs,side,ch}-dark.jpg`（換背景時亮、暗各三張；暗色版目前沒有 HTML 路線，使用者要換就照 §10 的 mmx 指令重生）。
