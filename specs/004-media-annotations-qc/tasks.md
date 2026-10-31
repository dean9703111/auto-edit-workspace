---
description: "004 media-annotations-qc 的實作工作清單"
---

# Tasks: 004 media-annotations-qc

**Input**：`specs/004-media-annotations-qc/spec.md`、`plan.md`、`specs/contracts/media.md`、`specs/contracts/cli-004.md`

**Tests**：spec 有要求（FR-060～FR-063），每個實作工作前先寫會失敗的測試。

## Format: `[ID] [P?] [Story] 說明`

- **[P]**：可以同時做（不同檔案、沒有前後依賴）
- **[US1]**～**[US6]**：對到 spec 的 User Story
- 指令都在工作區根目錄執行；`<SP>`＝`/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/w004`
- 「驗」那一欄是完成判準；Chrome 案例在沒有 HyperFrames Chrome 的機器上要顯示 skip，不能 fail

**和 002 的接點**（002 沒做完之前，004 的工作照樣能做完並測試）：

| 接點 | 002 做之前 | 002 做之後（T080） |
|---|---|---|
| `validateMedia` 由 `plan.mjs` 呼叫 | `resolveMedia = validateMedia` 別名，`plan.mjs` 照舊呼叫，標註照樣算、照樣畫；`--check` 報告暫時看不到標註摘要 | 002 改呼叫 `validateMedia(…, { icons, steps })`、印 `summary` |
| STEP 編號全片累加 | 沒傳 `steps` 時每段各自從 1 編（契約 media §4.1「ctx.steps 省略」） | 全片累加 |
| `MEDIA_FIELDS` | `lib/media.mjs` 新增一份，`build.mjs` 舊的一份照用 | 002 刪舊的、改 import |
| `items[].out`、`planHash` | storyboard／observe 用 `start`／`end`＋`roughToFinal` 推算、每段一張（契約 cli-004 §2.2 過渡列、media §8-3），planHash 缺時比 mtime 只 ⚠（cli-004 §2.1） | 用 `out`、比 `planHash` |

---

## Phase 1：Setup

- [x] T001 建 `specs/004-media-annotations-qc/research.md`：三節「實測紀錄」（表頭：日期｜機器｜指令｜張數／長度｜秒數）、「門檻調整」（靜止 diff、裝飾占比、callout 寬估算誤差）、「弱模型試跑」（SC-006）。驗：檔案存在、三個標題都在。
- [x] T002 [P] `dev/tests/helpers.mjs` 加 `hasChrome()`（plan P6；只新增，不改既有函式）。驗：`node -e "import('./dev/tests/helpers.mjs').then(m=>console.log(!!m.hasChrome()))"` 本機印 `true`。
- [x] T003 [P] 在 `<SP>/fixtures/` 用 ffmpeg 做測試素材（只給手動驗證用，測試本身現做）：`still22.mp4`（22 s，0–6 s 彩條、6–16 s 靜止、16–22 s 彩條，1920×1080 30fps，有 1 kHz 音軌）、`rec2560.mp4`（2560×1600、10 s、testsrc2）。驗：`ffprobe` 解析度與長度。

---

## Phase 2：Foundational（擋住 US1、US2）

### 測試先行

- [x] T010 `dev/tests/media.test.mjs` 新增：幾何例題 3 組（契約 media §1.3）、`toStage`、`toScreen`、`textPx`、`cardWidth`（「打開 API 設定」有圖示＝414）。驗：新測試失敗（函式還沒匯出），舊 15 個案例仍綠。

### `tools/lib/media.mjs`

