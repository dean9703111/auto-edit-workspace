# Feature Specification: 004 media-annotations-qc（錄影標註＋觀影與分鏡截圖工具＋HTML 背景圖）

**Feature Branch**: `004-media-annotations-qc`

**Created**: 2026-10-31

**Status**: Draft

**Input**: 主代理派工：「media 段標註（G13、G21、G27）、`qc.mjs observe`（G09）、`qc.mjs storyboard`（G14）、`brand.mjs bg --html`（G07 HTML 路線）、對應測試與 docs.md；只寫規格與契約」。另收 001 的請求：`qc.mjs framing` 加「建議」欄（`specs/001-skills-docs/spec.md:286`）。

**契約**：`specs/contracts/media.md`（media 段欄位、`validateMedia()`、`--list` 列、`--check --json` 的 `out`）、`specs/contracts/cli-004.md`（storyboard、observe、framing 建議欄、brand bg）。本檔的數字若和契約不同，以契約為準並回頭改本檔。

**縮寫**：分析報告 `AN/00`、`AN/01`、`AN/02`（作者本機 scratchpad）；作者端路徑代號照 `AN/02` §縮寫（TR、ES、JY、VEP）。U＝`shared/template/USAGE.md`、R＝`USAGE-reference.md`。

## 範圍

| 項目 | 落差 | 改的檔（004 擁有） | 要別人配合 |
|---|---|---|---|
| media 段 `callouts`／`spot`／`steps` | G13 | `tools/lib/media.mjs`、`kit/media.css` | 002：plan.mjs 改呼叫 `validateMedia`、`--check` 報告、`--check --json` 的 `out`；build.mjs 改 import `MEDIA_FIELDS` |
| `arrows`、`marks[].path` | G21、G27 | 同上 | 同上 |
| `qc.mjs storyboard` | G14 | `tools/qc.mjs` | 002：`planHash`、`items[].out` |
| `qc.mjs observe` | G09 | `tools/qc.mjs`、`tools/lib/raster.mjs`（`htmlShot`） | 002：`items[].out` |
| `brand.mjs bg` | G07（HTML 路線） | `tools/brand.mjs`、`tools/lib/raster.mjs`（`htmlShot`） | 003：`findChrome` 介面不變 |
| `qc.mjs framing` 建議欄 | 001 請求（`AN/02` W06） | `tools/qc.mjs` | — |
| 測試 | 憲法 VI | `dev/tests/{media,qc,brand}.test.mjs` | — |
| 文件原文 | — | `specs/004-media-annotations-qc/docs.md` | 001 併進 AGENTS.md、style.md、U、R、REVIEW.md |

`kit/media.js` 不用改。`tools/lib/raster.mjs` 只新增一個 `htmlShot()`（用 Chrome 截本機 HTML，observe 的總表與 brand bg 共用；中文字不能用點陣字畫，理由見 plan.md R2），既有函式不動。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 錄影段能標註「這裡是什麼」：說明卡、聚光燈、STEP 膠囊（Priority: P1）

AI 照字幕配好螢幕錄影後，口播講「點右上角的設定」，現在只能畫紅框；作者的錄影段（TR rec、ES seg31）還會在紅框旁拉一條引線接一張說明卡、把其他地方壓暗、在左上角掛 STEP 膠囊。AI 只要在 media 段寫 `callouts`／`spot`／`steps`，座標照現有的 `frame --grid` 讀，卡片放哪一邊、膠囊編號、時間夠不夠都由工具算，算不出來時錯誤訊息告訴它改什麼。

**Why this priority**: 錄影段是旁白片的主要畫面（esim 中段 70 % 片長，`AN/01` §2.5），只有紅框時作者每集都要手加說明；`AN/02` G13 列 P1。

**Independent Test**: 用 `dev/tests/media.test.mjs` 的假專案（ffmpeg 現做的 640×400 錄影）寫一段有三種標註的 media，`--check` 0 ✖、build 產生的 `index.html` 含契約 §6 的 DOM 與時間軸；不需要 storyboard／observe。

**Acceptance Scenarios**:

1. **Given** media 段 `callouts: [{ at: "+1", until: "+4", box: [40, 40, 200, 100], text: "設定", icon: "settings" }]`，**When** `build.mjs --check`，**Then** 0 ✖，報告那一列括號裡有 `標註 1`；build 後 `index.html` 有 `#mcb-m01-1`、`#mcl-m01-1`、`#mcc-m01-1` 與契約 §6 的 6 行時間軸。
2. **Given** 卡片放右邊會超出畫面（`AN` 例題：2560×1600 錄影 `box [1700, 200, 400, 80]`、text「打開 API 設定」）且寫了 `"side": "right"`，**When** `--check`，**Then** ✖ 原文含 `的卡片放 right 會超出安全區` 與 `→ 改 "side": "left"（放得下）`；拿掉 `side` 後 0 ✖、`--check --json` 的 `out.annotations.callouts[0].side` 是 `"left"`。
3. **Given** `callouts` 的 `until − at` 只有 1.5 s（一般模式），**When** `--check`，**Then** ✖ 原文含 `完整可讀只有 0.35s（要 ≥ 1.2s` 與 `或寫 "quick": true`。
4. **Given** 兩段相接的 media，前段最後一步 `steps` 和後段第一步同字、後段第一步 `at` 就是段起點，**When** build，**Then** 後段的膠囊第一格就在（時間軸用 `tl.set('#msteps-m02', { opacity: 1 }, …)`，沒有 `fromTo … x: -24`），兩段的號碼相同。
5. **Given** `spot` 和 `lens` 時間重疊，**When** `--check`，**Then** ✖ 原文含 `會壓暗兩層`。

