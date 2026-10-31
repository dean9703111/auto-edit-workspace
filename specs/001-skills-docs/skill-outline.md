# 9 支 Skill 大綱（001 skills-docs）

照這份寫 `.agents/skills/auto-edit-*/SKILL.md`。規則來源：spec.md FR-001–FR-015；寫法原則 02 §7.2 的 16 條；範本 02 §7.3。

**標記**：`〔暫定·002〕` 是其他工作線還沒交 `cli-00N.md` 的指令，名稱照 02 的寫法先占位，第二輪（tasks.md Phase 9）換成契約原文；每個暫定指令在退路表都有一列「工具還沒有 → 手動做法」。

## 0. 共用骨架（每支都照這個順序；行數是上限，合計 ≤ 200 行）

```markdown
---
name: auto-edit-<名稱>
description: <做什麼>。當使用者說「…」「…」時使用。<…>時不要用（改用 auto-edit-<…>）。
version: 0.1.0
---
# <階段中文名>

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |            ← 一覽（≤ 8 行）
## 開始前                                         ← 前置檢查表：條件（看得到的事實）｜做法（≤ 12 行）
## 步驟                                           ← 每步：指令 code block／完成判準：…／常見錯誤：症狀 → 修法（≤ 110 行）
## 停點                                           ← 逐字一行（stop-points.md §2.1）＋這個停點可回的話（≤ 8 行）
## 自我核對                                       ← 5–8 個 [ ]（≤ 10 行）
## 退路表                                         ← 症狀（工具原文）｜做法｜第二次還失敗（≤ 20 行）
## 工具呼叫預算                                   ← 一行數字（出處 AGENTS.md 階段預算）＋「超過就停下來回報卡在哪」
## 回報格式                                       ← ≤ 15 行骨架，最後一行是 ⏸ 或 →（≤ 12 行）
## 什麼時候讀 references/                         ← 有才寫（≤ 5 行）
```

- 指令從工作區根目錄、帶 `--project projects/<專案>`；hyperframes 一律 `(cd projects/<專案>/work/hyperframes && npx hyperframes …)`。
- Windows 不同時寫兩行：`Mac：…`、`Windows（PowerShell）：…`；帶逗號或冒號的參數加引號（AGENTS.md:153）。
- 數字只貼這一步用、工具不檢查的，括號寫出處。
- 下面每支的「步驟」用表格列大綱；寫成 SKILL.md 時每一步展開成「指令 code block＋完成判準＋常見錯誤」三件事（FR-006）。

## 1. 總覽

| Skill | 一句話 | 停點 | references | 預算（AGENTS.md 階段預算，建議初值） |
|---|---|---|---|---|
| `auto-edit-longform` | 判斷做到哪、開工決策表、交棒、維護製作進度 | 沿用 | `progress-template.md` | 接手 ≤ 3 次 |
| `auto-edit-setup` | 檢測與安裝、能力探測 | 沒有（❓ 同意一次） | — | 每一步 ≤ 2 次嘗試 |
| `auto-edit-rough` | 剪乾淨 | ① | `ng-rules.md` | 到 ① ≤ 12 次（第 2 輪照 round-1 實測重估） |
| `auto-edit-storyboard` | 構圖、講者框、挑情境、草稿、分鏡表 | ② ③ | `storyboard-template.md` | 到 ② ≤ 8 次；到 ③ ≤ 55 次（第 2 輪重估） |
| `auto-edit-screen` | 螢幕錄影與圖片配對、座標 | 併進 ③ | — | 每支錄影 ≤ 6 次 |
| `auto-edit-motion` | 一段情境動畫 | 沒有（交回主代理） | `worker-report.md` | 每段 ≤ 15 次 |
| `auto-edit-review` | 定稿 build、自查、Studio、回饋輪、剪輯台 | ④ ⑤ | `feedback-round.md`、`reviewer-brief.md` | 回饋每一項 ≤ 6 次 |
| `auto-edit-deliver` | 測試片段、整支 render、qc final | 沒有 | — | ≤ 12 次＋log ≤ 20 次 |
| `auto-edit-style` | 換主色、背景圖 | ⑥ | `image-routing.md` | ≤ 15 次 |

---

## 2. `auto-edit-longform`（總指揮）

- **description**：長片總指揮：判斷 projects/<專案> 做到哪一步、第一次開工填開工決策表、把工作交給對應的階段 Skill、維護 work/製作進度.md。當使用者說「用 auto-edit-longform 剪 projects/X」「剪這支影片」「繼續」「繼續 projects/X」「下一集」「做到哪了」時使用。只做單一階段（只剪乾淨、只換主色、只開剪輯台）時不要用，直接用那個階段的 Skill。
- **觸發語**：同上；沿用 PROMPTS.md:137-138 的「用 auto-edit-longform 剪 projects/EP2」（02 §5.1 第 4 點同名相容）。

**一覽**：`projects/<專案>/` ｜ `status.mjs`〔暫定·002〕 ｜ `work/製作進度.md` ｜ 製作進度.md 有開工決策表、階段表、停點紀錄表，交出去的 Skill 等於路由表那一列 ｜ 沿用各階段

**開始前**

| 條件 | 做法 |
|---|---|
| 提示詞沒指定專案，`projects/` 只有 1 個 | 用那一個 |
| 沒指定，`projects/` 有 ≥ 2 個 | 列出來問（AGENTS.md「專案」），回覆最後一行 `❓ 請回：專案名稱` |
| `素材/真人錄影/`、`素材/聲音/` 都是空的 | 照 AGENTS.md「開新專案」2 告訴使用者放什麼，最後一行 `→ 下一步：素材放好後說「剪乾淨」` |

**步驟**

