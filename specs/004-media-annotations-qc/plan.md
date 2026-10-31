# Implementation Plan: 004 media-annotations-qc

**Branch**: `004-media-annotations-qc` | **Date**: 2026-10-31 | **Spec**: `specs/004-media-annotations-qc/spec.md`

**Input**: spec.md、`specs/contracts/media.md`、`specs/contracts/cli-004.md`

## Summary

1. `lib/media.mjs` 把 `resolveMedia` 擴成 `validateMedia`：多驗證、多換算 `callouts`／`spot`／`steps`／`arrows`／`marks[].path`，卡片與箭頭的位置由工具自動擺；`mediaParts` 多產生一層「標註 SVG」與一層「卡片 div」；樣式進 `kit/media.css`。
2. `qc.mjs` 新增 `storyboard`（一次 `npx hyperframes snapshot` 截全部完成態、改名）、`observe`（ffmpeg 抽格＋Chrome 排版觀影總表、靜止區間、接縫條帶），`framing` 加建議欄。
3. `brand.mjs` 新增 `bg` 子指令（Chrome `--screenshot` 截 HTML、ffmpeg 轉 jpg／疊框／並排）。
4. `lib/raster.mjs` 新增 `htmlShot()`，給 2、3 共用。

## Technical Context

| 項目 | 內容 |
|---|---|
| Language/Version | Node.js 22（ESM，內建 `node:test`、`WebSocket` 不用到） |
| Primary Dependencies | 無 npm 套件；外部程式：ffmpeg／ffprobe、HyperFrames 0.8.221 的 `chrome-headless-shell`（`~/.cache/hyperframes/chrome`）、`npx hyperframes snapshot` |
| Storage | 檔案：`projects/<專案>/work/storyboard-preview/`、`work/觀影/`、使用者指定的暫存資料夾（bg） |
| Testing | `node --test dev/tests/{media,qc,brand}.test.mjs`；素材用 ffmpeg lavfi 現做；Chrome 相關案例找不到 Chrome 就 skip |
| Target Platform | macOS（zsh）、Windows（PowerShell）；路徑 `path.join`、網址 `pathToFileURL`、`npx` 用 `shell: process.platform === 'win32'` |
| Project Type | CLI 工具＋build 函式庫 |
| Performance Goals | storyboard 20 段 40 張 ≤ 60 s；observe 10 分鐘成片 ≤ 3 分鐘；bg 每張 ≤ 5 s（M1 Max，Windows 筆電 ×1.5–3） |
| Constraints | 不裝 Python、不連網（HTML 的外部網址只 ⚠）；不改 002／003 擁有的檔；沒用新欄位的輸出逐字不變 |
| Scale/Scope | 一集 10–30 個 media 段、每段 0–6 個標註；成片 3–20 分鐘 |

## Constitution Check

| 原則 | 本線怎麼做 | 結果 |
|---|---|---|
| I 工具做計算 | 卡片位置、箭頭方向、STEP 編號、截圖時刻、靜止區間、留空區裝飾占比都在工具算；AI 只寫 `side`／`from` 這種方向字（也可以不寫） | ✔ |
| II 零依賴、跨平台 | 只用 ffmpeg、HyperFrames 自帶的 Chrome；`drawbox`、`hstack`、`vstack` 不需要 freetype；檔案操作用 `node:fs`，不呼叫 cp／rm | ✔ |
| III 弱模型優先 | 訊息照契約 media §3、cli-004 的原文，全部「→ 改法」；放不下時直接列出放得下的方向 | ✔ |
| IV 單一真相 | `MEDIA_FIELDS` 搬到 `lib/media.mjs`；數字常數在 `lib/media.mjs` 一處，style.md 只寫規則用的那幾個（docs.md 列表） | ✔ |
| V 停點 | storyboard（停點 ③ 前）、bg（停點 ⑥ 前）只印「下一步」，停點那一行由 AI 照 `contracts/stop-points.md` 寫 | ✔ |
| VI 可驗證 | 每個 FR 有測試；Chrome 案例沒 Chrome 時 skip 不 fail | ✔ |
| VII 授權 | 圖示用既有 `kit/icons.json`（lucide，`kit/LICENSE-lucide.txt`）；不加新素材 | ✔ |
| VIII 不擴張 | 不做的事列在 spec「不做」；多出的 `marks[].path[].dur`、framing 建議欄有出處並列進待裁決 | ✔（見 Complexity Tracking） |

## 研究與決定

