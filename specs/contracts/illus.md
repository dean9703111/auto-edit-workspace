# 契約：illus（`kit/illus.js`＋`kit/illus.css` 示意插圖元件、`tools/lib/illus-lint.mjs` 風格檢查）

- **擁有者**：011 示意動畫第一棒（搬庫）。**照它做**：003（`custom/x-scene.html` 骨架載入與 mount、audit 的元件白名單與 illus-lint 接線）、002（主合成 `index.html` 與 `--gallery` 預覽頁加 `kit/illus.css`／`kit/illus.js`、`media.mjs illus-lint`）、001（storyboard 的「素材清單」、motion 的「缺的先造」、BEATS／SITUATIONS 的示意動畫列）。
- **版本**：1（2026-10-31）。來源：作者 agent-skills repo `video/surfshark_esim/esim_backup/hyperframes/shared/illus.js`（esim ep2，68 份複本 md5 相同）。幾何、class、opts 原樣搬：把 token 換回原色碼後，73 組 opts 的輸出和來源逐字相同（只換顏色與字型）。
- 元件清單、子元素 class 由 `dev/tests/illus.test.mjs` 逐項檢查；新增或改名元件要一起改這份與測試。
- 數量：**22 個元件**（`COMP` 登記的函式）＋ 8 種螢幕狀態（video／play／rec／check／warn／shorts／qr／app）。brief 寫的「28 個」是當時的 20 個元件加 8 種狀態（015 加了 pgPerson、stage）。

## 1. 檔案

| 檔 | 內容 |
|---|---|
| `shared/template/kit/illus.js` | 純 script（不是 module、零相依）。`window.ILLUS`：22 個元件函式、`mount`、`register`、`textWidth` |
| `shared/template/kit/illus.css` | `.il` 容器樣式＋`--il-*` 顏色 token（亮：`:root`；暗：`:root[data-theme="dark"]`） |
| `shared/template/kit/illus-gallery.html` | 畫廊：兩欄 iframe（本檔 `?theme=light`／`?theme=dark`），每個元件、每個狀態一格，格下標 `data-*` 寫法 |
| `shared/template/kit/illus-gallery.jpg` | 畫廊截圖（1920 寬；截圖當下的主色）。重截：`node dev/tools/illus-gallery-shot.mjs` |
| `shared/template/kit/illus-style.md` | 自己畫新元件的風格契約（給工人看）＋ router 範例 |
| `shared/template/tools/lib/illus-lint.mjs` | `lintIllusSvg(svgText, { name, size, states })` 純函式 |

build 複製 `kit/` 時略過 `illus-gallery.html`、`illus-gallery.jpg`、`illus-style.md`（002，`build.mjs` 的 `copyDir` 略過清單；約 1.7 MB 不進每個專案），`illus.js`／`illus.css` 照常複製。主合成 `index.html`、`--gallery` 預覽頁、custom 預覽頁的 head 都載這兩個檔（§5.1）。

## 2. 元件表

opts 寫成 HTML 屬性時是 `data-<opt>`（數字、布林自動轉型）。建議尺寸＝viewBox（1:1 px），外層元素寫同比例的 width／height。用色欄的 token 意思見 §3。

