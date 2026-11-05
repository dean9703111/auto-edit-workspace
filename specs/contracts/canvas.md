# 契約：畫布設定（canvas）

- **擁有者**：002 pipeline-timing（`shared/template/tools/lib/canvas.mjs`）。**照它做**：003（audit 直式規則、custom 預覽、fx 圖庫）、004（`lib/media.mjs` 座標系、`qc.mjs`、`brand.mjs`）、006（`lib/ff.mjs` 底片編碼、剪輯台）、001（AGENTS.md、style.md「直式」節的數字；`docs.test.mjs` T30 比對三處）。
- **版本**：2026-10-31（009 直式；草稿原在 `specs/009-vertical/spec.md` §B，整合時搬到這裡）。
- **數字以 `canvas.mjs` 為準**：本檔的表是抄錄；兩邊不同時改本檔。直式的程式路徑一律讀 `canvasOf(format)`，不准再寫死數字；橫式既有常數可以留在原檔（橫式輸出逐位元組不變），由 `dev/tests/canvas.test.mjs` 確認和 `CANVAS.landscape` 相同。
- **矩形寫法**：`pip.box` 與 `regions` 是 `[x, y, w, h]`；其他一律 `[x0, y0, x1, y1]`。

## 1. 匯出

| 名稱 | 回傳 | 用在 |
|---|---|---|
| `FORMATS` | `['landscape', 'portrait']` | plan.mjs 驗證 `format` |
| `CANVAS`、`canvasOf(format)` | 該版式的設定（§2）；`format` 不是兩者之一就丟錯 `format 只能是 "landscape" 或 "portrait"（現在是 …）` | 全部 |
| `stageTransform(kind, canvas, { clear })` | `{ kind, s, tx, ty, window, rect, css, attr }`；橫式回 `null`（§4） | main、audit、custom-preview、qc |
| `stagePoint(st, [x, y])` | 子合成座標 → 畫布座標 | audit、qc |
| `regionsOf(canvas)`、`regionsScript(canvas)` | 具名區域（§5）；直式的 `<script>window.__regions = {…};</script>`，橫式 `''` | main（注入在 `kit/scene-motion.js` 之前） |
| `probeDims(file)` | 主軌顯示方向的 `{ w, h }`（手機直拍 1920×1080＋rotation −90 → 1080×1920） | resolveFormat、build |
| `resolveFormat({ projectDir, plan, flag, probe })` | `{ format, source, detail }`（§3） | build、status、media.mjs、qc、audit、editor |
| `formatLine(r)` | `版式：直式 1080×1920（來源：plan.json）` | 各指令的版式行（`cli-002.md` §1.0） |
| `formatErrors({ projectDir, plan, format, dims })` | ✖ 訊息陣列（§3.1） | build `--check`／build |
| `captionZoneArg(canvas)` | `hyperframes check --caption-zone` 的值（§2.1） | build 結尾那一行 |

## 2. 值