### R1：分鏡截圖用 `npx hyperframes snapshot`，不用 CDP 自截

| 方案 | 實測／事實 | 結論 |
|---|---|---|
| `npx hyperframes snapshot --at t1,…,tN --no-end --keep -o <dir> --json` | 本機（M1 Max、0.8.221、空白合成）：1 張 2.35 s、21 張 4.34 s（≈ 啟動 2.2 s＋每張 0.1 s）；`--json` 時 stdout 只有 JSON、`frames[]` 依 `--at` 順序給 `{ path, time }`；`--keep` 檔名 `at-<秒>s.png`（去尾零）；錄影 `<video>` 的畫面由 FFmpeg 提供，和 render 同一套 | **採用**：一次呼叫截全部；和成片同一個 renderer |
| `lib/audit-browser.mjs` 的 `openSession` 自截 | 它的 http server 對 `.mp4` 回 404（`SKIP_MEDIA`，`audit-browser.mjs:117`），media 段會是空白；要改得 003 動檔；截圖是 JPEG q80 | 不採用 |

### R2：觀影總表的字用 Chrome 排版

| 方案 | 事實 | 結論 |
|---|---|---|
| `lib/raster.mjs` 點陣字 | 只有 `0-9 : . # s x - , /` 與空白（`raster.mjs:7`），段 id 的 `m`、中文字幕都畫不出來 | 不採用 |
| ffmpeg `drawtext` | 需要 freetype／fontconfig，Windows 與部分 Homebrew 版沒有（`raster.mjs:2`） | 不採用 |
| Chrome `--screenshot` 本機 HTML | 實測 960×1080、`kit/fonts.css` 的 Noto Sans TC：0.41 s，中文字正確（加 `--virtual-time-budget` 等字型）；Chrome 本來就是 snapshot／render 的必要條件 | **採用**；`htmlShot()` 放 `lib/raster.mjs` 給 observe 與 brand bg 共用 |

### R3：brand bg 用 Chrome 命令列 `--screenshot`，不開 CDP

靜態網頁不需要 HyperFrames runtime 與 seek；命令列一次一張最簡單（R2 實測）。只 import 003 的 `findChrome` 找執行檔。

### R4：座標系沿用素材像素

AI 現在已經用 `media.mjs frame --grid` 讀素材像素寫 `marks`／`moves`／`lens`（U §5.4）；新欄位用同一套，不另教 1920 基準。畫面座標只在工具內部換算（契約 media §1）。

### R5：callouts／spot／arrows 畫在運鏡層外、期間禁止運鏡

運鏡層 `#mst-<id>` 會被 `scale` 放大（`lib/media.mjs:444`）；卡片的字放在裡面會跟著被放大、變糊。畫在外面就要求 `[at, until]` 期間畫面不動（TR 也這樣規定，`TR/rec:L3-4`）。紅框（含 path）維持在運鏡層裡（現行行為）。

### R6：卡片、箭頭自動擺放

作者 TR 是手給卡片左上角座標（`TR/rec:L15`），弱模型算不好也不知道放不下。改成只給方向（或不給），工具試放、檢查安全區／子母畫面／膠囊／其他卡片，失敗時列出放得下的方向。箭頭照作者「找不到位置就不放」（`JY/WF:L61`）。

### R7：靜止區間門檻沿用作者工具

`viewersheet.py`：96×54 灰階、相鄰平均絕對差 < 2.0、連續 ≥ 8 s。數字標「建議初值」：講者坐著不太動時差值可能 < 2，範例專案實測後再調（tasks T046）。

### R8：「改過還沒 build」用 plan.json 雜湊判斷

build 對內容沒變的檔不重寫（`build.mjs:128`），`index.html` 的 mtime 不可靠；請 002 在 `--check --json` 與 `.build-manifest.json` 各放 `planHash`。過渡期用 mtime 只 ⚠。

## Project Structure

### Documentation (this feature)

```text
specs/004-media-annotations-qc/
├── spec.md
├── plan.md        ← 本檔
├── tasks.md
└── docs.md        ← 給 001 併進文件的原文
specs/contracts/
├── media.md       ← 004 寫
└── cli-004.md     ← 004 寫
```

### Source Code（只列本線會動的）

