# 012 版面系統：對齊、等距、內距（主代理的診斷與派工）

## 使用者原話（2026-10-31 17:45）

> 我覺得畫面元素在構圖上要考量的視覺設計，流程相關需要考量垂直對齊、水平對齊，還有 padding 距離等，如果這塊原本沒有注意的話要設計到

## 盤點（已有／沒有）

已有（audit 量得到）：標題壓到內容 ✖、間距不足 ⚠（標題到內容 < 24）、區塊重疊 ⚠、右側空白過多 ⚠、垂直不平衡 ⚠（全畫面上下留白差 > 40）、文字框內距不足 ⚠、插圖「差一點點對齊」⚠（同列中線差 1–8 px）。

沒有：
1. **間距 token**：卡片內距、元件間距、圖到標籤的距離各檔各寫（`gap:12`、`padding:20px 56px`、`gap:40px`），沒有一套數字。
2. **等距**：同一列三站的間距沒人量；弱模型自己敲 `left`，常常 28／438／808 這種不等距的值。
3. **群組置中**：內容群在卡片內部沒有置中規則（只有全畫面的上下留白差）。
4. **連接線端點**：箭頭座標手寫在 svg path 裡（`M364 200 H422`），元件一移線就懸空或穿過元件。
5. **標籤對圖置中**：靠 flex 剛好置中，沒量。
6. **分鏡「位置」欄寫像素**（`x 160–480、y 300–720`）：弱模型在挑座標，這正是對不齊的來源。
7. 18 支情境模板是作者手排的，大致對齊，但沒有同一套 token，也沒被量。

結論：位置不該由模型敲數字。**版面由 helper 排、audit 量、模型只選排法**。

## 設計

### 1. 間距 token（`kit/scene.css` `:root`，單位 px＝u，直式一樣）

| token | 值 | 用在 |
|---|---|---|
| `--sc-grid` | 8 | 所有位置、尺寸、間距都是 8 的倍數（helper 自動貼齊） |
| `--sc-pad-card` | 48 | 卡片內容區左右內距 |
| `--sc-pad-card-y` | 40 | 卡片內容區上下內距 |
| `--sc-gap-xxl` | 160 | 一對元件要拉開（分歧、對照、比喻的兩邊；wB 交件追加） |
| `--sc-gap-xl` | 96 | 站與站之間（中間放連接線） |
| `--sc-gap-lg` | 48 | 兩欄之間、群組之間 |
| `--sc-gap-md` | 24 | 同一群裡的元件之間、序號圓到文字 |
| `--sc-gap-sm` | 16 | 插圖到它的標籤、圖示到文字 |
| `--sc-link-gap` | 12 | 連接線端點離元件外框的距離 |
| `--sc-link-head` | 16 | 箭頭頭長 |

既有的 `.sc-row` gap 24、標題列 padding 20 56、`.xsc-it` gap 12 改吃 token（12 → 16）。

### 2. 排版 helper（`kit/scene-layout.js`，載入順序在 illus.js 之後、動畫 script 之前；mount 時算一次、純函式、不進 timeline）

弱模型只寫宣告，不寫座標：

```html
<div id="xsc-stage" data-layout="row" data-gap="xl" data-align="center">
  <div id="xsc-phone" class="xsc-it" data-slot><div data-illus="phone" …></div><b class="xsc-lbl">手機</b></div>
  <div id="xsc-cloud" class="xsc-it" data-slot>…</div>
  <div id="xsc-laptop" class="xsc-it" data-slot>…</div>
  <div id="xsc-ok" class="xsc-it xsc-side" data-slot data-row="2">…</div>
</div>
<svg id="xsc-lines" data-links="xsc-phone>xsc-cloud xsc-cloud>xsc-laptop"></svg>
```