| 元件 | opts（* 預設） | 子元素 class | 建議尺寸 | 用色 |
|---|---|---|---|---|
| `phone` | `orient`: portrait*／landscape；`screen`: blank*／video／play／rec／check／warn／shorts／qr | `.il-body` `.il-screen` ＋狀態 `.il-content` `.il-play` `.il-rec` `.il-check` `.il-warn` `.il-shorts` `.il-qr` | 直 120×250、橫 250×120 | body＋line 4、螢幕 inner；狀態：accent／on-accent（play）、warn（rec、warn）、good（check） |
| `tripod` | — | `.il-legs` `.il-tripod-head` | 140×180 | body／inner＋line 3–4 |
| `phoneTripod` | 同 phone | phone 的＋tripod 的 | 直 140×360、橫 260×300 | 同 phone＋tripod |
| `laptop` | `screen`: blank*／video／play／rec／check／warn／app | `.il-screen` ＋狀態 `.il-content` `.il-play` `.il-rec` `.il-check` `.il-warn` `.il-app` | 280×190 | body＋line 4、螢幕 inner；app 視窗點 warn／accent／good、內容線 sub |
| `monitor` | 同 laptop | 同 laptop | 360×300 | 同 laptop |
| `cloud` | `arrow`: none*／up／down | `.il-arrow`（none 時 opacity 0 仍在） | 220×150 | body＋line 4；箭頭 accent |
| `personBust` | `tone`: a*／b | `.il-head` `.il-talk`（三條弧，預設 opacity 0） | 160×170 | body＋line；衣服 inner（a）／alt（b）；說話弧 accent |
| `pgPerson` | `pose: stand*\|walk\|point`、`tone: a*\|b\|accent` | `.il-head` `.il-torso` `.il-arms` `.il-legs` `.il-hi`（主色軀幹，預設 opacity 0） | 120×284 | body＋line；torso inner／alt／accent（015） |
| `personTop` | — | `.il-head` `.il-face`（面朝方向） | 110×72 | inner／body＋line；face accent |
| `desk` | — | `.il-desk` `.il-laptop` | 320×150 | inner／body＋line；內容線 sub |
| `stage` | — | `.il-top`（頂面）`.il-front`（正面）`.il-side`（右側面） | 960×180 | 頂面 body＋line 4；正面 accent；側面 inner（015：2.5D 地台，x-desk 用） |
| `cone` | `angle`: 50*（度）；`len`: 300*；`fill`: false*／true | `.il-cone`（頂點在左、朝右） | 寬 len+4、高 2·len·sin(angle/2)+4（預設 304×257.6） | accent 虛線；fill＝accent-soft（兩個主題相同） |
| `waveform` | `bars`: 28*；`seed`: 1*；`color`: white*／yellow（＝主色）／red | `.il-bar`（scaleY，transform-box 已設） | 360×90 | 柱 line／accent／warn＋body 2 px 描邊 |
| `progress` | — | `.il-track` `.il-fill`（scaleX，origin 左） | 320×28 | track inner＋line 2；fill accent |
| `energy` | — | `.il-body` `.il-cell`（5 格） | 220×90 | body＋line；格 good（改紅：`setAttribute('fill','var(--il-warn)')`） |
| `fileVideo` | — | `.il-play` | 100×120 | body／inner＋line；三角 accent |
| `window` | `title`: ''* | `.il-title` `.il-content`（空 `<g>`，內容區 x2..478、y48..298） | 480×300 | 標題列 body、內容 inner、框 line；三點 warn／accent／good；標題字 sub |
| `searchBar` | `text`: ''* | `.il-text`（32 px 字）`.il-caret` | 640×84 | body＋line；字 line |
| `badge` | `kind`: check*／cross／warn | `.il-badge` | 72×72 | good／warn／accent 底＋line；warn 的驚嘆號 on-accent |
| `recPill` | — | `.il-dot` `.il-time`（tabular-nums）`.il-label` | 200×60 | body＋line；點 warn、REC line、時間 sub |
| `stopwatch` | — | `.il-hand`（svgOrigin "110 135"）`.il-sweep`（pathLength 100、dashoffset 100→0）`.il-ticks` | 220×240 | body／inner＋line；sweep accent（唯一不是 non-scaling 的描邊） |
| `hourglass` | `sand`: top*／flow／bottom | `.il-glass` `.il-sandtop`（等比縮到 0，svgOrigin "100 156.5"）`.il-sandbot`（等比 0→1，svgOrigin "100 276"）`.il-stream` | 200×300 | inner＋line；沙 accent；底座 body |
| `bookmark` | `saved`: false*／true | `.il-off` `.il-on`（opacity 切換） | 220×72 | body＋line；已儲存 accent |

螢幕狀態在 phone／phoneTripod／laptop／monitor 都已畫好，只有 `screen` 指定的那個 opacity 1；切換用 GSAP 動 opacity（`P.in`／`P.out`／`P.swap`）。

## 3. 顏色 token（`kit/illus.css`）

illus.js 的 `fill`／`stroke` 屬性只寫 `var(--il-*)` 或 `none`（Chrome 的 SVG 呈現屬性吃 `var()`；`setAttribute('fill', …)` 照常蓋得過去，CSS 不會擋）。

