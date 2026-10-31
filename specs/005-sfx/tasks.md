---
description: "005 sfx 的實作工作清單"
---

# Tasks: 005 sfx

**Input**：`specs/005-sfx/spec.md`、`plan.md`、`specs/contracts/sfx.md`、`specs/contracts/cli-005.md`

**Tests**：spec 有要求（FR-040、FR-041），每個實作工作前先寫會失敗的測試。

## Format: `[ID] [P?] [Story] 說明`

- **[P]**：可以同時做（不同檔案、沒有前後依賴）
- **[US1]**～**[US5]**：對到 spec 的 User Story
- 指令都在工作區根目錄執行；`<AN>`＝`/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/analysis`；`<SP>`＝同一個 scratchpad 的 `w005/`

**共用檔排隊規則**：`shared/sfx/sources.json`、`shared/sfx/README.md`、`shared/template/kit/sfx.json`、`NOTICE.md` 只能由「回寫」工作（T035、T054、T075）一次一個改；候選與 A/B 工作只寫到 `<SP>`。

## 待作者試聽 v2（F5「音效太機械」；交付報告直接引用；審查 r1-A A-04、SC-002）

上一版「6 顆待試聽」併進這一版：10 個事件全部重新請作者選（shared/sfx/ 目前仍是 v1，作者選之前不動）。

- **試聽頁**：`/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/w005b/ab/index.html`（重產：`node /private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/w005b/ab/build-ab.mjs`）。每個事件一列：剪映參考（只在 scratchpad）／v1（shared/sfx 現在的）／v2 合成（`specs/005-sfx/v2/make-sfx-v2.mjs`）／CC0 定稿版（`/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/w005b/cc0-final/manifest.json`，由 `cc0-final/finalize.mjs` 從搜集版產生：頁上播的就是會安裝的檔，只差試聽用的音量對齊）。同一列對齊到同一個 M max，附相似度（v1／v2，0–100 越大越像）、CC0 距離（越小越像）、頻譜縮圖。勾選會自動組出回覆。
- **回覆格式**：`ding=v2c、success=v2a、alert=cc0-1、impact=v1 …`（沒寫的事件維持 v1），或「全部 v2 最像的」＝`ding=v2c、alert=v2a、success=v2a、impact=v2a、chapter=v2c、sparkle=v2a、shine=v2a、thunder=v2a、bgm-outro=v2b`（click 沒有 v2，維持 v1）。
- **每個事件可選幾個**：ding、alert、success、impact、chapter、sparkle、shine、thunder 各 7（v1、v2a–c、cc0-1–3）；click 4（v1、cc0-1–3）；bgm-outro 6（v1、v2a–b、cc0-1–3）。
- **主代理裁決（2026-10-31）**：success／sparkle／shine 長度上限放寬到 2.0／2.8／2.0 s（v2 合成器與 `dev/tools/make-sfx.mjs` 的 `limit`、spec FR-010／012 已同步；v1 三顆位元組不變）；chapter、thunder 上限放寬到 2.5 s（make-sfx.mjs、spec FR-011／012 已同步；v2 合成仍照配方 1.3／1.4 s，在上限內）。CC0 超長的 success-1／3、alert-3 裁到上限（上限前掉到 −45 dB 就從那裡淡出 150 ms，沒掉到就最後 7.5 % 淡出），卡片標「已裁到 X s」；配樂三首只取原曲真正收尾前 12–18 s（cc0/raw 的完整預覽檔；卡片標起迄與原曲長度、結尾和弦）；晚峰值 5 顆（chapter-2、shine-2／3、thunder-1／2）不裁頭，kit `peak` 照實測寫，卡片標「峰值 0.xx s，會提早播」。impact 預設 v2a（第一下最大，對齊點不變）；v2b 照剪映第二下較大，選它要把 kit `impact.peak` 改成第二下（≈ 0.141 s）、`event` 改「落定那一格（第二下）」。
- **授權提醒（頁上也有）**：① cc0-1（success）、cc0-1／cc0-2（shine）是上傳者用 Bitwig／FL Studio Purity 音色庫做的，CC0 是上傳者宣告；② CC0 全部是 freesound 不需登入的 HQ 預覽檔（ogg 192 kbps 有損），選了要在 sources.json 註明。

