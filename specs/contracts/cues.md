# 契約：情境動畫綁句（cues）

- **擁有者**：002 pipeline-timing（build 端：注入、預先計算、檢查）。**照它做**：003（`kit/scene-motion.js` 的 `P.at`／`P.dur`／`P.end`、`audit.mjs` 讀 `window.__cueErrors`、`custom/*.html` 範例改寫）、005（`clicks` 的 `@詞` 文法同 §3.1）、001（USAGE-reference R7.2／R7.3 文件）。
- **版本**：`v: 1`（2026-10-31）。
- **出處**：02 G02（P0：custom 動畫手算「字幕起點 − 段起點」、手填 `data-duration`，`custom/x-process.html:18-25`、`USAGE-reference.md:486`、`:543`、`:589`）；spec FR-017–FR-021。
- **目標**：寫 `x-*.html` 的 AI 只寫句號，不寫秒數；段長只由 plan.json 決定；剪輯台改了字幕時間，重跑 build 就跟著變。

## 1. 名詞

| 名詞 | 定義 |
|---|---|
| 成片秒數 | 有 `edit.cuts` 時剪完之後的秒數（`plan.mjs` 內部用的時間；`--check` 文字報告的時間） |
| 段 | plan.json `scenes[]` 裡一個 `type: "custom"` 的項目；用它的 `id` 稱呼（例 `x01`） |
| host | 主合成裡掛子合成的那個 `<div id="el-<段 id>" data-composition-src="compositions/x-….html" data-start data-duration>`（`lib/main.mjs:78-79`） |
| 段起點 `start` | host 的 `data-start`（同一份 HTML 的時間基準） |
| 段長 `D` | host 的 `data-duration`＝plan.json 算出的段長（含自動延長） |
| 段內秒數 | 子合成時間軸上的秒數＝句子時間 − `start`；GSAP 時間軸的位置參數就是它 |
| ref | 時間字串，文法照 §3.1 |

## 2. `window.__cues`（build 注入）

build（含 `--test` 產生的 `compositions/test-clip.html`）在 plan 有 custom 段時，於 `<head>` 裡、`<script src="…kit/scene-motion.js">`（`lib/main.mjs:183`）**之前**插入：

```html
<script>window.__cues = {"v":1,"cues":{"17":[40,42.9],"18":[43.2,45.6]},"segs":{"x01":{"comp":"x-process","start":40,"D":14.5,"refs":{"#18":43.2,"#18@逐字稿":44.4}}}};</script>
```

| 鍵 | 型別 | 意思 |
|---|---|---|
| `v` | `1` | 本契約版本 |
| `cues` | `{ "<句號>": [起, 迄] }` | 全片每一句字幕（`work/rough.srt` 的句號）的時間，**和 host `data-start` 同一基準**（`index.html`＝成片秒數；`test-clip.html`＝成片秒數 − 片段起點）。整句被 `edit.cuts` 剪掉的句子起迄相同 |
| `segs` | `{ "<段 id>": { comp, start, D, refs } }` | 每個 custom 段一筆 |
| `segs[id].comp` | 字串 | 子合成的 `data-composition-id`（`readCustom` 讀到的，`lib/assemble.mjs`） |
| `segs[id].start`、`D` | 數字 | §1 的段起點、段長（r3） |
| `segs[id].prev` | `"speaker"`／`"fullscreen"`／`"pip"` | 前一段是什麼（第二段 B，`plan-fields.md` §4）：custom 的 `const ENTER` 預設讀它選「長出」或「換卡不換景」；host 的 `data-prev` 是同一個值 |
| `segs[id].refs` | `{ ref: 秒數 }` | build 從這支檔掃到的每個 `P.at('<ref>'…)` 與 `P.sfx('名', '<ref>'…)` 字面值，用 `time.mjs` 算好的句子時間（同 `cues` 的基準，**不是**段內秒數） |

- 沒有 custom 段時不插（輸出和現行逐位元組相同）。
- JSON 用 `JSON.stringify`，再把 `<` 換成 `<`（避免字幕裡的 `</script>` 截斷）。
- 秒數一律 r3。

## 3. build 端（002）

### 3.1 ref 文法（和 plan.json 的 `from`／`to`／`at` 同一套，`time.mjs:1-11`；不能寫絕對秒數與 `+秒`）

| 寫法 | 意思 |
|---|---|
| `#N` | 第 N 句起點 |
| `#Ne` | 第 N 句結尾 |
| `#N+0.3`、`#Ne-0.2` | 再加減秒數 |
| `#N@詞` | 第 N 句裡「詞」開口的位置（`time.mjs` 的 `cueSeconds`：依字數比例） |
| `#Ne@詞` | 那個詞講完的位置 |
| `#N@詞+0.2` | 詞的位置再加減秒數 |

