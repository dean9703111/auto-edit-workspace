# Implementation Plan: 001 skills-docs

**Branch**: `001-skills-docs` | **Date**: 2026-10-31 | **Spec**: `specs/001-skills-docs/spec.md`

**Input**: `specs/001-skills-docs/spec.md`、`skill-outline.md`、`specs/contracts/stop-points.md`、`specs/contracts/cli-001.md`

## Summary

把工作區的「規則」「SOP」「計算」分開（憲法 I）：AGENTS.md 只留規則、停點總表、數字表與「我說 X → 照哪支 Skill」；9 支 `auto-edit-*` Skill 放每一階段的指令、完成判準、停點、退路；跨階段知識集中到 `shared/template/SITUATIONS.md`、`REVIEW.md`；8 處矛盾以 style.md 為準清掉；`setup/install-skills.mjs` 把 Skill 複製到 Claude Code 與 MiniMax Code；`dev/tests/docs.test.mjs` 鎖住單一真相。這一輪只寫規格；實作分兩輪：第一輪做本線自己能完成的部分，第二輪等 002–007 的 `cli-00N.md`／`docs.md` 把暫定指令換成原文。

## Technical Context

**Language/Version**: Markdown（繁體中文、技術名詞英文、中英間半形空格）；Node.js ≥ 22（`install-skills.mjs`、`docs.test.mjs`；R12 寫 ≥ 22，R13 實測 24.16.0）；bash（`check.sh`）、PowerShell 5.1+（`check.ps1`）。

**Primary Dependencies**: 無新依賴。`install-skills.mjs` 只用 `node:fs`、`node:path`、`node:os`、`node:url`、`node:crypto`；`docs.test.mjs` 只用 `node:test`、`node:assert`、`node:fs`、`node:path`、`node:child_process`（呼叫工具 `--help`）。根目錄 `npm install` 只裝 002 釘的 `hyperframes@0.8.221`（`specs/README.md` 定案）。

**Storage**: 檔案。新增 `work/製作進度.md`、`work/回饋/r<N>.md`、`work/hyperframes/plan.json.bak-r<N>`（專案內，AI 寫）；安裝標記檔 `.auto-edit-install.json`（安裝位置內）。

**Testing**: `node --test dev/tests/docs.test.mjs`、`node --test dev/tests/install-skills.test.mjs`（所有權待主代理確認，spec 裁決第 6 條）；憲法檢查迴圈第 3 步弱模型試跑（007 的 `dev/loop/round-N.md`）。

**Target Platform**: macOS 15（zsh，作者 M1 Max 實測環境，R13）＋ Windows 10/11（PowerShell；`setup/windows.md`）。AI 端：MiniMax Code（`~/.minimax/skills/`）、Claude Code（`<工作區>/.claude/skills/`）。

**Project Type**: 文件＋兩支小型 Node 腳本（安裝、測試）。

**Performance Goals**: `install-skills.mjs` 9 支 × 2 位置 < 2 秒（只是複製數十個小檔，建議初值）；`docs.test.mjs` < 10 秒（含 7 支工具 `--help`，建議初值）。

**Constraints**: SKILL.md ≤ 200 行（02 §7.2 原則 7）；AGENTS.md ≤ 23,232 bytes（不比 2026-10-31 現況大）；階段回報 ≤ 15 行、子代理 ≤ 25 行（憲法 III.5）；不擁有的檔案不改（`specs/README.md` 所有權表）。

**Scale/Scope**: 新增 9 支 SKILL.md＋8 個 reference、2 份 shared 新文件、2 支腳本、2 份契約；改寫 13 份既有文件（AGENTS、PROMPTS、README、style、U、R、EDITOR、setup/README、troubleshooting、mac、windows、check.sh、check.ps1、dev/README）。

## Constitution Check

*GATE：Phase 0 前與設計後各檢查一次。*