---

### User Story 2 - 紅框跟著錄影捲動、箭頭指到小地方（Priority: P2）

錄影往下捲時，現在的紅框停在原地框到別的東西；作者 ES seg31 的做法是框跟著捲動補間。口播說「這個小按鈕」時，作者會放一支紅箭頭，箭尖離目標 6–12 px、不擋字、放不下就不放。

**Why this priority**: `AN/02` 把 G21、G27 列 P2；標註先有 US1 才完整。

**Independent Test**: 同 US1 的假專案，`marks[0].path` 兩步、`arrows` 一支；`--check --json` 的 `out.annotations` 與 `index.html` 的 `attr` 補間原文；`placeArrow` 純函式測試。

**Acceptance Scenarios**:

1. **Given** `marks: [{ at: "+0.5", until: "+5", box: […], path: [{ at: "+2", box: […] }, { at: "+3", box: […], dur: 0.6 }] }`，**When** build，**Then** `index.html` 有兩行 `tl.fromTo('#mmk-m01-1', { attr: { x: …` 分別在 `段起點+2`（0.4 s）與 `段起點+3`（0.6 s）。
2. **Given** `path[0].at` 早於紅框描完（`at + 0.4`），**When** `--check`，**Then** ✖ 原文含 `要在紅框描完`。
3. **Given** `arrows: [{ at: "+1", to: [600, 900] }]`（沒寫 `from`）且右上方放得下，**When** `--check --json`，**Then** `out.annotations.arrows[0].from` 是 `"ne"`；箭尖到 `to` 畫面點的距離 9 px（`placeArrow` 單元測試）。
4. **Given** 箭頭的 8 個方向、兩種長度都會壓到 callout 卡片或出畫，**When** `--check`，**Then** ⚠ 原文含 `找不到不擋字的位置` 與 `已拿掉`，`index.html` 沒有 `#mar-m01-1`。
5. **Given** 寫了 `"from": "sw"` 但會壓到右下角子母畫面、`"nw"` 放得下，**When** `--check`，**Then** ✖ 原文含 `從 "sw" 方向放會壓到右下角子母畫面 → 改 "from": "nw"（放得下）`。

---

### User Story 3 - 分鏡表截圖一個指令搞定（Priority: P1）

剪好看第 6 步要每段在完成態截圖、手動改名 `s01.png`、`s04-1.png`，弱模型常截到退場中、條列漏截、檔名對不上 plan.json。改成 `qc.mjs storyboard` 一個指令：工具決定截哪一刻、截幾張、存成什麼名字，印出直接貼進 storyboard.md 的行。

**Why this priority**: 每集都會停在停點 ③，截圖錯了作者要多看一輪；`AN/02` G14 列 P1；001 的停點 ③ 完成判準引用這個指令（`specs/001-skills-docs/spec.md:287`）。

**Independent Test**: 純函式 `shotPlan(items, outputDur)` 用手寫的 `items[].out` 測檔名與時刻；有 Chrome 時用假專案 build → `qc.mjs storyboard` → 檔案存在、張數對。

**Acceptance Scenarios**:

1. **Given** 已 build 的專案有 `s01`（一般）、`s04`（條列 3 條）、`m01`（2 個標註），**When** `qc.mjs storyboard`，**Then** `work/storyboard-preview/` 有 `s01.png`、`s04-1.png`、`s04-2.png`、`s04-3.png`、`m01-1.png`、`m01-2.png`，stdout 有 6 行 `![…](storyboard-preview/….png)`，結束碼 0。
2. **Given** plan.json 改過但還沒 build，**When** `qc.mjs storyboard`，**Then** ✖ `plan.json 在上次 build 之後改過 → 先跑 …build.mjs…`，結束碼 1，`storyboard-preview/` 沒被改動。
3. **Given** `--check` 有 ✖，**When** `qc.mjs storyboard`，**Then** ✖ 原文含 `plan.json 有 1 個 ✖（第一個：`，結束碼 1。
4. **Given** 條列第 2、3 條只差 0.3 s，**When** 算截圖時刻，**Then** 第 2 張改在第 2 條進場 + 0.5 s，並 ⚠ `進場後 0.3 秒就換下一條`。

---

### User Story 4 - 交付前整片看一遍：觀影總表（Priority: P1）