### 安裝路徑（作者回覆後才做；這一輪不執行）

0. **工具**（主代理已裁決）：`dev/tools/make-sfx.mjs` 保留為唯一 CLI（下載、zip、`--candidates`、`--write`、sources／kit／README 回寫都在這裡），把 v2 的 DSP＋配方＋`finish()` 搬成 `dev/tools/lib/sfx-v2.mjs`（零相依模組）給它 import；RECIPES 每個事件加 `<事件>-v2a…` 候選（`engine: 'v2'`）。v1 配方原樣保留、照舊用 ffmpeg 量測的 `finish()`，所以 v1 與凍結檔都還能逐位元組重產；v2 候選用 v2 自己的 `finish()`（JS BS.1770、−66 dBFS 尾端、抖動），寫出來的檔要和試聽頁那顆 sha256 相同（`/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/w005b/synth/v2-recipes.json`，26 顆已驗證可重產）。`specs/005-sfx/v2/make-sfx-v2.mjs` 留著當研究紀錄、檔頭指到新位置（刪檔要先問作者）。CC0 候選另加「單一檔案下載」來源型別（`download_url`＋`sha256`，不是 zip）。
1. 把回覆寫進 research.md「A/B 紀錄」（每個事件一列、作者原話逐字）。
2. 逐個選到的事件：
   - **v2**：`--write --only <事件>`（CHOICE＝`<事件>-v2x`）→ 核對 sha256＝v2-recipes.json。sources.json：`route: "C"`、`source: "程式合成（dev/tools/make-sfx.mjs 配方 <事件>-v2x；原 make-sfx-v2.mjs）"`、`license: "CC0 1.0"`、`license_note: "作者合成，以 CC0 1.0 釋出"`、`processing` 抄配方說明。
   - **CC0**：裝 `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/w005b/cc0-final/<事件>-<n>.wav`（核對 cc0-final manifest 的 `final_sha256`）。來源鏈：`download_url`（核對 `sha256`＝預覽檔）→ 搜集版 `processing` → 定稿 `steps`（裁切／片段），全部抄進 sources.json `processing`；make-sfx 加的 CC0 配方要能從預覽檔重產到同一個 sha256，做不到就把定稿檔當來源、在 sources.json 註明「定稿檔 sha256＝…，處理見 processing」。sources.json：`route: "B"`、`source_pack: "freesound"`、`source_author`、`source_file`（`original_name`）、`source_url`、`download_url`、`zip_sha256`（＝預覽檔的 sha256；README 已說明這欄是「下載的檔案」）、`license: "CC0 1.0"`、`license_url`、`license_note: "freesound HQ 預覽檔（ogg 192 kbps 有損）；原檔需登入，未下載"`，音色庫那三顆再加「上傳者用 <Bitwig／FL Studio Purity> 音色製作，CC0 是上傳者宣告」。NOTICE.md 音效段加「freesound」小節（檔名、作者、作品頁）。
   - **v1**：不動。
3. kit/sfx.json（`--write` 自動）：`peak`＝實測最大樣本秒數、`volume`＝10^((−14＋targetDb−M max)/20)，`targetDb` 不變；只有 impact-v2b 手改 `event`。
4. 長度、片段、峰值（主代理已裁決，見上）：kit 沒有長度欄位，上限在 `dev/tools/make-sfx.mjs` 的 `limit`（`sfx.test.mjs` 讀它）；配樂 10–20 s 規則不變（定稿片段 12.7–18.0 s）；晚峰值那 5 顆的 `peak` 照 cc0-final manifest 的 `final_peak_sec` 寫。
5. 驗證：`node --test dev/tests/sfx.test.mjs dev/tests/audio.test.mjs`（長度上限、峰值、響度、sources、README、NOTICE、授權護欄都會檢查）→ `node dev/check-all.mjs --skip-tests` → 範例專案複本 `build.mjs --check` 看「音效比例」沒有 ⚠。

---

## Phase 1：Setup

