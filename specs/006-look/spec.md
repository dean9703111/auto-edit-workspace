# Feature Specification: 006 look（講者調光＋瘦臉）

**Feature Branch**: `006-look`

**Created**: 2026-10-31

**Status**: Draft（只有規格與契約；還沒實作）

**Input**: 主代理派工「工作線 006 look」；分析報告 `analysis/04-face-light.md`（下稱 04）全文、`analysis/00-phase1-report.md` §4；`specs/README.md` 定案列「瘦臉調光：做；偵測資產下載到 `shared/template/vendor/mediapipe/`；預設 color 0.8、slim 0.6；成片 bake 進底片；設定在 `kit/look.json`＋`plan.look`；大眼、磨皮下一階段」。

**契約**：`specs/contracts/look.md`（函式、schema、檔案格式、演算法、常數表）、`specs/contracts/cli-006.md`（`look.mjs` 子指令的原文與退出碼）。本檔的數字都引用契約 §8 的常數表；表裡每個數字都有出處。

## 背景（一段話）

剪映對講者實拍固定套「智能調色 0.8」與「美顏：更瘦（瘦脸 0.6＋V脸 0.1）」。04 實測：調光用擬合的 17³ LUT，和剪映的色差從 ΔE 7.4／6.3（非臉／臉）降到 3.5／4.4（04 §3）；瘦臉用 landmark＋RBF 變形，位移和剪映只差 0.26 %／0.17 % 臉寬（04 §0、§4）。調光零新依賴；瘦臉要逐格偵測 landmark，唯一的新資產是 MediaPipe face landmarker（約 18 MB，憲法 II 已核准），在 HyperFrames 自帶的 chrome-headless-shell 裡跑，不用 Python（04 §4 路線 d）。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 成片自動調光（Priority: P1）🎯 MVP

作者做成片時，講者的畫面自動套上和剪映「智能調色 0.8」接近的顏色，不用另外跑任何指令，也不用新資產。

**Why this priority**: 每支影片都受益、零依賴、成本最低（每分鐘約 +8 秒，04 §3、§4.5），可以先單獨上線。

**Independent Test**: 在 `projects/範例` 跑 `build.mjs`：`assets/rough.mp4` 的畫面和「直接用 ffmpeg 對 rough.mp4 套 `kit/look/jianying-smart.cube`」同一格比，ΔE76 平均 ≤ 1.0；build 印 `講者調光：0.8（…）`。

**Acceptance Scenarios**:

1. **Given** plan.json 沒有 `look`，**When** 跑 build，**Then** 底片重新編碼時 `-vf` 是 `[crop,scale,]lut3d=…,fps=30`，印 `講者調光：0.8（kit/look/jianying-smart.cube，build 重新編碼底片時 bake）`。
2. **Given** 已經 build 過，**When** 只把 `plan.look.color` 從 0.8 改成 0.5 再 build，**Then** 底片重新編碼（戳記的 `look.color` 變了），瘦臉不用重跑。
3. **Given** `"look": false`，**When** build，**Then** `-vf` 和現在完全一樣（沒有 lut3d），戳記沒有 `look` 鍵，舊專案不必重新編碼。
4. **Given** 專案路徑有冒號或空白（Mac 測試資料夾 `a:b c/`），**When** build，**Then** lut3d 讀得到 LUT（`filterPath` 跳脫）。

---

### User Story 2 - 瘦臉 bake 進底片（Priority: P2）

作者剪乾淨之後跑一個指令，講者的下顎線被收窄、下半臉上提到和剪映 0.6 一樣；成片與子母畫面都套用，畫面不跳、側臉與沒有臉的地方自動淡掉。

**Why this priority**: 效果細（4K 原檔下顎只動 3–6 px，04 §0），要新資產與每分鐘約 1 分鐘的處理（04 §4.5），所以排在調光之後。

**Independent Test**: 作者用 4K ASUS 原檔 20 秒片段（04 §1）做專案，跑 `look.mjs run`：偵測率 ≥ 99 %；`look.mjs preview` 的正臉格位移比照 §SC-004；`rough-look.mp4` 和 rough.mp4 長度差 ≤ 1 格；build 印 `講者瘦臉：0.6（work/rough-look.mp4；…）`。

**Acceptance Scenarios**:

1. **Given** rough.mp4 是 4K、臉寬 258 px（04 §5），**When** `look.mjs run`，**Then** 產生 `work/face-landmarks.json`、`work/rough-look.mp4`（2560×1440）、`work/look-preview.jpg`，最後兩行是 `lookNextStep()`（還沒有 plan.json 時：`→ 下一步：look 好了；接著做構圖＋套卡預覽…`＋單獨一行 `node shared/template/tools/qc.mjs framing --project … --cards`）。
2. **Given** `projects/範例`（640×360、臉寬約 43 px），**When** `look.mjs run`，**Then** 印 `⚠ 臉寬 43 px < 60 px…略過瘦臉`，不產生 rough-look.mp4，build 只調光（04 §6.5）。
3. **Given** 瘦臉底片已經是最新，**When** 改 `plan.look.slim` 0.6 → 0.8 後直接 build，**Then** build 停下來（退出 1）印 `✖ 瘦臉底片不是最新的（瘦臉強度 0.6 → 0.8）→ 先跑 …look.mjs run…`。
4. **Given** 某段 1 秒沒偵測到臉，**When** 變形，**Then** 那段不變形，前後各 5 格線性淡入淡出（契約 §6.3）。
5. **Given** 剪乾淨重做、rough.mp4 換了，**When** `look.mjs status`，**Then** `臉部 landmark：✖ 過期（rough.mp4 換過）`，下一步是 `look.mjs run`。