`snapshot --review` 只截每段開頭與中點，`qc.mjs final` 的 qc-sheet 每 10 秒一格，作者回饋裡的「這段停太久」「接縫黑一下」「STEP 膠囊每段眨一次」都看不到（`VEP/FR` 九、`JY/PS:L95-103`）。`qc.mjs observe` 每 0.5 秒一格拼成總表、每格印時間｜段 id｜字幕，另列 ≥ 8 秒幾乎不變的區間，每個接縫前後每 0.1 秒一格。

**Why this priority**: 交付前的最後一道人眼檢查，verifier 子代理與審查員都靠它；`AN/02` G09 列 P1。

**Independent Test**: 純函式（取樣時刻、靜止區間、接縫清單、格子標籤）用合成資料測；有 Chrome 時用 ffmpeg 現做「動 6 秒＋靜止 10 秒＋動 6 秒」的 22 秒片跑整個指令。

**Acceptance Scenarios**:

1. **Given** 22 秒、中間 10 秒靜止的測試片，**When** `qc.mjs observe --file <片> --offset 0`，**Then** `work/觀影/sheet-01.jpg` 存在（寬 1920）、stdout 有一行 `⚠ 靜止 0:06.0–0:16.0（10.0 秒）`（起迄誤差 ≤ 0.5 s）、`index.md` 的靜止區間表有一列。
2. **Given** `--check --json` 有 3 段，**When** observe，**Then** 接縫數＝段落起點與終點合併（相距 < 0.3 s 併一個）後落在範圍內的個數，`seam-01.jpg` 每列 8 格。
3. **Given** `--from 60 --to 120`，**When** observe，**Then** 只產生 3 張總表（60 s ÷ 24 s 進位）、接縫只取 60.5–119.8 s 之間的。
4. **Given** 找不到 Chrome，**When** observe，**Then** ✖ findChrome 原文、結束碼 1。

---

### User Story 5 - 不用生圖工具也能換背景：HTML 路線（Priority: P2）

使用者要換背景、但環境沒有 Codex／mmx（或要「精準留空、幾何線稿、跟主色完全一致」）時，AI 用 HTML／CSS／SVG 畫好，`brand.mjs bg` 一個指令截成正確尺寸的 jpg、疊留空區框、三張並排給使用者看；不直接蓋 `shared/template/bg-*.jpg`。

**Why this priority**: `AN/02` G07 的路由表裡 HTML 是每種模型的第二選擇、也是最後保底；001 的「換風格」改寫稿引用它（`specs/001-skills-docs/spec.md:197`）。

**Independent Test**: 純函式（留空區定義、裝飾像素占比）用合成 rgb buffer 測；有 Chrome 時三種 kind 各截一次、驗尺寸與 preview。

**Acceptance Scenarios**:

1. **Given** 暫存資料夾裡 `bg-fs.html`（用 `var(--brand)`），**When** `brand.mjs bg --html <它> --kind fs`，**Then** 同資料夾有 `bg-fs.jpg`（ffprobe `1920,1080`）、`zones-fs.jpg`，stdout 有 `✔ 留空區乾淨`。
2. **Given** HTML 在主卡區畫了一條 4 px 寬、橫過整個主卡區的線，**When** bg，**Then** ⚠ 原文含 `紅框（全畫面主卡）裡有` 與 `的像素是裝飾`，結束碼 0。
3. **Given** 三種 kind 都跑過，**When** 第三次結束，**Then** `preview.jpg` 是 1600×720。
4. **Given** `--out shared/template`，**When** bg，**Then** ✖ `輸出資料夾不能在 shared/template/ 裡`，結束碼 1，`shared/template/` 沒有新檔。

---

### User Story 6 - 構圖預覽直接給建議倍率（Priority: P3）

001 請求：停點 ② 的「不用停」要有預設值，`qc.mjs framing` 自己印「建議」欄，AI 只轉述＋附圖（`AN/02` W06）。

**Why this priority**: 小改動、只影響停點 ② 的回覆品質。

**Independent Test**: 純函式 `suggestZoom(cands)` 用手寫候選測。

**Acceptance Scenarios**:

1. **Given** 候選 1.00（不切）、1.15（不切）、1.30（切到上側），來源 1920 寬，**When** framing，**Then** 1.15 那列「建議」欄是 `✔`，多一行 `建議：1.15x（…）`。
2. **Given** 來源 640 寬、三個倍率都不切，**When** framing，**Then** 建議 1.15x（1.3 的 upscale 3.9 > 3.5）。

---

### Edge Cases