| 原則 | 本計畫怎麼做 | 結果 |
|---|---|---|
| I. AGENTS.md 是規則、Skill 是 SOP、工具做計算 | AGENTS.md 流程節只留規則＋Skill 路徑＋數字表（§4.2）；Skill 不複製規則數字，只貼「這一步用、工具不檢查」的並標出處（FR-011）；要算的（剪接點、拆句時間、截圖時刻）都指向 002／004 的工具，工具還沒有時 Skill 給公式＋算好的例題（skill-outline rough 退路表、storyboard 退路表） | ✅ |
| II. 零依賴、跨平台 | 兩支腳本只用 Node 內建模組；`path.join`、`os.homedir()`、不呼叫 shell；Skill 指令 Mac／Windows 不同時兩個都寫；帶逗號參數加引號 | ✅ |
| III. 弱模型優先 | 決策表條件只放可觀察事實（skill-outline 路由表、素材決策表）；每步三件事（FR-006）；退路表照工具原文（FR-009）；預算與回報上限（FR-010、FR-014、FR-034）；不依賴 Plan 模式（G06）、子代理標選用（FR-012）；優先序寫在每支 Skill 開頭（FR-013） | ✅ |
| IV. 單一真相 | 門檻只在 AGENTS.md／style.md（工具門檻在 `--help`）；U、R 改「照 style.md」並刪舊數字（FR-060–FR-069）；R1.2、R7.1 挑法表搬進 SITUATIONS.md 不留副本（FR-073）；docs.test FR-091 擋漂移 | ⚠ 需要主代理確認「工具 `--help` 也算來源」（spec 裁決第 4 條） |
| V. 停點固定、流程自己保證 | stop-points.md 定義六個停點、最後一行原文、「不用停」；AGENTS.md 停點總表；docs.test FR-095 | ✅ |
| VI. 可驗證交付 | 每支 Skill 的完成判準與自我核對；兩支腳本都有測試；REVIEW.md 交付驗收清單 | ✅（`install-skills.test.mjs` 所有權待定） |
| VII. 授權乾淨 | 文件不教人複製剪映素材；音效表第二輪照 005 的 `contracts/sfx.md` | ✅ |
| VIII. 不擴張範圍 | G16、W11 不做（spec 裁決第 7 條）；封面／短片 Skill（G26）、跨集學習（G23）不做；README 只改與 Skill、Plan 模式有關的列 | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/001-skills-docs/
├── spec.md
├── plan.md              # 本檔
├── skill-outline.md     # 9 支 Skill 大綱（取代 template 的 data-model.md）
└── tasks.md
specs/contracts/
├── stop-points.md       # 001 寫，全部照做
└── cli-001.md           # install-skills
```

### Source（工作區根目錄；★ 新增、✎ 改寫）

```text
.agents/skills/                              ★
├── auto-edit-longform/SKILL.md、references/progress-template.md
├── auto-edit-setup/SKILL.md
├── auto-edit-rough/SKILL.md、references/ng-rules.md
├── auto-edit-storyboard/SKILL.md、references/storyboard-template.md
├── auto-edit-screen/SKILL.md
├── auto-edit-motion/SKILL.md、references/worker-report.md
├── auto-edit-review/SKILL.md、references/feedback-round.md、references/reviewer-brief.md
├── auto-edit-deliver/SKILL.md
└── auto-edit-style/SKILL.md、references/image-routing.md
AGENTS.md ✎   PROMPTS.md ✎   README.md ✎
shared/style.md ✎
shared/template/USAGE.md ✎   USAGE-reference.md ✎   EDITOR.md ✎
shared/template/SITUATIONS.md ★   REVIEW.md ★
setup/install-skills.mjs ★   setup/README.md ✎   troubleshooting.md ✎   mac.md ✎   windows.md ✎   check.sh ✎   check.ps1 ✎
dev/README.md ✎   dev/tests/docs.test.mjs ★   dev/tests/docs-allow.json ★   dev/tests/install-skills.test.mjs ★（所有權待定）
```

**Structure Decision**：Skill 原始檔放 `.agents/skills/`（作者 agent-skills repo 的慣例，02 §5.4），進 git；安裝複本在 `.claude/`（已 gitignore）與 `~/.minimax/skills/`。AGENTS.md 直接指路到原始檔（spec Edge Case 第 1 條）。

## §4 檔案清單與改動點

### 4.1 新增檔案

| 檔案 | 內容 | 上限 | 來源 |
|---|---|---|---|
| `.agents/skills/auto-edit-*/SKILL.md` ×9 | skill-outline.md §2–§10 | 每支 ≤ 200 行 | 02 §5.2–5.4、§7.2–7.3 |
| `auto-edit-longform/references/progress-template.md` | `work/製作進度.md` 範本：開工決策表 6 欄（怎麼看、預設值）、階段表、`## 停點紀錄`（stop-points.md §4 表頭逐字）、`## 回饋輪` 索引、「產物 → 階段」對照表 | ≤ 80 行 | G10、G24；`VEP/T:L5-100` |
| `auto-edit-rough/references/ng-rules.md` | NG 判斷 3 條＋正反例；cuts.md 三張表的範本 | ≤ 60 行 | AGENTS.md:61、:74；G01 |
| `auto-edit-storyboard/references/storyboard-template.md` | storyboard.md 骨架（可複製）＋金句候選表 | ≤ 80 行 | AGENTS.md:98-105；U §2.3；G22 |
| `auto-edit-motion/references/worker-report.md` | 子代理回報格式 ≤ 25 行＋範例 | ≤ 40 行 | `OV/WB:L109-126`；AGENTS.md:115 |
| `auto-edit-review/references/feedback-round.md` | 回饋輪步驟、rN.md 範本四節、規則 vs 個案判斷表、編號與備份規則 | ≤ 80 行 | 02 §3「回饋輪」；`VEP/FR:L171-175`；`OV/RL:L15-20` |
| `auto-edit-review/references/reviewer-brief.md` | verifier 派工說明（選用）；門檻與格式引用 REVIEW.md | ≤ 50 行 | `VEP/RB:L9-50` |
| `auto-edit-style/references/image-routing.md` | 三條生圖路的 Mac／Windows 指令、驗證 ffmpeg 指令 | ≤ 90 行 | 02 §5.5 |
| `shared/template/SITUATIONS.md` | §1 怎麼用；§2 四種版面對照；§3 情境訊號表（≥ 24 列，含 R1.2 原 21 列、R7.1 挑法 8 列、02 §1 #1–#28）；§4 版面接法＋旁白段；§5 不要做 | ≤ 160 行 | 01 §2、§3.6、§8；02 §1、§6；AGENTS.md:102；R1.2；R7.1 |
| `shared/template/REVIEW.md` | §1 什麼時候用；§2 審查門檻表（數字照 style.md）；§3 觀影 pass；§4 回報格式；§5 交付驗收清單 | ≤ 100 行 | 02 §3「審查門檻」「觀影 pass」「驗收清單」；`VEP/RB:L33-40` |
| `setup/install-skills.mjs` | cli-001.md | ≤ 250 行 | 02 §5.4 |
| `dev/tests/docs.test.mjs` | §4.11 | — | 憲法 IV |
| `dev/tests/docs-allow.json` | `[{ "file", "text", "reason" }]`，起始 0 筆，實作時才補 | ≤ 40 筆 | FR-091 |
| `dev/tests/install-skills.test.mjs` | cli-001.md §2 九個案例 | — | 憲法 VI |