---

### User Story 3 - 剪輯台「講者」面板（Priority: P3）

使用者在剪輯台用開關和滑桿調光與瘦臉：調光在播放中即時看到；瘦臉看目前這一格的「前／後」臉部對照；存檔寫進 `plan.look`；按「重新產生」時需要的話先自動套瘦臉。

**Why this priority**: 依賴 US1、US2 的檔案與函式。

**Independent Test**: `dev/tests/editor.test.mjs` 存 `look` 後 plan.json 只多了 `"look": {…}` 一行；`/api/look/face` 用假的 landmark 回 JPEG；`lookCss()` 的數字對。

**Acceptance Scenarios**:

1. **Given** 剪輯台播的是已經 bake 調光 0.8 的 `assets/rough.mp4`，**When** 滑桿拉到 0.8，**Then** 影片 CSS filter 是 `none`（不會疊兩次）；拉到 0，**Then** filter 是三項比值（契約 §7.4）。
2. **Given** landmark 已經偵測，**When** 暫停在 1:23、瘦臉拉到 1.0 放開，**Then** 面板換成 1:23 那一格的前／後臉部圖（< 0.5 秒，§SC-006）。
3. **Given** 按「恢復預設」再存，**Then** plan.json 的 `look` 被拿掉、其他文字不動。
4. **Given** 存了新的瘦臉強度，**When** 按「重新產生」，**Then** 先跑 `look.mjs run`（toast 顯示進度），再 build。

---

### User Story 4 - 臉部偵測資產可驗證、可補（Priority: P2，和 US2 一起做）

`shared/template/vendor/mediapipe/` 的 4 個檔有固定版本、來源網址、sha256、授權；缺檔或壞檔時工具說清楚怎麼補。

**Independent Test**: `look.mjs ensure` 對齊 manifest 全部 ✔；刪掉一個檔後 ✖ 並給 `--download` 指令；`look.test.mjs` 驗 manifest 的 sha256。

**Acceptance Scenarios**:

1. **Given** 4 個檔都在，**When** `look.mjs ensure`，**Then** `✔ 4 個檔都對`，退出 0。
2. **Given** `.wasm` 被刪，**When** build（瘦臉 > 0），**Then** `⚠ 講者瘦臉略過：找不到 …vision_wasm_internal.wasm，只調光 → node shared/template/tools/look.mjs ensure`，build 照常完成。

### Edge Cases

| 狀況 | 怎麼處理 | 出處 |
|---|---|---|
| 只有聲音的區間（主軌接了聲音檔，畫面全黑） | 解碼時判成全黑格、跳過偵測、存 `0`、不算進偵測率、不變形 | ff.mjs:111 `BLACK`；契約 §6.2-4 |
| 一格沒偵測到臉（低頭、轉身） | 那格不變形，前後 5 格淡入淡出 | 04 §6.5 |
| 整支偵測率 < 80 % | 自動關瘦臉，⚠ | 04 §6.5 |
| 偵測率 < 95 % | preview ⚠，仍然瘦臉 | 04 §6.4 |
| 臉寬 < 60 px（640×360 示範片） | 整支中位數 < 60：不做瘦臉底片；個別格 < 60：那格權重 0 | 04 §6.5 |
| 側臉 `|yaw|` > 0.35 | 強度減半，5 格過渡 | 04 §6.5（單位見契約 §6.3） |
| 多張臉 | 只處理臉寬最大的；preview 提醒有幾格 | 04 §6.5 |
| 位移 > 臉寬 6.5 %（每格比例的 95 百分位） | preview ⚠。原型實算（`warp.mjs`、`lm_12.json` 那格、網格 4 px）：slim 0.3 → 1.31 %、0.6 → 2.73 %、0.85 → 4.02 %、1.2 → 6.07 %；轉頭的格比例較高，所以看 95 百分位。原裁決 5 % 在 slim 0.8 就誤報（審查 C-03），用 slim 0.6／0.8／1.05 三個值重新校準成 6.5 %（契約 §8） | 04 §6.4、主代理裁決、審查 r1-C |
| slim 設 1.2 以上 | ✖（上限 1.2，超過脖子與領口彎） | 04 §5、§6 表 |
| 子母畫面 | 用同一支 `assets/rough.mp4`，自動套用 | 04 §6.5；`lib/main.mjs:84` |
| 構圖裁切 `frame` 在瘦臉之後才選 | 不衝突：瘦臉在原畫面做，build 再裁切；framing 看的就是套好的底片 | 契約 §1、§3.4 |
| 4K 來源 | rough-look 長邊縮到 2560（1.3 倍構圖裁切仍 ≥ 1920 寬） | D2 |
| VFR 或怪影格率（29.917） | 兩次解碼都先過 `fps=<avg_frame_rate>`，格號對得上；rough-look 用同影格率 CFR | 契約 §6.1 |
| yuvj420p（全範圍） | 原樣解碼與編碼，不轉色彩 | D3 |
| 10-bit／HDR 來源 | 轉 yuv420p（會有色調差，第一版不處理，列在限制） | 契約 §5.4 |
| run 被中斷（工具逾時、關機） | 暫存檔不會蓋到正式檔；state 記 `failed` 或 pid 已死；重跑從頭 | 契約 §5.1、§5.2 |
| 同時開兩個 run | 第二個 ✖ 已經在跑 | cli-006 §2.3 |
| build 時 run 還在跑 | build ✖ 等它跑完 | 契約 §3.1 第 3 列 |
| Chrome 或資產缺、瘦臉 > 0 | `run` ✖；build ⚠ 略過瘦臉、照常完成 | 契約 §3.1 第 6 列 |
| Windows 路徑的 `C:` | `filterPath` 跳脫冒號；測試在 Mac 用含冒號的資料夾驗 | 04 §4.6 |
| Windows rename 被鎖 | 每 300 ms 重試、最多 5 次 | 契約 §5.2 |
| 剪輯台播的影片已經 bake 過 | CSS 用比值，不疊兩次 | 契約 §7.4 |
| 換場地、換光線 | LUT 只是平均近似（04 §8）；style.md 建議把 color 調低 | docs.md |