```text
shared/template/tools/lib/media.mjs     常數、MEDIA_KEYS、MEDIA_FIELDS（搬來）、checkMediaSeg、幾何純函式、
                                         placeCallout、placeArrow、newStepState、validateMedia（resolveMedia 別名）、mediaParts
shared/template/kit/media.css            新類別（契約 media §6）
shared/template/tools/lib/raster.mjs     ＋ htmlShot()
shared/template/tools/qc.mjs             ＋ storyboard、observe、framing 建議欄、checkJsonOf()
shared/template/tools/brand.mjs          ＋ bg 子指令、--help
dev/tests/media.test.mjs                 ＋ 標註案例
dev/tests/qc.test.mjs                    ＋ storyboard／observe／framing 案例
dev/tests/brand.test.mjs                 ＋ bg 案例
dev/tests/helpers.mjs                    ＋ hasChrome()（只新增）
```

**Structure Decision**：全部放在既有檔；不新增 `tools/lib/*.mjs`（新檔會動到所有權表）。

---

## 改動點

### P1 `tools/lib/media.mjs`

#### P1.1 常數（檔頭、`MARK`／`LENS` 旁邊；數字出處見契約 media §2）

```js
const SAFE = [40, 40, 1880, 900];   // 標註文字、箭頭的安全區 x1, y1, x2, y2（TR/rec:L15；字幕區 920 − 20）
const CALLOUT = { gap: 56, gapV: 40, h: 96, padL: 14, padR: 32, padPlain: 32, icon: 64, iconGap: 20, border: 2,
  full: 40, half: 24, maxLen: 12, lineAt: 0.3, lineDur: 0.25, cardAt: 0.45, cardDur: 0.4, drift: 16, quick: 0.25, out: 0.3, edge: 8 };
const READ = 1.2;                    // 完成態 ≥ 1.2 s（specs/README 定案）
const SPOT = { alpha: 0.35, pad: 8, rx: 12, fade: 0.4 };
const STEP = { left: 48, top: 40, h: 80, extra: 118, maxLen: 12, in: 0.5, inX: -24, swOut: 0.25, swIn: 0.35, swDelay: 0.1 };
const ARROW = { gap: 9, lens: [120, 96], head: 22, halfW: 2, sample: 8, fade: 0.5, slide: 12, dflt: 3, max: 1, pad: 4 };
const PATH = { dur: 0.4, min: 0.2, max: 2 };
const DIRS = { n: [0, -1], ne: [0.7071, -0.7071], e: [1, 0], se: [0.7071, 0.7071], s: [0, 1], sw: [-0.7071, 0.7071], w: [-1, 0], nw: [-0.7071, -0.7071] };
const AUTO_SIDES = ['right', 'left', 'bottom', 'top'];
const AUTO_DIRS = ['ne', 'nw', 'se', 'sw', 'e', 'w', 'n', 's'];
```

#### P1.2 `MEDIA_KEYS`、`MEDIA_FIELDS`

- `MEDIA_KEYS` 在 `'lens'` 後面插 `'callouts', 'spot', 'steps', 'arrows'`。
- `MEDIA_FIELDS` 從 `build.mjs:215-229` 整段搬來（`TRANSITIONS` 本檔就有），`marks` 列改寫、`lens` 後插 4 列（契約 media §5 原文）。**002 改 import 之前**兩邊各有一份：tasks T010 只在本檔新增，T080（整合）才請 002 刪掉 build.mjs 那份。

#### P1.3 `checkMediaSeg`（簽名不變）

- `:100` 的陣列檢查改成 `['moves', 'marks', 'lens', 'callouts', 'spot', 'steps', 'arrows']`。
- `kenburns` 預設（現行 `:69`）：`kind === 'image' && !hasAnn`，`hasAnn = ['callouts', 'spot', 'arrows'].some((k) => Array.isArray(seg[k]) && seg[k].length)`；`seg.kenburns === true && hasAnn` → ⚠ K1 並維持 false。
- 回傳的 `m` 多 `hasAnn`。

#### P1.4 幾何純函式（從 `resolveMedia` 內的閉包抽出，數字逐位相同）

```js
export function mediaGeometry(info, fit) → { kx, ky, left, top, width, height, viewH }   // 現行 :116-121
export const toStage = (G, [x, y, w, h]) => [G.left + x * G.kx, G.top + y * G.ky, w * G.kx, h * G.ky];   // 現行 :121
export const toScreen = (r, c) => [c.x + c.z * r[0], c.y + c.z * r[1], c.z * r[2], c.z * r[3]];        // 現行 :230
export const textPx = (s) => [...String(s)].reduce((a, ch) => a + (ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) <= 0x7e ? CALLOUT.half : CALLOUT.full), 0);
export const cardWidth = (text, hasIcon) => CALLOUT.border * 2 + (hasIcon ? CALLOUT.padL + CALLOUT.icon + CALLOUT.iconGap : CALLOUT.padPlain) + textPx(text) + CALLOUT.padR;
```