### 4.2 AGENTS.md（逐節；改後的節順序就是這張表的順序）

| # | 節 | 改前（行號、要點） | 改後要點 | FR |
|---|---|---|---|---|
| 1 | 標題 | :1 | 不變 | — |
| 2 | **怎麼用這份檔**（新） | 沒有 | 一段：每個流程有一支 Skill，原始檔在 `.agents/skills/<名稱>/SKILL.md`，已安裝的是同一份、有出入以原始檔為準；9 列「我說 → 照這支 Skill」表；規則衝突優先序一行（憲法 III.7） | FR-030 |
| 3 | 專案 | :3-21 一個專案、只處理一個、樹狀圖 | 不變；加一句「換一個 session 說『繼續』：照 `auto-edit-longform`」 | FR-030 |
| 4 | 資料夾 | :23-33 七列 | 加 `.agents/skills/`（只能讀；剪片照它做，不要改）、`.specify/`＋`specs/`（作者維護用的規格，剪片時不要讀）兩列；其他列不變 | FR-031 |
| 5 | 規則 | :35-43 規則 1–7 | 1 不變；2「提示詞裡寫停下來…四個」→「停點只有六個，照『停點總表』；最後一行照固定格式；『不用停』『跑到停點 N』才連跑」；3、4、6 不變；5「USAGE 與 style.md 為準；有衝突時先問我」→ 優先序「使用者當下的話 > AGENTS.md > style.md > USAGE.md > USAGE-reference.md > Skill；同一層互相矛盾才問我」；7 加 `work/製作進度.md`、`work/回饋/r<N>.md`、`plan.json.bak-r<N>`，結尾改「之後修改、換 session 接續都會用到」；**新 8**：回報 ≤ 15 行、子代理 ≤ 25 行、超過階段預算就停 | FR-032 |
| 6 | **停點總表**（新） | 散在 :38、:62、:87、:98、:106、:128、:137 | stop-points.md §1 六列（停點｜在哪一步｜給我看什麼｜我可以回｜決定寫回哪裡）＋§2.1 六行原文＋§5「不用停」四種說法、⑤ ⑥ 不能略過、略過時採用什麼 | FR-033 |
| 7 | **階段預算**（新） | 只有 :76 一條（10 次） | 一張表，全部標「建議初值」：總指揮接手 3、剪乾淨到 ① 10、構圖到 ② 6、分鏡到 ③ 25、每支錄影 6、每段情境動畫 15、回饋每一項 6、交付 12（render log 另計 20）、換風格 15（單位：工具呼叫次數；出處 AGENTS.md:76、02 W19、本 spec）；環境準備同一步失敗 2 次就停（`setup/README.md` 原則 8） | FR-034 |
| 8 | **開工**（新，G24） | 沒有 | 開工決策表 6 欄（skill-outline §2 那張表，含「怎麼看」「會影響什麼」；長度欄寫「< 3 分鐘（180 秒）」）；寫進 `work/製作進度.md` 開頭 | FR-035 |
| 9 | **進度與回饋紀錄**（新，G10） | 沒有（Studio 回饋直接改 plan.json，:106） | `work/製作進度.md` 固定四節；停點紀錄格式指向「停點總表」；回饋輪：編號規則＋例題、改前 `cp`／`Copy-Item` 成 `plan.json.bak-r<N>`、rN.md 四節、「規則」類只記不改 `shared/` | FR-036 |
| 10 | 開新專案 | :45-51 三步 | 不變；第 3 步加最後一行格式 `→ 下一步：素材放好後說「剪乾淨」` | stop-points §1 |
| 11 | 剪乾淨 | :53-76 七步（指令全文、cutpoints 手算公式、snap-srt）＋不要做的事 4 條 | 觸發語＋「照 `auto-edit-rough`」；硬規則 4 條（NG 定義一行；多支主軌併進 ①；snap-srt 只跑一次；校正照規則 4）；「剪乾淨的數字」表（`-20dB`／`-26dB`／`-30dB`／`-16dB`、`--margin 0.15sec`（002 FR-063）、每則 ≤ 18 字、snap-srt 異常條件 1.2 秒／一半／0.6 秒、到 ① ≤ 10 次）；「不要做的事」:72-76 原文保留；:68 的 cutpoints 手算公式刪掉（交 002 `media.mjs cutpoints`，Skill 退路表留公式例題）；新工具三處寫占位「指令照 `specs/contracts/cli-002.md`（第二輪）」 | FR-037 |
| 12 | 剪好看 | :78-107 前置＋八步（構圖、speakerBox、media、情境動畫、音效、分鏡表格式、Studio、輸出），:80「照 USAGE §2 SOP」 | 觸發語＋Skill 順序（storyboard → screen → motion → review → deliver）；硬規則 10 條（spec FR-038 列的）；四種版面名稱一行＋「對照表在 SITUATIONS.md §2」；「剪好看的數字」表（構圖：來源像素放大 ≤ 3.5 倍、640×360 來源 ≤ 1.15、倍率 1.0／1.15／1.3；測試片段 3–5 秒；分鏡截圖在段尾前 0.6 秒）；刪 :80 的 SOP 指路、:98-104 的格式細節（→ U §2.3）、:103 的手動截圖改名（→ Skill，004 工具） | FR-038 |
| 13 | 子代理分工 | :109-122 三列表＋4 條 | 標「（選用）」；表保留；第 1 條加「子代理可以跑 `build.mjs --check` 和 `audit.mjs --only <自己的 id>`」；第 3 條收件改「`ls -l` 看 mtime 是今天＋`cmp` 和派工前備份不同」；加「派工訊息 > Skill」「回報 ≤ 25 行」「沒有子代理時自己照 `auto-edit-motion` 一段一段做」 | FR-039 |
| 14 | 剪輯台 | :124-130 三條 | 1「停下來等我調完」→「停點 ⑤」；2 →「照 `auto-edit-review` 流程 C」；3 原文保留 | FR-040 |
| 15 | 換風格 | :132-138 三條，背景只有 Codex 一條路 | 換成 02 §5.6 改寫稿（4 條：主色、能力探測＋路由、三張圖先放暫存＋停點 ⑥、回報走哪條路）；觸發語加「生成背景圖」；探測指令與 HTML 路線指令寫占位（002 `caps.mjs`、004 `brand.mjs bg`） | FR-041 |
| 16 | 環境準備 | :140-145 四條 | 加一條「照 `auto-edit-setup`；共用步驟 S3 `npm install`、S4 裝 9 支 auto-edit Skill」；其餘原文 | FR-042 |
| 17 | 工具注意事項 | :147-158 十二條 | :149 前半刪（W01），改「USAGE.md、USAGE-reference.md 查表用」；:150 改子殼寫法（W15）；加「HyperFrames 版本照根目錄 `package.json`」；其餘 9 條原文 | FR-043 |