| # | 做什麼 | 指令 | 完成判準 | 常見錯誤 → 修法 |
|---|---|---|---|---|
| 1 | 看進度 | `node shared/template/tools/status.mjs --project projects/<專案>`〔暫定·002〕 | 讀到 `目前在：`、`下一步：`、`待回覆停點：`、`下一個停點：`、`下一輪回饋編號：` 五行＋`依據：`（002 spec「回覆 001」第 3 條） | 找不到工具 → 退路表第 1 列 |
| 2 | 第一次開工（沒有 `work/製作進度.md`） | 複製 `references/progress-template.md` 成 `work/製作進度.md`；照「開工決策表」6 欄逐欄跑「怎麼看」的指令填值 | 6 欄都有值，構圖倍率寫「待停點 ②」 | 長度用 ffprobe 量：`ffprobe -v error -show_entries format=duration -of csv=p=0 "<主軌>"`；< 180 秒（3 分鐘）→ 「短片：不用 01 章節轉場」（R1.2） |
| 3 | 有待回覆的停點 | 不重做；重貼 stop-points.md §2.1 那一行＋它要看的檔 | 回覆最後一行＝那個停點的原文 | 使用者其實在回覆那個停點 → 照 stop-points.md §3 做 |
| 4 | 交棒 | 照下面路由表，讀那支 Skill 的 SKILL.md 從它的「開始前」做起 | 交出去的 Skill＝路由表那一列 | — |
| 5 | 每過一個停點或一個階段做完 | 改 `work/製作進度.md` 的階段表與停點紀錄（stop-points.md §4，新增列、不改舊列） | 停點紀錄最後一列和剛剛的回覆一致 | — |

**路由表**（條件只看檔案在不在與 status 印的字）

| 條件 | 交給 |
|---|---|
| 指令找不到 `node`／`ffmpeg`，或使用者說裝工具 | `auto-edit-setup` |
| 沒有 `work/rough.mp4` | `auto-edit-rough` |
| 有 `work/rough.mp4`、`work/rough.srt`；停點 ③ 沒有「通過」 | `auto-edit-storyboard` |
| ③ 通過；plan.json 有 `"type": "custom"` 的段、對應的 `compositions/x-*.html` 還沒做（檔案不存在，或和範例原文一樣） | `auto-edit-motion`（每段一次；有子代理可以平行，選用） |
| ③ 通過、情境動畫都做完；④ 沒有「通過」 | `auto-edit-review` |
| ④ 通過；沒有 `成片/final.mp4` | `auto-edit-deliver` |
| 有 `成片/final.mp4` 而且 `qc.mjs final` 0 個 ✖ | 完成 → 回報 |

- **可全自動**（不用問）：轉逐字稿、`--check`、build、audit、snapshot、`qc.mjs`、`status.mjs`。**一定要停**：①–⑥（02 §7.4；`VEP/RE:L150-163`）。

**自我核對**：[ ] 專案只有一個、確定了 ／ [ ] `work/製作進度.md` 存在 ／ [ ] 開工決策表 6 欄有值 ／ [ ] 交出去的 Skill 對到路由表 ／ [ ] 停點紀錄最後一列正確 ／ [ ] 沒讀寫其他專案的 `work/`（AGENTS.md「專案」）

**退路表**

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `Cannot find module …status.mjs`／`Error: … status.mjs` | 用 `references/progress-template.md` 的「產物 → 階段」表，`ls projects/<專案>/work projects/<專案>/成片` 手動判斷 | 停下來回報 |
| status 印的和 `work/製作進度.md` 不一致 | 以產物為準（`VEP/SKILL.md` §6），改製作進度.md，回報裡提醒一句 | — |
| 使用者說「繼續」但沒有 `work/` | 當作第一次開工（步驟 2） | — |

**回報骨架**：專案名稱｜目前在｜下一步｜交給哪支 Skill｜（第一次開工）開工決策表摘要 1 行；最後一行用交出去那支 Skill 的停點或 `→ 下一個停點：…`。

**references/progress-template.md**：`work/製作進度.md` 範本（開工決策表 6 欄＋「怎麼看」＋預設值；階段表 ⬜🔄⏸✅↩—；`## 停點紀錄` 表頭照 stop-points.md §4；`## 回饋輪` 索引表）＋「產物 → 階段」對照表。**步驟 2 或退路表第 1 列才讀。**

開工決策表 6 欄（G24；`JY/SKILL.md:L17`；AGENTS.md「開工」一節是規則來源）：

| 欄 | 怎麼看 | 會影響什麼 |
|---|---|---|
| 主軌種類 | `ls projects/<專案>/素材/真人錄影 projects/<專案>/素材/聲音` | 1 支真人錄影＝直接用；其他＝停點 ① 要問順序 |
| 有沒有講稿 | `projects/<專案>/講稿.md` 在不在 | 沒有：字幕只轉繁體、補標點（AGENTS.md 規則 4）；沒有章節空檔表 |
| 有沒有螢幕錄影／圖片 | `ls projects/<專案>/素材/螢幕錄影 projects/<專案>/素材/圖片` | 有：分鏡時跑 `auto-edit-screen` |
| 長度 < 3 分鐘 | ffprobe 主軌長度 | 是：不用 01 章節轉場（R1.2） |
| 有沒有業配段 | 講稿.md 出現「業配」「贊助」「優惠碼」其中一詞 → 寫「可能有，待確認」；沒講稿寫「未知」 | 有：業配段不放 01 章節轉場（02 §1 #22） |
| 構圖倍率 | 停點 ② 通過後填 | plan.json `frame` |

---

## 3. `auto-edit-setup`

- **description**：檢測並安裝這個工作區要用的工具（git、Node.js 22、ffmpeg／ffprobe、whisper-cli、auto-editor、根目錄 npm install 的 HyperFrames、hyperframes 與 auto-editor 兩組外部 Skill、9 支 auto-edit Skill），最後探測生圖能力。當使用者說「幫我檢測環境」「檢測環境」「安裝環境」「裝工具」「Skills 看不到 auto-edit」時使用。已經在剪片、只是某個剪片指令報錯時不要用（看那個階段 Skill 的退路表）。

**一覽**：— ｜ `bash setup/check.sh`／`setup\check.ps1` ｜ 進度回報、總表、能力表 ｜ 檢測 JSON 的 `all_ok` 是 `true` ｜ 沒有停點（安裝清單問一次：`❓ 請回：「可以開始」或要拿掉的步驟編號`）

**步驟**（這支 Skill 不抄 setup 手冊，只指路＋補完成判準；手冊是 `setup/README.md`）

| # | 做什麼 | 指令 | 完成判準 |
|---|---|---|---|
| 0 | 讀 `setup/README.md` 全文 | — | 知道 M／W／S 步驟代號 |
| 1 | 檢測 | Mac：`bash setup/check.sh`；Windows：`setup/README.md:58` 的原文 | 最後一行 `JSON:` 解析成功 |
| 2 | 列清單、問一次（AGENTS.md 規則 3） | — | 回覆最後一行是 ❓ 那一行 |
| 3 | 系統工具 | 照 `mac.md`／`windows.md`，只做 `todo` 對到的步驟 | 再跑一次步驟 1，`todo` 少了 |
| 4 | 共用步驟 S1–S8（S3 `npm install`、S4 `node setup/install-skills.mjs` 是新的） | 照 `setup/README.md` 步驟 3 | S4 印 `✔ 完成：9 支 × 2 個位置`；S8 `all_ok` 是 `true` |
| 5 | 能力探測（只讀） | `node shared/template/tools/caps.mjs`〔暫定·002〕 | 能力表貼進總表下面 |

