# 規格：022 pipeline-speed（模型只做判斷、工具做計算；內容設計動畫三成勾選才做；預覽不 render）

**Feature Branch**: `022-pipeline-speed`（目錄，不另開分支）

**Created**: 2026-11-09

**Status**: 驗收中

**Input**: 作者（2026-11-08～09）：MiniMax 跑範例在停點 ③、④ 前各卡 20 分鐘以上；「從實務剪輯的視角來說，70% 都是可以套用動畫模板，但希望不要連續使用相同的模板；30% 才是為了大家理解，需要透過 subagent 處理的動畫，我只有這塊認為真的需要時間；網頁預覽不需要真的輸出，最後影片輸出久的 render 我才可以接受」；「用盡全力優化」；「全力執行並驗證，透過 speckit 確認真的有符合預期」；「另外我發現修改動畫，也要花費相當成的時間，似乎都是用 render 而非預覽的概念」。

## 證據（2026-11-08 MiniMax 完整執行＋本輪實測）

| 量到的事 | 數字 | 出處 |
|---|---|---|
| 工具全部加起來 | 約 3 分鐘；合併 3 s、分鏡表 27 s、套回 2 s | `status.mjs --timeline`、本輪在複本上計時 |
| 寫草稿（代理式、MiniMax-M3.1-Flash） | 9 分鐘，其中兩次長考 132 s、211 s（思考 2.5 萬、4.3 萬字），還讀了不需要的 `講稿.md`、順手改 `rough.srt` | session `14-00-46-479` |
| 鏡位腳本（③ 前） | 10.5 分鐘 | 同上 |
| 兩段內容設計動畫（③ → ④） | 35 分鐘；d0102 想了 13.6 萬字後寫入被中斷、25 分鐘沒產出；d0101 每輪 ⚠ 整份重寫 | session `14-55-09/10` |
| 一次寫整份草稿（純文字、上限 4 萬 token） | 3 次有 2 次 4 萬 token 全部拿去思考、沒輸出；放寬後 163 s／3.9 萬 token，16 段只有 3 段模板動畫 | `mmx text chat` 實測 |
| 先寫大綱 | 151 s／1.56 萬 token，22 段，大多是模板動畫；照工具改一次 39 s | 同上 |
| 修改一段內容設計動畫（r1 d0101） | 30 分鐘；audit 每次 6–7 s、沒有 render；時間花在讀 `kit/scene.css`、`USAGE-reference`、撈 lucide SVG，220 s 卡在 storyboard.md 的舊動畫分鏡 ✖（設計師不能改 storyboard.md），整份重寫 3 次 | session `00-36`～`01-06` |
| 版本沒存到動畫檔 | `work/versions/d0101/v1/.meta.json` 的 `files: []`：內容設計動畫、模板動畫的 html 沒進版本，只改動畫時 finish 會說「都和改之前一樣」、`use` 退不回去 | 範例專案 |
| 改版流程 | `versions new`、`use`、存進已確認的提案都會 render 預覽.mp4（一段 build＋render 約 25 s 起）；revise.md 叫 `finish --preview` 再 render 一次＋比較影片 | `versions.mjs`、`revise.md` |
| 思考的內容 | 2,636 句裡 801 句在猶豫：時間算術、講者／章節角標怎麼排、`state` 寫法、圖示名稱 | 同上（分類統計） |

結論：時間幾乎都在模型的思考 token，不在工具。要省時間就讓模型只做判斷，凡是能算的、能查的都由工具先做好或事後檢查。

## User Scenarios & Testing

### User Story 1 - 內容設計動畫只做值得的三成，時間成本看得到（Priority: P1）

作者在停點 ③ 看到「內容設計動畫候選」勾選表：每列有預估時間，預設已經勾好預算內的幾段；不勾的照現在的模板。說「可以」就照勾的做，同一位設計師寫腳本接著做動畫，不再停。

