---
description: "001 skills-docs 任務清單"
---

# Tasks: 001 skills-docs

**Input**: `specs/001-skills-docs/spec.md`、`plan.md`、`skill-outline.md`；契約 `specs/contracts/stop-points.md`、`cli-001.md`

**Prerequisites**: 這一輪只寫規格；下面的任務是實作輪要做的。第一輪（Phase 1–10）只依賴本線自己的檔案；第二輪（Phase 11）等 002–007 交 `docs.md` 與 `cli-00N.md`。

**Tests**: spec 有要求（FR-090–FR-097、cli-001 §2），測試先寫、先紅。

## Format: `[ID] [P?] [Story] 描述（檔案路徑）｜依賴`

- **[P]**：可以平行（不同檔案、沒有未完成的依賴）
- **[USn]**：對到 spec 的使用者故事
- 路徑都相對工作區根目錄

---

## Phase 1: Setup

- [ ] T001 建 9 個資料夾 `.agents/skills/auto-edit-{longform,setup,rough,storyboard,screen,motion,review,deliver,style}/`，有 references 的 6 支再建 `references/`（skill-outline §1 總覽表）；每支先放只有 frontmatter＋開頭兩行的 `SKILL.md`｜—
- [ ] T002 [P] 建 `dev/tests/docs-allow.json`，內容 `[]`｜—

---

## Phase 2: Foundational（數字與停點的家、測試先寫；完成前不能寫 Skill 內容）

- [ ] T003 [P] 寫 `dev/tests/docs.test.mjs` 的 T1–T22（plan §4.11），跑一次確認大多數是紅的｜T001、T002
- [ ] T004 [P] 寫 `dev/tests/install-skills.test.mjs`，cli-001 §2 九個案例（檔案所有權等主代理裁決；不准的話併進 T003 的檔）｜—
- [ ] T005 AGENTS.md 新增「怎麼用這份檔」「停點總表」「階段預算」三節（plan §4.2 #2、#6、#7；停點六行逐字照 stop-points.md §2.1）｜—
- [ ] T006 AGENTS.md「規則」：規則 2、5、7 改寫，加規則 8（plan §4.2 #5）｜T005
- [ ] T007 AGENTS.md「剪乾淨的數字」「剪好看的數字」兩張表（plan §4.2 #11、#12 的數字部分；W07 異常條件、3.5 倍、1.15、3–5 秒、0.6 秒）｜T005
- [ ] T008 `shared/style.md`：節奏（:48、:51 換定案＋完成態停留）、情境動畫優先（三條件判準）、字卡文字（文案傾向 G25、金句候選 ≤ 6 則 G22）、新節「審查門檻」（plan §4.5 第一輪部分）｜—

**Checkpoint**：docs.test 的 T6、T7（AGENTS.md 那半）、T13–T20 裡「新字串在 style.md」的斷言轉綠。

---

## Phase 3: User Story 1 — 弱模型跑到停點 ③，不靠 Plan 模式（P1）🎯 MVP

**Goal**：只讀 AGENTS.md＋Skill 就能從「剪乾淨」走到 ③，三個停點最後一行逐字正確。

**Independent Test**：SC-005（007 的弱模型試跑）；docs.test T1–T9 全綠。

- [ ] T009 [P] [US1] `.agents/skills/auto-edit-rough/SKILL.md`＋`references/ng-rules.md`（skill-outline §4）｜T005–T008
- [ ] T010 [P] [US1] `.agents/skills/auto-edit-storyboard/SKILL.md`＋`references/storyboard-template.md`（skill-outline §5；金句候選表欄位照 FR-072）｜T005–T008
- [ ] T011 [P] [US1] `.agents/skills/auto-edit-screen/SKILL.md`（skill-outline §6）｜T005–T008
- [ ] T012 [P] [US1] `.agents/skills/auto-edit-longform/SKILL.md`＋`references/progress-template.md`（skill-outline §2；停點紀錄表頭逐字照 stop-points.md §4）｜T005–T008
- [ ] T013 [US1] AGENTS.md「剪乾淨」「剪好看」「子代理分工」「工具注意事項」「開新專案」改寫（plan §4.2 #10–#13、#17；新工具留〔暫定〕占位）｜T005–T007
- [ ] T014 [US1] `shared/template/USAGE.md`：開頭 :7、§1 第 5 條、§2 SOP 表、§2.1（FR-066、FR-067、FR-070、FR-071 第一輪部分）｜T005
- [ ] T015 [US1] `PROMPTS.md`：§1 刪思考深度、§3 與 §3a 拿掉 Plan 模式、症狀表刪 :174-175（FR-050、FR-051、FR-054 的刪除部分）｜T005
- [ ] T016 [US1] 跑 `node --test dev/tests/docs.test.mjs`，T1–T9 全綠；`grep -n "Plan 模式"` 每行都是否定句（SC-008）｜T009–T015
- [ ] T017 [US1] 請 007 用 Sonnet 跑 `projects/範例` 到 ③（SC-005）；照 `dev/loop/round-N.md` 卡住的地方改 T009–T013 的檔｜T016

