# 契約：motion（`kit/scene-motion.js` v2 原語、單位與區域、tween 標記、`P.sfx` 登記格式）

- **擁有者**：003 motion-audit（010 motion v2 階段 B）。**照它做**：002（build 把 `P.sfx` 解析成 `<audio>`、`scanCueRefs` 收 `P.sfx` 的 ref、轉場 `.v2-tx`）、009（直式注入 `window.__regions`）、001（`auto-edit-motion`、USAGE R7／R8 的原語清單、分鏡語彙）、004（`qc.mjs observe` 的拍點截圖可讀 `SceneMotion.marks`）。
- **版本**：1（2026-10-31）。設計依據：`specs/010-motion-v2/design-system.md` §0–§16。API 清單由 `dev/tests/motion.test.mjs`「v2：原語清單」逐字檢查；改這份要一起改測試。
- 舊 API（`P.in／out／swap／sideIn／sideOut／end／at／dur／drift／reveal／rise／maskUp／axis／focus／type／stroke／icon／check／morph／push／count／bar`）不變，第一層模板與舊 custom 照用。

## 1. 單位與區域

| 名稱 | 定義 | 取得 |
|---|---|---|
| `u` | 畫布短邊 ÷ 1080（橫式 1920×1080、直式 1080×1920 都是 1；4K 是 2）。畫布取 root 的 `data-width`／`data-height` | `P.U` |
| 字的位移 | `em`（跟著字級走） | `P.V2.CHAR_DY` |
| 區域 | `[x, y, w, h]`（畫布 px）。`window.__regions[name]` 有值就用它，沒有用橫式預設 | `P.region(name)`、`window.SceneMotion.REGIONS` |

橫式預設（design-system.md §2）：

| 名稱 | `[x, y, w, h]` | 用途 |
|---|---|---|
| `band` | `[120, 600, 1680, 260]` | 下方字卡帶 |
| `panelTop` | `[120, 150, 1180, 708]` | 全畫面主內容（避開 pip） |
| `pip` | `[1424, 594, 432, 324]` | 子母畫面小視窗（`P.grow` 預設起點） |
| `badge` | `[1560, 40, 320, 100]` | 章節角標 |
| `captions` | `[0, 920, 1920, 160]` | 字幕區 |
| `safe` | `[96, 54, 1728, 972]` | 安全框 |

009 直式：build 在 index.html 注入 `window.__regions = { band: […], … }`（只給要蓋的名稱），原語不改。原語的參數一律是 u 或區域名，不寫畫布 px。

## 2. 時間與曲線表（`P.V2`＝`window.SceneMotion.V2`，design-system.md §3）

| 鍵 | 值 | 用在 |
|---|---|---|
| `IN` | 0.5 | 一般進場 |
| `SHELL` | 0.6 | 卡片外殼 |
| `EMPH` | 0.2 | 強調拍 |
| `OUT` | 0.3 | 退場（比進場快） |
| `MOVE` | 1.0 | 鏡頭、位移 |
| `GROUP` | 0.12 | 錯拍間隔 |
| `REST` | 1.0001 | 縮放過的元素回到 1 時停的縮放（§6） |
| `CH` | `{ rise: 0.03, pop: 0.035, drop: 0.045 }` | 逐字間隔 |
| `CHAR_DY` | `{ rise: 0.6, pop: 0.4, drop: 0.55 }`（em） | 逐字位移 |
| `EASE` | `{ in: 'expo.out', emph: 'back.out(1.8)', move: 'power3.inOut', tx: 'expo.inOut', out: 'power2.in', idle: 'sine.out' }` | 曲線 |
| `CLIP` | `left／right／up／down／open` 的 `inset(…)`，四邊外擴 −20% | 擦開不切落影 |

模板與 custom 只引用名稱（`P.V2.IN`、`P.V2.EASE.emph`），不寫數字。舊常數 `P.OUT` 一起改成 0.3（＝`V2.OUT`；`P.out`、`P.swap` 的預設退場跟著變快）；`tools/lib/scenes.mjs` 的 `motionConsts` 讀到的 `OUT` 也是 0.3。

