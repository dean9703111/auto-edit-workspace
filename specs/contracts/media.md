# 契約：media 段欄位與 `lib/media.mjs` 介面（media）

- **擁有者**：004 media-annotations-qc（`shared/template/tools/lib/media.mjs`、`kit/media.css`）。
- **照它做**：002（`lib/plan.mjs` 呼叫驗證、`build.mjs --list` 印欄位表、`--check --json` 帶標註時間）、001（USAGE §5、R2.5、style.md「螢幕錄影與圖片」）、006（剪輯台存檔時原樣保留這些欄位）。
- **版本**：v1（2026-10-31）。本文件的欄位名、函式簽名、訊息開頭字串改動要先改這份，再改程式。
- **時間**：本文件的「秒」除非特別寫明，都是**完成影片秒數**（`resolvePlan` 的 `it.start`／`it.end` 那條時間軸；沒有 `edit.cuts` 時等於 `rough.mp4` 秒數）。

---

## 1. 座標系（定案）

| 欄位 | 座標系 | 跟不跟運鏡（`moves`／慢推） | 理由 |
|---|---|---|---|
| `moves[].to`、`marks[].box`、`marks[].path[].box`、`lens[].box`、`callouts[].box`、`spot[].box` | **素材原尺寸像素** `[x, y, w, h]` | — | 和現有欄位一致：AI 只學一種座標，全部用 `media.mjs frame --grid` 讀（USAGE §5.4） |
| `arrows[].to` | **素材原尺寸像素** `[x, y]`（一個點） | — | 同上 |
| 紅框 `marks`（含 `path`） | 畫在運鏡層 `#mst-<id>` 裡 | **跟**（框和錄影一起被推近） | 現行做法（`lib/media.mjs:258-271`） |
| `callouts`（框、引線、卡片）、`spot`、`arrows` | 工具在 `at` 那一刻換成 **1920×1080 畫面座標**，畫在運鏡層外面 | **不跟**；所以 `[at, until]` 期間不能有運鏡（✖），有這三種標註的段自動不做慢推 | 卡片的字不能被運鏡放大變糊；TR 做法也是「錄影鏡頭在紅框期間必須靜止」（`TR/rec:L3-4`） |
| `steps`（STEP 膠囊） | 固定在畫面左上 1920×1080 座標 | 不跟 | 位置固定才不會每段跳位（作者 r7 R2「膠囊每段眨一次」，`JY/PS:L95-103`） |
| 卡片、引線、箭頭長度與方向 | 工具算，**不寫在 plan.json** | — | 弱模型只給 `side`／`from` 方向字，不算像素 |

### 1.1 換算公式（`mediaGeometry`、`toStage`、`toScreen`，沿用 `lib/media.mjs:116-121,230`）

素材寬高 `W0×H0`，可見區 `VIEW`：`fit: "contain"` → `[0, 0, 1920, 940]`；`"cover"` → `[0, 0, 1920, 1080]`。

```
k0   = contain ? min(1920/W0, 940/H0) : max(1920/W0, 1080/H0)
dw   = round(W0 × k0)            dh  = round(H0 × k0)
kx   = dw / W0                   ky  = dh / H0
left = round((1920 − dw) / 2)    top = round((viewH − dh) / 2)      viewH = 940（contain）／1080（cover）
stage(x, y, w, h)  = [left + x·kx, top + y·ky, w·kx, h·ky]           ← 沒有運鏡時的畫面座標
screen(rect, cam)  = [cam.x + cam.z·X, cam.y + cam.z·Y, cam.z·W, cam.z·H]   cam＝at 那一刻的運鏡 { z, x, y }（沒有運鏡＝{1,0,0}）
```

**算好的例題**（dev 測試照抄）：

| 素材 | fit | k0 | dw×dh | left, top | kx |
|---|---|---|---|---|---|
| 3452×2016（esim 錄影） | contain | 0.466270 | 1610×940 | 155, 0 | 0.466396 |
| 2560×1600（MacBook 16:10） | contain | 0.5875 | 1504×940 | 208, 0 | 0.5875 |
| 1920×1080 | contain | 0.870370 | 1671×940 | 125, 0 | 0.870313 |

例：2560×1600 錄影、`box: [1700, 200, 400, 80]`、沒有運鏡 → stage `[1206.75, 117.5, 235, 47]` → 紅框矩形 R（線的中心線，離 box 8 px＝內距 6＋半線寬 2；線寬 4，所以線占 box 外 6–10 px）`[1198.75, 109.5, 251, 63]`（右邊 1449.75、下邊 172.5）。

（3452×2016 的 1610×940、左 155，和剪映 esim 的「縮 0.87 貼頂、1609×940、左 156」差 1 px，`01 §2.5`／`P1-6` 的錄影位置現行 `fit: "contain"` 已經做到。）

---

## 2. 欄位 schema

### 2.1 media 段第一層（`MEDIA_KEYS`）

現有：`id type src from to duration anchor in speed fit pip volume enter exit kenburns moves marks lens sfx sfxVolume note`。
**新增**：`callouts spot steps arrows clicks sfxExtra`（`MEDIA_KEYS` 尾端、`note` 前面）。`clicks`／`sfxExtra` 的語意與驗證在 `contracts/sfx.md` §5：時間解析、範圍檢查、配 `click` 音效都由 `plan.mjs` 的音效段落做（所有非 scene 段共用，錯誤原文同 sfx.md §5），`validateMedia` 不重複驗證，避免同一個錯誤印兩次。`marks[]` 的物件多一個鍵 `path`。

`plan.mjs` 的 `KEYS.media = MEDIA_KEYS`（已是 import），新鍵不用 002 改就會被「沒有這個欄位」檢查認得。

### 2.2 時間欄位（全部同一套語法）