- 進度回報格式照 `setup/README.md`「進度回報格式」原文（不另訂）。

**自我核對**：[ ] 清單只問一次 ／ [ ] 沒有提權執行、沒幫使用者輸入密碼（`setup/README.md` 原則 5） ／ [ ] 只裝「要裝的東西」表裡的 ／ [ ] 每一步都照「驗證」確認 ／ [ ] `npm install` 在工作區根目錄跑 ／ [ ] install-skills 結束碼 0 ／ [ ] 最後 `all_ok` 是 `true`，或總表標題是【環境準備未完成】

**退路表**（照 `setup/troubleshooting.md`，加這幾列）

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `npm ERR! code EACCES` | 不要改用系統管理員權限；確認在工作區根目錄、不是系統資料夾 | 停下來回報（`setup/README.md` 原則 8） |
| `npm ERR! network`／`ETIMEDOUT` | 等 1 分鐘重跑一次 | 停下來回報 |
| `✖ 衝突 … 不是 install-skills 裝的` | 把那個路徑貼給使用者，問要不要改名；不要自己刪 | — |
| 檢測項目 `restart` | 請使用者重開 MiniMax Code（Mac `M8`、Windows `W9`），或加 PATH 前綴繼續（AGENTS.md:144） | — |
| `Cannot find module …caps.mjs` | 照 `USAGE-reference.md` R9.3 探測表逐項跑 | 能力表那格寫「沒有探測」 |

**回報骨架**：照 `setup/README.md` 的總表格式（必要項目一項一列），下面接能力表。

---

## 4. `auto-edit-rough`（剪乾淨）

- **description**：把 projects/<專案> 的口播剪成初剪：接主軌、逐字稿、找 NG 列剪輯清單、auto-editor 去停頓、字幕校正與對齊開口、剪接點。當使用者說「剪乾淨」「剪成初剪」「找 NG」時使用。已經有 work/rough.mp4、要做資訊卡或成片時不要用（改用 auto-edit-storyboard）；只改字幕文字或時間時也不要用（改用剪輯台）。（02 §5.4 範例原文）

**一覽**

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| `素材/真人錄影/` 或 `素材/聲音/` | 步驟 1–5 | `work/cuts.md`（＋`work/main.mp4`） | NG 表有四欄 | ① 剪輯清單 |
| ① 通過 | 步驟 6–8 | `work/rough.mp4`、`work/rough.srt`、`work/cutpoints.json` | 見各步 | — |

**開始前**：`work/rough.mp4` 已經存在 → 問使用者要不要重剪（會蓋掉），不要直接重跑。

**步驟**

| # | 做什麼 | 指令 | 完成判準 | 常見錯誤 → 修法 |
|---|---|---|---|---|
| 1 | 決定主軌（決策表：真人錄影 1 支、聲音 0 個 → 直接用；其他 → 列順序併進 ①） | ① 通過後：`node shared/template/tools/media.mjs main --project projects/<專案> --order "檔名1,檔名2"` | `work/main.mp4`、`work/main.json` 存在 | 順序沒問 → 一定要併進 ① |
| 2 | 轉逐字稿 | `npx hyperframes transcribe "projects/<專案>/素材/真人錄影/<檔名>" -d projects/<專案>/work --model small --language zh --json`（有接主軌改 `work/main.mp4`） | `work/` 有逐字稿 JSON，句子是中文 | 變英文 → 少了 `--model small --language zh`；`SIGABRT` → 最前面加 `GGML_METAL_BF16_DISABLE=1`；檔案跑進 `素材/` → 少了 `-d` |
| 3 | 找 NG（拿不準讀 `references/ng-rules.md`） | — | 每一段 NG 有時間碼、內容、原因；對不上講稿的放「待確認」 | 一直在驗證音軌 → 停，照 AGENTS.md 剪乾淨「不要做的事」 |
| 4 | 章節空檔（講稿有 `##`／`###` 時，G01） | 列出每章第一句（不用指令；`--add-in` 由步驟 6 的 ng-snap 算，002 FR-003） | cuts.md 有章節空檔表，表頭含「章節」「第一句」「時間碼」 | ng-snap 印 ⚠「原始停頓只有 Ns」→ 那一章標「空檔不足」併進下一次回報，交使用者決定 |
| 5 | 寫 `work/cuts.md`（表格範本在 `references/ng-rules.md`） | — | 檔案存在、表頭四欄 | → 停點 ① |
| 6 | NG 邊界對齊＋預演＋輸出 | `node shared/template/tools/media.mjs ng-snap --project projects/<專案>`〔暫定·002〕印調整表與三行 auto-editor 指令（`--preview`、輸出 `work/rough.mp4`、`--export v1 -o work/cuts.v1.json`，三行的 `--edit`、`--margin 0.15sec`、`--cut-out`、`--add-in` 相同；002 FR-002、FR-063）；照抄第 1 行預演，確認後照抄第 2 行（工具還沒有時自己組：`auto-editor "<主軌>" --edit "audio:-20dB" --margin 0.15sec --cut-out "<起>sec,<迄>sec" --preview`，再把 `--preview` 換成 `-o projects/<專案>/work/rough.mp4 --no-open`） | `ffprobe -v error -show_entries format=duration -of csv=p=0 projects/<專案>/work/rough.mp4` 的長度＝auto-editor 統計的輸出長度 | 尾音被切 → `-26dB`、再不行 `-30dB`；自言自語沒剪 → `-16dB`（AGENTS.md 剪乾淨的數字）；改門檻要再 `--preview` |
| 7 | rough.srt：重轉逐字稿 → 照講稿校正（AGENTS.md 規則 4）→ 拆超過 18 字的句子 → 對齊開口 | 拆句：`node shared/template/tools/media.mjs srt-split --project projects/<專案> --dry-run`〔暫定·002〕；對齊：`node shared/template/tools/media.mjs snap-srt --project projects/<專案> --dry-run`，再去掉 `--dry-run` 跑**一次** | `work/rough.srt`、`work/rough.srt.bak-<時間戳>` 存在；調整表有異常（AGENTS.md 剪乾淨的數字：起點調整 ≥ 1.2 秒、超過一半被調整、被收到 0.6 秒下限）就列進回報 | 跑了兩次 snap-srt → 用第一次的 `.bak` 還原再跑一次 |
| 8 | 剪接點 | 照抄 ng-snap 印的第 3 行（`--export v1 -o work/cuts.v1.json`）；`node shared/template/tools/media.mjs cutpoints --project projects/<專案>`〔暫定·002〕 | `work/cutpoints.json` 是合法 JSON，`kind` 只有 `ng`／`pause` | 工具還沒有 → 退路表「Cannot find module」列（公式＋例題） |