| 鍵 | landscape | portrait | 誰用 |
|---|---|---|---|
| `W`、`H`、`fps` | 1920、1080、30 | 1080、1920、30 | 全部 |
| `unsafe[]` | `[]` | `[[0,0,1080,240],[0,1440,1080,1920],[940,840,1080,1440]]`（平台介面：頂端、底部、右側按鈕列） | audit、plan footprint ⚠、media 擺位、qc 疊圖 |
| `textSafe[]` | `[[0,120,1920,870]]` | `[[60,240,1020,840],[60,840,940,1440]]` | 同上 |
| `caption` | `{ font: 76, line: 71, weight: 400, stroke: 0, pad: [24,37,23], bottom: 6, box: [40,956,1880,1074], zone: [0,920,1920,1080], maxChars: 18, maxW: 1840 }` | `{ font: 76, line: 71, weight: 400, stroke: 0, pad: [24,37,23], bottom: 511, box: [123,1291,957,1409], zone: [0,1280,1080,1420], maxChars: 10, maxW: 834 }` | captions.css、captions.mjs、srt-align／srt-split、`--check` ⚠、剪輯台、`--caption-zone` |
| `lowerThird` | `{ left: 120, bottom: 220, rect: [120,536,1020,860] }` | `{ left: 60, bottom: 680, rect: [60,880,940,1240] }` | scenes `@style-portrait`、FOOTPRINT |
| `centerCard` | `{ rect: [510,536,1410,860] }` | `{ left: 60, right: 140, rect: [60,880,940,1240] }` | 11、15 |
| `badge` | `{ rect: [1200,56,1824,168], side: 'right', dx: 16 }` | `{ rect: [60,250,684,362], side: 'left', dx: -16 }` | 常駐章節角標、02 |
| `pip` | `{ box: [1424,594,432,324], zone: [1424,581,1888,951], aspect: 4/3, frame: 'kit/pip-frame.png' }` | `{ box: [0,900,1080,1020], zone: [0,900,1080,1920], aspect: 1080/1020, frame: 'kit/pip-frame-v.png', face: [940,1280] }`（直式完成影片的分割線是 CSS，§6） | main、plan、media、qc、剪輯台 |
| `stage.fs` | `null` | `{ window: [120,130,1300,880], to: [40,240], scale: 0.8475 }` | 04 家族、custom fullscreen |
| `stage.fx` | `null` | `{ opaque: { top: 416, scale: 0.5625 }, clear: { top: 766, scale: 0.5625 } }` | fx |
| `stage.ch` | `null` | `{ window: [160,260,1760,870], scale: 0.625, centerY: 860 }` | 01 章節 |
| `media.view` | `{ contain: [0,0,1920,940], cover: [0,0,1920,1080] }` | `{ contain: [0,240,1080,900], cover: [0,0,1080,900], containFull: [0,240,1080,1260], coverFull: [0,0,1080,1920] }`（`Full`＝沒有講者面板） | lib/media.mjs `mediaFrame`（plan.mjs 呼叫 `validateMedia` 時傳 `canvas: C`；`contracts/media.md` §4） |
| `framing` | `{ aspect: 16/9, headTop: 120 }` | `{ aspect: 9/16, headTop: [380,520], chinMax: 860 }` | qc framing、ff.mjs `frame` 寬高比 |
| `minTextPx` | 30 | 32（輸出像素） | audit |
| `regions` | §5 | §5 | main、kit/scene-layout.js、P.region |

### 2.1 字幕（決定 2）

直式和橫式同一套樣式（76 px、字重 400、無描邊、黑底 70 %、底板高 118＝內距上 24／下 23＋行高 71、左右內距 37、只排一行），只差兩件事：

- **每則最多 10 字**（`maxChars`）：10 × 76 ＋ 內距 74 ＝ 834＝`maxW`，底板置中在 x 123–957。`captionWarnings`、`--check` 的字數 ⚠、srt-align／srt-split 的預設 `--max`、剪輯台的字數提醒都讀它。
- **位置**：底板 118 高置中在字幕帶 `zone` y 1280–1420 裡＝`box` y 1291–1409，`bottom`＝1920 − 1409＝511（橫式距底 6）。字幕帶在講者面板的臉（`pip.face` y 940–1280）下面、平台底部介面（y 1440 起）上面。`kit/captions.css` 用 `[data-format="portrait"] .cg { bottom: 511px; }`，captions 子合成 root 帶 `data-format="portrait"`。
- 為什麼是 10 字（2026-10-31 主代理決定，取代原本的 12 字）：12 字的底板寬 986、置中 x 47–1033，右端壓進 `unsafe` 右側平台按鈕列 `[940,840,1080,1440]` 93 px；10 字只到 x 957，碰到按鈕列邊緣 17 px，可接受。字級 76 與位置不變；拆句變碎的代價由 `#N@詞` 綁詞吸收。
- `captionZoneArg`：`zone` 換成比例、小數 3 位：橫式 `x0=0;y0=0.852;x1=1;y1=1;severity=error`、直式 `x0=0;y0=0.667;x1=1;y1=0.74;severity=error`。

## 3. 版式從哪來（`resolveFormat`）

順序：`flag`（`--format`，收 `landscape`／`portrait`／`橫式`／`直式`，其他值丟錯）→ plan.json `format` → `work/製作進度.md` 開工決策表「版式」列（`/^\|\s*版式\s*\|\s*(直式|橫式)/m`）→ 主軌寬高比（`work/main.mp4`，沒有就 `素材/真人錄影/` 第一支；寬 < 高＝直式）→ 只有 `素材/聲音/`＝橫式 → 預設橫式。

| `source` | `detail`（版式行括號裡） |
|---|---|
| `flag` | `--format` |
| `plan` | `plan.json` |
| `progress` | `work/製作進度.md` |
| `media` | `work/main.mp4 1080×1920`、`素材/真人錄影/a.mov 1080×1920`、`只有聲音（素材/聲音/）` |
| `default` | `預設` |

### 3.1 `formatErrors`（009 FR-004、決定 5）

1. plan.json 的 `format` 和開工決策表「版式」不同 → ✖（列出兩邊與改法）。
2. 開工決策表是直式、plan.json 沒寫 `format` → ✖ 加 `"format": "portrait"`。
3. 主軌直拍（寬 < 高）而版式是橫式 → ✖。
4. 直式專案的主軌是橫的 → ✖「請提供直拍素材」（橫轉直是 P2）。

