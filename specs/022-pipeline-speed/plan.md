# 實作計畫：022 pipeline-speed

**Spec**：`specs/022-pipeline-speed/spec.md`　**日期**：2026-11-09

## 技術脈絡

- Node 22 ESM，工具在 `shared/template/tools/`，測試 `node --test dev/tests/*.test.mjs`（`helpers.mjs` 的 `imp` 載入工具模組）。
- 不加相依套件；基準測試用已登入的 `mmx`（MiniMax CLI）。
- 範例驗證一律在複本做（`cp -cR projects/example <scratchpad>/…`，APFS clone），不動 `projects/example`。

## Constitution 檢查

| 原則 | 這次怎麼守 |
|---|---|
| 計算交給工具 | 預估時間、預設勾選、`at: auto`、圖示對照、分鏡表回寫都在工具裡做，模型只看結果 |
| 弱模型優先的文件 | 派工訊息只寫要做什麼、能寫哪些檔、驗收一條指令；不叫模型讀 kit／tools |
| 數字單一來源 | 12 分鐘、4 段、30 分鐘寫在 `shared/style.md`「內容設計動畫」一節，工具常數旁註明出處，文件引用不重寫 |
| 每支工具有測試 | 每個 FR 至少一個測試；範例複本端到端另外記在驗收清單 |

## 設計

### US1 預估與預設勾選（FR-101～104）

- `lib/storyboard-gen.mjs`：候選表加「預估」欄（`DESIGN_MIN` 分鐘）；`defaultPicks(cands, partOf)`：各章輪流、同章段長的先，依序加入直到 `⌈n/PAR⌉×MIN > BUDGET` 前停；表裡預設勾的寫 `☑`；表下一行 `預設勾 N 段（預估 X 分鐘，P 段同時做）；全勾 M 段約 Y 分鐘`。
- `lib/flow.mjs` storyboard 回報行加同一句。
- `build.mjs --design-status`：讀 plan.json 的 `design` 段、`work/briefs/<段>.md`、`work/designs/<段>.md`、`compositions/x-design-<段>.html` 的 mtime 與 `isBlankDesign`；狀態三種；空白且 brief 超過 20 分鐘印重派訊息。

### US2 自動補（FR-105～108）

- 骨架：`at`、`<欄位>At` 寫 `auto`；`story.why` 預設模板用途。
- `lib/flow.mjs` 新增 `resolveAuto(segs, cues)`：遞迴找 `at === 'auto'` 的物件，用同物件的 `text`（或 `slots.<欄位>`）在這段句號範圍跑 `spokenAt`，補成 `#N@詞`；補不到列 ✖。`checkDraft`、`mergeDrafts` 在檢查前跑，寫回草稿檔並印「自動補 N 格」。
- 圖示：同一個走訪把中文圖示值用 `ICON_ALIAS` 換成英文，印「圖示「電腦」→ laptop」。
- `mergeDrafts` 成功且沒有 `noScript` 段時呼叫 storyboard 產生（同 `--storyboard`），測試裡驗證輸出有停點 ③。

### US3 基準測試（FR-109）

- `dev/bench/draft-bench.mjs`：參數 `--project --part --runs --modes one,two --out`；每次 clone 專案到暫存、跑模式、量時間與 token（`mmx --output json` 的 usage）、套用工具檢查、統計；印中位數表、寫 JSON。

### US4 修改動畫走預覽（FR-201～204）

- `versions.mjs snapshotOf`：`animFile(seg)＝seg.src || designFileOf || fillFileOf`；design 段加 `work/designs/<段>.md`（rel `../designs/<段>.md`、store `鏡位腳本.md`）。
- `saveSeg`：`wantPreview = flags.preview && !flags['no-preview']`；`opt.still`（audit 拼圖路徑）存在就複製成 `預覽.jpg`。`new`、`use` 不再傳 `preview: true`。
- `finishRound`：audit 後把 `au.sheets` 對到段 id 傳給 `saveSeg`；`syncDesignSheet(P, id)` 在 build 前把較新的 designs 表寫回 storyboard.md。
- `audit.mjs`：design 段的 designs md 比 storyboard.md 新 → 用 designs 的表與插圖清單。
- 文件：worker-brief、editor-requests、revise、feedback-round、design-build。

## 驗證

- 單元：`dev/tests/{storyboard-gen,scaffold,feedback-round,versions,audit*}.test.mjs`。
- 端到端：範例複本（`scratchpad/mmv`、新 clone）跑 US1、US2、US4 的 Independent Test，計時。
- 基準：`draft-bench --runs 3`。
- 驗收清單：`checklists/acceptance.md`，每個 FR／SC 一列：證據、✅／❌。