- [x] T001 建 `specs/005-sfx/research.md`：三節「A/B 紀錄」（表頭：日期｜名稱｜選的候選｜作者原話｜sources.json candidate）、「剪接點 RMS」、「make_sfx.py 退役」。完成判準：檔案存在、三個標題都在。
- [x] T002 [P] `shared/template/kit/sfx.json`：現有 12 項補 `kind: "sfx"`、`event`（contracts/sfx.md §2 原文）、`targetDb`、`additive`（`tick` true）、`maxPerVideo: null`；`whoosh` 的 `use` 改「全畫面幕進場、從講者切到螢幕錄影的第一段」。**待換的 4 顆先填現況值**：`ding` −10.0、`success` −8.9、`alert` −10.0、`impact` −7.9（spec FR-020「現在工作區」欄），換檔時再改。完成判準：`node -e` 讀得到 12 項、每項 9 個欄位。
- [x] T003 [P] `shared/sfx/sources.json`：12 筆補 `sha256`（`shasum -a 256 shared/sfx/<名稱>.wav`；Windows：`Get-FileHash -Algorithm SHA256`）與 `kind: "sfx"`，其他欄位不動。完成判準：12 筆都有 64 位 hex。

---

## Phase 2：Foundational（擋住後面所有 User Story）

### 測試先行

- [x] T010 寫 `dev/tests/sfx.test.mjs`（plan.md D3 表的全部測試；名稱清單先放現有 12 個＋註解「每批回寫時加」）。完成判準：對現況 12 顆執行，「style.md 數字」「make-sfx」兩組 skip（原因印出），其他全綠。
- [x] T011 [P] `dev/tests/audio.test.mjs` 加 `SFX_RULES`、`sfxBudget` ×6、`audioKey` look、`cutDips` 合成 ×3、`renderBgmClip` 的測試；改寫「報告：…調幅 ≥ 3 dB 時提醒音效比例…」那一條（plan.md D3）。完成判準：新測試失敗（函式還沒寫），舊測試仍綠。

### `tools/lib/audio.mjs`

- [x] T012 加 `SFX_RULES`、`sfxBudget()`（plan.md D2；原文照 cli-005 §3.2）。驗：T011 的 `sfxBudget` 測試綠。
- [x] T013 改 `audioReportLines()`：刪舊「人聲被調大」提醒、加 `sfx` 參數與「音效比例」行（cli-005 §3.1）；檔頭註解同步。驗：T011 報告測試綠。
- [x] T014 `audioKey()` 加 `look`、`encodeFootagePolished()` 加 `lut` 轉傳（spec FR-033，照 006 `contracts/look.md` §4）。驗：T011 look 測試綠；舊專案戳記不變；現有「整支流程」測試不改仍綠。
- [x] T015 加 `cutDips()`（plan.md D2）。驗：T011 合成三條綠，且 15 ms 的 `runMs` 印出來在 11–15 ms。
- [x] T016 加 `renderBgmClip()`（spec FR-029）。驗：T011 對應測試綠（需要 ffmpeg）。

### `dev/tools/make-sfx.mjs`

- [x] T017 寫 make-sfx 骨架：參數、`--help` 原文、錯誤原文（cli-005 §1.5）、`--out` 工作區護欄、WAV 讀寫、mulberry32、DSP 基本件、ffmpeg 解碼與量測、`finish()` 處理鏈（plan.md D1）、`--list`。驗：`node dev/tools/make-sfx.mjs --help` 原文一致；`--list` 結束碼 0。
- [x] T018 make-sfx 的 zip 讀取與下載（Kenney cookie 流程、OpenGameArt 直鏈、sha256 核對、`--cache`）。驗：`--cache <SP>/cache` 下載 Kenney UI Audio，sha256＝`946fc23a63d535d693eb31b2eabb80c8c28d6351e2186b344ceb71b2cb1d5eb6`。
- [x] T019 make-sfx 的 `--candidates`（候選、ab、voice、index.html）與 `--write`（wav、sources.json 一筆、kit 的 peak／volume、README 重產、§1.6 檢查）。驗：T010 的 make-sfx 測試從 skip 變綠（離線 C 配方、兩次 sha256 相同、護欄）。
- [x] T020 列 5 個 Kenney zip 的目錄（UI Audio、Interface Sounds、Impact Sounds、Sci-fi Sounds、Music Jingles；sha256 照 spec FR-010 前言），核對 spec FR-010～012 寫的每個檔名都在；不在的寫進 research.md 並改 spec 那一格（這是改 spec，不是改程式）。驗：research.md 有「Kenney 檔名核對」小表，每個檔名一列 ✓／✗。
- [x] T021 [P] `dev/tools/make_sfx.py` 退役（spec FR-038）。驗：作者機器跑 `python3 dev/tools/make_sfx.py` 結束碼 ≠ 0、印取代說明，記進 research.md。