`at`／`until`：`"#N"`、`"#Ne"`、`"#N±秒"`、`"#N@詞"`、`"#Ne@詞"`、`"+秒"`（本段起點後）。不能寫絕對秒數（✖，原文照 `cli-005.md` §3.3：`<欄位>：不能寫絕對秒數「74.8」→ 改成 "+3.2"（本段起點後幾秒）或 "#N"（綁字幕句）`，建議值＝寫的秒數 − 本段起點）；要落在這段 `[start, end]` 裡（✖，同 `:152`）。

### 2.3 `callouts`：紅框＋引線＋說明卡

```json
"callouts": [ { "at": "#21", "until": "#22e", "box": [1700, 200, 400, 80], "text": "打開 API 設定", "icon": "settings", "side": "left", "quick": false } ]
```

| 鍵 | 必填 | 型別／範圍 | 預設 | 規則 |
|---|---|---|---|---|
| `at` | ✓ | 時間 | | |
| `until` | | 時間 | 段尾 | `until > at` |
| `box` | ✓ | `[x, y, w, h]` 素材像素 | | 超出素材 ±2 px ✖（同 marks） |
| `text` | ✓ | 字串，1–12 字 | | 字數＝全形 1、半形 0.5（同 `visibleLen`）；> 12 ✖；不能有換行或 `//` |
| `icon` | | `kit/icons.json` 的名稱、`"none"` | 不放 | 找不到 ✖，附 3 個相近名稱 |
| `side` | | `"right"`／`"left"`／`"top"`／`"bottom"` | 自動 | 卡片在框的哪一側；不寫＝依序試 right → left → bottom → top，第一個放得下的 |
| `quick` | | `true`／`false` | `false` | `true`＝框、線、卡同時淡入 0.25 s（短句用） |

**幾何**（畫面座標；`R`＝紅框矩形，見 §1.1 例題）

| 項目 | 值 | 出處 |
|---|---|---|
| 紅框 | 實線 4 px `--sc-warn`、圓角 6、內距 6（外緣離 box 8 px） | 現行 marks（`lib/media.mjs:28`、style.md 紅框） |
| 卡片 | 高 96 px（border-box）、圓角 16、底 `--sc-card`、2 px `--sc-card-line` 框；字 40 px／行高 56／700、`--sc-ink`、不換行；有圖示時：左內距 14＋圖示圓 64（主色底、`--brand-ink` 線條 34 px）＋間距 20、右內距 32；沒圖示：左右各 32 | `TR/rec` `rec-overlay.css:113-126` |
| 卡片寬（估算，用來檢查放不放得下） | `4 + (icon ? 14 + 64 + 20 : 32) + 字寬 + 32`；字寬＝全形 40 px、半形 24 px | 建議初值（半形取 0.6 em 偏保守） |
| 卡片位置 | right：左緣＝`R.右 + 56`、垂直置中對 R；left：右緣＝`R.左 − 56`（CSS `right` 錨定）；bottom：上緣＝`R.下 + 40`、水平置中（CSS `translate: -50% 0`）；top：下緣＝`R.上 − 40` | 建議初值 |
| 夾回安全區 | 只沿著邊的方向平移（right／left 調 top、top／bottom 調中心 x），讓卡片落在安全區 **x 40–1880、y 40–900** | x 40–1880：`TR/rec:L15`；y 900＝字幕區 920（R4.1）− 20 |
| 引線 | 3 px `--sc-warn`；框端 r 5 的紅點。卡片和框在該方向重疊 ≥ 16 px（各縮 8）→ 直線，取重疊區中點；否則一個直角（框邊中點 → 轉角 → 卡片近邊中點） | `TR/rec:L164-191`、`rec-overlay.css:106` |

**放不下**：卡片（估算寬）超出安全區、壓到右下角子母畫面禁入區 `PIP_ZONE [1424, 581, 1888, 951]`（`pipAt` 在 `at`、中點、`until − 0.01` 任一為真時才算）、壓到同時出現的 STEP 膠囊、同時出現的其他 callout 卡片或框、同時出現的 marks 紅框（矩形外擴 2 px）。

**時序**（秒，相對 `at`）

| 模式 | 紅框 | 引線＋紅點 | 卡片 | 到位 `ready` | 退場 |
|---|---|---|---|---|---|
| 一般 | 描線 0–0.4（power2.inOut） | 0.3 起描 0.25 | 0.45 起淡入＋從離框 16 px 外滑到定位 0.4（power2.out） | `at + 0.85` | `until − 0.3` 起三者一起淡出 0.3 |
| `quick` | 0 起淡入 0.25 | 同左 | 同左（不滑） | `at + 0.25` | 同上 |

出處：`rec-overlay.css:97-100`（檔頭時序）、`TR/rec:L195-208`；紅框描線沿用工作區 0.4（`MARK.draw`）。

**完整可讀**＝`(until − 0.3) − ready`：一般 **≥ 1.2 s**、`quick` **≥ 0.8 s**（主代理裁決「標註可讀時間一律 1.2 s，quick 0.8 s」，`specs/README.md`）→ 一般模式 `until − at ≥ 2.35 s`、quick `≥ 1.35 s`。

### 2.4 `spot`：聚光燈（壓暗，只留一個亮區）

```json
"spot": [ { "at": "#21", "until": "#22e", "box": [1700, 200, 400, 80] } ]
```

| 鍵 | 必填 | 型別 | 預設 | 規則 |
|---|---|---|---|---|
| `at` | ✓ | 時間 | | |
| `until` | | 時間 | 段尾 | `until − at ≥ 2.0 s`（淡入 0.4＋停 1.2＋淡出 0.4） |
| `box` | ✓ | `[x, y, w, h]` 素材像素 | | 亮區＝box 外擴 8 px、圓角 12 |

- 壓暗：整個 media 層蓋黑色 `fill-opacity 0.35`（`TR/rec:L21`、`:121`）；子母畫面與字幕在 media 層外面，不會被壓暗。
- 時序：`at` 淡入 0.4、`until − 0.4` 淡出 0.4（`power1.inOut`，`TR/rec:L124-125`）；`ready = at + 0.4`。
- 層級：壓暗在紅框、引線、卡片、箭頭、STEP 膠囊**下面**（`TR/rec:L21`）。