- [x] T011 加 plan P1.1 常數、`MEDIA_KEYS` 4 個鍵、`MEDIA_FIELDS`（契約 media §5 原文，含 marks 改寫與 4 列新列；從 `build.mjs:215-229` 複製後修改，`build.mjs` 不動）。驗：`node -e` 印 `MEDIA_FIELDS.length`＝原本列數＋4。
- [x] T012 抽出 `mediaGeometry`、`toStage`、`toScreen`、`textPx`、`cardWidth`（plan P1.4），`resolveMedia` 內改呼叫它們。驗：T010 綠；舊 15 個案例綠；範例專案 `build.mjs --check` 輸出與改前 `diff` 為空（改前輸出先存 `<SP>/check-before.txt`）。
- [x] T013 `checkMediaSeg`：7 個陣列欄位檢查、`kenburns` 預設與 ⚠ K1、回傳 `hasAnn`（plan P1.3）。驗：新增案例「image 段有 callouts 不寫 kenburns → 沒有慢推那一行」「寫 kenburns: true → ⚠ K1 原文」。
- [x] T014 `validateMedia` 骨架：`resolveMedia` 改名、保留 `export const resolveMedia = validateMedia`、回傳 `{ summary, json }`（先只有 marks／lens 的資料）；`summary` 的 marks／lens 那幾行原文照 `plan.mjs:631` 現在印的。驗：舊案例綠；新案例 `validateMedia` 回傳值有 `summary` 陣列與 `json.marks`。

**Checkpoint**：`node --test dev/tests/media.test.mjs` 全綠；範例 `--check` 與改前逐字相同（FR-014）。

---

## Phase 3：User Story 1 － callouts、spot、steps（P1）🎯 MVP

**Goal**：錄影段能寫說明卡、聚光燈、STEP 膠囊，位置與時間由工具算。
**Independent Test**：spec US1 驗收情境 1–6。

### 測試先行

- [x] T020 [US1] `media.test.mjs`：`placeCallout` 例題（契約 media §2.3 的 2560×1600 例：right ✖、left 放得下，卡片右緣 1142.75 → 整數）、四邊都放不下、指定 side 失敗的建議；C1–C12、S1–S3、T1–T6 每則觸發一次比對原文（契約 media §3）；兩段相接 STEP 的編號與接續（契約 media §2.5 例）。驗：全部失敗（尚未實作）。
- [x] T021 [P] [US1] `media.test.mjs`：build 一個假專案（現有測試的 `makeProject` 寫法；2560×1600 testsrc2 錄影），callouts 一般與 quick、spot、steps 各一，`index.html` regex 比對契約 media §6 的 DOM 與時間軸行（逐字）；沒有標註的段不含 `mann`／`mcards`（FR-014）。驗：失敗。

### 實作

- [x] T022 [US1] `placeCallout`（plan P1.5，含引線直線／直角）。驗：T020 的 placeCallout 案例綠。
- [x] T023 [US1] `newStepState` 與 steps 解析、編號、接續、膠囊矩形（plan P1.7）；validateMedia 步 6。驗：T020 的 T1–T5 與編號案例綠。
- [x] T024 [US1] validateMedia 步 7–8、10、12（callouts、紅框總數 C9、spot、膠囊碰撞 T6）。驗：T020 全綠。
- [x] T025 [US1] `mediaParts`：`svg.mann`（spot、callout 框、引線）、`div.mcards`（膠囊、卡片），時間軸行，`--test` 的 `off`／`lim`（plan P1.9）。驗：T021 綠。
- [x] T026 [P] [US1] `kit/media.css`：契約 media §6 CSS 表的類別（plan P2）。驗：`grep -c "^\.mcard\|^\.mstep\|^\.mspot\|^\.mcbox\|^\.mclead\|^\.marrow" shared/template/kit/media.css` ≥ 6；T021 build 出的 `index.html` 用 `npx hyperframes snapshot --at <ready>` 截圖（**只在 `<SP>` 的假專案裡跑**），目視卡片、引線、膠囊位置與契約例題一致，截圖存 `<SP>/us1/`。
- [x] T027 [US1] validateMedia 步 13：`summary` 加 callouts／spot／steps 行、`json` 加對應陣列（契約 media §4.1、§7）。驗：新案例比對 `summary` 原文與 `json.callouts[0]` 的 `{ i, at, until, ready, side }`。

**Checkpoint**：US1 情境 1–6 在假專案通過；`node --test dev/tests/media.test.mjs` 全綠。

---

## Phase 4：User Story 2 － arrows、marks.path（P2）