| token | 接到 | 亮色（:root）實際值 | 暗色（data-theme="dark"）實際值 | 原色（ep2） |
|---|---|---|---|---|
| `--il-body` | `var(--sc-card-solid, #0B1020)`（兩個主題都接） | #141414 | #121418 | #0B1020 |
| `--il-inner` | 亮：`var(--sc-plate, #1E2740)`；暗：#262A33（暗色 `--sc-plate` 混了主色，不用） | #2A2522 | #262A33 | #1E2740 |
| `--il-line` | 亮：`var(--sc-ink, #FFFFFF)`；暗：`var(--v2-ink, #F3EFEA)` | #FFFFFF | #F3EFEA | #FFFFFF |
| `--il-sub` | 亮：`var(--sc-mute, …)`；暗：自己的值 | rgba(255,255,255,.78) | rgba(243,239,234,.78) | rgba(255,255,255,.78) |
| `--il-accent` | `var(--brand, #FFD400)` | #F6630F | 同左 | #FFD400 |
| `--il-on-accent` | `var(--brand-ink, #0B1020)` | #FFFFFF | 同左 | #0B1020（原本寫 BODY） |
| `--il-accent-soft` | `color-mix(in srgb, var(--il-accent) 16%, transparent)` | 主色 16% | 同左 | rgba(255,212,0,.16) |
| `--il-warn` | `var(--sc-warn, #E0202A)` | #E0202A | 同左 | #E0202A |
| `--il-good` | `var(--sc-good, #2FB36B)` | #2FB36B | 同左 | #2FB36B |
| `--il-alt` | 自己的值 | #2A2140 | #2C2536 | #2A2140 |

- 亮色值是目前 theme.css（2026-10-30 淺色版）＋brand.css 的計算結果；theme.css 改了，亮色的 body／inner 會跟著變（測試比的是「等於來源 token 的計算值」，不寫死數字）。
- 亮色主題元件本體仍是深色（深色實心＋白描邊），和 ep2 畫廊的淺底版一致。白描邊在淺底上看不太到，元件靠深色實心辨識；所以細長零件要畫成有填色的窄形狀（illus-style.md「細長零件」）。
- 主色、紅、綠兩個主題相同（scene.css 的 `--brand`／`--sc-warn`／`--sc-good` 不分主題）；只用這三色的 `cone` 在兩個主題長得一樣。
- 字：`font-family` 屬性是 `var(--font-cjk, sans-serif)`；`.il>svg text` 另有 CSS 規則（同一個 token）。

## 4. API

| 呼叫 | 行為 |
|---|---|
| `ILLUS.<元件>(opts)` | 回傳 SVG 字串（用法二） |
| `ILLUS.mount(root = document, { force })` | 把 root **底下**（不含 root 自己）還沒掛過的 `[data-illus]`／`[data-illus-src]` 換成 SVG、加 class `il`。**已經掛過的跳過**（和 ep2 不同：ep2 每次重畫）——同一份文件有好幾個子合成，重掛會把別段已綁好 tween 的子元素換掉。`{force:true}` 才重畫（動畫狀態重置）。illus.js 載入時自動跑一次 `ILLUS.mount()` |
| `ILLUS.register(name, fn)` | 加專案元件：`name` 符合 `/^[a-z][A-Za-z0-9]*$/`，不能是 21 個內建元件或 `mount`／`register`／`textWidth`（丟錯）；同名的專案元件可以重新登記。之後 `data-illus="<name>"`、`ILLUS.<name>(o)` 都能用 |
| `data-illus-src="illus-local/<name>.svg"` | mount 時**同步** XMLHttpRequest 讀檔、去掉 `<?xml?>`／DOCTYPE 後放進元素。路徑相對文件（主合成 `index.html`＝`work/hyperframes/`）。同一網址只讀一次。讀不到 → `console.error('[ILLUS] 讀不到 data-illus-src=…')` 一次、元素留空並標成掛過。audit 現在把它列成 ⚠「頁面 JS 錯誤」（`scriptErrors` 只把 `composition script error:` 算 ✖）；要升成 ✖ 由 003 在 `scriptErrors` 認 `[ILLUS]` 開頭。不丟例外：丟了整段時間軸都建不起來 |
| `ILLUS.textWidth(str, size)` | 估字寬（searchBar 游標） |

### 為什麼 `data-illus-src` 用同步讀檔

brief 給的兩條路：(a) build 前先 inline、(b) mount 時 fetch 再補畫並回傳 promise。選了「mount 時讀，但同步」：