## Requirements *(mandatory)*

每一條都寫「怎麼驗」。測試檔：`dev/tests/look.test.mjs`（新）、`dev/tests/editor.test.mjs`；指令原文見 cli-006。

### 調光

- **FR-001**：新增 `shared/template/kit/look/jianying-smart.cube`＝`analysis/look-preview/jianying-smartcolor-fit-face.cube` 的逐位元組複本（17³、132,760 B、sha256 `56969a5a84ace8157a8669044f32a23c99c53284477464dab7292a81198d2b6f`）。來源與限制寫在契約 §2.1 與 style.md 新節：擬合自 esim_ep2 第 8–16 秒、同一場地、同一台 ASUS，臉部與非臉樣本各半（04 §2.2、§3、§8）；`-bg.cube` 與無後綴版不收（04 §5）。**驗**：look.test 比 sha256 與 `LUT_3D_SIZE 17`。
- **FR-002**：新增 `shared/template/kit/look.json`，內容與規則照契約 §2.1；多的欄位或超出範圍 ✖。**驗**：look.test 讀到 `{ color: 0.8, slim: 0.6, lut }`；壞檔訊息帶 →。
- **FR-003**：調光強度 c 用「LUT 和恆等的混合」：m ＝ c ÷ `LUT_REF`（0.8），每個格點 `id + m × (lut − id)` 夾到 0–1，寫成 `work/.look/lut-<c>-<sha8>.cube`（契約 §5.3）。不用 `lut3d` 後 `blend`（ffmpeg 的 lut3d 沒有強度參數，`ffmpeg -h filter=lut3d` 只有 file／clut／interp；split＋blend 多一倍運算，m > 1 也不好夾）。**驗**：look.test：m ＝ 0 等於恆等、m ＝ 1 等於原檔、m ＝ 0.5 是中點、m ＝ 1.25 夾在 0–1；有 ffmpeg 時，恆等 LUT 套在純色畫面上 RGB 差 ≤ 2/255。
- **FR-004**：`lib/ff.mjs` 的 `encodeFootage(src, dst, { audioFilter, audioRaw, crop, lut })` 多收 `lut`（絕對路徑或 null）；`-vf` 依序 `crop → scale → lut3d → fps=30`；`lut` 是 null 時參數和現在逐字相同。新增匯出 `filterPath(p)`、`lut3dFilter(file)`（契約 §3.4）。**驗**：look.test 檢查兩種情況的參數陣列；有 ffmpeg 時用灰 128 的測試片編碼，輸出中心像素和「同一 LUT 直接 ffmpeg 套」差 ≤ 3/255。
- **FR-005**：濾鏡參數裡的路徑由 `filterPath()` 處理：`\` 換 `/`、冒號換 `\:`、整段用 `'…'` 包起來；路徑含 `'`、`[`、`]`、`,`、`;` 時丟錯：`路徑有 ' [ ] , ; 這類字元，ffmpeg 濾鏡讀不了：<路徑> → 把資料夾改名（不要用這些符號）`。**驗**：look.test 純函式（`C:\a b\x.cube` → `'C\:/a b/x.cube'`）；非 Windows 時在含冒號與空白的暫存資料夾實跑 lut3d。Windows 實機由作者在迴圈第 3 步驗（T 任務）。
- **FR-006**：build 接線照契約 §3–§4（請 002、005 加，見下）。調光成本：1080p 每格約 +4.3 ms（04 §4.5：9.3 vs 5.0 ms），每分鐘約 +8 秒（04 §3）；沒有構圖裁切的 4K 底片 lut3d 在原解析度跑，約 4 倍（推估，T 任務量）。**驗**：§SC-003。

### 瘦臉：偵測

- **FR-010**：`lib/landmarks.mjs` 在 HyperFrames 的 chrome-headless-shell 跑 `@mediapipe/tasks-vision@1.2.0` 的 FaceLandmarker（CPU delegate、IMAGE 模式），零依賴：Node 內建 http、child_process、WebSocket；Chrome 用 `findChrome`（`lib/audit-browser.mjs:45`），啟動與 CDP 用 003 匯出的 `launchChrome`、`cdpClient`。偵測流程（解碼、全黑格、追蹤 ROI、多尺度找臉、多臉取最大、逾時）照契約 §6.1–6.2。**驗**：look.test（沒有 Chrome 或資產就自動略過）：示範口播前 3 秒（90 格）偵測率 ≥ 95 %、臉寬中位數 35–55 px；把同一段左右並排（右邊放大 1.2 倍）→ 存的是右邊那張（臉寬比 ≈ 1.2）。
- **FR-011**：輸出 `work/face-landmarks.json`，格式照契約 §5.1：58 點子集、rough.mp4 像素座標、原始值、臉框、張數、內插旗標、summary；信心值只能記「過門檻」（tasks-vision 1.2.0 不給分數，`vision.d.ts:714-726`）。**驗**：look.test 用假的偵測結果寫檔再讀回，欄位齊、`points` 58 個、每格 `p` 116 個數字。
- **FR-012**：快取鍵＝rough.mp4 的 size＋mtimeMs＋modelSha256＋`LM_VER`（契約 §5.3）；`--every` 不在鍵裡。**驗**：look.test：touch rough.mp4 → landmark 過期；只改 slim → landmark 仍最新、瘦臉底片過期；只改 color → 兩個都最新。
- **FR-013**：`--every 2` 只偵測偶數格，奇數格前後都有才取平均（`i: 1`）。**驗**：look.test 純函式。

### 瘦臉：變形與底片

- **FR-014**：`lib/look.mjs` 的 `controlPoints`、`field`、`warpPlane` 照 `warp.mjs` 移植（契約 §6.4、§8）：移動點／只上提點／固定點／外圈與脖子、RBF σ ＝ 0.25 臉寬、粗網格雙線性、ROI 羽化。**驗**：look.test 用契約 §8 外的固定測試臉（plan.md §5 的 `FACE58`，臉寬 200 px）：
  - 左下顎點 172 的反向位移 Dx < 0、Dy > 0，大小和 `k × √(IN(h)² + UP(h)²) × 臉寬` 差 ≤ 5 %；
  - 固定點（33、263、168）|D| < 0.05 px；
  - 最大位移隨 s 單調增加，s ＝ 1.2 是 s ＝ 0.6 的 2.0–2.4 倍（RBF 在變形後的位置上解，不是嚴格線性；原型 `warp.mjs` 在 `lm_12.json` 那格實算 6.07 % ÷ 2.73 % ＝ 2.23）；s ＝ 0 輸出逐位元組等於輸入；ROI 外逐位元組等於輸入；
  - 在合成圖上畫一條通過點 172 的直線，變形後直線往中軸移動的量和 IN × 臉寬差 ≤ 0.5 px；
  - YUV 的 U／V 平面位移是 Y 的一半（± 0.05 px）。
- **FR-015**：`look.mjs run` 的變形管線：ffmpeg 解碼成 rough.mp4 原本的 YUV 平面 → JS 只改臉部 ROI（Y 全解析度、U／V 半解析度）→ ffmpeg x264 veryfast crf 18 → 音軌 `-c:a copy` → 驗長度 → rename 成 `work/rough-look.mp4`。規格照契約 §5.4（不調色、長邊 ≤ 2560、CFR、色彩標記照抄）。**驗**：look.test（有 ffmpeg）用 testsrc 合成 2 秒片＋假 landmark：輸出解析度、格數、音軌 codec 與封包數和來源相同；長度差 ≤ 1 格；在 ROI 外取 10 個點和來源解碼值差 ≤ 3/255（x264 有損）；ROI 裡的直線位移照 FR-014。
- **FR-016**：退路照契約 §6.3：沒偵測到／全黑／臉寬 < 60 px → 權重 0；`|yaw|` > 0.35 → 0.5；`rampWeights` 5 格過渡；偵測率 < 80 % 或臉寬中位數 < 60 px → 整支不做瘦臉底片（`slimOk: false`）。**驗**：look.test：`rampWeights([1,1,1,1,1,1,0,1,1,1,1,1,1], 5)` ＝ `[1, 0.8, 0.6, 0.4, 0.2, 0, …]` 對稱；`yaw` 用把右半邊點往中線壓的測試臉算出 > 0.35；判斷表用假 state 逐列驗。
- **FR-017**：時間平滑照契約 §6.3-1（7 點高斯、σ 1 格、不跨過沒偵測到的格）。**驗**：look.test：常數軌跡不變；單格尖刺被壓到 ≤ 40 %；`null` 兩側各自平滑。

### 瘦臉：工具與驗證

- **FR-018**：新增 `shared/template/tools/look.mjs`，子指令 `run`、`preview`、`status`、`clear`、`ensure`，參數、印出的行、退出碼、錯誤訊息全部照 `contracts/cli-006.md`。`run` 有 `--background`、鎖（state 的 pid）、`work/.look/run.log`。**驗**：look.test：`--help` 退出 0 且含 cli-006 §0 的每一個指令；壞參數退出 2；用假 state 驗 `status` 的每種狀態行與「→ 下一步」；正在跑時 `run`、`clear` 都 ✖。
- **FR-019**：`look.mjs preview` 產生 `work/look-preview.jpg`（6 列 × 3 欄：原圖｜套用後｜臉部放大＋輪廓），印偵測率、未偵測區間、每格最大位移 px、抖動；偵測率 < 95 % 或位移（95 百分位）> 臉寬 6.5 % 報 ⚠（cli-006 §3；校準見契約 §8）。**驗**：look.test 用合成片＋假 landmark（不需要 Chrome）：圖檔尺寸 ＝ 3 欄寬 × 6 列高（plan.md §2.6 的版面數字）；印的行符合原文；把假 landmark 的偵測率做成 90 % → 有偵測率 ⚠。

### 資產

- **FR-020**：`shared/template/vendor/mediapipe/` 放 4 個執行期檔＋`manifest.json`＋`LICENSE`（Apache-2.0 全文）＋`README.md`（一段話：是什麼、誰用、怎麼驗）。只收 SIMD 版（chrome-headless-shell 支援 WebAssembly SIMD；`vision_bundle.mjs` 的 `FilesetResolver` 在支援 SIMD 時只載入 `vision_wasm_internal.*`），不收 nosimd（12.9 MB）、module 版（14.5 MB）、`.map`、`.cjs`：

  | 檔 | 大小 | sha256 | 來源 URL |
  |---|---|---|---|
  | `vision_bundle.mjs` | 156,344 B | `870da5cfc43bfcf2a8b0f14e8152dae8c7e701722e1191b0e592b94b81b4127a` | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/vision_bundle.mjs` |
  | `wasm/vision_wasm_internal.js` | 334,128 B | `85c1a342be70427987f900969a5f26e17557351111364e6585e97fb03e93e108` | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm/vision_wasm_internal.js` |
  | `wasm/vision_wasm_internal.wasm` | 14,466,654 B | `bcc13df22d3d69ec8cbe8e280989356d844ae00f4523eb82072d2484f44134dc` | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm/vision_wasm_internal.wasm` |
  | `face_landmarker.task` | 3,758,596 B | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` |
  | **合計** | **18,715,722 B（17.85 MiB）** | | |

  npm 套件本體：`https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.2.0.tgz`（integrity `sha512-7+dr9GbGyTtcuLh11wE5TOn4dNFRncIT9oAWs72620WX99KW5FfzF6rFJ/ChTgXG9vJ6dCiE9FrEEY4CnwPWKQ==`，`analysis/npm-tv/package-lock.json`），授權 Apache-2.0（套件的 `package.json`）；套件裡**沒有 LICENSE 檔**，要另外放 Apache-2.0 全文。模型授權：Google 文件與社群鏡像標示 Apache-2.0，但我沒有拿到 Google 原文（見「需要主代理裁決」第 2 條）。sha256 與大小是 2026-10-31 在 `analysis/npm-tv/` 與 `analysis/models/` 實算的。**驗**：look.test 逐檔比 manifest 的 size 與 sha256（資產進 git 時缺檔算失敗；改成下載時缺檔略過，照裁決結果二選一）。
- **FR-021**：`NOTICE.md` 加「MediaPipe Tasks Vision 與 Face Landmarker 模型」一段（原文在 docs.md §6）。**驗**：001 的 docs.test 檢查 NOTICE 提到 manifest 的每個檔名。
- **FR-022**：`look.mjs ensure [--download]` 照 cli-006 §5.2。**驗**：look.test：暫存 vendor 資料夾少一個檔 → ✖、退出 1；`--download` 用本機 http server 假裝來源（manifest 的 url 換成 127.0.0.1）→ 下載、驗 sha256、rename；故意給錯的內容 → ✖ 不換上去。

### build 與其他工作線的接線

- **FR-030**：`lib/look.mjs` 匯出 `ensureLook`、`lookCheck`、`validateLook`、`resolveLook`、`LOOK_LIMITS`，行為照契約 §2–§4；`ensureLook` 同步、不開 Chrome；過期而且能跑時（strict）丟錯讓 build 停下來，不自動跑重的偵測（D4）。**驗**：look.test 用假的 state.json 走完契約 §3.1 的 7 列，每列檢查 footage、lut、key、report 原文、丟不丟錯。
- **FR-031**：`plan.look` schema 照契約 §2.2；002 把 `look` 加進 `TOP_KEYS` 並呼叫 `validateLook`。**驗**：look.test 驗 validateLook 的每則訊息；002 的 plan.test 驗 `look` 不再被當成未知欄位。
- **FR-032**：`qc.mjs framing`（含 `--cards`）看到套好的底片：請 004 照契約 §3.4 呼叫 `ensureLook({ strict: false })`。**驗**：004 的 qc.test：有 rough-look.mp4 時 framing 抽的是它，`-vf` 含 lut3d。
- **FR-033**：執行時機：剪乾淨做完、`work/rough.mp4` 定了之後，「構圖＋套卡預覽」之前（04 §6.1）。不加新停點（憲法 V 只有六個）；對照圖和停點 ② 一起給使用者看（請 001 決定是否加進停點 ② 的「請看」）。**驗**：001 的 docs.test／弱模型試跑紀錄。

### 剪輯台「講者」面板

- **FR-040**：「整支影片」屬性面板最上面加「講者」一節：調光開關＋滑桿（0–1、步距 0.05，顯示「0.80（剪映 80）」）、瘦臉開關＋滑桿（0–1.2、步距 0.05）、「恢復預設」按鈕、狀態行（`/api/state` 的 `look.lines`）。開關關掉＝強度 0，再打開回到關掉前的值（沒有就 kit 預設）。**驗**：瀏覽器實測（T 任務截圖）；`look` 進復原清單與「有修改還沒儲存」判斷（`app.js:127-128` 的 snapshot／dirtySnap 加 look）。
- **FR-041**：調光即時預覽：`#simVideo` 與子母畫面 canvas 套 `lookCss(pending, baked)`（契約 §7.4），插入素材不套。**驗**：editor.test 測 `model.mjs` 的 `lookCss`：c ＝ 0.8、b ＝ 0 → `brightness(1.066) contrast(1.016) saturate(1.0568)`（四位小數）；c ＝ b → `none`；c ＝ 0、b ＝ 0.8 → 三個比值 < 1。
- **FR-042**：瘦臉單格前後對照：`GET /api/look/face`（契約 §7.3）；面板在暫停、seek 停 300 ms、滑桿放開時更新兩張圖（前＝slim 0、後＝目前滑桿），兩張都套目前調光的 CSS。04 §6.3 估「約 50 ms」是只算變形；含抽格與 JPEG 編碼，4K 第一次約 0.3 秒（推估），之後同一格只重算變形。**驗**：editor.test：沒有 landmark → 404 `nolandmarks`；放假的 `face-landmarks.json`（FACE58 貼在 testsrc 上）→ 200 `image/jpeg`、360×360；全黑格 → 404 `noface`。
- **FR-043**：存檔寫 `plan.look`：`editor/server/write.mjs` 加 `sanitizeLook`、`LIMITS.bodyKeys` 加 `look`、surgical 寫入照契約 §7.1。**驗**：editor.test：存 `{color:0.5, slim:0.6}` → 只多一行、其他文字逐字相同（含 CRLF 版）；再存 `null` → 那行消失；`{color:2}`、`{tone:1}` 被擋且檔案不動；原本是 `false` → 換成物件。
- **FR-044**：`/api/state` 多 `look` 區塊（契約 §7.2）；`baked` 讀 `work/hyperframes/.cache/footage-audio.json` 的 `key.look`。**驗**：editor.test：沒有戳記 → `baked: null`；放一個 `key.look.color = 0.8` 的戳記並讓 assets 比 rough.mp4 新 → `baked.color = 0.8`。
- **FR-045**：「重新產生」：瘦臉 > 0、底片過期、能跑時，server 先跑 `look.mjs run --project <專案>`（輸出併進 build log，toast 顯示「套用瘦臉中…」），成功才跑 build；失敗回報 log。判斷抽成純函式 `lookNeedsRun(state)`。**驗**：editor.test 用假 state 測 `lookNeedsRun` 四種情況。
- **FR-046**：顯示 002 check-json（`specs/contracts/check-json.md` §2.1）的兩種區間：`voiceUncovered[]`（只有聲音、沒被 media 或不透明全畫面蓋住）在主軌畫紅色斜線＋狀態列「⚠ N 段只有聲音、沒被素材蓋住」；`uncovered[]`（沒有任何卡片、動畫或素材的口播）在動畫軌畫灰色斜線。**驗**：瀏覽器實測（002 的 `--check --json` 有這兩個鍵之後）；鍵不存在時不畫、不報錯。