### 2.5 `steps`：STEP 膠囊（左上角步驟標籤）

```json
"steps": [ { "at": "#20", "text": "新增專案" }, { "at": "#23", "text": "連接 Gmail" } ]
```

| 鍵 | 必填 | 型別 | 規則 |
|---|---|---|---|
| `at` | ✓ | 時間 | 依時間先後排列（亂序 ✖）；相鄰兩步 `≥ 1.65 s`（換步 0.45＋停 1.2）；最後一步離段尾 `≥ 1.65 s` |
| `text` | ✓ | 字串 1–12 字 | 同 callouts 字數算法 |

- **編號**：`STEP N` 的 N 由工具算：整份 plan.json 依段落起點順序累加；**和前面任何一步同字的沿用那個號碼**（不加 1）。
- **接續不眨**：這段第一步 `at` 在段起點 0.1 s 內、前一個 media 段剛好接上（前段 `end` 和這段 `start` 差 ≤ 0.1 s）、而且前段最後一步同字 → 這段的膠囊第一格就在，不播進場（`carry: true`）。
- 幾何（畫面座標）：膠囊左 48、上 40、高 80、全圓角、底 `--sc-card`、2 px `--sc-card-line`；每一步＝號碼圓 56（主色底、`--brand-ink`、32 px／700）＋間距 18＋字 40 px／行高 56／700；左內距 10、右 30。寬度＝這段最寬那一步（CSS grid 疊在同一格，自動取最寬，不跳寬）。估算寬＝`字寬 + 118`。出處 `TR/rec` `rec-overlay.css:12-41`、`TR/rec:L44-61`（寬＝`2 + 10 + 最寬 + 30 + 2`，`:53`）。
- 時序：第一步（非接續）整顆膠囊 `at` 淡入＋x −24→0 0.5 s（power2.out，`TR/rec:L56`）；換步：舊的 `at` 淡出 0.25、新的 `at + 0.1` 淡入 0.35（`TR/rec:L59-60`）；`ready`＝第一步 `at + 0.5`、換步 `at + 0.45`、接續 `at`。膠囊跟 media 層一起退場。
- 碰撞（⚠）：膠囊（`[48, 40, 48 + 估算寬, 120]`）和同時出現的 callout 框／卡片、`spot` 亮區、箭頭、紅框外緣重疊。

### 2.6 `arrows`：箭頭

```json
"arrows": [ { "at": "#24", "until": "#24e", "to": [600, 900], "from": "ne" } ]
```

| 鍵 | 必填 | 型別 | 預設 | 規則 |
|---|---|---|---|---|
| `at` | ✓ | 時間 | | |
| `until` | | 時間 | `at + 3` 秒 | `until − at ≥ 2.2 s`（淡入 0.5＋停 1.2＋淡出 0.5） |
| `to` | ✓ | `[x, y]` 素材像素 | | 箭頭要指的那個點（目標的邊）；超出素材 ✖ |
| `from` | | `"n" "ne" "e" "se" "s" "sw" "w" "nw"` | 自動 | 箭尾在箭尖的哪個方向（`"ne"`＝箭尾在右上、箭頭往左下指） |

- 幾何（畫面座標）：箭尖＝`to` 的畫面點往箭尾方向退 **9 px**（作者規則 6–12 px，`JY/WF:L60`）；箭身直線 4 px（G21）、長 120 px（放不下再試 96 px）、箭頭三角形長 22、寬 22，顏色 `--sc-warn`。長度 120／96、三角 22 是建議初值（作者剪映貼紙 scale 0.283→0.25→0.22，`JY/WF:L60`）。
- 自動方向的試放順序：寫了 `from` 就先試它；不寫依序 `ne nw se sw e w n s`；每個方向先試 120 再試 96。
- **放不下**：箭頭形狀的取樣點（箭尖、三角形兩角、箭身每 2 px 一點、左右各 2 px；紅框線環只有 4 px 寬，取樣要比它密）任一點超出安全區 x 40–1880、y 40–900，或落在：子母畫面禁入區（有子母畫面時）、同時出現的 callout 卡片或 STEP 膠囊（各外擴 4 px）、同時出現的紅框線上（marks、callouts 的框：矩形往外 2 px 與往內 2 px 之間）。目標已經被紅框框住時，箭頭一定會穿過框線 → 放不下（作者做法是箭尖改指紅框外緣，`JY/WF:L64`）。
- 時序：`at` 淡入 0.5＋沿箭身方向從 12 px 外滑向目標；`until − 0.5` 淡出 0.5（`01 P2-4`「淡入淡出 0.5」）；`ready = at + 0.5`。
- 同一時間最多 **1** 支（✖，建議初值）。放大鏡期間的箭頭拿掉（⚠，`JY/WF:L61`「放大鏡窗內的箭頭刪」）；碰到 HF 卡片、膠囊、紅框的像素不行（`JY/WF:L64`）。

### 2.7 `marks[].path`：紅框跟著錄影捲動

```json
"marks": [ { "at": "#21", "until": "#23e", "box": [441, 310, 249, 428],
             "path": [ { "at": "#22", "box": [498, 759, 450, 52] }, { "at": "#23+0.4", "box": [190, 874, 186, 44], "dur": 0.6 } ] } ]
```

| 鍵 | 必填 | 型別 | 預設 | 規則 |
|---|---|---|---|---|
| `path[].at` | ✓ | 時間 | | `≥ 紅框 at + 0.4`（描完才動）；`≥ 前一步 at + dur`；`at + dur ≤ until − 0.3`（淡出前到位） |
| `path[].box` | ✓ | `[x, y, w, h]` 素材像素 | | 同 marks.box |
| `path[].dur` | | 0.2–2 秒 | 0.4 | 換目標用 0.4、跟捲動用錄影捲動的秒數（`ES/seg31:L86` 0.4、`:108-109` 0.6） |