- 步驟 7 的「重轉逐字稿 → rough.srt」現行 AGENTS.md:66 沒有寫指令；HyperFrames 0.8.221 的 `transcribe --help` 有 `--to srt -o <路徑>` 與 `--preserve-cues`（CJK 用）。第二輪實測中文斷句後再決定寫不寫進 Skill（spec.md「需要主代理裁決」補充）。

**停點**：`⏸ 停點 ① 剪輯清單｜請看：work/cuts.md｜請回：「可以」或要改的列`（可回的話照 stop-points.md §3）。

**自我核對**（02 §7.3）：[ ] cuts.md 每列都有原因，拿不準的在「待確認」 ／ [ ] 多支主軌的順序在 ① 問過 ／ [ ] rough.mp4 長度＝auto-editor 統計 ／ [ ] rough.srt 每則 ≤ 18 字、繁體、中英之間半形空格 ／ [ ] snap-srt 只跑一次、有 `.bak` ／ [ ] cutpoints.json 合法、`kind` 只有 ng／pause ／ [ ] 沒做波形比對、VAD、重新轉錄驗證（AGENTS.md:72-74）

**退路表**

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `auto-editor: error: unrecognized arguments`、`Error! Unknown option: --cut` | 跑 `auto-editor --help`，照實際參數名改（`--cut-out`） | 停下來回報 |
| `Could not open input file` | 多個範圍用空格隔開了 → 每段各寫一次 `--cut-out "17sec,25sec"` | 停 |
| `whisper-cli crashed (SIGABRT)` | 最前面加 `GGML_METAL_BF16_DISABLE=1` | 停 |
| `Cannot find module`（ng-snap／srt-split／cutpoints 還沒有） | ng-snap：起訖照逐字稿、各外推到前後最近的句間空白；srt-split：斷在標點、時間依字數比例分（例：4.0 秒、20 字的句子斷在第 12 字 → 前段 2.4 秒、後段 1.6 秒）；cutpoints：`chunks` 保留段長度（幀數÷fps）依序累加（例：30 fps、保留 `[0,300]`、`[420,900]` → 剪接點在 10.0 秒） | 停 |
| 工具呼叫 10 次還沒寫出 cuts.md | 停下來回報進度與卡住的點（AGENTS.md:76） | — |

**回報骨架**（剪完，不在停點上）：原始長度｜初剪長度｜剪掉幾段（auto-editor 統計原文）｜snap-srt 起點幾則、結尾幾則、最大調整量（＋異常則列出）｜剪接點數（ng N、pause M）｜驗證 ffprobe 一行｜`→ 下一個停點：② 構圖倍率（說「剪好看」開始）`

**references/ng-rules.md**：NG 判斷（同一句講兩次以上只留最後一次完整的；卡住重講的那次也算；whisper 在靜音處補的句子照講稿判斷）每條附一個正例一個反例；`work/cuts.md` 表格範本（NG 表表頭 `| 時間碼 | 內容 | 原因 | 待確認 |`、主軌順序表、章節空檔表表頭含「章節｜第一句｜時間碼」；時間碼是原片秒數 `起–迄`，002 FR-001 的四種寫法擇一；「待確認」欄留空或寫 `—` 才會被剪）。**步驟 3 拿不準時、步驟 5 寫表時才讀。**

---

## 5. `auto-edit-storyboard`（剪好看前半）

- **description**：剪好看的前半：構圖倍率預覽、量講者框、配螢幕錄影、挑情境、寫草稿 plan.json 與分鏡表 work/storyboard.md（附每段截圖與金句候選）。當使用者說「剪好看」「做成片」「包裝成成片」「列分鏡表」時使用。還沒有 work/rough.mp4 時不要用（改用 auto-edit-rough）；分鏡表已經確認、要做動畫或看 Studio 時不要用（改用 auto-edit-motion、auto-edit-review）。

**一覽**

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| `work/rough.mp4`、`work/rough.srt` | `qc.mjs framing --cards` | 兩張構圖預覽圖 | 兩張圖存在、倍率表已貼 | ② 構圖倍率 |
| ② 通過 | `qc.mjs speaker`、`build.mjs --list`、`--check`、build、`qc.mjs storyboard`〔暫定·004〕 | 草稿 plan.json、`work/storyboard.md`、`work/storyboard-preview/` | `--check` 0 ✖；每段至少一張截圖 | ③ 分鏡表 |

**開始前**：`work/rough.srt` 不存在 → 改用 `auto-edit-rough`；plan.json 已有 `frame` 而且停點紀錄 ② 是通過 → 跳過步驟 1。要寫檔的步驟不要在 Plan 模式做（U §2.1 新寫法；不用開 Plan 模式）。

**步驟**