**Why this priority**：上次 ② → ④ 的 45 分鐘有 45 分鐘都在內容設計動畫；作者只願意在這三成花時間，而且要知道花多久。

**Independent Test**：在範例複本產生分鏡表，看候選表的預估欄與預設勾選；勾一段、說可以，看 plan.json 那段變成 `design: true`、印出「先寫鏡位腳本，寫完接著做動畫」。

**Acceptance Scenarios**：

1. **Given** 草稿有 5 段寫了 `story.designIdea`，**When** 跑 `--storyboard`，**Then** 分鏡表「需要我決定的事」有候選表，每列有預估分鐘，表下一行寫預設勾幾段、預估幾分鐘、全勾幾分鐘；預設勾選的預估 ≤ 30 分鐘。
2. **Given** 使用者沒改勾選，**When** 跑 `--apply-storyboard`，**Then** 預設勾的段改成內容設計動畫，沒勾的段 plan.json 不動。
3. **Given** 設計師派出 20 分鐘以上那段還是空白畫布，**When** 主代理跑 `--design-status`，**Then** 那段標「還沒動手」並印重派的派工訊息。
4. **Given** 預覽階段，**When** 跑 `--review`，**Then** 不在背景 render（加 `--prerender` 才 render）。

### User Story 2 - 寫草稿：模型只做判斷（Priority: P1）

分章子代理先寫一段一行的大綱，工具檢查段長、接縫、相鄰模板、候選數量，並告訴它每段動畫的拍綁哪幾句、最多幾拍；通過後工具產生骨架（起訖、anchor、欄位、能自動補的 `at`、`why` 都寫好），模型只填畫面上的字。

**Why this priority**：七成的段是模板，這部分要快而且穩；一次寫整份時弱模型會在算秒數、猜規則上耗掉大部分思考。

**Independent Test**：用 `dev/bench/draft-bench.mjs` 在範例複本上各跑 3 次「一次寫整份」與「大綱 → 骨架」，比較產出率、思考 token、模板動畫比例、檢查結果。

**Acceptance Scenarios**：

1. **Given** 大綱有不認得的模板、看不懂的起訖，**When** 跑 `--outline`，**Then** ✖ 並寫改法，不產生骨架。
2. **Given** 大綱的段太短、相鄰同模板、沒接上、章節角標放了好幾段、候選太少，**When** 跑 `--outline`，**Then** 逐條 ⚠，仍產生骨架。
3. **Given** 骨架已經填過一部分，**When** 改大綱再跑 `--outline`，**Then** 同 id、同模板的段留著填好的內容。
4. **Given** 骨架的項目 `at` 是 `auto`、卡上的字在字幕裡講得到，**When** 跑 `--check-draft`／`--merge-drafts`，**Then** 工具補成 `#N@詞`；講不到的那格 ✖「寫講到它的詞」。
5. **Given** 圖示欄寫了「電腦」，**When** 跑 `--check-draft`，**Then** 自動換成 `laptop` 並印出來；對不到的 ✖ 附英文名稱建議。
6. **Given** 合併通過、沒有要先寫的鏡位腳本，**When** 跑 `--merge-drafts`，**Then** 接著產生分鏡表並印停點 ③ 那一行（主代理少一個回合）。

### User Story 3 - 量得出來才算數（Priority: P2）

作者改說明或規則之後，跑一支基準測試就知道對弱模型是變快還是變慢，不靠單次印象。

**Independent Test**：`node dev/bench/draft-bench.mjs --project projects/example --runs 3` 印出兩種寫法的中位數表與 JSON。

### User Story 4 - 修改動畫走預覽：不 render、不卡舊分鏡（Priority: P1）

作者在完成影片預覽或剪輯台說「s12 重新設計」「照修改單改」：工具存版本、設計師改動畫、`finish` 驗證後給完成影片預覽網址（瀏覽器即時播放，不 render）和 audit 的完成態拼圖。只有作者說「要比較影片」才 render。