## 3. 原語與語彙（design-system.md §11、§14.1）

全部 `(sel, at, opts)`：`sel` 是 root 內的選擇器（`root.querySelectorAll`），`at` 是段內秒數（用 `P.at('#N@詞')` 算）。回傳 `P`（可串），`P.sfx` 回傳秒數。

| 原語 | 選項（預設） | §14.1 語彙 |
|---|---|---|
| `P.wipe(sel, at, {dir:'left', dur:0.5, ease, stagger})` | clip 由一側揭開 | 擦開、章節色塊擦入、換卡不換景（新卡，配 `P.pop`） |
| `P.wipeOut(sel, at, {dir, dur:0.3})` | 反向 | 擦掉 |
| `P.slide(sel, at, {from:'left', dur})`／`P.slideOut(sel, at, {to, dur:0.28})` | xPercent／yPercent ±100；外層 overflow:hidden | 抽屜抽出／抽屜收回 |
| `P.pop(sel, at, {from:0.82, dy:28u, to:1, dur, stagger, ease:back.out(1.6)})` | 縮放＋上移＋淡入 | 彈出、錯拍彈出（`stagger`）、章號重拍 |
| `P.grow(sel, at, {from:'pip', dur:0.8})` | 從區域長成自己 | 長出 |
| `P.drift`、`P.in`、`P.out`（舊） | — | 滑入、淡入、淡出 |
| `P.chars(sel, at, {mode:'rise'\|'pop'\|'drop', stagger, dy, dur})` | 拆 `span[data-sc-ch]`：中文一字一格，英文單字、數字整個一格（不會在字中間換行）；已經有 `data-sc-ch` 的元素（例 15 的引號）不拆 | 逐字上浮／逐字彈出／逐字落下 |
| `P.type`、`P.count`（舊） | — | 打字、數字滾動 |
| `P.stroke`、`P.icon`、`P.check`（舊） | — | 描線、圖示描線、描圈打勾 |
| `P.comet(path, at, {dur:0.8, r:9u, keepDash})` | 描線＋發光頭 | 彗星描線 |
| `P.strike(sel, at, {dim:0.5, dur:0.35})` | 插 `.sc-strike` 劃過、不擦回，再退焦 | 劃掉 |
| `P.bar`（舊）＋`P.morph`（頭） | — | 進度推進、量條 |
| `P.flow(sel, at, {speed:24u/s, until})` | dashoffset 等速 | 虛線流動 |
| `P.sheen(sel, at, {dur:0.7})` | 插 `.sc-sheen` | 光澤掃過 |
| `P.marker(sel, at, {dur})` | 插 `.sc-mk` | 螢光筆 |
| `P.punch(sel, at, {scale:1.06, dur})` | 0.12 s 放大再回彈 | 重拍 |
| `P.ripple(sel, at, {rings:2, from:0.9, to:2.1, dur:0.9})` | 插 `.sc-ripple` | 漣漪 |
| `P.spot(group, active\|null\|'none', at, {scale:1.07, lift:-10u, dim:0.42, done, dur})` | 插 `.sc-spot`；同一元素要照時間先後、上一次動完（at＋dur）才能下一次，不然丟錯；active 是空陣列（舊 `$q` 包裝把 'none' 變成 []）當 'none' | 聚焦、預覽態（`'none'`）、走過（`done`）、回均衡（`null`） |
| `P.dim(sel, at, {to:0.6, dur:0.4})` | 記住目前亮度 | 退焦 |
| `P.cam(sel, at, {to, k, scale, x, y, dur:1.0})` | dur ≥ 2 算微動；009 直式舞台縮放（`window.__regions`＋root 寬 > 高）時 `to` 不帶位移、原點 `50% 0%`，`P.region` 用橫式預設 | 鏡頭慢推、鏡頭跟焦點（`to`＋`k`）、鏡頭回正 |
| `P.idle(sel, at, {y:4u, x, scale, period:3.2, ramp:0.8, until})` | 寫 CSS `translate`／`scale`；`until` 沒寫才讀 `P.dur()`（情境模板一律寫 `until: D`，模板沒有 cue 表） | 漂浮、呼吸（`scale`） |
| `P.ambient(D)` | `.sc-surface-fs` 加 `.sc-amb`×2、`.sc-dust`，慢拉 1.06→1；`P.end()` 自動呼叫，root `data-ambient="off"` 關 | 背景環境 |
| `P.sfx(name, ref, off)` | 見 §5 | （音效拍點欄） |

