---
description: "006 look（講者調光＋瘦臉）的實作工作清單"
---

# Tasks: 006 look

**Input**：`specs/006-look/spec.md`、`plan.md`、`docs.md`、`specs/contracts/look.md`（下稱「契約」）、`specs/contracts/cli-006.md`（下稱「cli 契約」）

**Tests**：spec 有要求（FR-051），每個實作工作前先寫會失敗的測試。

## Format: `[ID] [P?] [Story] 說明`

- **[P]**：可以同時做（不同檔案、沒有前後依賴）
- **[US1]**～**[US4]**：對到 spec 的 User Story（US1 調光、US2 瘦臉、US3 剪輯台、US4 資產）
- 指令都在工作區根目錄執行；`<AN>`＝`/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/analysis`（04 報告與原型；scratchpad 會被清掉，T001、T003 要先做）；`<SP>`＝同一個 scratchpad 的 `w006/`
- `<T>`＝`shared/template`；`<TL>`＝`shared/template/tools`
- **擋住的工作**標「⛔ 等 00N」：別的工作線還沒交付之前不能驗收（可以先寫，不能勾）

---

## Phase 1：Setup（資產與設定檔）

- [x] T001 [US1] 複製 `<AN>/look-preview/jianying-smartcolor-fit-face.cube` → `<T>/kit/look/jianying-smart.cube`（逐位元組，不改內容）。驗：`shasum -a 256` ＝ `56969a5a84ace8157a8669044f32a23c99c53284477464dab7292a81198d2b6f`、132,760 B、第 2 行 `LUT_3D_SIZE 17`。scratchpad 已經沒了 → 停下來回報（不要自己重算 LUT）。
- [x] T002 [P] [US1] 寫 `<T>/kit/look.json`（契約 §2.1 原文：`color 0.8`、`slim 0.6`、`lut "look/jianying-smart.cube"`）。驗：`node -e "console.log(JSON.parse(require('fs').readFileSync('shared/template/kit/look.json','utf8')))"` 印出 3 個鍵。
- [x] T003 [US4] ⛔ 等主代理裁決第 1、2 條。**進 git**：從 `<AN>/npm-tv/node_modules/@mediapipe/tasks-vision/` 複製 `vision_bundle.mjs`、`wasm/vision_wasm_internal.js`、`wasm/vision_wasm_internal.wasm`，從 `<AN>/models/` 複製 `face_landmarker.task`，放到 `<T>/vendor/mediapipe/` 同名路徑；**下載**：只放 manifest 等 3 個說明檔，資產等 T031。兩種都要寫 `manifest.json`（plan §3.2，sha256 填全 64 位）、`LICENSE`（Apache-2.0 全文）、`README.md`。驗：4 個檔的 size 與 sha256 和 spec FR-020 表一致；合計 18,715,722 B。
- [x] T004 [P] [US4] `NOTICE.md` 加 MediaPipe 段（docs.md §6 原文）。⛔ 模型授權那一句等裁決第 2 條。驗：`grep -n "MediaPipe" NOTICE.md` 有一段、含 `Apache-2.0` 與 `vendor/mediapipe/LICENSE`。

---

## Phase 2：Foundational（擋住後面所有 User Story）

### 測試先行

- [x] T010 寫 `dev/tests/look.test.mjs` 的純函式部分（plan §5.2 的「設定」「LUT」「變形」「軌跡」「快取」「ensureLook」六組；`FACE58` 照 plan §5.1 貼上）。驗：全部失敗在「找不到匯出」，不是語法錯。

### `<TL>/lib/ff.mjs`

- [x] T011 加 `filterPath()`、`lut3dFilter()`；`encodeFootage()` 收 `lut`，`-vf` 改陣列組合（plan §2.2）。驗：T010「LUT」組的 `filterPath`、參數陣列、含冒號／空白／中文資料夾實跑 lut3d 的測試綠；`dev/tests/` 現有測試不改仍綠（沒有 lut 時參數逐字不變）。

### `<TL>/lib/look.mjs`