| # | 做什麼 | 指令 | 完成判準 | 常見錯誤 → 修法 |
|---|---|---|---|---|
| 1 | 構圖預覽 | `node shared/template/tools/qc.mjs framing --project projects/<專案> --cards`（約 15 秒 × 倍率數） | `work/構圖預覽.jpg`、`work/構圖預覽-套卡.jpg` 存在；倍率表原文＋「建議」欄（004 加）貼進回覆 | 沒有建議欄 → 照 AGENTS.md 剪好看的數字：會切到手勢或來源像素放大 > 3.5 倍的不建議；640×360 這類來源 ≤ 1.15（style.md:9） |
| 2 | 寫 `frame`、量講者框 | 場地照：專案裡檔名含「場地照」的圖，沒有就 `ffmpeg -v error -ss 5 -i projects/<專案>/work/rough.mp4 -frames:v 1 projects/<專案>/work/場地照.jpg`；`node shared/template/tools/qc.mjs speaker --project projects/<專案>` | plan.json 有 `speakerBox`，`--check` 不再印 `沒寫 speakerBox`（`plan.mjs:161`） | 量的是原尺寸截圖的像素 → `--check` 會印換算後的框，照它改（U §2.2 第 2 點） |
| 3 | 字幕長度 | `node shared/template/tools/media.mjs srt-split --project projects/<專案> --dry-run`〔暫定·002〕；沒有時用暫時 plan.json 跑 `--check` 看 `超過 18 字`（U §2.4） | `--check` 不再印 `超過 18 字` | 拆完句號會位移 → 一定在寫正式 plan.json 之前拆 |
| 4 | 素材決策表 | — | — | 見下表 |
| 5 | 挑情境 | `node shared/template/tools/build.mjs --list`；每一組句子查 `shared/template/SITUATIONS.md` §3；情境動畫判準照 style.md「情境動畫優先」；金句先放候選表（≤ 6 則，style.md） | 每段都有版面（四個名稱之一）、情境 key、理由 | 版面名稱寫成 overlay／panel → 只用疊加／半畫面／子母畫面／全幕（SITUATIONS.md §2） |
| 6 | 草稿 plan.json → 檢查 → build → 截圖 → 寫分鏡表 | `node shared/template/tools/build.mjs --project projects/<專案> --check`（✖ 全部修掉）；`node shared/template/tools/build.mjs --project projects/<專案>`；`node shared/template/tools/qc.mjs storyboard --project projects/<專案>`〔暫定·004〕；照 `references/storyboard-template.md` 寫 `work/storyboard.md`（格式照 U §2.3） | storyboard.md 有 speakerBox、圖示表、總覽表、每段一節＋截圖＋截圖觀察、需要我決定的事（含金句候選表） | `qc.mjs storyboard` 還沒有 → 退路表第 3 列 |
| 7 | ③ 通過之後 | 重新讀 `work/storyboard.md`，以檔案為準重寫正式 plan.json；超過字數上限或違反規則的先列給使用者，不自己改（AGENTS.md:105）；金句只留勾了的 | `--check` 0 ✖ | 有 custom 段 → 交 `auto-edit-motion`；沒有 → 交 `auto-edit-review` |

**素材決策表**（步驟 4；條件只看檔案與 `--check` 的字）

| 條件 | 做什麼 |
|---|---|
| `素材/螢幕錄影/` 或 `素材/圖片/` 有檔案 | 照 `auto-edit-screen` 做，結果寫進分鏡表的 media 列 |
| `--check` 印 `只有聲音的區間` | 同上；那個區間一定要被 media 段或不透明全幕蓋住（AGENTS.md 剪好看硬規則） |
| 都沒有 | 跳過 |

**停點**：`⏸ 停點 ② 構圖倍率｜請看：work/構圖預覽.jpg、work/構圖預覽-套卡.jpg｜請回：倍率（1.0／1.15／1.3）`；`⏸ 停點 ③ 分鏡表｜請看：work/storyboard.md｜請回：「可以」或要改的地方`。

**自我核對**：[ ] ② 之前沒寫分鏡 ／ [ ] `frame` 寫對（1.0 不寫） ／ [ ] speakerBox 是裁切後的座標 ／ [ ] 只有聲音的區間都蓋住了 ／ [ ] 版面欄只用四個名稱 ／ [ ] 主句 8–14 字（style.md；build 不檢查，自己數：全形 1、半形 0.5） ／ [ ] 金句只在候選表、沒有直接進正式 plan ／ [ ] 每段截圖檔名＝plan.json 的 id

**退路表**

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `✖ …「…」N 字，上限 M` | 縮文案，不改字級（U §4.2） | 換情境 |
| `找不到圖示「…」（…相近：a、b、c）` | 用括號裡的名稱 | 不配圖示，分鏡表註明 |
| `qc.mjs storyboard` 不認得（004 還沒做） | 每段 `(cd projects/<專案>/work/hyperframes && npx hyperframes snapshot --at <段尾−0.6> --no-end -o ../storyboard-preview)`，段尾取 `--check` 報告「起–迄」的迄（例：`1:13.26–1:18.40` → `--at 77.8`；0.6 秒＝audit 的「完成態」定義，`audit.mjs --help`），再把檔名改成段 id | 停 |
| `anchor「…」不在 #N「…」裡 → 最可能是 #M` | 改成 #M | 停 |
| 工具呼叫超過預算 | 停下來回報卡在哪 | — |

**回報骨架**：②：倍率表原文（≤ 4 行）＋建議一句＋兩張圖路徑。③：段數、各版面段數、情境動畫幾段、金句候選幾則、`--check` 結果一行、需要決定的事 1–3 條。

**references/storyboard-template.md**：可以直接複製的 storyboard.md 骨架（開頭四種版面對照表、speakerBox 行、圖示表、總覽表、每段一節的欄位、「截圖觀察」、「需要我決定的事」＋金句候選表 `| 候選 | 句號 | 原句 | 卡上文字（≤ 14 字） | 情緒（正／負／中） | 要不要 ☐ |`）。格式規則以 U §2.3 為準。**步驟 6 寫分鏡表時才讀。**

---

## 6. `auto-edit-screen`（螢幕錄影與圖片）

- **description**：把專案的螢幕錄影與圖片配到口播：掃素材做 contact sheet、對字幕找每段該配哪支錄影的第幾秒、讀座標加運鏡／紅框／放大鏡，寫成分鏡表的 media 列。當使用者說「配螢幕錄影」「旁白配畫面」，或 auto-edit-storyboard 的素材決策表要你做時使用；也當 explore 子代理的派工說明（選用）。要改已經 build 好的 media 段位置時不要用（改用 auto-edit-review）。

**一覽**：`素材/螢幕錄影/`、`素材/圖片/` 或只有聲音的區間 ｜ `media.mjs scan`、`media.mjs frame --grid` ｜ 分鏡表 media 列草稿 ｜ `--check` 印 `只有聲音（…）：已被 media 段或全畫面蓋住`、media 相關 0 ✖ ｜ 併進 ③

**步驟**