build 內建（custom 不寫）：講者慢推、色帶擦開、子母畫面飛入、色帶收回（002 的 `.v2-tx`）。換卡不換景：新卡在 custom 寫 `P.wipe`＋`P.pop`，舊卡由 build 補 `P.wipeOut`。給剪片 AI 看的同一張表在 `shared/template/BEATS.md` §2（001 維護；`audit.test` 逐列比對名稱與第一個 `P.*`）。分鏡「動態」欄寫的名稱與上表的對應，在 `tools/lib/audit-beats.mjs` 的 `VOCAB`（45 個＋拍型縮寫「開場」），audit 用它檢查語彙與「分鏡用了沒做的動作」（cli-003 §2.3d）。

### 3.1 `P.prev()`：前一段是什麼（002 定的介面：`plan-fields.md` §4、`cues.md` §2 `segs[id].prev`、`check-json.md` `items[].out.tx.prev`）

回傳 `'speaker'`｜`'fullscreen'`｜`'pip'`：依序讀子合成 root 的 `data-prev`、host（`el-<id>`）的 `data-prev`、`window.__cues.segs[id].prev`；都沒有（單獨開檔）或不認得的值＝`'speaker'`。用法：custom 開場 `const ENTER = P.prev() === 'fullscreen' ? 'swap' : 'grow';`（弱模型手寫 `'grow'`／`'swap'` 也可以，手寫優先）；04a–d 模板在 root 上讀同一個屬性。不建立 tween、不算 P.* 呼叫。

## 4. tween 標記（audit 用）

每個最外層的 `P.*` 呼叫打一個編號；它建立的每個 tween 帶 `data: { sc, role, fn }`：

| 欄 | 值 |
|---|---|
| `sc` | 這個 P 實例裡第幾個呼叫（1 起）；同一個呼叫的錯拍、逐字共用 |
| `role` | `micro`：idle、flow、ambient、end（含 `P.end()` 自動加的背景環境層）、dur ≥ 2 s 的 cam；`focus`：spot、focus、dim、cam；`accent`：ripple、sheen、punch、marker；其他都是 `enter`（含退場類，退場由 audit 看 opacity／`fn` 判） |
| `fn` | 方法名（`wipe`、`pop`…）；巢狀呼叫（`strike` 裡的 `dim`）用最外層的名稱 |

**名稱穩定**：`role` 的四個值（`enter`、`focus`、`accent`、`micro`）與 `fn`（＝`P.*` 方法名）是對外介面，改名或改歸類要先改本節並通知讀的人：

| 讀的人 | 怎麼用 |
|---|---|
| 003 audit | 見下段 |
| 004 `qc.mjs observe` 取樣 | `micro`（漂浮、呼吸、虛線流動、背景環境、慢推）不算動態；`fn: 'slide'` 結束後 0.3 s、`fn: 'spot'` 抬起結束後各截一張 |

audit（cli-003 §2.2 末段）：`micro` 不算忙碌段；同一個 `sc` 只算一個新元素；`fn` 是 `wipe`／`slide`／`grow` 算進場、`wipeOut`／`slideOut` 算退場。量版面跳過 `.sc-comet, .sc-ripple, .sc-spot, .sc-sheen, .sc-mk, .sc-strike, .sc-amb, .sc-dust`。

## 5. `P.sfx` 登記格式（給 002 在 build 解析成 `<audio>`）

**寫法**（custom 的 `<template>` 裡的 `<script>`）：