- (b) 的 promise 不安全：HyperFrames runtime 的 `runScripts` 會 `await` 子合成的外部 `<script src>`，但 inline script 一跑完就算完成，不等裡面的 promise。timeline 在 SVG 到之前就建好，`P.in('#x .il-led')` 抓到空集合；render 的第一批格子也可能先截。
- (a) 要 build 改寫工人手寫的 `compositions/x-*.html`（USAGE-reference R7.2：build 不碰這個檔），SVG 改了還要重 build；`--gallery` 預覽、直接開 x 檔都看不到。
- 同步讀：composition script 第一行 `ILLUS.mount(root)` 回來時 SVG 已在 DOM，之後建的 tween 和內建元件一樣有對象；不靠回呼、不靠時間，任意 seek 結果相同。實測（2026-10-31，HyperFrames runtime 0.8.223、chrome-headless-shell 152）：子合成內 `data-illus-src` 的 `.il-led` 在 script 執行時已存在；`P.in`／`P.out` 狀態群組在 6 個時間點亂序 seek 與順序 seek 的 opacity 相同，`npx hyperframes snapshot` 兩組 PNG md5 逐張相同。
- 代價：主執行緒同步 XHR 是 Chrome 標「不建議」但仍支援的 API（會在 DevTools 印 deprecation，不是 console.error）；`file://` 直接開檔讀不到（preview／snapshot／render／audit 都走 http，沒影響）。`--gallery` 的 custom 預覽頁是 file:// 時，`data-illus-src` 會是空的（內建元件不受影響）。

## 5. 掛載規則（給 003 的 x-scene 骨架）

1. 主合成 `index.html` 的 `<head>`（002，`lib/main.mjs`）：`<link rel="stylesheet" href="kit/illus.css">`（放 `KIT_LINKS` 之後）、`<script src="kit/illus.js"></script>`（GSAP、scene-motion 之後）。`--gallery` 的 custom 預覽頁（`lib/custom-preview.mjs`）同樣兩行。
2. 子合成 script 第一行：`ILLUS.mount(document.getElementById('<root id>'));`，再 `gsap.timeline`、`SceneMotion(tl, root)`。不要呼叫不帶 root 的 `ILLUS.mount()`（雖然現在會跳過掛過的，仍會掃整份文件）。
3. 子元素用 `#<root id> .il-<名稱>` 或 `#<元件 id> .il-<名稱>` 選；元件容器要有 id 才能被 audit 量到（R7 的規則照舊），SVG 裡沒有 id。
4. 狀態切換只動 opacity（`P.in`／`P.out`／`P.swap`）。`setAttribute('fill', 'var(--il-warn)')` 是靜態換色（整段都是那個色）；要隨時間變色就畫兩組狀態群組交叉淡化，不補間顏色（R7.3「不要用 GSAP 補間顏色」）。
5. audit 量版面時元件容器是一般的絕對定位元素；`.il>svg` 是 `overflow:visible`，描邊一半會超出 viewBox 2 px，容器邊緣量測要留 2 px。
6. 白名單：分鏡「插圖元件」欄的名稱要在 §2 的 21 個，或是 `register` 過的名稱，或 `illus-local/*.svg` 有檔。
7. 讀不到的 `data-illus-src` 目前在 audit 是 ⚠（見 §4）；建議 003 把 `[ILLUS]` 開頭的頁面錯誤升成那一段的 ✖。

## 6. `lintIllusSvg(svgText, { name, size, states })`

回傳 `[{ level: 'error'|'warn', rule, msg, fix }]`（和 audit finding 同欄位；接線時補 `id`、檔名）。`size` 接受 `[w,h]`、`{w,h}`、`'220x120'`／`'220×120'`。也匯出 `IL_TOKENS`（＝illus.css `:root` 的 10 個 token，測試比對）、`STROKE_WIDTHS`、`SHAPES`。

| rule | level | 條件 |
|---|---|---|
| `illus-parse` | error | XML 結構錯（沒關、交錯） |
| `illus-root` | error | 最外層不是唯一一個 `<svg>` |
| `illus-viewbox` | error | viewBox 不是 `0 0 W H` |
| `illus-ratio` | error | viewBox 比例和 `size` 差 > 2% |
| `illus-size` | warn | 比例對但 W×H ≠ size（±1） |
| `illus-element` | error | 元素不在 svg／g／title／desc／rect／circle／ellipse／line／polyline／polygon／path（text、image、漸層、filter、fe*、pattern、mask、clipPath、use、defs、symbol、marker、style、script、foreignObject 各有改法） |
| `illus-id` | error | 有 `id` |
| `illus-attr` | error | `filter=`、`mask=`、`clip-path=`、`href`、`xlink:href`、`on*` |
| `illus-style` | error | `style` 寫了 opacity／transform-box／transform-origin／fill／stroke／stroke-*／vector-effect 以外的屬性 |
| `illus-color` | error | `fill`／`stroke`／`color`／`stop-color`／`flood-color`／`lighting-color`（屬性或 style）不是 `none` 或 `var(--il-<10 個之一>)`；其他屬性裡出現 `#hex`、`rgb()`、`hsl()`、`color-mix()` |
| `illus-stroke` | error | 有描邊（含從 `<g>` 繼承）的形狀 `stroke-width` 不在 {4,3,2}（沒寫＝1）；或形狀上沒寫 `vector-effect="non-scaling-stroke"` |
| `illus-path` | warn | 一條 path 的 `d` 超過 80 個數字 |
| `illus-empty` | error | 沒有任何形狀 |
| `illus-state` | error／warn | `states` 列的狀態沒有 `<g class="il-<狀態>">`（error）；有但預設不是 opacity 0（warn） |