### 文件與測試

- **FR-050**：`specs/006-look/docs.md` 給 001 的原文：AGENTS.md「剪好看」新步驟與規則 7 的中間檔、USAGE §3.2 第一層欄位與 §6 剪輯台會寫的欄位加 `look`、`shared/style.md` 新節「講者畫面（調光、瘦臉）」（現有的「## 講者」是 14 講者介紹字卡用的，不能撞名）、EDITOR.md 面板說明、setup 的資產步驟、NOTICE 段。**驗**：001 整合後 docs.test 綠燈。
- **FR-051**：`dev/tests/look.test.mjs` 覆蓋 FR-001～FR-030 的「驗」；`editor.test.mjs` 覆蓋 FR-041～FR-045。沒有 ffmpeg、Chrome 或資產的測試用 `{ skip: '<原因>' }` 自動略過（同 `audio.test.mjs:127`、`audit.test.mjs:288` 的寫法）。**驗**：`node --test dev/tests/*.test.mjs` 全綠（憲法檢查迴圈第 1 步）。

### Key Entities

- **look 設定**：`kit/look.json`（預設）＋`plan.look`（覆寫）→ 有效值 `{ color, slim }`。
- **landmark 軌跡**：`work/face-landmarks.json`，每格 58 點（或沒有臉／全黑），綁定一支 rough.mp4。
- **瘦臉底片**：`work/rough-look.mp4`，綁定一支 rough.mp4、一份 landmark、一個 slim。
- **混合 LUT**：`work/.look/lut-<c>-<sha8>.cube`，綁定一個 color 與一支原始 LUT。
- **快取索引**：`work/.look/state.json`（landmark、底片、執行進度）。
- **資產清單**：`shared/template/vendor/mediapipe/manifest.json`。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：`projects/範例` 從剪乾淨後跑 `look.mjs run` → build：`look.mjs run` 在 M1 Max 上 ≤ 30 秒結束（只找臉 12 格，臉太小略過瘦臉）；build 印調光行與「略過瘦臉」⚠；`assets/rough.mp4` 中間一格和「同一支 rough.mp4 用 ffmpeg `lut3d`（同一個混合 LUT）＋同一組 x264 參數編碼」的輸出比，ΔE76 平均 ≤ 0.2（審查 C-04：原寫「和 ffmpeg 直接套 LUT 比 ≤ 1.0」量不到——只重新編碼不調光的基線就有 0.41–0.63，bake 本身和純 ffmpeg 到小數 3 位一樣）。
- **SC-002**：示範口播全片偵測（直接呼叫 `detectLandmarks`，不經臉太小的略過）偵測率 ≥ 99 %（04：Python 5110/5111、tasks-vision 299/300），和 04 的 Python 版 landmark（`lm_full.npz`）比，下顎 21 點平均差 ≤ 臉寬 0.5 %（04 §4 路線 d：扣掉 1 px 偏移後差 0.30 %）。
- **SC-003**：只調光時，build 的底片重新編碼時間比不調光多 ≤ 10 秒／分鐘（1080p 輸出；04 §3：約 8 秒）。
- **SC-004**：4K 20 秒片段 slim 0.6：**正臉格（|yaw| < 0.1）**的每格位移／臉寬 95 百分位 ＝ 2.7 % ± 0.3 %（審查 C-15：整支的「最大」含轉頭格，幾乎一定超過 3 %，改看正臉格；2026-10-31 合成 4K 2.79 %、示範口播 2× 全片 2.85 %、20 秒 2.84 %。原型在 `lm_12.json` 那格實算 2.73 %；控制點本身最大在 h ≈ 0.9：`√(1.35² + 2.00²)` ＝ 2.41 %，RBF 在點之間略有超出）；對 rough-look.mp4 重新偵測，臉寬比例（顴骨對下巴旁）的變化和 04 §4 的 0.983 → 0.971 差 ≤ 0.004。
- **SC-005**：4K 10 分鐘的整條 `look.mjs run`（每 1 格）在 M1 Max ≤ 15 分鐘、`--every 2` ≤ 11 分鐘（04 §4.5 估約 10／7 分，加上 1440p 輸出的上限外插）；實測值寫回契約 §8 的預估常數。
- **SC-006**：剪輯台：調光滑桿拖動時畫面在下一格就變（不打 API）；`/api/look/face` 在示範口播上 p50 ≤ 300 ms、4K 第一次 ≤ 600 ms。
- **SC-007**：`look.mjs status` 在每一種狀態都只印一行 `→ 下一步：<說明>`，下一行（最後一行）是單獨一行、可以直接複製執行的指令（審查 C-02），而且和 status.mjs 的下一步一致（審查 C-01，同一個 `lookNextStep()`）（弱模型試跑紀錄 `dev/loop/round-N.md` 沒有卡在 look）。
- **SC-008**：`node --test dev/tests/*.test.mjs` 全綠；沒有 Chrome 的機器上 landmark 測試顯示「略過」而不是失敗。