- [x] T012 常數（契約 §8 全部，`POINTS` 58 點照契約 §5.1）、`readKitLook`、`validateLook`（每則訊息照契約 §2.2 原文）、`resolveLook`。驗：T010「設定」組綠。
- [x] T013 `parseCube`、`blendCube`、`cubeText`、`ensureBlendedLut`（寫 `work/.look/lut-<m>.cube`，m 四捨五入到 0.01；同 m 已存在且 sha 對就不重寫）。驗：T010「LUT」組的混合 m＝0／0.5／1／1.25 與來回一致綠；`ffmpeg … lut3d` 對灰 128 的輸出和 Node 算的差 ≤ 1（8-bit）。
- [x] T014 `faceWidth`、`yawOf`、`controlPoints`、`field`、`warpPlane`（YUV、`scale`）、`maxDisp`，從 `<AN>/scripts/warp.mjs` 移植（plan D3）。驗：spec FR-014 五條綠；FACE58 放在 (480, 300)、s 0.6：`maxDisp ÷ faceWidth` ＝ 0.0273 ± 0.0005；Y 平面和原型 rgb 版的灰階結果逐像素差 ≤ 1。
- [x] T015 [P] `smoothTrack`、`rampWeights`、`interpolateEvery2`、`loadTrack`（契約 §6.3）。驗：T010「軌跡」組綠（常數軌跡不變、單格跳動被壓到 ≤ 1/3、5 格淡入淡出、`i: 1` 內插）。
- [x] T016 [P] `statePaths`、`readState`、`writeState`（tmp＋rename＋Windows 重試 5 × 300 ms）、`landmarksFresh`、`footageFresh`、`staleReason`、`assetsStatus`、`estimateMinutes`（契約 §5.2–5.3、§8）。驗：T010「快取」組綠；`staleReason` 的回傳順序和契約 §5.3 表一致。
- [x] T017 `ensureLook`、`lookCheck`（契約 §3.1 七列 × `strict` true／false、§3.3）。驗：T010「ensureLook」組綠；每列的 `report` 原文和契約一字不差。

**Checkpoint**：`node --test dev/tests/look.test.mjs` 純函式部分全綠。通知 002（可以 import `ensureLook`、`lookCheck`、`validateLook`，spec「請 002 加」1–3 條）、005（`lut` 參數已在 `encodeFootage`，「請 005 加」）、004（「請 004 加」）。

---

## Phase 3：User Story 1 － 成片自動調光（P1）🎯 MVP

**Goal**：沒有 MediaPipe、沒有 Chrome 也能調光。
**Independent Test**：spec US1。

- [x] T020 [US1] `<TL>/look.mjs` 骨架：`--help`（cli 契約 §0 原文）、參數解析、找專案、`status`（cli 契約 §4，先做只有調光的那幾種狀態）、`clear`（cli 契約 §5.1）。驗：plan §5.2「CLI」組的 `--help`、壞參數（退出碼 2）、`status`、`clear` 綠。
- [ ] T021 [US1] ⛔ 等 002（build 接線）、005（`encodeFootagePolished` 的 `lut`）。`projects/範例` 寫 `"look": { "slim": 0 }` 跑 build。驗：build 印契約 §3.2 的調光行；`work/hyperframes/.cache/footage-audio.json` 的 `key.look` 有 `color 0.8`、`lut` 12 碼、`slim 0`；`assets/rough.mp4` 中間一格和「ffmpeg `lut3d`（同一個混合 LUT）＋同一組 x264 參數」的輸出比 ΔE76 平均 ≤ 0.2（SC-001 後半，審查 C-04 改寫）。測完把 `look` 拿掉。
- [ ] T022 [US1] 量 SC-003：同一支 1080p 片，`color 0` 和 `color 0.8` 各 build 一次，比 `encodeFootage` 的時間（build 印的秒數）。驗：每分鐘多 ≤ 10 s；數字寫進 `specs/006-look/research.md`「調光成本」。
- [ ] T023 [P] [US1] ⛔ 等 004。`qc.mjs framing --cards` 在 `color 0.8` 時看到調好的畫面。驗：`work/構圖預覽-套卡.jpg` 中間那格和 `color 0` 版本的平均亮度差 ≥ 2（8-bit），印 `look.report`。

**Checkpoint**：US1 可以單獨交付（`slim: 0` 時整條流程不碰 Chrome 與 MediaPipe）。

---

## Phase 4：User Story 4 － 資產可驗證、可補（P2）

