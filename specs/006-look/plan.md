# Implementation Plan: 006 look（講者調光＋瘦臉）

**Branch**: `006-look` | **Date**: 2026-10-31 | **Spec**: `specs/006-look/spec.md`

**Input**: `specs/006-look/spec.md`；契約 `specs/contracts/look.md`（下稱「契約」）、`specs/contracts/cli-006.md`（下稱「cli 契約」）。

## Summary

調光：`lib/ff.mjs` 的 `encodeFootage` 在 `-vf` 加一個 lut3d（強度用「LUT 和恆等混合」預先算成一支 `.cube`），build 本來就要重新編碼底片，順手 bake。瘦臉：新工具 `look.mjs run` 在 HyperFrames 的 chrome-headless-shell 裡用 MediaPipe 抓每格 landmark（`work/face-landmarks.json`），Node 依原型 `warp.mjs` 的 RBF 變形只改臉部 ROI，輸出 `work/rough-look.mp4`；build 經 `ensureLook()` 拿到「用哪支底片＋哪支 LUT＋戳記鍵」。剪輯台加「講者」面板：調光 CSS 即時、瘦臉單格前後對照、存 `plan.look`。

## Technical Context

**Language/Version**：Node 22（ESM、內建 `fetch`／`WebSocket`／`http`／`crypto`），瀏覽器端是 HyperFrames 0.8.221 自帶的 chrome-headless-shell（作者機器 `~/.cache/hyperframes/chrome/chrome-headless-shell/` 底下是 `mac_arm-152.0.7928.2`、`mac_arm-152.0.7977.30`；路徑寫法見 `dev/tests/audit.test.mjs:253`）

**Primary Dependencies**：ffmpeg／ffprobe（setup 已裝）；`@mediapipe/tasks-vision@1.2.0` 的 3 個檔＋`face_landmarker.task`（憲法 II 核准的唯一新資產，`shared/template/vendor/mediapipe/`）

**Storage**：檔案。`work/face-landmarks.json`、`work/rough-look.mp4`、`work/look-preview.jpg`（交付後保留）；`work/.look/`（快取：`state.json`、混合 LUT、`run.log`、暫存）

**Testing**：`node --test`（`dev/tests/look.test.mjs` 新、`editor.test.mjs`、`editor-subtitles.test.mjs` 不動）；沒有 ffmpeg／Chrome／資產時略過

**Target Platform**：macOS（zsh）與 Windows（PowerShell）

**Project Type**：CLI 工具＋函式庫＋本機網頁（剪輯台）

**Performance Goals**：調光每分鐘 +≤ 10 s（SC-003）；瘦臉 10 分鐘 4K ≤ 15 分（M1 Max，SC-005）；剪輯台臉部圖 p50 ≤ 300 ms（SC-006）

**Constraints**：零 npm 依賴、不裝 Python；所有寫檔都在 `projects/<專案>/work/`；不改 `素材/`、`shared/`（執行期）

**Scale/Scope**：一支影片 1–30 分鐘；30 fps 時 1,800–54,000 格

## Constitution Check

| 原則 | 本計畫怎麼做 | 結果 |
|---|---|---|
| I 工具做計算 | 偵測率、位移、時間預估、過期原因都由 `look.mjs` 算好印出；AI 只看「→ 下一步」那一行 | ✔ |
| II 零依賴、跨平台 | 只多 MediaPipe 資產（已核准、寫明大小與來源，§3）；Chrome 用 HyperFrames 已裝的；CDP 用 Node 內建 WebSocket；Windows 細節見 §4 | ✔ |
| III 弱模型優先 | cli 契約每個狀態一行原文、每個 ✖ 帶 →、`status` 固定一行下一步；`--background` 避免工具逾時（D4） | ✔ |
| IV 單一真相 | 數字只在契約 §8 定義，`lib/look.mjs` 照它寫常數；剪輯台的範圍從 `LOOK_LIMITS` 匯入；style.md 只寫給人看的預設，docs.test 比對 `kit/look.json`（請 001） | ✔ |
| V 停點固定 | 不加停點；`look.mjs run` 在剪乾淨與停點 ② 之間，是一般步驟 | ✔ |
| VI 可驗證 | 每條 FR 有「驗」；preview 圖＋數字就是交付驗證 | ✔ |
| VII 授權乾淨 | Apache-2.0 全文＋NOTICE 段；模型授權原文待確認（spec 裁決第 2 條），確認前不 commit `.task` | ⚠ 待裁決 |
| VIII 不擴張 | 只做調光與瘦臉；大眼、磨皮不做；設定只有 color、slim、lut；CLI 選項只有 `--every`、`--force`、`--background`、`--chrome` | ✔ |