`resolveMedia` 內部改呼叫這幾個（行為不變；FR-014 由現有測試把關）。

#### P1.5 `placeCallout({ R, w, side, avoid })`（純函式）

輸入：`R`＝紅框矩形 `[x, y, w, h]`（畫面）、`w`＝估算卡寬、`side`＝指定或 `null`、`avoid`＝`[{ rect, why }]`（已過濾成和這個 callout 時間重疊的）。

```
pos(s):
  right : L = R.x+R.w+56;             T = clamp(R.y+R.h/2−48, 40, 900−96);  anchor 'left'
  left  : Rt = R.x−56; L = Rt−w;      T 同上;                              anchor 'right'（CSS right = 1920−Rt）
  bottom: T = R.y+R.h+40;  C = clamp(R.x+R.w/2, 40+w/2, 1880−w/2); L = C−w/2; anchor 'center'
  top   : T = R.y−40−96;   C 同上;                                         anchor 'center'
  card = [L, T, w, 96]
reasons(s) = [ 超出安全區(card 不在 SAFE 內), …avoid 裡和 card 相交的 why ]
side 有給：reasons(side) 空 → 用它；否則 ✖ C7（alt＝AUTO_SIDES 裡 reasons 空的第一個；都沒有 → 四邊都放不下）
side 沒給：AUTO_SIDES 裡第一個 reasons 空的；都沒有 → ✖ C7 四邊都放不下
回傳 { side, card, anchor, lead } 或 { fail: { side: reasons } }
```

引線 `lead`（整數 px）：
- right／left：`y1 = max(R.y+8, T+8)`、`y2 = min(R.y+R.h−8, T+96−8)`；`y1 ≤ y2` → 直線 `p0 = [R 的那條邊 x, (y1+y2)/2]`、`p1 = [卡片錨定邊 x, 同 y]`；否則直角：`p0 = [R 那條邊 x, R.y+R.h/2]`、`mid = [錨定邊 x ± 24（往卡片內）, p0.y]`、`p1 = [mid.x, 卡片上緣或下緣（離 p0 近的）]`。
- top／bottom：`x = clamp(C, R.x+8, R.x+R.w−8)`；`|x − C| ≤ w/2 − 8` → 直線 `p0 = [x, R 那條邊 y]`、`p1 = [x, 卡片近邊 y]`；否則直角：`p0 = [R.x+R.w/2, R 那條邊 y]`、`mid = [p0.x, T+48]`、`p1 = [C ∓ w/2, T+48]`。
- 錨定邊永遠是精確的（CSS 錨在那條邊），所以引線端點不受估算寬誤差影響；只有 top／bottom 的直角用到估算寬（極少發生：框貼著畫面左右緣時）。

#### P1.6 `placeArrow({ P, from, avoid, rings, pip })`（純函式）

```
order = from ? [from, …AUTO_DIRS 去掉 from] : AUTO_DIRS
for d of order, for L of [120, 96]:
  u = DIRS[d]; nrm = [−u.y, u.x]
  tip = P + 9u; base = tip + 22u; tail = tip + L·u; c1 = base + 11·nrm; c2 = base − 11·nrm
  pts = [tip, c1, c2] ＋ 從 base 到 tail 每 2 px 一點的左右兩點（線環 4 px 寬，取樣要比它密）（± 2·nrm）
  失敗原因：任一點不在 SAFE；任一點在 PIP_ZONE（pip）；任一點在 avoid 的 rect（外擴 4）；任一點在 rings 的線環內（rect 外擴 2 與內縮 2 之間）
  第一個沒有原因的 → { from: d, len: L, tip, base, tail, c1, c2 }
都失敗 → { fail: { d: reasons(L=120 那次) } }
```

- `from` 有給、它失敗但別的成功 → ✖ R6（建議成功的那個）；`from` 沒給、全失敗 → ⚠ R7 拿掉；`from` 有給、全失敗 → ⚠ R7 拿掉。
- 箭身在 SVG 畫 `line(base → tail)`，三角形 `polygon(tip, c1, c2)`；GSAP 滑入方向＝`u`（從箭尾方向滑向目標）。

#### P1.7 `newStepState()` 與 STEP 編號

```js
export const newStepState = () => ({ n: 0, byText: new Map(), last: null });   // last = { end, text, n }
```