- 實作：同一個 `<rect>` 用 GSAP `attr: { x, y, width, height }` 補間（`power2.inOut`），框在運鏡層裡，有運鏡也貼得住。
- 每一步的終點框照 marks 規則檢查（壓子母畫面、字幕區、出畫 ⚠）；同時紅框數（marks＋callouts）≤ 2 不變。
- `ready`＝每一步 `at + dur`。

### 2.8 跨欄位規則

| 規則 | 等級 | 出處 |
|---|---|---|
| 同一時間紅框（marks＋callouts 的框）≤ 2 | ✖ | style.md 紅框「同一時間最多 2 個」 |
| `callouts`／`spot`／`arrows` 的 `[at, until]` 和任何 `moves` 的 `[at, at + dur]` 重疊 | ✖ | §1 座標系 |
| 有 `callouts`／`spot`／`arrows` 的段：不做慢推（`kenburns` 預設值改 false；寫了 `true` ⚠ 並忽略） | ⚠／說明 | 同上 |
| `spot` 同時 ≤ 1；`spot` 和 `lens` 時間重疊 | ✖ | 兩層壓暗 |
| `arrows` 同時 ≤ 1 | ✖ | 建議初值 |
| `callouts` 和 `lens` 重疊（卡片會被放大鏡壓暗） | ⚠ | |
| `callouts`／`spot`／`arrows` 期間有接點（`edit.cuts` 把錄影切開，`m.pieces` 的切點落在 `(at, until)`） | ⚠ | 錄影會跳，框對不上 |

---

## 3. 錯誤與提醒訊息（原文開頭；`lib/media.mjs` 只加 `${what}` 之後的字，前綴 `[m01 media]` 由 plan.mjs 加）

格式一律 `<欄位>：<哪裡不對> → <改法>`（憲法 III-4）。`fmt(t)`＝`m:ss.ss`（現行 `lib/media.mjs:35`）。

| 代號 | 等級 | 原文 |
|---|---|---|
| A0 | ✖ | `${k} 要寫成陣列（[{ … }, { … }]）`（k＝moves marks lens callouts spot steps arrows，沿用 `:100`） |
| C1 | ✖ | `callouts[i].text 要寫 1–12 字的說明（名詞或一句重點），現在是 ${JSON} → 補上畫面上要強調的名詞或動作` |
| C2 | ✖ | `callouts[i].text「${text}」有 ${n} 字（上限 12）→ 縮成名詞或一句重點，細節交給講解` |
| C3 | ✖ | `callouts[i].icon：找不到圖示「${v}」（kit/icons.json；相近：${a}、${b}、${c}）→ 改成相近的名稱，或拿掉 icon` |
| C4 | ✖ | `callouts[i].side 只能是 "right"、"left"、"top"、"bottom"（不寫＝自動挑放得下的那一邊），現在是 ${JSON} → 改成這四個之一，或刪掉 side` |
| C5 | ✖ | `callouts[i].quick 只能寫 true（框、線、卡一起淡入 0.25 秒，給短句用）或 false → 改成 true 或 false（不加引號）` |
| C6 | ✖ | `callouts[i] 完整可讀只有 ${r}s（要 ≥ 1.2s：卡片在 at＋0.85s 到位、until 前 0.3s 開始淡出）→ until 延到 ${fmt(need)} 之後，或寫 "quick": true`；quick 時：`（要 ≥ 0.8s：quick 在 at＋0.25s 到位、until 前 0.3s 開始淡出）→ until 延到 ${fmt(need)} 之後` |
| C7 | ✖ | `callouts[i] 的卡片放 ${side} 會${原因} → 改 "side": "${alt}"（放得下）`；四邊都不行：`→ 四邊都放不下：text 縮短、拿掉 icon，或先用 moves 把那一塊推到畫面中間（運鏡要在標註之前結束）` |
| C7 原因 | | `超出安全區（x 40–1880、y 40–900；卡片 ${x1}–${x2}, ${y1}–${y2}）`／`壓到右下角子母畫面`／`壓到 STEP 膠囊`／`壓到 callouts[j]`／`壓到 marks[j] 的紅框`；R6、R7 另有 `壓到紅框`（線上） |
| C8 | ✖ | `${what}（${fmt(at)}–${fmt(until)}）期間有運鏡 moves[j] → 標註期間畫面不能動：運鏡移到標註之前結束，或標註移到運鏡之後`（what＝callouts[i]／spot[i]／arrows[i]） |
| C9 | ✖ | `marks：${fmt(t)} 同時有 ${n} 個紅框（最多 2 個）；callouts 的框也算在內 → 位置相近的合成一個大框，或錯開 at／until`（只有 marks 時沿用現行原文，不加「；callouts…」） |
| C10 | ⚠ | `${what} 期間錄影有接點（${fmt(t)}，edit.cuts 切開），畫面會跳、框可能對不上 → at／until 避開這個時間` |
| C11 | ✖ | `${what}.box 在畫面外（fit "cover" 裁掉了）→ 改 fit "contain"，或框畫面上看得到的地方` |
| C12 | ⚠ | `callouts[i] 和放大鏡 lens[j] 同時出現，卡片會被壓暗 → 錯開時間` |
| S1 | ✖ | `spot[i] 只有 ${d}s（要 ≥ 2s：淡入 0.4＋停 1.2＋淡出 0.4）→ until 延到 ${fmt(at + 2)} 之後` |
| S2 | ✖ | `spot[i] 和 spot[j] 時間重疊 → 一次只放一個聚光燈，錯開 at／until` |
| S3 | ✖ | `spot[i] 和放大鏡 lens[j] 時間重疊（會壓暗兩層）→ 錯開，或只留一個` |
| T1 | ✖ | `steps[i].text 要寫 1–12 字（這一步在做什麼），現在是 ${JSON} → 補上這一步的動作` |
| T2 | ✖ | `steps[i].text「${text}」有 ${n} 字（上限 12）→ 縮短` |
| T3 | ✖ | `steps[i].at（${fmt}）要晚於 steps[i−1]（${fmt}）→ 照時間先後排列` |
| T4 | ✖ | `steps[i] 和前一步只差 ${d}s（要 ≥ 1.65s：換步 0.45＋停 1.2）→ 合併成一步，或把 at 往後挪到 ${fmt(need)} 之後` |
| T5 | ✖ | `steps[i] 在段尾前 ${d}s 才出現（要 ≥ 1.65s）→ 提早 at，或移到下一段` |
| T6 | ⚠ | `STEP 膠囊（x 48–${x2}、y 40–120）在 ${fmt(t)} 壓到 ${what} → 換 side／from、用 moves 把那一塊往下推，或錯開時間` |
| R1 | ✖ | `arrows[i].to 要寫 [x, y]（箭頭要指的點，素材本身的像素座標，用 media.mjs frame --grid 讀），現在是 ${JSON} → 改成兩個數字的陣列` |
| R2 | ✖ | `arrows[i].to [${x}, ${y}] 超出素材範圍 ${W}×${H} → 座標是素材原尺寸的像素（不是 1920×1080 的畫面座標），用 media.mjs frame --grid 重讀` |
| R3 | ✖ | `arrows[i].from 只能是 "n"、"ne"、"e"、"se"、"s"、"sw"、"w"、"nw"（箭尾在箭尖的哪個方向；不寫＝自動挑），現在是 ${JSON} → 改成這 8 個之一，或刪掉 from` |
| R4 | ✖ | `arrows[i] 只有 ${d}s（要 ≥ 2.2s：淡入 0.5＋停 1.2＋淡出 0.5）→ until 延到 ${fmt(at + 2.2)} 之後，或不寫 until（預設 at＋3 秒）` |
| R5 | ✖ | `arrows[i] 和 arrows[j] 時間重疊 → 一次只放一支箭頭，錯開 at／until` |
| R6 | ✖ | `arrows[i] 從 "${from}" 方向放會${原因} → 改 "from": "${alt}"（放得下）`（原因同 C7，多一個 `壓到紅框`） |
| R7 | ⚠ | `arrows[i] 找不到不擋字的位置（${原因們}），已拿掉（作者規則：找不到位置就不放）→ 換一個 to（目標已有紅框時改指紅框外緣），或只用紅框 marks` |
| R8 | ⚠ | `arrows[i] 在放大鏡 lens[j] 期間，已拿掉（放大鏡會蓋住）` |
| P1 | ✖ | `marks[i].path 要寫成陣列 [{ "at", "box": [x,y,w,h], "dur" }] → 一步一個物件，照時間先後排` |
| P2 | ✖ | `marks[i].path[k].at（${fmt}）要在紅框描完（${fmt(at + 0.4)}）之後、${fmt(until − 0.3 − dur)} 之前到 → 改 at，或把 marks[i].until 往後延` |
| P3 | ✖ | `marks[i].path[k].at（${fmt}）在上一次移動還沒結束（${fmt}）時開始 → 往後挪，或把上一次的 dur 改短` |
| P4 | ✖ | `marks[i].path[k].dur 要是 0.2–2 的秒數（預設 0.4；跟捲動用錄影捲動的秒數），現在是 ${JSON} → 改成這個範圍的秒數，或刪掉 dur` |
| P5 | ⚠ | 每一步終點框：沿用 marks 的三則 ⚠（`:267-269`），`marks[i]` 換成 `marks[i].path[k]` |
| K1 | ⚠ | `kenburns：有 callouts／spot／arrows 時不做慢推（標註要對準不動的畫面），已忽略` |
| X1 | ✖ | `${what}.${key}：沒有這個欄位（可用：…）`（沿用 `keysOk`；callouts 可用 `at、until、box、text、icon、side、quick`；spot `at、until、box`；steps `at、text`；arrows `at、until、to、from`；marks `at、until、box、path`；path `at、box、dur`） |

