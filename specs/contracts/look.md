# 契約：講者調光＋瘦臉（look）

- **擁有者**：006 look。**照它做**：002（build 呼叫 `ensureLook`、`lookCheck`；plan.mjs 驗證 `plan.look`）、005（`audioKey` 加 `look`、`encodeFootagePolished` 轉傳 `lut`）、004（`qc.mjs framing` 用套好的底片）、001（文件）、007（check-all 選用）。
- **出處**：分析報告 `04-face-light.md`（下稱 04）§3、§4、§4.5、§4.6、§6；原型 `analysis/scripts/warp.mjs`、`tv_probe.mjs`、`make_video.py`；`specs/README.md` 定案列「瘦臉調光」。
- 本檔的函式全部從 `shared/template/tools/lib/look.mjs` 匯出（`filterPath`、`lut3dFilter` 從 `lib/ff.mjs` 匯出）。數字的單一真相在本檔 §8 的常數表；程式照表寫，文件引用「照 contracts/look.md §8」。

## 1. 資料流（一張圖）

```
work/rough.mp4 ──(look.mjs run：Chrome＋MediaPipe 偵測)──► work/face-landmarks.json
      │                                                         │
      │                 (look.mjs run：ffmpeg 解碼 YUV → Node 變形 → x264，音軌 copy)
      │                                                         ▼
      │                                               work/rough-look.mp4（只瘦臉，不調色）
      ▼                                                         │
 build.mjs ── ensureLook() ──► { footage: rough.mp4 或 rough-look.mp4, lut: 混合後的 .cube 或 null, key, report }
      │
      └─► encodeFootagePolished(footage → work/hyperframes/assets/rough.mp4, { crop, lut })
            ffmpeg -vf：crop → scale → lut3d → fps=30（調光在這裡 bake，一次）
```

- 調光只在 build 重新編碼底片時做一次（04 §6.1「等於順手做」）；`rough-look.mp4` **不含調光**，所以改調光強度不用重跑瘦臉（設計決定 D1，見 `specs/006-look/plan.md`）。
- 子母畫面 `pipv-*` 用同一支 `assets/rough.mp4`（`lib/main.mjs:84`），自動一起套用（04 §6.5 最後一點）。

## 2. `plan.look` 與 `kit/look.json`

### 2.1 `shared/template/kit/look.json`（每支影片共用的預設）

```json
{
  "color": 0.8,
  "slim": 0.6,
  "lut": "look/jianying-smart.cube"
}
```

| 欄位 | 型別 | 範圍 | 意思 | 出處 |
|---|---|---|---|---|
| `color` | 數字 | 0–1 | 調光強度＝剪映「智能調色」值（0.8＝UI 80）；0＝不調 | 04 §2.2、§6 表；README 定案「預設 color 0.8」 |
| `slim` | 數字 | 0–1.2 | 瘦臉強度＝剪映「瘦脸」值（0.6＝剪映「瘦脸 0.6＋V脸 0.1」的實測位移）；0＝不瘦 | 04 §2.1、§4、§6 表（上限 1.2：超過脖子與領口會彎）；README 定案「slim 0.6」 |
| `lut` | 字串 | 相對 `shared/template/kit/` 的路徑 | 調光用的 3D LUT | 04 §6.2 |

- 只有這三個欄位；多的欄位 `readKitLook()` 丟錯：`kit/look.json 不能有「x」→ 只能寫 color、slim、lut`。
- `kit/look/*.cube` 一律代表 **color = 0.8** 時的效果（`LUT_REF`，§8）：`jianying-smart.cube` 是拿剪映智能調色 0.8＋美白 0.3 的完成影片擬合的（04 §2.2、§5）。

### 2.2 `plan.json` 第一層的 `look`（個別專案覆寫）

| 寫法 | 意思 |
|---|---|
| 沒寫 | 全部用 `kit/look.json` |
| `"look": false` | 調光、瘦臉都關（等於 `{ "color": 0, "slim": 0 }`） |
| `"look": { "color": 0.5 }` | 調光 0.5；沒寫的 `slim` 用 `kit/look.json` |
| `"look": { "color": 0.8, "slim": 0 }` | 只調光、不瘦臉（剪輯台一律兩個都寫） |

驗證 `validateLook(v) → string[]`（每則訊息都帶 →）：

| 輸入 | 訊息（原文） |
|---|---|
| `null`、`true`、字串、陣列 | `plan.json 的 look 要是物件或 false → 例如 "look": { "color": 0.8, "slim": 0.6 }；要用預設就把 look 整個拿掉` |
| 多的鍵 | `look 不能有「x」→ 只能寫 color、slim` |
| `color` 不是 0–1 的數字 | `look.color 要是 0–1 的數字（0＝不調光），現在是 1.5` |
| `slim` 不是 0–1.2 的數字 | `look.slim 要是 0–1.2 的數字（0＝不瘦臉；超過 1.2 脖子與領口會被拉彎），現在是 2` |

- 數字照收，用的時候四捨五入到 0.01（`r2`）。
- 002 的 `plan.mjs` 把 `look` 加進 `TOP_KEYS`（現在是 `lib/plan.mjs:25`），`resolvePlan` 呼叫 `validateLook(plan.look)`，回傳的每則當 ✖。
- `resolveLook({ plan, templateDir }) → { color, slim, lutFile, source }`：`source` 是 `'kit'`（沒寫）、`'plan'`（物件）、`'off'`（`false`）。

## 3. `ensureLook()`：build 的接線

```js
import { ensureLook, lookCheck } from './lib/look.mjs';

const look = ensureLook({ projectDir: P.project, plan, log, templateDir: P.templateDir, strict: true });
// → { footage, lut, key, report }
```