每段（依起點順序）：
1. 解析 `steps`（T1–T5），算每步 `n`：`byText.get(text) ?? ++state.n`，寫回 `byText`。
2. 接續：`first.at ≤ s + 0.1` 且 `state.last && |state.last.end − s| ≤ 0.1` 且 `state.last.text === first.text` → `carry = true`。
3. 段結束時 `state.last = 最後一步 ? { end: e, text, n } : null`（沒有 steps 的 media 段也把 `last` 設成 null，避免隔段接續）。
4. 估算膠囊寬＝`max(textPx(text)) + 118`，矩形 `[48, 40, 48+寬, 120]`，可見時間＝`[carry ? s : first.at, e]`。

#### P1.8 `validateMedia(it, ctx)` 的順序（取代 `resolveMedia`，`resolveMedia = validateMedia` 保留別名）

| 步 | 內容 | 新／舊 |
|---|---|---|
| 1 | 幾何 `m.geo`、`pieces`（`:116-139`） | 舊 |
| 2 | 共用：`tAt`、`inSeg`、`boxOf`、`keysOk`（`:142-173`） | 舊 |
| 3 | `moves` → `m.cams`、`camAt`、`moving`（`:187-231`）；`m.kb = m.kenburns && !m.cams.length` | 舊（kenburns 預設已在 P1.3 處理） |
| 4 | `marks` 解析（`:233-257`），每個再解析 `path`（P1–P4）→ `mk.path = [{ k, at, dur, rect }]`（stage 座標，同 marks 的外擴算法） | 舊＋新 |
| 5 | `lens`（`:274-333`） | 舊 |
| 6 | `steps`（P1.7） | 新 |
| 7 | `callouts`：欄位（C1–C5）、時間（`until` 預設段尾、C6）、運鏡（C8：`m.cams` 任一 `[t0, t0+dur]` 和 `[at, until]` 重疊）、畫面矩形 `R = toScreen(toStage(box)) ± 8`（C11：完全在 1920×1080 外）、`avoid`＝PIP（`pipAt(at)‖pipAt(mid)‖pipAt(until−0.01)`）＋膠囊（時間重疊）＋前面已擺好的 callout 卡與框＋marks 矩形外擴 2（時間重疊，用 `camAt(at)` 換到畫面）→ `placeCallout`；C12（和 lens 重疊）、C10（`pieces` 切點在 `(at, until)`） | 新 |
| 8 | 紅框數：marks（步 4，含最後一框多停 1 s 之後）＋callouts 的框，同一時刻 > 2 → ✖ C9（只有 marks 時原文不變） | 舊規則擴大 |
| 9 | `marks` 的畫面 ⚠（`:258-271`）＋每步 `path` 終點同樣 3 則 ⚠（P5） | 舊＋新 |
| 10 | `spot`：S1–S3、C8、C10；亮區 `R = toScreen(toStage(box)) ± 8`，`rx 12` | 新 |
| 11 | `arrows`：R1–R5、C8、C10；lens 期間 → ⚠ R8 拿掉；`P = toScreen(toStage([x, y, 0, 0]))`；`avoid`＝膠囊＋callout 卡（時間重疊）；`rings`＝callout 框＋marks 矩形（時間重疊）→ `placeArrow` → R6／R7 | 新 |
| 12 | 膠囊碰撞 ⚠ T6：膠囊矩形和 spot 亮區、marks 矩形、callout 框（時間重疊）相交 | 新 |
| 13 | 組 `summary`、`json`（契約 media §4.1）；把結果掛在 `it.media.callouts／spots／steps／arrows` 給 `mediaParts` | 新 |

時間重疊一律用 `a.at < b.until − 1e-6 && b.at < a.until − 1e-6`。所有畫面座標存整數（`Math.round`），和 marks 在 `z = 1` 時的 `q()` 一致（`:263`）。

#### P1.9 `mediaParts`（簽名不變；只有用到時才多輸出）