- [x] T030 [US4] `look.mjs ensure`（檢查：每個檔 size＋sha256；cli 契約 §5.2 的每行原文）。驗：plan §5.2「CLI」組 `ensure` 綠；把一個檔改名 → 印 ✖ 與 → 那一行、退出碼 1。
- [x] T031 [US4] `look.mjs ensure --download`（cli 契約 §5.2：Node 內建 `fetch` 下載到 `<T>/vendor/mediapipe/<檔>.download` → sha256 對了才 rename；不對就刪掉 `.download`、印 ✖）。驗：look.test 用本機假來源 server（`http.createServer`）測成功、sha 不符、404 三種；**不連外網**。
- [x] T032 [P] [US4] 資產一致性測試（plan §5.2「資產」：manifest 的 size／sha256 和實檔一致；進 git 時必跑，下載版沒有檔就略過）。驗：`node --test dev/tests/look.test.mjs` 該組綠。

---

## Phase 5：User Story 2 － 瘦臉 bake 進底片（P2）

**Goal**：`look.mjs run` 產生 `work/face-landmarks.json` 與 `work/rough-look.mp4`，build 用它。
**Independent Test**：spec US2。

- [x] T040 [US2] ⛔ 等 003（`launchChrome`、`cdpClient` 匯出）。`<TL>/lib/landmarks.mjs`：本機 server、`PAGE_HTML`、Chrome 啟動、`__lmReady` 輪詢、結果回收、逾時、收尾（plan §2.4 步驟 1–6）。驗：plan §5.2「偵測」組：示範口播前 3 秒偵測率 ≥ 95 %、臉寬 35–55 px（沒有 Chrome 或資產 → 略過並印原因）。
- [x] T041 [US2] 找臉 `locateFaces`（12 個時間點、多尺度格子 0.4H／0.8H／全畫面）、ROI 追蹤、取最大臉、全黑格跳過（契約 §6.2-5／6）。驗：左右並排兩張臉的合成圖取到大的那張；全黑格記 0、不送進 MediaPipe。
- [x] T042 [US2] `detectLandmarks` 收尾：`--every 2` 內插、座標換回 rough.mp4 像素、summary、寫 `work/face-landmarks.json`（tmp＋rename）。驗：檔案格式和契約 §5.1 一致（look.test 用 schema 檢查）；每格約 0.8 KB（04：58 點子集）。
- [x] T043 [US2] `renderLookFootage`（plan §2.5：YUV pipe、D2 長邊上限 2560、音軌 copy、背壓、長度檢查、失敗清理）。驗：plan §5.2「管線」組：testsrc 2 秒＋假 landmark → 解析度、格數、音軌、長度、ROI 外 Y 平面逐位元組相同、直線位移方向對；3840 寬的片輸出 2560 寬。
- [x] T044 [US2] `look.mjs run`（前景）：cli 契約 §2 的每一行、鎖、`work/.look/run.log`、`state.run` 進度。驗：「CLI」組的鎖測試；`projects/範例` 跑完 ≤ 30 s、印「臉太小，略過瘦臉」⚠（SC-001 前半）。
- [x] T045 [US2] `--background` 與 `status` 的「執行」行（cli 契約 §2.4、§4）。驗：背景跑的時候 `status` 印進度與預估剩下的分鐘數；跑完印 `lookNextStep()` 的兩行（`→ 下一步：<說明>`＋單獨一行的指令；契約 §3.5）；每種狀態只有一行「→ 下一步」（SC-007）。
- [x] T046 [US2] `lookPreview` 與 `look.mjs preview`（plan §2.6：1680×2410、6 列 × 3 欄、印的行、⚠ 條件）。驗：「preview」組綠；偵測率 90 % 的假資料印 ⚠。
- [ ] T047 [US2] 校正 yaw：在示範口播與一支 4K 側身片段印 `yawOf` 的分布（p50／p95／max），確認 `YAW_HALF` 0.35 只擋到明顯側臉。驗：分布表寫進 `research.md`「yaw 分布」；若要改常數，先回報主代理（契約 §8 是單一真相）。
- [ ] T048 [US2] 效能校正：4K 20 秒片段（SC-004）與 10 分鐘預估（SC-005）；比較網格步距 4／8 px、`DETECT_W` 960／1280、`LOOK_MAX_SIDE` 2560／不縮。驗：SC-004 正臉格（|yaw| < 0.1）位移 95 百分位 2.7 % ± 0.3 %（審查 C-15 改寫）；SC-005 時間；結果與建議寫進 `research.md`「效能」，要改的常數回報主代理後改契約 §8。
- [ ] T049 [US2] 全片偵測精度（SC-002）：示範口播全片 `detectLandmarks`（不經略過），和 `<AN>` 的 Python 版 `lm_full.npz` 比下顎 21 點。驗：偵測率 ≥ 99 %、平均差 ≤ 臉寬 0.5 %；`<AN>` 已清掉 → 只驗偵測率並註明。
- [ ] T050 [US2] ⛔ 等 002。build 整合：`slim 0.6` 的 4K 片段 `look.mjs run` → build。驗：build 印契約 §3.2 的「瘦臉」行、`footage-audio.json` 的 `key.look.footage` 有 rough-look 的 size／mtime；只改 `slim` → build 印 ✖「瘦臉底片過期」與 → `look.mjs run`（D4）。
- [ ] T051 [US2] Windows 實機（plan §4 檢查表每一列）。驗：Windows 10／11 各跑一次 `look.mjs run --background` → `status` → build；結果寫進 `research.md`「Windows」。