| 參數 | 型別 | 說明 |
|---|---|---|
| `projectDir` | 絕對路徑 | `projects/<專案>` |
| `plan` | 物件 | 已解析的 plan.json（`plan.look` 可能沒有） |
| `log` | `(line) => void` | 只在寫混合 LUT 時印一行；回報行放在 `report`，由呼叫端印 |
| `templateDir` | 絕對路徑，選填 | 預設 `lib/` 往上兩層（`shared/template`）；測試用 `--template` 時要傳 |
| `strict` | 布林，預設 `true` | `true`（build）：瘦臉底片過期而且能跑時**丟錯**；`false`（framing、剪輯台）：不丟錯，改回 `rough.mp4` 並在 `report` 放 ⚠ |

| 回傳 | 型別 | 說明 |
|---|---|---|
| `footage` | 絕對路徑 | `work/rough.mp4` 或 `work/rough-look.mp4`。build 拿它當 `audioKey` 的 `src`、`encodeFootagePolished` 的 `src`、`frameCrop` 的來源（解析度可能不同，§5.4） |
| `lut` | 絕對路徑或 `null` | 混合後的 `.cube`（`work/.look/lut-<color>-<sha8>.cube`，已照強度和恆等混合好）；`color = 0` 時 `null`。build 原樣傳給 `encodeFootagePolished({ lut })` |
| `key` | 物件或 `null` | 放進重新編碼戳記（§4）。調光與瘦臉實際都沒套時是 `null`（舊專案的戳記不變、不必重新編碼） |
| `report` | 字串陣列 | build 要原樣印的行（§3.2） |

- **同步、不開 Chrome、不跑重的東西**；只讀 `work/.look/state.json`、stat 幾個檔、必要時寫一個 132 KB 的混合 LUT（約 20 ms）。
- 丟出的 Error 的 `message` 不含 `✖`，build 的 CLI 會自己加（`build.mjs:592-596`）。

### 3.1 判斷表（照順序，第一個符合的那列）

| # | 條件（可觀察的事實） | `footage` | `key.slim` | `report` | `strict` 丟錯？ |
|---|---|---|---|---|---|
| 1 | `plan.look === false`，或 color 與 slim 都是 0 | rough.mp4 | — | `講者調光：關`、`講者瘦臉：關` | 否（`key`＝null、`lut`＝null） |
| 2 | slim = 0 | rough.mp4 | 0 | 調光行、`講者瘦臉：關` | 否 |
| 3 | `state.json` 的 `run.phase` 是 `locate`／`detect`／`render`／`preview` 而且 pid 還活著 | rough.mp4 | 0 | `⚠ 講者瘦臉還在跑（look.mjs run，pid N；status 顯示「完成」再 build）→ node shared/template/tools/look.mjs status --project <專案>` | **是**：`瘦臉還在跑（pid N；status 顯示「完成」再 build）→ node shared/template/tools/look.mjs status --project <專案>` |
| 4 | landmark 最新，而且 `summary.slimOk === false`（`reason` 是 `small`、`noface` 或 `rate`） | rough.mp4 | 0 | `⚠ 講者瘦臉略過：<原因>`（§3.2） | 否 |
| 5 | 瘦臉底片最新（§5.3） | rough-look.mp4 | slim | 調光行、瘦臉行 | 否 |
| 6 | 過期或沒跑過，**而且不能跑**：`vendor/mediapipe` 少檔或大小不符 manifest，或 `chromeCandidates()` 找不到 Chrome | rough.mp4 | 0 | `⚠ 講者瘦臉略過：<缺什麼> → <修法>` | 否 |
| 7 | 過期或沒跑過，能跑 | rough.mp4 | 0 | `⚠ 瘦臉還沒套到底片（<原因>），這次先用 work/rough.mp4 → <run 指令>` | **是**（§3.2 的 ✖ 原文） |

- 「能跑」只看檔案大小與 Chrome 路徑（`lib/audit-browser.mjs:32` 的 `chromeCandidates`，不呼叫 `npx`）；sha256 只在 `look.mjs run／status／ensure` 驗（14.5 MB 約 50 ms，build 每次都驗不划算）。
- 過期原因（照順序檢查，報第一個）：`還沒跑過`、`rough.mp4 換過（剪乾淨重做了）`、`瘦臉強度 0.6 → 0.8`、`work/rough-look.mp4 不見了或被改過`、`look.mjs 版本更新（LOOK_VER 1 → 2）`。

### 3.2 `report` 的原文

| 情況 | 原文 |
|---|---|
| 調光開 | `講者調光：0.8（kit/look/jianying-smart.cube，build 重新編碼底片時 bake）` |
| 調光關 | `講者調光：關（<plan.json 的 look｜kit/look.json>）` |
| 瘦臉套用 | `講者瘦臉：0.6（work/rough-look.mp4；偵測率 99.98%、臉寬中位數 172 px）` |
| 瘦臉關 | `講者瘦臉：關（<plan.json 的 look｜kit/look.json>）` |
| 略過：臉太小 | `⚠ 講者瘦臉略過：臉寬中位數 43 px < 60 px（畫面太小，瘦臉效果不到 1 px），只調光` |
| 略過：抽樣沒臉 | `⚠ 講者瘦臉略過：抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就跑 node shared/template/tools/look.mjs run --project <專案> --force` |
| 略過：偵測率低 | `⚠ 講者瘦臉略過：偵測率 72%（< 80%），只調光 → 看 work/look-preview.jpg；確定不要瘦臉就在 plan.json 寫 "look": { "slim": 0 }` |
| 略過：缺資產 | `⚠ 講者瘦臉略過：找不到 shared/template/vendor/mediapipe/<檔名>，只調光 → node shared/template/tools/look.mjs ensure` |
| 略過：缺 Chrome | `⚠ 講者瘦臉略過：找不到 HyperFrames 的 Chrome，只調光 → npx hyperframes browser ensure` |
| 過期（strict 丟錯），預估 ≤ 2 分 | `瘦臉底片不是最新的（<原因>；預估 <N> 分；不要瘦臉就在 plan.json 寫 "look": { "slim": 0 }）→ 先跑 node shared/template/tools/look.mjs run --project <專案>` |
| 過期（strict 丟錯），預估 > 2 分 | `瘦臉底片不是最新的（<原因>；預估 <N> 分，超過 2 分鐘就在背景跑，用 look.mjs status 看進度；不要瘦臉就在 plan.json 寫 "look": { "slim": 0 }）→ 先跑 node shared/template/tools/look.mjs run --project <專案> --background` |
| 過期（非 strict） | `⚠ 瘦臉還沒套到底片（<原因>），這次先用 work/rough.mp4 → <和上一列同一個 run 指令>` |