**Checkpoint**：US1 可以單獨示範（剪乾淨 → ① → 剪好看 → ② → ③）。

---

## Phase 4: User Story 2 — 8 處矛盾清零、數字找得到出處（P1）

**Independent Test**：SC-002 的 grep 沒有輸出；docs.test T10、T13–T20 全綠。

- [ ] T018 [P] [US2] `shared/template/USAGE-reference.md`：R6 五列改「照 style.md」、R7.1 :440／:461／:468、R8 #15（FR-060–FR-065、FR-068）；R1.2 :63 刪｜T008
- [ ] T019 [P] [US2] `shared/template/USAGE.md`：§3.4 :251、:252，§4.2 :342 那列，§3.5 加文案傾向指路（FR-060、FR-062、FR-064、FR-068）｜T008
- [ ] T020 [US2] 追蹤 003 刪 `shared/template/custom/x-before-after.html:13`、`x-numbers.html:14`（不是 001 改；在 tasks 打勾前用 grep 確認）｜—
- [ ] T021 [US2] 跑 SC-002 grep 與 docs.test T10；誤報的數字逐筆判斷「搬進 style.md／AGENTS.md」或「進 docs-allow.json 寫理由」，白名單 ≤ 40 筆（SC-001）；R8 #4–#6、#15 與 R7.3 版面原則的門檻搬進 style.md「動畫視覺」，R8、R7.3 改「照 style.md」（plan §4.5、spec 裁決 4）｜T018–T020

---

## Phase 5: User Story 3 — 一個指令安裝 9 支 Skill（P1）

**Independent Test**：`node --test dev/tests/install-skills.test.mjs` 全綠；SC-004 實機。

- [ ] T022 [US3] `setup/install-skills.mjs`（cli-001 全文；只用 Node 內建模組）｜T004
- [ ] T023 [P] [US3] `setup/README.md`：要裝的東西、原則 6、步驟 1 範例、S1–S8 重編號、:91（FR-022）｜—
- [ ] T024 [P] [US3] `setup/check.sh`、`setup/check.ps1` 加 `hyperframes_local`（S3）、`skill_auto_edit`（S4）（FR-023）｜—
- [ ] T025 [P] [US3] `setup/troubleshooting.md` 加 3 列；`setup/mac.md`、`setup/windows.md` 改 S 編號（FR-024、FR-025）｜T023
- [ ] T026 [US3] `.agents/skills/auto-edit-setup/SKILL.md`（skill-outline §3）｜T023、T024
- [ ] T027 [US3] `PROMPTS.md` §4「Skill 已內建」、症狀表加「Skills 看不到」列；`README.md` 三處（FR-052、FR-054、FR-055）；AGENTS.md「環境準備」（plan §4.2 #16）；R12、R13（FR-074 的這兩條）｜T022
- [ ] T028 [US3] Mac 實機：`node setup/install-skills.mjs` 兩次＋`--check`；Windows 實機一次（沒有機器就在 `dev/loop/round-N.md` 標「Windows 未驗」）（SC-004）｜T022、T026

---

## Phase 6: User Story 4 — 換 session 說「繼續」（P2）

**Independent Test**：SC-006。

- [ ] T029 [US4] AGENTS.md「開工」「進度與回饋紀錄」兩節（plan §4.2 #8、#9；G24、G10）｜T005
- [ ] T030 [US4] `PROMPTS.md` 新增 §5a「換 session 接著做」與症狀表「換 session 不知道做到哪」列（FR-053、FR-054）｜T029
- [ ] T031 [US4] 範例專案在 ③ 待回覆時換 session 測 SC-006；`status.mjs` 還沒有時走 longform 退路表（≤ 5 次）｜T012、T029

---

## Phase 7: User Story 5 — 回饋輪紀錄；③ 之後的流程（P2）