**Goal**：箭頭指小目標、紅框跟著捲動。
**Independent Test**：spec US2 驗收情境 1–5。

- [x] T030 [US2] `media.test.mjs`：`placeArrow`（箭尖離 P 的距離＝9、ne 出畫改 nw、四周全擋 → null、紅框線環擋住改方向）、R1–R8、P1–P5、X1 原文；path 的 `attr` tween 行逐字（契約 media §6）。驗：失敗。
- [x] T031 [US2] `placeArrow`（plan P1.6）。驗：T030 placeArrow 案例綠；契約例題 to [600,900] ne → tip [566.86, 522.39]（兩位小數，最後存整數 567, 522）。
- [x] T032 [US2] validateMedia 步 4（path 解析）、步 9（path 終點 ⚠）、步 11（arrows）。驗：T030 R、P 案例綠。
- [x] T033 [US2] `mediaParts`：箭頭 `g.marrow`、path 的時間軸行；`kit/media.css` 加 `.marrow`。驗：T030 tween 行綠；`<SP>/us2/` 截圖目視箭尖不壓字。
- [x] T034 [US2] `summary`／`json` 加 arrows 與 `marks[].path`（`k` 索引）。驗：新案例比對原文。

**Checkpoint**：`node --test dev/tests/media.test.mjs` 全綠；契約 media §3 每一則訊息都有測試觸發（FR-013：一個集合案例逐則檢查含 `→`，R7、R8 除外）。

---

## Phase 5：User Story 3 － `qc.mjs storyboard`（P1）

**Goal**：分鏡表截圖一個指令。
**Independent Test**：spec US3 驗收情境 1–5。

- [x] T040 [P] [US3] `dev/tests/qc.test.mjs`：`shotPlan` 純函式案例（一般段 `out.end − 0.6`；條列 3 條；條列間隔 0.3 合併規則；media 4 個標註含 < 0.3 s 併張；段長 0.5 s 的下限；檔名 `s04-1.png`）；三種前提 ✖ 原文（cli-004 §2.5）。驗：失敗。
- [x] T041 [US3] `qc.mjs`：`checkJsonOf` 拆出（`expectedFromBuild` 回傳不變）、`shotPlan`、`storyboardRun`、`printStoryboard`、`--help`、`VALUE_FLAGS`（plan P4）。驗：T040 綠；舊 qc 測試綠。
- [x] T042 [US3] `qc.test.mjs`（需要 Chrome＋`npx hyperframes`，否則 skip）：假專案 build 後跑 storyboard，`work/storyboard-preview/` 的檔名集合＝`shotPlan` 的 `file` 集合、stdout 有 `![s01](storyboard-preview/s01.png)`、`.storyboard-shots/` 已刪。驗：綠或 skip。
- [ ] T043 [US3] 範例專案實測（`projects/範例` 的 build 已存在時；**不跑 build**，沒有就記「未測」）：張數、秒數寫進 research.md「實測紀錄」。驗：FR-024 的 ≤ 60 s；超過就在 research.md 寫原因，不改門檻。

---

## Phase 6：User Story 4 － `qc.mjs observe`（P1）

**Goal**：交付前整片看一遍的總表、靜止區間、接縫條帶。
**Independent Test**：spec US4 驗收情境 1–6。

- [x] T045 [P] [US4] `qc.test.mjs`：`observeTimes`、`cellLabel`（`m:ss.s｜段 id｜字幕`、超長字幕兩行截斷）、`cuesToOut`（cuts 換算）、`staticRuns`（合成灰階序列中間 20 格相同 → 一個 10 s 區間）、`seamList`（合併 < 0.3 s、範圍 `[from+0.5, to−0.2]`、0 秒邊界）、`index.md` 的「在哪張」換算。驗：失敗。
- [x] T046 [US4] `qc.mjs`：observe 純函式、`observeRun`、`printObserve`、`--json`（plan P4）；`lib/raster.mjs` 的 `htmlShot`（plan P3）。驗：T045 綠。
- [x] T047 [US4] `qc.test.mjs`（需要 Chrome，否則 skip）：用 ffmpeg lavfi 現做 22 s 靜止測試片（同 T003）跑 observe：`sheet-01.jpg` 尺寸（契約 cli-004 §3.2）、靜止區間 6.0–16.0 ±0.5、`index.md` 表格列、事先放的 `work/觀影/notes.txt` 保留（FR-034）、沒有 `rough.srt` ⚠ 且結束碼 0（FR-035）。驗：綠或 skip。
- [ ] T048 [US4] 範例 `成片/final.mp4` 實測（有才測，不 render）：張數＝⌈長度 ÷ 24⌉、秒數、講者坐著時的相鄰差值分布（看 diff < 2.0 會不會誤報）寫進 research.md「門檻調整」。驗：SC-004；誤報 > 1 段時在 research.md 提新門檻給主代理，不自己改常數。