`<專案>` 一律印相對工作區根目錄的路徑（`projects/範例`）；`<N>` 照 §8 的預估公式（landmark 還是最新時不算偵測，只算變形）；讀不到 rough.mp4 時不印預估。

**指令一律放在 `→` 後面、行尾**（審查 C-02）：說明都在括號裡、`→` 前面，從 `→ ` 後面複製到行尾就能直接執行；預估超過 2 分鐘時指令直接帶 `--background`。

### 3.3 `lookCheck()`：給 `build.mjs --check`

```js
const lc = lookCheck({ projectDir, plan, templateDir });   // → { errors: string[], warnings: string[] }
```

- `errors`＝`validateLook(plan.look)`；`warnings`＝§3.1 第 3、4、6 列的 ⚠ 行（去掉 `⚠ `），第 7 列是 `build 會停下來：` ＋ §3.2 的 ✖ 原文（不丟錯）。快（< 5 ms），不寫任何檔。
- 第 7 列在 `--check` 只算 ⚠、build 是 ✖（裁決 D4）：前綴「build 會停下來：」讓只看 `--check` 的人知道 build 會停（審查 C-14；要不要讓 `--check` 也算 ✖ 由 002 決定）。
- 002 把它併進 `--check` 的 errors／warnings（文字與 `--json` 都要有）。

### 3.4 framing 用（給 004）

```js
const look = ensureLook({ projectDir: P.project, plan: planOrEmpty, templateDir, strict: false });
const extraVf = look.lut ? lut3dFilter(look.lut) : '';   // 從 lib/ff.mjs 匯入
```

`qc.mjs framing`（含 `--cards`）抽格改用 `look.footage`，並在 `frame1080()` 的 `-vf` 的 `format=rgb24` 前面接 `extraVf`；印出 `look.report` 的每一行。plan.json 還沒有時 `planOrEmpty = {}`（用 kit 預設）。

### 3.5 `lookNextStep()`：look 階段的下一步（look.mjs status／run 的最後兩行；給 002 的 status.mjs）

```js
import { lookNextStep, nextLines } from './lib/look.mjs';
const ns = lookNextStep({ projectDir, plan, templateDir });   // plan＝plan.json 的內容，還沒有就 {}；probe 同 ensureLook（測試用）
// → { step, done, note, cmd }
for (const l of nextLines(ns)) console.log(l);                // ['→ 下一步：' + note, cmd]
```

- 只讀：不寫任何檔、不呼叫 `ensureLook`（它會寫混合 LUT）；第 7 列會跑一次 ffprobe（預估分鐘）、讀一次模型的 sha256（約 10 ms）。
- `cmd` 一律是單獨一行、可以整行複製執行的指令（`node …` 或 `npx …`，後面不接任何字）；`note` 是一句說明，印在上一行（審查 C-02）。`<專案>` 有空白或 shell 特殊字元時加雙引號（`projArg()`，zsh 與 PowerShell 都吃）。
- `done`＝look 階段不用再做什麼（status.mjs 照自己的表往下）；`false` 時 status.mjs 的下一步就用這個 `note`＋`cmd`，不自己判（審查 C-01）。

| 順序 | 條件 | `step` | `done` | `note` | `cmd` |
|---|---|---|---|---|---|
| 1 | `validateLook(plan.look)` 有錯，或 kit/look.json 讀不了 | `fix` | false | `plan.json 的 look 寫錯（<第一則訊息>）；改好再看一次` | `node shared/template/tools/look.mjs status --project <專案>` |
| 2 | §3.1 第 3 列（還在跑） | `wait` | false | `瘦臉還在跑；每 30 秒看一次，看到「執行：完成」再往下` | 同上 |
| 3 | §3.1 第 6 列，缺 Chrome | `chrome` | false | `找不到 HyperFrames 的 Chrome，裝好再跑瘦臉` | `npx hyperframes browser ensure` |
| 4 | §3.1 第 6 列，缺資產 | `ensure` | false | `少臉部偵測的檔；照 AGENTS.md 規則 3 先告訴使用者要下載約 18 MB，同意再跑` | `node shared/template/tools/look.mjs ensure --download` |
| 5 | §3.1 第 7 列，`state.run.phase` 是 `failed` | `retry` | false | `上次失敗（原因在 work/.look/run.log 最後幾行）；重跑一次，預估 <N> 分（Windows 約 ×1.5–3）…，第二次失敗就停下來回報` | §3.2 的 run 指令（> 2 分帶 `--background`） |
| 6 | §3.1 第 7 列 | `run` | false | `瘦臉底片要重做（<原因>），預估 <N> 分（Windows 約 ×1.5–3）`；> 2 分再接 `，超過 2 分鐘所以在背景跑，之後每 30 秒跑一次 look.mjs status` | 同上 |
| 7 | 1、2、4、5 列（look 好了），plan.json 有 `scenes` 而且不是空的 | `build` | true | `look 好了；plan.json 已經有段落，接著 build` | `node shared/template/tools/build.mjs --project <專案>` |
| 8 | look 好了，`work/構圖預覽-套卡.jpg` 存在、而且不比 `rough-look.mp4` 舊（沒用 rough-look 時只看存在） | `next` | true | `look 和構圖預覽都做好了；照專案進度往下` | `node shared/template/tools/status.mjs --project <專案>` |
| 9 | 其他（look 好了，還沒做構圖預覽） | `framing` | true | `look 好了；接著做構圖＋套卡預覽，和 work/look-preview.jpg 一起給使用者看（停點 ②）` | `node shared/template/tools/qc.mjs framing --project <專案> --cards` |