改完量 `wc -c AGENTS.md` ≤ 23,232（FR-044）。估算：新增 2、6–9 節約 +7.5 KB；第 11、12 節瘦身約 −8.5 KB；第 15 節 +0.5 KB。

### 4.3 PROMPTS.md

| 節 | 改前 | 改後 | FR |
|---|---|---|---|
| §1（:37-46） | 「思考深度可以調低」；「兩組 Skill」 | 刪思考深度那句；改「兩組外部 Skill 和本工作區 9 支 auto-edit Skill」 | FR-050 |
| §3（:82-88） | 「先點 + 選 Plan 模式，思考深度調高」；「Plan 模式下 AI 只會讀檔…」 | 「不用開 Plan 模式，AI 會在構圖倍率（停點 ②）、分鏡表（停點 ③）兩處自己停，最後一行會寫要你看什麼、回什麼」 | FR-051 |
| §3a（:90-96） | 「先關閉 Plan 模式再送出」 | 刪那句 | FR-051 |
| §4（:122-131） | 「封裝成 Skill」提示詞 | 「Skill 已內建」：說明、怎麼確認、看不到時怎麼辦；不再有封裝提示詞 | FR-052 |
| §5（:133-139） | 下一集 | 保留；新增 §5a「換 session 接著做」：`繼續 projects/［EP2］` | FR-053 |
| 卡住的時候（:152-186） | :174、:175 兩列 Plan 模式 | 刪兩列；加 5 列（spec FR-054） | FR-054 |

