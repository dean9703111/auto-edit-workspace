# 內容設計動畫：做動畫

從這段**內容**出發，專門為它設計一個畫面，不是套模板：不要打開 `shared/template/custom/x-*.html` 或別段的 `compositions/*.html` 找靈感。

**動畫照 hyperframes skill 寫。** 先載入 `hyperframes` skill，照它的 Contract 和它附的 `motion.md`（緩動、錯拍、停留、哪些寫法看起來像機器做的）用 GSAP 寫。要做的是有名字的效果（游標點擊、劃掉換字、前後對照、圖表、瀏覽器框、文字特效），先照下面「現成元件」去 registry 找。這份只寫**這個工作區和一般 HyperFrames 影片不同的地方**，兩邊衝突照這份。載入不到 `hyperframes` skill（這台沒裝）就不用找，照這份和 `_blank.html` 的註解直接寫 GSAP，報告寫一行「沒有 hyperframes skill」。

hyperframes skill 裡這些不用做，工具都處理了：寫 story／SPEC／storyboard（鏡位腳本就是）、`init`、`usage`、`preview`、桌面 app、`render`、`check`、`snapshot`、配樂、media-use、加 `class="clip"`／`data-start`／`data-duration`、`overlays.md` 的版面位置表（位置照 brief）。

不要讀 `shared/template/tools/`、`shared/template/kit/*.js`。指令都在工作區根目錄跑，路徑從 `projects/<專案>/` 寫起；文件裡的 `work/` 都是 `projects/<專案>/work/`。每段最多 18 次工具呼叫（查 registry、新畫元件都算），到第 18 次就停手，照最後的「回報」回卡在哪。

## 開工

剛照 design-script.md 寫完鏡位腳本的，brief 和腳本都讀過了，直接做第 4 步。

1. 沒有 `work/briefs/<段 id>.md` 就停手，只回 `<段> 沒有 brief`。
2. 讀畫布：`grep -n -A4 "## 畫布" projects/<專案>/work/briefs/<段 id>.md`。
3. 讀鏡位腳本：跑 `ls -t projects/<專案>/work/designs/<段 id>.md projects/<專案>/work/storyboard.md | head -1`，印出哪個就讀哪個。印 designs 就整份讀；印 storyboard.md 就跑 `grep -n -A30 "動畫分鏡 <段 id>" projects/<專案>/work/storyboard.md`。
4. 改 `work/hyperframes/compositions/x-design-<段 id>.html`：先把占位的 `data-design-blank` 元素整個刪掉（工具靠它判斷這段還沒做）。

只能寫：這個檔、`work/hyperframes/compositions/components/`（registry 裝進來的）、`work/hyperframes/illus-local/` 自己新畫的 SVG、`work/designs/<段 id>.md`、`work/reports/<段 id>.md`。不改 plan.json、storyboard.md、shared/，不跑 build、不 render。改動畫時拍變了（修改單、改版）：改 `work/designs/<段 id>.md` 那張表，audit 照比較新的那份對拍。

先 write 一次骨架（版面、每拍一個 `const Tn = P.at(…)` 和那一拍的主要動作）就跑 audit，之後只用 edit 改，不要整份重寫（重寫一次和第一次一樣久）。

## 和一般 HyperFrames 影片不同的地方