| 屬性 | 值 | 行為 |
|---|---|---|
| `data-layout` | `row`／`col`／`cols-2`／`grid-2x2`／`free` | row：同一列等距、插圖中線水平對齊、整列在內容區水平置中；col：垂直等距、x 中線對齊；cols-2：兩欄等寬、欄間 gap-lg；grid-2x2：等寬等高；free：不排（既有手排檔用） |
| `data-gap` | `xxl`／`xl`／`lg`／`md`／`sm`（`none`＝0） | 用哪個 token |
| `data-justify` | `start`／`center`（預設）／`end` | 橫向靠哪邊：最外層群組靠左（右）內距 `--sc-pad-card`、或置中；col 裡的元件左（右）邊對齊、或插圖中線對齊（004 交件追加；audit 的 `layout-center` 在 start／end 時量左／右內距＝48±8） |
| `data-align` | `center`（預設）／`top`／`middle` | 群組垂直置中於內容區，或靠上（上內距 `--sc-pad-card-y`）；row 預設**底對齊**（有標籤的元件插圖底同高＝標籤同一條線，沒標籤的對齊最高那個有標籤插圖的中線），`middle`＝置中＋改成插圖中線對齊（012 第一棒驗收追加） |
| `data-row="2"` | 數字 | 第二列（row 排法裡的下一列；列與列之間 gap-lg） |
| `data-slot` | — | 參與排版的元件（沒有的不動） |
| `data-links` | `a>b c>d`（有箭頭）、`a-b`（無箭頭） | 自動在兩個元件**外框邊中點**之間畫線：端點離外框 `--sc-link-gap`，箭頭頭 `--sc-link-head`；同列畫水平線、同欄畫垂直線、不同列欄畫 L 形（先水平再垂直）；產生的 `<path id="<a>-<b>">` 給 `P.stroke`／`P.comet` 用（id 固定，弱模型照寫） |

- 排版用計算樣式的寬高（`getBoundingClientRect` 在祖先縮放時會錯，用 `offsetWidth`／`offsetHeight`），結果寫 `left`／`top`（8 的倍數）；插圖描邊外擴 2 px 不算進外框。
- 放大過的元素（聚焦 1.06、過衝 1.1）照放大後預留：row 的 gap 最小值＝`gap token`，但相鄰元件放大後不能碰到（helper 算 `scaleMax` 預設 1.1）。
- 直式：讀 `window.__regions`（009）後同一套邏輯；token 不變。
- 匯出 `SceneLayout.apply(root)`（illus.js 載入後、`ILLUS.mount` 之後自動跑一次；`{force:true}` 重排）與 `SceneLayout.measure(root)`（給 audit：每個 slot 的外框、每條 link 的端點）。

### 3. 分鏡表「位置」欄只寫排法（BEATS §5、USAGE 2.3、x-scene 檔頭）

寫法固定：`<區域>｜<排法> <第幾個>`，例：`panelTop｜row 1／3`、`panelTop｜row2 1／1`、`panelTop｜cols-2 左`、`band｜free`。不再寫 `x 160–480`。插圖清單的「建議尺寸」仍寫（元件自己的寬高）。

### 4. audit 規則（`lib/audit-layout.mjs`；每個取樣時刻只量完成態與每拍後 0.3 s；訊息只指 `shared/style.md`「版面」）