- HTML：在 `#mst-<id>` 的 `</div>`（`:400`）之後、放大鏡（`:401`）之前插入：
  1. `<svg id="man-<id>" class="clip mann" data-start data-duration data-track-index viewBox="0 0 1920 1080" data-layout-allow-overlap>`：依序放 spot（`<g class="mspot"><mask …>…</mask><rect class="mspot-dim" …/></g>`）、callout 框 `<rect class="mcbox" … rx="6" pathLength="1"/>`、引線 `<g class="mclead"><path d="M… L…" pathLength="1"/><circle r="5"/></g>`、箭頭 `<g class="marrow"><line/><polygon/></g>`。
  2. `<div id="mcd-<id>" class="clip mcards" data-start data-duration data-track-index data-layout-allow-overlap>`：膠囊 `<div class="msteps"><div class="mstep"><span class="mnum">N</span><span class="mtxt">…</span></div>…</div>`、說明卡 `<div class="mcard mcard--<side>[ mcard--plain]" style="left:Lpx|right:Rpx;top:Tpx"><span class="mic">SVG</span><span class="mtxt">…</span></div>`。
  - 文字一律 HTML escape（`& < > "`）；圖示 `icons.get(name)`（`validateMedia` 把 SVG 字串存在 callout 物件上，`mediaParts` 不用再查）。
  - 計時容器的 `data-start`／`data-duration` 和 marks 一樣用 `sh(s)`、`e − s`。
- 時間軸：契約 media §6 原文；`--test`：`sh(t) = t − off`，`at ≥ lim` 的標註整個跳過（同放大鏡 `:402`）；`until > lim` 的退場行照寫（GSAP 超出時間軸長度不影響）。
- 順序：marks 的描線行之後、放大鏡行之前輸出（同一時刻多個 tween 不衝突，順序只影響可讀性）。

### P2 `kit/media.css`

照契約 media §6 的 CSS 表新增 10 個類別，加在「紅框」與「放大鏡」兩段之間，各段一行註解（照檔案現有風格）。不改現有類別。

### P3 `tools/lib/raster.mjs`

```js
// Chrome 截本機 HTML（中文字、背景圖用）：htmlShot({ chrome, file, out, width, height, timeout = 60000 })
// → 寫出 out（PNG）；失敗丟 Error（訊息含 stderr 末 300 字）
```

- 參數：`--headless --hide-scrollbars --mute-audio --no-first-run --no-default-browser-check --force-device-scale-factor=1 --window-size=W,H --virtual-time-budget=5000 --user-data-dir=<os.tmpdir()/hf-shot-XXXX> --screenshot=<out> <pathToFileURL(file).href>`；`spawnSync`，用完 `fs.rmSync(userDir, { recursive: true, force: true })`（Windows 可能鎖檔：重試 5 次、每次 300 ms，同 `audit-browser.mjs:212`）。
- 檔頭註解加一行用法；既有函式不動。

### P4 `tools/qc.mjs`

| 位置 | 改動 |
|---|---|
| 檔頭 `--help` | 照 cli-004 §6.1 加兩段、framing 一句 |
| `VALUE_FLAGS` | 加 `from`、`to`、`offset`、`chrome` |
| `expectedFromBuild`（`:236`） | 拆出 `checkJsonOf(P, flags) → { json, error }`（同一個 spawn），`expectedFromBuild` 改呼叫它，回傳不變 |
| 新純函式 | `shotPlan(items, outputDur) → { shots: [{ id, file, at, why }], warnings }`、`observeTimes(from, to, step)`、`cuesToOut(cues, cuts)`、`cellLabel(t, items, cues) → 'm:ss.s｜id｜字幕'`、`staticRuns(grays, { step, diff, min }) → [[a, b]]`、`seamList(items, from, to) → [{ n, at, before, after }]`、`suggestZoom(cands, srcWidth)` |
| `storyboardRun(P, flags)` | §2.1 檢查 → `shotPlan` → 清 `work/hyperframes/.storyboard-shots/` → `run('npx', ['hyperframes', 'snapshot', '--at', ts.join(','), '--no-end', '--keep', '-o', '.storyboard-shots', '--json'], { cwd: P.out, shell: WIN, timeout: 600000 })` → 解析 stdout JSON → 依 `time`（誤差 < 0.0005）對到 shots → `fs.copyFileSync` 到 `work/storyboard-preview/` → 刪 `.storyboard-shots/` → stale 清單 |
| `observeRun(P, flags)` | 清舊輸出 → `checkJsonOf`（失敗 ⚠）→ `parseSrt(P.srt)`＋`cuesToOut`（沒有 ⚠）→ `findChrome` → 每 24 s 一個 ffmpeg：`-ss A -t 24 -i file -vf fps=2,scale=320:180:flags=bicubic -q:v 4 .tiles/c<NN>-%04d.jpg` → 一個 ffmpeg 灰階：`-ss from -t len -vf fps=2,scale=96:54,format=gray -f rawvideo pipe:1` → `staticRuns` → 每個接縫一個 ffmpeg：`-ss max(0, t−0.5) -t 0.8 -vf fps=10,scale=236:133 -q:v 4 .tiles/s<NNN>-%02d.jpg` → 每張總表／條帶寫 HTML（`<img src="c01-0001.jpg">`、`<link href="<kit/fonts.css 的 file URL>">`）→ `htmlShot` → `ffmpeg -i x.png -q:v 3 sheet-NN.jpg` → `index.md` → 刪 `.tiles/` |
| `printStoryboard`、`printObserve` | cli-004 §2.3、§3.3 原文 |
| `printFraming`（`:546`） | 表頭加「｜建議」、每列尾加 `✔`／`—`、表後一行 `建議：…`（cli-004 §4） |
| `cli()`（`:580`） | 指令清單加 `storyboard`、`observe`；`--json` 對 storyboard／observe 生效 |

