# Feature Specification: 001 skills-docs（9 個 Skill＋文件改寫＋安裝＋文件一致性測試）

**Feature Branch**: `001-skills-docs`

**Created**: 2026-10-31

**Status**: Draft（第一輪：只寫規格；其他工作線的指令名稱標「暫定」，第二輪對齊 `specs/contracts/cli-00N.md` 與各線 `docs.md`）

**Input**: 主代理派工「工作線 001 skills-docs」：9 個 Skill、`setup/install-skills.mjs`、`SITUATIONS.md`、`REVIEW.md`、AGENTS.md／PROMPTS.md／USAGE／style.md 改寫計畫、`dev/tests/docs.test.mjs`、契約 `stop-points.md`、`cli-001.md`。來源：分析報告 02 §3、§4（G04、G06、G10、G22、G24、G25）、§5、§7；01 §2、§8；00 §2、§6–§8；`specs/README.md`「已定案的規則」。

**縮寫**：AN＝分析報告資料夾（`analysis/`）；02＝`AN/02-skill-gap.md`；01＝`AN/01-jianying-technique.md`；00＝`AN/00-phase1-report.md`；U＝`shared/template/USAGE.md`；R＝`shared/template/USAGE-reference.md`；`檔名:數字`＝工作區現行檔案的行號（2026-10-31 的 `main`，commit 22caf6c）。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 弱模型照 AGENTS.md＋Skill 從「剪乾淨」跑到停點 ③，不靠 Plan 模式 (Priority: P1)

使用者在 MiniMax Code（MiniMax-M3.1-Flash，`PROMPTS.md:12`）或 Claude Code（Sonnet）貼「使用「剪乾淨」流程，把 @projects/範例 剪成初剪」，AI 讀 AGENTS.md 找到 `auto-edit-rough`，照 SKILL.md 一步一步做，停在 ①；使用者回「可以」，再貼「剪好看」，AI 照 `auto-edit-storyboard` 停在 ②、③。全程不需要切 Plan 模式、不需要調思考深度，每次停下來最後一行都是固定格式。

**Why this priority**: 這是整個升級的目標（憲法 III「弱模型優先」、V「停點固定」）；02 §4 G06 指出現行 PROMPTS.md:84 要求 Plan 模式，卻在構圖與分鏡表要寫檔，PROMPTS.md:174-175 已經有兩條「卡在 Plan 模式」的症狀。

**Independent Test**: 憲法「檢查迴圈」第 3 步：用 Sonnet（或更弱）只讀 AGENTS.md 與 `.agents/skills/`，對 `projects/範例` 從「剪乾淨」跑到停點 ③，紀錄寫進 `dev/loop/round-N.md`（007）。只要 9 支 SKILL.md 與 AGENTS.md 改好就能測，不用等其他工作線（新工具還沒有時走 Skill 退路表的「工具還沒有」列）。

**Acceptance Scenarios**:

1. **Given** `projects/範例/素材/真人錄影/` 有一支影片、沒有 `work/`，**When** 使用者貼 PROMPTS.md §2 的提示詞，**Then** AI 在 ≤ 10 次工具呼叫內（AGENTS.md:76）寫出 `work/cuts.md`，回覆最後一行逐字是 `⏸ 停點 ① 剪輯清單｜請看：work/cuts.md｜請回：「可以」或要改的列`。
2. **Given** 停點 ① 已通過、`work/rough.mp4`／`rough.srt` 存在，**When** 使用者貼「使用「剪好看」流程，把 @projects/範例 包裝成成片」（沒有開 Plan 模式），**Then** AI 跑 `qc.mjs framing --cards`、停在 ②；回「1.15」後停在 ③，`work/storyboard.md` 與 `work/storyboard-preview/` 都已寫出。
3. **Given** 使用者在 Plan 模式下貼「剪好看」，**When** AI 要寫 `work/構圖預覽.jpg`，**Then** AI 照 U §2.1 新寫法只做到列句號與挑情境，回覆說明「這一步要寫檔，請離開 Plan 模式再說一次」，不卡住也不跳過停點。
4. **Given** 使用者說「做到 Studio」，**When** AI 跑剪好看，**Then** ② ③ 不停（停點紀錄寫「略過」、回報有 `⏭ 停點 ② 略過：…`），停在 ④。

---

### User Story 2 — 文件只有一個真相：8 處矛盾清零、數字找得到出處 (Priority: P1)

AI 照任何一份文件做，都不會被另一份文件或 build 的 ⚠ 拉回去改成相反的做法。

**Why this priority**: 02 §4 G04 列出 8 處矛盾（P0），W04：弱模型「看到 build 的 ⚠ 就去修，把 style.md 要的連續覆蓋拆掉」。憲法 IV 要求同一個數字只在一個地方定義。

**Independent Test**: `node --test dev/tests/docs.test.mjs` 全綠；G04 的 grep（SC-002）沒有輸出。只依賴本工作線的文件改寫，不依賴其他工作線（build 端關掉 ⚠ 是 002 的事，見「請 002 加」）。

**Acceptance Scenarios**:

1. **Given** 改寫後的 style.md、U、R，**When** 跑 SC-002 的 grep，**Then** 0 行輸出。
2. **Given** 任一支 SKILL.md 寫了「完成態 ≥ 1.2 s」，**When** 跑 docs.test，**Then** 測試在 `shared/style.md` 找到「1.2」＋「秒」的同一條規則而通過；把 style.md 那條刪掉後測試失敗並印出 Skill 的檔名與行號。
3. **Given** 使用者沒說話、AI 在寫條列卡，**When** AI 查 style.md「節奏」，**Then** 只看到一種條列進場規則（`specs/README.md` 定案：每條綁一句逐條進場；沒有句子可綁時每條相隔 ≥ 0.15 s；絕不整組同時出現）。

---

### User Story 3 — 一個指令把 9 支 Skill 裝到 Claude Code 與 MiniMax Code（Mac、Windows 都能跑） (Priority: P1)

使用者說「幫我檢測環境」，AI 照 setup 手冊一路做到共用步驟 S4 `node setup/install-skills.mjs`，之後在 MiniMax Code 的「+ → Skills」看得到 9 支 `auto-edit-*`；Claude Code 在工作區也讀得到。

**Why this priority**: 沒有安裝，Skill 只是 repo 裡的檔；現行 PROMPTS.md §4（:122-131）要使用者自己叫 AI「封裝成 Skill」，每個人封出來的都不一樣。

**Independent Test**: `dev/tests/install-skills.test.mjs` 用 `--dest <暫存>` 跑 cli-001 §2 的 9 個案例；Mac 實機跑一次真的位置。

**Acceptance Scenarios**:

1. **Given** 兩個位置都沒有 `auto-edit-*`，**When** `node setup/install-skills.mjs`，**Then** 印 `✔ 完成：9 支 × 2 個位置，新裝 18、更新 0、沒變 0`，結束碼 0。
2. **Given** 已裝過、作者改了 `auto-edit-rough/references/ng-rules.md`，**When** 再跑，**Then** 只有兩列 `更新（1 個檔不同）`。
3. **Given** `~/.minimax/skills/auto-edit-rough/` 是使用者自己建的（沒有標記檔），**When** 跑，**Then** 那一列 `✖ 衝突` 並附「→ 改名或移走它」，那個資料夾一個 byte 都沒變，結束碼 1。
4. **Given** 全新電腦，**When** 照 `setup/README.md` 做，**Then** 步驟 1 的清單裡有「S3 npm install（裝釘版的 HyperFrames 0.8.221）」「S4 安裝 9 支 auto-edit Skill」，S8 最後檢測 `skill_auto_edit`、`hyperframes_local` 都是 `ok`。