**Why this priority**：作者看到的是「改一段動畫也要很久，像在 render」；實際上一半是 render（改版流程三處預設 render），一半是設計師卡在不能改的舊分鏡和版本工具沒存到動畫檔。

**Independent Test**：在範例複本對一段內容設計動畫跑 `begin` → 只改 `x-design-<段>.html` → `finish`；再跑 `new`、`accept`、改動畫、`finish`、`use --ver v1`，全程不產生 `預覽.mp4`、沒有呼叫 render，`finish` 認得動畫改了，`use` 把 html 還原。

**Acceptance Scenarios**：

1. **Given** 內容設計動畫段（`design: true`）或模板動畫段（`template`），**When** `versions save`／`begin`／`finish`，**Then** 版本裡有那支 html（和它用到的 `illus-local/*.svg`、內容設計動畫的 `work/designs/<段>.md`）；只改 html 時 finish 認得是改過的。
2. **Given** 改版流程，**When** `new`、`accept` 後 `finish`、`use`，**Then** 都不 render；版本的 `預覽.jpg` 是 audit 量那段時的完成態拼圖（finish 已經量過，直接複製）。加 `--preview` 才 render 預覽.mp4 與比較影片。
3. **Given** 設計師改了 `work/designs/<段>.md` 的動畫分鏡表（比 storyboard.md 新），**When** `audit --only <段>`，**Then** 照新表對拍，不報舊表的 ✖；`versions finish` 把新表寫回 storyboard.md 那一節並印出來。
4. **Given** 修改單派工（worker-brief、editor-requests、revise），**Then** 派工訊息寫明：內容設計動畫段可以改 `work/designs/<段>.md` 的分鏡表；不讀 `kit/`、`USAGE-reference`、不撈 SVG；用 edit 改，不整份重寫；看結果用完成影片預覽網址，不 render。

### Edge Cases

- 影片只有 1 份（短片）：主代理自己寫，一樣走大綱 → 骨架。
- 長片候選很多（例：20 分鐘 36 段）：預設只勾預算內的段，其他不勾；表下寫全勾的時間。
- 候選段落在同一章：排序時各章輪流，避免預設全勾在同一章。
- 卡上的字是改寫（字幕沒這幾個字）：`auto` 補不到 → ✖ 請模型寫詞，不猜。
- 使用者在分鏡表改過勾選後重跑 `--storyboard --only`：只換那幾節，勾選不動。
- `mmx` 沒登入或額度用完：基準測試印原因並結束，不影響剪片流程。
- 舊版本（`files: []`）的 hash 和修好後算的不同：第一次 save 會多存一版，之後正常。
- audit 沒出拼圖（有 ✖ 或錄影段）：版本沒有 預覽.jpg，finish 照樣印完成影片預覽網址。
- 使用者在剪輯台改過 storyboard.md 那段的分鏡（比 designs/<段>.md 新）：以 storyboard.md 為準（規則 10），不寫回。

## Requirements

### 本 session 前半已實作（這輪一起驗收）

- **FR-001**：草稿只標候選（`story.designIdea`、`designWhy`），不寫 `design: true`；分鏡表列候選勾選表；`--apply-storyboard` 把 ☑ 的段換成內容設計動畫（留起訖、音效，構想搬到 `story.idea`）。
- **FR-002**：③ 勾了才做；還沒有鏡位腳本的段，派工訊息是「先寫鏡位腳本（不用等確認），寫完接著做動畫」。
- **FR-003**：候選目標＝可設計段（media、章節角標、講者介紹不算）的三成，上限再加三分之一；`--check-draft`、`--merge-drafts` 不在範圍就 ⚠。
- **FR-004**：相鄰兩段同一個模板（模板動畫看 `template`、字卡看 scene）⚠。
- **FR-005**：`--review`、`versions.mjs finish` 預設不在背景 render；`--prerender` 才 render。
- **FR-006**：`--outline <份>`：讀 `work/drafts/<份>.outline.md`，✖／⚠ 照 Acceptance US2-1、2，產生骨架；拍綁哪幾句、最多幾拍的提示。字卡動態（`fx NN`）沒有範例 JSON，照那一條的「vars：」組骨架（驗收時發現原本會 ✖「不認得模板」）。
- **FR-007**：`--check-draft` 遇到還沒填的 `<…>`、`#N`、`#Me`、`#N@詞` 直接 ✖ 列出位置，不跑 build。
- **FR-008**：`--spec a,b` 一次查好幾個。
- **FR-009**：找不到圖示時：中文給英文名稱建議與 `--icons` 指令，英文給相近名稱。
- **FR-010**：剪輯台完成影片預覽：播放被打斷（AbortError）不報；瀏覽器擋自動播放（NotAllowedError）黃色提醒；其他錯誤印名稱與原因。
- **FR-011**：派工說明：分章子代理先大綱後骨架、不讀講稿與 rough.srt、不先算時間；設計師先寫骨架再 edit 補細節、不估詞的位置。