`box` 的格式與範圍錯誤沿用現行 `boxOf` 原文（`:157`、`:162`），只換 `${what}`。callouts／spot／arrows 的「until 要晚於 at」沿用 marks 原文再加 `→ until 往後延，或不寫（預設到段尾）`（arrows：`預設 at＋3 秒`）。X1 與 `boxOf` 是 marks／moves／lens 共用的舊訊息，FR-014 不改，所以不受 FR-013「全部帶 →」約束。

---

## 4. `lib/media.mjs` 匯出（給 002 的介面）

| 匯出 | 簽名 | 誰呼叫 | 說明 |
|---|---|---|---|
| `MEDIA_KEYS` | `string[]` | plan.mjs `KEYS.media` | 多 4 個鍵（§2.1） |
| `MEDIA_FIELDS` | `[欄位, 值, 預設, 說明][]` | build.mjs `--list`、`--list --json` | **從 build.mjs 搬來**（§5），單一真相 |
| `checkMediaSeg` | `(seg, { projectDir, probe, err, warn }) → media \| null` | plan.mjs 第一輪 | 簽名不變；多做：7 個陣列欄位的「要是陣列」檢查、`kenburns` 預設值（有 callouts／spot／arrows 時 false） |
| `newStepState` | `() → { n: 0, byText: Map, last: null }` | plan.mjs | 每次 `resolvePlan` 建一個，依段落起點順序傳給每個 media 段（STEP 編號與接續） |
| `validateMedia` | `(it, { cues, tm, pipAt, icons, steps, canvas, err, warn }) → { summary, json }` | plan.mjs 第二輪（時間定案後、`pipPieces` 算好後） | **取代 `resolveMedia`**；見 §4.1。`canvas`（009）：`lib/canvas.mjs` 的畫布，plan.mjs 傳 `resolvePlan` 的 `C`（或設 `it.canvas`）；沒傳＝橫式 |
| `resolveMedia` | 同 `validateMedia` | — | 過渡期別名（002 換好之前 build 照常能跑）；整合完成後刪掉 |
| `mediaJobs`、`mediaParts` | 簽名不變 | build.mjs／main.mjs | `mediaParts` 多輸出標註的 HTML 與時間軸（§6） |
| `ENTER`、`EXIT`、`TRANSITIONS`、`VIEW`、`PIP_ZONE`、`MEDIA_DIRS` | 不變 | | |
| `mediaFrame` | `(canvas, { panel }) → F` | validateMedia 內部（寫進 `it.media.frame`，`mediaParts` 讀） | 009：這段的可見區、安全區、避讓區、STEP 位置；`canvas` 是 null 或橫式時回傳橫式常數（輸出逐位元組不變）；直式 `panel`＝這段有沒有講者面板（`pipAt` 取段首、中、尾三點） |
| 測試用（不是 002 的介面） | `mediaGeometry(info, fit, F)`、`toStage(G, box)`、`toScreen(rect, cam)`、`cardWidth(text, hasIcon)`、`placeCallout(opts)`、`placeArrow(opts)` | `dev/tests/media.test.mjs` | 純函式，§1.1 例題直接測 |