順序就是流程：look run（或 `--background`）→ 構圖＋套卡預覽 → 停點 ②；plan.json 還沒有段落時不會叫人 build。`FRAMING_CARDS`（`'構圖預覽-套卡.jpg'`）也匯出。

## 4. 重新編碼戳記的 `look` 鍵（給 005）

`audioKey()`（`lib/audio.mjs:115-118`）加一個參數 `look = null`，和 `frame` 一樣「有才放」：

```js
audioKey({ src, cutpoints, loudnorm, declick, frame, look })
// → { v, size, mtimeMs, loudnorm, target, declick, fade, points, ...(frame ? { frame } : {}), ...(look ? { look } : {}) }
```

`look` 就是 `ensureLook().key`，內容固定：

```json
{ "v": 1, "color": 0.8, "lut": "56969a5a84ac", "slim": 0.6, "footage": "rough-look.mp4" }
```

| 欄位 | 意思 |
|---|---|
| `v` | `LOOK_VER`（§8）；演算法改了就 +1，所有專案自動重新編碼 |
| `color` | 實際套用的調光強度（0–1，兩位小數） |
| `lut` | 原始 `.cube`（不是混合後的）sha256 前 12 碼；`color = 0` 時不寫 |
| `slim` | **實際**套用的瘦臉強度：略過（§3.1 第 4、6 列）時是 0 |
| `footage` | `rough.mp4` 或 `rough-look.mp4` |

- build 把 `src` 從 `P.video` 換成 `look.footage`：`rough-look.mp4` 重新產生時 size／mtime 會變，戳記自然失效。
- 剪輯台讀 `work/hyperframes/.cache/footage-audio.json` 的 `key.look` 判斷 `assets/rough.mp4` 已經 bake 了什麼（§7.2）。沒有 `key.look`＝什麼都沒 bake。

`encodeFootagePolished(src, dst, opts)`（`lib/audio.mjs:133`）多收 `lut = null`，兩處 `encodeFootage(...)`（`:138`、`:165`）原樣帶 `{ crop, lut }`。

## 5. 檔案格式

### 5.1 `work/face-landmarks.json`

```json
{
  "version": 1,
  "source": { "file": "rough.mp4", "size": 52314321, "mtimeMs": 1761800000000, "width": 640, "height": 360,
              "fps": "359/12", "fpsNum": 29.917, "frames": 5111, "duration": 170.837 },
  "detector": { "name": "mediapipe-face-landmarker", "tasksVision": "1.2.0", "modelSha256": "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
                "delegate": "CPU", "numFaces": 2, "minFaceDetectionConfidence": 0.3, "minFacePresenceConfidence": 0.3,
                "detectWidth": 640, "roiScale": 3.25, "roiSize": 384, "every": 1, "lmVer": 1 },
  "points": [0, 1, 4, 6, 10, 13, 14, 17, 18, 21, 33, 54, 58, 61, 67, 70, 93, 103, 105, 109, 127, 132, 133, 136, 148, 149, 150, 152, 162, 168,
             172, 175, 176, 199, 200, 234, 251, 263, 284, 288, 291, 297, 300, 323, 332, 334, 338, 356, 361, 362, 365, 377, 378, 379, 389, 397, 400, 454],
  "frames": [ null, 0, { "p": [x0, y0, x1, y1, "…共 116 個數字"], "b": [x0, y0, x1, y1], "n": 1 }, { "p": ["…"], "b": ["…"], "n": 1, "i": 1 } ],
  "summary": { "detected": 5110, "black": 0, "missing": 1, "rate": 0.9998, "medianFaceWidth": 43.1, "lookFaceWidth": 43.1,
               "slimOk": false, "reason": "small", "msPerFrame": 16.9, "elapsedSec": 88 }
}
```