## Assumptions

- 執行環境同憲法 II：Node 22＋、ffmpeg 8 系列、HyperFrames 0.8.221 自帶的 chrome-headless-shell（`npx hyperframes browser ensure` 已裝）；不裝 Python。
- 講者固定機位、一人出鏡為主（style.md「畫布」）；多人只瘦最大的臉。
- rough.mp4 是 8-bit 4:2:0（auto-editor 的輸出）；10-bit／HDR 先轉 yuv420p，不保證色調。
- 剪映的大眼、磨皮、亮眼、祛斑等第一版不做（README 定案「下一階段」；04 §2.1、§7-5）；美白已經算進 LUT（04 §2.1）。
- 04 的時間都是 M1 Max；Windows 筆電乘 1.5–3（04 §4.5）。
- 契約 §8 標「建議初值」的數字（網格步距、DETECT_W、LOOK_MAX_SIDE、找臉間隔、yaw 門檻的單位）由 T 任務實測後確認，改了只改契約與 `lib/look.mjs` 的常數。

## 設計決定（摘要；理由在 plan.md §1）

| 編號 | 決定 | 和 04／派工的差別 |
|---|---|---|
| D1 | `rough-look.mp4` 只瘦臉、不調色；調光一律在 build 重新編碼時用 lut3d 做一次 | 04 §4 與派工寫「解碼＋lut3d → 變形」 |
| D2 | rough-look 長邊 > 2560 時縮到 2560 | 04 沒提；為了 4K 的速度 |
| D3 | 變形直接改 YUV 平面，不轉 RGB | 原型 `warp.mjs` 是 RGB |
| D4 | build 不自動跑偵測與變形；過期就 ✖ 請 AI 先跑 `look.mjs run`（剪輯台的「重新產生」會自動先跑） | 04 §6.1 寫「由 build 自動呼叫」 |
| D5 | `ensureLook` 回傳多一個 `lut`、多一個 `strict` 參數；另外匯出 `lookCheck` | 派工的簽名是 `{ footage, key, report[] }` |