### 4.1 `validateMedia(it, ctx)`

輸入：

| 參數 | 內容 |
|---|---|
| `it` | plan.mjs 的 item：`it.media`（`checkMediaSeg` 的回傳）、`it.seg`、`it.id`、`it.start`／`it.end`（完成影片秒）、`it.rough0`（選填，現行就有） |
| `ctx.cues` | 完成影片秒數的字幕（和現在傳給 `resolveMedia` 的同一份） |
| `ctx.tm` | `timeMap`（現行就有） |
| `ctx.pipAt` | `(t) → boolean`，這段在 `t` 有沒有子母畫面（現行就有） |
| `ctx.icons` | `loadIcons()` 的 `{ names, get(name) }`（**新**；plan.mjs 的 `resolvePlan` 已經有 `icons`） |
| `ctx.steps` | `newStepState()` 的物件（**新**；不給時每段自己從 1 編號、不接續，給過渡期用） |
| `ctx.canvas` | `canvasOf(format)`（**009**；直式時可見區、安全區、避讓區、DOM 尺寸照畫布，見 spec FR-080–FR-082）。沒給時看 `it.canvas`，都沒有＝橫式 |
| `ctx.err`／`ctx.warn` | 同現行 |

副作用：照現行寫 `it.media.geo`、`pieces`、`cams`、`kb`、`marks`、`lenses`，**新增** `it.media.callouts`、`spots`、`steps`、`arrows`（給 `mediaParts`），`marks[].path`。

回傳：

```js
{
  summary: '運鏡 1、紅框 1（跟捲動 2 次）、標註 2、聚光燈 1、STEP 2（第 3–4 步）、箭頭 1、放大鏡 1；有標註，不做慢推',
  json: {   // 全部完成影片秒數、r3；每個鍵都在，沒有就是 []；i＝plan.json 裡的原始索引（被拿掉的不列，所以 i 可能跳號）
    marks:    [ { i: 0, at: 63.2, until: 66.0, ready: 63.6, path: [ { k: 0, at: 64.5, ready: 64.9 } ] } ],
    callouts: [ { i: 0, at: 63.2, until: 66.5, ready: 64.05, side: 'left', text: '打開 API 設定' } ],
    spot:     [ { i: 0, at: 63.2, until: 66.5, ready: 63.6 } ],
    steps:    [ { i: 0, at: 62.0, ready: 62.5, n: 3, text: '新增專案', carry: false } ],
    arrows:   [ { i: 1, at: 70.1, until: 73.1, ready: 70.6, from: 'ne' } ],   // arrows[0] 被拿掉了，不列
    lens:     [ { i: 0, at: 75.0, until: 78.0, ready: 75.88 } ],
  },
}
```

直式（009 FR-082）而且錄影寬 > 高時，`json` 多一個鍵 `view: { scale, moves }`：`scale`＝錄影顯示寬 ÷ 素材寬（r3，1920 寬放進 1080 寬＝0.563），`moves`＝運鏡數；`qc.mjs storyboard` 用它判「介面字太小」（cli-004 §10）。橫式不加這個鍵。

`summary` 規則：依序 `運鏡 N`、`慢推`、`紅框 N`（有 path 加 `（跟捲動 K 次）`）、`標註 N`、`聚光燈 N`、`STEP N（第 a–b 步）`、`箭頭 N`（有拿掉的加 `（拿掉 K）`）、`放大鏡 N`，用「、」接；因標註關掉慢推時尾巴加 `；有標註，不做慢推`。全部沒有時是空字串。

---

## 5. `--list` 的 media 表（`MEDIA_FIELDS`，原文）

現有 13 列不動；`marks` 那列改寫；`lens` 之後插入 4 列；`sfx` 之前插入 `clicks` 一列：

| 欄位 | 值 | 預設 | 說明 |
|---|---|---|---|
| marks | `[{ "at", "until", "box": [x,y,w,h], "path": [{ "at", "box", "dur" }] }]` | — | 紅框：實線 4px、描線進場；同時最多 2 個（callouts 的框也算）、停留 < 0.5s 的拿掉、最後一框多停 1s；until 不寫＝到段尾。path＝錄影捲動時框跟著移（dur 預設 0.4 秒） |
| callouts | `[{ "at", "until", "box": [x,y,w,h], "text", "icon", "side", "quick" }]` | — | 標註：紅框＋引線＋說明卡（text 1–12 字、icon 選填）；side 不寫＝自動挑放得下的那邊；完整可讀 ≥ 1.2s（quick ≥ 0.8s）；期間不能有運鏡 |
| spot | `[{ "at", "until", "box": [x,y,w,h] }]` | — | 聚光燈：其他地方壓暗 35%，只留框的地方；至少 2 秒、一次一個、不和放大鏡同時 |
| steps | `[{ "at", "text" }]` | — | 左上角 STEP 膠囊（text 1–12 字）；號碼自動累加，同字沿用；相鄰兩步 ≥ 1.65 秒 |
| arrows | `[{ "at", "until", "to": [x,y], "from" }]` | — | 箭頭：箭尖離 to 9px，from＝箭尾方向（n／ne／e／se／s／sw／w／nw，不寫＝自動）；放不下就拿掉；一次一支、至少 2.2 秒，until 不寫＝at＋3 秒 |

