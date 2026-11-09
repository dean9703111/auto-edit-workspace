# 示意插圖的畫法（illus-style）

畫廊（`kit/illus-gallery.html`、`kit/illus-gallery.jpg`）沒有的物件，照這份畫成一個 SVG 檔，和內建的 22 個元件同一個樣子。規則從 `kit/illus.js` 的通則來；§3 表上「lint」欄打 ✔ 的項目，`media.mjs illus-lint` 會檢查（§5）。

## 1. 先判斷要不要畫

照這個順序選，前一種能用就不要往下：

1. 畫廊裡有 → 直接用 `data-illus="<元件名>"`（畫廊每格下面有寫法）。
2. lucide 圖示單個或 2–3 個組合放進卡片、膠囊能表達 → 用圖示。名稱用 `node shared/template/tools/build.mjs --project projects/<專案> --icons 手機,雲端` 查；不要打開 `kit/icons.json`（一行 586 KB）。
3. 都不行 → 照本檔新畫一個 SVG（內容設計動畫一段最多新畫一個）。

相片、背景、質感圖不走這條；示意插圖一律是向量線條。

## 2. 檔案放哪裡、怎麼掛

- 檔案：`work/hyperframes/illus-local/<name>.svg`（`<name>` 小寫英文開頭、只用英數，例 `router`、`sdCard`）。
- 掛載：`<div id="xnet-router" data-illus-src="illus-local/router.svg" style="width:220px;height:120px"></div>`。路徑相對主合成 `index.html`（`work/hyperframes/`），不是相對 `compositions/`。
- 子合成 script 的第一行：`ILLUS.mount(document.getElementById('<root id>'));`，之後才建 timeline。
- 狀態：`P.in('#xnet-router .il-led', T2)` 打開、`P.out(...)` 關掉。

## 3. 規則

| 項目 | 規則 | lint |
|---|---|---|
| 最外層 | 一個 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" fill="none">` | ✔ |
| viewBox | 從 `0 0` 開始、貼齊圖形外框（含描邊一半）；W×H＝插圖清單「規格」寫的建議尺寸（viewBox 單位＝1 px）。比例差超過 2% 算錯 | ✔ |
| 形狀 | 只用 `g`、`rect`、`circle`、`ellipse`、`line`、`polyline`、`polygon`、`path`；path 點要少（一條 path 的數字 ≤ 80 個，多了 ⚠） | ✔ |
| 不能用 | `text`（字由 HTML 寫在元件旁邊，≤ 10 字）、`image`、漸層、`filter`（光暈、陰影）、`pattern`、`mask`、`clipPath`、`use`、`style`、`script` | ✔ |
| 描邊寬 | 只有三級：外框 4、內部零件 3、細節 2；有描邊的形狀都寫 `stroke-width` | ✔ |
| 描邊縮放 | 每個有描邊的形狀都寫 `vector-effect="non-scaling-stroke"`（不會從 `<g>` 繼承，要寫在形狀上） | ✔ |
| 線頭與轉角 | `stroke-linejoin="round" stroke-linecap="round"` | |
| 圓角 | 外框 `rx` 8–16；內層、螢幕 4–8 | |
| 顏色 | `fill`／`stroke` 只寫 `none` 或下表的 `var(--il-*)`；不寫色碼、`rgb()`、色名 | ✔ |
| 用色 | 主體＝`--il-body` 實心＋`--il-line` 4 px 描邊；內層＝`--il-inner`（不描邊或 3 px）；重點（主色）一個元件只用一處 | |
| 細長零件 | 天線、支架、把手畫成有 `--il-body` 填色的窄形狀（polygon、rect）再描邊，不要只畫一條 `--il-line` 線：插圖疊在實拍或深色底上時，單獨一條線會不見 | |
| 狀態 | 要變化的部分包成 `<g class="il-<狀態>" style="opacity:0">`，預設 opacity 0；底圖畫「沒有狀態」的樣子 | ✔ |
| id | 不寫 `id`（同一個元件會掛好幾次）；要抓的部分用 `class="il-<名稱>"` | ✔ |
| 事件、外部引用 | 不寫 `on*`、`href`、`filter=`、`mask=`、`clip-path=` | ✔ |
| style 屬性 | 只寫 `opacity`、`transform-box`、`transform-origin` | ✔ |

顏色 token（值在 `kit/illus.css`，亮色、暗色主題各一組；主色、紅、綠兩個主題相同）：