## 1. 設計決定

| # | 決定 | 理由 | 代價 |
|---|---|---|---|
| D1 | `rough-look.mp4` 只瘦臉、不調色；調光一律在 build 的 `encodeFootage` 做 | ① 改調光（剪輯台最常拉的滑桿）不用重跑 4 分鐘以上的變形（04 §4.5：只改強度要 4.4 分）；② LUT 只套一次，同一個地方（憲法 IV）；③ landmark 在原色上偵測，跟 04 的驗證條件一樣 | 調光 lut3d 在 build 時跑，本來就有；無 |
| D2 | rough-look 長邊 > 2560 時等比縮到 2560 | 成片是 1920×1080，構圖倍率最大 1.3（`qc.mjs framing` 的 1.0／1.15／1.3）：2560 ÷ 1.3 ＝ 1969 ≥ 1920，裁切後不會被放大；4K rgb24 pipe 每格 3840×2160×3 ＝ 24.9 MB、x264 要編的像素是 1080p 的 4 倍；縮到 2560×1440 後像素少 55.6 % | 4K 來源的 1.3 倍構圖從 1969 px 縮到 1920（原本從 2954 縮），細節少一點但仍是縮小；建議初值，T029 實測 4K 原尺寸若 ≤ 1.2 倍即時就拿掉 |
| D3 | 變形直接改 YUV 平面（Y 全解析度、U／V 半解析度），不轉 RGB | ① 不經 yuv→rgb→yuv，ROI 外的像素在編碼前和原檔解碼值完全一樣，不會因為色彩矩陣猜錯而偏色（rgb24 pipe 再編碼時 x264 不知道原本的矩陣）；② pipe 每像素 1.5 B（rgb24 是 3 B） | 實作多一個 `scale` 參數；原型的逐像素比對要對 Y 平面重做（T014） |
| D4 | build 不自動跑偵測與變形：過期而且能跑時 ✖ 停下來，請 AI 跑 `look.mjs run`（預估超過 2 分加 `--background`）；剪輯台「重新產生」會自動先跑 | 10 分鐘 4K 要 10 分以上（04 §4.5），Windows 再乘 1.5–3；AI 的工具逾時常在 2–10 分，build 被砍會留下半個底片。停下來＋固定指令對弱模型最清楚 | 多一步；靠 AGENTS.md 把 `look.mjs run` 排在剪乾淨後（docs.md §1） |
| D5 | `ensureLook` 回傳多 `lut`、參數多 `strict`；另外 `lookCheck` 給 `--check` | 調光要傳到 `encodeFootage`（005 的 `encodeFootagePolished` 中轉），一定要有 `lut`；framing 與剪輯台不能因為瘦臉過期就失敗 → `strict: false` | 契約多兩個欄位 |

## 2. 每個改動點

### 2.1 `shared/template/kit/look.json`、`kit/look/jianying-smart.cube`（新）

- `.cube`：從 `analysis/look-preview/jianying-smartcolor-fit-face.cube` 逐位元組複製（`analysis/` 目前只在這次工作的 scratchpad，會被清掉：T001 先搬進 repo）（不加註解：ffmpeg 的 .cube 解析器對註解行的處理沒驗過，改內容會讓 sha256 對不上）。來源與限制寫在契約 §2.1、style.md 新節。
- `look.json`：契約 §2.1 原文。
- 資料流：`readKitLook(templateDir)` → `resolveLook()` → `ensureBlendedLut()`。
- 退路：`look.json` 壞掉或缺 → 丟錯 `kit/look.json 讀不到：<原因> → 從 git 還原 shared/template/kit/look.json`（這是 shared/ 的檔，只讀，不自動重建）。

### 2.2 `tools/lib/ff.mjs`

| 函式 | 改動 |
|---|---|
| `encodeFootage(src, dst, opts)`（`:66-75`） | opts 多 `lut`。`-vf` 改成組陣列：有 crop → `crop=…`、`scale=1920:1080:flags=lanczos`；有 lut → `lut3dFilter(lut)`；最後 `fps=30`；`join(',')`。lut 與 crop 都沒有時字串仍是 `fps=30`（參數逐字不變，既有測試不用改） |
| `filterPath(p)`（新，匯出） | spec FR-005：`path.resolve` → `\`→`/` → 冒號 `\:` → 外面包 `'…'`；含 `' [ ] , ;` 丟錯 |
| `lut3dFilter(file)`（新，匯出） | `` `lut3d=file=${filterPath(file)}:interp=tetrahedral` ``（04 §3 A1） |
| 檔頭註解 | 加上兩個新函式的一行說明（照現有格式） |