- **骨架已經寫好**：`<template>`、根元素 `#x-design-<段 id>`、`const tl = gsap.timeline({ paused: true })`、`const P = SceneMotion(tl, …)`、結尾的 `P.end()` 和 `window.__timelines[…] = tl`，都不要動，只在中間加東西。段長由 `P.end()` 對齊，`data-duration` 不用改。hyperframes skill 說的 `#root` 在這裡是 `#x-design-<段 id>`：CSS 選擇器都以它開頭，自己的 id、class 用前綴 `xd<段 id>-`。
- **時間綁講的話**：每拍一個 `const T1 = P.at('#13@跑到');`（字串字面值），拿到的是段內秒數，直接當 GSAP 的位置參數：`tl.from('#xd<段 id>-phone', { opacity: 0, y: 24, duration: 0.5, ease: 'power3.out' }, T1);`。同一拍後面的動作接 `T1 + 0.4`。`@詞` 只能用鏡位腳本表上那幾拍的（多綁一個詞 audit 會報「不在分鏡表」），要往後挪就加第二個參數：`P.at('#23@收工', 0.85)`。不用知道詞在第幾秒，`P.at` 播放時會照字幕換算；不要為了找秒數去開 `transcript*.json`、`rough.srt*`、`plan.json`、`hyperframes.json`。
- **音效**：`P.sfx('success', '#14@確認');`，名稱只能用 brief 音效那一節列的；要晚一點響加第三個參數 `P.sfx('alert', '#23@收工', 0.85)`。`#N@詞` 一樣只能用表上那幾拍的。一段最多一顆主音效；游標按下另外寫 `P.sfx('click', '#15@按下')`，不算主音效。
- **進場用 `tl.from` 或 `tl.fromTo`**，元素在進場前就會藏起來；不要用 CSS `opacity: 0` 藏。一組一樣的東西用同一個 tween 加 `stagger`。不要用 `onUpdate`／`onComplete`、無限循環、補間顏色、旋轉、大位移飛入、拍與拍之間的微動（呼吸、漂浮）。
- **位置**：最外層容器 `position:absolute`，照下面的畫布表放；裡面用一般 CSS（flex、grid、absolute）排。有底或有框的盒子寬高、left、top 寫整數 px。刻意疊在一起的加 `data-layout-allow-overlap`。
- **顏色、字**：顏色只用 `var(--brand)`、`var(--sc-fs-ink)`、`var(--sc-fs-card)`、`var(--sc-fs-card-line)`、`var(--sc-warn)`、`var(--sc-good)`、`var(--v2-node)`、`var(--v2-line)`、`var(--v2-card)`，陰影 `var(--v2-card-shadow)`；主色只給焦點。字型用頁面預設的，不要另外載字型；字 ≥ 30px（直式專案 ≥ 38px，audit 第一行會印版式）；自畫的膠囊、標籤用 padding 撐內距（上下 ≥ 14、左右 ≥ 24），不要用 line-height 撐高置中。
- **插圖、圖示**：用最後一節的線稿元件（`data-illus`）和圖示（`data-icon`），工具會畫進去，不要自己貼 SVG 路徑。用到插圖時 script 第一行加 `ILLUS.mount(document.getElementById('x-design-<段 id>'));`。插圖的螢幕狀態是 `.il-<狀態>` 子元素，用 GSAP 調它的 opacity 切換。
- kit 的 `P.*` 效果（描線、數字滾動、打字、聚焦…）也能用，寫法看 `references/kit-syntax.md`；不熟就用 GSAP，不用去學。

## 畫布

1920×1080。這段是哪一種，看 brief 的「畫布」那一節，工具已經算好：

| brief 寫 | 可以用的範圍 | 注意 |
|---|---|---|
| 全螢幕（這段沒有講者） | x 120–1800、y 40–900 | 最外層容器放 x 120–1800、y 112–900：y 112 以上是右上角小節角標那一排（角標座標看 brief「不能碰」那一行）。不用留小視窗，內容撐開整個寬度（主內容寬 ≥ 1100），主角放大。左右和縮到 87% 的螢幕錄影對齊（錄影 x 125–1796、y 0–940），接到錄影不會跳。底是純色，沒有背景圖 |
| 右下有講者小視窗 | x 120–1300、y 150–858 | 最外層容器就放這個範圍。小視窗 x 1424–1888、y 581–951 不能碰 |
| 疊在講者畫面上 | brief 寫的「內容放在…」那一區（講者框外） | 沒有底圖，內容不要擋臉；brief 沒有講者框座標時放講者旁邊的空位，audit 報「壓到講者」就照 → 移 |

三種都一樣：y ≥ 920 是字幕，不能碰。內容在最外層容器裡上下置中。

## 節奏

照這幾條寫就會過，不要在心裡模擬時間軸、不要自己算秒數或留白，audit 會量：

- 一拍最多兩個進場 tween：主角在 `Tn`，配角（標籤、說明）在 `Tn + 0.4`。同一拍其他動作都在 `Tn + 0.8` 以內開始，拍與拍之間不加動作。audit 報「完成態停太短」就把那一拍晚開始的動作往前挪。
- 拍距、最後一拍離段尾多遠，鏡位腳本已經排好，照抄。腳本寫了拍內晚一點的動作（例：蓋章後 0.85 秒擦開）就照腳本做；audit 因此報「完成態停太短」就留著，寫進報告。

## 現成元件（hyperframes-registry）

畫面要的是有名字的效果，先查再寫。registry 的指令在子殼裡跑：

```
(cd projects/<專案>/work/hyperframes && npx hyperframes catalog --query "<英文描述>" --type component --json)
(cd projects/<專案>/work/hyperframes && npx hyperframes add <名稱> --json)
```

只用 component（block 是整個場景，這裡用不到）。裝好的在 `work/hyperframes/compositions/components/<名稱>.html`：把它的 markup、style、script 搬進你的檔，id、class 改成 `xd<段 id>-` 開頭、選擇器加 `#x-design-<段 id>` 前綴，拿掉它自帶的字型，顏色換成上面的 token，時間改用你的 `Tn`。查兩次都沒有合用的就自己寫，不用回報 gap。

## 驗收

```
node shared/template/tools/audit.mjs --project projects/<專案> --only <段 id> --shots --sheet
```