| token | 用在 |
|---|---|
| `--il-body` | 主體填色（亮色主題＝白，像白板上的線稿；暗色主題＝石墨，像黑板） |
| `--il-inner` | 內層、螢幕、面板 |
| `--il-line` | 描邊 |
| `--il-sub` | 次要線（散熱孔、內容線） |
| `--il-accent` | 重點＝主色（播放、箭頭、進度） |
| `--il-on-accent` | 主色底上的符號 |
| `--il-accent-soft` | 主色淡填色（範圍、照射區） |
| `--il-warn` | 紅：錯誤、錄影點、警示 |
| `--il-good` | 綠：正常、完成 |
| `--il-alt` | 第二個人物的衣服 |

## 4. 範例：router（220×120，狀態 `led`、`warn`）

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120" fill="none">
  <polygon points="40,46 52,46 40,3 32,3" fill="var(--il-body)" stroke="var(--il-line)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  <polygon points="168,46 180,46 188,3 180,3" fill="var(--il-body)" stroke="var(--il-line)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  <rect x="30" y="100" width="28" height="18" rx="4" fill="var(--il-inner)" stroke="var(--il-line)" stroke-width="3" vector-effect="non-scaling-stroke"/>
  <rect x="162" y="100" width="28" height="18" rx="4" fill="var(--il-inner)" stroke="var(--il-line)" stroke-width="3" vector-effect="non-scaling-stroke"/>
  <rect class="il-body" x="2" y="44" width="216" height="62" rx="14" fill="var(--il-body)" stroke="var(--il-line)" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  <rect x="18" y="58" width="184" height="34" rx="8" fill="var(--il-inner)"/>
  <circle cx="44" cy="75" r="7" fill="var(--il-body)" stroke="var(--il-sub)" stroke-width="2" vector-effect="non-scaling-stroke"/>
  <circle cx="72" cy="75" r="7" fill="var(--il-body)" stroke="var(--il-sub)" stroke-width="2" vector-effect="non-scaling-stroke"/>
  <circle cx="100" cy="75" r="7" fill="var(--il-body)" stroke="var(--il-sub)" stroke-width="2" vector-effect="non-scaling-stroke"/>
  <line x1="136" y1="68" x2="186" y2="68" stroke="var(--il-sub)" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  <line x1="136" y1="82" x2="186" y2="82" stroke="var(--il-sub)" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  <g class="il-led" style="opacity:0">
    <circle cx="44" cy="75" r="7" fill="var(--il-good)"/>
    <circle cx="72" cy="75" r="7" fill="var(--il-good)"/>
    <circle cx="100" cy="75" r="7" fill="var(--il-good)"/>
  </g>
  <g class="il-warn" style="opacity:0">
    <circle cx="44" cy="75" r="7" fill="var(--il-warn)"/>
    <circle cx="72" cy="75" r="7" fill="var(--il-warn)"/>
    <circle cx="100" cy="75" r="7" fill="var(--il-warn)"/>
  </g>
</svg>
```

插圖清單那一列的寫法（`#### 插圖清單 <段 id>` 底下）：

```
| router | 新建 SVG | 規格：router，建議尺寸 220×120，狀態 led／warn；描述：橫式機身＋兩根天線＋前面板三顆燈 |
```

## 5. 檢查

```
node shared/template/tools/media.mjs illus-lint --project projects/<專案> --no-sheet
```

逐條查 §3 表上打 ✔ 的項目。只看 `[illus-local/<名稱>.svg]` 那幾行（別的檔的 ✖ 不用管）：✖ 全部修掉；⚠ 照它的 → 改，或在 `work/reports/` 寫為什麼保留。尺寸和狀態照 `work/storyboard.md` 的插圖清單查；插圖清單寫在 `work/designs/<段 id>.md` 時工具讀不到，會印「…沒有這個元件的「新建 SVG」列…」的 ⚠，這個 ⚠ 可以留著，自己對一次 viewBox＝`0 0 W H`、每個狀態都有 `<g class="il-<狀態>" style="opacity:0">`。

lint 過了還要看圖：設計師看 audit 的拼圖（`work/audit-shots/sheet-<段 id>.jpg`），主代理跑不帶 `--no-sheet` 的 illus-lint 會拼 `work/插圖清單.jpg`。和旁邊的畫廊元件比，線粗、圓角、用色要看起來是同一套。