### 4.4 README.md

| 位置 | 改後 | FR |
|---|---|---|
| 「裡面有什麼」表（:13-35） | 加 3 列：Skill 9 支、`SITUATIONS.md`、`REVIEW.md`；「提示詞 4 個」那列不變 | FR-055 |
| 「事前準備」（:37-41） | 工具清單加「根目錄 `npm install`（HyperFrames 釘版）」「9 支 auto-edit Skill」 | FR-055 |
| FAQ「回覆之後，AI 還是只給計畫」（:129-131） | 刪 | FR-055 |
| 順手發現、沒列入範圍 | 「頻道主題 1 套（深藍黑＋黃）」（:20）與 style.md:36 的橘色主題不符；「背景圖掛鉤 1 個 `bg.jpg`」（:21）與 R9.2 三張不符。請主代理決定要不要一起改 | — |

### 4.5 `shared/style.md`

| 節 | 改前 | 改後 | FR |
|---|---|---|---|
| 節奏（:43-51） | :48「一起進場」；:51「進場 0.3–0.5 秒、出場 0.3 秒」 | :48 換條列定案；:51 換 0.5／0.4＋外層保險 0.4／0.4；加完成態停留一條（1.2／1.5／0.6 秒） | FR-063、FR-064、FR-068 |
| 情境動畫優先（:53-58） | :55「越多越好」 | 加三條件判準（段長 ≥ 4 秒、≥ 2 句，建議初值）；「挑法見 R7.1」改「挑法見 SITUATIONS.md §3」；:58 保留 | FR-065 |
| 字卡文字（:60-71） | 8–14 字、密度 1–4 句、開場不限 | 保留；加文案傾向 2 條＋例句（G25）；加「金句：先列候選表讓作者勾，每集 ≤ 6 則（建議初值）」（G22） | FR-068 |
| 動畫視覺（:34-41） | 顏色、硬邊、圖示先行、不擋臉、字幕區 160px | 第一輪 T021 依 docs.test 結果，把 R8 #4–#6、#15 與 R7.3 版面原則裡 AI 要自己對的門檻（邊框 2px、字級 52／72／38px、間距 40px、位移 8–16px、畫面文字 10 字以內）搬進來，R8、R7.3 改「照 style.md 動畫視覺」（spec 裁決 4） | FR-091 |
| **審查門檻**（新，放「音效」之後） | 沒有 | 6 類門檻（spec FR-068），REVIEW.md 引用 | FR-068 |
| 音效（:88-112） | 12 顆對照表 | 第二輪照 005 docs.md 改（新事件、`maxPerVideo`、音量上限人聲下 3 dB） | 第二輪 |
| **講者畫面**（新） | 沒有 | 第二輪照 006 docs.md（color 0.8、slim 0.6） | 第二輪 |
| 和其他文件衝突時（:114-116） | 「build 仍會印這幾條的 ⚠，是刻意的」 | 第二輪照 002 `rhythm` 改；第一輪先加「優先序照 AGENTS.md 規則 5」 | FR-060、第二輪 |