---

## Phase 7：User Story 5 － `brand.mjs bg --html`（P2）

**Goal**：不用生圖工具也能做背景圖，並自動檢查留空區。
**Independent Test**：spec US5 驗收情境 1–5。

- [x] T050 [P] [US5] `dev/tests/brand.test.mjs`：`injectHead`（有 `<head>`／沒有）、`decorRatio`（純色 0；1920×1080 中間一條 4 px 白線在 fs 主卡區 → 0.5–0.6 %）、`--out` 在 `shared/template/` 裡 ✖ 原文、`--kind xx` ✖ 原文、`--help` 含 `bg --html`。驗：失敗；現有 5 個案例綠。
- [x] T051 [US5] `brand.mjs`：`BG_KINDS`、`injectHead`、`decorRatio`、`renderBg`、`makePreview`、`bgCli`、`--help`（plan P5）。驗：T050 綠。
- [x] T052 [US5] `brand.test.mjs`（需要 Chrome，否則 skip）：三種 kind 各一張乾淨頁 → 尺寸 1920×1080／960×1080／1920×1080、✔；fs 加一條線的頁 → ⚠ 原文；三張到齊 `preview.jpg` 1600×720。輸出一律寫 `os.tmpdir()` 底下。驗：綠或 skip；`git status shared/template` 沒有變動。

---

## Phase 8：User Story 6 － framing 建議欄（P3）

- [x] T055 [P] [US6] `qc.test.mjs`：`suggestZoom` 兩組（一組 1.15 會切手勢 → 建議 1.00；一組都可以 → 建議 1.30）。驗：失敗。
- [x] T056 [US6] `qc.mjs`：`suggestZoom`、`printFraming` 加欄與「建議：」行、`--json` 加 `suggest`（cli-004 §4）。驗：T055 綠；現有 framing 測試只多欄位、原有行逐字不變（必要時舊測試只放寬表頭比對，記在 PR 說明）。

---

## Phase 9：文件與交接

- [ ] T060 [P] 確認 `docs.md` 每段原文和實作一致（數字、指令、訊息）；有出入改 docs.md 並通知 001。驗：`grep` 契約裡的每個數字在 docs.md 出現的地方相同。
- [ ] T061 `research.md` 補完 T043、T048 實測與 SC-006 弱模型試跑紀錄（Sonnet 只讀 U §5 與 `--check` 訊息、寫一個 callout＋一支 arrow、改錯 ≤ 2 輪）。驗：三節都有內容。
- [ ] T062 通知主代理：Phase 2 完成即可讓 002 開始 T080；Phase 5、6 完成後 007 可加進 `dev/check-all.mjs`。

---

## Phase 10：整合（002 做完它那邊之後）

- [x] T080 002 改完 `plan.mjs`（呼叫 `validateMedia`、`newStepState`、`formatReport` 用 `summary`、`jsonItems` 加 `out`、`planHash`）與 `build.mjs`（import `MEDIA_FIELDS`）後：跑 `node --test dev/tests/media.test.mjs dev/tests/qc.test.mjs` 與範例 `--check`、`--list`。驗：`--check` 報告看得到標註摘要；`--list` 輸出和 T011 新表一致；兩段相接的 STEP 編號全片累加。
- [x] T081 002 建好 `dev/tests/media-cli.test.mjs` 並通知後，從 `media.test.mjs` 刪掉測 `media.mjs main／scan／frame` 與 `--check --json` 的那幾個案例（只刪 002 已搬走的）。驗：兩支測試加起來的案例數不少於刪之前。
- [ ] T082 storyboard／observe 拿掉過渡行為（`start`／`end` 推算、mtime 比對）改用 `out`、`planHash`。驗：T042、T047 綠；cli-004 §2.1、§2.2 與 media §8-3 的過渡列刪掉（改契約要通知主代理）。