| # | 做什麼 | 指令 | 完成判準 | 常見錯誤 → 修法 |
|---|---|---|---|---|
| 1 | 掃素材 | `node shared/template/tools/media.mjs scan --project projects/<專案>` | `work/media/index.md` 存在 | — |
| 2 | 對字幕配起點 | 讀 `work/media/index.md` 與 `work/media/<檔名>/sheet-NN.jpg`，每段口播找「正在做同一個操作」的格 | 每列寫素材檔名、`in` 秒數（註明 sheet 第幾格）、理由（U §2.3） | 對不上 → 調起點、變速（≤ 4 倍，style.md 螢幕錄影）或拆段 |
| 3 | 讀座標 | `node shared/template/tools/media.mjs frame --project projects/<專案> --src "素材/螢幕錄影/<檔名>" --at <秒> --grid` | 每個 box／moves／lens 有素材原尺寸座標 | 用了 1920×1080 的畫面座標 → `--check` 會 ✖ 超出素材範圍，重讀（U §4.2） |
| 4 | 標註 | 運鏡、紅框、放大鏡照 U §5.5；新欄位 `callouts`／`spot`／`steps`／`arrows`〔暫定·004〕 | 紅框同時 ≤ 2 個、停不到 0.5 秒的不畫、放大鏡 ≥ 1.2 秒（style.md 螢幕錄影） | `marks：… 同時有 N 個紅框` → 合成一個大框 |
| 5 | 寫回分鏡表草稿 | 主代理寫 storyboard.md；當子代理時只回報 | `--check` 只有聲音那行寫「已被 media 段或全畫面蓋住」 | — |

**自我核對**：[ ] 每段 media 都對到口播同一個操作 ／ [ ] 座標是素材原尺寸 ／ [ ] 只有聲音的區間全部蓋住 ／ [ ] 錄影段沒放下方資訊卡（style.md） ／ [ ] 從講者切到錄影的第一段音效 `whoosh`（style.md 音效）

**退路表**

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `src：找不到 素材/螢幕錄影/… → 檔名要和專案的 素材/ 資料夾裡一模一樣（現有：…）` | 照括號裡的檔名改 | 停 |
| `素材 … 長 Ns；從第 Ns 起播 Ns 要用到第 Ns` | `in` 往前、`to` 提早或 `speed` 改小，或拆兩段 | 停 |
| `… 超出素材範圍 W×H` | 重跑步驟 3 讀座標 | 停 |
| `只有聲音的區間 …–… 有 Ns 沒有畫面` | 加一段 media 蓋住，或用不透明全幕（04 家族） | 停，回報缺素材 |

**回報骨架**（當子代理時 ≤ 25 行）：每段一列 `段落句號｜素材檔名｜in 秒數（sheet 格）｜speed｜運鏡／紅框／放大鏡座標｜理由`；最後一列「只有聲音的區間：全部蓋住／還差 …」。

---

## 7. `auto-edit-motion`（一段情境動畫）

- **description**：做一段第二層情境動畫 work/hyperframes/compositions/x-<名稱>.html：從 shared/template/custom/ 的範例改、綁字幕句號、自查後照固定格式回報。當主代理派工「做 x-<名稱> 情境動畫」，或分鏡表確認後只有一段情境動畫要自己做時使用。要改第一層情境模板、plan.json、rough.srt 時不要用（那是主代理的事）。

**一覽**：③ 通過、plan.json 已登記這段（`"type": "custom"`、`src`、`layout`）、主代理已 build 過一次 ｜ 只改自己那支檔；`build.mjs --check`、`audit.mjs --only <id>` ｜ `compositions/x-<名稱>.html` ｜ `--check` 0 ✖、`audit --only` 0 ✖ ｜ 沒有（交回主代理）

**開始前**：只能寫自己那支 `x-<名稱>.html`（AGENTS.md 子代理分工 1）；派工訊息和本 Skill 衝突時照派工訊息。

**步驟**

| # | 做什麼 | 指令 | 完成判準 | 常見錯誤 → 修法 |
|---|---|---|---|---|
| 1 | 挑範例、複製 | 查 SITUATIONS.md §3 那一列的範例；Mac：`cp shared/template/custom/<範例>.html projects/<專案>/work/hyperframes/compositions/x-<名稱>.html`；Windows：`Copy-Item shared\template\custom\<範例>.html projects\<專案>\work\hyperframes\compositions\x-<名稱>.html`（主代理已放好就跳過） | 檔案存在 | 名稱只能英數與 `-`（R7.2） |
| 2 | 改名四處＋前綴 | 檔名、`data-composition-id`、`<template id>`、`window.__timelines[...]`，id／class 前綴一起換（R7.2 第 1 點） | `grep -c "x-<名稱>"` ≥ 4 | 漏改一處 → `--check` 報骨架錯 |
| 3 | 改文字、圖示、時間軸 | 照範例檔頭「要改的地方」；時間用 `P.at('#N')`〔暫定·003〕綁句；還沒有時：段內秒數＝句子起點 − 段起點（例：段起點 20.0 秒、`#21` 起點 21.2 秒 → 1.2） | 畫面文字 ≤ 10 字的關鍵詞（R7.3 版面原則） | 用 `onUpdate`／`onComplete` → 改用 SceneMotion 方法（R7.3） |
| 4 | 長度 D | build 自動填〔暫定·002〕；還沒有時把 `--check` 報告這段的「長度」填回 `data-duration` 與 `const D`（R7.2 第 4 點） | audit 不再印 `段長不符` | — |
| 5 | 自查 | `node shared/template/tools/build.mjs --project projects/<專案> --check`；`node shared/template/tools/audit.mjs --project projects/<專案> --only <id>` | 兩個都 0 ✖ | audit ✖ → 照 `→` 改再跑（只改 custom 檔不用重 build） |
| 6 | 回報 | `ls -l projects/<專案>/work/hyperframes/compositions/x-<名稱>.html` | 照 `references/worker-report.md` | — |

**自我核對**：[ ] 只改了自己那支檔 ／ [ ] 顏色只用 token ／ [ ] 動畫只用 SceneMotion 方法 ／ [ ] 結尾有 `P.end(D)` ／ [ ] 最後一幕 ≥ 1.5 秒（style.md 完成態停留） ／ [ ] 不壓 speakerBox、不進字幕區（R8 #2、#17） ／ [ ] `--check`、audit 0 ✖

**退路表**：audit 的 ✖ 原文（`文字撐破容器`、`內容被裁掉`、`超出畫面`、`進字幕區`、`壓到子母畫面`、`script 出錯`、`對不上`；`audit.mjs --help`）各一列 → 修法；003 的新規則第二輪補；改兩次還 ✖ → 停下來把那幾行原文交回主代理。

**回報**：照 `references/worker-report.md`（≤ 25 行，`OV/WB:L109-126`）：檔案路徑＋`ls -l` 一行、長度 D、綁到的句號、`--check` 與 audit 結果原文、還留著的 ⚠ 與理由、`我沒有改的東西：plan.json、rough.srt、shared/`。**步驟 6 才讀。**