---

### User Story 4 — 換一個 session 說「繼續」，AI 接回正確的停點 (Priority: P2)

使用者隔天開新任務：「繼續 projects/EP2」。AI 跑 `status.mjs`、讀 `work/製作進度.md`，直接重貼還在等的那個停點，不用重做、不用猜。

**Why this priority**: 02 §4 G10：現在「只能靠 AI 看 work/ 有哪些檔猜進度」；VEP 的做法（`VEP/SKILL.md` §6）證明跨 session 要靠狀態檔。依賴 002 的 `status.mjs`，所以 P2。

**Independent Test**: 在停點 ③ 待回覆時關掉 session，新 session 說「繼續 projects/範例」；有 `status.mjs` 前，用 `auto-edit-longform` 退路表的「產物→階段」對照表手動判斷。

**Acceptance Scenarios**:

1. **Given** `work/製作進度.md` 的停點紀錄最後一列是「③ 分鏡表｜待回覆」，**When** 新 session 說「繼續」，**Then** AI 在 ≤ 3 次工具呼叫內（`auto-edit-longform` 預算）重貼 `⏸ 停點 ③ …` 那一行。
2. **Given** 第一次對這個專案說「用 auto-edit-longform 剪 projects/EP2」，**When** AI 開工，**Then** `work/製作進度.md` 開頭有一張填好的開工決策表（G24，6 欄）。

---

### User Story 5 — 每一輪 Studio 回饋都有紀錄、改前有備份 (Priority: P2)

使用者在停點 ④ 說「s05 往左移、s08 字太多」，AI 開 `work/回饋/r1.md` 記原話與分類、先存 `work/hyperframes/plan.json.bak-r1` 再改；下一輪是 r2。

**Why this priority**: 02 §4 G10、§3「回饋輪 rN」：現行 AGENTS.md:106 直接改 plan.json，沒有紀錄、沒有改前備份（只有 snap-srt 會備份 rough.srt）。

**Independent Test**: 在範例專案走兩輪回饋，檢查兩個 rN.md、兩個 bak 檔都在，rN.md 欄位齊全。只依賴文件改寫。

**Acceptance Scenarios**:

1. **Given** `work/回饋/` 不存在，**When** 使用者在 ④ 給第一份修改，**Then** 改 plan.json 之前就有 `work/hyperframes/plan.json.bak-r1`，`work/回饋/r1.md` 有「原話／分類（規則或個案）／改了哪幾段／驗證」四節。
2. **Given** r1 已存在，**When** 第二輪，**Then** 編號是 r2，r1 的檔案沒被改。

---

### User Story 6 — 分鏡表多了「金句候選」與文案傾向，開工有決策表 (Priority: P2)

AI 列分鏡表時不直接把金句卡塞進去，而是在「需要我決定的事」列一張金句候選表讓作者勾；字卡文字優先寫具體實例、動詞放前面。

**Why this priority**: 02 §4 G22（`JY/CB:L101`「先列候選讓作者勾選再上」）、G25（`JY/CB:L89`）、G24（`JY/SKILL.md:L17`）。

**Independent Test**: 範例專案跑到 ③，storyboard.md 最後一節有金句候選表（欄位固定），style.md「字卡文字」有兩條新規則＋例句。

**Acceptance Scenarios**:

1. **Given** 口播有「不是 X，而是 Y」這類翻轉句，**When** AI 寫 storyboard.md，**Then** 「需要我決定的事」有金句候選表，每列有句號、原句、卡上文字、情緒、要不要（☐）。
2. **Given** 使用者在 ③ 只勾了 1 則，**When** AI 寫正式 plan.json，**Then** 只有那 1 則變成 15 quote 段。

---

### User Story 7 — 情境與審查知識集中在兩份新檔 (Priority: P3)

AI 挑情境查 `shared/template/SITUATIONS.md` 一份就有「口播訊號 → 版面 → 首選 → 動態 → 音效 → 不要用在」；審查截圖照 `shared/template/REVIEW.md` 的門檻與回報格式。

**Why this priority**: 02 §5.1 第 2 點「知識只有一份」；W18 版面有四套叫法；§3「審查門檻」「觀影 pass」沒有搬。價值在品質，不擋流程，所以 P3。

**Independent Test**: SITUATIONS.md 每列能對回 02 §1 的編號（SC-011）；REVIEW.md 的每個門檻都有「怎麼量」指令（SC-012）。

**Acceptance Scenarios**:

1. **Given** 口播「先錄影，接著轉逐字稿，再列清單，最後初剪」，**When** AI 查 SITUATIONS.md，**Then** 找到「流程（直線 3–4 站）→ 子母畫面 → 04c fs-flow」與「站不在一直線 → custom x-process」兩列，版面欄只用 AGENTS.md 的四個名稱。
2. **Given** verifier 子代理（選用）看 s01–s06，**When** 回報，**Then** 每個問題一行 `[P0] 0:41.2（s05） 問題｜證據｜修法`，總長 ≤ 25 行。

---

### User Story 8 — 換風格先探測生圖能力再選路 (Priority: P3)

使用者說「換成藍色，我沒有背景圖」，AI 先跑能力探測，照路由表選 Codex／mmx／HTML 截圖，三張圖在暫存資料夾驗尺寸、出預覽，停在 ⑥。

**Why this priority**: 02 §5.5、§5.6、G07；需要 002 的 `caps.mjs` 與 004 的 `brand.mjs bg`，本線只負責文件與 Skill。

**Independent Test**: 「有 codex」「只有 mmx」「都沒有」三種環境各跑一次（02 G07 驗證方式），都停在 ⑥ 且三張尺寸正確。

**Acceptance Scenarios**:

1. **Given** 工具清單沒有生圖工具、`codex login status` 未登入、`mmx auth status` 已登入，**When** AI 換背景，**Then** 走 mmx，不幫使用者登入 codex，回報寫「登入 codex 之後可以改用 Codex 生圖」。

---

### Edge Cases

- **MiniMax Code 讀不到專案層 Skill**：02 §8 第 1 條不確定 MiniMax 有沒有專案層 skills 資料夾。所以 AGENTS.md 每個流程直接寫 Skill 原始檔路徑（`.agents/skills/auto-edit-rough/SKILL.md`），沒載入 Skill 也能照路徑讀（FR-030）。
- **已安裝的 Skill 比原始檔舊**：AGENTS.md 指路到原始檔，以原始檔為準；`setup` S8 用 `check.sh`／`check.ps1` 報 `skill_auto_edit`，作者用 `install-skills.mjs --check`。
- **其他工作線的工具還沒做好**：每支 Skill 的退路表有一列「`Cannot find module …/status.mjs`（或 `Unknown command`）→ 照下面的手動做法」，手動做法給公式＋算好的例題（憲法 I）。
- **使用者的回覆對不到停點**（例：在 ③ 待回覆時說「s05 往左移」）：照 stop-points.md §3，回覆一律對應最近一次「待回覆」的停點；③ 的指名修改就是改 storyboard.md 那一節。
- **「改好了」有三種意思**（③ 改了 storyboard.md、① 改了 cuts.md、⑤ 是「調好了」）：一律看停點紀錄最後一列「待回覆」是哪個停點。
- **使用者在剪輯台改過 plan.json，AI 又開回饋輪**：先重新讀檔（現行 AGENTS.md:130），bak 檔存的是剪輯台改過之後的版本。
- **同一個流程使用者說了「不用停」又在中途插話**：插話那一則沒說「不用停」，之後的停點恢復要停（stop-points.md §5）。
- **Windows PowerShell 的逗號參數**：Skill 裡帶逗號或冒號的參數一律加引號（AGENTS.md:153）。
- **SKILL.md 寫不下 200 行**：細節搬進 `references/`，SKILL.md 留「做到哪一步才讀」（02 §7.2 原則 7）。