---

## 依賴與順序

```text
T001–T003 ─▶ T010–T014（Foundational）─┬─▶ US1：T020–T027 ─▶ US2：T030–T034
                                       │
T002 ──────────────────────────────────┼─▶ US3：T040–T043（只需要 T002、qc.mjs）
                                       ├─▶ US4：T045–T048（T046 的 htmlShot 給 US5 用）
                                       └─▶ US6：T055–T056
T046 ─▶ US5：T050–T052
全部 ─▶ T060–T062 ─▶（002 完成）T080–T082
```

- US3、US4、US6 只動 `qc.mjs`，彼此有同檔衝突：同一時間只有一個人改 `qc.mjs`（建議順序 US3 → US4 → US6）。
- US1／US2 只動 `lib/media.mjs`、`kit/media.css`、`media.test.mjs`，可以和 US3–US6 同時做。
- US5 只動 `brand.mjs`、`brand.test.mjs`，等 T046 的 `htmlShot` 進 `raster.mjs` 後就能做。

## 實作策略

1. MVP＝Phase 1–3（US1）＋Phase 5（US3）：錄影段能標註、分鏡截圖一個指令；這兩個直接減少主代理在停點 ③ 前的工具呼叫。
2. 接著 US4（交付前檢查）、US2、US5、US6。
3. 每個 Phase 結束跑 `node --test dev/tests/media.test.mjs dev/tests/qc.test.mjs dev/tests/brand.test.mjs`，全綠才進下一個。

## 第 2 輪（2026-10-31，dev/loop/feedback-r1-user.md F2、review-r1-B.md）