### 3.2 靜態掃描

1. 讀每個 custom 段的 `src` 檔，只看 `<template>` 裡的 `<script>` 內容；先去掉 `/* … */` 與 `//` 註解（`//` 前面是行首或空白才算註解，避免吃掉字串裡的 `http://`）。
2. 用 `/\bP\.at\(\s*(['"])([^'"\n]*)\1/g` 找出所有 ref 字面值（第一個參數是字串字面值就收，寫錯的 `'3.2'` 也收，§3.3 才報得出「不是句號」的 ✖）；第二個參數（秒數）不看；去重、照出現順序（`lib/assemble.mjs` 的 `scanCueRefs`）。
3. 每個 ref：`parseTime(ref)` → 必須是 `kind: 'cue'`；`cueSeconds(t, cuesOut)` → 秒數；成功的放進 `refs`。
4. 用變數組出來的 ref（`P.at('#' + n)`）掃不到：執行期只支援 `#N`、`#Ne`、`#N±秒`（§4.2）。

### 3.3 檢查（訊息原文在 `cli-002.md` §1.4）

| 條件 | 等級 |
|---|---|
| ref 不是句號寫法（例 `P.at('3.2')`、`P.at('+1')`） | ✖ |
| 句號不存在、詞找不到（`cueSeconds` 回 error） | ✖，附 `cueSeconds` 的原文（含那一句的字幕原文） |
| 算出來的時間 < 段起點 − 0.05 s，或 > 段起點＋段長＋0.05 s | ⚠ |
| 兩個 custom 段的 `src` 相同 | ✖（`P` 用 host 找段，但兩段子合成的 root id 相同，`document.getElementById` 只拿得到第一個） |

### 3.4 段長

- host 的 `data-duration`（現行就是 plan 的段長）＝`segs[id].D`。
- 子合成 root 上的 `data-duration`、檔內的 `const D` 不需要和段長一致，`--check` 不再提示手填；HyperFrames 以 host 的長度為準（依據：`fx/effects/fx-kit.js:95-96` 的 `slotDuration` 讀 host 的 `data-duration`，40 支字卡動態都靠它）。

## 4. 執行期（003 在 `scene-motion.js` 實作）

### 4.1 找到自己是哪一段

`SceneMotion(tl, root)` 建 `P` 時：

1. `host = root.closest('[data-composition-src], [data-composition-file]')`；`id = host ? host.id.replace(/^el-/, '') : null`。
2. `seg = window.__cues && id && window.__cues.segs[id]`。
3. 沒有 `seg` 時，讀 root 的 `data-cues-sample`（§5）當 `seg`（`refs` 沒寫＝`{}`）。
4. 都沒有：`seg = null`。

### 4.2 `P.at(ref, off = 0)` → 段內秒數

| 輸入 | 回傳 |
|---|---|
| 數字 `x` | `x + off`（照舊可以寫秒數） |
| 字串，而且 `seg.refs[ref]` 有值 | `r3(seg.refs[ref] − seg.start + off)` |
| 字串，符合 `^#(\d+)(e)?([+-]\d+(?:\.\d+)?)?$`，而且 `cues[N]` 有值 | `r3((e ? cues[N][1] : cues[N][0]) + 秒數 − seg.start + off)`（`cues` 取 `window.__cues.cues`，預覽時取 sample 的 `cues`） |
| 其他（`@詞` 沒有預先算到、句號不存在、`seg` 是 null） | `max(0, off)`，並在 `window.__cueErrors` 推一則（§4.4） |

- 結果小於 0 時回 0（build 已經對段外的字面值 ⚠）。
- 型別錯直接 `throw`（寫錯的程式，不是資料問題）：`ref` 不是字串也不是數字、`off` 不是數字 → `TypeError`（003 定原文）。
- `P.at` 不建立 tween，只回秒數；用法 `P.in('#xproc-on2', P.at('#18'))`、`P.stroke('#xproc-c1', P.at('#18', -0.9))`。

### 4.3 `P.dur()`、`P.end()`

| 呼叫 | 行為 |
|---|---|
| `P.dur()` | `seg.D`；`seg` 是 null 時讀 root 的 `data-duration`；再沒有回 0 並在 `__cueErrors` 推一則（找不到段長也算錯誤，原文 003 定） |
| `P.end()`（不帶參數） | `P.end(P.dur())` |
| `P.end(x)` | 照舊：`tl.set({}, {}, x)`（`scene-motion.js:207`） |

### 4.4 `window.__cueErrors`