---

## Requirements *(mandatory)*

### A. 9 支 Skill（`.agents/skills/auto-edit-*/`）

- **FR-001**：建立 9 支 Skill：`auto-edit-longform`、`-setup`、`-rough`、`-storyboard`、`-screen`、`-motion`、`-review`、`-deliver`、`-style`，各自 `SKILL.md`＋`skill-outline.md` 指定的 `references/`（02 §5.2、§5.4）。
- **FR-002**：frontmatter 只能有 `name`、`description`、`version` 三個欄位；`name` 等於資料夾名稱；`description` 單行，依序寫「做什麼」「當使用者說…時使用」「…時不要用（改用 …）」；`version` 從 `0.1.0` 開始（02 §5.4；`VEP/SKILL.md:L3`；作者 26 支 Skill 有 `name`／`description`、18 支有 `version`，2026-10-31 掃 A`.agents/skills/*/SKILL.md` 第 1–5 行）。
- **FR-003**：每支 SKILL.md ≤ 200 行（02 §7.2 原則 7）。
- **FR-004**：每支 SKILL.md 標題下第一張表的表頭逐字是 `| 輸入 | 指令 | 產出 | 完成判準 | 停點 |`（02 §7.2 原則 1、§7.3）。
- **FR-005**：每支 SKILL.md 都有這幾個二級標題（逐字）：`## 步驟`、`## 自我核對`（5–8 項，02 §7.2 原則 9）、`## 退路表`、`## 工具呼叫預算`、`## 回報格式`；有 references 的再加 `## 什麼時候讀 references/`，每個 reference 寫「做到哪一步才讀」。
- **FR-006**：`## 步驟` 每一步都有三件事：可直接複製的指令（code block）、「完成判準：」一行、「常見錯誤：」至少一條「症狀 → 修法」（憲法 III.3）。
- **FR-007**：指令一律從工作區根目錄執行、帶 `--project projects/<專案>`；要 `cd` 的 hyperframes 指令一律寫成子殼 `(cd projects/<專案>/work/hyperframes && npx hyperframes …)`（02 §5.4、W15）；不寫絕對路徑、不寫 `~/`（`auto-edit-setup` 說明安裝位置時例外）；Mac 與 Windows 指令不同時兩個都寫（例：背景 render，U §2.7）。
- **FR-008**：會停的 Skill，停點那一行逐字照 `specs/contracts/stop-points.md` §2.1；不停的 Skill，回報最後一行用 `→ 下一個停點：…`（stop-points.md §1 最後一張表）。
- **FR-009**：`## 退路表` 三欄「症狀（工具原文）｜做法｜第二次還失敗」；症狀照工具印出的原文節錄（含 `✖`／`⚠` 前綴與 `→` 前的部分），第二次還失敗一律「停下來回報：指令、錯誤原文、已經試過什麼」（憲法 III.4）。
- **FR-010**：`## 回報格式` 給一個 ≤ 15 行的骨架（憲法 III.5）；`auto-edit-motion`、`auto-edit-screen`（當 explore 子代理 brief 時）與 `review/references/reviewer-brief.md` 的回報 ≤ 25 行（憲法 III.5；`OV/WB:L109-126`）。
- **FR-011**：Skill 只貼「這一步會用到、而且工具不會檢查」的數字，每個數字後面括號寫出處（`AGENTS.md 階段預算`、`style.md 節奏` 等）；所有門檻數字都要能在 AGENTS.md、`shared/style.md` 或工具 `--help` 輸出找到（FR-091）。
- **FR-012**：用到子代理的段落標「（選用）」，並寫「沒有子代理時：自己照 `auto-edit-motion` 一段一段做」（憲法 III.6；02 §5.4）。
- **FR-013**：每支 SKILL.md 標題下第一段固定兩行：「規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。」「衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。」（憲法 III.7）。
- **FR-014**：`## 工具呼叫預算` 寫一個上限（次）與「超過就停下來回報卡在哪」；數字照 AGENTS.md「階段預算」表（FR-034）。
- **FR-015**：9 支 Skill 的觸發語、步驟、停點、退路表列、references 檔名照 `specs/001-skills-docs/skill-outline.md`。

### B. 安裝（`setup/install-skills.mjs` 與 setup 文件）

- **FR-020**：新增 `setup/install-skills.mjs`，參數、行為、印出的原文、結束碼照 `specs/contracts/cli-001.md`。
- **FR-021**：只用 Node 22 內建模組；路徑 `path.join`、家目錄 `os.homedir()`；不呼叫 shell；在 Mac（zsh）與 Windows（PowerShell）同一個指令 `node setup/install-skills.mjs` 都能跑（憲法 II）。
- **FR-022**：`setup/README.md`：「要裝的東西」表加兩列（`npm install` 裝根目錄 `package.json` 釘的 HyperFrames 0.8.221，`specs/README.md` 定案；9 支 auto-edit Skill）；共用步驟改成 S1 hyperframes Skill、S2 auto-editor Skill、**S3 `npm install`（新）**、**S4 `node setup/install-skills.mjs`（新）**、S5 doctor（原 S3）、S6 auto-editor（原 S4）、S7 列素材（原 S5）、S8 最後檢測（原 S6）；原則 6「不在工作區留下任何檔案」加例外 `node_modules/`、`.claude/skills/auto-edit-*`；步驟 1 範例清單、`setup/README.md:91`「通常只剩 S3–S6」一起改號。
- **FR-023**：`setup/check.sh`、`setup/check.ps1` 各加兩項：`hyperframes_local`（step `S3`；`node_modules/hyperframes/package.json` 的 version 等於根目錄 `package.json` 釘的版本才 `ok`）、`skill_auto_edit`（step `S4`；9 個 `~/.minimax/skills/auto-edit-*/SKILL.md` 都在才 `ok`）；`required` 都是 1；JSON 的 `todo` 會列出它們。
- **FR-024**：`setup/troubleshooting.md`「共用」加列：`npm install` 失敗（網路、`EACCES`）、`install-skills` 印 `✖ 衝突`、MiniMax 的 Skills 清單看不到 `auto-edit-*`。
- **FR-025**：`setup/mac.md`、`setup/windows.md` 的 M1–M8、W1–W9 不改步驟內容；只把文中引用的共用步驟編號（S3→S5 等）改對。

### C. AGENTS.md（逐節改寫，細節見 plan.md §4）