### 4.6 `shared/template/USAGE.md`

| 位置 | 改前 | 改後 | FR |
|---|---|---|---|
| 開頭（:7） | 「第一次用，先把這份從頭讀到尾」 | 「查表用」 | FR-070 |
| §1 第 5 條（:18） | 「兩個地方」 | 「停點照 AGENTS.md 停點總表（①–⑥）」 | FR-066 |
| §2 SOP 表（:25-41） | 第 1 列讀完本檔；停？欄寫「停，等確認」 | 第 1 列看停點總表；停？欄寫 ② ③ ④；步驟 3、4、9 第二輪換新工具 | FR-071 |
| §2.1（:46-50） | Plan 模式三條 | 三行新寫法（FR-067） | FR-067 |
| §2.3（:70-82） | 分鏡表格式 | 加「版面」欄、金句候選表、音效欄統一寫「預設」 | FR-072 |
| §2.4（:84-92） | 拆句手算 | 第二輪換 002 `srt-split`；第一輪保留＋加算好的例題 | FR-071 |
| §3.4（:251、:252） | 露臉 ≥ 3 秒；清單項目 at | 刪露臉半句；清單改「照 style.md」 | FR-062、FR-064 |
| §3.5（:257-265） | 8–14 字要自己數 | 加文案傾向「照 style.md 字卡文字」一行 | FR-068 |
| §4.1（:269-329）、§4.2（:342） | 範例輸出含開場、露臉 ⚠ | 第二輪照 002 `rhythm` 的新輸出重寫範例；:342 那列改「照 style.md」 | FR-060、FR-062 |
| §5（:375-466） | media 段 | 第二輪照 004 docs.md 加新欄位 | 第二輪 |

### 4.7 `shared/template/USAGE-reference.md`

| 位置 | 改後 | FR |
|---|---|---|
| R1.2（:37-63） | 整張表搬到 SITUATIONS.md §3；留一行指路；:63 刪 | FR-073、FR-060 |
| R6（:400-414） | 密度、開場、露臉、新訊息停留、動作秒數五列的「數字」欄改「照 style.md 〈節〉」；「build 會檢查？」欄保留 | FR-060–FR-064、FR-068 |
| R7.1（:438-468） | 挑法表（:444-453）併進 SITUATIONS.md §3；:440「越多越好」、:461「不設上限…露臉 ≥ 3 秒」、:468 改「判準照 style.md 情境動畫優先」；第一層 vs 第二層表保留 | FR-065、FR-073 |
| R7.2 第 4 點（:486）、R7.3（:543） | 第二輪照 002／003（build 自動填 D、`P.at`） | 第二輪 |
| R7.5（:572-585） | 第二輪照 003 加 5 列 | 第二輪 |
| R8 #15（:616） | 「位移 8–16px；秒數照 style.md 節奏」 | FR-063 |
| R9.2（:655-664）→ R9.2＋R9.3 | R9.2 刪最後一條；新 R9.3＝02 §5.5 探測表、路由表、驗證表 | FR-074 |
| R12（:709-718） | 「Skill 已內建（`.agents/skills/`）；改了跑 `node setup/install-skills.mjs`」；保留依賴、`--project`、結束碼等說明 | FR-074 |
| R13（:724） | 「照根目錄 `package.json`（0.8.221）」 | FR-074 |
| 開頭節表（:9-24） | R1 那列「步驟 4」改「挑情境查 SITUATIONS.md」；R12 那列改「改 Skill 時」 | FR-073 |