- ✖ 全修：照 → 用 edit 改動畫檔，再跑同一條 audit。→ 寫「重跑 build」「snapshot」時，只要改好動畫檔、重跑這條 audit；要改 plan.json 才修得掉的，把那行原文交回主代理。
- 同一個 ✖ 改兩次還在，或 → 要你改 plan.json、storyboard.md，就停手回報。工具呼叫到第 18 次也一樣。
- ⚠ 只修一輪：照 → 用 edit 改那幾行，再跑同一條 audit 一次就停。留下的 ⚠ 一定寫進 `work/reports/<段 id>.md`，一個一行：規則名稱（例「完成態停太短」）＋為什麼留著；沒有 ⚠ 就不用寫這個檔。印「通過」或「可以交件」都算過關。
- 0 個 ✖ 才會出拼圖；**交件前打開看一次**：動作看得到、字和插圖沒有擠在一角、構圖有主角、遮住字幕看得懂。不像鏡位腳本寫的就用 edit 改一次、再跑一次 audit 就交。拼圖沒截到的中間動作不用另外驗證。子母畫面的小視窗在這張圖是空框，正常。

## 線稿元件與圖示

`data-illus`，可以放大，線不會變粗。寫法：`<div data-illus="phone" data-orient="landscape" data-screen="qr" style="width:250px;height:120px"></div>`（`data-*` 就是下表的選項）。

| 元件 | 狀態、選項 | 建議大小（px） |
|---|---|---|
| `phone` | orient：portrait、landscape；screen：blank、video（人像）、play、rec、check、warn、shorts、qr | 直 120×250、橫 250×120 |
| `phoneTripod` | 同 phone（手機架在腳架上） | 直 140×360、橫 260×300 |
| `tripod` | — | 140×180 |
| `laptop` | screen：blank、video、play、rec、check、warn、app | 280×190 |
| `monitor` | 同 laptop | 360×300 |
| `cloud` | arrow：none、up、down | 220×150 |
| `personBust` | tone：a、b；`.il-talk` 說話的弧線 | 160×170 |
| `pgPerson` | pose：stand、walk、point；tone：a、b、accent | 120×284 |
| `personTop` | 俯視的人 | 110×72 |
| `desk` | 俯視的桌面＋筆電 | 320×150 |
| `stage` | 2.5D 地台，裝置站在頂面 | 960×180 |
| `cone` | angle、len、fill（視野、光錐） | 依 len |
| `waveform` | bars、seed、color：white、yellow、red | 360×90 |
| `progress` | `.il-fill` 橫向填滿 | 320×28 |
| `energy` | `.il-cell` 五格電量 | 220×90 |
| `fileVideo` | — | 100×120 |
| `window` | title | 480×300 |
| `searchBar` | text | 640×84 |
| `badge` | kind：check、cross、warn | 72×72 |
| `recPill` | `.il-time` 時間字（自帶紅點） | 200×60 |
| `stopwatch` | `.il-hand` 指針、`.il-sweep` 外圈 | 220×240 |
| `bookmark` | saved：false、true | 220×72 |

先看表選；不確定長相就打開一次 `shared/template/kit/illus-gallery.jpg`（一張圖，每格下面有寫法），不要跑程式裁它。沒有的物件找 lucide 圖示：`<span class="sc-icon" data-icon="名稱" style="--d:96px;--i:56px"></span>`（`--d` 圓的大小、`--i` 圖示大小），名稱用 `node shared/template/tools/build.mjs --project projects/<專案> --icons 手機,雲端,footprints` 查（中文查不到就換英文；不要打開 586 KB 的 icons.json）。

**新畫線稿元件**（畫廊、圖示、registry 都不合才畫；一段最多一個）：

1. 鏡位腳本的表下面要有 `#### 插圖清單 <段 id>`，新建那一列寫 `規格：<名稱>，建議尺寸 <寬>×<高>，狀態 <a>／<b>；描述：…`（格式照 design-script.md），尺寸抄上表大小相近的。
2. 照 `shared/template/kit/illus-style.md` 畫，存成 `work/hyperframes/illus-local/<名稱>.svg`。
3. 跑 `node shared/template/tools/media.mjs illus-lint --project projects/<專案> --only <名稱>`：0 個 ✖ 才掛上去，⚠ 照 → 改一輪。打開它印的 `work/插圖清單-<名稱>.jpg`，和旁邊三個畫廊元件比線粗、圓角、用色，不像同一套就改一次。
4. 掛法：`<div data-illus-src="illus-local/<名稱>.svg" style="width:<寬>px;height:<高>px"></div>`（路徑從 `work/hyperframes/` 算），狀態用 GSAP 調 `.il-<狀態>` 的 opacity。

## 回報

只回一行：

- 做完：`<段> ✖0 ⚠<N>｜<做了什麼，一句話>`；有新畫元件加 `｜新畫：<名稱>`；用了 registry 元件加 `｜registry：<名稱>`。
- 停手：`<段> ✖<N>｜卡在：<那行 ✖ 原文>`；沒有 brief 就回 `<段> 沒有 brief`。

改了鏡位腳本、留著的 ⚠ 和理由寫到 `work/reports/<段 id>.md`，不要寫在回報裡。