```js
const T4 = P.sfx('tick', '#38@兩支');        // 回傳 P.at('#38@兩支') 的秒數，這一拍同時當動畫時間
P.sfx('ding', '#41@崩潰', 0.2);              // off＝再往後幾秒（可負）
```

- `name`：`/^[a-z0-9-]+$/`，要是 `kit/sfx.json` 裡 `kind: "sfx"` 的名稱；不合格式時 script 丟錯（audit 顯示 `script 出錯` ✖）。
- `ref`：和 `P.at` 同一套（cues.md v1）：`'#N'`、`'#Ne'`、`'#N±秒'`、`'#N@詞'`。**一定是字串字面值**；`off` 是數字字面值或省略。

**執行期登記**：`window.SceneMotion.sfx[<comp id>] = [{ name, ref, off, t }]`（`t`＝段內秒數，和 `SceneMotion.marks` 同一套；同時 `P.sfxCues`）。它也是一個 `P.at`，所以會出現在 `SceneMotion.marks`（audit 的分鏡對齊、停留都看得到）。

**build 靜態解析**（002 實作）：

1. `scanCueRefs` 要另外收 `P.sfx` 的第二個參數（`@詞` 才會被預先算到；現在只收 `P.at(…)`，`P.sfx('tick', '#38@兩支')` 的 `@詞` 在執行期會記一則 `__cueErrors`）。
2. 對每個 custom 段的 script 用

   ```
   /\bP\.sfx\(\s*(['"])([a-z0-9-]+)\1\s*,\s*(['"])([^'"\n]+)\3\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)/g
   ```

   取 `name`、`ref`、`off`；事件秒數＝這段的 ref 秒數（完成影片）＋`off`。起播＝事件秒數 − `peak` ＋ 1 格（sfx.md 的既有公式）。音量、是否受主音效 3 s 規則與密度上限、段的 `sfx: null`／`sfxVolume` 怎麼套，由 002 照 sfx.md 定。
3. 參數不是字面值（例 `P.sfx(n, ref)`）→ 照 `scanBadCueRefs` 的寫法報 ✖。

## 6. 可重現（seek-safe）

- 只往 paused timeline 加 `fromTo`／`set`；不用 `Math.random`、`setTimeout`、CSS transition、`repeat`、`yoyo`（motion.test 檢查原始碼）。
- 三種做法：(a) 同元素同屬性第一次才 `immediateRender`；(b) 純函數 plugin `scFn`（tween 值是 0→1 的進度，畫面由函數算；描線在建立時進度 0）；(c) 微動寫 CSS 個別屬性 `translate`／`scale`，不碰 GSAP 的 transform。
- 有 transform 的 tween 帶 `force3D: false`（文字不糊）。
- 縮放過的元素回到 1 一律停在 `V2.REST`（`mv()` 自動換；第一個縮放補間的起點仍是 1）：縮放過又回到單位矩陣的元素，Chrome 畫圖示、圓角、逐字的反鋸齒會跟著 seek 先後不同（2026-10-31：x-process 完成態 22、x-branch／x-architecture 加回「走過」317／328、逐字彈出 2550–3867 個色值）；換成 REST 後這些都是 0。
- 每個原語在 motion.test 有「亂序 seek 與順序 seek 的 `hyperframes snapshot` 像素 md5 相同」的測試。

## 7. CSS（`kit/scene.css` v2 段）

- token：`--v2-*`（亮：`:root`；暗：`:root[data-theme="dark"]`，含 `--sc-fs-*` 的暗色覆寫）。custom 與模板的陰影、光暈、漸層只能用 `var(--v2-*)`（examples.test 檢查）。`--v2-strike` 預設 `var(--sc-warn, #E5484D)`。
- 原語自動插的元素：`.sc-mk`、`.sc-ripple`、`.sc-comet__head`／`__halo`、`.sc-spot`、`.sc-sheen`、`.sc-strike`、`.sc-amb`、`.sc-dust`；作者不用寫這些 class。
- 浮塵：`--v2-dust`／`--v2-dust-2` 是遮罩圖（點的透明度＝濃淡），顏色由 `--v2-dust-ink`（＝`var(--brand)`）／`--v2-dust-2-ink`（暗色白點）上；`.sc-dust::before`、`::after` 各一層。kit 不寫死主色碼，`brand.mjs` 換主色會跟著換。
- `.v2-tx`：給 002 build 轉場色帶用。