**Checkpoint**：US1＋US2＋US4 可以交付；`dev/loop` 的弱模型試跑走過一次「剪乾淨 → look.mjs run → 構圖預覽」沒有卡住。

---

## Phase 6：User Story 3 － 剪輯台「講者」面板（P3）

**Goal**：調光即時、瘦臉單格前後對照、存 `plan.look`。
**Independent Test**：spec US3。

- [x] T060 [US3] 寫 `dev/tests/editor.test.mjs` 新增的測試（plan §5.3）。驗：新測試失敗、舊測試仍綠。
- [x] T061 [P] [US3] `<TL>/editor/model.mjs`：`LOOK_CSS`、`lookCss()`（契約 §7.4）。驗：T060 的 `lookCss` 數字綠。
- [x] T062 [P] [US3] `<TL>/editor/server/write.mjs`：`bodyKeys` 加 `look`、`sanitizeLook`、`surgicalText` 的 `look` 操作（plan §2.8）。驗：T060 的存檔（插入、取代、刪除、CRLF、被擋、`false` → 物件）綠；存完 `plan.json` 其他位元組不變。
- [x] T063 [US3] `<TL>/editor.mjs`：`getState` 的 `look`、`/api/look/face`（`faceImage` 與 ctx 快取）、`reportKey` 加兩個 stat、`doBuild` 先跑 `look.mjs run`（`lookNeedsRun`）。驗：T060 的 `/api/state`、`/api/look/face`、`lookNeedsRun` 綠。
- [x] T064 [US3] `<TL>/editor/app.js`：「講者」節、滑桿與開關、`snapshot`／`dirtySnap` 加 `look`、存檔帶 `look`、臉部圖更新時機（plan §2.8）。驗：瀏覽器手動：拖調光滑桿 → 畫面下一格就變、不打 API（DevTools Network 沒有請求，SC-006 前半）；改了沒存 → 「未儲存」亮。
- [x] T065 [P] [US3] `<TL>/editor/preview.js`：`#simVideo` 與子母畫面 canvas 套 `A.lookCss`。驗：子母畫面小窗跟大畫面同色（截圖比對兩處臉部平均色差 ≤ 3）。
- [x] T066 [P] [US3] `<TL>/editor/editor.css`、`editor/index.html`：`.look-faces`、說明一行。驗：面板 180×180 兩張並排、標「前／後」。
- [x] T067 [US3] `<TL>/editor/timeline.js`：`voiceUncovered[]` 主軌紅色斜線、`uncovered[]` 動畫軌灰色斜線、狀態列「⚠ N 段只有聲音、沒被素材蓋住」（FR-046；check-json §2.1）。驗：合成專案（有聲音檔、沒有 media）主軌出現斜線；002 還沒交付 → 這條留著，FR-046 標「依賴 002」。
- [ ] T068 [US3] 效能：示範口播 `/api/look/face` 連續 20 次的 p50（SC-006）、4K 第一次。驗：p50 ≤ 300 ms、4K 第一次 ≤ 600 ms，寫進 `research.md`「剪輯台」。

---

## Phase 7：Polish 與交接

