# 內容設計動畫：做動畫

**這不是套模板。** 模板（字卡、`x-process`、`x-scene`…）工具會自動產出。這裡是使用者最在意、最能提升質感的部分：從這段**內容**出發，專門為它設計一個畫面。不要打開 `shared/template/custom/x-*.html` 找靈感、複製或模仿版面；看過模板，做出來就會長得像模板。

不要讀 `shared/template/tools/`、`shared/template/kit/*.js`：要用到的都寫在這份。指令都在工作區根目錄跑，路徑從 `projects/<專案>/` 寫起。文件裡的 `work/` 都是 `projects/<專案>/work/`。

每段最多 18 次工具呼叫。

讀 `work/storyboard.md` 這段確認過的分鏡（`grep -n -A30 "動畫分鏡 <段 id>" work/storyboard.md`）和畫布（`grep -n -A2 "## 畫布" work/briefs/<段 id>.md`），改 `work/hyperframes/compositions/x-design-<段 id>.html`（工具已經開好空白畫布，先把裡面那個占位的 `data-design-blank` 元素整個刪掉，工具靠它判斷這段還沒做）。你只能寫這個檔和 `illus-local/` 底下自己新畫的 SVG；不改 plan.json、storyboard.md、shared/，不跑 build（`audit` 會自己檢查）。

**畫布**：1920×1080。這段是哪一種，看 `work/briefs/<段 id>.md` 的「畫布」那一節，工具已經算好：

| brief 寫 | 可以用的範圍 | 注意 |
|---|---|---|
| 全螢幕（這段沒有講者） | x 120–1800、y 40–900（`P.region('full')`） | 不用留小視窗，內容撐開整個寬度，主角放大。左右和縮到 87% 的螢幕錄影對齊（錄影 x 125–1796、y 0–940），接到錄影不會跳。右上角是小節角標，要空著。底是純色，沒有背景圖 |
| 右下有講者小視窗 | x 120–1300、y 150–858（`P.region('panelTop')`） | 小視窗 x 1424–1888、y 581–951 不能碰 |
| 疊在講者畫面上 | 講者旁邊的空位 | 沒有底圖，內容不要擋臉 |

三種都一樣：y ≥ 920 是字幕，不能碰。寬 1180 的主卡（`.sc-wcard`）在全螢幕段會自動拉成 1680。

**寫法**：

- 所有 CSS 選擇器以 `#x-design-<段 id> ` 開頭；自己的 id、class 用畫布已有的前綴 `xd<段 id>-`。
- 骨架（`$q`、`SceneMotion`、`P.end()`、`__timelines`）已經寫好，不要動。用到插圖時，寫 `<div data-illus="phone" data-orient="landscape" data-screen="qr" style="width:250px;height:120px"></div>`（`data-*` 就是上面表的選項），script 第一行加 `ILLUS.mount(document.getElementById('x-design-<段 id>'));`。換螢幕狀態：`P.swap('#a .il-qr', '#a .il-content', T1)`（class 是 `.il-<狀態>`，video 是 `.il-content`）。
- 版面用宣告，不自己算座標：`data-layout="row|col|cols-2|grid-2x2|free"`、`data-gap="xxl|xl|lg|md|sm|none"`、元件加 `data-slot`；連接線 `<svg data-links="xdID-a>xdID-b" xmlns="http://www.w3.org/2000/svg"></svg>`（線 id 是 `<a>-<b>`）。場景需要自由擺放時用 `data-layout="free"` 自己絕對定位，所有數字用 8 的倍數。
- 顏色只用 token：`var(--brand)`、`var(--sc-fs-ink)`、`var(--sc-fs-card)`、`var(--sc-fs-card-line)`、`var(--sc-warn)`、`var(--sc-good)`、`var(--v2-node)`、`var(--v2-line)`、`var(--v2-card)`。陰影、光暈、漸層只用 `var(--v2-*)`。主色只給焦點。
- 字：`.sc-t52`（30–150 的字級）、`.sc-w700`／`.sc-w900`、`.sc-opt`。常用零件：`.sc-wcard`＋`.sc-wcard__bar`（主卡與標題列）、`.sc-icon`（`--d` 圓的大小、`--i` 圖示大小）、`.sc-pill`。

**時間軸**：每一拍一個常數，名字只用大寫英文和數字：`const T1 = P.at('#13@跑到');`（字串字面值，不要組字串）。配音效：`const T2 = P.sfx('success', '#14@確認');`。時間一律「本段起點之後的秒數」，對字幕一定用 `P.at`。同一拍裡的小動作用 `T1 + 1.2` 接；`@詞` 要是字幕那句裡連續的字，`audit` 第一行會印每個綁句的實際秒數。

語法速查（不用去讀 `kit/scene-motion.js`；`sel` 是選擇器字串，`at` 是秒數，大括號都是選填）：