- **fit cover 把框裁掉**：callouts／spot／arrows 的 box／to 換到畫面座標後完全在 1920×1080 外 → ✖ C11；部分在外 → 照常（只用畫面內的部分算卡片位置）。
- **圖片段（kind image）**：沒有 `pieces`，不會有接點 ⚠；有 callouts／spot／arrows 時預設不慢推（`kenburns` 預設 false）。
- **`pip: false`／只有聲音的區間**：`pipAt` 為假的時段不檢查子母畫面禁入區。
- **標註跨過 `edit.cuts` 切點**：⚠ C10（錄影會跳），不擋 build。
- **`--test` 測試片段**：標註時間跟著 `off` 平移；`lim` 之後才開始的標註不產生（同放大鏡 `lib/media.mjs:402`）。
- **剪輯台改了 media 的 `from`**：`+秒` 的標註跟著段起點走；超出段範圍時照常 ✖「不在這段裡」。
- **STEP 同字但不相接**：沿用舊號碼、播進場動畫（不算接續）。
- **storyboard：一段的條列只有 1 條**：存 `<id>.png`（不加 `-1`）。
- **storyboard：兩段截圖時刻相同（< 1 ms）**：snapshot `--keep` 同名，複製成兩個檔名。
- **storyboard：段長 < 0.7 s**：截中點。
- **observe：成片比 24 s 短**：一張總表、列數照實際格數。
- **observe：測試片段**：`--offset` 讓格子時間＝成片時間；沒寫 ⚠。
- **observe：沒有 rough.srt 或 `--check` 失敗**：⚠ 後照樣產生總表（字幕／段 id 空白）。
- **brand bg：HTML 引用外部網址**：⚠（離線可能載不到）；**HTML 沒有 `<head>`**：注入的標籤放在檔頭最前面。
- **brand bg：Windows 路徑有中文或空白**：一律 `pathToFileURL`。

---

## Requirements *(mandatory)*

### Functional Requirements

驗證欄的「測試」指 `dev/tests/` 下的檔；「範例」指 `projects/範例`（整合階段由主代理跑）。

#### A. media 段標註（US1、US2；契約 `contracts/media.md`）

| FR | 要求 | 怎麼驗 |
|---|---|---|
| FR-001 | `MEDIA_KEYS` 加 `callouts`、`spot`、`steps`、`arrows`；`checkMediaSeg` 檢查 7 個陣列欄位（moves、marks、lens＋新 4 個）型別；每個物件的鍵照契約 §3 X1 檢查 | 測試：`bogus` 鍵的 ✖ 列表含新 4 鍵；`"callouts": {}` ✖ `callouts 要寫成陣列` |
| FR-002 | 座標：box／to 一律素材像素；callouts／spot／arrows 在 `at` 那一刻換成畫面座標；換算照契約 §1.1 | 測試：`mediaGeometry`、`toStage` 對 3452×2016、2560×1600、1920×1080 三組例題逐值相等（誤差 < 0.001） |
| FR-003 | `callouts` 欄位與驗證：text 1–12 字、icon 在 `kit/icons.json`、side 四選一或不寫、quick 布林；完整可讀 ≥ 1.2 s（定案）；訊息 C1–C7、C11 | 測試：每則訊息一個案例，regex 比對契約原文開頭 |
| FR-004 | 說明卡位置：side 不寫時依序 right → left → bottom → top 取第一個放得下的；寫了但放不下 ✖ 並列出放得下的邊；夾回安全區 x 40–1880、y 40–900；引線直線或一個直角 | 測試：`placeCallout` 例題（契約 §1.1）：right 失敗（右緣 1919.75 > 1880）、left 成功、卡片右緣 1142.75；引線端點在框左緣 1198.75 |
| FR-005 | `callouts` 產生契約 §6 的 DOM 與時間軸（一般／quick 兩種） | 測試：build 後 `index.html` regex 比對 6 行（一般）與 3 行（quick）；範例：`snapshot --at <at+0.2>,<at+0.5>,<at+0.95>` 三張看到「框→線→卡」（G13 驗證方式） |
| FR-006 | `spot`：壓暗 0.35、亮區 box 外擴 8 px 圓角 12、淡入淡出 0.4；≥ 2.0 s；同時 ≤ 1；不和 lens 重疊；訊息 S1–S3 | 測試：三則訊息；HTML 有 `mask id="mspm-m01-1"` 與 `fill-opacity` 由 CSS 給 |
| FR-007 | `steps`：左上膠囊、號碼全片累加、同字沿用、相接同字不播進場；相鄰 ≥ 1.65 s、離段尾 ≥ 1.65 s；碰撞 ⚠；訊息 T1–T6 | 測試：兩段 media 相接案例（號碼、`carry`、時間軸）；`--check --json` 的 `steps[].n` |
| FR-008 | `arrows`：箭尖離目標 9 px、長 120 → 96、8 方向試放、寫了 from 放不下 ✖ 附建議、沒寫且都放不下 ⚠ 拿掉、同時 ≤ 1、≥ 2.2 s、until 預設 at＋3、放大鏡期間拿掉；訊息 R1–R8 | 測試：`placeArrow` 純函式（箭尖距離 9.00 px、出畫時改方向、全失敗回傳 null）；R6、R7 兩則訊息 |
| FR-009 | `marks[].path`：`attr` 補間、dur 0.2–2（預設 0.4）、描完才動、淡出前到位、不重疊；每步終點照 marks 規則 ⚠；訊息 P1–P5 | 測試：HTML 兩行 `attr` 補間；P2、P3、P4 訊息 |
| FR-010 | 跨欄位：紅框（marks＋callouts）同時 ≤ 2；callouts／spot／arrows 期間不能有運鏡（✖ C8）；有這三種時預設不慢推（寫 `kenburns: true` ⚠ K1）；callouts 與 lens 重疊 ⚠ C12；跨 cuts 切點 ⚠ C10 | 測試：現有「同時有 3 個紅框（最多 2 個）」regex 照樣過；C8、K1 各一案例 |
| FR-011 | 匯出 `validateMedia(it, ctx) → { summary, json }`、`newStepState()`；`resolveMedia` 保留為別名（過渡期） | 測試：直接呼叫 `validateMedia` 回傳的 `summary` 原文（契約 §4.1）與 `json` 每個鍵都在 |
| FR-012 | `MEDIA_FIELDS` 搬進 `lib/media.mjs` 並加契約 §5 的列（marks 改寫＋4 列） | 測試（002 改 import 後）：`--list` 有 `\| callouts \|`、`\| arrows \|`；`--list --json` 的 `media.fields` 有 `steps` |
| FR-013 | 新增的 ✖／⚠ 訊息全部帶「→ 改法」（R7、R8 的「已拿掉」除外，那兩則是告知） | 測試：一個集合案例觸發全部訊息，逐則檢查含 `→` |
| FR-014 | 相容：沒有用新欄位的 plan.json，`--check` 報告、`index.html`、`--check --json` 既有欄位逐字不變 | 測試：現有 `media.test.mjs` 15 個案例不改就過；沒有標註的段 `index.html` 不含 `mann`、`mcards` |