| 欄位 | 規則 |
|---|---|
| `source` | 偵測當下 `rough.mp4` 的 stat 與 ffprobe；`fps` 是 ffprobe 的 `avg_frame_rate` 原字串（沒有或 0 用 `r_frame_rate`）。第 i 格的時間＝i ÷ fpsNum 秒（解碼一律先過 `fps=<fps>` 濾鏡，§6.1） |
| `points` | 存哪 58 個 MediaPipe 點（照編號排序）：瘦臉的移動點、只上提點、固定點、臉輪廓的聯集（`warp.mjs:11-14`）。下一階段做大眼要眼周點時，`lmVer` +1 重新偵測 |
| `frames[i]` | `null`＝沒偵測到臉；`0`＝全黑格（只有聲音的區間，跳過偵測，不算進偵測率）；物件＝偵測到 |
| `p` | 58 點的 x、y 交錯，**rough.mp4 的像素座標**，一位小數；**原始值，沒有平滑**（平滑在讀的時候做，§6.3） |
| `b` | 臉框：478 點的最小／最大 x、y（rough.mp4 像素） |
| `n` | 這格偵測到幾張臉（取最大那張存）；> 1 時 preview 會提醒 |
| `i` | `1`＝`--every 2` 內插出來的格（前後兩格都有偵測到才內插，否則 `null`） |
| 信心值 | **tasks-vision 1.2.0 不提供每張臉的分數**（`vision.d.ts:714-726` 的 `FaceLandmarkerResult` 只有 landmarks、blendshapes、矩陣）；能存的只有「過了 `minFacePresenceConfidence` 0.3 門檻」這件事＝有沒有 `p`。門檻寫在 `detector` |
| `summary.rate` | `detected ÷ (frames − black)`；`medianFaceWidth`＝偵測到的格的臉寬（點 234 到 454 的距離，`warp.mjs:25`）中位數，rough.mp4 像素；`lookFaceWidth`＝換算到 rough-look 畫面的臉寬 |
| `summary.slimOk` | `false` 的原因 `reason`：`small`（lookFaceWidth < 60）、`noface`（找臉抽樣的 12 格都沒有臉，整支不逐格偵測：`frames` 是空陣列、另存 `located` 12 格的結果；`--force` 才逐格）或 `rate`（rate < 0.80） |

- 大小：每格約 0.8 KB，10 分鐘 30 fps 約 15 MB；JSON.parse 約 0.1 s。
- 寫檔：先寫 `work/.look/face-landmarks.json.tmp` 再 rename（中斷不會留半個檔）。

### 5.2 `work/.look/state.json`（快取索引，給 ensureLook／status 快速判斷）

```json
{
  "version": 1,
  "landmarks": { "size": 14821333, "mtimeMs": 1761800100000, "rough": { "size": 52314321, "mtimeMs": 1761800000000 },
                 "modelSha256": "64184e22…", "lmVer": 1, "every": 1, "summary": { "rate": 0.9998, "medianFaceWidth": 43.1, "lookFaceWidth": 43.1, "slimOk": false, "reason": "small" } },
  "footage":   { "size": 61234567, "mtimeMs": 1761800400000, "rough": { "size": 52314321, "mtimeMs": 1761800000000 },
                 "landmarks": { "size": 14821333, "mtimeMs": 1761800100000 }, "slim": 0.6, "lookVer": 1, "width": 2560, "height": 1440,
                 "warped": 5110, "medianDisp": 4.5, "maxDisp": 4.7, "maxDispRatio": 0.0273, "maxDispAt": 125.6, "dispP95Ratio": 0.026, "elapsedSec": 300 },
  "run": { "pid": 12345, "phase": "detect", "done": 1200, "total": 5111, "startedAt": "2026-10-31T10:00:00.000Z", "updatedAt": "…",
           "etaSec": 70, "error": null, "log": "work/.look/run.log" }
}
```

- 每次寫都先寫 `.tmp` 再 rename（Windows rename 遇到 `EBUSY`／`EPERM` 每 300 ms 重試，最多 5 次，同 `lib/audit-browser.mjs:212`）。
- `run.phase`：`locate`、`detect`、`render`、`preview`、`done`、`failed`。`run` 每 2 秒或每 5 % 更新一次。
- `footage` 的位移數字是 `renderLookFootage` 逐格算的（`warped` 格；`maxDispAt` 秒、`dispP95Ratio`＝每格位移比的 95 百分位）；底片最新時 preview 直接印這些數字，不再抽樣（審查 C-05）。

### 5.3 「最新」的定義（快取鍵）

| 東西 | 最新的條件（全部成立） |
|---|---|
| landmark | `face-landmarks.json` 的 size／mtime ＝ `state.landmarks`；`state.landmarks.rough` ＝ 現在 `rough.mp4` 的 size／mtimeMs（四捨五入到 ms）；`modelSha256`、`lmVer` ＝ 現在的值。**`every` 不比**：`--every 2` 的結果 build 一樣接受 |
| 瘦臉底片 | landmark 最新；`rough-look.mp4` 的 size／mtime ＝ `state.footage`；`state.footage.rough` ＝ 現在的 rough.mp4；`state.footage.landmarks` ＝ 現在的 landmark 檔；`slim` ＝ 現在的有效瘦臉強度；`lookVer` ＝ `LOOK_VER` |
| 混合 LUT | 檔名就是鍵：`lut-<color 兩位小數>-<原始 .cube 的 sha256 前 8 碼>.cube`，存在就用 |

調光強度不在瘦臉底片的鍵裡（D1）。

### 5.4 `work/rough-look.mp4`

| 項目 | 規則 | 出處 |
|---|---|---|
| 內容 | 只做瘦臉，**不調色**；臉部 ROI 以外的像素在編碼前和 rough.mp4 解碼值完全相同 | D1、D3 |
| 解析度 | 和 rough.mp4 一樣；長邊 > 2560 時等比縮到長邊 2560（偶數） | D2，`LOOK_MAX_SIDE`（§8） |
| 影格 | `fps=<rough.mp4 的 avg_frame_rate>` 的 CFR，格數和 face-landmarks.json 的 `frames` 一樣 | §6.1 |
| 畫面 | x264 `-preset veryfast -crf 18`，`-g` ＝ 1 秒的格數，pix_fmt 和 rough.mp4 一樣（yuv420p／yuvj420p；其他格式轉 yuv420p），色彩標記（`color_space`、`color_primaries`、`color_trc`、`color_range`）照 rough.mp4 | `ff.mjs:70` 同一組編碼參數 |
| 聲音 | `-map 1:a:0? -c:a copy`（從 rough.mp4 原樣複製） | 04 §6.1 |
| 格數與長度 | 畫面軌的 `nb_frames` ≠ 送進編碼器的格數（掉格）就 ✖；畫面軌的結束時間（`start_time＋duration`）和 rough.mp4 的畫面軌差 > 1 格＋0.05 s 也 ✖（不換上去；auto-editor 的畫面軌可能從 1 格後開始，fps 濾鏡會從 0 補齊，所以比結束時間）。音軌是 copy，format 長度由音軌決定，所以不看 format 長度（審查 C-11） | — |
| 寫檔 | 先寫 `work/.look/rough-look.tmp.mp4`，驗完格數與長度再 rename | — |