- 快取：不在 ff.mjs 做；`audioKey` 的 `look` 鍵決定要不要重新編碼（契約 §4）。
- Windows：跳脫規則說明——ffmpeg 濾鏡字串先被濾鏡圖解析一次（`'…'` 裡面原樣），再被選項解析一次（`\:` → `:`），所以 `C:\x\a.cube` 要變成 `'C\:/x/a.cube'`。

### 2.3 `tools/lib/look.mjs`（新）— 核心

匯出（全部同步，除了標 async 的）：

| 區塊 | 函式 | 說明 |
|---|---|---|
| 常數 | `LOOK_VER`、`LM_VER`、`LUT_REF`、`LOOK_LIMITS`、`H_TAB`、`IN_TAB`、`UP_TAB`、`JY_REF`、`SIGMA`、`MOVE`、`LIFT_ONLY`、`FIX`、`OVAL`、`POINTS`（58 點）、`FADE_FRAMES`、`MIN_FACE_PX`、`YAW_HALF`、`RATE_OFF`、`RATE_WARN`、`DISP_WARN`、`LOOK_MAX_SIDE`、`DETECT_W`、`EST` | 契約 §8 |
| 設定 | `readKitLook(templateDir)`、`validateLook(v)`、`resolveLook({ plan, templateDir })` | 契約 §2 |
| LUT | `parseCube(text)`、`blendCube(cube, m)`、`cubeText(cube, title)`、`ensureBlendedLut({ projectDir, templateDir, color })` | 解析只認 `TITLE`、`LUT_3D_SIZE`、`DOMAIN_MIN 0 0 0`、`DOMAIN_MAX 1 1 1`、`#` 開頭與空行略過；R 變化最快（`common.py:90-98` 的寫法） |
| 變形 | `faceWidth(p)`、`yawOf(p)`、`controlPoints(lm, s)`、`field(lm, s, W, H)`、`warpPlane(src, dst, geom, F, scale)`、`maxDisp(F)` | 契約 §6.4；`lm` 用 MediaPipe 編號索引（稀疏陣列：`lm[i] = [x, y]`），由 58 點的 `p` 展開 |
| 軌跡 | `loadTrack(file, { lookScale })` → `{ meta, n, lm(i), weight(i), raw, smoothJitter }`、`smoothTrack()`、`rampWeights(raw, n)`、`interpolateEvery2(frames)` | 契約 §6.3；剪輯台、preview、render 共用 |
| 狀態 | `statePaths(projectDir)`、`readState()`、`writeState()`（tmp＋rename＋Windows 重試）、`landmarksFresh()`、`footageFresh()`、`staleReason()`、`assetsStatus(vendorDir, { sha })`、`estimateMinutes()` | 契約 §5.2–5.3 |
| build | `ensureLook()`、`lookCheck()` | 契約 §3 |
| 管線 | `async renderLookFootage({ projectDir, track, slim, onProgress })` | §2.5 |
| 驗證 | `async lookPreview({ projectDir, templateDir, plan })` → `{ file, lines, warnings }` | §2.6 |
| 剪輯台 | `async faceImage({ projectDir, t, slim, cache })` → JPEG Buffer 或 `{ error, message }` | 契約 §7.3 |

資料流（一格）：`face-landmarks.json` 的 `p`（rough.mp4 像素）→ 平滑 → × `lookScale`（rough-look 寬 ÷ rough 寬）→ `controlPoints(lm, slim × w[i])` → `field()` → `warpPlane()`。

### 2.4 `tools/lib/landmarks.mjs`（新）— 偵測

匯出：`async detectLandmarks({ video, out, every, chrome, vendorDir, onProgress, signal })` → summary；`async locateFaces({ video, times, … })`（找臉用）；`PAGE_HTML`（頁面原始碼字串，測試可以讀）。