- **FR-030**：開頭新增「怎麼用這份檔」一節：一張「我說 → 照哪支 Skill（原始檔路徑）」表，9 列；寫「已安裝的 Skill 和 `.agents/skills/` 是同一份；有出入以 `.agents/skills/` 為準」；寫規則衝突優先序（憲法 III.7）。
- **FR-031**：「資料夾」表加三列：`.agents/skills/`（Skill 原始檔；只能讀，剪片時照它做，不要改）、`.specify/`＋`specs/`（作者維護用的規格，剪片時不要讀；`specs/README.md` 定案表最後一列）；`dev/` 一列不變。
- **FR-032**：「規則」：規則 2 改成「停點只有六個，照下面『停點總表』；回覆最後一行照固定格式；我說『不用停』『跑到停點 N』才連跑」；規則 5 改成優先序（刪「有衝突時先問我」，改「同一層文件互相矛盾才問我」）；規則 7 加 `work/製作進度.md`、`work/回饋/r<N>.md`、`work/hyperframes/plan.json.bak-r<N>`，刪「封裝成 Skill 都會用到」改「之後修改、換 session 接續都會用到」；新增規則 8「每階段回報 ≤ 15 行、子代理回報 ≤ 25 行；工具呼叫超過『階段預算』就停下來回報」。
- **FR-033**：新增「停點總表」一節，內容＝stop-points.md §1 的六列（欄位：停點｜在哪一步｜給我看什麼｜我可以回｜決定寫回哪裡）＋§2.1 六行最後一行原文＋§5「不用停」的四種說法與兩個不能略過的停點。
- **FR-034**：新增「階段預算」一節，一張表（全部標「建議初值」）：剪乾淨到停點 ① ≤ 10 次（AGENTS.md:76 既有）；構圖到停點 ② ≤ 6 次、分鏡表到停點 ③ ≤ 25 次、單段情境動畫 ≤ 15 次、回饋輪每一項 ≤ 6 次（02 W19）；總指揮接手 ≤ 3 次、交付（不含看 render log）≤ 12 次、render log 最多看 20 次、換風格 ≤ 15 次、配一支螢幕錄影 ≤ 6 次（本 spec 提的建議初值，待作者確認）；環境準備同一步失敗 2 次就停（`setup/README.md` 原則 8，搬進表裡讓 Skill 引用）。
- **FR-035**：新增「開工（每個專案第一次）」一節：開工決策表 6 欄（G24；`JY/SKILL.md:L17`）——主軌種類、有沒有講稿、有沒有螢幕錄影／圖片、長度是否 < 3 分鐘（180 秒；< 3 分鐘不用 01 章節轉場，R1.2 第 1 列）、有沒有業配段（業配段不放 01，02 §1 #22）、構圖倍率（停點 ② 之後填）；每欄寫「怎麼看」（可觀察的指令或檔案）與預設值；表寫進 `work/製作進度.md` 開頭。
- **FR-036**：新增「進度與回饋紀錄」一節（G10）：`work/製作進度.md` 的固定結構（開工決策表、階段表 ⬜🔄⏸✅↩—、停點紀錄表照 stop-points.md §4、回饋輪索引）；回饋輪 r<N> 的編號規則（`work/回饋/` 裡已有幾個 `r*.md` 再加 1；例：有 r1、r2 → 這輪 r3）、改 plan.json 前先複製成 `work/hyperframes/plan.json.bak-r<N>`（Mac `cp`、Windows `Copy-Item` 兩個指令都寫）、rN.md 四節（原話、分類＝規則／個案、改了哪幾段、驗證）；「規則」類的項目只記在 rN.md 的「建議改規則」，不改 `shared/`（`OV/RL:L15-20`；AGENTS.md 規則 1）。
- **FR-037**：「剪乾淨」一節改成：觸發語＋「照 `.agents/skills/auto-edit-rough/SKILL.md`」＋本流程的硬規則（NG 定義一行、主軌多支要併進停點 ①、snap-srt 只跑一次、剪乾淨時不要做的事 4 條原樣保留 AGENTS.md:72-76）＋「剪乾淨的數字」表（auto-editor 門檻 `-20dB` 預設／放寬 `-26dB`、`-30dB`／收緊 `-16dB`，AGENTS.md:64；`--margin 0.15sec`，G16，002 FR-063；字幕每則 ≤ 18 字，AGENTS.md:66；snap-srt 異常條件：任一則起點調整 ≥ 1.2 s、超過一半的字幕被調整、或有則被收到 0.6 s 下限，02 W07 建議初值）；步驟細節（指令）移到 Skill。新工具（G01 章節空檔、G03 `media.mjs cutpoints`／`ng-snap`、G17 `media.mjs srt-split`）先寫占位「（指令照 `specs/contracts/cli-002.md`，第二輪補）」；`work/cuts.md` 兩張表的表頭照 stop-points.md §1（002 的 ng-snap／cutpoints 用表頭辨認）。
- **FR-038**：「剪好看」一節改成：觸發語＋Skill 路徑（`auto-edit-storyboard`→`-screen`→`-motion`→`-review`→`-deliver`）＋硬規則（倍率定之前不做分鏡；rough.srt 不重新轉錄；資訊卡和字幕不能擋臉和手勢；只有聲音的區間一定被 media 段或不透明全幕蓋住；我改 storyboard.md 後說「改好了」以檔案為準、超過上限先告訴我不要自己改；金句先列候選表讓我勾（G22）；先測試片段再整支；qc ✖ 修好再交、⚠ 逐項說明；回報貼 build 的「人聲響度」「剪接點微淡化」兩行與「音效比例」提醒）；四種版面名稱一行（疊加／半畫面／子母畫面／全幕，對照表在 SITUATIONS.md §2）；刪「照 USAGE.md 第 2 節的 SOP 做」（AGENTS.md:80）。
- **FR-039**：「子代理分工」一節標「（選用）」：沒有子代理時自己照 `auto-edit-motion` 一段一段做；子代理可以跑 `node shared/template/tools/build.mjs --check` 與 `node shared/template/tools/audit.mjs --only <自己的 id>`（只讀），不跑 build、snapshot、preview、render；收件用 `ls -l`（mtime 是今天）＋`cmp` 跟派工前備份不同（`VEP/FR:L78-90`）；優先序「派工訊息 > Skill」；子代理回報 ≤ 25 行；verifier 的回報格式照 REVIEW.md。
- **FR-040**：「剪輯台」一節：保留 AGENTS.md:130 的「剪輯台會改的地方」原文；停下來那句改成「停點 ⑤」；「調好了」之後照 `auto-edit-review` 流程 C。
- **FR-041**：「換風格」一節換成 02 §5.6 的改寫稿（能力探測、路由、沒裝不裝、沒登入不登入、三張圖先放暫存資料夾、停點 ⑥）；探測指令照 002 的 `caps.mjs`（占位，第二輪補）；HTML 路線照 004 的 `brand.mjs bg`（占位）。
- **FR-042**：「環境準備」一節加一行「照 `.agents/skills/auto-edit-setup/SKILL.md`」與「共用步驟 S4 會裝 9 支 auto-edit Skill」；其餘 4 條保留（AGENTS.md:142-145）。
- **FR-043**：「工具注意事項」：刪 AGENTS.md:149 前半「做成片前先把 USAGE.md 從頭讀完」（W01），改「USAGE.md、USAGE-reference.md 是查表用，Skill 會寫做到哪一步查哪一節」；AGENTS.md:150 改成子殼寫法（W15）；加一條「`npx hyperframes` 的版本照根目錄 `package.json`（0.8.221）；第一次先在根目錄跑 `npm install`」。
- **FR-044**：AGENTS.md 不設位元組上限（主代理 2026-10-31 裁決取消 ≤ 23,232 bytes）；每句都要是指令、判準或規則，不為了字數刪掉有用的內容。

### D. PROMPTS.md、README.md