**Checkpoint**：`node --test dev/tests/sfx.test.mjs dev/tests/audio.test.mjs` 全綠；通知 002 可以開始 import `SFX_RULES`、呼叫 `sfxBudget`（spec「請 002 加」第 2、5、6 條）、通知 006 `audioKey` 的 `look` 已就緒。

---

## Phase 3：User Story 1 － 第一批（P1）🎯 MVP

**Goal**：`ding`、`alert`、`success`、`click` 上線。
**Independent Test**：spec US1。

- [x] T030 [P] [US1] make-sfx 配方 `ding-a`、`ding-b`、`ding-keep`（spec FR-010）。驗：`--candidates --only ding --ref <AN>/sfx-preview/di-tishiyin.wav --out <SP>/ab` 結束碼 0，輸出行的頻譜重心與參考差 ≤ 10 %。
- [x] T031 [P] [US1] 配方 `alert-a`、`alert-b`、`alert-c`、`alert-keep`。驗：同上（參考 `cuowu-jinggao-didi.wav`）。
- [x] T032 [P] [US1] 配方 `success-a`、`success-keep`。驗：同上（參考 `zhengque.wav`），`success-a` 峰值 ≤ 0.010 s（落在第一音）。
  - 2026-10-31：峰值實測 0.234 s（第四音）；參考「正确」也是後段最大聲，spec FR-010 已改，對齊點＝最高音到位。
- [x] T033 [P] [US1] 配方 `click-a`、`click-b`、`click-c`。驗：同上（參考 `shubiao-danji.wav`），兩聲間隔 0.125 s（±2 ms）、第一聲較大。
- [ ] T034 [US1] A/B 交給作者：把 `<SP>/ab/index.html` 路徑與四個名稱的輸出表給作者，請他每個名稱回一個候選 id（可加 `--voice projects/範例/素材/真人錄影/示範口播.mp4` 聽墊在講話底下的大小）。**停下來等作者選**。完成判準：research.md「A/B 紀錄」四列。
  - 2026-10-31：主代理裁決這一輪先照客觀分數 `--write`（research.md「A/B 紀錄」），作者試聽仍待做：`<SP>/w005/ab/index.html`。
- [x] T035 [US1] 回寫：`kit/sfx.json` 加 `click` 一項（contracts/sfx.md §1 範例）、把 `ding` −12.6、`alert` −6.9、`success` −5.2 的 `targetDb` 與 `zh`／`use` 改成契約值；改 `CHOICE`；`node dev/tools/make-sfx.mjs --write --only "ding,alert,success,click"`；`sfx.test.mjs` 名稱清單加 `click`；`NOTICE.md` 音效段（spec FR-037）。驗：`node --test dev/tests/sfx.test.mjs` 全綠；`git diff --stat shared/sfx` 只有 4 個 wav、sources.json、README.md。
- [ ] T036 [US1] 通知 004（media `clicks`）、002（custom `clicks`、`click` 附加音效）可以開工；把 contracts/sfx.md §10 第 2、3 列給他們當測試。
  - 2026-10-31：待主代理轉達（005 不直接通知）。

**Checkpoint**：US1 可單獨交付。

---

## Phase 4：User Story 2 － 音量政策（P1）

**Goal**：每顆音效大小照 `targetDb`，build 報告「音效比例」正確。
**Independent Test**：spec US2（T011～T013 已涵蓋單元層）。