| 步驟 | 細節 |
|---|---|
| 1. 準備 | `probeMedia`（`ff.mjs:41`）拿寬高、`avg_frame_rate`；`detectW = min(W, 1280)`、`detectH = 偶數`；開 ffmpeg 解碼（契約 §6.1） |
| 2. server | `http.createServer` 綁 `127.0.0.1:0`；路由見契約 §6.2-2。`/frame?i=n`：等到第 n 格解完（< n 的丟掉）；佇列超過 8 格（建議初值；1280×720 RGBA 一格 3.7 MB，8 格約 29 MB）就 `ffmpeg.stdout.pause()`，被拿走再 `resume()` |
| 3. Chrome | `findChrome({ chrome })` → `launchChrome(chrome, userDir)` → `cdpClient(ws)`（003 匯出）→ `Target.createTarget({ url: '/' })` → `Runtime.enable` 收 `exceptionThrown` |
| 4. 頁面 | `PAGE_HTML`：import `/tv/vision_bundle.mjs` → 建 FaceLandmarker（契約 §6.2-3）→ `window.__lmReady = true`；Node 輪詢 `__lmReady`（逾時 60 s：本計畫的建議初值，04 沒量啟動時間；本機載入 wasm 14.5 MB＋模型 3.8 MB，T048 實測後寫回契約 §8）後 `Runtime.evaluate('__lmStart(cfg)')`（不 await，頁面自己跑） |
| 5. 頁面迴圈 | `for i of 要偵測的格`：`fetch('/frame?i='+i)` → 204 結束；`x-black: 1` → 記 0；否則 `new ImageData(new Uint8ClampedArray(buf), w, h)` → 追蹤 ROI（契約 §6.2-5／6）→ `createImageBitmap` → `lm.detect(bitmap)` → 取最大臉 → 58 點＋臉框（478 點的 min／max）→ 每 30 格 `POST /result` |
| 6. 收尾 | 頁面 `POST /done { msPerFrame }`；Node 補 `--every 2` 的內插、換算座標、算 summary、寫 tmp → rename；關 Chrome、server、ffmpeg；刪 Chrome 暫存資料夾（同 `audit-browser.mjs:212` 的重試） |
| 進度 | `onProgress({ phase: 'detect', done, total, etaSec })`：Node 依收到的結果算 |
| 逾時 | 30 s 沒有 `/frame` 或 `/result` → 中止（契約 §6.2-10） |

找臉（`locateFaces`）：12 個時間點用 `ff.mjs` 的 `rawFrame(file, { at, width: detectW, height: detectH })` 抽（rgb24 → 頁面轉 RGBA），在頁面裡跑多尺度格子；回每個時間點的最大臉臉寬與中心。同一個 Chrome session 接著跑 `detectLandmarks`（不重開）。

### 2.5 瘦臉底片管線（`renderLookFootage`）

```
ffmpeg(解碼) ──yuv420p raw──► Node：讀滿一格 → 第 i 格的 lm 與權重 → field → warpPlane(Y) → warpPlane(U,½) → warpPlane(V,½) ──► ffmpeg(x264)
                                                                                                     ▲
                                                                              -i rough.mp4 -map 1:a:0? -c:a copy
```

- 解碼：契約 §6.1；`-vf fps=<fps>[,scale=W2:H2:flags=lanczos],format=<pix>`。
- 編碼：`ffmpeg -y -v error -f rawvideo -pix_fmt <pix> -s <W2>x<H2> -r <fps> -i pipe:0 -i rough.mp4 -map 0:v:0 -map 1:a:0? -c:v libx264 -preset veryfast -crf 18 -g <round(fps)> -keyint_min <round(fps)> -pix_fmt <pix> [-colorspace … -color_primaries … -color_trc … -color_range …] -c:a copy -movflags +faststart work/.look/rough-look.tmp.mp4`（preset、crf、每秒一個關鍵幀同 `ff.mjs:70`；色彩標記照 rough.mp4 的 ffprobe 值，沒有就不寫）。
- 一格的處理：權重 0 或沒有 lm → 原樣寫出（不算 field）；有 → 算 field（網格步距照契約 §8）、三個平面各自 `warpPlane`（只複製 ROI 到暫存），記 `maxDisp`。
- 背壓：`enc.stdin.write()` 回 false 就 `dec.stdout.pause()`，`drain` 再 `resume()`（`warp.mjs:108`）。
- 收尾：比長度（`probeDuration`，差 > 1 ÷ fps ＋ 0.05 s → ✖）→ rename 成 `work/rough-look.mp4` → 寫 `state.footage`。
- 失敗：殺兩個 ffmpeg、刪 tmp、`state.run.phase = 'failed'`。
- Windows：pipe 比 Mac 慢（04 §4.6）；Node 的 stdout 預設 64 KB 一塊，1440p 一格 5.5 MB 會分成約 85 塊，照 `warp.mjs:100-110` 的累積寫法即可，不另調 highWaterMark（T029 量了再說）。

### 2.6 `lookPreview` 的版面