- **FR-050**：PROMPTS.md §1（:37-46）：刪「思考深度可以調低」（W20）；「兩組 Skill」改「兩組外部 Skill＋本工作區 9 支 auto-edit Skill」。
- **FR-051**：PROMPTS.md §3（:82-88）改成「不用開 Plan 模式，AI 會在構圖倍率（停點 ②）、分鏡表（停點 ③）兩處自己停」；刪「思考深度調高」；§3a（:90-96）刪「先關閉 Plan 模式再送出」（G06、W20）。
- **FR-052**：PROMPTS.md §4（:122-131）「封裝成 Skill」整節換成「Skill 已內建」：說明 9 支 Skill 在環境準備 S4 就裝好了，怎麼確認（「+」→ Skills 看得到 `auto-edit-longform` 等）、看不到時說「幫我檢測環境」或執行 `node setup/install-skills.mjs`。
- **FR-053**：PROMPTS.md §5（:133-139）保留「用 auto-edit-longform 剪 projects/EP2」；新增一節「換 session 接著做」：提示詞「繼續 projects/［EP2］」。
- **FR-054**：PROMPTS.md「卡住的時候」：刪 :174、:175 兩列（Plan 模式）；新增至少 5 列：AI 停下來但沒說要回什麼（→「照 AGENTS.md 停點總表的格式重講」）、換 session 後不知道做到哪（→「繼續 projects/X」）、Skills 清單看不到 auto-edit（→「幫我檢測環境」）、AI 在同一步一直重試（→ 預算）、想一路做到 Studio（→「做到 Studio」）。
- **FR-055**：README.md：「裡面有什麼」表加「Skill 9 支（`.agents/skills/`）」「情境對照 `SITUATIONS.md`」「審查門檻 `REVIEW.md`」三列；「事前準備」的工具清單加 `npm install`；刪 FAQ「回覆之後，AI 還是只給計畫」（README.md:129，Plan 模式）。新工具（status、caps、observe、storyboard、look）的列在第二輪照各線 docs.md 補。

### E. G04 八處矛盾（style.md 為準，USAGE／R 改成「照 style.md」並刪掉舊數字）

| FR | 矛盾（02 G04） | 現況 | 改成 |
|---|---|---|---|
| **FR-060** | ① 開場張數 | style.md:64「不限張數」vs R:63、R:405「前 30 秒最多一張」、U:342 | style.md 保留「開場 30 秒不限張數」；R:63 刪、R6 開場列與 U:342 改「照 style.md（build 若還印這條 ⚠，回報時註明即可）」 |
| **FR-061** | ② 密度 | style.md:63「每 1–4 句」vs R:404「每 3–8 句」 | R6 密度列改「照 style.md 字卡文字」，刪「3–8 句」 |
| **FR-062** | ③ 露臉 | style.md:58「不用留露臉空檔」vs U:251「留 ≥ 3 秒露臉」、R:406、R:461、U:289、U:328 | U:251 刪那半句；R6 露臉列改「照 style.md 情境動畫優先（段與段直接接上）」；R:461「兩段之間講者照 R6 露臉 ≥ 3 秒」刪；U §4.1 範例與 §4.2 表的露臉 ⚠ 第二輪照 002 的 `rhythm` 輸出重寫 |
| **FR-063** | ④ 動作秒數 | style.md:51「進場 0.3–0.5、出場 0.3」vs R:414、R:616、SM:58（0.5／0.4） | style.md:51 改「進場 0.5 秒、出場 0.4 秒（模板固定，`SceneMotion` 的 `P.IN`／`P.OUT`；`specs/README.md` 定案）；透明卡外層再保險淡入 0.4 秒、淡出 0.4 秒」；R8 #15 改「位移 8–16px；秒數照 style.md」 |
| **FR-064** | ⑤ 條列進場 | style.md:48「一起進場」vs U:252「逐項 at」 | style.md:48 換成定案：「條列每條綁一句（`#N`）逐條進場；沒有句子可綁時每條相隔 ≥ 0.15 秒錯開；絕不整組同時出現」；U:252 改「照 style.md；`at` 寫法見本節表格」 |
| **FR-065** | ⑥ custom 數量 | R:440、R:461「越多越好、不設上限」vs `custom/x-before-after.html:13`、`x-numbers.html:14`「已有 2 段就改回第一層」 | style.md「情境動畫優先」加判準（W05）：「同時符合三條才做情境動畫：口播屬於 SITUATIONS.md 標『情境動畫』的情境；段長 ≥ 4 秒；同一個情境講了 ≥ 2 句字幕。不符合就用字卡（建議初值，02 W05）」；R7.1 的「數量」列與 :468 改「照 style.md」；兩支 custom 檔頭那一行請 003 刪 |
| **FR-066** | ⑦ 停點數 | U:18「兩個地方」vs AGENTS.md 六處 | U §1 第 5 條改「停點照 AGENTS.md 停點總表（①–⑥）」；U §2 SOP 表「停？」欄改寫停點編號 |
| **FR-067** | ⑧ 分鏡表存不存檔 | U:49「只寫在回覆裡」vs AGENTS.md:98-105 | U §2.1 整節換成三行：「不用 Plan 模式。在 Plan 模式裡只能做到列句號與挑情境；要寫檔（構圖預覽、暫時 plan.json、storyboard.md、截圖）時請使用者離開 Plan 模式再說一次。分鏡表一律存成 work/storyboard.md」 |

- **FR-068**：style.md 其他改動：「節奏」加一條完成態停留（`specs/README.md` 定案：新訊息完成態 ≥ 1.2 秒、段尾最後一幕 ≥ 1.5 秒、中間步驟可以 0.6 秒），R6「新訊息停留」列改「照 style.md」；「字卡文字」加文案傾向兩條＋各一組正反例（G25；`JY/CB:L89`）：具體實例優先（例：「提升效率」→「3 小時變 20 分鐘」）、動詞放前面（例：「字幕的校對」→「校對字幕」）；新增「審查門檻」一節（數字的唯一來源，REVIEW.md 引用）：閃動（元素出現 < 0.3 秒就消失、畫面只剩背景 > 0.3 秒）、同步（比口播早或晚 > 0.5 秒）、停留（完成態 < 1.2 秒、段尾最後一幕 < 1.5 秒）、音效（相鄰主音效 < 3 秒、章節轉場前後 2 秒內）、靜止（畫面 ≥ 8 秒幾乎不變）、無畫面空白（照 002 `--check` 的門檻）（02 §3「審查門檻」`VEP/RB:L33-40`、`VEP/FR:L145-146`；停留門檻改用定案的 1.2／1.5 秒，不用 VEP 的 1 秒）；「金句」：候選每集 ≤ 6 則（02 §1 #21 `JY/CB:L265` 金句音效全片 ≤ 6，建議初值）；「和其他文件衝突時」（:114-116）第二輪照 002 的 `rhythm` 改寫。
- **FR-069**：同一個 G04 項目改完後，U、R 裡不准再出現那個舊數字（SC-002 的 grep）。

### F. USAGE.md、USAGE-reference.md、EDITOR.md 其他改動

- **FR-070**：U 開頭（:7）「第一次用，先把這份從頭讀到尾」改「查表用：Skill 和 AGENTS.md 會寫做到哪一步查哪一節」（W01）。
- **FR-071**：U §2 SOP 表（:25-41）保留給沒有 Skill 的人看，第 1 列「讀完本檔與 style.md」改「看 AGENTS.md 停點總表」；步驟 3（字幕拆句）、步驟 4（分鏡截圖）、步驟 9 之後（觀影 pass）第二輪換成 002 `srt-split`、004 `qc.mjs storyboard`、`qc.mjs observe`。
- **FR-072**：U §2.3 分鏡表格式是格式的唯一定義：加「版面」欄（四個名稱，對照 SITUATIONS.md §2）、「需要我決定的事」固定含金句候選表（G22，欄位：候選｜句號｜原句｜卡上文字（≤ 14 字，style.md 8–14 字）｜情緒（正／負／中）｜要不要 ☐）；「音效」欄統一寫「預設」（W21，style.md:90）；AGENTS.md 剪好看只寫「格式照 U §2.3」。
- **FR-073**：R1.2 訊號表（R:37-63）搬到 SITUATIONS.md §3，R1.2 只留一行「訊號表在 `shared/template/SITUATIONS.md` §3」；R7.1「挑法」表（R:444-453）併進 SITUATIONS.md §3，R7.1 只留「第一層 vs 第二層」表與「判準照 style.md」。
- **FR-074**：R9 改兩節：R9.2「背景圖規格與留空區」（現有內容，刪最後一條「用你自己的生圖能力」）、R9.3「能力探測與生圖路由」（02 §5.5 的探測表、路由表、驗證表；探測指令第二輪換成 002 `caps.mjs`）；R12（:709-718）改成「Skill 已內建在 `.agents/skills/`；改 Skill 後跑 `node setup/install-skills.mjs`」；R13（:724）HyperFrames 版本改「照根目錄 `package.json`（0.8.221）」。
- **FR-075**：EDITOR.md §1（:13-24）、§6（:99-105）把「停下來等」改成「停點 ⑤」，§6 第 3 點改「照 `auto-edit-review` 流程 C」；006 的「講者」面板說明第二輪併入。