#### B. `qc.mjs storyboard`（US3；契約 cli-004 §2）

| FR | 要求 | 怎麼驗 |
|---|---|---|
| FR-020 | 前提檢查：`--check --json` 有 JSON 且 ok、`index.html` 存在、`planHash` 一致（過渡期比 mtime 只 ⚠） | 測試：三種 ✖ 原文 |
| FR-021 | 截圖時刻與檔名照 cli-004 §2.2（一般 `out.end − 0.6`；條列每條；media 標註每個 `ready + 0.1`；併 < 0.3 s；段長 < 0.7 s 截中點） | 測試：`shotPlan` 純函式，手寫 items 比對每張的 `{ file, at }`（誤差 < 0.001 s） |
| FR-022 | 一次 `npx hyperframes snapshot --at … --no-end --keep -o .storyboard-shots --json`，依 JSON 對應時刻→檔案，複製到 `work/storyboard-preview/`；舊檔不刪只 ⚠ | 測試（有 Chrome 時）：假專案 build 後跑，檔名集合＝`shotPlan` 的集合；stale 案例 ⚠ |
| FR-023 | 印出 cli-004 §2.3 的每一行（每張一列、貼上用 markdown 一張一行、✔ 結尾）；`--json` 照 §2.4 | 測試：stdout regex；`--json` 可解析、`shots[].md` 原文 |
| FR-024 | 速度：一次 snapshot 呼叫；20 段 40 張在 M1 Max ≤ 60 s（建議初值；實測 21 張空白合成 4.3 s） | 範例實測寫進 `dev/loop/round-N.md` |

#### C. `qc.mjs observe`（US4；契約 cli-004 §3）

| FR | 要求 | 怎麼驗 |
|---|---|---|
| FR-030 | 參數 `--file`、`--offset`、`--from`、`--to`、`--json`；預設 `成片/final.mp4`；範圍檢查 | 測試：範圍 ✖ 原文；`--file` 沒 `--offset` 的 ⚠ |
| FR-031 | 每 0.5 s 一格、320×180、6×8＝48 格一張、格下 `m:ss.s｜段 id｜字幕`（兩行內）；Chrome 排版、中文字用 kit 字型 | 測試：`observeTimes(0, 22, 0.5)` 長度 44；`cellLabel` 原文；有 Chrome 時 `sheet-01.jpg` 寬 1920、高 `40 + 列數×224` |
| FR-032 | 靜止區間：96×54 灰階、相鄰平均絕對差 < 2.0、連續 ≥ 8 s | 測試：`staticRuns` 用合成灰階序列（中間 20 格相同）回傳 `[[6, 16]]`；有 Chrome 時整個指令抓到 ±0.5 s |
| FR-033 | 接縫條帶：段落起點與終點、相距 < 0.3 s 併一個、範圍 `[from+0.5, to−0.2]`、每個 −0.5～+0.2 s 每 0.1 s 8 格、每張 10 個 | 測試：`seamList(items)` 合併與標籤（`— → s01`、`s01 → s02`） |
| FR-034 | `index.md` 照 cli-004 §3.2 原文格式；每次先清掉上次的 sheet／seam／index／.tiles，其他檔不動 | 測試：先放一個 `notes.txt` 在 `work/觀影/`，跑完還在 |
| FR-035 | ⚠／✖ 原文照 cli-004 §3.4；`--check` 失敗、沒字幕時照樣產生總表 | 測試：拿掉 rough.srt 的案例 ⚠ 且結束碼 0 |
| FR-036 | `--json` 照 cli-004 §3.5 | 測試：可解析、`static[0].from` |

#### D. `brand.mjs bg`（US5；契約 cli-004 §5）