邊界：
- `fps=2` 第 k 張對應 `A + 0.5k`；最後一段不足 24 s 時張數照 ffmpeg 實際輸出（`readdir` 數），標籤時間照 k 算。
- 灰階幀數和 tiles 總數不一致時以較少的為準（尾巴少一格不影響靜止判斷）。
- 接縫 `t − 0.5 < 0` 時從 0 開始，條帶格數照實際（< 8 格），格下標籤照實際相對時間。
- 格子 `段 id`：`items` 中 `out.start ≤ t < out.end` 且 `out.start` 最大者；字幕：`start ≤ t < end`。
- `index.md` 的「在哪張」：`sheet = ⌊(t − from) / 24⌋ + 1`、`r = ⌊((t − from) mod 24) / 3⌋ + 1`、`c = ⌊(((t − from) mod 3) / 0.5)⌋ + 1`。

### P5 `tools/brand.mjs`

| 位置 | 改動 |
|---|---|
| 檔頭註解、`--help` | cli-004 §6.2 全文 |
| 新常數 | `BG_KINDS = { fs: { w: 1920, h: 1080, zones: [{ name: '全畫面主卡', color: 'red', rect: [120, 150, 1380, 862] }, { name: '子母畫面', color: 'blue', rect: [1424, 581, 1888, 951] }, { name: '字幕帶', color: 'yellow', rect: [0, 920, 1920, 1080] }] }, side: { w: 960, h: 1080, zones: [{ name: '側邊欄文字區', color: 'red', rect: [0, 86, 816, 864] }] }, ch: { w: 1920, h: 1080, zones: [{ name: '章名卡', color: 'red', rect: [160, 260, 1760, 870] }] } }`（`[x1, y1, x2, y2]`） |
| `injectHead(html, { baseUrl, links, w, h })` | 純函式；有 `<head …>` 插在它後面，沒有就放最前面 |
| `decorRatio(rgb, W, H, rect, th = 40)` | 純函式：框內亮度中位數（256 格直方圖）、`|L − 中位| > th` 的占比 |
| `renderBg({ html, kind, out, chrome, kitDir })` | 檢查 → `injectHead` 寫 `.bg-<kind>.render.html` → `htmlShot` → `ffmpeg -y -v error -i raw-<kind>.png -q:v 2 bg-<kind>.jpg` → `probeMedia` 驗尺寸 → `drawbox` 疊框 `zones-<kind>.jpg`（每框 `drawbox=x:y:w:h:color=<c>@0.8:t=4`）→ `rawFrame(bg-<kind>.jpg)`＋`decorRatio` → 三張到齊 `makePreview(out)`：`[0]scale=640:360[a];[1]scale=320:360[b];[2]scale=640:360[c];[3]scale=640:360[d];[4]scale=320:360[e];[5]scale=640:360[f];[a][b][c]hstack=3[top];[d][e][f]hstack=3[bot];[top][bot]vstack` → 刪 render.html |
| `cli()` | `args[0] === 'bg'` → `bgCli(args.slice(1))`；其餘照舊（`"#RRGGBB"`、`--kit`、`--no-frame`）；沒色碼的 ✖ 原文加一句 bg 用法 |
| `--out` 保護 | `path.relative(templateDir, out)` 不以 `..` 開頭且不是絕對 → ✖（`templateDir`＝`HERE/..`，`--kit` 測試時用 `path.dirname(kitDir)`） |

`ffmpeg` 呼叫一律走 `lib/ff.mjs` 的 `run`（只 import，006 擁有）；`probeMedia`、`rawFrame` 同。