| clicks | `["#21@安裝", "+3.2"]` | — | 錄影裡看得到游標按下的時間，一下配一顆 click 附加音效（不受 3 秒規則）；時間寫法同 at，要落在這段裡；"sfxExtra": false 會一起關掉 |

`--list --json` 的 `media.fields` 照同一個陣列產生（`{ field, values, default, note }`），`media.keys` 多 6 個鍵。

---

## 6. 產生的 DOM、CSS 類別與時間軸（`mediaParts`、`kit/media.css`）

| 元素 | id／class | 位置 | 計時 |
|---|---|---|---|
| 面板（動態 v2） | `div#mgr-<id>.mgrow`，大小＝錄影可見區（`left/top/width/height`）；運鏡層 `#mst-<id>` 在裡面，inline `left:−x; top:−y` 抵回畫面座標 | `#el-<id>` 裡、`#mbg-<id>` 之後 | 不計時；從講者進來（`enterFx` fade）時 `P.grow` 從 `pip` 區域長出：段起點 + 0.3、kit 預設 0.8 s（design-system §5） |
| 焦點容器（動態 v2） | 紅框 `g#fo-<紅框 id>`、說明卡 `g#fo-mc-<id>-<k>`（框＋引線）與 `div#fo-mcc-<id>-<k>.mfo`（卡）、箭頭 `g#fo-mar-<id>-<k>` | 各包住原本的標註 | 不計時；只有 `P.dim` 動它的 opacity（§7：後一個出現時前面還留 ≥ 0.4 s 的壓到 0.5；最後一個出現後 min(+2.6、段尾 −1.4、它收掉 −0.3) 回 1；`focusPlan` 匯出） |
| 紅框（含 path） | 現行 `#mmk-<id>-<n>`／`.mmark` | 運鏡層 `#mst-<id>` 的 `svg.mmarks` 裡 | 現行 |
| 標註 SVG | `svg#man-<id>.clip.mann`（1920×1080） | `#el-<id>` 裡、`#mst-<id>` 之後 | `data-start`＝段起點、`data-duration`＝段長（同 marks） |
| └ 聚光燈 | `g#msp-<id>-<k>.mspot`（mask `#mspm-<id>-<k>`、`rect.mspot-dim`） | 最下層 | |
| └ callout 框 | `rect#mcb-<id>-<k>.mcbox`（`pathLength="1"`） | | |
| └ 引線 | `g#mcl-<id>-<k>.mclead`（`path` `pathLength="1"`＋`circle` r 5） | | |
| └ 箭頭 | `g#mar-<id>-<k>.marrow`（`line`＋`polygon`） | | |
| 卡片層 | `div#mcd-<id>.clip.mcards` | 標註 SVG 之後 | 同上 |
| └ STEP 膠囊 | `div#msteps-<id>.msteps` > `div#mstep-<id>-<k>.mstep`（`span.mnum`＋`span.mtxt`） | | |
| └ 說明卡 | `div#mcc-<id>-<k>.mcard.mcard--<side>`（`span.mic`＋`span.mtxt`） | | |
| 放大鏡 | 現行 `.mlz` | 最上層 | 現行 |

- 兩個計時容器都直接放在 `#el-<id>` 底下（不巢狀在別的計時元素裡，`lib/media.mjs:406` 的 lint 理由），加 `data-layout-allow-overlap`。
- 只有用到的才產生（沒有標註的段 HTML 和現在逐字相同，現有測試不用改）。
- 圖示用 `icons.get(name)` 的內嵌 SVG（已帶 `class="stroke-draw"`），放在 `span.mic` 裡。
- `kit/media.js` 不用改；`main.mjs` 的 `kit/media.css` 連結條件（`hasMedia`）不用改。

時間軸原文（`sh(t)`＝`t − off`，`--test` 起點平移；`lim` 之後才開始的標註不產生）：

```js
// callout k（一般）
tl.fromTo('#mcb-m01-1', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: 0.4, ease: 'power2.inOut' }, AT);
tl.set('#mcb-m01-1', { strokeDasharray: 'none' }, AT+0.4);
tl.set('#mcl-m01-1 circle', { opacity: 1 }, AT+0.3);
tl.fromTo('#mcl-m01-1 path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: 0.25, ease: 'power1.inOut' }, AT+0.3);
tl.set('#mcl-m01-1 path', { strokeDasharray: 'none' }, AT+0.55);
tl.fromTo('#mcc-m01-1', { opacity: 0, x: DX, y: DY }, { opacity: 1, x: 0, y: 0, duration: 0.4, ease: 'power2.out' }, AT+0.45);   // DX／DY：right +16、left −16、bottom y +16、top y −16
tl.fromTo('#mcb-m01-1, #mcl-m01-1, #mcc-m01-1', { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'sine.in', immediateRender: false }, UNTIL-0.3);
// callout k（quick）：前五行換成
tl.set('#mcb-m01-1, #mcl-m01-1 path', { strokeDasharray: 'none' }, AT);
tl.fromTo('#mcb-m01-1, #mcl-m01-1, #mcc-m01-1', { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' }, AT);
tl.set('#mcl-m01-1 circle', { opacity: 1 }, AT);
// spot k
tl.fromTo('#msp-m01-1', { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.inOut' }, AT);
tl.fromTo('#msp-m01-1', { opacity: 1 }, { opacity: 0, duration: 0.4, ease: 'power1.inOut', immediateRender: false }, UNTIL-0.4);
// arrow k（UX、UY＝箭尾方向單位向量）
tl.fromTo('#mar-m01-1', { opacity: 0, x: 12*UX, y: 12*UY }, { opacity: 1, x: 0, y: 0, duration: 0.5, ease: 'power2.out' }, AT);
tl.fromTo('#mar-m01-1', { opacity: 1 }, { opacity: 0, duration: 0.5, ease: 'sine.in', immediateRender: false }, UNTIL-0.5);
// steps（第一步非接續；接續時第一行換成 tl.set('#msteps-m01', { opacity: 1 }, S) 並 tl.set 第一步 opacity 1）
tl.fromTo('#msteps-m01', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, AT1);
tl.set('#mstep-m01-1', { opacity: 1 }, AT1);
tl.fromTo('#mstep-m01-1', { opacity: 1 }, { opacity: 0, duration: 0.25, ease: 'power1.in', immediateRender: false }, AT2);
tl.fromTo('#mstep-m01-2', { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' }, AT2+0.1);
// marks[i].path[k]
tl.fromTo('#mmk-m01-1', { attr: { x: X0, y: Y0, width: W0, height: H0 } }, { attr: { x: X1, y: Y1, width: W1, height: H1 }, duration: DUR, ease: 'power2.inOut', immediateRender: false }, AT);
```