| FR | 要求 | 怎麼驗 |
|---|---|---|
| FR-040 | `bg --html --kind [--out]`：注入 base／fonts.css／brand.css／尺寸樣式到暫存副本，Chrome `--screenshot` 截圖、轉 jpg、ffprobe 驗尺寸 | 測試（有 Chrome）：三種 kind 尺寸 `1920,1080`／`960,1080`／`1920,1080` |
| FR-041 | 疊留空區框 `zones-<kind>.jpg`（drawbox）；裝飾像素占比 > 0.5 % ⚠ | 測試：`decorRatio` 純函式：純色 0、4 px 線約 0.56 %；有 Chrome 時 ⚠ 原文 |
| FR-042 | 三張到齊產生 `preview.jpg` 1600×720；沒到齊印「還沒做」 | 測試（有 Chrome）：ffprobe `1600,720` |
| FR-043 | `--out` 在 `shared/template/` 裡 ✖；預設輸出在 HTML 所在資料夾；不寫 `shared/template/bg-*.jpg` | 測試：✖ 原文；`shared/template/` 的 mtime 不變 |
| FR-044 | `brand.mjs --help` 印 cli-004 §6.2 全文；`brand.mjs "#RRGGBB"` 行為不變 | 測試：現有 5 個 brand 測試不改就過；`--help` 含 `bg --html` |

#### E. `qc.mjs framing` 建議欄（US6；契約 cli-004 §4）

| FR | 要求 | 怎麼驗 |
|---|---|---|
| FR-050 | 倍率表加「建議」欄與一行 `建議：<倍率>x（…）`；規則：排除會切到手勢與 upscale > 3.5 的，取剩下最大；全排除時 1.00x | 測試：`suggestZoom` 兩組例題（US6 情境 1、2） |

#### F. 測試與文件

| FR | 要求 | 怎麼驗 |
|---|---|---|
| FR-060 | `dev/tests/media.test.mjs` 涵蓋 FR-001～FR-014 | `node --test dev/tests/media.test.mjs` 全綠 |
| FR-061 | `dev/tests/qc.test.mjs` 涵蓋 FR-020～FR-036、FR-050；需要 Chrome／hyperframes 的案例在找不到時 `skip`（訊息 `沒有 HyperFrames 的 Chrome，略過`） | 全綠；拔掉 Chrome 快取時只剩略過、沒有失敗 |
| FR-062 | `dev/tests/brand.test.mjs` 涵蓋 FR-040～FR-044；沒 Chrome 自動略過 | 同上 |
| FR-063 | `dev/tests/helpers.mjs` 只新增函式：`hasChrome()`（呼叫 `findChrome`，失敗回 null，結果快取） | 不改既有函式簽名（`specs/README.md` 規定） |
| FR-070 | `docs.md` 給 001 併進：U §5（5.3 範例、5.5 表、5.6 檢查）、R2.5 列、style.md「螢幕錄影與圖片」、AGENTS.md 剪好看第 6、8 步（observe 放第 8 步：第 7 步還沒有 mp4，仍用 `snapshot --review`）、子代理 verifier 列、構圖建議欄、換風格 HTML 路線、R9.2 留空區（ch）、R9.3、REVIEW.md 觀影 pass、U §2 SOP 第 4／11／12 列 | 001 的 `docs.test.mjs`：style.md 有 docs.md 列的數字；`--help` 列的指令都在文件出現 |

### Key Entities

- **標註（annotation）**：media 段上畫在錄影上方的元素（紅框、說明卡、聚光燈、STEP 膠囊、箭頭、放大鏡）。屬於「標註」不是資訊卡：只在 media 段裡、跟著錄影內容、文字 ≤ 12 字（style.md「錄影段落不放下方資訊卡」不變）。
- **到位時刻（ready）**：標註進場動畫跑完、完整可讀的第一刻；分鏡截圖與完整可讀時間都從它算。
- **觀影總表（sheet）**：成片每 0.5 s 一格的縮圖拼圖＋格下標籤；**接縫條帶（seam）**：段落交界前後每 0.1 s 的 8 格。
- **分鏡截圖（shot）**：storyboard.md 每段（條列每條、標註每個）完成態的 1920×1080 PNG，檔名＝plan.json 的 id。
- **背景預覽**：HTML 截成的 `bg-<kind>.jpg`、疊框的 `zones-<kind>.jpg`、三張並排的 `preview.jpg`（停點 ⑥ 給使用者看的圖）。

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：`node --test dev/tests/media.test.mjs dev/tests/qc.test.mjs dev/tests/brand.test.mjs` 在有 Chrome 的 Mac 全綠；把 `~/.cache/hyperframes/chrome` 改名後只有標「略過」的案例、0 失敗。
- **SC-002**：現有 `media.test.mjs`、`qc.test.mjs`、`brand.test.mjs` 的案例一行都不改就通過（相容）。已知例外（審查 r1 B-09）：`brand.test.mjs` 的 pip-frame 兩個案例在 HEAD 就已經失敗（brand.css 主色已是 #F6630F、子母畫面框已是 1424），改成從 brand.css 讀主色與框位置；第 2 輪 B-01 把條列分組從「間隔 < 0.5 s」改成「進場完成前就開始的併組」，`qc.test.mjs` 的 shotPlan 案例只改標題文字，期待值不變。
- **SC-003**：範例專案加一段 media（含 callouts、spot、steps、arrows、marks.path 各一）：`--check` 0 ✖；`qc.mjs storyboard` 的檔名和 plan.json 的 id 一一對應，條列段張數＝項目數，media 段張數＝到位時刻數（相距 < 0.3 s 併一）（G14 驗證）；人工看截圖：紅框 path 兩個時間點都貼住目標（G27 驗證）、箭頭不壓卡片與膠囊（G21 驗證）。
- **SC-004**：範例 `成片/final.mp4` 跑 `qc.mjs observe`：總表張數＝⌈長度 ÷ 24⌉；靜止測試片的 10 秒靜止區間起迄誤差 ≤ 0.5 s；10 分鐘成片整個指令 ≤ 3 分鐘（M1 Max）。
- **SC-005**：`brand.mjs bg` 三種 kind 尺寸都對、`preview.jpg` 1600×720；留空區有線的測試頁一定 ⚠、乾淨的測試頁一定 ✔。
- **SC-006**：弱模型試跑（憲法檢查迴圈第 3 步）：Sonnet 只讀 USAGE §5 與 `--check` 訊息，替一段給定的 contact sheet 寫出一個 callout＋一支 arrow，**兩次 `--check` 以內** 0 ✖（記在 `dev/loop/round-N.md`）。