- 6 列（臉太小時只有頭、中、尾 3 列）；每列：標題列 30 px（深藍底、點陣字 `mm:ss.s`，同 `qc.mjs:481-482` 的做法）＋ 360 px 高的三格。
- 三格寬：640、640、360；格間與外邊 10 px。整張寬 10 ＋ 640 ＋ 10 ＋ 640 ＋ 10 ＋ 360 ＋ 10 ＝ **1680 px**，高 10 ＋ 列數 × (30 ＋ 360 ＋ 10) ＝ **2410 px**（6 列）。
- 原圖：`ffmpeg -ss t -i rough.mp4 -frames:v 1 -vf scale=…,format=rgb24` 抽到 rough-look 的尺寸（換算一致）；套用後：同一格 `-vf` 多 `lut3dFilter(lut)`，再 `warpPlane(ch 3)`；兩張再縮到 640×360（等比、補黑邊，同 `qc.mjs:315` 的 pad 寫法）。
- 臉部放大：從套用前／後各裁 2.4 × 臉寬的正方形縮到 360（套用後那張），疊兩條 OVAL 折線（綠 `[0,255,0]`＝原本 lm、紅 `[255,60,60]`＝移動點換成 dst 的 lm），線寬 2 px；畫線用 `lib/look.mjs` 內的小函式（Bresenham，只在這裡用）。
- `writeJpg`（`ff.mjs:146`）存 `work/look-preview.jpg`，quality 2。

### 2.7 `tools/look.mjs`（新）— CLI

- 參數解析照 `editor.mjs:49-71`（`parseArgs`）的寫法；`pathsFrom(flags)`（`build.mjs:80`）找專案。
- `run`：cli 契約 §2；把每行同時寫 stdout 與 `work/.look/run.log`（`fs.appendFileSync`）；`state.run` 每 2 秒或每 5 % 寫一次；結束寫 `done`／`failed`。
- `--background`：照 `editor.mjs:891` 背景啟動的寫法（`spawn(process.execPath, args, { detached: true, stdio: ['ignore', fd, fd], windowsHide: true, env: { …, AUTO_EDIT_LOOK_CHILD: '1' } })`）；等 `state.run.pid === child.pid`。
- 鎖：`state.run.phase` 在跑而且 `process.kill(pid, 0)` 成功（`EPERM` 也算活著，同 `editor.mjs:819` 的 `pidAlive`）→ 拒絕。
- `status`、`clear`、`ensure`、`preview`：cli 契約 §3–§5。
- `--help`：印 cli 契約 §0（照 `editor.mjs` 的做法從檔頭註解印）。

### 2.8 剪輯台

| 檔 | 改動 |
|---|---|
| `editor.mjs` `getState()`（`:560`） | 加 `look`（契約 §7.2）：`resolveLook`、`ensureLook({ strict: false })` 的 report、`readState().landmarks.summary`、`baked`（`pickVideo` 選到 assets 時讀 `P.out/.cache/footage-audio.json` 的 `key.look`） |
| `editor.mjs` `handle()`（`:701`） | `GET /api/look/face` → `faceImage()`（ctx 快取 track 與最近 4 格畫面）；回 `image/jpeg`，`Cache-Control: no-store` |
| `editor.mjs` `doBuild()`（`:679`） | 開頭 `lookNeedsRun(readState(), resolveLook(...))` 為真 → `runNode([LOOK, 'run', '--project', P.project], { onData })`；失敗就回報、不 build |
| `editor.mjs` `reportKey()` | 加 `work/.look/state.json` 與 `kit/look.json` 的 stat（look 變了 `--check` 要重跑） |
| `editor/server/write.mjs` | `LIMITS.bodyKeys` 加 `'look'`（`:19`）；新 `sanitizeLook(v)`（用 `LOOK_LIMITS`）；`applySave()`（`:402`）處理 `body.look`；`surgicalText()`（`:354`）多一個 `look` 操作：有就換值、沒有就插在 `"edit"`（沒有就 `"scenes"`）前面、`null` 就刪掉那個 entry 連同它後面的逗號（是最後一個時刪前面的逗號）；回傳多 `look` |
| `editor/model.mjs` | 新 `LOOK_CSS = { b: 0.0825, k: 0.02, s: 0.071 }`（04 §3）與 `lookCss(pending, baked)`（契約 §7.4；數字四捨五入到四位） |
| `editor/app.js` | `app.look`／`app.savedLook`（從 `state.look.plan` 來）；`snapshot`／`dirtySnap`（`:127-128`）加 `look`；`inspWhole()`（`:1056`）最上面加「講者」節；`onInspInput`（`:1291`）處理 `look.color`／`look.slim` 滑桿（`coalesce`）；`onInspClick` 處理 `lookColorOn`／`lookSlimOn`／`lookReset`；`save()` 的 body（`:767`）在 `look` 和存檔時不同時帶 `look`（恢復預設時帶 `null`）；`changed()` 時算 `app.lookCss`；臉部圖在暫停、seek 停 300 ms、滑桿 `change` 時更新 |
| `editor/preview.js` | `SimPreview.tick()`（`:59`）設 `v.style.filter = A.lookCss`；子母畫面 `g.filter = A.lookCss` 再 `drawImage`（`:166`），畫完設回 `'none'` |
| `editor/timeline.js` | 主軌畫 `voiceUncovered[]` 紅色斜線、動畫軌畫 `uncovered[]` 灰色斜線（照 `:275` 畫 voiceOnly 的方式；check-json §2.1） |
| `editor/editor.css` | `.look-faces`（兩張 180×180 並排、下方標「前／後」）、`.look-lines` |
| `editor/index.html` | 說明對話框「基本流程」加一行「講者：點時間軸空白處，右邊最上面調光與瘦臉」 |