## 請 00N 加

| 給 | 檔案 | 要加什麼 | 契約 |
|---|---|---|---|
| 002 | `tools/lib/plan.mjs` | `TOP_KEYS` 加 `'look'`（`:25`）；`resolvePlan` 把 `validateLook(plan.look)` 的每則當 ✖ | look.md §2.2 |
| 002 | `tools/build.mjs` | 非 `--check` 路徑：在算 `wantKey`（`:408`）之前呼叫 `ensureLook({ projectDir: P.project, plan, log, templateDir: P.templateDir })`，印 `report`；`audioKey` 的 `src`、`fresh` 判斷（`:409`）、`encodeFootagePolished` 的 `src`、`frameCrop`（`:452`）都改用 `look.footage`；`audioKey` 加 `look: look.key`；`encodeFootagePolished` 加 `lut: look.lut`。`voiceOnlyOf`（全黑偵測）、`--check` 的影片、剪輯台的 `--video` 預設仍是 rough.mp4 | look.md §3、§4 |
| 002 | `tools/build.mjs` | `--check`（文字與 `--json`）併入 `lookCheck()` 的 errors／warnings | look.md §3.3 |
| 002 | `specs/contracts/plan-fields.md` | 第一層新欄位列 `look`，schema 指向 `contracts/look.md` §2.2 | — |
| 002 | `tools/status.mjs` | **呼叫 `lookNextStep()` 取代自己判**（審查 C-01）：拿掉 `slimTodo`／`lookFirst` 與 `resolveLook` 的判斷；在 S8（構圖預覽）與 S11（build）之前呼叫 `lookNextStep({ projectDir: project, plan: <plan.json 或 {}> })`，`done === false` 時下一步就用它的 `note`（說明）＋`cmd`（單獨一行的指令），`done === true` 照原本的表往下。函式只讀、不寫檔（會跑一次 ffprobe 預估分鐘） | look.md §3.5 |
| 002 | `tools/build.mjs` | （選擇）`--check` 要不要把 `lookCheck()` 第 7 列從 ⚠ 改成 ✖：現在 warnings 已經加前綴「build 會停下來：」（審查 C-14） | look.md §3.3 |
| 002 | `specs/contracts/check-json.md` | `voiceUncovered[]`、`uncovered[]` 的格式（剪輯台照它畫；已定案） | FR-046 |
| 005 | `tools/lib/audio.mjs` | `audioKey` 加參數 `look = null`，`...(look ? { look } : {})`；`encodeFootagePolished` 收 `lut = null`，`:138`、`:165` 兩處 `encodeFootage` 帶 `{ crop, lut }` | look.md §4 |
| 003 | `tools/lib/audit-browser.mjs` | `launchChrome`（`:179`）、`cdpClient`（`:148`）前面加 `export`（簽名不變） | look.md §6.2-1 |
| 004 | `tools/qc.mjs` | `framingPreview`（`:446`）與 `cardsPreview`（`:500`）：來源改 `ensureLook({ strict: false }).footage`、`frame1080()` 的 `-vf` 在 `format=rgb24` 前接 `lut3dFilter(look.lut)`；印 `look.report` | look.md §3.4 |
| 001 | AGENTS.md、USAGE.md | `look.mjs status`／`run` 的最後兩行改成「`→ 下一步：<說明>`＋單獨一行的指令」：AGENTS.md「照最後一行「→ 下一步」做」改成「照「→ 下一步」做（最後一行就是要跑的指令）」；USAGE §4.1 的範例（`:307`、`:353` 一帶）把「`⚠ 講者瘦臉略過：偵測率 0%（< 80%）`」換成抽樣沒臉的新原文（look.md §3.2「略過：抽樣沒臉」）；USAGE「瘦一點 → slim 0.8」不用改，但 USAGE `:610`「臉寬 5 %」改成 6.5 %；`.agents/skills/auto-edit-style/SKILL.md:75` 的「只複製 node … 那一段，全形括號裡的預估不要貼」可以拿掉（指令已經單獨一行） | cli-006 §2.2、§4.2；docs.md §1.1 |
| 001 | AGENTS.md、USAGE.md、style.md、EDITOR.md、setup、docs.test | 照 docs.md 併入；docs.test 檢查 `kit/look.json` 的 color／slim 和 style.md 新節的數字一致、cli-006 §0 的每個指令都在文件出現 | docs.md |
| 007 | `dev/check-all.mjs` | 合成專案跑 `look.mjs status`（必跑）與 `look.mjs run`（沒有 Chrome 時略過，不算失敗） | cli-006 |