CSS（`kit/media.css` 新增；顏色一律用 kit 變數，不寫死色碼，`#000000` 例外同現行 `.mdim`）：

| 類別 | 樣式 |
|---|---|
| `.mann` | `position:absolute; left:0; top:0; width:1920px; height:1080px; overflow:visible; pointer-events:none` |
| `.mspot` | `opacity:0`；`.mspot-dim { fill:#000000; fill-opacity:0.35 }` |
| `.mcbox` | 同 `.mmark`（`fill:none; stroke:var(--sc-warn); stroke-width:4px; stroke-linejoin:round; stroke-dasharray:1; stroke-dashoffset:1`） |
| `.mclead path` | `fill:none; stroke:var(--sc-warn); stroke-width:3px; stroke-dasharray:1; stroke-dashoffset:1`；`.mclead circle { fill:var(--sc-warn); opacity:0 }` |
| `.marrow` | `opacity:0`；`line { stroke:var(--sc-warn); stroke-width:4px }`；`polygon { fill:var(--sc-warn) }` |
| `.mcards` | `position:absolute; inset:0; pointer-events:none` |
| `.mcard` | `position:absolute; box-sizing:border-box; height:96px; display:flex; align-items:center; gap:20px; padding:0 32px 0 14px; border-radius:16px; background:var(--sc-card); border:2px solid var(--sc-card-line); color:var(--sc-ink); font:700 40px/56px var(--sc-font); white-space:nowrap; opacity:0`；沒圖示 `.mcard--plain { padding:0 32px }`；`.mcard--top, .mcard--bottom { translate:-50% 0 }` |
| `.mcard .mic` | `flex:none; width:64px; height:64px; border-radius:50%; background:var(--brand); color:var(--brand-ink); display:grid; place-items:center`；`svg { width:34px; height:34px }` |
| `.msteps` | `position:absolute; left:48px; top:40px; height:80px; box-sizing:border-box; display:grid; padding:0 30px 0 10px; border-radius:999px; background:var(--sc-card); border:2px solid var(--sc-card-line); opacity:0` |
| `.mstep` | `grid-area:1 / 1; display:flex; align-items:center; gap:18px; height:76px; white-space:nowrap; opacity:0` |
| `.mstep .mnum` | `flex:none; width:56px; height:56px; border-radius:50%; background:var(--brand); color:var(--brand-ink); font:700 32px/56px var(--sc-font); text-align:center` |
| `.mstep .mtxt` | `font:700 40px/56px var(--sc-font); color:var(--sc-ink)` |

---

## 7. `--check` 與 `--check --json`（002 實作，欄位由這裡定）

- `--check` 報告 media 那一列括號裡的「運鏡 N、紅框 N、放大鏡 N」換成 `validateMedia` 回傳的 `summary`（原文見 §4.1）。
- `--check --json` 的 `items[]` 每段多一個 `out` 物件（**完成影片秒數**；現有的 `start`／`end` 仍是 `rough.mp4` 秒數，剪輯台用）：

```json
"out": { "start": 61.9, "end": 70.2,
         "lists": [ 63.1, 64.6, 66.0 ],
         "annotations": { "marks": [], "callouts": [], "spot": [], "steps": [], "arrows": [], "lens": [] } }
```

| 欄位 | 誰有 | 內容 |
|---|---|---|
| `out.start`／`out.end` | 每段 | `it.start`／`it.end`（畫面上實際的起迄，含自動延長） |
| `out.lists` | 有條列的 scene（`it.resolved.listTimes` 非空） | 每條進場的完成影片秒數＝`it.start + listTimes[key][i]`，所有 key 攤平、依時間排序 |
| `out.annotations` | media 段 | `validateMedia` 回傳的 `json` |

`qc.mjs storyboard`、`qc.mjs observe` 只讀 `out`，不自己換算 cuts。正式欄位表由 002 併進 `contracts/check-json.md`。

---

## 8. 相容與過渡

1. 沒用新欄位的 plan.json：`--check` 報告、`index.html`、`--check --json` 的既有欄位逐字不變（`out` 是新增欄位）。
2. 002 換成 `validateMedia` 之前：`resolveMedia` 別名照跑，新欄位會驗證、會產生畫面，但 STEP 編號每段從 1 開始、不接續，`--check` 報告看不到標註摘要。
3. 002 在 `jsonItems` 加 `out` 之前：`qc.mjs storyboard` 用 `start`／`end` 推算完成影片秒數、每段只截一張；`qc.mjs observe` 格子的段 id 用同一個推算（`contracts/cli-004.md` §2.2 過渡列）。
4. 剪輯台（006）改 media 段的 `from`／`to`／`in`／`anchor`／`enter`／`exit`／`volume` 時，`callouts`／`spot`／`steps`／`arrows`／`marks[].path` 原樣保留；`+秒` 寫法的時間跟著段起點走，`#N` 寫法跟著字幕走。