### 這一輪

- **FR-101**：候選表多一欄「預估」（每段分鐘數），表下一行：`預設勾 N 段（預估 X 分鐘，4 段同時做）；全勾 M 段約 Y 分鐘`。
- **FR-102**：預設勾選：候選照「各章輪流、同章段長的先」排序，依序勾到預估牆鐘時間 ≤ 30 分鐘。預估＝⌈段數 ÷ 4⌉ × 12 分鐘（12、4、30 都是建議初值，定義在 `shared/style.md`）。
- **FR-103**：`--storyboard` 的回報行寫預設勾幾段、預估幾分鐘。
- **FR-104**：`--design-status`：列每段內容設計動畫的狀態（還沒動手／已動手 N 分鐘前／腳本有沒有寫），還沒動手且派出（brief 寫好）超過 20 分鐘的印重派訊息。
- **FR-105**：骨架裡有字的項目（物件有 `text`／`label`、x-scene 的拍有新元件）的 `at`、`<欄位>At`（對到同物件或 `slots` 的 `<欄位>`、`<欄位>Text`、`<欄位>Head`）寫 `auto`；`--check-draft`、`--merge-drafts` 在檢查前用字幕找講到的詞補成 `#N@詞`：只在這段的句號範圍、2 字的卡整個對到或 3 字以上連續對到、比上一格晚（自己寫的詞也算上一格）才補；補不到的一次全列 ✖，寫明要落在哪兩格之間（實測：放寬到可往回找、2 字部分對到時 1/3 差 2–5 秒、兩拍撞在同一個詞，所以收緊）。
- **FR-106**：骨架的 `story.why` 預設寫那個模板的用途（寫法.md 第一行冒號後），模型可以改。
- **FR-107**：圖示欄（`icon`、`<名稱>Icon`）寫中文時，`--check-draft`、`--merge-drafts` 照常用詞對照表自動換成英文名稱並印出「圖示「電腦」→ laptop」；對不到的照 FR-009 報。
- **FR-108**：`--merge-drafts` 通過且沒有要先寫的鏡位腳本時，直接接著產生分鏡表（同 `--storyboard`），印停點 ③ 那一行。
- **FR-109**：`dev/bench/draft-bench.mjs`：複製專案到暫存（APFS clone），兩種寫法各跑 N 次（`mmx text chat`），每次記：秒數、輸出與思考 token、有沒有產出、`--check-draft` 的 ✖／⚠、模板動畫比例、候選比例、相鄰同模板數；印中位數表、存 JSON。
- **FR-110**：文件（Skill、AGENTS、style、USAGE）照上面改；數字只定義在 `style.md`。