| 動態 | 寫法 |
|---|---|
| 擦開、擦掉 | `P.wipe(sel, at, {dir, dur})`（dir：left、right、up、down）、`P.wipeOut(sel, at, {dir})` |
| 滑入 | `P.drift(sel, at, {dx, dur, stagger})`（dx 預設 16，左側元件寫 -16） |
| 彈出、錯拍彈出 | `P.pop(sel, at, {from, dy, to, dur, stagger})`（to 是落地亮度，預設 1） |
| 長出 | `P.grow(sel, at)`（卡片要固定寬高） |
| 抽屜 | `P.slide(sel, at, {from})`、`P.slideOut(sel, at, {to})`（外層 overflow:hidden） |
| 淡入、淡出、換內容 | `P.in(sel, at, {dur, stagger})`、`P.out(sel, at)`、`P.swap(舊, 新, at)` |
| 逐字 | `P.chars(sel, at, {mode, stagger})`（mode：rise、pop、drop） |
| 打字 | `P.type(sel, at, {cps})` |
| 數字滾動 | `P.count(sel, at, {from, to, dur, prefix, suffix, ease})`（一格一格跳寫 `ease: 'none'`） |
| 描線 | 整個插圖畫出來 `P.draw(sel, at, {dur})`；單一線條 `P.stroke(sel, at, {dur, stagger})` |
| 彗星描線 | `P.comet(線, at, {dur})`（描完是實線；沒有 stagger，錯拍就分開呼叫） |
| 圖示描線、描圈打勾 | `P.icon(圖示容器, at)`、`P.check(圖示容器, at)`（圖示用 circle-check；最短 0.55 秒） |
| 劃掉、量條 | `P.strike(sel, at, {wave})`、`P.bar(sel, at, {from, to})` |
| 光澤、螢光筆 | `P.sheen(sel, at)`（元素要 overflow:hidden）、`P.marker(sel, at)` |
| 重拍、漣漪 | `P.punch(sel, at)`、`P.ripple(sel, at, {to})`（to 是元素大小的倍數，預設 2.1） |
| 蓋章 | `P.stamp(sel, at, {on})`：印章 `class="sc-stamp"`，on 是被蓋的元素，兩者是兄弟 |
| 聚焦、回均衡、預覽態 | `P.spot(ALL, sel, at, {scale, lift, dim, done})`、`P.spot(ALL, null, at)`、`P.spot(ALL, 'none', at)`（ALL 是選擇器字串，只放已經進場的元素；新進場的元素 0.6 秒後才聚焦） |
| 退焦 | `P.dim(sel, at, {to})`（`{to: 1}` 回來） |
| 鏡頭 | `P.cam(sel, at, {scale})`、`{to: 焦點, k: 0.12}`、回正 `{x: 0, y: 0, scale: 1}`（只推沒有底的群組） |
| 游標移動 | `P.morph(sel, at, {left, top}, {from: {left, top}, dur})`（一定要帶 from，下一次的 from＝這次的終點）；沿線走 `P.along(sel, 線, at, {from, to, dur})` |

**audit 量的門檻**（寫的時候就照這些排，比較不用重來）：

- 兩拍之間畫面要靜止 ≥ 1.2 秒；任何 1 秒內新元素 ≤ 2 個；一起出現的間隔 0 或 ≥ 0.12 秒。
- 畫面連續不動 ≤ 6 秒；最後一幕停 ≥ 1.5 秒（kit 會把沒綁句的收尾往前挪，最後一拍離段尾還是要 ≥ 3 秒）。
- 完成態內容在 y 120–870 帶裡上下留白差 ≤ 40（全螢幕段看 y 112–900）；全螢幕段內容中心離畫面中線 ≤ 160、寬度 ≥ 1100；字 ≥ 30px；自畫的膠囊標籤內距上下 ≥ 14、左右 ≥ 24，行高 ≥ 1.25。
- 飛行中的物件和標籤不要加 `data-slot`（會被算進同列對齊）；`.sc-pill` 會被當成標題，場景裡的小標籤用自己的 class。
- 連接線先用 `data-links`；多對一會穿過中間的元件，就手寫 svg 線（會有 ⚠，回報寫理由）。

**不能做**：GSAP 的 `onUpdate`／`onComplete`（跳時間截圖不會觸發）、補間顏色、旋轉、大位移飛入、拍與拍之間的微動（呼吸、漂浮、流動）、擠壓已經在畫面上的元素（最終版面先排好，預留位置）。

**驗收**（一條指令，內含這段的所有檢查）：

```
node shared/template/tools/audit.mjs --project projects/<專案> --only <段 id> --shots --sheet
```

✖ 全修。⚠ 只修一輪：改一次之後工具印「可以交件」就停，追 ⚠ 常常越改越多。0 個 ✖ 才會出拼圖；**交件前打開看一次**：動作真的看得到、字和插圖沒有擠在一角、構圖有主角、遮住字幕看得懂。不像鏡位腳本寫的就改。子母畫面的小視窗在這張圖是空框，正常。

**現成的線稿元件**（`data-illus`；可以放大，線不會變粗）：

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

螢幕的每個狀態都預先畫好了（換狀態直接 `P.swap`）；`pgPerson` 是左右對稱的正面人形，不用翻轉。沒有的物件：lucide 圖示（`<span class="sc-icon" data-icon="名稱"></span>`，工具自動填，名稱查 `shared/template/kit/icons.json`）或新畫 SVG（`work/hyperframes/illus-local/<名稱>.svg`，規則 `shared/template/kit/illus-style.md`）。

## 回報

只回一行：`<段> ✖0 ⚠<N>｜<做了什麼，一句話>`。改了鏡位腳本、留著的 ⚠ 和理由寫到 `work/reports/<段>.md`，不要寫在回報裡。