## 8. 版面 helper `SceneLayout`（012；`kit/scene-layout.js`）

弱模型只寫宣告、不寫座標；helper 在 mount 時排一次，audit 用 `SceneLayout.measure` 量（cli-003 §2.3f）。

### 8.1 間距 token（`kit/scene.css` 第一個 `:root`，直式一樣；helper 讀計算樣式，讀不到用同值預設）

| token | 值 | 用在 |
|---|---|---|
| `--sc-grid` | 8 | 群組起點貼齊 8 的倍數 |
| `--sc-pad-card` | 48 | 卡片內容區左右內距（x-scene 標題列 `padding: 20px var(--sc-pad-card)`） |
| `--sc-pad-card-y` | 40 | 卡片內容區上下內距（`data-align="top"` 的上內距） |
| `--sc-gap-xxl` | 160 | 一對元件要拉開（分歧、對照、比喻的兩邊） |
| `--sc-gap-xl` | 96 | 站與站之間（中間放連接線）；`row` 預設 |
| `--sc-gap-lg` | 48 | 兩欄之間、群組之間、row 的列與列之間；`cols-2`／`grid-2x2` 預設 |
| `--sc-gap-md` | 24 | 同一群裡的元件之間、`move` 到元件旁邊的距離；`col` 預設、`.sc-row` gap |
| `--sc-gap-sm` | 16 | 插圖到標籤、徽章到字（`.xsc-it` gap） |
| `--sc-link-gap` | 12 | 連接線端點離元件外框 |
| `--sc-link-head` | 16 | 箭頭頭長 |

### 8.2 屬性

| 屬性 | 值 | 行為 |
|---|---|---|
| `data-layout` | `row`／`col`／`cols-2`／`grid-2x2`／`free` | row：同一列等距、底對齊（有標籤的錨點底同高＝標籤同一條線；側排（徽章＋右邊字）的標籤中心落在那條標籤線；沒標籤的對齊最高那個有標籤錨點的中線；`data-align="middle"`＝全部錨點中線同高）、每列水平置中、列與列 gap-lg；col：垂直等距、錨點中線同 x（橫排的徽章＋字整個置中）；cols-2：兩欄等寬（欄間 gap-lg、列間 gap-md）；grid-2x2：等寬等高格；free：不排（audit 照樣量） |
| `data-gap` | `xxl`／`xl`／`lg`／`md`／`sm`／`none` | 用哪個 `--sc-gap-*`；`none`＝0（例：人站在桌子後面）。相鄰兩個放大 1.1 倍（`SCALE_MAX`）後不能碰：間距至少 ⌈(a＋b)×0.05 − 1e-9⌉（扣浮點誤差） |
| `data-align` | `center`（預設）／`top`／`middle` | 最外層容器：群組上下置中，或靠上（上內距 `--sc-pad-card-y`）；`middle`＝置中＋row 改成錨點中線對齊 |
| `data-justify` | `start`／`center`（預設）／`end` | 橫向：最外層群組靠左（右）內距 `--sc-pad-card`、或置中（貼齊 8）；col 裡的元件左（右）邊對齊、或錨點中線對齊 |
| `data-row` | 數字 | row 排法的第幾列 |
| `data-slot` | — | 參與排版的元件（容器的直接子元素）；本身也有 `data-layout` 的＝巢狀群組，大小＝裡面排好的外框 |
| `data-links` | `a>b`（箭頭）、`a-b`（無箭頭），空白隔開 | 放在 `<svg>` 上；svg 疊在它的父元素（0, 0、同大小）。id 有「-」時從左找第一個兩邊都是元件 id 的「-」。空字串＝svg `display:none`（不然預設 300×150 會壓到標題列） |