`lookNeedsRun({ state, look, assetsOk, chromeOk })` → 布林：`look.slim > 0` 且 `assetsOk` 且 `chromeOk` 且 `!footageFresh()` 且（landmark 不是最新，或 `slimOk !== false`）。

### 2.9 時間預算（M1 Max；Windows 乘 1.5–3，04 §4.5）

| 情境 | 偵測 | 變形＋編碼 | 合計 | 依據 |
|---|---|---|---|---|
| 範例（640×360、5111 格、臉 43 px） | 找臉 12 格約 7 s（41 格子 × 14 ms × 12） | 略過 | ≤ 30 s | 04 §4.5 的 13.7 ms／次偵測 |
| 4K 20 s 片段（600 格） | 10 s | 9–16 s | 約 0.5 分 | 04 §4.5：Node 整條 8.7 s／600 格（1080p） |
| 4K 10 分（18,000 格） | 5.1 分（`--every 2`：2.6 分） | 4.4–7.8 分 | 9.5–13 分（`--every 2`：7–10.5 分） | 契約 §8 預估公式 |
| 只改 slim | 0（landmark 快取） | 4.4–7.8 分 | — | 04 §4.5 最後一列 |
| 只改 color | 0 | 0（build 重新編碼） | build +約 8 s／分 | 04 §3 |

## 3. 資產（`shared/template/vendor/mediapipe/`）

### 3.1 進 git 還是第一次使用時下載：建議**進 git**

| 考量 | 進 git | 第一次使用時下載（`look.mjs ensure --download`） |
|---|---|---|
| 觀眾 clone／下載 ZIP 後 | 直接能用，離線也行 | 要多一步，要能連 `cdn.jsdelivr.net` 與 `storage.googleapis.com` |
| Windows、公司或學校網路 | 不受影響 | 常被擋或很慢；失敗時弱模型容易卡住 |
| AGENTS.md 規則 3（裝東西前問） | 不用問 | 每個新環境都要問一次 |
| 版本與 sha256 | 跟著 commit 固定 | 靠 manifest 驗，來源被換掉會驗不過（只能停下來） |
| repo 大小 | +18,715,722 B ＝ 17.85 MiB（現在 `.git` pack 118.62 MiB，約 +15 %；git 會 zlib 壓縮，實際增加估計少一些）；單檔最大 14.5 MB，低於 GitHub 50 MB 的警告線 | 0 |
| 之後換版本 | 舊檔留在歷史裡（每次 +約 18 MB） | 只改 manifest |

理由：這個 repo 是發布給觀眾跟著做的，對象包含沒有穩定網路的 Windows 使用者，「clone 完就能跑」比少 18 MB 重要；版本很少換。`ensure --download` 仍然保留，當作檔案壞掉時的修復路徑（也讓主代理改裁決時不用改程式）。

### 3.2 `manifest.json`

```json
{
  "name": "@mediapipe/tasks-vision + face_landmarker",
  "version": "1.2.0",
  "approved": "2026-10-31（作者同意，憲法 II）",
  "license": "Apache-2.0",
  "files": [
    { "path": "vision_bundle.mjs", "size": 156344, "sha256": "870da5cf…", "url": "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/vision_bundle.mjs" },
    { "path": "wasm/vision_wasm_internal.js", "size": 334128, "sha256": "85c1a342…", "url": "…" },
    { "path": "wasm/vision_wasm_internal.wasm", "size": 14466654, "sha256": "bcc13df2…", "url": "…" },
    { "path": "face_landmarker.task", "size": 3758596, "sha256": "64184e22…", "url": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" }
  ],
  "npm": { "tarball": "https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.2.0.tgz", "integrity": "sha512-7+dr9GbGyTtcuLh11wE5TOn4dNFRncIT9oAWs72620WX99KW5FfzF6rFJ/ChTgXG9vJ6dCiE9FrEEY4CnwPWKQ==" }
}
```

完整 sha256 見 spec FR-020 的表（實作時照表填全）。資料夾另外放 `LICENSE`（Apache-2.0 全文，來源 `https://www.apache.org/licenses/LICENSE-2.0.txt`）與 `README.md`（一段：這是什麼、`look.mjs` 用它、怎麼驗：`node shared/template/tools/look.mjs ensure`）。