### 4.8 `shared/template/EDITOR.md`

| 位置 | 改後 | FR |
|---|---|---|
| §1（:13-24） | 「流程在 AGENTS.md 的剪輯台」→「停點 ⑤，流程照 `auto-edit-review` 流程 C」 | FR-075 |
| §6（:99-105） | 第 3 點改「照 `auto-edit-review` 流程 A，再停點 ④」 | FR-075 |
| 「講者」面板 | 第二輪照 006 docs.md 新增 | 第二輪 |

### 4.9 `setup/`

| 檔 | 改動 | FR |
|---|---|---|
| `README.md` | 「要裝的東西」加 2 列；原則 6 例外；步驟 1 範例清單改 11 步（加 npm install、9 支 Skill）；共用步驟 S1–S8 重編號（新 S3 `npm install`：驗證 `node_modules/hyperframes/package.json` 的 version＝0.8.221；新 S4 `node setup/install-skills.mjs`：驗證印 `✔ 完成：9 支 × 2 個位置`）；:91「通常只剩 S3–S6」改「S5–S8」 | FR-022 |
| `check.sh` | 加 `hyperframes_local`（S3）、`skill_auto_edit`（S4；迴圈檢查 9 個 `SKILL.md`）兩個 `add_item`；放在 `:362-365` 兩組 Skill 之後 | FR-023 |
| `check.ps1` | 同上兩項，放在 `:394-395` 之後 | FR-023 |
| `troubleshooting.md` | 「共用」加 3 列 | FR-024 |
| `mac.md`、`windows.md` | 只改文中引用的 S 編號 | FR-025 |
| `windows-selftest.ps1` | 不改（不在所有權表；它驗的是 W 步驟） | — |

### 4.10 `dev/README.md`

表加兩列：`tests/docs.test.mjs`（文件一致性，`node --test dev/tests/docs.test.mjs`）、`tests/docs-allow.json`（數字白名單，每筆要寫理由）；`tools/make_sfx.py` 那列第二輪照 005（改 `make-sfx.mjs`）。

### 4.11 `dev/tests/docs.test.mjs` 設計

| # | 測試名 | 做法 | FR |
|---|---|---|---|
| T1 | skills: 9 支都在 | `readdirSync('.agents/skills')` 篩 `auto-edit-`，等於 9 個固定名稱 | FR-001 |
| T2 | skills: frontmatter | 解析第一個 `---` 區塊；鍵 ⊆ {name, description, version}；name＝資料夾名；description 一行、含「時使用」與「不要用」 | FR-002 |
| T3 | skills: ≤ 200 行 | `split('\n').length` | FR-003 |
| T4 | skills: 骨架 | 開頭表頭逐字；必要二級標題都在；開頭兩行（規則在 AGENTS.md／衝突時） | FR-004、FR-005、FR-013 |
| T5 | skills: 指令寫法 | 含 `npx hyperframes (snapshot\|preview\|render\|check)` 的行必須含 `(cd projects/<專案>/work/hyperframes && `；不准出現 `/Users/`、`C:\\`、`~/`（setup 例外） | FR-007 |
| T6 | stop-points: 總表 6 列 | AGENTS.md「停點總表」節的表格列數＝6、編號 ①–⑥ | FR-095 |
| T7 | stop-points: 最後一行原文 | 六行常數各自在 AGENTS.md 與對應 SKILL.md 出現 | FR-095 |
| T8 | stop-points: 不准自創 | 所有 `⏸ 停點` 開頭的行 ∈ 六行常數 | FR-095 |
| T9 | Plan 模式只能是否定句 | 指定檔案中含「Plan 模式」的行都含「不用／不需要／不要」 | FR-095、SC-008 |
| T10 | 數字找得到出處 | FR-091 的抽取規則；來源＝AGENTS.md ∪ style.md ∪ 工具 `--help`；白名單 `docs-allow.json` | FR-091 |
| T11 | `--help` 子指令有文件 | FR-092 | FR-092 |
| T12 | 文件裡的檔案存在 | FR-093 | FR-093 |
| T13–T20 | G04 ①–⑧ | 每項一個：舊字串不在 U／R（⑥ 還要不在 custom 範例檔頭）、新字串在 style.md 或 U | FR-096 |
| T22 | 剪乾淨指令帶 margin | AGENTS.md 與 rough SKILL.md 每一行以 `auto-editor ` 開頭的指令都含 `--margin 0.15sec` | FR-098 |
| T21 | 失敗訊息帶修法 | 上面每個 assert 的訊息都以「→ 」開頭的修法結尾（自我檢查：測試檔內 `assert` 的 message 參數都含 `→`） | FR-097 |