### G. 新檔 `shared/template/SITUATIONS.md`、`shared/template/REVIEW.md`

- **FR-080**：SITUATIONS.md §1「怎麼用」（分鏡表每一段查一次；版面欄只用四個名稱）。
- **FR-081**：SITUATIONS.md §2 四種版面對照表（W18）：AGENTS.md 名稱｜畫面長什麼樣｜情境 key／scene.json `family`｜custom `layout`｜fx `bg`｜講者在哪｜什麼時候用；內容取 AGENTS.md:102 與 01 §2.1–2.5、§8 P0-2、P0-3、P1-2。
- **FR-082**：SITUATIONS.md §3 情境訊號表：欄位「句子長這樣｜版面｜首選｜次選／條件｜動態（build 自動做／custom 範例）｜音效事件｜不要用在｜02 §1 #」；列數 ≥ 24，涵蓋 02 §1 的 #1–#28（#3「24 顆徽章」寫在 §5 不要做）與 R1.2 原有 21 列；工作區還沒有範例的（02 §1 #10、#12、#13、#15、#16，003 會補 5 支）先寫「還沒有範例 → 退回 <現有情境>」，第二輪改成新範例檔名。
- **FR-083**：SITUATIONS.md §4 版面接法表（01 §3.6）：前 → 後｜build 自動做什麼｜AI 要做什麼；§4 末尾寫旁白段規則（01 §8 P0-6：只有聲音的每一秒都要被錄影或不透明全幕蓋住）。
- **FR-084**：SITUATIONS.md §5 不要做的事（02 §6 動態語彙列、01 §2.9「不加黑底壓暗講者」）；SITUATIONS.md 全檔**不定義新數字**：秒數、字數一律寫「照 style.md 〈節名〉」。
- **FR-085**：REVIEW.md §1 什麼時候用（`auto-edit-review` 流程 A 自查、回饋輪收尾、verifier 子代理）。
- **FR-086**：REVIEW.md §2 審查門檻表：項目｜門檻（照 style.md「審查門檻」）｜怎麼量（指令＋看哪張圖）｜等級（P0／P1／P2）；至少 6 類：閃動、同步、停留、音效、無畫面空白、靜止；另加擋臉／壓手勢、字幕一行 ≤ 18 字、文字斷在詞中間（U §2.5 既有的看法）。
- **FR-087**：REVIEW.md §3 觀影 pass 步驟：`snapshot --review` 看 `review-beats.jpg`、`review-seam-NN.jpg`、`review-phone.jpg`（U §2.5）→ 004 `qc.mjs observe`（占位，第二輪補）看 0.5 秒總表與靜止區間。
- **FR-088**：REVIEW.md §4 回報格式：每個問題一行 `[P0/P1/P2] mm:ss.s（段 id） 問題｜證據（截圖檔名）｜修法`，最後一段「我確認沒問題的部分」；每段一列 PASS／FAIL 表；子代理 ≤ 25 行（`VEP/RB:L9-50`）。P0＝擋臉、字被切或撐破、無畫面空白、字幕錯字或對不上嘴；P1＝停留、同步、音效密度；P2＝其他觀感。
- **FR-089**：REVIEW.md §5 交付前驗收清單（02 §3「驗收清單」工作區版）：`--check` 0 ✖、`audit.mjs` 0 ✖、snapshot 看過、`qc.mjs final` 0 ✖、⚠ 逐項說明、本輪 rN.md 寫完。

### H. 文件一致性測試 `dev/tests/docs.test.mjs`