**Independent Test**：SC-010。

- [ ] T032 [P] [US5] `.agents/skills/auto-edit-review/SKILL.md`＋`references/feedback-round.md`＋`references/reviewer-brief.md`（skill-outline §8）｜T029
- [ ] T033 [P] [US5] `.agents/skills/auto-edit-motion/SKILL.md`＋`references/worker-report.md`（skill-outline §7）｜T005–T008
- [ ] T034 [P] [US5] `.agents/skills/auto-edit-deliver/SKILL.md`（skill-outline §9）｜T005–T008
- [ ] T035 [US5] AGENTS.md「剪輯台」（plan §4.2 #14）；`shared/template/EDITOR.md` §1、§6（FR-075）｜T032
- [ ] T036 [US5] 範例專案走兩輪回饋，確認 r1、r2、bak-r1、bak-r2（SC-010）｜T032、T035

---

## Phase 8: User Story 6 — 金句候選、文案傾向、開工決策表（P2）

- [ ] T037 [US6] `shared/template/USAGE.md` §2.3：版面欄、金句候選表、音效欄寫「預設」（FR-072）；確認 `storyboard-template.md`（T010）與 U §2.3 欄位一致｜T010
- [ ] T038 [US6] 範例專案跑到 ③，確認 storyboard.md 有金句候選表、只勾 1 則時正式 plan.json 只有 1 段 15 quote（US6 驗收 1、2）｜T037、T017

---

## Phase 9: User Story 7 — SITUATIONS.md、REVIEW.md（P3）

**Independent Test**：SC-011、SC-012。

- [ ] T039 [P] [US7] `shared/template/SITUATIONS.md` §1–§5（FR-080–FR-084；不定義新數字；02 §1 #10、#12、#13、#15、#16 先寫「還沒有範例 → 退回 …」）｜T008
- [ ] T040 [P] [US7] `shared/template/REVIEW.md` §1–§5（FR-085–FR-089；門檻照 style.md「審查門檻」）｜T008
- [ ] T041 [US7] `shared/template/USAGE-reference.md`：R1.2 搬走只留指路、R7.1 挑法表併走、開頭節表兩列（FR-073）｜T039
- [ ] T042 [US7] 檢查 SC-011（每列有 02 §1 #、#1–#28 全部出現）、SC-012；docs.test T10 對兩份新檔也綠｜T039–T041

---

## Phase 10: User Story 8 — 換風格的能力路由（P3）

- [ ] T043 [P] [US8] `.agents/skills/auto-edit-style/SKILL.md`＋`references/image-routing.md`（skill-outline §10）｜T005
- [ ] T044 [US8] `shared/template/USAGE-reference.md` R9.2 刪最後一條、新增 R9.3（FR-074）｜—
- [ ] T045 [US8] AGENTS.md「換風格」換成 02 §5.6 改寫稿（plan §4.2 #15）｜T044

---

## Phase 11: 第二輪——整合其他工作線的 docs.md 與 cli-00N.md

**Purpose**：把〔暫定·00N〕全部換成契約原文；把各線要併進文件的段落照 docs.md 寫進 001 擁有的檔。