- [ ] T070 交 001：`docs.md` §1–§5 併進 AGENTS.md、USAGE.md、style.md、EDITOR.md、setup（001 擁有那些檔）。驗：001 回報併好；`grep -n "look.mjs" AGENTS.md shared/template/USAGE.md shared/template/EDITOR.md` 都有。
- [ ] T071 交 007：`dev/check-all.mjs` 加 look（spec「請 007 加」）。驗：沒有 Chrome 的環境 check-all 顯示「略過」不是 ✖。
- [ ] T072 全部測試：`node --test dev/tests/*.test.mjs`。驗：全綠（SC-008）；沒有 Chrome 時 landmark 組顯示 skip 與原因。
- [ ] T073 `projects/範例` 整條：剪乾淨產物 → `look.mjs run` → `look.mjs preview` → 構圖預覽 → build → `qc.mjs final`。驗：qc 沒有新的 ✖；把每一步印的行貼進 `research.md`「端到端」。
- [ ] T074 回頭對規格：契約 §8 的常數若被 T047／T048 改過，spec、plan、docs.md、style.md 新節的數字一起對（docs.test 會擋 style.md）。驗：`grep -rn "0\.35\|2560\|1280" specs/006-look specs/contracts/look.md` 的值一致。

### 審查 r1-C（`dev/loop/review-r1-C.md`）的回應，2026-10-31

- [x] R01 C-01（P1）`lib/look.mjs` 新增 `lookNextStep({ projectDir, plan, templateDir }) → { step, done, note, cmd }`（契約 §3.5）；`look.mjs status`／`run` 的最後兩行都用它：look run（> 2 分帶 `--background`）→ 構圖預覽 → 停點 ②，plan.json 沒有段落時不叫人 build。spec「請 002 加」寫了 status.mjs 改呼叫它。驗：look.test「lookNextStep」九種狀態；`projects/範例` 的 status。
- [x] R02 C-02（P1）「→ 下一步：<說明>」＋單獨一行的指令；build 的 ✖、還在跑的 ⚠、已經在跑、背景啟動、ensure 的 ✖ 都把指令放到 `→` 後面的行尾（預估移到括號裡、`→` 前面）。驗：look.test 的 `bareCmd` 檢查每一種狀態的指令。
- [x] R03 C-03（P1）`DISP_WARN` 5 % → 6.5 %（仍看每格位移比的 95 百分位）。校準用三個 slim 值 0.6／0.8／1.05（0.6、0.8 不 ⚠，1.05 ⚠）；量法比較見契約 §8（換成整支臉寬中位數當分母只差 0.1 %，因為轉頭的格是位移本身變大）。驗：look.test「位移 ⚠」（邊界、正臉 1.2 也不到門檻）＋「位移 ⚠ 校準」（示範口播 15–25 秒真的偵測：3.70／5.19／7.34 %）。
- [x] R04 C-04 SC-001 改成和「ffmpeg lut3d＋同一組 x264」比 ΔE76 ≤ 0.2（只改規格；量測留給 T021）。
- [x] R05 C-05 `renderLookFootage` 逐格算位移統計（`dispSummary`），存進 `state.footage`（`warped`、`medianDisp`、`maxDispAt`、`dispP95Ratio`）；preview 在底片最新時直接用，否則抽樣並印「抽樣 N 格」。驗：look.test「對照圖的位移數字」。
- [x] R06 C-06 第 7 列與 `--background` 的預估看 landmark 快取；`runBackground` 改用 `modelSha(templateDir)`。驗：look.test「lookNextStep」只改 slim 時預估 1 分、不帶 `--background`。
- [x] R07 C-07 參數錯誤照 cli-006 §1 新原文（`→ 看用法：node … --help`）；kit/look.json、`.cube` 解析、ffprobe、抽格、JPEG、preview、ensure、背景啟動的 ✖ 都補 → 改法。驗：look.test「CLI」逐字比對 4 則。
- [x] R08 C-08 契約 look.md §3.2、§5.1 與 cli-006 §2.1、§2.2、§3.2、§4.1 補 `noface` 原文；USAGE §4.1 的舊範例寫進 spec「請 001 加」。
- [x] R09 C-09 剪輯台「講者」：`slimOk === false` 時依 `reason`（small／noface／rate）只印一行原因、不放前後對照；拿到圖才顯示那一格（不留破圖示）。驗：讀碼＋editor.test 原有的 face API 測試（UI 沒有自動測試）。
- [x] R10 C-10 `surgicalText` 刪 `look` 時吃「前一個值後面的 `,`＋空白」到 look 結尾，look 後面的換行留給下一個鍵。驗：editor.test「講者」加一行寫好幾個鍵的 plan.json，恢復預設後和原文逐字相同。
- [x] R11 C-11 rough-look 驗收改比畫面軌：`nb_frames` ＝ 送進編碼器的格數，畫面軌長度和 rough.mp4 的畫面軌差 ≤ 1 格。驗：look.test「底片管線」照樣通過（掉格的情況沒有測試：無法穩定造出來）。
- [ ] R12 C-12 **沒修**：003 的 `lib/audit-browser.mjs` 還沒 export `launchChrome`／`cdpClient`（2026-10-31 `grep -n "^export" lib/audit-browser.mjs` 沒有這兩個）；import 不到就只能留複本。003 加 export 後：`landmarks.mjs` 改 import、刪掉 `:109-155` 的複本（spec「請 003 加」已列）。
- [x] R13 C-13 `openDetector` 開新的 profile 之前，清掉 `os.tmpdir()` 裡超過 1 天的 `look-lm-*`（`sweepStaleProfiles`）；沒有另外註冊 SIGINT（會改掉 Ctrl+C 的預設行為）。驗：look.test「Chrome 暫存 profile」。
- [~] R14 C-14 **部分**：`lookCheck()` 第 7 列的 warning 加前綴「build 會停下來：」；沒有改成 ✖，因為 `--check` 的 errors／warnings 分類在 002 的 `build.mjs`（不是 006 的檔），而且改成 ✖ 時，其他工作線沒寫 `look` 的 fixture（預設 kit slim 0.6、有 rough.mp4、有 Chrome）跑 `--check` 可能從 ⚠ 變 ✖，要 002 一起調（未逐一驗證）。要不要算 ✖ 寫進 spec「請 002 加」由 002 決定。
- [x] R15 C-15 SC-004 改成看正臉格（|yaw| < 0.1）的 95 百分位：合成 4K 2.79 %、示範口播 2× 2.84–2.85 %（在 2.7 ± 0.3 % 裡）。
- [x] R16 C-16 刪掉 `look.mjs` 沒作用的 replace、`void pidAlive; void fileSha256;`、沒用到的 `posix`／`r2`，`lib/look.mjs` 的 `rel`＋`void rel`。
- 另外：`look.mjs status` 改成只讀（不再呼叫 `ensureLook`，不會在專案的 `work/.look/` 寫混合 LUT）；契約 §8 的預估公式從「17 ÷ every」改成實際用的 26。