- **FR-090**：用 `node:test`，零依賴，`node --test dev/tests/docs.test.mjs` 在 Mac 與 Windows 都能跑（不呼叫 shell；工具 `--help` 用 `child_process.execFileSync(process.execPath, [...])`）。
- **FR-091**：**門檻數字找得到出處**：掃 9 支 SKILL.md（含 references）、U、R、SITUATIONS.md、REVIEW.md 的非 code block 文字，抽出「比較詞＋數字＋單位」（數字前的 `≥ ≤ < > 最多 至少 超過 不到 上限 下限`、數字後的 `以內 以上 以下`；單位 `秒|s|毫秒|ms|px|字|句|段|則|張|顆|次|倍|dB|LUFS|dBTP|%|行`，數字和單位之間可以有「個」）與「範圍＋單位」（`數字–數字 單位`）；每一組（數字＋單位，單位 s／秒、ms／毫秒視為同一個）都要出現在 AGENTS.md、`shared/style.md` 或任一工具 `--help` 輸出裡；否則必須列在 `dev/tests/docs-allow.json`（每筆要有 `file`、`text`、`reason`）。失敗訊息印「檔名:行號 數字 單位 → 寫進 style.md 或 AGENTS.md，或加進 docs-allow.json 並寫理由」。
- **FR-092**：**`--help` 的子指令文件裡出現過**：解析 `build.mjs`、`media.mjs`、`qc.mjs`、`audit.mjs`、`editor.mjs`、`brand.mjs`、`setup/install-skills.mjs` 與第二輪的新工具 `--help` 裡每一行 `node <路徑>.mjs <子指令或第一個旗標>`，每一組都要在 AGENTS.md、U、R、EDITOR.md 或任一 SKILL.md 出現至少一次。
- **FR-093**：**文件裡的指令檔案存在**：掃 AGENTS.md、PROMPTS.md、README.md、U、R、EDITOR.md、SITUATIONS.md、REVIEW.md、setup/*.md、9 支 SKILL.md 與 references 裡的 `node <路徑>`、`bash <路徑>`、`shared/template/custom/x-*.html`、`references/<檔>.md`，路徑都要存在（references 相對該 Skill 資料夾）。
- **FR-094**：**Skill 結構**：FR-002（frontmatter）、FR-003（≤ 200 行）、FR-004（開頭表頭）、FR-005（必要標題）、FR-007（hyperframes 指令是子殼寫法；沒有 `/Users/`、`C:\`、`~/`，`auto-edit-setup` 例外）、FR-013（開頭兩行）各一個測試。
- **FR-095**：**停點一致**：stop-points.md §7 的四條。
- **FR-096**：**G04 八項**：每一項一個斷言（FR-060–FR-067 的舊字串不在 U、R；新字串在 style.md）。
- **FR-097**：所有失敗訊息照憲法 III.4 帶「→ 改 …」。
- **FR-098**：AGENTS.md 與 `auto-edit-rough` 裡每一行剪乾淨的 `auto-editor` 指令都帶 `--margin 0.15sec`（002 spec「請 00N 加」對 001 的第 2 列）。

### I. 契約

- **FR-100**：`specs/contracts/stop-points.md`（本線寫，全部照做）。
- **FR-101**：`specs/contracts/cli-001.md`（install-skills）。

### 請 00N 加（不是 001 的檔案；第二輪整合時用）

**全部工作線**：各線的 `specs/<編號>-*/docs.md` 用同一個格式交件，001 才能照原文併進文件與 Skill 退路表：
1. 指令原文（從工作區根目錄、帶 `--project projects/<專案>`）與 `--help` 原文；
2. 成功時印出的關鍵行原文（AI 要看哪一行判斷完成）；
3. 每個 ✖／⚠ 訊息原文與 `→` 後面的修法；
4. 建議放進哪份文件哪一節（AGENTS.md 節名、U／R 節號、哪支 Skill 哪一步）；
5. 新數字＋單位＋出處；要成為規則的數字請寫「請 001 寫進 style.md 〈節〉」，不要自己寫進 USAGE。

**已收到的回覆（2026-10-31）**：002 在 `specs/002-pipeline-timing/spec.md`「回覆 001 的問題」答覆了下表 002 的第 1、4、5、6 列（`status.mjs` 印 5 行＋`依據：`；`rhythm` 原文在 002 `docs.md` §3；子代理可以跑 `--check`；`npx` 會用根目錄 0.8.221）；004 的 `specs/contracts/cli-004.md` 已涵蓋下表 004 的前 4 列，指令名稱和本線暫定的相同（`qc.mjs storyboard`、`qc.mjs observe`、`brand.mjs bg --html <檔> --kind fs|side|ch`、framing「建議」欄）。下表保留原樣當第二輪的驗收清單，逐列打勾。

| 給誰 | 要加什麼 | 為什麼（哪個 FR 用到） |
|---|---|---|
| 002 | `status.mjs --project` 印三行固定原文：`目前在：<階段>`、`下一步：<一句話>`、`待回覆停點：<①–⑥ 名稱｜無>`；判斷停點時讀 `work/製作進度.md` 的 `## 停點紀錄` 表（格式 stop-points.md §4，同一停點以最後一列為準）；另印 `下一輪回饋編號：r<N>`；有 `--json` | FR-036、US4、`auto-edit-longform` 步驟 2、`auto-edit-review` 流程 B |
| 002 | `caps.mjs` 的輸出格式（能力｜結果｜依據三欄，02 §5.5 能力表）與 `--json` | FR-041、FR-074、`auto-edit-style` |
| 002 | `media.mjs cutpoints`、`ng-snap`、`srt-split` 與章節空檔（G01 `--add-in` 範圍）各自的指令、印出的調整表與 `→` 修法，寫進 `cli-002.md` | FR-037、`auto-edit-rough` 步驟 5–7 |
| 002 | `rhythm` 設定的欄位名、值、會關掉哪幾條 ⚠（G04 ① ③），以及關掉後 `--check` 範例輸出原文 | FR-060、FR-062、U §4.1 範例重寫 |
| 002 | 確認多個子代理同時跑 `build.mjs --check`（只寫 `.cache/`）不會互相寫壞快取；會的話給「子代理不要跑 --check」的結論 | FR-039 |
| 002 | 確認 `(cd projects/<專案>/work/hyperframes && npx hyperframes …)` 用的是根目錄 `node_modules` 的 0.8.221（npm 往上找 `package.json`／`node_modules` 的行為），不會因為子資料夾而下載別的版本 | FR-043、FR-022 |
| 002 | `--check --json` 的 `uncovered[]`、`chapters[]` 欄位定案（`contracts/check-json.md`） | `auto-edit-screen` 完成判準 |
| 003 | 刪 `shared/template/custom/x-before-after.html:13`、`x-numbers.html:14` 的「一集已經有 2 段 custom：改回第一層」 | FR-065、SC-002 |
| 003 | 5 支新範例各自的「適用口播／畫面上發生什麼／要改的地方」三欄文字（照 R7.5 表格式），以及 `P.at`／`P.focus`／`P.type` 的方法表列（照 R7.3 表格式）；範例檔頭的時間軸寫法改 `P.at`，不再教手算相減（R:543） | FR-082、R7.3、R7.5、`auto-edit-motion` 步驟 3 |
| 003 | audit 新規則（G08、G12）的 ✖／⚠ 原文與修法 | `auto-edit-motion`、`auto-edit-review` 退路表 |
| 004 | `qc.mjs framing` 的倍率表加「建議」欄，規則寫在 `--help`：不切到手勢、來源像素放大 ≤ 3.5 倍中最大的倍率；640×360 這類來源上限 1.15（02 W06；style.md:9；AGENTS.md:87） | 停點 ② 的「不用停」預設、`auto-edit-storyboard` 步驟 1 |
| 004 | `qc.mjs storyboard` 的輸出路徑（`work/storyboard-preview/<id>.png`、條列 `<id>-<n>.png`）與印出的 `![s01](storyboard-preview/s01.png)` 行原文 | FR-072、停點 ③ 完成判準 |
| 004 | `qc.mjs observe` 的輸出檔、關鍵行（靜止區間、接縫條帶）原文 | FR-087、REVIEW.md |
| 004 | `brand.mjs --help` 印完整用法（目前只印 `用法：node shared/template/tools/brand.mjs "#1B7F4B"`），含 `bg --html <檔> --kind fs\|side\|ch` | FR-092、FR-074、`auto-edit-style` |
| 004 | media 段新欄位（`callouts`、`spot`、`steps`、`arrows`、`marks[].path`）在 U §5、R2.5 要加的列 | `auto-edit-screen` 步驟 4 |
| 005 | style.md「音效」表（:92-105）的新列（click／sparkle／shine／thunder／chapter／bgm）、`maxPerVideo` 數字、「上限人聲下 3 dB」的寫法、結尾配樂怎麼寫進 plan.json | style.md 音效節、`auto-edit-storyboard` 步驟 5 |
| 006 | style.md 新「講者畫面」一節的文字（預設 color 0.8、slim 0.6，`specs/README.md` 定案）、EDITOR.md「講者」面板說明、`look.mjs preview` 在流程哪一步跑（建議放在停點 ② 之前或同一停） | style.md、EDITOR.md、`auto-edit-storyboard` |
| 007 | `dev/check-all.mjs` 第 2 步跑 `node --test dev/tests/docs.test.mjs`；`dev/loop/round-N.md` 範本有「停點最後一行逐字符合（①②③）」「各階段工具呼叫數 vs AGENTS.md 階段預算」「是否要求 Plan 模式」三欄 | SC-005 |

### 需要主代理裁決