---

## Assumptions

- Chrome 用 HyperFrames 自己下載的 `chrome-headless-shell`（snapshot、render 本來就需要，`lib/audit-browser.mjs:45`）；本機實測 `--screenshot` 960×1080 含中文字型 0.41 s。
- 分鏡截圖用 `npx hyperframes snapshot`（0.8.221，根目錄 `package.json` 釘版，002）：`--keep` 檔名 `at-<秒>s.png`、`--json` 的 stdout 只有 JSON（本機實測）。
- 002 會在 `--check --json` 加 `items[].out` 與 `planHash`（見下表）；在那之前 storyboard／observe 用過渡做法（mtime ⚠、不標段 id），測試用手寫 JSON。
- 標註的音效不在本線（音效政策屬 005）；標註不自動配音效。
- 剪輯台（006）不編輯標註欄位，只原樣保留。

---

## 請 00N 加（不是 004 的檔）

| 對象 | 要加什麼 | 為什麼／誰用 |
|---|---|---|
| 002 | `lib/plan.mjs` 第二輪改呼叫 `validateMedia(it, { cues, tm, pipAt, icons, steps, err, warn })`（取代 `resolveMedia`）；`resolvePlan` 開頭建一個 `const steps = newStepState()`，依 `timed` 順序傳給每個 media 段；回傳值存 `it.mediaReport` | STEP 編號與接續、icons 驗證（契約 media §4） |
| 002 | `formatReport` 的 media 那段（`lib/plan.mjs:631`「運鏡／慢推／紅框／放大鏡」）改成直接用 `it.mediaReport.summary` | `--check` 報告看得到標註（契約 media §7） |
| 002 | `jsonItems` 每段加 `out: { start, end, lists?, annotations? }`（成片秒數；`lists`＝`it.start + it.resolved.listTimes` 攤平排序；`annotations`＝`it.mediaReport.json`）；寫進 `contracts/check-json.md` | `qc.mjs storyboard`、`qc.mjs observe`（契約 media §7） |
| 002 | `--check --json` 第一層加 `planHash`（plan.json 內容 sha1 前 8 碼）；build 成功後在 `work/hyperframes/.build-manifest.json` 寫同一個 `planHash` | storyboard 判斷「改過還沒 build」（cli-004 §2.1） |
| 002 | `build.mjs` 刪掉自己的 `MEDIA_FIELDS`，改 `import { MEDIA_FIELDS } from './lib/media.mjs'`（`--list` 與 `--list --json` 照用） | 欄位表單一真相（契約 media §5） |
| 002 | `dev/tests/media.test.mjs` 前幾個案例測的是 002 的 `media.mjs main／scan／frame` 與 `--check --json`：請在 `media-cli.test.mjs`（002 新檔）建好同等案例，通知 004 後由 004 從 `media.test.mjs` 刪掉 | 檔案所有權（README：`media-cli.test.mjs` 屬 002） |
| 003 | `lib/audit-browser.mjs` 的 `findChrome({ chrome })` 名稱、參數、回傳（可執行檔絕對路徑）、找不到時的錯誤原文保持不變 | `brand.mjs bg`、`qc.mjs observe` import 它 |
| 003（選用） | audit 對 media 段不要整段略過（`lib/audit-rules.mjs:46`）：只量 `.mcard`、`.mstep` 兩種文字元件的出畫、壓子母畫面、字 < 30 px | build 的卡片寬是估算（全形 40 px、半形 24 px），實際排版再保險一次 |
| 001 | 把 `docs.md` 併進 AGENTS.md、style.md、U §5、R2.5、R9.2／R9.3、REVIEW.md、U §2 SOP 表 | 文件所有權 |
| 006 | 剪輯台存 plan.json 時，media 段的 `callouts`、`spot`、`steps`、`arrows`、`marks[].path` 原樣保留（不認得的鍵不要丟掉） | 契約 media §8-4 |
| 007（選用） | `dev/check-all.mjs` 在範例 build 後跑 `qc.mjs storyboard --project projects/範例`、render 後跑 `qc.mjs observe --project projects/範例` | 檢查迴圈第 2 步 |