- [x] T090 B-01（P1）storyboard 完成態讀動畫時間軸（003 `openSession`＋頁面裡讀 `window.__timelines`）：最後一塊是退場就截退場前 0.1 秒、那一刻在動就往前退；條列「進場完成前就開始的併組」、每組在進場完成後截；讀不到時間軸照舊並 ⚠。驗：qc.test「完成態看時間軸」（03 側邊欄 9.8、fx 29 15.1、fx 34 整段在動、04a 三組）＋ e2e「03 側邊欄截在退場前、fx 29 截在數字停住時」（5.8、10.6）；範例 28 段讀時間軸 1.7 s，只有 s22（fx 04）從 2:13.3 改成 2:11.1。
- [x] T091 storyboard 同一段張數變了（`s20.png` ↔ `s20-1.png`…）自動清掉舊檔、印「清掉同一段的舊截圖」；plan 已經沒有的段照舊 ⚠。docs.md §12.1 交 001。
- [x] T092 F2：`pipCoverage`／`pipMissing`（該有小窗的段＝04 家族、layout fullscreen 的 custom、media，plan 沒寫 `pip: false`；小窗扣掉 rough 全黑；全黑用 `roughBlack`，舊版用 `voiceOnly`；有聲音素材不判）。storyboard 在 `ok` 之前 ✖、final 每段 ✖、observe 總表「小窗」欄＋⚠。驗：範例 storyboard／final 都印 s20、s21、s23 三則 ✖（cli-004 §8 原文）。
- [x] T093 B-06 qc.mjs、brand.mjs 的 ✖ 全部補「→ 改法」（參數錯誤、未知指令、--from／--to、--offset、--kind、--html、沒給色碼、色碼格式、ffmpeg 失敗）；cli-004 §3.4、§5.4、§6.1 同步。
- [x] T094 B-07 `rel()` 工作區外印絕對路徑；observe／storyboard 組路徑用 `path.join`。
- [x] T095 B-08 observe 有 `--offset` 時，起點在 offset 之前的段不標 id，印 ⚠ 給新的 `build --test` 起點。
- [x] T096 B-10 framing 全被排除時建議表上最小的那一列，文字和 cli-004 §4 對齊。
- [x] T097 B-09 SC-002 記成已知例外（spec.md）。
- [x] T098 docs.md §12（分鏡截圖清單、小窗、framing 建議）交 001。
- [x] T103 完成態不早於最後一個進場完成、不晚於被下一段不透明段蓋住前 0.1 秒；蓋住時還沒揭開 → ⚠（點名那個字、蓋住的段、建議的 from）。時間軸的遮罩揭開（maskUp、reveal）算進場。驗：qc.test 三個案例；範例現在的 plan（s03 keyAt #9@時間的免）key 16.98 揭開、截 17.73，snapshot 看得到「節省時間的免費工具」，沒有 ⚠。
- [x] T102 framing --cards 示意 build 被 002 的「文字對時」✖ 擋下（示意字幕「字幕會出現在這個位置」和 c1 key 共用「在這個位」）：示意字幕改成 `CARD_CAPTION`「這裡是字幕」（和每張示意卡沒有連續 2 字相同），失敗訊息只列 ✖、不列 ⚠。驗：範例 framing --cards 19 s 產出 構圖預覽-套卡.jpg（三倍率×三版面都有卡）；qc.test 加 bigram 檢查與 --zooms 1 的 e2e。002 加好 textSync:false 後再改用它。
- [x] T101 fx 完成態：catalog `done: "label"`（27 打字機）用 host `data-start` ＋ `labels.done`；沒有標記 ⚠。驗：qc.test e2e「27 打字機」截在 1.8–2.85 s（打完、未擦）；scratch 截圖看到「自動剪輯」四字完整。
- [x] T100 `lib/media.mjs` 的 `tAt`「不能寫絕對秒數」補 →，原文照 cli-005 §3.3（建議值＝寫的秒數 − 本段起點，負的給 "+3.2"）；media.test 加一則（from 7、at 10.2 → "+3.2"）。
- [x] T099 `--check --json` 有 ✖ 但有 items 時，observe 照樣標段 id（⚠ 僅供參考）：範例現在因 002 的 rough 全黑 ✖ 而 `ok: false`，否則總表會整片沒有段 id。

### 沒修、原因

| 條 | 原因 |
|---|---|
| SC-001 沒有 Chrome 的情況 | 要改名 ~/.cache 才能驗，審查員只讀權限做不到；`hasChrome()` 的 skip 路徑已有測試涵蓋 |
| T043、T048、T061 的實拍量測、SC-006 弱模型試跑 | 範例專案的 rough.mp4 目前是壞的（F2），等 002 的 verify-rough 重做初剪後再量 |

## 010 動態 v2 階段 B（2026-10-31，specs/010-motion-v2/design-system.md §4、§5、§10、§12、§16）