## 6. 演算法（照它實作，數字見 §8）

### 6.1 解碼（偵測與變形兩次都一樣）

- `ffmpeg -v error -i rough.mp4 -an -sn -dn -vf "fps=<fps>,<scale>,format=<fmt>" -f rawvideo pipe:1`
- 偵測：`scale=<detectW>:-2:flags=area`（`detectW = min(來源寬, 1280)`，沒有縮就不加 scale），`format=rgba`。
- 變形：沒超過 2560 不加 scale，超過加 `scale=…:flags=lanczos`；`format=` rough.mp4 的 pix_fmt（yuv420p／yuvj420p 原樣，其他轉 yuv420p）。
- 兩次都先過同一個 `fps=<fps>`，第 i 格對到同一個時間。

### 6.2 偵測（`lib/landmarks.mjs`，在 chrome-headless-shell 裡）

1. **Chrome**：`findChrome({ chrome })`（`lib/audit-browser.mjs:45`），用 003 匯出的 `launchChrome`、`cdpClient`（請 003 加 export，簽名不變）。一律 CPU delegate（04 §4.5：GPU delegate 在 headless 的 SwiftShader 上 65 ms／格）。
2. **頁面**：Node 起 `127.0.0.1:0` 的小 http server，路由：`/`（內嵌頁面）、`/tv/vision_bundle.mjs`、`/tv/wasm/vision_wasm_internal.{js,wasm}`（`.wasm` 要回 `application/wasm`）、`/model.task`、`GET /frame?i=<n>`（一格 RGBA；`x-black: 1` 表示全黑；超過最後一格回 204）、`POST /result`（每 30 格一批）、`POST /done`、`POST /error`。
3. **模型**：`FilesetResolver.forVisionTasks('/tv/wasm')` → `FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/model.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 2, minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3 })`（`tv_probe.mjs:13-17`）。用 IMAGE 模式＋自己追蹤 ROI：結果只看輸入的那一格，不受偵測順序影響。
4. **全黑格**：Node 在解碼時每 8×8 像素取一點算亮度 `(54R+183G+19B)>>8`；≥ 99.8 % 的點 ≤ 5 就標全黑（同 `ff.mjs:111` 的 `BLACK`：pix_th 0.02、pic_th 0.998），頁面跳過偵測，存 `0`。
5. **追蹤 ROI**：上一個偵測到的格的臉中心（點 1 與 168 的平均）為中心、邊長 3.25 × 臉寬的正方形（夾在畫面內），`createImageBitmap(imageData, sx, sy, sw, sh, { resizeWidth: 384, resizeHeight: 384, resizeQuality: 'high' })` 後偵測（`make_video.py:39`：4K 臉寬 258 px 用 840 px 框縮到 384）。
6. **找臉（沒有上一格，或 ROI 裡沒找到）**：多尺度格子：邊長 0.4H（步距一半）、0.8H（步距一半）、整張（補邊成正方形），各縮到 384 偵測，取臉寬最大的那張。找不到時，下一次找臉至少隔 15 格（0.5 s），中間的格記 `null`（避免沒有人的長段落每格都掃 41 個格子）。
7. **多張臉**：取臉寬（點 234–454）最大的那張，`n` 記張數。
8. **`--every 2`**：只偵測偶數格；奇數格在前後兩格都偵測到時取平均（`i: 1`），否則 `null`。
9. **座標**：頁面回傳偵測畫面上的像素 → Node 乘 `來源寬 ÷ detectW` 換回 rough.mp4 像素，一位小數。
10. **逾時**：30 s 沒有新的 `/frame` 或 `/result` 就中止：`Chrome 30 秒沒有回應（偵測停在第 N 格）→ 重跑一次；第二次失敗就停下來回報（附 work/.look/run.log）`。頁面的 `Runtime.exceptionThrown` 直接中止並印第一行。

### 6.3 讀 landmark（`loadTrack()`：look run、preview、剪輯台共用）

1. 時間平滑：每個點的 x、y 各自做 7 點高斯（σ ＝ 1 格，權重 `exp(−k²/2)`、k ＝ −3…3、正規化），只在連續偵測到的段落裡做，段落邊緣用最近的值補（`make_video.py` 的平滑；04 `compare.json` 量到平滑去掉的抖動 0.69 px）。
2. 每格的原始權重 `raw[i]`：
   | 條件 | raw |
   |---|---|
   | `null` 或 `0`（沒偵測到、全黑） | 0 |
   | 臉寬（換算到 rough-look 畫面）< 60 px | 0 |
   | `|yaw|` > 0.35 | 0.5 |
   | 其他 | 1 |
3. `yaw`（側臉程度，無單位）：`u` ＝ 點 168→152 的單位向量、`v` ＝ 和 u 垂直；`dL = |(p1 − p234)·v|`、`dR = |(p454 − p1)·v|`；`yaw = (dL − dR) ÷ (dL + dR)`。正臉 ≈ 0，越側越接近 ±1。（04 §6.5 寫「yaw > 0.35」但沒定義單位，這裡定義成左右不對稱比；T 任務量示範口播的分布後確認門檻，見 plan.md。）
4. 淡入淡出 `rampWeights(raw, 5)`：`w[i] = min over |j−i| ≤ 5 of ( raw[j] + (|j−i| ÷ 5) × (1 − raw[j]) )`。沒偵測到的那格是 0，前後 5 格線性回到 1（04 §6.5「前後 5 格內把強度淡到 0」）；側臉減半也一樣 5 格過渡，不會跳。
5. 每格實際強度 `s_i = slim × w[i]`。