### P6 測試（`dev/tests/`）

| 檔 | 新案例 | 需要 |
|---|---|---|
| `media.test.mjs` | 幾何例題 3 組；`cardWidth`；`placeCallout` 例題（right 失敗→left）與四邊都失敗；`placeArrow`（箭尖距離 9、出畫改方向、全失敗 null、紅框線環擋住）；C1–C12、S1–S3、T1–T6、R1–R8、P1–P5、K1、X1 訊息；兩段相接的 STEP 編號與接續；`validateMedia` 的 `summary`／`json`；build 後 HTML 與時間軸原文（一般、quick、spot、arrow、steps、path）；沒有標註的段不含 `mann`／`mcards`；`--test` 起點在標註之後時不產生 | ffmpeg |
| `qc.test.mjs` | `shotPlan`（一般、條列 3 條、條列間隔 0.3、media 4 個標註含併張、段長 0.5）；`observeTimes`；`cellLabel`；`cuesToOut`（cuts）；`staticRuns`；`seamList`（合併、範圍、標籤）；`suggestZoom` 兩組；storyboard 三種 ✖ 原文（用假的 `--check --json`：寫一個 stub plan 讓它 ✖、刪 index.html）；有 Chrome＋hyperframes：假專案 build → storyboard 檔名集合；有 Chrome：22 秒靜止測試片 observe（sheet 尺寸、靜止區間 ±0.5、index.md 表格列、`notes.txt` 保留） | ffmpeg；部分 Chrome |
| `brand.test.mjs` | `injectHead`（有／沒有 head）；`decorRatio`（純色 0、4 px 線 0.5–0.6 %）；`--out` 在 template 裡 ✖；`--kind` 錯 ✖；`--help` 含 `bg --html`；有 Chrome：三種 kind 尺寸、乾淨頁 ✔、有線頁 ⚠、preview 1600×720 | 部分 Chrome |
| `helpers.mjs` | `hasChrome()`：`try { return findChrome() } catch { return null }`，結果快取 | — |

Chrome 案例：`test('…', { skip: !hasChrome() && '沒有 HyperFrames 的 Chrome，略過' }, …)`。

### P7 docs.md

給 001 的原文（見 docs.md），不直接改 001 的檔。

---

## 資料流

```text
plan.json ──checkMediaSeg──▶ it.media（欄位、kenburns 預設）
            plan.mjs 定時間、pipPieces
          ──validateMedia(it, { cues, tm, pipAt, icons, steps })──▶ it.media.{cams, marks(+path), lenses, callouts, spots, steps, arrows}
                                                                 └▶ { summary → --check 報告, json → --check --json items[].out.annotations }
          ──mediaParts──▶ index.html（#mst 運鏡層 ＋ svg.mann ＋ div.mcards ＋ .mlz 放大鏡）

--check --json（items[].out, planHash）──▶ qc.mjs storyboard ──npx hyperframes snapshot──▶ work/storyboard-preview/*.png ＋ 貼上用 markdown
                                       └─▶ qc.mjs observe ◀── 成片/final.mp4、work/rough.srt
                                              ffmpeg 抽格 ─▶ HTML ─htmlShot─▶ work/觀影/sheet-NN.jpg、seam-NN.jpg、index.md
<暫存>/bg-<kind>.html ──brand.mjs bg──htmlShot──▶ <暫存>/bg-<kind>.jpg、zones-<kind>.jpg、preview.jpg ──（使用者同意）──▶ shared/template/bg-*.jpg
```

## Complexity Tracking

| 項目 | 為什麼需要 | 更簡單的做法為什麼不行 |
|---|---|---|
| observe 依賴 Chrome | 總表要印中文字幕 | 點陣字沒有中文、drawtext 在 Windows 沒有（R2） |
| 卡片／箭頭自動擺放 | 弱模型算不好座標、也不知道放不下；作者箭頭規則本來就是「找位置、找不到就不放」 | 讓 AI 手寫卡片座標：TR 的作法，但要另教 1920 基準座標、AI 需要量卡片寬 |
| `marks[].path[].dur` 多一個選填欄位 | `ES/seg31:L86` 換目標 0.4 s、`:108-109` 跟捲動 0.6 s | 固定 0.4：錄影捲動較慢時框會先到、內容後到 |
| 兩層新容器（svg.mann、div.mcards） | 標註要在運鏡層外（R5），文字要是 HTML（字型、圖示） | 全部塞進 marks 的 svg：在運鏡層裡會被放大 |