### 3.3 為什麼不收其他檔

- `vision_wasm_nosimd_internal.*`（`.wasm` 12,915,401 B＋`.js` 333,931 B）：Chrome 91 起預設支援 WebAssembly SIMD；HyperFrames 的 chrome-headless-shell 是 152 系列。`FilesetResolver.forVisionTasks` 偵測到 SIMD 就只要 `vision_wasm_internal.*`（`vision_bundle.mjs` 的 `ah()` 先用 `oh()` 試 SIMD，失敗才換 `_nosimd`）。真的遇到不支援，頁面會 404 → ✖「Chrome 載不了 MediaPipe」。
- `vision_wasm_module_internal.*`：`forVisionTasks(path, true)` 才用，我們不用。
- `.cjs`、`vision_bundle.js`、`.map`、`vision.d.ts`：Node 端不載入；`vision_bundle.mjs` 最後一行的 sourceMappingURL 404 只影響 DevTools。

## 4. Windows 檢查表

| 項目 | 做法 | 驗 |
|---|---|---|
| lut3d 路徑的 `C:` | `filterPath` | look.test（Mac 用含冒號資料夾）＋T030 Windows 實機 |
| Chrome 路徑 | `chromeCandidates` 已看 `%LOCALAPPDATA%\hyperframes\chrome`（`audit-browser.mjs:34`） | 003 的 audit.test |
| spawn | ffmpeg 直接 spawn（不用 shell）；Node 子程序用 `process.execPath`；不呼叫 `npx`（`findChrome` 的 npx 後備除外，它已經處理 `shell: WIN`） | — |
| 背景執行 | `detached` ＋ `windowsHide`，同 editor | T030 |
| rename 被鎖、防毒掃暫存檔 | 每 300 ms 重試 5 次；暫存都在 `work/.look/` | T030 |
| pipe 效能 | YUV 只有 RGB 的一半資料量（D3） | T029 量 |
| PowerShell 參數 | `look.mjs` 的參數沒有逗號與冒號 | cli 契約 |
| 中文路徑 | 都用 `path.join`、絕對路徑；濾鏡內的路徑走 `filterPath` | look.test 用中文資料夾名 |

## 5. 測試計畫（`dev/tests/look.test.mjs`）

### 5.1 測試臉 `FACE58`

從 `analysis/look-preview/work/lm_12.json`（478 點）取契約 §5.1 的 58 點，以「點 1 與 168 的中點」為原點、縮放到臉寬（點 234–454）＝200 px，一位小數；順序同 `POINTS`。實作時把下面整段貼成 look.test.mjs 的常數（用時加上中心座標，例如 (480, 300)）：

```js
const FACE58 = [[1.5,62.1],[1.3,30.7],[0.7,21.6],[-0.9,-18.3],[-4.2,-97.9],[1.7,72],[2.6,90.5],[2.8,108.1],[3.9,110.2],[-91.7,-51.4],
  [-56.7,-21.4],[-84.4,-68.1],[-80.2,73.3],[-27.8,80.2],[-52.3,-91.2],[-79.7,-44.4],[-93.5,27.4],[-72,-81.7],[-60.1,-61.7],[-30.4,-95.9],
  [-97.1,-13],[-88.7,49.5],[-24.4,-20],[-58.3,103.8],[-11.6,135],[-35.6,122.1],[-45.9,114.5],[5.7,136.5],[-95.7,-33.8],[-1.3,-30.7],
  [-69.3,91.4],[5.3,131.5],[-24.7,129.2],[4.7,124.2],[4.3,116.4],[-95.7,6.8],[92.7,-60.1],[57.5,-26.9],[82.5,-76.2],[93.1,65.8],
  [35.1,79.7],[45.4,-95.9],[77.9,-51.1],[103.7,19],[67.4,-88.6],[54.8,-66.6],[22.4,-98.6],[103.1,-22],[100.5,41.5],[25.6,-21.7],
  [72.1,98.8],[23.8,134.2],[49.2,119.8],[59.7,111],[99.2,-43],[82.8,85.1],[37.7,127.8],[104.1,-1.9]];
```

（2026-10-31 由 `lm_12.json` 實算：原始臉寬 169.6 px、中心 (970.6, 330.6)。原型 `warp.mjs` 在這格實算：s 0.6 最大位移 4.62 px ＝ 臉寬 2.73 %、ROI 295×368 px、網格 76×94；field 4 px 網格 8.7 ms、8 px 網格 2.9 ms。）

### 5.2 測試清單