---

## 8. `auto-edit-review`（定稿、自查、Studio、回饋輪、剪輯台）

- **description**：分鏡表確認後的定稿與審查：build、audit、snapshot 抽查、觀影 pass、開 Studio 給使用者看；使用者在 Studio 看完給修改時開回饋輪 rN（先備份 plan.json、記原話與分類）；使用者說「打開剪輯台」「調好了」時開關剪輯台。當使用者說「s05 的金句卡往左移」「這張卡…」「打開剪輯台」「調好了」或分鏡表剛確認完時使用。還沒有確認分鏡表時不要用（改用 auto-edit-storyboard）；要輸出成片時不要用（改用 auto-edit-deliver）。

**一覽**

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| ③ 通過、情境動畫做完 | 流程 A | 截圖、PASS／FAIL 表 | build 0 ✖、audit 0 ✖、每段 PASS | ④ Studio 預覽 |
| ④ 的修改 | 流程 B | `work/回饋/r<N>.md`、`plan.json.bak-r<N>` | rN.md 四節齊全 | ④ |
| 「打開剪輯台」 | 流程 C | 剪輯台網址 | `editor.mjs --status` 有網址 | ⑤ 剪輯台 |

**流程 A（定稿自查）**

| # | 指令 | 完成判準 |
|---|---|---|
| A1 | `node shared/template/tools/build.mjs --project projects/<專案> --check`；`node shared/template/tools/build.mjs --project projects/<專案>` | 0 ✖；build 印的「人聲響度…」「剪接點微淡化…」兩行抄下來 |
| A2 | 有 custom 段：`node shared/template/tools/audit.mjs --project projects/<專案>` | 0 ✖；⚠ 照 → 改或寫理由 |
| A3 | `(cd projects/<專案>/work/hyperframes && npx hyperframes snapshot --review)` | 照 REVIEW.md §2 每段一列 PASS／FAIL；段數 ≥ 8 時可以派 verifier（選用，`references/reviewer-brief.md`；AGENTS.md 子代理分工），沒有子代理就自己看 |
| A4 | `node shared/template/tools/qc.mjs observe --project projects/<專案>`〔暫定·004〕 | 靜止區間、接縫條帶看過，照 REVIEW.md 門檻 |
| A5 | `(cd projects/<專案>/work/hyperframes && npx hyperframes preview --no-open)` | 印出網址 → 停點 ④（附：要確認的卡、請看字幕對嘴，U §2.6 第 2 點） |

**流程 B（回饋輪，`references/feedback-round.md`）**：B1 編號 N＝`work/回饋/` 裡 `r*.md` 的數量＋1（或 `status.mjs` 印的 `下一輪回饋編號`〔暫定·002〕）→ B2 重新讀 plan.json（剪輯台可能改過）→ B3 備份：Mac `cp projects/<專案>/work/hyperframes/plan.json projects/<專案>/work/hyperframes/plan.json.bak-r<N>`／Windows `Copy-Item projects\<專案>\work\hyperframes\plan.json projects\<專案>\work\hyperframes\plan.json.bak-r<N>` → B4 寫 rN.md「原話」「分類」（每項：規則或個案、改哪一段、改法）→ B5 改 plan.json（段落編號直接找 id；「這張卡」才讀 Studio 選取，U §2.6 第 3 點）→ B6 A1–A3 只看改到的段 → B7 rN.md「驗證」→ 停點 ④。

**流程 C（剪輯台，EDITOR.md 第一部分）**：C1 `node shared/template/tools/editor.mjs --project projects/<專案>`（自己轉背景）→ 停點 ⑤ → 「調好了」：C2 重新讀 plan.json 與 rough.srt → C3 流程 A。

**停點**：`⏸ 停點 ④ Studio 預覽｜請看：<Studio 網址>｜請回：要改的段落（例：s05 往左移）或「可以了，輸出成片」`；`⏸ 停點 ⑤ 剪輯台｜請看：<剪輯台網址>｜請回：調完按「儲存」後說「調好了」`。

**自我核對**：[ ] build 0 ✖ ／ [ ] audit 0 ✖（有 custom） ／ [ ] snapshot 每段有 PASS／FAIL ／ [ ] 改 plan.json 前有 bak ／ [ ] rN.md 四節齊全 ／ [ ] 沒蓋掉剪輯台存的設定（AGENTS.md:130） ／ [ ] 「規則」類的修改只記在 rN.md，沒改 `shared/`

**退路表**

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `⚠ 這些檔被手改過，沒有覆寫：… → 把改動搬進 plan.json 後加 --force` | 看改了什麼，搬進 plan.json，再加 `--force`（U §2.6 第 7 點） | 停 |
| `"code": "no-selection"` | 請使用者暫停在那張卡、點卡上的字再說一次（U §2.6） | 問秒數 |
| Studio 網址打不開 | `(cd projects/<專案>/work/hyperframes && npx hyperframes preview --status)` | 停 |
| 剪輯台存檔時說被改過 | 請使用者重新載入再調（EDITOR.md §8） | 停 |
| 回饋某一項工具呼叫超過 6 次 | 停下來回報那一項卡在哪 | — |

**回報骨架**：④：build 兩行原文＋音效比例提醒、audit 結果、PASS／FAIL 摘要（FAIL 已修幾個）、要確認的卡、Studio 網址。回饋輪：rN、改了哪幾段、驗證一行。

**references**：`feedback-round.md`（rN.md 範本四節；「規則 vs 個案」判斷表 `OV/RL:L15-20`；改前備份與編號規則；每項 ≤ 6 次）**流程 B 才讀**；`reviewer-brief.md`（verifier 子代理的派工說明，選用：看哪段、門檻照 REVIEW.md、回報格式照 REVIEW.md §4、≤ 25 行、不寫檔）**A3 要派 verifier 才讀**。

---

## 9. `auto-edit-deliver`（輸出成片）

- **description**：輸出成片並驗收：先輸出 3–5 秒測試片段確認有聲音與版面，再背景 render 整支 成片/final.mp4，跑 qc.mjs final，照驗收清單回報。當使用者在 Studio 預覽之後說「可以了，輸出成片」「輸出」時使用。還有要改的地方、還沒看過 Studio 時不要用（改用 auto-edit-review）。