- [ ] T040 [US2] 002 整合 `sfxBudget` 與 `audioReportLines({ sfx })` 之後，在範例專案跑 `node shared/template/tools/build.mjs --check --project projects/範例`（只有 `--check`，不 render），確認最後印「音效次數」「音效密度」兩行、0 個「音效比例」⚠。驗：輸出貼進 research.md。
- [ ] T041 [US2] 在範例 plan.json 暫時給一段 `"sfxVolume": 6`，`--check` 要出現 cli-005 §3.2 的音效比例 ⚠；驗完改回。驗：輸出貼進 research.md。

---

## Phase 5：User Story 3 － 第二批（P2）

**Goal**：`impact`（咚咚）、`chapter`（嘭）上線；`success` 決定最終版。
**Independent Test**：spec US3。

- [x] T050 [P] [US3] 配方 `impact-a`、`impact-b`、`impact-c`、`impact-keep`（spec FR-011）。驗：`--candidates --only impact --ref <AN>/sfx-preview/zongyi-dongdong.wav --out <SP>/ab` 結束碼 0；兩下間隔 0.12 s（±2 ms）。
- [x] T051 [P] [US3] 配方 `chapter-a`、`chapter-b`、`chapter-c`。驗：同上（參考 `zongyi-peng-zimu.wav`）；true peak ≤ −1.0 dBTP；頻譜重心 ≤ 200 Hz。
- [ ] T052 [P] [US3] 配方 `success-b`、`success-c`（打卡成功挑戰者）。驗：同上（參考 `daka-chenggong.wav`，另附 `zhengque.wav` 那份 ab 讓作者兩邊比）。
  - 2026-10-31：取消：主代理裁決 success 用「正确」式琶音（success-a）。
- [ ] T053 [US3] A/B 交給作者（`impact` 另請作者回想字卡動態 01、02、03、16、24；回寫後可以在 `shared/template/index.html` 字卡動態區試聽，不合就 `git checkout shared/sfx/impact.wav` 改選 `impact-keep`）。**停下來等作者選**。完成判準：research.md 三列（`impact`、`chapter`、`success`）。
  - 2026-10-31：同 T034：impact 暫選 impact-c（客觀最接近）。
- [x] T054 [US3] 回寫（等 T035 完成）：`kit/sfx.json` 加 `chapter`、改 `impact` 的 `targetDb` −6.2 與 `zh`／`use`；若 `success` 改選 b → `targetDb` −5.7；`--write --only "impact,chapter[,success]"`；測試清單加 `chapter`；NOTICE 音效段。驗：`sfx.test.mjs` 全綠。
- [ ] T055 [US3] 通知 002：01 chapter 的 scene.json 可以改 `chapter`（「請 002 加」第 1 條前半）。驗（002 改完後）：範例專案 `--check` 章節段音效欄是 `chapter`、04 段仍是 `whoosh`，輸出貼進 research.md。
  - 2026-10-31：待主代理轉達。

---

## Phase 6：User Story 4 － 剪接點 RMS（P2，只依賴 T015，可與 Phase 3、5、7 同時做）

**Goal**：用數據決定 15 ms 或 0.1 s 交叉淡化。
**Independent Test**：spec US4。

- [x] T060 [P] [US4] 產生範例 work/（plan.md D4 第 1 步的兩條 auto-editor 指令，參數以 `auto-editor --help` 為準）並寫 `projects/範例/work/cutpoints.json`。驗：`ffprobe` 看 `rough.mp4` 長度；cutpoints.json 是 `{ "cuts": [...] }` 格式。
  - 2026-10-31：work/ 放 scratchpad `w005/rms/work/`，沒寫 `projects/範例/work/`（避免跟其他工作線搶）。
- [x] T061 [US4] `AUTO_EDIT_RMS_PROJECT=projects/範例 node --test dev/tests/audio.test.mjs`；diagnostic 表貼進 research.md「剪接點 RMS」。作者有旁白檔專案時再跑一次（plan.md D4 第 3 步）。驗：research.md 有每個接點一列與「合計」一行。
  - 2026-10-31：0 凹洞（加了「比處理前低 ≥ 6 dB」條件後；沒加時 2 個，原因見 research.md）。