| 群組 | 案例（摘要） | 需要 |
|---|---|---|
| 設定 | kit/look.json 讀取；`validateLook` 每則訊息；`resolveLook` 三種 source | — |
| LUT | `.cube` sha256 與尺寸；混合 m＝0／0.5／1／1.25；`cubeText` 來回一致；`filterPath` 純函式；含冒號／空白／中文資料夾實跑 lut3d；`encodeFootage` 參數陣列；灰 128 實際編碼 | ffmpeg（部分） |
| 變形 | spec FR-014 五條；`warpPlane` YUV 半解析度；`maxDisp` | — |
| 軌跡 | `rampWeights`、`smoothTrack`、`interpolateEvery2`、`yawOf` | — |
| 快取 | landmark／底片「最新」的每個條件（契約 §5.3）；`staleReason` 順序 | — |
| ensureLook | 契約 §3.1 七列 × strict true／false | — |
| 管線 | testsrc 2 秒＋假 landmark：解析度、格數、音軌 copy、長度、ROI 外不變、直線位移；長邊 3840 的片縮到 2560 | ffmpeg |
| preview | 合成片＋假 landmark：圖尺寸 1680×2410；印的行；偵測率 90 % 的 ⚠ | ffmpeg |
| CLI | `--help`、壞參數、`status` 每種狀態（假 state）、鎖、`clear`、`ensure`（假來源 server） | — |
| 偵測 | 示範口播前 3 秒：偵測率 ≥ 95 %、臉寬 35–55 px；左右並排取大臉 | Chrome＋資產＋`projects/範例/素材/真人錄影/示範口播.mp4`，否則略過 |
| 資產 | manifest 的 size／sha256 和實檔一致 | 資產（進 git 時必跑） |

### 5.3 `editor.test.mjs` 新增

`lookCss` 數字；`/api/state` 的 `look` 區塊（沒有戳記、有戳記）；存 `look`（插入、取代、刪除、CRLF、被擋、`false` → 物件）；`/api/look/face`（nolandmarks、noface、200 JPEG 360×360）；`lookNeedsRun` 四種情況。

## Project Structure

### Documentation (this feature)

```text
specs/006-look/
├── spec.md      本規格
├── plan.md      本檔
├── tasks.md     任務
└── docs.md      要併進 AGENTS.md／USAGE／style.md／EDITOR.md／setup／NOTICE 的原文（交 001）
specs/contracts/
├── look.md      ensureLook、plan.look、kit/look.json、face-landmarks.json、audioKey 的 look 鍵、演算法、常數
└── cli-006.md   look.mjs 子指令的原文與退出碼
```

### Source Code（006 擁有的檔，照 `specs/README.md` 所有權表）

```text
shared/template/
├── kit/look.json                     新
├── kit/look/jianying-smart.cube      新（132,760 B）
├── vendor/mediapipe/                 新（manifest.json、LICENSE、README.md、vision_bundle.mjs、wasm/…、face_landmarker.task）
└── tools/
    ├── look.mjs                      新：CLI
    ├── editor.mjs                    改：state.look、/api/look/face、doBuild 先跑 look
    ├── editor/{app.js,preview.js,model.mjs,timeline.js,editor.css,index.html}   改
    ├── editor/server/write.mjs       改：sanitizeLook、bodyKeys、surgical look
    └── lib/
        ├── look.mjs                  新：設定、LUT、變形、軌跡、狀態、ensureLook、管線、preview、faceImage
        ├── landmarks.mjs             新：Chrome＋MediaPipe 偵測
        └── ff.mjs                    改：encodeFootage 的 lut、filterPath、lut3dFilter
dev/tests/
├── look.test.mjs                     新
└── editor.test.mjs                   改
NOTICE.md                             改：MediaPipe 段
```

**Structure Decision**：沿用工作區現有的 `tools/`＋`tools/lib/` 分層（CLI 薄、邏輯在 lib），不新增目錄以外的檔案；editor 的子檔照現有拆法。

## Complexity Tracking

| 項目 | 為什麼需要 | 更簡單的做法為什麼不行 |
|---|---|---|
| 新資產 18.7 MB | 唯一能在不裝 Python 的前提下逐格偵測 landmark 的方法（04 §4 路線 d） | 靜態位移圖（路線 b）：示範片 12.6 % 的格頭偏離 > 20 % 臉寬，變形打在背景（04 §4）；Python（路線 a）違反憲法 II |
| 自己追蹤 ROI＋多尺度找臉 | BlazeFace 輸入只有 128 px，4K 或寬鏡頭的臉在整張畫面太小（`common.py:102` 的註解；`make_video.py:39` 用 ROI） | 整張丟進去：臉寬 43 px 的示範片在 128 px 輸入上只剩約 9 px |
| `--background`＋status | 長片的工具逾時（D4） | 只有前景：AI 的工具在 2–10 分逾時會砍掉 |