- **錨點**＝slot 直接包著的 `[data-illus]`／`[data-illus-src]`，沒有就是 slot 自己；中線都對錨點。row 裡的巢狀群組（例：手機＋掛在標籤下面的 REC 膠囊）看群組裡第一個元件：它有標籤，就用它的錨點與標籤（`measure` 也這樣回報），群組跟著那個標籤底對齊；第一個沒有標籤（例：右邊一欄小元件），群組照沒標籤的處理。
- **連接線**：端點在元件外框（slot，含標籤）沿線方向的邊外 `--sc-link-gap`，另一軸：直線在兩個錨點重疊段的正中，L 形對各自的錨點中線。錨點上下重疊、slot 左右不重疊＝水平直線；錨點左右重疊、slot 上下不重疊＝垂直直線；其他＝L 形（先水平再垂直）。有箭頭時另出一條 `<path id="<a>-<b>-head" data-link-head="<a>-<b>">`（`--sc-link-head` 的 V 字）；本體只有一段子路徑，終點＝箭尖，`P.comet` 的光頭停在箭尖。`P.stroke`／`P.comet` 描本體時（scene-motion.js 的 `draw`），頭在描完前 0.05 秒淡入 0.15 秒；沒被描的線，頭一直在。產生 `<path id="<a>-<b>" class="sc-link"（或 svg 的 data-link-class）data-link="<a> <b>" data-pts="[[x,y]…]">`；`P.stroke('#<a>-<b>', …)` 直接用。
- **位置**：寫 slot 的 `style.left`／`top`（`position: absolute`）；最外層群組起點 `snap` 到 `--sc-grid`，組內是整數 px（等距與中線優先）。巢狀群組寫 `width`／`height`。

### 8.3 API（`window.SceneLayout`）

| 方法 | 說明 |
|---|---|
| `apply(root, {force})` | 排 `root` 底下（含 root 自己）所有 `[data-layout]`（反向文件順序：先裡面的群組），再畫 `svg[data-links]`。同一個 root 只排一次，`{force:true}` 重排。自動呼叫：`ILLUS.mount` 之後（包一層）、`SceneMotion(tl, root)` 建立時（`snapWidths` 之後） |
| `measure(root)` | `{containers:[{id, layout, align, justify, nested, box, slots:[{id, row, side, box, anchor, label, nested, home?}]}], links:[{id, a, b, pts, boxA, anchorA, boxB, anchorB, hand?}]}`；外框 `[x0, y0, x1, y1]` 相對 root 的版面座標（offset 鏈）；容器 `box` 是內容區（clientWidth／Height）；手寫線 `hand: true`（座標由 `getScreenCTM` 換算，除以 root 的縮放；端點認最近的 `data-slot` 或插圖 `.il`，一樣近認最內層，`a`／`b` 是它所在的 slot id；`data-layout-ignore`／`data-layout-check="ignore"` 裡的線不量，比照 audit-page）；`home`＝helper 排的位置被 `P.morph` 改過（走位）時，排版時的外框 |
| `box(el, ref)` | el 相對 ref 內容區（padding box）的 `[x, y, w, h]`（版面座標；每層 offsetParent 的框線 `clientLeft／Top` 加回去，卡片框線不會少算 2 px） |
| `token(name)` | `--sc-<name>` 的數值 |
| `SCALE_MAX` | 1.1 |

### 8.4 可重現

- 只在 mount 算一次、純函式（同樣的 DOM＝同樣的結果），不進 timeline、不讀時間；量寬高用 `offsetWidth`／`offsetHeight`（祖先縮放、進場 transform 都不算），所以亂序 seek 的版面、`measure` 結果和照順序 seek 相同（motion.test「SceneLayout」）。
- 動畫只改 transform／opacity，不改 slot 的 `left`／`top`；要把元件移到別的元件旁邊用 x-scene 的 `move: [el, 目標, 'left'|'right']`（算一次位移，tween transform）。
- 載入順序：`illus.js` → `scene-layout.js` → 動畫 script（`lib/main.mjs` 主合成與畫廊、`lib/custom-preview.mjs` 預覽頁）。