- **FR-201**：`versions.mjs` 的段落快照包含工具產生的動畫檔：`src`，或 `design: true` 的 `compositions/x-design-<段>.html`、`template` 的 `compositions/<模板>-<段>.html`，加上它用到的 `illus-local/*.svg`；內容設計動畫再加 `work/designs/<段>.md`。`use` 照樣還原。
- **FR-202**：`versions new`、`use`、存進已確認的提案預設都不 render；只有 `--preview` 才出預覽.mp4、比較影片。`finish` 量過那段後，把 audit 的完成態拼圖複製成版本的 `預覽.jpg`；`new` 的提案「現在的樣子」連到那張圖（有的話）和完成影片預覽。
- **FR-203**：audit 的動畫分鏡：內容設計動畫段的 `work/designs/<段>.md` 比 storyboard.md 新時用它（插圖清單同）；`versions finish` 把它的分鏡表寫回 storyboard.md 那一節（storyboard.md 比較新就不動）。
- **FR-204**：文件：`worker-brief.md`、`editor-requests.md`、`revise.md`、`feedback-round.md`、`design-build.md` 照 US4-4 改；revise.md 拿掉 `finish --preview`，回報給完成影片預覽網址與拼圖。

### Key Entities

- **大綱**（`work/drafts/<份>.outline.md`）：每段一行 `id | from | to | 模板 | 在講什麼 | 候選構想`。
- **骨架**（`work/drafts/<份>.json`）：工具產生、模型填 `<…>` 的草稿。
- **候選**：草稿段的 `story.designIdea`；③ 勾選後成為內容設計動畫段。

## Success Criteria

| SC | 怎麼量 | 目標 |
|---|---|---|
| SC-001 | `draft-bench`：兩步式每次都有可檢查的草稿 | 3／3 次產出（對照：一次寫整份在 4 萬 token 上限的產出率） |
| SC-002 | `draft-bench`：模板動畫（`x-*`、`fx`）占非 media、非章節段的比例，中位數 | 兩步式 ≥ 50%，且高於一次寫整份 |
| SC-003 | `draft-bench`：候選比例中位數 | 20–40% |
| SC-004 | `draft-bench`：`--outline` 通過後相鄰同模板 | 0 處 |
| SC-005 | 同一份大綱，骨架要模型填的格子（改前 143） | 少 ≥ 20%（≤ 114） |
| SC-006 | `draft-bench`：兩步式填骨架後 `--check-draft` 的 ✖ 中位數 | ≤ 3 |
| SC-007 | 工具時間（範例） | `--outline` ≤ 3 s、`--merge-drafts`（含接著產生分鏡表）≤ 60 s |
| SC-008 | 範例複本：分鏡表候選表 | 每列有預估；預設勾的預估 ≤ 30 分鐘；說「可以」後預設勾的段變成內容設計動畫 |
| SC-009 | `--review` 之後 | 沒有預先 render 的工作 |
| SC-010 | `node --test dev/tests/*.test.mjs` | 全部通過 |
| SC-011 | 範例複本：內容設計動畫段只改 html → `finish` | 不用 `--no-change` 就認得改了；版本資料夾有那支 html；`use --ver v1` 還原 html |
| SC-012 | 範例複本：`new` → `accept` → 改 → `finish` → `use` | 全程 0 次 render（沒有 預覽.mp4）；每條 ≤ 30 s；版本有 預覽.jpg（audit 拼圖） |
| SC-013 | 範例複本：改 `work/designs/<段>.md` 的拍再 audit | 0 個舊表造成的 ✖；finish 後 storyboard.md 那節的表和 designs 一致 |

## Assumptions

- MiniMax Code 沒有給腳本驅動的命令列，基準測試用 `mmx text chat` 的純文字模式模擬（工具輸出由腳本餵回去）；代理式的完整執行由作者在 MiniMax Code 裡跑。
- 每段內容設計動畫 12 分鐘、同時 4 段是依 2026-11-08 的紀錄扣掉白做的時間估的建議初值，之後用 `status.mjs --timeline` 校正。

## 不在範圍

- 依任務分配模型與思考強度（MiniMax `defaultModelThinking.effort` 是全域設定，改設定要作者同意；列為作者實測項目）。
- 草稿按段再分給多個子代理（每個子代理都要重讀材料，開銷比省下的多）。