測試：`illus-style.md` 的 router 範例 0 則；三個不合格樣本各自抓到 color／element（漸層）、stroke／element（text、image）／attr／style、ratio／state／id／path。內建元件不跑 lint（它們有 `<text>`、`.il-sweep` 例外，規則是給新畫的元件）。

### 6.1 CLI：`media.mjs illus-lint`（002）

```
node shared/template/tools/media.mjs illus-lint --project projects/<專案> [--no-sheet]
```

| 項目 | 規則 |
|---|---|
| 掃哪些檔 | `work/hyperframes/illus-local/*.svg`（檔名＝元件名；不改任何 SVG） |
| `size`／`states` | 從 `work/storyboard.md` 的插圖清單讀：`#### 插圖清單 <段 id>`（舊名「素材清單」也認：表前最近的標題或上一行有這四個字）底下、表頭有「元件」「來源」兩欄的表。「來源」含「新建」的列：名稱＝「規格：`<name>`」（沒寫就取「元件」欄開頭的英文名）、尺寸＝「尺寸」後第一個 `W×H`、狀態＝「狀態」後到「描述」前，去掉括號說明、`.il-` 前綴，以 `／`、`、`、逗號、空白分開。「來源」含「畫廊」的列：`data-illus="…"` 與其他 `data-*`（拼圖用） |
| 讀不到規格 | 這個檔只跑不需要 `size`／`states` 的規則，另加 ⚠（插圖清單沒有這一列，或這一列沒寫尺寸） |
| 插圖清單列了新建 SVG、沒有檔 | ✖ `[插圖清單] 新建 SVG「<name>」還沒有檔` |
| 畫廊列的名稱不是 21 個內建元件 | ⚠（拼圖時發現） |
| 輸出 | `illus-local：N 個 SVG（…）` 或 `illus-local：無`；每則 `✖／⚠ [illus-local/<檔>] <msg> → <fix>`（✖ 先、⚠ 後）；沒有任何 finding 的檔 `✓ illus-local/<檔>`；最後一行 `通過：…` 或 `未通過：N 個錯誤（✖），M 個提醒（⚠）…`。訊息只指到 `shared/`，不指到 `specs/` |
| 結束碼 | 有 ✖ 為 1，否則 0（沒有 illus-local 也是 0） |
| 拼圖 `work/插圖清單.jpg` | 預設產生（`--no-sheet` 略過；沒有任何元件就不拼）。插圖清單用到的畫廊元件（同一組 `data-*` 只一格）＋`illus-local` 每個 SVG（插圖清單寫了狀態的，每個狀態多一格、打開那個 `.il-<狀態>`）；1:1 px、每格標名稱與來源（`畫廊 data-illus=…`／`新建 illus-local/<檔>`）；上一列亮色（底 #FEF7F3）、下一列暗色（`data-theme="dark"`、底 #1A191C），和畫廊同底色。寬 1920、高＝排版算出的兩列高。做法同 `dev/tools/illus-gallery-shot.mjs`：Node 內建 http 送頁（`kit/` 取自模板、`illus-local/` 取自專案）、HyperFrames 的 chrome-headless-shell `--screenshot`、ffmpeg 轉 jpg。找不到 Chrome → ⚠ 不拼（不影響結束碼） |

測試：`dev/tests/media.test.mjs` 的 `illus-lint：…` 四個案例（好檔 0 ✖；壞檔抓到顏色／描邊／text／比例／狀態、列了沒有檔 ✖、沒有規格 ⚠；沒有 illus-local 印「無」結束碼 0；拼圖存在、寬 1920、上亮下暗）＋`readIllusList` 認新舊標題。