**一覽**：④ 通過 ｜ `build.mjs --test`、`npx hyperframes render`、`qc.mjs final` ｜ `成片/測試片段/test-clip.mp4`、`成片/final.mp4`、`成片/驗收截圖/qc-sheet.jpg` ｜ `qc.mjs final` 0 ✖、⚠ 逐項說明 ｜ 沒有

**步驟**

| # | 做什麼 | 指令 | 完成判準 | 常見錯誤 → 修法 |
|---|---|---|---|---|
| 1 | 挑測試位置（第一張資訊卡；有錄影再挑一段有紅框的；U §2.7） | `--check` 報告「起–迄」那段的起點 | 起點秒數 | 有 `edit.cuts` 時用成片秒數 |
| 2 | 測試片段（3–5 秒，AGENTS.md:107） | `node shared/template/tools/build.mjs --project projects/<專案> --test <起點>,4`；`(cd projects/<專案>/work/hyperframes && npx hyperframes render -c compositions/test-clip.html --quality draft -o ../../成片/測試片段/test-clip.mp4)` | `ffprobe -v error -show_entries stream=codec_type -of csv=p=0 projects/<專案>/成片/測試片段/test-clip.mp4` 有 `audio`；截一格看版面 | `⚠ s04 在 49.5s 就開始了` → 起點改成那個秒數 |
| 3 | 整支 render（背景） | Mac：`(cd projects/<專案>/work/hyperframes && nohup npx hyperframes render --fps 30 --quality looks --output ../../成片/final.mp4 > ../render.log 2>&1 &)`；Windows：U §2.7 的 `Start-Process` 原文 | log 出現 `Render complete` | log 停在同一行很久 → 回報使用者 |
| 4 | 驗收 | `node shared/template/tools/qc.mjs final --project projects/<專案>` | 0 ✖；每個 ⚠ 寫「刻意／要修」 | ✖ 長度不符 → 先確認 build 和 render 是同一版 plan |

**自我核對**：[ ] 先測試片段再整支 ／ [ ] 測試片段有音軌 ／ [ ] 交付用 `--quality looks` ／ [ ] qc final 0 ✖ ／ [ ] ⚠ 逐項說明 ／ [ ] 附 qc-sheet.jpg ／ [ ] 貼了 build 的「人聲響度」「剪接點微淡化」兩行（AGENTS.md 剪好看硬規則）

**退路表**：`Render complete` 之前 log 出現 `Error`／記憶體不足 → 重跑一次（≤ 8GB 會自動單 worker，R13）；qc ✖ 的原文各一列（`qc.mjs --help`）；render log 看了 20 次還沒完成 → 回報進度（AGENTS.md 階段預算）。

**回報骨架**：final.mp4 長度與 ffprobe 一行｜qc final 輸出原文（✔／⚠／✖ 行）｜每個 ⚠ 的說明｜build 兩行｜qc-sheet.jpg 路徑｜`→ 完成`。

---

## 10. `auto-edit-style`（換風格）

- **description**：換工作區的主色與背景圖：brand.mjs 換主色；背景圖有使用者的圖就縮放裁切，沒有就先探測生圖能力（Codex／mmx／HTML 截圖）再生成，三張圖驗尺寸、出預覽，使用者同意才放進 shared/template/。當使用者說「換風格」「換成我的風格」「換主色」「換背景」「生成背景圖」時使用。只想移動某張卡的位置、改某集的版面時不要用（改用 auto-edit-review）。

**一覽**：色碼／色名／圖片 ｜ `brand.mjs`、`caps.mjs`〔暫定·002〕、生圖、ffmpeg ｜ `kit/brand.css`、`kit/pip-frame.png`、`bg-fs.jpg`、`bg-side.jpg`、`bg-ch.jpg` ｜ ffprobe 尺寸 1920×1080／960×1080／1920×1080 ｜ ⑥ 背景預覽

**步驟**

| # | 做什麼 | 指令 | 完成判準 | 常見錯誤 → 修法 |
|---|---|---|---|---|
| 1 | 主色 | `node shared/template/tools/brand.mjs "#RRGGBB"`（色名先轉色碼，回報用了哪個） | 印出的對比值與警告原文貼給使用者 | 紅色系警告 → 明講「觀眾會分不出哪個是警告」（R9.1） |
| 2 | 背景：選路 | 使用者有給圖 → 直接縮放裁切；沒有 → `node shared/template/tools/caps.mjs`〔暫定·002〕→ 照 R9.3 路由表 | 能力表貼給使用者；選了哪條路寫一句 | 沒裝的不裝、沒登入的不登入（AGENTS.md 規則 3、:154） |
| 3 | 生成到暫存資料夾、驗證、預覽 | 每條路的指令在 `references/image-routing.md`；HTML 路線用 `brand.mjs bg --html <檔> --kind fs\|side\|ch`〔暫定·004〕 | 三張尺寸對；`zones-fs.jpg`、`preview.jpg` 產生 | 尺寸不對 → ffmpeg `scale=…:force_original_aspect_ratio=increase,crop=…` |
| 4 | ⑥ 同意後複製進 `shared/template/` 並重跑 build | Mac `cp`／Windows `Copy-Item`；`node shared/template/tools/build.mjs --project projects/<專案>` | 回報改了哪些檔、走哪一條路 | — |

**停點**：`⏸ 停點 ⑥ 背景預覽｜請看：<暫存資料夾>/preview.jpg、<暫存資料夾>/zones-fs.jpg｜請回：「可以」或「重做」`（不能略過，stop-points.md §5）。

**自我核對**：[ ] 色碼回報了 ／ [ ] 能力表貼了 ／ [ ] 沒有幫使用者登入任何服務 ／ [ ] 三張圖先在暫存資料夾 ／ [ ] 尺寸 1920×1080／960×1080／1920×1080 ／ [ ] ⑥ 通過才寫 `shared/` ／ [ ] 只改了 AGENTS.md 規則 1 允許的 5 個檔

**退路表**：`codex` 沒登入／`mmx auth status` 未登入 → 下一條路；三條路都失敗 → 只換主色、保留程式底紋，告訴使用者原因（R9.2 最後一條）；同一條路重做 2 次還不行 → 換下一條路。

**references/image-routing.md**：Codex、mmx、HTML 三條路的指令（Mac／Windows 兩版）、留空區疊框預覽與三張並排的 ffmpeg 指令（02 §5.5「每條路的範例指令」「驗證」）。路由規則以 R9.3 為準，這裡只放指令。**步驟 3 才讀。**