### 6.4 變形（`lib/look.mjs`，照 `warp.mjs` 移植）

- 控制點 `controlPoints(lm, s)`：`warp.mjs:20-39` 原樣（k ＝ s ÷ 0.6；h ＝ 0 眼睛連線、1 下巴；移動點往中軸收 IN(h)、往上提 UP(h)；只上提點；固定點；臉輪廓外 1.7 倍的一圈與脖子 3 點固定）。
- 位移場 `field(lm, s, W, H, step)`：高斯 RBF，σ ＝ 0.25 × 臉寬，對角加 1e-4，解反向位移（`warp.mjs:53-68`）；ROI ＝ 控制點外框 ±2 px；粗網格 `step = clamp(round(臉寬 ÷ 32), 4, 16)` px。
- 取樣 `warpPlane(src, dst, { w, h, ch, stride }, F, scale)`：雙線性取樣、ROI 邊緣 6 px 羽化到 0（`warp.mjs:70-85`）；只動 ROI，先把 ROI 複製到暫存再寫回（不整張複製）。
  - rough-look（YUV）：Y 平面 `scale = 1`；U、V 平面（寬高各一半）`scale = 0.5`：平面上 (x, y) 的中心對到全解析度 `((x + 0.5) ÷ scale − 0.5)`，位移乘 `scale`。
  - 預覽與剪輯台（RGB）：`ch = 3`、`scale = 1`。
- 每格最大位移 `maxDisp`：網格上 |D| 的最大值（px）；`maxDispRatio = maxDisp ÷ 臉寬`。

## 7. 剪輯台（006 自己的檔案，寫在這裡給 001 寫文件）

### 7.1 存檔 body 的 `look`

- body 多一個鍵 `look`（`LIMITS.bodyKeys` 加 `'look'`，`editor/server/write.mjs:19`）：
  | 值 | plan.json 怎麼改 |
  |---|---|
  | `{ "color": 0.8, "slim": 0.6 }`（兩個都要有） | 寫成 `"look": { "color": 0.8, "slim": 0.6 }`：原本有 `look` 就換掉那個值；沒有就插在 `"edit"` 前面，沒有 `edit` 就插在 `"scenes"` 前面 |
  | `null` | 拿掉 `look`（回到 kit 預設）；原本就沒有就不動 |
  | 沒送 | 不動 |
- 驗證 `sanitizeLook(v)` 用 `LOOK_LIMITS`（從 `lib/look.mjs` 匯入，範圍不重抄）：
  - `look 要是 { "color": 0–1, "slim": 0–1.2 } 或 null（恢復預設）`
  - `look 不能有「x」→ 只能寫 color、slim`
  - `look.color 要是 0–1 的數字，現在是 …`／`look.slim 要是 0–1.2 的數字，現在是 …`
- 只動 `look` 那一個 entry，其他文字（AI 的排版）原封不動（同 `edit` 的 surgical 寫法，`write.mjs:354`）。

### 7.2 `/api/state` 的 `look`

```json
"look": {
  "kit": { "color": 0.8, "slim": 0.6 },
  "plan": null,
  "effective": { "color": 0.8, "slim": 0.6, "source": "kit" },
  "baked": { "color": 0.8, "slim": 0 },
  "limits": { "color": [0, 1], "slim": [0, 1.2], "step": 0.05 },
  "landmarks": { "ready": true, "rate": 0.9998, "medianFaceWidth": 43.1, "slimOk": false, "reason": "small" },
  "lines": ["講者調光：0.8（…）", "⚠ 講者瘦臉略過：…"]
}
```

- `plan`：plan.json 的 `look` 原值（沒寫＝`null`，`false` 照傳）。
- `baked`：剪輯台播的影片已經 bake 的值。播 `assets/rough.mp4` 時讀戳記 `key.look`（§4）；播 `work/rough.mp4` 時是 `null`（什麼都沒 bake）。
- `lines`：`ensureLook({ strict: false }).report`。

### 7.3 `GET /api/look/face?t=<rough 秒數>&slim=<0–1.2>`

- 回 `image/jpeg`：`work/rough.mp4` 第 t 秒那一格（**不調色**，頁面自己套 CSS filter）以臉中心為中心、邊長 2.4 × 臉寬的正方形，縮成 360×360；`slim > 0` 時先照 §6.3–6.4 變形（用那一格的平滑後 landmark 與權重）。
- 錯誤（JSON，404）：`{ "error": "nolandmarks", "message": "還沒偵測臉部 → 請 AI 跑 node shared/template/tools/look.mjs run --project <專案>" }`；`{ "error": "noface", "message": "這一格沒偵測到臉（低頭、側身或只有聲音的畫面）→ 換一格再看" }`。
- server 快取：landmark 檔（依 size／mtime）、最近 4 格的原始畫面。

### 7.4 CSS 調光預覽（`editor/model.mjs`）

`lookCss(pending, baked)` → CSS `filter` 字串：

- 係數（04 §3 建議）：`brightness(1 + 0.0825c) contrast(1 + 0.02c) saturate(1 + 0.071c)`；c ＝ 0.8 時是 `brightness(1.066) contrast(1.016) saturate(1.057)`。
- 播的影片已經 bake 了 `baked.color = b`：三項都用比值 `(1 + k·c) ÷ (1 + k·b)`（三種濾鏡各自對同類運算封閉，比值就是「從 b 改到 c」的近似）；`c = b` 時回 `'none'`。
- 套在 `#simVideo` 與子母畫面 canvas（`ctx.filter`）；插入素材的 `<video>／<img>` 不套。