- [x] T062 [US4] 決策寫進 research.md 一行：「0 凹洞，維持 15 ms」或「N 個凹洞，改 0.1 s 交叉淡化」。
- [x] T063 [US4]（0 凹洞時）`audio.mjs` 的 `CUT_FADE` 註解改成指到 `specs/005-sfx/research.md`；結束 Phase 6。
- [ ] T064 [US4]（有凹洞時）`encodeFootagePolished` 加 `join`（spec FR-032、plan.md D5）、`AUDIO_VER` 改 2、報告行改「剪接點交叉淡化：…」、測試加「長度與 rough.mp4 相同」「合成素材 0 凹洞」。驗：重跑 T061 → 0 凹洞。
- [ ] T065 [US4]（有凹洞時）每個接點 ±3 s 輸出 15 ms 版與交叉淡化版的試聽檔到 `<SP>/cuts/`，請作者聽（02 G15 驗證方式）。**停下來等作者確認**。
- [ ] T066 [US4]（有凹洞時）通知 002「請 002 加」第 9 條；通知 001 用 docs.md 的交叉淡化版文字。

---

## Phase 7：User Story 5 － 第三批（P3）

**Goal**：`sparkle`、`shine`、`thunder`、`bgm-outro` 上線。
**Independent Test**：spec US5。

- [x] T070 [P] [US5] 配方 `sparkle-a`、`sparkle-b`、`sparkle-c`（spec FR-012）。驗：`--candidates --only sparkle --ref <AN>/sfx-preview/xianchen.wav --out <SP>/ab`；頻譜重心 ≥ 6 kHz。
- [x] T071 [P] [US5] `shine`：先量 Music Jingles 的 Steel／Pizzicato／Sax 三組（共 51 顆）的「後 0.3 s ÷ 前 0.3 s 頻譜重心」與長度，挑 3 顆寫成 `shine-a`～`c`（量測表貼進 research.md）；再寫 `shine-d`。驗：同上（參考 `zongyi-shanliang-dengchang.wav`）。
- [ ] T072 [P] [US5] `thunder`：請作者在瀏覽器打開 spec FR-012 的兩個 OpenGameArt 頁，確認授權欄是 CC0、記下檔名；`--candidates` 印出 sha256 後填進配方；寫 `thunder-c`。驗：同上（參考 `dalei.wav`）；配方裡兩個 B 候選都有 sha256 或註明「作者確認不可用」。
  - 2026-10-31：先用合成 thunder-c 上線（主代理裁決）；OpenGameArt 兩頁寫進 sources.json `pending_author_check`，作者瀏覽器確認仍待做。
- [ ] T073 [P] [US5] `bgm-outro`：同 T072 核對三個 OpenGameArt 作品頁；B 候選截 10–20 s（結束在終止式、檔尾 2 s 淡出）；寫 `bgm-d` 合成。作者自己用 `ffmpeg -t 20 -i "/Volumes/video/音樂/適合放在結尾，感性.mp3" -ar 48000 -ac 2 <SP>/bgm-ref.wav` 做參考檔。驗：`--candidates --only bgm-outro --ref <SP>/bgm-ref.wav --out <SP>/ab`；長度 10–20 s；整合響度 −20 LUFS（±0.5）。
  - 2026-10-31：同 T072：bgm-d 上線（16.8 s、整合響度 −20 LUFS），三個 OpenGameArt 頁在 `pending_author_check`；淡出預設 1.85 s（002 裁決）。
- [ ] T074 [US5] A/B 交給作者。**停下來等作者選**；某個名稱全部不滿意 → research.md 記「不上線」，對應的「請 002」項目取消（15 warn 退回 `alert`、不做 `outro`）。完成判準：research.md 四列。
  - 2026-10-31：同 T034。