---

## Dependencies & Execution Order

| 工作 | 依賴 | 擋住 |
|---|---|---|
| Phase 1 | T003、T004 等裁決 1、2 | T030–T032、T040 以後 |
| Phase 2 | T001、T002 | 所有 User Story |
| US1（T020–T023） | Phase 2；T021 等 002＋005；T023 等 004 | — |
| US4（T030–T032） | T003 | T040 |
| US2（T040–T051） | Phase 2、US4；T040 等 003；T050 等 002 | T063 的 `faceImage` 用到 T014、T015 |
| US3（T060–T068） | Phase 2；T063 要 T043 前的函式；T067 等 002 的 check-json | — |
| Polish | 全部 | — |

**其他工作線**（spec「請 00N 加」）：002 的 build／plan／check 接線擋 T021、T050；005 的 `audio.mjs` 擋 T021；003 的匯出擋 T040；004 的 qc 擋 T023；001 擋 T070；007 擋 T071。

### Parallel Opportunities

- T001／T002 與 T003／T004 同時。
- T015、T016 和 T014 同時（不同函式群，但同一個檔：用一個人照順序寫，或先各自在 `<SP>` 寫好再合併）。
- US1 與 US4 可以同時；US3 的 T061、T062、T065、T066 互不相關。
- 只有一個實作者時照 Phase 順序：1 → 2 → US1（MVP，可以先交）→ US4 → US2 → US3 → Polish。

## Implementation Strategy

1. **MVP＝US1**：Phase 1 的 T001、T002 ＋ Phase 2 ＋ US1。這時 `slim` 一律當 0（`ensureLook` 回「沒有資產，略過瘦臉」的 ⚠），已經可以交付調光。
2. **加瘦臉**：等裁決 1、2 → T003 → US4 → US2。
3. **剪輯台最後**：US3 依賴前面的函式，也最需要人工看。
4. 每個 Checkpoint 跑 `node --test dev/tests/look.test.mjs dev/tests/editor.test.mjs`，回報時附輸出（AGENTS.md 規則 6）。