---

## 不做（範圍外，理由）

| 項目 | 理由 |
|---|---|
| 連續錄影片段之間疊化 0.47 s（`AN/01` §2.6、P1-6） | P1-6 的錄影位置（1609×940 貼頂）現行 `fit: "contain"` 已做到；片間疊化屬段落接縫，是 002 的 plan.mjs（接不透明幕「接縫不淡」`lib/plan.mjs:356-368`）。列為待裁決第 6 條 |
| 講者段的箭頭（`AN/01` P2-4「口播提到右上角資訊卡」） | 不在 media 段，畫面上沒有素材座標；本線只取它的時間參數（3 秒、淡入淡出 0.5） |
| OCR 判斷箭頭有沒有擋到錄影裡的字（`JY/WF:L59`） | 要 Python／OCR 依賴，違反憲法 II；工具只擋 HF 元素，錄影裡的字靠 storyboard 截圖人眼看 |
| 箭頭貼紙的跳動動畫（剪映 48 幀） | G21 定的是「SVG 4px 直線箭頭」；靜態箭頭 seek 最穩 |
| 標註音效 | 屬 005；見待裁決第 7 條 |
| `brand.mjs bg --apply`（自動複製進 shared/template） | AGENTS.md 換風格要求使用者同意後才複製；工具只印複製指令 |
| 觀影總表的點陣字退路（沒有 Chrome 時） | Chrome 是 HyperFrames snapshot／render 的必要條件，沒有它也做不了成片；只多維護一套排版 |

---

## 需要主代理裁決

1. **完整可讀門檻**：定案「新訊息完成態 ≥ 1.2 s」和 TR rec 的 callout 規則「≥ 1.5 s、quick ≥ 1.0 s」（`TR/rec:L19-20`）不同。本規格全部用 1.2 s（單一數字）。要照 TR 分兩個數字就改契約 media §2.3。
2. **STEP 膠囊位置**：本規格用 TR／PPA 的左上（左 48、上 40）。ES r7 用右上（上 28、右 184，`ES/seg31/r5-kit.css:24-34`）。工作區的版型是 PPA 風格，所以選左上；作者若要右上只改常數。
3. **STEP 編號**：全片自動累加、同字沿用，plan.json 不能指定號碼。若作者要分集內兩組獨立教學各自從 1 起算，要加 `n` 欄位（本規格沒加，憲法 VIII）。
4. **`marks[].path[].dur`**：派工欄位只有 `{ at, box }`；ES seg31 實際用了 0.4 與 0.6 兩種長度（`:86`、`:108-109`），本規格多一個選填 `dur`（預設 0.4）。
5. **side／from 寫了但放不下**：本規格 ✖ 並建議放得下的方向（不自動改，免得 plan.json 和畫面不一致）；沒寫才自動挑。箭頭全失敗依作者規則 ⚠ 拿掉，callout 全失敗 ✖（字一定要有地方放）。
6. **P1-6 片間疊化**：要不要請 002 在連續 media 段之間加 0.47 s 交叉淡化（目前是硬切）。
7. **標註要不要配音效**：作者剪映錄影段用「鼠标单击」（`AN/01` P1-8 → 工作區沒有點擊聲，005 新增 `click`）。要的話由 005 在 `contracts/sfx.md` 定事件、002 在 plan.mjs 配，本線只提供 `ready` 時刻。
8. **契約檔名**：`cli-004.md` 與 README 的 `contracts/cli.md`（同 cli-001 的問題）。
9. **章節背景留空區**：`ch` 的 x 160–1760、y 260–870 是從模板推的建議初值，R9.2 原文只有「中央放章名卡」；請作者確認或給數字。
10. **media.test.mjs 裡 002 的案例**：所有權表把 `media.test.mjs` 給 004、`media-cli.test.mjs` 給 002，但現有 `media.test.mjs` 一半在測 002 的 `media.mjs` CLI 與 `--check --json`。本規格的處理見「請 002 加」第 6 列，需要主代理確認搬法。
11. **observe 放第 8 步**：派工寫「第 7／8 步加 `qc.mjs observe`」，但第 7 步（Studio 停點 ④ 之前）還沒有任何 mp4。本規格把 observe 放在第 8 步兩處（測試片段 `--file … --offset`、final.mp4 在 `qc.mjs final` 之前），第 7 步仍用 `snapshot --review`。若要在停點 ④ 之前就看觀影總表，得先 render 一次 draft（多 1–3 分鐘），請裁決。