- [x] T110 暗色底圖三張：§10 的 mmx 指令同一個 prompt、seed 4242（fs 1920×1080、side 960×1080；ch 同 seed、光暈加強＋左下暖光），原檔尺寸就對，**新增** `shared/template/bg-{fs,side,ch}-dark.jpg`（亮色三張不動）。停點 ⑥ 的 preview.jpg／zones-*.jpg 在 scratchpad `w004/theme/`；留空區 ⚠：fs 9.0%（右上光暈落在主卡右上角，暗色主卡不透明蓋住）、side 3.0%、ch 1.9%（都是漸層光暈的邊，不是裝飾線）。build 依 theme 換底圖歸 002（`bgMap`）。
- [x] T111 brand.mjs 換主色同時算暗色 token：`--brand-text` 改成對 #0B1020 與暗色節點底 #1B1F26 都 ≥ 4.5；`darkTokens()` 算標題列（主色 92%＋黑 → 22%＋#15181E）、錯位底板（55%＋#121418）、節點底（20%＋#13161C）並印出；標題列白字 < 3（大字）→ ⚠。scene.css 的暗色 token 都是 `color-mix(var(--brand))`，不用寫檔；唯一寫死主色的是 `--v2-dust` 的 data URI（亮、暗各一處 #F6630F）→ 交 003 改成 mask＋`var(--brand)`。驗：brand.test 9 則。
- [x] T112 storyboard／observe 新拍點：頁面讀 tween 的 `data.role/fn`（003 kit）——`micro` 不算動畫；`slide`＝抽屜（進場）、`slideOut`＝退場、`grow`＝進場、`spot` 的 active 放大＝焦點抬起、其他 `focus` 角色＝`refocus`（不當退場）；`P.wipe` 的外擴 inset 也算揭開／擦掉；逐字取整句。拍點：抽屜完成 +0.3 s、焦點抬起那拍跑完 +0.1 s（不晚於下一拍 −0.1）；最後一拍之後沒有新動畫 → 併成「（完成態）」。observe 加拍點表 `beat-NN.jpg`（同一套時刻、從成片抽格）與 index.md「拍點」節。驗：qc.test 純函式＋e2e（真的 kit：x-v2 三張 3.1／4.6／6.0，截圖看到抬起與抽屜字）；observe e2e 加拍點斷言。
- [x] T113 qc final 字幕（F8）：抽 5 則純中文字幕，底板位置從 build 好的頁面量（`.cg > span` 的 rect）、字高從成片那一格的白字量（min RGB ≥ 150）；底板 956–1074 ± 4、字高 71 ± 3，不合 ⚠（不擋交付）；含「，。」、< 0.6 s 也 ⚠。驗：範例目前的 build 頁面截圖量到底板 956–1074、字高 70–71；12:54 的舊 final.mp4 量到 81 → ⚠（舊樣式，重 render 就好）。
- [x] T114 qc-sheet 最上面標 `theme: light／dark`（plan.json `theme`，只有 "dark" 是暗色）；raster 點陣字補 11 個小寫字母。驗：qc.test 主題。
- [x] T115 theme: dark 回歸：qc.test「暗色主題回歸」用 002 fixture（dev/tests/fixtures/theme-dark）的 concept／fs-list 段、純中文字幕，build（`<html data-theme="dark">`）→ render draft → qc final：`theme: dark`、captions ✔（底板 956–1074、字高 71 ± 3）、qc-sheet 主題列是暗底（約 18 s）；brand.test「暗色底圖」鎖三張尺寸、留空區裝飾占比（fs ≤ 10%、side ≤ 3.5%、ch ≤ 2.5%）、平均亮度 < 60。render 截圖：暗色下方字卡、玻璃主卡、標題列漸層、字幕都正常。
- [x] T116 錄影面板從小窗長出、標註焦點（§5、§7；色帶擦開與子母畫面飛入是 002 的 main）：錄影可見區包一層不計時的 `#mgr-<id>`（運鏡層在裡面用 left／top 抵回畫面座標），從講者進來（enter fade）時 `M.grow('#mgr-<id>', 起點 + 0.3, { from: 'pip' })`；slide／zoom／cut 照舊。紅框、說明卡、箭頭各包一層 `fo-…`，`focusPlan`：後一個出現時前面還留 ≥ 0.4 s 的 `P.dim` 到 0.5，最後一個出現後 min(+2.6 s、段尾 −1.4 s、它收掉 −0.3 s) 回均衡；同時出現的不互相壓暗。放大鏡本來就壓暗 0.5；clicks 只有時間沒有座標，維持只有音效。驗：media.test 18 則（grow 行、slide 不長、focusPlan 四例＋build 兩框 9 壓暗／10.2 回來）；snapshot 7.1／7.6／8.6／9.6／10.6 看到面板由小窗長出、第一框在 9.6 半亮、10.6 恢復。
- [x] T117 003 把 P.OUT 改 0.3：qc.test「03 側邊欄截在退場前」的期望改成從 kit 常數算（7 − PUSH − OUT − 0.1＝5.9）；07 改成 v2 抽屜後，storyboard e2e 的 s01 改成驗「抽屜抽出後 0.3 秒：「重點在這裡」（完成態）」與印出行一致（時刻規則由 v2 拍點兩則測試涵蓋）。