原文見 `cli-002.md` §1.0；進 `--check --json` 的 `errors` 最前面。

## 4. 舞台縮放（`stageTransform`，009 FR-011；spike 見 `specs/009-vertical/plan.md` D-1）

- 換算：`X = to[0] + (x − window[0]) × s`、`Y = to[1] + (y − window[1]) × s`；host 的 CSS `transform: translate(tx, ty) scale(s); transform-origin: 0 0;`，`tx = to[0] − window[0] × s`、`ty = to[1] − window[1] × s`，小數 3 位。
- `window` 是 `[x0, y0, x1, y1]`：fs `[120,130,1300,880]`＝1180×750，× 0.8475＝1000×636 → `translate(-61.7px, 129.825px) scale(0.8475)`。
- fx：`s` 0.5625、水平置中（`tx` 0），`top` opaque 416／clear 766（`bg: none` 用 clear）。ch：`window` 的中心放到 `(W/2, centerY)`。
- host 要加 `attr`＝`data-layout-allow-overflow`（縮放後子合成超出畫布，不加 `hyperframes check` 報 `panel_out_of_canvas`）。
- transform 寫在 host 的 CSS（main 寫 inline style），main 的 GSAP 對 host 只動 `opacity`；擦入擦出、片尾淡出同時動 host 與 backdrop。
- backdrop：host 下面一層 1080×1920 純色（fs `var(--sc-fs-bg)`、ch `var(--sc-ch-bg)`、fx 照 `bg`：dark `#232733`、light `#f3efe6`、accent `var(--brand)`；`bg: none` 沒有），和 host 同起迄、同進退場。

## 5. 具名區域（`regions`，`[x, y, w, h]`；`contracts/motion.md` §1）

| 名稱 | landscape | portrait |
|---|---|---|
| `band` | `[120,600,1680,260]` | `[60,880,880,360]` |
| `panelTop` | `[120,150,1180,708]` | `[0,0,1080,900]` |
| `panelBottom` | — | `[0,900,1080,1020]` |
| `pip` | `[1424,594,432,324]` | `[0,900,1080,1020]` |
| `badge` | `[1560,40,320,100]` | `[60,250,624,112]` |
| `captions` | `[0,920,1920,160]` | `[0,1280,1080,140]` |
| `safe` | `[96,54,1728,972]` | `[60,240,960,1200]` |

橫式不注入（`kit/scene-motion.js` 的 `REGIONS` 預設就是橫式這組）；直式由 main 在 `kit/scene-motion.js` 之前注入 `window.__regions`，`kit/scene-layout.js` 與 `P.region` 都讀它。

## 6. 講者面板（直式 `pip`）

- 本體＝`pip.box`（上下分割的下半 1080×1020），`overflow: hidden`；分割線是 main 畫的一條 6 px 主色線（`<div>`，`top: 897px`、`background: var(--brand)`，換主色自動跟著變）。完成影片**不用** `kit/pip-frame-v.png`：那張（004 的 brand.mjs 產生，1080×1920 透明、y 897–903 主色線）只給 brand 預留與剪輯台（006）顯示用；`pip.frame` 指向它。
- 飛入起點（FLY）讀 `pip.box`；裁切寬高比 `pip.aspect`；`pipCrop: "auto"` 讓頭頂落在面板頂端下 40 px、裁切寬 clamp(講者框寬 × 1.3, 540, 1080)。
- 臉的估計位置（speakerBox 上緣＋框高 30 %）超出 `pip.face` y 940–1280 → ⚠ 附 `pipCrop` 建議值。

## 7. 測試（`dev/tests/canvas.test.mjs`、`build.test.mjs`、`plan.test.mjs`、`scenes.test.mjs`）

1. `CANVAS.landscape` 等於 main／plan／captions 的橫式常數。
2. 直式值：每個矩形在畫布內；`regions` 和 §2 同一組數字；字幕 10 字放得進 `maxW` 834、右緣最多碰 `unsafe` 右側按鈕列 17 px。
3. `stageTransform` 三種 kind 的 `css`、`rect`；橫式 `null`。
4. `resolveFormat` 每個來源；`probeDims` 轉回顯示方向；`formatErrors` 四條；`captionZoneArg` 兩個版式。
5. 直式 fixture（`dev/tests/fixtures/portrait`）build：index.html 1080×1920、舞台縮放＋backdrop、講者面板、角標左上 y 250、`window.__regions`、captions `data-format="portrait"`、底片編成 1080×1920。