## 8. 常數（單一真相：`lib/look.mjs` 照這張表寫）

| 常數 | 值 | 出處 |
|---|---|---|
| `LOOK_VER` | 1 | 本契約；演算法或編碼參數改了就 +1 |
| `LM_VER` | 1 | 本契約；`points` 或偵測參數改了就 +1 |
| `LUT_REF` | 0.8（混合比例 m ＝ color ÷ 0.8，m 可到 1.25，輸出夾在 0–1） | 04 §2.2、§6 表 |
| `LOOK_LIMITS` | color 0–1、slim 0–1.2、剪輯台滑桿步距 0.05 | 04 §6 表 |
| `H_TAB` | −0.10, 0.10, 0.25, 0.40, 0.55, 0.65, 0.75, 0.85, 0.90, 0.95, 1.00, 1.10 | `warp.mjs:7` |
| `IN_TAB`（臉寬 %） | 0.00, 0.75, 1.05, 1.15, 1.30, 1.65, 1.60, 1.45, 1.35, 1.20, 0.70, 0.70 | `warp.mjs:8`（04 §4 光流實測） |
| `UP_TAB`（臉寬 %） | 0.00, 0.00, 0.15, 0.50, 1.05, 1.30, 1.50, 1.85, 2.00, 2.05, 2.15, 2.15 | `warp.mjs:9` |
| `JY_REF` | 0.6 | `warp.mjs:10` |
| `SIGMA` | 0.25 × 臉寬 | `warp.mjs:10`；04 §4 |
| `MOVE`／`LIFT_ONLY`／`FIX`／`OVAL` | `warp.mjs:11-14` 原樣 | 04 §4 |
| 外圈倍率、脖子 | 1.7 倍；下巴＋0.45 臉高、±0.35 臉寬 | `warp.mjs:35-37` |
| RBF 正則化 | 1e-4 | `warp.mjs:56` |
| ROI 外擴、羽化 | 2 px、6 px | `warp.mjs:60`、`:76` |
| 網格步距 | `clamp(round(臉寬 ÷ 32), 4, 16)` px | 04 §4「4 px 粗網格」量在 1080p 臉寬約 129 px；建議初值 |
| `FADE_FRAMES` | 5 格 | 04 §6.5 |
| `MIN_FACE_PX` | 60 px（rough-look 畫面） | 04 §6.5 |
| `YAW_HALF` | 0.35（左右不對稱比，§6.3） | 04 §6.5；單位為本契約定義，建議初值 |
| `RATE_OFF` | 0.80 | 04 §6.5 |
| `RATE_WARN` | 0.95 | 04 §6.4 |
| `DISP_WARN` | 臉寬的 **6.5 %**，看每格「最大位移 ÷ 這格臉寬」的 **95 百分位** | 2026-10-31 重新校準（審查 C-03；原裁決 5 %，USAGE 的「瘦一點 0.8」會誤報 5.11 %）。**校準用三個 slim 值**：0.6（預設）、0.8（USAGE「瘦一點」）要不 ⚠，1.05（裁決「slim ≈ 1.05 才 ⚠」）要 ⚠。量在示範口播放大 2 倍的全片（5111 格）、8 段 20 秒、和 4K 20 秒：p95 0.6 → 3.36–3.99 %、0.8 → 4.71–5.65 %、1.05 → 6.62–8.04 %（全片 3.63／5.09／7.19 %）；6.5 % 讓 0.6、0.8 每段都不 ⚠、1.05 每段都 ⚠，整支的分界約 slim 0.93–0.99。正臉格（|yaw| < 0.1）只有 4.55 % × slim，⚠ 是被轉頭的格推過門檻的（轉頭時位移本身變大，換成整支臉寬中位數當分母也只差 0.1 %）。測試：look.test「位移 ⚠ 校準」（示範口播 15–25 秒，0.6／0.8／1.05 ＝ 3.70／5.19／7.34 %） |
| 平滑 | 7 點高斯、σ 1 格 | `make_video.py`（04 §5 `compare.json`） |
| 偵測門檻 | minFaceDetectionConfidence 0.3、minFacePresenceConfidence 0.3、numFaces 2 | `tv_probe.mjs:17`（numFaces 1→2 為了取最大臉，04 §6.5） |
| `ROI_SCALE`、`ROI_SIZE` | 3.25 × 臉寬、384 px | `make_video.py:39` |
| `DETECT_W` | 1280 px（來源比較窄就不縮） | 本契約；建議初值 |
| `LOOK_MAX_SIDE` | 2560 px | D2；建議初值 |
| 找臉間隔 | 15 格 | 本契約；建議初值 |
| 預估：偵測 | 26 ms／格（`--every 2` 減半） | 2026-10-31 實測：1280×720、600 格 16 s（含傳整格 RGBA 給頁面）；04 §4.5 的 16.6 ms 只算偵測本身 |
| 預估：變形＋編碼 | 14.5 ms／格 × max(1, rough-look 像素 ÷ 1920×1080) | 04 §4.5：Node 整條 14.5 ms（1080p）；像素外插是上限，T 任務實測後改 |
| 預估：Windows | 印「Windows 約 ×1.5–3」 | 04 §4.5 最後一句 |
| 預估公式 | 分鐘 ＝ 格數 × (26 ÷ every ＋ 變形 ms) ÷ 60000，無條件進位；landmark 還是最新（只改 slim）時不算偵測那項 | 本契約；審查 C-06 |