1. **契約檔名**：`specs/README.md` 契約表寫 `contracts/cli.md`（每條工作線各加一節），派工訊息寫 `cli-001.md`／`cli-00N.md`。本線先寫 `cli-001.md`；請統一。
2. **`.agents/skills/` 的權限**：派工訊息寫「作者維護用，剪片時不要讀／Skill 原始檔」。本 spec 主張 `.agents/skills/` 改成「**只能讀**，剪片時照它做、不要改」，因為 AGENTS.md 要直接指路到原始檔（Edge Case 第 1 條：MiniMax 可能讀不到專案層 Skill）；`.specify/`、`specs/` 才是「剪片時不要讀」。
3. **AGENTS.md 變薄**：流程細節（指令）搬進 Skill，AGENTS.md 只留觸發語、Skill 路徑、硬規則與數字表（FR-037、FR-038）。這樣沒有載入 Skill 的平台一定要讀 SKILL.md 才知道指令。替代方案是 AGENTS.md 保留指令清單（重複、容易漂移）。
4. **docs.test 的數字來源**：憲法 IV 只寫「在 AGENTS.md／style.md 找得到」；本 spec 把**工具 `--help` 輸出**也算來源（工具定義的門檻，例 `qc.mjs final` 的 −15.5～−12.5 LUFS），另加 `docs-allow.json` 白名單。請確認可以這樣解讀。照憲法字面，R8 的版面門檻（#4 邊框 2px、#5 字級 52／72／38px、#6 間距 40px、#15 位移 8–16px）與 R7.3 版面原則（10 字以內）也要搬進 style.md「動畫視覺」；本 spec 預設**搬**（T021 逐筆判斷），白名單只留工具原文與說明性數字。
5. **REVIEW.md、SITUATIONS.md 在優先序的位置**：憲法 III.7 沒列。建議和 USAGE-reference.md 同一層；審查門檻數字放 style.md（FR-068），REVIEW.md 只寫量法與格式。
6. **`dev/tests/install-skills.test.mjs`** 不在 001 的所有權表；請加給 001，或改成併進 `docs.test.mjs`。
7. **沒有分配的 02 項目**：W11（`--check` 對 8–14 字主句 ⚠）、W07（snap-srt 異常條件）不在任何工作線。本 spec 只把 W07 的數字寫進 AGENTS.md 當「回報時列出」的條件（不新增停點）；W11 這輪不做，除非主代理指派。G16 已由 002 FR-063 接手（ng-snap 印的指令固定帶 `--margin 0.15sec`），本線寫進 AGENTS.md 數字表並用 docs.test 檢查（FR-098）。
8. **「露臉」的另一半**：01 §8 P1-3 有「全幕之間的露臉 ≥ 3 秒」的剪映實測（esim 最小 4.1 秒），和 style.md:58「不用留露臉空檔」在不透明全幕的情況下不完全一樣。本 spec 照 G04 以 style.md 為準、不加這條；要不要另立「兩段全幕之間」的規則請作者決定。
9. **預算數字**（FR-034）除了 AGENTS.md:76 的 10 次與 02 W19 的四個，其餘是本 spec 提的建議初值。
10. **`work/rough.srt` 怎麼產生**：現行 AGENTS.md:66 只寫「重新轉逐字稿，存成 work/rough.srt」，沒有指令；HyperFrames 0.8.221 的 `transcribe --help` 有 `--to srt -o <路徑>` 與 `--preserve-cues`（給 CJK）。要不要把這個指令寫進 `auto-edit-rough`，需要先實測中文斷句（建議由 002 在 `srt-split` 一起處理）。

### Key Entities

- **Skill**：`.agents/skills/auto-edit-<名稱>/`，`SKILL.md`＋`references/*.md`；安裝後的複本有 `.auto-edit-install.json` 標記檔。
- **停點**：①–⑥，屬性：觸發步驟、完成判準、最後一行原文、可回的話、寫回位置、能不能略過（stop-points.md）。
- **製作進度**：`work/製作進度.md`，含開工決策表、階段表、停點紀錄表（機器可讀）、回饋輪索引。
- **回饋輪**：`work/回饋/r<N>.md`＋`work/hyperframes/plan.json.bak-r<N>`，N 從 1 起連號。
- **金句候選**：storyboard.md「需要我決定的事」裡的一張表，作者勾了才進 plan.json。
- **門檻數字**：只在 AGENTS.md／style.md／工具 `--help` 定義；其他文件引用。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：`node --test dev/tests/docs.test.mjs` 0 個失敗，測試案例 ≥ 16 個（FR-091–FR-098 每條至少 1 個，FR-096 八個）；`docs-allow.json` ≤ 40 筆且每筆都有 `reason`（40 是建議初值）。
- **SC-002**：docs.test 的 G04 八個斷言（剝掉 code block 與反引號內的工具原文後比對）0 失敗；人工複查用 `grep -nE "3–8 句|最多一張|≥ 3 秒露臉|兩段之間留|2 段 custom|進場 0\.3–0\.5|一起進場|兩個地方一定要停|只寫在回覆裡|從頭讀到尾" AGENTS.md shared/style.md shared/template/USAGE.md shared/template/USAGE-reference.md shared/template/custom/*.html`，2026-10-31 現況有 15 行命中，改完只能剩工具訊息原文的引用（U:286 範例輸出、U:342 表格第一欄，前提是 002 還保留那則 ⚠ 訊息）；custom 那兩行由 003 刪。
- **SC-003**：9／9 支 SKILL.md ≤ 200 行；frontmatter 欄位 ⊆ {name, description, version}。
- **SC-004**：`install-skills.test.mjs` cli-001 §2 的 9 個案例全過；Mac 實機 `node setup/install-skills.mjs` 第一次 `新裝 18`、第二次 `沒變 18`、`--check` 結束碼 0；Windows 實機跑一次（沒有 Windows 機器時在 `dev/loop/round-N.md` 標「Windows 未驗」）。
- **SC-005**：弱模型試跑（憲法檢查迴圈第 3 步）：只讀 AGENTS.md 與 Skill，從「剪乾淨」到停點 ③，三個停點（①②③）的最後一行 3／3 逐字符合 stop-points.md §2.1；要求使用者切 Plan 模式 0 次；每階段工具呼叫數不超過 AGENTS.md 階段預算；停點回覆以外、使用者為了救場多打的提示 ≤ 2 次（建議初值）。
- **SC-006**：停點 ③ 待回覆時換 session 說「繼續 projects/範例」，≤ 3 次工具呼叫內重貼 ③ 那一行（需要 002 `status.mjs`；沒有時用退路表手動判斷，≤ 5 次）。
- **SC-007**：AGENTS.md 每一句都是指令、判準或規則（沒有位元組上限）。
- **SC-008**：AGENTS.md、PROMPTS.md、U、R、9 支 SKILL.md 裡出現「Plan 模式」的行，100％ 同一行有「不用」「不需要」「不要」之一（stop-points.md §7 第 4 條）。
- **SC-009**：PROMPTS.md「卡住的時候」表 0 列要求使用者切換 Plan 模式，新增列 ≥ 5。
- **SC-010**：兩輪回饋後 `work/回饋/r1.md`、`r2.md`、`plan.json.bak-r1`、`plan.json.bak-r2` 4 個檔都在，rN.md 四節齊全（US5）。
- **SC-011**：SITUATIONS.md §3 ≥ 24 列，每列的「02 §1 #」欄有值；02 §1 #1–#28 每一個編號都出現在 §3 或 §5。
- **SC-012**：REVIEW.md §2 至少 6 類門檻，每類都有可複製的量法指令或「看哪張圖」；門檻數字 100％ 能在 style.md「審查門檻」找到（docs.test FR-091 會擋）。

## Assumptions

- MiniMax Code 讀 `~/.minimax/skills/`（`PROMPTS.md:127`、`setup/check.ps1:364`），frontmatter 用 `name`／`description`／`version` 的最小交集可以解析（02 §8 第 1 條：沒有官方文件，未驗證）。
- Claude Code 讀 `<工作區>/.claude/skills/`；`.claude/` 已在 `.gitignore`，所以安裝的複本不進 git，原始檔 `.agents/skills/` 進 git（02 §5.4）。
- 002 會在根目錄加 `package.json` 釘 `hyperframes` 0.8.221（`specs/README.md` 定案），`npm install` 只裝這一個依賴；setup 文件只負責加步驟與驗證。
- 其他工作線的新工具名稱暫用 02 的寫法（`status.mjs`、`caps.mjs`、`media.mjs cutpoints／ng-snap／srt-split`、`qc.mjs observe／storyboard`、`brand.mjs bg`），第二輪以 `cli-00N.md` 為準。
- 這一輪不改任何既有檔案；本 spec 的改動清單在 plan.md，實作在下一輪。
- 跨集學習（G23）這次不做（`specs/README.md` 定案）；封面、短片 Skill（G26）不在這一輪。