- [x] T075 [US5] 回寫（等 T054 完成）：`kit/sfx.json` 加選定上線的名稱（contracts/sfx.md §2）；`--write`；測試清單加；NOTICE 音效段（OpenGameArt 作品頁、Music Jingles）。驗：`sfx.test.mjs` 全綠；`du -ch shared/sfx/*.wav` 增加量 ≤ 5.3 MB（plan.md D7）。
- [ ] T076 [US5] 通知 002（14、15 預設、`outro`、`renderBgmClip`）、003（gallery）、006（剪輯台排除 bgm）。驗（002 完成後）：範例 plan.json 暫時加 `"outro": { "from": "#<最後第 3 句>" }` 跑 build 與 `qc.mjs final`，報告有「結尾配樂：…」一行、qc 0 ✖；輸出貼進 research.md 後改回。
  - 2026-10-31：待主代理轉達。

---

## Phase 8：Polish

- [ ] T080 核對契約一致：002 的 `contracts/cues.md`（`#N@詞` 文法）、`plan-fields.md`（`outro`）、`check-json.md`（`sfxCount`、`sfxBudget`）、004 的 `media.md`（`clicks`）、006 的 `look.md`（`look` 參數名）。有出入改 contracts/sfx.md 與 spec，不口頭約定。
- [x] T081 [P] `specs/005-sfx/docs.md` 依實際結果定稿（有沒有交叉淡化、哪些名稱沒上線），交 001。
- [ ] T082 跑 `node --test dev/tests/*.test.mjs` 全綠；照憲法「檢查迴圈」交 007 的 `dev/check-all.mjs`。
- [ ] T083 對照 spec Success Criteria SC-001～SC-006 逐項打勾，寫進 research.md 最後一節。

---

## Dependencies & Execution Order

### Phase 依賴

- Phase 1 → Phase 2 → Phase 3、5、6、7（彼此可同時做）→ Phase 8。
- Phase 4 依賴 002 完成「請 002 加」第 2、5、6 條。
- Phase 6 只依賴 T015（`cutDips`），不依賴任何音檔。

### 批次之間

| 工作 | 可以同時 | 必須排隊 |
|---|---|---|
| 配方與候選（T030～033、T050～052、T070～073） | 全部 [P]：各自只寫 `make-sfx.mjs` 裡自己那個名稱的配方段落與 `<SP>/ab/<名稱>/` | 同一個人改 `make-sfx.mjs` 時合併衝突自己處理（各名稱的配方是獨立段落） |
| A/B（T034、T053、T074） | 可以一次把多個名稱給作者 | — |
| 回寫（T035 → T054 → T075） | — | 照這個順序，一次一個（共用 sources.json、kit、README、NOTICE） |

### 跨工作線

| 005 完成 | 之後誰可以做 |
|---|---|
| T012～T014 | 002（`SFX_RULES`、`sfxBudget`、`audioReportLines({ sfx })`）、006（`look`） |
| T035 | 004、002（`clicks`） |
| T054 | 002（01 → `chapter`） |
| T075 | 002（14、15、`outro`）、003（gallery）、006（剪輯台） |
| T081 | 001（文件） |

## Parallel Example: 三批候選同時做

```bash
# 三個人（或三個子代理）各做一批的配方，輸出都在 scratchpad：
node dev/tools/make-sfx.mjs --candidates --only alert   --ref "<AN>/sfx-preview/cuowu-jinggao-didi.wav" --out "<SP>/ab"
node dev/tools/make-sfx.mjs --candidates --only chapter --ref "<AN>/sfx-preview/zongyi-peng-zimu.wav"   --out "<SP>/ab"
node dev/tools/make-sfx.mjs --candidates --only sparkle --ref "<AN>/sfx-preview/xianchen.wav"           --out "<SP>/ab"
```

## Implementation Strategy

1. Phase 1＋2 → 測試全綠（現況 12 顆）→ 002、006 可以開始接介面。
2. Phase 3（第一批）→ 作者 A/B → 回寫 → MVP。
3. Phase 6 與 Phase 5、7 同時跑；Phase 6 的結論決定 docs.md 用哪一版剪接點文字。
4. Phase 8 定稿文件、跑檢查迴圈。

## Notes

- A/B 的三個停下來（T034、T053、T074）是作者維護工作的確認，不是剪片的六個停點（憲法 V）。
- `<SP>` 底下的試聽檔含剪映原音，永遠不複製進工作區（憲法 VII）。
- 不用 `rm`：要清掉的暫存檔留在 scratchpad 或系統暫存資料夾。