- [ ] T046 收件清點：`specs/00{2..7}-*/docs.md`、`specs/contracts/cli-00{2..7}.md`（或主代理統一後的 `cli.md` 各節）、`check-json.md`、`plan-fields.md`、`cues.md`、`sfx.md`、`media.md`、`look.md` 都在；`grep -rn "〔暫定" .agents/skills AGENTS.md shared/template/*.md` 列出全部待換處，和各契約的指令名稱逐一對照，名稱不同的列成表｜002–007 交件
- [ ] T047 [P] 002：rough（步驟 4、6、7、8）、storyboard（步驟 3）、longform（步驟 1）、setup（步驟 5）、style（步驟 2）、review（B1）的暫定指令；AGENTS.md 剪乾淨、換風格；U §2.4；U §4.1 範例與 §4.2 表照 `rhythm` 後的 `--check` 原文重寫；R9.3 探測改 `caps.mjs`；style.md「和其他文件衝突時」；screen Skill 完成判準用 `check-json.md` 的 `uncovered[]`；status.mjs 解析停點紀錄的結果和 stop-points.md §4 對一次｜T046
- [ ] T048 [P] 003：motion Skill 步驟 3、4（`P.at`、D 自動）；R7.2 第 4 點、R7.3（:543 刪手算、方法表加 `P.at`／`P.focus`／`P.type`）、R7.5 加 5 列；SITUATIONS.md 那 5 列換成新範例檔名；motion、review 退路表加 audit 新規則原文｜T046
- [ ] T049 [P] 004：storyboard 步驟 1（建議欄）、6（`qc.mjs storyboard`）；screen 步驟 4（新欄位）；review A4（`qc.mjs observe`）；style 步驟 3（`brand.mjs bg`）；U §5、R2.5；REVIEW.md §3；停點 ② 的「不用停」預設改成讀建議欄｜T046
- [ ] T050 [P] 005：style.md 音效表與規則；SITUATIONS.md 音效欄；deliver 回報行；dev/README.md 音效工具列（`make-sfx.mjs`）｜T046
- [ ] T051 [P] 006：style.md 新「講者畫面」節；EDITOR.md「講者」面板；storyboard Skill 加 look 預覽那一步（照 006 docs.md 建議的位置）｜T046
- [ ] T052 [P] 007：dev/README.md 加 `check-all.mjs`、`dev/loop/`｜T046
- [ ] T053 契約對齊：cli 契約檔名統一（spec 裁決 1）；README 契約表與實際檔名一致；本線 Skill／USAGE 裡用到的欄位名（`uncovered`、`rhythm`、`callouts`…）和契約逐字相同｜T047–T052
- [ ] T054 docs.test 全部（T11 會掃到新工具的 `--help`）＋`install-skills.mjs --check --dest <暫存>` 全綠；AGENTS.md ≤ 23,232 bytes（FR-044）；9 支 SKILL.md ≤ 200 行（FR-003）；`grep -rn "〔暫定"` 0 行｜T053

---

## Phase 12: Polish 與檢查迴圈（憲法「檢查迴圈」）

- [ ] T055 [P] `dev/README.md`（plan §4.10）｜T003
- [ ] T056 迴圈 1–2：`node --test dev/tests/*.test.mjs` 全綠、`node dev/check-all.mjs`（007）0 ✖｜T054
- [ ] T057 迴圈 3：007 弱模型試跑（Sonnet 或更弱、MiniMax 各一次）到 ③；001 依 `dev/loop/round-N.md` 修 Skill 與 AGENTS.md，回到 T056｜T056
- [ ] T058 迴圈 4：審查員對 spec SC-001–SC-012 逐項打勾，P0 清零｜T057

---

## Dependencies & Execution Order

### Phase 依賴

- Phase 1 → Phase 2（T003 要 T001 的資料夾；T005–T008 是全部 Skill 引用的數字與停點來源）→ Phase 3–10。
- Phase 3（US1）是 MVP；Phase 4、5 也是 P1，可以和 Phase 3 平行（不同檔案），但 T018／T019 改的 U、R 和 T014 同檔，**同一個檔一次只給一個人改**：T014 → T019 → T037 依序。
- AGENTS.md 由 T005 → T006 → T007 → T013 → T027（環境準備）→ T029 → T035 → T045 依序改，不平行。
- Phase 11 等 002–007 交件（`specs/README.md`「整合順序」第 2 步後）。
- Phase 12 最後。

### 同檔序列（避免互蓋）

| 檔 | 任務順序 |
|---|---|
| `AGENTS.md` | T005 → T006 → T007 → T013 → T027 → T029 → T035 → T045 → T047 |
| `shared/template/USAGE.md` | T014 → T019 → T037 → T047 → T049 |
| `shared/template/USAGE-reference.md` | T018 → T021 → T027（R12、R13）→ T041 → T044 → T047 → T048 → T049 |
| `shared/style.md` | T008 → T021 → T047 → T050 → T051 |
| `PROMPTS.md` | T015 → T027 → T030 |

### 平行機會

- T009–T012（4 支 Skill）同時寫；T032–T034 同時寫；T039、T040、T043 同時寫。
- T022（腳本）和 T023–T025（setup 文件）同時做。
- Phase 11 的 T047–T052 各線一組，同時做，最後 T053 對齊。

## Implementation Strategy

1. Phase 1–2 → 3（US1）→ 停下來讓 007 跑一次弱模型試跑（T017）→ 依結果修。
2. 再做 Phase 4、5（P1 收齊）→ Phase 6–8（P2）→ Phase 9–10（P3）。
3. 各線交件後做 Phase 11，最後 Phase 12 的檢查迴圈跑到全過。