- 字串陣列，`P` 第一次推錯誤時建立：`window.__cueErrors = window.__cueErrors || []`。
- 每則格式：`<段 id 或 comp id> P.at('<ref>')：<原因>`；原因三種原文：
  - `字幕沒有第 N 句（window.__cues 有 M 句）`
  - `「@詞」沒有被 build 預先算到 → 把 ref 寫成字串字面值 P.at('#N@詞')，再跑 build`
  - `找不到 window.__cues 也沒有 data-cues-sample → 用 build 產生的 index.html 看，或在 root 加 data-cues-sample`
- 同一則字串只推一次（去重；同一段在時間軸上重複呼叫不會洗版）。
- 003 的 `audit.mjs` 在頁面載入後讀它，有內容就每則一個 ✖。

## 5. 預覽頁的退路：`data-cues-sample`

`custom/x-*.html` 是 `<template>` 格式的子合成，直接用瀏覽器開是空白的。gallery（`shared/template/index.html`）看的是 `build.mjs --gallery` 產生的 `preview/x-*.html`：`runGallery` 對每支 `custom/x-*.html` 呼叫 003 的 `buildCustomPreview({ name, html, pipStyle, kitLinks })`（`tools/lib/custom-preview.mjs`；檔還沒出現時 `runGallery` 用 `fs.existsSync` 略過，`--gallery` 照常跑）。預覽頁沒有 host、沒有 `window.__cues`，範例檔在 root 上放一組樣本，讓預覽有合理的時間：

```html
<div id="x-process" data-composition-id="x-process" data-duration="14.5"
     data-cues-sample='{"start":40,"D":14.5,"cues":{"17":[40,42.9],"18":[43.2,45.6],"19":[46.2,48.4],"20":[49.2,51.8]}}'>
```

- 只在 §4.1 第 2 步找不到 `seg` 時才用；正式 build 一律用注入的值。
- 格式和 `segs[id]` 相同，多一個 `cues`（同 §2 的 `cues`）。

## 6. 測試向量（003 的 `motion.test.mjs` 與 002 的 `timing.test.mjs` 共用）

共同輸入：`window.__cues = { v: 1, cues: { "17": [40, 42.9], "18": [43.2, 45.6] }, segs: { "x01": { comp: "x-process", start: 40, D: 14.5, refs: { "#18": 43.2, "#18@逐字稿": 44.4 } } } }`；root 在 `<div id="el-x01" data-composition-src="compositions/x-process.html">` 底下。

| # | 呼叫 | 期望回傳 | `__cueErrors` 新增 |
|---|---|---|---|
| 1 | `P.at('#18')` | 3.2 | — |
| 2 | `P.at('#18', 0.2)` | 3.4 | — |
| 3 | `P.at('#18e')` | 5.6 | — |
| 4 | `P.at('#18-0.3')` | 2.9 | — |
| 5 | `P.at('#18@逐字稿')` | 4.4 | — |
| 6 | `P.at('#17', -0.5)` | 0（−0.5 夾到 0） | — |
| 7 | `P.at(3)` | 3 | — |
| 8 | `P.at('#99')` | 0 | `x01 P.at('#99')：字幕沒有第 99 句（window.__cues 有 2 句）` |
| 9 | `P.at('#18@沒算到')` | 0 | `x01 P.at('#18@沒算到')：「@詞」沒有被 build 預先算到 → …` |
| 10 | `P.dur()` | 14.5 | — |
| 11 | `P.end()` | 時間軸長度 14.5 | — |
| 12 | 沒有 `window.__cues`，root 有 §5 的 sample；`P.at('#18')` | 3.2 | — |
| 13 | 沒有 `window.__cues` 也沒有 sample；`P.at('#18')` | 0 | `x-process P.at('#18')：找不到 window.__cues 也沒有 data-cues-sample → …` |

002 端（`timing.test.mjs`）：同一份字幕（#17 40.0–42.9 s「先錄影」、#18 43.2–45.6 s「轉成逐字稿」）＋ custom 段 `from: "#17"`、`to: "#20e"`，檔內寫 `P.at('#18')`、`P.at('#18@逐字稿')`、`P.at('#99')`：

| 期望 |
|---|
| `segs.x01.refs['#18']`＝43.2，且等於 plan.json 寫 `from: "#18"` 時 `--check` 算出的起點 |
| `segs.x01.refs['#18@逐字稿']`＝`cueSeconds(parseTime('#18@逐字稿'), cues).sec` |
| `#99` → `--check` ✖，原文含 `字幕沒有第 99 句` |
| 註解裡的 `P.at('#77')`（`// 例：P.at('#77')`）不被掃到 |

## 7. 相容

- 舊的 custom 檔（手算秒數、手填 `D`）照常能跑：注入的 script 只多一個全域變數。
- `SceneMotion` 現有 API 簽名不變；`P.at`、`P.dur` 是新增，`P.end()` 不帶參數是新增的行為。