| 規則 | 等級 | 條件 | 改法（印給弱模型） |
|---|---|---|---|
| `layout-row-align` | ⚠ 4–16 px／✖ > 16 px | 同列（上下範圍重疊）元件的插圖中線 y 差（row 預設底對齊：只比沒標籤的；`data-align="middle"` 全部比） | 「這幾個元件放進同一個 data-layout="row"，不要手寫 top」 |
| `layout-gap` | ⚠ | 同列（欄）相鄰間距的最大差 > 8 px | 「同一列用 data-layout 排，不要手寫 left」 |
| `layout-center` | ⚠ | 內容群在內容區左右留白差 > 16 px，或 `data-align=center` 時上下留白差 > 24 px | 「內容群置中：用 data-layout；故意靠上寫 data-align="top"」 |
| `layout-pad` | ⚠ | 內容群到卡片內容區邊 < 40 px（左右）／< 32 px（上下）；插圖描邊外擴 2 px 另計 | 「元件縮小或減少，內距至少 48／40」 |
| `layout-label` | ⚠ | 標籤中心 x 與插圖中心 x 差 > 4 px（`xsc-side` 這種橫排的量 y） | 「標籤放在元件的 .xsc-it 裡，不要另外定位」 |
| `layout-label-row` | ⚠ | 同一列有標籤的元件（`.xsc-lbl`，沒有就取 slot 裡第一個有字的；recPill 這種掛在標籤下面的膠囊跟著標籤，不另外算），標籤上緣 y 差 > 4 px；側排（`.xsc-side`）的標籤中心和其他標籤中心差 > 16 px（`data-align="middle"` 不量；row 底對齊時側排的標籤中心落在標籤線） | 「同一列的標籤要在同一條線：用 data-layout="row"（底對齊）」 |
| `layout-link` | ⚠ | 連接線端點離元件外框 < 4 px 或 > 32 px、線穿過任一元件外框、端點不在外框邊中點 ±8 px | 「連接線用 data-links 產生，不要手寫 path」 |

既有的 `illus-align`（1–8 px）併進 `layout-row-align`（避免兩條規則同時報）；`vertical-balance`、`title-gap`、`pad` 不動。

### 5. 範圍

- **custom 20 支**：x-scene 三支改成宣告式（DATA 1 不再有 `style="left…"`、svg 不再手寫 path）；其他 17 支（站、欄、列）改用 `data-layout`＋token，手排的 `left/top` 刪掉；每支 audit 0 ✖、`layout-*` 0 ⚠。
- **scenes 18 支模板**：改吃 token；有列／欄的（04a–d、05、08、10、11、12、13）用 `data-layout`；audit 0 ✖、`layout-*` 0 ⚠。
- **文件**：style.md 加「版面」節（token 表、六條規則用一句話寫、什麼時候寫 `free`）；BEATS §5 與 §1 的「位置」欄改排法寫法；USAGE 2.3；x-scene 檔頭【版面】節改成宣告式說明；storyboard／motion Skill 的對應句子；docs.test 的數字出處。
- **驗證**：`node dev/check-all.mjs` 全綠；範例試跑 3 的示意動畫段用新 audit 量，`layout-*` 的 ⚠ 列出來（那是試跑的回饋輪要修的）。

## 派工

| 棒 | 給誰 | 做什麼 | 不碰 |
|---|---|---|---|
| 1 | 003 | §1 token、§2 helper（含測試）、§4 audit、x-scene 三支改宣告式、cli-003／motion 契約 | scenes/、其他 17 支 custom、文件 |
| 2（等 1） | Opus 工人 ×2（每人 8–9 支） | 17 支 custom 換 `data-layout`＋token，三關＋亂序比對 | kit、audit、文件 |
| 2（等 1） | 004 | 18 支模板換 token／`data-layout`，audit 0 ✖ | custom、kit JS |
| 2（等 1） | 001 | §5 文件 | 程式 |

弱模型看的訊息只能指 `shared/` 或 AGENTS.md。不 commit。測試暫存 `TMPDIR=/Volumes/auto-edit-tmp`。

## 已知限制（helper 做不到，先記錄不做；wB 交件時列的）

- **一分多的曲線**：一個元件分出 2 條以上的線（x-branch 的分歧），`data-links` 只畫直線與 L 形，曲線由那支 custom 自己在 script 算（端點仍用 `SceneLayout.box` 取，不寫死座標）。
- **先垂直再水平的 L 形**：L 形固定「先水平再垂直」；要先往下再橫走的，暫時拆成兩個元件之間各一條，或手寫（audit 的 `layout-link` 照樣量）。
- **欄靠左、等寬撐最寬**：`data-justify="start"` 只讓元件左邊對齊，不會把每個元件撐到同一寬度；要等寬的條列先在 CSS 給同一個寬度，之後看用量再決定要不要加 `data-stretch`。