實作重點：數字抽取先剝掉 fenced code block、行內 code（反引號內）、Markdown 連結網址、`檔名:行號` 引用、`R7.1`／`§3` 節號、`#12` 句號、`0:25.83` 時間碼、`1920×1080` 尺寸與 `[x, y, w, h]` 座標；比較詞分「數字前」（≥ ≤ < > 最多 至少 超過 不到 上限 下限）與「數字後」（以內 以上 以下）兩組；數字與單位中間允許「個」（style.md「8–14 個字」）；單位正規化（`s`＝`秒`、`ms`＝`毫秒`）。來源比對時同樣剝掉 code，但工具 `--help` 輸出整段都算。工具 `--help` 輸出在測試開始時跑一次快取。

## §5 第二輪：要等的契約與要改的地方

| 等誰 | 契約／檔 | 001 改哪裡 |
|---|---|---|
| 002 | `cli-002.md`（status、caps、media cutpoints／ng-snap／srt-split、章節空檔）、`check-json.md`、`plan-fields.md`（`rhythm`、`outro`）、`002/docs.md` | AGENTS.md 剪乾淨、換風格；rough、storyboard、longform、setup、style、review Skill 的〔暫定·002〕；U §2.4、§4.1、§4.2；R9.3 探測指令；style.md「和其他文件衝突時」；R13 版本 |
| 003 | `cues.md`、`003/docs.md` | motion Skill 步驟 3–4；R7.2–R7.5；SITUATIONS.md 5 支新範例的列；audit 退路表列 |
| 004 | `media.md`、`cli-004.md`、`004/docs.md` | storyboard 步驟 1、6；screen 步驟 4；review A4；style 步驟 3；U §5、R2.5；REVIEW.md §3 |
| 005 | `sfx.md`、`005/docs.md` | style.md 音效表；SITUATIONS.md 音效欄；deliver 回報（音效比例行）；dev/README.md 音效工具列 |
| 006 | `look.md`、`006/docs.md` | style.md 講者畫面；EDITOR.md 講者面板；storyboard Skill（look preview 放哪一步） |
| 007 | `007/docs.md` | dev/README.md 加 `check-all.mjs`、`loop/`；憲法檢查迴圈指令寫進 dev/README.md |

## §6 風險

| 風險 | 影響 | 處理 |
|---|---|---|
| MiniMax Code 不讀專案層 Skill、或 frontmatter 解析不同 | Skill 沒被觸發 | AGENTS.md 直接指路到 `.agents/skills/`（FR-030）；install 到 `~/.minimax/skills/` |
| 已安裝複本比原始檔舊 | 弱模型照舊版做 | AGENTS.md 寫「有出入以原始檔為準」；check.sh／ps1 的 `skill_auto_edit` 只驗存在，`--check` 驗內容（作者／007 用） |
| docs.test 的數字抽取誤報太多 | 白名單膨脹、失去意義 | 只抽「比較詞＋數字＋單位」與「範圍＋單位」；白名單上限 40 筆（SC-001）；R8／R7.3 的版面門檻照憲法搬進 style.md（§4.5「動畫視覺」列），不進白名單 |
| AGENTS.md 變薄後，沒有 Skill 的平台指令不夠 | 弱模型自己組指令 | AGENTS.md 每個流程都寫 SKILL.md 路徑；「數字表」留在 AGENTS.md |
| 其他工作線的指令名稱和暫定的不同 | 第二輪大量改字 | 暫定指令集中標〔暫定·00N〕，第二輪用 grep 一次換；docs.test T11、T12 會抓到漏改 |
| 「改好了」對到錯的停點 | 改錯檔 | 停點紀錄「待回覆」列（stop-points.md §3、§4） |

## Complexity Tracking

> 憲法檢查沒有違反項；IV 有一條待主代理確認的解讀（工具 `--help` 算數字來源），不是新增複雜度。