## 需要主代理裁決

1. **資產進 git 還是第一次使用時下載**：建議**進 git**（理由見 plan.md §3.1）。裁決後我改 FR-020 的「驗」與 setup 段落。
2. **模型授權原文**：tasks-vision 套件是 Apache-2.0（套件 `package.json`），但 `face_landmarker.task` 的授權我只找到 Google 文件與社群鏡像標 Apache-2.0，沒有拿到 model card 原文。建議實作前作者打開 Google 的 Face Landmarker model card 確認，再寫進 NOTICE；確認前不 commit `.task`。
3. **D4：build 過期就停**（04 原本建議 build 自動跑）。理由：10 分鐘 4K 要 10 分鐘以上（Windows 再乘 1.5–3），AI 的工具逾時會在中途砍掉 build。
4. **D1：rough-look 不含調光**（派工寫「解碼＋lut3d → 變形」）。理由：改調光不必重跑 4 分鐘以上的變形、LUT 只套一次、偵測在原色上做。
5. **D2：4K 縮到 2560 長邊**（建議初值）。理由與代價見 plan.md §1。
6. **停點 ② 要不要多給 `work/look-preview.jpg`**：001 的 `stop-points.md` §2 的停點 ② 只列構圖兩張圖。
7. **契約檔名** `cli-006.md` vs README 寫的 `cli.md`（同 001 的第 1 條）。
8. **位移 ⚠ 門檻 4 %（04 §6.4）和滑桿上限 1.2（04 §6 表）不一致**：原型實算 slim ≥ 約 0.85 就超過 4 %。照 04 先保留兩個數字（⚠ 只是提醒、不擋）；若要 slim 1.0 以下不出 ⚠，門檻改 5 %。→ 已裁決 5 %；審查 r1-C 的 C-03 實測 slim 0.8 就誤報，2026-10-31 用 slim 0.6／0.8／1.05 重新校準成 6.5 %（契約 §8）。
9. **「換風格」可不可以改 `shared/template/kit/look.json`**：04 §6 建議可以（和 `brand.css` 同一層）；AGENTS.md 規則 1 的例外清單現在沒有它。兩個版本的原文在 docs.md §1.5。
